"""Synthetic employer demo accounts (not real auth)."""

from __future__ import annotations

import base64
import hashlib
import hmac
from typing import Optional

from fastapi import HTTPException, Header

from backend.models import EmployerAccount, EmployerLoginRequest, EmployerLoginResponse, EmployerPersona

# Demo-only credentials — printed on the portal. Not for production.
DEMO_ACCOUNTS: list[EmployerAccount] = [
    EmployerAccount(
        username="hr.jordan",
        password="hr-demo-2026",
        display_name="Jordan Hale",
        persona=EmployerPersona.HR,
        title="People Ops",
    ),
    EmployerAccount(
        username="it.riley",
        password="it-demo-2026",
        display_name="Riley Chen",
        persona=EmployerPersona.IT,
        title="IT Partner",
    ),
    EmployerAccount(
        username="mgr.chen",
        password="mgr-chen-2026",
        display_name="Ava Chen",
        persona=EmployerPersona.MANAGER,
        title="Hiring Manager",
        manager_id="MGR-CHEN",
    ),
    EmployerAccount(
        username="mgr.park",
        password="mgr-park-2026",
        display_name="Leo Park",
        persona=EmployerPersona.MANAGER,
        title="Hiring Manager",
        manager_id="MGR-PARK",
    ),
    EmployerAccount(
        username="mgr.singh",
        password="mgr-singh-2026",
        display_name="Priya Singh",
        persona=EmployerPersona.MANAGER,
        title="Hiring Manager",
        manager_id="MGR-SINGH",
    ),
    EmployerAccount(
        username="mgr.cole",
        password="mgr-cole-2026",
        display_name="Jordan Cole",
        persona=EmployerPersona.MANAGER,
        title="Hiring Manager",
        manager_id="MGR-COLE",
    ),
    EmployerAccount(
        username="ops.admin",
        password="ops-demo-2026",
        display_name="Sam Ortiz",
        persona=EmployerPersona.OPS,
        title="Onboarding Ops",
    ),
]

_TOKEN_SECRET = b"smartstart-synthetic-demo-only"


def list_demo_accounts() -> list[dict]:
    """Public sample credentials for the portal (synthetic only)."""
    return [
        {
            "username": a.username,
            "password": a.password,
            "display_name": a.display_name,
            "persona": a.persona.value,
            "title": a.title,
            "manager_id": a.manager_id,
            "scope": (
                f"Team of {a.display_name}"
                if a.persona == EmployerPersona.MANAGER
                else "Full cohort"
            ),
        }
        for a in DEMO_ACCOUNTS
    ]


def _find_account(username: str, password: str) -> EmployerAccount | None:
    for account in DEMO_ACCOUNTS:
        if account.username == username and account.password == password:
            return account
    return None


def issue_token(account: EmployerAccount) -> str:
    payload = f"{account.username}|{account.persona.value}|{account.manager_id or ''}"
    sig = hmac.new(_TOKEN_SECRET, payload.encode(), hashlib.sha256).hexdigest()[:16]
    raw = f"{payload}|{sig}".encode()
    return base64.urlsafe_b64encode(raw).decode()


def parse_token(token: str) -> dict:
    try:
        raw = base64.urlsafe_b64decode(token.encode()).decode()
        username, persona, manager_id, sig = raw.split("|", 3)
        payload = f"{username}|{persona}|{manager_id}"
        expect = hmac.new(_TOKEN_SECRET, payload.encode(), hashlib.sha256).hexdigest()[:16]
        if not hmac.compare_digest(sig, expect):
            raise ValueError("bad signature")
        account = next((a for a in DEMO_ACCOUNTS if a.username == username), None)
        if account is None:
            raise ValueError("unknown user")
        return {
            "username": account.username,
            "display_name": account.display_name,
            "persona": account.persona.value,
            "title": account.title,
            "manager_id": account.manager_id,
        }
    except Exception as exc:  # noqa: BLE001 — demo auth
        raise HTTPException(status_code=401, detail="Invalid or missing employer session") from exc


def login(body: EmployerLoginRequest) -> EmployerLoginResponse:
    account = _find_account(body.username.strip(), body.password)
    if account is None:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    return EmployerLoginResponse(
        token=issue_token(account),
        username=account.username,
        display_name=account.display_name,
        persona=account.persona.value,
        title=account.title,
        manager_id=account.manager_id,
        synthetic=True,
        message="Synthetic employer session — not real authentication.",
    )


def require_employer(
    authorization: Optional[str] = Header(default=None),
    x_smartstart_token: Optional[str] = Header(default=None, alias="X-SmartStart-Token"),
) -> dict:
    token = None
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
    elif x_smartstart_token:
        token = x_smartstart_token.strip()
    if not token:
        raise HTTPException(status_code=401, detail="Employer login required")
    return parse_token(token)


def optional_employer(
    authorization: Optional[str] = Header(default=None),
    x_smartstart_token: Optional[str] = Header(default=None, alias="X-SmartStart-Token"),
) -> Optional[dict]:
    """Employer session when a token is sent; None for anonymous callers (public endpoints)."""
    if not authorization and not x_smartstart_token:
        return None
    return require_employer(authorization, x_smartstart_token)
