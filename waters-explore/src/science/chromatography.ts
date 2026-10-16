import type { Molecule } from './molecules';

export const RUN_MINUTES = 6;
export const PEAK_SIGMA = 0.09;

export interface Point {
  t: number;
  y: number;
}

/** Fraction of the column a compound has travelled at run time t (0 = inlet, 1 = outlet). */
export const columnProgress = (m: Molecule, t: number): number => Math.max(0, Math.min(1, t / m.rt));

export const hasEluted = (m: Molecule, t: number): boolean => t >= m.rt;

export const elutionOrder = (mols: Molecule[]): Molecule[] => [...mols].sort((a, b) => a.rt - b.rt);

/** Detector signal (arbitrary units) at time t: one Gaussian peak per compound. */
export const signalAt = (mols: Molecule[], t: number, sigma = PEAK_SIGMA): number =>
  mols.reduce((s, m) => s + Math.exp(-((t - m.rt) ** 2) / (2 * sigma ** 2)), 0);

/** Chromatogram sampled from 0 up to `until` minutes. */
export const chromatogram = (mols: Molecule[], until = RUN_MINUTES, samples = 360): Point[] => {
  const end = Math.max(0, Math.min(RUN_MINUTES, until));
  const n = Math.max(2, Math.round((samples * end) / RUN_MINUTES));
  return Array.from({ length: n }, (_, i) => {
    const t = (end * i) / (n - 1);
    return { t, y: signalAt(mols, t) };
  });
};

/** Two neighbouring peaks are baseline-resolved when resolution Rs >= 1.5. */
export const resolution = (a: Molecule, b: Molecule, sigma = PEAK_SIGMA): number =>
  Math.abs(b.rt - a.rt) / (2 * (2 * sigma));
