# SmartStart architecture

## Product

SmartStart is an **employee onboarding orchestration** sandbox for Interns and FTEs.
Every record is synthetic so HR/IT/Manager UIs can be built without real PII.

## Layer 1 — Synthetic data & state engine

**Owns:** generation + serving of synthetic joiner state.

**Systems simulated**
- iCIMS → joiner identity, offer acceptance, document packet
- ServiceNow → laptop/software ticket + SLA lead time
- Jira → mentor, learning track, assigned tasks

**State machine**
`OFFER_ACCEPTED` → `DOCS_SUBMITTED` → `IT_PROVISIONED` → `DAY1_ORIENTED` → `PROJECT_READY`

**Invariants**
1. Every record is `synthetic=true` with `SYN-J-*` / `SYN-IT-*` IDs and `@synthetic.smartstart.example` emails.
2. Fixed seed ⇒ reproducible cohort (including timestamps).
3. No network calls to real HR/IT systems.

## Layer 2 — Employer Command Center

**Owns:** employer-facing dashboard API + vanilla HTML/CSS/JS UI.

**Endpoints**
- `GET /api/dashboard` — joiner table + states
- `GET /api/alerts` — SLA breaches / pending tasks
- `GET /api/analytics` — KPIs, bottlenecks, trend
- `GET /api/integrations` — mock connector health

**UI sections:** Dashboard · Alerts · Analytics · Role Views (HR / IT / Manager)

## Layer 3 (planned)

Joiner experience + AI assist features.
