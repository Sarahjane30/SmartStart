"""Faker-based synthetic onboarding cohort generator (InfoSec-safe)."""

from __future__ import annotations

import random
from datetime import datetime, timedelta, timezone

from faker import Faker

from backend.database import DataStore, store
from backend.models import (
    ONBOARDING_STAGES,
    DepartmentTrack,
    DocumentStatus,
    DocumentSubmission,
    HardwareStatus,
    ITProvisioningTicket,
    Joiner,
    OnboardingState,
    RoleType,
)

TECH_DEPARTMENTS = (
    "Engineering",
    "Data Science",
    "Product",
    "IT Infrastructure",
    "Security",
)
NON_TECH_DEPARTMENTS = (
    "Human Resources",
    "Finance",
    "Marketing",
    "Sales",
    "Operations",
)
TECH_SOFTWARE = ("Okta", "GitHub", "Jira", "Slack", "VPN", "AWS Console", "IDE License")
NON_TECH_SOFTWARE = ("Okta", "Slack", "Workday", "Salesforce", "Confluence", "Email")
TECH_TRACKS = (
    "Backend Foundations",
    "Frontend Foundations",
    "Data Platform Onboarding",
    "SRE Bootcamp",
)
NON_TECH_TRACKS = (
    "People Ops Foundations",
    "Finance Systems Orientation",
    "Go-To-Market Ramp",
    "Ops Playbook",
)
TECH_TASKS = (
    "Complete security training",
    "Shadow sprint planning",
    "Set up local dev environment",
    "Meet engineering mentor",
    "First PR walkthrough",
)
NON_TECH_TASKS = (
    "Complete compliance training",
    "Meet department buddy",
    "Review team OKRs",
    "Shadow customer call",
    "Submit week-1 checklist",
)

# Fixed hiring-manager pool — joiners are divided across these people (not one shared manager).
HIRING_MANAGERS: tuple[tuple[str, str, frozenset[str]], ...] = (
    ("MGR-CHEN", "Ava Chen", frozenset({"Engineering", "Data Science", "Security"})),
    ("MGR-PARK", "Leo Park", frozenset({"Product", "IT Infrastructure"})),
    ("MGR-SINGH", "Priya Singh", frozenset({"Human Resources", "Finance", "Operations"})),
    ("MGR-COLE", "Jordan Cole", frozenset({"Marketing", "Sales"})),
)


def assign_hiring_manager(department: str, idx: int) -> tuple[str, str]:
    """Map a joiner to one of the demo hiring managers by department."""
    for manager_id, manager_name, depts in HIRING_MANAGERS:
        if department in depts:
            return manager_id, manager_name
    # Even fallback so every joiner still lands on a real manager account.
    manager_id, manager_name, _ = HIRING_MANAGERS[(idx - 1) % len(HIRING_MANAGERS)]
    return manager_id, manager_name


def _state_index(state: OnboardingState) -> int:
    return ONBOARDING_STAGES.index(state)


def generate_cohort(
    n_interns: int = 15,
    n_ftes: int = 15,
    seed: int = 42,
    target_store: DataStore | None = None,
) -> DataStore:
    """Generate a fully synthetic joiner cohort and load it into the store."""
    db = target_store or store
    db.clear()

    fake = Faker()
    Faker.seed(seed)
    fake.seed_instance(seed)
    rng = random.Random(seed)
    # Fixed reference clock so the same seed always yields identical timestamps.
    now = datetime(2026, 9, 1, 12, 0, 0, tzinfo=timezone.utc)

    roster: list[tuple[RoleType, DepartmentTrack]] = (
        [(RoleType.INTERN, DepartmentTrack.TECHNICAL)] * (n_interns // 2)
        + [(RoleType.INTERN, DepartmentTrack.NON_TECHNICAL)]
        * (n_interns - n_interns // 2)
        + [(RoleType.FTE, DepartmentTrack.TECHNICAL)] * (n_ftes // 2)
        + [(RoleType.FTE, DepartmentTrack.NON_TECHNICAL)] * (n_ftes - n_ftes // 2)
    )
    rng.shuffle(roster)

    for idx, (role_type, track) in enumerate(roster, start=1):
        joiner_id = f"SYN-J-{seed:04d}-{idx:03d}"
        ticket_id = f"SYN-IT-{seed:04d}-{idx:03d}"

        if track == DepartmentTrack.TECHNICAL:
            department = rng.choice(TECH_DEPARTMENTS)
            software = list(rng.sample(TECH_SOFTWARE, k=rng.randint(4, 6)))
            learning_track = rng.choice(TECH_TRACKS)
            tasks = list(rng.sample(TECH_TASKS, k=rng.randint(2, 4)))
        else:
            department = rng.choice(NON_TECH_DEPARTMENTS)
            software = list(rng.sample(NON_TECH_SOFTWARE, k=rng.randint(4, 6)))
            learning_track = rng.choice(NON_TECH_TRACKS)
            tasks = list(rng.sample(NON_TECH_TASKS, k=rng.randint(2, 4)))

        pipeline_days = rng.randint(0, 14)
        offer_accepted_at = now - timedelta(days=pipeline_days)
        joining_date = (offer_accepted_at + timedelta(days=rng.randint(7, 21))).date()

        weights = (
            [0.25, 0.25, 0.25, 0.15, 0.10]
            if role_type == RoleType.INTERN
            else [0.15, 0.20, 0.25, 0.20, 0.20]
        )
        current_state = rng.choices(list(ONBOARDING_STAGES), weights=weights, k=1)[0]
        stage_i = _state_index(current_state)

        if stage_i >= _state_index(OnboardingState.DOCS_SUBMITTED):
            docs_status = DocumentStatus.COMPLETE
            rework = rng.random() < 0.12
            waiting_days = rng.randint(1, 4) if rework else rng.randint(0, 2)
            submitted_at = offer_accepted_at + timedelta(days=rng.randint(0, 2))
            completed_at = submitted_at + timedelta(days=max(1, waiting_days))
        else:
            docs_status = DocumentStatus.PENDING
            rework = False
            waiting_days = rng.randint(1, 5)
            submitted_at = None
            completed_at = None

        if stage_i >= _state_index(OnboardingState.IT_PROVISIONED):
            hardware = HardwareStatus.DELIVERED
            lead_time = rng.randint(1, 6)
        elif stage_i == _state_index(OnboardingState.DOCS_SUBMITTED):
            hardware = rng.choice([HardwareStatus.PENDING, HardwareStatus.CONFIGURED])
            lead_time = rng.randint(2, 8)
        else:
            hardware = HardwareStatus.PENDING
            lead_time = rng.randint(0, 3)

        first = fake.first_name()
        last = fake.last_name()
        email = f"{first}.{last}.{idx}@synthetic.smartstart.example".lower()
        manager_id, manager_name = assign_hiring_manager(department, idx)

        joiner = Joiner(
            id=joiner_id,
            name=f"{first} {last}",
            email=email,
            role_type=role_type,
            department=department,
            department_track=track,
            joining_date=joining_date,
            offer_accepted_at=offer_accepted_at,
            current_state=current_state,
            mentor_name=fake.name(),
            manager_id=manager_id,
            manager_name=manager_name,
            learning_track=learning_track,
            assigned_tasks=tasks,
            synthetic=True,
        )
        documents = DocumentSubmission(
            joiner_id=joiner_id,
            form_count=30,
            status=docs_status,
            rework_flag=rework,
            submitted_at=submitted_at,
            completed_at=completed_at,
            waiting_days=waiting_days,
            synthetic=True,
        )
        it_ticket = ITProvisioningTicket(
            ticket_id=ticket_id,
            joiner_id=joiner_id,
            hardware_status=hardware,
            software_access=software,
            lead_time_days=lead_time,
            sla_target_days=3,
            created_at=offer_accepted_at + timedelta(hours=6),
            updated_at=offer_accepted_at + timedelta(days=max(lead_time, 1)),
            synthetic=True,
        )
        db.upsert_bundle(joiner, documents, it_ticket)

    # Pin Sarah Jane for the IRA desktop companion demo (keeps cohort size stable).
    from backend.ira_demo import pin_ira_demo_employee

    pin_ira_demo_employee(db)
    return db


def infer_bottleneck(
    state: OnboardingState,
    documents: DocumentSubmission,
    ticket: ITProvisioningTicket,
) -> str | None:
    if state == OnboardingState.PROJECT_READY:
        return None
    if documents.status == DocumentStatus.PENDING:
        return "Documents pending (iCIMS)"
    if documents.rework_flag:
        return "Document rework loop"
    if ticket.hardware_status != HardwareStatus.DELIVERED:
        if ticket.sla_breached:
            return "IT SLA breach (ServiceNow)"
        return "IT provisioning in progress"
    if state == OnboardingState.IT_PROVISIONED:
        return "Awaiting Day-1 orientation"
    if state == OnboardingState.DAY1_ORIENTED:
        return "Awaiting project assignment (Jira)"
    return "Offer-to-docs handoff"


def days_in_pipeline(joiner: Joiner, now: datetime | None = None) -> int:
    now = now or datetime.now(timezone.utc)
    accepted = joiner.offer_accepted_at
    if accepted.tzinfo is None:
        accepted = accepted.replace(tzinfo=timezone.utc)
    return max(0, (now - accepted).days)
