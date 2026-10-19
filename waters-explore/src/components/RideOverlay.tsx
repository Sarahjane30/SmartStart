import { useEffect, useMemo, useState } from 'react';
import type { RideKind, RideTrack } from '../content/machine';
import { JOURNEY, PARTS, partById, type PartId } from '../content/instrument';
import { useClock, useReducedMotion } from '../hooks';
import { RUN_MINUTES, elutionOrder } from '../science/chromatography';
import { MZ_MAX, MZ_MIN, identify, passes, ppmError, transmission } from '../science/massSpec';
import { MOLECULES, moleculeById, protonatedMz, type Molecule } from '../science/molecules';
import { InstrumentScene } from '../three/InstrumentScene';
import { LazyCanvas } from '../three/LazyCanvas';
import { Chromatogram, Spectrum } from './Plots';

const OBSERVE_LC = [
  { title: 'Solvents', focus: 'solvents' as PartId | 'overview', body: 'Two liquids wait in the trays — usually water and an organic solvent. Together they become the mobile phase that will carry the sample.' },
  { title: 'The pump', focus: 'pump' as PartId | 'overview', body: 'The pump pushes that liquid through the system at a steady, high pressure. Without pressure, nothing moves through the packed column.' },
  { title: 'Injection', focus: 'injector' as PartId | 'overview', body: 'A few microlitres of sample drop into the stream. Everything starts together — separation comes next.' },
  { title: 'The column', focus: 'column' as PartId | 'overview', body: 'Inside: tiny particles. Molecules that stick more move slower. That is how a mixture becomes a sequence.' },
  { title: 'Detection', focus: 'uv' as PartId | 'overview', body: 'As each compound passes, the optical detector draws a peak. Position is retention time; area relates to how much is there.' },
];

const OBSERVE_MS = [
  { title: 'Ion source', focus: 'source' as PartId | 'overview', body: 'Electrospray turns the liquid into a charged mist. Molecules pick up a proton and become ions — [M+H]⁺.' },
  { title: 'The quadrupole', focus: 'quadrupole' as PartId | 'overview', body: 'Four rods create a filter. Only ions of one chosen mass-to-charge ratio keep a stable path.' },
  { title: 'Counting', focus: 'ionDetector' as PartId | 'overview', body: 'Ions that arrive are counted. Plot count against m/z and you have a spectrum — a fingerprint.' },
];

interface Props {
  kind: RideKind;
  track: RideTrack;
  onClose: () => void;
  onSwitchTrack: (track: RideTrack) => void;
}

export function RideOverlay({ kind, track, onClose, onSwitchTrack }: Props) {
  const still = useReducedMotion();
  const observeSteps = kind === 'ms' ? OBSERVE_MS : OBSERVE_LC;
  const [obsIdx, setObsIdx] = useState(0);
  const [rideIdx, setRideIdx] = useState(0);
  const [selected, setSelected] = useState<PartId | null>(null);
  const [followed, setFollowed] = useState<Molecule['id']>('caffeine');
  const [playing, setPlaying] = useState(false);
  const [runTime, setRunTime] = useClock(playing, RUN_MINUTES, 1.2, () => setPlaying(false));
  const [setMz, setSetMz] = useState(130);
  const [deeper, setDeeper] = useState(false);

  useEffect(() => {
    setObsIdx(0);
    setRideIdx(0);
    setRunTime(0);
    setPlaying(false);
    setSetMz(130);
    setSelected(null);
  }, [kind, track, setRunTime]);


  const observe = track === 'observe';
  const step = observe ? observeSteps[obsIdx] : JOURNEY[Math.min(rideIdx, JOURNEY.length - 1)];
  const mol = moleculeById(followed);
  const target = protonatedMz(mol);
  const tuned = passes(setMz, target);
  const runDone = runTime >= RUN_MINUTES;
  const chapNo = String((observe ? obsIdx : rideIdx) + 1).padStart(2, '0');
  const progress = observe ? (obsIdx + 1) / observeSteps.length : (rideIdx + 1) / JOURNEY.length;

  const modeLabel = observe
    ? kind === 'ms'
      ? 'RIDE THE IONS ↗'
      : 'BECOME THE SAMPLE ↗'
    : 'HOW IT WORKS ↗';

  const canNextRide =
    rideIdx < JOURNEY.length - 1 &&
    (JOURNEY[rideIdx].id !== 'separate' || runDone) &&
    (JOURNEY[rideIdx].id !== 'filter' || tuned);

  const focus = observe ? step.focus : JOURNEY[rideIdx].focus;
  const sceneMode = observe ? 'explore' : 'journey';
  const exploreSelected = observe && focus !== 'overview' ? focus : selected;

  const title = useMemo(() => ('title' in step ? step.title : ''), [step]);

  return (
    <div className="wr is-open" role="dialog" aria-modal="true" aria-label={`${kind.toUpperCase()} experience`}>
      <div className="wr-corner">
        WATERS <span>/</span> {kind === 'ms' ? 'MASS SPECTROMETRY' : 'LIQUID CHROMATOGRAPHY'}
      </div>
      <button type="button" className="wr-mode" onClick={() => onSwitchTrack(observe ? 'ride' : 'observe')}>
        {modeLabel}
      </button>
      <div className="wr-chap is-in" key={chapNo + title}>
        <span className="wr-chap-no">{chapNo}</span>
        <span className="wr-chap-name">{title}</span>
      </div>
      <div className="wr-rail" aria-hidden>
        <i className="wr-rail-fill" style={{ height: `${progress * 100}%` }} />
        {(observe ? observeSteps : JOURNEY).map((_, i) => (
          <b
            key={i}
            className={i === (observe ? obsIdx : rideIdx) ? 'is-on' : ''}
            style={{ top: `${(i / Math.max(1, (observe ? observeSteps : JOURNEY).length - 1)) * 100}%` }}
            onClick={() => (observe ? setObsIdx(i) : setRideIdx(i))}
          />
        ))}
      </div>
      <button type="button" className="wr-esc" onClick={onClose}>
        ESC · back to machine
      </button>

      <div className="wr-stage">
        <LazyCanvas
          className="wr-canvas-host"
          label="LC-MS instrument"
          camera={{ position: [0.6, 3.6, 10.5], fov: 38 }}
          fallback={<p className="wm-muted">3D unavailable — follow the steps in the panel.</p>}
        >
          <InstrumentScene
            mode={sceneMode}
            selected={observe ? exploreSelected : null}
            step={observe ? 'choose' : JOURNEY[rideIdx].id}
            focus={focus}
            followed={followed}
            runTime={runTime}
            setMz={setMz}
            still={still}
            onSelect={(id) => {
              setSelected(id);
              setDeeper(false);
            }}
            onPick={setFollowed}
          />
        </LazyCanvas>

        <aside className="wr-panel" aria-live="polite">
          {observe ? (
            <>
              <p className="wm-kicker">
                <span>{kind.toUpperCase()}</span> How it works
              </p>
              <h2>{title}</h2>
              <p className="wm-lead">{'body' in step ? step.body : ''}</p>
              {selected && (
                <div className="part-detail">
                  <span className="wm-ch-tag">{partById(selected).stage}</span>
                  <h3 style={{ marginTop: '0.6rem' }}>{partById(selected).name}</h3>
                  <p>{partById(selected).simple}</p>
                  {deeper ? (
                    <p className="wm-muted">{partById(selected).deeper}</p>
                  ) : (
                    <button type="button" className="wm-deep-btn" onClick={() => setDeeper(true)}>
                      Explain deeper
                    </button>
                  )}
                </div>
              )}
              {!selected && (
                <div className="chips" style={{ marginTop: '1rem' }}>
                  {PARTS.filter((p) => (kind === 'lc' ? p.stage === 'LC' : p.stage === 'MS')).map((p) => (
                    <button key={p.id} type="button" className={`chip${selected === p.id ? ' is-active' : ''}`} onClick={() => setSelected(p.id)}>
                      {p.name.replace(/ \(.+\)/, '')}
                    </button>
                  ))}
                </div>
              )}
              <div className="row row--nav">
                <button type="button" className="wm-nav-btn" disabled={obsIdx === 0} onClick={() => setObsIdx((i) => i - 1)}>
                  ← Back
                </button>
                {obsIdx < observeSteps.length - 1 ? (
                  <button type="button" className="wm-nav-btn primary" onClick={() => setObsIdx((i) => i + 1)}>
                    Next →
                  </button>
                ) : (
                  <button type="button" className="wm-nav-btn primary" onClick={() => onSwitchTrack('ride')}>
                    {kind === 'ms' ? 'Ride the ions →' : 'Become the sample →'}
                  </button>
                )}
              </div>
            </>
          ) : (
            <RidePanel
              rideIdx={rideIdx}
              setRideIdx={setRideIdx}
              followed={followed}
              setFollowed={setFollowed}
              runTime={runTime}
              setRunTime={setRunTime}
              playing={playing}
              setPlaying={setPlaying}
              runDone={runDone}
              setMz={setMz}
              setSetMz={setSetMz}
              tuned={tuned}
              target={target}
              mol={mol}
              canNext={canNextRide}
              onClose={onClose}
            />
          )}
        </aside>
      </div>
    </div>
  );
}

function RidePanel(props: {
  rideIdx: number;
  setRideIdx: (n: number | ((i: number) => number)) => void;
  followed: Molecule['id'];
  setFollowed: (id: Molecule['id']) => void;
  runTime: number;
  setRunTime: (n: number) => void;
  playing: boolean;
  setPlaying: (v: boolean) => void;
  runDone: boolean;
  setMz: number;
  setSetMz: (n: number) => void;
  tuned: boolean;
  target: number;
  mol: Molecule;
  canNext: boolean;
  onClose: () => void;
}) {
  const step = JOURNEY[props.rideIdx];
  const observed = props.target + 0.0003;
  const match = identify(observed);
  const order = elutionOrder(MOLECULES);

  return (
    <>
      <p className="wm-kicker">
        <span>
          {props.rideIdx + 1}/{JOURNEY.length}
        </span>
        Follow a sample
      </p>
      <h2>{step.title}</h2>
      <p className="wm-lead">{step.body}</p>

      {step.id === 'choose' && (
        <div className="pick">
          {MOLECULES.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`pick-card${props.followed === m.id ? ' is-active' : ''}`}
              style={{ ['--c' as string]: m.color }}
              onClick={() => props.setFollowed(m.id)}
            >
              <strong>{m.name}</strong>
              <span>{m.formula}</span>
              <small>{m.everyday}</small>
            </button>
          ))}
        </div>
      )}

      {(step.id === 'separate' || step.id === 'detect') && (
        <>
          <Chromatogram molecules={MOLECULES} until={props.runTime} followed={props.followed} />
          {step.id === 'separate' && (
            <div className="row">
              <button
                type="button"
                className="wm-nav-btn primary"
                onClick={() => (props.runDone ? (props.setRunTime(0), props.setPlaying(true)) : props.setPlaying(!props.playing))}
              >
                {props.playing ? 'Pause' : props.runDone ? 'Run again' : props.runTime > 0 ? 'Resume' : 'Play the run'}
              </button>
              <span className="wm-muted">{props.runTime.toFixed(1)} min</span>
            </div>
          )}
          {step.id === 'detect' && (
            <p className="wm-muted">
              Elution order: {order.map((m) => m.name).join(' → ')}. Your {props.mol.name.toLowerCase()} arrived at {props.mol.rt.toFixed(1)} min.
            </p>
          )}
        </>
      )}

      {step.id === 'ionise' && (
        <div className="fact">
          <span>{props.mol.name}</span>
          <span>
            M = {props.mol.mass.toFixed(4)} Da + H⁺ = {props.target.toFixed(4)}
          </span>
        </div>
      )}

      {step.id === 'filter' && (
        <div className="tuner">
          <label htmlFor="mz">
            Quadrupole set to <strong>m/z {props.setMz.toFixed(1)}</strong>
          </label>
          <input id="mz" type="range" min={MZ_MIN} max={MZ_MAX} step={0.1} value={props.setMz} onChange={(e) => props.setSetMz(Number(e.target.value))} />
          <ul className="ions">
            {MOLECULES.map((m) => {
              const tr = transmission(props.setMz, protonatedMz(m));
              return (
                <li key={m.id} style={{ ['--c' as string]: m.color }}>
                  <span>
                    {m.name} · m/z {protonatedMz(m).toFixed(1)}
                  </span>
                  <span className="meter">
                    <span style={{ width: `${Math.round(tr * 100)}%` }} />
                  </span>
                </li>
              );
            })}
          </ul>
          <p className={props.tuned ? 'ok' : 'wm-muted'}>
            {props.tuned
              ? `Tuned. Only ${props.mol.name.toLowerCase()} ions reach the detector.`
              : `Hint: your molecule weighs ${props.mol.mass.toFixed(1)} Da and gained one proton (about 1).`}
          </p>
        </div>
      )}

      {step.id === 'identify' && (
        <>
          <Spectrum molecule={props.mol} setMz={props.setMz} />
          <div className="id-card" style={{ ['--c' as string]: props.mol.color }}>
            <strong>{match?.name ?? 'Unknown'}</strong>
            <dl>
              <dt>Observed m/z</dt>
              <dd>{observed.toFixed(4)}</dd>
              <dt>Expected [M+H]⁺</dt>
              <dd>{props.target.toFixed(4)}</dd>
              <dt>Mass error</dt>
              <dd>{ppmError(observed, props.target).toFixed(1)} ppm</dd>
              <dt>Retention time</dt>
              <dd>{props.mol.rt.toFixed(1)} min</dd>
            </dl>
            <p>{props.mol.why}</p>
          </div>
        </>
      )}

      <div className="row row--nav">
        <button type="button" className="wm-nav-btn" disabled={props.rideIdx === 0} onClick={() => props.setRideIdx((i) => i - 1)}>
          ← Back
        </button>
        {props.rideIdx < JOURNEY.length - 1 ? (
          <button
            type="button"
            className="wm-nav-btn primary"
            disabled={!props.canNext}
            onClick={() => {
              const next = props.rideIdx + 1;
              if (JOURNEY[next].id === 'separate') props.setRunTime(0);
              if (JOURNEY[next].id === 'detect') props.setRunTime(RUN_MINUTES);
              props.setRideIdx(next);
            }}
          >
            Next →
          </button>
        ) : (
          <button type="button" className="wm-nav-btn primary" onClick={props.onClose}>
            Back to the machine
          </button>
        )}
      </div>
    </>
  );
}
