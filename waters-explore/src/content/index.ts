export type ChapterId = 'science' | 'impact' | 'technology' | 'world' | 'people' | 'you';

export interface Chapter {
  id: ChapterId;
  index: string;
  label: string;
  title: string;
  lead: string;
}

export const CHAPTERS: Chapter[] = [
  {
    id: 'science',
    index: '01',
    label: 'Science',
    title: 'Working out what is inside a sample',
    lead:
      'Waters develops analytical technologies, informatics and services that help scientists analyse complex samples and make important decisions — from releasing safe medicines to detecting disease earlier.',
  },
  {
    id: 'impact',
    index: '02',
    label: 'Impact',
    title: 'From the lab to everyday life',
    lead:
      'Measurement on its own is not the goal. The goal is a confident decision: release this batch, trust this water, act on this result.',
  },
  {
    id: 'technology',
    index: '03',
    label: 'Technology',
    title: 'Inside an LC-MS system',
    lead:
      'Two ideas power most of the instrument. Liquid chromatography separates a mixture; mass spectrometry identifies what comes out. Explore the parts, then follow a sample all the way through.',
  },
  {
    id: 'world',
    index: '04',
    label: 'World',
    title: 'Science across industries',
    lead: 'The same core measurements answer very different questions, depending on who is asking.',
  },
  {
    id: 'people',
    index: '05',
    label: 'People',
    title: 'The expertise behind the science',
    lead: 'An instrument is the visible part. Behind every result is an ecosystem of people, technology and science.',
  },
  {
    id: 'you',
    index: '06',
    label: 'You',
    title: 'Every sample starts with a question',
    lead: 'Whatever brought you here, you are now part of the chain from a question to an answer someone can trust.',
  },
];

export const COMPANY = {
  name: 'Waters',
  tagline: 'A global leader in life sciences and diagnostics.',
  colleagues: '~16,000',
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
