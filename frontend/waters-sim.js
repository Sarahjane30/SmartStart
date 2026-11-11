/* Waters Technology universe — illustrative simulations.
   Pure functions of time and inputs; nothing here draws. Each model is a teaching
   simplification chosen for legibility, not instrument data or a product specification.
   Parameters live in one place per model so they can be reviewed independently. */
(function (global) {
  "use strict";

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const gauss = (x, mu, sigma) => Math.exp(-((x - mu) ** 2) / (2 * sigma * sigma));

  /* Liquid chromatography. Each component travels the column at its own constant speed
     (stronger interaction with the stationary phase = slower). Bands broaden with distance
     travelled, so later-eluting peaks are lower and wider for the same amount injected. */
  const lc = {
    speeds: [1, 0.68, 0.46],
    run: 1.25,
    band(i, t) {
      const pos = t * this.speeds[i] * 2.2;
      return { pos, width: 0.035 + 0.06 * Math.sqrt(clamp(pos, 0, 1)), eluted: pos > 1 };
    },
    retention(i) {
      return 1 / (this.speeds[i] * 2.2);
    },
    signal(t) {
      return this.speeds.reduce((s, _, i) => {
        const tr = this.retention(i);
        const sigma = 0.02 + 0.03 * tr;
        return s + (0.04 / sigma) * gauss(t, tr, sigma);
      }, 0);
    },
  };

  /* Flow cytometry. Cells pass the laser one at a time. Scatter relates to size and
     internal complexity; fluorescence reports which labelled antibody a cell carries.
     Populations are generic (A, B, unlabelled) — not a specific panel or assay. */
  const flow = {
    rate: 1.6,
    populations: [
      { id: "A", fl: [0.78, 0.18], scatter: 0.55, fsc: 0.55, ssc: 0.3 },
      { id: "B", fl: [0.22, 0.8], scatter: 0.72, fsc: 0.72, ssc: 0.68 },
      { id: "unlabelled", fl: [0.14, 0.12], scatter: 0.4, fsc: 0.42, ssc: 0.22 },
    ],
    /* Pulse heights a cell produces at each detector as it crosses the laser. */
    signals(k) {
      const c = this.cell(k);
      const P = this.populations[c.pop];
      const h = Math.sin(k * 57.3) * 9631.7;
      const j = (h - Math.floor(h) - 0.5) * 0.12;
      return { pop: c.pop, fsc: P.fsc + j, ssc: P.ssc - j * 0.5, fl: Math.max(c.x, c.y) * (c.pop === 2 ? 0.25 : 1) };
    },
    share(pop, n) {
      if (n <= 0) return 0;
      let hit = 0;
      for (let k = 0; k < n; k += 1) if (this.cell(k).pop === pop) hit += 1;
      return hit / n;
    },
    cell(k) {
      const h = Math.sin(k * 127.1) * 43758.5453;
      const r = h - Math.floor(h);
      const h2 = Math.sin(k * 311.7) * 24634.6345;
      const r2 = h2 - Math.floor(h2);
      const pop = k % 7 < 3 ? 0 : k % 7 < 5 ? 1 : 2;
      const P = this.populations[pop];
      return { pop, x: clamp(P.fl[0] + (r - 0.5) * 0.18, 0.02, 0.98), y: clamp(P.fl[1] + (r2 - 0.5) * 0.18, 0.02, 0.98), scatter: P.scatter };
    },
    progress(k, t) {
      return t * this.rate - k;
    },
  };

  /* Blood culture. Microbes grow logistically in the bottle's medium; their metabolism
     produces CO2, which a sensor reports as a rising signal. The bottle flags positive when
     the signal crosses a threshold. Times are in hours and purely illustrative. */
  const culture = {
    doublingHours: 0.75,
    startFraction: 1e-6,
    threshold: 0.12,
    hours: 30,
    growth(h) {
      const r = Math.LN2 / this.doublingHours;
      const n0 = this.startFraction;
      return 1 / (1 + ((1 - n0) / n0) * Math.exp(-r * Math.max(0, h)));
    },
    signal(h) {
      return 0.04 + 0.9 * this.growth(h);
    },
    flagHours() {
      const r = Math.LN2 / this.doublingHours;
      const g = (this.threshold - 0.04) / 0.9;
      const n0 = this.startFraction;
      return Math.log(((1 - n0) / n0) * (g / (1 - g))) / r;
    },
  };

  /* Identification by fingerprint. A sample's peak pattern is compared with reference
     patterns by cosine similarity; the closest reference names the organism. Patterns are
     invented for illustration and do not represent real organisms. */
  const identify = {
    sample: [0.2, 0.9, 0.35, 0.1, 0.7, 0.15, 0.55, 0.05, 0.8, 0.3, 0.12, 0.45],
    library: [
      { name: "Reference organism 1", peaks: [0.7, 0.2, 0.1, 0.6, 0.15, 0.5, 0.1, 0.4, 0.2, 0.1, 0.6, 0.2] },
      { name: "Reference organism 2", peaks: [0.25, 0.85, 0.3, 0.12, 0.65, 0.2, 0.5, 0.08, 0.75, 0.35, 0.1, 0.4] },
      { name: "Reference organism 3", peaks: [0.1, 0.3, 0.8, 0.2, 0.1, 0.7, 0.2, 0.6, 0.1, 0.5, 0.3, 0.1] },
      { name: "Reference organism 4", peaks: [0.5, 0.5, 0.2, 0.4, 0.4, 0.1, 0.7, 0.3, 0.3, 0.2, 0.5, 0.6] },
    ],
    similarity(a, b) {
      let ab = 0;
      let aa = 0;
      let bb = 0;
      a.forEach((v, i) => {
        ab += v * b[i];
        aa += v * v;
        bb += b[i] * b[i];
      });
      return ab / Math.sqrt(aa * bb);
    },
    best() {
      return this.library.reduce((m, r, i) => (this.similarity(this.sample, r.peaks) > this.similarity(this.sample, this.library[m].peaks) ? i : m), 0);
    },
  };

  /* Antibiotic susceptibility by broth dilution. Wells hold doubling concentrations; the
     organism grows wherever the concentration is below its MIC. Comparing the MIC with a
     breakpoint gives susceptible or resistant. Drugs, MICs and breakpoints are invented. */
  const susceptibility = {
    drugs: ["Antibiotic A", "Antibiotic B", "Antibiotic C", "Antibiotic D"],
    conc: [0.25, 0.5, 1, 2, 4, 8, 16, 32],
    mic: [2, 7, 3, 8],
    breakpoint: [3, 4, 4, 3],
    growth(row, col, t) {
      if (col >= this.mic[row]) return 0;
      return 1 / (1 + Math.exp(-(t - 0.45) * 9));
    },
    result(row) {
      return this.mic[row] <= this.breakpoint[row] ? "S" : "R";
    },
  };

  /* Oscillatory rheology. Strain is sinusoidal; stress leads it by a phase δ between 0°
     (elastic solid) and 90° (viscous liquid). */
  const rheology = {
    omega: 2.2,
    phase(liquid) {
      return (4 + 82 * clamp(liquid, 0, 1)) * (Math.PI / 180);
    },
    strain(t) {
      return Math.sin(this.omega * t);
    },
    stress(t, liquid) {
      return Math.sin(this.omega * t + this.phase(liquid));
    },
  };

  /* Thermogravimetric analysis. Mass falls in steps as moisture and then a component leave
     the sample. T is normalised 0–1. */
  const tga = {
    steps: [
      { at: 0.22, width: 0.025, loss: 0.06 },
      { at: 0.64, width: 0.035, loss: 0.52 },
    ],
    mass(T) {
      return this.steps.reduce((m, s) => m - s.loss / (1 + Math.exp(-(T - s.at) / s.width)), 1);
    },
    rate(T) {
      return (this.mass(T) - this.mass(T + 0.005)) / 0.005;
    },
  };

  /* Heating a crystalline solid. Thermal vibration grows with temperature (mean-square
     displacement ∝ T, so amplitude ∝ √T); at the melting point long-range order is lost.
     DSC records the extra heat absorbed while melting as a peak. T is normalised 0–1. */
  const heat = {
    melt: 0.62,
    width: 0.05,
    amplitude(T) {
      return 0.012 + 0.05 * Math.sqrt(clamp(T, 0, 1));
    },
    molten(T) {
      return clamp((T - (this.melt - this.width)) / (2 * this.width), 0, 1);
    },
    heatFlow(T) {
      return 0.08 + 0.05 * T + 0.75 * gauss(T, this.melt, this.width * 0.7);
    },
  };

  global.WatersSim = { illustrative: true, lc, flow, culture, heat, identify, susceptibility, rheology, tga };
})(window);
