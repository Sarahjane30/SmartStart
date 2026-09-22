"""Standalone mock ServiceNow ITSM app — separate from SmartStart.

Run:
  uvicorn servicenow.backend.main:app --reload --port 8200
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import Annotated, AsyncIterator, Optional

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from servicenow.backend.auth import login, require_it
from servicenow.backend.database import store
from servicenow.backend.models import LoginRequest, LoginResponse
from servicenow.backend.seed import seed_cohort
from servicenow.backend.services import (
    build_dashboard,
    close_request,
    configure_hardware,
    deliver_hardware,
    grant_access,
    integration_status,
    order_hardware,
)

FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"
NO_CACHE = {"Cache-Control": "no-store, no-cache, must-revalidate", "Pragma": "no-cache"}
ItSession = Annotated[dict, Depends(require_it)]


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    seed_cohort(n_interns=15, n_ftes=15, seed=42)
    print(f"[ServiceNow mock] frontend: {FRONTEND_DIR.resolve()}")
    print(f"[ServiceNow mock] requests: {len(store.list_requests())}")
    yield


app = FastAPI(
    title="ServiceNow (Mock)",
    description=(
        "Standalone synthetic ITSM demo. Separate from SmartStart — "
        "expose events via REST for external ingest."
    ),
    version="1.0.0",
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
def health() -> dict:
    return {
        "status": "ok",
        "app": "servicenow-mock",
        "product": "ServiceNow",
        "mode": "synthetic",
        "requests": len(store.list_requests()),
        "separate_from_smartstart": True,
    }


@app.post("/api/auth/login", response_model=LoginResponse)
def auth_login(body: LoginRequest) -> LoginResponse:
    return login(body)


@app.get("/api/auth/me")
def auth_me(session: ItSession) -> dict:
    return {**session, "synthetic": True, "app": "servicenow-mock"}


@app.get("/api/dashboard")
def dashboard(session: ItSession) -> dict:
    _ = session
    return build_dashboard().model_dump(mode="json")


@app.get("/api/catalog")
def catalog(session: ItSession) -> dict:
    _ = session
    rows = [c.model_dump(mode="json") for c in store.list_catalog()]
    return {"total": len(rows), "catalog": rows, "synthetic": True}


@app.get("/api/requests")
def requests_list(
    session: ItSession,
    state: Optional[str] = None,
    hardware_status: Optional[str] = None,
    sla_breached: Optional[bool] = None,
    q: Optional[str] = None,
) -> dict:
    _ = session
    rows = store.list_requests()
    if state:
        rows = [r for r in rows if r.state.value == state]
    if hardware_status:
        rows = [r for r in rows if r.hardware_status.value == hardware_status]
    if sla_breached is not None:
        rows = [r for r in rows if r.sla_breached is sla_breached]
    if q:
        ql = q.lower()
        rows = [
            r
            for r in rows
            if ql in r.number.lower()
            or ql in r.requested_for.lower()
            or ql in r.short_description.lower()
        ]
    return {
        "total": len(rows),
        "requests": [r.model_dump(mode="json") for r in rows],
        "synthetic": True,
    }


@app.get("/api/requests/{number}")
def request_detail(number: str, session: ItSession) -> dict:
    _ = session
    req = store.get_request(number)
    if req is None:
        raise HTTPException(status_code=404, detail="Request not found")
    return {"request": req.model_dump(mode="json"), "synthetic": True}


@app.post("/api/requests/{number}/order")
def request_order(number: str, session: ItSession) -> dict:
    _ = session
    result = order_hardware(number)
    return _action_response(result)


@app.post("/api/requests/{number}/configure")
def request_configure(number: str, session: ItSession) -> dict:
    _ = session
    result = configure_hardware(number)
    return _action_response(result)


@app.post("/api/requests/{number}/deliver")
def request_deliver(number: str, session: ItSession) -> dict:
    _ = session
    result = deliver_hardware(number)
    return _action_response(result)


@app.post("/api/requests/{number}/grant-access")
def request_grant_access(number: str, session: ItSession) -> dict:
    _ = session
    result = grant_access(number)
    out = _action_response(result)
    if result.get("complete_event"):
        out["complete_event"] = result["complete_event"].model_dump(mode="json")
    return out


@app.post("/api/requests/{number}/close")
def request_close(number: str, session: ItSession) -> dict:
    _ = session
    result = close_request(number)
    return _action_response(result)


def _action_response(result: dict) -> dict:
    return {
        "request": result["request"].model_dump(mode="json"),
        "event": result["event"].model_dump(mode="json"),
        "synthetic": True,
    }


@app.get("/api/incidents")
def incidents(session: ItSession) -> dict:
    _ = session
    rows = [i.model_dump(mode="json") for i in store.list_incidents()]
    return {"total": len(rows), "incidents": rows, "synthetic": True}


@app.get("/api/sla")
def sla_view(session: ItSession) -> dict:
    _ = session
    breached = [r for r in store.list_requests() if r.sla_breached]
    at_risk = [
        r
        for r in store.list_requests()
        if not r.sla_breached
        and r.hardware_status.value != "Delivered"
        and r.lead_time_days >= r.sla_target_days - 1
    ]
    return {
        "breached": [r.model_dump(mode="json") for r in breached],
        "at_risk": [r.model_dump(mode="json") for r in at_risk],
        "breached_count": len(breached),
        "at_risk_count": len(at_risk),
        "synthetic": True,
    }


@app.get("/api/events")
def events(since: Optional[str] = Query(default=None)) -> dict:
    """Public event feed for external systems (e.g. SmartStart)."""
    rows = store.list_events()
    if since:
        try:
            cutoff = datetime.fromisoformat(since.replace("Z", "+00:00"))
            rows = [e for e in rows if e.created_at >= cutoff]
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Invalid since timestamp") from exc
    return {
        "total": len(rows),
        "events": [e.model_dump(mode="json") for e in rows],
        "synthetic": True,
        "note": "Event feed for external onboarding platforms — mock ServiceNow remains independent.",
    }


@app.get("/api/integration/status")
def integration(session: ItSession) -> dict:
    _ = session
    return integration_status()


@app.post("/api/admin/reseed")
def reseed(session: ItSession, seed: int = Query(default=42)) -> dict:
    _ = session
    seed_cohort(seed=seed)
    return {
        "status": "reseeded",
        "requests": len(store.list_requests()),
        "seed": seed,
        "synthetic": True,
    }


if FRONTEND_DIR.exists():

    @app.get("/")
    def login_page() -> FileResponse:
        return FileResponse(FRONTEND_DIR / "login.html", headers=NO_CACHE)

    @app.get("/dashboard")
    @app.get("/app")
    def app_shell() -> FileResponse:
        return FileResponse(FRONTEND_DIR / "app.html", headers=NO_CACHE)

    app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")
