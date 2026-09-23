"""IRA companion APIs — aggregated onboarding context for the desktop assistant.

IRA is a separate desktop app; these endpoints are consumed over HTTP only.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, Field

from backend.database import DataStore, store
from backend.employee_experience import build_employee_profile, build_learning_track, build_notifications
from backend.models import DocumentStatus, HardwareStatus, OnboardingState

AS_OF = datetime(2026, 9, 15, 12, 0, 0, tzinfo=timezone.utc)

_STATE_PROGRESS = {
    OnboardingState.OFFER_ACCEPTED: 15,
    OnboardingState.DOCS_SUBMITTED: 35,
    OnboardingState.IT_PROVISIONED: 55,
    OnboardingState.DAY1_ORIENTED: 75,
    OnboardingState.PROJECT_READY: 100,
}

# Shared bridge: SmartStart portal writes this when an employee signs in;
# IRA polls it so chat unlocks for that identity.
_active_session: dict[str, Any] | None = None


class IraSessionRequest(BaseModel):
    employee_id: str = Field(min_length=1)
    employee_name: str | None = None
    department: str | None = None
    role_type: str | None = None


def get_ira_session() -> dict:
    if not _active_session:
        return {"active": False, "session": None, "synthetic": True}
    return {"active": True, "session": dict(_active_session), "synthetic": True}


def set_ira_session(body: IraSessionRequest, db: DataStore | None = None) -> dict:
    global _active_session
    db = db or store
    joiner = db.get_joiner(body.employee_id)
    if joiner is None:
        raise KeyError(body.employee_id)
    _active_session = {
        "employee_id": joiner.id,
        "employee_name": body.employee_name or joiner.name,
        "department": body.department or joiner.department,
        "role_type": body.role_type or joiner.role_type.value,
        "signed_in_at": datetime.now(timezone.utc).isoformat(),
    }
    return get_ira_session()


def clear_ira_session() -> dict:
    global _active_session
    _active_session = None
    return {"active": False, "session": None, "synthetic": True}


def list_ira_employees(db: DataStore | None = None) -> dict:
    db = db or store
    rows = [
        {
            "id": j.id,
            "name": j.name,
            "role_type": j.role_type.value,
            "department": j.department,
            "joining_date": j.joining_date.isoformat(),
            "current_state": j.current_state.value,
            "manager_name": j.manager_name,
            "mentor_name": j.mentor_name,
        }
        for j in db.list_joiners()
    ]
    rows.sort(key=lambda r: (0 if r["name"] == "Sarah Jane" else 1, r["name"]))
    return {"total": len(rows), "employees": rows, "synthetic": True}


def build_ira_context(joiner_id: str, db: DataStore | None = None) -> dict:
    """Single payload IRA uses for context-aware answers."""
    db = db or store
    profile = build_employee_profile(joiner_id, db=db)
    learning = build_learning_track(joiner_id, db=db)
    notes = build_notifications(joiner_id, db=db)
    joiner = db.get_joiner(joiner_id)
    docs = db.get_documents(joiner_id)
    ticket = db.get_ticket_for_joiner(joiner_id)
    assert joiner is not None and docs is not None and ticket is not None

    progress = _STATE_PROGRESS.get(joiner.current_state, 0)
    open_tasks = list(joiner.assigned_tasks)
    if docs.status != DocumentStatus.COMPLETE:
        open_tasks = ["Complete / verify onboarding documents"] + open_tasks
    if ticket.hardware_status != HardwareStatus.DELIVERED:
        open_tasks = [f"Laptop status: {ticket.hardware_status.value}"] + open_tasks

    hr_ready = docs.status == DocumentStatus.COMPLETE and not docs.rework_flag
    it_ready = ticket.hardware_status == HardwareStatus.DELIVERED
    project_ready = joiner.current_state == OnboardingState.PROJECT_READY
    day1_ready = hr_ready and it_ready and joiner.current_state in {
        OnboardingState.IT_PROVISIONED,
        OnboardingState.DAY1_ORIENTED,
        OnboardingState.PROJECT_READY,
    }

    checklist = {
        "start_date_confirmed": True,
        "documents_complete": hr_ready,
        "laptop_delivered": it_ready,
        "software_access_listed": bool(ticket.software_access),
        "learning_started": learning.completion_pct > 0,
        "project_ready": project_ready,
    }

    return {
        "employee": {
            "id": profile.id,
            "name": profile.name,
            "email": str(profile.email),
            "role_type": profile.role_type.value,
            "department": profile.department,
            "joining_date": profile.joining_date.isoformat(),
            "manager_name": joiner.manager_name,
            "manager_id": joiner.manager_id,
            "mentor_name": profile.mentor_name,
            "learning_track": profile.learning_track,
        },
        "onboarding": {
            "current_state": profile.current_state.value,
            "progress_pct": progress,
            "days_in_pipeline": profile.days_in_pipeline,
            "bottleneck": profile.bottleneck,
            "next_action": profile.next_action,
            "open_tasks": open_tasks[:8],
            "assigned_tasks": list(profile.assigned_tasks),
        },
        "documents": {
            "status": docs.status.value,
            "rework_flag": docs.rework_flag,
            "form_count": docs.form_count,
            "waiting_days": docs.waiting_days,
            "source_system": "iCIMS (via SmartStart)",
        },
        "it": {
            "ticket_id": ticket.ticket_id,
            "hardware_status": ticket.hardware_status.value,
            "software_access": list(ticket.software_access),
            "lead_time_days": ticket.lead_time_days,
            "sla_target_days": ticket.sla_target_days,
            "sla_breached": ticket.sla_breached,
            "source_system": "ServiceNow (via SmartStart)",
        },
        "learning": {
            "track_name": learning.track_name,
            "completion_pct": learning.completion_pct,
            "completed_count": learning.completed_count,
            "total_count": learning.total_count,
            "next_modules": [
                m.title
                for m in learning.modules
                if m.status.value in {"available", "in_progress"}
            ][:3],
        },
        "readiness": {
            "day1_ready": day1_ready,
            "hr_ready": hr_ready,
            "it_ready": it_ready,
            "project_ready": project_ready,
            "checklist": checklist,
            "sources": {
                "hr": "iCIMS (via SmartStart)",
                "it": "ServiceNow (via SmartStart)",
                "projects": "Jira (via SmartStart onboarding state)",
            },
        },
        "notifications": [
            {
                "kind": n.kind.value,
                "title": n.title,
                "message": n.message,
                "created_at": n.created_at.isoformat(),
            }
            for n in notes.notifications[:6]
        ],
        "synthetic": True,
        "as_of": AS_OF.isoformat(),
        "note": "Aggregated for IRA desktop companion — not a SmartStart UI page.",
    }
