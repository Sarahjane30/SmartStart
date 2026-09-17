"""Layer 2 analytics — KPIs computed from synthetic onboarding timestamps."""

from __future__ import annotations

from collections import Counter
from datetime import datetime, timezone

from backend.database import DataStore, store
from backend.models import (
    AnalyticsResponse,
    DocumentStatus,
    EmployerRole,
    HardwareStatus,
    Joiner,
    OnboardingState,
    TimeSeriesPoint,
)
from backend.synthetic_engine import days_in_pipeline, infer_bottleneck

# Seed-stable demo "as of" clock (matches synthetic_engine reference day + offset).
ANALYTICS_AS_OF = datetime(2026, 9, 15, 12, 0, 0, tzinfo=timezone.utc)

ROLE_FOCUS = {
    EmployerRole.ALL: "Full cohort — every synthetic joiner",
    EmployerRole.HR: "HR lens — docs pending / early pipeline handoff",
    EmployerRole.IT: "IT lens — hardware not delivered or SLA pressure",
    EmployerRole.MANAGER: "Manager lens — Day-1 / project readiness (hiring managers split the cohort)",
}


def joiner_in_role_view(
    joiner: Joiner,
    docs_status: DocumentStatus | None,
    hardware_status: HardwareStatus | None,
    it_sla_breached: bool,
    role_view: EmployerRole,
) -> bool:
    """Same employer-persona lenses used by the Command Center table."""
    if role_view == EmployerRole.ALL:
        return True
    if role_view == EmployerRole.HR:
        return docs_status != DocumentStatus.COMPLETE or joiner.current_state in {
            OnboardingState.OFFER_ACCEPTED,
            OnboardingState.DOCS_SUBMITTED,
            OnboardingState.IT_PROVISIONED,
        }
    if role_view == EmployerRole.IT:
        return (
            it_sla_breached
            or hardware_status != HardwareStatus.DELIVERED
            or joiner.current_state == OnboardingState.DOCS_SUBMITTED
        )
    # Manager = hiring-manager queue for late-stage joiners (each still has their own mentor)
    return joiner.current_state in {
        OnboardingState.DAY1_ORIENTED,
        OnboardingState.PROJECT_READY,
    }


def focus_note_for(role_view: EmployerRole, manager_id: str | None = None) -> str:
    base = ROLE_FOCUS[role_view]
    if manager_id:
        return f"{base} · scoped to hiring manager {manager_id}"
    return base


def build_analytics(
    db: DataStore | None = None,
    role_view: EmployerRole = EmployerRole.ALL,
    manager_id: str | None = None,
) -> AnalyticsResponse:
    """Compute employer KPIs for the selected role lens (optionally one hiring manager)."""
    db = db or store
    all_joiners = db.list_joiners()
    note = focus_note_for(role_view, manager_id)
    if not all_joiners:
        return AnalyticsResponse(
            avg_onboarding_days=0.0,
            avg_it_lead_time_days=0.0,
            completion_rate_pct=0.0,
            active_joiners=0,
            project_ready_count=0,
            bottleneck_counts={},
            avg_days_by_state={},
            onboarding_trend=[],
            role_view=role_view.value,
            cohort_size=0,
            focus_note=note,
            synthetic=True,
        )

    joiners: list[Joiner] = []
    for j in all_joiners:
        if manager_id and j.manager_id != manager_id:
            continue
        docs = db.get_documents(j.id)
        ticket = db.get_ticket_for_joiner(j.id)
        if docs is None or ticket is None:
            continue
        if joiner_in_role_view(
            j, docs.status, ticket.hardware_status, ticket.sla_breached, role_view
        ):
            joiners.append(j)

    if not joiners:
        return AnalyticsResponse(
            avg_onboarding_days=0.0,
            avg_it_lead_time_days=0.0,
            completion_rate_pct=0.0,
            active_joiners=0,
            project_ready_count=0,
            docs_pending=0,
            bottleneck_counts={},
            avg_days_by_state={},
            onboarding_trend=[],
            role_view=role_view.value,
            cohort_size=0,
            focus_note=note + " — no joiners match this lens right now.",
            synthetic=True,
            as_of=ANALYTICS_AS_OF,
        )

    pipeline_days = [days_in_pipeline(j, now=ANALYTICS_AS_OF) for j in joiners]
    tickets = [db.get_ticket_for_joiner(j.id) for j in joiners]
    docs = [db.get_documents(j.id) for j in joiners]

    lead_times = [t.lead_time_days for t in tickets if t is not None]
    ready = sum(1 for j in joiners if j.current_state == OnboardingState.PROJECT_READY)
    active = len(joiners) - ready

    bottlenecks: Counter[str] = Counter()
    days_by_state: dict[str, list[int]] = {}
    state_counts: Counter[str] = Counter()
    for j, d, t, days in zip(joiners, docs, tickets, pipeline_days, strict=True):
        state_counts[j.current_state.value] += 1
        days_by_state.setdefault(j.current_state.value, []).append(days)
        if d is None or t is None:
            continue
        label = infer_bottleneck(j.current_state, d, t)
        bottlenecks[label or "On track"] += 1

    avg_days_by_state = {
        state: round(sum(vals) / len(vals), 2)
        for state, vals in sorted(days_by_state.items())
    }

    # Real cohort distribution by state (not a fake weekly wobble).
    stage_order = [s.value for s in OnboardingState]
    trend = [
        TimeSeriesPoint(label=s.replace("_", " "), value=float(state_counts.get(s, 0)))
        for s in stage_order
        if state_counts.get(s, 0) or role_view == EmployerRole.ALL
    ]
    if not trend:
        trend = [
            TimeSeriesPoint(label=s.replace("_", " "), value=float(state_counts.get(s, 0)))
            for s in stage_order
        ]

    docs_pending = sum(
        1 for d in docs if d is not None and d.status == DocumentStatus.PENDING
    )
    sla_breaches = sum(1 for t in tickets if t is not None and t.sla_breached)

    return AnalyticsResponse(
        avg_onboarding_days=round(sum(pipeline_days) / len(pipeline_days), 2),
        avg_it_lead_time_days=round(sum(lead_times) / max(len(lead_times), 1), 2),
        completion_rate_pct=round(100.0 * ready / len(joiners), 1),
        active_joiners=active,
        project_ready_count=ready,
        docs_pending=docs_pending,
        sla_breaches=sla_breaches,
        bottleneck_counts=dict(bottlenecks),
        avg_days_by_state=avg_days_by_state,
        onboarding_trend=trend,
        role_view=role_view.value,
        cohort_size=len(joiners),
        focus_note=note,
        synthetic=True,
        as_of=ANALYTICS_AS_OF,
    )
