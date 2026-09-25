"""Desktop IRA conversation flow — Get to know me in chat, Practice mode, and normal answers.

Qt-free so it can be tested; ``ira.app`` only renders what this returns.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Optional

from ira import coach, conversation, persona
from ira.brain import followups_for, respond

YES_START = "Sure, let's go"
LATER = "Maybe later"
SKIP = "Skip"
DONE = "Done"
END_PRACTICE = "End practice"
TRY_AGAIN = "Try again"
CONTINUE = "Continue getting to know me"

_YES = re.compile(r"^(?:y+e+s+|yeah|yep|yup|sure|ok(?:ay)?|let'?s\s+(?:go|do\s+it)|go(?:\s+ahead)?|start|why\s+not|fine)\b", re.I)
_QUESTION = re.compile(
    r"\?|^(?:what|what's|whats|where|where's|who|who's|when|why|how|which|can|could|should|is|are|do|does|will|"
    r"my|i\s+need|i\s+want|tell\s+me|show\s+me|help)\b",
    re.I,
)


@dataclass
class Turn:
    reply: str
    chips: list[str] = field(default_factory=list)
    chip_limit: int = 3
    save_answers: Optional[dict] = None
    observe: bool = True
    flavour: bool = False


def _fields() -> list[dict]:
    return [f for q in persona.QUESTIONS for f in q["fields"]]


class DesktopConversation:
    def __init__(self) -> None:
        self.onboarding: Optional[dict] = None  # {"i": field index, "answers": {}}
        self.offered = False
        self.coach: Optional[dict] = None
        self.paused: Optional[dict] = None

    # --- session start ------------------------------------------------------

    def intro(self, ctx: Optional[dict]) -> Optional[Turn]:
        """Offer Get to know me once per session when the profile is empty."""
        prof = (ctx or {}).get("profile") or {}
        if not ctx or prof.get("onboarded") or self.offered:
            return None
        self.offered = True
        self.onboarding = {"i": -1, "answers": {}}
        name = persona.first_name(ctx)
        return Turn(
            f"Before we start, {name} — can I get to know you a little? A few quick questions so I can explain "
            "things the way that works for you. Every question is optional.",
            [YES_START, LATER],
            observe=False,
        )

    # --- main entry -----------------------------------------------------------

    def handle(self, text: str, ctx: Optional[dict], *, online: bool, history: list[tuple[str, str]]) -> Turn:
        if self.onboarding is not None:
            return self._onboard(text, ctx, online=online, history=history)
        if text.strip() == CONTINUE and self.paused is not None:
            self.onboarding, self.paused = self.paused, None
            return self._ask(self.onboarding["i"], "Picking up where we left off. ")
        if self.coach is not None:
            return self._coach(text, ctx)
        out = respond(text, ctx, online=online, history=history)
        if out["coach"]:
            self.coach = out["coach"]
            return Turn(out["text"], [END_PRACTICE])
        asked = {t for r, t in history if r == "user"}
        chips = [c for c in out.get("suggest") or [] if c not in asked][:3] or followups_for(
            text, out["text"], ctx, asked=asked
        )
        return Turn(out["text"], chips, chip_limit=4 if out["mode"] == "coach" else 3, flavour=out["flavour"])

    # --- Get to know me ---------------------------------------------------------

    def _ask(self, idx: int, prefix: str = "") -> Turn:
        f = _fields()[idx]
        chips = [lbl for _, lbl in f["options"]]
        chips += [DONE] if f["multi"] else []
        chips += [SKIP]
        hint = " (pick as many as you like, then tap Done)" if f["multi"] else ""
        return Turn(f"{prefix}{f['label']}{hint}", chips, chip_limit=len(chips), observe=False)

    def _answer_instead(self, text: str, ctx: Optional[dict], *, online: bool,
                        history: list[tuple[str, str]], resume_chip: bool) -> Turn:
        """Step out of Get to know me to answer what the user actually asked."""
        ob, self.onboarding = self.onboarding, None
        if resume_chip and ob is not None:
            self.paused = ob
        turn = self.handle(text, ctx, online=online, history=history)
        if resume_chip:
            turn.chips = [c for c in turn.chips if c != CONTINUE][:2] + [CONTINUE]
        return turn

    def _onboard(self, text: str, ctx: Optional[dict], *, online: bool = True,
                 history: Optional[list[tuple[str, str]]] = None) -> Turn:
        ob = self.onboarding
        assert ob is not None
        t = text.strip()
        history = history or []
        if ob["i"] < 0:
            if t.lower() in {LATER.lower(), "later", "no", "nope", "nah", "not now", "skip", "no thanks"}:
                self.onboarding = None
                return Turn("No problem — just say “get to know me” whenever you like.", observe=False)
            if t == YES_START or _YES.match(t):
                ob["i"] = 0
                return self._ask(0)
            kind = conversation.intent(t)
            if kind in {"greet", "how_are_you"}:
                hello = (conversation.smalltalk(t, ctx, online=online, history=history) or "").split("\n")[0]
                return Turn(
                    f"{hello} Before we dive in — can I ask a few quick questions so I explain things your way? "
                    "It takes about a minute, or we can skip it.",
                    [YES_START, LATER],
                    observe=False,
                )
            return self._answer_instead(text, ctx, online=online, history=history, resume_chip=False)

        fields = _fields()
        f = fields[ob["i"]]
        labels = {lbl.lower(): v for v, lbl in f["options"]}
        picked = labels.get(t.lower())
        if picked is None and t not in (SKIP, DONE):
            vals = persona.parse_free_text(f["id"], t)
            picked = vals if f["multi"] else (vals[0] if vals else None)
            if not picked and (_QUESTION.search(t) or conversation.intent(t) in {"help", "frustrated"}):
                return self._answer_instead(text, ctx, online=online, history=history, resume_chip=True)
            if not picked:
                again = self._ask(ob["i"])
                again.reply = "I didn't quite catch that — tap an option, or Skip. " + again.reply
                return again

        if f["multi"] and t not in (SKIP, DONE):
            current = ob["answers"].setdefault(f["id"], [])
            for v in picked if isinstance(picked, list) else ([picked] if picked else []):
                if v not in current:
                    current.append(v)
            if picked and not (f["id"] == "nervous" and "ready" in current):
                chosen = ", ".join(persona.label_for(f["id"], v) for v in current)
                chips = [lbl for v, lbl in f["options"] if v not in current] + [DONE]
                return Turn(f"Got it: {chosen}. Anything else? Tap Done when you're finished.", chips,
                            chip_limit=len(chips), observe=False)
        elif t == SKIP:
            ob["answers"].pop(f["id"], None)
        elif picked:
            ob["answers"][f["id"]] = picked

        ob["i"] += 1
        if ob["i"] < len(fields):
            return self._ask(ob["i"])
        answers = persona.clean_answers(ob["answers"])
        self.onboarding = None
        prof = {"answers": answers, "observed": ((ctx or {}).get("profile") or {}).get("observed") or {}}
        if ctx is not None:
            ctx["profile"] = {**prof, "onboarded": True}
        chips = ["How do I email my manager?", f"Practice: {coach.SCENARIOS['blocked']['title']}", "Give me my briefing"]
        return Turn(persona.welcome_summary(prof, ctx), chips, save_answers=answers, observe=False)

    def restart_onboarding(self) -> Turn:
        self.onboarding = {"i": 0, "answers": {}}
        return self._ask(0, "Let's do it. ")

    # --- Practice mode ---------------------------------------------------------------

    def _coach(self, text: str, ctx: Optional[dict]) -> Turn:
        c = self.coach
        assert c is not None
        if text.strip() == END_PRACTICE or coach.is_end(text):
            self.coach = None
            return Turn(f"Nice work practising “{c['title']}”. You've already done the hard part.",
                        ["Let's practise something else", "What should I do now?"])
        if text.strip() == TRY_AGAIN:
            return Turn(f"“{c['opener']}”", [END_PRACTICE], observe=False)
        prof = (ctx or {}).get("profile")
        result = coach.evaluate(c["scenario"], text, prof, ctx)
        assert result is not None
        return Turn(coach.feedback_text(result), [TRY_AGAIN, END_PRACTICE], observe=False)


def wants_onboarding(text: str) -> bool:
    t = text.lower()
    return any(k in t for k in ("get to know me", "personalise ira", "personalize ira", "change my preferences"))
