"""SmartStart data ingestion — pull mock iCIMS / ServiceNow / Jira into the product store."""

from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
from typing import Any

from backend.database import DataStore, ingest_log, source_store, store
from backend.models import (
    DocumentStatus,
    HardwareStatus,
    IngestRunResponse,
    OnboardingState,
)

AS_OF = datetime(2026, 9, 15, 12, 0, 0, tzinfo=timezone.utc)


def _icims_native_id(joiner_id: str) -> str:
    """Map SYN-J-0042-001 → ICIMS-CAND-0042001."""
    digits = "".join(ch for ch in joiner_id if ch.isdigit()) or "0"
    return f"ICIMS-CAND-{digits}"


def _snow_native_id(ticket_id: str) -> str:
    digits = "".join(ch for ch in ticket_id if ch.isdigit()) or "0"
    return f"RITM{digits.zfill(7)[-7:]}"


def _jira_native_key(joiner_id: str) -> str:
    digits = "".join(ch for ch in joiner_id if ch.isdigit()) or "0"
    return f"ONB-{int(digits) % 10000}"


def list_icims_candidates(db: DataStore | None = None) -> list[dict[str, Any]]:
    """Native-shaped mock iCIMS candidate + offer packet rows."""
    db = db or source_store
    rows: list[dict[str, Any]] = []
    for joiner in db.list_joiners():
        docs = db.get_documents(joiner.id)
        if docs is None:
            continue
        packet = "Complete" if docs.status == DocumentStatus.COMPLETE else "Pending review"
        if docs.rework_flag:
            packet = "Rework required"
        rows.append(
            {
                "candidate_id": _icims_native_id(joiner.id),
                "smartstart_joiner_id": joiner.id,
                "full_name": joiner.name,
                "email": joiner.email,
                "requisition": f"REQ-{joiner.department[:3].upper()}-{joiner.role_type.value}",
                "job_title": f"{joiner.role_type.value} — {joiner.department}",
                "offer_status": "Accepted",
                "offer_accepted_at": joiner.offer_accepted_at.isoformat(),
                "start_date": joiner.joining_date.isoformat(),
                "hiring_manager": joiner.manager_name,
                "packet_status": packet,
                "forms_expected": docs.form_count,
                "waiting_days": docs.waiting_days,
                "rework_flag": docs.rework_flag,
                "source_system": "iCIMS",
                "synthetic": True,
            }
        )
    return rows


def list_servicenow_tickets(db: DataStore | None = None) -> list[dict[str, Any]]:
    """Native-shaped mock ServiceNow RITM / hardware provisioning tickets."""
    db = db or source_store
    rows: list[dict[str, Any]] = []
    for joiner in db.list_joiners():
        ticket = db.get_ticket_for_joiner(joiner.id)
        if ticket is None:
            continue
        state = {
            HardwareStatus.PENDING: "1 - New",
            HardwareStatus.CONFIGURED: "2 - Work in Progress",
            HardwareStatus.DELIVERED: "3 - Closed Complete",
        }.get(ticket.hardware_status, "1 - New")
        rows.append(
            {
                "number": _snow_native_id(ticket.ticket_id),
                "smartstart_ticket_id": ticket.ticket_id,
                "smartstart_joiner_id": joiner.id,
                "short_description": f"New hire laptop + access — {joiner.name}",
                "requested_for": joiner.name,
                "requested_for_email": joiner.email,
                "assignment_group": "IT Onboarding",
                "hardware_status": ticket.hardware_status.value,
                "state": state,
                "software_access": list(ticket.software_access),
                "sla_target_days": ticket.sla_target_days,
                "lead_time_days": ticket.lead_time_days,
                "sla_breached": ticket.sla_breached,
                "opened_at": ticket.created_at.isoformat(),
                "updated_at": ticket.updated_at.isoformat(),
                "source_system": "ServiceNow",
                "synthetic": True,
            }
        )
    return rows


def list_jira_issues(db: DataStore | None = None) -> list[dict[str, Any]]:
    """Native-shaped mock Jira onboarding issues (mentor / learning / tasks)."""
    db = db or source_store
    rows: list[dict[str, Any]] = []
    for joiner in db.list_joiners():
        if joiner.current_state == OnboardingState.PROJECT_READY:
            status = "Done"
        elif joiner.current_state == OnboardingState.DAY1_ORIENTED:
            status = "In Progress"
        elif joiner.current_state in {
            OnboardingState.IT_PROVISIONED,
            OnboardingState.DOCS_SUBMITTED,
        }:
            status = "To Do"
        else:
            status = "Backlog"
        rows.append(
            {
                "key": _jira_native_key(joiner.id),
                "smartstart_joiner_id": joiner.id,
                "summary": f"Onboard {joiner.name} — {joiner.learning_track}",
                "issue_type": "Onboarding",
                "status": status,
                "assignee": joiner.mentor_name,
                "reporter": joiner.manager_name,
                "project": "ONB",
                "learning_track": joiner.learning_track,
                "department": joiner.department,
                "role_type": joiner.role_type.value,
                "pipeline_state": joiner.current_state.value,
                "subtasks": list(joiner.assigned_tasks),
                "labels": ["synthetic", joiner.role_type.value.lower(), "smartstart-feed"],
                "source_system": "Jira",
                "synthetic": True,
            }
        )
    return rows


def source_system_summary(db: DataStore | None = None) -> dict[str, Any]:
    """Counts for the three mock systems of record."""
    db = db or source_store
    icims = list_icims_candidates(db)
    snow = list_servicenow_tickets(db)
    jira = list_jira_issues(db)
    return {
        "icims": {
            "system": "iCIMS",
            "domain": "HR / ATS",
            "record_count": len(icims),
            "open_items": sum(
                1 for r in icims if r["packet_status"] != "Complete"
            ),
            "endpoint": "/sources/icims",
        },
        "servicenow": {
            "system": "ServiceNow",
            "domain": "IT / ITSM",
            "record_count": len(snow),
            "open_items": sum(
                1 for r in snow if r["hardware_status"] != HardwareStatus.DELIVERED.value
            ),
            "endpoint": "/sources/servicenow",
        },
        "jira": {
            "system": "Jira",
            "domain": "Manager / Work",
            "record_count": len(jira),
            "open_items": sum(1 for r in jira if r["status"] != "Done"),
            "endpoint": "/sources/jira",
        },
        "synthetic": True,
        "as_of": AS_OF.isoformat(),
        "note": "Separate mock systems of record — SmartStart ingests from these, it is not the source.",
    }


def run_ingest(
    *,
    clear_first: bool = True,
    db_source: DataStore | None = None,
    db_target: DataStore | None = None,
) -> IngestRunResponse:
    """Pull systems-of-record data into SmartStart's operational store."""
    src = db_source or source_store
    dst = db_target or store
    started = datetime.now(timezone.utc)

    icims_n = len(list_icims_candidates(src))
    snow_n = len(list_servicenow_tickets(src))
    jira_n = len(list_jira_issues(src))

    if clear_first:
        dst.clear()
    upserted = dst.copy_from(src)

    finished = datetime.now(timezone.utc)
    payload = {
        "status": "ok",
        "started_at": started.isoformat(),
        "finished_at": finished.isoformat(),
        "duration_ms": int((finished - started).total_seconds() * 1000),
        "sources": {
            "iCIMS": {"records_pulled": icims_n, "domain": "HR"},
            "ServiceNow": {"records_pulled": snow_n, "domain": "IT"},
            "Jira": {"records_pulled": jira_n, "domain": "Manager"},
        },
        "joiners_upserted": upserted,
        "smartstart_total": len(dst.list_joiners()),
        "cleared_before_load": clear_first,
        "synthetic": True,
        "message": (
            "Ingested mock iCIMS candidates, ServiceNow tickets, and Jira issues "
            "into SmartStart. Source systems remain unchanged."
        ),
    }
    # Only log against the global stores (demo UI history).
    if db_target is None and db_source is None:
        ingest_log.record(deepcopy(payload))

    return IngestRunResponse(**payload)


def ingest_status() -> dict[str, Any]:
    """Current SmartStart vs source counts + last ingest run."""
    summary = source_system_summary()
    last = ingest_log.last_run
    return {
        "smartstart": {
            "product": "SmartStart",
            "joiner_count": len(store.list_joiners()),
            "document_packets": len(store.documents),
            "it_tickets": len(store.it_tickets),
            "endpoint": "/ingest",
            "note": "Orchestration layer — not a system of record.",
        },
        "sources": summary,
        "last_run": last,
        "history": list(ingest_log.history[:5]),
        "synthetic": True,
        "as_of": AS_OF.isoformat(),
    }


def bootstrap_sources_and_ingest(
    n_interns: int = 15,
    n_ftes: int = 15,
    seed: int = 42,
) -> dict[str, Any]:
    """Regenerate mock source systems, then ingest into SmartStart."""
    from backend.synthetic_engine import generate_cohort

    generate_cohort(n_interns=n_interns, n_ftes=n_ftes, seed=seed, target_store=source_store)
    result = run_ingest(clear_first=True)
    return {
        "status": "bootstrapped",
        "seed": seed,
        "source_joiners": len(source_store.list_joiners()),
        "smartstart_joiners": len(store.list_joiners()),
        "ingest": result.model_dump(mode="json"),
    }
