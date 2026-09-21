"""Pydantic models for the standalone mock iCIMS Talent Acquisition app."""

from __future__ import annotations

from datetime import date, datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, EmailStr, Field


class CandidateType(str, Enum):
    INTERN = "Intern"
    FTE = "FTE"


class CandidateStage(str, Enum):
    APPLIED = "Applied"
    SCREENING = "Screening"
    INTERVIEW = "Interview"
    OFFER = "Offer"
    OFFER_ACCEPTED = "Offer Accepted"
    HIRED = "Hired"


class RequisitionStatus(str, Enum):
    DRAFT = "Draft"
    OPEN = "Open"
    INTERVIEWING = "Interviewing"
    OFFER_STAGE = "Offer Stage"
    FILLED = "Filled"
    CLOSED = "Closed"


class OfferStatus(str, Enum):
    DRAFT = "Draft"
    PENDING_APPROVAL = "Pending Approval"
    SENT = "Sent"
    ACCEPTED = "Accepted"
    DECLINED = "Declined"


class DocSubmissionStatus(str, Enum):
    MISSING = "Missing"
    SUBMITTED = "Submitted"
    VERIFIED = "Verified"


class DeliveryStatus(str, Enum):
    QUEUED = "Queued"
    DELIVERED = "Delivered"
    FAILED = "Failed"
    RETRY = "Retry"


class InterviewOutcome(str, Enum):
    SCHEDULED = "Scheduled"
    COMPLETED = "Completed"
    CANCELLED = "Cancelled"


# --- Auth ---


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    token: str
    username: str
    display_name: str
    title: str
    synthetic: bool = True
    message: str = "Synthetic iCIMS demo session — not real authentication."


# --- Domain ---


class Requisition(BaseModel):
    id: str
    position: str
    department: str
    hiring_manager: str
    manager_id: str
    openings: int = 1
    candidate_count: int = 0
    status: RequisitionStatus
    created_date: date
    employment_type: CandidateType
    synthetic: bool = True


class Interview(BaseModel):
    id: str
    candidate_id: str
    title: str
    outcome: InterviewOutcome
    rating: Optional[str] = None
    interviewer: str
    scheduled_at: datetime
    synthetic: bool = True


class ActivityItem(BaseModel):
    at: datetime
    label: str
    detail: Optional[str] = None


class Candidate(BaseModel):
    id: str
    name: str
    email: EmailStr
    phone: str
    location: str
    position: str
    department: str
    hiring_manager: str
    manager_id: str
    requisition_id: str
    candidate_type: CandidateType
    stage: CandidateStage
    application_date: date
    expected_start_date: date
    smartstart_joiner_id: str
    interviews: list[Interview] = Field(default_factory=list)
    activity: list[ActivityItem] = Field(default_factory=list)
    synthetic: bool = True


class Offer(BaseModel):
    id: str
    candidate_id: str
    candidate_name: str
    position: str
    department: str
    hiring_manager: str
    candidate_type: CandidateType
    offer_date: date
    proposed_start_date: date
    status: OfferStatus
    compensation_placeholder: str = "Competitive — synthetic"
    smartstart_joiner_id: str
    synthetic: bool = True


class HireDocument(BaseModel):
    id: str
    employee_id: str
    employee_name: str
    document_name: str
    required: bool = True
    submission_status: DocSubmissionStatus
    verification_status: DocSubmissionStatus
    submitted_at: Optional[datetime] = None
    synthetic: bool = True


class NewHire(BaseModel):
    employee_id: str
    candidate_id: str
    name: str
    email: EmailStr
    role: str
    department: str
    hiring_manager: str
    manager_id: str
    employment_type: CandidateType
    start_date: date
    work_location: str = "Hybrid — synthetic"
    documents_complete: int = 0
    documents_total: int = 5
    preboarding_status: str = "In Progress"
    offer_accepted: bool = True
    personal_info_complete: bool = True
    background_check: bool = True
    hr_ready: bool = False
    smartstart_joiner_id: str
    activity: list[ActivityItem] = Field(default_factory=list)
    synthetic: bool = True


class IntegrationEvent(BaseModel):
    id: str
    event_type: str
    record_id: str
    payload: dict
    delivery: DeliveryStatus
    created_at: datetime
    transmitted_at: Optional[datetime] = None
    synthetic: bool = True


class DashboardResponse(BaseModel):
    active_candidates: int
    interviews_this_week: int
    offers_pending: int
    offers_accepted: int
    new_hires: int
    starting_soon: int
    pipeline: dict[str, int]
    upcoming_starts: list[dict]
    synthetic: bool = True
