import { useState } from 'react';
import {
  DISCOVERY_LOOP,
  DIVISIONS,
  IMPACT_STORIES,
  INDUSTRIES,
  MOTIVATIONS,
  ROLES,
  SCIENCE_STEPS,
  SITES,
  WHY_IT_MATTERS,
} from '../content/chapters';
import { COMPANY, SOURCES } from '../content';
import { useReducedMotion } from '../hooks';
import { GlobeScene } from '../three/GlobeScene';
import { LazyCanvas } from '../three/LazyCanvas';

export function ScienceSection() {
  return (
    <>
      <p className="big">Think of it as helping scientists work out exactly what is inside a sample — and trust the answer.</p>
      <ol className="flow">
        {SCIENCE_STEPS.map((s, i) => (
          <li key={s.verb} className="card">
            <span className="flow-n">{i + 1}</span>
            <h3>{s.verb}</h3>
            <p>{s.what}</p>
            <span className="tag">{s.how}</span>
          </li>
        ))}
      </ol>
      <div className="split">
        <div>
          <h3>Why analytical science matters</h3>
          <ul className="ticks">
            {WHY_IT_MATTERS.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
        <div>
          <h3>Where Waters works</h3>
          <ul className="divisions">
            {DIVISIONS.map((d) => (
              <li key={d.name}>
                <strong>{d.name}</strong>
                <span>{d.what}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}

export function ImpactSection() {
  const [i, setI] = useState(0);
  const s = IMPACT_STORIES[i];
  return (
    <>
      <div className="tabs" role="tablist" aria-label="Impact areas">
        {IMPACT_STORIES.map((story, k) => (
          <button key={story.area} role="tab" aria-selected={k === i} className={k === i ? 'is-active' : ''} onClick={() => setI(k)}>
            {story.area}
          </button>
        ))}
      </div>
      <div className="chain" role="tabpanel" key={s.area}>
        <div className="card chain-step">
          <span className="eyebrow">The question</span>
          <p>{s.question}</p>
        </div>
        <span className="chain-arrow" aria-hidden>
          →
        </span>
        <div className="card chain-step">
          <span className="eyebrow">The measurement</span>
          <p>{s.measure}</p>
        </div>
        <span className="chain-arrow" aria-hidden>
          →
        </span>
        <div className="card chain-step chain-step--decision">
          <span className="eyebrow">The decision</span>
          <p>{s.decision}</p>
        </div>
      </div>
      <div className="loop" aria-label="The discovery loop">
        {DISCOVERY_LOOP.map((x, k) => (
          <span key={x} className="loop-node">
            {x}
            {k < DISCOVERY_LOOP.length - 1 && <span aria-hidden> · </span>}
          </span>
        ))}
        <span className="muted"> … and every answer raises the next question.</span>
      </div>
    </>
  );
}

export function WorldSection() {
  const still = useReducedMotion();
  const [site, setSite] = useState<string | null>(null);
  const [open, setOpen] = useState<string>(INDUSTRIES[0].id);
  const active = SITES.find((s) => s.id === site);
  return (
    <>
      <div className="industries">
        {INDUSTRIES.map((ind) => (
          <button
            key={ind.id}
            className={`card industry${open === ind.id ? ' is-active' : ''}`}
            onClick={() => setOpen(ind.id)}
            aria-expanded={open === ind.id}
          >
            <span className="badge">{ind.code}</span>
            <h3>{ind.name}</h3>
            {open === ind.id && (
              <>
                <ul>
                  {ind.examples.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
                <p className="muted">{ind.technique}</p>
              </>
            )}
          </button>
        ))}
      </div>
      <div className="world">
        <LazyCanvas
          className="scene scene--globe"
          label="Globe showing selected Waters locations"
          camera={{ position: [0, 0, 6.2], fov: 40 }}
          fallback={<p>Selected locations: {SITES.map((s) => s.name).join(', ')}.</p>}
        >
          <GlobeScene sites={SITES} active={site} onSelect={setSite} still={still} />
        </LazyCanvas>
        <div className="world-info">
          <p className="stat">
            <strong>{COMPANY.colleagues}</strong> colleagues
          </p>
          <p className="muted">Working with customers around the world. A few of the listed locations:</p>
          <ul className="sites">
            {SITES.map((s) => (
              <li key={s.id}>
                <button className={`site${site === s.id ? ' is-active' : ''}`} onClick={() => setSite(site === s.id ? null : s.id)}>
                  <strong>{s.name}</strong> <span>{s.country}</span>
                </button>
              </li>
            ))}
          </ul>
          {active && <p className="site-what">{active.what}</p>}
        </div>
      </div>
    </>
  );
}

export function PeopleSection() {
  const [role, setRole] = useState(ROLES[0].id);
  const r = ROLES.find((x) => x.id === role) ?? ROLES[0];
  return (
    <div className="eco">
      <div className="eco-ring" aria-label="Roles around the science">
        <div className="eco-core">
          <strong>The science</strong>
          <span>A result someone can trust</span>
        </div>
        {ROLES.map((x, i) => {
          const a = (i / ROLES.length) * Math.PI * 2 - Math.PI / 2;
          return (
            <button
              key={x.id}
              className={`eco-node${x.id === role ? ' is-active' : ''}`}
              style={{ left: `${50 + Math.cos(a) * 40}%`, top: `${50 + Math.sin(a) * 40}%` }}
              onClick={() => setRole(x.id)}
              aria-pressed={x.id === role}
            >
              {x.name}
            </button>
          );
        })}
      </div>
      <div className="card eco-detail" aria-live="polite">
        <span className="eyebrow">Role</span>
        <h3>{r.name}</h3>
        <p>{r.what}</p>
        <p className="muted">Close to: {r.touches}</p>
        <p className="eco-note">No single role produces a result alone. Each one is a link in the same chain.</p>
      </div>
    </div>
  );
}

export function YouSection({ onRestart }: { onRestart: () => void }) {
  const [m, setM] = useState<string | null>(null);
  const pick = MOTIVATIONS.find((x) => x.id === m);
  return (
    <div className="finale">
      <p className="big">What matters most to you?</p>
      <div className="tabs tabs--center">
        {MOTIVATIONS.map((x) => (
          <button key={x.id} className={m === x.id ? 'is-active' : ''} onClick={() => setM(x.id)} aria-pressed={m === x.id}>
            {x.label}
          </button>
        ))}
      </div>
      <p className="finale-message" aria-live="polite">
        {pick ? pick.message : 'Pick one — every option leads back to the same science.'}
      </p>
      <div className="finale-chain">
        {['A question', 'A sample', 'A separation', 'A measurement', 'A decision', 'People'].map((x) => (
          <span key={x}>{x}</span>
        ))}
      </div>
      <p className="finale-close">
        Behind every one of those moments is the chain you just explored. Whatever you do, you are part of it.
      </p>
      <div className="row row--center">
        <button className="primary" onClick={onRestart}>
          Start again
        </button>
        <a className="ghost" href="#technology">
          Back to the instrument
        </a>
      </div>
      <details className="sources">
        <summary>Sources</summary>
        <ul>
          {SOURCES.map((s) => (
            <li key={s.url}>
              <a href={s.url} target="_blank" rel="noreferrer">
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
