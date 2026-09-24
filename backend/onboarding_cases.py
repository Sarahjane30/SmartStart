"""HR onboarding cases — NIA runs one joiner's onboarding from offer accepted to Project Ready.

A case never keeps its own copy of the joiner. Every requirement's status is read from the
SmartStart record (iCIMS document packet, ServiceNow ticket, onboarding state, learning
track), so NIA and the Command Center can never disagree. The case only adds what HR
decides (plan approval, confirmed mentor and laptop type, closure) and a log of what NIA
routed, reminded or sent on HR's behalf.

New joiners arrive from the independent mock iCIMS: its public ``/api/events`` feed emits
``OFFER_ACCEPTED`` and SmartStart ingests it into the same store every view reads.
"""

from __future__ import annotations

import os
import time
from datetime import date, datetime, timezone
from typing import Optional

import httpx

from backend import resolutions
from backend.analytics import ANALYTICS_AS_OF
from backend.database import DataStore, store
from backend.employee_experience import build_learning_track, deliver_employee_message, learning_summary
from backend.models import (
    DepartmentTrack,
    DocumentStatus,
    DocumentSubmission,
    HardwareStatus,
    ModuleStatus,
    OnboardingState,
    RoleType,
)
from backend.role_context import DOCS_BLOCKED_DAYS, JoinerFacts, access_items, joiner_facts
from backend.team_directory import work_email

TODAY = ANALYTICS_AS_OF.date()
STAGES = list(OnboardingState)

LAPTOP_TYPES = {
    "developer": "Developer laptop (16 GB, admin tooling)",
    "standard": "Standard business laptop",
}
# The iCIMS preboarding packet (same five documents the mock iCIMS tracks per new hire).
DOC_PACKET = ("Offer Letter", "Identification", "NDA", "Tax Information", "Bank Information")
IT_DESK = "IT Service Desk"
IT_DESK_ADDRESS = "it-servicedesk@smartstart.example · #it-help"

COMMS = {
    "welcome": "Welcome email",
    "doc_reminder": "Document reminder",
    "day1": "Day-1 instructions",
    "mentor_intro": "Mentor introduction",
    "first_week": "First-week check-in",
    "manager_reminder": "Manager reminder",
    "it_escalation": "IT escalation",
}

# joiner_id -> what HR decided / what was detected. Everything else is derived live.
_CASES: dict[str, dict] = {}
# Timeline of what NIA detected, routed, reminded and sent (newest last).
_LOG: list[dict] = []
_SEEN_EVENTS: set[str] = set()
_SYNC = {"at": 0.0, "ok": None}


def clear() -> None:
    _CASES.clear()
    _LOG.clear()
    _SEEN_EVENTS.clear()
    _SYNC.update(at=0.0, ok=None)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _log(joiner_id: str, kind: str, text: str, *, audience: str = "HR", to: str = "", by: str = "NIA",
         topic: str = "", manager_id: str = "", extra: Optional[dict] = None) -> dict:
    entry = {
        "id": f"LOG-{len(_LOG) + 1:05d}",
        "joiner_id": joiner_id,
        "kind": kind,
        "topic": topic,
        "audience": audience,
        "to": to,
        "manager_id": manager_id,
        "text": text,
        "by": by,
        "at": _now(),
        **(extra or {}),
    }
    _LOG.append(entry)
    return entry


def log_for(joiner_id: str) -> list[dict]:
    return [e for e in _LOG if e["joiner_id"] == joiner_id]


# --- Small phrasing helpers ---------------------------------------------------


def first(f: JoinerFacts) -> str:
    return f.joiner.name.split()[0]


def poss(name: str) -> str:
    return f"{name}'" if name.endswith("s") else f"{name}'s"


def days_to_start(f: JoinerFacts) -> int:
    return (f.joiner.joining_date - TODAY).days


def when_phrase(f: JoinerFacts) -> str:
    d = days_to_start(f)
    if d > 1:
        return f"joins in {d} days"
    if d == 1:
        return "joins tomorrow"
    if d == 0:
        return "starts today"
    return f"started {-d} day(s) ago"


def long_date(d: date) -> str:
    return f"{d.strftime('%a')} {d.day} {d.strftime('%b')}"


def position(f: JoinerFacts) -> str:
    c = _CASES.get(f.id, {})
    if c.get("position"):
        return c["position"]
    j = f.joiner
    return f"{j.department} Intern" if j.role_type == RoleType.INTERN else f"{j.department} · Full-time"


def employee_id(f: JoinerFacts) -> str:
    return f"EMP-{1000 + int(f.id.rsplit('-', 1)[-1])}"


def mentor(f: JoinerFacts) -> str:
    return _CASES.get(f.id, {}).get("mentor") or f.joiner.mentor_name


def laptop_key(f: JoinerFacts) -> str:
    c = _CASES.get(f.id, {})
    if c.get("laptop") in LAPTOP_TYPES:
        return c["laptop"]
    return "developer" if f.joiner.department_track == DepartmentTrack.TECHNICAL else "standard"


def _stage_i(f: JoinerFacts) -> int:
    return STAGES.index(f.joiner.current_state)


def _docs_done(f: JoinerFacts) -> bool:
    return f.docs.status == DocumentStatus.COMPLETE and not f.docs.rework_flag


# --- Case status ----------------------------------------------------------------

STATUS_LABELS = {
    "review": "Plan ready for review",
    "active": "In progress",
    "complete": "Ready to close",
    "closed": "Closed",
}


def case_status(f: JoinerFacts) -> str:
    c = _CASES.get(f.id, {})
    if c.get("closed_at"):
        return "closed"
    if c.get("approved_at"):
        return "complete" if f.ready else "active"
    if c.get("detected") or f.joiner.current_state == OnboardingState.OFFER_ACCEPTED:
        return "review"
    # Onboarding that started in SmartStart before NIA ran the case.
    return "complete" if f.ready else "active"


def initiated_by(f: JoinerFacts) -> str:
    c = _CASES.get(f.id, {})
    if c.get("approved_at"):
        return f"Approved by {c['approved_by']}"
    if case_status(f) == "review":
        return "Waiting for HR approval"
    return "Started in SmartStart before NIA"


# --- Plan ----------------------------------------------------------------------


def _item(key: str, label: str, status: str, detail: str = "", auto: bool = True) -> dict:
    return {"key": key, "label": label, "status": status, "detail": detail, "auto": auto}


def _hr_items(f: JoinerFacts) -> list[dict]:
    d = f.docs
    c = _CASES.get(f.id, {})
    detected = c.get("detected")
    offer = _item("offer", "Offer accepted", "done", f"iCIMS · {detected['event']}" if detected else "iCIMS")
    if d.status == DocumentStatus.PENDING:
        wait = f" · waiting {d.waiting_days}d" if d.waiting_days else ""
        docs = _item("documents", "Documents", "pending", f"Awaiting {first(f)} · {d.form_count} forms in iCIMS{wait}")
    elif d.rework_flag:
        docs = _item("documents", "Documents", "attention", f"Returned for correction — {first(f)} must resubmit")
    else:
        docs = _item("documents", "Documents", "done", f"Verified · {d.form_count} forms")
    record = (
        _item("record", "Employee record / ID", "done", f"{employee_id(f)} · iCIMS")
        if _docs_done(f)
        else _item("record", "Employee record / ID", "pending", "Created once documents are verified")
    )
    return [offer, docs, record]


def _it_items(f: JoinerFacts) -> list[dict]:
    t = f.ticket
    kit = LAPTOP_TYPES[laptop_key(f)]
    if t.hardware_status == HardwareStatus.DELIVERED:
        laptop = _item("laptop", "Laptop", "done", f"{kit} · delivered")
    elif f.sla_open:
        laptop = _item("laptop", "Laptop", "attention",
                       f"{kit} · SLA breached ({t.lead_time_days}d vs {t.sla_target_days}d) · {t.ticket_id}")
    elif t.hardware_status == HardwareStatus.CONFIGURED:
        laptop = _item("laptop", "Laptop", "active", f"{kit} · configured, shipping · {t.ticket_id}")
    elif not _docs_done(f):
        laptop = _item("laptop", "Laptop", "pending", f"{kit} · starts when documents are verified")
    else:
        laptop = _item("laptop", "Laptop", "pending", f"{kit} · requested · {t.ticket_id}")
    word = {"Granted": "done", "Provisioning": "active", "Requested": "pending"}
    access = [
        _item(f"access:{a['name']}", a["name"], word[a["status"]], a["status"])
        for a in access_items(t)
    ]
    return [laptop, *access]


def _manager_items(f: JoinerFacts) -> list[dict]:
    i = _stage_i(f)
    day1 = STAGES.index(OnboardingState.DAY1_ORIENTED)
    prov = STAGES.index(OnboardingState.IT_PROVISIONED)
    m = mentor(f)
    return [
        _item("mentor", f"Confirm mentor · {m}",
              "done" if i >= day1 else "active" if i == prov else "pending",
              "Introduced on Day 1" if i >= day1 else "Due before Day 1"),
        _item("day1", "Schedule Day-1 orientation",
              "done" if i >= day1 else "active" if i == prov else "pending",
              "Done" if i >= day1 else "Due — laptop is ready" if i == prov else "After IT setup"),
        _item("project", "Assign first project",
              "done" if f.ready else "active" if i == day1 else "pending",
              "Assigned in Jira" if f.ready else "Due — Day 1 is done" if i == day1 else "After Day 1"),
    ]


def _learning_items(f: JoinerFacts) -> list[dict]:
    word = {
        ModuleStatus.COMPLETE: "done",
        ModuleStatus.IN_PROGRESS: "active",
        ModuleStatus.AVAILABLE: "pending",
        ModuleStatus.LOCKED: "pending",
    }
    return [
        _item(f"learn:{m.id.rsplit('-MOD-', 1)[-1]}", m.title, word[m.status], f"{m.duration_minutes} min")
        for m in build_learning_track(f.id).modules
        if not m.assigned_by
    ]


def confirmations(f: JoinerFacts) -> list[dict]:
    """What NIA could not decide on its own: HR confirms these before approving."""
    c = _CASES.get(f.id, {})
    out: list[dict] = []
    if _stage_i(f) < STAGES.index(OnboardingState.DAY1_ORIENTED) and not c.get("mentor"):
        out.append({
            "key": "mentor",
            "label": "Mentor",
            "value": f.joiner.mentor_name,
            "note": f"Proposed by SmartStart for {f.joiner.department} — not confirmed yet",
        })
    if f.ticket.hardware_status == HardwareStatus.PENDING and not c.get("laptop"):
        rec = laptop_key(f)
        out.append({
            "key": "laptop",
            "label": "Laptop type",
            "value": rec,
            "options": [{"value": k, "label": v + (" (recommended)" if k == rec else "")} for k, v in LAPTOP_TYPES.items()],
            "note": f"{'Technical' if rec == 'developer' else 'Business'} role — needs confirmation before IT orders it",
        })
    return out


def build_plan(f: JoinerFacts) -> dict:
    j = f.joiner
    groups = [
        {"key": "HR", "title": "HR", "owner": "HR (People Ops)", "items": _hr_items(f)},
        {"key": "IT", "title": "IT", "owner": IT_DESK, "items": _it_items(f)},
        {"key": "Manager", "title": "Manager", "owner": j.manager_name, "items": _manager_items(f)},
        {"key": "Learning", "title": "Learning", "owner": first(f), "items": _learning_items(f)},
    ]
    conf = confirmations(f)
    conf_keys = {c["key"] for c in conf}
    for g in groups:
        for it in g["items"]:
            if it["key"] in conf_keys:
                it["auto"] = False
        g["done"] = sum(1 for it in g["items"] if it["status"] == "done")
        g["total"] = len(g["items"])
    items = [it for g in groups for it in g["items"]]
    done = sum(1 for it in items if it["status"] == "done")
    status = case_status(f)
    return {
        "joiner_id": f.id,
        "name": j.name,
        "first": first(f),
        "position": position(f),
        "role_type": j.role_type.value,
        "department": j.department,
        "track": j.department_track.value,
        "start_date": j.joining_date.isoformat(),
        "start_label": long_date(j.joining_date),
        "when": when_phrase(f),
        "manager": j.manager_name,
        "mentor": mentor(f),
        "status": status,
        "status_label": STATUS_LABELS[status],
        "initiated": initiated_by(f),
        "groups": groups,
        "confirmations": conf if status == "review" else [],
        "counts": {
            "total": len(items),
            "confirm": len(conf) if status == "review" else 0,
            "auto": len(items) - (len(conf) if status == "review" else 0),
            "done": done,
        },
        "progress_pct": round(100 * done / max(len(items), 1)),
        "detected": _CASES.get(f.id, {}).get("detected"),
    }


# --- Does HR need to care right now? ---------------------------------------------


def hr_attention(f: JoinerFacts) -> dict:
    """Separates 'incomplete' from 'needs HR': most open work belongs to IT or the manager."""
    status = case_status(f)
    n, d, t = first(f), f.docs, f.ticket
    mgr = f.joiner.manager_name
    if status == "closed":
        return {"level": "done", "headline": "Case closed.", "reason": "No outstanding actions."}
    if status == "review":
        return {"level": "action", "headline": f"Review and approve {poss(n)} onboarding plan.",
                "reason": f"Nothing has been sent to IT or {mgr} yet."}
    if status == "complete":
        return {"level": "action", "headline": "Everything is done — you can close the case.",
                "reason": f"{n} is Project Ready with no outstanding actions."}
    if d.status == DocumentStatus.PENDING:
        near = d.waiting_days >= DOCS_BLOCKED_DAYS - 1 or days_to_start(f) <= 7
        return {"level": "action",
                "headline": f"{poss(n)} documents need chasing." if near else f"Waiting on {poss(n)} documents.",
                "reason": f"{n} hasn't finished the iCIMS packet ({d.waiting_days}d so far). "
                          "IT can't start the laptop until it's verified."}
    if d.rework_flag:
        return {"level": "action", "headline": f"{n} needs to resubmit corrected documents.",
                "reason": "iCIMS returned the packet for correction, so the HR step has to be redone."}
    if f.sla_open:
        told = any(e["topic"] == "it_sla" for e in log_for(f.id))
        return {"level": "watch", "headline": f"{poss(n)} onboarding may be affected.",
                "reason": f"Laptop provisioning has breached SLA ({t.lead_time_days}d vs {t.sla_target_days}d). "
                          + ("IT has already been notified. " if told else "NIA will notify IT. ")
                          + "No HR action required yet."}
    if t.hardware_status != HardwareStatus.DELIVERED:
        return {"level": "none", "headline": "No HR action is required right now.",
                "reason": f"{poss(n)} laptop is being handled by IT and is still within SLA "
                          f"({t.lead_time_days} of {t.sla_target_days} days)."}
    if f.joiner.current_state == OnboardingState.IT_PROVISIONED:
        return {"level": "none", "headline": "No HR action is required right now.",
                "reason": f"IT is done. Day-1 orientation and the mentor intro are with {mgr}."}
    if f.joiner.current_state == OnboardingState.DAY1_ORIENTED:
        return {"level": "none", "headline": "No HR action is required right now.",
                "reason": f"Day 1 is done. {mgr} is assigning the first project in Jira."}
    return {"level": "none", "headline": "No HR action is required right now.", "reason": ""}


def journey_steps(f: JoinerFacts) -> list[dict]:
    status = {"done": "done", "active": "active", "attention": "attention", "blocked": "attention", "waiting": "pending"}
    labels = {"HR": "Documents", "IT": "IT provisioning", "Manager": "Day 1", "Project": "Project ready"}
    steps = [{"label": "Offer accepted", "status": "done", "detail": "iCIMS"}]
    reached_open = False
    for s in f.journey:
        st = status.get(s["status"], "pending")
        # Only the current step carries a warning; later steps are simply not started.
        if reached_open:
            st = "pending"
        elif st != "done":
            reached_open = True
            st = "active" if st == "pending" else st
        steps.append({"label": labels.get(s["stage"], s["label"]), "status": st, "detail": s.get("detail", "")})
    return steps


def completion(f: JoinerFacts) -> dict:
    ls = learning_summary(f.id)
    return {
        "items": [
            {"label": "Documents", "done": _docs_done(f)},
            {"label": "IT provisioning", "done": f.ticket.hardware_status == HardwareStatus.DELIVERED},
            {"label": "Day-1 orientation", "done": _stage_i(f) >= STAGES.index(OnboardingState.DAY1_ORIENTED)},
            {"label": f"Mandatory learning · {ls['completed_count']}/{ls['total_count']}",
             "done": ls["completed_count"] >= ls["total_count"], "soft": True},
            {"label": f"Mentor · {mentor(f)}", "done": _stage_i(f) >= STAGES.index(OnboardingState.DAY1_ORIENTED)},
            {"label": "First project", "done": f.ready},
        ],
        "days": f.days,
        "learning_left": max(ls["total_count"] - ls["completed_count"], 0),
    }


# --- Approve / close --------------------------------------------------------------


def approve(f: JoinerFacts, by: str, mentor_name: str = "", laptop: str = "") -> list[dict]:
    if case_status(f) != "review":
        raise ValueError("This onboarding plan is already approved.")
    c = _CASES.setdefault(f.id, {})
    if laptop and laptop not in LAPTOP_TYPES:
        raise ValueError("Pick a laptop type from the list.")
    c["laptop"] = laptop or laptop_key(f)
    c["mentor"] = (mentor_name or "").strip()[:60] or f.joiner.mentor_name
    c["approved_by"] = by
    c["approved_at"] = _now()
    n, t, j = first(f), f.ticket, f.joiner
    apps = ", ".join(a["name"] for a in access_items(t))
    routed = [
        {"team": "IT", "to": IT_DESK, "what": f"{LAPTOP_TYPES[c['laptop']]} + {apps}", "record": t.ticket_id,
         "status": "Sent to IT"},
        {"team": "Manager", "to": j.manager_name,
         "what": f"Confirm mentor {c['mentor']}, schedule Day-1 orientation, plan the first project",
         "record": "", "status": f"Sent to {j.manager_name}"},
    ]
    if f.docs.status == DocumentStatus.PENDING:
        routed.append({"team": "Employee", "to": j.name, "what": f"{f.docs.form_count} onboarding forms in iCIMS",
                       "record": employee_id(f), "status": "Awaiting employee"})
        deliver_employee_message(
            f.id, msg_id=f"case-docs-{len(_LOG) + 1}", title="Your onboarding documents are ready",
            message=f"Please complete your {f.docs.form_count} onboarding forms in iCIMS before your start date "
                    f"({long_date(j.joining_date)}).", by=by,
        )
    else:
        routed.append({"team": "Employee", "to": j.name, "what": "Document packet", "record": employee_id(f),
                       "status": "Already verified"})
    _log(f.id, "approved", f"Onboarding plan approved — mentor {c['mentor']}, {LAPTOP_TYPES[c['laptop']].lower()}",
         by=by)
    _log(f.id, "routed", f"HR approved {poss(j.name)} onboarding plan — please provision {routed[0]['what']} "
         f"({t.ticket_id}). {n} {when_phrase(f)}.", audience="IT", to=IT_DESK, topic="it_request")
    _log(f.id, "routed", f"HR approved {poss(j.name)} onboarding plan — please confirm {c['mentor']} as mentor, "
         f"schedule Day-1 orientation and plan the first project. {n} {when_phrase(f)}.", audience="Manager",
         to=j.manager_name, manager_id=j.manager_id, topic="mgr_prep")
    return routed


def close(f: JoinerFacts, by: str) -> dict:
    if case_status(f) != "complete":
        raise ValueError("Only a Project Ready case with no outstanding actions can be closed.")
    c = _CASES.setdefault(f.id, {})
    c["closed_by"] = by
    c["closed_at"] = _now()
    return _log(f.id, "closed", f"Onboarding case closed — Project Ready within {f.days} days of the offer", by=by)


# --- Follow-ups (NIA chases IT and managers, not HR) --------------------------------


def due_reminders(f: JoinerFacts) -> list[dict]:
    if case_status(f) != "active":
        return []
    out: list[dict] = []
    j, t = f.joiner, f.ticket
    n = j.name
    i = _stage_i(f)
    if _docs_done(f) and t.hardware_status != HardwareStatus.DELIVERED:
        if f.sla_open:
            out.append({"topic": "it_sla", "audience": "IT", "to": IT_DESK,
                        "text": f"{n} {when_phrase(f)}. Laptop ticket {t.ticket_id} has breached SLA "
                                f"({t.lead_time_days}d vs {t.sla_target_days}d) — please prioritise delivery."})
        elif days_to_start(f) <= 3:
            out.append({"topic": "it_laptop", "audience": "IT", "to": IT_DESK,
                        "text": f"{n} {when_phrase(f)}. Laptop provisioning is still "
                                f"{t.hardware_status.value.lower()} ({t.ticket_id})."})
    if j.current_state == OnboardingState.IT_PROVISIONED and days_to_start(f) <= 5:
        out.append({"topic": "mgr_day1", "audience": "Manager", "to": j.manager_name, "manager_id": j.manager_id,
                    "text": f"{n} {when_phrase(f)}. The laptop is ready — Day-1 orientation and the mentor intro "
                            f"({mentor(f)}) are still pending."})
    elif j.current_state == OnboardingState.DAY1_ORIENTED:
        out.append({"topic": "mgr_project", "audience": "Manager", "to": j.manager_name, "manager_id": j.manager_id,
                    "text": f"{n} has finished Day 1 and still needs a first project in Jira."})
    elif i < STAGES.index(OnboardingState.IT_PROVISIONED) and 0 <= days_to_start(f) <= 5:
        out.append({"topic": "mgr_mentor", "audience": "Manager", "to": j.manager_name, "manager_id": j.manager_id,
                    "text": f"{n} {when_phrase(f)}. Mentor confirmation ({mentor(f)}) is still pending."})
    return out


def run_followups(db: DataStore | None = None) -> None:
    """Log each due reminder once; the recipient sees it in their own NIA inbox."""
    db = db or store
    sent = {(e["joiner_id"], e["topic"]) for e in _LOG if e["kind"] in ("reminder", "routed")}
    # The routed manager-preparation request already asks for the mentor.
    sent |= {(jid, "mgr_mentor") for jid, topic in list(sent) if topic == "mgr_prep"}
    for j in db.list_joiners():
        f = joiner_facts(j, db)
        if f is None:
            continue
        for r in due_reminders(f):
            if (f.id, r["topic"]) in sent:
                continue
            _log(f.id, "reminder", r["text"], audience=r["audience"], to=r["to"], topic=r["topic"],
                 manager_id=r.get("manager_id", ""))


def inbox(role: str, manager_id: Optional[str], visible: list[JoinerFacts]) -> list[dict]:
    """Reminders and routed work addressed to this role that still apply right now."""
    audience = {"IT": "IT", "MANAGER": "Manager"}.get(role)
    if audience is None:
        return []
    by_id = {f.id: f for f in visible}
    live = {(f.id, r["topic"]) for f in visible for r in due_reminders(f)}
    out = []
    for e in reversed(_LOG):
        if e["audience"] != audience or e["joiner_id"] not in by_id:
            continue
        if manager_id and e["manager_id"] and e["manager_id"] != manager_id:
            continue
        f = by_id[e["joiner_id"]]
        if e["kind"] == "reminder" and (e["joiner_id"], e["topic"]) not in live:
            continue
        if e["topic"] == "mgr_mentor" and any(x["topic"] == "mgr_prep" for x in log_for(e["joiner_id"])):
            continue
        if e["kind"] in ("routed", "message") and (
            f.ready or (audience == "IT" and f.ticket.hardware_status == HardwareStatus.DELIVERED)
        ):
            continue
        if e["kind"] not in ("reminder", "routed", "message"):
            continue
        out.append(e)
    return out


# --- Documents ------------------------------------------------------------------------


def documents(f: JoinerFacts) -> dict:
    """The iCIMS packet as SmartStart knows it — packet-level truth, never a guessed form."""
    d = f.docs
    rows = [{"name": "Offer Letter", "status": "done", "detail": "Signed at acceptance"}]
    if d.status == DocumentStatus.PENDING:
        rows += [{"name": n, "status": "pending", "detail": "Not submitted yet"} for n in DOC_PACKET[1:]]
        action = f"{first(f)} needs to complete the packet in iCIMS ({d.form_count} forms, waiting {d.waiting_days}d)."
        state = "pending"
    elif d.rework_flag:
        rows += [{"name": n, "status": "active", "detail": "Submitted · re-check pending"} for n in DOC_PACKET[1:]]
        rows.append({"name": "Correction required", "status": "attention",
                     "detail": "iCIMS returned the packet — the flagged form is shown in iCIMS"})
        action = f"{first(f)} needs to correct and resubmit the flagged form."
        state = "rework"
    else:
        rows += [{"name": n, "status": "done", "detail": "Verified"} for n in DOC_PACKET[1:]]
        action = ""
        state = "complete"
    return {"state": state, "rows": rows, "action": action, "form_count": d.form_count,
            "employee_id": employee_id(f)}


# --- Communications (drafted by NIA, sent only after HR confirms) -----------------------


def draft(f: JoinerFacts, kind: str, sender: str) -> dict:
    j, d, t = f.joiner, f.docs, f.ticket
    n = first(f)
    sign = f"\n\nBest,\n{sender}\nPeople Ops"
    start = long_date(j.joining_date)
    to_employee = {"name": j.name, "address": j.email, "audience": "Employee"}
    if kind == "welcome":
        docs_line = (
            f"• Complete your onboarding documents in iCIMS ({d.form_count} forms)\n"
            if d.status == DocumentStatus.PENDING or d.rework_flag else "• Your documents are already verified — thank you!\n"
        )
        body = (
            f"Hi {n},\n\nWelcome aboard! We're excited to have you join {j.department} as {position(f)}. "
            f"You start on {start}, your manager is {j.manager_name}, and {mentor(f)} will be your mentor "
            f"for the first few weeks.\n\nBefore you start:\n{docs_line}"
            "• IT is preparing your laptop and access — we'll let you know when it's on the way\n"
            "• Your SmartStart workspace has your learning plan and first-week checklist\n\n"
            "If you have any questions, just reply to this email." + sign
        )
        return {"kind": kind, "to": to_employee, "subject": f"Welcome to the team, {n}!", "body": body}
    if kind == "doc_reminder":
        if d.rework_flag:
            ask = ("part of your onboarding document packet was returned for correction in iCIMS. Please review the "
                   "flagged form and resubmit it so we can complete your onboarding documentation")
        else:
            by_when = f"before {start}" if days_to_start(f) > 0 else "as soon as possible"
            ask = (f"your onboarding documents in iCIMS are still open ({d.form_count} forms). Please complete them "
                   f"so IT can set up your laptop and access {by_when}")
        body = f"Hi {n},\n\nJust a quick reminder that {ask}.\n\nIf anything is unclear, reply here and I'll help." + sign
        return {"kind": kind, "to": to_employee, "subject": "Reminder: your onboarding documents", "body": body}
    if kind == "day1":
        laptop = ("Your laptop has been delivered" if t.hardware_status == HardwareStatus.DELIVERED
                  else f"IT is finishing your laptop (ticket {t.ticket_id}) — they'll confirm pickup")
        apps = ", ".join(a["name"] for a in access_items(t))
        body = (
            f"Hi {n},\n\nHere's what to expect on your first day, {start}:\n\n"
            f"• Day-1 orientation with {j.manager_name}\n• Meet your mentor, {mentor(f)}\n"
            f"• {laptop}\n• Sign in with Okta — you'll have {apps}\n"
            "• Open SmartStart to start your learning plan\n\nSee you soon!" + sign
        )
        return {"kind": kind, "to": to_employee, "subject": f"Your first day — {start}", "body": body}
    if kind == "mentor_intro":
        body = (
            f"Hi {n},\n\nI'd like to introduce you to {mentor(f)}, who'll be your mentor while you settle in. "
            f"{mentor(f).split()[0]} can help with how the team works, who to ask for what, and anything that "
            "feels unclear in your first weeks.\n\nI've copied them here so you can find a time for a quick intro chat." + sign
        )
        return {"kind": kind, "to": {**to_employee, "cc": f"{mentor(f)} <{work_email(mentor(f))}>"},
                "subject": f"Meet your mentor, {mentor(f)}", "body": body}
    if kind == "first_week":
        ls = learning_summary(f.id)
        now_on = f" You're on {ls['current']} next." if ls["current"] else ""
        body = (
            f"Hi {n},\n\nHow is your first week going? You've completed {ls['completed_count']} of "
            f"{ls['total_count']} learning modules so far.{now_on}\n\nIs anything blocking you — access, tools, "
            f"or questions for {j.manager_name} or {mentor(f)}? Just reply and I'll sort it out." + sign
        )
        return {"kind": kind, "to": to_employee, "subject": "Checking in on your first week", "body": body}
    if kind == "manager_reminder":
        i = _stage_i(f)
        if j.current_state == OnboardingState.DAY1_ORIENTED:
            ask = f"{n} has finished Day 1 and still needs a first project. Could you assign it in Jira?"
        elif j.current_state == OnboardingState.IT_PROVISIONED:
            ask = f"{poss(n)} laptop is ready. Could you schedule Day-1 orientation and introduce {mentor(f)} as mentor?"
        elif i < STAGES.index(OnboardingState.IT_PROVISIONED):
            ask = f"{n} {when_phrase(f)}. Could you confirm {mentor(f)} as mentor and pencil in Day-1 orientation?"
        else:
            ask = f"{n} is Project Ready — thank you! Nothing is needed from you."
        body = f"Hi {j.manager_name.split()[0]},\n\n{ask}" + sign
        return {"kind": kind, "to": {"name": j.manager_name, "address": work_email(j.manager_name), "audience": "Manager"},
                "subject": f"{poss(n)} onboarding — your next step", "body": body}
    if kind == "it_escalation":
        body = (
            f"Hi team,\n\nEscalating ticket {t.ticket_id} for {j.name} ({j.department}), who {when_phrase(f)} "
            f"({start}). Hardware is {t.hardware_status.value.lower()} after {t.lead_time_days} days against a "
            f"{t.sla_target_days}-day SLA.\n\nCould you prioritise delivery and access "
            f"({', '.join(a['name'] for a in access_items(t))})? Thank you." + sign
        )
        return {"kind": kind, "to": {"name": IT_DESK, "address": IT_DESK_ADDRESS, "audience": "IT"},
                "subject": f"Escalation: {t.ticket_id} — {j.name}", "body": body}
    raise ValueError(f"Unknown message type: {kind}")


def send(f: JoinerFacts, kind: str, subject: str, body: str, by: str) -> dict:
    if kind not in COMMS:
        raise ValueError(f"Unknown message type: {kind}")
    subject = (subject or "").strip()[:140]
    body = (body or "").strip()[:4000]
    if not subject or not body:
        raise ValueError("A message needs a subject and a body.")
    to = draft(f, kind, by)["to"]
    entry = _log(
        f.id, "message", f"{COMMS[kind]} sent to {to['name']}: {subject}", audience=to["audience"], to=to["name"],
        by=by, topic=kind, manager_id=f.joiner.manager_id if to["audience"] == "Manager" else "",
        extra={"subject": subject, "body": body, "address": to["address"]},
    )
    if to["audience"] == "Employee":
        deliver_employee_message(f.id, msg_id=entry["id"], title=subject, message=body.split("\n\n", 2)[1]
                                 if body.count("\n\n") >= 2 else body, by=by)
    return entry


def sent_messages(joiner_id: str) -> list[dict]:
    return [e for e in _LOG if e["joiner_id"] == joiner_id and e["kind"] == "message"]


# --- iCIMS event ingest ----------------------------------------------------------------


def ingest_offer_accepted(payload: dict, event_key: str, db: DataStore | None = None) -> Optional[str]:
    """OFFER_ACCEPTED from iCIMS: (re)start that joiner's onboarding and open a case for HR review."""
    db = db or store
    jid = payload.get("smartstart_joiner_id")
    j = db.get_joiner(jid) if jid else None
    docs = db.get_documents(jid) if j else None
    ticket = db.get_ticket_for_joiner(jid) if j else None
    if j is None or docs is None or ticket is None:
        return None
    try:
        start = date.fromisoformat(payload.get("start_date") or "")
    except ValueError:
        start = j.joining_date
    db.upsert_bundle(
        j.model_copy(update={
            "current_state": OnboardingState.OFFER_ACCEPTED,
            "joining_date": start,
            "offer_accepted_at": ANALYTICS_AS_OF,
        }),
        DocumentSubmission(joiner_id=jid, form_count=docs.form_count, status=DocumentStatus.PENDING,
                           rework_flag=False, waiting_days=0),
        ticket.model_copy(update={
            "hardware_status": HardwareStatus.PENDING,
            "lead_time_days": 0,
            "created_at": ANALYTICS_AS_OF,
            "updated_at": ANALYTICS_AS_OF,
        }),
    )
    resolutions.forget(jid)
    event_id = event_key.split("@", 1)[0]
    _CASES[jid] = {
        "detected": {"event": event_id, "source": "iCIMS", "at": _now(), "candidate": payload.get("candidate_id", "")},
        "position": payload.get("position") or "",
    }
    _log(jid, "detected", f"Offer accepted in iCIMS ({payload.get('candidate_id', event_id)}) — onboarding case opened",
         by="iCIMS")
    return jid


def icims_url() -> str:
    return (os.environ.get("NIA_ICIMS_URL") or "http://127.0.0.1:8100").rstrip("/")


def sync_icims(force: bool = False) -> list[str]:
    """Poll the mock iCIMS event feed (best effort, throttled). Returns newly opened case ids."""
    if os.environ.get("SMARTSTART_ICIMS_SYNC", "1") == "0":
        return []
    now = time.monotonic()
    if not force and now - _SYNC["at"] < 3:
        return []
    _SYNC["at"] = now
    try:
        res = httpx.get(f"{icims_url()}/api/events", timeout=0.6)
        events = res.json().get("events", [])
    except Exception:  # noqa: BLE001 — iCIMS is an optional, separately-run app
        _SYNC["ok"] = False
        return []
    _SYNC["ok"] = True
    opened = []
    for e in sorted(events, key=lambda e: e.get("created_at", "")):
        key = f"{e.get('id')}@{e.get('created_at')}"
        if e.get("event_type") != "OFFER_ACCEPTED" or key in _SEEN_EVENTS:
            continue
        _SEEN_EVENTS.add(key)
        jid = ingest_offer_accepted(e.get("payload") or {}, key)
        if jid:
            opened.append(jid)
    return opened


def sync_state() -> Optional[bool]:
    return _SYNC["ok"]


def detected_for_review(visible: list[JoinerFacts]) -> list[JoinerFacts]:
    """Live iCIMS detections still waiting on HR, newest first."""
    rows = [f for f in visible if _CASES.get(f.id, {}).get("detected") and case_status(f) == "review"]
    return sorted(rows, key=lambda f: _CASES[f.id]["detected"]["at"], reverse=True)
