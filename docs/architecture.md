# SmartStart architecture

## Product

SmartStart is an **employee onboarding orchestration** sandbox for Interns and FTEs.
Layer 1 is a synthetic data engine so downstream HR/IT/Manager UIs never need real PII.

## Layer 1 contract

**Owns:** generation + serving of synthetic joiner state.

**Sources of truth simulated**
- iCIMS → joiner identity, offer acceptance, document packet
- ServiceNow → laptop/software ticket + SLA lead time
- Jira → mentor, learning track, assigned tasks

**State machine**
`OFFER_ACCEPTED` → `DOCS_SUBMITTED` → `IT_PROVISIONED` → `DAY1_ORIENTED` → `PROJECT_READY`

**Default cohort:** 15 Interns + 15 FTEs across Technical / Non-Technical tracks.

**Invariants**
1. Every record is flagged `synthetic=true` with `SYN-J-*` / `SYN-IT-*` IDs and `@synthetic.smartstart.example` emails.
2. Fixed seed ⇒ reproducible cohort (including timestamps).
3. No network calls to real HR/IT systems.
4. No real employee PII.

## Later layers

- **Layer 2:** Employer Command Center (HR / IT / Manager UI)
- **Layer 3:** Joiner experience + AI assist
