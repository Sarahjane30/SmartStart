export type Element = 'C' | 'N' | 'O';

export interface Atom {
  el: Element;
  x: number;
  y: number;
  z: number;
}

export interface Molecule {
  id: 'paracetamol' | 'caffeine' | 'ibuprofen';
  name: string;
  formula: string;
  carbons: number;
  /** Monoisotopic neutral mass in Da. */
  mass: number;
  /** Illustrative reversed-phase retention time in minutes for the demo method. */
  rt: number;
  color: string;
  everyday: string;
  why: string;
  atoms: Atom[];
  bonds: [number, number, 1 | 2][];
}

export const PROTON_MASS = 1.00728;

/** Singly protonated ion, [M+H]+, as seen in positive-mode electrospray. */
export const protonatedMz = (m: Molecule): number => m.mass + PROTON_MASS;

type Sketch = { atoms: [Element, number, number][]; bonds: [number, number, 1 | 2][] };

/** Heavy-atom skeletons laid out in 2D (hydrogens omitted), bond length ~1.4. */
const hex = (cx: number, cy: number, start: number) =>
  Array.from({ length: 6 }, (_, i) => {
    const a = ((start + 60 * i) * Math.PI) / 180;
    return [cx + 1.4 * Math.cos(a), cy + 1.4 * Math.sin(a)] as const;
  });

const ringBonds = (offset: number, aromatic = true): [number, number, 1 | 2][] =>
  Array.from({ length: 6 }, (_, i) => [offset + i, offset + ((i + 1) % 6), aromatic && i % 2 === 0 ? 2 : 1]);

const benzene = hex(0, 0, 90).map(([x, y]) => ['C', x, y] as [Element, number, number]);

const PARACETAMOL: Sketch = {
  atoms: [
    ...benzene,
    ['O', 0, 2.8],
    ['N', 0, -2.8],
    ['C', 1.21, -3.5],
    ['O', 2.42, -2.8],
    ['C', 1.21, -4.9],
  ],
  bonds: [...ringBonds(0), [0, 6, 1], [3, 7, 1], [7, 8, 1], [8, 9, 2], [8, 10, 1]],
};

const IBUPROFEN: Sketch = {
  atoms: [
    ...benzene,
    ['C', 0, 2.8],
    ['C', 1.21, 3.5],
    ['C', 2.42, 2.8],
    ['C', 1.21, 4.9],
    ['C', 0, -2.8],
    ['C', -1.21, -3.5],
    ['C', 1.21, -3.5],
    ['O', 2.42, -2.8],
    ['O', 1.21, -4.9],
  ],
  bonds: [
    ...ringBonds(0),
    [0, 6, 1], [6, 7, 1], [7, 8, 1], [7, 9, 1],
    [3, 10, 1], [10, 11, 1], [10, 12, 1], [12, 13, 2], [12, 14, 1],
  ],
};

const purine = hex(0, 0, 30);
const CAFFEINE: Sketch = {
  atoms: [
    ['C', ...purine[0]], // C5
    ['C', ...purine[1]], // C6
    ['N', ...purine[2]], // N1
    ['C', ...purine[3]], // C2
    ['N', ...purine[4]], // N3
    ['C', ...purine[5]], // C4
    ['N', 2.54, 1.13], // N7
    ['C', 3.36, 0], // C8
    ['N', 2.54, -1.13], // N9
    ['O', 0, 2.8],
    ['C', -2.42, 1.4],
    ['O', -2.42, -1.4],
    ['C', 0, -2.8],
    ['C', 3.0, 2.45],
  ],
  bonds: [
    [0, 1, 1], [1, 2, 1], [2, 3, 1], [3, 4, 1], [4, 5, 1], [5, 0, 2],
    [0, 6, 1], [6, 7, 1], [7, 8, 2], [8, 5, 1],
    [1, 9, 2], [2, 10, 1], [3, 11, 2], [4, 12, 1], [6, 13, 1],
  ],
};

const lift = (s: Sketch): Pick<Molecule, 'atoms' | 'bonds'> => {
  const cx = s.atoms.reduce((t, a) => t + a[1], 0) / s.atoms.length;
  const cy = s.atoms.reduce((t, a) => t + a[2], 0) / s.atoms.length;
  return {
    atoms: s.atoms.map(([el, x, y], i) => ({ el, x: x - cx, y: y - cy, z: Math.sin(i * 1.7) * 0.25 })),
    bonds: s.bonds,
  };
};

export const MOLECULES: Molecule[] = [
  {
    id: 'paracetamol',
    name: 'Paracetamol',
    formula: 'C₈H₉NO₂',
    carbons: 8,
    mass: 151.0633,
    rt: 1.4,
    color: '#38bdf8',
    everyday: 'The active ingredient in many headache tablets.',
    why: 'Labs confirm every batch contains the right amount — no more, no less.',
    ...lift(PARACETAMOL),
  },
  {
    id: 'caffeine',
    name: 'Caffeine',
    formula: 'C₈H₁₀N₄O₂',
    carbons: 8,
    mass: 194.0804,
    rt: 2.3,
    color: '#a78bfa',
    everyday: 'Found in coffee, tea and some cold and flu remedies.',
    why: 'Measured in drinks and medicines so labels match what is really inside.',
    ...lift(CAFFEINE),
  },
  {
    id: 'ibuprofen',
    name: 'Ibuprofen',
    formula: 'C₁₃H₁₈O₂',
    carbons: 13,
    mass: 206.1307,
    rt: 4.6,
    color: '#34d399',
    everyday: 'A common anti-inflammatory painkiller.',
    why: 'Checked for purity so patients get the medicine and nothing they should not.',
    ...lift(IBUPROFEN),
  },
];

export const moleculeById = (id: Molecule['id']): Molecule => {
  const m = MOLECULES.find((x) => x.id === id);
  if (!m) throw new Error(`Unknown molecule ${id}`);
  return m;
};

export const ELEMENT_COLOR: Record<Element, string> = { C: '#cbd5e1', N: '#60a5fa', O: '#f87171' };
