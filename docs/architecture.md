# SmartStart architecture

## Product

SmartStart is an **employee onboarding orchestration** sandbox for Interns and FTEs.
Every record is synthetic so HR/IT/Manager UIs can be built without real PII.

**SmartStart is not the system of record.** Mock iCIMS, ServiceNow, and Jira hold
the source data; SmartStart **ingests** copies for orchestration.

## Layer 1 — Synthetic data & state engine

**Owns:** generation + serving of synthetic joiner state.

**Systems simulated (separate mock UIs)**
- iCIMS → `/sources/icims` — joiner identity, offer acceptance, document packet
- ServiceNow → `/sources/servicenow` — laptop/software ticket + SLA lead time
- Jira → `/sources/jira` — mentor, learning track, assigned tasks

**Ingestion**
1. Cohort is generated into `source_store` (systems of record).
2. `POST /api/ingest/run` copies into SmartStart’s `store`.
3. Ingest console: `/ingest`.

**State machine**
`OFFER_ACCEPTED` → `DOCS_SUBMITTED` → `IT_PROVISIONED` → `DAY1_ORIENTED` → `PROJECT_READY`

**Invariants**
1. Every record is `synthetic=true` with `SYN-J-*` / `SYN-IT-*` IDs and `@synthetic.smartstart.example` emails.
2. Fixed seed ⇒ reproducible cohort (including timestamps).
3. No network calls to real HR/IT systems.
4. Source native IDs (`ICIMS-CAND-*`, `RITM*`, `ONB-*`) stay on the mock source UIs.

## Layer 2 — Employer Command Center

**Owns:** employer-facing dashboard API + vanilla HTML/CSS/JS UI.

**Endpoints**
- `GET /api/dashboard` — joiner table + states
- `GET /api/alerts` — SLA breaches / pending tasks
- `GET /api/analytics` — KPIs, bottlenecks, trend
- `GET /api/integrations` — mock connector health (from source systems)
- `GET /api/sources/*` — native-shaped source records
- `POST /api/ingest/run` — pull sources → SmartStart

**UI sections:** Dashboard · Alerts · Analytics · Role Views · Data ingestion

## Layer 3 — Employee Experience

Joiner workspace + learning + notifications.

## Layer 4 — Prototype AI

Chatbot / predict / recommend on synthetic context.
