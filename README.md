# SmartStart

Sandboxed **employee onboarding orchestration** for Interns and FTEs.

All data is **100% synthetic** — no real PII, production logs, or live HR/IT systems.

## Companion systems (separate websites)

| App | Port | Start |
|-----|------|-------|
| **SmartStart** (this app) | `8000` | `uvicorn backend.main:app --reload --port 8000` |
| **Mock iCIMS** (standalone HR/ATS) | `8100` | `uvicorn icims.backend.main:app --reload --port 8100` |
| **Mock ServiceNow** (standalone ITSM) | `8200` | `uvicorn servicenow.backend.main:app --reload --port 8200` |
| **Mock Jira** (standalone boards) | `8300` | `uvicorn jira.backend.main:app --reload --port 8300` |
| **IRA** (desktop companion — not a website) | — | See [`ira/README.md`](ira/README.md) — Windows: `git checkout cursor/ira-desktop-companion-76dd` then `python -m pip install -e ".[ira]"` and `python -m ira` |

See [`icims/README.md`](icims/README.md), [`servicenow/README.md`](servicenow/README.md), [`jira/README.md`](jira/README.md), [`ira/README.md`](ira/README.md).

**IRA** is an independent PySide6 floating widget. It is **not** a SmartStart page or embedded chatbot — it sits on the desktop and calls SmartStart `/api/ira/*` APIs.

Demo logins: iCIMS `hr.demo` / `hr-demo-2026` · ServiceNow `it.demo` / `it-demo-2026` · Jira `mgr.demo` / `mgr-demo-2026`.

## Layers

| Layer | Status | Role |
|------:|:------:|------|
| **1** | Done | Synthetic data + 5-stage state engine |
| **2** | Done | Employer Command Center (HR / IT / Manager) |
| **3** | Done | Employee Experience (Intern / FTE dashboard) |
| **4** | Done | Prototype AI (chatbot / predict / recommend) |

### State machine

`OFFER_ACCEPTED` → `DOCS_SUBMITTED` → `IT_PROVISIONED` → `DAY1_ORIENTED` → `PROJECT_READY`

## Quick start

```bash
python -m pip install -e ".[dev]"
uvicorn backend.main:app --reload --port 8000
```

- **Portal (start here):** http://127.0.0.1:8000/ — choose Employer or Employee
- **Employer Command Center:** http://127.0.0.1:8000/employer (after Employer sign-in)
- **Employee Experience:** http://127.0.0.1:8000/employee (after picking one Intern/FTE)
- **AI Features (employer):** http://127.0.0.1:8000/ai
- API docs: http://127.0.0.1:8000/docs

Employees cannot open the Command Center. Each joiner has their own mentor; **Manager** is an employer queue filter, not one shared people-manager.


## Layer 4 API

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/chatbot/{id}` | Synthetic onboarding FAQ (`?q=` optional) |
| GET | `/api/predict/{id}` | Seed-stable SLA / onboarding risk scores |
| GET | `/api/recommendations/{id}` | Adaptive learning suggestions by role + progress |

Open AI Features UI: http://127.0.0.1:8000/ai

## Layer 3 API

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/employee/{id}` | Detailed synthetic joiner profile |
| GET | `/api/learningtrack/{id}` | Role-specific learning modules |
| GET | `/api/notifications/{id}` | Synthetic onboarding notifications |
| POST | `/api/feedback` | Submit synthetic onboarding-step feedback |
| GET | `/api/employee/{id}/workspace` | Consult network + department team roster |

**Role differentiation:** Interns get mentor-focused modules (e.g. Git Basics); FTEs get department + project-readiness tasks.

## Layer 2 API

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/dashboard` | Joiner table + states (`?role_view=All\|HR\|IT\|Manager`) |
| GET | `/api/alerts` | Synthetic SLA / pending-task alerts |
| GET | `/api/analytics` | KPIs, bottlenecks, onboarding trend |
| GET | `/api/integrations` | Mock iCIMS / ServiceNow / Jira snapshots |

Layer 1 endpoints (`/api/joiners`, `/api/metrics/summary`, etc.) remain available.

## Project layout

```text
backend/
  main.py                 # FastAPI app (L1–L4)
  chatbot.py              # Rule-based synthetic FAQ bot
  predictor.py            # Seed-stable SLA risk scores
  recommender.py          # Adaptive learning suggestions
  models.py               # Pydantic schemas
  synthetic_engine.py     # Faker cohort generator
  database.py             # In-memory store
  analytics.py            # KPI calculations
  alerts.py               # Synthetic alert generator
  integrations.py         # Mock system connectors
  employee_experience.py  # Profile / learning / notifications / feedback
frontend/
  index.html              # Command Center UI
  employee.html           # Employee Experience UI
  ai.html                 # Prototype AI Features UI
  style.css
  app.js                  # Employer Fetch + charts
  employee.js             # Employee dashboard Fetch UI
  ai.js                   # AI Features Fetch UI
tests/
```

## Tests

```bash
pytest
```
