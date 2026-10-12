"""Pre-boarding — HR publishes a joiner's Day-1 pack to the separate welcome portal.

The portal (``preboarding/``, port 8400) is its own app, like mock iCIMS / ServiceNow /
Jira. SmartStart builds the pack from the live record and pushes it there when HR
publishes it or sends the welcome / Day-1 email; the email carries the joiner's link.
What the joiner does in the portal (opened it, confirmed Day 1, asked HR something)
comes back through the portal's ``/api/events`` feed and lands on the onboarding case.

The pack: start date and countdown, where to go, what to bring (document packet +
the approved Day-1 policy), the first-day schedule (laptop status, manager, mentor),
who they'll meet, and answers to common questions quoted from approved sources.
"""

from __future__ import annotations

import os
import re
import time
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx

from backend import knowledge_sources as ks
from backend import onboarding_cases as cases
from backend.analytics import ANALYTICS_AS_OF
from backend.employee_experience import build_team_workspace, learning_summary
from backend.models import DocumentStatus, HardwareStatus, OnboardingState, RoleType
from backend.role_context import JoinerFacts, access_items

SENDS_PACK = {"welcome", "day1"}
IST = timezone(timedelta(hours=5, minutes=30))
SITE = {
    "name": "Waters Global Capability Center",
    "city": "Bengaluru",
    "building": "Tower B, Level 4 — main reception",
    "address": "Synthetic campus address · Outer Ring Road, Bengaluru 560103",
    "tz": "IST",
    "arrival_hint": "Take the Tower B lifts to Level 4; reception is straight ahead as you step out.",
    "getting_there": [
        "Give your name at the campus gate — security has you on the Day-1 visitor list.",
        "Visitor parking is next to Tower B; two-wheeler parking is at the basement entrance.",
        "Campus shuttles run every 20 minutes from the metro station from 8:00 AM.",
    ],
}
POLICY_ID = "policy:hr-working-hours-and-hybrid"
STARTED = {OnboardingState.DAY1_ORIENTED, OnboardingState.PROJECT_READY}
FAQ = (
    "What should I wear?",
    "Where is the cafeteria?",
    "When do I get paid?",
    "Can I work from home?",
    "What if I'm sick on my first day?",
)
SYNC_EVERY_S = 5.0

# joiner_id -> what SmartStart knows about the published pack (read back from portal events).
_LINKS: dict[str, dict] = {}
_SYNC = {"at": 0.0, "since": None}
_SEEN: set[str] = set()


def portal_url() -> str:
    return (os.environ.get("NIA_PREBOARDING_URL") or "http://127.0.0.1:8400").rstrip("/")


def publish_key() -> str:
    return os.environ.get("PREBOARDING_KEY") or "smartstart-preboarding-demo"


def clear() -> None:
    _LINKS.clear()
    _SEEN.clear()
    _SYNC.update(at=0.0, since=None)


def days_to_start(f: JoinerFacts) -> int:
    return (f.joiner.joining_date - ANALYTICS_AS_OF.date()).days


def started(f: JoinerFacts) -> bool:
    return days_to_start(f) < 0 or f.joiner.current_state in STARTED


# --- The pack ----------------------------------------------------------------------------


def _policy() -> dict:
    """Day-1 times come from the approved policy, so an approved Knowledge edit changes the pack."""
    out = {"arrive": "9:30 AM", "orientation": "10:30 AM", "cafeteria": "ground floor",
           "id_line": "Bring a government photo ID for your access badge.", "source": None}
    src = ks.approved(POLICY_ID)
    if not src:
        return out
    text = " ".join(s.text for s in src.sections)
    for key, rx in (("arrive", r"reception by (\d{1,2}:\d{2} ?[AP]M)"),
                    ("orientation", r"orientation session starts at (\d{1,2}:\d{2} ?[AP]M)"),
                    ("cafeteria", r"[Cc]afeteria is on the ([a-z ]+? floor)"),
                    ("id_line", r"(Bring [^.]*\.)")):
        m = re.search(rx, text)
        if m:
            out[key] = m.group(1)
    out["source"] = {"title": src.rev.title, "owner": src.rev.owner, "updated": src.rev.updated}
    return out


def _clock(t: str) -> tuple[int, int]:
    m = re.match(r"(\d{1,2}):(\d{2}) ?([AP]M)", t)
    if not m:
        return 9, 30
    h = int(m.group(1)) % 12 + (12 if m.group(3) == "PM" else 0)
    return h, int(m.group(2))


def _plus(t: str, minutes: int) -> str:
    h, m = _clock(t)
    total = h * 60 + m + minutes
    hh, mm = divmod(total, 60)
    return f"{(hh - 1) % 12 + 1}:{mm:02d} {'AM' if hh < 12 else 'PM'}"


def _contacts(f: JoinerFacts) -> dict:
    ws = build_team_workspace(f.id)
    hr = next((c for c in ws.consult if "hr" in c.role_label.lower()), None)
    it = next((c for c in ws.consult if c.role_label.lower().startswith("it")), None)
    team = [m for m in ws.members if not m.is_self and m.relationship not in ("Your manager", "Your mentor")][:3]
    return {"hr": hr, "it": it, "team": team, "team_name": ws.team_name}


def _bring(f: JoinerFacts, p: dict) -> list[dict]:
    d = f.docs
    items = [
        {"id": "photo_id", "label": "Government photo ID", "why": p["id_line"], "required": True},
        {"id": "offer", "label": "Your signed offer letter — digital is fine",
         "why": "Reception checks it against the Day-1 list.", "required": True},
    ]
    if d.status == DocumentStatus.PENDING or d.rework_flag:
        items.append({
            "id": "docs", "label": "Finish your onboarding documents in iCIMS before Day 1", "required": True,
            "why": ("iCIMS returned one form for a correction." if d.rework_flag
                    else f"{d.form_count} forms are still open — IT can't finish your access until they're in."),
        })
    items.append({"id": "questions", "label": "Two or three questions for your manager",
                  "why": "Your end-of-day check-in is the best time to ask them.", "required": False})
    return items


def _laptop(f: JoinerFacts) -> dict:
    t = f.ticket
    apps = [a["name"] for a in access_items(t)]
    if t.hardware_status == HardwareStatus.DELIVERED:
        state, text = "ready", "Your laptop is ready and waiting for you."
    elif t.hardware_status == HardwareStatus.CONFIGURED:
        state, text = "ready", "Your laptop is configured — IT hands it over at the desk."
    else:
        state, text = "preparing", ("IT is still preparing your laptop. If it isn't ready on the day, "
                                    "you'll get a loaner so you can start straight away.")
    return {"state": state, "text": text, "apps": apps}


def _faq() -> list[dict]:
    from backend import grounded

    out = []
    for q in FAQ:
        g = grounded.answer(q, "EMPLOYEE", strict=True, use_model=False)
        if g["grounded"]:
            c = g["citations"][0]
            out.append({"q": q, "a": re.sub(r"\s*\[\d+\]", "", g["answer"]).strip(),
                        "source": f"{c['title']} › {c['section']}", "owner": c["owner"], "updated": c["updated"]})
    return out


def pack(f: JoinerFacts, sender: str) -> dict:
    j = f.joiner
    p = _policy()
    who = _contacts(f)
    ment = cases.mentor(f)
    hr, it = who["hr"], who["it"]
    laptop = _laptop(f)
    ls = learning_summary(f.id)
    h, m = _clock(p["arrive"])
    starts = datetime(j.joining_date.year, j.joining_date.month, j.joining_date.day, h, m, tzinfo=IST)
    hr_name = hr.name if hr else "HR Operations"
    it_name = it.name if it else cases.IT_DESK
    intern = j.role_type == RoleType.INTERN
    o = p["orientation"]
    teammates = ", ".join(t.name.split()[0] for t in who["team"]) or who["team_name"]
    schedule = [
        {"time": p["arrive"], "title": "Arrive and get your badge", "with": hr_name, "where": SITE["building"],
         "detail": f"{hr_name.split()[0]} meets you at reception. {p['id_line']}"},
        {"time": _plus(p["arrive"], 30), "title": "Collect your laptop and sign in", "with": it_name,
         "where": "IT desk, Level 4",
         "detail": f"{laptop['text']} You'll sign in with Okta and get {', '.join(laptop['apps'][:4])}."},
        {"time": o, "title": "Welcome and orientation", "with": j.manager_name, "where": "Level 4 meeting room",
         "detail": f"{j.manager_name.split()[0]} walks you through the team, your role and your first weeks."},
        {"time": _plus(o, 120), "title": "Lunch with your mentor", "with": ment, "where": f"Cafeteria, {p['cafeteria']}",
         "detail": f"{ment.split()[0]} is your go-to person for anything while you settle in."},
        {"time": _plus(o, 210), "title": "Intern cohort welcome" if intern else f"Meet {who['team_name']}",
         "with": teammates, "where": "Team area, Level 4",
         "detail": ("Meet the other interns starting this month, then your team." if intern
                    else "Quick hellos and how the team works day to day.")},
        {"time": _plus(o, 300), "title": "Start your learning plan", "with": "SmartStart", "where": "Your desk",
         "detail": f"Your first module is {ls['current'] or ls['track_name']}."},
        {"time": _plus(o, 360), "title": "End-of-day check-in", "with": j.manager_name, "where": "Level 4",
         "detail": "How did Day 1 go? Agree two or three goals for your first week."},
    ]
    people = [
        {"name": j.manager_name, "relation": "Your manager", "role": f"Leads {who['team_name']}",
         "meet": f"{o} · orientation", "help": "Your goals, priorities and first project.",
         "email": cases.work_email(j.manager_name)},
        {"name": ment, "relation": "Your mentor", "role": "Mentor for your first weeks",
         "meet": f"{schedule[3]['time']} · lunch", "help": "How the team works, who to ask, anything that feels unclear.",
         "email": cases.work_email(ment)},
        {"name": hr_name, "relation": "Your HR partner", "role": hr.role_label if hr else "People Operations",
         "meet": f"{p['arrive']} · reception", "help": hr.focus if hr else "Documents, badge and payroll setup.",
         "email": hr.email if hr else ""},
        {"name": it_name, "relation": "IT contact", "role": it.role_label if it else "IT Service Desk",
         "meet": f"{schedule[1]['time']} · laptop", "help": "Laptop, sign-in and app access.",
         "email": it.email if it else cases.IT_DESK_ADDRESS},
    ] + [
        {"name": t.name, "relation": "Teammate", "role": t.title, "meet": f"{schedule[4]['time']} · team intro",
         "help": t.ask_about, "email": t.email}
        for t in who["team"]
    ]
    return {
        "joiner": {"id": j.id, "name": j.name, "first_name": j.name.split()[0], "position": cases.position(f),
                   "department": j.department, "team": who["team_name"], "intern": intern},
        "start": {
            "date": j.joining_date.isoformat(),
            "long": f"{j.joining_date:%A} {j.joining_date.day} {j.joining_date:%B %Y}",
            "arrive": p["arrive"],
            "starts_at": starts.isoformat(),
            "ends_at": starts.replace(hour=17, minute=30).isoformat(),
            "as_of": ANALYTICS_AS_OF.isoformat(),
            "days": days_to_start(f),
        },
        "site": SITE,
        "bring": _bring(f, p),
        "laptop": laptop,
        "documents": {k: v for k, v in cases.documents(f).items() if k in ("state", "rows", "form_count")},
        "schedule": schedule,
        "people": people,
        "faq": _faq(),
        "policy": p["source"],
        "sender": {"name": sender, "team": "People Ops", "reply_to": hr.email if hr else ""},
        "synthetic": True,
    }


# --- Publishing and reading back ---------------------------------------------------------


def _headers() -> dict:
    return {"X-Publish-Key": publish_key()}


def publish(f: JoinerFacts, actor: str) -> dict:
    """Push (or refresh) the pack. Returns {ok, url, …} or {ok: False, error}. Never raises."""
    if started(f):
        return {"ok": False, "error": f"{f.joiner.name} has already started — the Day-1 pack is for before Day 1."}
    try:
        res = httpx.post(f"{portal_url()}/api/invites", json={"pack": pack(f, actor)}, headers=_headers(), timeout=4.0)
        res.raise_for_status()
        out = res.json()
    except (httpx.HTTPError, ValueError):
        return {"ok": False, "error": "The pre-boarding portal isn't reachable right now."}
    first_time = f.id not in _LINKS
    link = _LINKS.setdefault(f.id, {"opened": False, "opened_at": None, "confirmed": None, "questions": 0,
                                    "question_list": []})
    link.update(ok=True, url=f"{portal_url()}{out['path']}", published_at=cases._now(), by=actor,
                opened=link["opened"] or bool(out.get("opened")),
                confirmed=out.get("confirmed") or link["confirmed"],
                questions=max(link["questions"], int(out.get("questions") or 0)))
    cases._log(f.id, "preboarding",
               f"Day-1 pack {'published' if first_time else 'refreshed'} on the pre-boarding portal for {f.joiner.name}",
               audience="Employee", to=f.joiner.name, by=actor, topic="preboarding")
    return dict(link)


def link_for(joiner_id: str) -> Optional[dict]:
    link = _LINKS.get(joiner_id)
    return dict(link) if link else None


def with_link(body: str, link: Optional[dict]) -> str:
    if not link or not link.get("ok"):
        return body
    return body.replace(cases.PACK_LINK, link["url"])


def _apply(e: dict) -> None:
    jid = e.get("smartstart_joiner_id")
    link = _LINKS.get(jid)
    if link is None:
        return
    kind, payload = e.get("event_type"), e.get("payload") or {}
    if kind == "PACK_OPENED":
        link.update(opened=True, opened_at=e["created_at"])
        cases._log(jid, "preboarding", "Opened the Day-1 pack", audience="HR", by="Pre-boarding portal", topic="preboarding")
    elif kind in ("ATTENDANCE_CONFIRMED", "ATTENDANCE_PROBLEM"):
        ok = kind == "ATTENDANCE_CONFIRMED"
        link["confirmed"] = {"attending": ok, "note": payload.get("note", ""), "at": e["created_at"]}
        text = ("Confirmed they'll be there on Day 1" if ok
                else f"Said Day 1 may not work: “{payload.get('note') or 'no details'}”")
        cases._log(jid, "preboarding", text, audience="HR", by="Pre-boarding portal", topic="preboarding")
    elif kind == "QUESTION_ASKED":
        link["questions"] += 1
        link["question_list"] = ([{"text": payload.get("question", ""), "at": e["created_at"]}] + link["question_list"])[:10]
        cases._log(jid, "preboarding", f"Asked HR: “{payload.get('question', '')}”", audience="HR",
                   by="Pre-boarding portal", topic="preboarding")


def sync(force: bool = False) -> None:
    """Read new portal events (throttled). The portal being down never breaks SmartStart."""
    if not _LINKS or (not force and time.monotonic() - _SYNC["at"] < SYNC_EVERY_S):
        return
    _SYNC["at"] = time.monotonic()
    try:
        params = {"since": _SYNC["since"]} if _SYNC["since"] else {}
        res = httpx.get(f"{portal_url()}/api/events", params=params, headers=_headers(), timeout=2.0)
        res.raise_for_status()
        rows = res.json().get("events", [])
    except (httpx.HTTPError, ValueError):
        return
    for e in rows:
        if e["id"] in _SEEN:
            continue
        _SEEN.add(e["id"])
        _SYNC["since"] = max(_SYNC["since"] or "", e["created_at"])
        _apply(e)
