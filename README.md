# SmartStart

Sandboxed **employee onboarding orchestration** for Interns and FTEs.

All data is **100% synthetic** — no real PII, production logs, or live iCIMS / ServiceNow / Jira calls.

## Layers

| Layer | Status | Role |
|------:|:------:|------|
| **1** | Done | Synthetic data + 5-stage state engine |
| **2** | Done | Employer Command Center (HR / IT / Manager) |
| **3** | Done | Employee Experience (Intern / FTE dashboard) |

### State machine

`OFFER_ACCEPTED` → `DOCS_SUBMITTED` → `IT_PROVISIONED` → `DAY1_ORIENTED` → `PROJECT_READY`

## Quick start

```bash
python -m pip install -e ".[dev]"
uvicorn backend.main:app --reload --port 8000
```

- Employer Command Center: http://127.0.0.1:8000/
- Employee Experience: http://127.0.0.1:8000/employee
- API docs: http://127.0.0.1:8000/docs

## Layer 3 API

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/employee/{id}` | Detailed synthetic joiner profile |
| GET | `/api/learningtrack/{id}` | Role-specific learning modules |
| GET | `/api/notifications/{id}` | Synthetic onboarding notifications |
| POST | `/api/feedback` | Submit synthetic onboarding-step feedback |

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
  main.py                 # FastAPI app (L1–L3)
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
  style.css
  app.js                  # Employer Fetch + charts
  employee.js             # Employee dashboard Fetch UI
tests/
```

## Tests

```bash
pytest
```
