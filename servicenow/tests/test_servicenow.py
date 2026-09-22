"""Tests for standalone mock ServiceNow (port 8200 app)."""

from __future__ import annotations

from fastapi.testclient import TestClient

from servicenow.backend.database import SnowStore
from servicenow.backend.main import app
from servicenow.backend.seed import seed_cohort


def _login(client: TestClient) -> dict:
    res = client.post(
        "/api/auth/login",
        json={"username": "it.demo", "password": "it-demo-2026"},
    )
    assert res.status_code == 200, res.text
    token = res.json()["token"]
    return {"Authorization": f"Bearer {token}", "X-ServiceNow-Token": token}


def test_health_and_login():
    with TestClient(app) as client:
        h = client.get("/health")
        assert h.status_code == 200
        body = h.json()
        assert body["app"] == "servicenow-mock"
        assert body["separate_from_smartstart"] is True
        assert body["requests"] == 30

        bad = client.post("/api/auth/login", json={"username": "it.demo", "password": "wrong"})
        assert bad.status_code == 401

        headers = _login(client)
        me = client.get("/api/auth/me", headers=headers)
        assert me.status_code == 200
        assert me.json()["display_name"] == "Riley Chen"


def test_seed_aligned_with_smartstart():
    db = SnowStore()
    seed_cohort(seed=42, target=db)
    assert len(db.list_requests()) == 30
    assert all(r.smartstart_joiner_id.startswith("SYN-J-0042-") for r in db.list_requests())
    assert all(r.requested_for_email.endswith("@synthetic.example") for r in db.list_requests())
    assert all(r.number.startswith("RITM") for r in db.list_requests())


def test_deliver_and_grant_emit_events():
    with TestClient(app) as client:
        headers = _login(client)
        reqs = client.get("/api/requests", headers=headers).json()["requests"]
        open_hw = next(
            (r for r in reqs if r["hardware_status"] != "Delivered"),
            None,
        )
        assert open_hw is not None

        denied = client.post(f"/api/requests/{open_hw['number']}/deliver")
        assert denied.status_code == 401

        res = client.post(
            f"/api/requests/{open_hw['number']}/deliver",
            headers=headers,
        )
        assert res.status_code == 200, res.text
        assert res.json()["request"]["hardware_status"] == "Delivered"
        assert res.json()["event"]["event_type"] == "HARDWARE_DELIVERED"

        grant = client.post(
            f"/api/requests/{open_hw['number']}/grant-access",
            headers=headers,
        )
        assert grant.status_code == 200
        body = grant.json()
        assert body["event"]["event_type"] == "ACCESS_GRANTED"
        assert body.get("complete_event", {}).get("event_type") == "IT_PROVISIONING_COMPLETE"

        events = client.get("/api/events").json()
        types = {e["event_type"] for e in events["events"]}
        assert "HARDWARE_DELIVERED" in types
        assert "ACCESS_GRANTED" in types
        assert "IT_PROVISIONING_COMPLETE" in types


def test_pages_and_public_events():
    with TestClient(app) as client:
        assert client.get("/").status_code == 200
        assert client.get("/dashboard").status_code == 200
        assert client.get("/api/events").status_code == 200
        assert client.get("/api/requests").status_code == 401
        headers = _login(client)
        assert client.get("/api/dashboard", headers=headers).status_code == 200
        assert client.get("/api/sla", headers=headers).status_code == 200
        assert client.get("/api/integration/status", headers=headers).status_code == 200
