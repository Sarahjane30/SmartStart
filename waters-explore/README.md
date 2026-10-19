# What is Waters?

A standalone rebuild of the SmartStart “What is Waters?” experience — same interaction model and visual language, no login, no employee data, no backend.

It is a full-screen interactive machine. Move to look around, hover a part to light it up, click to open a chapter panel, or start the guided journey. Technology opens into the LC / MS ride (How it works · Become the sample / Ride the ions).

## Run

```bash
cd waters-explore
npm install
npm run dev        # http://localhost:5173
```

```bash
npm test
npm run typecheck
npm run build      # static site in dist/
```

Requires Node 20+.

## What mirrors the original

| Original (HTML / CSS / JS) | This app |
| --- | --- |
| Full-screen `.wm` overlay | Same shell, fonts (Inter + IBM Plex Mono), grain, cyan rail, glass panel |
| Intro: Start the journey / Explore freely | Same |
| Six machine parts + side panels | Science, Impact, Technology, World, People, You |
| Technology → How it works / Become the sample | Observe track + interactive sample journey (Three.js LC-MS) |
| World sites, People nodes | Same public content |
| Personalized You + IRA finale | Universal “where you fit” finale (no employee record) |

Copy for the chapters comes from the same public Waters facts used in `backend/waters_explorer.py`.

## Stack

- React + TypeScript (Vite)
- Three.js via React Three Fiber
- Plain CSS ported from the original `.wm` / `.wr` styles
- No backend

## Layout

```
src/
  content/machine.ts      chapters, sites, roles, part layout
  content/instrument.ts   LC-MS parts + sample journey steps
  science/                tested retention / m/z model
  three/MachineScene.tsx  overview machine
  three/Instrument*.tsx   LC-MS ride scene
  components/Panels.tsx   chapter side panels
  components/RideOverlay.tsx
  App.tsx                 machine shell
  styles.css              original wm/wr look
```

## Deploy

`npm run build` writes a static `dist/` (relative asset paths). Host it anywhere. Keep it employee-only by putting company SSO in front of the static host — the app itself stays generic.
