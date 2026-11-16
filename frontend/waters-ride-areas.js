/* Waters — 3D films for Biosciences, Advanced Diagnostics and Materials Sciences.
   Same engine and visual language as the LC-MS ride: scroll is the camera, drag orbits,
   hover explains. Each film follows one sample through the real sequence of steps.
   Every instrument here is a generic illustration, never a specific product. */
(function (global) {
  "use strict";

  const RIDE = global.WatersRide;
  if (!RIDE || !RIDE.kit) return;
  const kit = RIDE.kit;
  const { S, R, G, win, sm, bell, easeIO, K, track, type, whisper, hot, linkRow, bgVoid, bgBlack, stars, flash, setCam } = kit;
  const { TAU, v, add, sub, mul, mix3, lerp, clamp, rgba, norm, cross, CYAN, VIOLET, MINT } = G;
  const WHITE = [255, 255, 255];
  const ICE = [200, 225, 255];
  const STEEL = [160, 174, 200];
  const BLUE = [112, 150, 255];
  const MAGENTA = [255, 96, 196];
  const cx = () => kit.ctx;
  const FONT = "Inter, system-ui, sans-serif";

  let seed = 90210;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const fib = (n, i) => {
    const y = 1 - ((i + 0.5) / n) * 2;
    const r = Math.sqrt(1 - y * y);
    const th = i * 2.399963;
    return v(Math.cos(th) * r, y, Math.sin(th) * r);
  };

  /* ---------- shared drawing ---------- */

  function glow(x, y, r, col, a) {
    if (a <= 0.01 || r <= 0.5) return;
    const c = cx();
    c.save();
    c.globalCompositeOperation = "lighter";
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(col, a));
    g.addColorStop(1, rgba(col, 0));
    c.fillStyle = g;
    c.beginPath();
    c.arc(x, y, r, 0, TAU);
    c.fill();
    c.restore();
  }

  function scene(cam, build, orbit = true) {
    setCam(cam, orbit);
    build();
    const c = cx();
    c.globalCompositeOperation = "source-over";
    R.flush(c);
    c.globalCompositeOperation = "source-over";
  }

  function backdrop(energy = 0) {
    bgVoid(1, energy);
    stars(0.35);
  }

  // One line of large type and one quiet line under it, bottom left, so the scene keeps the frame.
  function headline(text, line, a) {
    if (a <= 0.01) return;
    const x = Math.max(28, S.w * 0.06);
    const c = cx();
    let size = clamp(Math.min(S.w * 0.04, S.h * 0.07), 24, 52);
    c.save();
    c.font = `800 ${size}px ${FONT}`;
    const tw = c.measureText(text).width;
    c.restore();
    const room = S.w - x - Math.max(90, S.w * 0.08);
    if (tw > room) size = Math.max(18, (size * room) / tw);
    const y = S.h - Math.max(96, S.h * 0.15);
    type(text, x, y, { size, weight: 800, align: "left", alpha: a, blur: (1 - a) * 6, track: 0.004 });
    if (line) whisper(line, x + 2, y + size * 0.82, a * 0.6, { track: 0.14, size: 11 });
  }

  // A world-space label with a short leader line; returns the projected anchor.
  function tag3(p3, text, a, o = {}) {
    const p = R.project(p3);
    if (!p.vis || a <= 0.01) return p;
    const c = cx();
    const dx = o.dx == null ? 34 : o.dx;
    const dy = o.dy == null ? -30 : o.dy;
    const col = o.color || ICE;
    c.save();
    c.strokeStyle = rgba(col, a * 0.55);
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(p.x, p.y);
    c.lineTo(p.x + dx, p.y + dy);
    c.lineTo(p.x + dx + Math.sign(dx || 1) * 14, p.y + dy);
    c.stroke();
    c.restore();
    whisper(text, p.x + dx + Math.sign(dx || 1) * 20, p.y + dy, a * 0.9, { weight: 600, color: o.text || WHITE, align: dx < 0 ? "right" : "left", track: 0.16 });
    return p;
  }

  function near(p3, r, tip) {
    const p = R.project(p3);
    if (p.vis && Math.hypot(S.mx - p.x, S.my - p.y) < Math.max(18, r * p.s)) S.tip = tip;
  }

  // A small glass panel with a plot; `fn(u)` in 0..1 is drawn up to `upto`.
  function plotPanel(box, fn, upto, a, o = {}) {
    if (a <= 0.01) return null;
    const c = cx();
    const { x, y, w, h } = box;
    c.save();
    c.fillStyle = `rgba(4, 9, 26, ${0.62 * a})`;
    c.strokeStyle = rgba(ICE, 0.16 * a);
    c.lineWidth = 1;
    c.beginPath();
    if (c.roundRect) c.roundRect(x, y, w, h, 12);
    else c.rect(x, y, w, h);
    c.fill();
    c.stroke();
    const px = x + 18;
    const py = y + h - 26;
    const pw = w - 36;
    const ph = h - 56;
    c.strokeStyle = rgba(ICE, 0.3 * a);
    c.beginPath();
    c.moveTo(px, py - ph);
    c.lineTo(px, py);
    c.lineTo(px + pw, py);
    c.stroke();
    if (o.thr != null) {
      c.strokeStyle = rgba(o.thrColor || VIOLET, 0.7 * a);
      c.setLineDash([4, 5]);
      c.beginPath();
      c.moveTo(px, py - o.thr * ph);
      c.lineTo(px + pw, py - o.thr * ph);
      c.stroke();
      c.setLineDash([]);
    }
    const col = o.color || CYAN;
    const pts = [];
    const n = 160;
    for (let i = 0; i <= n * clamp(upto, 0, 1); i += 1) pts.push([px + (i / n) * pw, py - clamp(fn(i / n), -0.05, 1.05) * ph]);
    if (pts.length > 1) {
      c.globalCompositeOperation = "lighter";
      c.strokeStyle = rgba(col, 0.95 * a);
      c.lineWidth = 2;
      c.beginPath();
      pts.forEach(([X, Y], i) => (i ? c.lineTo(X, Y) : c.moveTo(X, Y)));
      c.stroke();
      const [tx, ty] = pts[pts.length - 1];
      if (upto < 0.999) glow(tx, ty, 16, col, 0.8 * a);
    }
    c.restore();
    whisper(o.y || "", px + 4, y + 16, a * 0.7, { track: 0.14, size: 9.5 });
    whisper(o.x || "", px + pw, py + 15, a * 0.6, { track: 0.14, size: 9.5, align: "right" });
    return { px, py, pw, ph };
  }

  const panelBox = (wide = 0.27, tall = 0.3) => {
    const w = clamp(S.w * wide, 260, 420);
    const h = clamp(S.h * tall, 170, 260);
    return { x: S.w - w - Math.max(56, S.w * 0.06), y: S.h * 0.16, w, h };
  };

  function edge(c, n, t) {
    const fin = c > 0 ? sm(win(t, 0, 0.045)) : 1;
    const fout = c < n - 1 ? 1 - sm(win(t, 0.955, 1)) : 1;
    const k = 1 - fin * fout;
    if (k > 0.005) bgBlack(k);
  }

  function endCard(t, done, back) {
    const a = sm(win(t, 0.84, 0.95));
    if (a <= 0.01) return;
    const c = cx();
    c.fillStyle = `rgba(0,0,0,${0.86 * a})`;
    c.fillRect(0, 0, S.w, S.h);
    const size = Math.min(S.w * 0.048, S.h * 0.08, 54);
    type(done, S.w / 2, S.h * 0.44, { size, weight: 800, alpha: a, blur: (1 - a) * 6 });
    linkRow(
      [
        ["↺  WATCH AGAIN", () => kit.autopilot(0, 4, true)],
        [back, () => kit.close()],
      ],
      S.h * 0.6,
      a
    );
  }

  // A Y-shaped antibody: the two arms grip the marker, the stem carries the fluorescent tag.
  function antibody(at, n, col, a, lit) {
    let side = cross(n, v(0, 1, 0));
    if (G.len(side) < 0.1) side = cross(n, v(1, 0, 0));
    side = norm(side);
    const fork = add(at, mul(n, 0.07));
    const stemEnd = add(fork, mul(n, 0.1));
    const armA = add(at, mul(side, 0.045));
    const armB = add(at, mul(side, -0.045));
    const steel = [210, 220, 240];
    G.drawTube(R, [armA, fork], 0.012, { color: steel, glass: false, alpha: a });
    G.drawTube(R, [armB, fork], 0.012, { color: steel, glass: false, alpha: a });
    G.drawTube(R, [fork, stemEnd], 0.014, { color: steel, glass: false, alpha: a });
    G.drawSphere(R, stemEnd, 0.024, col, { alpha: a, glow: 0.4 + lit * 1.6 });
  }

  /* =====================================================================
     BIOSCIENCES · FLOW CYTOMETRY
     ===================================================================== */

  const BIO_NAMES = ["THE SAMPLE", "TAGGING", "SINGLE FILE", "THE LASER", "ONE CELL, ONE DOT"];
  const POP = [
    { col: VIOLET, c: v(1.45, 0.55, 1.35), s: 0.16, share: 0.42, name: "CELL TYPE A" },
    { col: CYAN, c: v(0.55, 1.25, 0.5), s: 0.15, share: 0.35, name: "CELL TYPE B" },
    { col: [150, 170, 210], c: v(0.5, 0.35, 0.12), s: 0.14, share: 0.23, name: "UNTAGGED" },
  ];
  const TUBE_CELLS = Array.from({ length: 70 }, () => ({
    p: v((rnd() - 0.5) * 0.72, -1.05 + rnd() * 1.45, (rnd() - 0.5) * 0.72),
    r: 0.03 + rnd() * 0.03,
    ph: rnd() * TAU,
    k: rnd(),
  }));
  const FILE_CELLS = Array.from({ length: 38 }, (_, i) => ({ o: i / 38, r: rnd(), th: rnd() * TAU, k: i % 3 }));
  const DOTS = Array.from({ length: 330 }, (_, i) => {
    const u = rnd();
    const g = u < POP[0].share ? 0 : u < POP[0].share + POP[1].share ? 1 : 2;
    const P = POP[g];
    const gs = () => Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(TAU * rnd());
    return { g, p: add(P.c, v(gs() * P.s, gs() * P.s, gs() * P.s)), d: i / 330 };
  });
  const MARK_A = Array.from({ length: 14 }, (_, i) => fib(14, i));
  const MARK_B = Array.from({ length: 14 }, (_, i) => fib(14, i + 0.37));

  function bioSample(t) {
    backdrop();
    const cam = track(
      [
        K(0, [2.8, 0.9, 6.2], [0, 0.05, 0], 36),
        K(0.62, [1.1, 0.25, 2.3], [0, -0.15, 0], 40),
        K(1, [0.18, -0.25, 0.42], [0, -0.32, -0.5], 68),
      ],
      easeIO(t)
    );
    scene(cam, () => {
      G.drawCylinder(R, v(0, -1.15, 0), v(0, 0.48, 0), 0.43, { color: [70, 60, 140], alpha: 0.28, segments: 30, caps: false });
      G.drawCylinder(R, v(0, -1.2, 0), v(0, 1.2, 0), 0.46, { glass: true, segments: 30 });
      G.drawCylinder(R, v(0, 1.2, 0), v(0, 1.46, 0), 0.5, { color: VIOLET, segments: 30 });
      TUBE_CELLS.forEach((c) => {
        const p = add(c.p, v(Math.sin(S.clock * 0.4 + c.ph) * 0.03, Math.cos(S.clock * 0.3 + c.ph) * 0.03, 0));
        const col = c.k < 0.4 ? G.shade(VIOLET, 1.1) : c.k < 0.75 ? G.shade(CYAN, 1) : ICE;
        G.drawSphere(R, p, c.r, W_mix(ICE, col, 0.35), { alpha: 0.9, glass: true });
        G.drawSphere(R, p, c.r * 0.42, W_mix(ICE, col, 0.5), { alpha: 0.8 });
      });
      G.drawShadow(R, v(0, 0, 0), 0.9, 0.9, 0.45);
    });
    near(v(0, -0.4, 0), 0.5, "A blood or tissue sample: millions of cells that look alike under a microscope.");
    headline("MILLIONS OF CELLS IN ONE SAMPLE.", "BIOSCIENCES  ·  FLOW CYTOMETRY", bell(t, 0.04, 0.72, 0.08));
    tag3(v(0.46, 0.9, 0), "SAMPLE TUBE", bell(t, 0.1, 0.55, 0.06));
  }

  function W_mix(a, b, k) {
    return [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
  }

  function bioTag(t) {
    backdrop();
    const ang = lerp(-0.5, 0.45, easeIO(t));
    const cam = { pos: v(Math.sin(ang) * 3.6, 0.7, Math.cos(ang) * 3.6), target: v(0, -0.05, 0), fov: 40 * (Math.PI / 180) };
    const cells = [
      { c: v(-0.95, 0.1, 0), r: 0.55, marks: MARK_A, col: VIOLET },
      { c: v(0.95, 0.05, -0.2), r: 0.55, marks: MARK_B, col: CYAN },
      { c: v(0.05, -0.85, -1.2), r: 0.38, marks: [], col: null },
    ];
    const lit = [0, 0];
    scene(cam, () => {
      cells.forEach((cell, ci) => {
        const spin = S.clock * 0.12 * (ci ? -1 : 1);
        const rot = (p) => v(p.x * Math.cos(spin) - p.z * Math.sin(spin), p.y, p.x * Math.sin(spin) + p.z * Math.cos(spin));
        cell.marks.forEach((m0, i) => {
          const m = rot(m0);
          const at = add(cell.c, mul(m, cell.r));
          G.drawSphere(R, at, 0.035, W_mix(ICE, cell.col, 0.25), { alpha: 0.95 });
          const u = easeIO(clamp((t - 0.12 - i * 0.022 - ci * 0.05) / 0.36, 0, 1));
          if (u <= 0) return;
          const from = add(cell.c, mul(norm(add(m, v(Math.sin(i * 3.1) * 0.6, 0.4, Math.cos(i * 1.7) * 0.6))), 2.6));
          const dockAt = add(at, mul(m, 0.035));
          antibody(mix3(from, dockAt, u), m, cell.col, Math.min(1, u * 3), u >= 1 ? 1 : 0);
          if (u >= 1) lit[ci] += 1 / cell.marks.length;
        });
        const glowK = ci < 2 ? lit[ci] : 0;
        G.drawSphere(R, cell.c, cell.r, cell.col ? W_mix(ICE, cell.col, 0.15 + glowK * 0.4) : [120, 135, 170], { alpha: 0.95, glass: true, glow: glowK * 0.5 });
        G.drawSphere(R, add(cell.c, v(0.08, 0.05, 0.1)), cell.r * 0.4, cell.col ? W_mix([150, 160, 210], cell.col, 0.3) : [90, 100, 130], { alpha: 0.85 });
      });
    });
    const tagA = sm(win(t, 0.55, 0.65));
    tag3(add(cells[0].c, v(-0.4, 0.42, 0)), "MARKER 1  ·  GLOWS VIOLET", tagA * bell(t, 0.5, 0.96, 0.05), { dx: -40, color: VIOLET });
    tag3(add(cells[1].c, v(0.42, 0.42, 0)), "MARKER 2  ·  GLOWS CYAN", tagA * bell(t, 0.5, 0.96, 0.05), { color: CYAN });
    tag3(add(cells[2].c, v(0.3, -0.2, 0)), "NO MARKER  ·  STAYS DARK", sm(win(t, 0.62, 0.72)) * bell(t, 0.5, 0.96, 0.05), { dy: 26 });
    near(cells[0].c, 0.6, "Antibodies bind one specific surface marker. Each carries a fluorescent tag.");
    near(cells[1].c, 0.6, "A different marker, a different antibody, a different colour.");
    headline("TAG EACH CELL TYPE WITH LIGHT.", "ANTIBODIES FIND ONE MARKER EACH AND CARRY A FLUORESCENT TAG", bell(t, 0.04, 0.95, 0.06));
  }

  const funnelR = (y) => (y > 1.3 ? 0.62 : y > 0.35 ? lerp(0.07, 0.62, sm((y - 0.35) / 0.95)) : 0.07);

  function bioFile(t) {
    backdrop();
    const cam = track(
      [
        K(0, [2.4, 2.4, 3.6], [0, 1.1, 0], 40),
        K(0.55, [1.5, 0.9, 2.4], [0, 0.4, 0], 40),
        K(1, [0.55, -0.4, 1.05], [0, -0.55, 0], 46),
      ],
      easeIO(t)
    );
    scene(cam, () => {
      for (let i = 0; i < 10; i += 1) {
        const y0 = 2.1 - i * 0.18;
        const y1 = y0 - 0.18;
        G.drawCylinder(R, v(0, y1, 0), v(0, y0, 0), funnelR((y0 + y1) / 2) + 0.03, { glass: true, segments: 28, caps: false });
      }
      G.drawCylinder(R, v(0, -2.2, 0), v(0, 0.36, 0), 0.1, { glass: true, segments: 20, caps: false });
      FILE_CELLS.forEach((c) => {
        const s = (S.flow * 0.11 + c.o) % 1;
        const y = lerp(2.05, -2.15, s);
        const rr = funnelR(y) * 0.8 * c.r;
        const p = v(Math.cos(c.th + s * 3) * rr, y, Math.sin(c.th + s * 3) * rr);
        const col = [VIOLET, CYAN, [150, 170, 210]][c.k];
        G.drawSphere(R, p, 0.05, W_mix(ICE, col, 0.4), { alpha: 0.95, glass: true, glow: 0.3 });
        G.drawSphere(R, p, 0.02, col, { alpha: 0.9 });
      });
    });
    const c = cx();
    c.save();
    c.globalCompositeOperation = "lighter";
    for (let k = 0; k < 12; k += 1) {
      const th = (k / 12) * TAU;
      c.strokeStyle = rgba(BLUE, 0.16);
      c.lineWidth = 1;
      c.setLineDash([6, 10]);
      c.lineDashOffset = -S.flow * 60;
      c.beginPath();
      for (let j = 0; j <= 30; j += 1) {
        const y = lerp(2.15, -1.6, j / 30);
        const rr = funnelR(y) * 0.95;
        const q = R.project(v(Math.cos(th) * rr, y, Math.sin(th) * rr));
        if (j) c.lineTo(q.x, q.y);
        else c.moveTo(q.x, q.y);
      }
      c.stroke();
    }
    c.restore();
    tag3(v(0.62, 1.8, 0), "SHEATH FLUID", bell(t, 0.08, 0.6, 0.06), { color: BLUE });
    tag3(v(0.1, -0.6, 0), "ONE CELL WIDE", bell(t, 0.45, 0.95, 0.06));
    near(v(0, 1.2, 0), 0.7, "Faster-flowing sheath fluid narrows the sample stream, a principle called hydrodynamic focusing.");
    headline("SQUEEZED INTO A STREAM ONE CELL WIDE.", "SHEATH FLUID NARROWS THE SAMPLE SO CELLS PASS ONE AT A TIME", bell(t, 0.04, 0.95, 0.06));
  }

  const LASER_GAP = 0.62;
  const cellY = (i, f) => 1.6 - ((f * 0.55 + i * LASER_GAP) % (LASER_GAP * 6));
  const pulseOf = (f, kind) => {
    let s = 0;
    for (let i = 0; i < 6; i += 1) {
      const y = cellY(i, f);
      const amp = kind === 0 ? [0.8, 0.55, 0.65][i % 3] : kind === 1 ? [0.45, 0.85, 0.35][i % 3] : [0.95, 0.15, 0.05][i % 3];
      s += amp * Math.exp(-(y * y) / 0.004);
    }
    return s;
  };

  function bioLaser(t) {
    backdrop(0.15);
    const cam = track(
      [
        K(0, [1.9, 1.3, 4.6], [0.2, 0, 0], 40),
        K(0.6, [1.2, 0.55, 2.6], [0.1, 0, 0], 40),
        K(1, [0.75, 0.25, 1.35], [0, 0, 0], 46),
      ],
      easeIO(t)
    );
    let hit = 0;
    let hitK = 0;
    scene(cam, () => {
      G.drawCylinder(R, v(0, -1.6, 0), v(0, 1.6, 0), 0.08, { glass: true, segments: 18, caps: false });
      G.drawBox(R, null, v(-2.4, 0, 0), v(0.28, 0.18, 0.18), { color: [70, 80, 120], radius: 6 });
      G.drawBox(R, null, v(2.05, 0, 0), v(0.08, 0.26, 0.26), { color: [60, 72, 110], radius: 4 });
      G.drawBox(R, null, v(0, 0, -1.75), v(0.26, 0.26, 0.08), { color: [60, 72, 110], radius: 4 });
      for (let i = 0; i < 6; i += 1) {
        const y = cellY(i, S.flow);
        const h = Math.exp(-(y * y) / 0.006);
        if (h > hit) {
          hit = h;
          hitK = i % 3;
        }
        const col = [VIOLET, CYAN, [150, 170, 210]][i % 3];
        G.drawSphere(R, v(0, y, 0), 0.055, W_mix(ICE, col, 0.4), { alpha: 0.95, glass: true, glow: 0.2 + h * 2 });
        G.drawSphere(R, v(0, y, 0), 0.022, col, { alpha: 0.95 });
      }
    });
    const c = cx();
    const src = R.project(v(-2.12, 0, 0));
    const mid = R.project(v(0, 0, 0));
    const fsc = R.project(v(1.97, 0, 0));
    const ssc = R.project(v(0, 0, -1.67));
    c.save();
    c.globalCompositeOperation = "lighter";
    c.lineCap = "round";
    c.strokeStyle = rgba(VIOLET, 0.75);
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(src.x, src.y);
    c.lineTo(mid.x, mid.y);
    c.stroke();
    c.strokeStyle = rgba(VIOLET, 0.25);
    c.lineWidth = 9;
    c.stroke();
    const hc = [VIOLET, CYAN, [190, 205, 240]][hitK];
    if (hit > 0.02) {
      c.strokeStyle = rgba(ICE, hit * 0.8);
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(mid.x, mid.y);
      c.lineTo(fsc.x, fsc.y);
      c.stroke();
      c.strokeStyle = rgba(hc, hit * 0.85);
      c.beginPath();
      c.moveTo(mid.x, mid.y);
      c.lineTo(ssc.x, ssc.y);
      c.stroke();
    }
    c.restore();
    glow(mid.x, mid.y, 30 + hit * 70, hc, 0.25 + hit * 0.7);
    glow(fsc.x, fsc.y, 26, ICE, hit * 0.6);
    glow(ssc.x, ssc.y, 26, hc, hit * 0.6);
    const la = bell(t, 0.06, 0.95, 0.06);
    tag3(v(-2.4, 0.2, 0), "LASER", la, { color: VIOLET, dy: -34 });
    tag3(v(2.05, 0.28, 0), "FORWARD SCATTER  ·  SIZE", la, { dy: -30 });
    near(v(-2.4, 0, 0), 0.3, "A focused laser. Every cell crossing it scatters light and makes its tags glow.");
    near(v(2.05, 0, 0), 0.3, "Light scattered forward roughly tracks the cell's size.");
    near(v(0, 0, -1.75), 0.3, "Light at 90°: side scatter reports internal complexity; filtered colours report each fluorescent tag.");

    const box = panelBox(0.25, 0.34);
    const pa = sm(win(t, 0.18, 0.3)) * (1 - sm(win(t, 0.95, 1)));
    if (pa > 0.01) {
      const rows = [
        ["FORWARD SCATTER", ICE, 0],
        ["SIDE SCATTER", CYAN, 1],
        ["FLUORESCENCE", VIOLET, 2],
      ];
      const ch = box.h / 3;
      rows.forEach(([name, col, k], i) => {
        plotPanel({ x: box.x, y: box.y + i * (ch + 6), w: box.w, h: ch }, (u) => pulseOf(S.flow - (1 - u) * 2.6, k) * 0.9, 1, pa, { color: col, y: name });
      });
    }
    headline("EVERY CROSSING IS MEASURED.", "ONE PULSE PER CELL ON EVERY DETECTOR, THOUSANDS OF CELLS A SECOND", bell(t, 0.04, 0.95, 0.06));
  }

  function bioDots(t) {
    backdrop(0.1);
    const ang = lerp(0.55, 1.6, easeIO(t)) + S.time * 0.02;
    const tgt = v(0.85, 0.75, 0.75);
    const dist = lerp(5.2, 4.2, easeIO(t));
    const cam = { pos: v(tgt.x + Math.sin(ang) * dist, tgt.y + 1.4, tgt.z + Math.cos(ang) * dist), target: tgt, fov: 40 * (Math.PI / 180) };
    const shown = [0, 0, 0];
    scene(cam, () => {
      const axis = [
        [v(0, 0, 0), v(2.1, 0, 0)],
        [v(0, 0, 0), v(0, 2.1, 0)],
        [v(0, 0, 0), v(0, 0, 2.1)],
      ];
      axis.forEach(([a, b]) => G.drawTube(R, [a, b], 0.008, { color: [150, 170, 210], glass: false, alpha: 0.7 }));
      const src = v(-0.3, 2.4, -0.3);
      DOTS.forEach((d) => {
        const u = easeIO(clamp((t * 1.35 - d.d * 0.9) / 0.18, 0, 1));
        if (u <= 0) return;
        shown[d.g] += 1;
        const p = mix3(src, d.p, u);
        G.drawSphere(R, p, 0.026, POP[d.g].col, { alpha: Math.min(1, u * 2), glow: 0.5 });
      });
    });
    const la = bell(t, 0.04, 0.84, 0.05);
    tag3(v(2.1, 0, 0), "SIZE", la * 0.8, { dy: 18, dx: 20 });
    tag3(v(0, 2.1, 0), "COMPLEXITY", la * 0.8, { dy: -16, dx: 20 });
    tag3(v(0, 0, 2.1), "MARKER 1", la * 0.8, { dy: 18, dx: -26 });
    const total = shown[0] + shown[1] + shown[2];
    const ga = sm(win(t, 0.55, 0.66)) * bell(t, 0.5, 0.84, 0.04);
    POP.forEach((P, g) => {
      const p = R.project(P.c);
      if (!p.vis || ga <= 0.01) return;
      const c = cx();
      c.save();
      c.strokeStyle = rgba(P.col, 0.7 * ga);
      c.setLineDash([3, 5]);
      c.beginPath();
      c.arc(p.x, p.y, P.s * 2.6 * p.s, 0, TAU);
      c.stroke();
      c.restore();
      const pct = total ? Math.round((shown[g] / total) * 100) : 0;
      tag3(add(P.c, v(P.s * 2, P.s * 2, 0)), `${P.name}  ·  ${pct}%`, ga, { color: P.col });
      near(P.c, P.s * 2.6, "A gate: drawing a boundary around a cluster counts that population.");
    });
    const n = Math.round(25000 * clamp(t / 0.8, 0, 1));
    whisper(`${n.toLocaleString("en-GB")} CELLS`, S.w - Math.max(56, S.w * 0.06), S.h * 0.18, la * 0.8, { align: "right", color: CYAN, weight: 600 });
    headline("THOUSANDS OF CELLS. CLEAR POPULATIONS.", "EVERY CELL IS ONE DOT; CELLS WITH THE SAME MARKERS CLUSTER TOGETHER", bell(t, 0.04, 0.84, 0.06));
    endCard(t, "THAT WAS FLOW CYTOMETRY.", "BACK TO BIOSCIENCES");
  }

  /* =====================================================================
     ADVANCED DIAGNOSTICS · MICROBIOLOGY
     ===================================================================== */

  const DX_NAMES = ["THE BOTTLE", "GROWTH", "POSITIVE", "THE FINGERPRINT", "THE RIGHT ANTIBIOTIC"];
  const BUGS = Array.from({ length: 64 }, () => ({ dir: norm(v(rnd() - 0.5, (rnd() - 0.5) * 0.6, rnd() - 0.5)), ax: norm(v(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5)), ph: rnd() * TAU }));
  const BUBBLES = Array.from({ length: 40 }, () => ({ x: (rnd() - 0.5) * 0.8, z: (rnd() - 0.5) * 0.8, o: rnd(), r: 0.015 + rnd() * 0.025 }));
  const growth = (u) => {
    const L = (x) => 1 / (1 + Math.exp(-(x - 0.55) * 10));
    return (L(clamp(u, 0, 1)) - L(0)) / (L(1) - L(0));
  };

  function bottle(fill, tint, sensor, alpha = 1) {
    const y0 = -1;
    const top = 0.55;
    const liq = lerp(-0.96, 0.2, fill);
    if (fill > 0.01) G.drawCylinder(R, v(0, -0.97, 0), v(0, liq, 0), 0.53, { color: W_mix([60, 120, 140], MAGENTA, tint * 0.45), alpha: 0.32 * alpha, segments: 30, caps: true });
    G.drawCylinder(R, v(0, y0, 0), v(0, top, 0), 0.56, { glass: true, segments: 30, caps: false, alpha });
    for (let i = 0; i < 4; i += 1) {
      const a = top + i * 0.09;
      const r = lerp(0.56, 0.2, sm((i + 0.5) / 4));
      G.drawCylinder(R, v(0, a, 0), v(0, a + 0.09, 0), r, { glass: true, segments: 26, caps: false, alpha });
    }
    G.drawCylinder(R, v(0, top + 0.36, 0), v(0, top + 0.56, 0), 0.2, { glass: true, segments: 22, caps: false, alpha });
    G.drawCylinder(R, v(0, top + 0.56, 0), v(0, top + 0.76, 0), 0.24, { color: [90, 200, 170], segments: 22, alpha });
    G.drawDisc(R, v(0, y0 + 0.02, 0), v(0, 1, 0), 0.4, W_mix([40, 70, 80], MINT, sensor), { alpha: 0.9 * alpha });
  }

  function dxBottle(t) {
    backdrop();
    const cam = track(
      [
        K(0, [2.6, 1.6, 6], [0, 0.1, 0], 36),
        K(1, [1.4, 0.7, 3.1], [0, -0.05, 0], 40),
      ],
      easeIO(t)
    );
    const drop = clamp((t - 0.35) / 0.25, 0, 1);
    scene(cam, () => {
      bottle(lerp(0.75, 0.82, drop), sm(drop), 0.05);
      const needle = sm(win(t, 0.12, 0.3)) * (1 - sm(win(t, 0.7, 0.85)));
      if (needle > 0.01) {
        const y = lerp(3.4, 1.55, needle);
        G.drawCylinder(R, v(0, y, 0), v(0, y + 1.4, 0), 0.025, { color: STEEL, segments: 10, alpha: needle });
        G.drawCylinder(R, v(0, y + 1.4, 0), v(0, y + 2.2, 0), 0.12, { glass: true, segments: 18, alpha: needle });
      }
      if (drop > 0 && drop < 1) G.drawSphere(R, v(0, lerp(1.3, 0.1, drop * drop), 0), 0.06, MAGENTA, { alpha: 0.9, glow: 0.6 });
      G.drawShadow(R, v(0, 0, 0), 1, 1, 0.45);
    });
    tag3(v(0.5, -0.2, 0), "NUTRIENT BROTH", bell(t, 0.08, 0.55, 0.06), { color: [120, 200, 220] });
    tag3(v(0.35, -0.98, 0.2), "SENSOR", bell(t, 0.5, 0.95, 0.06), { color: MINT, dy: 24 });
    near(v(0, -0.98, 0), 0.4, "A sensor at the base of the bottle reacts to the gas that growing microbes release.");
    near(v(0, -0.3, 0), 0.6, "Broth feeds any microbes in the patient's blood so they grow to detectable numbers.");
    headline("A PATIENT'S SAMPLE GOES INTO A CULTURE BOTTLE.", "ADVANCED DIAGNOSTICS  ·  MICROBIOLOGY", bell(t, 0.04, 0.95, 0.06));
  }

  // Binary fission: bacterium i's parent is (i - 1) >> 1; each generation doubles the count.
  function bugTree(t) {
    const gens = lerp(0, 6.2, t);
    const out = [];
    const pos = [];
    for (let i = 0; i < 63; i += 1) {
      const gen = Math.floor(Math.log2(i + 1));
      const born = gen - gens;
      if (born > 0) break;
      const split = clamp(gens - gen, 0, 1);
      const B = BUGS[i];
      if (i === 0) pos[i] = v(0, 0, 0);
      else {
        const parent = (i - 1) >> 1;
        const off = mul(B.dir, 0.16 * easeIO(split) * (1 + (6 - gen) * 0.12));
        pos[i] = add(pos[parent], off);
      }
      out.push({ i, p: pos[i], gen, split, B });
    }
    const live = out.filter((b) => !out.some((c) => c.i !== b.i && (c.i - 1) >> 1 === b.i && c.split >= 1));
    return { all: out, live };
  }

  function dxGrowth(t) {
    backdrop();
    const tree = bugTree(easeIO(t));
    const spread = 0.4 + tree.live.length * 0.02;
    const cam = { pos: v(Math.sin(t * 1.2 + 0.4) * (1.1 + spread), 0.5, Math.cos(t * 1.2 + 0.4) * (1.1 + spread)), target: v(0.1, -0.16, 0), fov: 46 * (Math.PI / 180) };
    scene(cam, () => {
      tree.live.forEach((b) => {
        const p = add(b.p, v(Math.sin(S.clock * 0.6 + b.B.ph) * 0.01, Math.cos(S.clock * 0.5 + b.B.ph) * 0.01, 0));
        const ax = mul(b.B.ax, 0.055);
        G.drawCylinder(R, sub(p, ax), add(p, ax), 0.028, { color: MINT, segments: 12, caps: false, emissive: [MINT, 0.25] });
        G.drawSphere(R, sub(p, ax), 0.028, MINT, { alpha: 1 });
        G.drawSphere(R, add(p, ax), 0.028, MINT, { alpha: 1 });
      });
      for (let i = 0; i < 26; i += 1) {
        const q = v(Math.sin(i * 7.1) * 1.6, ((i * 0.37 + S.clock * 0.02) % 1) * 2.4 - 1.2, Math.cos(i * 3.3) * 1.6);
        G.drawSphere(R, q, 0.012, [120, 200, 220], { alpha: 0.4 });
      }
    });
    const hours = Math.round(lerp(0, 18, t));
    whisper(`INCUBATING  ·  ${String(hours).padStart(2, "0")} H`, S.w - Math.max(56, S.w * 0.06), S.h * 0.18, bell(t, 0.04, 0.95, 0.05) * 0.8, { align: "right", color: MINT, weight: 600 });
    whisper(`${tree.live.length} BACTERIA IN VIEW`, S.w - Math.max(56, S.w * 0.06), S.h * 0.18 + 20, bell(t, 0.04, 0.95, 0.05) * 0.55, { align: "right" });
    const first = tree.live[0];
    if (first) near(first.p, 0.3, "Bacteria divide in two. Every division doubles them, so a few become millions within hours.");
    headline("IF MICROBES ARE THERE, THEY MULTIPLY.", "EACH ONE DIVIDES IN TWO, AGAIN AND AGAIN", bell(t, 0.04, 0.95, 0.06));
  }

  function dxPositive(t) {
    const pos = 0.6;
    const g = growth(t);
    const flag = sm(win(t, pos, pos + 0.05));
    backdrop(flag * 0.2);
    const cam = track(
      [
        K(0, [1.5, 0.4, 3], [0, -0.3, 0], 40),
        K(1, [1.9, 0.9, 3.6], [0, -0.1, 0], 40),
      ],
      easeIO(t)
    );
    scene(cam, () => {
      bottle(0.82, 1, g, 1);
      BUBBLES.forEach((b, i) => {
        if (i / BUBBLES.length > g) return;
        const y = -0.9 + ((b.o + S.clock * 0.12) % 1) * 1.05;
        G.drawSphere(R, v(b.x, y, b.z), b.r, [200, 240, 255], { alpha: 0.7, glass: true });
      });
    });
    const s = R.project(v(0, -0.98, 0));
    glow(s.x, s.y, 50 + g * 60, MINT, 0.15 + g * 0.55);
    const box = panelBox(0.27, 0.32);
    const L = plotPanel(box, (u) => growth(u) * 0.95, t, sm(win(t, 0.08, 0.2)), { color: MINT, thr: growth(pos) * 0.95, y: "SENSOR SIGNAL", x: "HOURS →" });
    if (L && flag > 0.01) {
      const X = L.px + pos * L.pw;
      const Y = L.py - growth(pos) * 0.95 * L.ph;
      glow(X, Y, 30, VIOLET, flag * 0.8);
      whisper("POSITIVE", X + 12, Y + 18, flag, { weight: 700, color: WHITE });
    }
    flash(bell(t, pos, pos + 0.08, 0.03) * 0.4, [200, 255, 235]);
    near(v(0, -0.98, 0), 0.4, "Growing microbes release CO₂. The sensor changes, and the instrument reads it around the clock.");
    headline("THE BOTTLE FLAGS POSITIVE.", "THE SIGNAL CROSSES A THRESHOLD, SO THE LAB KNOWS TO LOOK CLOSER", bell(t, 0.04, 0.95, 0.06));
  }

  const PRINT = [0.35, 0.9, 0.22, 0.6, 0.15, 0.75, 0.45, 0.28, 0.82, 0.2, 0.5, 0.3];
  const LIBRARY = [
    [0.8, 0.2, 0.7, 0.15, 0.6, 0.2, 0.3, 0.75, 0.25, 0.5, 0.2, 0.6],
    [0.2, 0.5, 0.85, 0.3, 0.45, 0.2, 0.8, 0.3, 0.4, 0.75, 0.25, 0.2],
    PRINT,
  ];

  function dxFingerprint(t) {
    backdrop(0.25);
    const cam = track(
      [
        K(0, [0.6, 1.2, 3.6], [0, 0.4, 0], 40),
        K(0.45, [1.2, 1.6, 4.4], [0.3, 0.9, -0.6], 42),
        K(1, [0.8, 2.1, 4.9], [0.2, 1.0, -1.2], 42),
      ],
      easeIO(t)
    );
    const fire = sm(win(t, 0.08, 0.14));
    const rise = clamp((t - 0.1) / 0.32, 0, 1);
    const built = sm(win(t, 0.3, 0.5));
    const cmp = clamp((t - 0.52) / 0.38, 0, 1);
    const which = Math.min(2, Math.floor(cmp * 3));
    const slide = (cmp * 3) % 1;
    const match = which === 2 && slide > 0.5 ? sm((slide - 0.5) / 0.2) : cmp >= 1 ? 1 : 0;
    scene(cam, () => {
      G.drawBox(R, null, v(0, -0.06, 0), v(0.9, 0.05, 0.5), { color: [150, 162, 190], radius: 6 });
      G.drawDisc(R, v(0, 0.0, 0), v(0, 1, 0), 0.12, MINT, { alpha: 0.9 });
      for (let i = 0; i < 40; i += 1) {
        const u = clamp(rise * 1.4 - (i % 10) * 0.04, 0, 1);
        if (u <= 0 || u >= 1) continue;
        G.drawSphere(R, v(Math.sin(i * 2.3) * 0.12 * u, u * 2.2, Math.cos(i * 1.7) * 0.12 * u), 0.02, [VIOLET, CYAN, MINT][i % 3], { alpha: 1 - u * 0.6, glow: 0.8 });
      }
      PRINT.forEach((h, i) => {
        const x = -1.1 + i * 0.2;
        const hh = 0.02 + h * 0.9 * built;
        G.drawBox(R, null, v(x, 0.8 + hh / 2, -1.2), v(0.06, hh / 2, 0.06), { color: match ? W_mix(MINT, WHITE, match * 0.3) : MINT, radius: 2, alpha: 0.95 });
        if (cmp > 0) {
          const ref = LIBRARY[which][i];
          const off = lerp(3.2, 0, easeIO(clamp(slide * 2, 0, 1)));
          const rh = 0.02 + ref * 0.9;
          G.drawBox(R, null, v(x + off, 0.8 + rh / 2, -1.5), v(0.06, rh / 2, 0.06), { glass: true, radius: 2, alpha: 0.9 });
        }
      });
    });
    const p = R.project(v(-1.6, 0.1, 0.4));
    const q = R.project(v(0, 0, 0));
    if (fire > 0 && rise < 0.6) {
      const c = cx();
      c.save();
      c.globalCompositeOperation = "lighter";
      c.strokeStyle = rgba(VIOLET, 0.8 * (1 - rise));
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(p.x, p.y);
      c.lineTo(q.x, q.y);
      c.stroke();
      c.restore();
      glow(q.x, q.y, 50, VIOLET, 0.6 * (1 - rise));
    }
    tag3(v(0.35, 0, 0.3), "SAMPLE SPOT", bell(t, 0.04, 0.4, 0.05), { color: MINT, dy: 28 });
    tag3(v(1.25, 1.3, -1.2), "ITS FINGERPRINT", bell(t, 0.32, 0.95, 0.05), { color: MINT });
    if (cmp > 0 && cmp < 1) tag3(v(1.3, 1.5, -1.5), `REFERENCE ${which + 1} OF THE LIBRARY`, 0.85, { dy: -24 });
    if (match > 0.01) {
      const m = R.project(v(0, 1.9, -1.3));
      glow(m.x, m.y, 120, MINT, match * 0.35);
      type("MATCH FOUND", m.x, m.y - 10, { size: clamp(S.w * 0.026, 18, 30), weight: 800, alpha: match * bell(t, 0.6, 0.97, 0.04), track: 0.08 });
    }
    near(v(0, 1.2, -1.2), 0.8, "A pattern of protein peaks, like a barcode. Different organisms give different patterns.");
    headline("EVERY ORGANISM HAS A MOLECULAR FINGERPRINT.", "ITS PATTERN OF PEAKS IS COMPARED WITH A REFERENCE LIBRARY", bell(t, 0.04, 0.95, 0.06));
  }

  const WELLS = 8;
  const MIC = 4;

  function dxTreat(t) {
    backdrop();
    const cam = track(
      [
        K(0, [0.4, 1.9, 4.6], [0.1, -0.1, 0], 38),
        K(1, [1.3, 1.4, 3.6], [0.4, -0.2, 0], 40),
      ],
      easeIO(t)
    );
    const fill = sm(win(t, 0.04, 0.3));
    const grow = sm(win(t, 0.3, 0.58));
    const mark = sm(win(t, 0.58, 0.68));
    scene(cam, () => {
      G.drawBox(R, null, v(0.05, -0.36, 0), v(1.95, 0.05, 0.4), { color: [120, 132, 162], radius: 6 });
      for (let i = 0; i < WELLS; i += 1) {
        const x = -1.68 + i * 0.48;
        const conc = i / (WELLS - 1);
        const k = clamp(fill * WELLS - i, 0, 1);
        if (k > 0) G.drawCylinder(R, v(x, -0.3, 0), v(x, lerp(-0.3, 0.08, k), 0), 0.17, { color: W_mix([80, 140, 170], VIOLET, conc * 0.6), alpha: 0.4, segments: 20 });
        G.drawCylinder(R, v(x, -0.31, 0), v(x, 0.2, 0), 0.19, { glass: true, segments: 22, caps: false });
        if (i < MIC && grow > 0) {
          const n = Math.round(14 * grow * (1 - i / MIC) + 3 * grow);
          for (let j = 0; j < n; j += 1) {
            const q = v(x + Math.sin(j * 2.7 + i) * 0.11, -0.22 + ((j * 0.37) % 1) * 0.26, Math.cos(j * 1.9 + i) * 0.11);
            G.drawSphere(R, q, 0.018, MINT, { alpha: 0.95, glow: 0.3 });
          }
        }
      }
      if (mark > 0.01) {
        const x = -1.68 + MIC * 0.48;
        G.drawDisc(R, v(x, 0.22, 0), v(0, 1, 0), 0.26, MINT, { alpha: mark, ring: true });
      }
    });
    const la = bell(t, 0.04, 0.84, 0.05);
    tag3(v(-1.68, 0.22, 0), "LOW DOSE", la * 0.85, { dx: -30, dy: -28 });
    tag3(v(-1.68 + 7 * 0.48, 0.22, 0), "HIGH DOSE", la * 0.85, { dy: -28 });
    if (mark > 0.01) tag3(v(-1.68 + MIC * 0.48, 0.26, 0), "MIC  ·  LOWEST DOSE THAT STOPS GROWTH", mark * la, { color: MINT, dy: -64, dx: 16 });
    const verdict = sm(win(t, 0.68, 0.76)) * la;
    if (verdict > 0.01) whisper("BELOW THE CLINICAL BREAKPOINT  ·  SUSCEPTIBLE", S.w / 2, S.h * 0.2, verdict, { align: "center", color: MINT, weight: 700, track: 0.2 });
    near(v(-1.68 + MIC * 0.48, 0, 0), 0.3, "The minimum inhibitory concentration. Compared with a clinical breakpoint, it says whether this antibiotic will work.");
    headline("FIND THE DOSE THAT STOPS IT.", "THE SAME ORGANISM, GROWN WITH MORE AND MORE ANTIBIOTIC", bell(t, 0.04, 0.84, 0.06));
    endCard(t, "FROM A SAMPLE TO A TREATMENT.", "BACK TO DIAGNOSTICS");
  }

  /* =====================================================================
     MATERIALS SCIENCES · THERMAL ANALYSIS AND RHEOLOGY
     ===================================================================== */

  const MAT_NAMES = ["THE SAMPLE", "HEAT", "MELT", "FLOW", "WEIGH"];
  const LAT = [];
  for (let x = 0; x < 5; x += 1) for (let y = 0; y < 3; y += 1) for (let z = 0; z < 5; z += 1) LAT.push({ p: v((x - 2) * 0.11, 0.06 + y * 0.11, (z - 2) * 0.11), ph: rnd() * TAU, odd: (x + y + z) % 2, puddle: v((rnd() - 0.5) * 0.56, 0.03 + rnd() * 0.06, (rnd() - 0.5) * 0.56) });
  const BONDS = [];
  LAT.forEach((a, i) =>
    LAT.forEach((b, j) => {
      if (j > i && Math.abs(G.len(sub(a.p, b.p)) - 0.11) < 0.001) BONDS.push([i, j]);
    })
  );
  const dsc = (u) => 0.08 + 0.06 * u + 0.12 * sm((u - 0.3) / 0.06) + 0.62 * Math.exp(-((u - 0.68) ** 2) / (2 * 0.035 * 0.035));

  function pan(at, r = 0.36, alpha = 1) {
    G.drawCylinder(R, add(at, v(0, -0.02, 0)), add(at, v(0, 0.0, 0)), r, { color: [190, 198, 214], segments: 28, alpha });
    G.drawCylinder(R, at, add(at, v(0, 0.08, 0)), r, { color: [175, 185, 205], segments: 28, caps: false, alpha: 0.55 * alpha });
  }

  function lattice(at, heat, melt) {
    const pts = LAT.map((a) => {
      const amp = 0.003 + heat * 0.02;
      const j = v(Math.sin(S.clock * 9 + a.ph) * amp, Math.cos(S.clock * 8 + a.ph * 1.3) * amp, Math.sin(S.clock * 7 + a.ph * 2) * amp);
      const k = clamp(melt * 1.4 - (a.ph / TAU) * 0.4, 0, 1);
      const pud = add(a.puddle, v(Math.sin(S.clock * 0.6 + a.ph) * 0.03 * k, 0, Math.cos(S.clock * 0.5 + a.ph) * 0.03 * k));
      return add(at, add(mix3(a.p, pud, easeIO(k)), j));
    });
    const bondA = 1 - sm(melt * 1.3);
    if (bondA > 0.01) {
      BONDS.forEach(([i, j]) => {
        const p = R.project(pts[i]);
        const q = R.project(pts[j]);
        R.push((p.z + q.z) / 2 + 0.001, (c) => {
          c.strokeStyle = rgba(BLUE, 0.45 * bondA);
          c.lineWidth = 1.2;
          c.beginPath();
          c.moveTo(p.x, p.y);
          c.lineTo(q.x, q.y);
          c.stroke();
        });
      });
    }
    LAT.forEach((a, i) => G.drawSphere(R, pts[i], 0.034, W_mix(a.odd ? VIOLET : BLUE, ICE, heat * 0.25), { alpha: 1, glow: heat * 0.3 }));
  }

  function furnace(heat, alpha = 1) {
    G.drawCylinder(R, v(0, -0.25, 0), v(0, 1.25, 0), 1.25, { glass: true, segments: 36, caps: false, alpha: 0.8 * alpha });
    const ring = [];
    for (let i = 0; i <= 40; i += 1) ring.push(v(Math.cos((i / 40) * TAU) * 1.08, -0.18, Math.sin((i / 40) * TAU) * 1.08));
    G.drawTube(R, ring, 0.035, { color: W_mix([90, 70, 140], VIOLET, heat), glass: false, alpha, fluid: { color: VIOLET, alpha: heat * 0.8 } });
    G.drawBox(R, null, v(0, -0.32, 0), v(1.35, 0.06, 1.35), { color: [80, 92, 124], radius: 8, alpha });
  }

  function matSample(t) {
    backdrop();
    const cam = track(
      [
        K(0, [2.4, 2.2, 5.6], [0, 0.3, 0], 36),
        K(1, [1.1, 0.9, 2.3], [-0.2, 0.05, 0], 40),
      ],
      easeIO(t)
    );
    scene(cam, () => {
      furnace(0.05);
      pan(v(-0.45, -0.18, 0));
      pan(v(0.55, -0.18, 0));
      lattice(v(-0.45, -0.18, 0), 0, 0);
    });
    const la = bell(t, 0.08, 0.95, 0.06);
    tag3(v(-0.45, 0.25, 0), "SAMPLE  ·  A FEW MILLIGRAMS", la, { dx: -40, color: BLUE });
    tag3(v(0.55, -0.1, 0), "EMPTY REFERENCE PAN", la, { color: ICE });
    near(v(-0.45, 0, 0), 0.35, "A tiny crystalline sample. Its atoms sit in an ordered, repeating lattice.");
    near(v(0.55, -0.15, 0), 0.35, "Both pans get the same heat. Comparing them isolates what the sample itself absorbs.");
    headline("A FEW MILLIGRAMS, AND AN EMPTY PAN.", "MATERIALS SCIENCES  ·  THERMAL ANALYSIS", bell(t, 0.04, 0.95, 0.06));
  }

  function matHeat(t, melt) {
    const heat = melt ? 1 : t;
    backdrop(heat * 0.12);
    const ang = melt ? lerp(0.2, -0.25, t) : lerp(0.75, 0.2, t);
    const at = v(-0.45, -0.18, 0);
    const d = melt ? 1.15 : lerp(1.8, 1.2, easeIO(t));
    const cam = { pos: v(at.x + Math.sin(ang) * d, at.y + 0.55 * d, at.z + Math.cos(ang) * d), target: add(at, v(0, 0.1, 0)), fov: 42 * (Math.PI / 180) };
    const mk = melt ? sm(win(t, 0.25, 0.7)) : 0;
    scene(cam, () => {
      furnace(0.3 + heat * 0.7, 0.6);
      pan(at);
      lattice(at, heat, mk);
    });
    const u = melt ? lerp(0.5, 1, t) : t * 0.5;
    const box = panelBox(0.27, 0.32);
    const L = plotPanel(box, (x) => dsc(x), u, sm(win(t, 0.06, 0.18)) * (1 - (melt ? 0 : 0)), { color: VIOLET, y: "HEAT FLOW", x: "TEMPERATURE →" });
    if (L) {
      const mark = (at2, text, a) => {
        if (a <= 0.01) return;
        const X = L.px + at2 * L.pw;
        whisper(text, X, L.py - dsc(at2 + 0.02) * L.ph - 14, a, { align: "center", color: WHITE, weight: 600 });
      };
      mark(0.3, "SOFTENS", sm((u - 0.36) / 0.06));
      mark(0.68, "MELTS", sm((u - 0.72) / 0.05));
    }
    const temp = Math.round(lerp(25, 240, u));
    whisper(`${temp} °C`, S.w - Math.max(56, S.w * 0.06), box.y + box.h + 22, 0.75, { align: "right", color: VIOLET, weight: 700 });
    if (melt) flash(bell(t, 0.42, 0.56, 0.04) * 0.25, [230, 210, 255]);
    near(add(at, v(0, 0.15, 0)), 0.3, melt ? "Melting breaks the lattice apart. That takes extra heat, which the instrument records as a peak." : "Heat makes the atoms vibrate harder. Every change in the material changes how much heat it takes in.");
    if (melt) headline("AT THE MELTING POINT, ORDER GIVES WAY.", "MELTING ABSORBS HEAT, SO IT SHOWS UP AS A PEAK", bell(t, 0.04, 0.95, 0.06));
    else headline("AS IT WARMS, ITS ATOMS VIBRATE HARDER.", "THE INSTRUMENT MEASURES THE HEAT FLOWING INTO THE SAMPLE", bell(t, 0.04, 0.95, 0.06));
  }

  const RHEO_COLS = Array.from({ length: 18 }, (_, i) => ({ a: (i / 18) * TAU, r: 0.25 + (i % 3) * 0.2 }));

  function matFlow(t) {
    backdrop(0.08);
    const phi = lerp(0, Math.PI / 2, sm(win(t, 0.15, 0.8)));
    const cam = track(
      [
        K(0, [1.9, 1.2, 3.4], [0, 0.35, 0], 40),
        K(1, [1.4, 0.9, 2.6], [0, 0.3, 0], 40),
      ],
      easeIO(t)
    );
    const w = S.clock * 2.2;
    const strain = (k) => 0.35 * k * Math.sin(w - phi * k);
    scene(cam, () => {
      G.drawCylinder(R, v(0, -0.06, 0), v(0, 0, 0), 0.95, { color: [150, 162, 190], segments: 36 });
      const top = strain(1);
      G.drawCylinder(R, v(0, 0.62, 0), v(0, 0.68, 0), 0.92, { color: [175, 185, 210], segments: 36 });
      G.drawCylinder(R, v(0, 0.68, 0), v(0, 1.9, 0), 0.08, { color: STEEL, segments: 14 });
      const mark = v(Math.cos(top) * 0.92, 0.66, Math.sin(top) * 0.92);
      G.drawSphere(R, mark, 0.04, CYAN, { glow: 0.8 });
      RHEO_COLS.forEach((col) => {
        for (let k = 0; k < 6; k += 1) {
          const h = (k + 0.5) / 6;
          const a = col.a + strain(h);
          const p = v(Math.cos(a) * col.r, 0.02 + h * 0.58, Math.sin(a) * col.r);
          G.drawSphere(R, p, 0.04, W_mix(BLUE, CYAN, h), { alpha: 0.95 });
        }
      });
    });
    const box = panelBox(0.27, 0.32);
    const pa = sm(win(t, 0.06, 0.18));
    const L = plotPanel(box, (u) => 0.5 + 0.38 * Math.sin(u * TAU * 1.5 + S.clock * 2.2), 1, pa, { color: ICE, y: "TWIST   ·   RESISTANCE", x: "TIME →" });
    if (L && pa > 0.01) {
      const c = cx();
      c.save();
      c.globalCompositeOperation = "lighter";
      c.strokeStyle = rgba(CYAN, 0.95 * pa);
      c.lineWidth = 2;
      c.beginPath();
      for (let i = 0; i <= 160; i += 1) {
        const u = i / 160;
        const y = L.py - (0.5 + 0.38 * Math.sin(u * TAU * 1.5 + S.clock * 2.2 - phi)) * L.ph;
        if (i) c.lineTo(L.px + u * L.pw, y);
        else c.moveTo(L.px + u * L.pw, y);
      }
      c.stroke();
      c.restore();
      const label = phi < 0.35 ? "SOLID-LIKE  ·  IN STEP" : phi > 1.25 ? "LIQUID-LIKE  ·  A QUARTER CYCLE BEHIND" : "IN BETWEEN  ·  PARTLY BEHIND";
      whisper(label, box.x + box.w, box.y + box.h + 22, pa * 0.85, { align: "right", color: CYAN, weight: 600 });
    }
    near(v(0, 0.35, 0), 0.9, "A rheometer twists the material between two plates and measures how hard it pushes back.");
    headline("TWIST IT, AND MEASURE HOW IT RESISTS.", "SOLIDS PUSH BACK IN STEP; LIQUIDS LAG A QUARTER CYCLE BEHIND", bell(t, 0.04, 0.95, 0.06));
  }

  const TGA = Array.from({ length: 60 }, (_, i) => ({ p: v((rnd() - 0.5) * 0.46, 0.04 + rnd() * 0.14, (rnd() - 0.5) * 0.46), kind: i < 14 ? 0 : i < 34 ? 1 : 2, ph: rnd() }));
  const tgaMass = (u) => 1 - 0.12 * sm((u - 0.22) / 0.1) - 0.3 * sm((u - 0.58) / 0.12);

  function matWeigh(t) {
    backdrop(0.1);
    const u = clamp(t / 0.82, 0, 1);
    const cam = track(
      [
        K(0, [1.6, 1.3, 3.4], [0, 0.5, 0], 40),
        K(1, [1.2, 1.0, 2.6], [0, 0.4, 0], 40),
      ],
      easeIO(t)
    );
    const drop = (1 - tgaMass(u)) * 0.12;
    scene(cam, () => {
      furnace(0.3 + u * 0.7, 0.6);
      G.drawTube(R, [v(-1.7, 1.75, 0), v(0, 1.75 - drop * 0.3, 0)], 0.03, { color: STEEL, glass: false });
      G.drawTube(R, [v(0, 1.75 - drop * 0.3, 0), v(0, 0.2 - drop, 0)], 0.008, { color: STEEL, glass: false });
      G.drawBox(R, null, v(-1.8, 1.75, 0), v(0.16, 0.16, 0.16), { color: [80, 92, 124], radius: 6 });
      pan(v(0, 0.12 - drop, 0), 0.3);
      TGA.forEach((g) => {
        const leave = g.kind === 0 ? sm((u - 0.2 - g.ph * 0.1) / 0.12) : g.kind === 1 ? sm((u - 0.55 - g.ph * 0.12) / 0.14) : 0;
        if (leave >= 1) return;
        const p = add(v(0, 0.12 - drop, 0), add(g.p, v(0, leave * 1.1, 0)));
        const col = g.kind === 0 ? CYAN : g.kind === 1 ? VIOLET : [170, 180, 200];
        G.drawSphere(R, p, 0.032, col, { alpha: 1 - leave, glow: leave * 0.8 });
      });
    });
    const box = panelBox(0.27, 0.32);
    const L = plotPanel(box, (x) => tgaMass(x) * 0.85, u, sm(win(t, 0.05, 0.16)), { color: ICE, y: "MASS", x: "TEMPERATURE →" });
    if (L) {
      const lab = (at2, text, k) => {
        const a = sm((u - at2 - 0.08) / 0.06) * bell(t, 0.1, 0.84, 0.04);
        if (a <= 0.01) return;
        whisper(text, L.px + (at2 + 0.06) * L.pw, L.py - tgaMass(at2 + 0.2) * 0.85 * L.ph - 14, a, { color: k, weight: 600 });
      };
      lab(0.22, "MOISTURE", CYAN);
      lab(0.58, "DECOMPOSES", VIOLET);
    }
    whisper(`MASS  ${Math.round(tgaMass(u) * 100)}%`, S.w - Math.max(56, S.w * 0.06), box.y + box.h + 22, bell(t, 0.04, 0.84, 0.05) * 0.85, { align: "right", color: WHITE, weight: 700 });
    tag3(v(-1.8, 1.95, 0), "MICROBALANCE", bell(t, 0.06, 0.84, 0.05), { dx: -30 });
    near(v(0, 0.2, 0), 0.4, "Thermogravimetric analysis: the sample is weighed continuously as it heats.");
    headline("WEIGH IT AS IT HEATS.", "EACH STEP DOWN IS SOMETHING LEAVING: FIRST MOISTURE, THEN COMPONENTS", bell(t, 0.04, 0.84, 0.06));
    endCard(t, "HEAT IT. TWIST IT. WEIGH IT.", "BACK TO MATERIALS");
  }

  /* ---------- registration ---------- */

  const film = (scenes) => scenes.map((fn, i) => (t, dt) => {
    fn(t, dt);
    edge(i, scenes.length, t);
  });

  RIDE.registerTrack("ride-bio", { kind: "bio", title: "BIOSCIENCES", names: BIO_NAMES, draw: film([bioSample, bioTag, bioFile, bioLaser, bioDots]) });
  RIDE.registerTrack("ride-dx", { kind: "dx", title: "ADVANCED DIAGNOSTICS", names: DX_NAMES, draw: film([dxBottle, dxGrowth, dxPositive, dxFingerprint, dxTreat]) });
  RIDE.registerTrack("ride-mat", {
    kind: "mat",
    title: "MATERIALS SCIENCES",
    names: MAT_NAMES,
    draw: film([matSample, (t) => matHeat(t, false), (t) => matHeat(t, true), matFlow, matWeigh]),
  });

  void hot;
})(window);
