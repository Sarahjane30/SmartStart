"""Context-aware answer engine for IRA — never invents employee facts."""

from __future__ import annotations

import re
from typing import Any, Optional

from ira.faq import match_faq

SUGGESTIONS_DEFAULT = [
    "What's left for me?",
    "When is my first day?",
    "Where is my laptop?",
    "Who is my manager?",
    "Who is my mentor?",
    "Am I ready for Day 1?",
    "What should I learn first?",
]


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", text.strip().lower())


def suggestions_for(ctx: dict | None) -> list[str]:
    if not ctx:
        return [
            "What's left for me?",
            "When is my first day?",
            "Who is my mentor?",
            "Am I ready for Day 1?",
        ]
    out = [
        "What's left for me?",
        "When is my first day?",
        "Am I ready for Day 1?",
        "Who is my mentor?",
    ]
    it = ctx.get("it") or {}
    if it.get("hardware_status") != "Delivered":
        out.insert(2, "Is my laptop ready?")
    # Unique, max 4
    seen: list[str] = []
    for q in out:
        if q not in seen:
            seen.append(q)
    return seen[:4]


def answer(query: str, ctx: Optional[dict], *, online: bool) -> str:
    q = _norm(query)
    if not q:
        return "Ask me anything about your onboarding, IT access, Day 1, or learning."

    # Context-specific intents when we have SmartStart data
    if ctx:
        emp = ctx.get("employee") or {}
        onb = ctx.get("onboarding") or {}
        docs = ctx.get("documents") or {}
        it = ctx.get("it") or {}
        learn = ctx.get("learning") or {}
        ready = ctx.get("readiness") or {}

        if any(k in q for k in ("first day", "start date", "joining", "when do i start")):
            date = emp.get("joining_date")
            if date:
                pretty = date
                try:
                    from datetime import date as _date

                    d = _date.fromisoformat(str(date)[:10])
                    pretty = f"{d.strftime('%B')} {d.day}, {d.year}"
                except Exception:
                    pass
                return f"Your first day is {pretty}."
            return "I don’t have a start date on your record yet."

        if any(k in q for k in ("mentor",)):
            mentor = (emp.get("mentor_name") or "").strip()
            if mentor:
                return f"Your mentor is {mentor}."
            return "I don’t see a mentor assigned on your record yet."

        if any(k in q for k in ("manager", "hiring manager", "boss")):
            mgr = emp.get("manager_name")
            if mgr:
                return f"Your hiring manager is {mgr}."
            return "I don’t see a manager on your record yet."

        if any(k in q for k in ("laptop", "hardware", "computer", "device", "is my laptop")):
            status = it.get("hardware_status")
            ticket = it.get("ticket_id")
            if not status:
                return "I don’t see a laptop request associated with your onboarding record yet."
            if status == "Delivered":
                return (
                    f"Your laptop is marked Delivered"
                    + (f" (ticket {ticket})." if ticket else ".")
                    + " You’re clear on hardware for Day 1."
                )
            progress = "In Progress" if status in {"Pending", "Configured"} else status
            return (
                f"Your laptop request is currently being processed by IT "
                f"({progress}"
                + (f", ticket {ticket}" if ticket else "")
                + f"). Hardware status: {status}."
                + (" This ticket has breached its synthetic SLA." if it.get("sla_breached") else "")
            )

        if any(k in q for k in ("left", "remaining", "what's left", "whats left", "todo", "to do", "tasks")):
            tasks = onb.get("open_tasks") or []
            if not tasks:
                return "I don’t see open onboarding tasks on your record right now."
            listed = "\n".join(f"• {t}" for t in tasks[:5])
            return f"Here’s what’s still open ({len(tasks)} item(s)):\n{listed}"

        if any(k in q for k in ("status", "progress", "where am i", "onboarding status")):
            state = onb.get("current_state", "unknown")
            pct = onb.get("progress_pct", 0)
            next_action = onb.get("next_action")
            bn = onb.get("bottleneck")
            msg = f"You’re at {state.replace('_', ' ')} — about {pct}% through onboarding."
            if bn:
                msg += f" Current bottleneck: {bn}."
            if next_action:
                msg += f" Next: {next_action}"
            return msg

        if any(k in q for k in ("ready", "day 1 ready", "am i ready")):
            hr = ready.get("hr_ready")
            it_ok = ready.get("it_ready")
            proj = ready.get("project_ready")
            day1 = ready.get("day1_ready")
            parts = [
                f"iCIMS / documents: {'complete ✓' if hr else 'pending ⚠️'}",
                f"ServiceNow / laptop: {'ready ✓' if it_ok else 'in progress ⚠️'}",
                f"Jira / project access: {'ready ✓' if proj else 'pending ⚠️'}",
            ]
            if day1 and proj:
                return "You’re ready for Day 1.\n" + "\n".join(parts)
            if hr and it_ok and not proj:
                return (
                    "You’re almost ready. Your HR onboarding and IT setup are complete, "
                    "but your Jira project access is still pending.\n" + "\n".join(parts)
                )
            if day1:
                return "You’re in good shape for Day 1.\n" + "\n".join(parts)
            return "You’re almost ready — a few items remain.\n" + "\n".join(parts)

        if any(k in q for k in ("learn", "learning", "course", "module", "train")):
            track = learn.get("track_name") or emp.get("learning_track")
            pct = learn.get("completion_pct", 0)
            nxt = learn.get("next_modules") or []
            msg = f"Your learning track is “{track}” ({pct}% complete)."
            if nxt:
                msg += " Suggested next: " + ", ".join(nxt) + "."
            return msg

        if any(k in q for k in ("software", "access", "okta", "github", "vpn", "tools")):
            software = it.get("software_access") or []
            if not software:
                return "I don’t see software access listed on your IT record yet."
            return "Your synthetic software access includes: " + ", ".join(software) + "."

        if any(k in q for k in ("document", "docs", "forms", "packet")):
            status = docs.get("status")
            if not status:
                return "I don’t have document status on your record yet."
            extra = " Rework is flagged." if docs.get("rework_flag") else ""
            return f"Your onboarding documents are {status}.{extra}"

        if any(k in q for k in ("department", "role", "who am i", "my name")):
            return (
                f"You’re {emp.get('name')} — {emp.get('role_type')} in {emp.get('department')}."
            )

        # Fall through to FAQ, then safe refusal
        faq = match_faq(query)
        if faq:
            return faq
        return (
            "I don’t have that specific information yet. "
            "You can check with your HR contact or manager, or ask about "
            "start date, laptop, mentor, tasks, or Day-1 readiness."
        )

    # Offline / no employee selected
    faq = match_faq(query)
    if faq:
        prefix = "" if online else "(Offline FAQ) "
        return prefix + faq
    if not online:
        return (
            "SmartStart isn’t reachable right now, so I only have general FAQ answers. "
            "Start SmartStart on port 8000 and pick an employee in Settings."
        )
    return (
        "Select an employee in Settings so I can use your onboarding record. "
        "Until then I can only answer general onboarding FAQs."
    )


def greeting(ctx: Optional[dict]) -> str:
    if ctx and ctx.get("employee"):
        name = (ctx["employee"].get("name") or "there").split()[0]
        return f"Hi {name} — how can I help with your onboarding?"
    return "Hi — I’m IRA, your onboarding companion. Pick an employee in Settings to get started."


def proactive_tips(ctx: Optional[dict]) -> list[str]:
    """Subtle notification lines — never invent deadlines."""
    if not ctx:
        return []
    tips: list[str] = []
    it = ctx.get("it") or {}
    docs = ctx.get("documents") or {}
    onb = ctx.get("onboarding") or {}
    if it.get("hardware_status") == "Delivered":
        tips.append("Your laptop is marked Delivered.")
    elif it.get("sla_breached"):
        tips.append("Your laptop request has breached its synthetic SLA.")
    if docs.get("status") != "Complete":
        tips.append("Your onboarding documents are still pending.")
    pct = onb.get("progress_pct")
    if isinstance(pct, int) and pct >= 50:
        tips.append(f"You’re about {pct}% through onboarding.")
    return tips[:2]
