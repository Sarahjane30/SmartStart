# What is Waters? — Prototype Overview & Phase 1 Deployment

> **How to publish in Confluence:** Create a blank page, set the title to *What is Waters? — Prototype Overview & Phase 1*, then paste this document (Confluence Cloud accepts Markdown paste). Optionally wrap callout blocks in Info / Note / Warning macros.

| Field | Value |
| --- | --- |
| **Product** | SmartStart — employee experience / onboarding |
| **Experience** | *Waters // How it all connects* (“What is Waters?”) |
| **Audience** | New joiners (Interns & FTEs), onboarding stakeholders, engineering |
| **Phase** | **Phase 1** — deploy the machine, animations, and machinery explanation |
| **Status** | Prototype complete (vanilla canvas experience); ready for Phase 1 hosting |
| **Out of scope for this page** | Separate React/Vite `waters-explore` experiment — not the Phase 1 deliverable |

---

## 1. Motive — why we built this

New joiners arrive at Waters with a practical question that slide decks rarely answer well:

> *What does this company actually do — scientifically — and where do I fit?*

HR packets cover policies. Org charts cover reporting lines. Neither makes **liquid chromatography**, **mass spectrometry**, or the **ecosystem of roles** feel real. Joiners outside the lab (software, IT, data, operations, HR, finance) especially struggle to connect their day job to the instruments and decisions Waters enables.

**Motive in one sentence:** give every joiner an interactive, memorable first encounter with Waters science, technology, global footprint, people, and *their own place* in the company — before Day 1 overwhelm sets in.

### Problems we set out to solve

| Problem | Consequence | Prototype response |
| --- | --- | --- |
| Company story is abstract | “Life sciences & diagnostics” stays a slogan | Six-chapter interactive **machine** that joiners can explore |
| LC/MS is hard to explain with slides | Non-scientists tune out | Cinematic **How it works** films + optional **Become the sample** play |
| Org context is buried in systems | Joiners don’t see their chain | Finale builds **Your place** from the joiner’s SmartStart record |
| Public facts vs personal data mixed | Compliance risk | Company story from **public sources only**; personal chain from **synthetic onboarding record** |
| Heavy frameworks slow demos | Hard to ship a first experience | Lightweight **Canvas 2D + custom 3D kit** — no WebGL required for the Phase 1 path |

### Design principles

1. **Motion is navigation** — hover lights a part, click isolates it, scroll travels the story.
2. **Simple first, deeper on demand** — every chamber has a plain-language line and an optional deeper explanation.
3. **Teach, then invite** — “How it works” (third person) before “Become the sample” (first person).
4. **Grounded content** — public company facts cited; personal placement never invents HR data.
5. **Accessible by default** — keyboard path, `prefers-reduced-motion`, works without WebGL.
6. **IRA handoff** — the finale connects to the employee companion (meet team, understand role, explore tools).

---

## 2. What we have built

### 2.1 Experience name

**Waters // How it all connects** — launched from the Employee Experience as **“What is Waters?”**.

Entry points:

- Employee nav button / teaser card: *Explore the machine*
- Deep link: employee portal with `#waters`
- Full-screen modal overlay (`#wm`) over the employee UI

### 2.2 Feature inventory (all prototype capabilities)

Phase 1 deploys the first three pillars; the rest are built and should be kept in the product vision.

#### A. Interactive machine (chapter explorer) — **Phase 1**

A full-screen interactive scene where six “parts” assemble into one machine:

| Chapter | Label | What the joiner gets |
| --- | --- | --- |
| **01 Science** | What does Waters do? | Separate → identify → understand; LC, MS, informatics in plain language |
| **02 Impact** | Why does it matter? | Real-world areas: medicines, food & water, diagnostics, antibiotic resistance |
| **03 Technology** | Inside the chambers | LC and MS chambers with simple + deeper text; entries into the films / rides |
| **04 World** | Waters around the world | ~16,000 colleagues framing; interactive globe with selected sites (e.g. Milford, Wilmslow, Wexford, Bengaluru GCC) |
| **05 People** | Who works here? | Ecosystem network: scientists, engineers, software, data, operations, sales, service, business, HR |
| **06 You** | Your place in the machine | Personal org chain ending in the joiner’s name, role, team, manager, mentor, site |

**Machine interactions**

- Look around (pointer parallax / camera yaw–pitch)
- Hover → part lights up
- Click → isolate chapter + side panel
- Click again → zoom deeper
- Scroll / arrow keys → travel chapter to chapter
- Esc → step back
- Mobile: scrollable chapter rail; scene above the content sheet
- Intro screen → *Explore freely*
- Finale → personal card + **Replay** + IRA action chips (Meet my team, Understand my role, Explore my tools, Ask IRA)
- Sources footer listing public Waters references

#### B. Animation & visual system — **Phase 1**

- Assemble / disassemble of machine parts
- Connecting “pipes” between chapters
- Dust / particle atmosphere, glass spheres, glow, depth-aware strokes
- Globe spin and site markers
- People network (nodes + edges)
- Finale “you” path animation into the core
- Shared **WatersGfx3D** kit for instrument-scale scenes: perspective camera, painter’s-algorithm depth queue, Lambert + specular + Fresnel, glass, tubing — **Canvas 2D, no WebGL dependency**
- Reduced-motion respect (`prefers-reduced-motion`)

#### C. Explaining the machinery (“How it works”) — **Phase 1**

From Technology, joiners open a dedicated film for the chosen instrument:

| Track | Mode | Content |
| --- | --- | --- |
| **observe-lc** | How it works (LC) | Assembled LC tower → breaks into five modules → solvents → pump → injector (6-port rotary valve) → column → UV detector → reading peaks → handoff to “your turn” |
| **observe-ms** | How it works (MS) | How MS works → ion source → quadrupole → counting ions → your turn |

Teaching pattern per step:

- One part on stage at a time
- Kicker + numbered progress (e.g. `LC · 02 / 06`)
- Only the **current** step’s lesson text
- Drag to orbit; scroll to advance
- Hairline progress rail + chapter whisper HUD

#### D. Become the sample / Ride the ions — built (post–Phase 1 optional enablement)

| Track | Mode | Content |
| --- | --- | --- |
| **ride-lc** | Become the sample | Staged play: pick a molecule → machine breakdown → turn injector LOAD→INJECT → steer through the column → read your peak |
| **ride-ms** | Ride the ions | First-person continuation into electrospray / quadrupole / spectrum identification |

Playable LC stages (gated — scroll does not skip unfinished work):

1. **Pick a molecule** — e.g. water-loving vs greasy retention behaviour (teaching C18 interaction)
2. **The machine** — tower comes apart into reservoir, pump, injector, column, detector
3. **Injector** — plumbed 6-port rotary valve; handle follows the lever; sample loop
4. **Column** — live separation simulation; retention ranking explained in plain language
5. **Peak** — read your chromatogram peak; retry as another molecule or continue to MS

Cross-links at LC outro: *Next: Ride the ions (MS)* · *How LC works* · *Back to the machine*.

#### E. Content & personalization API

`GET /api/employee/{joiner_id}/waters` returns:

- Public company story (science, impact, technology chambers, world sites, people nodes, sources)
- Joiner-specific **your place** chain: Company → business area → department → team → role → you
- Home site configurable via `SMARTSTART_HOME_SITE` (default Bengaluru for GCC demos)

**Invariant:** company facts are public; the personal chain comes only from the SmartStart joiner record (prototype uses 100% synthetic PII).

#### F. IRA bridge

Finale actions reuse the same org-chain vocabulary IRA uses for *“What does my role do?”*, so the machine and the companion stay consistent.

---

## 3. How the prototype works (exactly)

### 3.1 Runtime shape

```
Employee UI (vanilla HTML/JS)
        │
        ├─ openWaters()
        │     └─ GET /api/employee/{id}/waters
        │           └─ waters_explorer.build(joiner_id)
        │
        └─ watersMachine.open({ data, ira callbacks… })
              │
              ├─ Chapter machine (waters-machine.js)     ← Canvas 2D story world
              │     └─ enterRide(kind, track)
              │           └─ waters-ride.js orchestrator
              │                 ├─ observe-*  (waters-ride-observe.js)  ← How it works
              │                 ├─ ride-*     (waters-ride-play.js)     ← Become the sample
              │                 └─ world assets (waters-ride-world.js)
              │                       └─ WatersGfx3D (waters-gfx3d.js)
              └─ Finale → IRA navigation hooks
```

### 3.2 End-to-end joiner path (happy path)

1. Joiner signs into Employee Experience and selects their synthetic profile.
2. They open **What is Waters?** (button, teaser, or `#waters`).
3. Client fetches `/api/employee/{id}/waters`.
4. Intro: *“An interactive machine…”* → **Explore freely**.
5. Machine assembles; joiner explores Science → Impact → Technology → World → People.
6. In Technology they choose **How it works →** for LC or MS (Phase 1 primary path).
7. Observe film teaches parts one-by-one; optional mode switch to Become the sample / Ride the ions.
8. Returning to the machine, they reach **You**; finale reveals their chain and IRA next steps.
9. Sources remain visible; company claims stay tied to public references.

### 3.3 Interaction model (machine)

| Input | Behaviour |
| --- | --- |
| Pointer move | Soft camera look + hover highlight |
| Click part | Activate chapter; open panel |
| Second click / zoom affordance | Deeper isolation |
| Scroll / → | Next chapter along story order |
| ← / Esc | Step back / overview |
| Click site / people node | Soft focus + panel detail |
| Ride enter buttons | Leave machine canvas; open LC/MS film |

Story order is fixed:  
`science → impact → technology → world → people → you`

### 3.4 Ride engine model

- Shared timeline with **tracks** (films), not one scrubbable mega-timeline.
- Each track has chapter range `[lo, hi)` on that timeline.
- **Observe** tracks: scroll advances the film; camera stays outside the instrument.
- **Ride / play** tracks: **staged** — playhead capped at the first unfinished stage; transitions play themselves.
- Mode switch mirrors teaching ↔ riding for the same instrument (`observe-lc` ↔ `ride-lc`, etc.).
- Real-time dissolve between scene cuts; progress rail jumps via autopilot.

### 3.5 Content rules

| Layer | Source of truth | Notes |
| --- | --- | --- |
| Company narrative | `backend/waters_explorer.py` constants + `SOURCES` | Public Waters / IR / careers references only |
| Sites & divisions | Same module | Home site via env |
| Personal chain | Joiner record + team directory mapping | Synthetic IDs/emails in the sandbox |
| Science teaching copy | Observe / play modules | Simplified for teaching; UI language stays honest about simplification |
| Graphics primitives | `WatersGfx3D` | Shared by machine ride scenes |

### 3.6 Key modules (Phase 1 codebase)

| Module | Role |
| --- | --- |
| `backend/waters_explorer.py` | Story payload + personal chain builder |
| `backend/main.py` → `GET /api/employee/{id}/waters` | API surface |
| `frontend/waters-machine.js` | Full-screen machine, chapters, finale, ride entry |
| `frontend/waters-ride.js` | Track orchestrator, HUD, scroll/key handling |
| `frontend/waters-ride-observe.js` | How it works films (LC & MS) |
| `frontend/waters-ride-play.js` | Become the sample staged play |
| `frontend/waters-ride-world.js` | Instrument / column / molecule / quadrupole drawing |
| `frontend/waters-gfx3d.js` | Shared Canvas 3D renderer kit |
| `frontend/employee.html` / `employee.js` | Entry points, open/close, IRA wiring |
| `tests/test_waters_explorer.py` | Story + personal chain tests |

> **Not Phase 1:** the separate React + R3F app under `waters-explore/` (Vite/Three.js). Phase 1 ships the **vanilla SmartStart-integrated** experience above.

---

## 4. Current tech stack (prototype)

| Layer | Choice | Why it fits the prototype |
| --- | --- | --- |
| Backend | Python 3.11+, FastAPI, Pydantic, Uvicorn | Already powers SmartStart Layers 1–4; same auth/session model |
| Data | In-memory synthetic cohort (Faker, fixed seed) | No real PII; reproducible demos |
| Employee UI shell | Vanilla HTML / CSS / JS | Fast iteration; no SPA build for the machine |
| Machine & films | Canvas 2D + custom `WatersGfx3D` | Zero WebGL requirement; consistent look; small deploy surface |
| Packaging | Hatch / `pyproject.toml` | `uvicorn backend.main:app` |
| Quality | Pytest (explorer story/chain), ruff | Guards content contracts |
| Companion | IRA (PySide6 desktop) over `/api/ira/*` | Optional handoff after finale — not required to view the machine |

**What we deliberately did *not* put in the Phase 1 path**

- React / Vite / React Three Fiber (`waters-explore`) — parallel experiment
- Real iCIMS / ServiceNow / Jira calls — mocks only elsewhere in SmartStart
- User-generated content or CMS — static governed copy in code for the prototype

---

## 5. Proposed tech stack (production-minded)

Phase 1 can deploy the prototype nearly as-is behind enterprise hosting. The stack below is the **recommended evolution** for scale, safety, operability, and content governance — without forcing a rewrite before first value.

### 5.1 Principles

| Principle | Implication |
| --- | --- |
| **Safety first** | Public company facts only in the open story; personalization from HR-approved attributes; no secrets in the browser bundle |
| **Least privilege** | Machine API scoped to the signed-in joiner; no cohort leakage |
| **Scalability** | Static assets on CDN; API only for personalization; cache public story aggressively |
| **Observability** | Product analytics (chapter completion) ≠ PII logging |
| **Accessibility** | Keep keyboard + reduced-motion paths; WCAG AA target |
| **Content integrity** | Citations required; science simplifications labelled; legal/comms review gate |

### 5.2 Recommended architecture (Phase 1 → Phase 2)

```
                    ┌─────────────────────────────┐
   Joiner SSO       │  Edge / API gateway         │
   (Entra ID etc.)  │  WAF · rate limits · TLS    │
                    └──────────────┬──────────────┘
                                   │
              ┌────────────────────┼────────────────────┐
              ▼                    ▼                    ▼
     Static CDN / SWA      Experience API         Existing IRA APIs
     machine JS/CSS/HTML   public story (cached)  (unchanged)
                           + /me/waters (scoped)
                                   │
                                   ▼
                           Content store (Git or CMS)
                           reviewed public copy + sources
                                   │
                                   ▼
                           Identity attributes (read-only)
                           department, manager, site, role
```

### 5.3 Stack proposal by concern

| Concern | Phase 1 (deploy now) | Next hardening |
| --- | --- | --- |
| **Hosting** | Internal static host or Azure Static Web Apps / App Service for SmartStart | Front with Entra ID; CDN caching for `/static/waters-*` |
| **App runtime** | FastAPI (current) | Keep; split “public story” JSON from “me” personalization if traffic grows |
| **AuthN/Z** | Demo employee picker (sandbox) | Enterprise SSO; API must only return *that* joiner’s chain |
| **Frontend** | Vanilla machine + Canvas kit (current) | Keep for Phase 1; revisit WebGL/Three only if visual fidelity requires it |
| **Content** | Python module + JS lesson copy | Move public narrative to versioned Markdown/JSON with review workflow; keep sources URLs mandatory |
| **Science model** | Teaching-simplified animations | Optional shared science package with unit tests (retention, m/z teaching values) |
| **Safety / abuse** | Synthetic data | Input length limits already; add rate limits; strip any free-text from analytics |
| **Privacy** | Synthetic emails/IDs | In production: minimize attributes (role title, dept, site, manager display name only); no salary/performance |
| **Secrets** | None in waters modules | Standard secret store for app config; no keys in frontend |
| **Observability** | App logs | Structured events: `waters_open`, `chapter_view`, `observe_complete`, `finale_shown` — anonymous session id + role band, not name |
| **Performance** | Canvas pauses when closed | Lazy-load ride modules; asset fingerprinting (`?v=`); CDN compression |
| **Resilience** | Single process prototype | Multi-instance API + health checks; static story fallback if personalization fails (show machine without “You” card) |
| **Compliance / brand** | Public sources listed in UI | Legal/comms sign-off checklist before each content release |
| **Accessibility** | Keyboard + reduced motion | Automated axe checks in CI; transcript/captions for longer films if audio is added later |
| **Testing** | Pytest on payload | Contract tests for API; visual smoke on machine open; Lighthouse CI budget |
| **Delivery** | Manual / branch demos | CI → staging → prod; feature flag `WATERS_MACHINE_ENABLED`; flag for ride play vs observe-only |

### 5.4 Safety controls (explicit)

1. **Content boundary** — marketing/science copy never pulled from model output; no LLM in the Phase 1 machine path.
2. **Personalization boundary** — only attributes the joiner is already allowed to see in Employee Experience.
3. **Failure mode** — if `/waters` personalization fails, still show chapters 01–05; degrade finale gracefully.
4. **Citation** — every factual company claim maps to a `SOURCES` entry shown in the UI.
5. **No production system writes** — the experience is read-only; IRA remains recommend/navigate, humans approve.
6. **Supply chain** — pin dependency versions; SCA on Python deps; CSP on static host (`script-src` self).

### 5.5 Scalability notes

- Public story JSON is identical for all joiners → **cache at edge** (e.g. 1h–24h) with purge on content release.
- Personalization payload is tiny (chain + highlight node) → cheap per-user; no WebSocket required.
- Canvas work is client-side CPU/GPU; server cost stays API + static bytes.
- Horizontal scale = more API replicas + CDN; no sticky sessions required for Waters.

---

## 6. Phase 1 — deployment scope

### 6.1 In scope (ship)

| # | Deliverable | Definition of done |
| ---: | --- | --- |
| 1 | **What is Waters?** machine | Employee entry → six chapters → finale with personal chain |
| 2 | **Animation system** | Assemble/travel/hover/zoom motions; reduced-motion path; mobile chapter rail |
| 3 | **Explaining machinery** | LC and MS **How it works** observe films from Technology |
| 4 | **Hosting + access** | Reachable in the target environment (VPN/SSO as required) |
| 5 | **Safety baseline** | Public sources visible; personalization scoped; no React app in the release train |
| 6 | **Basic telemetry** | Open / chapter / observe-complete / finale events (non-PII) |

### 6.2 Explicitly deferred (built, not required for Phase 1 gate)

- Become the sample / Ride the ions playable tracks (can sit behind a feature flag)
- React `waters-explore` standalone rebuild
- CMS-driven content editing UI
- Audio narration / captions pack
- Multi-language

### 6.3 Phase 1 acceptance checklist

- [ ] Joiner can open **What is Waters?** from Employee Experience
- [ ] Science, Impact, Technology, World, People panels render from API data
- [ ] Technology offers **How it works** for LC and MS and both films complete
- [ ] Animations run; with reduced-motion, experience remains usable
- [ ] Finale shows the correct chain for the signed-in joiner
- [ ] Sources list is visible
- [ ] Works on current desktop Chrome/Edge and a representative mobile viewport
- [ ] No dependency on the React `waters-explore` package for the release

### 6.4 Suggested rollout

1. **Internal demo** — SmartStart staging, synthetic cohort only  
2. **Pilot** — one GCC / early-career cohort with feedback form  
3. **Default on** — feature flag enabled for all new joiners in Employee Experience  
4. **Phase 2** — enable Become the sample; content pipeline; SSO hardening metrics review  

---

## 7. Demo script (for stakeholders)

1. Sign in as an Intern or FTE in Employee Experience.  
2. Click **What is Waters?**  
3. Explore freely — hover Technology, open LC **How it works**.  
4. Scroll the film through solvents → pump → injector → column → detector.  
5. Return; open World (Bengaluru) and People (highlight the joiner’s node).  
6. Finish on **You** — show chain + IRA next steps.  
7. Point to Sources: public facts vs personal SmartStart record.

---

## 8. Open questions / decisions

| Topic | Options | Recommendation |
| --- | --- | --- |
| Phase 1 include playable ride? | Observe-only vs observe+ride | **Observe-only** for the gate; flag the ride |
| Hosting | Inside SmartStart vs separate static site | **Inside SmartStart** for personalization; CDN for static JS |
| Content ownership | Eng vs Comms/L&D | Eng ships; Comms/L&D approve copy + sources |
| WebGL later? | Stay on Canvas kit vs adopt Three.js | Stay on Canvas for Phase 1; revisit only for fidelity gaps |

---

## 9. Appendix — quick reference

### API

```http
GET /api/employee/{joiner_id}/waters
```

Returns company story + `you` chain + `sources`.

### Local run (sandbox)

```bash
python -m pip install -e ".[dev]"
uvicorn backend.main:app --reload --port 8000
# Portal → Employee → What is Waters?
# or open employee view with #waters
```

### Related SmartStart context

SmartStart remains a **synthetic** onboarding platform (Layers 1–4 + IRA). Waters machine is the joiner-facing **company & science orientation** layer — complementary to Employer Command Center and NIA, not a replacement for HR systems.

---

*Document purpose: Confluence source of truth for motive, scope, behaviour, current stack, proposed production stack, and Phase 1 deployment boundaries.*
