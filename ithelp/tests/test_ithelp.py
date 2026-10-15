"""Tests for the standalone mock IT Help portal (port 8400)."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from ithelp.backend import store
from ithelp.backend.main import app


@pytest.fixture(autouse=True)
def _fresh_store():
    store.reset()
    yield
    store.reset()


def _login(client: TestClient, username: str = "sarah.jane", **extra) -> dict:
    body = {"username": username, **(extra or {"sso": True})}
    res = client.post("/api/auth/login", json=body)
    assert res.status_code == 200, res.text
    return {"Authorization": f"Bearer {res.json()['token']}"}


def _incident_values(**over) -> dict:
    return {
        "urgency": "3 - Low",
        "short_description": "Laptop keyboard not responding",
        "description": "What's happening: several keys do not register.",
        **over,
    }


def test_health_and_pages():
    with TestClient(app) as client:
        h = client.get("/health").json()
        assert h["app"] == "ithelp-mock" and h["separate_from_smartstart"] is True
        assert "IT Service Portal" in client.get("/").text
        assert "single sign-on" in client.get("/login").text
        assert client.get("/static/style.css").status_code == 200


def test_login_password_and_sso():
    with TestClient(app) as client:
        assert client.post("/api/auth/login", json={"username": "sarah.jane", "password": "nope"}).status_code == 401
        _login(client, password=store.PASSWORD)
        headers = _login(client)
        me = client.get("/api/me", headers=headers).json()
        assert me["name"] == "Sarah Jane"
        assert me["email"].endswith("@synthetic.example")


def test_requires_token():
    with TestClient(app) as client:
        assert client.get("/api/me").status_code == 401
        assert client.get("/api/tickets").status_code == 401
        assert client.post("/api/tickets", json={"item_id": "network", "values": {}}).status_code == 401


def test_catalog_matches_portal_layout():
    with TestClient(app) as client:
        cat = client.get("/api/catalog").json()
        assert cat["featured"] == ["sap", "compass", "hardware-software", "network"]
        item = client.get("/api/catalog/hardware-software").json()
        assert item["title"] == "Computer Hardware or Software"
        keys = [f["key"] for f in item["fields"]]
        assert keys[:4] == ["name", "phone", "watch_users", "watch_emails"]
        assert {"urgency", "short_description", "description"} <= set(keys)
        assert client.get("/api/catalog/nope").status_code == 404


def test_create_ticket_validates_and_scopes_to_user():
    with TestClient(app) as client:
        sarah = _login(client)
        alex = _login(client, "alex.example")

        bad = client.post("/api/tickets", headers=sarah, json={"item_id": "hardware-software", "values": {}})
        assert bad.status_code == 400
        assert "Urgency" in bad.json()["detail"] and "Short Description" in bad.json()["detail"]

        wrong = client.post(
            "/api/tickets", headers=sarah,
            json={"item_id": "hardware-software", "values": _incident_values(urgency="9 - Panic")},
        )
        assert wrong.status_code == 400

        res = client.post(
            "/api/tickets", headers=sarah,
            json={"item_id": "hardware-software", "values": _incident_values(name="Someone Else")},
        )
        assert res.status_code == 201, res.text
        t = res.json()
        assert t["number"].startswith("INC") and t["state"] == "New"
        assert t["values"]["name"] == "Sarah Jane"
        assert "user" not in t

        assert any(x["number"] == t["number"] for x in client.get("/api/tickets", headers=sarah).json())
        assert all(x["number"] != t["number"] for x in client.get("/api/tickets", headers=alex).json())
        assert client.get(f"/api/tickets/{t['number']}", headers=alex).status_code == 404


def test_access_request_gets_ritm_number():
    with TestClient(app) as client:
        sarah = _login(client)
        res = client.post(
            "/api/tickets", headers=sarah,
            json={"item_id": "access", "values": {
                "application": "GitHub", "access_type": "New access",
                "short_description": "GitHub access for Data Platform repos",
                "justification": "Needed for onboarding tasks.",
            }},
        )
        assert res.status_code == 201, res.text
        assert res.json()["number"].startswith("RITM")


def test_search():
    with TestClient(app) as client:
        ids = [h["id"] for h in client.get("/api/search?q=vpn").json()]
        assert "network" in ids
        assert client.get("/api/search?q=").json() == []
