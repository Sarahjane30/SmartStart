"""NIA for hiring managers: the manager's own onboarding jobs, in the manager's voice — not HR's case view."""

from __future__ import annotations

from fastapi.testclient import TestClient

from backend import employee_experience, onboarding_cases as cases
from backend.database import store
from backend.main import app

ACCOUNTS = {
    "HR": ("hr.jordan", "hr-demo-2026"),
    "IT": ("it.riley", "it-demo-2026"),
    "CHEN": ("mgr.chen", "mgr-chen-2026"),
    "PARK": ("mgr.park", "mgr-park-2026"),
}


def _h(client: TestClient, who: str) -> dict:
    u, p = ACCOUNTS[who]
    return {"Authorization": f"Bearer {client.post('/api/auth/login', json={'username': u, 'password': p}).json()['token']}"}


def _ask(client: TestClient, h: dict, message: str, focus: str | None = None) -> dict:
    res = client.post("/api/nia/ask", json={"message": message, "focus_joiner_id": focus}, headers=h)
    assert res.status_code == 200, res.text
    return res.json()


def _block(reply: dict, kind: str) -> dict:
    return next(b for b in reply["blocks"] if b["type"] == kind)


def _id(name: str) -> str:
    return next(j.id for j in store.list_joiners() if j.name == name)


def _inbox_titles(joiner_id: str) -> list[str]:
    return [m["title"] for m in employee_experience._HR_MESSAGES.get(joiner_id, [])]


def test_manager_welcome_is_a_manager_agenda_not_hr_case_relay():
    with TestClient(app) as client:
        hr, m = _h(client, "HR"), _h(client, "CHEN")
        jesse = _id("Jesse Garcia")
        assert client.post(f"/api/nia/cases/{jesse}/approve", json={}, headers=hr).status_code == 200

        w = client.get("/api/nia/briefing", headers=m).json()
        text = str(w)
        assert "HR onboarding case" not in text and "HR approved" not in text
        agenda = _block(w, "mgr_agenda")
        team = {j.name for j in store.list_joiners() if j.manager_id == "MGR-CHEN"}
        assert {n["name"] for n in agenda["needs"]} <= team
        keys = {n["name"]: n["key"] for n in agenda["needs"]}
        assert keys["Alexander Le"] == "project" and keys["Danielle Johnson"] == "day1"
        assert all(n["actions"] and n["actions"][0]["q"] for n in agenda["needs"])

        handover = next(p for p in w["proactive"] if p.get("title") == "New joiner on your team")
        assert handover["joiner_id"] == jesse and handover["kind"] == "task"
        assert handover["cta_q"] == "What do I need to do for Jesse Garcia?"

        tasks = _ask(client, m, handover["cta_q"], jesse)
        assert tasks["intent"] == "mgr:tasks"
        block = _block(tasks, "mgr_tasks")
        assert {t["key"] for t in block["tasks"] if t["status"] == "todo"} == {"mentor"}
        assert next(o for o in block["others"] if o["team"] == "HR")["value"].startswith("Pending")


def test_manager_is_told_what_is_not_their_job():
    with TestClient(app) as client:
        m = _h(client, "CHEN")
        r = _ask(client, m, "Show Jesse Garcia's documents")
        assert "HR" in r["text"] and "don't need to chase" in r["text"]
        att = _block(_ask(client, m, "How's Sarah Jane's onboarding?"), "mgr_tasks")["attention"]
        assert att["level"] == "none" and "IT" in att["reason"]
        w = _ask(client, m, "What am I waiting for?")
        assert w["intent"] == "mgr:waiting" and "you don't need to chase" in w["text"]


def test_manager_confirms_mentor_books_day1_and_assigns_project():
    with TestClient(app) as client:
        m, hr = _h(client, "CHEN"), _h(client, "HR")
        dani, alex, sarah = _id("Danielle Johnson"), _id("Alexander Le"), _id("Sarah Jane")

        card = _block(_ask(client, m, "Schedule Danielle Johnson's Day-1 orientation"), "mgr_action")
        assert card["action"] == "day1" and card["time"] == "10:00"
        assert not cases.manager_prep(store_facts(dani))  # nothing recorded before confirming
        res = client.post(f"/api/nia/manager/{dani}/day1", json={"day": card["date"], "time": "09:30"}, headers=m)
        assert res.status_code == 200, res.text
        assert next(t for t in res.json()["tasks"] if t["key"] == "day1")["status"] == "booked"
        assert "Your Day-1 orientation is booked" in _inbox_titles(dani)
        hr_plan = _block(_ask(client, hr, "Show Danielle Johnson's onboarding plan"), "case_plan")
        day1_item = next(i for g in hr_plan["groups"] for i in g["items"] if i["key"] == "day1")
        assert "09:30" in day1_item["detail"]
        assert client.post(f"/api/nia/manager/{dani}/day1", json={"day": "2020-01-01", "time": "09:30"},
                           headers=m).status_code == 400

        card = _block(_ask(client, m, "Confirm Sarah Jane's mentor"), "mgr_action")
        assert card["action"] == "mentor" and card["value"]
        assert client.post(f"/api/nia/manager/{sarah}/mentor", json={"mentor": "Priya Nair"}, headers=m).status_code == 200
        assert cases.mentor(store_facts(sarah)) == "Priya Nair"
        assert "Meet your mentor" in _inbox_titles(sarah)

        queue = [j["id"] for j in client.get("/api/employer/workspace", headers=m).json()["action_queue"]]
        assert alex in queue
        card = _block(_ask(client, m, "Assign a first project to Alexander Le"), "mgr_action")
        assert card["action"] == "project" and card["options"] and card["jira"].startswith("ONB-")
        res = client.post(f"/api/nia/manager/{alex}/project", json={"project": "Starter bugs on the team backlog"}, headers=m)
        assert res.status_code == 200, res.text
        queue = [j["id"] for j in client.get("/api/employer/workspace", headers=m).json()["action_queue"]]
        assert alex not in queue
        assert not [r for r in cases.due_reminders(store_facts(alex)) if r["topic"] == "mgr_project"]
        hr_status = _block(_ask(client, hr, "How's Alexander Le's onboarding?"), "case_status")
        assert any("first project" in e["text"] for e in hr_status["followups"])


def test_manager_drafts_are_in_the_managers_voice():
    with TestClient(app) as client:
        m = _h(client, "CHEN")
        dani = _id("Danielle Johnson")
        d = _block(_ask(client, m, "Draft a welcome note for Danielle Johnson"), "draft")
        assert d["endpoint"] == "/api/nia/manager/comms/send" and d["kind"] == "mgr_welcome"
        assert "Ava Chen" in d["body"] and "People Ops" not in d["body"]
        assert "your manager" in d["body"]
        res = client.post("/api/nia/manager/comms/send", headers=m,
                          json={"joiner_id": dani, "kind": d["kind"], "subject": d["subject"], "body": d["body"]})
        assert res.status_code == 200, res.text
        assert d["subject"] in _inbox_titles(dani)
        assert _ask(client, m, "Draft a first-week check-in for Danielle Johnson")["blocks"][0]["kind"] == "mgr_first_week"


def test_manager_actions_are_limited_to_the_managers_own_team():
    with TestClient(app) as client:
        alex = _id("Alexander Le")
        body = {"project": "Starter bugs"}
        assert client.post(f"/api/nia/manager/{alex}/project", json=body, headers=_h(client, "HR")).status_code == 403
        assert client.post(f"/api/nia/manager/{alex}/project", json=body, headers=_h(client, "IT")).status_code == 403
        assert client.post(f"/api/nia/manager/{alex}/project", json=body, headers=_h(client, "PARK")).status_code == 404
        assert client.post(f"/api/nia/manager/{alex}/mentor", json={}, headers=_h(client, "CHEN")).status_code == 400


def store_facts(joiner_id: str):
    from backend.role_context import joiner_facts

    return joiner_facts(store.get_joiner(joiner_id), store)
