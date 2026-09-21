"""Standalone mock iCIMS Talent Acquisition app — separate from SmartStart.

Run:
  uvicorn icims.backend.main:app --reload --port 8100
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

from icims.backend.auth import login, require_hr
from icims.backend.database import store
from icims.backend.models import LoginRequest, LoginResponse
from icims.backend.seed import seed_cohort
from icims.backend.services import (
    accept_offer,
    build_dashboard,
    decline_offer,
    integration_status,
    mark_hr_ready,
    send_offer,
    verify_document,
)

FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"
NO_CACHE = {"Cache-Control": "no-store, no-cache, must-revalidate", "Pragma": "no-cache"}
HrSession = Annotated[dict, Depends(require_hr)]


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    seed_cohort(n_interns=15, n_ftes=15, seed=42)
    print(f"[iCIMS mock] frontend: {FRONTEND_DIR.resolve()}")
    print(f"[iCIMS mock] candidates: {len(store.list_candidates())}")
    yield


app = FastAPI(
    title="iCIMS (Mock)",
    description=(
        "Standalone synthetic Talent Acquisition demo. "
        "Separate from SmartStart — expose events via REST for external ingest."
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
        "app": "icims-mock",
        "product": "iCIMS",
        "mode": "synthetic",
        "candidates": len(store.list_candidates()),
        "separate_from_smartstart": True,
    }


@app.post("/api/auth/login", response_model=LoginResponse)
def auth_login(body: LoginRequest) -> LoginResponse:
    return login(body)


@app.get("/api/auth/me")
def auth_me(session: HrSession) -> dict:
    return {**session, "synthetic": True, "app": "icims-mock"}


@app.get("/api/dashboard")
def dashboard(session: HrSession) -> dict:
    _ = session
    return build_dashboard().model_dump(mode="json")


@app.get("/api/requisitions")
def requisitions(session: HrSession) -> dict:
    _ = session
    rows = [r.model_dump(mode="json") for r in store.list_requisitions()]
    return {"total": len(rows), "requisitions": rows, "synthetic": True}


@app.get("/api/requisitions/{requisition_id}")
def requisition_detail(requisition_id: str, session: HrSession) -> dict:
    _ = session
    req = store.requisitions.get(requisition_id)
    if req is None:
        raise HTTPException(status_code=404, detail="Requisition not found")
    cands = [
        c.model_dump(mode="json")
        for c in store.list_candidates()
        if c.requisition_id == requisition_id
    ]
    return {"requisition": req.model_dump(mode="json"), "candidates": cands, "synthetic": True}


@app.get("/api/candidates")
def candidates(
    session: HrSession,
    department: Optional[str] = None,
    position: Optional[str] = None,
    manager: Optional[str] = None,
    candidate_type: Optional[str] = None,
    stage: Optional[str] = None,
    q: Optional[str] = None,
) -> dict:
    _ = session
    rows = store.list_candidates()
    if department:
        rows = [c for c in rows if c.department == department]
    if position:
        rows = [c for c in rows if c.position == position]
    if manager:
        rows = [c for c in rows if c.hiring_manager == manager]
    if candidate_type:
        rows = [c for c in rows if c.candidate_type.value == candidate_type]
    if stage:
        rows = [c for c in rows if c.stage.value == stage]
    if q:
        ql = q.lower()
        rows = [
            c
            for c in rows
            if ql in c.name.lower() or ql in c.id.lower() or ql in c.email.lower()
        ]
    return {
        "total": len(rows),
        "candidates": [c.model_dump(mode="json") for c in rows],
        "synthetic": True,
    }


@app.get("/api/candidates/{candidate_id}")
def candidate_detail(candidate_id: str, session: HrSession) -> dict:
    _ = session
    cand = store.get_candidate(candidate_id)
    if cand is None:
        raise HTTPException(status_code=404, detail="Candidate not found")
    offer = next(
        (o for o in store.list_offers() if o.candidate_id == candidate_id),
        None,
    )
    return {
        "candidate": cand.model_dump(mode="json"),
        "offer": offer.model_dump(mode="json") if offer else None,
        "synthetic": True,
    }


@app.get("/api/interviews")
def interviews(session: HrSession) -> dict:
    _ = session
    rows = []
    for c in store.list_candidates():
        for i in c.interviews:
            rows.append(
                {
                    **i.model_dump(mode="json"),
                    "candidate_name": c.name,
                    "position": c.position,
                }
            )
    rows.sort(key=lambda r: r["scheduled_at"], reverse=True)
    return {"total": len(rows), "interviews": rows, "synthetic": True}


@app.get("/api/offers")
def offers(session: HrSession) -> dict:
    _ = session
    rows = [o.model_dump(mode="json") for o in store.list_offers()]
    return {"total": len(rows), "offers": rows, "synthetic": True}


@app.post("/api/offers/{offer_id}/send")
def offer_send(offer_id: str, session: HrSession) -> dict:
    _ = session
    result = send_offer(offer_id)
    return {
        "offer": result["offer"].model_dump(mode="json"),
        "event": result["event"].model_dump(mode="json"),
        "synthetic": True,
    }


@app.post("/api/offers/{offer_id}/accept")
def offer_accept(offer_id: str, session: HrSession) -> dict:
    _ = session
    result = accept_offer(offer_id)
    out = {
        "offer": result["offer"].model_dump(mode="json"),
        "event": result.get("event").model_dump(mode="json") if result.get("event") else None,
        "synthetic": True,
    }
    if result.get("candidate"):
        out["candidate"] = result["candidate"].model_dump(mode="json")
    if result.get("new_hire"):
        out["new_hire"] = result["new_hire"].model_dump(mode="json")
    return out


@app.post("/api/offers/{offer_id}/decline")
def offer_decline(offer_id: str, session: HrSession) -> dict:
    _ = session
    result = decline_offer(offer_id)
    return {
        "offer": result["offer"].model_dump(mode="json"),
        "event": result["event"].model_dump(mode="json"),
        "synthetic": True,
    }


@app.get("/api/new-hires")
def new_hires(session: HrSession) -> dict:
    _ = session
    rows = [h.model_dump(mode="json") for h in store.list_new_hires()]
    return {"total": len(rows), "new_hires": rows, "synthetic": True}


@app.get("/api/new-hires/{employee_id}")
def new_hire_detail(employee_id: str, session: HrSession) -> dict:
    _ = session
    hire = store.get_hire(employee_id)
    if hire is None:
        raise HTTPException(status_code=404, detail="New hire not found")
    docs = [
        d.model_dump(mode="json")
        for d in store.list_documents()
        if d.employee_id == employee_id
    ]
    return {
        "new_hire": hire.model_dump(mode="json"),
        "documents": docs,
        "synthetic": True,
    }


@app.post("/api/new-hires/{employee_id}/ready")
def new_hire_ready(employee_id: str, session: HrSession) -> dict:
    _ = session
    result = mark_hr_ready(employee_id)
    return {
        "new_hire": result["new_hire"].model_dump(mode="json"),
        "event": result["event"].model_dump(mode="json"),
        "synthetic": True,
    }


@app.get("/api/documents")
def documents(session: HrSession) -> dict:
    _ = session
    rows = [d.model_dump(mode="json") for d in store.list_documents()]
    return {"total": len(rows), "documents": rows, "synthetic": True}


@app.post("/api/documents/{document_id}/verify")
def document_verify(document_id: str, session: HrSession) -> dict:
    _ = session
    result = verify_document(document_id)
    out = {
        "document": result["document"].model_dump(mode="json"),
        "event": result["event"].model_dump(mode="json"),
        "synthetic": True,
    }
    if result.get("new_hire"):
        out["new_hire"] = result["new_hire"].model_dump(mode="json")
    return out


@app.get("/api/readiness")
def readiness(session: HrSession) -> dict:
    _ = session
    rows = []
    for h in store.list_new_hires():
        docs = [d for d in store.list_documents() if d.employee_id == h.employee_id]
        docs_ok = all(d.verification_status.value == "Verified" for d in docs) and len(docs) >= 5
        rows.append(
            {
                "employee_id": h.employee_id,
                "name": h.name,
                "offer": h.offer_accepted,
                "personal_information": h.personal_info_complete,
                "documents": docs_ok,
                "background_check": h.background_check,
                "hr_status": "READY" if h.hr_ready else ("READY" if docs_ok and h.offer_accepted else "IN PROGRESS"),
                "hr_ready": h.hr_ready,
                "documents_complete": h.documents_complete,
                "documents_total": h.documents_total,
            }
        )
    return {"total": len(rows), "readiness": rows, "synthetic": True}


@app.get("/api/events")
def events(
    since: Optional[str] = Query(default=None),
) -> dict:
    """Public event feed for external systems (e.g. SmartStart) to consume."""
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
        "note": "Event feed for external onboarding platforms — mock iCIMS remains independent.",
    }


@app.get("/api/integration/status")
def integration(session: HrSession) -> dict:
    _ = session
    return integration_status()


@app.post("/api/admin/reseed")
def reseed(session: HrSession, seed: int = Query(default=42)) -> dict:
    _ = session
    seed_cohort(seed=seed)
    return {
        "status": "reseeded",
        "candidates": len(store.list_candidates()),
        "seed": seed,
        "synthetic": True,
    }


# --- Frontend pages ---

if FRONTEND_DIR.exists():

    @app.get("/")
    def login_page() -> FileResponse:
        return FileResponse(FRONTEND_DIR / "login.html", headers=NO_CACHE)

    @app.get("/dashboard")
    @app.get("/app")
    def app_shell() -> FileResponse:
        return FileResponse(FRONTEND_DIR / "app.html", headers=NO_CACHE)

    app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")
