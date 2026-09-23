"""Layer 4 — IRA rule-based synthetic onboarding FAQ chatbot."""

from __future__ import annotations

import re

from backend.database import DataStore, store
from backend.models import ChatbotResponse, ChatFAQ, ChatTurn, RoleType

_BASE_FAQS: list[tuple[str, str, str, str, tuple[str, ...]]] = [
    (
        "docs",
        "How do I submit documents?",
        "Submit your onboarding packet via the synthetic HR portal (iCIMS mock). "
        "Upload all forms in one packet — incomplete packets stay in Pending.",
        "Documents",
        ("document", "docs", "forms", "submit", "packet", "icims", "hr portal"),
    ),
    (
        "laptop",
        "When will my laptop arrive?",
        "IT provisions hardware after documents are Complete. Track status on your "
        "ServiceNow mock ticket (Pending → Configured → Delivered).",
        "IT",
        ("laptop", "hardware", "computer", "device", "provision"),
    ),
    (
        "vpn",
        "How do I get VPN access?",
        "VPN is approved after your laptop is Delivered. Look for the "
        "“VPN approved” notification, then connect before Day-1 orientation.",
        "IT",
        ("vpn", "remote", "network", "okta"),
    ),
    (
        "day1",
        "What happens on Day 1?",
        "Day-1 orientation covers tools setup, security basics, and meeting your "
        "manager or mentor. Confirm the calendar invite once IT is provisioned.",
        "Orientation",
        ("day 1", "day1", "orientation", "first day"),
    ),
    (
        "mentor",
        "Who is my mentor?",
        "Your assigned mentor appears on your Employee Experience profile. "
        "Interns should schedule a weekly check-in in the first week.",
        "Mentorship",
        ("mentor", "buddy", "coach"),
    ),
    (
        "learning",
        "Where is my learning track?",
        "Open Employee Experience → Learning track. Modules unlock as you move "
        "through onboarding states. Complete required modules before project assignment.",
        "Learning",
        ("learning", "module", "course", "training", "track"),
    ),
    (
        "feedback",
        "How do I give onboarding feedback?",
        "Use the Feedback form on the Employee Experience page. Ratings and comments "
        "are stored as synthetic demo records only.",
        "Feedback",
        ("feedback", "rate", "survey", "comment"),
    ),
    (
        "sla",
        "What is an SLA breach?",
        "If IT lead time exceeds the 3-day synthetic SLA target, SmartStart flags a "
        "breach and surfaces predictive risk on the AI Features page.",
        "IT",
        ("sla", "breach", "delay", "late"),
    ),
]

_INTERN_FAQS: list[tuple[str, str, str, str, tuple[str, ...]]] = [
    (
        "git",
        "How do I finish Git Basics?",
        "Open Learning track → Git Basics. Clone the practice repo, make a commit, "
        "and open a practice PR. Your mentor expects this before Friday (synthetic).",
        "Intern",
        ("git", "github", "pull request", "pr", "basics"),
    ),
    (
        "intern-checkin",
        "How often should I meet my mentor?",
        "Schedule a 15-minute weekly check-in. Use the Meet your mentor module to "
        "book the first intro chat.",
        "Intern",
        ("check-in", "checkin", "weekly", "meet mentor"),
    ),
]

_FTE_FAQS: list[tuple[str, str, str, str, tuple[str, ...]]] = [
    (
        "ready",
        "What is project readiness?",
        "Complete your department readiness checklist and related modules. Once marked "
        "ready, managers can assign your first project tickets in the Jira mock.",
        "FTE",
        ("project readiness", "readiness", "project assignment", "kickoff"),
    ),
    (
        "dept",
        "Where do I find department processes?",
        "Your learning track includes a department playbook or architecture overview. "
        "Finish those modules before requesting project assignment.",
        "FTE",
        ("department", "process", "architecture", "playbook"),
    ),
]


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text.strip().lower())


def _catalog_for(role_type: RoleType) -> list[tuple[str, str, str, str, tuple[str, ...]]]:
    extra = _INTERN_FAQS if role_type == RoleType.INTERN else _FTE_FAQS
    return _BASE_FAQS + extra


def _match_faq(
    query: str, catalog: list[tuple[str, str, str, str, tuple[str, ...]]]
) -> tuple[str, str, str] | None:
    q = _normalize(query)
    if not q:
        return None
    best: tuple[int, tuple[str, str, str]] | None = None
    for fid, question, answer, _cat, keywords in catalog:
        score = 0
        for kw in keywords:
            if kw in q:
                score += len(kw)
        for word in _normalize(question).split():
            if len(word) > 3 and word in q:
                score += 2
        if score > 0 and (best is None or score > best[0]):
            best = (score, (fid, question, answer))
    return None if best is None else best[1]


def build_chatbot(
    joiner_id: str,
    query: str | None = None,
    db: DataStore | None = None,
) -> ChatbotResponse:
    db = db or store
    joiner = db.get_joiner(joiner_id)
    if joiner is None:
        raise KeyError(joiner_id)

    catalog = _catalog_for(joiner.role_type)
    faqs = [
        ChatFAQ(
            id=f"{joiner_id}-FAQ-{fid}",
            question=question,
            answer=answer,
            category=category,
            synthetic=True,
        )
        for fid, question, answer, category, _kw in catalog
    ]

    first = joiner.name.split()[0]
    greeting = (
        f"Hi {first} — I’m IRA, your SmartStart companion for "
        f"{joiner.role_type.value} onboarding. Ask about documents, IT, VPN, "
        f"learning modules, or pick a suggested question."
    )

    turns: list[ChatTurn] = [ChatTurn(role="assistant", text=greeting, synthetic=True)]

    if query:
        turns.append(ChatTurn(role="user", text=query.strip(), synthetic=True))
        matched = _match_faq(query, catalog)
        if matched:
            fid, _q, answer = matched
            turns.append(
                ChatTurn(
                    role="assistant",
                    text=answer,
                    matched_faq_id=f"{joiner_id}-FAQ-{fid}",
                    synthetic=True,
                )
            )
        else:
            turns.append(
                ChatTurn(
                    role="assistant",
                    text=(
                        "I don't have a synthetic answer for that yet. Try asking about "
                        "documents, laptop, VPN, Day 1, mentor, learning track, feedback, "
                        "or SLA — or tap a suggested FAQ."
                    ),
                    synthetic=True,
                )
            )

    return ChatbotResponse(
        joiner_id=joiner_id,
        role_type=joiner.role_type,
        greeting=greeting,
        faqs=faqs,
        turns=turns,
        query=query,
        synthetic=True,
    )
