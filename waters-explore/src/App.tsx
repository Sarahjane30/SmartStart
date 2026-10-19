import { useCallback, useEffect, useState } from 'react';
import { ChapterPanel } from './components/Panels';
import { RideOverlay } from './components/RideOverlay';
import {
  CHAPTERS,
  ORDER,
  SOURCES,
  YOU,
  type ChapterId,
  type RideKind,
  type RideTrack,
} from './content/machine';
import { useReducedMotion } from './hooks';
import { LazyCanvas } from './three/LazyCanvas';
import { MachineScene } from './three/MachineScene';

export default function App() {
  const still = useReducedMotion();
  const [started, setStarted] = useState(false);
  const [free, setFree] = useState(false);
  const [active, setActive] = useState<ChapterId | null>(null);
  const [hover, setHover] = useState<ChapterId | null>(null);
  const [chamber, setChamber] = useState(0);
  const [area, setArea] = useState(-1);
  const [site, setSite] = useState<string | null>(null);
  const [node, setNode] = useState<string | null>(null);
  const [youT, setYouT] = useState(0);
  const [finale, setFinale] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [ride, setRide] = useState<{ kind: RideKind; track: RideTrack } | null>(null);
  const [rideOpen, setRideOpen] = useState(false);

  const youStage = !active || active !== 'you' ? 0 : youT > 3.2 ? 4 : youT > 2.5 ? 3 : youT > 1.6 ? 2 : youT > 0.6 ? 1 : 0;

  useEffect(() => {
    if (active !== 'you' || finale) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      setYouT((t) => Math.min(6, t + (now - last) / 1000));
      last = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, finale]);

  const begin = (freely: boolean) => {
    setStarted(true);
    setFree(freely);
    if (!freely) setActive('science');
  };

  const goStep = useCallback(
    (delta: number) => {
      if (!active) {
        if (delta > 0) setActive('science');
        return;
      }
      const i = ORDER.indexOf(active) + delta;
      if (i < 0) {
        setActive(null);
        setFree(true);
        return;
      }
      if (i >= ORDER.length) {
        setFinale(true);
        return;
      }
      const next = ORDER[i];
      setActive(next);
      if (next === 'you') setYouT(0);
    },
    [active],
  );

  const select = (id: ChapterId) => {
    setStarted(true);
    setFree(false);
    setActive(id);
    if (id === 'you') setYouT(0);
    setFinale(false);
  };

  const replay = () => {
    setFinale(false);
    setActive(null);
    setYouT(0);
    setStarted(false);
    setFree(false);
    setSite(null);
    setNode(null);
    setChamber(0);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (rideOpen) setRideOpen(false);
        else if (sourcesOpen) setSourcesOpen(false);
        else if (finale) setFinale(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rideOpen, sourcesOpen, finale]);

  return (
    <div
      className={`wm is-open${started && active ? ' is-active' : ''}${rideOpen ? ' is-ride' : ''}`}
      data-you={active === 'you' ? String(youStage) : undefined}
      role="application"
      aria-label="Waters — how it all connects"
    >
      <LazyCanvas className="wm-canvas" label="Interactive Waters machine" camera={{ position: [0, 0.4, 7.2], fov: 42 }} fallback={null}>
        <MachineScene
          active={finale ? null : active}
          hover={hover}
          free={free || !active}
          chamber={chamber}
          area={area}
          site={site}
          node={node}
          youStage={youStage}
          still={still}
          showLabels={started && !rideOpen && !finale}
          onHover={setHover}
          onSelect={select}
          onSite={setSite}
        />
      </LazyCanvas>
      <div className="wm-grain" aria-hidden />

      <header className="wm-top">
        <div className="wm-brand">
          <strong>Waters</strong>
          <span>//</span>
          How it all connects
        </div>
        <nav className="wm-rail" aria-label="Chapters">
          {ORDER.map((id) => (
            <button
              key={id}
              type="button"
              className={`wm-rail-btn${active === id ? ' is-on' : ''}`}
              onClick={() => select(id)}
            >
              <span>{CHAPTERS[id].index}</span>
              <em>{CHAPTERS[id].label}</em>
            </button>
          ))}
        </nav>
        <div className="wm-top-actions">
          <button type="button" className="wm-src-btn" onClick={() => setSourcesOpen(true)}>
            Sources
          </button>
        </div>
      </header>

      <section className={`wm-intro${started ? ' is-gone' : ''}`}>
        <p className="wm-intro-kicker">Waters // How it all connects</p>
        <h1>
          What is
          <br />
          Waters?
        </h1>
        <p className="wm-intro-sub">
          An interactive machine. Move to look around, hover a part to light it up, click to open it — or start the journey through.
        </p>
        <div className="wm-intro-actions">
          <button type="button" className="wm-cta primary" onClick={() => begin(false)}>
            Start the journey ↓
          </button>
          <button type="button" className="wm-cta" onClick={() => begin(true)}>
            Explore freely
          </button>
        </div>
      </section>

      {active && !rideOpen && !finale && (
        <ChapterPanel
          active={active}
          chamber={chamber}
          area={area}
          site={site}
          node={node}
          youStage={youStage}
          onChamber={setChamber}
          onArea={setArea}
          onSite={setSite}
          onNode={setNode}
          onNav={goStep}
          onRide={(kind, track) => { setRide({ kind, track }); setRideOpen(true); }}
        />
      )}

      {active === 'you' && !finale && (
        <>
          <div className="wm-you-word" aria-hidden>
            And you?
          </div>
          <div className="wm-you-float" aria-hidden>
            <strong>You</strong>
            <span className="l2">Part of the chain</span>
            <span className="l2 dim">Science · Technology · People</span>
          </div>
        </>
      )}

      <section className={`wm-finale${finale ? ' is-show' : ''}`} hidden={!finale}>
        <p className="wm-ira-name">What is Waters?</p>
        <h2 className="wm-ira-line">You are part of the chain</h2>
        <p className="wm-ira-sub">{YOU.lead}</p>
        <ol className="wm-journey">
          <li className="is-done">What is Waters?</li>
          <li className="is-done">Why it matters</li>
          <li className="is-done">How LC and MS work</li>
          <li className="is-done">Where you fit</li>
        </ol>
        <button type="button" className="wm-replay" onClick={replay}>
          Replay the machine
        </button>
      </section>

      <div className="wm-hint">{started && !active && free ? 'Click a part of the machine — or use the chapter rail above.' : ''}</div>

      <aside className="wm-sources" hidden={!sourcesOpen}>
        <header>
          <strong>Public sources</strong>
          <button type="button" className="wm-sources-close" aria-label="Close sources" onClick={() => setSourcesOpen(false)}>
            ×
          </button>
        </header>
        <p>Company facts come from public Waters information. This standalone experience does not use personal employee data.</p>
        <ul className="wm-sources-list">
          {SOURCES.map((s) => (
            <li key={s.url}>
              <a href={s.url} target="_blank" rel="noreferrer">
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </aside>

      {ride && (
        <div className={rideOpen ? undefined : 'wr-host-hidden'} aria-hidden={!rideOpen}>
          <RideOverlay
            kind={ride.kind}
            track={ride.track}
            onClose={() => setRideOpen(false)}
            onSwitchTrack={(track) => setRide({ kind: ride.kind, track })}
          />
        </div>
      )}
    </div>
  );
}
