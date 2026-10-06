/* Waters LC-MS — "How it works": the third-person track of the ride.
   The camera stays outside the machine. Each chapter puts one real part on stage,
   opens it up in an x-ray schematic, and lets scroll scrub the mechanism itself:
   pistons stroke, the rotor turns, bands pull apart, light dips, ions are filtered.
   The last chapter hands the visitor the choice to become the sample. */
(function (global) {
  "use strict";

  const RIDE = global.WatersRide;
  if (!RIDE || !RIDE.kit) return;
  const kit = RIDE.kit;
  const { S, R, G, W, win, sm, bell, type, ghost, hot, linkRow, bgBlack, bgVoid, stars, flash } = kit;
  const { TAU, DEG, v, lerp, clamp, rgba, CYAN, MINT, VIOLET } = G;
  const MAGENTA = [255, 96, 196];
  const WHITE = [255, 255, 255];
  const ICE = [200, 225, 255];
  const STEELC = [150, 170, 200];
  const AMBER = [255, 196, 120];
  const MOLS = W.MOLS;

  const LC_NAMES = ["THE LC SYSTEM", "THE SOLVENTS", "THE PUMP", "THE INJECTOR", "THE COLUMN", "THE UV DETECTOR", "READING THE PEAKS", "YOUR TURN"];
  const MS_NAMES = ["HOW MS WORKS", "THE ION SOURCE", "THE QUADRUPOLE", "COUNTING IONS", "YOUR TURN"];

  const cx = () => kit.ctx;

  /* Small mono text, readable on any screen: at least ~12.5px after schematic scaling,
     with tighter tracking than the film's whisper so words stay legible. */
  function whisper(text, x, y, a, o = {}) {
    const c = cx();
    const sc = (c.getTransform().a / (S.dpr || 1)) || 1;
    const want = (o.size || 10.5) * 1.22;
    const size = Math.max(want, 12.5 / sc);
    const track = o.track == null ? 0.16 : Math.min(o.track, 0.2);
    return kit.whisper(text, x, y, a, { ...o, size, track });
  }
  const frac = (x) => x - Math.floor(x);
  const hash = (i) => frac(Math.sin(i * 127.1 + 311.7) * 43758.5453);

  /* ---------- layout ---------- */

  function layout() {
    const wide = S.w >= 860;
    const fs = clamp(Math.min(S.w * 0.0125, S.h * 0.025), 15, 18);
    const size = clamp(Math.min(S.w * 0.03, S.h * 0.052), 22, 40);
    const textTop = Math.max(S.h * 0.5, Math.min(S.h * 0.66, S.h - 30 - (44 + 3 * fs * 1.45))) - size * 0.62 - 30;
    const above = Math.min(S.h * 0.6, textTop);
    if (wide) {
      return {
        wide,
        hero: { x0: S.w * 0.03, y0: S.h * 0.08, x1: S.w * 0.47, y1: above },
        sch: { x0: S.w * 0.5, y0: S.h * 0.1, x1: S.w * 0.95, y1: S.h * 0.9 },
        full: { x0: S.w * 0.05, y0: S.h * 0.1, x1: S.w * 0.95, y1: above },
        text: { x: S.w * 0.06, y: S.h * 0.66, w: Math.min(S.w * 0.38, 470) },
      };
    }
    return {
      wide,
      hero: { x0: 0, y0: S.h * 0.05, x1: S.w, y1: S.h * 0.3 },
      sch: { x0: S.w * 0.04, y0: S.h * 0.3, x1: S.w * 0.96, y1: S.h * 0.6 },
      full: { x0: S.w * 0.03, y0: S.h * 0.1, x1: S.w * 0.97, y1: S.h * 0.58 },
      text: { x: S.w * 0.06, y: S.h * 0.66, w: S.w * 0.88 },
    };
  }

  /* Fit a design-space drawing (dw × dh units) into a screen box. */
  function enter(box, dw, dh) {
    const bw = box.x1 - box.x0;
    const bh = box.y1 - box.y0;
    const k = Math.min(bw / dw, bh / dh);
    const ox = box.x0 + (bw - dw * k) / 2;
    const oy = box.y0 + (bh - dh * k) / 2;
    const c = cx();
    c.save();
    c.translate(ox, oy);
    c.scale(k, k);
    return { k, ox, oy, sx: (x) => ox + x * k, sy: (y) => oy + y * k };
  }
  const leave = () => cx().restore();

  /* ---------- step-by-step teaching text ---------- */

  function stepWeights(t, steps) {
    return steps.map(([at], i) => {
      const on = sm(win(t, at, at + 0.05));
      const next = steps[i + 1] ? sm(win(t, steps[i + 1][0], steps[i + 1][0] + 0.05)) : 0;
      return { on, cur: Math.max(0, on - next) };
    });
  }
  /* Emphasis for parts of a schematic tied to step i: bright while current, settled after, faint before. */
  const emph = (sw, i) => 0.28 + sw[i].on * 0.32 + sw[i].cur * 0.4;

  function wrap(text, maxW, size, weight = 400) {
    const c = cx();
    c.save();
    c.font = `${weight} ${size}px Inter, system-ui, sans-serif`;
    const words = text.split(" ");
    const lines = [];
    let line = "";
    words.forEach((wd) => {
      const test = line ? `${line} ${wd}` : wd;
      if (c.measureText(test).width > maxW && line) {
        lines.push(line);
        line = wd;
      } else {
        line = test;
      }
    });
    if (line) lines.push(line);
    c.restore();
    return lines;
  }

  /* Title, a 01·02·03 progress row, and only the current step's text — anchored to the
     bottom so it never runs off a short screen. */
  function lessonBox(L, o) {
    const size = clamp(Math.min(S.w * 0.03, S.h * 0.052), 22, 40);
    const fs = clamp(Math.min(S.w * 0.0125, S.h * 0.025), 15, 18);
    const lh = fs * 1.45;
    const wrapped = o.steps.map(([, text]) => wrap(text, L.text.w - 4, fs));
    const tallest = Math.max(...wrapped.map((l) => l.length));
    const below = 18 + 26 + tallest * lh;
    const y = Math.max(Math.min(o.y || L.text.y, S.h - 30 - below), S.h * 0.5);
    return { size, fs, lh, wrapped, below, y, top: y - size * 0.62 - 26 };
  }

  function lesson(t, L, o) {
    const c = cx();
    const { x, w } = L.text;
    const { size, fs, lh, wrapped, below } = lessonBox(L, o);
    let { y } = lessonBox(L, o);
    const a0 = sm(win(t, 0, 0.06));
    const ry = (below + size + 60) * 0.9;
    const rx = w * 0.95;
    c.save();
    c.translate(x + w * 0.42, y + below * 0.35);
    c.scale(1, ry / rx);
    const shade = c.createRadialGradient(0, 0, 0, 0, 0, rx);
    shade.addColorStop(0, "rgba(2,4,14,0.7)");
    shade.addColorStop(0.6, "rgba(2,4,14,0.4)");
    shade.addColorStop(1, "rgba(2,4,14,0)");
    c.fillStyle = shade;
    c.beginPath();
    c.arc(0, 0, rx, 0, TAU);
    c.fill();
    c.restore();
    const accent = o.color || [140, 210, 255];
    whisper(o.kicker, x, y - size * 0.62 - 14, a0 * 0.75, { weight: 600, color: accent });
    type(o.title, x, y, { size, weight: 800, align: "left", alpha: a0, track: -0.01 });
    y += size * 0.5 + 18;
    const sw = stepWeights(t, o.steps);
    let k = 0;
    o.steps.forEach(([at], i) => {
      if (t >= at) k = i;
    });
    let px = x;
    o.steps.forEach((_, i) => {
      const done = i < k;
      const on = i === k;
      const al = a0 * (on ? 1 : done ? 0.55 : 0.22);
      const tw = whisper(`0${i + 1}`, px, y, al, { size: 10, weight: 600, color: on ? WHITE : accent });
      if (on) {
        c.fillStyle = rgba(accent, a0 * 0.9);
        c.fillRect(px, y + 9, tw, 1.5);
      }
      px += tw + 12;
      if (i < o.steps.length - 1) {
        c.fillStyle = rgba(accent, a0 * (done ? 0.5 : 0.18));
        c.fillRect(px, y, 22, 1);
        px += 34;
      }
    });
    y += 26;
    o.steps.forEach(([at], i) => {
      const next = o.steps[i + 1] ? o.steps[i + 1][0] : 2;
      const aIn = at <= 0 ? a0 : sm(win(t, at, at + 0.04));
      const aOut = 1 - sm(win(t, next - 0.035, next));
      const al = aIn * aOut;
      if (al <= 0.01) return;
      wrapped[i].forEach((ln, j) => type(ln, x, y + j * lh + (1 - aIn) * 8, { size: fs, weight: 400, align: "left", alpha: al * 0.95, track: 0 }));
    });
    return sw;
  }

  /* ---------- schematic primitives ---------- */

  function path(pts) {
    const c = cx();
    c.beginPath();
    pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])));
  }

  function pipe(pts, col, a, o = {}) {
    const c = cx();
    const lw = o.lw || 7;
    c.save();
    c.lineJoin = "round";
    c.lineCap = "round";
    path(pts);
    c.strokeStyle = rgba(STEELC, a * 0.35);
    c.lineWidth = lw + 4;
    c.stroke();
    path(pts);
    c.strokeStyle = rgba([8, 14, 32], a);
    c.lineWidth = lw;
    c.stroke();
    if (o.fill !== false && col) {
      path(pts);
      c.strokeStyle = rgba(col, a * (o.fa == null ? 0.55 : o.fa));
      c.lineWidth = lw * 0.55;
      c.stroke();
      if (o.flow) {
        c.globalCompositeOperation = "lighter";
        c.setLineDash([6, 14]);
        c.lineDashOffset = -S.time * 46 * o.flow;
        path(pts);
        c.strokeStyle = rgba(WHITE, a * 0.55);
        c.lineWidth = 2;
        c.stroke();
      }
    }
    c.restore();
  }

  function glow(x, y, r, col, a) {
    if (a <= 0.01) return;
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

  function dot(x, y, r, col, a) {
    const c = cx();
    c.fillStyle = rgba(col, a);
    c.beginPath();
    c.arc(x, y, r, 0, TAU);
    c.fill();
  }

  function rrect(x, y, w, h, r) {
    const c = cx();
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function outline(x, y, w, h, r, a, col = ICE) {
    const c = cx();
    rrect(x, y, w, h, r);
    c.fillStyle = rgba([10, 18, 40], a * 0.85);
    c.fill();
    c.strokeStyle = rgba(col, a * 0.55);
    c.lineWidth = 1.2;
    c.stroke();
  }

  function arrowHead(x, y, ang, s, col, a) {
    const c = cx();
    c.save();
    c.translate(x, y);
    c.rotate(ang);
    c.fillStyle = rgba(col, a);
    c.beginPath();
    c.moveTo(s, 0);
    c.lineTo(-s * 0.7, s * 0.6);
    c.lineTo(-s * 0.7, -s * 0.6);
    c.closePath();
    c.fill();
    c.restore();
  }

  function label(text, x, y, a, o = {}) {
    whisper(text, x, y, a, { size: o.size || 10.5, weight: o.weight || 600, color: o.color || ICE, align: o.align || "left", track: o.track });
  }

  /* Leader-line callout: from a point on the mechanism out to a label. */
  function callout(px, py, lx, ly, text, a, o = {}) {
    if (a <= 0.01) return;
    const c = cx();
    c.save();
    c.strokeStyle = rgba(ICE, a * 0.45);
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(px, py);
    c.lineTo(lx, ly);
    const dir = o.align === "right" ? -1 : 1;
    c.lineTo(lx + dir * 14, ly);
    c.stroke();
    c.restore();
    dot(px, py, 2.2, ICE, a * 0.8);
    label(text, lx + dir * 20, ly, a, { align: o.align, color: o.color || WHITE });
    if (o.sub) label(o.sub, lx + dir * 20, ly + 17, a * 0.75, { align: o.align, weight: 500, size: 10, track: 0.04 });
  }

  function polyAt(pts, u) {
    let total = 0;
    const seg = [];
    for (let i = 1; i < pts.length; i += 1) {
      const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      seg.push(l);
      total += l;
    }
    let d = clamp(u, 0, 1) * total;
    for (let i = 0; i < seg.length; i += 1) {
      if (d <= seg[i] || i === seg.length - 1) {
        const k = seg[i] ? d / seg[i] : 0;
        return [lerp(pts[i][0], pts[i + 1][0], k), lerp(pts[i][1], pts[i + 1][1], k), Math.atan2(pts[i + 1][1] - pts[i][1], pts[i + 1][0] - pts[i][0])];
      }
      d -= seg[i];
    }
    return [pts[0][0], pts[0][1], 0];
  }

  function subPath(pts, u0, u1, n = 24) {
    const out = [];
    for (let i = 0; i <= n; i += 1) out.push(polyAt(pts, lerp(u0, u1, i / n)));
    return out;
  }

  /* ---------- 3D hero: one real part, seen from outside ---------- */

  function hero(id, t, L, st = {}, o = {}) {
    const box = L.hero;
    const comp = W.COMP[id];
    const fov = 36 * DEG;
    const focal = (S.h * 0.5) / Math.tan(fov / 2);
    const rpx = Math.min(box.x1 - box.x0, (box.y1 - box.y0) * 1.2) * 0.36 * (o.zoom || 1);
    const d = (focal * comp.r) / rpx;
    const yaw = lerp(o.yaw0 == null ? -0.65 : o.yaw0, o.yaw1 == null ? 0.4 : o.yaw1, t);
    const pitch = o.pitch == null ? 0.3 : o.pitch;
    const tg = comp.c;
    const pos = v(tg.x + Math.sin(yaw) * Math.cos(pitch) * d, tg.y + Math.sin(pitch) * d, tg.z + Math.cos(yaw) * Math.cos(pitch) * d);
    const hx = (box.x0 + box.x1) / 2;
    const hy = (box.y0 + box.y1) / 2;
    const c = cx();
    const floor = c.createRadialGradient(hx, hy + rpx * 0.7, 0, hx, hy + rpx * 0.7, rpx * 1.8);
    floor.addColorStop(0, rgba([70, 140, 255], 0.16 * (o.alpha == null ? 1 : o.alpha)));
    floor.addColorStop(1, rgba([70, 140, 255], 0));
    c.fillStyle = floor;
    c.fillRect(hx - rpx * 2, hy - rpx, rpx * 4, rpx * 3);
    c.save();
    c.translate(hx - S.w / 2, hy - S.h / 2);
    kit.instrument({ pos, target: tg, fov }, { only: [id], dim: 0, ...st }, o.alpha == null ? 1 : o.alpha);
    c.restore();
    return { hx, hy, rpx };
  }

  /* Dashed sight-line from the 3D part to its x-ray, so the eye knows they are the same thing. */
  function xrayLink(L, h, a) {
    if (!L.wide || a <= 0.01) return;
    const c = cx();
    c.save();
    c.strokeStyle = rgba(ICE, a * 0.22);
    c.setLineDash([2, 6]);
    c.beginPath();
    c.moveTo(h.hx + h.rpx * 0.9, h.hy - h.rpx * 0.5);
    c.lineTo(L.sch.x0 + 6, L.sch.y0 + 20);
    c.moveTo(h.hx + h.rpx * 0.9, h.hy + h.rpx * 0.5);
    c.lineTo(L.sch.x0 + 6, L.sch.y1 - 20);
    c.stroke();
    c.restore();
    whisper("X-RAY", L.sch.x0 + 6, L.sch.y0 + 4, a * 0.5, { size: 9, color: [140, 210, 255] });
  }

  function backdrop(t, energy = 0) {
    bgBlack();
    bgVoid(1, energy);
    stars(0.35);
  }

  /* ---------- 00 · overview ---------- */

  const JOBS = { reservoir: "holds the solvents", detector: "sees what comes out", column: "keeps the column warm", injector: "injects the sample", pump: "pushes the solvent" };

  /* One instrument, as it sits on the bench, that comes apart into the five parts of LC. */
  function ov(t) {
    const L = layout();
    const w = S.w;
    const h = S.h;
    backdrop(t);
    const b = win(t, 0.3, 0.8);
    const k = G.ease(win(t, 0.26, 0.84));
    const T0 = v(5.2, 1.2, 0.2);
    const T1 = v(5.6, 0.75, 0.2);
    const d = lerp(L.wide ? 8.4 : 11, L.wide ? 13.2 : 17, k);
    const yaw = lerp(-0.62, 0.22, t);
    const el = lerp(0.24, 0.2, k);
    const tg = G.mix3(T0, T1, k);
    const cam = { pos: v(tg.x + Math.sin(yaw) * Math.cos(el) * d, tg.y + Math.sin(el) * d, tg.z + Math.cos(yaw) * Math.cos(el) * d), target: tg, fov: 40 * DEG };
    const c = cx();
    c.save();
    c.translate(lerp(L.wide ? w * 0.12 : 0, L.wide ? -w * 0.06 : 0, k), lerp(-h * 0.1, -h * 0.17, k));
    kit.setCam(cam);
    W.drawTower(R, { break: b, time: S.clock, alpha: sm(win(t, 0, 0.1)), detGlow: 0.35, loop: 0.5 });
    c.globalCompositeOperation = "source-over";
    R.flush(c);
    const pre = sm(win(t, 0.04, 0.14)) * (1 - sm(win(t, 0.26, 0.33)));
    W.STACK.forEach((m, i) => {
      const al = pre * sm(win(t, 0.05 + i * 0.025, 0.12 + i * 0.025));
      if (al <= 0.01) return;
      const q = R.project(G.add(W.towerSlot(m), v(W.TOWER.w + 0.02, m.id === "reservoir" ? 0.2 : 0, 0)));
      if (!q.vis) return;
      const lx = q.x + 40 + (i % 2) * 18;
      callout(q.x, q.y, lx, q.y, m.name, al, { sub: JOBS[m.id] });
    });
    W.COMP_IDS.forEach((id, i) => {
      const m = W.STACK.find((x) => x.id === id);
      const f = W.towerFlight(m, b);
      const al = sm(win(f.k, 0.88, 1)) * sm(win(t, 0.5, 0.6));
      const q = R.project(W.COMP[id].c);
      if (!q.vis || al <= 0.01) return;
      const ly = q.y - W.COMP[id].r * q.s * 0.95 - (i % 2) * 22;
      c.save();
      c.strokeStyle = rgba(ICE, al * 0.35);
      c.beginPath();
      c.moveTo(q.x, q.y - W.COMP[id].r * q.s * 0.45);
      c.lineTo(q.x, ly + 8);
      c.stroke();
      c.restore();
      whisper(`0${i + 1}  ${W.COMP[id].label}`, q.x, ly, al, { align: "center", weight: 600, color: WHITE });
    });
    c.restore();
    lesson(t, L, {
      kicker: "LC  ·  HOW IT WORKS",
      title: "One instrument, five jobs.",
      steps: [
        [0.0, "This is a complete liquid chromatography (LC) system, the way it sits on a lab bench: one tower of stacked modules."],
        [0.3, "Let's take it apart. Each module does one job: hold the solvents, pump them, inject the sample, separate it in the column, and detect what comes out."],
        [0.7, "Laid out in the order the liquid flows, that's the whole of LC. Scroll to look inside each part. Drag to turn the machine."],
      ],
    });
  }

  /* ---------- 01 · solvents & degasser ---------- */

  function bottle(x, y, bw, bh, col, tag, name, a) {
    const c = cx();
    outline(x + bw * 0.34, y - 14, bw * 0.32, 16, 3, a);
    outline(x, y, bw, bh, 12, a);
    const lvl = y + bh * 0.22;
    c.save();
    rrect(x + 3, y + 3, bw - 6, bh - 6, 9);
    c.clip();
    const g = c.createLinearGradient(0, lvl, 0, y + bh);
    g.addColorStop(0, rgba(col, a * 0.55));
    g.addColorStop(1, rgba(col, a * 0.18));
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(x, y + bh);
    for (let i = 0; i <= 20; i += 1) {
      const xx = x + (i / 20) * bw;
      c.lineTo(xx, lvl + Math.sin(S.time * 2 + i * 0.7) * 2);
    }
    c.lineTo(x + bw, y + bh);
    c.closePath();
    c.fill();
    c.restore();
    type(tag, x + bw / 2, y + bh * 0.58, { size: 30, weight: 800, alpha: a * 0.9, c });
    label(name, x + bw / 2, y + bh + 18, a * 0.8, { align: "center" });
  }

  function solv(t) {
    const L = layout();
    backdrop(t);
    const st = [
      [0.0, "Two solvents feed the system: A is water, B is an organic solvent such as acetonitrile. Together they're the mobile phase, the river everything rides on."],
      [0.32, "First they run through a degasser that pulls dissolved air out through a membrane. A single bubble would make the flow stutter."],
      [0.62, "Then they're blended. Over the run the mix shifts from mostly A to mostly B. This gradient slowly strengthens the solvent so stuck compounds wash off one by one."],
    ];
    const h0 = hero("reservoir", t, L, {}, { yaw0: 0.75, yaw1: 1.35, zoom: 0.9 });
    xrayLink(L, h0, sm(win(t, 0.04, 0.14)));
    const sw = stepWeights(t, st);
    const a = sm(win(t, 0.03, 0.12));
    const kB = sm(win(t, 0.64, 0.97));
    const pB = 0.05 + kB * 0.9;
    const mixCol = W.mixC(CYAN, MINT, pB);
    enter(L.sch, 600, 460);
    const e0 = emph(sw, 0) * a;
    const e1 = emph(sw, 1) * a;
    const e2 = emph(sw, 2) * a;
    bottle(40, 46, 92, 130, CYAN, "A", "WATER", e0);
    bottle(40, 236, 92, 130, MINT, "B", "ACETONITRILE", e0);
    const lineA = [[132, 100], [196, 100], [196, 196], [252, 196]];
    const lineB = [[132, 290], [196, 290], [196, 224], [252, 224]];
    pipe(lineA, CYAN, a * 0.9, { flow: 1, lw: 6 });
    pipe(lineB, MINT, a * 0.9, { flow: 1, lw: 6 });
    for (let i = 0; i < 6; i += 1) {
      const u = frac(S.time * 0.22 + i / 6);
      const [bx, by] = polyAt(i % 2 ? lineA : lineB, u);
      dot(bx, by, 2.6, WHITE, a * 0.8 * (1 - u * 0.4));
    }
    outline(252, 166, 118, 88, 10, e1);
    const c = cx();
    c.save();
    c.setLineDash([3, 4]);
    c.strokeStyle = rgba([140, 210, 255], e1 * 0.8);
    c.beginPath();
    c.moveTo(258, 174);
    c.lineTo(364, 174);
    c.stroke();
    c.restore();
    [[196, CYAN], [224, MINT]].forEach(([yy, col]) => {
      const pts = [];
      for (let i = 0; i <= 40; i += 1) pts.push([256 + i * 2.75, yy + Math.sin(i * 0.9) * 6]);
      pipe(pts, col, e1 + 0.15, { lw: 4, flow: 0.6 });
    });
    for (let i = 0; i < 7; i += 1) {
      const u = frac(S.time * 0.35 + i / 7);
      dot(268 + i * 14, 172 - u * 46, 2.4 + (1 - u), WHITE, e1 * (1 - u) * 0.9);
    }
    label("DEGASSER", 311, 150, e1, { align: "center" });
    label("air out ↑", 311, 108, e1 * 0.65, { align: "center", weight: 500 });
    pipe([[370, 196], [416, 210]], CYAN, a, { lw: 5, flow: 1 });
    pipe([[370, 224], [416, 210]], MINT, a, { lw: 5, flow: 1 });
    c.save();
    c.translate(436, 210);
    outline(-22, -22, 44, 44, 22, e2);
    c.rotate(S.time * 3);
    c.strokeStyle = rgba(mixCol, e2 * 0.9);
    c.lineWidth = 2;
    for (let i = 0; i < 3; i += 1) {
      c.beginPath();
      c.arc(0, 0, 13, i * (TAU / 3), i * (TAU / 3) + 1.4);
      c.stroke();
    }
    c.restore();
    label("MIXER", 436, 176, e2, { align: "center" });
    pipe([[458, 210], [580, 210]], mixCol, a, { lw: 7, flow: 1.4, fa: 0.8 });
    arrowHead(588, 210, 0, 8, mixCol, a);
    label("TO THE PUMP", 520, 190, a * 0.8, { align: "center" });
    const gx0 = 252;
    const gx1 = 580;
    const gy0 = 300;
    const gy1 = 430;
    c.strokeStyle = rgba(ICE, e2 * 0.5);
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(gx0, gy0);
    c.lineTo(gx0, gy1);
    c.lineTo(gx1, gy1);
    c.stroke();
    const prog = (u) => (u < 0.12 ? 0.05 : u < 0.82 ? 0.05 + ((u - 0.12) / 0.7) * 0.9 : 0.95);
    const gp = (u) => [gx0 + u * (gx1 - gx0), gy1 - prog(u) * (gy1 - gy0)];
    const N = 60;
    const cur = 0.12 + kB * 0.7;
    c.save();
    path(Array.from({ length: N + 1 }, (_, i) => gp(i / N)));
    c.strokeStyle = rgba(ICE, e2 * 0.25);
    c.setLineDash([3, 4]);
    c.stroke();
    c.restore();
    path(Array.from({ length: N + 1 }, (_, i) => gp((i / N) * cur)));
    c.strokeStyle = rgba(mixCol, e2);
    c.lineWidth = 2.4;
    c.stroke();
    const [cxp, cyp] = gp(cur);
    glow(cxp, cyp, 16, mixCol, e2 * 0.8);
    dot(cxp, cyp, 3.5, WHITE, e2);
    label("% B", gx0 - 6, gy0 - 12, e2 * 0.7);
    label("TIME →", gx1, gy1 + 16, e2 * 0.6, { align: "right", weight: 500 });
    label(`${Math.round(pB * 100)}% B`, cxp + 10, cyp - 14, e2, { color: WHITE, size: 11 });
    label("THE GRADIENT", gx0 + 10, gy0 + 6, e2 * 0.8);
    leave();
    lesson(t, L, { kicker: "LC  ·  01 / 06", title: "The solvents", steps: st });
  }

  /* ---------- 02 · pump ---------- */

  function pump(t) {
    const L = layout();
    backdrop(t);
    const st = [
      [0.0, "Each pump head is a piston sliding in a sealed chamber, with two one-way (check) valves: one in, one out."],
      [0.3, "Pull back: the inlet valve opens and solvent is sucked in. Push forward: the inlet slams shut and solvent is forced out through the outlet."],
      [0.62, "Two heads work half a beat apart. While one refills, the other delivers, so the flow stays smooth even at up to ~1,000 bar."],
    ];
    const h0 = hero("pump", t, L, {}, { yaw0: -0.4, yaw1: 0.55, zoom: 1.05 });
    xrayLink(L, h0, sm(win(t, 0.04, 0.14)));
    const sw = stepWeights(t, st);
    const a = sm(win(t, 0.03, 0.12));
    const e0 = emph(sw, 0) * a;
    const e1 = emph(sw, 1) * a;
    const e2 = emph(sw, 2) * a;
    const c = cx();
    enter(L.sch, 600, 460);
    const base = t * 2.2 + S.time * 0.12;
    const flows = [];
    [104, 330].forEach((cy, k) => {
      const ph = frac(base + k * 0.5);
      const pos = 0.5 - 0.5 * Math.cos(TAU * ph);
      const vel = Math.sin(TAU * ph);
      flows.push(Math.max(0, vel));
      const ea = k === 1 ? Math.max(e0, e2) : Math.max(e0, e1);
      const px = 236 + pos * 118;
      outline(222, cy - 34, 180, 68, 8, ea);
      c.save();
      rrect(225, cy - 31, 174, 62, 6);
      c.clip();
      const g = c.createLinearGradient(px, 0, 400, 0);
      g.addColorStop(0, rgba(CYAN, ea * 0.5));
      g.addColorStop(1, rgba(CYAN, ea * 0.25));
      c.fillStyle = g;
      c.fillRect(px, cy - 31, 400 - px, 62);
      c.restore();
      const rg = c.createLinearGradient(0, cy - 10, 0, cy + 10);
      rg.addColorStop(0, rgba([230, 238, 250], ea));
      rg.addColorStop(0.5, rgba([150, 165, 190], ea));
      rg.addColorStop(1, rgba([90, 100, 125], ea));
      c.fillStyle = rg;
      c.fillRect(70, cy - 9, px - 70, 18);
      c.fillRect(px - 8, cy - 28, 14, 56);
      outline(54, cy - 22, 30, 44, 5, ea * 0.8);
      label("MOTOR", 69, cy + 40, ea * 0.6, { align: "center", weight: 500 });
      const inOpen = vel < -0.05;
      const outOpen = vel > 0.05;
      pipe([[200, cy + 92], [330, cy + 92], [330, cy + 34]], CYAN, ea, { lw: 6, flow: inOpen ? 0.8 : 0 });
      const ib = cy + 60 + (inOpen ? -6 : 0);
      dot(330, ib, 6, inOpen ? [150, 255, 210] : STEELC, ea);
      if (inOpen) arrowHead(345, cy + 62, -Math.PI / 2, 6, CYAN, ea * 0.9);
      pipe([[402, cy], [470, cy]], CYAN, ea, { lw: 6, flow: outOpen ? 1 : 0 });
      dot(432 + (outOpen ? 6 : 0), cy, 6, outOpen ? [150, 255, 210] : STEELC, ea);
      if (outOpen) arrowHead(450, cy - 14, 0, 6, CYAN, ea * 0.9);
      label(k ? "HEAD 2" : "HEAD 1", 232, cy - 46, ea * 0.85);
      label(inOpen ? "FILLING" : outOpen ? "DELIVERING" : "—", 392, cy - 46, ea, { align: "right", color: inOpen ? [150, 255, 210] : outOpen ? [140, 210, 255] : ICE });
      if (k === 0) {
        callout(px - 1, cy + 22, 150, cy + 64, "PISTON", e0 * 0.9);
        callout(330, ib, 380, cy + 140, "INLET VALVE", e1 * 0.9, { sub: "opens to fill" });
        callout(432, cy - 6, 408, cy - 76, "OUTLET VALVE", e1 * 0.9, { align: "right", sub: "opens to deliver" });
      }
    });
    label("FROM SOLVENTS", 200, 452, a * 0.6, { weight: 500 });
    pipe([[470, 104], [470, 330]], CYAN, a, { lw: 6 });
    pipe([[470, 230], [585, 230]], CYAN, a, { lw: 7, flow: 1.3, fa: 0.8 });
    arrowHead(592, 230, 0, 8, CYAN, a);
    label("TO INJECTOR", 585, 212, a * 0.7, { align: "right" });
    const ripple = Math.sin(S.time * 9) * 4 + (flows[0] + flows[1] - 1) * 6;
    const bar = 820 + ripple;
    const gx = 548;
    const gy = 74;
    outline(gx - 40, gy - 40, 80, 80, 40, a);
    c.strokeStyle = rgba(ICE, a * 0.35);
    c.lineWidth = 3;
    c.beginPath();
    c.arc(gx, gy, 31, Math.PI * 0.75, Math.PI * 2.25);
    c.stroke();
    const ang = Math.PI * 0.75 + (bar / 1000) * Math.PI * 1.5;
    c.strokeStyle = rgba([255, 140, 160], a);
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(gx, gy);
    c.lineTo(gx + Math.cos(ang) * 28, gy + Math.sin(ang) * 28);
    c.stroke();
    label(`${Math.round(bar)} bar`, gx, gy + 54, a, { align: "center", color: WHITE, size: 11 });
    const fx0 = 482;
    const fx1 = 592;
    const fy = 420;
    label("FLOW OUT", fx0, 344, e2, {});
    [0, 1].forEach((k) => {
      path(Array.from({ length: 41 }, (_, i) => {
        const u = i / 40;
        const ph = frac(base - (1 - u) * 1.2 + k * 0.5);
        return [fx0 + u * (fx1 - fx0), fy - Math.max(0, Math.sin(TAU * ph)) * 36];
      }));
      c.strokeStyle = rgba(k ? MINT : [140, 210, 255], e2 * 0.55);
      c.lineWidth = 1.2;
      c.stroke();
    });
    path([[fx0, fy - 46], [fx1, fy - 46]]);
    c.strokeStyle = rgba(WHITE, e2);
    c.lineWidth = 2;
    c.stroke();
    label("1 + 2 = steady", fx0, fy + 18, e2 * 0.8, { weight: 500 });
    leave();
    lesson(t, L, { kicker: "LC  ·  02 / 06", title: "The pump", steps: st });
  }

  /* ---------- 03 · injector ---------- */

  function inject(t) {
    const L = layout();
    backdrop(t);
    const st = [
      [0.0, "LOAD: while the solvent flows straight past to the column, a needle draws a few microlitres of your sample into a small loop."],
      [0.38, "Then the rotor turns 60°. Its grooves now connect different ports. Nothing stops, and no air gets in."],
      [0.6, "INJECT: the solvent is rerouted through the loop and sweeps the sample plug into the column. The separation begins."],
    ];
    const rk = sm(win(t, 0.42, 0.56));
    const fill = sm(win(t, 0.08, 0.36));
    const push = sm(win(t, 0.6, 0.95));
    const h0 = hero("injector", t, L, { rotor: rk, loop: fill * (1 - push), plug: push }, { yaw0: -0.5, yaw1: 0.5, pitch: 0.42 });
    xrayLink(L, h0, sm(win(t, 0.04, 0.14)));
    const sw = stepWeights(t, st);
    const a = sm(win(t, 0.03, 0.12));
    const c = cx();
    enter(L.sch, 600, 460);
    const O = [220, 230];
    const r = 100;
    const ang = (i) => (-90 + (i - 2) * 60) * DEG;
    const port = (i, rr = r * 0.78) => [O[0] + Math.cos(ang(i)) * rr, O[1] + Math.sin(ang(i)) * rr];
    const injecting = rk > 0.5;
    const loopPts = (() => {
      const pts = [port(2, r), [O[0], O[1] - 172]];
      for (let i = 0; i <= 36; i += 1) {
        const an = -Math.PI / 2 + (i / 36) * Math.PI;
        const wob = Math.sin(i * 1.7) * 7;
        pts.push([O[0] + Math.cos(an) * (172 + wob), O[1] + Math.sin(an) * (172 + wob)]);
      }
      pts.push(port(5, r));
      return pts;
    })();
    const ext = {
      0: [port(0, r), [O[0] - 150, O[1] + 110], [10, O[1] + 110]],
      1: [port(1, r), [O[0] - 150, O[1] - 110], [10, O[1] - 110]],
      3: [port(3, r), [O[0] + 230 * Math.cos(ang(3)), O[1] + 230 * Math.sin(ang(3))], [590, O[1] + 230 * Math.sin(ang(3))]],
      4: [port(4, r), [O[0] + 230 * Math.cos(ang(4)), O[1] + 230 * Math.sin(ang(4))], [590, O[1] + 230 * Math.sin(ang(4))]],
    };
    pipe(ext[3], VIOLET, a * emph(sw, 0), { lw: 6, flow: !injecting && fill < 1 ? 1 : 0, fa: !injecting ? 0.7 : 0.15 });
    pipe(ext[4], VIOLET, a * emph(sw, 0), { lw: 6, fa: !injecting && fill > 0.9 ? 0.5 : 0.1 });
    pipe(ext[0], CYAN, a, { lw: 7, flow: 1.2, fa: 0.75 });
    pipe(ext[1], injecting ? W.mixC(CYAN, VIOLET, push > 0.05 && push < 0.98 ? 0.8 : 0) : CYAN, a, { lw: 7, flow: 1.2, fa: 0.75 });
    pipe(loopPts, null, a, { lw: 8, fill: false });
    const loopEm = Math.max(emph(sw, 0), emph(sw, 2)) * a;
    if (!injecting) {
      if (fill > 0.01) pipe(subPath(loopPts, 0, fill), VIOLET, loopEm, { lw: 8, fa: 0.85, flow: fill < 1 ? 0.8 : 0 });
    } else {
      const edge = 1 - push;
      if (edge > 0.01) pipe(subPath(loopPts, 0, edge), VIOLET, loopEm, { lw: 8, fa: 0.85, flow: 0.8 });
      if (edge < 0.99) pipe(subPath(loopPts, edge, 1), CYAN, loopEm, { lw: 8, fa: 0.7, flow: 0.8 });
      if (push > 0.02) {
        const [qx, qy] = polyAt(ext[1].slice().reverse(), 1 - Math.min(1, push * 1.05));
        glow(qx, qy, 26, VIOLET, a * 0.9 * (1 - win(push, 0.85, 1)));
        dot(qx, qy, 6, [230, 210, 255], a * (1 - win(push, 0.85, 1)));
      }
    }
    label("SAMPLE LOOP", O[0] + 194, O[1] + 4, loopEm, { color: [210, 190, 255] });
    label("FROM PUMP", 12, O[1] + 96, a * 0.85);
    label("TO COLUMN", 12, O[1] - 124, a * 0.85);
    label("NEEDLE  ← VIAL", 590, ext[3][2][1] - 14, a * emph(sw, 0), { align: "right" });
    label("WASTE", 590, ext[4][2][1] + 16, a * emph(sw, 0) * 0.8, { align: "right" });
    const e1 = emph(sw, 1) * a;
    outline(O[0] - r, O[1] - r, r * 2, r * 2, r, Math.max(a * 0.7, e1), ICE);
    const rot = rk * 60 * DEG;
    c.save();
    c.translate(O[0], O[1]);
    c.rotate(rot);
    c.strokeStyle = rgba(ICE, e1 * 0.25);
    for (let i = 0; i < 12; i += 1) {
      const an = (i / 12) * TAU;
      c.beginPath();
      c.moveTo(Math.cos(an) * r * 0.92, Math.sin(an) * r * 0.92);
      c.lineTo(Math.cos(an) * r * 0.98, Math.sin(an) * r * 0.98);
      c.stroke();
    }
    c.restore();
    [0, 2, 4].forEach((i) => {
      const a0 = ang(i) + rot;
      const a1 = a0 + 60 * DEG;
      const pair = injecting ? [(i + 1) % 6, (i + 2) % 6] : [i, i + 1];
      const isPump = pair.includes(0);
      const isSample = !injecting && (pair.includes(2) || pair.includes(4));
      const col = isPump ? (injecting && push > 0.02 && push < 0.97 && pair.includes(1) ? VIOLET : CYAN) : isSample ? VIOLET : CYAN;
      const live = isPump || (injecting && pair.includes(1)) || (!injecting && fill > 0.02 && isSample);
      c.save();
      c.lineCap = "round";
      c.strokeStyle = rgba([8, 14, 32], a);
      c.lineWidth = 10;
      c.beginPath();
      c.arc(O[0], O[1], r * 0.78, a0, a1);
      c.stroke();
      c.strokeStyle = rgba(rk > 0.02 && rk < 0.98 ? WHITE : col, a * (live ? 0.9 : 0.35));
      c.lineWidth = 4.5;
      c.beginPath();
      c.arc(O[0], O[1], r * 0.78, a0, a1);
      c.stroke();
      c.restore();
    });
    for (let i = 0; i < 6; i += 1) {
      const [px, py] = port(i);
      dot(px, py, 5.5, [20, 30, 60], a);
      c.strokeStyle = rgba(ICE, a * 0.7);
      c.lineWidth = 1.2;
      c.beginPath();
      c.arc(px, py, 5.5, 0, TAU);
      c.stroke();
    }
    type(injecting ? "INJECT" : "LOAD", O[0], O[1] - 4, { size: 20, weight: 800, alpha: a, c, track: 0.08 });
    label(rk > 0.02 && rk < 0.98 ? "turning 60°…" : "ROTOR POSITION", O[0], O[1] + 18, a * 0.6, { align: "center", weight: 500, size: 9 });
    leave();
    lesson(t, L, { kicker: "LC  ·  03 / 06", title: "The injector", steps: st });
  }

  /* ---------- 04 · column ---------- */

  let BEADS = null;
  function beads(x0, x1, cy, hh) {
    const key = `${Math.round(x0)}:${Math.round(x1)}:${Math.round(cy)}:${Math.round(hh)}`;
    if (BEADS && BEADS.key === key) return BEADS.list;
    const list = [];
    const br = hh / 3.4;
    let row = 0;
    for (let y = cy - hh + br; y <= cy + hh - br * 0.6; y += br * 1.72) {
      for (let x = x0 + br + (row % 2 ? br : 0); x < x1 - br; x += br * 2.02) list.push([x + (hash(list.length) - 0.5) * br * 0.25, y, br * (0.86 + hash(list.length + 9) * 0.14)]);
      row += 1;
    }
    BEADS = { key, list };
    return list;
  }

  const BAND = MOLS.map((m, i) => ({
    mol: m,
    v: [1.06, 0.68, 0.4][i],
    pts: Array.from({ length: 80 }, (_, j) => {
      const u1 = hash(i * 300 + j * 2 + 1) || 0.5;
      const u2 = hash(i * 300 + j * 2 + 2);
      return [Math.sqrt(-2 * Math.log(u1)) * Math.cos(TAU * u2), hash(i * 900 + j) * 2 - 1, hash(i * 77 + j * 5)];
    }),
    tag: ["barely sticks: out first", "sticks a little", "sticks the most: out last"][i],
  }));

  function column(t) {
    const L = layout();
    const w = S.w;
    const h = S.h;
    backdrop(t);
    const st = [
      [0.0, "The column is a steel tube packed with billions of porous particles, each a few micrometres wide. That packing is the stationary phase."],
      [0.3, "As the solvent carries the sample through, every molecule keeps grabbing onto the particle surface and letting go, thousands of times."],
      [0.6, "Compounds that hold on longer fall behind. One mixed band splits into separate bands. That is the separation, and it's what chromatography means."],
    ];
    const sw = stepWeights(t, st);
    const a = sm(win(t, 0.03, 0.12));
    const tg = W.COMP.column.c;
    const yaw = lerp(-0.12, 0.12, t);
    const d = L.wide ? 4.6 : 6.4;
    const cam = { pos: v(tg.x + Math.sin(yaw) * d, tg.y + 0.9, tg.z + Math.cos(yaw) * d), target: tg, fov: 36 * DEG };
    const c = cx();
    const topY = h * (L.wide ? 0.2 : 0.16);
    c.save();
    c.translate(0, topY - h / 2);
    kit.instrument(cam, { only: ["column"], dim: 0 }, a);
    const pin = R.project(v(6.36, 0.65, 0.15));
    const pout = R.project(v(8.86, 0.65, 0.15));
    c.restore();
    const x0 = w * 0.08;
    const x1 = w * 0.92;
    const cy = h * (L.wide ? 0.45 : 0.4);
    const hh = h * 0.07;
    c.save();
    c.strokeStyle = rgba(ICE, a * 0.22);
    c.setLineDash([2, 6]);
    c.beginPath();
    c.moveTo(pin.x, pin.y + topY - h / 2 + 14);
    c.lineTo(x0, cy - hh - 6);
    c.moveTo(pout.x, pout.y + topY - h / 2 + 14);
    c.lineTo(x1, cy - hh - 6);
    c.stroke();
    c.restore();
    whisper("X-RAY  ·  CUTAWAY", x0, cy - hh - 22, a * 0.55, { size: 9, color: [140, 210, 255] });
    const e0 = emph(sw, 0) * a;
    rrect(x0, cy - hh, x1 - x0, hh * 2, 10);
    c.fillStyle = rgba([10, 20, 46], a * 0.9);
    c.fill();
    c.strokeStyle = rgba(ICE, a * 0.6);
    c.lineWidth = 1.5;
    c.stroke();
    c.save();
    rrect(x0, cy - hh, x1 - x0, hh * 2, 10);
    c.clip();
    beads(x0, x1, cy, hh).forEach(([bx, by, br]) => {
      const g = c.createRadialGradient(bx - br * 0.35, by - br * 0.4, br * 0.1, bx, by, br);
      g.addColorStop(0, rgba([235, 242, 255], e0 * 0.9));
      g.addColorStop(0.55, rgba([150, 170, 205], e0 * 0.6));
      g.addColorStop(1, rgba([60, 80, 120], e0 * 0.5));
      c.fillStyle = g;
      c.beginPath();
      c.arc(bx, by, br, 0, TAU);
      c.fill();
    });
    const s = win(t, 0.12, 0.98);
    const span = x1 - x0;
    c.globalCompositeOperation = "lighter";
    BAND.forEach((b, i) => {
      const u = 0.035 + s * b.v;
      const sig = 0.012 + s * 0.022 * (0.6 + i * 0.4);
      const fade = 1 - sm(win(u, 0.97, 1.06));
      b.pts.forEach(([gx, gy, ph]) => {
        const hop = Math.sin(S.time * (2 + ph * 3) + ph * 40) * 0.004;
        const x = x0 + (u + gx * sig + hop) * span;
        if (x < x0 || x > x1) return;
        const y = cy + gy * hh * 0.86;
        const al = a * fade * (0.55 + 0.45 * Math.exp(-gx * gx * 0.5)) * (s > 0 || t > 0.06 ? 1 : 0);
        c.fillStyle = rgba(b.mol.color, al * 0.9);
        c.beginPath();
        c.arc(x, y, 2.3, 0, TAU);
        c.fill();
      });
    });
    c.restore();
    c.save();
    c.setLineDash([6, 12]);
    c.lineDashOffset = -S.time * 40;
    c.strokeStyle = rgba(WHITE, a * 0.25);
    c.beginPath();
    c.moveTo(x0 - 40, cy);
    c.lineTo(x0 - 6, cy);
    c.stroke();
    c.restore();
    arrowHead(x0 - 6, cy, 0, 6, WHITE, a * 0.5);
    label("FLOW", x0 - 40, cy - 14, a * 0.6, {});
    const sepA = sm(win(s, 0.25, 0.45)) * emph(sw, 2) * 1.25;
    BAND.forEach((b, i) => {
      const u = 0.035 + s * b.v;
      if (u > 1) return;
      const x = x0 + u * span;
      const y = cy + hh + 18 + (i % 2) * 16;
      whisper(`${b.mol.short}`, x, cy - hh - 10, a * sm(win(s, 0.12, 0.3)), { align: "center", weight: 800, size: 12, color: b.mol.color });
      label(b.tag, clamp(x, x0 + 90, x1 - 90), y, Math.min(1, sepA), { align: "center", color: b.mol.color, weight: 500 });
    });
    const e1 = emph(sw, 1) * a;
    const mr = Math.min(h * 0.12, w * 0.09);
    const mx = L.wide ? w * 0.8 : w * 0.78;
    const my = L.wide ? h * 0.76 : h * 0.86;
    const ub = 0.035 + s * BAND[2].v;
    const ax = x0 + clamp(ub, 0.05, 0.95) * span;
    c.save();
    c.strokeStyle = rgba(ICE, e1 * 0.35);
    c.setLineDash([2, 5]);
    c.beginPath();
    c.moveTo(ax, cy + hh * 0.4);
    c.lineTo(mx - mr * 0.7, my - mr * 0.7);
    c.stroke();
    c.restore();
    c.save();
    c.beginPath();
    c.arc(mx, my, mr, 0, TAU);
    c.fillStyle = rgba([6, 12, 30], e1 * 0.95 + 0.05);
    c.fill();
    c.clip();
    const sg = c.createRadialGradient(mx - mr * 0.2, my + mr * 1.6, mr * 0.2, mx, my + mr * 1.9, mr * 1.6);
    sg.addColorStop(0, rgba([210, 225, 250], e1 * 0.9));
    sg.addColorStop(1, rgba([70, 90, 130], e1 * 0.6));
    c.fillStyle = sg;
    c.beginPath();
    c.arc(mx, my + mr * 1.9, mr * 1.45, 0, TAU);
    c.fill();
    for (let i = 0; i < 9; i += 1) {
      const an = -Math.PI / 2 + (i - 4) * 0.13;
      dot(mx + Math.cos(an) * mr * 1.45, my + mr * 1.9 + Math.sin(an) * mr * 1.45 + 6, 2.5, [30, 40, 70], e1 * 0.8);
    }
    const ph = frac(S.time * 0.45);
    const stuck = ph < 0.55;
    const lift = stuck ? 0 : Math.sin(((ph - 0.55) / 0.45) * Math.PI) * mr * 0.55;
    const bxm = mx - mr * 0.45 + (stuck ? ph * 0.15 : 0.08 + (ph - 0.55) * 1.4) * mr;
    W.drawMolecule(c, BAND[2].mol, bxm, my + mr * 0.36 - lift, mr * 0.15, S.time * 0.6, S.time * 0.8, e1);
    const axm = mx - mr * 1.2 + frac(S.time * 0.6) * mr * 2.6;
    W.drawMolecule(c, BAND[0].mol, axm, my - mr * 0.42, mr * 0.11, S.time, S.time * 1.2, e1 * 0.9);
    c.restore();
    c.strokeStyle = rgba(ICE, e1 * 0.6);
    c.lineWidth = 1.2;
    c.beginPath();
    c.arc(mx, my, mr, 0, TAU);
    c.stroke();
    whisper("ZOOM ×100,000", mx, my - mr - 14, e1 * 0.8, { align: "center", size: 9.5, weight: 600, color: [140, 210, 255] });
    whisper(stuck ? "B: holding on…" : "B: let go…", mx, my + mr + 16, e1, { align: "center", size: 10, weight: 600, color: [210, 190, 255] });
    lesson(t, L, { kicker: "LC  ·  04 / 06", title: "The column", steps: st, y: L.wide ? h * 0.66 : h * 0.62 });
  }

  /* ---------- 05 · UV detector ---------- */

  const PASS = [0.3, 0.52, 0.74];
  const absorb = (t) => MOLS.reduce((acc, m, i) => acc + [1, 0.72, 0.58][i] * Math.exp(-0.5 * Math.pow((t - PASS[i]) / 0.028, 2)), 0);

  function detect(t) {
    const L = layout();
    backdrop(t);
    const st = [
      [0.0, "A lamp shines ultraviolet light through a flow cell, a channel barely wider than a hair that the column's output streams through."],
      [0.28, "When a band of compound drifts into the beam, it absorbs part of the light. Less light reaches the sensor on the other side."],
      [0.55, "The software turns that dip into a peak. Plotted over time, the peaks form a chromatogram, one peak per separated compound."],
    ];
    const A = absorb(t);
    const h0 = hero("detector", t, L, { detGlow: 0.3 + A * 0.6 }, { yaw0: -0.7, yaw1: 0.35 });
    xrayLink(L, h0, sm(win(t, 0.04, 0.14)));
    const sw = stepWeights(t, st);
    const a = sm(win(t, 0.03, 0.12));
    const e0 = emph(sw, 0) * a;
    const e1 = emph(sw, 1) * a;
    const e2 = emph(sw, 2) * a;
    const c = cx();
    enter(L.sch, 600, 460);
    const by = 160;
    glow(70, by, 60, [200, 230, 255], e0 * 0.9);
    dot(70, by, 14, [240, 248, 255], e0);
    label("UV LAMP", 70, by + 52, e0, { align: "center" });
    const beam = (xa, xb, I) => {
      c.save();
      c.globalCompositeOperation = "lighter";
      const g = c.createLinearGradient(0, by - 10, 0, by + 10);
      g.addColorStop(0, rgba([140, 200, 255], 0));
      g.addColorStop(0.5, rgba([200, 235, 255], I * a * 0.85));
      g.addColorStop(1, rgba([140, 200, 255], 0));
      c.fillStyle = g;
      c.fillRect(xa, by - 10, xb - xa, 20);
      c.restore();
    };
    beam(86, 258, 1);
    const I = clamp(1 - A * 0.72, 0.18, 1);
    beam(292, 446, I);
    outline(258, 30, 34, 280, 8, Math.max(e1, a * 0.7));
    c.save();
    rrect(261, 33, 28, 274, 6);
    c.clip();
    c.fillStyle = rgba(CYAN, a * 0.12);
    c.fillRect(261, 33, 28, 274);
    c.setLineDash([5, 10]);
    c.lineDashOffset = -S.time * 40;
    c.strokeStyle = rgba(WHITE, a * 0.25);
    c.beginPath();
    c.moveTo(275, 33);
    c.lineTo(275, 307);
    c.stroke();
    MOLS.forEach((m, i) => {
      const y = by + (t - PASS[i]) * 900;
      if (y < 0 || y > 340) return;
      const g = c.createRadialGradient(275, y, 0, 275, y, 30);
      g.addColorStop(0, rgba(m.color, a * 0.9));
      g.addColorStop(1, rgba(m.color, 0));
      c.fillStyle = g;
      c.fillRect(255, y - 30, 40, 60);
    });
    c.restore();
    label("FLOW CELL", 275, 18, Math.max(e1, a * 0.6), { align: "center" });
    arrowHead(275, 322, Math.PI / 2, 6, ICE, a * 0.5);
    rrect(446, by - 22, 16, 44, 4);
    c.fillStyle = rgba([20, 30, 60], a);
    c.fill();
    glow(454, by, 30, [200, 235, 255], I * a * 0.7);
    label("SENSOR", 454, by + 40, a * 0.9, { align: "center" });
    label(`light reaching it  ${Math.round(I * 100)}%`, 454, by - 40, Math.max(e1, a * 0.5), { align: "center", color: WHITE });
    if (A > 0.1) {
      const k = MOLS.reduce((best, m, i) => (Math.abs(t - PASS[i]) < Math.abs(t - PASS[best]) ? i : best), 0);
      callout(290, by, 360, by + 64, `${MOLS[k].short} ABSORBS`, e1 * clamp(A * 1.6, 0, 1), { color: MOLS[k].color });
    }
    const gx0 = 40;
    const gx1 = 580;
    const gb = 440;
    const gh = 82;
    c.strokeStyle = rgba(ICE, e2 * 0.5);
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(gx0, gb - gh - 10);
    c.lineTo(gx0, gb);
    c.lineTo(gx1, gb);
    c.stroke();
    const tmin = 0.14;
    const tmax = 0.92;
    const head = clamp((t - tmin) / (tmax - tmin), 0, 1);
    if (head > 0) {
      const pts = [];
      for (let i = 0; i <= 160; i += 1) {
        const u = (i / 160) * head;
        const tt = tmin + u * (tmax - tmin);
        pts.push([gx0 + u * (gx1 - gx0), gb - absorb(tt) * gh + Math.sin(i * 1.9) * 0.6]);
      }
      c.save();
      c.globalCompositeOperation = "lighter";
      path(pts);
      c.strokeStyle = rgba(WHITE, Math.max(e2, a * 0.6));
      c.lineWidth = 1.8;
      c.stroke();
      c.restore();
      const hp = pts[pts.length - 1];
      glow(hp[0], hp[1], 16, CYAN, a);
      MOLS.forEach((m, i) => {
        const u = (PASS[i] - tmin) / (tmax - tmin);
        if (u > head) return;
        label(m.short, gx0 + u * (gx1 - gx0), gb - [1, 0.72, 0.58][i] * gh - 14, a * 0.9, { align: "center", color: m.color, weight: 800 });
      });
    }
    label("SIGNAL", gx0 + 6, gb - gh - 16, Math.max(e2, a * 0.5));
    label("TIME →", gx1, gb + 14, a * 0.5, { align: "right", weight: 500 });
    leave();
    lesson(t, L, { kicker: "LC  ·  05 / 06", title: "The UV detector", steps: st });
  }

  /* ---------- 06 · reading the chromatogram ---------- */

  function read(t) {
    const L = layout();
    const w = S.w;
    const h = S.h;
    backdrop(t);
    const st = [
      [0.0, "Retention time, when a peak appears, is a clue to what the compound is. Under the same conditions, the same compound always comes out at the same time."],
      [0.33, "The area under a peak tells you how much of it was in the sample. Bigger area means more compound."],
      [0.62, "But two different compounds can leave the column at the same moment and hide inside one peak. Telling them apart is the job of a mass spectrometer, which has its own film."],
    ];
    const sw = stepWeights(t, st);
    const a = sm(win(t, 0.03, 0.12));
    const top = lessonBox(L, { steps: st, y: h * 0.7 }).top;
    const base = Math.min(h * 0.52, top - 74);
    const box = { x0: w * 0.08, x1: w * 0.92, base, height: Math.min(h * 0.36, base - h * 0.17) };
    const span = box.x1 - box.x0;
    const c = cx();
    c.strokeStyle = rgba(ICE, a * 0.35);
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(box.x0, box.base);
    c.lineTo(box.x1, box.base);
    c.stroke();
    kit.drawChrom(box, { alpha: a });
    for (let m = 0; m <= 5; m += 1) {
      const x = box.x0 + (m / 5.6) * span;
      c.fillStyle = rgba(ICE, a * 0.4);
      c.fillRect(x, box.base, 1, 5);
      whisper(`${m}`, x, box.base + 14, a * 0.45, { align: "center", size: 9 });
    }
    whisper("min", box.x1, box.base + 14, a * 0.45, { align: "right", size: 9 });
    const P = kit.PEAKS;
    const e0 = emph(sw, 0) * a;
    const pa = P[0];
    const ax = box.x0 + pa.x * span;
    const ay = box.base - pa.h * box.height;
    c.save();
    c.setLineDash([3, 5]);
    c.strokeStyle = rgba(CYAN, e0 * 0.9);
    c.beginPath();
    c.moveTo(ax, ay - 6);
    c.lineTo(ax, box.base);
    c.stroke();
    c.restore();
    const ry = box.base + 34;
    const grow = sm(win(t, 0.04, 0.22));
    c.strokeStyle = rgba(CYAN, e0);
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(box.x0, ry);
    c.lineTo(box.x0 + (ax - box.x0) * grow, ry);
    c.stroke();
    if (grow > 0.95) arrowHead(ax, ry, 0, 6, CYAN, e0);
    whisper(`RETENTION TIME  ·  ${MOLS[0].rt} min`, box.x0, ry + 16, e0, { weight: 600, color: [170, 230, 255] });
    const e1 = emph(sw, 1) * a;
    const pc = P[1];
    if (sw[1].on > 0.01) {
      c.save();
      c.beginPath();
      const u0 = pc.x - pc.s * 3.2;
      const u1 = pc.x + pc.s * 3.2;
      c.moveTo(box.x0 + u0 * span, box.base);
      for (let i = 0; i <= 60; i += 1) {
        const u = lerp(u0, u1, i / 60);
        c.lineTo(box.x0 + u * span, box.base - pc.h * Math.exp(-0.5 * Math.pow((u - pc.x) / pc.s, 2)) * box.height);
      }
      c.lineTo(box.x0 + u1 * span, box.base);
      c.closePath();
      const fg = c.createLinearGradient(0, box.base - box.height, 0, box.base);
      fg.addColorStop(0, rgba(MINT, e1 * 0.65));
      fg.addColorStop(1, rgba(MINT, e1 * 0.15));
      c.fillStyle = fg;
      c.fill();
      c.restore();
      whisper("AREA = HOW MUCH", box.x0 + pc.x * span, box.base + 34, e1, { align: "center", weight: 600, color: [170, 255, 220] });
      whisper(`of compound ${pc.mol.short}`, box.x0 + pc.x * span, box.base + 50, e1 * 0.6, { align: "center", size: 9.5 });
    }
    const e2 = emph(sw, 2) * a;
    const pb = P[2];
    if (sw[2].on > 0.01) {
      const split = sm(win(t, 0.64, 0.8));
      [[-1, VIOLET], [1, MAGENTA]].forEach(([sg, col]) => {
        const cxu = pb.x + sg * pb.s * 0.55 * split;
        c.save();
        c.setLineDash([4, 4]);
        c.strokeStyle = rgba(col, e2);
        c.lineWidth = 1.4;
        c.beginPath();
        for (let i = 0; i <= 60; i += 1) {
          const u = lerp(pb.x - pb.s * 3.5, pb.x + pb.s * 3.5, i / 60);
          const y = box.base - pb.h * 0.62 * Math.exp(-0.5 * Math.pow((u - cxu) / (pb.s * 0.78), 2)) * box.height;
          if (i) c.lineTo(box.x0 + u * span, y);
          else c.moveTo(box.x0 + u * span, y);
        }
        c.stroke();
        c.restore();
      });
      callout(box.x0 + pb.x * span, box.base - pb.h * box.height - 4, box.x0 + pb.x * span - 40, box.base - box.height - 6, "TWO COMPOUNDS, ONE PEAK?", e2, { align: "right", color: [255, 190, 235], sub: "the mass spectrometer can tell" });
    }
    lesson(t, L, { kicker: "LC  ·  06 / 06", title: "Reading the peaks", steps: st, y: h * 0.7 });
  }

  /* ---------- 07 · electrospray ion source ---------- */

  const DROPS = Array.from({ length: 110 }, (_, i) => ({ s0: hash(i + 3), dir: hash(i + 50) * 2 - 1, k: i % 3, sz: 0.7 + hash(i + 90) * 0.6 }));

  function esi(t) {
    const L = layout();
    backdrop(t, 0.55);
    const st = [
      [0.0, "The liquid leaving the LC is pushed through a fine metal needle held at a few thousand volts. The tip pulls into a sharp cone of charged liquid."],
      [0.32, "It sprays into a mist of tiny charged droplets. Hot nitrogen gas evaporates them; as they shrink, the charge crowds together until they burst apart."],
      [0.62, "What's left are bare, charged molecules, called ions. An electric field pulls them through a pinhole cone into the vacuum of the mass spectrometer."],
    ];
    const sw = stepWeights(t, st);
    const a = sm(win(t, 0.03, 0.12));
    const e0 = emph(sw, 0) * a;
    const e1 = emph(sw, 1) * a;
    const e2 = emph(sw, 2) * a;
    const c = cx();
    enter(L.full, 1000, 400);
    const Y = 200;
    pipe([[0, Y], [210, Y]], CYAN, a, { lw: 9, flow: 1, fa: 0.6 });
    label("FROM THE LC", 20, Y - 22, a * 0.7);
    c.save();
    const ng = c.createLinearGradient(0, Y - 14, 0, Y + 14);
    ng.addColorStop(0, rgba([235, 240, 250], e0));
    ng.addColorStop(0.5, rgba([140, 155, 185], e0));
    ng.addColorStop(1, rgba([70, 80, 110], e0));
    c.fillStyle = ng;
    c.beginPath();
    c.moveTo(200, Y - 14);
    c.lineTo(352, Y - 3);
    c.lineTo(352, Y + 3);
    c.lineTo(200, Y + 14);
    c.closePath();
    c.fill();
    c.restore();
    for (let i = 0; i < 6; i += 1) {
      const xx = 220 + i * 22;
      type("+", xx, Y - 24 + Math.sin(S.time * 4 + i) * 2, { size: 13, weight: 700, alpha: e0 * 0.8, color: AMBER, c });
    }
    label("+3,000 V", 260, Y + 34, e0, { align: "center", color: AMBER });
    c.save();
    c.fillStyle = rgba(CYAN, e0 * 0.8);
    c.beginPath();
    c.moveTo(352, Y - 3);
    c.lineTo(372, Y);
    c.lineTo(352, Y + 3);
    c.closePath();
    c.fill();
    c.restore();
    glow(372, Y, 22, CYAN, e0 * 0.8);
    callout(366, Y + 2, 330, Y + 96, "TAYLOR CONE", e0, { sub: "liquid pulled to a point" });
    [[-1, 30], [1, 370]].forEach(([sg, yy]) => {
      for (let i = 0; i < 3; i += 1) {
        const x = 470 + i * 70;
        c.save();
        c.setLineDash([5, 8]);
        c.lineDashOffset = -S.time * 30;
        c.strokeStyle = rgba(AMBER, e1 * 0.55);
        c.lineWidth = 1.5;
        c.beginPath();
        c.moveTo(x - 30, yy);
        c.lineTo(x + 10, Y + sg * -70);
        c.stroke();
        c.restore();
        arrowHead(x + 10, Y + sg * -70, Math.atan2(Y + sg * -70 - yy, 40), 5, AMBER, e1 * 0.7);
      }
    });
    label("HOT N₂  ·  350 °C", 540, 18, e1, { align: "center", color: AMBER });
    c.save();
    c.globalCompositeOperation = "lighter";
    DROPS.forEach((d) => {
      const s = frac(S.time * 0.3 + d.s0);
      const x = 375 + s * 430;
      const y = Y + d.dir * Math.sin(Math.PI * Math.pow(s, 0.85)) * 120;
      const col = MOLS[d.k].color;
      if (s < 0.64) {
        const r = (11 * Math.pow(1 - s / 0.64, 1.1) + 2.2) * d.sz;
        const g = c.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
        g.addColorStop(0, rgba([220, 240, 255], e1 * 0.75));
        g.addColorStop(1, rgba(CYAN, e1 * 0.25));
        c.fillStyle = g;
        c.beginPath();
        c.arc(x, y, r, 0, TAU);
        c.fill();
        if (r > 6) type("+", x, y, { size: 9, weight: 700, alpha: e1 * 0.8, color: AMBER, c });
      } else {
        const k = (s - 0.64) / 0.36;
        if (k < 0.08) glow(x, y, 14, WHITE, e1 * (1 - k / 0.08));
        glow(x, y, 9, col, e2 * 0.9);
        dot(x, y, 2.4, WHITE, Math.max(e2, a * 0.5));
      }
    });
    c.restore();
    callout(520, Y - 70, 480, Y - 128, "DROPLETS SHRINK & BURST", e1, { align: "right" });
    c.save();
    const cg = c.createLinearGradient(820, 0, 1000, 0);
    cg.addColorStop(0, rgba([20, 6, 40], 0));
    cg.addColorStop(1, rgba([10, 2, 22], a * 0.9));
    c.fillStyle = cg;
    c.fillRect(820, 0, 180, 400);
    c.restore();
    c.fillStyle = rgba([170, 180, 205], Math.max(e2, a * 0.6));
    c.beginPath();
    c.moveTo(810, 40);
    c.lineTo(860, 40);
    c.lineTo(860, Y - 5);
    c.lineTo(820, Y - 7);
    c.closePath();
    c.moveTo(810, 360);
    c.lineTo(860, 360);
    c.lineTo(860, Y + 5);
    c.lineTo(820, Y + 7);
    c.closePath();
    c.fill();
    for (let i = 0; i < 8; i += 1) {
      const s = frac(S.time * 0.9 + i / 8);
      glow(860 + s * 140, Y + Math.sin(i * 3) * 3, 8, MOLS[i % 3].color, e2 * 0.9);
      dot(860 + s * 140, Y + Math.sin(i * 3) * 3, 2, WHITE, e2);
    }
    callout(822, 70, 790, 30, "SAMPLING CONE", e2, { align: "right", sub: "pinhole into the vacuum" });
    label("VACUUM", 990, 384, a * 0.6, { align: "right", color: [255, 190, 235] });
    callout(780, Y + 12, 700, Y + 150, "IONS", e2, { align: "right", color: WHITE });
    leave();
    lesson(t, L, { kicker: "MS  ·  01 / 03", title: "The ion source", steps: st, color: [255, 170, 225] });
  }

  /* ---------- 08 · quadrupole ---------- */

  const QIONS = Array.from({ length: 46 }, (_, i) => {
    const k = i % 4;
    const mz = k < 3 ? MOLS[k].mz : 120 + hash(i + 5) * 380;
    return { mz, col: k < 3 ? MOLS[k].color : ICE, s0: hash(i + 11), ph: hash(i + 33) * TAU };
  });

  function quad(t) {
    const L = layout();
    backdrop(t, 0.7);
    const st = [
      [0.0, "Four parallel metal rods. Opposite pairs carry a steady voltage plus a rapidly flipping radio-frequency one, so the field between them keeps changing."],
      [0.32, "For any one setting, only ions of a single mass-to-charge ratio (m/z) ride a stable, wobbling path straight down the middle."],
      [0.62, "Every other ion is shaken off course and crashes into a rod. Sweep the voltages and each m/z gets its turn. It works like a tunable sieve for mass."],
    ];
    const sw = stepWeights(t, st);
    const a = sm(win(t, 0.03, 0.12));
    const e0 = emph(sw, 0) * a;
    const e1 = emph(sw, 1) * a;
    const e2 = emph(sw, 2) * a;
    const c = cx();
    enter(L.full, 1000, 400);
    const sel = lerp(120, 490, win(t, 0.2, 0.96));
    const Y = 190;
    const X0 = 170;
    const X1 = 840;
    const rf = Math.sin(S.time * 7);
    const rod = (y, dx, back, pos) => {
      const hh = back ? 11 : 14;
      const g = c.createLinearGradient(0, y - hh, 0, y + hh);
      const b = back ? 0.55 : 1;
      g.addColorStop(0, rgba([235, 240, 250], e0 * b));
      g.addColorStop(0.45, rgba([150, 160, 185], e0 * b));
      g.addColorStop(1, rgba([60, 66, 90], e0 * b));
      c.fillStyle = g;
      rrect(X0 + dx, y - hh, X1 - X0, hh * 2, hh);
      c.fill();
      const live = pos ? rf : -rf;
      c.save();
      c.globalCompositeOperation = "lighter";
      rrect(X0 + dx, y - hh, X1 - X0, hh * 2, hh);
      c.fillStyle = rgba(live > 0 ? [120, 200, 255] : MAGENTA, e0 * 0.22 * Math.abs(live) * b);
      c.fill();
      c.restore();
      type(live > 0 ? "+" : "−", X0 + dx - 16, y, { size: 16, weight: 800, alpha: e0 * b, color: live > 0 ? [150, 215, 255] : [255, 150, 210], c });
    };
    rod(Y - 86, 26, true, false);
    rod(Y + 64, 26, true, false);
    const ionAt = (q, s) => {
      const x = 60 + s * 900;
      const sp = Math.max(0, (x - X0) / (X1 - X0));
      const dm = Math.abs(q.mz - sel);
      const stable = dm < 16;
      const g = 3.2 + dm / 30;
      const amp = stable ? 16 : 7 * Math.exp(g * sp);
      const crashAt = stable ? 9 : Math.log(10) / g;
      const y = Y + Math.max(-74, Math.min(74, amp * Math.sin(sp * 26 + q.ph))) * (x < X0 ? 0.2 : 1);
      return { x, y, sp, stable, crashAt };
    };
    QIONS.forEach((q) => {
      const s = frac(S.time * 0.22 + q.s0);
      const p = ionAt(q, s);
      if (p.sp > p.crashAt) {
        if (p.sp - p.crashAt < 0.05) {
          const hit = ionAt(q, s - (p.sp - p.crashAt) * ((X1 - X0) / 900));
          const k = 1 - (p.sp - p.crashAt) / 0.05;
          glow(hit.x, hit.y, 22, AMBER, e2 * k);
          dot(hit.x, hit.y, 3, WHITE, e2 * k);
        }
        return;
      }
      const al = p.stable ? Math.max(e1, a * 0.7) : a * 0.75;
      c.save();
      c.globalCompositeOperation = "lighter";
      c.beginPath();
      for (let j = 0; j <= 14; j += 1) {
        const tp = ionAt(q, Math.max(0, s - j * 0.006));
        if (j) c.lineTo(tp.x, tp.y);
        else c.moveTo(tp.x, tp.y);
      }
      c.strokeStyle = rgba(q.col, al * 0.35);
      c.lineWidth = p.stable ? 2 : 1.2;
      c.stroke();
      c.restore();
      glow(p.x, p.y, p.stable ? 12 : 7, q.col, al * 0.8);
      dot(p.x, p.y, p.stable ? 2.8 : 2, p.stable ? WHITE : q.col, al);
    });
    if (sw[2].on > 0.01) callout(X0 + 0.32 * (X1 - X0), Y - 70, X0 + 0.4 * (X1 - X0), Y - 128, "WRONG m/z: CRASHES INTO A ROD", e2, { color: AMBER });
    rod(Y - 66, 0, false, true);
    rod(Y + 86, 0, false, true);
    glow(900, Y, 30, WHITE, a * 0.35);
    c.fillStyle = rgba(ICE, a * 0.7);
    c.fillRect(896, Y - 26, 4, 52);
    label("TO DETECTOR", 908, Y - 34, a * 0.7);
    label("IONS IN", 60, Y - 30, a * 0.7);
    label("RF + DC", X0 + 10, Y - 112, e0, { color: [150, 215, 255] });
    const sx0 = 300;
    const sx1 = 700;
    const sy = 360;
    c.strokeStyle = rgba(ICE, a * 0.4);
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(sx0, sy);
    c.lineTo(sx1, sy);
    c.stroke();
    const mzx = (m) => sx0 + ((m - 120) / 370) * (sx1 - sx0);
    MOLS.forEach((m) => {
      const near = Math.abs(m.mz - sel) < 16;
      c.fillStyle = rgba(m.color, a * (near ? 1 : 0.5));
      c.fillRect(mzx(m.mz) - 1, sy - (near ? 12 : 7), 2, near ? 12 : 7);
      if (near) label(`${m.short} PASSES`, mzx(m.mz), sy - 22, Math.max(e1, a * 0.7), { align: "center", color: m.color });
    });
    glow(mzx(sel), sy, 14, WHITE, a * 0.8);
    c.fillStyle = rgba(WHITE, a);
    c.fillRect(mzx(sel) - 1, sy - 16, 2, 22);
    label(`FILTER SET TO  m/z ${sel.toFixed(0)}`, sx0 - 14, sy + 2, a, { align: "right", color: WHITE });
    label("m/z  →", sx1 + 14, sy + 2, a * 0.5, { weight: 500 });
    leave();
    lesson(t, L, { kicker: "MS  ·  02 / 03", title: "The quadrupole", steps: st, color: [255, 170, 225] });
  }

  /* ---------- 09 · detector & spectrum ---------- */

  function count(t) {
    const L = layout();
    backdrop(t, 0.6);
    const st = [
      [0.0, "Ions that make it through the filter strike a detector plate and knock a few electrons loose."],
      [0.3, "A chain of plates (dynodes) multiplies them. Each hit frees more electrons, so one ion becomes a measurable pulse of about a million."],
      [0.6, "Count those pulses at every m/z as the filter sweeps, and you get a mass spectrum: the molecule's weight and its fragments, a fingerprint."],
    ];
    const sw = stepWeights(t, st);
    const a = sm(win(t, 0.03, 0.12));
    const e0 = emph(sw, 0) * a;
    const e1 = emph(sw, 1) * a;
    const e2 = emph(sw, 2) * a;
    const c = cx();
    enter(L.full, 1000, 400);
    const plates = Array.from({ length: 7 }, (_, k) => [150 + k * 52, k % 2 ? 250 : 150]);
    for (let i = 0; i < 6; i += 1) {
      const s = frac(S.time * 0.8 + i / 6);
      const x = s * 140;
      glow(x, 110 + s * 30, 9, MOLS[i % 3].color, e0);
      dot(x, 110 + s * 30, 2.4, WHITE, e0);
    }
    label("ION", 10, 92, e0);
    plates.forEach(([px, py], k) => {
      c.save();
      c.translate(px, py);
      c.rotate(k % 2 ? -0.5 : 0.5);
      const ea = k === 0 ? e0 : e1;
      const g = c.createLinearGradient(-20, 0, 20, 0);
      g.addColorStop(0, rgba([120, 130, 160], ea));
      g.addColorStop(1, rgba([220, 228, 245], ea));
      c.fillStyle = g;
      c.fillRect(-22, -4, 44, 8);
      c.restore();
    });
    for (let k = 0; k < plates.length - 1; k += 1) {
      const [ax, ay] = plates[k];
      const [bx, by] = plates[k + 1];
      const n = Math.min(24, 2 << k);
      for (let j = 0; j < n; j += 1) {
        const s = frac(S.time * 1.4 + hash(k * 40 + j));
        const x = lerp(ax, bx, s) + (hash(j + k) - 0.5) * 14;
        const y = lerp(ay, by, s) + Math.sin(s * Math.PI) * (k % 2 ? 1 : -1) * 6;
        dot(x, y, 1.6, [180, 230, 255], (k === 0 ? Math.max(e0, e1) : e1) * 0.9);
      }
      label(`×${2 << k}`, (ax + bx) / 2, (ay + by) / 2 + (k % 2 ? -26 : 26), e1 * 0.7, { align: "center", weight: 500, size: 9 });
    }
    label("ELECTRON MULTIPLIER", 150, 300, e1, {});
    const [lx, ly] = plates[plates.length - 1];
    pipe([[lx + 26, ly], [520, ly]], null, a, { lw: 4, fill: false });
    const pulse = Math.pow(Math.max(0, Math.sin(S.time * 5)), 12);
    glow(530, ly, 20 + pulse * 20, [180, 230, 255], (0.3 + pulse * 0.7) * Math.max(e1, a * 0.4));
    label("PULSE", 530, ly + 30, Math.max(e1, a * 0.5), { align: "center" });
    const gx0 = 600;
    const gx1 = 985;
    const gb = 330;
    const gh = 250;
    c.strokeStyle = rgba(ICE, Math.max(e2, a * 0.4) * 0.6);
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(gx0, gb - gh);
    c.lineTo(gx0, gb);
    c.lineTo(gx1, gb);
    c.stroke();
    label("m/z  →", gx1, gb + 16, a * 0.55, { align: "right", weight: 500 });
    label("COUNTS", gx0 + 6, gb - gh - 10, a * 0.55);
    const mzx = (m) => gx0 + ((m - 90) / 380) * (gx1 - gx0);
    const scan = win(t, 0.36, 0.95);
    const cur = 90 + scan * 380;
    const bars = [];
    MOLS.forEach((m) => {
      bars.push([m.mz, 1, m.color, true, m]);
      m.frags.forEach((f, j) => bars.push([f, [0.55, 0.38, 0.24][j], m.color, false, m]));
    });
    bars.forEach(([mz, hh, col, main, m]) => {
      if (mz > cur) return;
      const grow = sm(clamp((cur - mz) / 14, 0, 1));
      const x = mzx(mz);
      const top = gb - hh * gh * 0.92 * grow;
      c.fillStyle = rgba(col, Math.max(e2, a * 0.7) * (main ? 1 : 0.7));
      c.fillRect(x - (main ? 2.5 : 1.5), top, main ? 5 : 3, gb - top);
      glow(x, top, main ? 14 : 8, col, a * 0.6 * grow);
      if (main) label(`${m.short}  ${mz.toFixed(1)}`, x, top - 14, Math.max(e2, a * 0.6) * grow, { align: "center", color: col });
    });
    if (scan > 0 && scan < 1) {
      c.fillStyle = rgba(WHITE, a * 0.5);
      c.fillRect(mzx(cur), gb - gh, 1, gh);
    }
    label("MASS SPECTRUM", gx1, gb - gh - 10, Math.max(e2, a * 0.5), { align: "right" });
    leave();
    lesson(t, L, { kicker: "MS  ·  03 / 03", title: "Counting ions", steps: st, color: [255, 170, 225] });
  }

  /* ---------- 10 · your turn ---------- */

  function msDiagram(t, a, sw) {
    const c = cx();
    const Y = 190;
    const mods = [
      { x0: 110, x1: 330, name: "ION SOURCE", verb: "01  IONIZE", col: AMBER },
      { x0: 400, x1: 700, name: "QUADRUPOLE", verb: "02  FILTER", col: [150, 215, 255] },
      { x0: 770, x1: 930, name: "DETECTOR", verb: "03  COUNT", col: [255, 150, 210] },
    ];
    pipe([[0, Y], [110, Y]], CYAN, a, { lw: 8, flow: 1, fa: 0.6 });
    label("FROM THE LC", 8, Y - 22, a * 0.7);
    c.save();
    c.globalCompositeOperation = "lighter";
    c.strokeStyle = rgba([255, 200, 240], a * 0.35);
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(330, Y);
    c.lineTo(400, Y);
    c.moveTo(700, Y);
    c.lineTo(770, Y);
    c.stroke();
    c.restore();
    mods.forEach((m, i) => {
      const e = sw ? (sw[1].on > 0.01 ? 0.45 + 0.55 * bell(frac(S.time * 0.25), i / 3, i / 3 + 0.34, 0.06) : 0.75) * a : a * 0.75;
      outline(m.x0, Y - 80, m.x1 - m.x0, 160, 14, e, m.col);
      glow((m.x0 + m.x1) / 2, Y, (m.x1 - m.x0) * 0.5, m.col, e * 0.12);
      label(m.verb, m.x0 + 14, Y - 100, e, { color: m.col });
      label(m.name, (m.x0 + m.x1) / 2, Y + 104, e, { align: "center", color: WHITE });
      if (i === 0) {
        c.fillStyle = rgba([200, 210, 230], e);
        c.beginPath();
        c.moveTo(m.x0 + 20, Y - 8);
        c.lineTo(m.x0 + 90, Y - 2);
        c.lineTo(m.x0 + 90, Y + 2);
        c.lineTo(m.x0 + 20, Y + 8);
        c.closePath();
        c.fill();
        for (let j = 0; j < 18; j += 1) {
          const sp = frac(S.time * 0.4 + hash(j));
          dot(m.x0 + 95 + sp * 120, Y + (hash(j + 7) * 2 - 1) * Math.sin(Math.PI * sp) * 50, 4 * (1 - sp) + 1.2, sp > 0.7 ? WHITE : [170, 220, 255], e * 0.8);
        }
      } else if (i === 1) {
        [-34, -18, 18, 34].forEach((dy, j) => {
          c.fillStyle = rgba([210, 220, 240], e * (j === 1 || j === 2 ? 0.55 : 1));
          rrect(m.x0 + 20, Y + dy - 6, m.x1 - m.x0 - 40, 12, 6);
          c.fill();
        });
      } else {
        for (let j = 0; j < 5; j += 1) {
          c.save();
          c.translate(m.x0 + 30 + j * 25, Y + (j % 2 ? 22 : -22));
          c.rotate(j % 2 ? -0.5 : 0.5);
          c.fillStyle = rgba([210, 220, 240], e);
          c.fillRect(-12, -3, 24, 6);
          c.restore();
        }
      }
    });
    for (let j = 0; j < 10; j += 1) {
      const sp = frac(S.time * 0.18 + j / 10);
      const x = 330 + sp * 470;
      if (x > 400 && x < 700 && j % 3) continue;
      glow(x, Y, 9, MOLS[j % 3].color, a * 0.8);
      dot(x, Y, 2.2, WHITE, a);
    }
    const vb = c.createLinearGradient(110, 0, 930, 0);
    vb.addColorStop(0, rgba(ICE, a * 0.15));
    vb.addColorStop(1, rgba([255, 120, 210], a * 0.7));
    c.fillStyle = vb;
    c.fillRect(110, 370, 820, 3);
    label("AIR PRESSURE", 110, 390, a * 0.55, { weight: 500 });
    label("HIGH VACUUM", 930, 390, a * 0.7, { align: "right", color: [255, 190, 235] });
  }

  function msOverview(t) {
    const L = layout();
    backdrop(t, 0.5);
    const st = [
      [0.0, "A mass spectrometer weighs molecules. Strictly, it measures their mass-to-charge ratio, written m/z."],
      [0.3, "It works in three stages. Turn molecules into charged ions, filter the ions by m/z, then count them."],
      [0.6, "It usually sits right after an LC, so the separated compounds arrive one at a time. Scroll to go through each stage."],
    ];
    const sw = stepWeights(t, st);
    const a = sm(win(t, 0, 0.1));
    enter(L.full, 1000, 400);
    msDiagram(t, a, sw);
    leave();
    lesson(t, L, { kicker: "MS  ·  HOW IT WORKS", title: "Mass spectrometry", steps: st, color: [255, 170, 225] });
  }

  function finale(kind) {
    const lc = kind === "lc";
    return (t) => {
      const w = S.w;
      const h = S.h;
      backdrop(t, lc ? 0 : 0.5);
      const c = cx();
      const fade = sm(win(t, 0, 0.15));
      if (lc) {
        const yaw = lerp(-0.2, 0.2, t) + S.time * 0.02;
        const tg = v(5.6, 0.75, 0.2);
        c.save();
        c.translate(0, h * 0.3);
        kit.instrument({ pos: v(tg.x + Math.sin(yaw) * 14, 4.2, tg.z + Math.cos(yaw) * 14), target: tg, fov: 40 * DEG }, { detGlow: 0.4, loop: 0.5 }, 0.22 * fade);
        c.restore();
      } else {
        enter({ x0: w * 0.1, y0: h * 0.36, x1: w * 0.9, y1: h * 0.98 }, 1000, 400);
        msDiagram(t, 0.22 * fade, null);
        leave();
      }
      const a = sm(win(t, 0.04, 0.22));
      const size = Math.min(w * 0.05, h * 0.085, 58);
      type(lc ? "NOW YOU KNOW HOW LC WORKS." : "NOW YOU KNOW HOW MS WORKS.", w / 2, h * 0.22, { size, weight: 800, alpha: a, blur: (1 - a) * 8, track: 0.005 });
      const chain = lc ? "SOLVENTS  ·  PUMP  ·  INJECT  ·  SEPARATE  ·  DETECT  ·  READ" : "IONIZE  ·  FILTER  ·  COUNT";
      whisper(chain, w / 2, h * 0.22 + size * 0.9, a * 0.6, { align: "center", track: 0.3, size: layout().wide ? 10.5 : 8.5 });
      const b = sm(win(t, 0.2, 0.42));
      if (b <= 0.01) return;
      const y = h * 0.52;
      const main = lc ? "BECOME THE SAMPLE  →" : "RIDE THE IONS  →";
      const fs = clamp(Math.min(w * 0.026, h * 0.05), 20, 32);
      const tw = kit.measure(main, fs, 800, 0.04);
      const over = hot(w / 2 - tw / 2 - 20, y - fs, tw + 40, fs * 2, () => kit.switchTrack(lc ? "ride-lc" : "ride-ms"));
      const pulse = 0.5 + 0.5 * Math.sin(S.time * 2.4);
      glow(w / 2, y, tw * 0.6, lc ? [110, 190, 255] : [255, 110, 200], b * (0.12 + pulse * 0.08 + (over ? 0.12 : 0)));
      type(main, w / 2, y, { size: fs, weight: 800, alpha: b, track: 0.04 });
      c.fillStyle = rgba(WHITE, b * 0.8);
      const ul = over ? 1 : 0.25 + pulse * 0.1;
      c.fillRect(w / 2 - (tw * ul) / 2, y + fs * 0.75, tw * ul, 1.5);
      whisper(lc ? "Same machine. This time, you ride inside it as one of the molecules." : "Same instrument. This time, you are the ion.", w / 2, y + fs * 1.6, b * 0.65, { align: "center", track: 0.06, size: 11 });
      linkRow(
        [
          lc ? ["NEXT: HOW MS WORKS  →", () => kit.switchTrack("observe-ms")] : ["HOW LC WORKS", () => kit.switchTrack("observe-lc")],
          ["↺  WATCH AGAIN", () => kit.autopilot(0, 4, true)],
          ["BACK TO THE MACHINE", () => kit.close()],
        ],
        h * 0.84,
        b
      );
    };
  }

  function edge(c, n, t) {
    const fin = c > 0 ? sm(win(t, 0, 0.045)) : 1;
    const fout = c < n - 1 ? 1 - sm(win(t, 0.955, 1)) : 1;
    const k = 1 - fin * fout;
    if (k > 0.005) bgBlack(k);
  }

  const track = (scenes) => scenes.map((fn, i) => (t, dt) => {
    fn(t, dt);
    edge(i, scenes.length, t);
  });

  RIDE.registerTrack("observe-lc", {
    kind: "lc",
    names: LC_NAMES,
    draw: track([ov, solv, pump, inject, column, detect, read, finale("lc")]),
    grab: (c) => c !== 6 && c !== 7,
  });
  RIDE.registerTrack("observe-ms", {
    kind: "ms",
    names: MS_NAMES,
    draw: track([msOverview, esi, quad, count, finale("ms")]),
    energy: () => true,
    grab: () => false,
  });

  void bell;
  void ghost;
  void flash;
})(window);
