"""Questions NIA / IRA couldn't answer, and thumbs up / down on answers, routed to source owners."""

import os

import pytest
from fastapi.testclient import TestClient

from backend import knowledge_insights as ki
from backend import knowledge_sources as ks
from backend.main import app

PASSWORDS = {"HR": ("hr.jordan", "hr-demo-2026"), "IT": ("it.riley", "it-demo-2026"),
             "MANAGER": ("mgr.chen", "mgr-chen-2026"), "OPS": ("ops.admin", "ops-demo-2026")}


@pytest.fixture(autouse=True)
def fresh_stores(tmp_path):
    old_kb = os.environ.get("SMARTSTART_KB_STORE", "")
    old_in = os.environ.get("SMARTSTART_KB_INSIGHTS", "")
    ks.reset(str(tmp_path / "kb.json"))
    ki.reset(str(tmp_path / "insights.json"))
    yield
    ks.reset(old_kb)
    ki.reset(old_in)


def _h(client, role):
    user, pw = PASSWORDS[role]
    tok = client.post("/api/auth/login", json={"username": user, "password": pw}).json()["token"]
    return {"Authorization": f"Bearer {tok}"}


def _ira(client, q):
    jid = client.get("/api/ira/employees").json()["employees"][0]["id"]
    return client.get(f"/api/chatbot/{jid}", params={"q": q}).json()["turns"][-1]


def _team(view, name):
    return next((t for t in view["teams"] if t["team"] == name), None)


def test_refusals_are_grouped_and_routed_to_the_closest_owner():
    with TestClient(app) as client:
        assert _ira(client, "Is there a gym in the office?")["grounding"]["answer_id"]
        _ira(client, "is there a gym at the office")
        view = client.get("/api/knowledge/insights", headers=_h(client, "OPS")).json()
        work = _team(view, "Workplace")
        assert work and work["mine"] and len(work["gaps"]) == 1
        gap = work["gaps"][0]
        assert gap["count"] == 2 and gap["refused"] == 2
        assert gap["closest"]["owner"] == "Workplace Services"
        assert gap["audiences"][0]["id"] == "EMPLOYEE" and gap["assistants"] == ["IRA"]

        nav = client.get("/api/employer/workspace", headers=_h(client, "OPS")).json()["nav"]
        assert next(n for n in nav if n["id"] == "knowledge")["count"] >= 1

        hr = _h(client, "HR")
        assert client.post(f"/api/knowledge/gaps/{gap['id']}/dismiss", json={}, headers=hr).status_code == 403
        r = client.post(f"/api/knowledge/gaps/{gap['id']}/dismiss", json={"note": "No gym on site"}, headers=_h(client, "OPS"))
        assert r.status_code == 200 and r.json()["status"] == "dismissed"
        view = client.get("/api/knowledge/insights", headers=_h(client, "OPS")).json()
        assert _team(view, "Workplace") is None
        assert view["closed_gaps"][0]["resolution"]["note"] == "No gym on site"


def test_weak_answers_are_logged_but_preview_is_not():
    with TestClient(app) as client:
        ops = _h(client, "OPS")
        client.post("/api/knowledge/preview", json={"question": "Is there a gym in the office?", "audience": "EMPLOYEE"}, headers=ops)
        assert client.get("/api/knowledge/insights", headers=ops).json()["counts"]["gaps"] == 0

        turn = _ira(client, "What is the notice period?")
        assert turn["grounding"]["grounded"] and turn["grounding"]["strength"] == "weak"
        gap = _team(client.get("/api/knowledge/insights", headers=ops).json(), "HR")["gaps"][0]
        assert gap["weak"] == 1 and gap["refused"] == 0

        _ira(client, "What is the daily meal limit when travelling?")
        assert client.get("/api/knowledge/insights", headers=ops).json()["counts"]["gaps"] == 1


def test_a_new_approved_source_closes_the_gap():
    with TestClient(app) as client:
        _ira(client, "Is there a gym in the office?")
        hr, ops = _h(client, "HR"), _h(client, "OPS")
        d = client.post("/api/knowledge/sources", json={
            "title": "Office gym", "owner": "Workplace Services", "category": "Workplace",
            "audience": ["EMPLOYEE"], "keywords": ["gym", "fitness"],
            "body": "## Gym access\nThere is a gym in the office on level 2, open 7am to 9pm for every employee with a badge.",
        }, headers=hr).json()
        assert client.get("/api/knowledge/insights", headers=ops).json()["counts"]["gaps"] == 1
        client.post(f"/api/knowledge/sources/{d['id']}/approve", headers=ops)
        view = client.get("/api/knowledge/insights", headers=ops).json()
        assert view["counts"]["gaps"] == 0 and view["counts"]["answered"] == 1
        assert view["closed_gaps"][0]["resolution"]["title"] == "Office gym"


def test_thumbs_down_becomes_a_review_task_for_the_source_owner():
    with TestClient(app) as client:
        turn = _ira(client, "What's the daily meal limit when travelling?")
        aid = turn["grounding"]["answer_id"]
        r = client.post(f"/api/answers/{aid}/feedback", json={"vote": "down", "reason": "out_of_date", "comment": "It's 2,000 now"})
        assert r.status_code == 200 and r.json()["routed_to"] == ["Finance Operations"]

        ops, hr = _h(client, "OPS"), _h(client, "HR")
        task = _team(client.get("/api/knowledge/insights", headers=ops).json(), "Finance")["reviews"][0]
        assert task["title"] == "Travel & Expense Policy" and task["reasons"][0]["id"] == "out_of_date"
        assert task["flags"][0]["comment"] == "It's 2,000 now" and task["flags"][0]["section"] == "Daily meal limits"
        sid = task["source_id"]
        fb = client.get(f"/api/knowledge/sources/{sid}", headers=ops).json()["feedback"]
        assert fb["not_helpful"] == 1 and fb["review"]["id"] == task["id"]
        assert client.post(f"/api/knowledge/reviews/{task['id']}/resolve", json={}, headers=hr).status_code == 403

        # Changing your mind withdraws the flag.
        client.post(f"/api/answers/{aid}/feedback", json={"vote": "up"})
        assert client.get("/api/knowledge/insights", headers=ops).json()["counts"]["reviews"] == 0
        fb = client.get(f"/api/knowledge/sources/{sid}", headers=ops).json()["feedback"]
        assert fb == {**fb, "helpful": 1, "not_helpful": 0, "review": None}

        # A new approved version closes the task by itself.
        client.post(f"/api/answers/{aid}/feedback", json={"vote": "down", "reason": "out_of_date"})
        detail = client.get(f"/api/knowledge/sources/{sid}", headers=ops).json()
        body = detail["approved"]["body"].replace("1,500 INR", "2,000 INR")
        live = detail["approved"]
        client.put(f"/api/knowledge/sources/{sid}/draft", json={
            **{k: live[k] for k in ("title", "category", "owner", "audience", "keywords", "actions")}, "body": body,
        }, headers=hr)
        client.post(f"/api/knowledge/sources/{sid}/approve", headers=ops)
        view = client.get("/api/knowledge/insights", headers=ops).json()
        assert view["counts"]["reviews"] == 0
        assert view["closed_reviews"][0]["resolution"]["note"] == "Updated to version 2."


def test_hr_resolves_its_own_reviews_and_nia_answers_can_be_rated():
    with TestClient(app) as client:
        hr = _h(client, "HR")
        r = client.post("/api/nia/ask", json={"message": "What is the leave policy for sick days?"}, headers=hr).json()
        block = next(b for b in r["blocks"] if b["type"] == "grounding")
        assert block["grounded"]
        out = client.post(f"/api/answers/{block['answer_id']}/feedback", json={"vote": "down", "reason": "not_helpful"}).json()
        assert out["routed_to"]
        view = client.get("/api/knowledge/insights", headers=hr).json()
        mine = _team(view, "HR")
        assert mine["mine"] and view["teams"][0]["team"] == "HR"
        task = mine["reviews"][0]
        assert task["can_act"] and task["flags"][0]["assistant"] == "NIA"
        r = client.post(f"/api/knowledge/reviews/{task['id']}/resolve", json={"note": "Checked — correct"}, headers=hr)
        assert r.status_code == 200 and r.json()["status"] == "resolved"

        assert client.post("/api/answers/ans_missing/feedback", json={"vote": "up"}).status_code == 404
        assert client.post(f"/api/answers/{block['answer_id']}/feedback", json={"vote": "sideways"}).status_code == 422


def test_thumbs_down_on_a_refusal_marks_the_gap_as_wanted():
    with TestClient(app) as client:
        aid = _ira(client, "Is there a gym in the office?")["grounding"]["answer_id"]
        out = client.post(f"/api/answers/{aid}/feedback", json={"vote": "down", "reason": "missing"}).json()
        assert out["routed_to"] == ["Workplace Services"]
        gap = _team(client.get("/api/knowledge/insights", headers=_h(client, "OPS")).json(), "Workplace")["gaps"][0]
        assert gap["flagged"] == 1
