"""Layer 4 prototype AI feature tests."""

from __future__ import annotations

from fastapi.testclient import TestClient

from backend.main import app


def test_layer4_chatbot_predict_recommendations():
    with TestClient(app) as client:
        joiners = client.get("/api/joiners").json()
        intern = next(
            j
            for j in joiners
            if j["role_type"] == "INTERN" and j.get("department_track") == "Technical"
        )
        fte = next(j for j in joiners if j["role_type"] == "FTE")

        chat = client.get(f"/api/chatbot/{intern['id']}")
        assert chat.status_code == 200
        body = chat.json()
        assert body["synthetic"] is True
        assert body["role_type"] == "INTERN"
        assert len(body["faqs"]) >= 8
        assert any("document" in f["question"].lower() for f in body["faqs"])
        assert any("Git" in f["question"] for f in body["faqs"])

        asked = client.get(
            f"/api/chatbot/{intern['id']}",
            params={"q": "How do I submit documents?"},
        )
        assert asked.status_code == 200
        turns = asked.json()["turns"]
        assert turns[-1]["role"] == "assistant"
        assert "packet" in turns[-1]["text"].lower() or "portal" in turns[-1]["text"].lower()
        greeting = body["turns"][0]["text"]
        assert "IRA" in greeting
        assert intern["name"].split()[0] in greeting

        pred = client.get(f"/api/predict/{intern['id']}")
        assert pred.status_code == 200
        p = pred.json()
        assert p["synthetic"] is True
        assert 0 <= p["overall_risk_score"] <= 100
        assert p["overall_risk_level"] in {"low", "medium", "high", "critical"}
        assert len(p["alerts"]) >= 1
        assert all(a["synthetic"] for a in p["alerts"])

        # Seed-stable
        assert client.get(f"/api/predict/{intern['id']}").json() == p

        rec = client.get(f"/api/recommendations/{intern['id']}")
        assert rec.status_code == 200
        r = rec.json()
        assert r["synthetic"] is True
        assert r["role_type"] == "INTERN"
        assert "mentor" in r["focus"].lower() or "Git" in r["focus"]
        titles = [x["title"] for x in r["recommendations"]]
        assert any("Git" in t or "mentor" in t.lower() for t in titles)

        fte_rec = client.get(f"/api/recommendations/{fte['id']}").json()
        assert fte_rec["role_type"] == "FTE"
        fte_titles = [x["title"] for x in fte_rec["recommendations"]]
        assert any(
            "readiness" in t.lower() or "department" in t.lower() for t in fte_titles
        )

        assert client.get("/api/chatbot/SYN-J-MISSING").status_code == 404
        assert client.get("/api/predict/SYN-J-MISSING").status_code == 404
        assert client.get("/api/recommendations/SYN-J-MISSING").status_code == 404


def test_layer4_frontend_and_health():
    with TestClient(app) as client:
        health = client.get("/health").json()
        assert health["layer"] == "4"

        page = client.get("/ai")
        assert page.status_code == 200
        assert "AI Features" in page.text
        assert "IRA" in page.text
        assert "Predictive" in page.text or "predict" in page.text.lower()
        assert "recommend" in page.text.lower()

        js = client.get("/static/ai.js")
        assert js.status_code == 200
        assert "/api/chatbot/" in js.text
        assert "/api/predict/" in js.text
        assert "/api/recommendations/" in js.text

        css = client.get("/static/style.css")
        assert css.status_code == 200
        assert ".chat-log" in css.text or ".bubble" in css.text

        home = client.get("/employer")
        assert "/ai" in home.text
        emp = client.get("/employee")
        assert "Employer Command Center" not in emp.text
        assert "session.js" in emp.text
        portal = client.get("/")
        assert "pick-employer" in portal.text
        assert "pick-employee" in portal.text
        assert "Open Command Center" in portal.text
        assert "Open Workspace" in portal.text
