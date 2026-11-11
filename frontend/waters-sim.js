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
      { id: "A", fl: [0.78, 0.18], scatter: 0.55 },
      { id: "B", fl: [0.22, 0.8], scatter: 0.72 },
      { id: "unlabelled", fl: [0.14, 0.12], scatter: 0.4 },
    ],
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

  global.WatersSim = { illustrative: true, lc, flow, culture, heat };
})(window);
