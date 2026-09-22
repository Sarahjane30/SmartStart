"""Tests for standalone mock Jira (port 8300)."""

from __future__ import annotations

from fastapi.testclient import TestClient

from jira.backend.database import JiraStore
from jira.backend.main import app
from jira.backend.seed import seed_cohort


def _login(client: TestClient) -> dict:
    res = client.post(
        "/api/auth/login",
        json={"username": "mgr.demo", "password": "mgr-demo-2026"},
    )
    assert res.status_code == 200, res.text
    token = res.json()["token"]
    return {"Authorization": f"Bearer {token}", "X-Jira-Token": token}


def test_health_and_login():
    with TestClient(app) as client:
        h = client.get("/health")
        assert h.status_code == 200
        assert h.json()["app"] == "jira-mock"
        assert h.json()["separate_from_smartstart"] is True
        assert h.json()["issues"] == 30

        headers = _login(client)
        me = client.get("/api/auth/me", headers=headers)
        assert me.status_code == 200
        assert me.json()["display_name"] == "Ava Chen"


def test_seed_aligned():
    db = JiraStore()
    seed_cohort(seed=42, target=db)
    assert len(db.list_issues()) == 30
    assert all(i.key.startswith("ONB-") for i in db.list_issues())
    assert all(i.smartstart_joiner_id.startswith("SYN-J-0042-") for i in db.list_issues())
    assert len(db.list_boards()) == 3


def test_transition_emits_project_ready():
    with TestClient(app) as client:
        headers = _login(client)
        issues = client.get("/api/issues", headers=headers).json()["issues"]
        open_issue = next((i for i in issues if i["status"] != "Done"), None)
        assert open_issue is not None

        denied = client.post(
            f"/api/issues/{open_issue['key']}/transition",
            json={"status": "Done"},
        )
        assert denied.status_code == 401

        res = client.post(
            f"/api/issues/{open_issue['key']}/transition",
            headers=headers,
            json={"status": "Done"},
        )
        assert res.status_code == 200, res.text
        assert res.json()["issue"]["status"] == "Done"
        assert res.json()["event"]["event_type"] == "PROJECT_READY"

        events = client.get("/api/events").json()
        assert any(e["event_type"] == "PROJECT_READY" for e in events["events"])


def test_for_you_and_board_and_pages():
    with TestClient(app) as client:
        assert client.get("/").status_code == 200
        assert client.get("/for-you").status_code == 200
        assert client.get("/api/events").status_code == 200
        assert client.get("/api/for-you").status_code == 401

        headers = _login(client)
        fy = client.get("/api/for-you", headers=headers)
        assert fy.status_code == 200
        assert "groups" in fy.json()

        boards = client.get("/api/boards", headers=headers).json()["boards"]
        assert len(boards) >= 1
        board = client.get(f"/api/boards/{boards[0]['id']}", headers=headers)
        assert board.status_code == 200
        assert "columns" in board.json()
