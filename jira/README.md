# Mock Jira — standalone onboarding boards

This is a **separate website** from SmartStart (and from mock iCIMS / ServiceNow).
It simulates Jira work tracking for joiner onboarding stories and mentor tasks.

| App | Port | Role |
|-----|------|------|
| SmartStart | `8000` | Interactive onboarding dashboard (pulls events) |
| Mock iCIMS | `8100` | HR / Talent Acquisition |
| Mock ServiceNow | `8200` | IT / ITSM |
| **Jira (this app)** | `8300` | Boards / assigned work |

**No Home dashboard here** — login lands on **For you → Assigned to me**. SmartStart owns the interactive pipeline dashboard after ingest.

## Quick start

```bash
python3 -m pip install -e ".[dev]"
python3 -m uvicorn jira.backend.main:app --reload --port 8300
```

Open: **http://127.0.0.1:8300/**

### Demo login

| Username | Password |
|----------|----------|
| `mgr.demo` | `mgr-demo-2026` |

Signed in as **Ava Chen · Hiring Manager**.

## Demo action

1. Sign in → **For you** (assigned list) or **Boards** (kanban)
2. Move an issue to **Done** (or complete all sub-tasks)
3. Emits `PROJECT_READY` on `GET /api/events`
4. Switch browser tabs to **SmartStart** to show the ingested state

Also: `ISSUE_STARTED`, `ISSUE_UPDATED`, `SUBTASK_DONE`.

## Branding

- Product: **Jira**
- Light Atlassian-style UI (blue accents)
- Badge: Synthetic Demo Environment

Seed **42**, 30 `ONB-*` issues aligned to SmartStart joiners.
