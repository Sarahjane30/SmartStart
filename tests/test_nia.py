"""NIA — employer assistant: grounded, role-scoped, consistent with the Command Center."""

from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from backend.main import app
from backend.nia import NO_ACCESS, NO_DATA

ACCOUNTS = {
    "HR": ("hr.jordan", "hr-demo-2026"),
    "IT": ("it.riley", "it-demo-2026"),
    "MANAGER": ("mgr.chen", "mgr-chen-2026"),
    "OPS": ("ops.admin", "ops-demo-2026"),
}
FRONTEND = Path(__file__).resolve().parents[1] / "frontend"


def _headers(client: TestClient, role: str) -> dict:
    username, password = ACCOUNTS[role]
    token = client.post("/api/auth/login", json={"username": username, "password": password}).json()["token"]
    return {"Authorization": f"Bearer {token}"}


def _ask(client: TestClient, h: dict, message: str, focus: str | None = None) -> dict:
    res = client.post("/api/nia/ask", json={"message": message, "focus_joiner_id": focus}, headers=h)
    assert res.status_code == 200, res.text
    return res.json()


def _blocks(reply: dict, kind: str) -> list[dict]:
    return [b for b in reply["blocks"] if b["type"] == kind]


def _card_names(reply: dict) -> set[str]:
    return {i["name"] for b in _blocks(reply, "joiners") for i in b["items"]}


def _all_text(reply: dict) -> str:
    return str(reply)


def test_nia_requires_employer_login():
    with TestClient(app) as client:
        assert client.get("/api/nia/briefing").status_code == 401
        assert client.post("/api/nia/ask", json={"message": "hi"}).status_code == 401


def test_welcome_is_role_aware_with_spec_prompts():
    expected = {
        "HR": ["Show my priorities", "Who needs HR action?", "Why is someone at risk?", "Show pending documents"],
        "IT": ["Show SLA breaches", "What's blocking Day 1?", "Who is waiting for access?", "What should I fix first?"],
        "MANAGER": ["Who needs me?", "What should I do today?", "Who isn't project-ready?", "Show my joiners"],
        "OPS": ["Where are people stuck?", "What is causing delays?", "Which team needs attention?", "Show cohort risks"],
    }
    with TestClient(app) as client:
        for role, prompts in expected.items():
            w = client.get("/api/nia/briefing", headers=_headers(client, role)).json()
            assert w["assistant"]["name"] == "NIA"
            assert w["assistant"]["title"] == "New-Hire Intelligence Assistant"
            assert w["suggestions"] == prompts
            assert len(w["proactive"]) <= 2
            assert w["text"].startswith("Hi ")


def test_priorities_agree_with_dashboard_action_queue():
    with TestClient(app) as client:
        for role in ("HR", "IT", "MANAGER"):
            h = _headers(client, role)
            ws = client.get("/api/employer/workspace", headers=h).json()
            r = _ask(client, h, "What should I work on first?")
            assert r["intent"] == "priorities"
            top = ws["action_queue"][0]
            assert r["focus_joiner_id"] == top["id"], role
            assert top["name"] in r["text"]


def test_hr_demo_scenario():
    with TestClient(app) as client:
        h = _headers(client, "HR")
        r = _ask(client, h, "Who needs my attention?")
        assert r["intent"] == "priorities"
        assert "iCIMS" in r["sources"]

        r = _ask(client, h, "Why is Sarah at risk?")
        assert r["intent"] == "explain"
        assert "Sarah Jane" in r["text"]
        assert "ServiceNow" in r["sources"]
        focus = r["focus_joiner_id"]

        r = _ask(client, h, "Where do I fix this?", focus)
        assert r["intent"] == "navigate"
        link = _blocks(r, "link")[0]
        assert link["system"] == "ServiceNow" and link["record"].startswith("RITM")
        assert link["port"] == 8200


def test_it_demo_scenario():
    with TestClient(app) as client:
        h = _headers(client, "IT")
        r = _ask(client, h, "What's the most urgent IT issue?")
        assert r["intent"] == "priorities"
        facts = {row["label"]: row["value"] for b in _blocks(r, "facts") for row in b["rows"]}
        assert facts["Owner"] == "IT Service Desk"
        assert facts["Source"] == "ServiceNow"

        r = _ask(client, h, "Show SLA breaches")
        assert r["intent"] == "list:sla"
        ws = client.get("/api/employer/workspace", headers=h).json()
        breached = {j["name"] for j in ws["joiners"] if j["sla_breached"] and j["current_state"] != "PROJECT_READY"}
        assert _card_names(r) <= breached

        r = _ask(client, h, "Why is Anna high risk?")
        assert r["intent"] == "explain" and "SLA" in r["text"]
        r = _ask(client, h, "Where do I fix it?", r["focus_joiner_id"])
        assert _blocks(r, "link")[0]["label"] == "Open Service Desk"


def test_manager_demo_scenario_is_scoped_to_own_team():
    with TestClient(app) as client:
        h = _headers(client, "MANAGER")
        ws = client.get("/api/employer/workspace", headers=h).json()
        team = {j["name"] for j in ws["joiners"]}

        r = _ask(client, h, "Who needs me?")
        assert r["intent"] == "priorities"
        assert _card_names(r) <= team

        r = _ask(client, h, "Who isn't project-ready?")
        assert r["intent"] == "list:not_ready"
        assert _card_names(r) <= team

        r = _ask(client, h, "What should I do for Sarah?")
        assert r["intent"] == "recommend"
        assert "Sarah Jane" in r["text"]


def test_manager_cannot_see_other_teams_through_nia():
    with TestClient(app) as client:
        ops = client.get("/api/employer/workspace", headers=_headers(client, "OPS")).json()
        h = _headers(client, "MANAGER")
        mine = {j["id"] for j in client.get("/api/employer/workspace", headers=h).json()["joiners"]}
        outsider = next(j for j in ops["joiners"] if j["id"] not in mine)

        for q in (f"Why is {outsider['name']} at risk?", f"Give me a complete picture of {outsider['name']}"):
            r = _ask(client, h, q)
            assert r["intent"] == "denied"
            assert r["text"] == NO_ACCESS
            assert outsider["id"] not in _all_text(r)
            assert not r["blocks"]

        # A hidden id passed as focus must not widen access either.
        r = _ask(client, h, "Tell me everything about this joiner", outsider["id"])
        assert outsider["id"] not in _all_text(r)
        assert outsider["name"] not in _all_text(r)


def test_ops_demo_scenario():
    with TestClient(app) as client:
        h = _headers(client, "OPS")
        r = _ask(client, h, "Where are people getting stuck?")
        assert r["intent"] == "cohort"
        r = _ask(client, h, "What's causing the most delays?")
        assert r["intent"] == "cohort"
        dash = client.get("/api/dashboard", params={"role_view": "All"}, headers=h).json()
        counts: dict[str, int] = {}
        for row in dash["rows"]:
            if row.get("bottleneck"):
                counts[row["bottleneck"]] = counts.get(row["bottleneck"], 0) + 1
        stuck = {row["label"]: int(row["value"]) for b in _blocks(r, "facts") if b["title"] == "Where people are stuck" for row in b["rows"]}
        assert stuck == counts


def test_unknown_questions_do_not_hallucinate():
    with TestClient(app) as client:
        r = _ask(client, _headers(client, "OPS"), "What is the company leave policy?")
        assert r["intent"] == "unknown"
        assert r["text"] == NO_DATA


def test_consequential_actions_need_confirmation_and_refusals_hold():
    with TestClient(app) as client:
        h = _headers(client, "MANAGER")
        before = client.get("/api/employer/workspace", headers=h).json()
        r = _ask(client, h, "Assign Todd's issue to Ava Chen")
        assert r["intent"] == "assign"
        confirm = _blocks(r, "confirm")[0]
        assert confirm["action"] == "assign" and confirm["owner_name"] == "Ava Chen"
        r = _ask(client, h, "Resolve Todd's bottleneck")
        assert _blocks(r, "confirm")[0]["action"] == "resolve"
        after = client.get("/api/employer/workspace", headers=h).json()
        assert before["action_queue"] == after["action_queue"], "NIA must not change state without confirmation"

        for q in ("Change her salary", "Approve leave for Sarah", "Close the ticket"):
            r = _ask(client, h, q, confirm["joiner_id"])
            assert r["intent"] == "refuse", q
            assert not _blocks(r, "confirm")


def test_frontend_panel_is_wired():
    html = (FRONTEND / "index.html").read_text()
    assert 'id="nia-panel"' in html and 'id="nia-launcher"' in html
    assert "New-Hire Intelligence Assistant" in html
    assert "/static/nia.js" in html
    js = (FRONTEND / "nia.js").read_text()
    assert "/api/nia/ask" in js and "/api/nia/briefing" in js
    assert "confirmAssign(" in js and "handleAction(block.action" in js
    assert "<iframe" not in js and "<iframe" not in html
    assert "data-nia-ask" in (FRONTEND / "app.js").read_text()
