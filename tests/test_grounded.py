"""Grounded NIA / IRA answers: approved sources only, citations, refusals, and the approval workflow."""

import os

import pytest
from fastapi.testclient import TestClient

from backend import grounded, llm
from backend import knowledge_sources as ks
from backend.main import app

PASSWORDS = {"HR": ("hr.jordan", "hr-demo-2026"), "IT": ("it.riley", "it-demo-2026"),
             "MANAGER": ("mgr.chen", "mgr-chen-2026"), "OPS": ("ops.admin", "ops-demo-2026")}


@pytest.fixture(autouse=True)
def fresh_library(tmp_path):
    old = os.environ.get("SMARTSTART_KB_STORE", "")
    ks.reset(str(tmp_path / "kb.json"))
    yield
    ks.reset(old)


def _h(client, role):
    user, pw = PASSWORDS[role]
    tok = client.post("/api/auth/login", json={"username": user, "password": pw}).json()["token"]
    return {"Authorization": f"Bearer {tok}"}


def _ira(client, jid, q):
    return client.get(f"/api/chatbot/{jid}", params={"q": q}).json()["turns"][-1]


def _draft(detail, **changes):
    live = detail["approved"]
    return {**{k: live[k] for k in ("title", "category", "owner", "audience", "keywords", "actions", "body")}, **changes}


def test_policy_answer_is_cited_and_off_topic_is_refused():
    g = grounded.answer("What's the daily meal limit when travelling?", "EMPLOYEE")
    assert g["grounded"] and "1,500 INR" in g["answer"] and "[1]" in g["answer"]
    cite = g["citations"][0]
    assert cite["title"] == "Travel & Expense Policy" and cite["section"] == "Daily meal limits"
    assert "1,500 INR" in cite["excerpt"]
    assert "Source: Travel & Expense Policy › Daily meal limits" in g["text"]

    for q in ("What is the capital of France?", "Tell me a joke", "How do I bake sourdough bread?"):
        no = grounded.answer(q, "EMPLOYEE")
        assert no["grounded"] is False and no["citations"] == []
        assert "won't guess" in no["answer"]


def test_answers_respect_source_audience():
    mgr = grounded.answer("How should I pick a mentor?", "MANAGER")
    assert mgr["grounded"] and mgr["citations"][0]["title"] == "Manager Day-1 & First Week Guide"
    for audience in ("EMPLOYEE", "IT"):
        other = grounded.answer("How should I pick a mentor?", audience)
        assert all(c["title"] != "Manager Day-1 & First Week Guide" for c in other["citations"])


def test_ira_web_chat_returns_grounding_and_keeps_personal_rules():
    with TestClient(app) as client:
        jid = client.get("/api/ira/employees").json()["employees"][0]["id"]
        turn = _ira(client, jid, "Can I claim a taxi to the airport?")
        assert turn["grounding"]["grounded"] and turn["grounding"]["citations"]
        assert turn["grounding"]["actions"][0]["kind"] == "open_source"

        refused = _ira(client, jid, "Is there a gym in the office?")
        assert refused["grounding"]["grounded"] is False
        assert refused["grounding"]["actions"][0]["kind"] == "ask_owner"

        laptop = _ira(client, jid, "Where is my laptop?")
        assert laptop["grounding"] is None and "ServiceNow" in laptop["text"]


def test_nia_answers_process_questions_from_playbooks_but_keeps_priorities():
    with TestClient(app) as client:
        h = _h(client, "MANAGER")
        r = client.post("/api/nia/ask", json={"message": "Who approves Confluence access?"}, headers=h).json()
        assert r["intent"] == "grounded"
        assert r["sources"] == ["Access Requests & Approvals Policy"]
        g = next(b for b in r["blocks"] if b["type"] == "grounding")
        assert "IT Service Desk approves" in g["answer"]

        r = client.post("/api/nia/ask", json={"message": "What should I work on first?"}, headers=h).json()
        assert r["intent"] == "mgr:agenda"


def test_edit_needs_approval_before_assistants_use_it():
    sid = "policy:finance-travel-and-expense"
    with TestClient(app) as client:
        jid = client.get("/api/ira/employees").json()["employees"][0]["id"]
        q = "What's the daily meal limit when travelling?"
        detail = client.get(f"/api/knowledge/sources/{sid}", headers=_h(client, "OPS")).json()
        body = detail["approved"]["body"].replace("1,500 INR per day", "2,000 INR per day")
        draft = _draft(detail, body=body, note="FY27 meal allowance")

        assert client.put(f"/api/knowledge/sources/{sid}/draft", json=draft, headers=_h(client, "MANAGER")).status_code == 403
        saved = client.put(f"/api/knowledge/sources/{sid}/draft", json=draft, headers=_h(client, "HR")).json()
        assert saved["has_draft"] and saved["draft"]["by"] == "Jordan Hale"

        assert "1,500 INR" in _ira(client, jid, q)["text"]
        preview = client.post("/api/knowledge/preview", json={"question": q, "audience": "EMPLOYEE"},
                              headers=_h(client, "HR")).json()
        assert "1,500 INR" in preview["current"]["answer"] and "2,000 INR" in preview["with_drafts"]["answer"]

        assert client.post(f"/api/knowledge/sources/{sid}/approve", headers=_h(client, "HR")).status_code == 403
        done = client.post(f"/api/knowledge/sources/{sid}/approve", headers=_h(client, "OPS")).json()
        assert done["version"] == 2 and not done["has_draft"]
        assert [e["action"] for e in done["history"]][:2] == ["approved", "drafted"]

        assert "2,000 INR" in _ira(client, jid, q)["text"]
        policy = client.get("/api/policies/finance-travel-and-expense").json()
        assert any("2,000 INR" in s["body"] for s in policy["sections"])

    ks.reset()
    assert "2,000 INR" in grounded.answer(q, "EMPLOYEE")["answer"]


def test_retire_and_restore_a_source():
    sid = "policy:finance-travel-and-expense"
    q = "What's the daily meal limit when travelling?"
    with TestClient(app) as client:
        assert client.post(f"/api/knowledge/sources/{sid}/retire", headers=_h(client, "HR")).status_code == 403
        client.post(f"/api/knowledge/sources/{sid}/retire", headers=_h(client, "OPS"))
        assert all(c["source_id"] != sid for c in grounded.answer(q, "EMPLOYEE")["citations"])
        assert client.get("/api/policies/finance-travel-and-expense").status_code == 404
        client.post(f"/api/knowledge/sources/{sid}/restore", headers=_h(client, "OPS"))
        assert grounded.answer(q, "EMPLOYEE")["citations"][0]["source_id"] == sid


def test_new_source_answers_only_after_approval():
    new = {
        "title": "Bengaluru Office Parking",
        "category": "Workplace",
        "owner": "Workplace Services",
        "audience": ["EMPLOYEE", "MANAGER"],
        "keywords": ["parking", "car park", "bike parking"],
        "body": "## Parking\nEmployees can park in basement level B2 with their access badge. "
                "Two-wheeler parking is on level B1. Visitor parking is booked through reception.",
    }
    q = "Where can I park my car at the office?"
    with TestClient(app) as client:
        created = client.post("/api/knowledge/sources", json=new, headers=_h(client, "IT")).json()
        assert created["id"] == "custom:bengaluru-office-parking" and created["status"] == "draft"
        assert grounded.answer(q, "EMPLOYEE")["grounded"] is False
        client.post(f"/api/knowledge/sources/{created['id']}/approve", headers=_h(client, "OPS"))
        g = grounded.answer(q, "EMPLOYEE")
        assert g["grounded"] and "B2" in g["answer"]
        assert g["citations"][0]["origin_label"] == "Added in SmartStart"
        reader = client.get(f"/api/sources/{created['id']}").json()
        assert reader["title"] == "Bengaluru Office Parking"


def test_employer_only_sources_are_hidden_from_the_public_reader():
    with TestClient(app) as client:
        sid = "playbook:manager-day1-guide"
        assert client.get(f"/api/sources/{sid}").status_code == 404
        assert client.get(f"/api/sources/{sid}", headers=_h(client, "MANAGER")).status_code == 200


def test_catalog_edits_reach_rule_based_answers():
    sid = "catalog:app-okta"
    with TestClient(app) as client:
        h = _h(client, "OPS")
        detail = client.get(f"/api/knowledge/sources/{sid}", headers=h).json()
        body = "## Summary\nOkta Verify is now required for every sign-in from day one.\n\n## Next step\nInstall Okta Verify."
        client.put(f"/api/knowledge/sources/{sid}/draft", json=_draft(detail, body=body), headers=h)
        client.post(f"/api/knowledge/sources/{sid}/approve", headers=h)
        jid = client.get("/api/ira/employees").json()["employees"][0]["id"]
        assert "Okta Verify is now required" in _ira(client, jid, "What is Okta?")["text"]


def test_model_answers_must_cite_supplied_sources(monkeypatch):
    monkeypatch.setattr(llm, "config", lambda: {"provider": "test", "model": "test-model"})
    monkeypatch.setattr(llm, "complete_json", lambda system, user: {
        "answer": "The meal allowance is 1,500 INR per day [1]. Executives get unlimited meals. Hotels are free [7].",
        "citations": [1, 7],
    })
    g = grounded.answer("What's the daily meal limit when travelling?", "EMPLOYEE")
    assert g["engine"] == "model" and g["model"] == "test-model"
    assert g["answer"] == "The meal allowance is 1,500 INR per day [1]."
    assert len(g["citations"]) == 1

    monkeypatch.setattr(llm, "complete_json", lambda system, user: {"answer": "NO_ANSWER", "citations": []})
    assert grounded.answer("What's the daily meal limit when travelling?", "EMPLOYEE")["grounded"] is False

    monkeypatch.setattr(llm, "complete_json", lambda system, user: None)
    fallback = grounded.answer("What's the daily meal limit when travelling?", "EMPLOYEE")
    assert fallback["grounded"] and fallback["engine"] == "retrieval"
