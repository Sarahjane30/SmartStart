"""IRA answer engine — governed company knowledge over approved/synthetic sources.

Never invents employee facts. Does not modify enterprise systems or take
autonomous production actions. Answers stay evidence-backed from SmartStart
sandbox records and offline FAQ.
"""

from __future__ import annotations

import re
from typing import Optional

from ira.faq import match_faq

# Prompts — IRA knows apps · teams · processes · docs · your record
SUGGESTIONS_DEFAULT = [
    "What can IRA help with?",
    "Which apps should I use?",
    "Who owns onboarding docs?",
    "Where do I find department processes?",
    "What's left on my record?",
    "Who is my mentor?",
    "What tools am I approved for?",
]


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", text.strip().lower())


def suggestions_for(ctx: dict | None) -> list[str]:
    if not ctx:
        return [
            "What can IRA help with?",
            "Which apps should I use?",
            "Who owns onboarding docs?",
            "Where do I find department processes?",
        ]
    out = [
        "What can IRA help with?",
        "Which apps should I use?",
        "What's left on my record?",
        "Who is my mentor?",
    ]
    it = ctx.get("it") or {}
    if it.get("hardware_status") != "Delivered":
        out.insert(2, "Is my laptop ready?")
    seen: list[str] = []
    for q in out:
        if q not in seen:
            seen.append(q)
    return seen[:2]  # desktop chip strip shows two


_DISCLAIMER = (
    " I only use approved SmartStart sandbox sources for this hackathon — "
    "I never change enterprise systems or take production actions."
)


def _what_is_ira() -> str:
    return (
        "I’m IRA — I know Waters. Apps, teams, processes, docs, owners, how things connect. "
        "Ask me anything about getting around the company. I answer from your approved "
        "sandbox sources only, and I never change production systems."
        + _DISCLAIMER
    )


def _apps_map() -> str:
    return (
        "In this hackathon sandbox, the connected knowledge sources are:\n"
        "• SmartStart — onboarding orchestration and your employee record\n"
        "• iCIMS (mock) — documents and HR packets\n"
        "• ServiceNow (mock) — IT / hardware tickets\n"
        "• Jira (mock) — project access and readiness work\n"
        "Ask about a source and I’ll point you to the right place on your approved record."
    )


def _governance() -> str:
    return (
        "IRA is permission-aware and evidence-backed: I only surface information tied to "
        "your signed-in profile and approved synthetic sources. I won’t invent facts, "
        "expose unrelated records, or modify production systems. Humans stay in control "
        "of approvals and changes."
    )


def answer(query: str, ctx: Optional[dict], *, online: bool) -> str:
    q = _norm(query)
    if not q:
        return (
            "Ask about Waters apps, teams, processes, approved docs, or your own "
            "permissioned record."
        )

    # “What do you know?” intents
    if any(
        k in q
        for k in (
            "what can ira",
            "what do you do",
            "who are you",
            "what is ira",
            "help with",
            "what can you",
            "know everything",
            "know waters",
        )
    ):
        return _what_is_ira()

    if any(
        k in q
        for k in (
            "which app",
            "what app",
            "applications",
            "which systems",
            "tools should i",
            "navigate waters",
            "connected sources",
            "knowledge sources",
        )
    ):
        return _apps_map()

    if any(k in q for k in ("govern", "permission", "authorized", "sensitive", "autonomous", "replace")):
        return _governance()

    if any(k in q for k in ("department process", "processes", "playbook", "how does", "how do teams")):
        faq = match_faq(query)
        if faq:
            return faq
        if ctx and (ctx.get("employee") or {}).get("department"):
            dept = ctx["employee"]["department"]
            return (
                f"For {dept}, start with your learning-track playbook and the People / Team "
                f"views in SmartStart. Process owners and approved docs stay in those "
                f"governed sources — IRA points you there rather than replacing them."
            )
        return (
            "Department processes live in approved playbooks and learning tracks. "
            "Sign in so I can scope answers to your team’s sandbox sources."
        )

    if any(k in q for k in ("who owns", "document owner", "hr contact", "which team")):
        faq = match_faq(query)
        if faq:
            return faq
        return (
            "Document and HR ownership sits with the People / consult contacts on your "
            "Employee Experience profile. Open People in SmartStart for the approved roster."
        )

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
                return f"On your approved record, your first day is {pretty}."
            return "I don’t have a start date on your approved record yet."

        if "mentor" in q:
            mentor = (emp.get("mentor_name") or "").strip()
            if mentor:
                return f"Your assigned mentor on record is {mentor}."
            return "I don’t see a mentor assigned on your approved record yet."

        if any(k in q for k in ("manager", "hiring manager", "boss")):
            mgr = emp.get("manager_name")
            if mgr:
                return f"Your hiring manager on record is {mgr}."
            return "I don’t see a manager on your approved record yet."

        if any(k in q for k in ("laptop", "hardware", "computer", "device", "is my laptop")):
            status = it.get("hardware_status")
            ticket = it.get("ticket_id")
            if not status:
                return "I don’t see a laptop request on your ServiceNow sandbox record yet."
            if status == "Delivered":
                return (
                    f"Your laptop is marked Delivered"
                    + (f" (ticket {ticket})." if ticket else ".")
                    + " Hardware is clear on your IT record."
                )
            progress = "In Progress" if status in {"Pending", "Configured"} else status
            return (
                f"Your laptop request is with IT ({progress}"
                + (f", ticket {ticket}" if ticket else "")
                + f"). Hardware status: {status}."
                + (" This ticket has breached its synthetic SLA." if it.get("sla_breached") else "")
            )

        if any(k in q for k in ("left", "remaining", "what's left", "whats left", "todo", "to do", "tasks", "on my record")):
            tasks = onb.get("open_tasks") or []
            if not tasks:
                return "I don’t see open tasks on your approved onboarding record right now."
            listed = "\n".join(f"• {t}" for t in tasks[:5])
            return f"From your record, still open ({len(tasks)} item(s)):\n{listed}"

        if any(k in q for k in ("status", "progress", "where am i", "onboarding status")):
            state = onb.get("current_state", "unknown")
            pct = onb.get("progress_pct", 0)
            next_action = onb.get("next_action")
            bn = onb.get("bottleneck")
            msg = f"You’re at {state.replace('_', ' ')} — about {pct}% through onboarding on record."
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
                return "Your readiness signals look good for Day 1.\n" + "\n".join(parts)
            if hr and it_ok and not proj:
                return (
                    "Almost ready: HR docs and IT setup are complete, but Jira project "
                    "access is still pending on record.\n" + "\n".join(parts)
                )
            if day1:
                return "You’re in good shape for Day 1 on record.\n" + "\n".join(parts)
            return "A few readiness items remain on your record.\n" + "\n".join(parts)

        if any(k in q for k in ("learn", "learning", "course", "module", "train")):
            track = learn.get("track_name") or emp.get("learning_track")
            pct = learn.get("completion_pct", 0)
            nxt = learn.get("next_modules") or []
            msg = f"Your learning track on record is “{track}” ({pct}% complete)."
            if nxt:
                msg += " Suggested next: " + ", ".join(nxt) + "."
            return msg

        if any(k in q for k in ("software", "access", "okta", "github", "vpn", "tools", "approved for")):
            software = it.get("software_access") or []
            if not software:
                return "I don’t see software access listed on your IT sandbox record yet."
            return (
                "Approved software on your synthetic IT record: "
                + ", ".join(software)
                + "."
            )

        if any(k in q for k in ("document", "docs", "forms", "packet")):
            status = docs.get("status")
            if not status:
                return "I don’t have document status on your approved record yet."
            extra = " Rework is flagged." if docs.get("rework_flag") else ""
            return f"Your onboarding documents are {status}.{extra}"

        if any(k in q for k in ("department", "role", "who am i", "my name")):
            return (
                f"You’re {emp.get('name')} — {emp.get('role_type')} in {emp.get('department')} "
                f"(from your signed-in profile)."
            )

        faq = match_faq(query)
        if faq:
            return faq
        return (
            "I don’t have that in your approved sources yet. Try apps, teams, processes, "
            "documents, mentor, hardware, or readiness — or open the owning system "
            "(iCIMS / ServiceNow / Jira) for a change request. I won’t invent an answer."
        )

    faq = match_faq(query)
    if faq:
        prefix = "" if online else "(Offline FAQ) "
        return prefix + faq
    if not online:
        return (
            "SmartStart isn’t reachable, so I only have general approved FAQ answers. "
            "Start SmartStart on port 8000 and sign in so I can use your permissioned record."
        )
    return (
        "Sign in so I can answer from your role-aware record. "
        "Until then I only cover general approved FAQs about apps, processes, and docs."
    )


def greeting(ctx: Optional[dict]) -> str:
    if ctx and ctx.get("employee"):
        name = (ctx["employee"].get("name") or "there").split()[0]
        role = (ctx["employee"].get("role_type") or "").upper()
        role_label = "Intern" if role == "INTERN" else ("FTE" if role == "FTE" else "team member")
        return (
            f"Hi {name} — I’m IRA. I know Waters for your {role_label} profile — "
            "apps, teams, processes, docs, and your own record. Ask me anything."
        )
    return (
        "Hi — I’m IRA. I know Waters. "
        "Sign in and I’ll answer from your profile and approved sources."
    )


def progress_snapshot(ctx: Optional[dict]) -> dict | None:
    """Structured readiness for the panel strip (from approved record only)."""
    if not ctx:
        return None
    onb = ctx.get("onboarding") or {}
    ready = ctx.get("readiness") or {}
    it = ctx.get("it") or {}
    emp = ctx.get("employee") or {}
    return {
        "pct": int(onb.get("progress_pct") or 0),
        "laptop": it.get("hardware_status") == "Delivered" or bool(ready.get("it_ready")),
        "mentor": bool((emp.get("mentor_name") or "").strip()),
        "day1": bool(ready.get("day1_ready")),
    }
