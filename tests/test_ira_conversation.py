from fastapi.testclient import TestClient

from backend.ira_demo import IRA_DEMO_NAME, IRA_DEMO_TICKET
from backend.main import app
from ira.brain import respond
from ira.conversation import fix_typos, intent, strip_greeting

_FALLBACK = "approved sources yet"


def _ctx() -> dict:
    with TestClient(app) as client:
        body = client.get("/api/ira/employees").json()
        sid = next(e for e in body["employees"] if e["name"] == IRA_DEMO_NAME)["id"]
        return client.get(f"/api/ira/{sid}/context").json()


def test_small_talk_intents():
    for text in ("hii", "Hiii IRA!!", "heyyy", "hello there 👋", "good morning", "gm"):
        assert intent(text) == "greet", text
    assert intent("how are you?") == "how_are_you"
    assert intent("thank you so much") == "thanks"
    assert intent("bye") == "bye"
    assert intent("can u help me?") == "help"
    assert intent("where is my laptop?") is None


def test_desktop_greeting_and_small_talk_never_dead_end():
    ctx = _ctx()
    first = ctx["employee"]["name"].split()[0]
    hi = respond("hii", ctx, online=True, history=[("user", "hii")])
    assert hi["text"].startswith(f"Hi {first}!") and hi["suggest"]
    assert respond("hii", ctx, online=True, history=[("user", "hii"), ("ira", "…"), ("user", "hii")])[
        "text"
    ].startswith("Hi again")
    for text in ("thanks", "how are you", "bye", "help", "ok", "lol", "nvm", "you're useless"):
        assert _FALLBACK not in respond(text, ctx, online=True)["text"], text
    signed_out = respond("hii", None, online=False)["text"]
    assert "Sign in to SmartStart" in signed_out


def test_desktop_greeting_prefix_slang_and_typos():
    ctx = _ctx()
    assert strip_greeting("hey ira, where is my laptop?") == "where is my laptop?"
    assert fix_typos("wher is my laptp") == "where is my laptop"
    assert IRA_DEMO_TICKET in respond("hey ira, wher is my laptp?", ctx, online=True)["text"]
    assert "Priya Nair" in respond("hii who is my mentor", ctx, online=True)["text"]
    assert "Ava Chen" in respond("who is my manger", ctx, online=True)["text"]


def test_unknown_question_gets_answerable_suggestions():
    ctx = _ctx()
    out = respond("asdf qwerty", ctx, online=True)
    assert "won’t guess" in out["text"] or "don’t want to guess" in out["text"]
    assert out["suggest"]
    near = respond("mentor pls??? xyz", ctx, online=True)
    assert near["suggest"] is None or all(_FALLBACK not in respond(s, ctx, online=True)["text"] for s in near["suggest"])
