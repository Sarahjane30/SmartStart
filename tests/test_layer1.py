"""Layer 1 onboarding synthetic engine tests."""

from __future__ import annotations

from fastapi.testclient import TestClient

from backend.database import DataStore
from backend.main import app
from backend.models import OnboardingState, RoleType
from backend.synthetic_engine import generate_cohort


def test_generate_cohort_counts_and_flags():
    db = DataStore()
    generate_cohort(n_interns=15, n_ftes=15, seed=7, target_store=db)
    joiners = db.list_joiners()
    assert len(joiners) == 30
    assert sum(1 for j in joiners if j.role_type == RoleType.INTERN) == 15
    assert sum(1 for j in joiners if j.role_type == RoleType.FTE) == 15
    assert all(j.synthetic for j in joiners)
    assert all(j.email.endswith("@synthetic.smartstart.example") for j in joiners)
    assert all(j.id.startswith("SYN-J-") for j in joiners)
    for j in joiners:
        assert db.get_documents(j.id) is not None
        assert db.get_ticket_for_joiner(j.id) is not None
        docs = db.get_documents(j.id)
        assert docs is not None
        assert docs.form_count == 30


def test_generate_cohort_reproducible():
    a = DataStore()
    b = DataStore()
    generate_cohort(seed=99, target_store=a)
    generate_cohort(seed=99, target_store=b)
    assert [j.model_dump() for j in a.list_joiners()] == [
        j.model_dump() for j in b.list_joiners()
    ]


def test_api_joiners_and_metrics():
    with TestClient(app) as client:
        health = client.get("/health")
        assert health.status_code == 200
        assert health.json()["mode"] == "synthetic"

        listing = client.get("/api/joiners")
        assert listing.status_code == 200
        rows = listing.json()
        assert len(rows) == 30

        interns = client.get("/api/joiners", params={"role_type": "INTERN"})
        assert len(interns.json()) == 15

        detail = client.get(f"/api/joiners/{rows[0]['id']}")
        assert detail.status_code == 200
        body = detail.json()
        assert body["joiner"]["synthetic"] is True
        assert "it_ticket" in body
        assert "documents" in body
        assert body["documents"]["form_count"] == 30

        metrics = client.get("/api/metrics/summary")
        assert metrics.status_code == 200
        summary = metrics.json()
        assert summary["total_joiners"] == 30
        assert summary["synthetic"] is True
        assert summary["by_role_type"]["INTERN"] == 15
        assert summary["by_role_type"]["FTE"] == 15


def test_api_regenerate_and_404():
    with TestClient(app) as client:
        regen = client.post(
            "/api/admin/regenerate",
            params={"seed": 1, "n_interns": 2, "n_ftes": 2},
        )
        assert regen.status_code == 200
        assert regen.json()["total_joiners"] == 4

        missing = client.get("/api/joiners/does-not-exist")
        assert missing.status_code == 404


def test_state_machine_values():
    assert [s.value for s in OnboardingState] == [
        "OFFER_ACCEPTED",
        "DOCS_SUBMITTED",
        "IT_PROVISIONED",
        "DAY1_ORIENTED",
        "PROJECT_READY",
    ]
