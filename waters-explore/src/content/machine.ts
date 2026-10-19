export type ChapterId = 'science' | 'impact' | 'technology' | 'world' | 'people' | 'you';

export const ORDER: ChapterId[] = ['science', 'impact', 'technology', 'world', 'people', 'you'];

export const COMPANY = {
  name: 'Waters',
  tagline: 'A global leader in life sciences and diagnostics.',
  summary:
    'Waters develops analytical technologies, informatics and services that help scientists analyse complex samples and make important decisions — from releasing safe medicines to detecting disease earlier.',
  colleagues: '~16,000',
  divisions: [
    { name: 'Analytical Sciences', what: 'Liquid chromatography, mass spectrometry and the software around them.' },
    { name: 'Biosciences', what: 'Tools for studying cells — formerly BD Biosciences.' },
    { name: 'Advanced Diagnostics', what: 'Testing that helps clinicians find and manage infections — formerly BD Diagnostic Solutions.' },
    { name: 'Materials Sciences', what: 'Measuring how materials behave — heat, flow and strength.' },
  ],
};

export const SOURCES = [
  {
    label: "Waters completes combination with BD's Biosciences & Diagnostic Solutions (Feb 2026)",
    url: 'https://www.prnewswire.com/news-releases/waters-completes-combination-with-bds-biosciences--diagnostic-solutions-businesses-302682583.html',
  },
  {
    label: 'waters.com — Advancing biosciences, diagnostics & analytical science',
    url: 'https://www.waters.com/nextgen/us/en/c/promo/combination.html',
  },
  {
    label: 'Waters opens Global Capability Center in Bengaluru (Dec 2023)',
    url: 'https://ir.waters.com/News--Events/newsroom/news-details/2023/Waters-Corporation-Opens-New-State-of-the-Art-Global-Capability-Center-in-Bengaluru-India/default.aspx',
  },
  { label: 'waters.com — Careers: global locations', url: 'https://www.waters.com/careers' },
];

export const AREA_COLORS = ['#60d6ff', '#7dffb3', '#ffc678', '#aa80ff'] as const;

export const SCIENCE = {
  id: 'science' as const,
  index: '01',
  label: 'What does Waters do?',
  title: 'The science',
  lead: COMPANY.summary,
  simple: 'Think of it as helping scientists work out exactly what’s inside a sample — and trust the answer.',
  explore: [
    {
      name: 'Liquid chromatography',
      simple: 'Enter the experiment — inject a sample and watch compounds separate.',
      goto: 'technology' as const,
      ride: 'lc' as const,
    },
    {
      name: 'Mass spectrometry',
      simple: 'Follow the sample into the analyzer — ions split by mass-to-charge.',
      goto: 'technology' as const,
      ride: 'ms' as const,
    },
    {
      name: 'Informatics',
      simple: 'Software that turns instrument signals into answers a lab can trust.',
      deeper:
        'Instruments produce raw signals. Lab software (for example Empower chromatography data software and the waters_connect platform) captures that data, processes it into results and keeps an audit trail — essential in regulated labs such as pharma QC.',
    },
  ],
};

export const IMPACT = {
  id: 'impact' as const,
  index: '02',
  label: 'Why does it matter?',
  title: 'From lab → real world',
  lead:
    'Waters technologies sit behind decisions that reach everyday life. The goal isn’t just measurement — it’s helping scientists make better decisions.',
  areas: [
    { name: 'Medicines', what: 'Checking that effective, high-quality medicines are ready for release.' },
    { name: 'Food & water', what: 'Helping ensure the safety of what we eat and drink.' },
    { name: 'Diagnostics', what: 'Detecting diseases earlier and managing routine infections.' },
    { name: 'Antibiotic resistance', what: 'Supporting the fight against infections that stop responding to drugs.' },
  ],
};

export const TECHNOLOGY = {
  id: 'technology' as const,
  index: '03',
  label: 'The technology',
  title: 'Inside the chambers',
  lead: 'Two core ideas power most of the machine. Start simple — go deeper when you’re ready.',
  chambers: [
    {
      name: 'Liquid chromatography',
      short: 'LC',
      ride: 'lc' as const,
      steps: ['Separate', 'Analyze', 'Understand'],
      simple:
        'Imagine a race where every ingredient in a sample runs at a different speed — so they cross the finish line one at a time and you can look at each on its own.',
      deeper:
        'A liquid (the mobile phase) pushes the sample through a column packed with tiny particles (the stationary phase). Molecules that stick to the particles more move slower, so each compound leaves the column at its own retention time. A detector draws each one as a peak — the chromatogram. UPLC uses smaller particles at higher pressure for faster, sharper separations.',
    },
    {
      name: 'Mass spectrometry',
      short: 'MS',
      ride: 'ms' as const,
      steps: ['Identify', 'Measure', 'Understand'],
      simple:
        'A very precise scale for molecules. Weigh something that small accurately enough and you know exactly what it is — and how much of it is there.',
      deeper:
        'Molecules are given an electric charge (ionised), then sorted by their mass-to-charge ratio (m/z) and counted. The resulting spectrum is a fingerprint that identifies the molecule; the signal size tells you the quantity. Put LC in front (LC-MS) and you separate first, then identify each compound as it arrives.',
    },
  ],
};

export interface Site {
  id: string;
  name: string;
  country: string;
  lat: number;
  lon: number;
  what: string;
  layers?: string[];
}

export const SITES: Site[] = [
  { id: 'milford', name: 'Milford', country: 'USA', lat: 42.14, lon: -71.52, what: 'Global headquarters in Massachusetts.' },
  { id: 'wilmslow', name: 'Wilmslow', country: 'UK', lat: 53.33, lon: -2.23, what: "One of Waters' listed global locations, near Manchester." },
  { id: 'wexford', name: 'Wexford', country: 'Ireland', lat: 52.34, lon: -6.46, what: "One of Waters' listed global locations in the south-east of Ireland." },
  {
    id: 'bengaluru',
    name: 'Bengaluru',
    country: 'India',
    lat: 12.93,
    lon: 77.68,
    what: 'Global Capability Center, opened Dec 2023 at RMZ Ecoworld — software engineering, technology & product development, data analytics and IT for the whole enterprise.',
    layers: ['Teams', 'Technology', 'Operations', 'People'],
  },
];

export const WORLD = {
  id: 'world' as const,
  index: '04',
  label: 'Waters around the world',
  title: 'A global science company',
  lead: `About ${COMPANY.colleagues.slice(1)} colleagues, working with customers around the world.`,
  sites: SITES,
};

export const PEOPLE_NODES = [
  { id: 'scientists', name: 'Scientists', what: 'Chemistry, physics and biology experts who shape what the instruments can do.' },
  { id: 'engineers', name: 'Engineers', what: 'Design the hardware and keep the infrastructure running.' },
  { id: 'software', name: 'Software', what: 'Build the apps, instrument software and platforms.' },
  { id: 'data', name: 'Data', what: 'Turn data into insight — for customers and for Waters itself.' },
  { id: 'operations', name: 'Operations', what: 'Make, ship and support products reliably.' },
  { id: 'sales', name: 'Sales', what: 'Help labs find the right solution for their science.' },
  { id: 'service', name: 'Service', what: 'Install, maintain and fix instruments in customer labs.' },
  { id: 'business', name: 'Business', what: 'Finance, strategy and planning that keep the company moving.' },
  { id: 'hr', name: 'HR', what: 'Hire, onboard and grow the people who do all of the above.' },
];

export const PEOPLE = {
  id: 'people' as const,
  index: '05',
  label: 'Who works here?',
  title: 'An ecosystem',
  lead: "Waters isn't one kind of job. It's an ecosystem of people, technology and science.",
  nodes: PEOPLE_NODES,
};

/** Universal finale — no employee profile. */
export const YOU = {
  id: 'you' as const,
  index: '06',
  label: 'And you?',
  title: 'Where you fit',
  lead: 'Every sample starts with a question. Wherever you stand — visitor, new joiner, colleague — you are part of the chain that turns that question into an answer someone can trust.',
  chain: [
    { level: 'Question', name: 'What needs to be known?' },
    { level: 'Sample', name: 'Something real is measured' },
    { level: 'Science', name: 'LC and MS pull the answer out' },
    { level: 'People', name: 'Expertise on every side of the instrument' },
    { level: 'You', name: 'Your place in the chain' },
  ],
  note: 'This experience is general. It does not use personal employee data. The point is the connection: science, technology, people — and you.',
};

export const CHAPTERS = {
  science: SCIENCE,
  impact: IMPACT,
  technology: TECHNOLOGY,
  world: WORLD,
  people: PEOPLE,
  you: YOU,
};

export type RideKind = 'lc' | 'ms';
export type RideTrack = 'observe' | 'ride';

/** World-space anchors for the overview machine (mirrors the original canvas layout). */
export const PART_LAYOUT: Record<ChapterId, { pos: [number, number, number]; label: string }> = {
  science: { pos: [-2.4, 0.2, 0.35], label: 'Science' },
  technology: { pos: [0, 1.6, -0.4], label: 'Technology' },
  impact: { pos: [2.4, 0.2, 0.3], label: 'Impact' },
  world: { pos: [1.6, -1.5, -0.9], label: 'World' },
  people: { pos: [-1.6, -1.5, -0.9], label: 'People' },
  you: { pos: [0, -1.9, 1.4], label: 'You' },
};
