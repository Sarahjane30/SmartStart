import { useState, type ReactNode } from 'react';
import {
  AREA_COLORS,
  CHAPTERS,
  COMPANY,
  IMPACT,
  ORDER,
  PEOPLE,
  SCIENCE,
  TECHNOLOGY,
  WORLD,
  YOU,
  type ChapterId,
  type RideKind,
  type RideTrack,
} from '../content/machine';

interface PanelProps {
  active: ChapterId;
  chamber: number;
  area: number;
  site: string | null;
  node: string | null;
  youStage: number;
  onChamber: (i: number) => void;
  onArea: (i: number) => void;
  onSite: (id: string) => void;
  onNode: (id: string) => void;
  onNav: (delta: number) => void;
  onRide: (kind: RideKind, track: RideTrack) => void;
}

function Kicker({ id }: { id: ChapterId }) {
  const c = CHAPTERS[id];
  return (
    <p className="wm-kicker">
      <span>{c.index}</span>
      {c.label}
    </p>
  );
}

function Nav({ active, onNav }: { active: ChapterId; onNav: (d: number) => void }) {
  const i = ORDER.indexOf(active);
  const prev = i > 0 ? CHAPTERS[ORDER[i - 1]].label : 'Overview';
  const next = i < ORDER.length - 1 ? CHAPTERS[ORDER[i + 1]].label : 'Finish';
  return (
    <footer className="wm-panel-nav">
      <button type="button" className="wm-nav-btn" onClick={() => onNav(-1)}>
        ← {prev}
      </button>
      <button type="button" className="wm-nav-btn primary" onClick={() => onNav(1)}>
        {next} →
      </button>
    </footer>
  );
}

function SciencePanel({ onRide }: { onRide: PanelProps['onRide'] }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <>
      <Kicker id="science" />
      <h2>{SCIENCE.title}</h2>
      <p className="wm-lead">{SCIENCE.lead}</p>
      <p className="wm-plain">
        <span>In plain words</span>
        {SCIENCE.simple}
      </p>
      <h3>Explore</h3>
      <div className="wm-explore">
        {SCIENCE.explore.map((x, i) => (
          <div className="wm-x-wrap" key={x.name}>
            <button
              type="button"
              className={`wm-x${open === i ? ' is-open' : ''}`}
              onClick={() => {
                if (x.ride) {
                  onRide(x.ride, 'observe');
                  return;
                }
                setOpen(open === i ? null : i);
              }}
            >
              <strong>{x.name}</strong>
              <span>{x.simple}</span>
              <em aria-hidden>{x.ride ? '→' : '+'}</em>
            </button>
            {x.deeper && open === i && (
              <div className="wm-deeper">
                <span>The technical version</span>
                {x.deeper}
              </div>
            )}
          </div>
        ))}
      </div>
      <h3>
        Four divisions <small>since Feb 2026</small>
      </h3>
      <ul className="wm-divs">
        {COMPANY.divisions.map((d) => (
          <li key={d.name}>
            <strong>{d.name}</strong>
            <span>{d.what}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

function ImpactPanel({ area, onArea }: Pick<PanelProps, 'area' | 'onArea'>) {
  return (
    <>
      <Kicker id="impact" />
      <h2>{IMPACT.title}</h2>
      <p className="wm-lead">{IMPACT.lead}</p>
      <ul className="wm-areas">
        {IMPACT.areas.map((a, i) => (
          <li
            key={a.name}
            data-area={i}
            tabIndex={0}
            onMouseEnter={() => onArea(i)}
            onFocus={() => onArea(i)}
            onMouseLeave={() => onArea(-1)}
            style={area === i ? { borderColor: 'rgba(96,214,255,0.45)', background: 'rgba(255,255,255,0.04)' } : undefined}
          >
            <i style={{ ['--c' as string]: AREA_COLORS[i] }} />
            <div>
              <strong>{a.name}</strong>
              <span>{a.what}</span>
            </div>
          </li>
        ))}
      </ul>
      <p className="wm-plain">
        <span>The point</span>
        Not just measuring things — helping scientists make better decisions.
      </p>
    </>
  );
}

function TechnologyPanel({ chamber, onChamber, onRide }: Pick<PanelProps, 'chamber' | 'onChamber' | 'onRide'>) {
  const [deep, setDeep] = useState<Record<number, boolean>>({});
  return (
    <>
      <Kicker id="technology" />
      <h2>{TECHNOLOGY.title}</h2>
      <p className="wm-lead">{TECHNOLOGY.lead}</p>
      <div className="wm-chambers">
        {TECHNOLOGY.chambers.map((ch, i) => (
          <article
            key={ch.short}
            className={`wm-chamber${chamber === i ? ' is-on' : ''}`}
            data-ch={i}
            tabIndex={0}
            onMouseEnter={() => onChamber(i)}
            onFocus={() => onChamber(i)}
          >
            <header>
              <span className="wm-ch-tag">{ch.short}</span>
              <strong>{ch.name}</strong>
            </header>
            <ol className="wm-steps">
              {ch.steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
            <p>{ch.simple}</p>
            <button type="button" className="wm-ride-enter" onClick={() => onRide(ch.ride, 'observe')}>
              How it works →
            </button>
            <button type="button" className="wm-ride-enter is-dive" onClick={() => onRide(ch.ride, 'ride')}>
              {ch.ride === 'ms' ? 'Ride the ions' : 'Become the sample'} →
            </button>
            <button
              type="button"
              className="wm-deep-btn"
              aria-expanded={!!deep[i]}
              onClick={(e) => {
                e.stopPropagation();
                setDeep((d) => ({ ...d, [i]: !d[i] }));
                onChamber(i);
              }}
            >
              {deep[i] ? 'Keep it simple' : 'Explain deeper'}
            </button>
            {deep[i] && (
              <div className="wm-deeper">
                <span>The technical version</span>
                {ch.deeper}
              </div>
            )}
          </article>
        ))}
      </div>
      <p className="wm-plain">
        <span>Together</span>
        Think of it as separating and identifying what’s inside a sample.
      </p>
    </>
  );
}

function WorldPanel({ site, onSite }: Pick<PanelProps, 'site' | 'onSite'>) {
  const selected = WORLD.sites.find((s) => s.id === site);
  return (
    <>
      <Kicker id="world" />
      <h2>{WORLD.title}</h2>
      <div className="wm-stat">
        <strong>≈&nbsp;{COMPANY.colleagues.replace('~', '')}</strong>
        <span>colleagues worldwide</span>
      </div>
      <p className="wm-lead">{WORLD.lead}</p>
      <h3>Explore locations</h3>
      <div className="wm-sites">
        {WORLD.sites.map((s) => (
          <button type="button" key={s.id} className={`wm-site${s.id === site ? ' is-on' : ''}`} onClick={() => onSite(s.id)}>
            <strong>{s.name}</strong>
            <span>{s.country}</span>
          </button>
        ))}
      </div>
      {selected ? (
        <div className="wm-site-detail">
          <p className="wm-site-name">
            {selected.name} <small>{selected.country}</small>
          </p>
          <p>{selected.what}</p>
          {selected.layers && (
            <div className="wm-flow">
              {selected.layers.map((l, i) => (
                <span key={l}>
                  {l}
                  {i < selected.layers!.length - 1 ? null : null}
                </span>
              )).reduce<ReactNode[]>((acc, el, i) => {
                if (i) acc.push(<i key={`a${i}`}>→</i>);
                acc.push(el);
                return acc;
              }, [])}
            </div>
          )}
        </div>
      ) : (
        <p className="wm-muted">Pick a location — on the globe or here.</p>
      )}
    </>
  );
}

function PeoplePanel({ node, onNode }: Pick<PanelProps, 'node' | 'onNode'>) {
  const n = PEOPLE.nodes.find((x) => x.id === node);
  return (
    <>
      <Kicker id="people" />
      <h2>{PEOPLE.title}</h2>
      <p className="wm-lead">{PEOPLE.lead}</p>
      <div className="wm-nodes">
        {PEOPLE.nodes.map((x) => (
          <button type="button" key={x.id} className={`wm-node${x.id === node ? ' is-on' : ''}`} onClick={() => onNode(x.id)}>
            {x.name}
          </button>
        ))}
      </div>
      <p className="wm-node-what">{n ? (<><strong>{n.name}</strong> {n.what}</>) : 'Hover a node to see what that group does.'}</p>
      <p className="wm-plain">
        <span>Why it matters</span>
        Most people start by asking “okay… but what does everyone actually do?” — this is the map.
      </p>
    </>
  );
}

function YouPanel({ youStage }: { youStage: number }) {
  return (
    <>
      <Kicker id="you" />
      <h2>{YOU.title}</h2>
      <p className="wm-lead">{YOU.lead}</p>
      <ol className="wm-chain">
        {YOU.chain.map((l, i) => (
          <li key={l.level} className={youStage >= 3 && i <= youStage - 1 ? 'is-lit' : youStage >= 4 ? 'is-lit' : i === 0 && youStage >= 2 ? 'is-lit' : ''}>
            <small>{l.level}</small>
            <strong>{l.name}</strong>
          </li>
        ))}
      </ol>
      <p className="wm-note">{YOU.note}</p>
    </>
  );
}

export function ChapterPanel(props: PanelProps) {
  const { active, onNav } = props;
  const show = active !== 'you' || props.youStage >= 4;
  return (
    <aside className={`wm-panel${show ? ' is-show' : ''}`} data-part={active} aria-live="polite">
      <div className="wm-panel-body">
        {active === 'science' && <SciencePanel onRide={props.onRide} />}
        {active === 'impact' && <ImpactPanel area={props.area} onArea={props.onArea} />}
        {active === 'technology' && <TechnologyPanel chamber={props.chamber} onChamber={props.onChamber} onRide={props.onRide} />}
        {active === 'world' && <WorldPanel site={props.site} onSite={props.onSite} />}
        {active === 'people' && <PeoplePanel node={props.node} onNode={props.onNode} />}
        {active === 'you' && <YouPanel youStage={props.youStage} />}
      </div>
      <Nav active={active} onNav={onNav} />
    </aside>
  );
}
