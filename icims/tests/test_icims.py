"""Tests for standalone mock iCIMS (port 8100 app)."""

from __future__ import annotations

from fastapi.testclient import TestClient

from icims.backend.database import IcimsStore
from icims.backend.main import app
from icims.backend.seed import seed_cohort


def _login(client: TestClient) -> dict:
    res = client.post("/api/auth/login", json={"username": "hr.demo", "password": "hr-demo-2026"})
    assert res.status_code == 200, res.text
    token = res.json()["token"]
    return {"Authorization": f"Bearer {token}", "X-iCIMS-Token": token}


def test_health_and_login():
    with TestClient(app) as client:
        h = client.get("/health")
        assert h.status_code == 200
        body = h.json()
        assert body["app"] == "icims-mock"
        assert body["separate_from_smartstart"] is True
        assert body["candidates"] == 30

        bad = client.post("/api/auth/login", json={"username": "hr.demo", "password": "wrong"})
        assert bad.status_code == 401

        headers = _login(client)
        me = client.get("/api/auth/me", headers=headers)
        assert me.status_code == 200
        assert me.json()["display_name"] == "Jordan Blake"


def test_seed_aligned_with_smartstart_ids():
    db = IcimsStore()
    seed_cohort(seed=42, target=db)
    assert len(db.list_candidates()) == 30
    interns = sum(1 for c in db.list_candidates() if c.candidate_type.value == "Intern")
    assert interns == 15
    assert all(c.smartstart_joiner_id.startswith("SYN-J-0042-") for c in db.list_candidates())
    assert all(c.email.endswith("@synthetic.example") for c in db.list_candidates())
    managers = {c.hiring_manager for c in db.list_candidates()}
    assert {"Ava Chen", "Leo Park", "Priya Singh", "Jordan Cole"} <= managers


def test_offer_accept_emits_event_and_creates_hire():
    with TestClient(app) as client:
        headers = _login(client)
        offers = client.get("/api/offers", headers=headers).json()["offers"]
        sent = next((o for o in offers if o["status"] == "Sent"), None)
        assert sent is not None, "need at least one Sent offer for demo"

        denied = client.post(f"/api/offers/{sent['id']}/accept")
        assert denied.status_code == 401

        res = client.post(f"/api/offers/{sent['id']}/accept", headers=headers)
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["offer"]["status"] == "Accepted"
        assert body["candidate"]["stage"] == "Offer Accepted"
        assert body["event"]["event_type"] == "OFFER_ACCEPTED"
        assert body["event"]["payload"]["candidate_id"] == sent["candidate_id"]
        assert "start_date" in body["event"]["payload"]
        assert body["new_hire"]["candidate_id"] == sent["candidate_id"]

        events = client.get("/api/events").json()
        assert events["total"] >= 1
        assert any(e["event_type"] == "OFFER_ACCEPTED" for e in events["events"])

        hires = client.get("/api/new-hires", headers=headers).json()
        assert any(h["candidate_id"] == sent["candidate_id"] for h in hires["new_hires"])


def test_document_verify_and_hr_ready_events():
    with TestClient(app) as client:
        headers = _login(client)
        docs = client.get("/api/documents", headers=headers).json()["documents"]
        unverified = next((d for d in docs if d["verification_status"] != "Verified"), None)
        assert unverified is not None

        res = client.post(
            f"/api/documents/{unverified['id']}/verify",
            headers=headers,
        )
        assert res.status_code == 200
        assert res.json()["event"]["event_type"] == "DOCUMENT_VERIFIED"

        events = client.get("/api/events").json()["events"]
        assert any(e["event_type"] == "DOCUMENT_VERIFIED" for e in events)


def test_pages_served():
    with TestClient(app) as client:
        for path in ("/", "/dashboard"):
            res = client.get(path)
            assert res.status_code == 200
            assert "text/html" in res.headers.get("content-type", "")


def test_apis_require_auth_except_events():
    with TestClient(app) as client:
        assert client.get("/api/candidates").status_code == 401
        assert client.get("/api/events").status_code == 200
        headers = _login(client)
        assert client.get("/api/dashboard", headers=headers).status_code == 200
        assert client.get("/api/integration/status", headers=headers).status_code == 200
