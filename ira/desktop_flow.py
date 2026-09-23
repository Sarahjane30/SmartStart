"""Desktop IRA conversation flow — Get to know me in chat, Practice mode, and normal answers.

Qt-free so it can be tested; ``ira.app`` only renders what this returns.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from ira import coach, persona
from ira.brain import followups_for, respond

YES_START = "Sure, let's go"
LATER = "Maybe later"
SKIP = "Skip"
DONE = "Done"
END_PRACTICE = "End practice"
TRY_AGAIN = "Try again"


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
            return self._onboard(text, ctx)
        if self.coach is not None:
            return self._coach(text, ctx)
        out = respond(text, ctx, online=online, history=history)
        if out["coach"]:
            self.coach = out["coach"]
            return Turn(out["text"], [END_PRACTICE])
        asked = {t for r, t in history if r == "user"}
        chips = followups_for(text, out["text"], ctx, asked=asked)
        return Turn(out["text"], chips, chip_limit=4 if out["mode"] == "coach" else 3, flavour=out["flavour"])

    # --- Get to know me ---------------------------------------------------------

    def _ask(self, idx: int, prefix: str = "") -> Turn:
        f = _fields()[idx]
        chips = [lbl for _, lbl in f["options"]]
        chips += [DONE] if f["multi"] else []
        chips += [SKIP]
        hint = " (pick as many as you like, then tap Done)" if f["multi"] else ""
        return Turn(f"{prefix}{f['label']}{hint}", chips, chip_limit=len(chips), observe=False)

    def _onboard(self, text: str, ctx: Optional[dict]) -> Turn:
        ob = self.onboarding
        assert ob is not None
        t = text.strip()
        if ob["i"] < 0:
            if t.lower() in {LATER.lower(), "later", "no", "not now", "skip"}:
                self.onboarding = None
                return Turn("No problem — just say “get to know me” whenever you like.", observe=False)
            ob["i"] = 0
            return self._ask(0)

        fields = _fields()
        f = fields[ob["i"]]
        labels = {lbl.lower(): v for v, lbl in f["options"]}
        picked = labels.get(t.lower())
        if picked is None and t not in (SKIP, DONE):
            vals = persona.parse_free_text(f["id"], t)
            picked = vals if f["multi"] else (vals[0] if vals else None)
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
