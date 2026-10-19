# SmartStart & What is Waters? — Prototype Overview & Phase 1

> **How to publish in Confluence:** Create a blank page, set the title to *SmartStart & What is Waters? — Prototype Overview & Phase 1*, then paste this document (Confluence Cloud accepts Markdown paste). Optionally wrap callout blocks in Info / Note / Warning macros.

| Field | Value |
| --- | --- |
| **Platform** | **SmartStart** — intelligent employee experience / onboarding orchestration |
| **Experience (Phase 1)** | *Waters // How it all connects* (“What is Waters?”) |
| **Audience** | New joiners (Interns & FTEs), HR / IT / Managers, onboarding stakeholders, engineering |
| **Phase** | **Phase 1** — deploy What is Waters? (machine + animations + machinery explanation) |
| **Status** | SmartStart Layers 1–4 + IRA prototype; Waters machine ready for Phase 1 hosting |
| **Data rule** | **100% synthetic** — no real PII, production logs, or live HR/IT systems |
| **Out of scope for Phase 1** | React/Vite `waters-explore` experiment — not the Phase 1 deliverable |

---

# Part A — SmartStart (the platform)

## A1. Motive — why we built SmartStart

Onboarding at a company like Waters is not one app and not one team. A joiner’s path crosses **HR (ATS / docs)**, **IT (laptop, access, tickets)**, **managers (Day 1, mentor, project)**, and a maze of **enterprise tools** they have never used. Today that path is fragmented:

| What joiners / employers face | What breaks |
| --- | --- |
| Multiple systems of record (iCIMS, ServiceNow, Jira, …) | No single place to see “where is this person stuck?” |
| Role-blind dashboards | HR sees IT noise; managers see other teams’ joiners |
| Generic FAQ bots | Answers ignore *this* person’s stage, tickets, and blockers |
| Slide-deck company intros | Science and “where I fit” never stick for non-lab joiners |
| Fear of using real PII in demos / prototypes | Teams cannot iterate safely on UX or AI |

**Motive in one sentence:** build a **safe, synthetic sandbox** where we can orchestrate the full intern/FTE journey, give employers a role-aware command center, give joiners a personal experience + AI companion, and — in Phase 1 — give every joiner an interactive answer to *What is Waters, and where do I fit?*

### What SmartStart is (and is not)

| SmartStart **is** | SmartStart **is not** |
| --- | --- |
| An intelligent employee experience platform for onboarding orchestration | A replacement for production iCIMS / ServiceNow / Jira |
| A sandboxed cohort with a real state machine and bottlenecks | A live HR system of record |
| Role-aware employer tooling (HR / IT / Manager / Ops) + employee UX | One shared “manager of everyone” |
| IRA — recommend & navigate; humans keep approvals | An agent that changes salaries, permissions, or closes real tickets |
| 100% synthetic data for demos and product learning | Connected to real PII or production APIs |

### Design principles (platform)

1. **Synthetic by default** — every record is flagged synthetic; fixed seed ⇒ reproducible demos.
2. **One journey, many lenses** — same state machine; HR / IT / Manager / Ops only change *scope, actions, framing*.
3. **Backend enforcement** — access is not “hidden UI”; APIs return 403/404 outside role scope.
4. **Grounded assistance** — IRA / NIA answer from approved context; they do not invent HR facts.
5. **Humans in the loop** — confirm gates for assign/resolve; no silent production writes.
6. **Company story is separate from personal data** — public Waters facts vs joiner’s own chain.

---

## A2. What SmartStart includes (layers)

| Layer | Status | Role |
| ---: | :---: | --- |
| **1** | Done | Synthetic data + 5-stage onboarding state engine |
| **2** | Done | Role-aware Employer Command Center (HR / IT / Manager / Ops) |
| **3** | Done | Employee Experience (Intern / FTE dashboard, learning, workspace) |
| **4** | Done | IRA intelligence (knowledge · context · action · predictive · orchestration) |
| **IRA desktop** | Done | Independent PySide6 companion over `/api/ira/*` |
| **Waters machine** | Done (Phase 1 ship) | “What is Waters?” interactive company / science orientation |
| **NIA** | Done | Employer-side New-Hire Intelligence Assistant (Command Center copilot) |
| **Mock enterprise apps** | Done | Standalone mock iCIMS / ServiceNow / Jira (+ optional pre-boarding portal) |

### Onboarding state machine

Every joiner moves through:

`OFFER_ACCEPTED` → `DOCS_SUBMITTED` → `IT_PROVISIONED` → `DAY1_ORIENTED` → `PROJECT_READY`

**Systems simulated (not called for real):**

| System | What it represents in the sandbox |
| --- | --- |
| **iCIMS** | Joiner identity, offer acceptance, document packet |
| **ServiceNow** | Laptop / software tickets + SLA lead time |
| **Jira** | Mentor, learning track, assigned tasks |

Journey strip (same for every role): **HR docs → IT laptop & access → Manager Day 1 & mentor → Project**.

---

## A3. How SmartStart works

### A3.1 Big picture

```
                    ┌──────────── Portal ────────────┐
                    │  Employer sign-in  │  Employee  │
                    └─────────┬──────────┴─────┬──────┘
                              ▼                ▼
                   Command Center          Employee Experience
                   (HR/IT/Mgr/Ops)         (Intern / FTE)
                              │                │
                              │                ├─ Learning / notifications
                              │                ├─ Workspace / team
                              │                └─ What is Waters?  ← Phase 1
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
           NIA (employer)  Analytics      Resolve / learning APIs
                              │
                              ▼
                    Layer 1 state engine + synthetic store
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
     Mock iCIMS          Mock ServiceNow       Mock Jira
     (:8100)               (:8200)              (:8300)
                              │
                              ▼
                    IRA desktop companion
                    (calls /api/ira/* only)
```

### A3.2 Layer 1 — synthetic engine

- Faker-based cohort (e.g. seed 42, ~30 joiners), in-memory store.
- Each joiner has stage, docs, IT tickets, mentor, learning track, risk/bottleneck signals.
- Invariants: `synthetic=true`, IDs like `SYN-J-*` / `SYN-IT-*`, emails `@synthetic.smartstart.example`.
- **No network calls** to real HR/IT systems.

### A3.3 Layer 2 — Employer Command Center

One shared cohort and bottleneck engine. The signed-in role only changes:

```text
{ user, role, visible_joiners, actionable_joiners, relevant_bottlenecks, permissions, priorities }
```

| Role | Demo login (examples) | Scope | Focus |
| --- | --- | --- | --- |
| **HR** | `hr.jordan` | Whole cohort | Documents, rework, HR actions |
| **IT** | `it.riley` | Whole cohort | Hardware, SLA, access requests |
| **Manager** | `mgr.chen` / `mgr.park` / … | **Own team only** | Day 1, mentor, project, learning |
| **Ops** | `ops.admin` | Cohort + lens filters | Route, unblock, regenerate |

**Key behaviours**

- Role-worded alerts (same event id/severity; different “action vs awareness”).
- **Resolve** / **Still needs help** per owner queue (HR resolving does not hide IT’s work).
- Manager **Learning**: view progress, add courses; appears on the joiner’s learning tab.
- **NIA**: floating employer copilot — same role context as the dashboard; confirm-gated assign/resolve; source pills that open mock iCIMS / ServiceNow / Jira in a new tab.

### A3.4 Layer 3 — Employee Experience

After picking an Intern/FTE profile, the joiner gets:

- Personal dashboard and next actions
- Role-specific **learning track** (interns more mentor-focused; FTEs more dept/project-ready)
- Notifications and feedback
- Workspace: consult network + department roster
- Entry to **What is Waters?** (Phase 1)

Employees **cannot** open the Command Center.

### A3.5 Layer 4 + IRA — employee companion

IRA answers six joiner questions:

1. **WHAT?** — What’s this application / term?
2. **WHERE?** — Where do I do this?
3. **WHO?** — Who can help me?
4. **WHAT NEXT?** — What should I do now?
5. **WHY?** — Why am I blocked?
6. **WHAT IF?** — What happens if this isn’t completed?

IRA reasons over personal onboarding context + a governed synthetic knowledge layer (apps, teams, processes, docs) + sandbox signals from mock iCIMS / ServiceNow / Jira. It **recommends and navigates**; it does **not** take production actions.

Desktop IRA (PySide6) is a separate app that only calls SmartStart `/api/ira/*`.

### A3.6 Companion mock apps (separate websites)

| App | Port | Purpose |
| --- | --- | --- |
| SmartStart | `8000` | Main platform |
| Mock iCIMS | `8100` | Standalone HR/ATS sandbox |
| Mock ServiceNow | `8200` | Standalone ITSM sandbox |
| Mock Jira | `8300` | Standalone boards sandbox |
| Waters Welcome (pre-boarding) | `8500` | Day-1 pack portal (where present) |
| IRA desktop | — | Not a website — `python -m ira` |

NIA/IRA deep-links open these mocks in a **new tab** — never embedded as if they were production.

---

## A4. SmartStart tech stack (current prototype)

| Layer | Choice | Why |
| --- | --- | --- |
| Language / runtime | Python **3.11+** | Team standard; fast API iteration |
| API | **FastAPI** + **Pydantic** + **Uvicorn** | Typed contracts, OpenAPI (`/docs`), async-friendly |
| Synthetic data | **Faker** + fixed seed | Reproducible cohort, no real PII |
| Persistence (prototype) | In-memory store | Zero infra for demos; replace later with real DB if needed |
| Employer / employee UI | **Vanilla HTML / CSS / JS** | Fast shipping; no SPA build tax for the sandbox |
| Charts / motion | Lightweight front-end JS | Command Center analytics + Waters canvas |
| AI surfaces | IRA APIs + NIA on role context; optional desktop **PySide6** | Grounded Q&A without replacing systems of record |
| Mock enterprise | Separate FastAPI apps (iCIMS / ServiceNow / Jira) | Realistic deep-links without live credentials |
| Packaging | Hatch / `pyproject.toml` | `pip install -e ".[dev]"` |
| Quality | **Pytest**, Ruff | API + story/chain tests |

### Local run

```bash
python -m pip install -e ".[dev]"
uvicorn backend.main:app --reload --port 8000
# Portal: http://127.0.0.1:8000/
# Employer Command Center / Employee Experience / AI Features / OpenAPI /docs
```

### Representative APIs

| Area | Examples |
| --- | --- |
| Employer | `/api/employer/context`, `/api/employer/workspace`, `/api/dashboard`, `/api/alerts`, `/api/analytics`, resolve/reopen, learning |
| Employee | `/api/employee/{id}`, `/api/learningtrack/{id}`, `/api/notifications/{id}`, `/api/employee/{id}/workspace`, `/api/employee/{id}/waters` |
| Intelligence | `/api/chatbot/{id}`, `/api/predict/{id}`, `/api/recommendations/{id}`, `/api/nia/*`, `/api/ira/*` |
| Integrations | `/api/integrations` — mock connector snapshots |

---

## A5. Proposed SmartStart production stack (scale, safety, ops)

Phase 1 can host the prototype behind enterprise access. Longer-term hardening:

| Concern | Recommendation |
| --- | --- |
| **AuthN** | Enterprise SSO (e.g. Entra ID); retire demo pickers outside sandbox |
| **AuthZ** | Keep role_context model; enforce on every employer/employee API |
| **Data** | Start from HR-approved attributes only; keep synthetic lane for demos; never mix real PII into prototype seeds |
| **Persistence** | Managed Postgres (or equivalent) for joiner state, resolutions, learning adds |
| **Hosting** | App Service / K8s for API; CDN for static UI; WAF + TLS + rate limits at edge |
| **Mocks vs real** | Production SmartStart reads **approved** integrations via governed connectors; mocks stay for training/demo environments |
| **IRA / NIA** | Grounded retrieval over approved knowledge; confirm gates; audit log of suggestions vs actions |
| **Secrets** | Platform secret store; no keys in frontend |
| **Observability** | Structured logs + product analytics **without** raw PII in event payloads |
| **Privacy** | Minimize attributes; purpose limitation (onboarding only); retention policy |
| **Delivery** | CI → staging → prod; feature flags per surface (`WATERS_MACHINE_ENABLED`, ride play, etc.) |

---

# Part B — What is Waters? (Phase 1 experience)

Built **on top of** SmartStart Employee Experience. It does not replace Layers 1–4; it answers the company/science orientation gap those layers do not cover.

## B1. Motive — why this experience

New joiners still ask:

> *What does this company actually do — scientifically — and where do I fit?*

HR packets cover policies. Org charts cover reporting lines. Neither makes **liquid chromatography**, **mass spectrometry**, or the **ecosystem of roles** feel real — especially for software, IT, data, ops, HR, finance.

**Motive:** give every joiner an interactive, memorable first encounter with Waters science, technology, global footprint, people, and *their own place* — using their SmartStart record for the personal finale only.

### Problems → response

| Problem | Prototype response |
| --- | --- |
| Company story is abstract | Six-chapter interactive **machine** |
| LC/MS hard to explain with slides | Cinematic **How it works** films + optional **Become the sample** |
| Org context buried in systems | Finale **Your place** from SmartStart joiner record |
| Public facts vs personal data mixed | Public sources only for company story; personal chain from joiner record |
| Heavy frameworks slow first ship | **Canvas 2D + WatersGfx3D** — no WebGL required for Phase 1 |

### Experience design principles

1. **Motion is navigation** — hover, click, scroll.
2. **Simple first, deeper on demand**.
3. **Teach, then invite** — How it works before Become the sample.
4. **Grounded content** — cited public facts; no invented HR data.
5. **Accessible** — keyboard, `prefers-reduced-motion`, no WebGL required.
6. **IRA handoff** — finale connects to meet team / understand role / explore tools.

---

## B2. What we have built (Waters features)

**Name:** Waters // How it all connects — launched as **“What is Waters?”**.

**Entry points:** Employee nav / teaser · `#waters` deep link · full-screen `#wm` overlay.

### A. Interactive machine — **Phase 1**

| Chapter | Label | Joiner gets |
| --- | --- | --- |
| **01 Science** | What does Waters do? | Separate → identify → understand; LC, MS, informatics |
| **02 Impact** | Why does it matter? | Medicines, food & water, diagnostics, antibiotic resistance |
| **03 Technology** | Inside the chambers | LC & MS chambers; entries into films / rides |
| **04 World** | Waters around the world | ~16k colleagues; globe (Milford, Wilmslow, Wexford, Bengaluru, …) |
| **05 People** | Who works here? | Ecosystem: scientists, engineers, software, data, ops, sales, service, business, HR |
| **06 You** | Your place in the machine | Personal chain: company → area → dept → team → role → you |

**Interactions:** look around · hover light-up · click isolate · zoom · scroll/arrows travel · Esc back · mobile chapter rail · intro *Explore freely* · finale + Replay + IRA chips · sources footer.

### B. Animation & visual system — **Phase 1**

Assemble/disassemble · pipes · particles/glass/glow · globe · people network · finale path · **WatersGfx3D** (Canvas 2D, no WebGL) · reduced-motion support.

### C. Explaining machinery (“How it works”) — **Phase 1**

| Track | Mode | Content |
| --- | --- | --- |
| **observe-lc** | How it works (LC) | Assembled tower → five modules → solvents → pump → injector (6-port valve) → column → UV detector → peaks → your turn |
| **observe-ms** | How it works (MS) | How MS works → ion source → quadrupole → counting ions → your turn |

One part on stage; numbered lesson text; drag to orbit; scroll to advance; progress rail.

### D. Become the sample / Ride the ions — built (optional after Phase 1 gate)

| Track | Mode | Content |
| --- | --- | --- |
| **ride-lc** | Become the sample | Pick molecule → machine breakdown → LOAD→INJECT → column → read peak |
| **ride-ms** | Ride the ions | Electrospray / quadrupole / spectrum |

Staged play: scroll cannot skip unfinished stages.

### E. API personalization

`GET /api/employee/{joiner_id}/waters` → public story + `you` chain + `sources`.  
Home site via `SMARTSTART_HOME_SITE` (default Bengaluru for GCC demos).

### F. IRA bridge

Finale actions share org-chain vocabulary with IRA (*What does my role do?*).

---

## B3. How the Waters prototype works (exactly)

### Runtime

```
Employee UI
   └─ openWaters()
         ├─ GET /api/employee/{id}/waters  →  waters_explorer.build()
         └─ watersMachine.open({ data, ira… })
               ├─ waters-machine.js          (chapters / finale)
               └─ enterRide → waters-ride.js
                     ├─ observe-*  (How it works)
                     ├─ ride-*     (Become the sample)
                     └─ waters-ride-world.js + WatersGfx3D
```

### Happy path

1. Sign into Employee Experience → pick synthetic profile.  
2. Open **What is Waters?**.  
3. Fetch `/waters` payload.  
4. Explore machine chapters.  
5. Technology → **How it works** (LC or MS) — Phase 1 primary.  
6. Optional: Become the sample / Ride the ions.  
7. Finale **You** + IRA next steps.  
8. Sources remain visible.

Story order: `science → impact → technology → world → people → you`.

### Ride engine

- **Tracks** (films) on a shared timeline, not one mega-scrubber.
- **Observe** = scroll-taught, camera outside.
- **Ride/play** = staged; playhead capped until the stage is done.
- Mode switch mirrors teaching ↔ riding (`observe-lc` ↔ `ride-lc`, etc.).

### Key modules

| Module | Role |
| --- | --- |
| `backend/waters_explorer.py` | Story + personal chain |
| `frontend/waters-machine.js` | Machine UI |
| `frontend/waters-ride*.js` + `waters-gfx3d.js` | Films / play / renderer |
| `frontend/employee.html` / `employee.js` | Entry + IRA wiring |
| `tests/test_waters_explorer.py` | Story/chain tests |

> **Not Phase 1:** React `waters-explore/` (Vite + Three.js). Phase 1 ships the **vanilla SmartStart-integrated** experience.

### Waters tech (current)

Same SmartStart host: FastAPI + vanilla JS + **Canvas 2D / WatersGfx3D**. No WebGL dependency for the Phase 1 path.

### Waters production notes (additive to §A5)

| Concern | Recommendation |
| --- | --- |
| Public story | Cache at CDN/edge; purge on content release |
| Personalization | Tiny scoped `/me/waters`; degrade to chapters 01–05 if it fails |
| Content | Versioned copy + mandatory source URLs; Comms/L&D sign-off |
| Safety | No LLM in Phase 1 machine path; read-only; CSP on static assets |
| Telemetry | `waters_open`, `chapter_view`, `observe_complete`, `finale_shown` — no names in events |
| Flags | `WATERS_MACHINE_ENABLED`; separate flag for playable ride |

---

# Part C — Phase 1 deployment

## C1. In scope (ship)

| # | Deliverable | Done when |
| ---: | --- | --- |
| 1 | SmartStart Employee entry to **What is Waters?** | Joiner can open from Employee Experience |
| 2 | **Machine** (6 chapters + finale chain) | Panels render from API; finale matches signed-in joiner |
| 3 | **Animations** | Assemble/travel/hover/zoom; reduced-motion usable; mobile rail |
| 4 | **How it works** LC + MS | Both observe films complete from Technology |
| 5 | **Safety baseline** | Sources visible; scoped personalization; no React app in release |
| 6 | **Basic telemetry** | Open / chapter / observe-complete / finale (non-PII) |

## C2. Deferred (built, not the Phase 1 gate)

- Become the sample / Ride the ions (feature flag OK)
- React `waters-explore`
- CMS editing UI, audio/captions, multi-language

## C3. Acceptance checklist

- [ ] Joiner opens **What is Waters?** from Employee Experience  
- [ ] Science → People panels render from API  
- [ ] LC and MS **How it works** complete  
- [ ] Animations + reduced-motion path OK  
- [ ] Finale chain correct for signed-in joiner  
- [ ] Sources visible  
- [ ] Desktop Chrome/Edge + representative mobile OK  
- [ ] No dependency on React `waters-explore`

## C4. Rollout

1. Internal demo (synthetic cohort)  
2. Pilot (e.g. one GCC / early-career cohort)  
3. Default-on via feature flag  
4. Phase 2 — enable playable ride; content pipeline; SSO/metrics hardening  

## C5. Stakeholder demo script

1. Portal → Employer (optional): show role-aware Command Center + NIA briefly — *this is SmartStart*.  
2. Portal → Employee → pick a joiner.  
3. Open **What is Waters?**  
4. Explore freely → Technology → LC **How it works** (solvents → pump → injector → column → detector).  
5. World (e.g. Bengaluru) + People (joiner’s node).  
6. Finale **You** + IRA chips.  
7. Call out: public Sources vs personal SmartStart record; all demo data synthetic.

---

## Open questions

| Topic | Recommendation |
| --- | --- |
| Phase 1 include playable ride? | **Observe-only** for the gate; flag the ride |
| Hosting | **Inside SmartStart** for personalization; CDN for static Waters JS |
| Content ownership | Eng ships; Comms/L&D approve copy + sources |
| WebGL later? | Stay on Canvas for Phase 1 |

---

*Document purpose: Confluence source of truth for why SmartStart exists, how the platform works, its stack, and Phase 1 deployment of What is Waters? (machine, animation, machinery explanation).*
