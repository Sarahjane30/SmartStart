# Mock iCIMS — standalone Talent Acquisition demo

This is a **separate website** from SmartStart. It simulates an HR / recruiting
(ATS) system used before and at the start of onboarding.

| App | Port | Role |
|-----|------|------|
| **iCIMS (this app)** | `8100` | HR / Talent Acquisition |
| SmartStart | `8000` | Onboarding orchestration |
| **ServiceNow** | `8200` | ITSM (`uvicorn servicenow.backend.main:app --port 8200`) |

Open them in **different browser tabs**. Actions in iCIMS emit events via REST;
SmartStart can consume them independently. This app never navigates to SmartStart.

## Quick start

From the repo root:

```bash
python3 -m pip install -e ".[dev]"
python3 -m uvicorn icims.backend.main:app --reload --port 8100
```

Open: **http://127.0.0.1:8100/**

### Demo login

| Username | Password |
|----------|----------|
| `hr.demo` | `hr-demo-2026` |

Signed in as **Jordan Blake · HR Business Partner**.

## Demo action

1. Sign in → **Offers**
2. Click **Mark Accepted** on a Sent offer
3. iCIMS updates offer + candidate stage and creates a New Hire
4. Emits `OFFER_ACCEPTED` on `GET /api/events`
5. Stay in iCIMS — switch tabs manually to SmartStart to show ingest

## Event feed (for SmartStart / external consumers)

```http
GET /api/events
GET /api/events?since=2026-09-21T00:00:00+00:00
```

Example payload:

```json
{
  "event_type": "OFFER_ACCEPTED",
  "candidate_id": "CAND-0042-003",
  "employee_type": "INTERN",
  "position": "Software Engineering Intern",
  "department": "Engineering",
  "manager": "Ava Chen",
  "start_date": "2026-09-28",
  "smartstart_joiner_id": "SYN-J-0042-003",
  "timestamp": "..."
}
```

Also: `DOCUMENT_VERIFIED`, `HR_PREBOARDING_COMPLETE`.

## Branding

- Product name: **iCIMS**
- Subtitle: Mock Talent Acquisition
- Badge: Synthetic Demo Environment
- Light enterprise UI (not SmartStart’s dark Command Center)

All data is synthetic (seed **42**, 15 Interns + 15 FTEs, same managers as SmartStart).
Emails: `firstname.lastname@synthetic.example`
