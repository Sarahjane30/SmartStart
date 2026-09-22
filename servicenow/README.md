# Mock ServiceNow — standalone ITSM demo

This is a **separate website** from SmartStart (and from mock iCIMS). It simulates
IT Service Management for new-hire laptop + access provisioning.

| App | Port | Role |
|-----|------|------|
| SmartStart | `8000` | Onboarding orchestration |
| Mock iCIMS | `8100` | HR / Talent Acquisition |
| **ServiceNow (this app)** | `8200` | IT / ITSM |

Open them in **different browser tabs**. Actions here emit events via REST;
SmartStart can consume them independently. This app never navigates to SmartStart.

## Quick start

From the repo root:

```bash
python3 -m pip install -e ".[dev]"
python3 -m uvicorn servicenow.backend.main:app --reload --port 8200
```

Open: **http://127.0.0.1:8200/**

### Demo login

| Username | Password |
|----------|----------|
| `it.demo` | `it-demo-2026` |

Signed in as **Riley Chen · IT Service Desk Analyst**.

## Demo action

1. Sign in → lands on **Requests** (no Home dashboard — that lives in SmartStart)
2. On an open RITM: **Configure** → **Mark Delivered** → **Grant Access**
3. Emits `HARDWARE_DELIVERED`, `ACCESS_GRANTED`, and `IT_PROVISIONING_COMPLETE` on `GET /api/events`
4. Stay in ServiceNow — switch tabs to **SmartStart** to show the interactive dashboard after ingest

## Event feed

```http
GET /api/events
GET /api/events?since=2026-09-21T00:00:00+00:00
```

Example payload:

```json
{
  "event_type": "IT_PROVISIONING_COMPLETE",
  "ritm": "RITM0042003",
  "requested_for": "Alex Example",
  "hardware_status": "Delivered",
  "software_access": ["Okta", "GitHub", "Slack"],
  "smartstart_joiner_id": "SYN-J-0042-003",
  "timestamp": "..."
}
```

Also: `HARDWARE_ORDERED`, `HARDWARE_CONFIGURED`, `HARDWARE_DELIVERED`, `ACCESS_GRANTED`.

## Branding

- Product name: **ServiceNow**
- Subtitle: Mock IT Service Management
- Badge: Synthetic Demo Environment
- Green / slate ITSM UI (not SmartStart, not iCIMS)

All data is synthetic (seed **42**, 30 RITMs aligned to SmartStart joiners).
Emails: `firstname.lastname@synthetic.example`
