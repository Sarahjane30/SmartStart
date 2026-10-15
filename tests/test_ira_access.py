"""IRA: "how do I get X access / raise a ticket" gets steps from the joiner's IT record, not a product description."""

from __future__ import annotations

from fastapi.testclient import TestClient

from backend.database import store
from backend.ira_api import build_ira_context
from backend.main import app
from ira.brain import respond


def _ctx():
    jid = next(j.id for j in store.list_joiners() if j.role_type.value == "INTERN")
    return build_ira_context(jid)


def _ask(q: str, ctx: dict) -> str:
    return respond(q, ctx, online=True)["text"]


def test_jira_access_question_gets_steps_not_a_product_description():
    with TestClient(app):
        ctx = _ctx()
        mgr = ctx["employee"]["manager_name"]
        text = _ask("how to raise ticket for jira access", ctx)
        assert "Project and work tracking" not in text
        assert mgr in text and "ServiceNow" in text and "Viewer or Editor" in text
        assert "Project and work tracking" in _ask("what is jira", ctx)


def test_access_to_a_new_system_follows_the_access_policy():
    with TestClient(app):
        ctx = _ctx()
        text = _ask("how do i get access to figma", ctx)
        assert "Check with" in text and "1 working day" in text
        assert "interns get Viewer or Editor only" in text
        assert "Access Requests & Approvals Policy" in text
        assert "Figma access" in _ask("can i get permission for figma", ctx)


def test_system_already_on_record_points_to_an_incident():
    with TestClient(app):
        ctx = _ctx()
        system = ctx["it"]["software_access"][0]
        text = _ask(f"i can't access {system}", ctx)
        assert "already on your IT record" in text and "incident" in text


def test_generic_ticket_question_explains_request_vs_incident():
    with TestClient(app):
        ctx = _ctx()
        text = _ask("how to raise a ticket", ctx)
        assert "Something new" in text and "Something broken" in text
        assert ctx["it"]["ticket_id"] in text
        assert _ask("raise ticket for laptop issue", ctx).index("Something broken") < _ask(
            "raise ticket for laptop issue", ctx).index("Something new")
        assert "iCIMS" in _ask("How do I submit documents?", ctx)


def test_desktop_bubble_gives_the_same_steps_online_and_offline():
    from ira.desktop_flow import DesktopConversation

    with TestClient(app):
        ctx = _ctx()
        d = DesktopConversation()
        d.offered = True
        hist = [("user", "what is jira"), ("assistant", "Project and work tracking.")]
        online = d.handle("how to raise ticket for jira access", ctx, online=True, history=hist).reply
        assert ctx["employee"]["manager_name"] in online and "ServiceNow" in online
        offline = d.handle("how to raise ticket for jira access", None, online=False, history=[]).reply
        assert "Your manager / PM confirms" in offline and "project-ready" not in offline


def test_access_ticket_answers_link_the_it_portal_and_attach_the_draft():
    from ira.desktop_flow import DesktopConversation
    from ira.ticket_draft import form_url

    with TestClient(app) as client:
        ctx = _ctx()
        r = client.get(f"/api/chatbot/{ctx['employee']['id']}", params={"q": "how to raise ticket for access"}).json()
        text = r["turns"][-1]["text"]
        assert form_url("access") in text and "ServiceNow" in text and "Submit yourself" in text
        assert r["ticket"]["item_id"] == "access" and r["ticket"]["form_url"] == form_url("access")

        d = DesktopConversation()
        d.offered = True
        turn = d.handle("how do i get access to figma", ctx, online=True, history=[])
        assert "Check with" in turn.reply and form_url("access") in turn.reply
        assert turn.ticket and turn.ticket["item_id"] == "access"
