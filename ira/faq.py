"""Offline FAQ knowledge base for IRA when SmartStart is unreachable."""

from __future__ import annotations

import re

FAQ: list[tuple[str, str, tuple[str, ...]]] = [
    (
        "What can IRA help with?",
        "I’m IRA — I know Waters. Ask about apps, teams, processes, docs, and how "
        "things connect. Answers stay evidence-backed from approved / synthetic sources — "
        "I never change production systems.",
        ("what can ira", "what do you", "who are you", "know everything", "help with", "know waters"),
    ),
    (
        "Which apps should I use?",
        "In this sandbox: SmartStart (orchestration), iCIMS (documents), ServiceNow (IT), "
        "and Jira (project access). IRA helps you navigate them; open the owning system to make changes.",
        ("which app", "applications", "systems", "tools should", "navigate"),
    ),
    (
        "How does IRA stay governed?",
        "IRA only answers from approved sources tied to your signed-in profile. "
        "It will not invent facts or modify production systems. Humans keep approvals.",
        ("govern", "permission", "authorized", "sensitive", "autonomous"),
    ),
    # HR / Documents / Payroll / Policies / Benefits / Hours
    (
        "How do I submit documents?",
        "Submit your onboarding packet through the HR system (mock iCIMS). "
        "Incomplete packets stay Pending until all forms are uploaded.",
        ("document", "docs", "forms", "packet", "submit", "hr"),
    ),
    (
        "Who helps with payroll or benefits?",
        "Ask your HR contact for payroll and benefits questions. IRA only answers "
        "from synthetic onboarding records when SmartStart is connected.",
        ("payroll", "benefits", "salary", "tax", "compensation"),
    ),
    (
        "Where do I find policies?",
        "Company policies are shared during orientation and in your learning track. "
        "Ask your manager if you need a specific policy link.",
        ("policy", "policies", "handbook"),
    ),
    (
        "What are typical working hours?",
        "Most teams follow standard business hours with manager-agreed flexibility. "
        "Confirm your team’s expectations with your manager or mentor on Day 1.",
        ("hours", "working hours", "schedule", "timezone"),
    ),
    # IT
    (
        "When will my laptop arrive?",
        "IT provisions hardware after documents are complete. Status moves "
        "Pending → Configured → Delivered on the ServiceNow request.",
        ("laptop", "hardware", "computer", "device"),
    ),
    (
        "How do I get VPN?",
        "VPN is typically enabled after your laptop is Delivered. Check for an "
        "Okta / VPN notification once hardware is ready.",
        ("vpn", "remote", "network"),
    ),
    (
        "How do I get email access?",
        "Email is provisioned with your Okta account during IT setup. If mail is "
        "missing after your laptop is Delivered, open an IT ticket.",
        ("email", "outlook", "mailbox"),
    ),
    (
        "What about GitHub / repo access?",
        "Engineering access (GitHub, Jira, etc.) is granted with IT provisioning. "
        "If access is missing after your laptop is Delivered, ask IT.",
        ("github", "repo", "repository", "password", "access"),
    ),
    # Day 1
    (
        "What happens on Day 1?",
        "Day 1 usually includes orientation, tools setup, meeting your manager "
        "or mentor, and reviewing your learning track.",
        ("day 1", "day1", "first day", "orientation", "report"),
    ),
    (
        "Where do I report on Day 1?",
        "Your manager or mentor will share the Day-1 meeting point (office or virtual). "
        "Check your onboarding notifications the evening before.",
        ("where to report", "where do i go", "meeting point", "office"),
    ),
    # Learning
    (
        "What should I learn first?",
        "Start with required modules on your learning track — usually Welcome, "
        "Security, and Core tools — then role-specific modules.",
        ("learn", "learning", "course", "training", "module"),
    ),
    (
        "Is there an intern learning path?",
        "Interns follow a mentor-guided track with foundations (tools, security, "
        "and role basics) before project work ramps up.",
        ("intern", "learning path", "path"),
    ),
    # Projects / Jira
    (
        "How do I get on the project board?",
        "Project onboarding tasks live in Jira. Once IT access is ready, your "
        "manager assigns board membership and starter tickets.",
        ("jira", "project", "board", "assignment", "team"),
    ),
]


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", text.strip().lower())


def match_faq(query: str) -> str | None:
    q = _norm(query)
    if not q:
        return None
    best: tuple[int, str] | None = None
    for question, answer, keywords in FAQ:
        score = sum(3 for kw in keywords if kw in q)
        # Only boost on distinctive question words (skip stopwords)
        for word in _norm(question).split():
            if len(word) > 4 and word not in {"about", "should", "typical", "where", "there"} and word in q:
                score += 2
        if score >= 3 and (best is None or score > best[0]):
            best = (score, answer)
    return None if best is None else best[1]
