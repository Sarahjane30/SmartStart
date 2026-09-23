"""Workplace Basics — the unwritten rules experienced employees take for granted.

Each guide explains *why*, not just *what*, and renders differently depending on
the employee's profile (first job vs experienced, concise vs step-by-step, etc.).
Placeholders: {manager} {me} {mentor} {team}.
"""

from __future__ import annotations

import re
from typing import Optional

from ira.persona import traits

GROUPS = ["Talking to people", "Writing messages", "Meetings", "Tricky moments"]

TOPICS: list[dict] = [
    {
        "id": "intro_manager", "group": "Talking to people",
        "title": "Introduce yourself to your manager",
        "triggers": ("introduce myself to my manager", "introduce yourself to your manager", "first meeting with my manager",
                     "meet my manager", "introduce myself to manager"),
        "why": "Your manager wants to know three things early: who you are, what you're keen to learn, and how you like to work. Saying it up front saves weeks of guessing.",
        "template": "Hi {manager}, I'm {me} — really glad to be on the team. Before this I [studied / worked on X]. "
                    "I'm keen to learn [skill] and get stuck into [area]. I work best with [clear priorities / regular check-ins]. "
                    "What would make my first month a success from your side?",
        "steps": ["Say who you are in one line.", "Share one thing you're excited to learn.", "Say how you like to work.",
                  "Ask what success looks like for them."],
        "structure": "Who I am → what I want to learn → how I work → what success looks like",
        "short": "Hi {manager}, I'm {me}. I'm keen to learn [skill]. What would a great first month look like for you?",
        "swaps": [("I'll do whatever you need.", "I'm keen to learn [skill] — where can I help most?",
                   "It shows initiative and gives your manager something concrete to work with.")],
        "tip": "Ending with a question turns an introduction into a conversation.",
        "practice": "intro_manager", "nervous": ("manager", "people"),
    },
    {
        "id": "intro_team", "group": "Talking to people",
        "title": "Introduce yourself in a team meeting",
        "triggers": ("introduce myself in a team meeting", "introduce myself to the team", "introduce myself to my team",
                     "team introduction", "introduce myself in a meeting"),
        "why": "Team intros are short on purpose. People remember one detail about you, so give them a useful one and a fun one.",
        "template": "Hi everyone, I'm {me} — I've just joined as [role] and I'll be working on [area]. "
                    "Before this I [one line]. Outside work I'm into [interest]. Looking forward to working with you all!",
        "steps": ["Name and role.", "What you'll work on.", "One line of background.", "One personal detail.", "A friendly close."],
        "structure": "Name + role → what I'll work on → one fun fact",
        "short": "Hi all, I'm {me}, the new [role] working on [area]. Outside work I'm into [interest] — excited to be here!",
        "swaps": [("I'm just the intern.", "I'm {me}, the new intern working on [area].",
                   "'Just' shrinks your role. You're part of the team — introduce yourself like it.")],
        "tip": "Keep it under 30 seconds. Nobody expects a speech.",
        "practice": "intro_team", "nervous": ("people", "presentations"),
    },
    {
        "id": "ask_help", "group": "Talking to people",
        "title": "Ask for help",
        "triggers": ("ask for help", "ask my manager for help", "ask someone for help", "ask my mentor for help", "how do i get help"),
        "why": "Asking for help is expected — especially early. What people appreciate is a question that's easy to answer: what you're doing, what you tried, and what you need.",
        "template": "Hi {mentor}, quick question on [task]. I'm trying to [goal]. I've tried [X] and [Y], but [what's happening]. "
                    "Could you point me in the right direction, or suggest who to ask?",
        "steps": ["Say what you're working on.", "Say what you've tried.", "Say exactly what you need.", "Make it easy to say yes (a quick call, a link, a name)."],
        "structure": "Context → what I tried → what I need",
        "short": "Hi {mentor} — stuck on [task]. Tried [X]. Could you point me to the right place?",
        "swaps": [("Sorry to bother you, this is probably a stupid question…", "Quick question on [task] —",
                   "Apologising makes it sound like a burden. A clear question is never a bother.")],
        "tip": "A good rule: try for about 30 minutes, then ask — with what you tried.",
        "practice": "blocked", "nervous": ("questions", "manager"),
    },
    {
        "id": "clarify", "group": "Talking to people",
        "title": "Ask for clarification",
        "triggers": ("ask for clarification", "clarify something", "ask them to clarify", "didn't understand the task", "task is unclear",
                     "instructions are unclear"),
        "why": "Clarifying early is a sign of care, not confusion. Guessing and redoing work costs everyone more time.",
        "template": "Thanks for the brief, {manager}. Just to make sure I get this right — when you say [X], do you mean [option A] or [option B]? "
                    "And is [deadline] still the target?",
        "steps": ["Thank them / reference the request.", "Name the exact bit that's unclear.", "Offer your best interpretation.", "Confirm the deadline or priority."],
        "structure": "Reference → the specific unclear bit → my best guess → confirm",
        "short": "Quick check on [task]: by [X] do you mean [A] or [B]?",
        "swaps": [("I don't understand.", "Could you please clarify what you mean by [X]?",
                   "Both mean the same thing, but the second makes the request specific, so it's easier to answer.")],
        "tip": "Offering your own interpretation shows you've thought about it — people just need to say yes or no.",
        "practice": "clarify", "nervous": ("questions", "expectations"),
    },
    {
        "id": "dont_understand", "group": "Talking to people",
        "title": "Say you don't understand something",
        "triggers": ("say i don't understand", "say i dont understand", "don't understand something", "admit i don't understand",
                     "tell them i don't get it", "i don't get it"),
        "why": "Everyone hits things they don't understand. Saying so early — with what you *do* understand — keeps you moving and builds trust.",
        "template": "I want to make sure I've got this right. I follow [the part you understand], but I'm not clear on [the part you don't]. "
                    "Could you walk me through that bit, or point me to where I can read up on it?",
        "steps": ["Say what you do understand.", "Name the part you don't.", "Ask for a walkthrough or a resource."],
        "structure": "What I get → what I don't → can you help with that bit",
        "short": "I follow [A], but I'm not clear on [B] — could you explain that part?",
        "swaps": [("Sorry, I'm lost.", "I follow [A], but I'm not clear on [B].",
                   "It tells the other person exactly where to start, so the explanation is shorter.")],
        "tip": "Nodding along and hoping it makes sense later is the most common new-joiner mistake.",
        "practice": "clarify", "nervous": ("questions", "technical"),
    },
    {
        "id": "ask_leave", "group": "Writing messages",
        "title": "Ask for leave",
        "triggers": ("ask for leave", "ask my manager for leave", "request leave from my manager", "leave email", "message for leave",
                     "ask for time off", "ask for a day off", "tell my manager i need leave"),
        "why": "Managers mostly care about two things: when you'll be away, and what happens to your work. Answer both and approval is usually quick.",
        "template": "Hi {manager}, I'd like to take leave on [dates] for [short reason — optional]. "
                    "I'll finish [task] before I go, and [colleague] has agreed to cover [anything urgent]. "
                    "If that works, I'll submit it in the HR portal. Thanks!",
        "steps": ["Give the dates.", "Say how your work is covered.", "Say you'll log it in the HR portal.", "Ask early — at least a week ahead for planned leave."],
        "structure": "Dates → how work is covered → I'll log it in the HR portal",
        "short": "Hi {manager} — could I take [dates] off? [Task] will be done before, [colleague] can cover. I'll log it in the HR portal.",
        "swaps": [("Can I maybe have Friday off if that's okay?", "I'd like to take leave on Friday — [task] will be done by Thursday.",
                   "It's still polite, but it sounds planned rather than nervous.")],
        "tip": "You don't have to explain why you need leave. 'Personal reasons' is enough.",
        "practice": "leave", "nervous": ("manager", "etiquette"),
    },
    {
        "id": "email", "group": "Writing messages",
        "title": "Write a professional email",
        "triggers": ("email my manager", "write a professional email", "write an email", "write a work email", "professional email",
                     "email etiquette", "formal email", "how to email", "how do i email"),
        "why": "Busy people read the subject and first line, then decide. Put the point up front and make the ask obvious.",
        "template": "Subject: Quick question regarding [today's task]\n\nHi {manager},\n\nI had a quick question regarding [task]. "
                    "I wanted to confirm whether [question].\n\nThanks,\n{me}",
        "steps": ["Write a subject that says what it's about.", "Greet them by name.", "Put the point or question in the first line.",
                  "Say what you need and by when.", "Sign off simply."],
        "structure": "Context → Question → Action needed",
        "short": "Subject: [Topic] — quick question\n\nHi {manager}, on [task]: [question]? I need this by [time] to [reason]. Thanks, {me}",
        "swaps": [("Dear Sir/Madam, I hope this email finds you well…", "Hi {manager},",
                   "Internal emails are friendly and direct. First names are normal here.")],
        "tip": "You don't need to make work emails sound overly formal. Clear + polite is enough.",
        "practice": None, "nervous": ("emails", "etiquette"),
    },
    {
        "id": "chat_message", "group": "Writing messages",
        "title": "Message someone on Teams or Slack",
        "triggers": ("message someone on teams", "message someone on slack", "slack message", "teams message", "dm someone",
                     "message my manager on teams", "message my manager on slack", "chat etiquette"),
        "why": "Chat is for quick, async questions. Sending one complete message lets people answer when they're free.",
        "template": "Hi {mentor}! Quick question on [topic]: [question]. No rush — anytime today works.",
        "steps": ["Greet and ask in the same message.", "Include links or screenshots.", "Say how urgent it is.", "Use threads for follow-ups."],
        "structure": "Hi + question + context + urgency — all in one message",
        "short": "Hi {mentor} — quick q on [topic]: [question]? No rush.",
        "swaps": [("Hi", "Hi! Quick question on [topic]: [question]",
                   "A lone 'Hi' makes people wait for the real question. Put it all in one message.")],
        "tip": "Check their status and time zone before expecting a quick reply.",
        "practice": None, "nervous": ("etiquette", "tools", "questions"),
    },
    {
        "id": "follow_up", "group": "Writing messages",
        "title": "Follow up without sounding annoying",
        "triggers": ("follow up", "follow-up", "chase someone", "no reply", "they didn't reply", "haven't heard back", "nudge someone"),
        "why": "People miss messages all the time. A short, friendly follow-up that restates the ask is helpful, not pushy.",
        "template": "Hi [name], just bringing this back to the top of your inbox — could you let me know about [question] by [date]? "
                    "It's holding up [task]. Thanks!",
        "steps": ["Wait 2–3 working days (or less if urgent).", "Reply in the same thread.", "Restate the ask in one line.", "Say why it matters or give a date."],
        "structure": "Same thread → restate the ask → why it matters / by when",
        "short": "Hi [name] — following up on [question]. Could you let me know by [date]? It's blocking [task].",
        "swaps": [("Just following up again?? Any update??", "Bringing this back up — could you confirm [X] by Thursday?",
                   "A clear ask with a date is easier to act on than a vague 'any update'.")],
        "tip": "After two follow-ups with no reply, ask your manager or mentor who else can help.",
        "practice": None, "nervous": ("emails", "etiquette"),
    },
    {
        "id": "schedule", "group": "Meetings",
        "title": "Schedule a meeting",
        "triggers": ("schedule a meeting", "book a meeting", "set up a meeting", "send a meeting invite", "calendar invite"),
        "why": "A good invite answers 'why should I come?' before anyone asks. Short meetings with an agenda get accepted faster.",
        "template": "Title: [Topic] — 20 min\nAgenda:\n1. [Point one]\n2. [Point two]\nGoal: [decision or outcome]\n\n"
                    "Hi all, I'd like 20 minutes to [goal]. If this time doesn't work, feel free to suggest another.",
        "steps": ["Check calendars for a free slot.", "Keep it short — 15–30 minutes.", "Write a title and agenda.", "Say what the goal is.", "Add a Teams link."],
        "structure": "Clear title → 2–3 point agenda → goal → short duration",
        "short": "[Topic] — 20 min. Agenda: [A], [B]. Goal: [decision].",
        "swaps": [("Meeting", "Onboarding plan review — 20 min",
                   "A specific title tells people why they're invited before they even open it.")],
        "tip": "If it can be solved in two messages, it doesn't need a meeting.",
        "practice": None, "nervous": ("etiquette", "tools"),
    },
    {
        "id": "one_on_one", "group": "Meetings",
        "title": "Prepare for a 1:1",
        "triggers": ("prepare for a 1:1", "prepare for my 1:1", "1:1 with my manager", "one on one", "one-on-one", "weekly check-in"),
        "why": "A 1:1 is your meeting, not your manager's. Bringing a short list makes it useful for both of you.",
        "template": "1:1 notes — [date]\n• Wins: [one thing that went well]\n• Blockers: [one thing slowing you down]\n"
                    "• Questions: [one thing you want to ask]\n• Next week: [what you'll focus on]",
        "steps": ["Write down one win.", "One blocker.", "One question.", "What you'll work on next.", "Note any actions agreed."],
        "structure": "Win → blocker → question → next focus",
        "short": "Win: [X]. Blocker: [Y]. Question: [Z].",
        "swaps": [("Nothing much to talk about.", "One thing I'd love your view on is [X].",
                   "Managers use 1:1s to help you grow — give them something to help with.")],
        "tip": "Keep a running doc and add to it during the week — prep then takes two minutes.",
        "practice": None, "nervous": ("manager", "expectations"),
    },
    {
        "id": "lets_connect", "group": "Meetings",
        "title": "Respond when someone says “Let's connect”",
        "triggers": ("let's connect", "lets connect", "let’s connect", "someone said lets connect", "someone says let's connect"),
        "why": "'Let's connect' usually means 'let's have a short chat' — but nobody books it. Offering a time turns a nice idea into a real meeting.",
        "template": "Hi [name], great to meet you earlier! You mentioned we should connect — would 20 minutes on [day] or [day] work? "
                    "I'd love to hear about [their area].",
        "steps": ["Reply within a day.", "Offer two specific times.", "Say what you'd like to talk about.", "Send the invite once they pick."],
        "structure": "Thanks → two time options → topic",
        "short": "Hi [name] — keen to connect! 20 min on [day] or [day]? Would love to hear about [area].",
        "swaps": [("Sure, sometime!", "Would Tuesday at 2 or Thursday at 11 work?",
                   "Specific times make it easy to say yes. 'Sometime' usually means never.")],
        "tip": "Being the one who books it is a small thing people remember.",
        "practice": None, "nervous": ("people", "etiquette"),
    },
    {
        "id": "disagree", "group": "Tricky moments",
        "title": "Politely disagree",
        "triggers": ("politely disagree", "disagree with my manager", "disagree with someone", "push back", "pushback", "i disagree"),
        "why": "Good teams disagree about ideas, not people. Acknowledge their point, give your reason, and suggest a way forward.",
        "template": "I see why [their idea] makes sense for [reason]. One concern I have is [your reason]. "
                    "Could we try [alternative], or check [data] before we decide?",
        "steps": ["Acknowledge their point.", "Share your concern with a reason.", "Suggest an alternative.", "Leave room for them to decide."],
        "structure": "Acknowledge → concern + reason → alternative",
        "short": "I see the point on [X]. My concern is [Y] — could we try [Z]?",
        "swaps": [("That's wrong.", "I see why that works for [X] — one concern is [Y].",
                   "It keeps the focus on the idea, so people stay open instead of defensive.")],
        "tip": "Asking a question ('Have we considered…?') is often the gentlest way to disagree.",
        "practice": "disagree", "nervous": ("manager", "etiquette"),
    },
    {
        "id": "blocked", "group": "Tricky moments",
        "title": "Tell your manager you're blocked",
        "triggers": ("tell my manager i'm blocked", "tell my manager im blocked", "i'm blocked", "im blocked", "i am blocked",
                     "stuck on my task", "i'm stuck", "im stuck", "tell my manager i'm stuck", "blocked on"),
        "why": "Being blocked is normal. Being blocked quietly for days is the real problem. Flagging early — with what you've tried — is a strength.",
        "template": "Hi {manager}, I wanted to flag that I'm stuck on [task]. I've tried [X] and [Y], but [problem]. "
                    "Could we spend 10 minutes on it today, or is there someone you'd suggest I ask?",
        "steps": ["Say what you're blocked on.", "Say what you've already tried.", "Say what's happening.", "Ask for a specific next step."],
        "structure": "What's blocked → what I tried → what I need",
        "short": "Hi {manager} — blocked on [task]. Tried [X], [Y]. Can we take 10 min today?",
        "swaps": [("I can't do it.", "I'm stuck on [part] — I've tried [X]. Could you help me with the next step?",
                   "It shows effort and makes the ask concrete, so your manager can help fast.")],
        "tip": "Tell them what you've already tried before asking for help — it saves a round of questions.",
        "practice": "blocked", "nervous": ("manager", "questions", "technical"),
    },
    {
        "id": "feedback", "group": "Tricky moments",
        "title": "Ask for feedback",
        "triggers": ("ask for feedback", "get feedback", "ask my manager for feedback", "how am i doing at work", "request feedback"),
        "why": "'Any feedback?' usually gets 'All good!'. Asking about one specific thing gets you something you can use.",
        "template": "Hi {manager}, I'd love your feedback on [specific piece of work]. In particular — was [aspect] clear, "
                    "and is there one thing I could do better next time?",
        "steps": ["Pick one piece of work.", "Ask about one aspect.", "Ask for one improvement.", "Thank them and act on it."],
        "structure": "Specific work → specific aspect → one improvement",
        "short": "Could I get your feedback on [work] — especially [aspect]? One thing to improve?",
        "swaps": [("Any feedback?", "What's one thing I could do better on [work]?",
                   "A specific question gets a specific answer.")],
        "tip": "When you act on feedback, mention it next time — it shows you listened.",
        "practice": "feedback", "nervous": ("manager",),
    },
    {
        "id": "mistake", "group": "Tricky moments",
        "title": "Say “I made a mistake”",
        "triggers": ("i made a mistake", "made a mistake", "messed up", "i broke", "admit a mistake", "tell my manager about a mistake"),
        "why": "Everyone makes mistakes. What people remember is how you handled it: owning it, fixing it, and preventing it.",
        "template": "Hi {manager}, I wanted to let you know I made a mistake on [task]: [what happened]. "
                    "I've already [what you did to fix it]. To stop it happening again, I'll [prevention]. "
                    "Is there anything else you'd like me to do?",
        "steps": ["Tell them early.", "Say what happened — no excuses.", "Say what you've done to fix it.", "Say how you'll prevent it."],
        "structure": "What happened → what I did → how I'll prevent it",
        "short": "Heads up: I made a mistake on [task] — [what]. I've [fixed]. Next time I'll [prevent].",
        "swaps": [("It wasn't really my fault, but…", "I made a mistake on [X], and here's what I've done.",
                   "Owning it builds trust faster than explaining it away.")],
        "tip": "Tell them before they find out from someone else.",
        "practice": "mistake", "nervous": ("manager", "etiquette"),
    },
    {
        "id": "present", "group": "Tricky moments",
        "title": "Present your work",
        "triggers": ("present my work", "presentation", "demo my work", "show my work", "present to the team", "presenting"),
        "why": "People remember the problem and the result, not every step. Lead with why it matters.",
        "template": "1. The problem: [one sentence]\n2. What I did: [2–3 points]\n3. The result: [number, demo or outcome]\n"
                    "4. What's next / what I need: [ask]",
        "steps": ["Start with the problem.", "Show what you did in 2–3 points.", "Show the result.", "End with next steps or an ask.", "Practise once out loud."],
        "structure": "Problem → what I did → result → next step",
        "short": "Problem → what I did → result → ask. Keep it to 3 slides.",
        "swaps": [("So, um, I'll just go through everything I did…", "The problem we had was [X]. Here's what changed.",
                   "Starting with the problem tells people why they should listen.")],
        "tip": "Nervous? Rehearse the first 30 seconds — the rest usually follows.",
        "practice": "intro_team", "nervous": ("presentations",),
    },
]

_BY_ID = {t["id"]: t for t in TOPICS}
_HOW = re.compile(r"^\s*(how (do|can|should|would) i|how to|what'?s the best way to|what do i say|what should i say|"
                  r"help me|teach me|tips? (for|on)|best way to)\b", re.I)


def get(topic_id: str) -> Optional[dict]:
    return _BY_ID.get(topic_id)


def match_topic(query: str, *, require_how: bool = False) -> Optional[dict]:
    q = query.lower().replace("’", "'")
    if require_how and not _HOW.search(q) and "workplace basics" not in q:
        return None
    best, best_len = None, 0
    for t in TOPICS:
        for trig in t["triggers"]:
            if trig in q and len(trig) > best_len:
                best, best_len = t, len(trig)
    return best


def _fill(text: str, ctx: dict | None) -> str:
    emp = (ctx or {}).get("employee") or {}
    me = (emp.get("name") or "[Your name]").split()[0]
    return (
        text.replace("{manager}", (emp.get("manager_name") or "[Manager name]").split()[0])
        .replace("{mentor}", (emp.get("mentor_name") or "[Mentor name]").split()[0])
        .replace("{me}", me)
        .replace("{team}", emp.get("department") or "the team")
    )


def render(topic_id: str, profile: dict | None, ctx: dict | None) -> Optional[dict]:
    """Structured, personalised guide (web drawer uses this; chat uses as_text)."""
    t = _BY_ID.get(topic_id)
    if t is None:
        return None
    tr = traits(profile)
    concise = tr["concise"] and not tr["beginner"]
    worried = bool(set(t["nervous"]) & tr["nervous"])
    if concise:
        opener = f"Sure — use this structure: {t['structure']}."
    elif tr["first_job"]:
        opener = "Of course! Since this is your first internship, here's a simple format you can reuse."
    else:
        opener = "Here's a simple format you can reuse."
    reassure = "Lots of new joiners feel unsure about this — you're not behind." if worried and not concise else ""
    return {
        "id": t["id"],
        "title": t["title"],
        "group": t["group"],
        "mode": "concise" if concise else "guided",
        "opener": opener,
        "reassure": reassure,
        "template": _fill(t["short"] if concise else t["template"], ctx),
        "steps": t["steps"] if (tr["steps"] or not concise) else [],
        "structure": t["structure"],
        "why": t["why"],
        "swaps": [{"instead": _fill(a, ctx), "say": _fill(b, ctx), "why": c} for a, b, c in t["swaps"]],
        "tip": t["tip"],
        "practice": t["practice"],
        "offer_practice": bool(t["practice"]) and (tr["practice"] or worried),
    }


def as_text(topic_id: str, profile: dict | None, ctx: dict | None) -> str:
    g = render(topic_id, profile, ctx)
    if g is None:
        return ""
    tr = traits(profile)
    parts = [p for p in (g["opener"], g["reassure"]) if p]
    parts.append("")
    parts.append(g["template"])
    if g["mode"] == "concise":
        if g["swaps"]:
            s = g["swaps"][0]
            parts.append(f"\nSay “{s['say']}” rather than “{s['instead']}”.")
    else:
        if g["steps"] and tr["steps"]:
            parts.append("\nSteps:\n" + "\n".join(f"{i}. {s}" for i, s in enumerate(g["steps"], 1)))
        parts.append(f"\nWhy this works: {g['why']}")
        for s in g["swaps"][:1]:
            parts.append(f"Instead of “{s['instead']}”, try “{s['say']}” — {s['why'][0].lower() + s['why'][1:]}")
        parts.append(f"Tip: {g['tip']}")
    if g["offer_practice"]:
        parts.append("\nWant to practise this first? Tap “Practice this” and I'll play the other person.")
    parts.append("Source: IRA Workplace Basics")
    return "\n".join(parts)


def question(topic_id: str) -> str:
    """First-person chat question for a topic ("How do I tell my manager I'm blocked?")."""
    t = _BY_ID[topic_id]["title"]
    t = t.replace("yourself", "myself").replace("your ", "my ").replace("you're", "I'm").replace("you don't", "I don't")
    return f"How do I {t[0].lower()}{t[1:]}?"


def _fit(t: dict, nervous: set[str]) -> int:
    """How well a topic matches what the employee is unsure about (primary worry counts double)."""
    if not nervous:
        return 0
    return len(set(t["nervous"]) & nervous) + (2 if t["nervous"][0] in nervous else 0)


def recommended_ids(profile: dict | None, limit: int = 4) -> list[str]:
    nervous = traits(profile)["nervous"]
    scored = [(_fit(t, nervous), i, t["id"]) for i, t in enumerate(TOPICS)]
    return [tid for score, _, tid in sorted(scored, key=lambda s: (-s[0], s[1])) if score > 0][:limit]


def catalogue(profile: dict | None = None) -> list[dict]:
    recs = recommended_ids(profile)
    return [
        {
            "id": t["id"], "title": t["title"], "group": t["group"], "why": t["why"],
            "practice": t["practice"], "recommended": t["id"] in recs,
            "question": question(t["id"]),
        }
        for t in TOPICS
    ]
