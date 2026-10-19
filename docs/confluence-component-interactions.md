# How SmartStart components interact

> Paste this as a Confluence child page under *SmartStart & What is Waters?*, or append as **Part D**.

This page explains **cross-surface flows**: what happens when one role does something, and how that shows up for another role / IRA / NIA. All paths share one synthetic backend store — there is no separate “employee database” vs “employer database.”

---

## 0. Shared backbone (read this once)

```
┌─────────────┐   session + role    ┌──────────────────┐
│ Employer UI │ ──────────────────► │ FastAPI backend  │
│ (HR/IT/Mgr) │                     │  role_context    │
└─────────────┘                     │  DataStore       │◄── Faker cohort (seed)
                                    │  _ASSIGNED       │
┌─────────────┐   joiner id         │  resolutions     │
│ Employee UI │ ──────────────────► │  learning tracks │
└─────────────┘                     └────────┬─────────┘
                                             │
                    ┌────────────────────────┼────────────────────────┐
                    ▼                        ▼                        ▼
              IRA desktop              NIA (employer)           Mock apps
           GET /api/ira/{id}/*       POST /api/nia/ask        iCIMS / SNow / Jira
           (context + knowledge)     (same role_context)      (opened in new tab)
```

**Rule:** Employer and Employee UIs are different shells. They both call the **same** learning / notification builders. If a manager adds a course, it is appended to an in-memory `_ASSIGNED[joiner_id]` list; the next time the employee (or IRA, or NIA, or the manager Learning page) asks for that joiner’s track, the course is there.

---

## 1. Example — Manager clicks “+ Add course”

### Who can do it

| Role | View Learning | Add / remove course |
| --- | :---: | :---: |
| Manager (own team) | Yes | Yes |
| Ops | Yes | Yes |
| HR | Yes (view only) | No |
| IT | No | No |

Backend enforces this via `permissions["manage_learning"]` / `view_learning` — not just hidden buttons.

### Step-by-step

```
Manager Command Center
  │  Learning page or joiner drawer
  │  clicks “+ Add course”
  ▼
POST /api/employer/joiners/{id}/learning
  body: { course_id }  OR  { title, minutes, note?, due_date? }
  │
  ├─ _learning_ctx(session, manage=True)     → 403 if not Mgr/Ops
  ├─ ctx.require_joiner(id)                  → 404 if outside team scope
  └─ assign_course(id, by=<manager name>, …)
        │
        └─ append to _ASSIGNED[joiner_id]
              { title, by, note, due_date, at, suffix… }
```

### What appears on the employee side

When the joiner opens Employee Experience (or refreshes), the UI loads in parallel:

| Call | What they see |
| --- | --- |
| `GET /api/learningtrack/{id}` | New module in **Learning** tab — badge **“Added by Ava Chen · due …”**, status `AVAILABLE` (not locked behind the role catalog) |
| `GET /api/notifications/{id}` | New **ACTION** notification: *“New course from Ava Chen — Ava Chen added “SQL for analysis” to your learning. Due 2026-09-20. Note: …”* |

`build_learning_track()` always returns:

1. Role catalog modules (Welcome, Security, Git Basics, …)  
2. **Plus** every entry in `_ASSIGNED[joiner_id]`

So employer Learning and employee Learning are the **same function** — employer wraps it with a library + manage flag:

- Employer: `GET /api/employer/joiners/{id}/learning` → `{ track, summary, library, can_manage }`
- Employee: `GET /api/learningtrack/{id}` → same `track`

### What else updates (same write)

| Surface | How it sees the course |
| --- | --- |
| Manager Learning page | `learning_summary()` → `assigned_count`, `assigned_open`, `overdue` |
| Joiner drawer (employer) | Same track; “Added by …” chips |
| **NIA** | Asking “How is Sarah’s learning going?” / “Add SQL… to Sarah” uses the same summary; “Add …” returns a **confirm** card, then Confirm calls the same `assign_course` path |
| **IRA** (employee) | `GET /api/ira/{id}/context` includes `learning` from `build_learning_track` — so IRA can talk about the new module |
| Remove course | `DELETE …/learning/{module_id}` — only employer-added modules; blocked if already completed |

### Sequence (happy path)

```
Mgr UI --POST add course--> API --write--> _ASSIGNED[Sarah]
                                              │
Employee UI --GET learningtrack--> API --read─┘----► module + “Added by …”
Employee UI --GET notifications--> API --read─┘----► “New course from …”
IRA desktop --GET /ira/{id}/context--> API --------► learning.modules includes it
Mgr UI      --GET /employer/learning--> API -------► completion % / open added courses
```

There is **no push/WebSocket**. The employee sees it on the next fetch (page load / tab refresh). Prototype is request/response only.

---

## 2. Example — How IRA answers a question

IRA is **not** a free-form LLM bolted onto HR. It is a desktop companion that:

1. Knows **who** is signed in (SmartStart session bridge)  
2. Loads **approved context** for that joiner  
3. Routes the question through **brain** (rules + grounded knowledge)  
4. **Never** writes to iCIMS / ServiceNow / Jira production

### Identity bridge

```
Employee signs into SmartStart portal
        │
        ▼
POST /api/ira/session  { employee_id, name, department, role_type }
        │
        ▼
IRA desktop polls GET /api/ira/session
        │
        ▼
Chat unlocks for that identity
```

Sign-out / return to portal → `DELETE /api/ira/session`.

### Context pack (one payload)

```
GET /api/ira/{joiner_id}/context
        │
        ├─ employee profile (name, dept, manager, mentor, role_title, team, …)
        ├─ onboarding state + open tasks + checklist
        ├─ IT ticket snapshot (hardware, software, SLA)
        ├─ documents status
        ├─ learning track  ◄── includes manager-added courses
        ├─ notifications
        ├─ blockers / next-best-actions / briefing / risk (intelligence layer)
        ├─ recommended apps (knowledge catalog)
        ├─ directory people IRA may email (team + consult only)
        └─ Waters “your place” chain (same as What is Waters? finale)
```

Desktop IRA keeps this `ctx` in memory and passes it into `ira.brain.respond(query, ctx)`.

### Answer pipeline (inside `ira/brain.py`)

```
User question
     │
     ▼
respond()
     ├─ small talk / greeting?
     ├─ coach practice mode?          → role-play, not knowledge
     ├─ workplace basics “how do I…?” → guide mode
     └─ answer_core()
            │
            ├─ email draft request?   → draft from directory + templates (no send)
            ├─ directory / who?       → people from ctx only
            ├─ personal onboarding?   → state, laptop, docs, learning from ctx
            ├─ what-if / blockers?    → intelligence rules + ctx
            ├─ enterprise knowledge?  → grounded retrieve over approved sources
            │         (knowledge_base/*.md + knowledge catalog)
            │         refuse if nothing matches — no inventing
            └─ fallback / clarify     → “I don’t have that in approved sources…”
```

**Grounding (`backend/grounded.py`):** retrieve top chunks from the approved source library → extractive (or model-assisted) answer with **citations** → if coverage is weak, return a **refusal** with closest topic suggestions. Installed into IRA via `ira_hook`.

**Personalization:** when a knowledge hit matches, `personalize_knowledge_answer(entity, ctx)` can weave in *this* joiner’s manager, ticket id, stage, etc. — still from ctx, not guessed.

### What IRA will / won’t do

| Will | Won’t |
| --- | --- |
| Answer WHAT / WHERE / WHO / WHAT NEXT / WHY / WHAT IF from approved + personal ctx | Change HR records, salaries, permissions |
| Draft an email to someone in the joiner’s directory | Send email or raise a real ticket |
| Point to mock iCIMS / ServiceNow / Jira | Embed those systems or write to them |
| Use learning track including manager-added courses | See another employee’s record |
| Refuse when not in approved sources | Hallucinate policy |

### Web FAQ twin

Employee page also has a lighter `GET /api/chatbot/{id}?q=` (`backend/chatbot.py`) — keyword FAQ over the same synthetic knowledge themes. Desktop IRA is the richer path (brain + grounded + coach + drafts).

---

## 3. Example — IT resolves a bottleneck; HR still sees theirs

```
IT user clicks Resolve on Sarah’s laptop issue
        │
        ▼
POST /api/employer/joiners/{id}/resolve
        │
        └─ resolutions.resolve(joiner_id, queue="IT", bottleneck, actor, note)
              │
              ▼
         stored per (joiner, owner queue)

Effects for IT:
  • leaves IT alerts / action queue / NIA priority for that IT issue
  • appears under Alerts → Resolved (IT can “Still needs help” → reopen)

Does NOT:
  • clear HR’s document bottleneck for the same joiner
  • change the joiner’s overall state machine by itself
```

Employee side still sees IT status via their profile / notifications from the ticket fields; Resolve is an **employer queue** concept, not a silent rewrite of ServiceNow.

---

## 4. Example — NIA (employer) vs IRA (employee)

| | **IRA** | **NIA** |
| --- | --- | --- |
| Who | Joiner | HR / IT / Manager / Ops |
| Where | Desktop app (+ light web FAQ) | Floating panel in Command Center |
| Context | `build_ira_context(joiner)` | `build_role_context(session)` — **same scope as dashboard** |
| Ask API | Brain on desktop using `/api/ira/*` | `POST /api/nia/ask` |
| Actions | Draft / navigate / explain | Confirm-gated Assign / Resolve; open mock system links |
| Scope rule | One signed-in joiner | Manager never sees another team’s joiners |

NIA priority list is literally derived from the dashboard action queue — so NIA and the table never disagree on “what’s first.”

---

## 5. Example — What is Waters? uses the same joiner record

```
Employee clicks What is Waters?
        │
        ▼
GET /api/employee/{id}/waters
        │
        ├─ PUBLIC story (science, impact, LC/MS, sites, people, sources)
        └─ your_place(joiner) from SmartStart record
              Company → business area → dept → team → role → you
        │
        ▼
watersMachine.open(data) → finale “You” + IRA chips
        │
        └─ “Understand my role” asks IRA using the same org chain
```

Company facts never come from the joiner record; the personal chain never comes from marketing copy.

---

## 6. Example — Employee completes a module; manager sees progress

```
Employee Learning tab → Complete module
        │
        ▼
POST /api/learningtrack/{id}/modules/{module_id}/complete
        │
        └─ mark suffix in _COMPLETED[joiner_id]
        ▼
build_learning_track() → higher completion_pct

Manager later:
  GET /api/employer/learning  → sorted by completion_pct (lowest first)
  NIA: “Who is behind on learning?” → same summaries
```

Again: one store, many readers.

---

## 7. Interaction map (cheat sheet)

| If this happens… | Written where? | Visible to… |
| --- | --- | --- |
| Manager adds course | `_ASSIGNED` | Employee Learning + Notifications; Mgr Learning; NIA; IRA context |
| Manager removes course | `_ASSIGNED` remove | Same readers (gone on next fetch); blocked if completed |
| Employee completes module | `_COMPLETED` | Employee track; Mgr Learning %; IRA/NIA summaries |
| IT/HR/Mgr Resolve | `resolutions` store | That role’s alerts/queue/NIA; Alerts → Resolved |
| Still needs help | resolutions reopen | Back on that role’s queue |
| Employee signs in | `_active_session` | IRA desktop unlock |
| NIA “Open ServiceNow” | — (no write) | New tab to mock app with record id |
| IRA drafts email | — (client-side draft) | User copies/sends manually; recipients limited to directory |
| What is Waters open | read-only | Employee machine; finale from joiner record |

---

## 8. Why this design

1. **Single source of truth** — no sync jobs between “employer learning DB” and “employee learning DB.”  
2. **Role enforcement at API** — UI hiding is not security.  
3. **Assistants are lenses** — IRA/NIA read the same builders the dashboards use.  
4. **Confirm gates** — NIA should not silently mutate; Confirm reuses Command Center handlers.  
5. **Mocks stay external** — deep links educate joiners/employers without pretending SmartStart *is* ServiceNow.

---

*Use alongside the main Confluence page (Part A platform, Part B Waters, Part C Phase 1).*
