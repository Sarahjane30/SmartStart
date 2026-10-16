import { MOLECULES, protonatedMz, type Molecule } from './molecules';

export const MZ_MIN = 100;
export const MZ_MAX = 260;
/** Half-width of the quadrupole transmission window, in m/z units. */
export const QUAD_WINDOW = 0.7;

/** Share of ions of a given m/z that make it through a quadrupole set to `setMz`. */
export const transmission = (setMz: number, ionMz: number, window = QUAD_WINDOW): number => {
  const d = (setMz - ionMz) / window;
  return Math.exp(-(d * d) * Math.LN2);
};

export const passes = (setMz: number, ionMz: number): boolean => transmission(setMz, ionMz) >= 0.5;

export interface SpectrumPeak {
  mz: number;
  intensity: number;
  label: string;
}

/** [M+H]+ plus its first carbon-13 isotope peak (about 1.1% per carbon). */
export const spectrum = (m: Molecule): SpectrumPeak[] => {
  const mz = protonatedMz(m);
  return [
    { mz, intensity: 100, label: '[M+H]⁺' },
    { mz: mz + 1.00336, intensity: 1.08 * m.carbons, label: '¹³C isotope' },
  ];
};

/** Match an observed m/z against the demo library within a tolerance. */
export const identify = (mz: number, tolerance = 0.02): Molecule | undefined =>
  MOLECULES.find((m) => Math.abs(protonatedMz(m) - mz) <= tolerance);

export const ppmError = (observed: number, theoretical: number): number =>
  ((observed - theoretical) / theoretical) * 1e6;
