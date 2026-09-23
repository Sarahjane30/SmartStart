from fastapi.testclient import TestClient

from backend.main import app
from ira import brain, coach, persona, workplace_basics

CTX = {"employee": {"name": "Erica Mcclain", "manager_name": "Priya Singh", "mentor_name": "Javier Johnson"}}
INTERN_A = {"answers": {"first_job": "yes", "comm_comfort": "low", "style": ["examples"], "nervous": ["manager", "emails"]}}
INTERN_B = {"answers": {"first_job": "no", "corporate": "yes", "style": ["short"]}}


def _joiner(client):
    return client.get("/api/ira/employees").json()["employees"][0]["id"]


def test_clean_answers_drops_unknown_values_and_ready_with_worries():
    out = persona.clean_answers({"style": ["short", "bogus"], "nervous": ["ready", "emails"], "first_job": "maybe", "x": 1})
    assert out == {"style": ["short"], "nervous": ["emails"]}


def test_same_question_different_answers_per_profile():
    a = brain.answer("How do I email my manager?", dict(CTX, profile=INTERN_A), online=True)
    b = brain.answer("How do I email my manager?", dict(CTX, profile=INTERN_B), online=True)
    assert a.startswith("Of course! Since this is your first internship")
    assert "Subject: Quick question regarding" in a and "Hi Priya" in a and "Tip:" in a
    assert b.startswith("Sure — use this structure: Context → Question → Action needed")
    assert len(b) < len(a)


def test_every_basics_topic_has_why_and_matches_its_own_question():
    assert len(workplace_basics.TOPICS) == 17
    for t in workplace_basics.TOPICS:
        assert t["why"] and t["swaps"]
        assert workplace_basics.match_topic(workplace_basics.question(t["id"]), require_how=True)["id"] == t["id"]


def test_recommended_basics_follow_nervous_answers():
    recs = {t["id"] for t in workplace_basics.catalogue(INTERN_A) if t["recommended"]}
    assert {"email", "intro_manager"} <= recs and len(recs) <= 4
    assert not any(t["recommended"] for t in workplace_basics.catalogue(INTERN_B))


def test_coach_rubric_flags_missing_tried_and_praises_full_answer():
    weak = coach.evaluate("blocked", "Hi Priya, I'm stuck on the Jira task. Could we talk today?", INTERN_A, CTX)
    assert weak["in_role"] == "Got it. What have you tried so far?"
    assert weak["improve"] == "One thing I'd change: tell your manager what you've already tried before asking for help."
    assert weak["headline"] == "That was good!"
    strong = coach.evaluate(
        "blocked",
        "Hi Priya, I'm stuck on the Jira access task — the board shows a permission error. I've tried logging out "
        "and checked the access guide. Could we take 10 minutes today?",
        INTERN_A, CTX,
    )
    assert strong["done"] and strong["score"] == strong["total"]
    slang = coach.evaluate("blocked", "bro im stuck lol, gonna need help", None, CTX)
    assert not next(r for r in slang["rubric"] if r["key"] == "professional")["ok"]


def test_practice_detection_and_draft_priority():
    assert coach.detect_start("Can we practise telling my manager I'm stuck?") == "blocked"
    assert coach.detect_start("let's practice") == "menu"
    assert coach.scenario_from_chip("Practice: Ask for feedback") == "feedback"
    r = brain.respond("Help me write an email to my mentor about my practice PR", CTX, online=True)
    assert r["mode"] != "coach"


def test_nervous_reply_is_empathetic_and_offers_practice():
    r = brain.respond("I'm really nervous about talking to my manager", dict(CTX, profile=INTERN_A), online=True)
    assert r["mode"] == "guide" and "completely normal" in r["text"] and "rehearse" in r["text"]
    chips = brain.followups_for("I'm really nervous about talking to my manager", r["text"], dict(CTX, profile=INTERN_A))
    assert any(c.startswith("Practice:") for c in chips)


def test_observed_labels_are_readable():
    obs = {}
    for q in ("draft an email to Priya", "write a message to IT", "shorter please", "tl;dr"):
        obs = persona.observe(q, obs)
    labels = persona.observed_labels({"observed": obs}, {"onboarding": {"assigned_tasks": ["Project X"]}})
    assert "Frequently asks for email templates" in labels
    assert "Prefers concise explanations" in labels
    assert "Currently working on Project X" in labels


def test_flavour_only_when_appropriate_and_not_every_turn():
    prof = {"answers": {"interests": ["cricket"]}, "observed": {"turns": 10}}
    assert "cricket" in persona.flavour_line("How does onboarding work across teams?", prof, {})
    assert persona.flavour_line("How do I reset my password?", prof, {}) is None
    prof["observed"]["last_flavour"] = 9
    assert persona.flavour_line("How does onboarding work across teams?", prof, {}) is None


def test_profile_api_roundtrip_observe_and_forget():
    with TestClient(app) as client:
        jid = _joiner(client)
        client.post(f"/api/ira/{jid}/profile/forget", json={"what": "all"})
        first = client.get(f"/api/ira/{jid}/profile").json()
        assert first["onboarded"] is False and len(first["questionnaire"]) == 5
        saved = client.put(f"/api/ira/{jid}/profile", json={"answers": INTERN_A["answers"]}).json()
        assert saved["onboarded"] and saved["answers"]["first_job"] == "yes"
        assert saved["welcome"].startswith("Thanks, ")
        for q in ("Draft an email to my mentor about a check-in", "Draft an email to my manager about leave"):
            client.get(f"/api/chatbot/{jid}", params={"q": q})
        prof = client.get(f"/api/ira/{jid}/profile").json()
        assert "Frequently asks for email templates" in prof["observed_labels"]
        cleared = client.post(f"/api/ira/{jid}/profile/forget", json={"what": "observed"}).json()
        assert cleared["observed"] == {} and cleared["answers"]["first_job"] == "yes"
        assert client.post(f"/api/ira/{jid}/profile/forget", json={"what": "bogus"}).status_code == 422


def test_basics_and_coach_endpoints():
    with TestClient(app) as client:
        jid = _joiner(client)
        client.put(f"/api/ira/{jid}/profile", json={"answers": INTERN_A["answers"]})
        cat = client.get(f"/api/ira/{jid}/basics").json()
        assert len(cat["topics"]) == 17 and any(t["recommended"] for t in cat["topics"])
        guide = client.get(f"/api/ira/{jid}/basics/blocked").json()
        assert guide["practice"] == "blocked" and guide["practice_title"]
        assert client.get(f"/api/ira/{jid}/basics/nope").status_code == 404
        start = client.post(f"/api/ira/{jid}/coach", json={"scenario": "blocked"}).json()
        assert start["result"] is None and "What's going on?" in start["start"]["opener"]
        turn = client.post(f"/api/ira/{jid}/coach", json={"scenario": "blocked", "message": "I can't do it"}).json()
        assert turn["result"]["rubric"] and turn["result"]["improve"]
        assert client.post(f"/api/ira/{jid}/coach", json={"scenario": "nope"}).status_code == 404


def test_chatbot_returns_coach_and_basics_mode():
    with TestClient(app) as client:
        jid = _joiner(client)
        body = client.get(f"/api/chatbot/{jid}", params={"q": "Practice: Ask your manager for leave"}).json()
        assert body["mode"] == "coach" and body["coach"]["scenario"] == "leave"
        guide = client.get(f"/api/chatbot/{jid}", params={"q": "How do I politely disagree?"}).json()
        assert guide["mode"] == "guide" and guide["basics"] == "disagree"
        assert "Source: IRA Workplace Basics" in guide["turns"][-1]["text"]
