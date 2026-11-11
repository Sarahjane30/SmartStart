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
        assert [b["division"] for b in tech["beyond"]] == ["Biosciences", "Advanced Diagnostics", "Materials Sciences"]

        divs = body["company"]["divisions"]
        assert [d["name"] for d in divs] == ["Analytical Sciences", "Biosciences", "Advanced Diagnostics", "Materials Sciences"]
        assert all(d["how"] and d["example"] and len(d["tech"]) >= 4 and d["used"] for d in divs)
        names = {d["name"] for d in divs}
        impact = body["components"][1]
        assert all(set(a["divisions"]) <= names for a in impact["areas"] + impact["more"])

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


def test_technology_universe_is_labelled_and_grounded() -> None:
    with TestClient(app) as client:
        story = client.get(f"/api/employee/{store.list_joiners()[0].id}/waters").json()
        tech = story["components"][2]
        assert tech["index"] == "03"
        uni = tech["universe"]
        names = {d["name"] for d in story["company"]["divisions"]}
        assert [a["division"] for a in uni["areas"]] == [
            "Analytical Sciences",
            "Biosciences",
            "Advanced Diagnostics",
            "Materials Sciences",
        ]
        assert {a["division"] for a in uni["areas"]} <= names
        assert len({a["visual"] for a in uni["areas"]}) == 4
        assert uni["title"] == "Explore the science"
        assert [a["subtitle"] for a in uni["areas"]] == [
            "Separation, detection and analysis",
            "Cells, molecular biology and flow cytometry",
            "Infection testing and diagnostics",
            "Characterising materials and their properties",
        ]
        assert uni["areas"][1]["tagline"] == "Understanding the complexity of life, one cell at a time."
        assert all(a["tagline"] for a in uni["areas"])
        assert set(uni["legend"]) == {"simulation", "labels", "products"}
        analytical = uni["areas"][0]
        assert analytical["experience"] == "available"
        assert {(j["track"], j["kind"]) for j in analytical["journeys"]} == {
            ("observe", "lc"),
            ("observe", "ms"),
            ("ride", "lc"),
            ("ride", "ms"),
        }
        for area in uni["areas"][1:]:
            assert area["experience"] == "in-progress" and area["coming"]
        assert "Biosciences" in uni["areas"][2]["note"]
        for d in story["company"]["divisions"]:
            assert d["label_status"] == "pending"
            for t in d["tech"]:
                assert t["status"] == "pending"
                assert t["source"].startswith("https://")
