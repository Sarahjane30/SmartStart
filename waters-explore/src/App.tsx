import { type ReactNode } from 'react';
import { CHAPTERS, COMPANY, type ChapterId } from './content';
import { useActiveSection, useReducedMotion } from './hooks';
import { ImpactSection, PeopleSection, ScienceSection, WorldSection, YouSection } from './components/Sections';
import { TechnologySection } from './components/TechnologySection';
import { HeroScene } from './three/HeroScene';
import { LazyCanvas } from './three/LazyCanvas';

const IDS = ['top', ...CHAPTERS.map((c) => c.id)];

const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

export default function App() {
  const active = useActiveSection(IDS);
  const still = useReducedMotion();

  const body: Record<ChapterId, ReactNode> = {
    science: <ScienceSection />,
    impact: <ImpactSection />,
    technology: <TechnologySection />,
    world: <WorldSection />,
    people: <PeopleSection />,
    you: <YouSection onRestart={() => go('top')} />,
  };

  return (
    <>
      <a className="skip" href="#science">
        Skip to content
      </a>
      <header className="topbar">
        <button className="brand" onClick={() => go('top')}>
          <span className="brand-mark" aria-hidden />
          What is {COMPANY.name}?
        </button>
        <nav aria-label="Chapters">
          {CHAPTERS.map((c) => (
            <a key={c.id} href={`#${c.id}`} className={active === c.id ? 'is-active' : ''} aria-current={active === c.id ? 'true' : undefined}>
              <span className="nav-n">{c.index}</span>
              {c.label}
            </a>
          ))}
        </nav>
      </header>

      <main>
        <section id="top" className="hero">
          <LazyCanvas className="hero-canvas" label="Three molecules floating" camera={{ position: [0, 0, 8], fov: 45 }} fallback={null}>
            <HeroScene still={still} />
          </LazyCanvas>
          <div className="hero-copy">
            <p className="eyebrow">An interactive introduction</p>
            <h1>
              What is <span className="accent">{COMPANY.name}</span>?
            </h1>
            <p className="hero-lead">
              {COMPANY.tagline} Discover the science, step inside a working instrument, and see how a single measurement becomes a
              decision that reaches everyday life.
            </p>
            <div className="row">
              <button className="primary" onClick={() => go('science')}>
                Start exploring
              </button>
              <button className="ghost" onClick={() => go('technology')}>
                Jump to the 3D instrument
              </button>
            </div>
          </div>
          <ol className="hero-chapters">
            {CHAPTERS.map((c) => (
              <li key={c.id}>
                <a href={`#${c.id}`}>
                  <span>{c.index}</span> {c.label}
                </a>
              </li>
            ))}
          </ol>
        </section>

        {CHAPTERS.map((c) => (
          <section key={c.id} id={c.id} className={`chapter chapter--${c.id}`} aria-labelledby={`${c.id}-title`}>
            <header className="chapter-head">
              <p className="eyebrow">
                {c.index} · {c.label}
              </p>
              <h2 id={`${c.id}-title`}>{c.title}</h2>
              <p className="lead">{c.lead}</p>
            </header>
            {body[c.id]}
          </section>
        ))}
      </main>

      <footer className="footer">
        <span>What is {COMPANY.name}? · an educational experience</span>
        <span className="muted">Content is general and drawn from public sources.</span>
      </footer>
    </>
  );
}
