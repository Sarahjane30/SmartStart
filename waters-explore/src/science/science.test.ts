import { describe, expect, it } from 'vitest';
import { ORDER } from '../content/machine';
import { JOURNEY, PARTS } from '../content/instrument';
import { RUN_MINUTES, chromatogram, columnProgress, elutionOrder, resolution, signalAt } from './chromatography';
import { identify, passes, ppmError, spectrum, transmission } from './massSpec';
import { MOLECULES, moleculeById, protonatedMz } from './molecules';

describe('molecules', () => {
  it('uses correct [M+H]+ values', () => {
    expect(protonatedMz(moleculeById('paracetamol'))).toBeCloseTo(152.0706, 3);
    expect(protonatedMz(moleculeById('caffeine'))).toBeCloseTo(195.0877, 3);
    expect(protonatedMz(moleculeById('ibuprofen'))).toBeCloseTo(207.138, 3);
  });

  it('has bonds that reference real atoms', () => {
    for (const m of MOLECULES) {
      for (const [a, b] of m.bonds) {
        expect(m.atoms[a]).toBeDefined();
        expect(m.atoms[b]).toBeDefined();
      }
    }
  });
});

describe('chromatography', () => {
  it('elutes compounds in retention order and within the run', () => {
    expect(elutionOrder(MOLECULES).map((m) => m.id)).toEqual(['paracetamol', 'caffeine', 'ibuprofen']);
    for (const m of MOLECULES) expect(m.rt).toBeLessThan(RUN_MINUTES);
  });

  it('moves each compound through the column at its own pace', () => {
    const t = 1;
    const [p, c, i] = elutionOrder(MOLECULES).map((m) => columnProgress(m, t));
    expect(p).toBeGreaterThan(c);
    expect(c).toBeGreaterThan(i);
    expect(columnProgress(MOLECULES[0], 100)).toBe(1);
  });

  it('draws a peak at each retention time and baseline-resolves neighbours', () => {
    for (const m of MOLECULES) expect(signalAt(MOLECULES, m.rt)).toBeGreaterThan(0.99);
    expect(signalAt(MOLECULES, 0.2)).toBeLessThan(0.01);
    const [a, b, c] = elutionOrder(MOLECULES);
    expect(resolution(a, b)).toBeGreaterThanOrEqual(1.5);
    expect(resolution(b, c)).toBeGreaterThanOrEqual(1.5);
  });

  it('samples only up to the requested time', () => {
    const pts = chromatogram(MOLECULES, 2);
    expect(pts[0].t).toBe(0);
    expect(pts[pts.length - 1].t).toBeCloseTo(2);
  });
});

describe('mass spectrometry', () => {
  it('transmits only ions near the set m/z', () => {
    const caf = protonatedMz(moleculeById('caffeine'));
    expect(transmission(caf, caf)).toBe(1);
    expect(passes(caf + 0.3, caf)).toBe(true);
    expect(passes(caf + 2, caf)).toBe(false);
    expect(passes(caf, protonatedMz(moleculeById('ibuprofen')))).toBe(false);
  });

  it('identifies each molecule from its own spectrum', () => {
    for (const m of MOLECULES) {
      const [main, iso] = spectrum(m);
      expect(identify(main.mz)?.id).toBe(m.id);
      expect(iso.mz).toBeGreaterThan(main.mz);
      expect(iso.intensity).toBeLessThan(main.intensity);
    }
    expect(identify(170)).toBeUndefined();
    expect(Math.abs(ppmError(195.088, 195.0877))).toBeLessThan(5);
  });
});

describe('content', () => {
  it('covers the six chapters in order', () => {
    expect(ORDER).toEqual(['science', 'impact', 'technology', 'world', 'people', 'you']);
  });

  it('only focuses the journey camera on real parts', () => {
    const ids = new Set(PARTS.map((p) => p.id));
    for (const s of JOURNEY) if (s.focus !== 'overview') expect(ids.has(s.focus)).toBe(true);
  });
});
