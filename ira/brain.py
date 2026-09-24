"""IRA answer engine — intelligent onboarding + enterprise navigation.

Five conceptual layers (knowledge, personal context, action, predictive,
orchestration) over approved/synthetic SmartStart sources only.

Never invents employee facts. Never takes autonomous production actions.
"""

from __future__ import annotations

import re
from typing import Optional

from ira import coach, workplace_basics
from ira.email_draft import directory_reply, draft_reply, is_draft_request
from ira.faq import match_faq
from ira.persona import first_name, flavour_line, traits
from ira.policy_kb import answer_from_policies

# Optional backend imports — desktop package may run with SmartStart on path
try:
    from backend.intelligence import (
        explain_what_if,
        format_blockers_text,
        format_briefing_text,
        format_next_actions_text,
        format_project_ready_text,
        format_risk_text,
        personalize_knowledge_answer,
    )
    from backend.knowledge import (
        explain_entity,
        find_entities,
        role_recommended_apps,
    )
except ImportError:  # pragma: no cover - offline desktop without backend package
    explain_what_if = None  # type: ignore
    format_blockers_text = None  # type: ignore
    format_briefing_text = None  # type: ignore
    format_next_actions_text = None  # type: ignore
    format_project_ready_text = None  # type: ignore
    format_risk_text = None  # type: ignore
    personalize_knowledge_answer = None  # type: ignore
    explain_entity = None  # type: ignore
    find_entities = None  # type: ignore
    role_recommended_apps = None  # type: ignore


SUGGESTIONS_DEFAULT = [
    "Give me my briefing",
    "What should I do now?",
    "How do I apply for leave?",
    "What is ServiceNow?",
    "What's blocking me?",
    "Who is my manager?",
]


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", text.strip().lower())


def suggestions_for(ctx: dict | None) -> list[str]:
    if not ctx:
        return [
            "What can IRA help with?",
            "How do I apply for leave?",
            "What is ServiceNow?",
            "What is Jira?",
        ]
    out = [
        "Give me my briefing",
        "What should I do now?",
        "What's blocking me?",
        "How do I apply for leave?",
    ]
    it = ctx.get("it") or {}
    if it.get("hardware_status") != "Delivered":
        out.insert(2, "Where’s my laptop?")
    intel = ctx.get("intelligence") or {}
    if any(b.get("id") == "jira-project" for b in intel.get("blockers") or []):
        out.insert(1, "Can I start my project tomorrow?")
    seen: list[str] = []
    for q in out:
        if q not in seen:
            seen.append(q)
    return seen[:3]


_FOLLOWUP_TOPICS: list[tuple[tuple[str, ...], list[str]]] = [
    (("leave", "holiday", "time off", "vacation", "sick"),
     ["How many leave days do I get?", "Where is the holiday calendar?", "Who approves my leave?"]),
    (("salary", "payroll", "payslip", "stipend", "paid", "tax"),
     ["When will I get my salary?", "Where is my payslip?", "When do I declare tax investments?"]),
    (("expense", "reimburs", "travel", "meal", "claim", "procure", "purchase", "corporate card"),
     ["What is the daily meal limit?", "What can't be reimbursed?", "Can I buy software with a card?"]),
    (("password", "mfa", "okta", "phishing", "security", "malware", "lost laptop"),
     ["What if I clicked a phishing link?", "Can I use ChatGPT at work?", "How do I share files externally?"]),
    (("confidential", "nda", "intellectual", "open source", "gift", "bribe", "privacy", "personal data", "conflict"),
     ["What gifts can I accept?", "Who owns the code I write?", "Can I work on side projects?"]),
    (("conduct", "dress", "harass", "posh", "benefit", "insurance", "wellness", "parental", "hybrid", "work from home"),
     ["What is the dress code?", "How do I raise a concern?", "What benefits do I get?"]),
    (("laptop", "servicenow", "hardware", "ticket", "vpn", "software"),
     ["Can it delay me?", "How do I reset my password?", "How do I report phishing?"]),
    (("jira", "project"),
     ["Why can't I access my project?", "Who do I ask about my project?", "What is Jira?"]),
    (("git", "learning", "course", "module", "training"),
     ["Why do I need Git Basics?", "What happens if I don't finish Git Basics?", "What should I learn?"]),
    (("briefing", "next", "priorit", "blocking", "ready", "onboarding", "left for me"),
     ["What's blocking me?", "Am I ready for Day 1?", "What should I learn?"]),
    (("mentor", "manager"),
     ["Who is my mentor?", "Who is my manager?", "Who approves my leave?"]),
]


def followups_for(
    query: str,
    reply: str,
    ctx: dict | None,
    *,
    asked: set[str] | None = None,
    limit: int = 3,
) -> list[str]:
    """Next questions to offer after an answer — related to the topic, never repeats."""
    done = {_norm(a) for a in (asked or set())} | {_norm(query)}
    q = _norm(query)
    r = _norm(reply)
    picks: list[str] = []
    profile = (ctx or {}).get("profile")
    start = coach.scenario_from_chip(query) or (None if is_draft_request(query) else coach.detect_start(query))
    if start == "menu":
        return [c for c in coach.menu_chips()][: max(limit, 4)]
    if start:
        return []
    topic = workplace_basics.match_topic(query, require_how=True)
    if topic or _NERVOUS.search(query):
        if topic and topic["practice"]:
            picks.append(f"Practice: {coach.SCENARIOS[topic['practice']]['title']}")
        if _NERVOUS.search(query):
            picks.append(f"Practice: {coach.SCENARIOS['blocked']['title']}")
        recs = [b["question"] for b in workplace_basics.catalogue(profile) if b["recommended"]]
        picks.extend(recs + [workplace_basics.question(i) for i in ("ask_help", "clarify", "email", "one_on_one")])
    if is_draft_request(query):
        people = [p for p in (ctx or {}).get("people") or [] if p.get("email")]
        mentor = next((p for p in people if "mentor" in p.get("roles", [])), None)
        manager = next((p for p in people if "manager" in p.get("roles", [])), None)
        if mentor:
            picks.append(f"Draft an email to {mentor['name']} about a weekly check-in")
        if manager:
            picks.append(f"Draft an email to {manager['name']} about project assignment")
        picks.append("Who handles payroll questions?")
    for keys, items in _FOLLOWUP_TOPICS:
        if any(k in q for k in keys):
            picks.extend(items)
    for keys, items in _FOLLOWUP_TOPICS:
        if any(k in r for k in keys):
            picks.extend(items)
    picks.extend(suggestions_for(ctx))
    if traits(profile)["nervous"]:
        picks.extend(b["question"] for b in workplace_basics.catalogue(profile) if b["recommended"])
    picks.extend(SUGGESTIONS_DEFAULT)
    picks.extend(["What is the dress code?", "How do I report phishing?", "How do I claim expenses?"])
    out: list[str] = []
    for p in picks:
        if _norm(p) not in done and p not in out:
            out.append(p)
        if len(out) >= limit:
            break
    return out


_DISCLAIMER_SHORT = (
    " I only use approved SmartStart sandbox sources — I never change production systems."
)

_NO_SOURCE = (
    "I don’t have an approved source for that yet, so I don’t want to guess. "
    "I can route you to the right team — try HR Operations, IT Service Desk, "
    "or your manager depending on the topic."
)


def _resolve_followup(query: str, history: list[tuple[str, str]] | None) -> str:
    """Expand short follow-ups using prior turn topic."""
    q = _norm(query)
    if not history:
        return query
    follow = (
        q in {"since when", "since when?", "and?", "why?", "can it", "can it?", "what about it"}
        or q.startswith("since when")
        or q.startswith("can it")
        or q in {"it", "that", "this"}
        or (len(q.split()) <= 4 and any(x in q for x in ("delay", "block", "ready", "status", "when")))
        and any(x in q for x in ("it", "that", "this", "the request", "my request"))
    )
    # Also: "can it delay me?"
    if not follow and len(q.split()) <= 6:
        if any(p in q for p in ("it delay", "that delay", "this delay", "about it", "about that")):
            follow = True
    if not follow:
        return query
    # Last user message with substance
    prior_user = ""
    for role, text in reversed(history):
        if role == "user" and _norm(text) != q and len(_norm(text)) > 8:
            prior_user = text
            break
    if not prior_user:
        return query
    return f"{prior_user} — follow-up: {query}"


def _what_is_ira() -> str:
    return (
        "I’m IRA — your intelligent onboarding companion for Waters.\n"
        "Ask me What / Where / Who / What next / Why / What if about apps, teams, "
        "processes, docs, IT, HR, learning, and your own onboarding record.\n"
        "I recommend and navigate; humans keep approvals and production changes."
        + _DISCLAIMER_SHORT
    )


def _first_day_welcome(ctx: dict) -> str:
    emp = ctx.get("employee") or {}
    name = (emp.get("name") or "there").split()[0]
    return (
        f"Hi {name} — welcome to Waters.\n"
        "I’m IRA, your intelligent onboarding companion.\n\n"
        "Starting somewhere new comes with a lot of questions, so don’t worry about "
        "knowing everything yet.\n\n"
        "You can ask me things like:\n"
        "• How do I apply for leave?\n"
        "• When will I get my salary?\n"
        "• What’s Waters?\n"
        "• Who is my manager?\n"
        "• Where’s my laptop?\n"
        "• What should I do today?\n\n"
        "You don’t need to know which system to open — just ask me."
    )


def greeting(ctx: Optional[dict]) -> str:
    if ctx and ctx.get("employee"):
        name = (ctx["employee"].get("name") or "there").split()[0]
        role = (ctx["employee"].get("role_type") or "").upper()
        role_label = "Intern" if role == "INTERN" else ("FTE" if role == "FTE" else "team member")
        pct = (ctx.get("onboarding") or {}).get("progress_pct")
        extra = f" You’re about {pct}% through onboarding on record." if pct is not None else ""
        return (
            f"Hi {name} — I’m IRA, your Waters onboarding companion for your {role_label} profile.{extra} "
            "Ask What / Where / Who / What next anytime."
        )
    return (
        "Hi — I’m IRA, Waters’ intelligent onboarding companion. "
        "Sign in and I’ll answer from your profile and approved sources."
    )


def progress_snapshot(ctx: Optional[dict]) -> dict | None:
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


_NERVOUS = re.compile(
    r"\b(i'?m|i am|feeling|feel|so|really|bit|little)\s+(nervous|scared|anxious|overwhelmed|intimidated|worried|lost|out of my depth)\b"
    r"|how to adult|don'?t know how (corporate|office|work) (life )?works|imposter|first job jitters|i don'?t know what i'?m doing",
    re.I,
)
_MORE = {"more detail", "more details", "tell me more", "full answer", "full version", "explain more", "go on", "elaborate"}


def _nervous_reply(ctx: Optional[dict]) -> str:
    profile = (ctx or {}).get("profile")
    t = traits(profile)
    name = first_name(ctx)
    worries = t["nervous"]
    lines = [
        f"That's completely normal, {name} — almost everyone feels like this at the start, "
        "including people who look confident.",
        "You don't need to already know how corporate life works. I'll teach you as you go.",
        "",
        "A few things that help most new joiners:",
    ]
    picks = [b for b in workplace_basics.catalogue(profile) if b["recommended"]][:3] or [
        workplace_basics.catalogue()[i] for i in (2, 3, 13)
    ]
    for b in picks:
        lines.append(f"• {b['title']}")
    lines.append("")
    if worries & {"manager", "questions"} or not worries:
        lines.append("If talking to your manager feels scary, we can rehearse it first — I'll play them, you practise.")
    else:
        lines.append("We can also rehearse any tricky conversation — I'll play the other person.")
    lines.append("Source: IRA Workplace Basics")
    return "\n".join(lines)


def _trim_concise(text: str) -> str:
    lines = [ln for ln in text.split("\n") if ln.strip()]
    source = [ln for ln in lines if ln.startswith("Source:")]
    body = [ln for ln in lines if not ln.startswith("Source:")]
    if len(body) <= 5:
        return text
    kept = body[:4] + ["(Kept it short — say “more detail” for the full answer.)"]
    return "\n".join(kept + source)


def respond(
    query: str,
    ctx: Optional[dict],
    *,
    online: bool,
    history: list[tuple[str, str]] | None = None,
) -> dict:
    """Personal Profile + Enterprise Context → one answer, with the mode used (ask / guide / coach)."""
    profile = (ctx or {}).get("profile")
    t = traits(profile)
    raw = query.strip()
    q = _norm(raw)
    out: dict = {"text": "", "mode": "ask", "coach": None, "basics": None, "flavour": False}

    chip = coach.scenario_from_chip(raw)
    start = chip or (None if is_draft_request(raw) else coach.detect_start(raw))
    if start == "menu":
        out.update(text=coach.menu_text(ctx), mode="coach")
        return out
    if start:
        info = coach.start(start, ctx)
        if info:
            who = info["role"] if info["role"] != "your team" else "your team"
            out.update(
                mode="coach",
                coach=info,
                text=(
                    f"Practice mode — I'll play {who}.\n{info['setup']}\n\n"
                    f"“{info['opener']}”\n\n"
                    "Write what you'd say, just like you would for real. I'll reply in role and then give you feedback."
                ),
            )
            return out

    if _NERVOUS.search(raw):
        out.update(text=_nervous_reply(ctx), mode="guide")
        return out

    topic = workplace_basics.match_topic(raw, require_how=True)
    wants_draft = is_draft_request(raw) and ("draft" in q or " about " in f" {q} " or "regarding" in q)
    if topic and not wants_draft:
        out.update(text=workplace_basics.as_text(topic["id"], profile, ctx), mode="guide", basics=topic["id"])
        return out

    if q in _MORE and history:
        prior = next((txt for role, txt in reversed(history) if role == "user" and _norm(txt) not in _MORE), "")
        if prior:
            out["text"] = answer_core(prior, ctx, online=online, history=None)
            return out

    text = answer_core(raw, ctx, online=online, history=history)
    if is_draft_request(raw) and t["first_job"] and "Subject:" in text:
        tip = "Tip: read it once out loud before sending — if it sounds like you talking, it's right."
        text = text.replace("\nSource:", f"\n{tip}\nSource:", 1) if "\nSource:" in text else f"{text}\n{tip}"
    elif t["concise"] and not t["beginner"]:
        text = _trim_concise(text)
    flavour = flavour_line(raw, profile, ctx)
    if flavour:
        text = f"{text}\n{flavour}" if "Source:" not in text else text.replace("\nSource:", f"\n{flavour}\nSource:", 1)
        out["flavour"] = True
    out["text"] = text
    return out


def answer(
    query: str,
    ctx: Optional[dict],
    *,
    online: bool,
    history: list[tuple[str, str]] | None = None,
) -> str:
    return respond(query, ctx, online=online, history=history)["text"]


def answer_core(
    query: str,
    ctx: Optional[dict],
    *,
    online: bool,
    history: list[tuple[str, str]] | None = None,
) -> str:
    raw = query
    query = _resolve_followup(query, history)
    q = _norm(query)
    if not q:
        return "Ask about Waters apps, teams, processes, docs, or your own onboarding record."

    if is_draft_request(raw):
        return draft_reply(raw, ctx)
    directory = directory_reply(raw, ctx)
    if directory:
        return directory

    # --- Identity / help -------------------------------------------------
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

    if any(k in q for k in ("welcome", "first time", "just joined", "new here", "hello ira")):
        if ctx and ctx.get("employee"):
            return _first_day_welcome(ctx)
        return _what_is_ira()

    if any(k in q for k in ("govern", "permission", "authorized", "sensitive", "autonomous", "replace")):
        return (
            "IRA is permission-aware and evidence-backed: I only surface information tied to "
            "your signed-in profile and approved synthetic sources. I won’t invent facts, "
            "expose unrelated private records, or modify production systems. Humans stay in "
            "control of approvals and changes."
        )

    # --- Personal possessives first (MY laptop / mentor / …) -------------
    if ctx:
        emp0 = ctx.get("employee") or {}
        it0 = ctx.get("it") or {}
        docs0 = ctx.get("documents") or {}
        if any(k in q for k in ("my laptop", "where's my laptop", "where is my laptop", "is my laptop")):
            status = it0.get("hardware_status")
            ticket = it0.get("ticket_id")
            if not status:
                return "I don’t see a laptop request on your ServiceNow sandbox record yet."
            if status == "Delivered":
                return (
                    f"Your laptop is marked Delivered"
                    + (f" (ticket {ticket})." if ticket else ".")
                    + "\n[View Request]\nSource: ServiceNow"
                )
            progress = "In Progress" if status in {"Pending", "Configured"} else status
            return (
                f"Your laptop request is with IT ({progress}"
                + (f", ticket {ticket}" if ticket else "")
                + f"). Hardware status: {status}."
                + (" This ticket has breached its synthetic SLA." if it0.get("sla_breached") else "")
                + "\nYou don’t need to raise another request.\n[View Request]\nSource: ServiceNow"
            )
        if "my mentor" in q or q.strip() in {"who is my mentor", "who's my mentor", "whos my mentor"}:
            mentor = (emp0.get("mentor_name") or "").strip()
            if mentor:
                return f"Your assigned mentor on record is {mentor}.\nSource: SmartStart"
            return "I don’t see a mentor assigned on your approved record yet."
        if "my manager" in q or "hiring manager" in q:
            mgr = emp0.get("manager_name")
            if mgr:
                return f"Your hiring manager on record is {mgr}.\nSource: SmartStart"
            return "I don’t see a manager on your approved record yet."
        if any(k in q for k in ("my document", "my docs", "my packet", "my forms")):
            status = docs0.get("status")
            if not status:
                return "I don’t have document status on your approved record yet."
            extra = " Rework is flagged." if docs0.get("rework_flag") else ""
            return f"Your onboarding documents are {status}.{extra}\nSource: iCIMS (via SmartStart)"

    # --- Knowledge lookups (What is / Where / Who) even offline ----------
    if find_entities is not None:
        # Salary / leave balance — never invent
        if any(
            k in q
            for k in (
                "leave balance",
                "leaves do i have",
                "leave do i have",
                "leave days do i have",
                "leave left",
                "leaves left",
                "remaining leave",
                "salary amount",
                "how much do i get paid",
                "exact salary",
                "my salary is",
            )
        ):
            return (
                "I don’t have an approved source for exact leave balances or salary amounts, "
                "so I won’t guess.\n"
                "Next: Open the HR Portal or ask HR Operations / Payroll.\n"
                "[Open HR Portal]\n"
                "Source: HR Service Catalog"
            )

        role = None
        if ctx and ctx.get("employee"):
            role = (ctx["employee"].get("role_type") or "").lower()

        # Who handles / who do I ask
        if any(
            k in q
            for k in ("who handles", "who do i ask", "who do i contact", "who owns", "who can help", "who approves")
        ):
            hits = find_entities(q, role=role, limit=3)
            if hits:
                ent = hits[0]
                mgr = None
                if ctx:
                    mgr = (ctx.get("employee") or {}).get("manager_name")
                if "leave" in q and mgr:
                    return (
                        f"Leave is handled by HR Operations via the HR Portal.\n"
                        f"Your leave approver on record is your manager, {mgr}.\n"
                        f"[Open HR Portal]\n"
                        f"Source: Leave & Attendance Guide · HR Operations"
                    )
                if "project" in q and mgr:
                    return (
                        f"For project questions, start with your manager on record: {mgr}.\n"
                        f"Project board access is owned with IT / Project Team via Jira.\n"
                        f"Source: SmartStart employee record"
                    )
                return (
                    f"{ent.name} — {ent.owner} ({ent.department}).\n"
                    f"{ent.summary}\n"
                    f"Next: {ent.navigate_hint}\n"
                    f"Source: {ent.source} · {ent.owner}"
                )

        policy = answer_from_policies(q, strict=True)
        if policy:
            mgr = ((ctx or {}).get("employee") or {}).get("manager_name")
            if mgr and "Your manager on record" in policy:
                policy = policy.replace("Your manager on record", f"Your manager on record, {mgr},")
            return policy

        # What is X / explain terminology
        if q.startswith("what is ") or q.startswith("what's ") or q.startswith("whats ") or "explain" in q:
            hits = find_entities(q, role=role, limit=2)
            if hits and explain_entity is not None:
                role_label = None
                if ctx and ctx.get("employee"):
                    rt = (ctx["employee"].get("role_type") or "").upper()
                    role_label = "Intern" if rt == "INTERN" else ("FTE" if rt == "FTE" else None)
                return explain_entity(hits[0], role_label=role_label)

        # Where / how do I / I need to (navigation) — skip pure "my laptop" (handled above)
        personal_status = any(
            p in q
            for p in ("my laptop", "my mentor", "my manager", "my document", "my docs", "my packet")
        )
        nav_triggers = (
            "where do i",
            "where is",
            "where's",
            "how do i",
            "how can i",
            "i need to",
            "i need",
            "apply for leave",
            "request access",
            "get jira",
            "connect to vpn",
            "reset my password",
            "raise it",
            "open hr",
        )
        if not personal_status and (
            any(t in q for t in nav_triggers)
            or (
                find_entities(q, role=role, limit=1)
                and any(
                    w in q
                    for w in (
                        "leave",
                        "jira",
                        "vpn",
                        "policy",
                        "payslip",
                        "password",
                        "software",
                        "cafeteria",
                        "office",
                    )
                )
            )
        ):
            hits = find_entities(q, role=role, limit=2)
            if hits:
                ent = hits[0]
                if ctx and personalize_knowledge_answer is not None:
                    return personalize_knowledge_answer(ent, ctx)
                if explain_entity is not None:
                    return explain_entity(ent)

        # Which apps for my role
        if any(k in q for k in ("which app", "what app", "applications", "tools should", "recommended app")):
            if ctx and role_recommended_apps is not None:
                role_t = (ctx.get("employee") or {}).get("role_type") or "INTERN"
                apps = role_recommended_apps(str(role_t))
                lines = ["Based on your role, start with these approved apps:"]
                for a in apps:
                    lines.append(f"• {a.name} — {a.owner}")
                lines.append("Source: SmartStart knowledge catalog")
                return "\n".join(lines)
            return (
                "In this sandbox: SmartStart, iCIMS, ServiceNow, Jira, HR Portal, "
                "Learning Portal, Teams, and GitHub (role-dependent).\n"
                "Source: SmartStart knowledge catalog"
            )

    # --- Personal context required beyond here ---------------------------
    if ctx:
        emp = ctx.get("employee") or {}
        onb = ctx.get("onboarding") or {}
        docs = ctx.get("documents") or {}
        it = ctx.get("it") or {}
        learn = ctx.get("learning") or {}
        ready = ctx.get("readiness") or {}
        intel = ctx.get("intelligence") or {}
        emp_id = emp.get("id")

        # Briefing
        if any(k in q for k in ("briefing", "brief me", "give me my brief", "daily brief", "my briefing")):
            brief = intel.get("briefing")
            if brief and format_briefing_text is not None:
                return format_briefing_text(brief)
            return "I don’t have a briefing payload on your record yet."

        # What should I do
        if any(
            k in q
            for k in (
                "what should i do",
                "what do i do",
                "what next",
                "what's next",
                "whats next",
                "do today",
                "do now",
                "priorit",
            )
        ):
            actions = intel.get("next_best_actions") or []
            if actions and format_next_actions_text is not None:
                return format_next_actions_text(actions, int(onb.get("progress_pct") or 0))
            na = onb.get("next_action")
            return f"Next on your record: {na}" if na else "I don’t see a next action on your record."

        # What's blocking / why can't I
        if any(
            k in q
            for k in (
                "blocking",
                "what's stopping",
                "whats stopping",
                "why can't i",
                "why cant i",
                "why am i blocked",
                "can't access my project",
                "cant access my project",
            )
        ):
            blockers = intel.get("blockers") or []
            if format_blockers_text is not None:
                return format_blockers_text(blockers, project_focus="project" in q)
            bn = onb.get("bottleneck")
            return f"Current bottleneck on record: {bn}." if bn else "No bottleneck listed."

        # Can I start project / full context
        if any(
            k in q
            for k in (
                "start my project",
                "project tomorrow",
                "project-ready",
                "project ready",
                "am i project",
                "ready for my project",
            )
        ):
            if emp_id and format_project_ready_text is not None:
                try:
                    return format_project_ready_text(emp_id)
                except Exception:
                    pass
            # fallback checklist
            return answer_core("Am I ready for Day 1?", ctx, online=online)

        # What if
        if any(k in q for k in ("what if", "what happens if", "if i don't", "if i dont")):
            if emp_id and explain_what_if is not None:
                msg = explain_what_if(q, emp_id)
                if msg:
                    return msg
            return (
                "I only explain consequences that are in approved synthetic rules. "
                "I don’t have a matching what-if rule for that yet — ask your manager or HR."
            )

        # Why (learning / access)
        if q.startswith("why ") or "why do i need" in q or "why can't" in q or "why cant" in q:
            if "git" in q and personalize_knowledge_answer is not None and find_entities is not None:
                hits = find_entities("git basics", limit=1)
                if hits:
                    return personalize_knowledge_answer(hits[0], ctx)
            if "project" in q or "access" in q:
                blockers = intel.get("blockers") or []
                if format_blockers_text is not None:
                    return format_blockers_text(blockers, project_focus=True)

        # Predictive risk
        if any(k in q for k in ("at risk", "delay risk", "predict", "could go wrong", "potential delay")):
            risk = intel.get("risk")
            if risk and format_risk_text is not None:
                return format_risk_text(risk)

        # Learning recommendations
        if any(k in q for k in ("what should i learn", "recommend", "learning", "train", "course", "module")):
            if "what should i learn" in q or "recommend" in q:
                mods = learn.get("modules") or []
                nxt = [m for m in mods if m.get("status") in {"available", "in_progress"}][:3]
                if not nxt:
                    nxt_titles = learn.get("next_modules") or []
                    lines = ["Based on your role and track, I’d recommend:"]
                    for i, t in enumerate(nxt_titles[:3], 1):
                        lines.append(f"{i}. {t}")
                    lines.append("Source: SmartStart Learning")
                    return "\n".join(lines)
                lines = ["Based on your role and track, I’d recommend:"]
                for i, m in enumerate(nxt, 1):
                    lines.append(
                        f"{i}. {m['title']} — {m.get('duration_minutes', '?')} min "
                        f"({m.get('category', 'Learning')})"
                    )
                lines.append("Source: SmartStart Learning")
                return "\n".join(lines)
            track = learn.get("track_name") or emp.get("learning_track")
            pct = learn.get("completion_pct", 0)
            nxt = learn.get("next_modules") or []
            msg = f"Your learning track on record is “{track}” ({pct}% complete)."
            if nxt:
                msg += " Suggested next: " + ", ".join(nxt) + "."
            return msg + "\nSource: SmartStart Learning"

        # Classic personal facts
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
                return f"On your approved record, your first day is {pretty}.\nSource: SmartStart"
            return "I don’t have a start date on your approved record yet."

        if "mentor" in q:
            mentor = (emp.get("mentor_name") or "").strip()
            if mentor:
                return f"Your assigned mentor on record is {mentor}.\nSource: SmartStart"
            return "I don’t see a mentor assigned on your approved record yet."

        if any(k in q for k in ("manager", "hiring manager", "boss")):
            mgr = emp.get("manager_name")
            if mgr:
                return f"Your hiring manager on record is {mgr}.\nSource: SmartStart"
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
                    + "\n[View Request]\nSource: ServiceNow"
                )
            progress = "In Progress" if status in {"Pending", "Configured"} else status
            return (
                f"Your laptop request is with IT ({progress}"
                + (f", ticket {ticket}" if ticket else "")
                + f"). Hardware status: {status}."
                + (" This ticket has breached its synthetic SLA." if it.get("sla_breached") else "")
                + "\nYou don’t need to raise another request.\n[View Request]\nSource: ServiceNow"
            )

        if any(k in q for k in ("left", "remaining", "what's left", "whats left", "todo", "to do", "tasks", "on my record")):
            tasks = onb.get("open_tasks") or []
            if not tasks:
                return "I don’t see open tasks on your approved onboarding record right now."
            listed = "\n".join(f"• {t}" for t in tasks[:5])
            return f"From your record, still open ({len(tasks)} item(s)):\n{listed}\nSource: SmartStart"

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
            return msg + "\nSource: SmartStart"

        if any(k in q for k in ("ready", "day 1 ready", "am i ready", "day1")):
            hr = ready.get("hr_ready")
            it_ok = ready.get("it_ready")
            proj = ready.get("project_ready")
            day1 = ready.get("day1_ready")
            parts = [
                f"{'✓' if hr else '⚠'} iCIMS / documents",
                f"{'✓' if it_ok else '⚠'} ServiceNow / laptop",
                f"{'✓' if proj else '⚠'} Jira / project access",
            ]
            if day1 and proj:
                return "Your readiness signals look good for Day 1.\n" + "\n".join(parts) + "\nSource: SmartStart"
            if hr and it_ok and not proj:
                return (
                    "Almost ready: HR docs and IT setup are complete, but Jira project "
                    "access is still pending on record.\n" + "\n".join(parts) + "\nSource: SmartStart"
                )
            if day1:
                return "You’re in good shape for Day 1 on record.\n" + "\n".join(parts) + "\nSource: SmartStart"
            return "A few readiness items remain on your record.\n" + "\n".join(parts) + "\nSource: SmartStart"

        if any(k in q for k in ("software", "access", "okta", "github", "vpn", "tools", "approved for")):
            # Prefer knowledge nav for "how do I get access" already handled
            software = it.get("software_access") or []
            if not software:
                return "I don’t see software access listed on your IT sandbox record yet.\nSource: ServiceNow"
            return (
                "Approved software on your synthetic IT record: "
                + ", ".join(software)
                + ".\nSource: ServiceNow"
            )

        if any(k in q for k in ("document", "docs", "forms", "packet")) and "policy" not in q:
            status = docs.get("status")
            if not status:
                return "I don’t have document status on your approved record yet."
            extra = " Rework is flagged." if docs.get("rework_flag") else ""
            return f"Your onboarding documents are {status}.{extra}\nSource: iCIMS (via SmartStart)"

        if emp.get("role_title") and any(
            k in q for k in ("my role do", "understand my role", "what is my role", "what will i work on", "what do i do here")
        ):
            tasks = (ctx.get("onboarding") or {}).get("assigned_tasks") or []
            lines = [
                f"You’re a {emp['role_title']} on the {emp.get('team')} team — part of "
                f"{emp.get('department')} in {emp.get('business_area')}.",
                f"You report to {emp.get('manager_name')}, and {emp.get('mentor_name')} is your mentor for day-to-day questions.",
            ]
            if emp.get("learning_track"):
                lines.append(f"Your learning track, {emp['learning_track']}, is where your role-specific skills start.")
            if tasks:
                lines.append("First on your plate: " + "; ".join(tasks[:3]) + ".")
            lines.append(f"Good first-1:1 question for {emp.get('manager_name')}: “What does a great first month look like?”")
            return "\n".join(lines) + "\nSource: SmartStart"

        if any(k in q for k in ("department", "role", "who am i", "my name")):
            return (
                f"You’re {emp.get('name')} — {emp.get('role_type')} in {emp.get('department')} "
                f"(from your signed-in profile).\nSource: SmartStart"
            )

        # Generic knowledge fallback with personalization
        if find_entities is not None:
            hits = find_entities(raw, role=(emp.get("role_type") or "").lower(), limit=1)
            if hits and personalize_knowledge_answer is not None:
                return personalize_knowledge_answer(hits[0], ctx)

        policy = answer_from_policies(raw, strict=False)
        if policy:
            return policy
        faq = match_faq(query)
        if faq:
            return faq
        return _NO_SOURCE

    # Offline / no context
    policy = answer_from_policies(q, strict=True)
    if policy:
        return policy
    if find_entities is not None:
        hits = find_entities(q, limit=1)
        if hits and explain_entity is not None:
            prefix = "" if online else "(Offline knowledge) "
            return prefix + explain_entity(hits[0])

    policy = answer_from_policies(raw, strict=False)
    if policy:
        return policy
    faq = match_faq(query)
    if faq:
        prefix = "" if online else "(Offline FAQ) "
        return prefix + faq
    if not online:
        return (
            "SmartStart isn’t reachable, so I only have general approved knowledge. "
            "Start SmartStart on port 8000 and sign in for personal onboarding answers."
        )
    return (
        "Sign in so I can answer from your role-aware record. "
        "Until then I cover general approved FAQs about apps, processes, and docs."
    )
