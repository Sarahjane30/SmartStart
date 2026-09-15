"""Layer 2 Employer Command Center API tests."""

from __future__ import annotations

from fastapi.testclient import TestClient

from backend.main import app


def test_layer2_dashboard_alerts_analytics_integrations():
    with TestClient(app) as client:
        dash = client.get("/api/dashboard")
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
            "synthetic",
        ):
            assert key in row
        assert row["email"].endswith("@synthetic.smartstart.example")
        assert row["id"].startswith("SYN-J-")

        alerts = client.get("/api/alerts")
        assert alerts.status_code == 200
        alert_body = alerts.json()
        assert alert_body["synthetic"] is True
        assert alert_body["total"] >= 1
        assert all(a["synthetic"] for a in alert_body["alerts"])

        analytics = client.get("/api/analytics")
        assert analytics.status_code == 200
        a = analytics.json()
        assert a["synthetic"] is True
        assert a["avg_onboarding_days"] > 0
        assert a["bottleneck_counts"]
        assert len(a["onboarding_trend"]) == 6

        integrations = client.get("/api/integrations")
        assert integrations.status_code == 200
        integ = integrations.json()
        assert integ["synthetic"] is True
        systems = {i["system"] for i in integ["integrations"]}
        assert systems == {"iCIMS", "ServiceNow", "Jira"}


def test_layer2_role_filters_and_frontend():
    with TestClient(app) as client:
        for role in ("All", "HR", "IT", "Manager"):
            r = client.get("/api/dashboard", params={"role_view": role})
            assert r.status_code == 200
            assert r.json()["total_joiners"] == 30

            a = client.get("/api/alerts", params={"role_view": role})
            assert a.status_code == 200
            assert a.json()["synthetic"] is True

        home = client.get("/")
        assert home.status_code == 200
        assert "Employer Command Center" in home.text

        css = client.get("/static/style.css")
        assert css.status_code == 200
        assert ".app-shell" in css.text

        js = client.get("/static/app.js")
        assert js.status_code == 200
        assert "/api/dashboard" in js.text
