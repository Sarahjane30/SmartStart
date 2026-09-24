"""Hiring-manager side of NIA — the manager's own onboarding jobs for each joiner on their team.

HR runs the onboarding case; the manager owns the mentor, Day-1 orientation, the first project
and the first-week check-in. Everything is read from the same ``JoinerFacts`` and case record HR
sees, and every change here is confirmed by the manager before it is recorded. Documents and the
laptop are never the manager's job: NIA says who owns them and that NIA is already following up.
"""

from __future__ import annotations

import re
from datetime import date
from typing import Optional

from backend import onboarding_cases as cases
from backend import resolutions
from backend.employee_experience import deliver_employee_message, learning_summary
from backend.models import DepartmentTrack, DocumentStatus, HardwareStatus, OnboardingState
from backend.role_context import JoinerFacts
from backend.team_directory import work_email

STAGES = cases.STAGES
PROV = STAGES.index(OnboardingState.IT_PROVISIONED)
DAY1 = STAGES.index(OnboardingState.DAY1_ORIENTED)
TIME_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")

PROJECT_IDEAS = {
    DepartmentTrack.TECHNICAL: (
        "Starter bugs on the team backlog",
        "Small internal tooling improvement",
        "Docs and test coverage for one service",
    ),
    DepartmentTrack.NON_TECHNICAL: (
        "Own one weekly team report",
        "Process improvement mini-project",
        "Customer research summary",
    ),
}

COMMS = {
    "mgr_welcome": "Welcome note",
    "mgr_day1": "Day-1 agenda",
    "mgr_mentor_intro": "Mentor introduction",
    "mgr_first_week": "First-week check-in",
}

first, poss, long_date, when_phrase, days_to_start = (
    cases.first, cases.poss, cases.long_date, cases.when_phrase, cases.days_to_start,
)


def stage_index(f: JoinerFacts) -> int:
    return STAGES.index(f.joiner.current_state)


def prep(f: JoinerFacts) -> dict:
    return cases._CASES.get(f.id, {}).get("mgr", {})


def _prep_w(f: JoinerFacts) -> dict:
    return cases._CASES.setdefault(f.id, {}).setdefault("mgr", {})


def jira_key(f: JoinerFacts) -> str:
    return f"ONB-{int(f.id.rsplit('-', 1)[-1])}"


def project_ideas(f: JoinerFacts) -> list[str]:
    return list(PROJECT_IDEAS.get(f.joiner.department_track, PROJECT_IDEAS[DepartmentTrack.NON_TECHNICAL]))


def _sent(f: JoinerFacts, kind: str) -> bool:
    return any(e["topic"] == kind for e in cases.sent_messages(f.id))


def day1_label(f: JoinerFacts) -> str:
    b = prep(f).get("day1")
    return f"{long_date(date.fromisoformat(b['date']))} at {b['time']}" if b else ""


# --- The manager's checklist ---------------------------------------------------------


def _task(key: str, label: str, status: str, detail: str, cta_label: str = "", cta_q: str = "") -> dict:
    return {"key": key, "label": label, "status": status, "detail": detail, "cta_label": cta_label, "cta_q": cta_q}


def tasks(f: JoinerFacts) -> list[dict]:
    """status: done · booked (you did your part, it hasn't happened yet) · todo (yours, now) · later."""
    n, name, i, p = first(f), f.joiner.name, stage_index(f), prep(f)
    m = cases.mentor(f)
    out = []
    if i >= DAY1:
        out.append(_task("mentor", f"Mentor · {m}", "done", "Introduced on Day 1"))
    elif p.get("mentor"):
        out.append(_task("mentor", f"Mentor · {m}", "done", "Confirmed by you"))
    elif i >= PROV or days_to_start(f) <= 7:
        out.append(_task("mentor", f"Confirm mentor · {m}", "todo", "Due before Day 1",
                         "Confirm mentor", f"Confirm {m} as {poss(name)} mentor"))
    else:
        out.append(_task("mentor", f"Confirm mentor · {m}", "later", f"Due the week before {n} starts",
                         "Confirm early", f"Confirm {m} as {poss(name)} mentor"))

    if i >= DAY1:
        out.append(_task("day1", "Day-1 orientation", "done", "Done"))
    elif p.get("day1"):
        out.append(_task("day1", "Day-1 orientation", "booked", f"Booked {day1_label(f)}",
                         "Change", f"Schedule {poss(name)} Day-1 orientation"))
    elif i == PROV:
        out.append(_task("day1", "Book Day-1 orientation", "todo", "Laptop is ready",
                         "Book Day 1", f"Schedule {poss(name)} Day-1 orientation"))
    else:
        out.append(_task("day1", "Book Day-1 orientation", "later", "Laptop is still with IT — you can book it early",
                         "Book early", f"Schedule {poss(name)} Day-1 orientation"))

    proj = p.get("project")
    if f.ready:
        out.append(_task("project", "First project", "done", proj["name"] if proj else "Working on it in Jira"))
    elif proj:
        out.append(_task("project", "First project", "booked", f"{proj['name']} · finish the ticket in Jira ({jira_key(f)})"))
    elif i == DAY1:
        out.append(_task("project", "Assign first project", "todo", f"Day 1 is done — {n} is waiting for work",
                         "Assign project", f"Assign a first project for {name}"))
    else:
        out.append(_task("project", "Assign first project", "later", "After Day 1",
                         "Plan early", f"Assign a first project for {name}"))

    if _sent(f, "mgr_first_week") or _sent(f, "first_week"):
        out.append(_task("first_week", "First-week check-in", "done", "Sent"))
    elif i >= DAY1:
        out.append(_task("first_week", "First-week check-in", "todo", f"Ask {n} how week 1 is going",
                         "Draft check-in", f"Draft a first-week check-in for {name}"))
    else:
        out.append(_task("first_week", "First-week check-in", "later", "After Day 1"))

    ls = learning_summary(f.id)
    done = ls["completed_count"] >= ls["total_count"]
    extra = f" · {len(ls['overdue'])} overdue" if ls.get("overdue") else ""
    out.append(_task("learning", "Learning", "done" if done else "info",
                     f"{ls['completed_count']}/{ls['total_count']} modules{extra}",
                     "" if done else "View", "" if done else f"How is {poss(name)} learning going?"))
    return out


def todo(f: JoinerFacts) -> list[dict]:
    return [t for t in tasks(f) if t["status"] == "todo"]


def others_step(f: JoinerFacts) -> Optional[dict]:
    """Who owns the joiner's current step when it isn't the manager."""
    n, d, t = first(f), f.docs, f.ticket
    if d.status == DocumentStatus.PENDING:
        return {"owner": "HR", "level": "none", "short": "documents with HR",
                "reason": f"HR is waiting on {poss(n)} documents ({d.waiting_days}d so far). NIA is reminding {n} — you don't need to chase."}
    if d.rework_flag:
        return {"owner": "HR", "level": "none", "short": "document correction with HR",
                "reason": f"{n} is correcting a document for HR. NIA and HR are handling it."}
    if f.sla_open:
        told = any(e["topic"] == "it_sla" for e in cases.log_for(f.id))
        return {"owner": "IT", "level": "watch", "short": "laptop late (SLA breached)",
                "reason": f"IT is past the laptop SLA ({t.lead_time_days}d vs {t.sla_target_days}d). "
                          + ("NIA has already told IT" if told else "NIA is following up with IT")
                          + " — you don't need to chase, but Day 1 may need to move."}
    if t.hardware_status != HardwareStatus.DELIVERED:
        return {"owner": "IT", "level": "none", "short": "laptop with IT",
                "reason": f"IT is setting up {poss(n)} laptop and access — within SLA ({t.lead_time_days} of {t.sla_target_days} days)."}
    return None


def attention(f: JoinerFacts) -> dict:
    """The manager's version of 'do I need to care right now?'."""
    n = first(f)
    if f.ready:
        return {"level": "done", "headline": f"Nothing needed — {n} is Project Ready.", "reason": ""}
    mine = [t for t in todo(f) if t["key"] != "first_week"]
    other = others_step(f)
    if mine:
        words = {"mentor": f"confirm {cases.mentor(f)} as mentor", "day1": "book Day-1 orientation",
                 "project": "assign the first project"}
        asks = [words[t["key"]] for t in mine if t["key"] in words]
        head = "Your part: " + " and ".join(asks) + "."
        reason = other["reason"] if other else {
            PROV: f"IT is done — {n} {when_phrase(f)}.",
            DAY1: f"Day 1 is done — {n} is waiting for a first project.",
        }.get(stage_index(f), f"{n} {when_phrase(f)}.")
        return {"level": "action", "headline": head[0].upper() + head[1:], "reason": reason}
    if other:
        return {"level": other["level"], "headline": "Nothing needed from you right now." if other["level"] == "none"
                else f"{poss(n)} laptop is late.", "reason": other["reason"]}
    if prep(f).get("project"):
        return {"level": "none", "headline": "Project assigned — nothing else needed.",
                "reason": f"Finish the ticket in Jira ({jira_key(f)}) so {n} shows as Project Ready."}
    if prep(f).get("day1"):
        return {"level": "none", "headline": "You're set for Day 1.",
                "reason": f"Booked {day1_label(f)} with mentor {cases.mentor(f)}."}
    return {"level": "none", "headline": "Nothing needed from you right now.", "reason": ""}


# --- Team agenda and nudges ---------------------------------------------------------------

_URGENCY = {"project": 0, "day1": 1, "mentor": 2, "first_week": 3}


def agenda(visible: list[JoinerFacts], queue: Optional[list[JoinerFacts]] = None) -> dict:
    """``queue`` is the Command Center action queue; its order leads so NIA and the dashboard agree."""
    rank = {f.id: i for i, f in enumerate(queue or [])}
    needs, others, booked, ready = [], [], [], []
    for f in visible:
        if f.ready:
            ready.append(f)
            continue
        mine = sorted(todo(f), key=lambda t: _URGENCY.get(t["key"], 9))
        if mine:
            top = mine[0]
            needs.append({
                "joiner_id": f.id, "name": f.joiner.name, "key": top["key"],
                "task": " · ".join(t["label"] for t in mine),
                "detail": f"{top['detail']} · {when_phrase(f)}",
                "actions": [{"key": t["key"], "label": t["cta_label"], "q": t["cta_q"]} for t in mine if t["cta_q"]][:2],
                "cta_label": top["cta_label"], "cta_q": top["cta_q"],
                "_sort": (rank.get(f.id, len(rank)), _URGENCY.get(top["key"], 9), days_to_start(f)),
            })
        o = others_step(f)
        if o:
            others.append({"joiner_id": f.id, "name": f.joiner.name, "owner": o["owner"], "detail": o["short"],
                           "level": o["level"]})
        elif not mine:
            booked.append(f)
    needs.sort(key=lambda r: r.pop("_sort"))
    return {
        "needs": needs,
        "others": others,
        "booked": [{"joiner_id": f.id, "name": f.joiner.name, "detail": attention(f)["headline"]} for f in booked],
        "ready": [f.joiner.name for f in ready],
        "task_count": sum(len(todo(f)) for f in visible if not f.ready),
    }


def nudges(visible: list[JoinerFacts], manager_id: Optional[str], queue: Optional[list[JoinerFacts]] = None) -> list[dict]:
    """At most two: a joiner HR just handed over, then the most urgent task that is yours."""
    out = []
    by_id = {f.id: f for f in visible}
    for e in reversed(cases._LOG):
        if len(out) >= 1:
            break
        if e["kind"] != "routed" or e["topic"] != "mgr_prep" or e["joiner_id"] not in by_id:
            continue
        if manager_id and e["manager_id"] and e["manager_id"] != manager_id:
            continue
        f = by_id[e["joiner_id"]]
        if f.ready or not [t for t in todo(f) if t["key"] in ("mentor", "day1")]:
            continue
        out.append({
            "id": f"mgr-new-{e['id']}", "joiner_id": f.id, "kind": "task",
            "title": "New joiner on your team",
            "text": f"{f.joiner.name} ({cases.position(f)}) {when_phrase(f)}. HR has started onboarding — "
                    f"your part is to confirm {cases.mentor(f)} as mentor and book Day-1 orientation.",
            "cta_label": "See my tasks", "cta_q": f"What do I need to do for {f.joiner.name}?",
        })
    seen = {o["joiner_id"] for o in out}
    for r in agenda(visible, queue)["needs"]:
        if len(out) >= 2:
            break
        if r["joiner_id"] in seen or r["key"] == "first_week":
            continue
        f = by_id[r["joiner_id"]]
        n = first(f)
        text = {
            "project": f"{f.joiner.name} finished Day 1 and is waiting for a first project.",
            "day1": f"{poss(f.joiner.name)} laptop is ready — {n} {when_phrase(f)}. Book Day-1 orientation.",
            "mentor": f"{f.joiner.name} {when_phrase(f)}. Confirm {cases.mentor(f)} as {poss(n)} mentor.",
        }[r["key"]]
        out.append({"id": f"mgr-{r['key']}-{f.id}", "joiner_id": f.id, "kind": "task", "text": text,
                    "cta_label": r["cta_label"], "cta_q": r["cta_q"]})
        seen.add(f.id)
    return out


# --- Actions (each confirmed by the manager in NIA first) ------------------------------------


def _employee(f: JoinerFacts, entry: dict, title: str, message: str, by: str) -> None:
    deliver_employee_message(f.id, msg_id=entry["id"], title=title, message=message, by=by)


def confirm_mentor(f: JoinerFacts, by: str, name: str = "") -> dict:
    if stage_index(f) >= DAY1:
        raise ValueError(f"{first(f)} already met their mentor on Day 1.")
    name = " ".join((name or cases.mentor(f)).split())[:60]
    if len(name) < 3:
        raise ValueError("Enter the mentor's full name.")
    _prep_w(f)["mentor"] = {"name": name, "by": by, "at": cases._now()}
    cases._CASES[f.id]["mentor"] = name
    entry = cases._log(f.id, "prep", f"{by} confirmed {name} as {poss(f.joiner.name)} mentor", by=by, topic="mgr_mentor",
                       audience="HR")
    _employee(f, entry, "Meet your mentor", f"{name} will be your mentor while you settle in. {by} will introduce you.", by)
    return entry


def book_day1(f: JoinerFacts, by: str, day: date, time: str) -> dict:
    if stage_index(f) >= DAY1:
        raise ValueError(f"{poss(first(f))} Day-1 orientation has already happened.")
    if day < cases.TODAY:
        raise ValueError("Pick today or a later date.")
    if not TIME_RE.match(time or ""):
        raise ValueError("Use a 24-hour time like 10:00.")
    _prep_w(f)["day1"] = {"date": day.isoformat(), "time": time, "by": by, "at": cases._now()}
    label = f"{long_date(day)} at {time}"
    entry = cases._log(f.id, "prep", f"{by} booked {poss(f.joiner.name)} Day-1 orientation for {label}", by=by,
                       topic="mgr_day1", audience="HR")
    _employee(f, entry, "Your Day-1 orientation is booked",
              f"{by} booked your Day-1 orientation for {label}. Your mentor, {cases.mentor(f)}, will join too.", by)
    return entry


def assign_project(f: JoinerFacts, by: str, name: str) -> dict:
    if f.ready:
        raise ValueError(f"{first(f)} is already working on a first project.")
    name = " ".join((name or "").split())[:80]
    if len(name) < 3:
        raise ValueError("Give the project a short name.")
    _prep_w(f)["project"] = {"name": name, "by": by, "at": cases._now()}
    if f.joiner.current_state == OnboardingState.DAY1_ORIENTED and f.queue == "Manager" and f.bottleneck:
        resolutions.resolve(f.id, "Manager", f.bottleneck, by, "MANAGER", f"First project: {name}",
                            "Project assignment pending")
    entry = cases._log(f.id, "prep", f"{by} assigned {poss(f.joiner.name)} first project: {name}", by=by,
                       topic="mgr_project", audience="HR")
    _employee(f, entry, "Your first project", f"{by} picked your first project: {name}. Details follow in Jira ({jira_key(f)}).", by)
    return entry


# --- Messages in the manager's own voice ----------------------------------------------------


def draft(f: JoinerFacts, kind: str, sender: str) -> dict:
    j, n = f.joiner, first(f)
    me = sender.split()[0]
    m = cases.mentor(f)
    sign = f"\n\nSee you soon,\n{sender}"
    to = {"name": j.name, "address": j.email, "audience": "Employee"}
    start = long_date(j.joining_date)
    started = days_to_start(f) <= 0
    if kind == "mgr_welcome":
        body = (
            f"Hi {n},\n\nI'm {me}, your manager in {j.department} — really glad you're joining us"
            + (f" on {start}" if not started else "")
            + f". {m} will be your mentor for the first few weeks, and I'll run your Day-1 orientation myself.\n\n"
            "HR and IT will get your documents, laptop and access sorted, so you don't need to chase anyone. "
            "If anything feels unclear before you start, just reply to me." + sign
        )
        return {"kind": kind, "to": to, "subject": f"Welcome to the team, {n}!", "body": body}
    if kind == "mgr_day1":
        when = day1_label(f) or start
        body = (
            f"Hi {n},\n\nHere's the plan for your first day ({when}):\n\n"
            f"• Welcome and team intro with me\n• Meet your mentor, {m}\n"
            "• Laptop sign-in and a quick tour of the tools\n• Walk through your first-week checklist in SmartStart\n"
            "• Chat about your first project\n\nNo prep needed — just bring questions." + sign
        )
        return {"kind": kind, "to": to, "subject": f"Your first day — {when}", "body": body}
    if kind == "mgr_mentor_intro":
        body = (
            f"Hi {n},\n\nI'd like to introduce {m}, who'll be your mentor while you settle in. "
            f"{m.split()[0]} knows how the team works and is the best person for 'who do I ask about…' questions.\n\n"
            "I've copied them here — grab 20 minutes this week for an intro chat." + sign
        )
        return {"kind": kind, "to": {**to, "cc": f"{m} <{work_email(m)}>"}, "subject": f"Meet your mentor, {m}", "body": body}
    if kind == "mgr_first_week":
        ls = learning_summary(f.id)
        proj = prep(f).get("project")
        body = (
            f"Hi {n},\n\nHow's your first week going? You've done {ls['completed_count']} of {ls['total_count']} "
            "learning modules so far"
            + (f", and you're getting started on {proj['name']}" if proj else "")
            + f".\n\nIs anything slowing you down — access, tools, or questions for {m} or me? "
            "Let's cover it in our next 1:1." + sign
        )
        return {"kind": kind, "to": to, "subject": "How's week one going?", "body": body}
    raise ValueError(f"Unknown message type: {kind}")


def send(f: JoinerFacts, kind: str, subject: str, body: str, by: str) -> dict:
    if kind not in COMMS:
        raise ValueError(f"Unknown message type: {kind}")
    subject, body = (subject or "").strip()[:140], (body or "").strip()[:4000]
    if not subject or not body:
        raise ValueError("A message needs a subject and a body.")
    to = draft(f, kind, by)["to"]
    entry = cases._log(f.id, "message", f"{COMMS[kind]} sent to {to['name']} by {by}: {subject}", audience="Employee",
                       to=to["name"], by=by, topic=kind, extra={"subject": subject, "body": body, "address": to["address"]})
    parts = body.split("\n\n")
    _employee(f, entry, subject, parts[1] if len(parts) >= 3 else body, by)
    return entry
