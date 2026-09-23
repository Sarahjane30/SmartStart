# IRA — desktop onboarding companion

**IRA is not a website.** It is a lightweight **desktop** chatbot that floats above your wallpaper and talks to SmartStart over HTTP APIs.

```text
Windows / Linux desktop
        │
        ▼
   ┌─────────┐     REST      ┌────────────┐
   │   IRA   │ ────────────► │ SmartStart │
   │ PySide6 │               │  :8000     │
   └─────────┘               └────────────┘
```

You can use IRA while SmartStart, mock iCIMS, ServiceNow, Jira, or any other app is open — or while looking at an empty desktop.

## Requirements

- Python 3.11+ (on **Python 3.14**, PySide6 **6.10+** is required)
- SmartStart backend (optional — offline FAQ still works)
- Qt via PySide6

```bash
# from repo root (must contain ira/ and show version 0.6.0+)
python -m pip install -e ".[dev,ira]"
```

## Run (Windows PowerShell)

IRA is **not** a URL. You must be on branch `cursor/ira-desktop-companion-76dd` (PR #9).

```powershell
# 0) Get the IRA code (one-time)
git fetch origin
git checkout cursor/ira-desktop-companion-76dd
git pull origin cursor/ira-desktop-companion-76dd

# Confirm you see the ira folder
dir ira

# 1) Install (use python -m — do not rely on bare uvicorn/ira)
python -m pip install -e ".[ira]"

# 2) Terminal A — SmartStart API
python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
# or:  .\scripts\run_smartstart.ps1

# 3) Terminal B — IRA floating widget
python -m ira
# or:  .\scripts\run_ira.ps1
```

If `python -m ira` says `No module named ira`, you are still on the old branch / old install (`smartstart 0.5.0`). Checkout the branch above and reinstall.

## Run (macOS / Linux)

1. Start SmartStart (recommended for context-aware answers):

```bash
python -m uvicorn backend.main:app --reload --port 8000
```

2. Launch IRA in a **separate** process:

```bash
python -m ira
```

IRA appears as a tiny always-on-top bubble (default: bottom-right). Click to expand a resizable chat panel. Drag the bubble to reposition; position is remembered in `~/.smartstart-ira/config.json` (Windows: `%USERPROFILE%\.smartstart-ira\config.json`).

### Sign-in flow (required)

1. Start SmartStart on port 8000.
2. Launch IRA — dark MindBot-inspired companion (~390×620) with **Get Started**.
3. Sign in as Employee (Intern/FTE) in the portal.
4. Return — chat unlocks; progress bar shows Laptop / Mentor / Day 1.

**Look:** Deep navy glass UI, electric-blue glow accents, soft chat bubbles, pill suggestion chips, glowing send orb.

**Sizes:** collapsed glow orb → normal (~390px) → expanded (~540px via ⤢). Drag edges to resize (350–680px wide, up to 90vh tall).

IRA polls `GET /api/ira/session`. The portal writes the session on employee sign-in.

## Demo walkthrough

1. Open the desktop — IRA bubble is visible.
2. Optionally open SmartStart / iCIMS / ServiceNow / Jira in browsers.
3. In IRA, pick **Sarah Jane** (Data Engineering Intern) from the employee list.
4. Ask: *What’s my onboarding status?*
5. Ask: *Am I ready for Day 1?* — IRA combines iCIMS docs + ServiceNow laptop + Jira/project readiness.
6. Update Sarah’s laptop ticket via SmartStart data (or ServiceNow mock flow), refresh (↻), ask: *Is my laptop ready?*

Pinned demo facts (synthetic):

| Field | Value |
|-------|--------|
| Employee | Sarah Jane (`SYN-J-0042-023` on seed 42) |
| Role | INTERN · Data Engineering |
| First day | 2026-09-28 |
| Mentor | Priya Nair |
| Manager | Ava Chen |
| Laptop ticket | REQ-1042 (starts Configured) |

## Behavior

- **Online:** loads `/api/ira/*` context; answers from synthetic onboarding records only.
- **Offline:** general FAQ (HR, IT, Day 1, learning, Jira). Never invents employee-specific facts.
- **Proactive tips:** subtle pulse on the bubble when context suggests a useful nudge (not spammy).

## SmartStart APIs used

| Method | Path |
|--------|------|
| GET | `/api/ira/employees` |
| GET | `/api/ira/{id}/context` |
| GET | `/api/ira/{id}/onboarding` |
| GET | `/api/ira/{id}/tasks` |
| GET | `/api/ira/{id}/it-status` |
| GET | `/api/ira/{id}/learning` |
| GET | `/api/ira/{id}/notifications` |

IRA never loads SmartStart HTML pages.

## Layout

```text
ira/
  __main__.py      # python -m ira
  app.py           # bubble ↔ panel orchestrator
  bubble.py        # minimized floating orb
  chat_panel.py    # compact chat UI
  client.py        # httpx → SmartStart
  brain.py         # context-aware replies (no hallucination)
  faq.py           # offline knowledge base
  config.py        # ~/.smartstart-ira/config.json
```

## Config

`~/.smartstart-ira/config.json`:

```json
{
  "smartstart_base_url": "http://127.0.0.1:8000",
  "employee_id": "SYN-J-IRA-SARAH",
  "bubble_x": null,
  "bubble_y": null,
  "always_on_top": true
}
```
