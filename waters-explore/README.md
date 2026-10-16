# What is Waters?

A standalone, interactive introduction to Waters and the science behind it. Anyone can open it and explore. There is no login, no employee data and no dependency on the SmartStart backend.

The experience has six chapters:

| Chapter | What the visitor gets |
| --- | --- |
| Science | What Waters does (separate, identify, understand) and why analytical science matters |
| Impact | Five real-world areas, each shown as question → measurement → decision |
| Technology | A 3D LC-MS instrument to explore, and an 8-step sample journey through it |
| World | Applications across six industries, plus a globe of selected locations |
| People | The roles behind the science, arranged as an ecosystem |
| You | A universal finale: the visitor picks what matters to them and sees where they fit |

## Running it

```bash
cd waters-explore
npm install
npm run dev        # http://localhost:5173
```

Other scripts:

```bash
npm test           # science model + content checks (Vitest)
npm run typecheck  # TypeScript project build
npm run lint       # oxlint
npm run build      # static site in dist/
npm run preview    # serve the built site locally
```

Requires Node 20 or newer.

## Stack

- **React + TypeScript** (Vite) for the interface, content and navigation
- **Three.js** through React Three Fiber, with a few drei helpers (orbit controls, HTML labels, rounded boxes)
- **Plain CSS** in `src/styles.css`
- **No backend.** All content is static TypeScript.

## How it is organised

```
src/
  content/            static educational content
    index.ts          chapter list, company facts, sources
    chapters.ts       science steps, impact stories, industries, sites, roles, finale
    instrument.ts     instrument parts and the 8 journey steps
  science/            pure, tested model behind the interactive parts
    molecules.ts      paracetamol, caffeine, ibuprofen: real masses, 3D skeletons
    chromatography.ts retention, column progress, chromatogram, resolution
    massSpec.ts       quadrupole transmission, spectrum, identification, ppm error
  three/              3D scenes
    LazyCanvas.tsx    mounts WebGL near the viewport, pauses it off-screen, WebGL fallback
    Instrument.tsx    LC stack + mass spectrometer, clickable parts
    InstrumentScene.tsx camera fly-to, lighting, journey effects per step
    JourneyEffects.tsx  solvent flow, separating bands, electrospray, quadrupole ions
    GlobeScene.tsx    globe with selected locations
    HeroScene.tsx     floating molecules on the landing screen
    layout.ts         instrument geometry, tubing paths, camera goals
  components/         chapter sections, technology panel, SVG plots
  App.tsx             top bar, hero, chapter layout
```

The interactive science is driven by `src/science/`, which is plain TypeScript. The 3D scene and the side panel both read from it, so what the visitor sees in the column, on the chromatogram and on the spectrum always agrees. Masses are real monoisotopic values. Retention times and the instrument layout are simplified for teaching, and the UI says so.

## Deployment

`npm run build` produces a fully static site in `dist/`. It uses relative asset paths (`base: './'`), so it can be served from any path on any static host: an internal web server, Azure Static Web Apps, S3 + CloudFront, SharePoint-hosted static files, and so on.

Generic content does not have to mean public. If the experience should only be available to Waters employees, put the static site behind the company's existing single sign-on at the hosting layer (for example Entra ID in front of the static host). The app itself does not need to change for that.

A backend can be added later if it becomes useful for centrally managed content, analytics or other dynamic features. A database is not needed just to render the experience.

## Accessibility and performance

- Every 3D interaction has a matching button in the HTML panel, so the experience works with a keyboard and without WebGL.
- `prefers-reduced-motion` stops idle animation and smooth scrolling.
- Three.js ships as its own chunk (about 330 KB gzipped), so it caches separately from app code. Canvases only start when they come near the viewport and stop rendering when they leave it.

## Sources

Company facts come from public Waters sources, listed in `src/content/index.ts` and linked at the end of the experience.
