"""Layer 2 Employer Command Center API tests."""

from __future__ import annotations

from fastapi.testclient import TestClient

from backend.main import app


def _login(client: TestClient, username: str = "ops.admin", password: str = "ops-demo-2026") -> dict:
    res = client.post("/api/auth/login", json={"username": username, "password": password})
    assert res.status_code == 200, res.text
    token = res.json()["token"]
    return {"Authorization": f"Bearer {token}", "X-SmartStart-Token": token}


def test_employer_auth_gate_and_demo_accounts():
    with TestClient(app) as client:
        denied = client.get("/api/dashboard")
        assert denied.status_code == 401

        accounts = client.get("/api/auth/demo-accounts")
        assert accounts.status_code == 200
        body = accounts.json()
        assert body["synthetic"] is True
        usernames = {a["username"] for a in body["accounts"]}
        assert {"hr.jordan", "it.riley", "mgr.chen", "mgr.park", "mgr.singh", "mgr.cole", "ops.admin"} <= usernames

        bad = client.post("/api/auth/login", json={"username": "hr.jordan", "password": "wrong"})
        assert bad.status_code == 401

        headers = _login(client, "hr.jordan", "hr-demo-2026")
        me = client.get("/api/auth/me", headers=headers)
        assert me.status_code == 200
        assert me.json()["persona"] == "HR"


def test_layer2_dashboard_alerts_analytics_integrations():
    with TestClient(app) as client:
        headers = _login(client)
        dash = client.get("/api/dashboard", headers=headers)
        assert dash.status_code == 200
        body = dash.json()
        assert body["synthetic"] is True
        assert body["total_joiners"] == 30
        assert len(body["rows"]) == 30
        row = body["rows"][0]
        for key in (
            "id",
            "name",
            "email",
            "current_state",
            "days_in_pipeline",
            "docs_status",
            "hardware_status",
            "it_sla_breached",
            "manager_id",
            "manager_name",
            "synthetic",
        ):
            assert key in row
        assert row["email"].endswith("@synthetic.smartstart.example")
        assert row["id"].startswith("SYN-J-")
        assert row["manager_id"].startswith("MGR-")

        alerts = client.get("/api/alerts", headers=headers)
        assert alerts.status_code == 200
        alert_body = alerts.json()
        assert alert_body["synthetic"] is True
        assert alert_body["total"] >= 1
        assert all(a["synthetic"] for a in alert_body["alerts"])

        analytics = client.get("/api/analytics", headers=headers)
        assert analytics.status_code == 200
        a = analytics.json()
        assert a["synthetic"] is True
        assert a["avg_onboarding_days"] > 0
        assert a["bottleneck_counts"]
        assert len(a["onboarding_trend"]) >= 1
        assert a["cohort_size"] == 30
        assert a["role_view"] == "All"

        integrations = client.get("/api/integrations", headers=headers)
        assert integrations.status_code == 200
        integ = integrations.json()
        assert integ["synthetic"] is True
        systems = {i["system"] for i in integ["integrations"]}
        assert systems == {"iCIMS", "ServiceNow", "Jira"}


def test_hiring_managers_split_cohort():
    with TestClient(app) as client:
        joiners = client.get("/api/joiners").json()
        manager_ids = {j["manager_id"] for j in joiners}
        assert manager_ids == {"MGR-CHEN", "MGR-PARK", "MGR-SINGH", "MGR-COLE"}
        # No single manager owns the whole cohort
        counts = {mid: sum(1 for j in joiners if j["manager_id"] == mid) for mid in manager_ids}
        assert all(c >= 1 for c in counts.values())
        assert max(counts.values()) < 30

        # Each manager login only sees their team
        for username, password, mid in (
            ("mgr.chen", "mgr-chen-2026", "MGR-CHEN"),
            ("mgr.park", "mgr-park-2026", "MGR-PARK"),
            ("mgr.singh", "mgr-singh-2026", "MGR-SINGH"),
            ("mgr.cole", "mgr-cole-2026", "MGR-COLE"),
        ):
            headers = _login(client, username, password)
            dash = client.get("/api/dashboard", headers=headers).json()
            assert dash["total_joiners"] == counts[mid]
            assert all(r["manager_id"] == mid for r in dash["rows"])
            analytics = client.get("/api/analytics", headers=headers).json()
            assert analytics["cohort_size"] == counts[mid]


def test_layer2_role_filters_and_frontend():
    with TestClient(app) as client:
        headers = _login(client)
        all_dash = client.get("/api/dashboard", params={"role_view": "All"}, headers=headers)
        assert all_dash.status_code == 200
        assert all_dash.json()["total_joiners"] == 30

        sizes = {}
        for role in ("All", "HR", "IT", "Manager"):
            r = client.get("/api/dashboard", params={"role_view": role}, headers=headers)
            assert r.status_code == 200
            sizes[role] = r.json()["total_joiners"]
            assert sizes[role] >= 1

            a = client.get("/api/alerts", params={"role_view": role}, headers=headers)
            assert a.status_code == 200
            assert a.json()["synthetic"] is True

            an = client.get("/api/analytics", params={"role_view": role}, headers=headers)
            assert an.status_code == 200
            body = an.json()
            assert body["role_view"] == role
            assert body["cohort_size"] == sizes[role]
            assert body["focus_note"]

        # Persona lenses must actually change the cohort — not cosmetic
        assert sizes["Manager"] < sizes["All"]
        assert sizes["IT"] < sizes["All"]
        assert sizes["HR"] < sizes["All"]
        mgr = client.get("/api/analytics", params={"role_view": "Manager"}, headers=headers).json()
        hr = client.get("/api/analytics", params={"role_view": "HR"}, headers=headers).json()
        assert mgr["avg_onboarding_days"] != hr["avg_onboarding_days"] or mgr["bottleneck_counts"] != hr["bottleneck_counts"]
        assert "manager" in mgr["focus_note"].lower() or "Manager" in mgr["focus_note"]

        portal = client.get("/")
        assert portal.status_code == 200
        assert "Sign in to Command Center" in portal.text
        assert "Open Workspace" in portal.text
        assert "Choose your view" in portal.text
        assert "employer-step" in portal.text

        home = client.get("/employer")
        assert home.status_code == 200
        assert "Employer Command Center" in home.text
        assert "joiner-drawer" in home.text
        assert "analytics-focus" in home.text
        assert 'data-role="HR"' in home.text
        assert "signed-in-user" in home.text

        css = client.get("/static/style.css")
        assert css.status_code == 200
        assert ".app-shell" in css.text
        assert ".bn-tag" in css.text
        assert ".demo-creds-table" in css.text

        js = client.get("/static/app.js")
        assert js.status_code == 200
        assert "/api/analytics?role_view=" in js.text
        assert "requireEmployerSession" in js.text
        assert "employerAuthHeaders" in js.text
        assert "pipelineProgress" in js.text

        session_js = client.get("/static/session.js")
        assert session_js.status_code == 200
        assert "requireEmployeeSession" in session_js.text
        assert "requireEmployerSession" in session_js.text
        assert "employerAuthHeaders" in session_js.text

        portal_js = client.get("/static/portal.js")
        assert portal_js.status_code == 200
        assert "/api/auth/login" in portal_js.text


def test_portal_visual_layer_is_served():
    """Split-screen portal ships an animated canvas + shared motion helpers."""
    with TestClient(app) as client:
        portal = client.get("/")
        assert portal.status_code == 200
        assert "portal-canvas" in portal.text
        assert "pane-visual" in portal.text
        assert "graphics.js" in portal.text
        assert "motion.js" in portal.text

        graphics = client.get("/static/graphics.js")
        assert graphics.status_code == 200
        assert "portal-canvas" in graphics.text
        assert "prefers-reduced-motion" in graphics.text

        motion = client.get("/static/motion.js")
        assert motion.status_code == 200
        for helper in ("countUpAll", "revealAll", "attachRipple", "attachTilt"):
            assert helper in motion.text

        css = client.get("/static/style.css").text
        assert "--blue-600" in css
        assert "@keyframes shimmer" in css
        assert "prefers-reduced-motion" in css

        home = client.get("/employer")
        assert "motion.js" in home.text
