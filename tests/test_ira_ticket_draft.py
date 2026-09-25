from fastapi.testclient import TestClient

from backend.main import app
from ira.ticket_draft import draft_ticket, is_ticket_request, scrub

CTX = {
    "employee": {
        "role_title": "Data Engineering Intern",
        "team": "Data Platform",
        "department": "Data Engineering",
        "manager_name": "Ava Chen",
    },
    "it": {"ticket_id": "REQ-1042", "hardware_status": "Configured"},
}


def _fields(d: dict) -> dict:
    return {f["key"]: f["value"] for f in d["fields"]}


def test_detects_ticket_questions_but_not_status_or_email():
    assert is_ticket_request("How do I raise a ticket?")
    assert is_ticket_request("My laptop keyboard is not working")
    assert is_ticket_request("I need a new monitor, can you help me raise a request?")
    assert not is_ticket_request("What is the status of my ticket REQ-1042?")
    assert not is_ticket_request("Where is the office?")
    assert not is_ticket_request("Draft an email to my mentor about lunch")


def test_keyboard_problem_goes_to_hardware_form_with_copyable_fields():
    d = draft_ticket("My laptop keyboard is not working, how do I raise a ticket?", CTX)
    assert d["item_id"] == "hardware-software"
    assert d["form_url"].endswith("/#/item/hardware-software?from=ira")
    f = _fields(d)
    assert f["urgency"] == "3 - Low"
    assert f["short_description"] == "Laptop keyboard is not working"
    assert "What I've already tried:" in f["description"]
    assert "REQ-1042" in f["description"] and "Data Platform" in f["description"]


def test_category_and_urgency_routing():
    vpn = draft_ticket("VPN keeps disconnecting — whole team affected", CTX)
    assert vpn["item_id"] == "network" and _fields(vpn)["urgency"] == "1 - High"
    dead = draft_ticket("My laptop won't turn on at all", CTX)
    assert _fields(dead)["urgency"] == "2 - Medium"
    assert draft_ticket("SAP is not loading", CTX)["item_id"] == "sap"
    access = draft_ticket("I need access to Power BI, how do I raise a ticket?", CTX)
    assert access["item_id"] == "access" and access["kind"] == "request"
    assert _fields(access)["application"] == "Power BI"
    assert _fields(access)["approver"] == "Ava Chen"
    assert draft_ticket("I need a new monitor, can you raise a request?", CTX)["item_id"] == "new-hardware"


def test_generic_question_uses_placeholders():
    d = draft_ticket("How do I raise a ticket?", CTX)
    f = _fields(d)
    assert f["short_description"].startswith("[")
    assert d["has_placeholders"] is True


def test_drafts_never_carry_secrets_or_contact_details():
    assert "hunter2" not in scrub("my password is hunter2")
    d = draft_ticket("Hey IRA, my password is hunter2 and SAP is not loading, call me on +91 98765 43210", CTX)
    text = " ".join(f["value"] for f in d["fields"])
    assert "hunter2" not in text and "98765" not in text
    assert _fields(d)["short_description"] == "SAP is not loading"


def test_chatbot_returns_ticket_card_and_portal_guidance():
    with TestClient(app) as client:
        jid = client.get("/api/ira/employees").json()["employees"][0]["id"]
        body = client.get(f"/api/chatbot/{jid}", params={"q": "My laptop keyboard is not working, how do I raise a ticket?"}).json()
        assert body["ticket"]["item_id"] == "hardware-software"
        assert "?from=ira" in body["ticket"]["form_url"]
        reply = body["turns"][-1]["text"]
        assert "IT Service Portal" in reply and "Submit yourself" in reply
        plain = client.get(f"/api/chatbot/{jid}", params={"q": "Who is my mentor?"}).json()
        assert plain["ticket"] is None
