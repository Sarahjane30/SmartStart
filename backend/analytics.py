"""Layer 2 analytics — KPIs computed from synthetic onboarding timestamps."""

from __future__ import annotations

from collections import Counter
from datetime import datetime, timezone

from backend.database import DataStore, store
from backend.models import (
    DocumentStatus,
    OnboardingState,
    AnalyticsResponse,
    TimeSeriesPoint,
)
from backend.synthetic_engine import days_in_pipeline, infer_bottleneck

# Seed-stable demo "as of" clock (matches synthetic_engine reference day + offset).
ANALYTICS_AS_OF = datetime(2026, 9, 15, 12, 0, 0, tzinfo=timezone.utc)


def build_analytics(db: DataStore | None = None) -> AnalyticsResponse:
    """Compute employer KPIs from the in-memory synthetic cohort."""
    db = db or store
    joiners = db.list_joiners()
    if not joiners:
        return AnalyticsResponse(
            avg_onboarding_days=0.0,
            avg_it_lead_time_days=0.0,
            completion_rate_pct=0.0,
            active_joiners=0,
            project_ready_count=0,
            bottleneck_counts={},
            avg_days_by_state={},
            onboarding_trend=[],
            synthetic=True,
        )

    pipeline_days = [days_in_pipeline(j, now=ANALYTICS_AS_OF) for j in joiners]
    tickets = [db.get_ticket_for_joiner(j.id) for j in joiners]
    docs = [db.get_documents(j.id) for j in joiners]

    lead_times = [t.lead_time_days for t in tickets if t is not None]
    ready = sum(1 for j in joiners if j.current_state == OnboardingState.PROJECT_READY)
    active = len(joiners) - ready

    bottlenecks: Counter[str] = Counter()
    days_by_state: dict[str, list[int]] = {}
    for j, d, t, days in zip(joiners, docs, tickets, pipeline_days, strict=True):
        days_by_state.setdefault(j.current_state.value, []).append(days)
        if d is None or t is None:
            continue
        label = infer_bottleneck(j.current_state, d, t)
        bottlenecks[label or "On track"] += 1

    avg_days_by_state = {
        state: round(sum(vals) / len(vals), 2)
        for state, vals in sorted(days_by_state.items())
    }

    # Synthetic weekly trend of average pipeline days (seed-stable from cohort).
    trend: list[TimeSeriesPoint] = []
    for week in range(1, 7):
        # Weighted blend so the chart looks realistic but deterministic.
        base = sum(pipeline_days) / len(pipeline_days)
        wobble = ((week * 7) % 5) - 2
        trend.append(
            TimeSeriesPoint(
                label=f"W{week}",
                value=round(max(3.0, base + wobble - (6 - week) * 0.35), 2),
            )
        )

    docs_pending = sum(
        1 for d in docs if d is not None and d.status == DocumentStatus.PENDING
    )

    return AnalyticsResponse(
        avg_onboarding_days=round(sum(pipeline_days) / len(pipeline_days), 2),
        avg_it_lead_time_days=round(sum(lead_times) / max(len(lead_times), 1), 2),
        completion_rate_pct=round(100.0 * ready / len(joiners), 1),
        active_joiners=active,
        project_ready_count=ready,
        docs_pending=docs_pending,
        bottleneck_counts=dict(bottlenecks),
        avg_days_by_state=avg_days_by_state,
        onboarding_trend=trend,
        synthetic=True,
        as_of=ANALYTICS_AS_OF,
    )
