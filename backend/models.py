
from sqlalchemy import Column, Integer, String, DateTime, Boolean, Float, Text, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from database import Base


class Customer(Base):
    __tablename__ = "customers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    calls = relationship("Call", back_populates="customer")


class Call(Base):
    __tablename__ = "calls"

    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=True)
    start_time = Column(DateTime, default=datetime.utcnow)
    end_time = Column(DateTime, nullable=True)
    duration = Column(Float, nullable=True)  # in seconds
    status = Column(String, default="active")  # active, completed, failed, disconnected, no_answer, interrupted, error
    outcome = Column(String, nullable=True)  # sale_prospect, not_interested, callback_scheduled, etc.
    lead_status = Column(String, nullable=True)  # interested, not_interested, maybe, follow_up_required, information_needed
    follow_up_required = Column(Boolean, default=False)
    failure_reason = Column(String, nullable=True)

    customer = relationship("Customer", back_populates="calls")
    transcripts = relationship("Transcript", back_populates="call")
    summary = relationship("CallSummary", back_populates="call", uselist=False)


class Transcript(Base):
    __tablename__ = "transcripts"

    id = Column(Integer, primary_key=True, index=True)
    call_id = Column(Integer, ForeignKey("calls.id"))
    speaker = Column(String)  # "AI" or "Customer"
    message = Column(Text)
    timestamp = Column(DateTime, default=datetime.utcnow)

    call = relationship("Call", back_populates="transcripts")


class CallSummary(Base):
    __tablename__ = "call_summaries"

    id = Column(Integer, primary_key=True, index=True)
    call_id = Column(Integer, ForeignKey("calls.id"), unique=True)
    summary = Column(Text, nullable=True)
    requirement = Column(String, nullable=True)
    capacity = Column(String, nullable=True)
    location = Column(String, nullable=True)
    application = Column(String, nullable=True)
    budget = Column(String, nullable=True)
    timeline = Column(String, nullable=True)
    customer_intent = Column(String, nullable=True)
    important_points = Column(Text, nullable=True)
    follow_up_requirements = Column(Text, nullable=True)
    outcome = Column(String, nullable=True)

    call = relationship("Call", back_populates="summary")
