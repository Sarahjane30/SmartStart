"""Intelligence upgrade — knowledge layer, blockers, briefing, employer explain."""

from __future__ import annotations

from fastapi.testclient import TestClient

from backend.database import store
from backend.intelligence import (
    build_blockers,
    build_briefing,
    build_next_best_actions,
    explain_what_if,
    format_briefing_text,
    format_project_ready_text,
)
from backend.ira_demo import IRA_DEMO_NAME, find_ira_demo_id
from backend.knowledge import ENTITIES, find_entities
from backend.main import app
from ira.brain import answer


def _sarah_id(client: TestClient) -> str:
    body = client.get("/api/ira/employees").json()
    sarah = next(e for e in body["employees"] if e["name"] == IRA_DEMO_NAME)
    return sarah["id"]


def _login(client: TestClient) -> dict:
    res = client.post(
        "/api/auth/login",
        json={"username": "ops.admin", "password": "ops-demo-2026"},
    )
    assert res.status_code == 200
    token = res.json()["token"]
    return {"Authorization": f"Bearer {token}", "X-SmartStart-Token": token}


def test_knowledge_catalog_has_core_entities():
    assert "app-jira" in ENTITIES
    assert "proc-leave" in ENTITIES
    assert "term-bpmn" in ENTITIES
    hits = find_entities("how do I apply for leave")
    assert hits and hits[0].id in {"proc-leave", "app-hr-portal", "doc-leave-guide"}
    sn = find_entities("what is ServiceNow")
    assert sn and sn[0].id == "app-servicenow"


def test_context_includes_intelligence_block():
    with TestClient(app) as client:
        sid = _sarah_id(client)
        ctx = client.get(f"/api/ira/{sid}/context").json()
        assert "intelligence" in ctx
        intel = ctx["intelligence"]
        assert "blockers" in intel
        assert "next_best_actions" in intel
        assert "briefing" in intel
        assert "risk" in intel
        assert intel["briefing"]["greeting_name"]
        assert isinstance(intel["recommended_apps"], list)
        assert len(intel["recommended_apps"]) >= 3


def test_brain_navigation_and_briefing():
    with TestClient(app) as client:
        sid = _sarah_id(client)
        ctx = client.get(f"/api/ira/{sid}/context").json()

    leave = answer("How do I apply for leave?", ctx, online=True)
    assert "HR Portal" in leave or "leave" in leave.lower()
    assert "Source" in leave

    sn = answer("What is ServiceNow?", ctx, online=True)
    assert "IT" in sn or "ticket" in sn.lower() or "ServiceNow" in sn

    brief = answer("Give me my briefing", ctx, online=True)
    assert "ONBOARDING" in brief or "onboarding" in brief.lower()
    assert "%" in brief or "complete" in brief.lower()

    nxt = answer("What should I do now?", ctx, online=True)
    assert "Next" in nxt or "priorit" in nxt.lower() or "→" in nxt or "1." in nxt

    block = answer("What's blocking me?", ctx, online=True)
    assert "laptop" in block.lower() or "jira" in block.lower() or "block" in block.lower() or "⚠" in block

    project = answer("Can I start my project tomorrow?", ctx, online=True)
    assert "✓" in project or "⚠" in project
    assert "project" in project.lower() or "ready" in project.lower()

    salary = answer("What is my exact salary amount?", ctx, online=True)
    assert "guess" in salary.lower() or "approved source" in salary.lower()


def test_brain_who_and_what_if():
    with TestClient(app) as client:
        sid = _sarah_id(client)
        ctx = client.get(f"/api/ira/{sid}/context").json()

    who = answer("Who handles payroll?", ctx, online=True)
    assert "HR" in who or "Payroll" in who

    what_if = answer("What happens if I don't finish Git Basics today?", ctx, online=True)
    assert "Git" in what_if
    assert "Source" in what_if


def test_followup_uses_history():
    with TestClient(app) as client:
        sid = _sarah_id(client)
        ctx = client.get(f"/api/ira/{sid}/context").json()
    history = [("user", "Where's my laptop?"), ("ira", "Your laptop is Configured.")]
    follow = answer("Can it delay me?", ctx, online=True, history=history)
    assert "laptop" in follow.lower() or "ServiceNow" in follow or "hardware" in follow.lower() or "Day 1" in follow


def test_employer_intelligence_endpoints():
    with TestClient(app) as client:
        headers = _login(client)
        sid = find_ira_demo_id() or _sarah_id(client)
        res = client.get(f"/api/joiners/{sid}/intelligence", headers=headers)
        assert res.status_code == 200
        body = res.json()
        assert body["risk_score"] is not None
        assert "why" in body
        assert "recommended" in body

        at_risk = client.get("/api/employer/at-risk?limit=5", headers=headers)
        assert at_risk.status_code == 200
        payload = at_risk.json()
        assert payload["synthetic"] is True
        assert "joiners" in payload


def test_intelligence_helpers_direct():
    sid = find_ira_demo_id()
    assert sid
    blockers = build_blockers(sid)
    assert isinstance(blockers, list)
    assert any(b["id"] == "laptop" for b in blockers)
    actions = build_next_best_actions(sid)
    assert actions
    brief = build_briefing(sid)
    text = format_briefing_text(brief)
    assert brief["greeting_name"] in text
    ready = format_project_ready_text(sid)
    assert "✓" in ready or "⚠" in ready
    wi = explain_what_if("what if I don't finish git basics", sid)
    assert wi and "Git" in wi
