"""Invites and events for the pre-boarding portal, kept in one JSON file.

An invite is the Day-1 pack HR published from SmartStart, reachable only through its
unguessable link. Events (opened, confirmed, question) are what SmartStart reads back.
"""

from __future__ import annotations

import json
import os
import secrets
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

ROOT = Path(__file__).resolve().parents[2]
MAX_QUESTIONS = 20

_LOCK = threading.RLock()
_DATA: dict | None = None
_PATH: Path | None = None


def store_path() -> Path:
    return Path(os.environ.get("PREBOARDING_STORE") or ROOT / "var" / "preboarding.json")


def now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _data() -> dict:
    global _DATA, _PATH
    path = store_path()
    if _DATA is None or _PATH != path:
        _PATH = path
        try:
            _DATA = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            _DATA = {"invites": {}, "events": []}
    return _DATA


def _save() -> None:
    path = store_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(_data(), indent=1), encoding="utf-8")
    os.replace(tmp, path)


def reset(path: Optional[str] = None) -> None:
    global _DATA
    with _LOCK:
        if path is not None:
            os.environ["PREBOARDING_STORE"] = path
        _DATA = None


def _event(kind: str, invite: dict, **payload) -> dict:
    d = _data()
    e = {
        "id": f"PB-{len(d['events']) + 1:05d}",
        "event_type": kind,
        "smartstart_joiner_id": invite["joiner_id"],
        "token_hint": invite["token"][:6],
        "created_at": now(),
        "payload": payload,
    }
    d["events"].append(e)
    return e


def publish(pack: dict) -> dict:
    """Create or refresh a joiner's invite. The link stays the same across refreshes."""
    jid = str(pack["joiner"]["id"])
    with _LOCK:
        d = _data()
        invite = next((i for i in d["invites"].values() if i["joiner_id"] == jid), None)
        if invite is None:
            token = secrets.token_urlsafe(18)
            invite = {"token": token, "joiner_id": jid, "created_at": now(), "opened": 0,
                      "first_opened_at": None, "confirmed": None, "questions": []}
            d["invites"][token] = invite
        invite.update(pack=pack, published_at=now(), withdrawn=False)
        _event("PACK_PUBLISHED", invite, by=pack.get("sender", {}).get("name", ""))
        _save()
        return invite


def withdraw(joiner_id: str) -> bool:
    with _LOCK:
        hits = [i for i in _data()["invites"].values() if i["joiner_id"] == joiner_id]
        for inv in hits:
            inv["withdrawn"] = True
            _event("PACK_WITHDRAWN", inv)
        if hits:
            _save()
        return bool(hits)


def get(token: str) -> Optional[dict]:
    with _LOCK:
        return _data()["invites"].get(token)


def opened(invite: dict) -> None:
    with _LOCK:
        invite["opened"] += 1
        if invite["first_opened_at"] is None:
            invite["first_opened_at"] = now()
            _event("PACK_OPENED", invite)
        _save()


def confirm(invite: dict, attending: bool, note: str) -> dict:
    with _LOCK:
        invite["confirmed"] = {"attending": attending, "note": note, "at": now()}
        _event("ATTENDANCE_CONFIRMED" if attending else "ATTENDANCE_PROBLEM", invite, note=note)
        _save()
        return invite["confirmed"]


def ask(invite: dict, text: str) -> dict:
    with _LOCK:
        if len(invite["questions"]) >= MAX_QUESTIONS:
            raise ValueError("You've sent a lot of questions — HR will reply to these first.")
        q = {"id": f"Q{len(invite['questions']) + 1}", "text": text, "at": now()}
        invite["questions"].append(q)
        _event("QUESTION_ASKED", invite, question=text)
        _save()
        return q


def events(since: Optional[str] = None) -> list[dict]:
    with _LOCK:
        rows = list(_data()["events"])
    return [e for e in rows if not since or e["created_at"] >= since]
