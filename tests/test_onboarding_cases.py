"""NIA HR onboarding assistant: plan → approve → route → monitor → chase → communicate → close."""

from __future__ import annotations

from fastapi.testclient import TestClient

from backend import onboarding_cases as cases
from backend.database import store
from backend.main import app
from backend.models import DocumentStatus, HardwareStatus, OnboardingState

ACCOUNTS = {
    "HR": ("hr.jordan", "hr-demo-2026"),
    "IT": ("it.riley", "it-demo-2026"),
    "MANAGER": ("mgr.chen", "mgr-chen-2026"),
    "OPS": ("ops.admin", "ops-demo-2026"),
}


def _h(client: TestClient, role: str) -> dict:
    u, p = ACCOUNTS[role]
    return {"Authorization": f"Bearer {client.post('/api/auth/login', json={'username': u, 'password': p}).json()['token']}"}


def _ask(client: TestClient, h: dict, message: str, focus: str | None = None) -> dict:
    res = client.post("/api/nia/ask", json={"message": message, "focus_joiner_id": focus}, headers=h)
    assert res.status_code == 200, res.text
    return res.json()


def _block(reply: dict, kind: str) -> dict:
    return next(b for b in reply["blocks"] if b["type"] == kind)


def _id(name: str) -> str:
    return next(j.id for j in store.list_joiners() if j.name == name)


def test_accepted_offer_gets_a_role_aware_plan_for_hr_review():
    with TestClient(app) as client:
        h = _h(client, "HR")
        w = client.get("/api/nia/briefing", headers=h).json()
        assert any(p.get("cta_q") == "Show onboarding plans waiting for review" for p in w["proactive"])

        r = _ask(client, h, "Onboard Jesse")
        plan = _block(r, "case_plan")
        assert plan["status"] == "review" and plan["can_approve"]
        assert {c["key"] for c in plan["confirmations"]} == {"mentor", "laptop"}
        assert plan["counts"]["auto"] + plan["counts"]["confirm"] == plan["counts"]["total"]
        assert "2 need your confirmation" in r["text"]
        it = next(g for g in plan["groups"] if g["key"] == "IT")
        names = {i["label"] for i in it["items"]}
        # Technical FTE: developer kit and dev tooling straight from the ServiceNow ticket.
        assert {"GitHub", "AWS Console", "VPN"} <= names
        laptop = next(c for c in plan["confirmations"] if c["key"] == "laptop")
        assert laptop["value"] == "developer"

        biz = _block(_ask(client, h, "Show Linda Wolfe's onboarding plan"), "case_plan")
        biz_it = {i["label"] for i in next(g for g in biz["groups"] if g["key"] == "IT")["items"]}
        assert "GitHub" not in biz_it and "Salesforce" in biz_it
        assert next(c for c in biz["confirmations"] if c["key"] == "laptop")["value"] == "standard"
        learn = [i["label"] for i in next(g for g in biz["groups"] if g["key"] == "Learning")["items"]]
        assert "Git Basics" not in learn


def test_approving_routes_work_to_it_manager_and_employee_only_after_confirm():
    with TestClient(app) as client:
        h = _h(client, "HR")
        jid = _id("Jesse Garcia")
        assert not cases.log_for(jid)
        _ask(client, h, "Approve Jesse's plan")
        assert not [e for e in cases.log_for(jid) if e["kind"] == "routed"], "asking must not approve"

        res = client.post(f"/api/nia/cases/{jid}/approve", json={"mentor": "Mark Diaz", "laptop": "developer"}, headers=h)
        assert res.status_code == 200
        routed = {r["team"]: r for r in res.json()["routed"]}
        assert routed["IT"]["to"] == "IT Service Desk" and routed["Manager"]["to"] == "Ava Chen"
        assert routed["Employee"]["status"] == "Awaiting employee"
        assert client.post(f"/api/nia/cases/{jid}/approve", json={}, headers=h).status_code == 400

        notes = client.get(f"/api/notifications/{jid}").json()["notifications"]
        assert any(n["title"] == "Your onboarding documents are ready" for n in notes)

        it_w = client.get("/api/nia/briefing", headers=_h(client, "IT")).json()
        assert any("Jesse Garcia" in p["text"] and "HR approved" in p["text"] for p in it_w["proactive"])
        mgr = _ask(client, _h(client, "MANAGER"), "What follow-ups do I have?")
        assert "Jesse" in str(mgr["blocks"])


def test_only_hr_and_ops_run_cases():
    with TestClient(app) as client:
        jid = _id("Jesse Garcia")
        for role in ("IT", "MANAGER"):
            h = _h(client, role)
            assert client.post(f"/api/nia/cases/{jid}/approve", json={}, headers=h).status_code in (403, 404)
            body = {"joiner_id": jid, "kind": "welcome", "subject": "x", "body": "y"}
            assert client.post("/api/nia/comms/send", json=body, headers=h).status_code in (403, 404)
        plan = _block(_ask(client, _h(client, "OPS"), "Onboard Jesse"), "case_plan")
        assert plan["can_approve"]


def test_status_says_whether_hr_needs_to_act():
    with TestClient(app) as client:
        h = _h(client, "HR")
        sarah = _block(_ask(client, h, "How's Sarah's onboarding?"), "case_status")
        assert sarah["attention"]["level"] == "none"
        assert "No HR action" in sarah["attention"]["headline"]
        assert "within SLA" in sarah["attention"]["reason"]
        assert [s["label"] for s in sarah["steps"]][:3] == ["Offer accepted", "Documents", "IT provisioning"]

        anna = _block(_ask(client, h, "How is Anna Baker's onboarding going?"), "case_status")
        assert anna["attention"]["level"] == "watch"
        assert "IT has already been notified" in anna["attention"]["reason"]
        assert "No HR action required yet" in anna["attention"]["reason"]
        assert any(e["to"] == "IT Service Desk" for e in anna["followups"])
        assert anna["steps"][-1]["status"] == "pending"


def test_followups_go_to_it_and_managers_not_hr():
    with TestClient(app) as client:
        client.get("/api/nia/briefing", headers=_h(client, "HR"))
        reminders = [e for e in cases._LOG if e["kind"] == "reminder"]
        assert reminders and {e["audience"] for e in reminders} <= {"IT", "Manager"}
        before = len(reminders)
        client.get("/api/nia/briefing", headers=_h(client, "HR"))
        assert len([e for e in cases._LOG if e["kind"] == "reminder"]) == before, "each reminder is sent once"
        chen = cases.inbox("MANAGER", "MGR-CHEN", [f for f in _visible() if f.joiner.manager_id == "MGR-CHEN"])
        assert chen and all(e["manager_id"] in ("", "MGR-CHEN") for e in chen)


def _visible():
    from backend.role_context import joiner_facts

    return [joiner_facts(j) for j in store.list_joiners()]


def test_documents_drafts_and_send_are_confirmed_by_hr():
    with TestClient(app) as client:
        h = _h(client, "HR")
        docs = _block(_ask(client, h, "Show me Jason Hahn's documents"), "documents")
        assert docs["state"] == "rework" and "resubmit" in docs["action"]
        assert [r["name"] for r in docs["rows"]][:5] == list(cases.DOC_PACKET)

        denied = _ask(client, _h(client, "IT"), "Show me Anna Baker's documents")
        assert not [b for b in denied["blocks"] if b["type"] == "documents"]

        r = _ask(client, h, "Send Jesse a reminder about his documents")
        d = _block(r, "draft")
        assert d["kind"] == "doc_reminder" and d["to"]["audience"] == "Employee"
        jid = d["joiner_id"]
        assert not cases.sent_messages(jid), "drafting must not send"
        res = client.post("/api/nia/comms/send", json={
            "joiner_id": jid, "kind": "doc_reminder", "subject": d["subject"], "body": d["body"] + "\n\nThanks!",
        }, headers=h)
        assert res.status_code == 200 and res.json()["sent"]["body"].endswith("Thanks!")
        assert any(n["title"] == d["subject"] for n in client.get(f"/api/notifications/{jid}").json()["notifications"])

        verified = _ask(client, h, "Send Sarah a reminder about her documents")
        assert not [b for b in verified["blocks"] if b["type"] == "draft"]
        assert "already verified" in verified["text"]

        for q, kind in [
            ("Draft a welcome email for Sarah", "welcome"),
            ("Draft Day-1 instructions for Sarah", "day1"),
            ("Write a mentor introduction for Sarah", "mentor_intro"),
            ("Draft a first-week check-in for Todd", "first_week"),
            ("Remind Todd's manager", "manager_reminder"),
            ("Escalate Anna's laptop to IT", "it_escalation"),
        ]:
            assert _block(_ask(client, h, q), "draft")["kind"] == kind, q


def test_bulk_document_reminders_need_confirmation():
    with TestClient(app) as client:
        h = _h(client, "HR")
        drafts = _block(_ask(client, h, "Remind everyone whose documents are incomplete"), "drafts")
        pending = [j for j in store.list_joiners()
                   if store.get_documents(j.id).status == DocumentStatus.PENDING or store.get_documents(j.id).rework_flag]
        assert len(drafts["items"]) == len(pending)
        assert not [e for e in cases._LOG if e["kind"] == "message"]
        ids = [i["joiner_id"] for i in drafts["items"][:2]]
        res = client.post("/api/nia/comms/send-bulk", json={"kind": "doc_reminder", "joiner_ids": ids}, headers=h)
        assert res.json()["count"] == 2


def test_waiting_upcoming_briefing_and_close():
    with TestClient(app) as client:
        h = _h(client, "HR")
        w = _ask(client, h, "What am I waiting for?")
        titles = [b["title"] for b in w["blocks"]]
        assert "Waiting on IT" in titles and "Waiting on managers" in titles

        up = _ask(client, h, "Who joins next week?")
        assert up["intent"] == "case:upcoming" and "Sarah Jane" in up["text"]

        b = _ask(client, h, "Give me Monday's onboarding briefing")
        assert b["intent"] == "briefing"
        assert any(bl.get("title") == "Onboarding cases" for bl in b["blocks"])

        erica = _id("Erica Mcclain")
        done = _block(_ask(client, h, "Close Erica's case"), "case_complete")
        assert done["can_close"]
        assert client.post(f"/api/nia/cases/{_id('Sarah Jane')}/close", headers=h).status_code == 400
        assert client.post(f"/api/nia/cases/{erica}/close", headers=h).status_code == 200
        assert "closed" in _ask(client, h, "How's Erica's onboarding?")["text"]


def test_icims_offer_accepted_event_opens_a_new_case():
    with TestClient(app) as client:
        h = _h(client, "HR")
        jid = _id("Chelsea Jackson")
        assert store.get_joiner(jid).current_state == OnboardingState.PROJECT_READY
        opened = cases.ingest_offer_accepted({
            "event_type": "OFFER_ACCEPTED", "candidate_id": "CAND-0042-012", "position": "Process Intelligence Analyst",
            "start_date": "2026-09-18", "smartstart_joiner_id": jid,
        }, "EVT-00001@2026-09-24T00:00:00+00:00")
        assert opened == jid
        j = store.get_joiner(jid)
        assert j.current_state == OnboardingState.OFFER_ACCEPTED
        assert store.get_documents(jid).status == DocumentStatus.PENDING
        assert store.get_ticket_for_joiner(jid).hardware_status == HardwareStatus.PENDING

        w = client.get("/api/nia/briefing", headers=h).json()
        nudge = next(p for p in w["proactive"] if p.get("kind") == "detected")
        assert nudge["title"].startswith("New joiner detected")
        assert "Chelsea Jackson — Process Intelligence Analyst" in str(nudge["fields"])
        plan = _block(_ask(client, h, nudge["cta_q"]), "case_plan")
        assert plan["detected"]["event"] == "EVT-00001" and plan["position"] == "Process Intelligence Analyst"
        assert cases.ingest_offer_accepted({"smartstart_joiner_id": "nope"}, "EVT-2@x") is None


def test_icims_sync_is_best_effort(monkeypatch):
    monkeypatch.setenv("SMARTSTART_ICIMS_SYNC", "1")
    monkeypatch.setenv("NIA_ICIMS_URL", "http://127.0.0.1:9")
    assert cases.sync_icims(force=True) == []
    assert cases.sync_state() is False
