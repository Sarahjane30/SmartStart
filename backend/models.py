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
    manager_id: str = "MGR-CHEN"
    manager_name: str = "Ava Chen"
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


# --- Layer 2: Employer Command Center ---


class EmployerRole(str, Enum):
    ALL = "All"
    HR = "HR"
    IT = "IT"
    MANAGER = "Manager"


class EmployerPersona(str, Enum):
    HR = "HR"
    IT = "IT"
    MANAGER = "Manager"
    OPS = "Ops"


class EmployerAccount(BaseModel):
    username: str
    password: str
    display_name: str
    persona: EmployerPersona
    title: str
    manager_id: Optional[str] = None


class EmployerLoginRequest(BaseModel):
    username: str
    password: str


class EmployerLoginResponse(BaseModel):
    token: str
    username: str
    display_name: str
    persona: str
    title: str
    manager_id: Optional[str] = None
    synthetic: bool = True
    message: str = "Synthetic employer session — not real authentication."


class AlertSeverity(str, Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class DashboardJoinerRow(BaseModel):
    id: str
    name: str
    email: EmailStr
    role_type: RoleType
    department: str
    department_track: DepartmentTrack
    current_state: OnboardingState
    mentor_name: str
    manager_id: str
    manager_name: str
    learning_track: str
    joining_date: date
    days_in_pipeline: int
    bottleneck: Optional[str] = None
    docs_status: DocumentStatus
    hardware_status: HardwareStatus
    it_sla_breached: bool
    assigned_tasks: list[str] = Field(default_factory=list)
    synthetic: bool = True


class DashboardResponse(BaseModel):
    total_joiners: int
    rows: list[DashboardJoinerRow]
    by_state: dict[str, int]
    synthetic: bool = True
    dataset_note: str = "Synthetic dashboard rows only — no real employee PII."


class Alert(BaseModel):
    id: str
    severity: AlertSeverity
    category: str
    title: str
    message: str
    joiner_id: Optional[str] = None
    joiner_name: Optional[str] = None
    role_view: str = "All"
    created_at: datetime
    synthetic: bool = True


class AlertsResponse(BaseModel):
    total: int
    alerts: list[Alert]
    synthetic: bool = True
    as_of: datetime


class TimeSeriesPoint(BaseModel):
    label: str
    value: float


class AnalyticsResponse(BaseModel):
    avg_onboarding_days: float
    avg_it_lead_time_days: float
    completion_rate_pct: float
    active_joiners: int
    project_ready_count: int
    docs_pending: int = 0
    sla_breaches: int = 0
    bottleneck_counts: dict[str, int]
    avg_days_by_state: dict[str, float]
    onboarding_trend: list[TimeSeriesPoint]
    role_view: str = "All"
    cohort_size: int = 0
    focus_note: str = ""
    synthetic: bool = True
    as_of: Optional[datetime] = None


class IntegrationSnapshot(BaseModel):
    system: str
    domain: str
    status: str
    record_count: int
    open_items: int
    last_synced_at: datetime
    sample_payload: dict
    synthetic: bool = True


class IntegrationsResponse(BaseModel):
    integrations: list[IntegrationSnapshot]
    synthetic: bool = True
    as_of: datetime


# --- Layer 3: Employee Experience ---


class ModuleStatus(str, Enum):
    LOCKED = "locked"
    AVAILABLE = "available"
    IN_PROGRESS = "in_progress"
    COMPLETE = "complete"


class LearningModule(BaseModel):
    id: str
    title: str
    description: str
    duration_minutes: int
    status: ModuleStatus
    category: str
    required: bool = True
    synthetic: bool = True


class LearningTrackResponse(BaseModel):
    joiner_id: str
    track_name: str
    role_type: RoleType
    department_track: DepartmentTrack
    modules: list[LearningModule]
    completion_pct: float
    completed_count: int
    total_count: int
    synthetic: bool = True


class NotificationKind(str, Enum):
    INFO = "info"
    ACTION = "action"
    SUCCESS = "success"
    REMINDER = "reminder"


class EmployeeNotification(BaseModel):
    id: str
    kind: NotificationKind
    title: str
    message: str
    created_at: datetime
    read: bool = False
    synthetic: bool = True


class NotificationsResponse(BaseModel):
    joiner_id: str
    notifications: list[EmployeeNotification]
    unread_count: int
    synthetic: bool = True


class EmployeeProfile(BaseModel):
    """Employee-facing profile assembled from Layer 1 synthetic records."""

    id: str
    name: str
    email: EmailStr
    role_type: RoleType
    department: str
    department_track: DepartmentTrack
    joining_date: date
    current_state: OnboardingState
    mentor_name: str
    learning_track: str
    assigned_tasks: list[str]
    days_in_pipeline: int
    docs_status: DocumentStatus
    hardware_status: HardwareStatus
    software_access: list[str]
    bottleneck: Optional[str] = None
    next_action: str
    synthetic: bool = True


class FeedbackCreate(BaseModel):
    joiner_id: str
    step: str = Field(min_length=1, max_length=80)
    rating: int = Field(ge=1, le=5)
    comment: str = Field(default="", max_length=500)


class FeedbackRecord(BaseModel):
    id: str
    joiner_id: str
    step: str
    rating: int
    comment: str
    submitted_at: datetime
    synthetic: bool = True


class FeedbackResponse(BaseModel):
    feedback: FeedbackRecord
    message: str = "Thanks — synthetic feedback recorded for demo."
    synthetic: bool = True


# --- Layer 4: Prototype AI Features ---


class RiskLevel(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class ChatFAQ(BaseModel):
    id: str
    question: str
    answer: str
    category: str
    synthetic: bool = True


class ChatTurn(BaseModel):
    role: str  # user | assistant
    text: str
    matched_faq_id: Optional[str] = None
    synthetic: bool = True


class ChatbotResponse(BaseModel):
    joiner_id: str
    role_type: RoleType
    greeting: str
    faqs: list[ChatFAQ]
    turns: list[ChatTurn] = Field(default_factory=list)
    query: Optional[str] = None
    synthetic: bool = True
    note: str = "Rule-based synthetic FAQ bot — not a live LLM."


class PredictiveAlert(BaseModel):
    id: str
    category: str
    title: str
    message: str
    risk_score: float = Field(ge=0, le=100)
    risk_level: RiskLevel
    drivers: list[str] = Field(default_factory=list)
    recommended_action: str
    synthetic: bool = True


class PredictResponse(BaseModel):
    joiner_id: str
    overall_risk_score: float
    overall_risk_level: RiskLevel
    alerts: list[PredictiveAlert]
    synthetic: bool = True
    as_of: datetime
    note: str = "Seed-stable synthetic risk scores from demo delays only."


class RecommendationItem(BaseModel):
    id: str
    module_id: str
    title: str
    reason: str
    priority: int = Field(ge=1, le=5)
    estimated_minutes: int
    progress_pct: float = Field(ge=0, le=100)
    status: ModuleStatus
    category: str
    synthetic: bool = True


class RecommendationsResponse(BaseModel):
    joiner_id: str
    role_type: RoleType
    department_track: DepartmentTrack
    focus: str
    recommendations: list[RecommendationItem]
    track_completion_pct: float
    synthetic: bool = True
    note: str = "Adaptive suggestions from synthetic role + progress — demo only."


class ConsultContact(BaseModel):
    """Synthetic person the joiner can ask for help."""

    id: str
    name: str
    role_label: str
    channel: str
    availability: str
    focus: str
    synthetic: bool = True


class TeamMember(BaseModel):
    """Synthetic teammate / peer joiner in the same department."""

    id: str
    name: str
    role_type: RoleType
    current_state: OnboardingState
    mentor_name: str
    days_in_pipeline: int
    is_self: bool = False
    synthetic: bool = True


class TeamWorkspaceResponse(BaseModel):
    """Employee workspace helpers: consult network + department team."""

    joiner_id: str
    role_type: RoleType
    department: str
    team_name: str
    consult: list[ConsultContact]
    team: list[TeamMember]
    suggested_questions: list[str]
    synthetic: bool = True
    note: str = "Synthetic consult network and team roster — demo only."


class OwnerCandidate(BaseModel):
    """Someone who can own a bottleneck (Assign modal)."""

    id: str
    name: str
    title: str
    team: str
    focus: str
    recommended: bool = False
    synthetic: bool = True


class AssignOwnersResponse(BaseModel):
    """Assignable owners for a joiner's current bottleneck."""

    joiner_id: str
    joiner_name: str
    department: str
    manager_name: str
    mentor_name: str
    bottleneck: str | None = None
    queue: str = "Ops"
    owners: list[OwnerCandidate]
    synthetic: bool = True
    note: str = "Synthetic demo only — assignments are not persisted."
