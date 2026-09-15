"""Mock connectors for iCIMS / ServiceNow / Jira — all synthetic."""

from __future__ import annotations

from datetime import datetime, timezone

from backend.database import DataStore, store
from backend.models import (
    DocumentStatus,
    HardwareStatus,
    IntegrationSnapshot,
    IntegrationsResponse,
    OnboardingState,
)

AS_OF = datetime(2026, 9, 15, 12, 0, 0, tzinfo=timezone.utc)


def _icims_snapshot(db: DataStore) -> IntegrationSnapshot:
    joiners = db.list_joiners()
    docs = [db.get_documents(j.id) for j in joiners]
    pending = sum(1 for d in docs if d is not None and d.status == DocumentStatus.PENDING)
    complete = sum(1 for d in docs if d is not None and d.status == DocumentStatus.COMPLETE)
    rework = sum(1 for d in docs if d is not None and d.rework_flag)
    return IntegrationSnapshot(
        system="iCIMS",
        domain="HR",
        status="synthetic_ok",
        record_count=len(joiners),
        open_items=pending + rework,
        last_synced_at=AS_OF,
        sample_payload={
            "candidates": len(joiners),
            "packets_complete": complete,
            "packets_pending": pending,
            "rework_flags": rework,
            "note": "Mock HR connector — no live iCIMS calls",
        },
        synthetic=True,
    )


def _servicenow_snapshot(db: DataStore) -> IntegrationSnapshot:
    joiners = db.list_joiners()
    tickets = [db.get_ticket_for_joiner(j.id) for j in joiners]
    open_hw = sum(
        1
        for t in tickets
        if t is not None and t.hardware_status != HardwareStatus.DELIVERED
    )
    breaches = sum(1 for t in tickets if t is not None and t.sla_breached)
    return IntegrationSnapshot(
        system="ServiceNow",
        domain="IT",
        status="synthetic_ok",
        record_count=sum(1 for t in tickets if t is not None),
        open_items=open_hw,
        last_synced_at=AS_OF,
        sample_payload={
            "tickets": sum(1 for t in tickets if t is not None),
            "hardware_open": open_hw,
            "sla_breaches": breaches,
            "note": "Mock IT connector — no live ServiceNow calls",
        },
        synthetic=True,
    )


def _jira_snapshot(db: DataStore) -> IntegrationSnapshot:
    joiners = db.list_joiners()
    awaiting_project = sum(
        1 for j in joiners if j.current_state == OnboardingState.DAY1_ORIENTED
    )
    ready = sum(1 for j in joiners if j.current_state == OnboardingState.PROJECT_READY)
    open_tasks = sum(len(j.assigned_tasks) for j in joiners if j.current_state != OnboardingState.PROJECT_READY)
    return IntegrationSnapshot(
        system="Jira",
        domain="Manager",
        status="synthetic_ok",
        record_count=len(joiners),
        open_items=awaiting_project + open_tasks,
        last_synced_at=AS_OF,
        sample_payload={
            "learning_tracks": len({j.learning_track for j in joiners}),
            "awaiting_project_assignment": awaiting_project,
            "project_ready": ready,
            "open_onboarding_tasks": open_tasks,
            "note": "Mock Manager connector — no live Jira calls",
        },
        synthetic=True,
    )


def build_integrations(db: DataStore | None = None) -> IntegrationsResponse:
    """Return mock integration health for the three simulated systems of record."""
    db = db or store
    return IntegrationsResponse(
        integrations=[
            _icims_snapshot(db),
            _servicenow_snapshot(db),
            _jira_snapshot(db),
        ],
        synthetic=True,
        as_of=AS_OF,
    )
