/* Waters // How it all connects — full-screen interactive machine for new joiners.
   Motion is the navigation: hover lights a part, click isolates it, click again zooms,
   scroll travels through the story, and it ends with the joiner's own place + IRA. */

(function () {
  const root = document.getElementById("wm");
  if (!root) return;

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const TAU = Math.PI * 2;
  const DEG = Math.PI / 180;
  const C = {
    cyan: [96, 214, 255],
    blue: [96, 136, 255],
    violet: [170, 128, 255],
    ice: [218, 232, 255],
    mint: [112, 238, 208],
    amber: [255, 198, 120],
    steel: [150, 165, 196],
  };
  const AREA_COLORS = [C.cyan, C.mint, C.blue, C.violet];
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${Math.max(0, Math.min(1, a))})`;
  const lerp = (a, b, k) => a + (b - a) * k;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : 1 - Math.pow(1 - x, 3));
  const esc = (s) =>
    String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");

  const $ = (sel) => root.querySelector(sel);
  const canvas = $(".wm-canvas");
  const ctx = canvas.getContext("2d");
  const els = {
    labels: $(".wm-labels"),
    markers: $(".wm-markers"),
    panel: $(".wm-panel"),
    intro: $(".wm-intro"),
    rail: $(".wm-rail"),
    hint: $(".wm-hint"),
    finale: $(".wm-finale"),
    youWord: $(".wm-you-word"),
    youCard: $(".wm-you-float"),
    sources: $(".wm-sources"),
  };

  const ORDER = ["science", "impact", "technology", "world", "people", "you"];
  const LAYOUT = {
    science: { pos: [-2.4, 0.2, 0.35], hit: [0.5, 1.55], label: [0, 1.62, 0], zoom: [1.5, 2.15] },
    technology: { pos: [0, 1.6, -0.4], hit: [1.4, 0.72], label: [0, 0.82, 0], zoom: [1.2, 1.6] },
    impact: { pos: [2.4, 0.2, 0.3], hit: [1.15, 1.05], label: [0, 1.0, 0], zoom: [1.45, 2.05] },
    world: { pos: [1.6, -1.5, -0.9], hit: [0.78, 0.78], label: [0, 0.86, 0], zoom: [1.15, 1.15] },
    people: { pos: [-1.6, -1.5, -0.9], hit: [0.8, 0.78], label: [0, 0.86, 0], zoom: [1.15, 1.15] },
    you: { pos: [0, -1.9, 1.4], hit: [0.42, 0.42], label: [0, 0.4, 0], zoom: [1.05, 1.05] },
  };
  const HINTS = {
    overview: "Move to look around · hover a part to light it up · click to open · scroll to travel",
    active: "Click the part again to zoom · scroll or → for next · Esc to step back",
    deep: "Scroll or → for next · Esc to step back",
  };

  const fib = (n) =>
    Array.from({ length: n }, (_, i) => {
      const y = 1 - (i / (n - 1)) * 2;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const th = Math.PI * (3 - Math.sqrt(5)) * i;
      return [Math.cos(th) * r, y, Math.sin(th) * r];
    });
  const GLOBE_DOTS = fib(260);
  const NODE_DIRS = Array.from({ length: 9 }, (_, i) => {
    const a = -Math.PI / 2 + (i / 9) * TAU;
    const r = i % 2 ? 0.78 : 1.08;
    return [Math.cos(a) * r * 1.15, Math.sin(a) * r * 0.9, Math.sin(a * 3) * 0.22];
  });
  const NODE_EDGES = (() => {
    const set = new Set();
    NODE_DIRS.forEach((a, i) => {
      NODE_DIRS.map((b, j) => [j, Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])])
        .filter(([j]) => j !== i)
        .sort((p, q) => p[1] - q[1])
        .slice(0, 3)
        .forEach(([j]) => set.add(i < j ? `${i}-${j}` : `${j}-${i}`));
    });
    return [...set].map((k) => k.split("-").map(Number));
  })();

  const S = {
    data: null,
    opts: {},
    open: false,
    raf: 0,
    last: 0,
    t: 0,
    w: 1,
    h: 1,
    unit: 100,
    narrow: false,
    mx: 0,
    my: 0,
    smx: 0,
    smy: 0,
    yaw: 0,
    pitch: 0.16,
    cam: [0, 0, 0],
    zoom: 0.9,
    shift: 0,
    shiftY: 0,
    hover: null,
    active: null,
    level: 1,
    intro: true,
    finale: false,
    finaleShown: false,
    assemble: 0,
    closing: 0,
    youT: 0,
    youStage: 0,
    chamber: -1,
    site: null,
    node: null,
    area: -1,
    globeSpin: 0,
    globeTarget: null,
    wheelAcc: 0,
    wheelLock: 0,
    touchY: null,
    fx: {},
    proj: {},
    dust: [],
    iraOrb: null,
  };
  [...ORDER, "core"].forEach((id) => (S.fx[id] = { a: 0, k: 1, open: 0 }));
  for (let i = 0; i < 150; i += 1) {
    S.dust.push({
      p: [(Math.random() - 0.5) * 13, (Math.random() - 0.5) * 8, -5 + Math.random() * 8],
      v: [(Math.random() - 0.5) * 0.04, 0.02 + Math.random() * 0.05, 0],
      r: 0.4 + Math.random() * 1.3,
      tw: Math.random() * TAU,
    });
  }

  /* ---------- 3D ---------- */

  function project(p) {
    const x = p[0] - S.cam[0];
    const y = p[1] - S.cam[1];
    const z = p[2] - S.cam[2];
    const cy = Math.cos(S.yaw);
    const sy = Math.sin(S.yaw);
    const x1 = x * cy + z * sy;
    const z1 = -x * sy + z * cy;
    const cp = Math.cos(S.pitch);
    const sp = Math.sin(S.pitch);
    const y2 = y * cp - z1 * sp;
    const z2 = y * sp + z1 * cp;
    const persp = 8 / (8 - clamp(z2, -20, 6.5));
    const s = S.unit * S.zoom * persp;
    return { x: S.w / 2 + S.shift + x1 * s, y: S.h * 0.5 + S.shiftY - y2 * s, s, z: z2 };
  }

  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const mix = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
  const bez = (a, c, b, u) => mix(mix(a, c, u), mix(c, b, u), u);

  function posOf(id) {
    const k = ease(S.assemble) * (1 - ease(S.closing));
    return mix([0, 0, 0], LAYOUT[id].pos, k);
  }

  function ring(center, r, tiltX, tiltZ, spin, n = 64) {
    const pts = [];
    const ctx0 = Math.cos(tiltX);
    const stx = Math.sin(tiltX);
    const ctz = Math.cos(tiltZ);
    const stz = Math.sin(tiltZ);
    for (let i = 0; i <= n; i += 1) {
      const a = spin + (i / n) * TAU;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const y1 = -z * stx;
      const z1 = z * ctx0;
      const x2 = x * ctz - y1 * stz;
      const y2 = x * stz + y1 * ctz;
      pts.push(project([center[0] + x2, center[1] + y2, center[2] + z1]));
    }
    return pts;
  }

  function strokePts(pts, color, alpha, width, refZ, backFade = 0.3) {
    if (alpha <= 0.01) return;
    const front = new Path2D();
    const back = new Path2D();
    for (let i = 0; i < pts.length - 1; i += 1) {
      const a = pts[i];
      const b = pts[i + 1];
      const path = refZ === undefined || (a.z + b.z) / 2 >= refZ ? front : back;
      path.moveTo(a.x, a.y);
      path.lineTo(b.x, b.y);
    }
    ctx.lineWidth = width * 0.8;
    ctx.strokeStyle = rgba(color, alpha * backFade);
    ctx.stroke(back);
    ctx.lineWidth = width;
    ctx.strokeStyle = rgba(color, alpha);
    ctx.stroke(front);
  }

  function glow(x, y, r, color, a) {
    if (a <= 0.01 || r <= 0.5) return;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(color, a));
    g.addColorStop(0.35, rgba(color, a * 0.32));
    g.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }

  function dot(x, y, r, color, a) {
    if (a <= 0.01) return;
    ctx.fillStyle = rgba(color, a);
    ctx.beginPath();
    ctx.arc(x, y, Math.max(0.4, r), 0, TAU);
    ctx.fill();
  }

  function glassSphere(x, y, r, color, a) {
    if (a <= 0.01) return;
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.05, x, y, r);
    g.addColorStop(0, rgba(C.ice, 0.55 * a));
    g.addColorStop(0.35, rgba(color, 0.22 * a));
    g.addColorStop(1, rgba(color, 0.05 * a));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = rgba(C.ice, 0.35 * a);
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  /* ---------- backdrop ---------- */

  function drawBackdrop() {
    ctx.globalCompositeOperation = "source-over";
    const cx = S.w / 2 + S.shift * 0.6;
    const cy = S.h * 0.5;
    const R = Math.max(S.w, S.h);
    const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.75);
    bg.addColorStop(0, "#0d1a42");
    bg.addColorStop(0.45, "#060c22");
    bg.addColorStop(1, "#02040b");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, S.w, S.h);

    const m = Math.min(S.w, S.h);
    const ox = cx + S.smx * -14;
    const oy = cy + S.smy * -10;
    ctx.lineWidth = 1;
    [0.26, 0.4, 0.56].forEach((f, i) => {
      ctx.strokeStyle = rgba(C.ice, i === 1 ? 0.06 : 0.035);
      ctx.setLineDash(i === 2 ? [2, 7] : []);
      ctx.beginPath();
      ctx.arc(ox, oy, m * f, 0, TAU);
      ctx.stroke();
    });
    ctx.setLineDash([]);
    const tickR = m * 0.4;
    const rot = S.t * 0.02;
    for (let i = 0; i < 144; i += 1) {
      const a = rot + (i / 144) * TAU;
      const len = i % 12 === 0 ? 12 : i % 3 === 0 ? 6 : 3;
      ctx.strokeStyle = rgba(C.ice, i % 12 === 0 ? 0.12 : 0.05);
      ctx.beginPath();
      ctx.moveTo(ox + Math.cos(a) * tickR, oy + Math.sin(a) * tickR);
      ctx.lineTo(ox + Math.cos(a) * (tickR + len), oy + Math.sin(a) * (tickR + len));
      ctx.stroke();
    }
    ctx.strokeStyle = rgba(C.ice, 0.035);
    ctx.setLineDash([4, 10]);
    ctx.beginPath();
    ctx.moveTo(0, oy);
    ctx.lineTo(S.w, oy);
    ctx.moveTo(ox, 0);
    ctx.lineTo(ox, S.h);
    ctx.stroke();
    ctx.setLineDash([]);

    const base = S.h * 0.9;
    ctx.strokeStyle = rgba(C.cyan, 0.07);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    const off = (S.t * 40) % S.w;
    for (let x = 0; x <= S.w; x += 4) {
      const u = (x + off) / 90;
      const peaks =
        Math.exp(-Math.pow(((x + off) % 520) - 140, 2) / 90) * 42 +
        Math.exp(-Math.pow(((x + off) % 520) - 300, 2) / 260) * 24 +
        Math.exp(-Math.pow(((x + off) % 520) - 410, 2) / 60) * 34;
      const y = base - peaks - Math.sin(u) * 1.2;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.globalCompositeOperation = "lighter";
    for (const d of S.dust) {
      const p = project(d.p);
      if (p.z > 6) continue;
      const depth = clamp((p.z + 5) / 9, 0, 1);
      const tw = 0.6 + 0.4 * Math.sin(S.t * 1.3 + d.tw);
      dot(p.x, p.y, d.r * (0.5 + depth), C.ice, (0.08 + depth * 0.22) * tw);
    }
  }

  /* ---------- machine parts ---------- */

  function pipeCtrl(to) {
    return [to[0] * 0.45, to[1] * 0.45 + (to[1] >= 0 ? 0.55 : -0.25), to[2] * 0.45 + 0.35];
  }

  function drawPipes() {
    ORDER.forEach((id, idx) => {
      const a = Math.min(S.fx.core.a, S.fx[id].a) * (id === "you" && S.active !== "you" ? 0.35 : 1);
      if (a <= 0.02) return;
      const to = posOf(id);
      const ctrl = pipeCtrl(to);
      const pts = [];
      for (let i = 0; i <= 26; i += 1) pts.push(project(bez([0, 0, 0], ctrl, to, i / 26)));
      ctx.globalCompositeOperation = "source-over";
      ctx.lineCap = "round";
      strokePts(pts, C.ice, 0.05 * a, Math.max(4, 0.09 * pts[13].s), undefined);
      ctx.globalCompositeOperation = "lighter";
      strokePts(pts, idx % 2 ? C.violet : C.cyan, 0.26 * a, 1, undefined);
      for (let i = 0; i < 4; i += 1) {
        const u = (S.t * (0.16 + idx * 0.012) + i / 4 + idx * 0.13) % 1;
        const p = project(bez([0, 0, 0], ctrl, to, u));
        const col = idx % 2 ? C.violet : C.cyan;
        glow(p.x, p.y, 0.09 * p.s, col, 0.55 * a);
        dot(p.x, p.y, 0.018 * p.s, C.ice, 0.9 * a);
      }
    });
  }

  function drawCore() {
    const a = S.fx.core.a * ease(S.assemble * 1.6);
    if (a <= 0.01) return;
    const k = 1 - ease(S.closing) * 0.55;
    const c = project([0, 0, 0]);
    ctx.globalCompositeOperation = "lighter";
    glow(c.x, c.y, 1.3 * c.s * k, C.blue, 0.26 * a);
    glow(c.x, c.y, 0.45 * c.s * k, C.cyan, 0.65 * a * (0.85 + 0.15 * Math.sin(S.t * 1.6)));
    glassSphere(c.x, c.y, 0.2 * c.s * k, C.cyan, a);
    const rings = [
      [0.55, 1.15, 0.25, 0.45, C.cyan],
      [0.76, 0.35, 1.2, -0.32, C.violet],
      [0.98, 1.5, -0.5, 0.2, C.blue],
      [1.18, 0.9, 0.7, -0.12, C.ice],
    ];
    rings.forEach(([r, tx, tz, sp, col], i) => {
      const pts = ring([0, 0, 0], r * k, tx + Math.sin(S.t * 0.25 + i) * 0.12, tz, S.t * sp, 72);
      strokePts(pts, col, (i === 3 ? 0.2 : 0.5) * a, i === 3 ? 0.8 : 1.3, c.z);
      const bead = pts[Math.floor(((S.t * sp * 0.3 + i * 0.2) % 1 + 1) % 1 * 72)];
      glow(bead.x, bead.y, 0.08 * c.s, col, 0.8 * a);
    });
  }

  function drawColumn(P, a, k) {
    const len = 1.25 * k;
    const r = 0.17 * k;
    const top = project([P[0], P[1] + len, P[2]]);
    const bot = project([P[0], P[1] - len, P[2]]);
    const wt = r * top.s;
    const wb = r * bot.s;
    ctx.globalCompositeOperation = "source-over";
    const g = ctx.createLinearGradient(top.x - wt, 0, top.x + wt, 0);
    g.addColorStop(0, rgba(C.ice, 0.22 * a));
    g.addColorStop(0.18, rgba(C.cyan, 0.06 * a));
    g.addColorStop(0.7, rgba(C.blue, 0.05 * a));
    g.addColorStop(0.92, rgba(C.ice, 0.16 * a));
    g.addColorStop(1, rgba(C.ice, 0.05 * a));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(top.x - wt, top.y);
    ctx.lineTo(top.x + wt, top.y);
    ctx.lineTo(bot.x + wb, bot.y);
    ctx.lineTo(bot.x - wb, bot.y);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = rgba(C.ice, 0.32 * a);
    ctx.lineWidth = 1;
    ctx.stroke();

    for (let i = 0; i < 70; i += 1) {
      const u = ((i * 0.618) % 1) * 0.96 + 0.02;
      const s = ((i * 0.377) % 1) * 1.6 - 0.8;
      const x = lerp(top.x, bot.x, u) + s * lerp(wt, wb, u);
      dot(x, lerp(top.y, bot.y, u), 0.9, C.ice, 0.08 * a);
    }

    ctx.globalCompositeOperation = "lighter";
    const bands = [C.cyan, C.violet, C.mint, C.blue];
    bands.forEach((col, i) => {
      const u = (S.t * 0.06 * (1 + i * 0.32) + i * 0.27) % 1;
      const y = lerp(top.y, bot.y, u);
      const x = lerp(top.x, bot.x, u);
      const hw = lerp(wt, wb, u) * 0.92;
      const h = (0.05 + 0.13 * u) * len * top.s;
      const bg = ctx.createLinearGradient(0, y - h, 0, y + h);
      bg.addColorStop(0, rgba(col, 0));
      bg.addColorStop(0.5, rgba(col, (0.85 - u * 0.35) * a));
      bg.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = bg;
      ctx.fillRect(x - hw, y - h, hw * 2, h * 2);
      glow(x, y, hw * 2.4, col, 0.18 * a);
    });

    ctx.globalCompositeOperation = "source-over";
    [
      [top, wt, -1],
      [bot, wb, 1],
    ].forEach(([p, w, dir]) => {
      const capH = 0.16 * p.s;
      const y0 = dir < 0 ? p.y - capH : p.y;
      const mg = ctx.createLinearGradient(p.x - w * 1.35, 0, p.x + w * 1.35, 0);
      mg.addColorStop(0, rgba(C.steel, 0.35 * a));
      mg.addColorStop(0.3, rgba(C.ice, 0.75 * a));
      mg.addColorStop(0.55, rgba(C.steel, 0.5 * a));
      mg.addColorStop(1, rgba([60, 72, 100], 0.6 * a));
      ctx.fillStyle = mg;
      ctx.fillRect(p.x - w * 1.35, y0, w * 2.7, capH);
      ctx.fillStyle = rgba(C.steel, 0.5 * a);
      ctx.fillRect(p.x - w * 0.35, dir < 0 ? y0 - capH * 0.9 : y0 + capH, w * 0.7, capH * 0.9);
    });

    const dw = 0.9 * bot.s * k;
    const dx = bot.x - wb * 2.2 - dw;
    const dy = bot.y - 0.1 * bot.s;
    const dh = 0.38 * bot.s * k;
    ctx.fillStyle = rgba([10, 20, 50], 0.55 * a);
    ctx.strokeStyle = rgba(C.cyan, 0.3 * a);
    ctx.beginPath();
    ctx.roundRect(dx, dy - dh, dw, dh, 4);
    ctx.fill();
    ctx.stroke();
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = rgba(C.cyan, 0.8 * a);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let i = 0; i <= 40; i += 1) {
      const u = i / 40;
      const ph = (u + S.t * 0.08) % 1;
      const pk =
        Math.exp(-Math.pow(ph - 0.25, 2) / 0.0012) +
        0.6 * Math.exp(-Math.pow(ph - 0.55, 2) / 0.002) +
        0.8 * Math.exp(-Math.pow(ph - 0.8, 2) / 0.0008);
      const x = dx + 4 + u * (dw - 8);
      const y = dy - 5 - pk * (dh - 12);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  function drawChambers(P, a, k) {
    const open = S.fx.technology.open;
    ctx.globalCompositeOperation = "lighter";
    const l = project([P[0] - 0.28 * k, P[1], P[2]]);
    const r = project([P[0] + 0.28 * k, P[1], P[2]]);
    const lg = ctx.createLinearGradient(l.x, l.y, r.x, r.y);
    lg.addColorStop(0, rgba(C.cyan, 0.7 * a));
    lg.addColorStop(1, rgba(C.violet, 0.7 * a));
    ctx.strokeStyle = lg;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(l.x, l.y);
    ctx.lineTo(r.x, r.y);
    ctx.stroke();
    for (let i = 0; i < 3; i += 1) {
      const u = (S.t * 0.5 + i / 3) % 1;
      glow(lerp(l.x, r.x, u), lerp(l.y, r.y, u), 0.07 * l.s, u < 0.5 ? C.cyan : C.violet, 0.8 * a);
    }
    [0, 1].forEach((i) => {
      const off = (i ? 1 : -1) * (0.74 + open * 0.3) * k;
      const c = [P[0] + off, P[1], P[2]];
      const col = i ? C.violet : C.cyan;
      const focus = S.chamber === -1 || S.chamber === i ? 1 : 0.35;
      const R = (0.46 + open * 0.2 + (S.chamber === i ? 0.06 : 0)) * k;
      const pc = project(c);
      glow(pc.x, pc.y, R * pc.s * 1.1, col, 0.3 * a * focus);
      ctx.globalCompositeOperation = "source-over";
      glassSphere(pc.x, pc.y, R * 0.42 * pc.s, col, a * focus);
      ctx.globalCompositeOperation = "lighter";
      glow(pc.x, pc.y, R * 0.25 * pc.s, col, 0.8 * a * focus * (0.8 + 0.2 * Math.sin(S.t * 2 + i)));
      const dir = i ? -1 : 1;
      for (let j = 0; j < 3; j += 1) {
        const pts = ring(
          c,
          R * (1 - j * 0.17),
          S.t * (0.45 + j * 0.25) * dir + j * 1.1 + open * 0.6,
          j * 0.95 + 0.35,
          S.t * (0.7 + j * 0.3),
          56
        );
        strokePts(pts, col, (0.75 - j * 0.12) * a * focus, 1.4, pc.z, 0.28);
      }
      if (open > 0.2) {
        const steps = 3;
        for (let s = 0; s < steps; s += 1) {
          const ang = S.t * 0.6 * dir + (s / steps) * TAU;
          const bp = project([c[0] + Math.cos(ang) * R * 1.25, c[1] + Math.sin(ang) * R * 0.35, c[2] + Math.sin(ang) * R * 1.25]);
          glow(bp.x, bp.y, 0.1 * bp.s, col, open * a * focus);
          dot(bp.x, bp.y, 0.025 * bp.s, C.ice, open * a * focus);
        }
      }
    });
  }

  function drawImpact(P, a, k) {
    const hub = [P[0], P[1] + 0.42 * k, P[2]];
    const vessels = [0, 1, 2, 3].map((i) => [P[0] + (-0.95 + i * 0.63) * k, P[1] - 0.45 * k, P[2] + (i % 2 ? -0.28 : 0.22) * k]);
    const hp = project(hub);
    ctx.globalCompositeOperation = "lighter";
    glow(hp.x, hp.y, 0.35 * hp.s, C.mint, 0.5 * a);
    const left = project([vessels[0][0], hub[1], hub[2]]);
    const right = project([vessels[3][0], hub[1], hub[2]]);
    ctx.lineCap = "round";
    ctx.strokeStyle = rgba(C.ice, 0.14 * a);
    ctx.lineWidth = Math.max(3, 0.08 * hp.s);
    ctx.beginPath();
    ctx.moveTo(left.x, left.y);
    ctx.lineTo(right.x, right.y);
    ctx.stroke();
    ctx.strokeStyle = rgba(C.mint, 0.5 * a);
    ctx.lineWidth = 1;
    ctx.stroke();
    vessels.forEach((v, i) => {
      const col = AREA_COLORS[i];
      const focus = S.area === -1 || S.area === i ? 1 : 0.3;
      const joint = project([v[0], hub[1], hub[2]]);
      const neck = project([v[0], v[1] + 0.28 * k, v[2]]);
      const body = project(v);
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = rgba(col, 0.55 * a * focus);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(joint.x, joint.y);
      ctx.lineTo(neck.x, neck.y);
      ctx.stroke();
      const u = (S.t * 0.5 + i * 0.25) % 1;
      glow(lerp(joint.x, neck.x, u), lerp(joint.y, neck.y, u), 0.07 * body.s, col, 0.9 * a * focus);
      const R = 0.2 * k * body.s;
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = rgba(C.ice, 0.1 * a * focus);
      ctx.fillRect(neck.x - R * 0.28, neck.y, R * 0.56, body.y - neck.y - R * 0.8);
      ctx.save();
      ctx.beginPath();
      ctx.arc(body.x, body.y, R, 0, TAU);
      ctx.clip();
      ctx.fillStyle = rgba(C.ice, 0.06 * a * focus);
      ctx.fillRect(body.x - R, body.y - R, R * 2, R * 2);
      const level = body.y - R * 0.05;
      ctx.globalCompositeOperation = "lighter";
      const fg = ctx.createLinearGradient(0, level - R * 0.2, 0, body.y + R);
      fg.addColorStop(0, rgba(col, 0.9 * a * focus));
      fg.addColorStop(1, rgba(col, 0.35 * a * focus));
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.moveTo(body.x - R, body.y + R);
      for (let x = -R; x <= R; x += R / 8) {
        ctx.lineTo(body.x + x, level + Math.sin(x / R * 5 + S.t * 2.4 + i) * R * 0.06);
      }
      ctx.lineTo(body.x + R, body.y + R);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = rgba(C.ice, 0.4 * a * focus);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(body.x, body.y, R, 0, TAU);
      ctx.stroke();
      ctx.globalCompositeOperation = "lighter";
      glow(body.x, body.y, R * (S.area === i ? 3.2 : 2), col, 0.25 * a * focus);
    });
  }

  function drawGlobe(P, a, k) {
    const open = S.fx.world.open;
    const R = (0.58 + open * 1.0) * k;
    if (S.globeTarget !== null) {
      let d = S.globeTarget - S.globeSpin;
      d = ((d + Math.PI) % TAU + TAU) % TAU - Math.PI;
      S.globeSpin += d * 0.06;
    } else {
      S.globeSpin += reduce ? 0 : 0.0016;
    }
    const spin = S.globeSpin;
    const sph = (lat, lon) => [
      P[0] + R * Math.cos(lat) * Math.cos(lon + spin),
      P[1] + R * Math.sin(lat),
      P[2] + R * Math.cos(lat) * Math.sin(lon + spin),
    ];
    const pc = project(P);
    ctx.globalCompositeOperation = "lighter";
    glow(pc.x, pc.y, R * pc.s * 1.35, C.blue, 0.2 * a);
    for (let lat = -60; lat <= 60; lat += 30) {
      const pts = [];
      for (let i = 0; i <= 64; i += 1) pts.push(project(sph(lat * DEG, (i / 64) * TAU)));
      strokePts(pts, C.blue, 0.32 * a, 0.9, pc.z, 0.12);
    }
    for (let m = 0; m < 12; m += 1) {
      const pts = [];
      for (let i = 0; i <= 48; i += 1) pts.push(project(sph(-90 * DEG + (i / 48) * Math.PI, (m / 12) * TAU)));
      strokePts(pts, C.blue, 0.22 * a, 0.8, pc.z, 0.1);
    }
    for (const d of GLOBE_DOTS) {
      const p = project(add(P, [
        R * (d[0] * Math.cos(spin) - d[2] * Math.sin(spin)),
        R * d[1],
        R * (d[0] * Math.sin(spin) + d[2] * Math.cos(spin)),
      ]));
      if (p.z < pc.z - 0.1) continue;
      dot(p.x, p.y, 0.012 * p.s, C.ice, 0.35 * a);
    }
    strokePts(ring(P, R * 1.28, 1.2, 0.35, S.t * 0.2, 80), C.cyan, 0.3 * a, 1, pc.z, 0.15);

    const sites = S.data?.components.find((c) => c.id === "world")?.sites || [];
    const home = sites.find((s) => s.home);
    S.proj.sites = {};
    const sitePts = {};
    sites.forEach((s) => {
      const p3 = sph(s.lat * DEG, -s.lon * DEG);
      const p = project(p3);
      sitePts[s.id] = p3;
      const front = p.z >= pc.z - 0.05;
      S.proj.sites[s.id] = { x: p.x, y: p.y, front };
      const col = s.home ? C.amber : C.cyan;
      const sel = S.site === s.id;
      const pulse = 0.6 + 0.4 * Math.sin(S.t * 3 + s.lat);
      glow(p.x, p.y, (sel ? 0.3 : 0.18) * p.s * (0.8 + pulse * 0.4), col, (front ? 0.9 : 0.2) * a);
      dot(p.x, p.y, 0.03 * p.s, C.ice, (front ? 1 : 0.3) * a);
    });
    if (open > 0.3 && home) {
      sites
        .filter((s) => !s.home)
        .forEach((s, i) => {
          const a3 = sitePts[home.id];
          const b3 = sitePts[s.id];
          const mid = mix(a3, b3, 0.5);
          const lift = add(P, mix([0, 0, 0], [mid[0] - P[0], mid[1] - P[1], mid[2] - P[2]], 1.45));
          const pts = [];
          for (let j = 0; j <= 30; j += 1) pts.push(project(bez(a3, lift, b3, j / 30)));
          strokePts(pts, C.amber, 0.45 * a * open, 1.1, pc.z - 0.4, 0.2);
          const u = (S.t * 0.35 + i * 0.3) % 1;
          const q = project(bez(a3, lift, b3, u));
          glow(q.x, q.y, 0.08 * q.s, C.amber, 0.8 * a * open);
        });
    }
  }

  function drawPeople(P, a, k) {
    const open = S.fx.people.open;
    const R = (0.55 + open * 1.0) * k;
    const nodes = S.data?.components.find((c) => c.id === "people")?.nodes || [];
    const spin = Math.sin(S.t * 0.25) * lerp(0.9, 0.18, open);
    const pts3 = NODE_DIRS.map(([x, y, z]) => [
      P[0] + R * (x * Math.cos(spin) - z * Math.sin(spin)),
      P[1] + R * y,
      P[2] + R * (x * Math.sin(spin) + z * Math.cos(spin)),
    ]);
    const pts = pts3.map(project);
    const pc = project(P);
    ctx.globalCompositeOperation = "lighter";
    glow(pc.x, pc.y, R * pc.s * 1.2, C.violet, 0.14 * a);
    NODE_EDGES.forEach(([i, j], e) => {
      const hot = nodes[i]?.id === S.node || nodes[j]?.id === S.node;
      ctx.strokeStyle = rgba(hot ? C.cyan : C.ice, (hot ? 0.6 : 0.2) * a);
      ctx.lineWidth = hot ? 1.4 : 0.9;
      ctx.beginPath();
      ctx.moveTo(pts[i].x, pts[i].y);
      ctx.lineTo(pts[j].x, pts[j].y);
      ctx.stroke();
      const u = (S.t * 0.4 + e * 0.17) % 1;
      glow(lerp(pts[i].x, pts[j].x, u), lerp(pts[i].y, pts[j].y, u), 0.05 * pc.s, C.cyan, 0.6 * a);
    });
    pts.forEach((p, i) => {
      ctx.strokeStyle = rgba(C.ice, 0.08 * a);
      ctx.beginPath();
      ctx.moveTo(pc.x, pc.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    });
    glassSphere(pc.x, pc.y, 0.1 * pc.s * k, C.violet, a);
    S.proj.nodes = {};
    pts.forEach((p, i) => {
      const n = nodes[i];
      if (!n) return;
      S.proj.nodes[n.id] = { x: p.x, y: p.y, front: true };
      const col = n.yours ? C.amber : S.node === n.id ? C.cyan : C.ice;
      const size = (n.yours ? 0.09 : 0.065) * p.s * (S.node === n.id ? 1.3 : 1);
      glow(p.x, p.y, size * 3.5, col, 0.55 * a);
      dot(p.x, p.y, size * 0.55, col, a);
    });
  }

  function youPath() {
    const P = posOf("you");
    const ctrl = [P[0] + 1.2, (P[1] + 0) / 2 - 0.2, P[2] * 0.4 + 0.6];
    return (u) => bez(P, ctrl, [0, 0, 0], u);
  }

  function drawYou(P, a) {
    const p = project(P);
    const isActive = S.active === "you";
    ctx.globalCompositeOperation = "lighter";
    const born = isActive ? ease((S.youT - 1.6) / 0.9) : 1;
    const size = (isActive ? 0.13 : 0.07) * p.s * (0.6 + 0.4 * born);
    const pulse = 0.75 + 0.25 * Math.sin(S.t * 2.2);
    glow(p.x, p.y, size * 5 * pulse, C.amber, 0.45 * a * born);
    dot(p.x, p.y, size * 0.55, C.ice, a * born);
    strokePts(ring(P, isActive ? 0.28 : 0.16, 1.3, 0.2, S.t * 0.9, 40), C.amber, 0.55 * a * born, 1, p.z, 0.3);

    if (!isActive) return;
    const chain = S.data?.components.find((c) => c.id === "you")?.chain || [];
    const prog = ease((S.youT - 3.2) / 2.6);
    if (prog <= 0) return;
    const path = youPath();
    const pts = [];
    const steps = 60;
    for (let i = 0; i <= Math.round(steps * prog); i += 1) pts.push(project(path(i / steps)));
    ctx.lineCap = "round";
    strokePts(pts, C.amber, 0.25, 6, undefined);
    strokePts(pts, C.amber, 0.9, 1.6, undefined);
    const head = pts[pts.length - 1];
    if (prog < 1) glow(head.x, head.y, 0.25 * head.s, C.amber, 0.9);
    ctx.font = "600 11px 'IBM Plex Mono', monospace";
    ctx.textBaseline = "middle";
    const n = chain.length;
    chain
      .slice()
      .reverse()
      .forEach((c, i) => {
        const u = i / (n - 1);
        if (prog < u - 0.001) return;
        const q = project(path(u));
        glow(q.x, q.y, 0.18 * q.s, i === 0 ? C.amber : C.cyan, 0.8);
        dot(q.x, q.y, 3, C.ice, 1);
        if (i === 0 || i === n - 1 || S.narrow) return;
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = rgba(C.ice, 0.85);
        ctx.fillText(c.name.toUpperCase(), q.x + 14, q.y);
        ctx.fillStyle = rgba(C.amber, 0.7);
        ctx.fillText(c.level.toUpperCase(), q.x + 14, q.y - 14);
        ctx.globalCompositeOperation = "lighter";
      });
  }

  const DRAW = {
    science: (P, a, k) => drawColumn(P, a, k),
    technology: (P, a, k) => drawChambers(P, a, k),
    impact: (P, a, k) => drawImpact(P, a, k),
    world: (P, a, k) => drawGlobe(P, a, k),
    people: (P, a, k) => drawPeople(P, a, k),
    you: (P, a) => drawYou(P, a),
  };

  /* ---------- frame ---------- */

  function targets() {
    const active = S.active;
    const youLit = active === "you" && S.youT > 5.4;
    ORDER.forEach((id) => {
      const fx = S.fx[id];
      let a;
      if (S.finale) a = 1 - ease(S.closing * 1.2);
      else if (active) a = id === active ? 1 : active === "you" ? (youLit ? 0.22 : 0.04) : 0.15;
      else if (S.hover) a = id === S.hover ? 1 : 0.26;
      else a = id === "you" ? 0.6 : 0.92;
      fx.ta = a * ease(S.assemble * 1.3 - ORDER.indexOf(id) * 0.08);
      fx.tk = id === active || id === S.hover ? 1.08 : 1;
      fx.topen = id === active ? (id === "technology" ? (S.level > 1 || S.chamber >= 0 ? 1 : 0.35) : 1) : 0;
    });
    const core = S.fx.core;
    core.ta = S.finale
      ? 1 - ease(S.closing) * 0.85
      : active === "you"
        ? youLit
          ? 0.75
          : 0.06
        : active
          ? 0.22
          : S.hover
            ? 0.4
            : 1;
  }

  function cameraTargets() {
    const active = S.active;
    let cam = [0, 0, 0];
    let zoom = S.narrow ? 0.78 : 1;
    let shift = 0;
    if (active) {
      const L = LAYOUT[active];
      cam = L.pos.slice();
      zoom = L.zoom[S.level > 1 ? 1 : 0] * (S.narrow ? 0.72 : 1);
      if (active === "you") {
        cam = [0.35, -1.0, 0.7];
        zoom = S.youT > 3 ? 1.05 : 1.5;
        if (S.narrow) zoom *= 0.95;
      }
      if (active === "science") cam = [cam[0] + 0.35, cam[1], cam[2]];
      if (!S.narrow) shift = -S.w * 0.19;
    }
    if (S.finale) zoom = (S.narrow ? 0.78 : 1) * (1 - ease(S.closing) * 0.25);
    const shiftY = S.narrow && !S.finale ? -S.h * (active ? 0.27 : S.intro ? 0.16 : 0) : 0;
    return { cam, zoom, shift, shiftY };
  }

  function frame(time) {
    if (!S.open) return;
    const dt = S.last ? Math.min(0.05, (time - S.last) / 1000) : 0.016;
    S.last = time;
    const speed = reduce ? 0.25 : 1;
    S.t += dt * speed;
    S.assemble = Math.min(1, S.assemble + dt / (reduce ? 0.2 : 2.4));
    S.closing = clamp(S.closing + (S.finale ? dt / 1.4 : -dt / 0.8), 0, 1);
    if (S.active === "you") S.youT += dt;
    S.smx = lerp(S.smx, S.mx, Math.min(1, dt * 3));
    S.smy = lerp(S.smy, S.my, Math.min(1, dt * 3));

    targets();
    const k6 = Math.min(1, dt * 5);
    [...ORDER, "core"].forEach((id) => {
      const fx = S.fx[id];
      fx.a = lerp(fx.a, fx.ta ?? 0, k6);
      fx.k = lerp(fx.k, fx.tk ?? 1, k6);
      fx.open = lerp(fx.open, fx.topen ?? 0, Math.min(1, dt * 2.4));
    });
    const ct = cameraTargets();
    const kc = Math.min(1, dt * 2.2);
    S.cam = mix(S.cam, ct.cam, kc);
    S.zoom = lerp(S.zoom, ct.zoom * (1 + Math.sin(S.t * 0.7) * 0.01), kc);
    S.shift = lerp(S.shift, ct.shift, kc);
    S.shiftY = lerp(S.shiftY, ct.shiftY, kc);
    const idleYaw = S.active ? 0 : Math.sin(S.t * 0.11) * 0.3;
    S.yaw = lerp(S.yaw, idleYaw + S.smx * (S.active ? 0.14 : 0.38), kc);
    S.pitch = lerp(S.pitch, 0.16 + S.smy * (S.active ? 0.06 : 0.16), kc);

    for (const d of S.dust) {
      d.p[0] += d.v[0] * dt * speed;
      d.p[1] += d.v[1] * dt * speed;
      if (d.p[1] > 4) d.p[1] = -4;
    }

    ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
    drawBackdrop();
    drawPipes();
    const order = ORDER.map((id) => ({ id, P: posOf(id) }))
      .map((o) => ({ ...o, z: project(o.P).z }))
      .sort((p, q) => p.z - q.z);
    let coreDrawn = false;
    for (const o of order) {
      if (!coreDrawn && o.z > project([0, 0, 0]).z) {
        drawCore();
        coreDrawn = true;
      }
      const fx = S.fx[o.id];
      S.proj[o.id] = project(o.P);
      if (fx.a > 0.01) DRAW[o.id](o.P, fx.a, fx.k);
    }
    if (!coreDrawn) drawCore();
    ctx.globalCompositeOperation = "source-over";

    syncDom();
    if (S.finale && S.closing > 0.85 && !S.finaleShown) showFinale();
    S.raf = requestAnimationFrame(frame);
  }

  /* ---------- DOM overlays ---------- */

  function comp(id) {
    return S.data?.components.find((c) => c.id === id);
  }

  function buildLabels() {
    els.labels.innerHTML = ORDER.map((id) => {
      const c = comp(id);
      return `<button type="button" class="wm-label" data-part="${id}"><span class="wm-label-idx">${c.index}</span><span class="wm-label-name">${esc(c.label)}</span></button>`;
    }).join("");
    els.labels.querySelectorAll(".wm-label").forEach((b) => {
      b.addEventListener("mouseenter", () => (S.hover = b.dataset.part));
      b.addEventListener("mouseleave", () => (S.hover = null));
      b.addEventListener("focus", () => (S.hover = b.dataset.part));
      b.addEventListener("blur", () => (S.hover = null));
      b.addEventListener("click", () => select(b.dataset.part));
    });
    els.rail.innerHTML =
      ORDER.map((id, i) => {
        const c = comp(id);
        return `<button type="button" class="wm-rail-btn" data-step="${i}" title="${esc(c.label)}"><span>${c.index}</span><em>${esc(c.label)}</em></button>`;
      }).join("") +
      `<button type="button" class="wm-rail-btn wm-rail-ira" data-step="6" title="IRA"><span>IRA</span><em>What's next</em></button>`;
    els.rail.querySelectorAll(".wm-rail-btn").forEach((b) =>
      b.addEventListener("click", () => goStep(Number(b.dataset.step)))
    );
    els.sources.querySelector(".wm-sources-list").innerHTML = S.data.sources
      .map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label)}</a></li>`)
      .join("");
  }

  function syncDom() {
    const showLabels = !S.intro && !S.active && !S.finale && S.assemble > 0.7;
    els.labels.classList.toggle("is-show", showLabels);
    els.labels.querySelectorAll(".wm-label").forEach((b) => {
      const id = b.dataset.part;
      const p = S.proj[id];
      if (!p) return;
      const L = LAYOUT[id].label;
      const q = project(add(posOf(id), L));
      b.style.transform = `translate(${Math.round(q.x)}px, ${Math.round(q.y)}px) translate(-50%, -100%)`;
      b.classList.toggle("is-hover", S.hover === id);
      b.classList.toggle("is-dim", !!S.hover && S.hover !== id);
    });

    const markers = [];
    if (S.active === "world" && S.fx.world.open > 0.6) {
      (comp("world")?.sites || []).forEach((s) => {
        const p = S.proj.sites?.[s.id];
        if (p) markers.push({ key: `site-${s.id}`, id: s.id, kind: "site", x: p.x, y: p.y, front: p.front, text: s.name, home: s.home });
      });
    }
    if (S.active === "people" && S.fx.people.open > 0.6) {
      (comp("people")?.nodes || []).forEach((n) => {
        const p = S.proj.nodes?.[n.id];
        if (p) markers.push({ key: `node-${n.id}`, id: n.id, kind: "node", x: p.x, y: p.y, front: true, text: n.name, home: n.yours });
      });
    }
    const want = markers.map((m) => m.key).join("|");
    if (els.markers.dataset.keys !== want) {
      els.markers.dataset.keys = want;
      els.markers.innerHTML = markers
        .map(
          (m) =>
            `<button type="button" class="wm-marker${m.home ? " is-home" : ""}" data-kind="${m.kind}" data-id="${m.id}"><i></i>${esc(m.text)}</button>`
        )
        .join("");
      els.markers.querySelectorAll(".wm-marker").forEach((b) => {
        b.addEventListener("click", () => (b.dataset.kind === "site" ? pickSite(b.dataset.id) : pickNode(b.dataset.id)));
        if (b.dataset.kind === "node") {
          b.addEventListener("mouseenter", () => pickNode(b.dataset.id, true));
        }
      });
    }
    markers.forEach((m, i) => {
      const b = els.markers.querySelector(`[data-kind="${m.kind}"][data-id="${m.id}"]`);
      if (!b) return;
      const crowded = markers
        .slice(0, i)
        .some((o) => o.front && m.front && Math.abs(o.y - m.y) < 26 && Math.abs(o.x - m.x) < 130);
      b.classList.toggle("is-left", crowded);
      b.style.transform = `translate(${Math.round(m.x)}px, ${Math.round(m.y)}px)${crowded ? " translateX(calc(-100% + 12px))" : ""}`;
      b.classList.toggle("is-back", !m.front);
      b.classList.toggle("is-on", S.site === m.id || S.node === m.id);
    });

    if (S.active === "you") {
      const stage = S.youT > 3.2 ? 4 : S.youT > 2.5 ? 3 : S.youT > 1.6 ? 2 : S.youT > 0.6 ? 1 : 0;
      if (stage !== S.youStage) {
        S.youStage = stage;
        root.dataset.you = String(stage);
        if (stage === 4) els.panel.classList.add("is-show");
      }
      const p = S.proj.you;
      if (p) els.youCard.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px)`;
      const prog = ease((S.youT - 3.2) / 2.6);
      const items = els.panel.querySelectorAll(".wm-chain li");
      const n = items.length;
      items.forEach((li, i) => li.classList.toggle("is-lit", prog >= (n - 1 - i) / (n - 1) - 0.001));
    } else if (root.dataset.you) {
      delete root.dataset.you;
      S.youStage = 0;
    }
  }

  /* ---------- panels ---------- */

  function kicker(c) {
    return `<p class="wm-kicker"><span>${c.index}</span>${esc(c.label)}</p>`;
  }

  function navFooter(id) {
    const i = ORDER.indexOf(id);
    const prev = i > 0 ? comp(ORDER[i - 1]).label : "Overview";
    const next = i < ORDER.length - 1 ? comp(ORDER[i + 1]).label : "What's next with IRA";
    return `<footer class="wm-panel-nav">
      <button type="button" class="wm-nav-btn" data-nav="-1">← ${esc(prev)}</button>
      <button type="button" class="wm-nav-btn primary" data-nav="1">${esc(next)} →</button>
    </footer>`;
  }

  const PANELS = {
    science(c) {
      const divs = S.data.company.divisions;
      return `${kicker(c)}<h2>${esc(c.title)}</h2>
        <p class="wm-lead">${esc(c.lead)}</p>
        <p class="wm-plain"><span>In plain words</span>${esc(c.simple)}</p>
        <h3>Explore</h3>
        <div class="wm-explore">${c.explore
          .map(
            (x, i) => `<div class="wm-x-wrap"><button type="button" class="wm-x" data-x="${i}">
              <strong>${esc(x.name)}</strong><span>${esc(x.simple)}</span><em aria-hidden="true">${x.goto ? "→" : "+"}</em></button>
              ${x.deeper ? `<div class="wm-deeper" hidden><span>The technical version</span>${esc(x.deeper)}</div>` : ""}</div>`
          )
          .join("")}</div>
        <h3>Four divisions <small>since Feb 2026</small></h3>
        <ul class="wm-divs">${divs.map((d) => `<li><strong>${esc(d.name)}</strong><span>${esc(d.what)}</span></li>`).join("")}</ul>`;
    },
    impact(c) {
      return `${kicker(c)}<h2>${esc(c.title)}</h2>
        <p class="wm-lead">${esc(c.lead)}</p>
        <ul class="wm-areas">${c.areas
          .map(
            (a, i) => `<li data-area="${i}" tabindex="0"><i style="--c:${rgba(AREA_COLORS[i], 1)}"></i>
              <div><strong>${esc(a.name)}</strong><span>${esc(a.what)}</span></div></li>`
          )
          .join("")}</ul>
        <p class="wm-plain"><span>The point</span>Not just measuring things — helping scientists make better decisions.</p>`;
    },
    technology(c) {
      return `${kicker(c)}<h2>${esc(c.title)}</h2>
        <p class="wm-lead">${esc(c.lead)}</p>
        <div class="wm-chambers">${c.chambers
          .map(
            (ch, i) => `<article class="wm-chamber${S.chamber === i ? " is-on" : ""}" data-ch="${i}" tabindex="0">
              <header><span class="wm-ch-tag">${esc(ch.short)}</span><strong>${esc(ch.name)}</strong></header>
              <ol class="wm-steps">${ch.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>
              <p>${esc(ch.simple)}</p>
              <button type="button" class="wm-deep-btn" aria-expanded="false">Explain deeper</button>
              <div class="wm-deeper" hidden><span>The technical version</span>${esc(ch.deeper)}</div>
            </article>`
          )
          .join("")}</div>
        <p class="wm-plain"><span>Together</span>Think of it as separating and identifying what's inside a sample.</p>`;
    },
    world(c) {
      const site = c.sites.find((s) => s.id === S.site);
      return `${kicker(c)}<h2>${esc(c.title)}</h2>
        <div class="wm-stat"><strong>≈&nbsp;${esc(S.data.company.colleagues.replace("~", ""))}</strong><span>colleagues worldwide</span></div>
        <p class="wm-lead">${esc(c.lead)}</p>
        <h3>Explore locations</h3>
        <div class="wm-sites">${c.sites
          .map(
            (s) => `<button type="button" class="wm-site${s.id === S.site ? " is-on" : ""}${s.home ? " is-home" : ""}" data-site="${s.id}">
              <strong>${esc(s.name)}</strong><span>${esc(s.country)}${s.home ? " · your site" : ""}</span></button>`
          )
          .join("")}</div>
        ${
          site
            ? `<div class="wm-site-detail"><p class="wm-site-name">${esc(site.name)} <small>${esc(site.country)}</small></p>
              ${site.home ? `<p class="wm-site-you">Your location within the Waters ecosystem.</p>` : ""}
              <p>${esc(site.what)}</p>
              ${site.layers ? `<div class="wm-flow">${site.layers.map((l) => `<span>${esc(l)}</span>`).join("<i>→</i>")}</div>` : ""}</div>`
            : `<p class="wm-muted">Pick a location — on the globe or here.</p>`
        }`;
    },
    people(c) {
      const node = c.nodes.find((n) => n.id === S.node);
      return `${kicker(c)}<h2>${esc(c.title)}</h2>
        <p class="wm-lead">${esc(c.lead)}</p>
        <div class="wm-nodes">${c.nodes
          .map(
            (n) => `<button type="button" class="wm-node${n.yours ? " is-yours" : ""}${n.id === S.node ? " is-on" : ""}" data-node="${n.id}">
              ${esc(n.name)}${n.yours ? "<small>you plug in here</small>" : ""}</button>`
          )
          .join("")}</div>
        <p class="wm-node-what">${node ? `<strong>${esc(node.name)}</strong> ${esc(node.what)}` : "Hover a node to see what that group does."}</p>
        <p class="wm-plain"><span>Why it matters</span>Most people start by asking “okay… but what does everyone actually do?” — this is the map.</p>`;
    },
    you(c) {
      return `${kicker(c)}<h2>${esc(c.title)}</h2>
        <div class="wm-you-card"><strong>${esc(c.name)}</strong><span>${esc(c.role_title)}</span><span class="wm-muted">${esc(c.team)} · ${esc(c.department)}</span></div>
        <ol class="wm-chain">${c.chain
          .map((l) => `<li><small>${esc(l.level)}</small><strong>${esc(l.name)}</strong></li>`)
          .join("")}</ol>
        <dl class="wm-you-meta"><div><dt>Manager</dt><dd>${esc(c.manager)}</dd></div><div><dt>Mentor</dt><dd>${esc(c.mentor)}</dd></div><div><dt>Site</dt><dd>${esc(c.site)}</dd></div></dl>
        <p class="wm-note">${esc(c.note)}</p>`;
    },
  };

  function renderPanel() {
    const id = S.active;
    if (!id) {
      els.panel.classList.remove("is-show");
      return;
    }
    const c = comp(id);
    els.panel.dataset.part = id;
    els.panel.innerHTML = `<div class="wm-panel-body">${PANELS[id](c)}</div>${navFooter(id)}`;
    els.panel.classList.toggle("is-show", id !== "you" || S.youStage >= 4);
    if (id === "you") {
      els.youCard.innerHTML = `<strong>${esc(c.name)}</strong><span class="l2">${esc(c.role_title)}</span><span class="l2 dim">${esc(c.team)} · ${esc(c.department)}</span>`;
    }
    wirePanel(id);
  }

  function wirePanel(id) {
    const P = els.panel;
    P.querySelectorAll("[data-nav]").forEach((b) =>
      b.addEventListener("click", () => goStep(ORDER.indexOf(S.active) + Number(b.dataset.nav)))
    );
    if (id === "science") {
      const c = comp("science");
      P.querySelectorAll(".wm-x").forEach((b) =>
        b.addEventListener("click", () => {
          const x = c.explore[Number(b.dataset.x)];
          if (x.goto) {
            goStep(ORDER.indexOf(x.goto));
            S.chamber = x.name.startsWith("Mass") ? 1 : 0;
            renderPanel();
            return;
          }
          const d = b.parentElement.querySelector(".wm-deeper");
          if (d) {
            d.hidden = !d.hidden;
            b.classList.toggle("is-open", !d.hidden);
          }
        })
      );
    }
    if (id === "impact") {
      P.querySelectorAll("[data-area]").forEach((li) => {
        const on = () => (S.area = Number(li.dataset.area));
        li.addEventListener("mouseenter", on);
        li.addEventListener("focus", on);
        li.addEventListener("mouseleave", () => (S.area = -1));
      });
    }
    if (id === "technology") {
      P.querySelectorAll(".wm-chamber").forEach((card) => {
        const on = () => {
          S.chamber = Number(card.dataset.ch);
          P.querySelectorAll(".wm-chamber").forEach((c) => c.classList.toggle("is-on", c === card));
        };
        card.addEventListener("mouseenter", on);
        card.addEventListener("focus", on);
        card.addEventListener("click", on);
        card.querySelector(".wm-deep-btn").addEventListener("click", (e) => {
          e.stopPropagation();
          const d = card.querySelector(".wm-deeper");
          d.hidden = !d.hidden;
          e.currentTarget.textContent = d.hidden ? "Explain deeper" : "Keep it simple";
          e.currentTarget.setAttribute("aria-expanded", String(!d.hidden));
          on();
        });
      });
    }
    if (id === "world") {
      P.querySelectorAll("[data-site]").forEach((b) => b.addEventListener("click", () => pickSite(b.dataset.site)));
    }
    if (id === "people") {
      P.querySelectorAll("[data-node]").forEach((b) => {
        b.addEventListener("mouseenter", () => pickNode(b.dataset.node, true));
        b.addEventListener("click", () => pickNode(b.dataset.node));
      });
    }
  }

  function pickSite(id) {
    const s = comp("world").sites.find((x) => x.id === id);
    if (!s) return;
    S.site = id;
    S.globeTarget = Math.PI / 2 + s.lon * DEG + S.yaw;
    renderPanel();
  }

  function pickNode(id, soft) {
    if (S.node === id && soft) return;
    S.node = id;
    const what = els.panel.querySelector(".wm-node-what");
    const n = comp("people").nodes.find((x) => x.id === id);
    if (what && n) what.innerHTML = `<strong>${esc(n.name)}</strong> ${esc(n.what)}`;
    els.panel.querySelectorAll(".wm-node").forEach((b) => b.classList.toggle("is-on", b.dataset.node === id));
  }

  /* ---------- navigation ---------- */

  function setHint() {
    const key = S.active ? (["world", "people", "you"].includes(S.active) || S.level > 1 ? "deep" : "active") : "overview";
    els.hint.textContent = S.finale ? "" : HINTS[key];
    root.classList.toggle("is-active", !!S.active);
    root.classList.toggle("is-finale", S.finale);
    els.rail.querySelectorAll(".wm-rail-btn").forEach((b) => {
      const i = Number(b.dataset.step);
      b.classList.toggle("is-on", S.finale ? i === 6 : ORDER[i] === S.active);
    });
  }

  function hideIntro() {
    if (!S.intro) return;
    S.intro = false;
    els.intro.classList.add("is-gone");
  }

  function select(id) {
    hideIntro();
    if (S.finale) leaveFinale();
    if (S.active === id) {
      if (["science", "impact", "technology"].includes(id)) {
        S.level = S.level > 1 ? 1 : 2;
        if (id === "technology" && S.level > 1 && S.chamber < 0) S.chamber = 0;
        renderPanel();
      }
    } else {
      S.active = id;
      S.level = 1;
      S.chamber = -1;
      S.site = null;
      S.node = null;
      S.area = -1;
      S.globeTarget = null;
      S.youT = 0;
      S.youStage = 0;
      delete root.dataset.you;
      renderPanel();
    }
    S.hover = null;
    setHint();
  }

  function overview() {
    if (S.finale) leaveFinale();
    S.active = null;
    S.level = 1;
    S.globeTarget = null;
    renderPanel();
    setHint();
  }

  function goStep(i) {
    hideIntro();
    if (i < 0) return overview();
    if (i >= ORDER.length) return enterFinale();
    select(ORDER[i]);
  }

  function step(dir) {
    if (S.finale) {
      if (dir < 0) goStep(ORDER.length - 1);
      return;
    }
    const i = S.active ? ORDER.indexOf(S.active) : -1;
    goStep(i + dir);
  }

  function enterFinale() {
    S.active = null;
    S.finale = true;
    S.finaleShown = false;
    renderPanel();
    setHint();
  }

  function showFinale() {
    S.finaleShown = true;
    els.finale.hidden = false;
    requestAnimationFrame(() => els.finale.classList.add("is-show"));
    const orb = els.finale.querySelector(".wm-ira-orb");
    if (!S.iraOrb && window.iraGlobe?.create && orb) {
      S.iraOrb = window.iraGlobe.create(orb, {
        palette: "light",
        count: 220,
        idle: 0.9,
        peak: 1,
        radius: 0.38,
        centerY: 0.5,
        minScale: 0.6,
        spin: 0.3,
      });
    }
    S.iraOrb?.start();
    S.iraOrb?.setThinking(true);
    setTimeout(() => S.iraOrb?.setThinking(false), 1200);
  }

  function leaveFinale() {
    S.finale = false;
    S.finaleShown = false;
    els.finale.classList.remove("is-show");
    els.finale.hidden = true;
  }

  function buildFinale() {
    const ira = S.data.ira;
    const [first, ...rest] = ira.line.split(/(?<=\.)\s+/);
    els.finale.querySelector(".wm-ira-line").textContent = first;
    els.finale.querySelector(".wm-ira-sub").textContent = rest.join(" ");
    const box = els.finale.querySelector(".wm-ira-actions");
    box.innerHTML = ira.actions
      .map((a, i) => `<button type="button" class="${i === 0 ? "wm-cta primary" : "wm-cta"}" data-i="${i}">${esc(a.label)}</button>`)
      .join("");
    box.querySelectorAll("button").forEach((b) =>
      b.addEventListener("click", () => {
        const a = ira.actions[Number(b.dataset.i)];
        close();
        if (a.ask) S.opts.onAsk?.(a.ask);
        else if (a.goto) S.opts.onGoto?.(a.goto);
      })
    );
  }

  /* ---------- input ---------- */

  function onMove(e) {
    const r = canvas.getBoundingClientRect();
    S.mx = ((e.clientX - r.left) / r.width) * 2 - 1;
    S.my = ((e.clientY - r.top) / r.height) * 2 - 1;
    if (S.intro || S.finale) return;
    const hit = hitTest(e.clientX - r.left, e.clientY - r.top);
    if (!S.active) S.hover = hit;
    canvas.style.cursor = hit ? "pointer" : "default";
  }

  function hitTest(x, y) {
    if (S.assemble < 0.8) return null;
    let best = null;
    let bd = 1;
    ORDER.forEach((id) => {
      const p = S.proj[id];
      if (!p || S.fx[id].a < 0.05) return;
      const [hx, hy] = LAYOUT[id].hit;
      const grow = id === "world" || id === "people" ? 1 + S.fx[id].open * 1.7 : 1;
      const dx = (x - p.x) / (hx * p.s * grow);
      const dy = (y - p.y) / (hy * p.s * grow);
      const d = dx * dx + dy * dy;
      if (d < bd) {
        bd = d;
        best = id;
      }
    });
    return best;
  }

  function onClick(e) {
    const r = canvas.getBoundingClientRect();
    const hit = hitTest(e.clientX - r.left, e.clientY - r.top);
    if (S.intro) {
      hideIntro();
      if (hit) select(hit);
      return;
    }
    if (S.finale) return;
    if (hit) select(hit);
    else if (S.active) overview();
  }

  function onWheel(e) {
    const inPanel = e.target.closest(".wm-panel, .wm-sources");
    if (inPanel && inPanel.scrollHeight > inPanel.clientHeight + 2) return;
    e.preventDefault();
    const now = performance.now();
    S.wheelAcc += e.deltaY;
    if (now < S.wheelLock) return;
    if (Math.abs(S.wheelAcc) > 40) {
      step(S.wheelAcc > 0 ? 1 : -1);
      S.wheelAcc = 0;
      S.wheelLock = now + 900;
    }
  }

  function onKey(e) {
    if (!S.open) return;
    if (e.key === "Escape") {
      e.preventDefault();
      if (!els.sources.hidden) els.sources.hidden = true;
      else if (S.finale) goStep(ORDER.length - 1);
      else if (S.active) overview();
      else close();
    } else if (["ArrowRight", "ArrowDown", "PageDown"].includes(e.key) && !e.target.closest("input, textarea")) {
      e.preventDefault();
      step(1);
    } else if (["ArrowLeft", "ArrowUp", "PageUp"].includes(e.key) && !e.target.closest("input, textarea")) {
      e.preventDefault();
      step(-1);
    }
  }

  function resize() {
    const r = root.getBoundingClientRect();
    S.dpr = Math.min(window.devicePixelRatio || 1, 2);
    S.w = Math.max(1, r.width);
    S.h = Math.max(1, r.height);
    S.narrow = S.w < 900;
    S.unit = Math.min(S.w, S.h) * (S.narrow ? 0.12 : 0.15);
    canvas.width = Math.round(S.w * S.dpr);
    canvas.height = Math.round(S.h * S.dpr);
  }

  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerleave", () => {
    S.hover = null;
    S.mx = 0;
    S.my = 0;
  });
  canvas.addEventListener("click", onClick);
  root.addEventListener("wheel", onWheel, { passive: false });
  root.addEventListener("touchstart", (e) => (S.touchY = e.touches[0]?.clientY ?? null), { passive: true });
  root.addEventListener(
    "touchend",
    (e) => {
      if (S.touchY === null || e.target.closest(".wm-panel")) return;
      const dy = S.touchY - (e.changedTouches[0]?.clientY ?? S.touchY);
      if (Math.abs(dy) > 50) step(dy > 0 ? 1 : -1);
      S.touchY = null;
    },
    { passive: true }
  );
  document.addEventListener("keydown", onKey);
  window.addEventListener("resize", () => S.open && resize());
  $(".wm-close").addEventListener("click", () => close());
  $(".wm-begin").addEventListener("click", () => goStep(0));
  $(".wm-free").addEventListener("click", () => {
    hideIntro();
    setHint();
  });
  $(".wm-replay").addEventListener("click", () => {
    leaveFinale();
    S.assemble = 0;
    goStep(0);
  });
  $(".wm-src-btn").addEventListener("click", () => (els.sources.hidden = !els.sources.hidden));
  els.sources.querySelector(".wm-sources-close").addEventListener("click", () => (els.sources.hidden = true));

  /* ---------- open / close ---------- */

  async function open(opts = {}) {
    S.opts = opts;
    if (S.open) return;
    root.hidden = false;
    document.body.classList.add("wm-lock");
    S.open = true;
    S.intro = true;
    S.finale = false;
    S.active = null;
    S.hover = null;
    S.assemble = 0;
    S.closing = 0;
    S.last = 0;
    els.intro.classList.remove("is-gone");
    leaveFinale();
    renderPanel();
    resize();
    requestAnimationFrame(() => root.classList.add("is-open"));
    if (!S.data) {
      try {
        const res = await fetch(`/api/employee/${encodeURIComponent(opts.employeeId)}/waters`);
        if (!res.ok) throw new Error(`${res.status}`);
        S.data = await res.json();
      } catch (err) {
        els.intro.querySelector(".wm-intro-sub").textContent = `Couldn't load the Waters story (${err.message}).`;
        return;
      }
    }
    buildLabels();
    buildFinale();
    setHint();
    cancelAnimationFrame(S.raf);
    S.raf = requestAnimationFrame(frame);
    $(".wm-begin").focus({ preventScroll: true });
  }

  function close() {
    if (!S.open) return;
    S.open = false;
    cancelAnimationFrame(S.raf);
    root.classList.remove("is-open");
    document.body.classList.remove("wm-lock");
    els.sources.hidden = true;
    setTimeout(() => {
      if (!S.open) root.hidden = true;
    }, 450);
    S.opts.onClose?.();
  }

  window.watersMachine = { open, close };
})();
