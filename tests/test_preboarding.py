"""Pre-boarding: HR publishes the Day-1 pack to the separate portal; joiner activity comes back to the case."""

from __future__ import annotations

import os
import tempfile
from urllib.parse import urlsplit

import httpx
import pytest
from fastapi.testclient import TestClient

from backend import onboarding_cases as cases
from backend import preboarding
from backend.analytics import ANALYTICS_AS_OF
from backend.database import store
from backend.main import app
from preboarding.backend import store as portal_store
from preboarding.backend.main import app as portal_app

ACCOUNTS = {"HR": ("hr.jordan", "hr-demo-2026"), "IT": ("it.riley", "it-demo-2026")}


def _h(client: TestClient, role: str) -> dict:
    u, p = ACCOUNTS[role]
    return {"Authorization": f"Bearer {client.post('/api/auth/login', json={'username': u, 'password': p}).json()['token']}"}


def _future_joiner() -> str:
    return next(j.id for j in store.list_joiners() if 3 <= (j.joining_date - ANALYTICS_AS_OF.date()).days <= 40)


def _past_joiner() -> str:
    return next(j.id for j in store.list_joiners() if (j.joining_date - ANALYTICS_AS_OF.date()).days < -5)


@pytest.fixture()
def portal(monkeypatch):
    """Route SmartStart's HTTP calls to the portal app in-process."""
    portal_store.reset(os.path.join(tempfile.mkdtemp(prefix="smartstart-pb-"), "preboarding.json"))
    pc = TestClient(portal_app)

    def _path(url: str) -> str:
        return urlsplit(url).path

    monkeypatch.setattr(httpx, "post", lambda url, **kw: pc.post(_path(url), json=kw.get("json"), headers=kw.get("headers")))
    monkeypatch.setattr(httpx, "get", lambda url, **kw: pc.get(_path(url), params=kw.get("params"), headers=kw.get("headers")))
    return pc


def test_hr_publishes_and_joiner_activity_lands_on_the_case(portal):
    with TestClient(app) as client:
        h = _h(client, "HR")
        jid = _future_joiner()
        s = client.get(f"/api/preboarding/{jid}", headers=h).json()
        assert s["can_publish"] and s["link"] is None and s["days_to_start"] >= 3

        out = client.post(f"/api/nia/cases/{jid}/preboarding", headers=h)
        assert out.status_code == 200, out.text
        link = out.json()["preboarding"]
        token = link["url"].rsplit("/w/", 1)[1]

        pack = portal.get(f"/api/welcome/{token}").json()
        assert pack["joiner"]["id"] == jid
        assert len(pack["schedule"]) == 7 and pack["schedule"][0]["time"] == pack["start"]["arrive"]
        assert {p["relation"] for p in pack["people"]} >= {"Your manager", "Your mentor", "Your HR partner"}
        assert any(i["id"] == "photo_id" for i in pack["bring"])
        assert pack["faq"] and all(f["source"] for f in pack["faq"])

        assert portal.post(f"/api/welcome/{token}/confirm", json={"attending": True}).status_code == 200
        assert portal.post(f"/api/welcome/{token}/questions", json={"text": "Is there parking for bikes?"}).status_code == 200
        ics = portal.get(f"/api/welcome/{token}/day1.ics")
        assert ics.status_code == 200 and "BEGIN:VEVENT" in ics.text

        preboarding.sync(force=True)
        s = client.get(f"/api/preboarding/{jid}", headers=h).json()["link"]
        assert s["opened"] and s["confirmed"]["attending"] and s["questions"] == 1
        assert s["question_list"][0]["text"] == "Is there parking for bikes?"
        log = " | ".join(e["text"] for e in cases.log_for(jid))
        assert "Day-1 pack published" in log and "Confirmed they'll be there" in log and "parking for bikes" in log

        # Syncing again never double-counts.
        preboarding.sync(force=True)
        assert preboarding.link_for(jid)["questions"] == 1

        # Refreshing keeps the same link.
        again = client.post(f"/api/nia/cases/{jid}/preboarding", headers=h).json()["preboarding"]
        assert again["url"] == link["url"]


def test_welcome_email_carries_the_pack_link(portal):
    with TestClient(app) as client:
        h = _h(client, "HR")
        jid = _future_joiner()
        res = client.post("/api/nia/comms/send", headers=h, json={
            "joiner_id": jid, "kind": "welcome", "subject": "Welcome", "body": f"Hi! Your pack: {cases.PACK_LINK}"})
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["preboarding"]["ok"]
        assert body["preboarding"]["url"] in body["sent"]["body"]
        assert cases.PACK_LINK not in body["sent"]["body"]


def test_portal_down_returns_503_and_never_breaks_smartstart(monkeypatch):
    def boom(*_a, **_kw):
        raise httpx.ConnectError("down")

    monkeypatch.setattr(httpx, "post", boom)
    monkeypatch.setattr(httpx, "get", boom)
    with TestClient(app) as client:
        h = _h(client, "HR")
        jid = _future_joiner()
        res = client.post(f"/api/nia/cases/{jid}/preboarding", headers=h)
        assert res.status_code == 503 and "isn't reachable" in res.json()["detail"]
        assert client.get("/api/dashboard", headers=h).status_code == 200


def test_pack_is_only_for_before_day1_and_only_hr_or_ops_publish(portal):
    with TestClient(app) as client:
        hr, it = _h(client, "HR"), _h(client, "IT")
        old = _past_joiner()
        s = client.get(f"/api/preboarding/{old}", headers=hr).json()
        assert s["started"] and not s["can_publish"]
        assert client.post(f"/api/nia/cases/{old}/preboarding", headers=hr).status_code == 503

        jid = _future_joiner()
        assert client.post(f"/api/nia/cases/{jid}/preboarding", headers=it).status_code in (403, 404)


def test_portal_requires_the_publish_key():
    pc = TestClient(portal_app)
    assert pc.get("/api/events").status_code == 401
    assert pc.post("/api/invites", json={"pack": {}}, headers={"X-Publish-Key": "wrong"}).status_code == 401
    assert pc.get("/api/welcome/not-a-token").status_code == 404
