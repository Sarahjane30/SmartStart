"""Role-aware Command Center: HR / IT / Manager / Ops workspaces over one shared cohort."""

from __future__ import annotations

from fastapi.testclient import TestClient

from backend.main import app

ACCOUNTS = {
    "HR": ("hr.jordan", "hr-demo-2026"),
    "IT": ("it.riley", "it-demo-2026"),
    "MANAGER": ("mgr.chen", "mgr-chen-2026"),
    "OPS": ("ops.admin", "ops-demo-2026"),
}


def _headers(client: TestClient, role: str) -> dict:
    username, password = ACCOUNTS[role]
    token = client.post("/api/auth/login", json={"username": username, "password": password}).json()["token"]
    return {"Authorization": f"Bearer {token}"}


def _nav(ws: dict) -> list[str]:
    return [n["label"] for n in ws["nav"]]


def _cards(ws: dict) -> list[str]:
    return [c["label"] for c in ws["cards"]]


def test_hr_workspace_is_hr_focused_without_switcher():
    with TestClient(app) as client:
        h = _headers(client, "HR")
        ws = client.get("/api/employer/workspace", headers=h).json()
        assert ws["role"] == "HR"
        assert ws["can_switch_queues"] is False
        assert _nav(ws) == ["Dashboard", "My Actions", "Joiners", "Alerts", "Analytics"]
        assert _cards(ws) == ["Joiners in view", "Documents pending", "Document rework", "HR actions", "At risk"]
        assert ws["question"] == "What does HR need to act on right now?"
        assert ws["action_queue"], "HR should have document work in the seed-42 cohort"
        assert all(j["queue"] == "HR" for j in ws["action_queue"])
        assert len(ws["joiners"]) == 30

        # Backend refuses other queue lenses — not just hidden in the UI.
        assert client.get("/api/dashboard", params={"role_view": "IT"}, headers=h).status_code == 403
        assert client.get("/api/alerts", params={"role_view": "Manager"}, headers=h).status_code == 403
        assert client.get("/api/dashboard", params={"role_view": "HR"}, headers=h).status_code == 200

        alerts = client.get("/api/alerts", headers=h).json()["alerts"]
        assert alerts
        assert not any(a["id"].startswith("ALT-MGR-") for a in alerts)
        it_alert = next(a for a in alerts if a["id"].startswith("ALT-IT-"))
        assert "may affect onboarding readiness" in it_alert["message"]
        assert it_alert["action_required"] is False

        insights = client.get("/api/analytics", headers=h).json()["role_insights"]
        assert insights["role"] == "HR"
        assert {k["label"] for k in insights["kpis"]} >= {"Docs pending", "Document rework", "HR bottlenecks"}


def test_it_workspace_is_it_focused():
    with TestClient(app) as client:
        h = _headers(client, "IT")
        ws = client.get("/api/employer/workspace", headers=h).json()
        assert ws["role"] == "IT"
        assert ws["can_switch_queues"] is False
        assert _nav(ws) == ["Dashboard", "IT Requests", "Joiners", "Alerts", "Analytics"]
        assert _cards(ws) == ["Joiners in view", "Pending hardware", "SLA breaches", "Access requests", "IT risks"]
        assert all(j["hardware_status"] != "Delivered" for j in ws["action_queue"])
        labels = {a["label"] for j in ws["action_queue"] for a in j["actions"]}
        assert "Grant VPN + app access" in labels
        assert any(label.startswith("Escalate laptop ticket") for label in labels)

        assert client.get("/api/dashboard", params={"role_view": "HR"}, headers=h).status_code == 403

        alerts = client.get("/api/alerts", headers=h).json()["alerts"]
        assert alerts and all(a["category"] in {"IT", "Ops"} for a in alerts)
        sla = next(a for a in alerts if a["id"].startswith("ALT-IT-"))
        assert "breached SLA" in sla["message"] and "Action required" in sla["message"]

        insights = client.get("/api/analytics", headers=h).json()["role_insights"]
        assert {k["label"] for k in insights["kpis"]} >= {"Hardware delays", "SLA breaches", "Access requests", "Avg provisioning time"}


def test_manager_sees_only_their_joiners():
    with TestClient(app) as client:
        h = _headers(client, "MANAGER")
        roster = client.get("/api/joiners").json()
        mine = {j["id"] for j in roster if j["manager_id"] == "MGR-CHEN"}
        others = [j["id"] for j in roster if j["manager_id"] != "MGR-CHEN"]

        ws = client.get("/api/employer/workspace", headers=h).json()
        assert ws["role"] == "MANAGER"
        assert ws["can_switch_queues"] is False
        assert _nav(ws) == ["Dashboard", "My Joiners", "My Actions", "Alerts"]
        assert _cards(ws) == ["My Joiners", "On Track", "Need My Action", "Project Assignment Pending", "Project Ready"]
        assert set(ws["visible_joiners"]) == mine
        assert set(ws["actionable_joiners"]) <= mine

        dash = client.get("/api/dashboard", headers=h).json()
        assert {r["id"] for r in dash["rows"]} == mine
        assert {j["id"] for j in client.get("/api/joiners", headers=h).json()} == mine

        # Direct URLs outside the team are refused by the backend.
        other = others[0]
        for path in (f"/api/joiners/{other}", f"/api/joiners/{other}/owners", f"/api/joiners/{other}/intelligence"):
            assert client.get(path, headers=h).status_code == 404, path
        own = next(iter(mine))
        assert client.get(f"/api/joiners/{own}", headers=h).status_code == 200

        at_risk = client.get("/api/employer/at-risk", params={"limit": 30}, headers=h).json()
        assert all(r["id"] in mine for r in at_risk["joiners"])

        alerts = client.get("/api/alerts", headers=h).json()["alerts"]
        for a in alerts:
            if a["joiner_id"]:
                assert a["joiner_id"] in mine
            assert set(a["joiner_ids"]) <= mine
        other_names = {j["name"] for j in roster if j["manager_id"] != "MGR-CHEN"}
        mine_names = {j["name"] for j in roster if j["manager_id"] == "MGR-CHEN"}
        for a in alerts:
            for name in other_names - mine_names:
                assert name not in a["message"], (a["id"], name)

        analytics = client.get("/api/analytics", headers=h).json()
        assert analytics["cohort_size"] == len(mine)
        assert analytics["role_insights"]["role"] == "MANAGER"


def test_ops_sees_full_cohort_with_filters():
    with TestClient(app) as client:
        h = _headers(client, "OPS")
        ws = client.get("/api/employer/workspace", headers=h).json()
        assert ws["role"] == "OPS"
        assert ws["can_switch_queues"] is True
        assert ws["permissions"]["queues"] == ["All", "HR", "IT", "Manager"]
        assert _cards(ws) == ["Total Joiners", "On Track", "At Risk", "Blocked", "Active Bottlenecks"]
        cards = {c["id"]: c["value"] for c in ws["cards"]}
        assert cards["in_view"] == 30
        assert cards["on_track"] + cards["at_risk"] + cards["blocked"] == 30
        assert ws["question"] == "Where is onboarding breaking down across the organization?"
        for view in ("All", "HR", "IT", "Manager"):
            assert client.get("/api/dashboard", params={"role_view": view}, headers=h).status_code == 200

        rollup = next(a for a in client.get("/api/alerts", headers=h).json()["alerts"] if a["id"] == "ALT-ROLLUP-IT-SLA")
        assert "potential project-readiness delays" in rollup["message"]
        insights = client.get("/api/analytics", headers=h).json()["role_insights"]
        assert {b["id"] for b in insights["breakdowns"]} >= {"owners", "cross"}


def test_same_joiner_same_state_for_every_role():
    with TestClient(app) as client:
        headers = {role: _headers(client, role) for role in ACCOUNTS}
        mgr_ids = set(client.get("/api/employer/context", headers=headers["MANAGER"]).json()["visible_joiners"])
        sample = sorted(mgr_ids)[:4]
        for jid in sample:
            seen = []
            for role, h in headers.items():
                d = client.get(f"/api/joiners/{jid}", headers=h).json()
                assert d["viewer_role"] == role
                seen.append((
                    d["joiner"]["current_state"],
                    d["bottleneck"],
                    d["documents"]["status"],
                    d["it_ticket"]["hardware_status"],
                    d["it_ticket"]["lead_time_days"],
                    tuple(s["status"] for s in d["journey"]),
                ))
            assert len(set(seen)) == 1, (jid, seen)

        # Same alert event ids, worded per role.
        sla_ids = {
            role: {a["id"]: a for a in client.get("/api/alerts", headers=h).json()["alerts"] if a["id"].startswith("ALT-IT-")}
            for role, h in headers.items()
        }
        shared = set(sla_ids["HR"]) & set(sla_ids["IT"]) & set(sla_ids["OPS"])
        assert shared
        aid = next(iter(shared))
        messages = {sla_ids[r][aid]["message"] for r in ("HR", "IT", "OPS")}
        assert len(messages) == 3
        assert len({sla_ids[r][aid]["severity"] for r in ("HR", "IT", "OPS")}) == 1


def test_context_contract_and_regenerate_is_ops_only():
    with TestClient(app) as client:
        h = _headers(client, "HR")
        ctx = client.get("/api/employer/context", headers=h).json()
        for key in ("user", "role", "visible_joiners", "actionable_joiners", "relevant_bottlenecks", "permissions", "priorities"):
            assert key in ctx
        assert ctx["user"]["display_name"] == "Jordan Hale"
        assert client.post("/api/admin/regenerate", headers=h).status_code == 403
        assert client.get("/api/employer/context").status_code == 401


def test_command_center_frontend_is_role_driven():
    with TestClient(app) as client:
        html = client.get("/employer").text
        for marker in ("role-hero", "section-actions", "section-joiners", "role-insights", "primary-nav", "dash-split"):
            assert marker in html
        js = client.get("/static/app.js").text
        for marker in ("/api/employer/workspace", "journeyStrip", "applyRoleShell", "can_switch_queues", "role_actions"):
            assert marker in js
