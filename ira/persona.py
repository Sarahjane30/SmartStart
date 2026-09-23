"""IRA personal profile — how to help *this* employee, not just what the company knows.

The profile has two parts:

* ``answers`` — what the employee told IRA in "Get to know me" (every question is skippable).
* ``observed`` — light, transparent signals IRA picks up from conversations
  (e.g. "asks for email templates a lot"). Shown to the employee and resettable.

Everything here is pure data + functions so the web backend and the desktop app
share the same behaviour.
"""

from __future__ import annotations

import re
from typing import Optional

# --- Questionnaire -----------------------------------------------------------

QUESTIONS: list[dict] = [
    {
        "id": "experience",
        "title": "Your experience",
        "prompt": "A little about where you're starting from.",
        "fields": [
            {"id": "first_job", "label": "Is this your first internship or job?", "multi": False,
             "options": [("yes", "Yes, it's my first"), ("no", "No, I've worked before")]},
            {"id": "corporate", "label": "Have you worked in a corporate environment before?", "multi": False,
             "options": [("no", "Not yet"), ("some", "A little"), ("yes", "Yes")]},
            {"id": "comm_comfort", "label": "How comfortable are you with professional communication?", "multi": False,
             "options": [("low", "Still learning"), ("ok", "Getting there"), ("high", "Confident")]},
            {"id": "tech_comfort", "label": "How comfortable are you with technical tools?", "multi": False,
             "options": [("low", "Still learning"), ("ok", "Getting there"), ("high", "Confident")]},
        ],
    },
    {
        "id": "learn",
        "title": "How you like to learn",
        "prompt": "Pick as many as you like.",
        "fields": [
            {"id": "learn", "label": "When I'm learning something new, I like it when you…", "multi": True,
             "options": [("show", "Show me"), ("steps", "Explain it step-by-step"), ("simple", "Just tell me simply"),
                         ("try", "Let me try it"), ("practice", "Practice with me")]},
        ],
    },
    {
        "id": "style",
        "title": "Communication style",
        "prompt": "How should IRA talk to you?",
        "fields": [
            {"id": "style", "label": "When you answer me…", "multi": True,
             "options": [("short", "Keep it short"), ("proper", "Explain things properly"),
                         ("examples", "Give me examples"), ("steps", "I like step-by-step instructions")]},
        ],
    },
    {
        "id": "nervous",
        "title": "Things you're unsure about",
        "prompt": "Totally normal — this just tells IRA where to help more.",
        "fields": [
            {"id": "nervous", "label": "What are you most unsure about as you start?", "multi": True,
             "options": [("manager", "Talking to my manager"), ("emails", "Writing emails"),
                         ("questions", "Asking questions"), ("technical", "Technical work"),
                         ("etiquette", "Corporate etiquette"), ("tools", "Using new tools"),
                         ("presentations", "Presentations"), ("expectations", "Knowing what I'm supposed to do"),
                         ("people", "Meeting new people"), ("ready", "Nothing — I'm ready")]},
        ],
    },
    {
        "id": "interests",
        "title": "Interests",
        "prompt": "What are you into outside work? IRA only uses this lightly.",
        "fields": [
            {"id": "interests", "label": "Pick any", "multi": True,
             "options": [("music", "Music"), ("gaming", "Gaming"), ("cricket", "Cricket"), ("football", "Football"),
                         ("sports", "Other sports"), ("books", "Books"), ("movies", "Movies & shows"),
                         ("coding", "Coding"), ("design", "Design"), ("fitness", "Fitness"),
                         ("cooking", "Cooking"), ("travel", "Travel")]},
        ],
    },
]

FIELD_IDS = {f["id"] for q in QUESTIONS for f in q["fields"]}
_OPTIONS = {f["id"]: {k for k, _ in f["options"]} for q in QUESTIONS for f in q["fields"]}
_LABELS = {f["id"]: dict(f["options"]) for q in QUESTIONS for f in q["fields"]}
MULTI_FIELDS = {f["id"] for q in QUESTIONS for f in q["fields"] if f["multi"]}


def questionnaire() -> list[dict]:
    """JSON-friendly questionnaire (options as {value, label})."""
    return [
        {
            **q,
            "fields": [
                {**f, "options": [{"value": v, "label": lbl} for v, lbl in f["options"]]}
                for f in q["fields"]
            ],
        }
        for q in QUESTIONS
    ]


def clean_answers(raw: dict | None) -> dict:
    """Keep only known fields/options; multi fields are lists, single fields strings."""
    out: dict = {}
    for key, value in (raw or {}).items():
        if key not in FIELD_IDS:
            continue
        allowed = _OPTIONS[key]
        if key in MULTI_FIELDS:
            vals = value if isinstance(value, list) else [value]
            picked = [v for v in vals if isinstance(v, str) and v in allowed]
            if picked:
                out[key] = list(dict.fromkeys(picked))
        elif isinstance(value, str) and value in allowed:
            out[key] = value
    if "ready" in out.get("nervous", []) and len(out["nervous"]) > 1:
        out["nervous"] = [v for v in out["nervous"] if v != "ready"]
    return out


def label_for(field: str, value: str) -> str:
    return _LABELS.get(field, {}).get(value, value)


def parse_free_text(field: str, text: str) -> list[str]:
    """Map typed answers ("examples and keep it short") onto option values."""
    t = text.lower()
    hits = []
    for value, label in _LABELS.get(field, {}).items():
        words = [w for w in re.findall(r"[a-z]+", label.lower()) if len(w) > 3]
        if value in t or any(w in t for w in words):
            hits.append(value)
    return hits


# --- Observed preferences -----------------------------------------------------

_OBSERVE_RULES: list[tuple[str, tuple[str, ...]]] = [
    ("email_templates", ("email", "mail", "message", "template", "draft", "write to")),
    ("examples", ("example", "for instance", "show me", "sample")),
    ("shorter", ("shorter", "short version", "tl;dr", "tldr", "briefly", "in short", "quick answer", "summarise", "summarize")),
    ("steps", ("step by step", "step-by-step", "walk me through")),
    ("practice", ("practice", "practise", "role play", "roleplay", "rehearse", "coach me")),
]


def observe(query: str, observed: dict | None) -> dict:
    """Update observed signal counters from one user message."""
    obs = dict(observed or {})
    q = query.lower()
    for key, words in _OBSERVE_RULES:
        if any(w in q for w in words):
            obs[key] = int(obs.get(key, 0)) + 1
    obs["turns"] = int(obs.get("turns", 0)) + 1
    return obs


def observed_labels(profile: dict | None, ctx: dict | None = None) -> list[str]:
    """Human-readable 'What IRA has noticed' list — nothing hidden."""
    p = profile or {}
    obs = p.get("observed") or {}
    ans = p.get("answers") or {}
    out: list[str] = []
    if obs.get("shorter", 0) >= 2 or "short" in ans.get("style", []):
        out.append("Prefers concise explanations")
    if obs.get("email_templates", 0) >= 2:
        out.append("Frequently asks for email templates")
    if obs.get("examples", 0) >= 2 or "examples" in ans.get("style", []) or "show" in ans.get("learn", []):
        out.append("Likes examples")
    if obs.get("steps", 0) >= 2 or "steps" in ans.get("style", []) or "steps" in ans.get("learn", []):
        out.append("Likes step-by-step instructions")
    if obs.get("practice", 0) >= 1 or {"try", "practice"} & set(ans.get("learn", [])):
        out.append("Prefers learning by doing")
    learning = (ctx or {}).get("learning") or {}
    done = [m["title"] for m in learning.get("modules", []) if m.get("status") == "complete"]
    if done:
        out.append(f"Has completed {done[-1]}")
    tasks = ((ctx or {}).get("onboarding") or {}).get("assigned_tasks") or []
    if tasks:
        out.append(f"Currently working on {tasks[0]}")
    return out


# --- Traits used to shape answers --------------------------------------------


def traits(profile: dict | None) -> dict:
    p = profile or {}
    ans = p.get("answers") or {}
    obs = p.get("observed") or {}
    style = set(ans.get("style", []))
    learn = set(ans.get("learn", []))
    beginner = (
        ans.get("first_job") == "yes"
        or ans.get("corporate") == "no"
        or ans.get("comm_comfort") == "low"
    )
    experienced = ans.get("first_job") == "no" and ans.get("corporate") == "yes"
    return {
        "known": bool(ans),
        "first_job": ans.get("first_job") == "yes",
        "beginner": beginner and not experienced,
        "experienced": experienced,
        "low_comm": ans.get("comm_comfort") == "low",
        "low_tech": ans.get("tech_comfort") == "low",
        "concise": "short" in style or obs.get("shorter", 0) >= 2 or ("simple" in learn and "proper" not in style),
        "thorough": "proper" in style,
        "examples": "examples" in style or "show" in learn or obs.get("examples", 0) >= 2
        or obs.get("email_templates", 0) >= 2,
        "steps": "steps" in style or "steps" in learn or obs.get("steps", 0) >= 2,
        "practice": bool({"practice", "try"} & learn) or obs.get("practice", 0) >= 1,
        "nervous": set(ans.get("nervous", [])) - {"ready"},
        "interests": list(ans.get("interests", [])),
    }


# --- Interest flavour (used sparingly) ---------------------------------------

_FLAVOUR = {
    "cricket": ("Think of it like a cricket side: every player has a clear role, but the innings only works when they back each other up.",
                "Let's finish this innings."),
    "football": ("Think of it like a football team: everyone has a position, and the goal comes from good passes between them.",
                 "Final whistle's close."),
    "sports": ("It's like any team sport: clear positions, and the result comes from how well people pass to each other.",
               "Nearly across the line."),
    "music": ("Think of it like a band: each person plays their part, and your manager keeps everyone on the same tempo.",
              "Last verse to go."),
    "gaming": ("Think of it like a co-op game: each role has its own abilities, and the run only works if the team coordinates.",
               "Final level — you've got this."),
    "movies": ("It's a bit like a film crew: everyone owns one part, and the director makes sure it all comes together.",
               "Roll credits soon."),
    "books": ("Think of it like chapters in a book: each step sets up the next one.",
              "Final chapter."),
    "coding": ("Think of it like a well-designed system: small services with clear owners, talking through agreed interfaces.",
               "Almost ready to ship."),
    "design": ("It's like a design system: each component has one job, and consistency is what makes it work together.",
               "Final polish."),
    "fitness": ("Think of it like a training plan: small, regular sessions add up faster than one big push.",
                "Last set."),
    "cooking": ("It's like a kitchen during service: everyone owns a station, and the head chef calls the timing.",
                "Nearly ready to plate up."),
    "travel": ("Think of it like planning a trip: bookings, documents and people all need to line up before you set off.",
               "Almost at your destination."),
}

_ANALOGY_TRIGGERS = ("how does", "how do teams", "why do", "what is the process", "how things connect",
                     "project readiness", "what is a sprint", "who does what", "how does onboarding")
_PROGRESS_TRIGGERS = ("what should i do now", "briefing", "how am i doing", "what's left", "whats left",
                      "what is left", "my progress")


def flavour_line(query: str, profile: dict | None, ctx: dict | None) -> Optional[str]:
    """One subtle interest-based line — only for explanations or progress, and not every turn."""
    t = traits(profile)
    if not t["interests"]:
        return None
    interest = next((i for i in t["interests"] if i in _FLAVOUR), None)
    if not interest:
        return None
    obs = (profile or {}).get("observed") or {}
    if int(obs.get("turns", 0)) - int(obs.get("last_flavour", -99)) < 4:
        return None
    q = query.lower()
    analogy, progress = _FLAVOUR[interest]
    if any(k in q for k in _ANALOGY_TRIGGERS):
        return analogy
    if any(k in q for k in _PROGRESS_TRIGGERS):
        learning = (ctx or {}).get("learning") or {}
        left = int(learning.get("total_count", 0)) - int(learning.get("completed_count", 0))
        if 0 < left <= 3:
            return f"You're nearly through — {left} module{'s' if left > 1 else ''} left. {progress}"
    return None


def first_name(ctx: dict | None) -> str:
    return (((ctx or {}).get("employee") or {}).get("name") or "there").split()[0]


def manager_name(ctx: dict | None) -> str:
    return ((ctx or {}).get("employee") or {}).get("manager_name") or "[Manager name]"


def welcome_summary(profile: dict | None, ctx: dict | None) -> str:
    """What IRA says right after Get to know me — shows the profile is actually used."""
    t = traits(profile)
    name = first_name(ctx)
    if not t["known"]:
        return (
            f"No problem, {name} — we can skip that. You can tell me how you like to work any time "
            "from “Personalise IRA”."
        )
    promises = []
    if t["concise"]:
        promises.append("keep answers short")
    elif t["thorough"]:
        promises.append("explain things properly")
    if t["examples"]:
        promises.append("give you examples and messages you can actually send")
    if t["steps"]:
        promises.append("break things into steps")
    if t["practice"]:
        promises.append("let you practise tricky conversations with me first")
    lines = [f"Thanks, {name}! I'll " + (", ".join(promises[:-1]) + " and " + promises[-1] if len(promises) > 1
                                        else (promises[0] if promises else "tailor how I help you")) + "."]
    if t["first_job"]:
        lines.append("Since this is your first job, I'll also explain the unwritten rules people usually take for granted.")
    nervous_help = {
        "manager": "talking to your manager",
        "emails": "writing emails",
        "questions": "asking questions",
        "etiquette": "workplace etiquette",
        "expectations": "knowing what's expected of you",
        "presentations": "presenting your work",
        "people": "meeting new people",
        "technical": "technical work",
        "tools": "new tools",
    }
    worries = [nervous_help[n] for n in t["nervous"] if n in nervous_help][:2]
    if worries:
        lines.append(
            "You mentioned " + " and ".join(worries)
            + " — Workplace Basics has guides for that, and we can rehearse it in Practice mode."
        )
    lines.append("You can change any of this in “Personalise IRA”.")
    return "\n".join(lines)
