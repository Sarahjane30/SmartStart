"""Pydantic schemas for SmartStart onboarding Layer 1."""

from __future__ import annotations

from datetime import date, datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, EmailStr, Field


class RoleType(str, Enum):
    FTE = "FTE"
    INTERN = "INTERN"


class DepartmentTrack(str, Enum):
    TECHNICAL = "Technical"
    NON_TECHNICAL = "Non-Technical"


class OnboardingState(str, Enum):
    OFFER_ACCEPTED = "OFFER_ACCEPTED"
    DOCS_SUBMITTED = "DOCS_SUBMITTED"
    IT_PROVISIONED = "IT_PROVISIONED"
    DAY1_ORIENTED = "DAY1_ORIENTED"
    PROJECT_READY = "PROJECT_READY"


ONBOARDING_STAGES: tuple[OnboardingState, ...] = tuple(OnboardingState)


class HardwareStatus(str, Enum):
    PENDING = "Pending"
    CONFIGURED = "Configured"
    DELIVERED = "Delivered"


class DocumentStatus(str, Enum):
    PENDING = "Pending"
    COMPLETE = "Complete"


class Joiner(BaseModel):
    """Synthetic iCIMS joiner record."""

    id: str
    name: str
    email: EmailStr
    role_type: RoleType
    department: str
    department_track: DepartmentTrack
    joining_date: date
    offer_accepted_at: datetime
    current_state: OnboardingState
    mentor_name: str
    learning_track: str
    assigned_tasks: list[str] = Field(default_factory=list)
    synthetic: bool = True


class ITProvisioningTicket(BaseModel):
    """Synthetic ServiceNow IT provisioning ticket."""

    ticket_id: str
    joiner_id: str
    hardware_status: HardwareStatus
    software_access: list[str]
    lead_time_days: int = Field(ge=0)
    sla_target_days: int = Field(default=3, ge=1)
    created_at: datetime
    updated_at: datetime
    synthetic: bool = True

    @property
    def sla_breached(self) -> bool:
        return self.lead_time_days > self.sla_target_days


class DocumentSubmission(BaseModel):
    """Digitized onboarding packet (~30-page paper forms stand-in)."""

    joiner_id: str
    form_count: int = Field(default=30, ge=1)
    status: DocumentStatus
    rework_flag: bool = False
    submitted_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    waiting_days: int = Field(default=0, ge=0)
    synthetic: bool = True


class JoinerDetail(BaseModel):
    joiner: Joiner
    documents: DocumentSubmission
    it_ticket: ITProvisioningTicket
    days_in_pipeline: int
    bottleneck: Optional[str] = None


class MetricsSummary(BaseModel):
    total_joiners: int
    by_role_type: dict[str, int]
    by_state: dict[str, int]
    by_department_track: dict[str, int]
    avg_pipeline_days: float
    avg_it_lead_time_days: float
    docs_pending: int
    docs_rework: int
    it_sla_breaches: int
    bottleneck_counts: dict[str, int]
    synthetic: bool = True
    dataset_note: str = (
        "All records are 100% synthetic. No real employee PII or production logs."
    )
