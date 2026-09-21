"""Mock connectors for iCIMS / ServiceNow / Jira — systems of record (not SmartStart)."""

from __future__ import annotations

from datetime import datetime, timezone

from backend.database import DataStore, ingest_log, source_store, store
from backend.ingest import (
    list_icims_candidates,
    list_jira_issues,
    list_servicenow_tickets,
)
from backend.models import (
    HardwareStatus,
    IntegrationSnapshot,
    IntegrationsResponse,
    OnboardingState,
)

AS_OF = datetime(2026, 9, 15, 12, 0, 0, tzinfo=timezone.utc)


def _icims_snapshot(db: DataStore) -> IntegrationSnapshot:
    candidates = list_icims_candidates(db)
    pending = sum(1 for c in candidates if c["packet_status"] == "Pending review")
    complete = sum(1 for c in candidates if c["packet_status"] == "Complete")
    rework = sum(1 for c in candidates if c["rework_flag"])
    return IntegrationSnapshot(
        system="iCIMS",
        domain="HR",
        status="synthetic_ok",
        record_count=len(candidates),
        open_items=pending + rework,
        last_synced_at=AS_OF,
        sample_payload={
            "candidates": len(candidates),
            "packets_complete": complete,
            "packets_pending": pending,
            "rework_flags": rework,
            "ui": "/sources/icims",
            "note": "Mock ATS — separate from SmartStart. Open /sources/icims to browse.",
        },
        synthetic=True,
    )


def _servicenow_snapshot(db: DataStore) -> IntegrationSnapshot:
    tickets = list_servicenow_tickets(db)
    open_hw = sum(
        1 for t in tickets if t["hardware_status"] != HardwareStatus.DELIVERED.value
    )
    breaches = sum(1 for t in tickets if t["sla_breached"])
    return IntegrationSnapshot(
        system="ServiceNow",
        domain="IT",
        status="synthetic_ok",
        record_count=len(tickets),
        open_items=open_hw,
        last_synced_at=AS_OF,
        sample_payload={
            "tickets": len(tickets),
            "hardware_open": open_hw,
            "sla_breaches": breaches,
            "ui": "/sources/servicenow",
            "note": "Mock ITSM — separate from SmartStart. Open /sources/servicenow to browse.",
        },
        synthetic=True,
    )


def _jira_snapshot(db: DataStore) -> IntegrationSnapshot:
    issues = list_jira_issues(db)
    awaiting = sum(1 for i in issues if i["pipeline_state"] == OnboardingState.DAY1_ORIENTED.value)
    ready = sum(1 for i in issues if i["status"] == "Done")
    open_tasks = sum(len(i["subtasks"]) for i in issues if i["status"] != "Done")
    return IntegrationSnapshot(
        system="Jira",
        domain="Manager",
        status="synthetic_ok",
        record_count=len(issues),
        open_items=awaiting + open_tasks,
        last_synced_at=AS_OF,
        sample_payload={
            "issues": len(issues),
            "awaiting_project_assignment": awaiting,
            "project_ready": ready,
            "open_onboarding_tasks": open_tasks,
            "ui": "/sources/jira",
            "note": "Mock work tracker — separate from SmartStart. Open /sources/jira to browse.",
        },
        synthetic=True,
    )


def build_integrations(db: DataStore | None = None) -> IntegrationsResponse:
    """Return mock integration health from source systems + last SmartStart ingest."""
    db = db or source_store
    last = ingest_log.last_run
    # Prefer source_store counts; fall back to SmartStart store for older callers.
    if not db.list_joiners() and store.list_joiners():
        db = store
    return IntegrationsResponse(
        integrations=[
            _icims_snapshot(db),
            _servicenow_snapshot(db),
            _jira_snapshot(db),
        ],
        synthetic=True,
        as_of=AS_OF,
        ingest_last_run=last,
        smartstart_separate=True,
    )


# Re-export for callers that imported AS_OF from here
__all__ = ["build_integrations", "AS_OF"]
