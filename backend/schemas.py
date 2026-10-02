from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class StartCallRequest(BaseModel):
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None


class StartCallResponse(BaseModel):
    call_id: int
    customer_id: int
    ai_greeting: str
    call_mode: str = "browser"


class MessageRequest(BaseModel):
    user_message: str


class MessageResponse(BaseModel):
    ai_response: str
    customer_intent: Optional[str] = None
    extracted_info: Optional[dict] = None
    call_ended: bool = False


class EndCallRequest(BaseModel):
    reason: Optional[str] = "completed"


class TranscriptItem(BaseModel):
    speaker: str
    message: str
    timestamp: datetime

    class Config:
        from_attributes = True


class CallSummarySchema(BaseModel):
    summary: Optional[str]
    requirement: Optional[str]
    capacity: Optional[str]
    location: Optional[str]
    application: Optional[str]
    budget: Optional[str]
    timeline: Optional[str]
    customer_intent: Optional[str]
    important_points: Optional[str]
    follow_up_requirements: Optional[str]
    outcome: Optional[str]

    class Config:
        from_attributes = True


class CustomerSchema(BaseModel):
    id: int
    name: Optional[str]
    phone: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class CallDetailSchema(BaseModel):
    id: int
    customer_id: Optional[int]
    customer: Optional[CustomerSchema]
    start_time: datetime
    end_time: Optional[datetime]
    duration: Optional[float]
    status: str
    outcome: Optional[str]
    lead_status: Optional[str]
    follow_up_required: bool
    failure_reason: Optional[str]
    transcripts: List[TranscriptItem] = []
    summary: Optional[CallSummarySchema] = None

    class Config:
        from_attributes = True


class CallListItem(BaseModel):
    id: int
    customer_name: Optional[str]
    customer_phone: Optional[str]
    start_time: datetime
    duration: Optional[float]
    status: str
    outcome: Optional[str]
    lead_status: Optional[str]
    follow_up_required: bool

    class Config:
        from_attributes = True


class DashboardStats(BaseModel):
    total_calls: int
    completed_calls: int
    failed_calls: int
    interested_leads: int
    follow_ups_required: int
    average_duration: float  # in seconds
