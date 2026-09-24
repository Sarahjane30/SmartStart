"""Waters // How it all connects — public company story, ending with the joiner's own place in it."""

from __future__ import annotations

from fastapi.testclient import TestClient

from backend.database import store
from backend.ira_demo import find_ira_demo_id
from backend.main import app


def test_story_is_public_and_ends_with_you() -> None:
    with TestClient(app) as client:
        sid = find_ira_demo_id()
        body = client.get(f"/api/employee/{sid}/waters").json()

        ids = [c["id"] for c in body["components"]]
        assert ids == ["science", "impact", "technology", "world", "people", "you"]
        assert body["company"]["colleagues"] == "~16,000"
        assert all(s["url"].startswith("https://") for s in body["sources"])

        tech = body["components"][2]
        assert [c["steps"] for c in tech["chambers"]] == [
            ["Separate", "Analyze", "Understand"],
            ["Identify", "Measure", "Understand"],
        ]
        assert all(c["simple"] and c["deeper"] for c in tech["chambers"])

        world = body["components"][3]
        home = [s for s in world["sites"] if s["home"]]
        assert [s["name"] for s in home] == ["Bengaluru"]

        you = body["components"][5]
        assert you["name"] == "Sarah Jane"
        assert you["role_title"] == "Data Engineering Intern"
        assert [c["level"] for c in you["chain"]] == [
            "Company", "Business area", "Department", "Your team", "Your role", "You",
        ]
        assert you["chain"][0]["name"] == "Waters" and you["chain"][-1]["name"] == "Sarah Jane"
        assert "Ava Chen" in you["chain"][3]["name"]
        people = body["components"][4]
        assert [n["id"] for n in people["nodes"] if n["yours"]] == ["data"]

        labels = [a["label"] for a in body["ira"]["actions"]]
        assert labels == ["Meet my team", "Understand my role", "Explore my tools", "Ask IRA anything"]


def test_chain_follows_each_joiners_record() -> None:
    with TestClient(app) as client:
        other = next(j for j in store.list_joiners() if j.department == "Human Resources")
        you = client.get(f"/api/employee/{other.id}/waters").json()["components"][5]
        assert you["name"] == other.name
        assert you["department"] == "Human Resources"
        assert you["chain"][1]["name"] == "People & Culture"
        assert other.manager_name in you["chain"][3]["name"]
        assert client.get("/api/employee/NOPE/waters").status_code == 404


def test_ira_knows_what_waters_is() -> None:
    with TestClient(app) as client:
        sid = find_ira_demo_id()
        turns = client.get(f"/api/chatbot/{sid}", params={"q": "What is Waters?"}).json()["turns"]
        reply = [t for t in turns if t["role"] == "assistant"][-1]["text"]
        assert "life sciences and diagnostics" in reply
        assert "hackathon" not in reply


def test_understand_my_role_uses_the_same_chain() -> None:
    with TestClient(app) as client:
        sid = find_ira_demo_id()
        turns = client.get(f"/api/chatbot/{sid}", params={"q": "What does my role do?"}).json()["turns"]
        reply = [t for t in turns if t["role"] == "assistant"][-1]["text"]
        assert "Data Engineering Intern on the Data Platform team" in reply
        assert "Ava Chen" in reply and "Priya Nair" in reply
