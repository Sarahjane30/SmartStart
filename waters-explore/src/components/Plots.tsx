import { RUN_MINUTES, chromatogram, signalAt } from '../science/chromatography';
import { MZ_MAX, MZ_MIN, spectrum } from '../science/massSpec';
import type { Molecule } from '../science/molecules';

const W = 320;
const H = 140;
const PAD = { l: 28, r: 10, t: 12, b: 24 };
const iw = W - PAD.l - PAD.r;
const ih = H - PAD.t - PAD.b;

interface ChromProps {
  molecules: Molecule[];
  until: number;
  followed: Molecule['id'];
}

export function Chromatogram({ molecules, until, followed }: ChromProps) {
  const pts = chromatogram(molecules, until);
  const x = (t: number) => PAD.l + (t / RUN_MINUTES) * iw;
  const y = (v: number) => PAD.t + ih - (v / 1.1) * ih;
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.y).toFixed(1)}`).join('');
  return (
    <figure className="plot">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Chromatogram up to ${until.toFixed(1)} minutes`}>
        <line x1={PAD.l} y1={PAD.t + ih} x2={W - PAD.r} y2={PAD.t + ih} className="axis" />
        <line x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={PAD.t + ih} className="axis" />
        {[0, 1, 2, 3, 4, 5, 6].map((t) => (
          <text key={t} x={x(t)} y={H - 8} className="tick" textAnchor="middle">
            {t}
          </text>
        ))}
        <path d={d} className="trace" />
        {molecules
          .filter((m) => until >= m.rt)
          .map((m) => (
            <g key={m.id}>
              <circle cx={x(m.rt)} cy={y(signalAt(molecules, m.rt))} r={m.id === followed ? 4 : 3} fill={m.color} />
              <text x={x(m.rt)} y={y(signalAt(molecules, m.rt)) - 8} textAnchor="middle" className={`peak-label${m.id === followed ? ' is-strong' : ''}`}>
                {m.name} · {m.rt.toFixed(1)}
              </text>
            </g>
          ))}
        <line x1={x(until)} y1={PAD.t} x2={x(until)} y2={PAD.t + ih} className="cursor" />
      </svg>
      <figcaption>Retention time (min) →</figcaption>
    </figure>
  );
}

export function Spectrum({ molecule, setMz }: { molecule: Molecule; setMz?: number }) {
  const peaks = spectrum(molecule);
  const x = (mz: number) => PAD.l + ((mz - MZ_MIN) / (MZ_MAX - MZ_MIN)) * iw;
  const y = (v: number) => PAD.t + ih - (v / 110) * ih;
  return (
    <figure className="plot">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Mass spectrum of ${molecule.name}, main peak at m/z ${peaks[0].mz.toFixed(3)}`}>
        <line x1={PAD.l} y1={PAD.t + ih} x2={W - PAD.r} y2={PAD.t + ih} className="axis" />
        <line x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={PAD.t + ih} className="axis" />
        {[100, 140, 180, 220, 260].map((m) => (
          <text key={m} x={x(m)} y={H - 8} className="tick" textAnchor="middle">
            {m}
          </text>
        ))}
        {setMz !== undefined && <line x1={x(setMz)} y1={PAD.t} x2={x(setMz)} y2={PAD.t + ih} className="cursor" />}
        {peaks.map((p) => (
          <g key={p.label}>
            <line x1={x(p.mz)} x2={x(p.mz)} y1={PAD.t + ih} y2={y(p.intensity)} stroke={molecule.color} strokeWidth={2.5} />
            {p.intensity > 50 && (
              <text x={x(p.mz)} y={y(p.intensity) - 4} textAnchor="middle" className="peak-label is-strong">
                {p.mz.toFixed(3)}
              </text>
            )}
          </g>
        ))}
      </svg>
      <figcaption>Mass-to-charge (m/z) →</figcaption>
    </figure>
  );
}
