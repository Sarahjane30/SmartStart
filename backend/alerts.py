"""Layer 2 alerts — synthetic SLA / pending-task notifications."""

from __future__ import annotations

from datetime import datetime, timezone

from backend.database import DataStore, store
from backend.models import (
    Alert,
    AlertSeverity,
    AlertsResponse,
    DocumentStatus,
    HardwareStatus,
    OnboardingState,
)
from backend.synthetic_engine import days_in_pipeline, infer_bottleneck

ALERTS_AS_OF = datetime(2026, 9, 15, 12, 0, 0, tzinfo=timezone.utc)


def build_alerts(db: DataStore | None = None) -> AlertsResponse:
    """Generate synthetic employer alerts from cohort state."""
    db = db or store
    joiners = db.list_joiners()
    alerts: list[Alert] = []

    sla_joiners: list[str] = []
    docs_pending_joiners: list[str] = []
    rework_joiners: list[str] = []
    stalled_joiners: list[str] = []
    orientation_joiners: list[str] = []
    project_joiners: list[str] = []

    for joiner in joiners:
        docs = db.get_documents(joiner.id)
        ticket = db.get_ticket_for_joiner(joiner.id)
        if docs is None or ticket is None:
            continue

        if ticket.sla_breached and ticket.hardware_status != HardwareStatus.DELIVERED:
            sla_joiners.append(joiner.name)
        if docs.status == DocumentStatus.PENDING:
            docs_pending_joiners.append(joiner.name)
        if docs.rework_flag:
            rework_joiners.append(joiner.name)

        days = days_in_pipeline(joiner, now=ALERTS_AS_OF)
        bottleneck = infer_bottleneck(joiner.current_state, docs, ticket)
        if days >= 10 and joiner.current_state != OnboardingState.PROJECT_READY:
            stalled_joiners.append(joiner.name)
        if joiner.current_state == OnboardingState.IT_PROVISIONED:
            orientation_joiners.append(joiner.name)
        if joiner.current_state == OnboardingState.DAY1_ORIENTED:
            project_joiners.append(joiner.name)

        # Per-joiner high-signal alerts (cap noise).
        if ticket.sla_breached and ticket.hardware_status != HardwareStatus.DELIVERED:
            alerts.append(
                Alert(
                    id=f"ALT-IT-{joiner.id}",
                    severity=AlertSeverity.HIGH,
                    category="IT",
                    title="Laptop provisioning SLA breached",
                    message=(
                        f"ServiceNow ticket {ticket.ticket_id} for {joiner.name} "
                        f"is at {ticket.lead_time_days}d (target {ticket.sla_target_days}d)."
                    ),
                    joiner_id=joiner.id,
                    joiner_name=joiner.name,
                    role_view="IT",
                    created_at=ALERTS_AS_OF,
                    synthetic=True,
                )
            )
        elif docs.status == DocumentStatus.PENDING and days >= 3:
            alerts.append(
                Alert(
                    id=f"ALT-HR-{joiner.id}",
                    severity=AlertSeverity.MEDIUM,
                    category="HR",
                    title="Onboarding documents still pending",
                    message=(
                        f"{joiner.name} has pending iCIMS packet "
                        f"({docs.form_count} forms) for {docs.waiting_days} waiting day(s)."
                    ),
                    joiner_id=joiner.id,
                    joiner_name=joiner.name,
                    role_view="HR",
                    created_at=ALERTS_AS_OF,
                    synthetic=True,
                )
            )
        elif bottleneck == "Awaiting project assignment (Jira)":
            alerts.append(
                Alert(
                    id=f"ALT-MGR-{joiner.id}",
                    severity=AlertSeverity.LOW,
                    category="Manager",
                    title="Project assignment pending",
                    message=(
                        f"{joiner.name} completed Day-1 orientation; "
                        f"Jira onboarding tasks still need a project assignment."
                    ),
                    joiner_id=joiner.id,
                    joiner_name=joiner.name,
                    role_view="Manager",
                    created_at=ALERTS_AS_OF,
                    synthetic=True,
                )
            )

    # Aggregate rollup alerts for the command-center banner.
    if sla_joiners:
        alerts.insert(
            0,
            Alert(
                id="ALT-ROLLUP-IT-SLA",
                severity=AlertSeverity.CRITICAL,
                category="IT",
                title="Laptop provisioning delayed",
                message=(
                    f"Laptop provisioning delayed for {len(sla_joiners)} joiner(s): "
                    + ", ".join(sla_joiners[:5])
                    + ("…" if len(sla_joiners) > 5 else "")
                ),
                joiner_id=None,
                joiner_name=None,
                role_view="IT",
                created_at=ALERTS_AS_OF,
                synthetic=True,
            ),
        )
    if docs_pending_joiners:
        alerts.insert(
            0 if not sla_joiners else 1,
            Alert(
                id="ALT-ROLLUP-HR-DOCS",
                severity=AlertSeverity.HIGH,
                category="HR",
                title="Document packets outstanding",
                message=(
                    f"{len(docs_pending_joiners)} joiner(s) still have pending "
                    f"iCIMS document packets."
                ),
                joiner_id=None,
                joiner_name=None,
                role_view="HR",
                created_at=ALERTS_AS_OF,
                synthetic=True,
            ),
        )
    if rework_joiners:
        alerts.append(
            Alert(
                id="ALT-ROLLUP-HR-REWORK",
                severity=AlertSeverity.MEDIUM,
                category="HR",
                title="Document rework loop",
                message=(
                    f"{len(rework_joiners)} joiner(s) flagged for document rework."
                ),
                joiner_id=None,
                joiner_name=None,
                role_view="HR",
                created_at=ALERTS_AS_OF,
                synthetic=True,
            )
        )
    if orientation_joiners:
        alerts.append(
            Alert(
                id="ALT-ROLLUP-HR-DAY1",
                severity=AlertSeverity.LOW,
                category="HR",
                title="Day-1 orientation backlog",
                message=(
                    f"{len(orientation_joiners)} joiner(s) are IT-provisioned and "
                    f"awaiting Day-1 orientation."
                ),
                joiner_id=None,
                joiner_name=None,
                role_view="HR",
                created_at=ALERTS_AS_OF,
                synthetic=True,
            )
        )
    if project_joiners:
        alerts.append(
            Alert(
                id="ALT-ROLLUP-MGR-PROJECT",
                severity=AlertSeverity.MEDIUM,
                category="Manager",
                title="Project-ready handoff waiting",
                message=(
                    f"{len(project_joiners)} joiner(s) finished orientation and need "
                    f"manager project assignment in Jira."
                ),
                joiner_id=None,
                joiner_name=None,
                role_view="Manager",
                created_at=ALERTS_AS_OF,
                synthetic=True,
            )
        )
    if stalled_joiners:
        alerts.append(
            Alert(
                id="ALT-ROLLUP-STALLED",
                severity=AlertSeverity.HIGH,
                category="Ops",
                title="Onboarding pipeline stall",
                message=(
                    f"{len(stalled_joiners)} joiner(s) have been in pipeline ≥10 days "
                    f"without reaching PROJECT_READY."
                ),
                joiner_id=None,
                joiner_name=None,
                role_view="All",
                created_at=ALERTS_AS_OF,
                synthetic=True,
            )
        )

    # Stable ordering: severity then id.
    severity_rank = {
        AlertSeverity.CRITICAL: 0,
        AlertSeverity.HIGH: 1,
        AlertSeverity.MEDIUM: 2,
        AlertSeverity.LOW: 3,
    }
    alerts.sort(key=lambda a: (severity_rank[a.severity], a.id))

    return AlertsResponse(
        total=len(alerts),
        alerts=alerts,
        synthetic=True,
        as_of=ALERTS_AS_OF,
    )
