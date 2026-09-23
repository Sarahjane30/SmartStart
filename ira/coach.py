"""IRA Coach — practise workplace conversations before having them for real.

IRA plays the other person (usually your manager), you write what you'd say,
and IRA replies in role and then gives short, kind, specific feedback.
The rubric is heuristic and transparent: every check is shown to the employee.
"""

from __future__ import annotations

import re
from typing import Optional

from ira import workplace_basics
from ira.persona import traits

# --- Rubric checks -------------------------------------------------------------

_SLANG = re.compile(
    r"\b(lol|lmao|bro|dude|wtf|omg|gonna|wanna|gotta|ya|yo|pls|plz|thx|u|ur|r|idk|nvm|bruh|kinda|sorta)\b", re.I
)
_HEDGES = ("sorry", "just wondering", "maybe", "stupid question", "dumb question", "i guess", "probably nothing",
           "i think maybe", "if it's not too much trouble", "bother you", "i'm useless", "i'm bad at")

_CHECKS: dict[str, dict] = {
    "clarity": {
        "label": "Clear and to the point",
        "praise": "You got to the point quickly.",
        "improve": "Try to say it in two or three short sentences so it's easy to follow.",
    },
    "professional": {
        "label": "Professional tone",
        "praise": "Your tone was friendly and professional.",
        "improve": "Swap the casual words (like “gonna” or “u”) for full ones — it reads more professional.",
    },
    "confident": {
        "label": "Confident, no over-apologising",
        "praise": "You sounded confident — no over-apologising.",
        "improve": "Drop the “sorry” and “maybe” — asking clearly is not a bother.",
    },
    "problem": {
        "label": "Explained the blocker",
        "praise": "You explained the problem clearly.",
        "improve": "Say exactly what you're stuck on (the task and what's going wrong).",
        "pattern": r"\b(stuck|blocked|block|error|issue|problem|unable|can'?t|cannot|isn'?t working|doesn'?t work|not working|failing|fails|unclear|not sure|confus)",
    },
    "tried": {
        "label": "Said what you already tried",
        "praise": "You said what you'd already tried — that saves a round of questions.",
        "improve": "Tell your manager what you've already tried before asking for help.",
        "pattern": r"\b(tried|i'?ve (checked|looked|read|searched|followed|tested|asked)|i (checked|looked|read|searched|followed|tested|asked)|attempted|went through)",
    },
    "next_step": {
        "label": "Asked for a specific next step",
        "praise": "You asked for a specific next step, so it's easy to say yes.",
        "improve": "End with a specific ask — for example “Could we take 10 minutes today?” or “Who should I ask?”",
        "pattern": r"(could we|can we|could you|can you|would you|would it be|is it ok|is that ok|would that work|who should i|point me|\d+\s*min|\bcall\b|pair on|walk me through|take a look|by (today|tomorrow|monday|tuesday|wednesday|thursday|friday))",
    },
    "specific": {
        "label": "Named the exact unclear part",
        "praise": "You named exactly which part was unclear.",
        "improve": "Point to the exact bit you're unsure about — “when you say X, do you mean A or B?”",
        "pattern": r"(do you mean|what you mean|by [\"“']?\w+|when you say|clarify|which (one|part)|\bor\b.*\?)",
    },
    "confirm": {
        "label": "Checked priority or deadline",
        "praise": "You checked the deadline or priority — that avoids surprises later.",
        "improve": "Confirm the deadline or priority so you both agree what “done” looks like.",
        "pattern": r"(deadline|by when|due|priority|timeline|when do you need|end of (day|week)|\bby (today|tomorrow|monday|tuesday|wednesday|thursday|friday))",
    },
    "about_you": {
        "label": "Said who you are",
        "praise": "You introduced yourself clearly.",
        "improve": "Start with one line about who you are and what you've done before.",
        "pattern": r"\b(i'?m\b|i am\b|my name|studied|study|graduat|background|before this|previously|worked on)",
    },
    "learning_goal": {
        "label": "Shared what you want to learn",
        "praise": "Sharing what you want to learn gives your manager something to work with.",
        "improve": "Add one thing you're keen to learn — it shows initiative.",
        "pattern": r"(learn|keen|excited|looking forward|interested in|want to get better|grow|develop)",
    },
    "asks_question": {
        "label": "Ended with a question",
        "praise": "Ending with a question turned it into a conversation.",
        "improve": "End with a question, like “What would a great first month look like for you?”",
        "pattern": r"\?",
    },
    "role_area": {
        "label": "Said your role or what you'll work on",
        "praise": "You said what you'll be working on, so people know when to come to you.",
        "improve": "Say your role and what you'll be working on.",
        "pattern": r"(joined as|joining as|working on|work on|i'?ll be|intern|engineer|analyst|developer|designer|role|team)",
    },
    "personal": {
        "label": "Added a personal detail",
        "praise": "The personal detail makes you easy to remember.",
        "improve": "Add one small personal detail — something you're into outside work.",
        "pattern": r"(outside (of )?work|i love|i enjoy|i'?m into|i like|hobby|fan of|in my free time|weekends?)",
    },
    "dates": {
        "label": "Gave the dates",
        "praise": "You gave clear dates.",
        "improve": "Give the exact dates you'll be away.",
        "pattern": r"(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|next week|\d{1,2}(st|nd|rd|th)?\b|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)",
    },
    "cover": {
        "label": "Said how your work is covered",
        "praise": "You said how your work will be covered — that's what managers worry about most.",
        "improve": "Say how your work is covered — what you'll finish before, or who can help while you're away.",
        "pattern": r"(cover|handover|hand over|finish|done before|complete|wrap up|won'?t (affect|block)|on track|up to date)",
    },
    "portal": {
        "label": "Mentioned the formal request",
        "praise": "You mentioned logging it properly.",
        "improve": "Say you'll submit it in the HR portal once they're okay with it.",
        "pattern": r"(portal|submit|log it|apply|request it|raise it|system|is that ok|would that work|does that work)",
    },
    "owns": {
        "label": "Owned the mistake",
        "praise": "You owned the mistake straight away — that builds trust.",
        "improve": "Start by owning it plainly: “I made a mistake on…”",
        "pattern": r"(i made a mistake|my mistake|i missed|i forgot|i broke|i accidentally|my fault|i messed up|i sent the wrong|i got .* wrong|i overlooked)",
    },
    "fixed": {
        "label": "Said what you did to fix it",
        "praise": "You said what you've already done to fix it.",
        "improve": "Say what you've already done to fix it (or your plan to).",
        "pattern": r"(fixed|reverted|corrected|resent|re-sent|rolled back|updated|already|i'?ve (sent|reached|told|contacted)|plan to fix|working on a fix)",
    },
    "prevent": {
        "label": "Said how you'll prevent it",
        "praise": "Saying how you'll prevent it shows you've learned from it.",
        "improve": "Add how you'll stop it happening again — a check, a checklist, a second pair of eyes.",
        "pattern": r"(next time|going forward|from now|to prevent|won'?t happen|checklist|double[- ]check|in future|in the future|make sure)",
    },
    "specific_work": {
        "label": "Picked one piece of work",
        "praise": "You asked about one specific piece of work.",
        "improve": "Name one piece of work — “my presentation on Tuesday”, not “my work”.",
        "pattern": r"(presentation|report|pr\b|pull request|code|document|doc\b|demo|analysis|slides|email|ticket|design|on my|the \w+ (i|we) )",
    },
    "specific_aspect": {
        "label": "Asked about one aspect",
        "praise": "Asking about one aspect makes it easy to give useful feedback.",
        "improve": "Ask about one aspect — clarity, structure, pace — so the answer is specific.",
        "pattern": r"(especially|particularly|in particular|specifically|clear|clarity|structure|pace|tone|approach|quality)",
    },
    "improve_ask": {
        "label": "Asked what to do better",
        "praise": "You asked what to improve, not just whether it was okay.",
        "improve": "Ask “What's one thing I could do better next time?”",
        "pattern": r"(better|improve|one thing|differently|change|work on)",
    },
    "acknowledge": {
        "label": "Acknowledged their view",
        "praise": "You acknowledged their point before sharing yours.",
        "improve": "Start by acknowledging their idea — “I see why that works for…”",
        "pattern": r"(i see|i understand|makes sense|good point|i agree|that works for|i get why|fair point|i like)",
    },
    "reason": {
        "label": "Gave a reason",
        "praise": "You gave a reason, so it's about the idea — not the person.",
        "improve": "Give the reason behind your concern.",
        "pattern": r"(because|since|concern|worried|risk|might|could cause|the issue|the problem|data|users?)",
    },
    "alternative": {
        "label": "Suggested a way forward",
        "praise": "You suggested a way forward instead of just saying no.",
        "improve": "Suggest an alternative — “Could we try…?” or “What if we…?”",
        "pattern": r"(could we|what if|how about|instead|alternatively|suggest|maybe we|we could|would it help|option)",
    },
}


def _check(key: str, text: str) -> bool:
    t = text.lower().replace("’", "'")
    words = re.findall(r"[A-Za-z']+", text)
    if key == "clarity":
        sentences = [s for s in re.split(r"[.!?]+", text) if s.strip()]
        longest = max((len(s.split()) for s in sentences), default=0)
        return 8 <= len(words) <= 110 and longest <= 45
    if key == "professional":
        caps = [w for w in words if len(w) > 2 and w.isupper()]
        return not _SLANG.search(text) and len(caps) <= 1 and "!!" not in text and "??" not in text
    if key == "confident":
        hedges = sum(t.count(h) for h in _HEDGES)
        return hedges == 0 or (hedges == 1 and "sorry" not in t)
    return bool(re.search(_CHECKS[key]["pattern"], t))


# --- Scenarios -----------------------------------------------------------------

SCENARIOS: dict[str, dict] = {
    "blocked": {
        "title": "Tell your manager you're stuck",
        "role": "manager",
        "setup": "You've been stuck on a task for a while. Tell your manager what's going on.",
        "opener": "Hey {me}, you mentioned you wanted to discuss your task. What's going on?",
        "checks": ["clarity", "professional", "confident", "problem", "tried", "next_step"],
        "replies": {
            "problem": "Okay — what exactly are you stuck on?",
            "tried": "Got it. What have you tried so far?",
            "next_step": "Thanks for telling me. What would help most right now?",
            "done": "Thanks for flagging it early — that's exactly what I want. Let's take 10 minutes this afternoon and go through it together.",
        },
        "basics": "blocked",
    },
    "clarify": {
        "title": "Ask for clarification on a task",
        "role": "manager",
        "setup": "Your manager gave you a task, but one part of it isn't clear.",
        "opener": "So that's the task — can you have a first version of the summary ready soon? Any questions?",
        "checks": ["clarity", "professional", "confident", "specific", "confirm"],
        "replies": {
            "specific": "Sure — which part is unclear?",
            "confirm": "Good question. Anything else before you start?",
            "done": "Great question — I mean the one-page version for the team, not the full report. End of Thursday works.",
        },
        "basics": "clarify",
    },
    "intro_manager": {
        "title": "Introduce yourself to your manager",
        "role": "manager",
        "setup": "It's your first 1:1 with your manager. Introduce yourself.",
        "opener": "Welcome to the team, {me}! Tell me a bit about yourself.",
        "checks": ["clarity", "professional", "confident", "about_you", "learning_goal", "asks_question"],
        "replies": {
            "about_you": "Nice! What did you do before joining us?",
            "learning_goal": "Great to meet you. What are you hoping to learn while you're here?",
            "asks_question": "Lovely — that's really helpful to know.",
            "done": "Love that. For your first month, success is getting set up, finishing Git Basics and shipping one small change. Sound good?",
        },
        "basics": "intro_manager",
    },
    "intro_team": {
        "title": "Introduce yourself in a team meeting",
        "role": "team",
        "setup": "Your manager says: “We have someone new — want to say hi?”",
        "opener": "Everyone, we have someone new joining us today. {me}, do you want to introduce yourself?",
        "checks": ["clarity", "professional", "confident", "about_you", "role_area", "personal"],
        "replies": {
            "about_you": "Welcome! Sorry, what was your name again?",
            "role_area": "Welcome! What will you be working on?",
            "personal": "Welcome aboard! What are you into outside work?",
            "done": "Welcome, {me}! Great to have you — ping any of us if you need anything.",
        },
        "basics": "intro_team",
    },
    "leave": {
        "title": "Ask your manager for leave",
        "role": "manager",
        "setup": "You need a day off next week. Ask your manager.",
        "opener": "Hi {me}, what's up?",
        "checks": ["clarity", "professional", "confident", "dates", "cover", "portal"],
        "replies": {
            "dates": "Sure — which days are you thinking?",
            "cover": "Should be fine. What happens with your tasks while you're out?",
            "portal": "That works for me.",
            "done": "That's fine — thanks for planning ahead. Go ahead and submit it in the HR portal and I'll approve it.",
        },
        "basics": "ask_leave",
    },
    "mistake": {
        "title": "Tell your manager you made a mistake",
        "role": "manager",
        "setup": "You sent a report with the wrong numbers to the team. Tell your manager.",
        "opener": "Hi {me}, you wanted to talk?",
        "checks": ["clarity", "professional", "owns", "fixed", "prevent"],
        "replies": {
            "owns": "Okay… what happened exactly?",
            "fixed": "Thanks for telling me. Have you been able to fix it?",
            "prevent": "Good. How do we avoid it next time?",
            "done": "Thanks for owning it so quickly — that's what matters. Mistakes happen; the way you handled it is exactly right.",
        },
        "basics": "mistake",
    },
    "feedback": {
        "title": "Ask for feedback",
        "role": "manager",
        "setup": "You finished your first piece of work. Ask your manager for feedback.",
        "opener": "Hey {me}, I've got a few minutes — what did you want to chat about?",
        "checks": ["clarity", "professional", "confident", "specific_work", "specific_aspect", "improve_ask"],
        "replies": {
            "specific_work": "Happy to! Feedback on what, specifically?",
            "specific_aspect": "Sure. Anything in particular you want me to look at?",
            "improve_ask": "It was good overall!",
            "done": "Great question. The structure was clear. One thing: lead with the result — people want the answer first.",
        },
        "basics": "feedback",
    },
    "disagree": {
        "title": "Politely disagree with an idea",
        "role": "manager",
        "setup": "Your manager suggests skipping testing to hit a deadline. You're worried about it.",
        "opener": "I think we should skip testing this sprint so we can ship by Friday. Thoughts?",
        "checks": ["professional", "confident", "acknowledge", "reason", "alternative"],
        "replies": {
            "acknowledge": "Hm. You don't think the deadline matters?",
            "reason": "Okay — why don't you think that's a good idea?",
            "alternative": "Fair. So what would you suggest?",
            "done": "That's a fair point — let's test the checkout flow only and ship the rest on Friday. Good call.",
        },
        "basics": "disagree",
    },
}

_START_WORDS = ("practice", "practise", "role play", "roleplay", "role-play", "rehearse", "coach me", "mock conversation",
                "pretend to be", "pretend you're", "act as my")
_SCENARIO_WORDS: list[tuple[str, tuple[str, ...]]] = [
    ("blocked", ("stuck", "blocked", "blocker", "need help")),
    ("clarify", ("clarif", "unclear", "don't understand", "dont understand")),
    ("intro_team", ("team meeting", "introduce myself to the team", "introduce myself to my team", "team intro", "meeting intro", "presentation", "present")),
    ("intro_manager", ("introduce", "introduction", "first meeting", "meet my manager")),
    ("leave", ("leave", "day off", "time off", "holiday", "vacation")),
    ("mistake", ("mistake", "messed up", "error i made", "broke")),
    ("feedback", ("feedback",)),
    ("disagree", ("disagree", "push back", "pushback")),
]
_END_WORDS = ("end practice", "stop practice", "exit practice", "stop practising", "stop practicing", "quit practice",
              "end coach", "stop coach", "i'm done", "im done")


def is_practice_request(query: str) -> bool:
    q = query.lower()
    return any(w in q for w in _START_WORDS)


def detect_start(query: str) -> Optional[str]:
    """Scenario id for a practice request, 'menu' if unspecified, None if not a practice request."""
    q = query.lower().replace("’", "'")
    if not is_practice_request(q):
        return None
    for sid, words in _SCENARIO_WORDS:
        if any(w in q for w in words):
            return sid
    return "menu"


def is_end(query: str) -> bool:
    q = query.lower().strip()
    return any(w in q for w in _END_WORDS) or q in {"stop", "exit", "end", "quit"}


def _people(ctx: dict | None) -> dict:
    emp = (ctx or {}).get("employee") or {}
    return {
        "me": (emp.get("name") or "there").split()[0],
        "manager": (emp.get("manager_name") or "your manager").split()[0],
        "manager_full": emp.get("manager_name") or "your manager",
    }


def _fill(text: str, ctx: dict | None) -> str:
    p = _people(ctx)
    return text.replace("{me}", p["me"]).replace("{manager}", p["manager"])


def role_name(scenario_id: str, ctx: dict | None) -> str:
    s = SCENARIOS.get(scenario_id) or {}
    if s.get("role") == "team":
        return "your team"
    return _people(ctx)["manager_full"]


def catalogue() -> list[dict]:
    return [{"id": sid, "title": s["title"], "setup": s["setup"]} for sid, s in SCENARIOS.items()]


def start(scenario_id: str, ctx: dict | None) -> Optional[dict]:
    s = SCENARIOS.get(scenario_id)
    if s is None:
        return None
    return {
        "scenario": scenario_id,
        "title": s["title"],
        "setup": s["setup"],
        "role": role_name(scenario_id, ctx),
        "opener": _fill(s["opener"], ctx),
    }


def menu_text(ctx: dict | None) -> str:
    lines = ["Let's practise! Pick a conversation and I'll play the other person:"]
    for s in SCENARIOS.values():
        lines.append(f"• {s['title']}")
    lines.append("Nothing you write here is shared with anyone — it's just practice.")
    return "\n".join(lines)


def menu_chips() -> list[str]:
    return [f"Practice: {s['title']}" for s in SCENARIOS.values()]


def scenario_from_chip(text: str) -> Optional[str]:
    t = text.strip().lower()
    if t.startswith("practice:") or t.startswith("practise:"):
        title = t.split(":", 1)[1].strip()
        for sid, s in SCENARIOS.items():
            if s["title"].lower() == title:
                return sid
    return None


def evaluate(scenario_id: str, message: str, profile: dict | None, ctx: dict | None) -> Optional[dict]:
    """Reply in role, then give feedback: headline, what went well, one change, a better version."""
    s = SCENARIOS.get(scenario_id)
    if s is None:
        return None
    msg = (message or "").strip()
    rubric = [{"key": k, "label": _CHECKS[k]["label"], "ok": _check(k, msg)} for k in s["checks"]]
    passed = [r for r in rubric if r["ok"]]
    failed = [r for r in rubric if not r["ok"]]
    content_fail = next((r for r in failed if r["key"] in s["replies"]), None)
    in_role = _fill(s["replies"][content_fail["key"]] if content_fail else s["replies"]["done"], ctx)

    ratio = len(passed) / len(rubric) if rubric else 0
    if not failed:
        headline = "That was really good!"
    elif ratio >= 0.6:
        headline = "That was good!"
    else:
        headline = "Good start — let's tighten it up."

    # Content checks first — they matter more than tone.
    ordered = sorted(passed, key=lambda r: r["key"] in ("clarity", "professional", "confident"))
    praise = [_CHECKS[r["key"]]["praise"] for r in ordered[:2]]
    focus = content_fail or (failed[0] if failed else None)
    improve = f"One thing I'd change: {_CHECKS[focus['key']]['improve'][0].lower()}{_CHECKS[focus['key']]['improve'][1:]}" if focus else ""

    tr = traits(profile)
    encourage = ""
    if failed and (tr["beginner"] or (scenario_id in {"blocked", "mistake"} and tr["nervous"] & {"manager", "questions"})):
        encourage = "This is exactly the kind of conversation that gets easier with practice — you're doing the right thing by rehearsing it."

    guide = workplace_basics.render(s["basics"], profile, ctx) or {}
    return {
        "scenario": scenario_id,
        "title": s["title"],
        "role": role_name(scenario_id, ctx),
        "in_role": in_role,
        "headline": headline,
        "praise": praise,
        "improve": improve,
        "encourage": encourage,
        "better": guide.get("template", ""),
        "rubric": rubric,
        "score": len(passed),
        "total": len(rubric),
        "done": not failed,
    }


def feedback_text(result: dict) -> str:
    """Plain-text version for the desktop app."""
    lines = [f"{result['role'].split()[0] if result['role'] != 'your team' else 'Team'}: “{result['in_role']}”", ""]
    lines.append(f"Coach feedback — {result['headline']}")
    for p in result["praise"]:
        lines.append(f"✓ {p}")
    if result["improve"]:
        lines.append(result["improve"])
    if result["encourage"]:
        lines.append(result["encourage"])
    if not result["done"] and result["better"]:
        lines.append("\nA version you could use:\n" + result["better"])
    lines.append(f"\n{result['score']}/{result['total']} checks · Reply again to try another version, or say “end practice”.")
    return "\n".join(lines)
