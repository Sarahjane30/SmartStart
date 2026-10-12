"""Standalone mock pre-boarding portal — the joiner's Day-1 pack, separate from SmartStart.

HR publishes a pack from SmartStart (it travels with the welcome email); the joiner opens
their personal link on their own computer before they have a Waters laptop or account. What the
joiner does here (opened, confirmed, asked) goes back to SmartStart through ``/api/events``.

Run:
  uvicorn preboarding.backend.main:app --reload --port 8400
"""

from __future__ import annotations

import os
import secrets
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Annotated, Optional

from fastapi import FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from preboarding.backend import store

FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"
NO_CACHE = {"Cache-Control": "no-store, no-cache, must-revalidate", "Pragma": "no-cache"}
DEFAULT_KEY = "smartstart-preboarding-demo"

app = FastAPI(
    title="Waters Welcome (Mock pre-boarding)",
    description="Standalone synthetic pre-boarding portal. Separate from SmartStart — packs arrive via REST.",
    version="1.0.0",
)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


def publish_key() -> str:
    return os.environ.get("PREBOARDING_KEY") or DEFAULT_KEY


def _require_key(key: Optional[str]) -> None:
    if not key or not secrets.compare_digest(key, publish_key()):
        raise HTTPException(status_code=401, detail="SmartStart publish key required")


def _invite(token: str) -> dict:
    inv = store.get(token)
    if inv is None or inv.get("withdrawn"):
        raise HTTPException(status_code=404, detail="This welcome link isn't valid any more. Reply to your welcome email and HR will send a new one.")
    return inv


def _public(inv: dict) -> dict:
    return {
        **inv["pack"],
        "state": {
            "confirmed": inv["confirmed"],
            "questions": inv["questions"],
            "published_at": inv["published_at"],
        },
        "synthetic": True,
    }


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "app": "preboarding-mock", "product": "Waters Welcome", "separate_from_smartstart": True}


# --- SmartStart integration (server to server) ------------------------------------------


class PublishBody(BaseModel):
    pack: dict


@app.post("/api/invites")
def publish(body: PublishBody, x_publish_key: Annotated[Optional[str], Header()] = None) -> dict:
    _require_key(x_publish_key)
    pack = body.pack
    if not isinstance(pack.get("joiner"), dict) or not pack["joiner"].get("id") or not isinstance(pack.get("start"), dict):
        raise HTTPException(status_code=422, detail="A pack needs a joiner and a start")
    inv = store.publish(pack)
    return {"token": inv["token"], "path": f"/w/{inv['token']}", "opened": inv["opened"],
            "confirmed": inv["confirmed"], "questions": len(inv["questions"])}


@app.delete("/api/invites/{joiner_id}")
def withdraw(joiner_id: str, x_publish_key: Annotated[Optional[str], Header()] = None) -> dict:
    _require_key(x_publish_key)
    if not store.withdraw(joiner_id):
        raise HTTPException(status_code=404, detail="No pack for that joiner")
    return {"withdrawn": joiner_id}


@app.get("/api/events")
def events(since: Optional[str] = Query(default=None), x_publish_key: Annotated[Optional[str], Header()] = None) -> dict:
    _require_key(x_publish_key)
    rows = store.events(since)
    return {"events": rows, "total": len(rows)}


# --- The joiner's pack (link from the welcome email) ------------------------------------


class ConfirmBody(BaseModel):
    attending: bool = True
    note: str = Field(default="", max_length=300)


class QuestionBody(BaseModel):
    text: str = Field(min_length=3, max_length=500)


@app.get("/api/welcome/{token}")
def welcome(token: str) -> dict:
    inv = _invite(token)
    store.opened(inv)
    return _public(inv)


@app.post("/api/welcome/{token}/confirm")
def confirm(token: str, body: ConfirmBody) -> dict:
    inv = _invite(token)
    return {"confirmed": store.confirm(inv, body.attending, " ".join(body.note.split()))}


@app.post("/api/welcome/{token}/questions")
def question(token: str, body: QuestionBody) -> dict:
    inv = _invite(token)
    try:
        return {"question": store.ask(inv, " ".join(body.text.split()))}
    except ValueError as err:
        raise HTTPException(status_code=429, detail=str(err)) from None


def _ics_text(s: str) -> str:
    return s.replace("\\", "\\\\").replace(",", "\\,").replace(";", "\\;").replace("\n", "\\n")


@app.get("/api/welcome/{token}/day1.ics")
def calendar(token: str) -> Response:
    inv = _invite(token)
    pack = inv["pack"]
    start = datetime.fromisoformat(pack["start"]["starts_at"])
    end = datetime.fromisoformat(pack["start"].get("ends_at") or (start + timedelta(hours=7)).isoformat())
    def utc(d: datetime) -> str:
        return d.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")

    site = pack.get("site", {})
    lines = "\n".join(f"{s['time']} {s['title']}" for s in pack.get("schedule", []))
    ics = "\r\n".join([
        "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Waters Welcome (mock)//EN", "BEGIN:VEVENT",
        f"UID:day1-{pack['joiner']['id']}@welcome.synthetic.example",
        f"DTSTAMP:{utc(datetime.fromisoformat(inv['published_at']))}",
        f"DTSTART:{utc(start)}", f"DTEND:{utc(end)}",
        f"SUMMARY:{_ics_text('Day 1 at Waters — ' + pack['joiner'].get('position', ''))}",
        f"LOCATION:{_ics_text(site.get('name', '') + ', ' + site.get('address', ''))}",
        f"DESCRIPTION:{_ics_text(lines)}",
        "END:VEVENT", "END:VCALENDAR", "",
    ])
    return Response(ics, media_type="text/calendar",
                    headers={"Content-Disposition": 'attachment; filename="waters-day1.ics"'})


# --- Pages -------------------------------------------------------------------------------

if FRONTEND_DIR.exists():
    @app.get("/")
    def landing() -> FileResponse:
        return FileResponse(FRONTEND_DIR / "index.html", headers=NO_CACHE)

    @app.get("/w/{token}")
    def welcome_page(token: str) -> FileResponse:
        return FileResponse(FRONTEND_DIR / "welcome.html", headers=NO_CACHE)

    app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")
