"""Live new-hire simulation: one synthetic joiner walks from offer accepted to Project Ready.

The joiner is a real record in the shared store, so the dashboard, alerts, analytics, NIA and
the joiner drawer all react exactly as they would to a real hire. Every view measures time
against the fixed demo clock, so the simulation ages the joiner by shifting their offer date,
start date and ticket age as simulated days pass. That way SLA breaches, overdue documents and
risk scores appear on their own.

Steps owned by the signed-in role wait for that person's decision. Steps owned by another team
are done for them, in their name, using the same case and manager functions the real buttons call.
"""

from __future__ import annotations

import random
import threading
from datetime import timedelta
from functools import wraps
from typing import Optional

from faker import Faker

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
from backend.role_context import ROLE_HR, ROLE_IT, ROLE_MANAGER, ROLE_OPS, joiner_facts
from backend.synthetic_engine import (
    HIRING_MANAGERS,
    NON_TECH_DEPARTMENTS,
    NON_TECH_SOFTWARE,
    NON_TECH_TASKS,
    NON_TECH_TRACKS,
    TECH_DEPARTMENTS,
    TECH_SOFTWARE,
    TECH_TASKS,
    TECH_TRACKS,
    assign_hiring_manager,
)

TODAY = cases.TODAY
START_IN = 9
SLA_DAYS = 3
STAGES = list(OnboardingState)

# (step, owning team). None means the world moves on its own.
STEPS: tuple[tuple[str, Optional[str]], ...] = (
    ("approve", "HR"),
    ("docs_in", None),
    ("rework", "HR"),
    ("docs_ok", None),
    ("backorder", None),
    ("laptop", "IT"),
    ("delivered", None),
    ("day1", "Manager"),
    ("oriented", None),
    ("project", "Manager"),
    ("ready", None),
)
OWNER_ROLE = {"HR": ROLE_HR, "IT": ROLE_IT, "Manager": ROLE_MANAGER}
STAND_INS = {"HR": "Jordan Hale", "IT": "Riley Chen"}

# One simulation per signed-in user, keyed by username. Public calls bind `_SIM` to the
# caller's run under a lock (sync endpoints run on a thread pool).
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


# --- the record ---------------------------------------------------------------------------


def _facts():
    j = store.get_joiner(_SIM["jid"])
    return joiner_facts(j) if j else None


def _first() -> str:
    return _SIM["name"].split()[0]


def _sync() -> None:
    """Write the joiner, packet and ticket for the current simulated day."""
    s = _SIM
    day = s["day"]
    offer_at = ANALYTICS_AS_OF - timedelta(days=day)
    store.upsert_bundle(
        Joiner(
            **s["base"],
            joining_date=TODAY + timedelta(days=s["start_day"] - day),
            offer_accepted_at=offer_at,
            current_state=s["state"],
        ),
        DocumentSubmission(
            joiner_id=s["jid"],
            form_count=30,
            status=s["docs"],
            rework_flag=s["rework"],
            submitted_at=offer_at + timedelta(days=s["docs_in_day"]) if s["docs_in_day"] is not None else None,
            completed_at=offer_at + timedelta(days=s["docs_ok_day"]) if s["docs_ok_day"] is not None else None,
            waiting_days=max(0, day - s["docs_from"]) if s["docs"] == DocumentStatus.PENDING or s["rework"] else 0,
        ),
        ITProvisioningTicket(
            ticket_id=s["ticket"],
            joiner_id=s["jid"],
            hardware_status=s["hw"],
            software_access=s["software"],
            lead_time_days=s["lead"] if s["hw"] == HardwareStatus.DELIVERED else max(0, day - (s["it_day"] if s["it_day"] is not None else day)),
            sla_target_days=SLA_DAYS,
            created_at=offer_at + timedelta(days=s["it_day"] if s["it_day"] is not None else 0, hours=6),
            updated_at=ANALYTICS_AS_OF,
        ),
    )


def _event(source: str, text: str, tone: str = "info", **extra) -> None:
    _SIM["events"].append({"n": len(_SIM["events"]) + 1, "day": _SIM["day"], "source": source, "text": text,
                           "tone": tone, **extra})


# --- start --------------------------------------------------------------------------------


@_for_user
def start(role: str, manager_id: Optional[str]) -> dict:
    _drop(_SIM)
    _RUNS["n"] += 1
    n = _RUNS["n"]
    rng = random.Random(7000 + n)
    fake = Faker()
    fake.seed_instance(7000 + n)

    if role == ROLE_MANAGER and manager_id:
        depts = next((sorted(d) for mid, _, d in HIRING_MANAGERS if mid == manager_id), list(TECH_DEPARTMENTS))
        dept = rng.choice(depts)
    else:
        dept = rng.choice(TECH_DEPARTMENTS + NON_TECH_DEPARTMENTS)
    tech = dept in TECH_DEPARTMENTS
    track = DepartmentTrack.TECHNICAL if tech else DepartmentTrack.NON_TECHNICAL
    role_type = rng.choice([RoleType.INTERN, RoleType.FTE])
    mgr_id, mgr_name = assign_hiring_manager(dept, n)
    first, last = fake.first_name(), fake.last_name()
    jid = f"SYN-SIM-{900 + n}"
    title = {
        "Engineering": "Software Engineer", "Data Science": "Data Scientist", "Product": "Product Analyst",
        "IT Infrastructure": "Systems Engineer", "Security": "Security Analyst", "Human Resources": "People Partner",
        "Finance": "Financial Analyst", "Marketing": "Marketing Associate", "Sales": "Account Executive",
        "Operations": "Operations Analyst",
    }[dept]
    position = f"{title} Intern" if role_type == RoleType.INTERN else title

    _SIM.update(
        run=n, jid=jid, name=f"{first} {last}", position=position, ticket=f"SYN-IT-SIM-{900 + n}",
        base=dict(
            id=jid, name=f"{first} {last}", email=f"{first}.{last}.sim{n}@synthetic.smartstart.example".lower(),
            role_type=role_type, department=dept, department_track=track, mentor_name=fake.name(),
            manager_id=mgr_id, manager_name=mgr_name,
            learning_track=rng.choice(TECH_TRACKS if tech else NON_TECH_TRACKS),
            assigned_tasks=list(rng.sample(TECH_TASKS if tech else NON_TECH_TASKS, k=3)), synthetic=True,
        ),
        software=list(rng.sample(TECH_SOFTWARE if tech else NON_TECH_SOFTWARE, k=5)),
        day=0, start_day=START_IN, step=0, state=OnboardingState.OFFER_ACCEPTED,
        docs=DocumentStatus.PENDING, rework=False, docs_from=0, docs_in_day=None, docs_ok_day=None,
        hw=HardwareStatus.PENDING, it_day=None, lead=0, day1_booked=False, slipped=0,
        lost=[], decisions=[], events=[], done=False,
    )
    _sync()
    cases._CASES[jid] = {
        "detected": {"event": f"EVT-SIM-{n}", "source": "iCIMS", "at": cases._now(), "candidate": f"CAND-{4100 + n}"},
        "position": position,
    }
    cases._log(jid, "detected", f"Offer accepted in iCIMS (CAND-{4100 + n}) — onboarding case opened", by="iCIMS")
    _event("iCIMS", f"Offer accepted: {first} {last}, {position} in {dept}. Starts in {START_IN} days, "
                    f"reporting to {mgr_name}.", "good", kind="hired")
    _event("NIA", "Onboarding case opened and a plan drafted: documents, laptop and access, Day 1, first project.")
    return snapshot(role)


# --- decisions -------------------------------------------------------------------------------


def _options(step: str) -> list[dict]:
    f = _facts()
    n = _first()
    if step == "approve":
        return [{"id": "approve", "label": "Approve the plan", "hint": "IT and the manager are notified, documents go out",
                 "best": True}]
    if step == "rework":
        return [
            {"id": "remind", "label": f"Send {n} a reminder", "hint": "Corrected within a day", "best": True},
            {"id": "wait", "label": "Leave it with them", "hint": "They'll get to it… eventually", "best": False},
        ]
    if step == "laptop":
        return [
            {"id": "spare", "label": "Ship one from the spare pool", "hint": "Delivered tomorrow", "best": True},
            {"id": "wait", "label": "Wait for the backorder", "hint": "Supplier says 3–4 days", "best": False},
        ]
    if step == "day1":
        return [
            {"id": "book", "label": "Book Day 1 and confirm the mentor",
             "hint": f"{cases.mentor(f)} joins the welcome session", "best": True},
            {"id": "skip", "label": "I'll sort it out on the day", "hint": "Risky", "best": False},
        ]
    if step == "project":
        ideas = manager_assistant.project_ideas(f)[:2]
        return [{"id": f"p{i}", "label": idea, "hint": "Assign in Jira now", "best": True, "project": idea}
                for i, idea in enumerate(ideas)] + [
            {"id": "later", "label": "Decide next week", "hint": f"{n} waits with nothing to do", "best": False}]
    return []


def _owner_name(owner: str) -> str:
    return _SIM["base"]["manager_name"] if owner == "Manager" else STAND_INS[owner]


def _mine(owner: Optional[str], role: str) -> bool:
    return owner is not None and (role == ROLE_OPS or OWNER_ROLE[owner] == role)


def _lose(days: int, why: str) -> None:
    if days > 0:
        _SIM["lost"].append({"days": days, "why": why})


def _decide(step: str, choice: str, by: str, you: bool) -> None:
    s, n = _SIM, _first()
    f = _facts()
    who = "You" if you else by
    pick = next((o for o in _options(step) if o["id"] == choice), None)
    if pick is None:
        raise ValueError("That option isn't available right now.")
    s["decisions"].append({"step": step, "label": pick["label"], "best": pick["best"], "by": who})

    if step == "approve":
        if cases.case_status(f) == "review":
            cases.approve(f, by)
        laptop = cases.LAPTOP_TYPES[cases.laptop_key(f)].split(" (")[0].lower()
        _event("HR", f"{who} approved the plan. IT was asked for a {laptop}, "
                     f"{s['base']['manager_name']} was asked to prepare Day 1, and {n} got the document packet.",
               "good", you=you)
    elif step == "rework":
        if choice == "remind":
            d = cases.draft(f, "doc_reminder", by)
            cases.send(f, "doc_reminder", d["subject"], d["body"], by)
            _event("HR", f"{who} sent {n} a reminder about the returned Tax Information form.", "good", you=you)
            s["rework_wait"] = 1
        else:
            _event("HR", f"{who} left the returned form with {n}.", "warn", you=you)
            s["rework_wait"] = 4
            _lose(3, "Waiting on the returned form")
    elif step == "laptop":
        if choice == "spare":
            _event("IT", f"{who} shipped a laptop from the spare pool. Delivery tomorrow.", "good", you=you)
            s["laptop_wait"] = 1
        else:
            _event("IT", f"{who} kept the order on backorder.", "warn", you=you)
            s["laptop_wait"] = 4
            _lose(3, "Waiting on the laptop backorder")
    elif step == "day1":
        if choice == "book":
            manager_assistant.confirm_mentor(f, by, cases.mentor(f))
            manager_assistant.book_day1(_facts(), by, store.get_joiner(s["jid"]).joining_date, "10:00")
            s["day1_booked"] = True
            _event("Manager", f"{who} booked Day-1 orientation for 10:00 on the start date and confirmed "
                              f"{cases.mentor(f)} as mentor. {n} got the invite.", "good", you=you)
        else:
            _event("Manager", f"{who} didn't book Day 1.", "warn", you=you)
    elif step == "project":
        if choice == "later":
            _event("Manager", f"{who} put the first project off until next week.", "warn", you=you)
            s["project_wait"] = 4
            s["project_name"] = _options("project")[0]["project"]
            _lose(3, "No first project after Day 1")
        else:
            s["project_wait"] = 1
            s["project_name"] = pick["project"]
            manager_assistant.assign_project(f, by, pick["project"])
            _event("Manager", f"{who} assigned {n}'s first project: {pick['project']}.", "good", you=you)


# --- the world moving on ----------------------------------------------------------------------


def _world(step: str) -> None:
    s, n = _SIM, _first()
    if step == "docs_in":
        s["day"] += 2
        s["docs"] = DocumentStatus.COMPLETE
        s["rework"] = True
        s["docs_in_day"] = s["day"]
        s["docs_from"] = s["day"]
        _event("iCIMS", f"{n} submitted all 30 forms. One came back: the Tax Information form is missing a signature.",
               "bad", kind="alert")
    elif step == "docs_ok":
        s["day"] += s.pop("rework_wait", 1)
        s["rework"] = False
        s["docs_ok_day"] = s["day"]
        s["state"] = OnboardingState.DOCS_SUBMITTED
        s["it_day"] = s["day"]
        apps = ", ".join(s["software"][:3])
        _event("iCIMS", f"Corrected form received. {n}'s documents are verified.", "good")
        _event("ServiceNow", f"Ticket {s['ticket']} opened: laptop plus {apps} and more.")
    elif step == "backorder":
        s["day"] += SLA_DAYS + 1
        _event("ServiceNow", f"The laptop model is backordered. Ticket {s['ticket']} is at {SLA_DAYS + 1} days "
                             f"against a {SLA_DAYS}-day SLA.", "bad", kind="alert")
    elif step == "delivered":
        s["day"] += s.pop("laptop_wait", 1)
        s["lead"] = s["day"] - s["it_day"]
        s["hw"] = HardwareStatus.DELIVERED
        s["state"] = OnboardingState.IT_PROVISIONED
        app = next((a for a in s["software"] if a not in ("Okta", "VPN")), "Slack")
        _event("ServiceNow", f"Laptop delivered and signed for. VPN, Okta and {app} access granted.", "good")
    elif step == "oriented":
        s["day"] = max(s["day"] + 1, s["start_day"])
        s["state"] = OnboardingState.DAY1_ORIENTED
        if s["day1_booked"]:
            _event("SmartStart", f"Day 1: {n} had orientation, met {cases.mentor(_facts())} and signed in to "
                                 f"everything first time.", "good", kind="day1")
        else:
            s["day"] += 2
            _lose(2, "Improvised Day 1")
            _event("SmartStart", f"Day 1 was improvised. {n} waited at reception, then spent two days chasing a "
                                 f"mentor and an orientation slot.", "bad", kind="day1")
    elif step == "ready":
        s["day"] += s.pop("project_wait", 1)
        f = _facts()
        if not manager_assistant.prep(f).get("project"):
            manager_assistant.assign_project(f, s["base"]["manager_name"], s["project_name"])
        s["state"] = OnboardingState.PROJECT_READY
        _event("Jira", f"{manager_assistant.jira_key(f)} created: {s['project_name']}. {n} is Project Ready.",
               "good", kind="ready")
        s["done"] = True


def _slip() -> None:
    """Nobody starts without a working laptop: the start date moves back when IT runs out of time."""
    s = _SIM
    before_day1 = STAGES.index(s["state"]) < STAGES.index(OnboardingState.DAY1_ORIENTED)
    if before_day1 and s["day"] >= s["start_day"]:
        slip = s["day"] + 1 - s["start_day"]
        s["start_day"] = s["day"] + 1
        s["slipped"] += slip
        _event("SmartStart", f"{_first()}'s start date moved back {slip} day(s): the laptop wasn't ready in time.",
               "bad", kind="alert")


def _advance() -> None:
    _SIM["step"] += 1
    _slip()
    _sync()


@_for_user
def tick(role: str) -> dict:
    """Move the world one step. Waits (does nothing) when the current step is the caller's to decide."""
    if not _SIM or _SIM["done"]:
        return snapshot(role)
    step, owner = STEPS[_SIM["step"]]
    if step == "approve" and cases.case_status(_facts()) != "review":
        approver = cases._CASES.get(_SIM["jid"], {}).get("approved_by", "HR")
        _decide(step, "approve", approver, you=_mine(owner, role))
        _advance()
    elif owner is None:
        _world(step)
        _advance()
    elif not _mine(owner, role):
        by = _owner_name(owner)
        best = next(o for o in _options(step) if o["best"])
        _decide(step, best["id"], by, you=False)
        _advance()
    return snapshot(role)


@_for_user
def act(role: str, by: str, choice: str) -> dict:
    if not _SIM or _SIM["done"]:
        raise ValueError("There's no simulation waiting on you.")
    step, owner = STEPS[_SIM["step"]]
    if not _mine(owner, role):
        raise ValueError("This step isn't yours to decide.")
    _decide(step, choice, by, you=True)
    _advance()
    return snapshot(role)


# --- what the Command Center shows ------------------------------------------------------------

NEXT = {
    "approve": "HR approves the onboarding plan",
    "docs_in": "{n} fills in the document packet",
    "rework": "HR chases the returned form",
    "docs_ok": "{n} corrects the form",
    "backorder": "IT sources the laptop",
    "laptop": "IT deals with the backorder",
    "delivered": "The laptop ships",
    "day1": "The manager prepares Day 1",
    "oriented": "Day 1",
    "project": "The manager picks a first project",
    "ready": "The Jira ticket is created",
}
ASK = {
    "approve": ("Approve the onboarding plan",
                "NIA drafted it from the iCIMS offer. Approving routes the laptop to IT and Day-1 prep to the manager."),
    "rework": ("A form came back. How do you chase it?",
               "iCIMS returned the Tax Information form. Nothing else can move until it's fixed."),
    "laptop": ("The laptop is backordered and the SLA is breached",
               "The ticket is past its 3-day target. Every day it waits eats into the start date."),
    "day1": ("The laptop's ready. Prepare Day 1?", "Book orientation and confirm the mentor so Day 1 runs itself."),
    "project": ("Day 1 went well. Pick a first project", "Until there's a project in Jira, they aren't Project Ready."),
}


def _summary() -> dict:
    s = _SIM
    lost = [x for x in s["lost"] if x["days"]]
    return {
        "days": s["day"],
        "best": s["day"] - sum(x["days"] for x in lost),
        "lost": lost,
        "slipped": s["slipped"],
        "good_calls": sum(1 for d in s["decisions"] if d["best"]),
        "calls": len(s["decisions"]),
    }


@_for_user
def state(role: str) -> dict:
    return snapshot(role)


def snapshot(role: str) -> dict:
    if not _SIM or store.get_joiner(_SIM["jid"]) is None:
        return {"active": False, "synthetic": True}
    s = _SIM
    f = _facts()
    n = _first()
    step, owner = STEPS[s["step"]] if not s["done"] else ("done", None)
    waiting = not s["done"] and _mine(owner, role)
    ask = None
    if waiting:
        title, why = ASK[step]
        ask = {"step": step, "owner": owner, "title": title, "why": why, "options": _options(step)}
    starts_in = s["start_day"] - s["day"]
    return {
        "active": True,
        "run": s["run"],
        "joiner": {
            "id": s["jid"], "name": s["name"], "position": s["position"], "department": s["base"]["department"],
            "role_type": s["base"]["role_type"].value, "manager_name": s["base"]["manager_name"],
            "mentor": cases.mentor(f), "start_date": store.get_joiner(s["jid"]).joining_date.isoformat(),
        },
        "day": s["day"],
        "starts_in": starts_in,
        "stage": STAGES.index(s["state"]),
        "state": s["state"].value,
        "journey": f.journey,
        "bottleneck": f.bottleneck,
        "health": f.health,
        "risk": f.risk_score,
        "waiting": waiting,
        "ask": ask,
        "next": None if s["done"] or waiting else {
            "text": NEXT[step].format(n=n),
            "by": _owner_name(owner) if owner else None,
            "owner": owner,
        },
        "events": s["events"],
        "done": s["done"],
        "summary": _summary() if s["done"] else None,
        "synthetic": True,
    }
