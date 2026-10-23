"""Employee workspace login helpers + team/consult API tests."""

from __future__ import annotations

from fastapi.testclient import TestClient

from backend.main import app


def test_employee_workspace_consult_and_team():
    with TestClient(app) as client:
        joiners = client.get("/api/joiners").json()
        intern = next(j for j in joiners if j["role_type"] == "INTERN")
        fte = next(j for j in joiners if j["role_type"] == "FTE")

        ws = client.get(f"/api/employee/{intern['id']}/workspace")
        assert ws.status_code == 200
        body = ws.json()
        assert body["synthetic"] is True
        assert body["role_type"] == "INTERN"
        assert body["department"] == intern["department"]
        assert len(body["consult"]) >= 4
        roles = {c["role_label"] for c in body["consult"]}
        assert any("Mentor" in r for r in roles)
        assert any("HR" in r for r in roles)
        assert any("IT" in r for r in roles)
        assert len(body["team"]) >= 1
        assert any(m["is_self"] for m in body["team"])
        assert any("Git" in q or "mentor" in q.lower() for q in body["suggested_questions"])

        # Seed-stable
        assert client.get(f"/api/employee/{intern['id']}/workspace").json() == body

        fte_ws = client.get(f"/api/employee/{fte['id']}/workspace").json()
        assert fte_ws["role_type"] == "FTE"
        assert any("buddy" in c["role_label"].lower() for c in fte_ws["consult"])
        assert any("readiness" in q.lower() or "department" in q.lower() for q in fte_ws["suggested_questions"])

        assert client.get("/api/employee/SYN-J-MISSING/workspace").status_code == 404


def test_employee_frontend_has_login_and_sections():
    with TestClient(app) as client:
        portal = client.get("/")
        assert portal.status_code == 200
        assert "Employee" in portal.text
        assert "Employer" in portal.text
        assert "employee-select" in portal.text

        page = client.get("/employee")
        assert page.status_code == 200
        assert "Employee workspace" in page.text or "Employee Experience" in page.text
        assert "Learning" in page.text
        assert 'data-tab="ask"' in page.text
        assert 'data-tab="people"' in page.text
        assert 'data-tab="team"' in page.text
        assert "wx-nav" in page.text
        assert "chat-form" in page.text
        assert "Employer Command Center" not in page.text
        assert "login-select" not in page.text
        assert "sign-out-btn" in page.text

        js = client.get("/static/employee.js")
        assert js.status_code == 200
        assert "/api/employee/" in js.text
        assert "/workspace" in js.text
        assert "/api/chatbot/" in js.text
        assert "/api/learningtrack/" in js.text
        assert "requireEmployeeSession" in js.text
        assert "loadWorkspace" in js.text
        assert "wx-nav-btn" in js.text
        assert "/api/joiners" not in js.text  # no cohort browsing from employee UI
