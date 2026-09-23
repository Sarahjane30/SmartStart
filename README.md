# SmartStart

**SmartStart** is an intelligent employee experience platform that combines onboarding
orchestration, enterprise navigation, personalized guidance, and predictive readiness.

All data is **100% synthetic** — no real PII, production logs, or live HR/IT systems.

**IRA** is the employee’s always-available AI companion. It helps answer:

1. **WHAT?** — What’s this application / term?
2. **WHERE?** — Where do I do this?
3. **WHO?** — Who can help me?
4. **WHAT NEXT?** — What should I do now?
5. **WHY?** — Why am I blocked?
6. **WHAT IF?** — What happens if this isn’t completed?

IRA reasons across personal onboarding context + a governed synthetic knowledge layer
(apps, teams, processes, docs) and cross-system sandbox signals (iCIMS / ServiceNow / Jira).
It recommends and navigates — humans keep approvals and production changes.

## Companion systems (separate websites)

| App | Port | Start |
|-----|------|-------|
| **SmartStart** (this app) | `8000` | `uvicorn backend.main:app --reload --port 8000` |
| **Mock iCIMS** (standalone HR/ATS) | `8100` | `uvicorn icims.backend.main:app --reload --port 8100` |
| **Mock ServiceNow** (standalone ITSM) | `8200` | `uvicorn servicenow.backend.main:app --reload --port 8200` |
| **Mock Jira** (standalone boards) | `8300` | `uvicorn jira.backend.main:app --reload --port 8300` |
| **IRA** (desktop companion — not a website) | — | See [`ira/README.md`](ira/README.md) — Windows: `git checkout cursor/ira-desktop-companion-76dd` then `python -m pip install -e ".[ira]"` and `python -m ira` |

See [`icims/README.md`](icims/README.md), [`servicenow/README.md`](servicenow/README.md), [`jira/README.md`](jira/README.md), [`ira/README.md`](ira/README.md).

**IRA** is an independent PySide6 companion for enterprise navigation + personal
onboarding guidance. It calls SmartStart `/api/ira/*` only — it does **not** replace
enterprise systems or take production actions.

Demo logins: iCIMS `hr.demo` / `hr-demo-2026` · ServiceNow `it.demo` / `it-demo-2026` · Jira `mgr.demo` / `mgr-demo-2026`.

## Layers

| Layer | Status | Role |
|------:|:------:|------|
| **1** | Done | Synthetic data + 5-stage state engine |
| **2** | Done | Role-aware Employer Command Center (HR / IT / Manager / Ops) |
| **3** | Done | Employee Experience (Intern / FTE dashboard) |
| **4** | Done | IRA intelligence (knowledge · context · action · predictive · orchestration) |
| **IRA desktop** | Done | Independent PySide6 companion over `/api/ira/*` |

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
| GET | `/api/chatbot/{id}` | IRA — synthetic onboarding FAQ (`?q=` optional) |
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

## Layer 2 — role-aware Command Center

One shared cohort (seed 42, 30 joiners), one state machine, one bottleneck + risk engine.
The signed-in role only changes **scope** (which joiners you may see), **actions** (what you act on)
and **framing** (alert wording, cards, analytics). `backend/role_context.py` builds that context:

```text
{ user, role, visible_joiners, actionable_joiners, relevant_bottlenecks, permissions, priorities }
```

| Role | Demo login | Scope | Nav | Cards |
|------|-----------|-------|-----|-------|
| HR | `hr.jordan` (Jordan Hale) | Cohort | Dashboard · My Actions · Joiners · Alerts · Analytics | Joiners in view · Documents pending · Document rework · HR actions · At risk |
| IT | `it.riley` (Riley Chen) | Cohort | Dashboard · IT Requests · Joiners · Alerts · Analytics | Joiners in view · Pending hardware · SLA breaches · Access requests · IT risks |
| Manager | `mgr.chen` / `mgr.park` / `mgr.singh` / `mgr.cole` | Own team only | Dashboard · My Joiners · My Actions · Alerts | My Joiners · On Track · Need My Action · Project Assignment Pending · Project Ready |
| Ops | `ops.admin` (Sam Ortiz) | Cohort + All/HR/IT/Manager filters | Dashboard · Alerts · Analytics · Roles & systems | Total Joiners · On Track · At Risk · Blocked · Active Bottlenecks |

Every joiner has the same journey strip for every role (**HR** docs → **IT** laptop & access →
**Manager** Day 1 & mentor → **Project**). Only the action area changes (HR: docs / handoff;
IT: laptop / VPN / access / SLA; Manager: Day 1 / mentor / project; Ops: route & unblock).
Alerts keep the same event id and severity; wording and "action required vs awareness" follow the role.

**Backend enforcement (not just hidden UI):**

- Manager sessions only receive their team from `/api/dashboard`, `/api/alerts` (rollups rescoped to the team — no other teams' names), `/api/analytics`, `/api/employer/*`, and `/api/joiners` (when a token is sent).
- `/api/joiners/{id}`, `/owners` and `/intelligence` require an employer session and return **404** outside the caller's scope.
- Non-Ops roles get **403** for other queue lenses (e.g. HR asking for `role_view=IT`).
- `/api/admin/regenerate` is Ops-only.

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/employer/context` | Role context contract (reused by future assistants) |
| GET | `/api/employer/workspace` | Nav, cards, action queue, per-joiner journeys for the signed-in role |
| GET | `/api/dashboard` | Joiner table + states + journey (`?role_view=` — Ops: All/HR/IT/Manager) |
| GET | `/api/alerts` | Role-worded SLA / pending-task alerts |
| GET | `/api/analytics` | KPIs + `role_insights` (HR / IT / Manager / Ops panels) |
| GET | `/api/joiners/{id}` | Joiner detail + `journey`, `role_actions`, `access` (employer session) |
| GET | `/api/integrations` | Mock iCIMS / ServiceNow / Jira snapshots |

`/api/joiners` (roster) and `/api/metrics/summary` (aggregates) stay public for the synthetic sign-in picker.

## Project layout

```text
backend/
  main.py                 # FastAPI app (L1–L4)
  chatbot.py              # IRA — rule-based synthetic FAQ companion
  predictor.py            # Seed-stable SLA risk scores
  recommender.py          # Adaptive learning suggestions
  models.py               # Pydantic schemas
  synthetic_engine.py     # Faker cohort generator
  database.py             # In-memory store
  analytics.py            # KPI calculations
  role_context.py         # Role scope, actions, alert wording, role analytics
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
