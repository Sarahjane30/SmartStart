"""Layer 3 Employee Experience API + frontend tests."""

from __future__ import annotations

from fastapi.testclient import TestClient

from backend.main import app


def test_layer3_employee_learning_notifications_feedback():
    with TestClient(app) as client:
        joiners = client.get("/api/joiners").json()
        intern = next(j for j in joiners if j["role_type"] == "INTERN")
        fte = next(j for j in joiners if j["role_type"] == "FTE")

        # Intern profile + mentor emphasis
        emp = client.get(f"/api/employee/{intern['id']}")
        assert emp.status_code == 200
        profile = emp.json()
        assert profile["synthetic"] is True
        assert profile["id"] == intern["id"]
        assert profile["role_type"] == "INTERN"
        assert profile["mentor_name"]
        assert profile["email"].endswith("@synthetic.smartstart.example")
        assert "next_action" in profile

        track = client.get(f"/api/learningtrack/{intern['id']}")
        assert track.status_code == 200
        intern_track = track.json()
        assert intern_track["synthetic"] is True
        assert intern_track["role_type"] == "INTERN"
        assert intern_track["total_count"] >= 5
        titles = {m["title"] for m in intern_track["modules"]}
        assert "Meet your mentor" in titles
        assert any("Git Basics" in t or "CRM" in t for t in titles)

        notes = client.get(f"/api/notifications/{intern['id']}")
        assert notes.status_code == 200
        note_body = notes.json()
        assert note_body["synthetic"] is True
        assert note_body["unread_count"] >= 0
        assert len(note_body["notifications"]) >= 2
        assert all(n["synthetic"] for n in note_body["notifications"])
        assert any("Git Basics" in n["title"] or "mentor" in n["message"].lower() for n in note_body["notifications"])
        assert all("created_at" in n for n in note_body["notifications"])

        # FTE track emphasizes department + project readiness
        fte_track = client.get(f"/api/learningtrack/{fte['id']}").json()
        assert fte_track["role_type"] == "FTE"
        fte_titles = {m["title"] for m in fte_track["modules"]}
        assert any("readiness" in t.lower() or "Department" in t for t in fte_titles)

        fte_notes = client.get(f"/api/notifications/{fte['id']}").json()
        assert any("Project readiness" in n["title"] for n in fte_notes["notifications"])

        # Feedback POST
        fb = client.post(
            "/api/feedback",
            json={
                "joiner_id": intern["id"],
                "step": "Document packet",
                "rating": 4,
                "comment": "Synthetic forms were clear.",
            },
        )
        assert fb.status_code == 200
        fb_body = fb.json()
        assert fb_body["synthetic"] is True
        assert fb_body["feedback"]["rating"] == 4
        assert fb_body["feedback"]["id"].startswith("SYN-FB-")

        listed = client.get("/api/feedback", params={"joiner_id": intern["id"]})
        assert listed.status_code == 200
        assert listed.json()["total"] >= 1

        # 404s
        assert client.get("/api/employee/SYN-J-MISSING").status_code == 404
        assert client.get("/api/learningtrack/SYN-J-MISSING").status_code == 404
        assert client.get("/api/notifications/SYN-J-MISSING").status_code == 404
        bad = client.post(
            "/api/feedback",
            json={"joiner_id": "SYN-J-MISSING", "step": "x", "rating": 3},
        )
        assert bad.status_code == 404


def test_layer3_seed_stable_and_frontend():
    with TestClient(app) as client:
        a = client.get("/api/employee/SYN-J-0042-023").json()
        b = client.get("/api/employee/SYN-J-0042-023").json()
        assert a == b

        track_a = client.get("/api/learningtrack/SYN-J-0042-023").json()
        track_b = client.get("/api/learningtrack/SYN-J-0042-023").json()
        assert track_a == track_b

        health = client.get("/health").json()
        assert health["layer"] in {"3", "4"}

        page = client.get("/employee")
        assert page.status_code == 200
        assert "Employee Experience" in page.text
        assert "Learning track" in page.text
        assert "Notifications" in page.text
        assert "feedback-form" in page.text

        js = client.get("/static/employee.js")
        assert js.status_code == 200
        assert "/api/employee/" in js.text
        assert "/api/learningtrack/" in js.text
        assert "/api/notifications/" in js.text
        assert "/api/feedback" in js.text

        css = client.get("/static/style.css")
        assert css.status_code == 200
        assert ".progress-bar" in css.text
        assert ".notif-badge" in css.text

        # Feedback clears on regenerate
        client.post(
            "/api/feedback",
            json={"joiner_id": "SYN-J-0042-023", "step": "IT provisioning", "rating": 5},
        )
        before = client.get("/api/feedback", params={"joiner_id": "SYN-J-0042-023"}).json()
        assert before["total"] >= 1
        regen = client.post("/api/admin/regenerate", params={"seed": 42})
        assert regen.status_code == 200
        after = client.get("/api/feedback", params={"joiner_id": "SYN-J-0042-023"}).json()
        assert after["total"] == 0
