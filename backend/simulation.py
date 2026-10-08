"""Connected enterprise simulation: one offer accepted in iCIMS, followed through every system.

A fixed synthetic candidate (Alex Morgan, Software Engineering Intern, Platform Engineering)
starts in a mock iCIMS. Each step is one human action in one system, and each action writes the
consequence into the shared store and emits the system event SmartStart would detect next:

    iCIMS offer accepted -> HR starts onboarding -> NIA's IT request is sent -> IT starts
    provisioning -> ServiceNow request fulfilled -> manager notified -> manager prepares Day 1
    -> manager requests Confluence (NIA's contextual suggestion) -> IT approves access
    -> manager assigns the first project in Jira

Nothing moves on a timer and nothing is scored. The joiner is a real record, so the Command
Center, NIA cases and the manager workspace all see the same hire once the offer is accepted.
"""

from __future__ import annotations

import threading
from datetime import datetime, timedelta, timezone
from functools import wraps
from typing import Optional

from backend import manager_assistant, onboarding_cases as cases, resolutions
from backend.analytics import ANALYTICS_AS_OF
from backend.database import store
from backend.models import (
    DepartmentTrack,
    DocumentStatus,
    DocumentSubmission,
    HardwareStatus,
    ITProvisioningTicket,
    Joiner,
    OnboardingState,
    RoleType,
)
from backend.role_context import joiner_facts

TODAY = cases.TODAY
START_IN = 14

CANDIDATE = {
    "name": "Alex Morgan",
    "first": "Alex",
    "position": "Software Engineering Intern",
    "team": "Platform Engineering",
    "location": "Bengaluru",
    "manager_id": "MGR-CHEN",
    "manager": "Ava Chen",
    "mentor": "Rohan Iyer",
    "recruiter": "Maya Fernandes",
    "requisition": "REQ-2026-0417",
    "candidate_id": "CAND-58213",
    "email": "alex.morgan@synthetic.smartstart.example",
}
PEOPLE = {"HR": "Jordan Hale", "IT": "Riley Chen", "Manager": CANDIDATE["manager"]}
STANDARD = ["Laptop", "VPN", "Microsoft 365", "Jira", "Engineering applications"]
PROJECT = {
    "name": "Platform Analytics Dashboard",
    "jira": "PLAT-ONBOARDING",
    "tasks": ["Review architecture documentation", "Set up development environment", "Attend project kickoff"],
    "why": ["Team", "Role", "Required tools", "First-week learning objectives"],
}
SUGGESTED = [
    {"app": "Confluence", "why": "Project documentation and design reviews"},
    {"app": "GitHub", "why": "Source control and code review"},
    {"app": "Team knowledge base", "why": "Runbooks and team onboarding notes"},
]
CATALOG = {
    "Collaboration": ["Confluence", "Slack", "Microsoft Teams"],
    "Development": ["GitHub", "GitLab", "Docker Registry"],
    "Documentation": ["Confluence", "Internal Knowledge Base", "Team knowledge base"],
    "Design": ["Figma"],
    "Other": ["Custom Application"],
}
ACCESS_LEVELS = ("Viewer", "Member", "Admin")

# (step, system the action happens in, persona who acts)
STEPS: tuple[tuple[str, str, str], ...] = (
    ("accept_offer", "icims", "Candidate"),
    ("start_onboarding", "smartstart", "HR"),
    ("send_it", "smartstart", "HR"),
    ("start_provisioning", "it", "IT"),
    ("complete_provisioning", "servicenow", "IT"),
    ("send_manager", "smartstart", "HR"),
    ("prepare_day1", "manager", "Manager"),
    ("request_access", "manager", "Manager"),
    ("approve_access", "it", "IT"),
    ("assign_project", "manager", "Manager"),
)
STEP_NAMES = [s for s, _, _ in STEPS]

_SIMS: dict[str, dict] = {}
_SIM: dict = {}
_RUNS = {"n": 0}
_LOCK = threading.RLock()


def _for_user(fn):
    @wraps(fn)
    def bound(user: str, *args, **kwargs):
        global _SIM
        with _LOCK:
            _SIM = _SIMS.setdefault(user, {})
            return fn(*args, **kwargs)
    return bound


def _drop(sim: dict) -> None:
    if sim.get("jid"):
        store.remove(sim["jid"])
        resolutions.forget(sim["jid"])
        cases._CASES.pop(sim["jid"], None)
    sim.clear()


def clear_all() -> None:
    """Regenerating the cohort wipes every simulated hire."""
    with _LOCK:
        for sim in _SIMS.values():
            sim.clear()
        _SIMS.clear()


@_for_user
def end() -> None:
    _drop(_SIM)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _facts():
    j = store.get_joiner(_SIM["jid"])
    return joiner_facts(j) if j else None


def _sync() -> None:
    s = _SIM
    accepted = ANALYTICS_AS_OF
    store.upsert_bundle(
        Joiner(
            id=s["jid"], name=CANDIDATE["name"], email=CANDIDATE["email"], role_type=RoleType.INTERN,
            department=CANDIDATE["team"], department_track=DepartmentTrack.TECHNICAL,
            joining_date=TODAY + timedelta(days=START_IN), offer_accepted_at=accepted, current_state=s["state"],
            mentor_name=CANDIDATE["mentor"], manager_id=CANDIDATE["manager_id"], manager_name=CANDIDATE["manager"],
            learning_track="Platform Engineering Foundations", assigned_tasks=list(PROJECT["tasks"]), synthetic=True,
        ),
        DocumentSubmission(
            joiner_id=s["jid"], form_count=30, status=s["docs"], rework_flag=False,
            submitted_at=accepted + timedelta(hours=2) if s["docs"] == DocumentStatus.COMPLETE else None,
            completed_at=accepted + timedelta(hours=3) if s["docs"] == DocumentStatus.COMPLETE else None,
            waiting_days=0,
        ),
        ITProvisioningTicket(
            ticket_id=s["ticket"], joiner_id=s["jid"], hardware_status=s["hw"], software_access=list(s["software"]),
            lead_time_days=0, sla_target_days=3, created_at=accepted, updated_at=accepted,
        ),
    )


def _event(source: str, code: str, text: str, route: list[str], tone: str = "info") -> None:
    _SIM["events"].append({"n": len(_SIM["events"]) + 1, "source": source, "code": code, "text": text,
                           "route": route, "tone": tone, "at": _now()})


@_for_user
def start() -> dict:
    _drop(_SIM)
    _RUNS["n"] += 1
    n = _RUNS["n"]
    _SIM.update(
        run=n, jid=None, step=0, ticket=f"IT-{1041 + n}", state=OnboardingState.OFFER_ACCEPTED,
        docs=DocumentStatus.PENDING, hw=HardwareStatus.PENDING, software=[], access=[], sent={}, events=[],
        project=None, done=False,
    )
    return snapshot()


# --- drafts NIA prepares ------------------------------------------------------------------------


def _draft(kind: str) -> dict:
    c = CANDIDATE
    if kind == "it":
        reqs = "\n".join(f"  ✓ {r}" for r in STANDARD)
        return {
            "to": "IT Onboarding Team",
            "subject": f"New Joiner Setup — {c['position']}",
            "body": (
                f"A new joiner has accepted their offer and is entering the onboarding process.\n\n"
                f"Name: {c['name']}\nRole: {c['position']}\nTeam: {c['team']}\nManager: {c['manager']}\n"
                f"Location: {c['location']}\nStart date: {(TODAY + timedelta(days=START_IN)).strftime('%d %b %Y')}\n\n"
                f"SmartStart has identified the following standard requirements:\n{reqs}\n\n"
                f"Please review and initiate provisioning.\n\nSource: SmartStart / iCIMS ({c['candidate_id']})"
            ),
        }
    return {
        "to": f"{c['manager']} — Hiring Manager",
        "subject": "New Joiner Ready for Manager Preparation",
        "body": (
            f"Hi {c['manager'].split()[0]},\n\n{c['name']}'s IT setup is complete ({_SIM['ticket']} closed in ServiceNow). "
            f"{c['first']} starts on {(TODAY + timedelta(days=START_IN)).strftime('%d %b %Y')}.\n\n"
            f"SmartStart has identified the following manager actions:\n"
            f"  ○ Confirm mentor ({c['mentor']} suggested)\n  ○ Prepare Day-1 orientation\n"
            f"  ○ Confirm team introduction\n  ○ Assign first project\n  ○ Review required collaboration tools\n\n"
            f"Everything is waiting in your SmartStart workspace.\n\nNIA · SmartStart"
        ),
    }


# --- the actions --------------------------------------------------------------------------------


def _clean(text: str, limit: int) -> str:
    return (text or "").strip()[:limit]


def _do(step: str, detail: dict) -> None:
    s, c = _SIM, CANDIDATE
    hr, it, mgr = PEOPLE["HR"], PEOPLE["IT"], PEOPLE["Manager"]

    if step == "accept_offer":
        s["jid"] = f"SYN-SIM-{900 + s['run']}"
        _sync()
        cases._CASES[s["jid"]] = {
            "detected": {"event": f"EVT-{7300 + s['run']}", "source": "iCIMS", "at": cases._now(),
                         "candidate": c["candidate_id"]},
            "position": c["position"],
        }
        cases._log(s["jid"], "detected", f"Offer accepted in iCIMS ({c['candidate_id']}) — onboarding case opened",
                   by="iCIMS")
        _event("iCIMS", "OFFER_ACCEPTED", f"{c['name']} accepted the offer for {c['position']} ({c['requisition']}).",
               ["icims", "ss"], "good")
        _event("NIA", "PLAN_BUILT", "Onboarding plan built from role, team and enterprise requirements: "
                                    "11 requirements across HR, IT, Manager, Learning and Project.", ["ss"])

    elif step == "start_onboarding":
        cases.approve(_facts(), hr, mentor_name=c["mentor"])
        _event("SmartStart", "ONBOARDING_STARTED", f"{hr} started onboarding. Document packet requested in iCIMS.",
               ["ss", "hr", "icims"], "good")
        s["docs"] = DocumentStatus.COMPLETE
        s["state"] = OnboardingState.DOCS_SUBMITTED
        _sync()
        _event("iCIMS", "DOCUMENTS_SUBMITTED", f"{c['first']} completed all 30 onboarding forms. Documents verified.",
               ["icims", "ss"], "good")

    elif step == "send_it":
        d = _draft("it")
        subject, body = _clean(detail.get("subject") or d["subject"], 140), _clean(detail.get("body") or d["body"], 4000)
        s["sent"]["it"] = {"subject": subject, "body": body, "at": _now(), "edited": body != d["body"]}
        cases._log(s["jid"], "routed", f"{hr} sent \"{subject}\" to the IT Onboarding Team ({s['ticket']})",
                   by=hr, audience="IT", to=cases.IT_DESK, topic="it_request")
        _event("SmartStart", "IT_REQUEST_CREATED", f"Onboarding request for {c['name']} delivered to IT Onboarding.",
               ["ss", "it"], "good")

    elif step == "start_provisioning":
        s["software"] = []
        _sync()
        _event("SmartStart", "SERVICENOW_REQUEST_CREATED",
               f"{it} started provisioning. ServiceNow request {s['ticket']} created with {len(STANDARD)} catalog tasks.",
               ["it", "snow"])

    elif step == "complete_provisioning":
        s["hw"] = HardwareStatus.DELIVERED
        s["software"] = ["VPN", "Microsoft 365", "Jira", "Engineering applications"]
        s["state"] = OnboardingState.IT_PROVISIONED
        _sync()
        cases._log(s["jid"], "it", f"{s['ticket']} closed complete in ServiceNow — laptop, VPN, Microsoft 365, Jira "
                                   f"and engineering applications ready", by="ServiceNow", audience="HR")
        _event("ServiceNow", "IT_PROVISIONING_COMPLETED", f"Request {s['ticket']} closed complete. All 5 tasks fulfilled.",
               ["snow", "it", "ss"], "good")

    elif step == "send_manager":
        d = _draft("manager")
        subject, body = _clean(detail.get("subject") or d["subject"], 140), _clean(detail.get("body") or d["body"], 4000)
        s["sent"]["manager"] = {"subject": subject, "body": body, "at": _now()}
        cases._log(s["jid"], "routed", f"{hr} sent \"{subject}\" to {mgr}", by=hr, audience="Manager", to=mgr,
                   manager_id=c["manager_id"], topic="mgr_prep")
        _event("SmartStart", "MANAGER_NOTIFIED", f"{mgr} received the preparation brief in her workspace.",
               ["ss", "mgr"], "good")

    elif step == "prepare_day1":
        f = _facts()
        manager_assistant.confirm_mentor(f, mgr, c["mentor"])
        manager_assistant.book_day1(_facts(), mgr, TODAY + timedelta(days=START_IN), "10:00")
        _event("Manager", "DAY1_PREPARED", f"{mgr} confirmed {c['mentor']} as mentor and booked Day-1 orientation.",
               ["mgr", "ss", "emp"], "good")
        _event("NIA", "CONTEXT_GAP", f"{c['team']} usually works in Confluence. It isn't in {c['first']}'s access yet.",
               ["ss", "mgr"], "warn")

    elif step == "request_access":
        apps = {a for group in CATALOG.values() for a in group}
        app = _clean(detail.get("app"), 40)
        if app not in apps:
            raise ValueError("Pick an application from the catalog.")
        level = detail.get("level") or "Member"
        if level not in ACCESS_LEVELS:
            raise ValueError("Pick an access level.")
        reason = _clean(detail.get("reason"), 200)
        if len(reason) < 5:
            raise ValueError("Add a short business reason.")
        req = {"id": f"ACC-{3300 + s['run']}{len(s['access']) + 1}", "app": app,
               "workspace": _clean(detail.get("workspace") or c["team"], 60), "level": level, "reason": reason,
               "by": mgr, "status": "PENDING APPROVAL", "at": _now()}
        s["access"].append(req)
        cases._log(s["jid"], "prep", f"{mgr} requested {app} ({level}) for {c['name']}: {reason}", by=mgr,
                   audience="IT", to=cases.IT_DESK, topic="it_request")
        _event("SmartStart", "ACCESS_REQUEST_CREATED",
               f"{app} · {req['workspace']} · {level} requested by {mgr}. Routed to IT / Access Management.",
               ["mgr", "ss", "it", "access"])

    elif step == "approve_access":
        req = s["access"][-1]
        req.update(status="APPROVED", approved_by=it, approved_at=_now())
        s["software"].append(req["app"])
        _sync()
        cases._log(s["jid"], "it", f"{it} approved {req['app']} ({req['level']}) for {c['name']}", by=it, audience="HR")
        _event("Access Management", "ACCESS_GRANTED", f"{req['app']} access granted to {c['name']} ({req['level']}).",
               ["access", "it", "ss"], "good")

    elif step == "assign_project":
        manager_assistant.assign_project(_facts(), mgr, PROJECT["name"])
        s["project"] = {**PROJECT, "at": _now()}
        _event("Jira", "PROJECT_ASSIGNED", f"{PROJECT['jira']}: {PROJECT['name']} assigned with "
                                           f"{len(PROJECT['tasks'])} first-week tasks.", ["mgr", "jira", "ss"], "good")
        _event("SmartStart", "EMPLOYEE_READY", f"Every onboarding dependency for {c['name']} is connected.",
               ["ss", "emp"], "good")
        s["done"] = True


@_for_user
def act(choice: str, detail: Optional[dict] = None) -> dict:
    if not _SIM:
        raise ValueError("Start the simulation first.")
    if _SIM["done"]:
        raise ValueError("This simulation is complete.")
    step = STEP_NAMES[_SIM["step"]]
    if choice != step:
        raise ValueError("That action isn't the next one in the journey.")
    _do(step, detail or {})
    if not _SIM["done"]:
        _SIM["step"] += 1
    return snapshot()


@_for_user
def state() -> dict:
    return snapshot()


# --- what the simulation screen shows -----------------------------------------------------------


def _nodes(i: int, done: bool) -> dict:
    """Status of each system in the ecosystem: idle, active (work happening), or done."""
    def span(first: int, *busy: int) -> str:
        if i < first:
            return "idle"
        return "active" if i in busy and not done else "done"

    return {
        "icims": span(0, 0),
        "ss": span(1, *range(1, 10)),
        "hr": span(1, 1, 2, 5),
        "it": span(3, 3, 4, 8),
        "snow": span(4, 4),
        "mgr": span(5, 5, 6, 7, 9),
        "access": span(7, 7, 8),
        "jira": span(9, 9),
        "emp": span(1, *range(1, 10)),
    }


def _readiness(i: int, done: bool) -> list[dict]:
    def ok(k):
        return done or i > k

    access = _SIM["access"][-1] if _SIM["access"] else None
    return [
        {"key": "offer", "label": "Offer accepted", "ok": ok(0)},
        {"key": "docs", "label": "Documents complete", "ok": ok(1)},
        {"key": "it", "label": "IT provisioned", "ok": ok(4)},
        {"key": "access", "label": f"Required access granted{' (' + access['app'] + ')' if access else ''}",
         "ok": ok(8)},
        {"key": "mentor", "label": f"Mentor confirmed ({CANDIDATE['mentor']})", "ok": ok(6)},
        {"key": "day1", "label": "Day-1 prepared", "ok": ok(6)},
        {"key": "project", "label": f"Project assigned ({PROJECT['jira']})", "ok": done},
        {"key": "learning", "label": "Learning path available", "ok": ok(1)},
    ]


def snapshot() -> dict:
    s = _SIM
    if not s:
        return {"active": False, "synthetic": True}
    i, done = s["step"], s["done"]
    step, system, persona = STEPS[i]
    c = CANDIDATE
    f = _facts() if s["jid"] else None
    return {
        "active": True,
        "synthetic": True,
        "run": s["run"],
        "step": "done" if done else step,
        "index": i + (1 if done else 0),
        "total": len(STEPS),
        "system": None if done else system,
        "persona": None if done else (PEOPLE.get(persona) or c["name"]),
        "persona_role": None if done else persona,
        "joiner_id": s["jid"],
        "candidate": {**c, "start_date": (TODAY + timedelta(days=START_IN)).isoformat(),
                      "offer": "Accepted" if s["jid"] else "Sent"},
        "people": PEOPLE,
        "ticket": s["ticket"],
        "standard": STANDARD,
        "software": s["software"],
        "hardware": s["hw"].value,
        "suggested": SUGGESTED,
        "catalog": CATALOG,
        "levels": list(ACCESS_LEVELS),
        "access": s["access"],
        "project": PROJECT,
        "drafts": {"it": _draft("it"), "manager": _draft("manager")},
        "sent": s["sent"],
        "nodes": _nodes(i, done),
        "readiness": _readiness(i, done),
        "health": f.health if f else None,
        "events": s["events"],
        "done": done,
    }
