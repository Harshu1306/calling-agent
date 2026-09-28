import json
import logging
import os
import re
from google import genai
from google.genai import errors
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    raise RuntimeError("GEMINI_API_KEY is not configured in the .env file.")

# Primary model + fallbacks. Each model has its own quota.
MODEL_NAME = os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite")
FALLBACK_MODELS = [
    m.strip()
    for m in os.getenv("GEMINI_FALLBACK_MODELS", "gemini-2.5-flash").split(",")
    if m.strip()
]
MODELS = [MODEL_NAME] + [m for m in FALLBACK_MODELS if m != MODEL_NAME]

# Set ENABLE_CALL_SUMMARY=true in .env to generate real summaries
ENABLE_CALL_SUMMARY = os.getenv("ENABLE_CALL_SUMMARY", "false").lower() == "true"

client = genai.Client(api_key=GEMINI_API_KEY)

GENERATION_CONFIG = {
    "temperature": float(os.getenv("GEMINI_TEMPERATURE", "0.2")),
    "top_p": float(os.getenv("GEMINI_TOP_P", "0.9")),
    "top_k": int(os.getenv("GEMINI_TOP_K", "40")),
    "max_output_tokens": int(os.getenv("GEMINI_MAX_OUTPUT_TOKENS", "512")),
}

SYSTEM_PROMPT = """You are Priya, a friendly and professional sales agent for AquaPure Commercial RO Systems.
Your job is to call potential customers, understand their water purification needs, and qualify them as leads.

You are speaking with a potential customer about Commercial RO (Reverse Osmosis) and water purification systems.

YOUR GOALS:
1. Greet the customer warmly
2. Understand if they need a commercial RO system
3. Extract key information without asking for things they already told you:
   - Customer name
   - Requirement (type of system)
   - RO system capacity (in LPH - litres per hour)
   - Location (city/area)
   - Application (hotel, restaurant, hospital, factory, etc.)
   - Budget (in INR)
   - Purchase timeline
4. Assess their interest level
5. Determine if follow-up is needed
6. Summarize and close the call politely

CONVERSATION RULES:
- Be natural and conversational, not robotic
- NEVER ask for information the customer already provided
- If the customer gives multiple pieces of information in one sentence, extract all of them
- Ask one or two questions at a time maximum
- Be empathetic and understanding
- Speak ONLY in English.
- Never respond in Hindi, Telugu, or any other language.
- Do not mix English with Hindi or use Hindi filler words such as "bilkul", "theek hai", "ji", or "achha".
- Even if the customer speaks Hindi or another language, continue responding in English.
- If the customer explicitly asks to switch languages, still respond in English unless language switching is implemented separately.
- If the customer says they are not interested, politely acknowledge and end the call
- Keep responses SHORT and natural (2-3 sentences max for each turn)
- Answer the customer's latest question first. If they ask what options or products are available, briefly explain that AquaPure offers commercial RO solutions and ask what kind of business or capacity they need; do not repeat a greeting or silence prompt.
- Treat only the latest customer message as the new request, while using earlier turns as context. Never answer with a generic fallback when the customer's request is clear.
- Do not invent model names, prices, technical specifications, or product options that are not present in the conversation. Be clear when a specific detail is not available and offer to confirm it.

LEAD STATUSES:
- interested: customer clearly wants to buy
- not_interested: customer doesn't want the product
- maybe: customer is uncertain or wants to think
- follow_up_required: customer wants to be called back
- information_needed: need more details before qualifying

CALL END CONDITIONS:
- Customer says they are not interested
- All key information has been collected
- Customer asks to be called back later
- Customer hangs up

IMPORTANT: You must ALWAYS respond with valid JSON in this exact format:
{
  "response": "Your spoken response to the customer",
  "customer_intent": "interested|not_interested|maybe|follow_up_required|information_needed",
  "extracted_information": {
    "name": null,
    "requirement": null,
    "capacity": null,
    "location": null,
    "application": null,
    "budget": null,
    "timeline": null
  },
  "next_action": "ask_name|ask_requirement|ask_capacity|ask_location|ask_application|ask_budget|ask_timeline|ask_followup|summarize|end_call|continue",
  "call_should_end": false
}

Keep "response" conversational and natural. Update extracted_information with any new info learned.
Set call_should_end to true only when the conversation is naturally complete.
"""
def generate_with_fallback(contents, config):
    """
    Call Gemini, trying each model in MODELS in order.
    Moves to the next model on quota (429), overload (503),
    or model-not-available (404) errors.
    Raises the last error if every model fails.
    """
    last_error = None
    for model in MODELS:
        try:
            return client.models.generate_content(
                model=model,
                contents=contents,
                config=config,
            )
        except errors.APIError as e:
            if e.code in (404, 429, 503):
                logger.warning(
                    "Model %s unavailable (HTTP %s), trying next model...",
                    model, e.code)
                last_error = e
                continue
            raise
    raise last_error


def is_quota_error(e: Exception) -> bool:
    return isinstance(e, errors.APIError) and e.code == 429


def clean_json_text(text: str) -> str:
    """Remove markdown code fences if the model added them."""
    text = (text or "").strip()
    if text.startswith("```"):
        text = re.sub(r"```(?:json)?\n?", "", text).strip()
        text = text.rstrip("`").strip()
    return text


def _fallback_summary(extracted_info: dict, customer_name: str, note: str) -> dict:
    return {
        "summary": f"Call with {customer_name}. Customer inquired about commercial RO system.",
        "requirement": extracted_info.get("requirement"),
        "capacity": extracted_info.get("capacity"),
        "location": extracted_info.get("location"),
        "application": extracted_info.get("application"),
        "budget": extracted_info.get("budget"),
        "timeline": extracted_info.get("timeline"),
        "customer_intent": "follow_up_required",
        "important_points": note,
        "follow_up_requirements": extracted_info.get("timeline"),
        "outcome": "no_outcome",
    }



def get_ai_response(conversation_history: list, extracted_info: dict, customer_intent: str) -> dict:
 
    known_info = []
    for key, value in extracted_info.items():
        if value:
            known_info.append(f"  - {key}: {value}")

    known_context = ""
    if known_info:
        known_context = "\n\nINFORMATION ALREADY COLLECTED (DO NOT ASK AGAIN):\n" + "\n".join(
            known_info)

    missing_info = [k for k, v in extracted_info.items() if not v]
    missing_context = f"\nSTILL NEED TO COLLECT: {', '.join(missing_info) if missing_info else 'All info collected'}"

    full_system = SYSTEM_PROMPT + known_context + missing_context + \
        f"\nCURRENT CUSTOMER INTENT: {customer_intent}"

    response_text = ""
    try:
        contents = []
        for item in conversation_history[:-1] if conversation_history else []:
            role = "user" if item.get("role") == "user" else "model"
            parts = item.get("parts", [])
            message = parts[0] if parts else ""
            if message:
                contents.append({"role": role, "parts": [{"text": message}]})

        last_message = conversation_history[-1]["parts"][0] if conversation_history else "Hello"
        contents.append({
            "role": "user",
            "parts": [{
                "text": last_message + "\n\nIMPORTANT: Respond ONLY with valid JSON, no markdown, no code blocks."
            }]
        })

        response = generate_with_fallback(
            contents,
            {
                **GENERATION_CONFIG,
                "system_instruction": full_system,
            },
        )

        response_text = clean_json_text(response.text)
        parsed = json.loads(response_text)

        new_info = parsed.get("extracted_information", {}) or {}
        for key in extracted_info:
            if key in new_info and new_info[key] is not None:
                extracted_info[key] = new_info[key]

        parsed["extracted_information"] = extracted_info
        return parsed

    except json.JSONDecodeError as e:
        logger.exception(
            "Gemini response was not valid JSON (%s). Raw text: %s",
            type(e).__name__, response_text)
        return {
            "response": "I'm sorry, could you please repeat that?",
            "customer_intent": customer_intent,
            "extracted_information": extracted_info,
            "next_action": "continue",
            "call_should_end": False
        }
    except Exception as e:
        if is_quota_error(e):
            logger.error("All Gemini models are out of quota: %s", e)
            reply = "I'm sorry, I'm having a technical issue right now. Could you please give me a moment and try again?"
        else:
            logger.exception(
                "Gemini response generation failed (%s)", type(e).__name__)
            reply = "I apologize, I didn't quite catch that. Could you please repeat?"
        return {
            "response": reply,
            "customer_intent": customer_intent,
            "extracted_information": extracted_info,
            "next_action": "continue",
            "call_should_end": False
        }


def get_opening_greeting() -> dict:
    """Generate the opening greeting for a new call."""
    try:
        response = generate_with_fallback(
            (
                "Generate the opening greeting for a new customer call. "
                "IMPORTANT: Respond ONLY with valid JSON, no markdown, no code blocks. "
                "Set next_action to 'ask_requirement' and call_should_end to false."
            ),
            {
                **GENERATION_CONFIG,
                "system_instruction": SYSTEM_PROMPT,
            },
        )

        response_text = clean_json_text(response.text)
        return json.loads(response_text)

    except Exception as e:
        logger.exception(
            "Gemini greeting generation failed (%s)", type(e).__name__)
        return {
            "response": "Hello! I'm Priya calling from AquaPure Commercial RO Systems. We help businesses get clean, purified water with our commercial RO solutions. Are you currently looking for a water purification system for your business?",
            "customer_intent": "information_needed",
            "extracted_information": {
                "name": None, "requirement": None, "capacity": None,
                "location": None, "application": None, "budget": None, "timeline": None
            },
            "next_action": "ask_requirement",
            "call_should_end": False
        }


def generate_call_summary(transcript: list, extracted_info: dict, customer_name: str) -> dict:
   
    if not ENABLE_CALL_SUMMARY:
        return _fallback_summary(
            extracted_info, customer_name,
            "Summary generation disabled (ENABLE_CALL_SUMMARY=false)"
        )

    transcript_text = "\n".join([
        f"{item['speaker']}: {item['message']}"
        for item in transcript
    ])

    prompt = f"""You are analyzing a sales call transcript for a Commercial RO (Reverse Osmosis) water purification system.

CALL TRANSCRIPT:
{transcript_text}

EXTRACTED INFORMATION:
{json.dumps(extracted_info, indent=2)}

Generate a comprehensive call summary. Respond ONLY with valid JSON (no markdown):
{{
  "summary": "2-3 sentence narrative summary of the call",
  "requirement": "type of RO system needed",
  "capacity": "LPH capacity required",
  "location": "customer location",
  "application": "hotel/restaurant/hospital/factory/etc",
  "budget": "budget in INR",
  "timeline": "purchase timeline",
  "customer_intent": "interested|not_interested|maybe|follow_up_required",
  "important_points": "key points from the conversation",
  "follow_up_requirements": "what follow-up is needed if any",
  "outcome": "sale_prospect|not_interested|callback_scheduled|information_sent|no_outcome"
}}

Fill in from the transcript. Use null for genuinely unknown information."""

    try:
        response = generate_with_fallback(
            prompt,
            {
                **GENERATION_CONFIG,
                # The summary JSON is longer than a chat reply
                "max_output_tokens": 1024,
                "system_instruction": SYSTEM_PROMPT,
            },
        )
        response_text = clean_json_text(response.text)
        return json.loads(response_text)

    except Exception as e:
        logger.exception(
            "Gemini summary generation failed (%s)", type(e).__name__)
        return _fallback_summary(
            extracted_info, customer_name,
            "Unable to generate detailed summary"
        )