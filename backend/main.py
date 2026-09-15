"""SmartStart Layer 1 — FastAPI synthetic onboarding backend."""

from __future__ import annotations

from collections import Counter
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from backend.database import store
from backend.models import (
    DocumentStatus,
    Joiner,
    JoinerDetail,
    MetricsSummary,
    OnboardingState,
    RoleType,
)
from backend.synthetic_engine import days_in_pipeline, generate_cohort, infer_bottleneck

API_DESCRIPTION = """
SmartStart Layer 1 — Synthetic Data & State Engine.

All joiners, documents, and IT tickets are **100% synthetic**.
No real employee PII, production logs, or live iCIMS / ServiceNow / Jira data.
"""


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    generate_cohort(n_interns=15, n_ftes=15, seed=42)
    yield


app = FastAPI(
    title="SmartStart Layer 1",
    description=API_DESCRIPTION,
    version="0.2.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "layer": "1", "mode": "synthetic"}


@app.get("/api/joiners", response_model=list[Joiner])
def list_joiners(
    role_type: RoleType | None = Query(default=None),
    state: OnboardingState | None = Query(default=None),
) -> list[Joiner]:
    rows = store.list_joiners()
    if role_type is not None:
        rows = [j for j in rows if j.role_type == role_type]
    if state is not None:
        rows = [j for j in rows if j.current_state == state]
    return rows


@app.get("/api/joiners/{joiner_id}", response_model=JoinerDetail)
def get_joiner(joiner_id: str) -> JoinerDetail:
    joiner = store.get_joiner(joiner_id)
    if joiner is None:
        raise HTTPException(status_code=404, detail="Joiner not found")
    documents = store.get_documents(joiner_id)
    ticket = store.get_ticket_for_joiner(joiner_id)
    if documents is None or ticket is None:
        raise HTTPException(status_code=500, detail="Incomplete synthetic bundle")
    return JoinerDetail(
        joiner=joiner,
        documents=documents,
        it_ticket=ticket,
        days_in_pipeline=days_in_pipeline(joiner),
        bottleneck=infer_bottleneck(joiner.current_state, documents, ticket),
    )


@app.get("/api/metrics/summary", response_model=MetricsSummary)
def metrics_summary() -> MetricsSummary:
    joiners = store.list_joiners()
    if not joiners:
        return MetricsSummary(
            total_joiners=0,
            by_role_type={},
            by_state={},
            by_department_track={},
            avg_pipeline_days=0.0,
            avg_it_lead_time_days=0.0,
            docs_pending=0,
            docs_rework=0,
            it_sla_breaches=0,
            bottleneck_counts={},
        )

    pipeline_days = [days_in_pipeline(j) for j in joiners]
    tickets = [store.get_ticket_for_joiner(j.id) for j in joiners]
    docs = [store.get_documents(j.id) for j in joiners]

    lead_times = [t.lead_time_days for t in tickets if t is not None]
    sla_breaches = sum(1 for t in tickets if t is not None and t.sla_breached)
    docs_pending = sum(
        1 for d in docs if d is not None and d.status == DocumentStatus.PENDING
    )
    docs_rework = sum(1 for d in docs if d is not None and d.rework_flag)

    bottlenecks: Counter[str] = Counter()
    for j, d, t in zip(joiners, docs, tickets, strict=True):
        if d is None or t is None:
            continue
        label = infer_bottleneck(j.current_state, d, t)
        bottlenecks[label or "None"] += 1

    return MetricsSummary(
        total_joiners=len(joiners),
        by_role_type=dict(Counter(j.role_type.value for j in joiners)),
        by_state=dict(Counter(j.current_state.value for j in joiners)),
        by_department_track=dict(Counter(j.department_track.value for j in joiners)),
        avg_pipeline_days=round(sum(pipeline_days) / len(pipeline_days), 2),
        avg_it_lead_time_days=round(sum(lead_times) / max(len(lead_times), 1), 2),
        docs_pending=docs_pending,
        docs_rework=docs_rework,
        it_sla_breaches=sla_breaches,
        bottleneck_counts=dict(bottlenecks),
    )


@app.post("/api/admin/regenerate")
def regenerate(
    seed: int = Query(default=42, ge=0),
    n_interns: int = Query(default=15, ge=0, le=100),
    n_ftes: int = Query(default=15, ge=0, le=100),
) -> dict[str, int | str]:
    """Rebuild the in-memory synthetic cohort (dev/demo only)."""
    generate_cohort(n_interns=n_interns, n_ftes=n_ftes, seed=seed)
    return {
        "status": "regenerated",
        "total_joiners": len(store.list_joiners()),
        "seed": seed,
    }
