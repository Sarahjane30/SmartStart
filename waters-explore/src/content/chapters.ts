export interface Division {
  name: string;
  what: string;
}

export const DIVISIONS: Division[] = [
  { name: 'Analytical Sciences', what: 'Liquid chromatography, mass spectrometry and the software around them.' },
  { name: 'Biosciences', what: 'Tools for studying cells — formerly BD Biosciences.' },
  { name: 'Advanced Diagnostics', what: 'Testing that helps clinicians find and manage infections — formerly BD Diagnostic Solutions.' },
  { name: 'Materials Sciences', what: 'Measuring how materials behave — heat, flow and strength.' },
];

export const SCIENCE_STEPS = [
  {
    verb: 'Separate',
    what: 'Pull a mixture apart so each ingredient can be looked at on its own.',
    how: 'Liquid chromatography',
  },
  {
    verb: 'Identify',
    what: 'Weigh each molecule precisely enough to know exactly what it is.',
    how: 'Mass spectrometry',
  },
  {
    verb: 'Understand',
    what: 'Turn raw signals into a result a lab can trust, audit and act on.',
    how: 'Informatics',
  },
];

export const WHY_IT_MATTERS = [
  'A sample can hold thousands of different molecules, most of them invisible and many at tiny concentrations.',
  'A decision is only as good as the measurement behind it — and in medicine, food or water, a wrong answer has consequences.',
  'Analytical science gives those decisions evidence: what is there, how much, and how sure we are.',
];

export interface ImpactStory {
  area: string;
  question: string;
  measure: string;
  decision: string;
}

export const IMPACT_STORIES: ImpactStory[] = [
  {
    area: 'Medicines',
    question: 'Does this batch of tablets contain the right dose, and nothing else?',
    measure: 'LC separates the active ingredient from impurities; the detector measures how much of each is present.',
    decision: 'The batch is released to patients — or held back.',
  },
  {
    area: 'Food & water',
    question: 'Is there a pesticide residue or contaminant above the safe limit?',
    measure: 'LC-MS picks out trace compounds at very low levels, even in a complicated sample.',
    decision: 'Food and drinking water meet safety standards before they reach people.',
  },
  {
    area: 'Diagnostics',
    question: 'What is causing this infection, and which treatment will work?',
    measure: 'Diagnostic tests detect the pathogen and the markers that guide clinicians.',
    decision: 'The right treatment is chosen earlier.',
  },
  {
    area: 'Antibiotic resistance',
    question: 'Will this infection still respond to the usual drugs?',
    measure: 'Testing shows which antibiotics a microbe is resistant to.',
    decision: 'Doctors avoid treatments that will not work, which helps slow resistance.',
  },
  {
    area: 'Discovery',
    question: 'Which proteins or metabolites change when a disease develops?',
    measure: 'Mass spectrometry measures thousands of molecules across many samples.',
    decision: 'Researchers find new targets and biomarkers to study further.',
  },
];

export const DISCOVERY_LOOP = ['Question', 'Sample', 'Separate', 'Measure', 'Interpret', 'Decide'];

export interface Industry {
  id: string;
  name: string;
  code: string;
  examples: string[];
  technique: string;
}

export const INDUSTRIES: Industry[] = [
  {
    id: 'pharma',
    name: 'Pharmaceutical',
    code: 'Rx',
    examples: ['Quality control before batch release', 'Impurity and stability testing', 'Supporting drug development'],
    technique: 'LC, LC-MS and chromatography data software in regulated labs.',
  },
  {
    id: 'biopharma',
    name: 'Biopharma',
    code: 'Bio',
    examples: ['Characterising antibodies and other biologics', 'Checking product consistency', 'Peptide mapping'],
    technique: 'High-resolution LC-MS for large, complex molecules.',
  },
  {
    id: 'clinical',
    name: 'Clinical & diagnostics',
    code: 'Dx',
    examples: ['Clinical research assays', 'Infectious disease testing', 'Microbiology and antibiotic susceptibility'],
    technique: 'Targeted mass spectrometry and diagnostic platforms.',
  },
  {
    id: 'food',
    name: 'Food & environment',
    code: 'Env',
    examples: ['Pesticide residues', 'Contaminants in drinking water', 'Food authenticity'],
    technique: 'Sensitive LC-MS methods that find trace compounds.',
  },
  {
    id: 'materials',
    name: 'Materials',
    code: 'Mat',
    examples: ['Polymers and plastics', 'Battery materials', 'How materials respond to heat and stress'],
    technique: 'Thermal analysis and rheology alongside chromatography.',
  },
  {
    id: 'research',
    name: 'Academic research',
    code: 'R&D',
    examples: ['Proteomics and metabolomics', 'Biomarker discovery', 'Fundamental chemistry'],
    technique: 'Mass spectrometry that measures thousands of molecules at once.',
  },
];

export interface Site {
  id: string;
  name: string;
  country: string;
  lat: number;
  lon: number;
  what: string;
}

export const SITES: Site[] = [
  { id: 'milford', name: 'Milford', country: 'USA', lat: 42.14, lon: -71.52, what: 'Global headquarters in Massachusetts.' },
  { id: 'wilmslow', name: 'Wilmslow', country: 'UK', lat: 53.33, lon: -2.23, what: 'One of Waters’ listed global locations, near Manchester.' },
  { id: 'wexford', name: 'Wexford', country: 'Ireland', lat: 52.34, lon: -6.46, what: 'One of Waters’ listed global locations in the south-east of Ireland.' },
  {
    id: 'bengaluru',
    name: 'Bengaluru',
    country: 'India',
    lat: 12.93,
    lon: 77.68,
    what: 'Global Capability Center, opened Dec 2023 — software engineering, product development, data analytics and IT for the whole enterprise.',
  },
];

export interface Role {
  id: string;
  name: string;
  what: string;
  touches: string;
}

export const ROLES: Role[] = [
  { id: 'scientists', name: 'Scientists', what: 'Chemistry, physics and biology experts who shape what the instruments can do.', touches: 'New methods and applications' },
  { id: 'engineers', name: 'Engineers', what: 'Design the hardware and keep the infrastructure running.', touches: 'Pumps, columns, ion optics, electronics' },
  { id: 'software', name: 'Software', what: 'Build the instrument software, apps and platforms.', touches: 'Control, acquisition and data processing' },
  { id: 'data', name: 'Data', what: 'Turn data into insight — for customers and for the company itself.', touches: 'Analytics, models and reporting' },
  { id: 'operations', name: 'Operations', what: 'Make, ship and support products reliably.', touches: 'Manufacturing and supply chain' },
  { id: 'sales', name: 'Sales', what: 'Help labs find the right solution for their science.', touches: 'Customer conversations' },
  { id: 'service', name: 'Service', what: 'Install, maintain and fix instruments in customer labs.', touches: 'Instrument uptime' },
  { id: 'business', name: 'Business', what: 'Finance, strategy and planning that keep the company moving.', touches: 'Investment and direction' },
  { id: 'hr', name: 'People teams', what: 'Hire, onboard and grow the people who do all of the above.', touches: 'Every other role' },
];

export interface Motivation {
  id: string;
  label: string;
  message: string;
}

export const MOTIVATIONS: Motivation[] = [
  { id: 'medicine', label: 'Safer medicines', message: 'Somewhere today, a batch of medicine is released because a measurement said it was right.' },
  { id: 'food', label: 'Clean food & water', message: 'Somewhere today, a glass of water is safe to drink because someone checked what was in it.' },
  { id: 'health', label: 'Earlier diagnosis', message: 'Somewhere today, a patient gets the right treatment sooner because a test gave a clear answer.' },
  { id: 'discovery', label: 'New discoveries', message: 'Somewhere today, a researcher sees a peak nobody expected — and a new question begins.' },
];
