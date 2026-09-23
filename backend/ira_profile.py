"""IRA personal profile store — Get to know me answers + transparent observed signals.

Stored per employee in a small JSON file so the web IRA tab and the desktop app
share one profile. Only the employee's own answers and simple counters are kept;
chat text is never stored.
"""

from __future__ import annotations

import json
import os
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from pydantic import BaseModel, Field

from ira import coach, persona, workplace_basics

_LOCK = threading.Lock()


def _path() -> Path:
    return Path(os.environ.get("SMARTSTART_PROFILE_PATH") or Path.home() / ".smartstart" / "ira_profiles.json")


def _load_all() -> dict:
    p = _path()
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def _save_all(data: dict) -> None:
    p = _path()
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, indent=2), encoding="utf-8")
    tmp.replace(p)


def get_profile(employee_id: str) -> dict:
    with _LOCK:
        raw = _load_all().get(employee_id) or {}
    return {
        "answers": persona.clean_answers(raw.get("answers")),
        "observed": dict(raw.get("observed") or {}),
        "onboarded": bool(raw.get("onboarded")),
        "updated_at": raw.get("updated_at"),
    }


def _write(employee_id: str, profile: dict) -> dict:
    with _LOCK:
        data = _load_all()
        data[employee_id] = {
            "answers": profile.get("answers") or {},
            "observed": profile.get("observed") or {},
            "onboarded": bool(profile.get("onboarded")),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        _save_all(data)
    return get_profile(employee_id)


def save_answers(employee_id: str, answers: dict | None, *, onboarded: bool = True) -> dict:
    prof = get_profile(employee_id)
    prof["answers"] = persona.clean_answers(answers)
    prof["onboarded"] = onboarded or prof["onboarded"]
    return _write(employee_id, prof)


def record_observation(employee_id: str, query: str, *, flavour: bool = False) -> dict:
    prof = get_profile(employee_id)
    prof["observed"] = persona.observe(query, prof["observed"])
    if flavour:
        prof["observed"]["last_flavour"] = prof["observed"]["turns"]
    return _write(employee_id, prof)


def forget(employee_id: str, *, what: str = "all") -> dict:
    prof = get_profile(employee_id)
    if what in ("observed", "all"):
        prof["observed"] = {}
    if what == "all":
        prof["answers"] = {}
        prof["onboarded"] = False
    return _write(employee_id, prof)


def profile_payload(employee_id: str, ctx: dict | None) -> dict:
    prof = get_profile(employee_id)
    return {
        "employee_id": employee_id,
        **prof,
        "questionnaire": persona.questionnaire(),
        "traits": {k: (sorted(v) if isinstance(v, set) else v) for k, v in persona.traits(prof).items()},
        "observed_labels": persona.observed_labels(prof, ctx),
        "welcome": persona.welcome_summary(prof, ctx),
        "synthetic": True,
    }


# --- API bodies ------------------------------------------------------------------


class ProfileUpdate(BaseModel):
    answers: dict = Field(default_factory=dict)
    onboarded: bool = True


class ForgetRequest(BaseModel):
    what: str = Field(default="observed", pattern="^(observed|all)$")


class CoachRequest(BaseModel):
    scenario: str = Field(min_length=1, max_length=40)
    message: Optional[str] = Field(default=None, max_length=1500)


def coach_turn(employee_id: str, body: CoachRequest, ctx: dict | None) -> dict:
    if body.scenario not in coach.SCENARIOS:
        raise KeyError(body.scenario)
    if not body.message or not body.message.strip():
        return {"start": coach.start(body.scenario, ctx), "result": None, "synthetic": True}
    record_observation(employee_id, "practice")
    prof = get_profile(employee_id)
    return {
        "start": coach.start(body.scenario, ctx),
        "result": coach.evaluate(body.scenario, body.message, prof, ctx),
        "synthetic": True,
    }


def basics_payload(employee_id: str, ctx: dict | None) -> dict:
    prof = get_profile(employee_id)
    return {
        "employee_id": employee_id,
        "groups": workplace_basics.GROUPS,
        "topics": workplace_basics.catalogue(prof),
        "scenarios": coach.catalogue(),
        "synthetic": True,
    }


def basics_topic(employee_id: str, topic_id: str, ctx: dict | None) -> dict:
    prof = get_profile(employee_id)
    guide = workplace_basics.render(topic_id, prof, ctx)
    if guide is None:
        raise KeyError(topic_id)
    practice = guide.get("practice")
    return {
        **guide,
        "question": workplace_basics.question(topic_id),
        "practice_title": coach.SCENARIOS[practice]["title"] if practice else None,
        "synthetic": True,
    }
