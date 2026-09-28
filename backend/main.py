import os
import re
import logging
from datetime import datetime, timezone
from typing import Optional
from fastapi import FastAPI, Depends, HTTPException, Query, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import func, text
from dotenv import load_dotenv

from database import get_db, create_tables
from models import Customer, Call, Transcript, CallSummary
from schemas import (
    StartCallRequest, StartCallResponse,
    MessageRequest, MessageResponse,
    EndCallRequest, CallDetailSchema, CallListItem, DashboardStats
)
from ai_agent import get_ai_response, get_opening_greeting, generate_call_summary
from speech import get_tts_audio, transcribe_audio_bytes
from calling import get_calling_service

logger = logging.getLogger(__name__)

MAX_AUDIO_UPLOAD_BYTES = 5 * 1024 * 1024

load_dotenv()

app = FastAPI(
    title="RO Calling Agent API",
    description="AI-Powered Commercial RO Sales & Lead Qualification Calling Agent",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

active_calls: dict = {}

END_REASON_TO_STATUS = {
    "completed": "completed",
    "customer_ended": "completed",
    "customer_silent": "no_answer",
    "no_answer": "no_answer",
    "stt_failure": "failed",
    "llm_failure": "error",
    "disconnected": "disconnected",
    "interrupted": "interrupted",
    "error": "error",
}


def is_valid_phone(phone: Optional[str]) -> bool:
    """Basic phone validation for optional customer phone (10-digit IN or E.164)."""
    if not phone or not phone.strip():
        return True
    cleaned = re.sub(r"[\s\-()]", "", phone.strip())
    if cleaned.startswith("+"):
        return bool(re.fullmatch(r"\+\d{10,15}", cleaned))
    if cleaned.startswith("91") and len(cleaned) == 12:
        return cleaned[2:].isdigit()
    return bool(re.fullmatch(r"\d{10}", cleaned))


@app.on_event("startup")
def startup():
    """Create database tables on startup."""
    create_tables()
    print("✅ Database tables created/verified")


@app.get("/health")
def health_check(db: Session = Depends(get_db)):
    db_ok = False
    try:
        db.execute(text("SELECT 1"))
        db_ok = True
    except Exception:
        db_ok = False

    api_key = os.getenv("GEMINI_API_KEY", "")
    gemini_configured = bool(api_key and api_key not in (
        "", "your_actual_gemini_api_key"))

    status = "ok" if db_ok else "degraded"
    return {
        "status": status,
        "message": "RO Calling Agent API is running",
        "database": "connected" if db_ok else "unavailable",
        "gemini_api_key": "configured" if gemini_configured else "missing_or_placeholder",
        "calling_mode": os.getenv("CALLING_MODE", "browser"),
    }


@app.post("/calls/start", response_model=StartCallResponse)
def start_call(request: StartCallRequest, db: Session = Depends(get_db)):
    """
    Start a new AI call session.
    Creates a customer record, a call record, gets the AI greeting,
    and saves it to the transcript.
    """
    if not is_valid_phone(request.customer_phone):
        raise HTTPException(
            status_code=400,
            detail="Invalid phone number. Use 10 digits (e.g. 9876543210) or E.164 (+919876543210).",
        )

    customer = Customer(
        name=request.customer_name,
        phone=request.customer_phone
    )
    db.add(customer)
    db.commit()
    db.refresh(customer)

    call = Call(
        customer_id=customer.id,
        status="active",
        lead_status="information_needed"
    )
    db.add(call)
    db.commit()
    db.refresh(call)

    calling_service = get_calling_service()
    calling_service.start_call(
        customer_phone=request.customer_phone,
        customer_name=request.customer_name
    )

    greeting_response = get_opening_greeting()
    ai_greeting = greeting_response.get(
        "response", "Hello! I'm calling about commercial RO systems.")

    extracted_info = greeting_response.get("extracted_information", {
        "name": request.customer_name,
        "requirement": None, "capacity": None,
        "location": None, "application": None,
        "budget": None, "timeline": None
    })

    if request.customer_name:
        extracted_info["name"] = request.customer_name

    active_calls[call.id] = {
        "history": [],
        "extracted_info": extracted_info,
        "customer_intent": "information_needed"
    }

    transcript_entry = Transcript(
        call_id=call.id,
        speaker="AI",
        message=ai_greeting,
        timestamp=datetime.now(timezone.utc)
    )
    db.add(transcript_entry)
    db.commit()

    return StartCallResponse(
        call_id=call.id,
        customer_id=customer.id,
        ai_greeting=ai_greeting
    )


@app.post("/calls/{call_id}/message", response_model=MessageResponse)
def process_message(call_id: int, request: MessageRequest, db: Session = Depends(get_db)):
    """
    Process a customer message and return the AI response.
    Saves both the customer message and AI response to the transcript.
    """
    call = db.query(Call).filter(Call.id == call_id).first()
    if not call:
        raise HTTPException(status_code=404, detail="Call not found")
    if call.status not in ["active", "connected"]:
        raise HTTPException(status_code=409, detail="Call is no longer active")

    user_message = (request.user_message or "").strip()
    if not user_message:
        raise HTTPException(
            status_code=400, detail="Customer message cannot be empty")

    if call_id not in active_calls:
        existing_transcripts = db.query(Transcript).filter(
            Transcript.call_id == call_id
        ).order_by(Transcript.timestamp).all()

        history = []
        for t in existing_transcripts:
            role = "model" if t.speaker == "AI" else "user"
            history.append({"role": role, "parts": [t.message]})

        active_calls[call_id] = {
            "history": history,
            "extracted_info": {
                "name": None, "requirement": None, "capacity": None,
                "location": None, "application": None, "budget": None, "timeline": None
            },
            "customer_intent": "information_needed"
        }

    call_state = active_calls[call_id]

    latest_transcript = (
        db.query(Transcript)
        .filter(Transcript.call_id == call_id)
        .order_by(Transcript.timestamp.desc())
        .first()
    )

    if (
        latest_transcript
        and latest_transcript.speaker == "Customer"
        and latest_transcript.message.strip() == user_message
    ):
        latest_ai = (
            db.query(Transcript)
            .filter(
                Transcript.call_id == call_id,
                Transcript.speaker == "AI",
                Transcript.timestamp > latest_transcript.timestamp,
            )
            .order_by(Transcript.timestamp.asc())
            .first()
        )

        if latest_ai:
            return MessageResponse(
                ai_response=latest_ai.message,
                customer_intent=call_state["customer_intent"],
                extracted_info=call_state["extracted_info"],
                call_ended=False,
            )

    customer_transcript = Transcript(
        call_id=call_id,
        speaker="Customer",
        message=user_message,
        timestamp=datetime.now(timezone.utc)
    )
    db.add(customer_transcript)
    db.commit()

    call_state["history"].append({
        "role": "user",
        "parts": [user_message]
    })

    ai_result = get_ai_response(
        conversation_history=call_state["history"],
        extracted_info=call_state["extracted_info"],
        customer_intent=call_state["customer_intent"]
    )

    ai_response_text = ai_result.get(
        "response", "Could you please repeat that?")
    call_state["customer_intent"] = ai_result.get(
        "customer_intent", call_state["customer_intent"])
    call_state["extracted_info"] = ai_result.get(
        "extracted_information", call_state["extracted_info"])
    call_should_end = ai_result.get("call_should_end", False)

    call_state["history"].append({
        "role": "model",
        "parts": [ai_response_text]
    })

    ai_transcript = Transcript(
        call_id=call_id,
        speaker="AI",
        message=ai_response_text,
        timestamp=datetime.now(timezone.utc)
    )
    db.add(ai_transcript)

    if call_state["extracted_info"].get("name") and call.customer:
        customer = db.query(Customer).filter(
            Customer.id == call.customer_id).first()
        if customer and not customer.name:
            customer.name = call_state["extracted_info"]["name"]

    call.lead_status = call_state["customer_intent"]
    db.commit()

    return MessageResponse(
        ai_response=ai_response_text,
        customer_intent=call_state["customer_intent"],
        extracted_info=call_state["extracted_info"],
        call_ended=call_should_end
    )


@app.post("/calls/{call_id}/end")
def end_call(call_id: int, request: EndCallRequest, db: Session = Depends(get_db)):
    """
    End the call, generate AI summary, and save everything to the database.
    """
    call = db.query(Call).filter(Call.id == call_id).first()
    if not call:
        raise HTTPException(status_code=404, detail="Call not found")

    now = datetime.now(timezone.utc)
    start_time = call.start_time
    if start_time.tzinfo is None:
        start_time = start_time.replace(tzinfo=timezone.utc)
    duration_seconds = (now - start_time).total_seconds()

    call.end_time = now
    call.duration = duration_seconds
    reason = request.reason or "completed"
    call.status = END_REASON_TO_STATUS.get(reason, reason)
    if call.status != "completed":
        call.failure_reason = reason

    call_state = active_calls.get(call_id, {})
    extracted_info = call_state.get("extracted_info", {})
    customer_intent = call_state.get("customer_intent", "information_needed")

    call.lead_status = customer_intent
    call.follow_up_required = customer_intent in [
        "interested", "follow_up_required", "maybe"]

    outcome_map = {
        "interested": "sale_prospect",
        "not_interested": "not_interested",
        "maybe": "callback_scheduled",
        "follow_up_required": "callback_scheduled",
        "information_needed": "information_sent"
    }
    call.outcome = outcome_map.get(customer_intent, "no_outcome")

    db.commit()

    transcripts = db.query(Transcript).filter(
        Transcript.call_id == call_id
    ).order_by(Transcript.timestamp).all()

    transcript_list = [{"speaker": t.speaker, "message": t.message}
                       for t in transcripts]

    customer = db.query(Customer).filter(
        Customer.id == call.customer_id).first()
    customer_name = customer.name if customer else "Customer"

    summary_data = generate_call_summary(
        transcript_list, extracted_info, customer_name or "")

    existing_summary = db.query(CallSummary).filter(
        CallSummary.call_id == call_id).first()
    if existing_summary:
        for key, value in summary_data.items():
            if hasattr(existing_summary, key):
                setattr(existing_summary, key, value)
    else:
        call_summary = CallSummary(
            call_id=call_id,
            summary=summary_data.get("summary"),
            requirement=summary_data.get("requirement"),
            capacity=summary_data.get("capacity"),
            location=summary_data.get("location"),
            application=summary_data.get("application"),
            budget=summary_data.get("budget"),
            timeline=summary_data.get("timeline"),
            customer_intent=summary_data.get("customer_intent"),
            important_points=summary_data.get("important_points"),
            follow_up_requirements=summary_data.get("follow_up_requirements"),
            outcome=summary_data.get("outcome")
        )
        db.add(call_summary)

    db.commit()

    active_calls.pop(call_id, None)

    return {
        "message": "Call ended successfully",
        "call_id": call_id,
        "duration": duration_seconds,
        "status": call.status,
        "summary_generated": True
    }


@app.get("/calls/{call_id}/audio")
def get_call_audio(call_id: int, text: str = Query(..., description="Text to convert to speech")):
    """
    Get TTS audio for AI response text.
    Returns base64 encoded MP3 audio.
    """
    audio_data = get_tts_audio(text)
    return audio_data


@app.post("/speech/transcribe")
async def transcribe_speech(audio: UploadFile = File(...)):
    """
    Accept a recorded audio clip (webm/opus, ogg, mp4, wav, ...) from the
    browser microphone and transcribe it to text using local Whisper
    (faster-whisper). Returns {"text": "...", "language": "en"}.

    An empty "text" is a valid, non-error result - it means Whisper heard
    no discernible speech (silence/noise only) in the clip.
    """
    audio_bytes = await audio.read()

    logger.info(
        "Audio upload received: filename=%s, content_type=%s, size=%d bytes",
        audio.filename or "unknown",
        audio.content_type or "unknown",
        len(audio_bytes),
    )

    if not audio_bytes:
        logger.warning("Audio upload rejected: no audio data")
        raise HTTPException(status_code=400, detail="No audio data received")

    if len(audio_bytes) > MAX_AUDIO_UPLOAD_BYTES:
        logger.warning(
            "Audio upload rejected: file exceeds %d bytes", MAX_AUDIO_UPLOAD_BYTES)
        raise HTTPException(status_code=413, detail="Audio clip is too large")

    try:
        result = transcribe_audio_bytes(audio_bytes, filename=audio.filename)
    except ImportError:
        logger.exception(
            "Whisper transcription unavailable: faster-whisper dependency missing")
        raise HTTPException(
            status_code=500,
            detail=(
                "Speech-to-text is not available: faster-whisper is not "
                "installed. Run: pip install -r requirements.txt"
            ),
        )
    except Exception as e:
        logger.exception("Transcription endpoint failed (%s)",
                         type(e).__name__)
        raise HTTPException(
            status_code=500,
            detail="Transcription failed. Check the backend log for the failed processing stage.",
        ) from e

    return result


@app.get("/calls")
def list_calls(
    db: Session = Depends(get_db),
    status: Optional[str] = None,
    lead_status: Optional[str] = None,
    follow_up: Optional[bool] = None,
    customer_name: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    outcome: Optional[str] = None,
    page: int = 1,
    page_size: int = 20
):
    """List all calls with optional filters."""
    query = db.query(Call).join(Customer, isouter=True)

    if status:
        query = query.filter(Call.status == status)
    if lead_status:
        query = query.filter(Call.lead_status == lead_status)
    if follow_up is not None:
        query = query.filter(Call.follow_up_required == follow_up)
    if outcome:
        query = query.filter(Call.outcome == outcome)
    if customer_name:
        query = query.filter(Customer.name.ilike(f"%{customer_name}%"))
    if date_from:
        query = query.filter(Call.start_time >= date_from)
    if date_to:
        query = query.filter(Call.start_time <= date_to)

    total = query.count()
    calls = query.order_by(Call.start_time.desc()).offset(
        (page - 1) * page_size).limit(page_size).all()

    result = []
    for call in calls:
        customer = db.query(Customer).filter(
            Customer.id == call.customer_id).first()
        result.append({
            "id": call.id,
            "customer_name": customer.name if customer else None,
            "customer_phone": customer.phone if customer else None,
            "start_time": call.start_time,
            "duration": call.duration,
            "status": call.status,
            "outcome": call.outcome,
            "lead_status": call.lead_status,
            "follow_up_required": call.follow_up_required
        })

    return {"calls": result, "total": total, "page": page, "page_size": page_size}


@app.get("/calls/{call_id}")
def get_call_detail(call_id: int, db: Session = Depends(get_db)):
    """Get complete call details including transcript and AI summary."""
    call = db.query(Call).filter(Call.id == call_id).first()
    if not call:
        raise HTTPException(status_code=404, detail="Call not found")

    customer = db.query(Customer).filter(
        Customer.id == call.customer_id).first()
    transcripts = db.query(Transcript).filter(
        Transcript.call_id == call_id
    ).order_by(Transcript.timestamp).all()
    summary = db.query(CallSummary).filter(
        CallSummary.call_id == call_id).first()

    return {
        "id": call.id,
        "customer": {
            "id": customer.id if customer else None,
            "name": customer.name if customer else None,
            "phone": customer.phone if customer else None,
        } if customer else None,
        "start_time": call.start_time,
        "end_time": call.end_time,
        "duration": call.duration,
        "status": call.status,
        "outcome": call.outcome,
        "lead_status": call.lead_status,
        "follow_up_required": call.follow_up_required,
        "failure_reason": call.failure_reason,
        "transcripts": [
            {"speaker": t.speaker, "message": t.message, "timestamp": t.timestamp}
            for t in transcripts
        ],
        "summary": {
            "summary": summary.summary,
            "requirement": summary.requirement,
            "capacity": summary.capacity,
            "location": summary.location,
            "application": summary.application,
            "budget": summary.budget,
            "timeline": summary.timeline,
            "customer_intent": summary.customer_intent,
            "important_points": summary.important_points,
            "follow_up_requirements": summary.follow_up_requirements,
            "outcome": summary.outcome
        } if summary else None
    }


@app.get("/dashboard/stats")
def get_dashboard_stats(db: Session = Depends(get_db)):
    """Get aggregate statistics for the admin dashboard."""
    total_calls = db.query(Call).count()
    completed_calls = db.query(Call).filter(Call.status == "completed").count()
    failed_calls = db.query(Call).filter(
        Call.status.in_(["failed", "error", "disconnected",
                        "no_answer", "interrupted"])
    ).count()
    interested_leads = db.query(Call).filter(
        Call.lead_status == "interested").count()
    follow_ups = db.query(Call).filter(Call.follow_up_required == True).count()

    avg_duration_result = db.query(func.avg(Call.duration)).filter(
        Call.duration != None,
        Call.status == "completed"
    ).scalar()
    avg_duration = float(avg_duration_result) if avg_duration_result else 0.0

    return {
        "total_calls": total_calls,
        "completed_calls": completed_calls,
        "failed_calls": failed_calls,
        "interested_leads": interested_leads,
        "follow_ups_required": follow_ups,
        "average_duration": avg_duration
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
