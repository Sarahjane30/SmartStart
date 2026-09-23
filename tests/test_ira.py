"""IRA desktop companion — API + answer-engine tests (no GUI required)."""

from __future__ import annotations

from fastapi.testclient import TestClient

from backend.database import store
from backend.ira_demo import IRA_DEMO_NAME, IRA_DEMO_TICKET, find_ira_demo_id
from backend.main import app
from backend.models import HardwareStatus
from ira.brain import answer, greeting, suggestions_for
from ira.faq import match_faq


def _sarah_id(client: TestClient) -> str:
    body = client.get("/api/ira/employees").json()
    sarah = next(e for e in body["employees"] if e["name"] == IRA_DEMO_NAME)
    return sarah["id"]


def test_ira_employees_includes_sarah():
    with TestClient(app) as client:
        res = client.get("/api/ira/employees")
        assert res.status_code == 200
        body = res.json()
        assert body["synthetic"] is True
        assert body["total"] == 30
        assert body["employees"][0]["name"] == IRA_DEMO_NAME
        assert body["employees"][0]["department"] == "Data Engineering"
        assert find_ira_demo_id() == body["employees"][0]["id"]


def test_ira_context_for_sarah():
    with TestClient(app) as client:
        sid = _sarah_id(client)
        res = client.get(f"/api/ira/{sid}/context")
        assert res.status_code == 200
        ctx = res.json()
        assert ctx["employee"]["name"] == IRA_DEMO_NAME
        assert ctx["employee"]["mentor_name"] == "Priya Nair"
        assert ctx["employee"]["joining_date"] == "2026-09-28"
        assert ctx["it"]["ticket_id"] == IRA_DEMO_TICKET
        assert ctx["it"]["hardware_status"] == "Configured"
        assert ctx["documents"]["status"] == "Complete"
        assert ctx["readiness"]["hr_ready"] is True
        assert ctx["readiness"]["it_ready"] is False
        assert "Complete your tax information" in ctx["onboarding"]["open_tasks"]


def test_ira_slice_endpoints():
    with TestClient(app) as client:
        sid = _sarah_id(client)
        assert client.get(f"/api/ira/{sid}/onboarding").status_code == 200
        assert client.get(f"/api/ira/{sid}/tasks").status_code == 200
        assert client.get(f"/api/ira/{sid}/it-status").status_code == 200
        assert client.get(f"/api/ira/{sid}/learning").status_code == 200
        assert client.get(f"/api/ira/{sid}/notifications").status_code == 200
        assert client.get("/api/ira/SYN-J-MISSING/context").status_code == 404


def test_brain_context_answers():
    with TestClient(app) as client:
        sid = _sarah_id(client)
        ctx = client.get(f"/api/ira/{sid}/context").json()

    first = answer("When is my first day?", ctx, online=True)
    assert "2026" in first and ("September" in first or "09-28" in first or "2026-09-28" in first)
    assert "Priya Nair" in answer("Who is my mentor?", ctx, online=True)
    assert "Ava Chen" in answer("Who is my manager?", ctx, online=True)
    laptop = answer("Where is my laptop?", ctx, online=True)
    assert IRA_DEMO_TICKET in laptop
    assert "Configured" in laptop or "In Progress" in laptop
    left = answer("What's left for me?", ctx, online=True)
    assert "tax" in left.lower() or "laptop" in left.lower()
    ready = answer("Am I ready for Day 1?", ctx, online=True)
    assert "almost" in ready.lower() or "remain" in ready.lower() or "pending" in ready.lower()


def test_brain_no_hallucination_without_context():
    msg = answer("What is my badge number?", None, online=True)
    assert "select an employee" in msg.lower() or "settings" in msg.lower()
    offline = answer("What is my badge number?", None, online=False)
    assert "smartstart" in offline.lower() or "reachable" in offline.lower()
    faq = answer("What happens on Day 1?", None, online=False)
    assert "orientation" in faq.lower()
    assert "2026" not in faq


def test_brain_missing_laptop_safe():
    ctx = {
        "employee": {"name": "Test", "joining_date": None, "mentor_name": None, "manager_name": None},
        "onboarding": {"open_tasks": [], "current_state": "OFFER_ACCEPTED", "progress_pct": 10},
        "documents": {},
        "it": {},
        "learning": {},
        "readiness": {},
    }
    reply = answer("Where is my laptop?", ctx, online=True).lower()
    assert "laptop request" in reply or "don’t see" in reply or "don't see" in reply


def test_faq_offline_match():
    assert match_faq("How do I get VPN access?")
    assert match_faq("What should I learn first?")
    assert match_faq("What is my badge number?") is None
    assert suggestions_for(None)
    assert "onboarding" in greeting(None).lower() or "IRA" in greeting(None)


def test_ira_session_bridge():
    with TestClient(app) as client:
        assert client.get("/api/ira/session").json()["active"] is False
        sid = _sarah_id(client)
        posted = client.post(
            "/api/ira/session",
            json={
                "employee_id": sid,
                "employee_name": "Sarah Jane",
                "department": "Data Engineering",
                "role_type": "INTERN",
            },
        )
        assert posted.status_code == 200
        body = posted.json()
        assert body["active"] is True
        assert body["session"]["employee_id"] == sid
        assert client.get("/api/ira/session").json()["active"] is True
        assert client.delete("/api/ira/session").json()["active"] is False


def test_ira_reflects_ticket_update():
    """Demo step: ServiceNow-style laptop update is visible to IRA via API."""
    with TestClient(app) as client:
        sid = _sarah_id(client)
        before = client.get(f"/api/ira/{sid}/it-status").json()
        assert before["it"]["hardware_status"] == "Configured"

        ticket = store.get_ticket_for_joiner(sid)
        assert ticket is not None
        ticket.hardware_status = HardwareStatus.DELIVERED
        store.it_tickets[ticket.ticket_id] = ticket

        after = client.get(f"/api/ira/{sid}/it-status").json()
        assert after["it"]["hardware_status"] == "Delivered"
        ctx = client.get(f"/api/ira/{sid}/context").json()
        reply = answer("Is my laptop ready?", ctx, online=True)
        assert "Delivered" in reply

        ticket.hardware_status = HardwareStatus.CONFIGURED
        store.it_tickets[ticket.ticket_id] = ticket
