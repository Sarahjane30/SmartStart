"""Resolving a bottleneck removes it from alerts / queues / NIA; "still needs help" brings it back."""

from __future__ import annotations

from fastapi.testclient import TestClient

from backend import resolutions
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


def _alert_joiners(client: TestClient, h: dict) -> set[str]:
    alerts = client.get("/api/alerts", headers=h).json()["alerts"]
    ids = {a["joiner_id"] for a in alerts if a.get("joiner_id")}
    for a in alerts:
        ids.update(a.get("joiner_ids") or [])
    return ids


def test_resolve_removes_from_alerts_queue_and_nia_then_reopen_restores():
    resolutions.clear()
    with TestClient(app) as client:
        h = _headers(client, "IT")
        ws = client.get("/api/employer/workspace", headers=h).json()
        top = ws["action_queue"][0]
        jid = top["id"]
        assert jid in _alert_joiners(client, h)

        res = client.post(f"/api/employer/joiners/{jid}/resolve", json={}, headers=h)
        assert res.status_code == 200
        assert res.json()["resolution"]["queue"] == "IT"

        ws2 = client.get("/api/employer/workspace", headers=h).json()
        assert jid not in [s["id"] for s in ws2["action_queue"]]
        assert any(r["joiner_id"] == jid for r in ws2["resolved"])
        assert jid not in _alert_joiners(client, h)
        row = next(r for r in client.get("/api/dashboard", headers=h).json()["rows"] if r["id"] == jid)
        assert row["resolved"] is True

        nia = client.post("/api/nia/ask", json={"message": "What should I fix first?"}, headers=h).json()
        assert nia["focus_joiner_id"] != jid
        sla = client.post("/api/nia/ask", json={"message": "Show SLA breaches"}, headers=h).json()
        assert jid not in str(sla["blocks"])

        prep = client.post(
            "/api/nia/ask", json={"message": "They still need help", "focus_joiner_id": jid}, headers=h
        ).json()
        assert prep["intent"] == "reopen"
        assert prep["blocks"][0]["action"] == "reopen"
        # Preparing is not doing: still resolved until the user confirms.
        assert any(r["joiner_id"] == jid for r in client.get("/api/employer/workspace", headers=h).json()["resolved"])

        assert client.post(f"/api/employer/joiners/{jid}/reopen", json={}, headers=h).status_code == 200
        ws3 = client.get("/api/employer/workspace", headers=h).json()
        again = next(s for s in ws3["action_queue"] if s["id"] == jid)
        assert again["reopened"]["by"] == "Riley Chen"
        assert jid in _alert_joiners(client, h)
    resolutions.clear()


def test_resolution_is_per_owner_queue():
    """IT resolving a laptop issue must not hide HR's document work on the same joiner."""
    resolutions.clear()
    with TestClient(app) as client:
        hr, it = _headers(client, "HR"), _headers(client, "IT")
        hr_ids = {s["id"] for s in client.get("/api/employer/workspace", headers=hr).json()["action_queue"]}
        it_ws = client.get("/api/employer/workspace", headers=it).json()
        shared = next(s["id"] for s in it_ws["action_queue"] if s["id"] in hr_ids)
        client.post(f"/api/employer/joiners/{shared}/resolve", json={}, headers=it)
        assert shared in {s["id"] for s in client.get("/api/employer/workspace", headers=hr).json()["action_queue"]}
        assert shared not in {s["id"] for s in client.get("/api/employer/workspace", headers=it).json()["action_queue"]}
    resolutions.clear()


def test_resolve_is_scoped_and_validated():
    resolutions.clear()
    with TestClient(app) as client:
        ops = client.get("/api/employer/workspace", headers=_headers(client, "OPS")).json()
        mgr = _headers(client, "MANAGER")
        mine = {j["id"] for j in client.get("/api/employer/workspace", headers=mgr).json()["joiners"]}
        outsider = next(j["id"] for j in ops["joiners"] if j["id"] not in mine)
        assert client.post(f"/api/employer/joiners/{outsider}/resolve", json={}, headers=mgr).status_code == 404
        done = next(j["id"] for j in ops["joiners"] if not j["bottleneck"])
        assert client.post(f"/api/employer/joiners/{done}/resolve", json={}, headers=_headers(client, "OPS")).status_code == 400
        assert client.post(f"/api/employer/joiners/{next(iter(mine))}/reopen", json={}, headers=mgr).status_code == 404
        assert client.post(f"/api/employer/joiners/{outsider}/resolve", json={}).status_code == 401
    resolutions.clear()
