"""Synthetic demo auth for standalone mock Jira."""

from __future__ import annotations

import base64
import hashlib
import hmac
from typing import Annotated, Optional

from fastapi import Header, HTTPException

from jira.backend.models import LoginRequest, LoginResponse

DEMO_USER = {
    "username": "mgr.demo",
    "password": "mgr-demo-2026",
    "display_name": "Ava Chen",
    "title": "Hiring Manager · Engineering",
}

_TOKEN_SECRET = b"jira-mock-synthetic-demo-only"


def _sign(username: str) -> str:
    digest = hmac.new(_TOKEN_SECRET, username.encode(), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest).decode().rstrip("=")


def issue_token(username: str) -> str:
    user_b64 = base64.urlsafe_b64encode(username.encode()).decode().rstrip("=")
    return f"jira.{user_b64}.{_sign(username)}"


def verify_token(token: str) -> Optional[dict]:
    if not token or not token.startswith("jira."):
        return None
    parts = token.split(".")
    if len(parts) != 3:
        return None
    _, user_b64, sig = parts
    pad = "=" * (-len(user_b64) % 4)
    try:
        username = base64.urlsafe_b64decode(user_b64 + pad).decode()
    except Exception:
        return None
    if username != DEMO_USER["username"]:
        return None
    if not hmac.compare_digest(sig, _sign(username)):
        return None
    return {
        "username": DEMO_USER["username"],
        "display_name": DEMO_USER["display_name"],
        "title": DEMO_USER["title"],
    }


def login(body: LoginRequest) -> LoginResponse:
    if body.username != DEMO_USER["username"] or body.password != DEMO_USER["password"]:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return LoginResponse(
        token=issue_token(body.username),
        username=DEMO_USER["username"],
        display_name=DEMO_USER["display_name"],
        title=DEMO_USER["title"],
    )


def require_mgr(
    authorization: Annotated[Optional[str], Header()] = None,
    x_jira_token: Annotated[Optional[str], Header(alias="X-Jira-Token")] = None,
) -> dict:
    token = None
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
    elif x_jira_token:
        token = x_jira_token.strip()
    session = verify_token(token or "")
    if session is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return session
