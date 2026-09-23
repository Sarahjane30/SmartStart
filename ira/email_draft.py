"""Draft short work emails to people in the joiner's directory.

IRA only writes the draft — the employee reviews, edits and sends it from
their own mail client. Recipients must come from the approved directory in
the IRA context (``ctx["people"]``); IRA never invents an address.
"""

from __future__ import annotations

import re
from typing import Optional

_DRAFT_VERBS = ("draft", "write", "compose", "prepare", "help me email", "help me mail")
_MAIL_WORDS = ("email", "e-mail", "mail", "message", "note")

_ROLE_ALIASES = {
    "mentor": ("mentor",),
    "buddy": ("buddy", "mentor"),
    "manager": ("manager", "boss", "lead"),
    "hr": ("hr", "human resources", "people team", "hr portal"),
    "it": ("it team", "it contact", "it support", "it provisioning", "service desk", "helpdesk", "help desk"),
}

_TOPIC_RE = re.compile(
    r"\b(?:about|regarding|re:|asking(?: about| for)?|to ask(?: about| for)?|on)\s+(.+)$",
    re.I,
)


def is_draft_request(query: str) -> bool:
    q = query.lower()
    if any(k in q for k in _EMAIL_ASKS):
        return False
    if re.match(r"^\s*(e-?mail|mail)\s+(?!ids?\b|address\b|of\b)\w", q):
        return True
    return any(v in q for v in _DRAFT_VERBS) and any(w in q for w in _MAIL_WORDS)


def _match_person(query: str, people: list[dict]) -> Optional[dict]:
    q = f" {query.lower()} "
    for p in people:
        if p.get("name") and p["name"].lower() in q:
            return p
    for p in people:
        first = (p.get("name") or "").split()[0].lower() if p.get("name") else ""
        if first and re.search(rf"\b{re.escape(first)}\b", q):
            return p
    for p in people:
        for key in p.get("roles", []):
            for alias in _ROLE_ALIASES.get(key, (key,)):
                if re.search(rf"\b(my |the |our )?{re.escape(alias)}\b", q):
                    return p
    return None


def _topic(query: str) -> str:
    m = _TOPIC_RE.search(query.strip())
    if not m:
        return ""
    return m.group(1).strip().rstrip("?.! ")


def _template(topic: str, person: dict, me: dict) -> tuple[str, str]:
    first = (me.get("name") or "there").split()[0]
    their_first = (person.get("name") or "there").split()[0]
    dept = me.get("department") or "the team"
    role = (me.get("role_type") or "").upper()
    role_word = "intern" if role == "INTERN" else "team member"
    t = topic.lower()
    greeting = f"Hi {their_first},"
    sign = f"Thanks,\n{me.get('name') or first}"
    intro = f"I'm {first}, a new {role_word} in {dept}."

    if not t or any(k in t for k in ("intro", "hello", "introduce", "myself", "welcome")):
        subject = f"Hello from {first} — new in {dept}"
        ask = person.get("ask_about")
        body = (
            f"{greeting}\n\n{intro} "
            + (f"I've heard you're the person to talk to about {ask[0].lower() + ask[1:]}. " if ask else "")
            + "Would you have 30 minutes this week or next for a quick intro chat? "
            "I'd love to hear how you work and how I can best get up to speed.\n\n"
            "I'm flexible — feel free to pick any slot on my calendar.\n\n" + sign
        )
        return subject, body
    if any(k in t for k in ("review", "pull request", " pr", "pr ", "feedback")):
        thing = re.sub(r"^(?:a\s+)?(?:reviewing|review(?:\s+of)?|looking at)\s+", "", topic, flags=re.I)
        return (
            f"Review request: {thing}",
            f"{greeting}\n\nWhen you have a moment, could you take a look at {thing}? "
            "[Add the link here.] I'd especially appreciate feedback on [what you're unsure about].\n\n"
            "No rush — any time before [date] works.\n\n" + sign,
        )
    if any(k in t for k in ("leave", "time off", "holiday", "vacation", "sick")):
        return (
            f"Leave request: [dates]",
            f"{greeting}\n\nI'd like to request leave from [start date] to [end date] "
            f"({topic}). I'll make sure [handover/work] is covered before I go and will "
            "log the request in the HR portal once you're OK with it.\n\n" + sign,
        )
    if any(k in t for k in ("laptop", "access", "vpn", "okta", "password", "software", "account")):
        return (
            f"Access request: {topic}",
            f"{greeting}\n\n{intro} I need help with {topic}. "
            "[Describe what you tried and any error message.]\n\n"
            "If a ServiceNow ticket is needed, I'm happy to raise one — just let me know the right category.\n\n"
            + sign,
        )
    if any(k in t for k in ("document", "docs", "packet", "form", "icims", "paperwork")):
        return (
            "Question about my onboarding documents",
            f"{greeting}\n\n{intro} I had a question about {topic}: "
            "[add your question]. Could you let me know what's still needed, if anything?\n\n" + sign,
        )
    if any(k in t for k in ("project", "assignment", "ready", "kickoff")):
        return (
            f"Ready for project assignment",
            f"{greeting}\n\nI've finished my readiness checklist and would love to pick up my first "
            f"project work ({topic}). Could we set up a short kickoff to agree goals, stakeholders and "
            "what success looks like?\n\n" + sign,
        )
    if any(k in t for k in ("meet", "chat", "walkthrough", "join", "shadow", "call", "1:1", "sync", "check-in", "checkin")):
        return (
            f"Could we find 30 minutes? — {topic}",
            f"{greeting}\n\n{intro} Would you have 30 minutes for {topic}? "
            "I'm keen to learn how it works in practice. Any time this week or next suits me.\n\n" + sign,
        )
    return (
        f"Question about {topic}",
        f"{greeting}\n\n{intro} I had a question about {topic}: [add details]. "
        "Would you have a few minutes this week to help me with it?\n\n" + sign,
    )


def draft_email(query: str, ctx: Optional[dict]) -> Optional[dict]:
    """Return {to_name, to_email, subject, body} or None when no recipient matches."""
    people = (ctx or {}).get("people") or []
    person = _match_person(query, people)
    if not person or not person.get("email"):
        return None
    me = (ctx or {}).get("employee") or {}
    subject, body = _template(_topic(query), person, me)
    return {
        "to_name": person["name"],
        "to_email": person["email"],
        "subject": subject,
        "body": body,
    }


_TEAM_ASKS = (
    "who is on my team", "who's on my team", "whos on my team", "who is in my team",
    "my team members", "my colleagues", "who are my teammates", "my teammates", "who is my team",
)
_EMAIL_ASKS = ("email id", "email address", "mail id", "'s email", "’s email", "email of", "contact details")


def directory_reply(query: str, ctx: Optional[dict]) -> Optional[str]:
    """Answer 'who is on my team' and 'what is X's email' from the approved directory."""
    q = query.lower()
    people = [p for p in (ctx or {}).get("people") or [] if p.get("email")]
    if not people:
        return None
    if any(k in q for k in _TEAM_ASKS):
        lines = [f"• {p['name']} — {p['title']} · {p['email']}" for p in people[:8]]
        return (
            "Here's who you work with:\n" + "\n".join(lines)
            + "\nWant me to draft an email to any of them?\nSource: SmartStart team directory"
        )
    wants_email = any(k in q for k in _EMAIL_ASKS) or bool(
        re.search(r"\b(what|whats|what's|give me|share|find)\b.*\bemail\b", q)
    )
    if not wants_email:
        return None
    if re.search(r"\bmy (own )?email\b", q):
        me = (ctx or {}).get("employee") or {}
        if me.get("email"):
            return f"Your work email on record is {me['email']}.\nSource: SmartStart"
    person = _match_person(query, people)
    if person is None:
        return None
    first = person["name"].split()[0]
    return (
        f"{person['name']} — {person['title']}\nEmail: {person['email']}\n"
        f"Want a draft? Ask “Draft an email to {first} about …”\n"
        "Source: SmartStart team directory"
    )


def draft_reply(query: str, ctx: Optional[dict]) -> str:
    draft = draft_email(query, ctx)
    if draft is None:
        people = [p for p in (ctx or {}).get("people") or [] if p.get("email")]
        if not people:
            return (
                "I can draft emails to people in your team directory once you're signed in.\n"
                "Source: SmartStart team directory"
            )
        names = ", ".join(p["name"] for p in people[:4])
        return (
            "Who should I write to? I can draft emails to people in your directory — "
            f"for example {names}.\n"
            f"Try: “Draft an email to {people[0]['name'].split()[0]} about …”"
        )
    return (
        f"Here's a draft for {draft['to_name']} ({draft['to_email']}). "
        "Fill in anything in [brackets], then send it from your own mail app.\n\n"
        f"To: {draft['to_email']}\nSubject: {draft['subject']}\n\n{draft['body']}\n"
        "Source: SmartStart team directory"
    )
