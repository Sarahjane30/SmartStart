"""SmartStart Layers 1–4 — FastAPI synthetic onboarding + Command Center + Employee UI."""

from __future__ import annotations

from collections import Counter
from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncIterator

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from backend.chatbot import build_chatbot
from backend.predictor import build_predictions
from backend.recommender import build_recommendations
from backend.alerts import build_alerts
from backend.analytics import ANALYTICS_AS_OF, build_analytics, joiner_in_role_view
from backend.database import store
from backend.employee_experience import (
    build_employee_profile,
    build_learning_track,
    build_notifications,
    build_team_workspace,
    clear_feedback,
    list_feedback,
    submit_feedback,
)
from backend.integrations import build_integrations
from backend.models import (
    RecommendationsResponse,
    PredictResponse,
    ChatbotResponse,
    DashboardJoinerRow,
    DashboardResponse,
    DocumentStatus,
    EmployerRole,
    EmployeeProfile,
    FeedbackCreate,
    FeedbackResponse,
    Joiner,
    JoinerDetail,
    LearningTrackResponse,
    MetricsSummary,
    NotificationsResponse,
    OnboardingState,
    RoleType,
    TeamWorkspaceResponse,
)
from backend.synthetic_engine import days_in_pipeline, generate_cohort, infer_bottleneck

FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"

API_DESCRIPTION = """
SmartStart Layers 1–4 — Synthetic onboarding data engine, Employer Command Center,
and Employee Experience API.

All joiners, documents, IT tickets, alerts, analytics, learning tracks, notifications, and AI prototypes are **100% synthetic**. No real employee PII, production logs,
or live iCIMS / ServiceNow / Jira data.
"""


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    generate_cohort(n_interns=15, n_ftes=15, seed=42)
    clear_feedback()
    yield


app = FastAPI(
    title="SmartStart",
    description=API_DESCRIPTION,
    version="0.5.0",
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
    return {"status": "ok", "layer": "4", "mode": "synthetic"}


# --- Layer 1 ---------------------------------------------------------------


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
        days_in_pipeline=days_in_pipeline(joiner, now=ANALYTICS_AS_OF),
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

    pipeline_days = [days_in_pipeline(j, now=ANALYTICS_AS_OF) for j in joiners]
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
    clear_feedback()
    return {
        "status": "regenerated",
        "total_joiners": len(store.list_joiners()),
        "seed": seed,
    }


# --- Layer 2 ---------------------------------------------------------------


@app.get("/api/dashboard", response_model=DashboardResponse)
def dashboard(
    role_view: EmployerRole = Query(default=EmployerRole.ALL),
    role_type: RoleType | None = Query(default=None),
    state: OnboardingState | None = Query(default=None),
) -> DashboardResponse:
    """Employer Command Center table: joiners + states (synthetic only)."""
    rows: list[DashboardJoinerRow] = []
    for joiner in store.list_joiners():
        if role_type is not None and joiner.role_type != role_type:
            continue
        if state is not None and joiner.current_state != state:
            continue
        docs = store.get_documents(joiner.id)
        ticket = store.get_ticket_for_joiner(joiner.id)
        if docs is None or ticket is None:
            continue
        if not joiner_in_role_view(
            joiner, docs.status, ticket.hardware_status, ticket.sla_breached, role_view
        ):
            continue

        bottleneck = infer_bottleneck(joiner.current_state, docs, ticket)
        rows.append(
            DashboardJoinerRow(
                id=joiner.id,
                name=joiner.name,
                email=joiner.email,
                role_type=joiner.role_type,
                department=joiner.department,
                department_track=joiner.department_track,
                current_state=joiner.current_state,
                mentor_name=joiner.mentor_name,
                learning_track=joiner.learning_track,
                joining_date=joiner.joining_date,
                days_in_pipeline=days_in_pipeline(joiner, now=ANALYTICS_AS_OF),
                bottleneck=bottleneck,
                docs_status=docs.status,
                hardware_status=ticket.hardware_status,
                it_sla_breached=ticket.sla_breached,
                assigned_tasks=joiner.assigned_tasks,
                synthetic=True,
            )
        )

    return DashboardResponse(
        total_joiners=len(rows),
        rows=rows,
        by_state=dict(Counter(r.current_state.value for r in rows)),
        synthetic=True,
    )


@app.get("/api/alerts")
def alerts(role_view: EmployerRole = Query(default=EmployerRole.ALL)):
    """Synthetic SLA breaches + pending-task alerts."""
    payload = build_alerts()
    if role_view != EmployerRole.ALL:
        filtered = [
            a
            for a in payload.alerts
            if a.role_view in {role_view.value, EmployerRole.ALL.value, "Ops"}
        ]
        return payload.model_copy(update={"alerts": filtered, "total": len(filtered)})
    return payload


@app.get("/api/analytics")
def analytics(role_view: EmployerRole = Query(default=EmployerRole.ALL)):
    """KPIs from synthetic timestamps, scoped to an employer persona lens."""
    return build_analytics(role_view=role_view)


@app.get("/api/integrations")
def integrations():
    """Mock iCIMS / ServiceNow / Jira connector snapshots (synthetic)."""
    return build_integrations()


# --- Layer 3: Employee Experience ------------------------------------------


@app.get("/api/employee/{joiner_id}", response_model=EmployeeProfile)
def employee_profile(joiner_id: str) -> EmployeeProfile:
    """Detailed synthetic joiner profile for the employee dashboard."""
    try:
        return build_employee_profile(joiner_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Employee not found") from None


@app.get("/api/learningtrack/{joiner_id}", response_model=LearningTrackResponse)
def learning_track(joiner_id: str) -> LearningTrackResponse:
    """Role-specific synthetic learning modules (Intern vs FTE)."""
    try:
        return build_learning_track(joiner_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Learning track not found") from None


@app.get("/api/notifications/{joiner_id}", response_model=NotificationsResponse)
def notifications(joiner_id: str) -> NotificationsResponse:
    """Synthetic onboarding notifications for a joiner."""
    try:
        return build_notifications(joiner_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Notifications not found") from None


@app.post("/api/feedback", response_model=FeedbackResponse)
def feedback(payload: FeedbackCreate) -> FeedbackResponse:
    """Record synthetic onboarding-step feedback from an employee."""
    try:
        return submit_feedback(payload)
    except KeyError:
        raise HTTPException(status_code=404, detail="Employee not found") from None


@app.get("/api/feedback")
def feedback_list(joiner_id: str | None = Query(default=None)):
    """List synthetic feedback records (demo/debug)."""
    rows = list_feedback(joiner_id)
    return {"total": len(rows), "feedback": rows, "synthetic": True}


@app.get("/api/employee/{joiner_id}/workspace", response_model=TeamWorkspaceResponse)
def employee_workspace(joiner_id: str) -> TeamWorkspaceResponse:
    """Synthetic consult network, team roster, and suggested questions."""
    try:
        return build_team_workspace(joiner_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Workspace not found") from None


# --- Layer 4: Prototype AI Features ------------------------------------

@app.get("/api/chatbot/{joiner_id}", response_model=ChatbotResponse)
def chatbot(joiner_id: str, q: str | None = Query(default=None)) -> ChatbotResponse:
    """Synthetic rule-based onboarding FAQ guidance for a joiner."""
    try:
        return build_chatbot(joiner_id, query=q)
    except KeyError:
        raise HTTPException(status_code=404, detail="Chatbot context not found") from None


@app.get("/api/predict/{joiner_id}", response_model=PredictResponse)
def predict(joiner_id: str) -> PredictResponse:
    """Synthetic predictive SLA / onboarding risk scores (seed-stable)."""
    try:
        return build_predictions(joiner_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Prediction context not found") from None


@app.get("/api/recommendations/{joiner_id}", response_model=RecommendationsResponse)
def recommendations(joiner_id: str) -> RecommendationsResponse:
    """Adaptive synthetic learning recommendations by role and progress."""
    try:
        return build_recommendations(joiner_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Recommendations not found") from None


# --- Frontend static -------------------------------------------------------

if FRONTEND_DIR.exists():
    @app.get("/")
    def portal() -> FileResponse:
        return FileResponse(FRONTEND_DIR / "portal.html")

    @app.get("/employer")
    def command_center() -> FileResponse:
        return FileResponse(FRONTEND_DIR / "index.html")

    @app.get("/employee")
    def employee_experience() -> FileResponse:
        return FileResponse(FRONTEND_DIR / "employee.html")

    @app.get("/ai")
    def ai_features() -> FileResponse:
        return FileResponse(FRONTEND_DIR / "ai.html")

    app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")
