"""Mock source systems + SmartStart ingest pipeline tests."""

from __future__ import annotations

from fastapi.testclient import TestClient

from backend.database import DataStore, source_store, store
from backend.ingest import bootstrap_sources_and_ingest, run_ingest, source_system_summary
from backend.main import app
from backend.synthetic_engine import generate_cohort


def _login(client: TestClient) -> dict:
    res = client.post(
        "/api/auth/login",
        json={"username": "ops.admin", "password": "ops-demo-2026"},
    )
    assert res.status_code == 200
    token = res.json()["token"]
    return {"Authorization": f"Bearer {token}", "X-SmartStart-Token": token}


def test_bootstrap_fills_source_then_smartstart():
    src = DataStore()
    dst = DataStore()
    generate_cohort(n_interns=3, n_ftes=2, seed=11, target_store=src)
    assert len(src.list_joiners()) == 5
    assert len(dst.list_joiners()) == 0
    result = run_ingest(clear_first=True, db_source=src, db_target=dst)
    assert result.joiners_upserted == 5
    assert len(dst.list_joiners()) == 5
    assert dst.list_joiners()[0].id == src.list_joiners()[0].id


def test_source_apis_are_public_and_native_shaped():
    with TestClient(app) as client:
        summary = client.get("/api/sources/summary")
        assert summary.status_code == 200
        body = summary.json()
        assert body["synthetic"] is True
        assert body["icims"]["record_count"] == 30
        assert body["servicenow"]["record_count"] == 30
        assert body["jira"]["record_count"] == 30

        icims = client.get("/api/sources/icims")
        assert icims.status_code == 200
        cand = icims.json()["candidates"][0]
        assert cand["candidate_id"].startswith("ICIMS-CAND-")
        assert cand["source_system"] == "iCIMS"
        assert "packet_status" in cand

        snow = client.get("/api/sources/servicenow")
        assert snow.status_code == 200
        ticket = snow.json()["tickets"][0]
        assert ticket["number"].startswith("RITM")
        assert ticket["source_system"] == "ServiceNow"

        jira = client.get("/api/sources/jira")
        assert jira.status_code == 200
        issue = jira.json()["issues"][0]
        assert issue["key"].startswith("ONB-")
        assert issue["source_system"] == "Jira"


def test_ingest_run_requires_auth_and_reloads_store():
    with TestClient(app) as client:
        denied = client.post("/api/ingest/run")
        assert denied.status_code == 401

        headers = _login(client)
        status_before = client.get("/api/ingest/status").json()
        assert status_before["smartstart"]["joiner_count"] == 30
        assert status_before["last_run"] is not None

        # Clear SmartStart only — sources stay populated
        store.clear()
        assert len(store.list_joiners()) == 0
        assert len(source_store.list_joiners()) == 30

        empty_status = client.get("/api/ingest/status").json()
        assert empty_status["smartstart"]["joiner_count"] == 0
        assert empty_status["sources"]["icims"]["record_count"] == 30

        run = client.post("/api/ingest/run", headers=headers)
        assert run.status_code == 200
        payload = run.json()
        assert payload["status"] == "ok"
        assert payload["joiners_upserted"] == 30
        assert payload["sources"]["iCIMS"]["records_pulled"] == 30
        assert len(store.list_joiners()) == 30


def test_source_uis_and_ingest_page_served():
    with TestClient(app) as client:
        for path in (
            "/sources/icims",
            "/sources/servicenow",
            "/sources/jira",
            "/ingest",
        ):
            res = client.get(path)
            assert res.status_code == 200, path
            assert "text/html" in res.headers.get("content-type", "")


def test_regenerate_rebuilds_sources_and_ingests():
    with TestClient(app) as client:
        headers = _login(client)
        regen = client.post(
            "/api/admin/regenerate",
            params={"seed": 3, "n_interns": 2, "n_ftes": 1},
            headers=headers,
        )
        assert regen.status_code == 200
        body = regen.json()
        assert body["total_joiners"] == 3
        assert body["source_joiners"] == 3
        assert source_system_summary()["icims"]["record_count"] == 3

        # Restore default demo cohort for other tests that share process state
        bootstrap_sources_and_ingest(n_interns=15, n_ftes=15, seed=42)
