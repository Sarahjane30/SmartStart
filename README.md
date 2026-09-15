# SmartStart

Sandboxed **employee onboarding orchestration** app for Interns and FTEs.

> Layer 1 generates **100% synthetic** records so HR/IT/Manager UIs and AI features can be built without real PII or production logs.

## Layer 1 — Synthetic Data & State Engine

Simulates:
- **iCIMS (HR):** joiner metadata, offer acceptance, document packet status
- **ServiceNow (IT):** laptop ticket, software access, SLA lead times
- **Jira (Management):** mentor, learning track, assigned tasks

### State machine

`OFFER_ACCEPTED` → `DOCS_SUBMITTED` → `IT_PROVISIONED` → `DAY1_ORIENTED` → `PROJECT_READY`

### Layout

```text
backend/
  main.py                # FastAPI app
  models.py              # Pydantic schemas
  synthetic_engine.py    # Faker cohort generator (30 joiners by default)
  database.py            # In-memory store
tests/
docs/architecture.md
```

### Quick start

```bash
python -m pip install -e ".[dev]"
uvicorn backend.main:app --reload --port 8000
```

API docs: http://127.0.0.1:8000/docs

### API

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | liveness |
| GET | `/api/joiners` | list joiners (`?role_type=INTERN\|FTE`, `?state=...`) |
| GET | `/api/joiners/{id}` | joiner + docs + IT ticket + bottleneck |
| GET | `/api/metrics/summary` | pipeline / SLA / bottleneck rollups |
| POST | `/api/admin/regenerate` | rebuild cohort (`?seed=&n_interns=&n_ftes=`) |

### Tests

```bash
pytest
```

## Roadmap

| Layer | Status | Role |
|------:|:------:|------|
| **1** | **Now** | Synthetic data + state engine |
| 2 | Next | Employer Command Center (HR/IT/Manager UI) |
| 3 | Planned | Joiner experience / AI assist |
