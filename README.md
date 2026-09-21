# SmartStart

Sandboxed **employee onboarding orchestration** for Interns and FTEs.

All data is **100% synthetic** — no real PII, production logs, or live iCIMS / ServiceNow / Jira calls.

**SmartStart is separate from the mock systems of record.** Synthetic data is generated into mock iCIMS / ServiceNow / Jira, then **ingested** into SmartStart.

## Layers

| Layer | Status | Role |
|------:|:------:|------|
| **1** | Done | Synthetic data + 5-stage state engine + source ingest |
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
- **Mock iCIMS:** http://127.0.0.1:8000/sources/icims
- **Mock ServiceNow:** http://127.0.0.1:8000/sources/servicenow
- **Mock Jira:** http://127.0.0.1:8000/sources/jira
- **Data ingestion:** http://127.0.0.1:8000/ingest
- API docs: http://127.0.0.1:8000/docs

Employees cannot open the Command Center. Each joiner has their own mentor; **Manager** is an employer queue filter, not one shared people-manager.


## Data ingestion

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/sources/summary` | Counts across mock source systems |
| GET | `/api/sources/icims` | Mock ATS candidates (native-shaped) |
| GET | `/api/sources/servicenow` | Mock ITSM RITMs |
| GET | `/api/sources/jira` | Mock onboarding issues |
| GET | `/api/ingest/status` | SmartStart vs sources + last run |
| POST | `/api/ingest/run` | Pull sources → SmartStart store (auth required) |

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
  ingest.py               # Source → SmartStart ingest pipeline
  chatbot.py              # Rule-based synthetic FAQ bot
  predictor.py            # Seed-stable SLA risk scores
  recommender.py          # Adaptive learning suggestions
  models.py               # Pydantic schemas
  synthetic_engine.py     # Faker cohort generator (writes source_store)
  database.py             # source_store + store (SmartStart)
  analytics.py            # KPI calculations
  alerts.py               # Synthetic alert generator
  integrations.py         # Mock system connectors
  employee_experience.py  # Profile / learning / notifications / feedback
frontend/
  index.html              # Command Center UI
  ingest.html             # Data ingestion console
  sources-*.html          # Mock iCIMS / ServiceNow / Jira UIs
  employee.html           # Employee Experience UI
  ai.html                 # Prototype AI Features UI
  style.css
  app.js                  # Employer Fetch + charts
  ingest.js / sources.js
tests/
```

## Tests

```bash
pytest
```
