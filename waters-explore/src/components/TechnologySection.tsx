import { useState } from 'react';
import { JOURNEY, PARTS, partById, type PartId } from '../content/instrument';
import { useClock, useReducedMotion } from '../hooks';
import { RUN_MINUTES, elutionOrder } from '../science/chromatography';
import { MZ_MAX, MZ_MIN, identify, passes, ppmError, transmission } from '../science/massSpec';
import { MOLECULES, moleculeById, protonatedMz, type Molecule } from '../science/molecules';
import { InstrumentScene } from '../three/InstrumentScene';
import { LazyCanvas } from '../three/LazyCanvas';
import { Chromatogram, Spectrum } from './Plots';

const IDEAS = [
  {
    short: 'LC',
    name: 'Liquid chromatography',
    simple: 'A race where every ingredient runs at a different speed, so they cross the finish line one at a time.',
    deeper:
      'A liquid (the mobile phase) pushes the sample through a column packed with tiny particles (the stationary phase). Molecules that stick more move slower, so each compound leaves at its own retention time. UPLC uses smaller particles at higher pressure for faster, sharper separations.',
  },
  {
    short: 'MS',
    name: 'Mass spectrometry',
    simple: 'A very precise scale for molecules. Weigh something accurately enough and you know exactly what it is.',
    deeper:
      'Molecules are given a charge (ionised), sorted by mass-to-charge ratio (m/z) and counted. The spectrum is a fingerprint that identifies the molecule; the signal size tells you how much is there. Put LC in front and you separate first, then identify each compound as it arrives.',
  },
];

/** Small fixed offset so the demo "measurement" looks like a real, near-perfect reading. */
const OBSERVED_OFFSET = 0.0003;

export function TechnologySection() {
  const still = useReducedMotion();
  const [mode, setMode] = useState<'explore' | 'journey'>('explore');
  const [selected, setSelected] = useState<PartId | null>(null);
  const [deeper, setDeeper] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [followed, setFollowed] = useState<Molecule['id']>('caffeine');
  const [playing, setPlaying] = useState(false);
  const [runTime, setRunTime] = useClock(playing, RUN_MINUTES, 1.2, () => setPlaying(false));
  const [setMz, setSetMz] = useState(130);

  const step = JOURNEY[stepIdx];
  const mol = moleculeById(followed);
  const target = protonatedMz(mol);
  const tuned = passes(setMz, target);
  const runDone = runTime >= RUN_MINUTES;

  const canNext =
    stepIdx < JOURNEY.length - 1 && (step.id !== 'separate' || runDone) && (step.id !== 'filter' || tuned);

  const goTo = (i: number) => {
    const next = JOURNEY[i];
    setPlaying(false);
    if (next.id === 'separate' && JOURNEY[stepIdx].id !== 'detect') setRunTime(0);
    if (next.id === 'detect') setRunTime(RUN_MINUTES);
    setStepIdx(i);
  };

  const restart = () => {
    setPlaying(false);
    setRunTime(0);
    setSetMz(130);
    setStepIdx(0);
  };

  const part = selected ? partById(selected) : null;
  const order = elutionOrder(MOLECULES);
  const observed = target + OBSERVED_OFFSET;
  const match = identify(observed);

  return (
    <div className="tech">
      <div className="ideas">
        {IDEAS.map((idea) => (
          <article key={idea.short} className="card idea">
            <span className="badge">{idea.short}</span>
            <h3>{idea.name}</h3>
            <p>{idea.simple}</p>
            <details>
              <summary>Go deeper</summary>
              <p>{idea.deeper}</p>
            </details>
          </article>
        ))}
      </div>

      <div className="tech-stage">
        <div className="mode-switch" role="tablist" aria-label="Technology mode">
          <button role="tab" aria-selected={mode === 'explore'} className={mode === 'explore' ? 'is-active' : ''} onClick={() => setMode('explore')}>
            Explore the instrument
          </button>
          <button role="tab" aria-selected={mode === 'journey'} className={mode === 'journey' ? 'is-active' : ''} onClick={() => setMode('journey')}>
            Follow a sample
          </button>
        </div>

        <div className="tech-grid">
          <LazyCanvas
            className="scene scene--instrument"
            label="Interactive 3D model of a liquid chromatography and mass spectrometry system"
            camera={{ position: [0.6, 3.6, 10.5], fov: 38 }}
            fallback={<p>3D view unavailable on this device. The step-by-step guide alongside covers the same journey.</p>}
          >
            <InstrumentScene
              mode={mode}
              selected={selected}
              step={step.id}
              focus={step.focus}
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

          <aside className="panel" aria-live="polite">
            {mode === 'explore' ? (
              <>
                <p className="eyebrow">Click any part of the instrument</p>
                {(['LC', 'MS'] as const).map((stage) => (
                  <div key={stage} className="chips" aria-label={`${stage} parts`}>
                    <span className="chips-label">{stage}</span>
                    {PARTS.filter((p) => p.stage === stage).map((p) => (
                      <button
                        key={p.id}
                        className={`chip${selected === p.id ? ' is-active' : ''}`}
                        onClick={() => {
                          setSelected(p.id);
                          setDeeper(false);
                        }}
                      >
                        {p.name.replace(/ \(.+\)/, '')}
                      </button>
                    ))}
                  </div>
                ))}
                {part ? (
                  <div className="part-detail">
                    <span className="badge">{part.stage}</span>
                    <h3>{part.name}</h3>
                    <p>{part.simple}</p>
                    {deeper ? <p className="muted">{part.deeper}</p> : <button className="link" onClick={() => setDeeper(true)}>Go deeper →</button>}
                    <div className="row">
                      <button className="ghost" onClick={() => setSelected(null)}>
                        Back to overview
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="part-detail">
                    <h3>The full system</h3>
                    <p>
                      On the left, the LC stack separates the sample. On the right, the mass spectrometer identifies what comes out.
                      Drag to orbit, scroll to zoom.
                    </p>
                    <button className="primary" onClick={() => setMode('journey')}>
                      Follow a sample through it →
                    </button>
                  </div>
                )}
              </>
            ) : (
              <>
                <ol className="stepper" aria-label="Journey steps">
                  {JOURNEY.map((s, i) => (
                    <li key={s.id} className={i === stepIdx ? 'is-current' : i < stepIdx ? 'is-done' : ''}>
                      <span className="sr-only">{s.title}</span>
                    </li>
                  ))}
                </ol>
                <p className="eyebrow">
                  Step {stepIdx + 1} of {JOURNEY.length}
                </p>
                <h3>{step.title}</h3>
                <p>{step.body}</p>

                {step.id === 'choose' && (
                  <div className="pick">
                    {MOLECULES.map((m) => (
                      <button
                        key={m.id}
                        className={`pick-card${followed === m.id ? ' is-active' : ''}`}
                        style={{ ['--c' as string]: m.color }}
                        onClick={() => setFollowed(m.id)}
                        aria-pressed={followed === m.id}
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
                    <Chromatogram molecules={MOLECULES} until={runTime} followed={followed} />
                    {step.id === 'separate' && (
                      <div className="row">
                        <button className="primary" onClick={() => (runDone ? (setRunTime(0), setPlaying(true)) : setPlaying(!playing))}>
                          {playing ? 'Pause' : runDone ? 'Run again' : runTime > 0 ? 'Resume' : 'Play the run'}
                        </button>
                        <span className="muted">{runTime.toFixed(1)} min</span>
                      </div>
                    )}
                    {step.id === 'detect' && (
                      <p className="muted">
                        Elution order: {order.map((m) => m.name).join(' → ')}. Your {mol.name.toLowerCase()} arrived at {mol.rt.toFixed(1)} min.
                      </p>
                    )}
                  </>
                )}

                {step.id === 'ionise' && (
                  <div className="fact">
                    <span>{mol.name}</span>
                    <span>
                      M = {mol.mass.toFixed(4)} Da&nbsp;&nbsp;+&nbsp;&nbsp;H⁺ = {target.toFixed(4)}
                    </span>
                  </div>
                )}

                {step.id === 'filter' && (
                  <div className="tuner">
                    <label htmlFor="mz">
                      Quadrupole set to <strong>m/z {setMz.toFixed(1)}</strong>
                    </label>
                    <input
                      id="mz"
                      type="range"
                      min={MZ_MIN}
                      max={MZ_MAX}
                      step={0.1}
                      value={setMz}
                      onChange={(e) => setSetMz(Number(e.target.value))}
                    />
                    <ul className="ions">
                      {MOLECULES.map((m) => {
                        const tr = transmission(setMz, protonatedMz(m));
                        return (
                          <li key={m.id} style={{ ['--c' as string]: m.color }}>
                            <span>
                              {m.name} ion · m/z {protonatedMz(m).toFixed(1)}
                            </span>
                            <span className="meter">
                              <span style={{ width: `${Math.round(tr * 100)}%` }} />
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                    <p className={tuned ? 'ok' : 'muted'}>
                      {tuned
                        ? `Tuned. Only ${mol.name.toLowerCase()} ions reach the detector.`
                        : `Hint: your molecule weighs ${mol.mass.toFixed(1)} Da and gained one proton (about 1).`}
                    </p>
                  </div>
                )}

                {step.id === 'identify' && (
                  <>
                    <Spectrum molecule={mol} setMz={setMz} />
                    <div className="id-card" style={{ ['--c' as string]: mol.color }}>
                      <strong>{match?.name ?? 'Unknown'}</strong>
                      <dl>
                        <dt>Observed m/z</dt>
                        <dd>{observed.toFixed(4)}</dd>
                        <dt>Expected [M+H]⁺</dt>
                        <dd>{target.toFixed(4)}</dd>
                        <dt>Mass error</dt>
                        <dd>{ppmError(observed, target).toFixed(1)} ppm</dd>
                        <dt>Retention time</dt>
                        <dd>{mol.rt.toFixed(1)} min</dd>
                      </dl>
                      <p>{mol.why}</p>
                    </div>
                  </>
                )}

                <div className="row row--nav">
                  <button className="ghost" disabled={stepIdx === 0} onClick={() => goTo(stepIdx - 1)}>
                    ← Back
                  </button>
                  {stepIdx < JOURNEY.length - 1 ? (
                    <button className="primary" disabled={!canNext} onClick={() => goTo(stepIdx + 1)}>
                      Next →
                    </button>
                  ) : (
                    <button className="primary" onClick={restart}>
                      Follow another molecule
                    </button>
                  )}
                </div>
              </>
            )}
          </aside>
        </div>
        <p className="footnote">
          Retention times and the instrument layout are simplified for teaching. Masses are real monoisotopic values.
        </p>
      </div>
    </div>
  );
}
