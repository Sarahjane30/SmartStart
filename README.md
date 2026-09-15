# SmartStart

Sandboxed **employee onboarding orchestration** for Interns and FTEs.

All data is **100% synthetic** — no real PII, production logs, or live iCIMS / ServiceNow / Jira calls.

## Layers

| Layer | Status | Role |
|------:|:------:|------|
| **1** | Done | Synthetic data + 5-stage state engine |
| **2** | Done | Employer Command Center (HR / IT / Manager) |
| 3 | Planned | Joiner experience / AI assist |

### State machine

`OFFER_ACCEPTED` → `DOCS_SUBMITTED` → `IT_PROVISIONED` → `DAY1_ORIENTED` → `PROJECT_READY`

## Quick start

```bash
python -m pip install -e ".[dev]"
uvicorn backend.main:app --reload --port 8000
```

Open the Command Center: http://127.0.0.1:8000/

API docs: http://127.0.0.1:8000/docs

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
  main.py                 # FastAPI app (L1 + L2)
  models.py               # Pydantic schemas
  synthetic_engine.py     # Faker cohort generator
  database.py             # In-memory store
  analytics.py            # KPI calculations
  alerts.py               # Synthetic alert generator
  integrations.py         # Mock system connectors
frontend/
  index.html              # Command Center UI
  style.css
  app.js                  # Fetch + charts (vanilla JS)
tests/
```

## Tests

```bash
pytest
```
