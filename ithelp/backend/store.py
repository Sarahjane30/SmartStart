"""In-memory users, sessions and tickets for the mock IT Help portal (synthetic only)."""

from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone

PASSWORD = "ithelp-demo-2026"

USERS = {
    "sarah.jane": {
        "username": "sarah.jane",
        "name": "Sarah Jane",
        "title": "Intern · Data Engineering",
        "email": "sarah.jane@synthetic.example",
        "location": "Bengaluru office",
        "manager": "Ava Chen",
    },
    "alex.example": {
        "username": "alex.example",
        "name": "Alex Example",
        "title": "Associate · Finance",
        "email": "alex.example@synthetic.example",
        "location": "Milford office",
        "manager": "Priya Singh",
    },
}

SESSIONS: dict[str, str] = {}
TICKETS: list[dict] = []
_COUNTERS = {"INC": 51240, "RITM": 104230}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def next_number(kind: str) -> str:
    prefix = "INC" if kind == "incident" else "RITM"
    _COUNTERS[prefix] += 1
    return f"{prefix}{_COUNTERS[prefix]:07d}"


def reset() -> None:
    SESSIONS.clear()
    TICKETS.clear()
    _COUNTERS.update({"INC": 51240, "RITM": 104230})
    now = _now()
    seed = [
        ("sarah.jane", "RITM0104217", "access", "Request access to GitHub team repositories", "Closed Complete", 9),
        ("sarah.jane", "RITM0103988", "access", "Access to Jira project board", "Closed Skipped", 16),
        ("sarah.jane", "INC0051236", "hardware-software", "Docking station not detected by laptop", "Closed", 21),
        ("alex.example", "INC0051198", "email-collab", "Outlook calendar not syncing", "Closed", 5),
    ]
    for user, number, item, short, state, days in seed:
        opened = now - timedelta(days=days)
        TICKETS.append({
            "number": number,
            "user": user,
            "item_id": item,
            "short_description": short,
            "state": state,
            "opened_at": opened.isoformat(),
            "updated_at": (opened + timedelta(days=2)).isoformat(),
            "values": {"short_description": short},
            "activity": [
                {"at": opened.isoformat(), "by": USERS[user]["name"], "text": "Ticket submitted."},
                {"at": (opened + timedelta(days=2)).isoformat(), "by": "IT Service Desk", "text": f"State changed to {state}."},
            ],
            "synthetic": True,
        })


def new_session(username: str) -> str:
    token = secrets.token_urlsafe(24)
    SESSIONS[token] = username
    return token


def tickets_for(username: str) -> list[dict]:
    return sorted((t for t in TICKETS if t["user"] == username), key=lambda t: t["opened_at"], reverse=True)


def create_ticket(username: str, item: dict, values: dict) -> dict:
    now = _now().isoformat()
    ticket = {
        "number": next_number(item["kind"]),
        "user": username,
        "item_id": item["id"],
        "short_description": values.get("short_description", item["title"]),
        "state": "New",
        "opened_at": now,
        "updated_at": now,
        "values": values,
        "activity": [
            {"at": now, "by": USERS[username]["name"], "text": "Ticket submitted."},
            {"at": now, "by": "IT Service Desk", "text": "Assigned to the Service Desk queue. You will be notified of progress."},
        ],
        "synthetic": True,
    }
    TICKETS.append(ticket)
    return ticket


reset()
