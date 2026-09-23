"""IRA / SmartStart intelligence helpers — blockers, briefing, next action, what-if.

Builds on existing store + predictor + knowledge. No autonomous writes.
"""

from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any, Optional

from backend.database import DataStore, store
from backend.employee_experience import build_learning_track
from backend.knowledge import (
    KnowledgeEntity,
    explain_entity,
    find_entities,
    format_source,
    get_entity,
    role_recommended_apps,
)
from backend.models import (
    DocumentStatus,
    HardwareStatus,
    OnboardingState,
    RoleType,
)
from backend.predictor import build_predictions

AS_OF = datetime(2026, 9, 15, 12, 0, 0, tzinfo=timezone.utc)


def _pretty_date(value: Any) -> str:
    try:
        d = date.fromisoformat(str(value)[:10])
        return f"{d.strftime('%B')} {d.day}, {d.year}"
    except Exception:
        return str(value)


def build_blockers(joiner_id: str, db: DataStore | None = None) -> list[dict[str, Any]]:
    """Multi-blocker list from docs / IT / learning / project state."""
    db = db or store
    joiner = db.get_joiner(joiner_id)
    docs = db.get_documents(joiner_id)
    ticket = db.get_ticket_for_joiner(joiner_id)
    if joiner is None or docs is None or ticket is None:
        return []
    learning = build_learning_track(joiner_id, db=db)
    blockers: list[dict[str, Any]] = []

    if docs.status != DocumentStatus.COMPLETE or docs.rework_flag:
        blockers.append(
            {
                "id": "docs",
                "title": "Onboarding documents",
                "status": docs.status.value + (" (rework)" if docs.rework_flag else ""),
                "owner": "HR Operations",
                "system": "iCIMS",
                "severity": "high" if docs.status == DocumentStatus.PENDING else "medium",
                "next_action": "Complete / verify your iCIMS document packet",
                "action_label": "Open document packet",
            }
        )

    if ticket.hardware_status != HardwareStatus.DELIVERED:
        blockers.append(
            {
                "id": "laptop",
                "title": "Laptop provisioning",
                "status": ticket.hardware_status.value,
                "owner": "IT Service Desk",
                "system": "ServiceNow",
                "ticket_id": ticket.ticket_id,
                "severity": "high" if ticket.sla_breached else "medium",
                "next_action": f"Wait for hardware ({ticket.hardware_status.value}) on {ticket.ticket_id}",
                "action_label": "View IT ticket",
                "sla_breached": ticket.sla_breached,
            }
        )

    incomplete = [
        m
        for m in learning.modules
        if m.status.value in {"available", "in_progress"}
        and ("git" in m.title.lower() or m.category in {"Engineering Foundations", "Engineering"})
    ]
    if incomplete and joiner.current_state in {
        OnboardingState.IT_PROVISIONED,
        OnboardingState.DAY1_ORIENTED,
        OnboardingState.PROJECT_READY,
    }:
        mod = incomplete[0]
        blockers.append(
            {
                "id": "learning-git",
                "title": mod.title,
                "status": mod.status.value,
                "owner": "You / Learning & Development",
                "system": "SmartStart Learning",
                "severity": "medium",
                "next_action": f"Complete {mod.title} (~{mod.duration_minutes} min)",
                "action_label": f"Start {mod.title}",
            }
        )

    if joiner.current_state != OnboardingState.PROJECT_READY:
        if joiner.current_state in {
            OnboardingState.DAY1_ORIENTED,
            OnboardingState.IT_PROVISIONED,
        }:
            blockers.append(
                {
                    "id": "jira-project",
                    "title": "Jira project access",
                    "status": "Pending",
                    "owner": joiner.manager_name or "Project Manager",
                    "system": "Jira",
                    "severity": "high"
                    if joiner.current_state == OnboardingState.DAY1_ORIENTED
                    else "medium",
                    "next_action": (
                        f"Wait for project assignment / approval"
                        + (f" from {joiner.manager_name}" if joiner.manager_name else "")
                    ),
                    "action_label": "View request",
                }
            )

    return blockers


def build_next_best_actions(
    joiner_id: str, db: DataStore | None = None, *, limit: int = 3
) -> list[dict[str, Any]]:
    blockers = build_blockers(joiner_id, db=db)
    actions: list[dict[str, Any]] = []
    for b in blockers:
        if "Wait for" in b["next_action"] and b.get("id") == "jira-project":
            actions.append(
                {
                    "priority": len(actions) + 1,
                    "title": b["title"],
                    "detail": b["next_action"],
                    "kind": "wait",
                    "action_label": b.get("action_label"),
                }
            )
        elif "Wait for" in b["next_action"]:
            actions.append(
                {
                    "priority": len(actions) + 1,
                    "title": b["title"],
                    "detail": b["next_action"],
                    "kind": "wait",
                    "action_label": b.get("action_label"),
                }
            )
        else:
            actions.append(
                {
                    "priority": len(actions) + 1,
                    "title": b["title"],
                    "detail": b["next_action"],
                    "kind": "do",
                    "action_label": b.get("action_label"),
                }
            )
        if len(actions) >= limit:
            break

    if not actions:
        actions.append(
            {
                "priority": 1,
                "title": "You're on track",
                "detail": "No open blockers on your approved record right now.",
                "kind": "ok",
                "action_label": None,
            }
        )
    # Prefer actionable "do" items first
    actions.sort(key=lambda a: (0 if a["kind"] == "do" else 1 if a["kind"] == "wait" else 2, a["priority"]))
    for i, a in enumerate(actions, start=1):
        a["priority"] = i
    return actions[:limit]


def build_briefing(joiner_id: str, db: DataStore | None = None) -> dict[str, Any]:
    db = db or store
    joiner = db.get_joiner(joiner_id)
    docs = db.get_documents(joiner_id)
    ticket = db.get_ticket_for_joiner(joiner_id)
    if joiner is None or docs is None or ticket is None:
        raise KeyError(joiner_id)
    learning = build_learning_track(joiner_id, db=db)
    blockers = build_blockers(joiner_id, db=db)
    actions = build_next_best_actions(joiner_id, db=db)

    progress = {
        OnboardingState.OFFER_ACCEPTED: 15,
        OnboardingState.DOCS_SUBMITTED: 35,
        OnboardingState.IT_PROVISIONED: 55,
        OnboardingState.DAY1_ORIENTED: 75,
        OnboardingState.PROJECT_READY: 100,
    }.get(joiner.current_state, 0)

    done = []
    pending = []
    if docs.status == DocumentStatus.COMPLETE and not docs.rework_flag:
        done.append("HR documents")
    else:
        pending.append("HR documents")
    if ticket.hardware_status == HardwareStatus.DELIVERED:
        done.append("Laptop")
    else:
        pending.append(f"Laptop ({ticket.hardware_status.value})")
    if ticket.software_access:
        done.append("Core software listed")
    if joiner.current_state in {
        OnboardingState.IT_PROVISIONED,
        OnboardingState.DAY1_ORIENTED,
        OnboardingState.PROJECT_READY,
    }:
        done.append("IT account path")
    else:
        pending.append("IT provisioning")

    today = [a for a in actions if a["kind"] == "do"]
    waiting = [a for a in actions if a["kind"] == "wait"]

    return {
        "greeting_name": joiner.name.split()[0],
        "progress_pct": progress,
        "state": joiner.current_state.value,
        "done": done,
        "pending_flags": pending,
        "today": today,
        "waiting": waiting,
        "blockers": blockers,
        "learning_next": [
            m.title
            for m in learning.modules
            if m.status.value in {"available", "in_progress"}
        ][:3],
        "joining_date": joiner.joining_date.isoformat(),
        "manager_name": joiner.manager_name,
        "mentor_name": joiner.mentor_name,
        "on_track": len([b for b in blockers if b["severity"] == "high"]) == 0,
    }


def build_risk_summary(joiner_id: str, db: DataStore | None = None) -> dict[str, Any]:
    pred = build_predictions(joiner_id, db=db)
    top = pred.alerts[0] if pred.alerts else None
    return {
        "overall_risk_score": pred.overall_risk_score,
        "overall_risk_level": pred.overall_risk_level.value,
        "top_alert": None
        if top is None
        else {
            "title": top.title,
            "category": top.category,
            "message": top.message,
            "risk_score": top.risk_score,
            "risk_level": top.risk_level.value,
            "drivers": list(top.drivers),
            "recommended_action": top.recommended_action,
        },
        "alerts": [
            {
                "title": a.title,
                "category": a.category,
                "risk_score": a.risk_score,
                "risk_level": a.risk_level.value,
                "drivers": list(a.drivers),
                "recommended_action": a.recommended_action,
            }
            for a in pred.alerts[:3]
        ],
    }


def explain_what_if(query: str, joiner_id: str, db: DataStore | None = None) -> Optional[str]:
    """Consequences grounded only in synthetic rules — never invent severity."""
    q = query.lower()
    db = db or store
    joiner = db.get_joiner(joiner_id)
    if joiner is None:
        return None
    learning = build_learning_track(joiner_id, db=db)
    git_mod = next((m for m in learning.modules if "git" in m.title.lower()), None)

    if "git" in q:
        status = git_mod.status.value if git_mod else "not on your track"
        return (
            f"Git Basics is part of project-readiness for engineering-related tracks.\n"
            f"On your record, Git Basics is currently: {status}.\n"
            "If you don’t complete it, that learning requirement stays incomplete on your "
            "onboarding record. Project access itself is not automatically removed — but "
            "managers typically expect Git Basics before repository work.\n"
            "[Start Git Basics]\n"
            "Source: SmartStart Learning"
        )

    if "laptop" in q or "hardware" in q:
        ticket = db.get_ticket_for_joiner(joiner_id)
        if not ticket:
            return None
        return (
            f"Your laptop is tracked on ServiceNow {ticket.ticket_id} "
            f"(status: {ticket.hardware_status.value}).\n"
            "If hardware isn’t Delivered by Day 1, orientation can proceed for some sessions, "
            "but tool setup and VPN may be delayed until delivery — based on the IT provisioning process.\n"
            "Source: ServiceNow (mock)"
        )

    if "leave" in q:
        return (
            "If leave isn’t approved, it simply remains pending with your manager — "
            "IRA won’t invent payroll or attendance penalties. Check status in the HR Portal.\n"
            "Source: Leave & Attendance Guide · HR Operations"
        )

    if "train" in q or "learning" in q or "module" in q:
        return (
            "Required modules that stay incomplete remain open on your learning track and "
            "can block project-readiness signals. Optional modules do not remove system access.\n"
            "Source: SmartStart Learning"
        )

    return None


def format_briefing_text(brief: dict[str, Any]) -> str:
    name = brief["greeting_name"]
    lines = [
        f"Good day, {name}.",
        "",
        "ONBOARDING",
        f"{brief['progress_pct']}% complete · {brief['state'].replace('_', ' ')}",
    ]
    if brief["done"]:
        lines.append("✓ " + " · ".join(brief["done"]))
    lines.append("")
    lines.append("TODAY")
    if brief["today"]:
        for a in brief["today"]:
            lines.append(f"→ {a['title']}: {a['detail']}")
            if a.get("action_label"):
                lines.append(f"  [{a['action_label']}]")
    else:
        lines.append("→ No urgent do-it-now items on record")
    if brief["waiting"]:
        lines.append("")
        lines.append("PENDING (no action needed from you right now)")
        for a in brief["waiting"]:
            lines.append(f"⚠ {a['title']}: {a['detail']}")
    lines.append("")
    lines.append("You're on track." if brief["on_track"] else "A few items need attention — see above.")
    lines.append("Source: SmartStart · Employee onboarding record")
    return "\n".join(lines)


def format_blockers_text(blockers: list[dict[str, Any]], *, project_focus: bool = False) -> str:
    if not blockers:
        return (
            "I don’t see open blockers on your approved record — you're clear on the "
            "tracked readiness signals.\nSource: SmartStart"
        )
    title = "PROJECT READINESS" if project_focus else "WHAT’S BLOCKING YOU"
    lines = [title, ""]
    for b in blockers:
        mark = "⚠" if b["severity"] in {"high", "medium"} else "•"
        lines.append(f"{mark} {b['title']} — {b['status']}")
        lines.append(f"  Owner: {b['owner']} · System: {b['system']}")
        if b.get("ticket_id"):
            lines.append(f"  Ticket: {b['ticket_id']}")
        lines.append(f"  Next: {b['next_action']}")
        if b.get("action_label"):
            lines.append(f"  [{b['action_label']}]")
        lines.append("")
    primary = blockers[0]
    lines.append(f"Current primary blocker: {primary['title']}")
    lines.append("Source: SmartStart (iCIMS / ServiceNow / Jira via onboarding record)")
    return "\n".join(lines)


def format_next_actions_text(actions: list[dict[str, Any]], progress_pct: int) -> str:
    if not any(a["kind"] in {"do", "wait"} for a in actions):
        return (
            f"You're {progress_pct}% through onboarding and there's nothing waiting on you right now.\n"
            "Good next steps: review your week-1 checklist with your manager, or ask me about "
            "policies, apps, or your learning plan.\n"
            "Source: SmartStart · Employee onboarding record"
        )
    lines = [f"You're about {progress_pct}% through onboarding on record.", ""]
    lines.append("Next priorities:")
    for a in actions:
        kind = a["kind"]
        prefix = "→" if kind == "do" else ("⏳" if kind == "wait" else "✓")
        lines.append(f"{a['priority']}. {prefix} {a['title']}")
        lines.append(f"   {a['detail']}")
        if a.get("action_label") and kind == "do":
            lines.append(f"   [{a['action_label']}]")
    lines.append("")
    lines.append("Source: SmartStart · Employee onboarding record")
    return "\n".join(lines)


def format_risk_text(risk: dict[str, Any]) -> str:
    top = risk.get("top_alert")
    if not top:
        return "I don’t see elevated synthetic risk signals on your record right now."
    lines = [
        f"⚠ {top['title']} ({top['risk_level']} · score {top['risk_score']:.0f})",
        "",
        "Why:",
    ]
    for d in top.get("drivers") or []:
        lines.append(f"• {d}")
    lines.append("")
    lines.append(f"Recommended: {top['recommended_action']}")
    lines.append("Source: SmartStart predictive risk (synthetic)")
    return "\n".join(lines)


def format_project_ready_text(
    joiner_id: str, db: DataStore | None = None
) -> str:
    db = db or store
    joiner = db.get_joiner(joiner_id)
    docs = db.get_documents(joiner_id)
    ticket = db.get_ticket_for_joiner(joiner_id)
    assert joiner and docs and ticket
    blockers = build_blockers(joiner_id, db=db)
    actions = build_next_best_actions(joiner_id, db=db, limit=2)

    checks = [
        ("HR onboarding / documents", docs.status == DocumentStatus.COMPLETE and not docs.rework_flag),
        ("Laptop", ticket.hardware_status == HardwareStatus.DELIVERED),
        ("IT software listed", bool(ticket.software_access)),
        ("Jira / project access", joiner.current_state == OnboardingState.PROJECT_READY),
    ]
    learning = build_learning_track(joiner_id, db=db)
    git = next((m for m in learning.modules if "git" in m.title.lower()), None)
    if git:
        checks.append(("Git Basics", git.status.value == "completed"))

    lines = ["You're almost ready." if any(not ok for _, ok in checks) else "You're project-ready on record.", ""]
    for label, ok in checks:
        lines.append(f"{'✓' if ok else '⚠'} {label}")
    open_b = [b for b in blockers if b["id"] in {"jira-project", "learning-git", "laptop", "docs"}]
    if open_b:
        lines.append("")
        lines.append("Because these are required for your project, you're not fully project-ready yet.")
        for b in open_b[:3]:
            lines.append(f"• {b['title']}: {b['next_action']}")
    do_now = [a for a in actions if a["kind"] == "do"]
    if do_now:
        lines.append("")
        lines.append(f"Next best action: {do_now[0]['detail']}")
        if do_now[0].get("action_label"):
            lines.append(f"[{do_now[0]['action_label']}]")
    lines.append("Source: SmartStart · cross-system readiness (iCIMS / ServiceNow / Jira)")
    return "\n".join(lines)


def personalize_knowledge_answer(
    ent: KnowledgeEntity, ctx: dict[str, Any]
) -> str:
    """Blend catalog knowledge with this employee's record when relevant."""
    emp = ctx.get("employee") or {}
    it = ctx.get("it") or {}
    onb = ctx.get("onboarding") or {}
    blockers = ctx.get("intelligence", {}).get("blockers") or []
    role = emp.get("role_type") or ""
    role_label = "Intern" if str(role).upper() == "INTERN" else "FTE"

    # Jira / access — personal status
    if ent.id in {"app-jira", "proc-jira-access", "proc-it-access"}:
        jira_b = next((b for b in blockers if b.get("id") == "jira-project"), None)
        software = it.get("software_access") or []
        has_jira = any("jira" in s.lower() for s in software)
        if has_jira and not jira_b:
            return (
                f"{ent.summary}\n\n"
                f"On your record, Jira-related software access is already listed "
                f"({', '.join(software)}).\n"
                f"Manager on record: {emp.get('manager_name') or '—'}.\n"
                f"{format_source(ent)}"
            )
        if jira_b:
            return (
                f"Jira access for your project is still pending.\n"
                f"Owner: {jira_b['owner']}\n"
                f"Status: {jira_b['status']}\n"
                f"You don’t need to submit another request unless IT asks you to.\n"
                f"[{jira_b.get('action_label') or 'View request'}]\n"
                f"Source: SmartStart / Jira (via onboarding record)"
            )
        return explain_entity(ent, role_label=role_label)

    if ent.id in {"app-servicenow", "proc-laptop", "term-ticket"}:
        status = it.get("hardware_status")
        ticket = it.get("ticket_id")
        if status and ticket:
            return (
                f"{ent.summary}\n\n"
                f"Your laptop request: {ticket} · Status: {status}"
                + (" · SLA breached" if it.get("sla_breached") else "")
                + ".\n"
                "You don’t need to raise another request unless hardware is missing from your record.\n"
                f"[View Request]\n"
                f"Source: ServiceNow · {ticket}"
            )
        return explain_entity(ent, role_label=role_label)

    if ent.id in {"learn-git", "term-git"}:
        learn = ctx.get("learning") or {}
        nxt = learn.get("next_modules") or []
        git_next = next((m for m in nxt if "git" in m.lower()), None)
        why = (
            "Git Basics is part of project-readiness because your track uses GitHub "
            "for source control."
        )
        if git_next or any("git" in (m or "").lower() for m in nxt):
            return (
                f"{why}\n"
                f"Your learning track “{learn.get('track_name')}” still lists Git work as next.\n"
                f"[Start Git Basics]\n"
                f"Source: SmartStart Learning"
            )
        return explain_entity(ent, role_label=role_label)

    if ent.id == "proc-leave":
        mgr = emp.get("manager_name")
        extra = f" Your manager on record ({mgr}) is the typical approver." if mgr else ""
        return (
            f"You can apply for leave through the HR Portal.\n"
            f"Process: Leave Application · Owner: HR Operations.{extra}\n"
            f"[Open HR Portal]\n"
            f"{format_source(ent)}"
        )

    apps = role_recommended_apps(str(role))
    if ent.kind == "application" and ent.id.startswith("app-") and "which" in "":
        pass

    base = explain_entity(ent, role_label=role_label)
    if onb.get("next_action") and ent.kind in {"process", "application"}:
        return base
    return base


def employer_at_risk_explanation(joiner_id: str, db: DataStore | None = None) -> dict[str, Any]:
    """Structured explanation for Command Center drawers."""
    risk = build_risk_summary(joiner_id, db=db)
    blockers = build_blockers(joiner_id, db=db)
    actions = build_next_best_actions(joiner_id, db=db)
    top = risk.get("top_alert") or {}
    return {
        "joiner_id": joiner_id,
        "risk_level": risk.get("overall_risk_level"),
        "risk_score": risk.get("overall_risk_score"),
        "headline": top.get("title") or "Onboarding watch",
        "why": top.get("drivers") or [],
        "recommended": top.get("recommended_action"),
        "blockers": blockers,
        "next_actions": actions,
        "synthetic": True,
    }
