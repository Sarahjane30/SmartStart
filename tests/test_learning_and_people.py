from fastapi.testclient import TestClient

from backend.learning_content import CONTENT
from backend.main import app
from ira.email_draft import directory_reply, draft_email, is_draft_request
from ira.policy_kb import load_policies


def _first_joiner(client):
    return client.get("/api/ira/employees").json()["employees"][0]["id"]


def test_every_module_has_material_and_valid_links():
    slugs = {d.slug for d in load_policies()}
    for suffix, c in CONTENT.items():
        assert c["lessons"] and c["takeaways"], suffix
        check = c["check"]
        assert 0 <= check["answer_index"] < len(check["options"]), suffix
        for r in c["resources"]:
            if r["kind"] == "policy":
                assert r["target"] in slugs, (suffix, r)
            elif r["kind"] == "portal":
                assert r["target"] in {"icims", "servicenow", "jira"}, (suffix, r)
            elif r["kind"] == "person":
                assert r["target"] in {"mentor", "manager", "hr", "it"}, (suffix, r)


def test_module_detail_and_completion_flow():
    with TestClient(app) as client:
        jid = _first_joiner(client)
        track = client.get(f"/api/learningtrack/{jid}").json()
        open_mod = next(m for m in track["modules"] if m["status"] in {"in_progress", "available"})
        detail = client.get(f"/api/learningtrack/{jid}/modules/{open_mod['id']}").json()
        assert detail["module"]["id"] == open_mod["id"]
        assert detail["lessons"] and detail["resources"] and detail["check"]

        updated = client.post(f"/api/learningtrack/{jid}/modules/{open_mod['id']}/complete").json()
        done = next(m for m in updated["modules"] if m["id"] == open_mod["id"])
        assert done["status"] == "complete"
        assert updated["completed_count"] == track["completed_count"] + 1

        locked = next((m for m in updated["modules"] if m["status"] == "locked"), None)
        if locked:
            assert client.post(f"/api/learningtrack/{jid}/modules/{locked['id']}/complete").status_code == 409
            hint = client.get(f"/api/learningtrack/{jid}/modules/{locked['id']}").json()["unlock_hint"]
            assert "Unlocks after" in hint

        assert client.get(f"/api/learningtrack/{jid}/modules/nope").status_code == 404


def test_policy_reader_endpoints():
    with TestClient(app) as client:
        index = client.get("/api/policies").json()["policies"]
        assert len(index) == len(load_policies())
        doc = client.get(f"/api/policies/{index[0]['slug']}").json()
        assert doc["sections"] and doc["owner"]
        assert client.get("/api/policies/does-not-exist").status_code == 404


def test_people_and_team_have_emails():
    with TestClient(app) as client:
        jid = _first_joiner(client)
        ws = client.get(f"/api/employee/{jid}/workspace").json()
        assert all("@" in c["email"] for c in ws["consult"])
        hr = next(c for c in ws["consult"] if c["id"].endswith("-C-hr"))
        assert hr["portal"] == "icims"
        others = [m for m in ws["members"] if not m["is_self"]]
        assert others and all("@" in m["email"] for m in others)


def test_web_chatbot_drafts_email_to_directory_person():
    with TestClient(app) as client:
        jid = _first_joiner(client)
        ws = client.get(f"/api/employee/{jid}/workspace").json()
        mentor = next(c for c in ws["consult"] if c["id"].endswith("-C-mentor"))
        body = client.get(
            f"/api/chatbot/{jid}",
            params={"q": "Help me write an email to my mentor about reviewing my practice PR"},
        ).json()
        draft = body["draft"]
        assert draft["to_email"] == mentor["email"]
        assert draft["subject"].startswith("Review request")
        assert mentor["name"].split()[0] in draft["body"]
        assert mentor["email"] in body["turns"][-1]["text"]

        unknown = client.get(f"/api/chatbot/{jid}", params={"q": "Draft an email to Zebulon"}).json()
        assert unknown["draft"] is None
        assert "Who should I write to" in unknown["turns"][-1]["text"]


def test_draft_and_directory_intents():
    ctx = {
        "employee": {"name": "Ada Lovelace", "department": "Finance", "role_type": "FTE",
                     "email": "ada@synthetic.smartstart.example"},
        "people": [
            {"name": "Priya Singh", "email": "priya.singh@x.example", "title": "Finance Controller",
             "ask_about": "Approvals", "roles": ["manager"]},
            {"name": "Sam Ortiz", "email": "sam.ortiz@x.example", "title": "IT provisioning",
             "ask_about": "Laptops", "roles": ["it"]},
        ],
    }
    assert is_draft_request("Draft an email to Priya")
    assert is_draft_request("email Sam about my laptop")
    assert not is_draft_request("email id of my manager")
    assert not is_draft_request("How do I claim expenses?")
    assert draft_email("Write a mail to the IT team about VPN access", ctx)["to_email"] == "sam.ortiz@x.example"
    assert draft_email("Draft an email to my manager about leave", ctx)["subject"].startswith("Leave request")
    assert "priya.singh@x.example" in directory_reply("email id of my manager", ctx)
    assert "sam.ortiz@x.example" in directory_reply("Who is on my team?", ctx)
    assert "ada@" in directory_reply("what's my email", ctx)
    assert directory_reply("How do I claim expenses?", ctx) is None
