"""Conversational layer for IRA — greetings, small talk, typo repair and "did you mean" clarification.

Runs before the knowledge engine so a plain "hii" or "thanks" gets a human reply instead of
the no-source fallback. Replies only use the joiner's own approved context; nothing is invented.
"""

from __future__ import annotations

import difflib
import re
from typing import Optional

from ira.faq import FAQ

_EMOJI = re.compile("[\U0001F000-\U0001FAFF\u2600-\u27BF\uFE0F]+")

_GREET = (
    r"(?:h+i+|h+e+y+|hey+a+|hello+|hel+o+|hiya|howdy|yo+|sup|wassup|namaste|hola|greetings|"
    r"good\s+(?:morning|afternoon|evening|day)|g'?morning|morning|evening|gm)"
)
_GREET_TAIL = r"(?:\s+(?:there|ira|team|all|everyone|again|buddy|friend))*"
_GREET_ONLY = re.compile(rf"^{_GREET}{_GREET_TAIL}[\s!.,~:)-]*$", re.I)
_GREET_PREFIX = re.compile(rf"^{_GREET}{_GREET_TAIL}\s*[,!.:;-]*\s+(?=\S)", re.I)

_INTENTS: list[tuple[str, re.Pattern]] = [
    ("how_are_you", re.compile(
        r"^(?:(?:hi|hey|hello)\s*,?\s*)?(?:how\s+(?:are|r)\s+(?:you|u)(?:\s+doing)?(?:\s+today)?|how'?s\s+it\s+going|"
        r"how\s+are\s+things|what'?s\s+up|whats\s+up|wassup|sup|how\s+do\s+you\s+do|you\s+good)\b[\s?!.]*(?:ira)?[\s?!.]*$",
        re.I)),
    ("thanks", re.compile(
        r"^(?:ok(?:ay)?\s*,?\s*)?(?:thanks?(?:\s+you)?|thank\s*(?:you|u)|thx|thnx|thanx|ty|tysm|cheers|"
        r"much\s+appreciated|appreciate\s+it|that\s+helps|that\s+helped|great\s+thanks?)"
        r"(?:\s+(?:so|very)\s+much|\s+a\s+lot|\s+ira|\s+again|\s+for\s+(?:the|your)\s+help)*[\s!.]*$",
        re.I)),
    ("bye", re.compile(
        r"^(?:ok(?:ay)?\s*,?\s*)?(?:bye+|good\s*bye|see\s+(?:you|ya|u)(?:\s+later|\s+soon)?|later|cya|ttyl|"
        r"good\s*night|gn|take\s+care|catch\s+you\s+later)(?:\s+ira)?[\s!.]*$",
        re.I)),
    ("ack", re.compile(
        r"^(?:ok+(?:ay)?|k+|kk|cool|great|nice|awesome|perfect|got\s+it|gotcha|alright|all\s+right|sure|fine|"
        r"sounds\s+good|makes\s+sense|understood|noted|yes+|yeah|yep|yup|no+|nope|nah|hmm+|oh+|ah+|i\s+see|right)"
        r"[\s!.]*$",
        re.I)),
    ("help", re.compile(
        r"^(?:(?:can|could|will)\s+(?:you|u)\s+help(?:\s+me)?|help(?:\s+me)?|i\s+need\s+(?:some\s+)?help|"
        r"i\s+have\s+(?:a|some)\s+(?:quick\s+)?questions?|quick\s+question|can\s+i\s+ask\s+(?:you\s+)?(?:something|a\s+question)|"
        r"i'?m\s+(?:confused|lost|stuck)|i\s+don'?t\s+know\s+(?:what\s+to\s+(?:do|ask)|where\s+to\s+start)|"
        r"where\s+do\s+i\s+start|what\s+now)[\s?!.]*$",
        re.I)),
    ("identity", re.compile(
        r"^(?:are\s+(?:you|u)\s+(?:a\s+)?(?:bot|robot|human|real|person|ai|chat\s*gpt|an?\s+ai)|what'?s\s+your\s+name|"
        r"what\s+is\s+your\s+name|who\s+(?:made|built|created)\s+(?:you|u)|who\s+r\s+u)[\s?!.]*$",
        re.I)),
    ("laugh", re.compile(r"^(?:lol+|lmao+|haha+|hehe+|rofl|xd|:d)[\s!.]*$", re.I)),
    ("compliment", re.compile(
        r"^(?:(?:you'?re|you\s+are|ur)\s+(?:great|awesome|amazing|the\s+best|so\s+helpful|helpful|smart|cool)|"
        r"good\s+(?:job|bot)|well\s+done|love\s+(?:it|you|this)|nice\s+one)[\s!.]*$",
        re.I)),
    ("frustrated", re.compile(
        r"^(?:(?:you'?re|you\s+are|ur)\s+(?:useless|wrong|dumb|stupid|not\s+helpful|unhelpful)|that'?s\s+(?:wrong|not\s+(?:right|it|helpful|what\s+i\s+(?:asked|meant)))|"
        r"not\s+helpful|wrong(?:\s+answer)?|that\s+didn'?t\s+help|you\s+don'?t\s+understand|you\s+didn'?t\s+understand|"
        r"that\s+makes\s+no\s+sense|what\??|huh\??|no\s+that'?s\s+wrong)[\s!.?]*$",
        re.I)),
    ("sorry", re.compile(r"^(?:sorry|my\s+bad|oops|never\s*mind|nvm|forget\s+it|ignore\s+that)[\s!.]*$", re.I)),
]

_SLANG = {
    "u": "you", "ur": "your", "r": "are", "pls": "please", "plz": "please", "plzz": "please", "wat": "what",
    "wht": "what", "wut": "what", "hw": "how", "whr": "where", "wer": "where", "wher": "where", "abt": "about",
    "idk": "i don't know", "lappy": "laptop", "mgr": "manager", "pwd": "password", "wfh": "work from home",
    "tmrw": "tomorrow", "tmr": "tomorrow", "2day": "today", "b4": "before", "coz": "because", "cuz": "because",
    "wanna": "want to", "gonna": "going to", "gimme": "give me", "lemme": "let me", "dunno": "don't know",
    "whos": "who's", "wheres": "where's", "whats": "what's", "hows": "how's", "cant": "can't", "dont": "don't",
    "im": "i'm", "ive": "i've", "doesnt": "doesn't", "isnt": "isn't", "wont": "won't",
}

_VOCAB = sorted({
    "laptop", "leave", "leaves", "holiday", "holidays", "salary", "payslip", "payroll", "manager", "mentor", "buddy",
    "password", "reset", "jira", "servicenow", "okta", "github", "vpn", "wifi", "expense", "expenses", "reimburse",
    "reimbursement", "ticket", "onboarding", "briefing", "document", "documents", "learning", "module", "training",
    "course", "project", "access", "software", "hardware", "keyboard", "monitor", "benefits", "insurance", "dress",
    "policy", "office", "cafeteria", "team", "department", "blocking", "ready", "calendar", "email", "phishing",
    "security", "waters", "stipend", "approve", "approver", "where", "what", "when", "which", "should", "raise",
    "request", "broken", "working", "schedule", "mentor", "tasks", "progress", "status", "apply", "connect",
})
_COMMON = {
    "have", "live", "love", "leaf", "late", "lets", "tell", "this", "that", "then", "them", "they", "there", "their",
    "with", "want", "need", "know", "work", "will", "would", "could", "about", "from", "your", "mine", "make",
    "take", "give", "help", "please", "thanks", "today", "tomorrow", "manage", "managed", "team's", "here", "were",
    "whom", "whose", "while", "who's", "time", "some", "more", "much", "many", "also", "just", "like", "good",
    "reach", "read", "ready", "real", "call", "come", "cost", "code", "role", "rule", "does", "done", "doing",
}

_KNOWN_QUESTIONS = [
    "Give me my briefing", "What should I do now?", "What's blocking me?", "Where's my laptop?",
    "Who is my manager?", "Who is my mentor?", "What's my team?", "What is my role?", "Am I ready for Day 1?",
    "How do I apply for leave?", "How many leave days do I get?", "Where is the holiday calendar?",
    "When will I get my salary?", "Where is my payslip?", "How do I claim expenses?", "What is the dress code?",
    "How do I reset my password?", "How do I report phishing?", "How do I raise an IT ticket?",
    "How do I request access to an app?", "What is Jira?", "What is ServiceNow?", "What is Waters?",
    "What should I learn?", "What's left on my onboarding?", "When is my first day?", "What benefits do I get?",
    "How do I connect to the VPN?", "Which apps should I use?", "How do I email my manager?",
    "Practice: Ask your manager for help",
] + [q for q, _a, _k in FAQ]

_STOP = {
    "i", "me", "my", "a", "an", "the", "is", "are", "am", "do", "does", "to", "of", "for", "in", "on", "and", "or",
    "what", "whats", "what's", "how", "where", "who", "when", "which", "why", "can", "could", "should", "would",
    "you", "your", "it", "this", "that", "be", "get", "with", "at", "about", "please", "ira", "tell", "know",
}


def _clean(text: str) -> str:
    return re.sub(r"\s+", " ", _EMOJI.sub(" ", text)).strip()


def expand_slang(text: str) -> str:
    def swap(m: re.Match) -> str:
        word = m.group(0)
        rep = _SLANG.get(word.lower())
        return rep if rep else word

    return re.sub(r"[A-Za-z0-9']+", swap, text)


def fix_typos(text: str) -> str:
    """Correct misspelled domain words (e.g. "laptp", "leav", "sallary"); returns text unchanged if nothing fits."""

    def fix(m: re.Match) -> str:
        word = m.group(0)
        low = word.lower()
        if len(low) < 4 or low in _VOCAB or low in _COMMON:
            return word
        hit = difflib.get_close_matches(low, _VOCAB, n=1, cutoff=0.8)
        return hit[0] if hit else word

    return re.sub(r"[A-Za-z']+", fix, text)


def strip_greeting(text: str) -> str:
    """Drop a leading greeting / filler so "hi ira, where's my laptop?" answers the actual question."""
    t = _clean(text)
    t = _GREET_PREFIX.sub("", t)
    t = re.sub(
        r"^(?:i\s+have\s+a\s+(?:quick\s+)?question|quick\s+question|question|can\s+i\s+ask(?:\s+you)?(?:\s+something)?)"
        r"\s*(?:[:,-]|about|regarding|on)?\s+(?=\S)",
        "",
        t,
        flags=re.I,
    )
    t = re.sub(r"^(?:can|could)\s+(?:you|u)\s+(?:please\s+)?help\s+me\s+(?:with\s+|understand\s+)(?=\S)", "", t, flags=re.I)
    return t or text


def _first(ctx: Optional[dict]) -> str:
    name = ((ctx or {}).get("employee") or {}).get("name") or ""
    return name.split()[0] if name else ""


def _nudge(ctx: Optional[dict]) -> str:
    if not ctx:
        return ""
    intel = ctx.get("intelligence") or {}
    actions = intel.get("next_best_actions") or []
    onb = ctx.get("onboarding") or {}
    pct = onb.get("progress_pct")
    lead = f"You're about {pct}% through onboarding" if pct is not None else ""
    if actions:
        a = actions[0]
        title, detail = a.get("title") or "", a.get("detail") or ""
        top = title + (f" — {detail[0].lower() + detail[1:]}" if detail and detail != title else "")
        return f"{lead}. Top of your list: {top}." if lead else f"Top of your list: {top}."
    if onb.get("next_action"):
        return f"{lead}. Next up: {onb['next_action']}" if lead else f"Next up: {onb['next_action']}"
    return f"{lead}." if lead else ""


def _greeted_before(history: Optional[list[tuple[str, str]]]) -> bool:
    return any(r == "user" and _GREET_ONLY.match(_clean(t)) for r, t in (history or [])[:-1])


def _echo_greeting(text: str) -> str:
    t = _clean(text).lower()
    m = re.match(r"good\s+(morning|afternoon|evening|day)", t)
    if m:
        return f"Good {m.group(1)}"
    if re.match(r"(?:g'?morning|morning|gm)\b", t):
        return "Good morning"
    if t.startswith("evening"):
        return "Good evening"
    return "Hi"


def intent(text: str) -> Optional[str]:
    t = _clean(text)
    if not t:
        return None
    if _GREET_ONLY.match(t):
        return "greet"
    for name, rx in _INTENTS:
        if rx.match(t):
            return name
    return None


def smalltalk(text: str, ctx: Optional[dict], *, online: bool = True,
              history: Optional[list[tuple[str, str]]] = None) -> Optional[str]:
    kind = intent(text)
    if kind is None:
        return None
    name = _first(ctx)
    hi_name = f" {name}" if name else ""
    c_name = f", {name}" if name else ""
    nudge = _nudge(ctx)
    emp = (ctx or {}).get("employee") or {}

    if kind == "greet":
        if _greeted_before(history):
            return f"Hi again{hi_name}! What would you like to know?"
        opener = _echo_greeting(text)
        if ctx:
            lines = [f"{opener}{c_name if opener != 'Hi' else hi_name}! Good to see you."]
            if nudge:
                lines.append(nudge)
            lines.append("What can I help with? Ask me anything — your laptop, leave, who to ask, or how things work at Waters.")
            return "\n".join(lines)
        if not online:
            return (
                f"{opener}! I'm IRA, your Waters onboarding companion.\n"
                "I can already help with general questions — apps, policies, and how things work here. "
                "Sign in to SmartStart and I'll answer from your own onboarding record too."
            )
        return (
            f"{opener}! I'm IRA, your Waters onboarding companion. "
            "Ask me about apps, policies, IT, HR, or how things work here — what's on your mind?"
        )
    if kind == "how_are_you":
        tail = f" {nudge}" if nudge else ""
        return (
            f"I'm doing well, thanks for asking{c_name}! More importantly — how's your onboarding going?{tail}\n"
            "Tell me what's on your mind, or ask “What should I do now?”"
        )
    if kind == "thanks":
        return f"You're welcome{c_name}! Anything else I can help with?"
    if kind == "bye":
        return f"Bye for now{c_name} — I'm here whenever you need me. Good luck today!"
    if kind == "ack":
        return "Great. What would you like to do next? Pick a suggestion below or just ask."
    if kind == "help":
        return (
            f"Of course{c_name} — ask me anything, in your own words. I'm best at:\n"
            "• Your onboarding — laptop, tasks, what to do next, what's blocking you\n"
            "• Who to ask — your manager, mentor, HR or IT\n"
            "• How things work — leave, pay, expenses, IT tickets, policies\n"
            "• Practising tricky conversations before you have them\n"
            "What's it about?"
        )
    if kind == "identity":
        return (
            "I'm IRA — Waters' onboarding assistant, not a person. I answer from approved Waters sources and "
            "your own SmartStart record, I say so when I don't know, and I never take actions on your behalf."
        )
    if kind == "laugh":
        return "Glad that made you smile! Anything else you'd like to know?"
    if kind == "compliment":
        return f"Thank you{c_name} — that's kind. Happy to help — what's next?"
    if kind == "frustrated":
        people = [p for p in (emp.get("mentor_name"), emp.get("manager_name")) if p]
        who = f" If it's urgent, {' or '.join(people)} can help you directly." if people else ""
        return (
            f"Sorry{c_name} — that wasn't the answer you needed. Could you say it another way, "
            "or add a keyword like “laptop”, “leave”, “mentor” or “ticket”? You can also pick one below." + who
        )
    if kind == "sorry":
        return "No worries at all! Ask me whenever you're ready."
    return None


def _tokens(text: str) -> set[str]:
    words = re.findall(r"[a-z0-9']+", text.lower())
    return {w[:5] for w in words if w not in _STOP and len(w) > 1}


def did_you_mean(text: str, limit: int = 3) -> list[str]:
    """Closest known questions to what the user typed, best first."""
    q = _tokens(fix_typos(expand_slang(text)))
    if not q:
        return []
    scored = []
    for cand in dict.fromkeys(_KNOWN_QUESTIONS):
        c = _tokens(cand)
        overlap = len(q & c)
        if not overlap:
            continue
        ratio = difflib.SequenceMatcher(None, text.lower(), cand.lower()).ratio()
        scored.append((overlap + ratio, cand))
    scored.sort(key=lambda s: -s[0])
    return [c for _s, c in scored[:limit]]


def clarify(text: str, ctx: Optional[dict]) -> tuple[str, list[str]]:
    """A helpful 'I didn't get that' — honest, with the closest questions IRA can answer."""
    name = _first(ctx)
    picks = did_you_mean(text)
    who = f", {name}" if name else ""
    if picks:
        lines = [f"I'm not sure I understood that{who}, and I don't want to guess. Did you mean:"]
        lines += [f"• {p}" for p in picks]
        lines.append("Or ask it another way — I understand everyday wording.")
        return "\n".join(lines), picks
    starters = ["What should I do now?", "Where's my laptop?", "How do I apply for leave?"]
    return (
        f"I don't have an approved answer for that yet{who}, so I won't guess. "
        "I can help with your onboarding, IT, HR, pay, leave, policies and who to ask — "
        "try one of these, or ask your manager or mentor for anything outside that.",
        starters,
    )
