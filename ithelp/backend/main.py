"""Standalone mock IT Help portal — the employee self-service side of IT support.

Separate from SmartStart and from the IT-agent ServiceNow mock. Synthetic data only.

Run:
  uvicorn ithelp.backend.main:app --reload --port 8400
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Annotated, Optional

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from ithelp.backend import store
from ithelp.backend.catalog import BY_ID, CATALOG, FEATURED, PHONES

FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"
NO_CACHE = {"Cache-Control": "no-store, no-cache, must-revalidate", "Pragma": "no-cache"}

app = FastAPI(
    title="IT Help Portal (Mock)",
    description="Standalone synthetic employee IT self-service portal. Not connected to any real system.",
    version="1.0.0",
)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


class LoginBody(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: Optional[str] = Field(default=None, max_length=128)
    sso: bool = False


class TicketBody(BaseModel):
    item_id: str
    values: dict[str, str] = Field(default_factory=dict)


def require_user(authorization: Annotated[Optional[str], Header()] = None) -> dict:
    token = (authorization or "").removeprefix("Bearer ").strip()
    username = store.SESSIONS.get(token)
    if not username:
        raise HTTPException(status_code=401, detail="Sign in to the IT Help portal")
    return store.USERS[username]


User = Annotated[dict, Depends(require_user)]


def _public_ticket(t: dict) -> dict:
    item = BY_ID.get(t["item_id"], {})
    return {**{k: v for k, v in t.items() if k != "user"}, "item_title": item.get("title", ""), "kind": item.get("kind", "")}


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "app": "ithelp-mock", "separate_from_smartstart": True, "catalog_items": len(CATALOG)}


@app.post("/api/auth/login")
def api_login(body: LoginBody) -> dict:
    user = store.USERS.get(body.username.strip().lower())
    if user is None or (not body.sso and body.password != store.PASSWORD):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    return {"token": store.new_session(user["username"]), "user": user}


@app.get("/api/auth/demo-users")
def api_demo_users() -> list[dict]:
    return [{"username": u["username"], "name": u["name"], "title": u["title"]} for u in store.USERS.values()]


@app.get("/api/me")
def api_me(user: User) -> dict:
    mine = store.tickets_for(user["username"])
    cutoff = datetime.now(timezone.utc) - timedelta(weeks=4)
    closed = [t for t in mine if t["state"].startswith("Closed") and datetime.fromisoformat(t["updated_at"]) >= cutoff]
    return {
        **user,
        "summary": {
            "awaiting_response": sum(1 for t in mine if t["state"] == "Awaiting User Info"),
            "open": sum(1 for t in mine if not t["state"].startswith("Closed")),
            "closed_4_weeks": len(closed),
        },
    }


@app.get("/api/catalog")
def api_catalog() -> dict:
    lite = [{k: item[k] for k in ("id", "kind", "group", "title", "summary", "icon")} for item in CATALOG]
    return {"items": lite, "featured": FEATURED}


@app.get("/api/catalog/{item_id}")
def api_catalog_item(item_id: str) -> dict:
    item = BY_ID.get(item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Catalog item not found")
    return item


@app.get("/api/tickets")
def api_tickets(user: User) -> list[dict]:
    return [_public_ticket(t) for t in store.tickets_for(user["username"])]


@app.get("/api/tickets/{number}")
def api_ticket(number: str, user: User) -> dict:
    for t in store.tickets_for(user["username"]):
        if t["number"] == number:
            return _public_ticket(t)
    raise HTTPException(status_code=404, detail="Ticket not found")


@app.post("/api/tickets", status_code=201)
def api_create_ticket(body: TicketBody, user: User) -> dict:
    item = BY_ID.get(body.item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Catalog item not found")
    values: dict[str, str] = {}
    missing: list[str] = []
    for field in item["fields"]:
        key = field["key"]
        val = (body.values.get(key) or "").strip()
        if key == "name":
            val = user["name"]
        if field.get("required") and not val:
            missing.append(field["label"])
        if field.get("options") and val and val not in field["options"]:
            raise HTTPException(status_code=400, detail=f"{field['label']}: choose one of the listed options")
        if len(val) > field.get("max", 500):
            raise HTTPException(status_code=400, detail=f"{field['label']} is too long")
        if val:
            values[key] = val
    if missing:
        raise HTTPException(status_code=400, detail="Required: " + ", ".join(missing))
    return _public_ticket(store.create_ticket(user["username"], item, values))


@app.get("/api/phones")
def api_phones() -> list[dict]:
    return PHONES


@app.get("/api/search")
def api_search(q: str = "") -> list[dict]:
    words = [w for w in q.lower().split() if len(w) > 1]
    if not words:
        return []
    hits = [i for i in CATALOG if any(w in f"{i['title']} {i['summary']}".lower() for w in words)]
    return [{"id": i["id"], "title": i["title"], "summary": i["summary"]} for i in hits[:8]]


@app.get("/")
def portal_page() -> FileResponse:
    return FileResponse(FRONTEND_DIR / "portal.html", headers=NO_CACHE)


@app.get("/login")
def login_page() -> FileResponse:
    return FileResponse(FRONTEND_DIR / "login.html", headers=NO_CACHE)


app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")
