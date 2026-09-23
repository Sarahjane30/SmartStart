"""Managers see joiner learning progress and can add courses that show up in the joiner's Learning tab."""

from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from backend.main import app

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


def _sarah(client: TestClient, h: dict) -> str:
    ws = client.get("/api/employer/workspace", headers=h).json()
    return next(j["id"] for j in ws["joiners"] if j["name"] == "Sarah Jane")


def test_manager_team_learning_is_scoped_and_matches_joiner_track():
    with TestClient(app) as client:
        h = _headers(client, "MANAGER")
        team = {j["id"] for j in client.get("/api/employer/workspace", headers=h).json()["joiners"]}
        data = client.get("/api/employer/learning", headers=h).json()
        assert data["can_manage"] is True
        assert {r["joiner_id"] for r in data["joiners"]} == team

        sid = _sarah(client, h)
        row = next(r for r in data["joiners"] if r["joiner_id"] == sid)
        own = client.get(f"/api/learningtrack/{sid}").json()
        assert row["completion_pct"] == own["completion_pct"]
        assert row["total_count"] == own["total_count"]


def test_manager_adds_course_and_joiner_sees_it():
    with TestClient(app) as client:
        h = _headers(client, "MANAGER")
        sid = _sarah(client, h)
        detail = client.get(f"/api/employer/joiners/{sid}/learning", headers=h).json()
        before = detail["summary"]["total_count"]
        course = next(c for c in detail["library"] if c["id"] == "sql")

        res = client.post(
            f"/api/employer/joiners/{sid}/learning",
            json={"course_id": course["id"], "note": "Useful for the data pod", "due_date": "2026-10-01"},
            headers=h,
        )
        assert res.status_code == 200, res.text
        module = res.json()["module"]
        assert module["assigned_by"] == "Ava Chen" and module["status"] == "available"

        track = client.get(f"/api/learningtrack/{sid}").json()
        assert track["total_count"] == before + 1
        mine = next(m for m in track["modules"] if m["id"] == module["id"])
        assert mine["assigned_note"] == "Useful for the data pod" and mine["due_date"] == "2026-10-01"
        notes = client.get(f"/api/notifications/{sid}").json()["notifications"]
        assert any("SQL for analysis" in n["message"] for n in notes)

        # Duplicate, custom, complete-then-remove rules.
        assert client.post(f"/api/employer/joiners/{sid}/learning", json={"course_id": "sql"}, headers=h).status_code == 400
        custom = client.post(
            f"/api/employer/joiners/{sid}/learning", json={"title": "Pod walkthrough", "minutes": 20}, headers=h
        ).json()["module"]
        assert client.delete(f"/api/employer/joiners/{sid}/learning/{custom['id']}", headers=h).status_code == 200
        client.post(f"/api/learningtrack/{sid}/modules/{module['id']}/complete")
        assert client.delete(f"/api/employer/joiners/{sid}/learning/{module['id']}", headers=h).status_code == 400
        track_mod = track["modules"][0]["id"]
        assert client.delete(f"/api/employer/joiners/{sid}/learning/{track_mod}", headers=h).status_code == 404


def test_learning_permissions():
    with TestClient(app) as client:
        ops = client.get("/api/employer/workspace", headers=_headers(client, "OPS")).json()
        mgr = _headers(client, "MANAGER")
        mine = {j["id"] for j in client.get("/api/employer/workspace", headers=mgr).json()["joiners"]}
        outsider = next(j["id"] for j in ops["joiners"] if j["id"] not in mine)
        assert client.get(f"/api/employer/joiners/{outsider}/learning", headers=mgr).status_code == 404
        assert client.post(f"/api/employer/joiners/{outsider}/learning", json={"course_id": "sql"}, headers=mgr).status_code == 404

        it = _headers(client, "IT")
        assert client.get("/api/employer/learning", headers=it).status_code == 403
        hr = _headers(client, "HR")
        assert client.get("/api/employer/learning", headers=hr).status_code == 200
        assert client.post(f"/api/employer/joiners/{outsider}/learning", json={"course_id": "sql"}, headers=hr).status_code == 403
        assert client.get("/api/employer/learning").status_code == 401


def test_nia_learning_answers_and_confirm_gated_add():
    with TestClient(app) as client:
        h = _headers(client, "MANAGER")
        sid = _sarah(client, h)
        r = client.post("/api/nia/ask", json={"message": "How is Sarah's learning going?"}, headers=h).json()
        assert r["intent"] == "learning" and "Sarah Jane" in r["text"]
        before = client.get(f"/api/learningtrack/{sid}").json()["total_count"]
        r = client.post("/api/nia/ask", json={"message": "Add SQL for analysis to Sarah's learning"}, headers=h).json()
        confirm = next(b for b in r["blocks"] if b["type"] == "confirm")
        assert confirm["action"] == "add_course" and confirm["course_id"] == "sql"
        assert client.get(f"/api/learningtrack/{sid}").json()["total_count"] == before
        it = _headers(client, "IT")
        r = client.post("/api/nia/ask", json={"message": "How is Sarah's learning going?"}, headers=it).json()
        assert r["intent"] == "denied"


def test_frontend_learning_and_globe_wiring():
    html = (FRONTEND / "index.html").read_text()
    assert 'id="section-learning"' in html and 'id="course-modal"' in html
    assert "/static/employer-learning.js" in html
    assert 'id="ira-globe"' in html and "/static/ira-globe.js" in html
    assert "iraGlobe?.setThinking(true)" in (FRONTEND / "nia.js").read_text()
    assert "assigned_by" in (FRONTEND / "employee.js").read_text()
