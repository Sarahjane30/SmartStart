export type PartId =
  | 'solvents'
  | 'pump'
  | 'injector'
  | 'column'
  | 'uv'
  | 'source'
  | 'quadrupole'
  | 'ionDetector';

export interface Part {
  id: PartId;
  name: string;
  stage: 'LC' | 'MS';
  simple: string;
  deeper: string;
}

export const PARTS: Part[] = [
  {
    id: 'solvents',
    name: 'Solvent reservoirs',
    stage: 'LC',
    simple: 'Bottles of liquid — usually water and an organic solvent — that will carry the sample.',
    deeper:
      'This liquid is the mobile phase. Changing the mix over the run (a gradient) controls how quickly compounds are washed off the column.',
  },
  {
    id: 'pump',
    name: 'High-pressure pump',
    stage: 'LC',
    simple: 'Pushes the liquid through the system at a steady, precise flow.',
    deeper:
      'Columns are packed so tightly that very high pressure is needed. UPLC systems run at pressures far above classic HPLC, which allows smaller particles and sharper peaks.',
  },
  {
    id: 'injector',
    name: 'Sample manager (injector)',
    stage: 'LC',
    simple: 'Places a tiny, exact volume of the sample into the flowing liquid.',
    deeper:
      'Injection volumes are often a few microlitres. Reproducible injection is what makes one run comparable with the next.',
  },
  {
    id: 'column',
    name: 'Column',
    stage: 'LC',
    simple: 'A tube packed with tiny particles. This is where the mixture is separated.',
    deeper:
      'The particles are the stationary phase. Molecules that interact with it more move more slowly, so each compound leaves at its own retention time.',
  },
  {
    id: 'uv',
    name: 'Optical detector',
    stage: 'LC',
    simple: 'Shines light through the liquid and notices when a compound passes.',
    deeper:
      'Each compound absorbs light as it passes, drawing a peak. Peak position gives the retention time; peak area relates to how much is present.',
  },
  {
    id: 'source',
    name: 'Ion source (electrospray)',
    stage: 'MS',
    simple: 'Turns the liquid into a fine charged spray, so molecules become ions.',
    deeper:
      'In positive electrospray many molecules pick up a proton, forming [M+H]⁺ ions. Only charged particles can be steered by the electric fields that follow.',
  },
  {
    id: 'quadrupole',
    name: 'Quadrupole mass filter',
    stage: 'MS',
    simple: 'Four metal rods that only let ions of one chosen mass through.',
    deeper:
      'Oscillating voltages on the rods give stable paths only to ions of a selected mass-to-charge ratio (m/z). Everything else spirals out and is lost.',
  },
  {
    id: 'ionDetector',
    name: 'Ion detector',
    stage: 'MS',
    simple: 'Counts the ions that arrive and builds the mass spectrum.',
    deeper:
      'Plotting ion count against m/z gives a spectrum. The m/z identifies the molecule; the signal size helps tell you how much is there.',
  },
];

export const partById = (id: PartId): Part => {
  const p = PARTS.find((x) => x.id === id);
  if (!p) throw new Error(`Unknown part ${id}`);
  return p;
};

export type JourneyStepId = 'choose' | 'pump' | 'inject' | 'separate' | 'detect' | 'ionise' | 'filter' | 'identify';

export interface JourneyStep {
  id: JourneyStepId;
  title: string;
  focus: PartId | 'overview';
  body: string;
}

export const JOURNEY: JourneyStep[] = [
  {
    id: 'choose',
    title: 'Pick a molecule to follow',
    focus: 'overview',
    body: 'Our sample is a dissolved tablet mixture holding three compounds. Choose one — you will track it all the way to an identification.',
  },
  {
    id: 'pump',
    title: 'Pressure on',
    focus: 'pump',
    body: 'The pump draws solvent from the reservoirs and pushes it through the system at a steady flow.',
  },
  {
    id: 'inject',
    title: 'Into the stream',
    focus: 'injector',
    body: 'The sample manager drops a few microlitres of the mixture into the moving liquid. All three compounds start together.',
  },
  {
    id: 'separate',
    title: 'The race through the column',
    focus: 'column',
    body: 'Each compound sticks to the packing a different amount, so they spread apart and leave one at a time. Press play to run the separation.',
  },
  {
    id: 'detect',
    title: 'Peaks appear',
    focus: 'uv',
    body: 'As each compound passes the detector it draws a peak. Three compounds, three peaks, each at its own retention time.',
  },
  {
    id: 'ionise',
    title: 'Give it a charge',
    focus: 'source',
    body: 'Electrospray turns the liquid into a charged mist. Your molecule picks up a proton and becomes an ion, [M+H]⁺.',
  },
  {
    id: 'filter',
    title: 'Tune the mass filter',
    focus: 'quadrupole',
    body: 'Set the quadrupole to a mass-to-charge value. Only ions with that m/z get through the rods. Can you tune it to your molecule?',
  },
  {
    id: 'identify',
    title: 'Identified',
    focus: 'ionDetector',
    body: 'Ions reaching the detector are counted. A sharp peak at exactly the expected m/z, at the expected time, tells us what the molecule is.',
  },
];
