from fastapi.testclient import TestClient

from backend.main import app
from ira import desktop_flow as df
from ira.brain import respond
from ira.conversation import did_you_mean, fix_typos, intent, strip_greeting

CTX = {
    "employee": {
        "name": "Sarah Jane", "team": "Data Platform", "department": "Data Engineering",
        "business_area": "Data & Analytics", "manager_name": "Ava Chen", "mentor_name": "Priya Nair",
        "role_type": "INTERN",
    },
    "onboarding": {"progress_pct": 35},
    "intelligence": {"next_best_actions": [{"title": "Laptop provisioning", "detail": "Wait for hardware on REQ-1042"}]},
    "it": {"hardware_status": "Configured", "ticket_id": "REQ-1042"},
    "profile": {"onboarded": True},
}

_FALLBACK = "approved source for that"


def test_greetings_and_small_talk_are_recognised():
    for text in ("hii", "Hiii IRA!!", "heyyy", "hello there 👋", "good morning", "gm", "yo"):
        assert intent(text) == "greet", text
    assert intent("how are you?") == "how_are_you"
    assert intent("thank you so much") == "thanks"
    assert intent("bye") == "bye"
    assert intent("ok") == "ack"
    assert intent("can you help me?") == "help"
    assert intent("i have a question") == "help"
    assert intent("are you a bot?") == "identity"
    assert intent("you're useless") == "frustrated"
    assert intent("where's my laptop?") is None


def test_greeting_is_personal_and_never_a_dead_end():
    r = respond("hii", CTX, online=True)
    assert r["text"].startswith("Hi Sarah!")
    assert "35%" in r["text"] and "Laptop provisioning" in r["text"]
    assert r["suggest"]
    assert respond("good evening ira", CTX, online=True)["text"].startswith("Good evening, Sarah!")
    signed_out = respond("hii", None, online=False)["text"]
    assert "I'm IRA" in signed_out and "Sign in to SmartStart" in signed_out
    for text in ("thanks", "how are you", "bye", "help", "ok", "lol", "nvm"):
        assert _FALLBACK not in respond(text, CTX, online=True)["text"], text


def test_greeting_prefix_slang_and_typos_still_answer_the_question():
    assert strip_greeting("hi ira, where's my laptop?") == "where's my laptop?"
    assert "REQ-1042" in respond("hey ira can u tell me where my laptop is", CTX, online=True)["text"]
    assert "Priya Nair" in respond("hii who is my mentor", CTX, online=True)["text"]
    assert fix_typos("wher is my laptp") == "where is my laptop"
    assert "REQ-1042" in respond("wher is my laptp", CTX, online=True)["text"]
    assert "Ava Chen" in respond("who is my manger", CTX, online=True)["text"]
    assert "Data Platform" in respond("what's my team", CTX, online=True)["text"]


def test_unknown_questions_get_suggestions_not_a_wrong_answer():
    r = respond("i lost my id card", CTX, online=True)
    assert "Corporate cards" not in r["text"]
    assert r["suggest"]
    assert "Where's my laptop?" in did_you_mean("laptop pls")


def test_desktop_flow_greeting_during_intro_does_not_start_questionnaire():
    ctx = {**CTX, "profile": {"onboarded": False}}
    flow = df.DesktopConversation()
    flow.intro(ctx)
    hi = flow.handle("hii", ctx, online=True, history=[("user", "hii")])
    assert hi.reply.startswith("Hi Sarah!") and df.YES_START in hi.chips
    assert flow.onboarding is not None and flow.onboarding["i"] == -1

    q = flow.handle("where's my laptop?", ctx, online=True, history=[])
    assert "REQ-1042" in q.reply and flow.onboarding is None


def test_desktop_flow_question_mid_questionnaire_pauses_and_resumes():
    ctx = {**CTX, "profile": {"onboarded": False}}
    flow = df.DesktopConversation()
    flow.intro(ctx)
    flow.handle(df.YES_START, ctx, online=True, history=[])
    turn = flow.handle("who is my mentor?", ctx, online=True, history=[])
    assert "Priya Nair" in turn.reply and df.CONTINUE in turn.chips
    back = flow.handle(df.CONTINUE, ctx, online=True, history=[])
    assert back.reply.startswith("Picking up where we left off") and flow.onboarding is not None


def test_website_chat_handles_hii():
    with TestClient(app) as client:
        jid = client.get("/api/ira/employees").json()["employees"][0]["id"]
        body = client.get(f"/api/chatbot/{jid}", params={"q": "hii"}).json()
        reply = body["turns"][-1]["text"]
        assert reply.startswith("Hi ") and _FALLBACK not in reply
        assert body["suggestions"]
