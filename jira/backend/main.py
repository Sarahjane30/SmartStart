"""Standalone mock Jira app — separate from SmartStart.

Run:
  uvicorn jira.backend.main:app --reload --port 8300
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
from pydantic import BaseModel

from jira.backend.auth import login, require_mgr
from jira.backend.database import store
from jira.backend.models import LoginRequest, LoginResponse
from jira.backend.seed import seed_cohort
from jira.backend.services import (
    assigned_to_me,
    board_columns,
    complete_subtask,
    integration_status,
    transition_issue,
)

FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"
NO_CACHE = {"Cache-Control": "no-store, no-cache, must-revalidate", "Pragma": "no-cache"}
MgrSession = Annotated[dict, Depends(require_mgr)]


class TransitionBody(BaseModel):
    status: str


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    seed_cohort(n_interns=15, n_ftes=15, seed=42)
    print(f"[Jira mock] frontend: {FRONTEND_DIR.resolve()}")
    print(f"[Jira mock] issues: {len(store.list_issues())}")
    yield


app = FastAPI(
    title="Jira (Mock)",
    description=(
        "Standalone synthetic work-tracking demo. Separate from SmartStart — "
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
        "app": "jira-mock",
        "product": "Jira",
        "mode": "synthetic",
        "issues": len(store.list_issues()),
        "separate_from_smartstart": True,
    }


@app.post("/api/auth/login", response_model=LoginResponse)
def auth_login(body: LoginRequest) -> LoginResponse:
    return login(body)


@app.get("/api/auth/me")
def auth_me(session: MgrSession) -> dict:
    return {**session, "synthetic": True, "app": "jira-mock"}


@app.get("/api/for-you")
def for_you(session: MgrSession) -> dict:
    """Assigned work list grouped by status (default landing — not a Home dashboard)."""
    _ = session
    return assigned_to_me()


@app.get("/api/boards")
def boards(session: MgrSession) -> dict:
    _ = session
    rows = [b.model_dump(mode="json") for b in store.list_boards()]
    return {"total": len(rows), "boards": rows, "synthetic": True}


@app.get("/api/boards/{board_id}")
def board_detail(board_id: str, session: MgrSession) -> dict:
    _ = session
    return board_columns(board_id)


@app.get("/api/issues")
def issues(
    session: MgrSession,
    status: Optional[str] = None,
    board_id: Optional[str] = None,
    q: Optional[str] = None,
) -> dict:
    _ = session
    rows = store.list_issues()
    if status:
        rows = [i for i in rows if i.status.value == status]
    if board_id and board_id != "BOARD-ONB":
        rows = [i for i in rows if i.board_id == board_id]
    if q:
        ql = q.lower()
        rows = [
            i
            for i in rows
            if ql in i.key.lower()
            or ql in i.summary.lower()
            or ql in i.joiner_name.lower()
            or ql in i.assignee.lower()
        ]
    return {
        "total": len(rows),
        "issues": [i.model_dump(mode="json") for i in rows],
        "synthetic": True,
    }


@app.get("/api/issues/{key}")
def issue_detail(key: str, session: MgrSession) -> dict:
    _ = session
    issue = store.get_issue(key)
    if issue is None:
        raise HTTPException(status_code=404, detail="Issue not found")
    return {"issue": issue.model_dump(mode="json"), "synthetic": True}


@app.post("/api/issues/{key}/transition")
def issue_transition(key: str, body: TransitionBody, session: MgrSession) -> dict:
    _ = session
    result = transition_issue(key, body.status)
    return {
        "issue": result["issue"].model_dump(mode="json"),
        "event": result["event"].model_dump(mode="json"),
        "synthetic": True,
    }


@app.post("/api/issues/{key}/subtasks/{subtask_id}/complete")
def issue_subtask_complete(key: str, subtask_id: str, session: MgrSession) -> dict:
    _ = session
    result = complete_subtask(key, subtask_id)
    return {
        "issue": result["issue"].model_dump(mode="json"),
        "event": result["event"].model_dump(mode="json"),
        "synthetic": True,
    }


@app.get("/api/events")
def events(since: Optional[str] = Query(default=None)) -> dict:
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
        "note": "Event feed for external onboarding platforms — mock Jira remains independent.",
    }


@app.get("/api/integration/status")
def integration(session: MgrSession) -> dict:
    _ = session
    return integration_status()


@app.post("/api/admin/reseed")
def reseed(session: MgrSession, seed: int = Query(default=42)) -> dict:
    _ = session
    seed_cohort(seed=seed)
    return {
        "status": "reseeded",
        "issues": len(store.list_issues()),
        "seed": seed,
        "synthetic": True,
    }


if FRONTEND_DIR.exists():

    @app.get("/")
    def login_page() -> FileResponse:
        return FileResponse(FRONTEND_DIR / "login.html", headers=NO_CACHE)

    @app.get("/app")
    @app.get("/for-you")
    def app_shell() -> FileResponse:
        return FileResponse(FRONTEND_DIR / "app.html", headers=NO_CACHE)

    app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")
