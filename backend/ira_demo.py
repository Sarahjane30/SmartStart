"""Pin a fixed IRA demo persona (Sarah Jane) onto the synthetic cohort."""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from backend.database import DataStore, store
from backend.models import (
    DepartmentTrack,
    DocumentStatus,
    DocumentSubmission,
    HardwareStatus,
    ITProvisioningTicket,
    Joiner,
    OnboardingState,
    RoleType,
)

IRA_DEMO_NAME = "Sarah Jane"
IRA_DEMO_TICKET = "REQ-1042"


def find_ira_demo_id(db: DataStore | None = None) -> str | None:
    db = db or store
    for j in db.list_joiners():
        if j.name == IRA_DEMO_NAME:
            return j.id
    return None


def pin_ira_demo_employee(db: DataStore | None = None) -> str:
    """Overwrite one technical intern as Sarah Jane (same id — cohort size stable).

    Keeps the original joiner id so seed-42 fixtures (e.g. SYN-J-0042-023) remain
    addressable. Ticket id becomes REQ-1042 for the IRA desktop demo.
    """
    db = db or store
    target = None
    # Prefer the seed-42 fixture id used across Layer 3 UI defaults when present.
    preferred = db.get_joiner("SYN-J-0042-023")
    if preferred is not None and preferred.role_type == RoleType.INTERN:
        target = preferred
    if target is None:
        for j in db.list_joiners():
            if j.role_type == RoleType.INTERN and j.department_track == DepartmentTrack.TECHNICAL:
                target = j
                break
    if target is None:
        joiners = db.list_joiners()
        if not joiners:
            return ""
        target = joiners[0]

    joiner_id = target.id
    old_ticket = db.get_ticket_for_joiner(joiner_id)
    if old_ticket is not None:
        db.it_tickets.pop(old_ticket.ticket_id, None)

    # Keep original offer/joining ordering so list_joiners() still surfaces this
    # technical intern first under seed 42 (Layer 4 picks the first INTERN).
    offer_at = target.offer_accepted_at
    joining = date(2026, 9, 28)

    joiner = Joiner(
        id=joiner_id,
        name=IRA_DEMO_NAME,
        email="sarah.jane.ira@synthetic.smartstart.example",
        role_type=RoleType.INTERN,
        department="Data Engineering",
        department_track=DepartmentTrack.TECHNICAL,
        joining_date=joining,
        offer_accepted_at=offer_at,
        current_state=OnboardingState.DOCS_SUBMITTED,
        mentor_name="Priya Nair",
        manager_id="MGR-CHEN",
        manager_name="Ava Chen",
        learning_track="Data Platform Onboarding",
        assigned_tasks=[
            "Complete your tax information",
            "Confirm your laptop collection",
        ],
        synthetic=True,
    )
    documents = DocumentSubmission(
        joiner_id=joiner_id,
        form_count=30,
        status=DocumentStatus.COMPLETE,
        rework_flag=False,
        submitted_at=offer_at + timedelta(days=1),
        completed_at=offer_at + timedelta(days=2),
        waiting_days=0,
        synthetic=True,
    )
    it_ticket = ITProvisioningTicket(
        ticket_id=IRA_DEMO_TICKET,
        joiner_id=joiner_id,
        hardware_status=HardwareStatus.CONFIGURED,
        software_access=["Okta", "GitHub", "Jira", "Slack", "VPN"],
        lead_time_days=2,
        sla_target_days=3,
        created_at=offer_at + timedelta(hours=6),
        updated_at=offer_at + timedelta(days=2),
        synthetic=True,
    )
    db.upsert_bundle(joiner, documents, it_ticket)
    return joiner_id
