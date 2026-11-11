/* Waters // How it all connects — full-screen interactive machine for new joiners.
   Motion is the navigation: hover lights a part, click isolates it, click again zooms,
   scroll travels through the story, and it ends with the joiner's own place + IRA. */

(function () {
  const root = document.getElementById("wm");
  if (!root) return;

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const TAU = Math.PI * 2;
  const DEG = Math.PI / 180;
  const THEME_KEY = "wm-theme-brand";
  const PALETTE = {
    night: {
      cyan: [96, 214, 255],
      blue: [96, 136, 255],
      violet: [170, 128, 255],
      ice: [218, 232, 255],
      mint: [112, 238, 208],
      amber: [255, 198, 120],
      steel: [150, 165, 196],
    },
    /* Sampled from Waters corporate brand art: #0077BB white→blue field */
    brand: {
      cyan: [0, 119, 187],
      blue: [0, 140, 205],
      violet: [56, 150, 205],
      ice: [210, 232, 245],
      mint: [90, 175, 215],
      amber: [0, 100, 160],
      steel: [130, 170, 200],
    },
  };
  const C = {
    cyan: PALETTE.night.cyan.slice(),
    blue: PALETTE.night.blue.slice(),
    violet: PALETTE.night.violet.slice(),
    ice: PALETTE.night.ice.slice(),
    mint: PALETTE.night.mint.slice(),
    amber: PALETTE.night.amber.slice(),
    steel: PALETTE.night.steel.slice(),
  };
  const AREA_COLORS = [C.cyan, C.mint, C.blue, C.violet];
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${Math.max(0, Math.min(1, a))})`;
  function applyPalette(brand) {
    const src = brand ? PALETTE.brand : PALETTE.night;
    Object.keys(src).forEach((k) => {
      C[k][0] = src[k][0];
      C[k][1] = src[k][1];
      C[k][2] = src[k][2];
    });
  }
  function readBrandPref() {
    try {
      return localStorage.getItem(THEME_KEY) === "1";
    } catch {
      return false;
    }
  }
  function writeBrandPref(on) {
    try {
      localStorage.setItem(THEME_KEY, on ? "1" : "0");
    } catch {
      /* ignore quota / private mode */
    }
  }
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
    universe: "Drag or ← → to turn the worlds · Enter to step inside · scroll or ↓ for the next chapter",
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
    division: 0,
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
    brand: false,
    hud: 1,
    opening: false,
    px: -9999,
    py: -9999,
    uni: null,
    uniK: 0,
    uniText: false,
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
    const hud = S.hud;
    if (S.brand && !S.opening) {
      const bg = ctx.createLinearGradient(0, 0, S.w, 0);
      bg.addColorStop(0, "#ffffff");
      bg.addColorStop(0.42, "#b7d9ee");
      bg.addColorStop(1, "#0077bb");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, S.w, S.h);
      const veil = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.7);
      veil.addColorStop(0, "rgba(255,255,255,0.28)");
      veil.addColorStop(0.55, "rgba(255,255,255,0)");
      veil.addColorStop(1, "rgba(0,70,120,0.18)");
      ctx.fillStyle = veil;
      ctx.fillRect(0, 0, S.w, S.h);
    } else {
      const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.75);
      bg.addColorStop(0, "#0d1a42");
      bg.addColorStop(0.45, "#060c22");
      bg.addColorStop(1, "#02040b");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, S.w, S.h);
    }

    const m = Math.min(S.w, S.h);
    const ox = cx + S.smx * -14;
    const oy = cy + S.smy * -10;
    ctx.lineWidth = 1;
    [0.26, 0.4, 0.56].forEach((f, i) => {
      ctx.strokeStyle = rgba(C.ice, (i === 1 ? 0.06 : 0.035) * hud);
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
      ctx.strokeStyle = rgba(C.ice, (i % 12 === 0 ? 0.12 : 0.05) * hud);
      ctx.beginPath();
      ctx.moveTo(ox + Math.cos(a) * tickR, oy + Math.sin(a) * tickR);
      ctx.lineTo(ox + Math.cos(a) * (tickR + len), oy + Math.sin(a) * (tickR + len));
      ctx.stroke();
    }
    ctx.strokeStyle = rgba(C.ice, 0.035 * hud);
    ctx.setLineDash([4, 10]);
    ctx.beginPath();
    ctx.moveTo(0, oy);
    ctx.lineTo(S.w, oy);
    ctx.moveTo(ox, 0);
    ctx.lineTo(ox, S.h);
    ctx.stroke();
    ctx.setLineDash([]);

    const base = S.h * 0.9;
    ctx.strokeStyle = rgba(C.cyan, 0.07 * hud);
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

  /* The LC/MS ride is its own full-screen film; the machine sleeps underneath until it ends. */
  function enterRide(kind, trackName = "observe", back = null) {
    if (!window.WatersRide) return;
    hideIntro();
    if (S.finale) leaveFinale();
    S.ride = true;
    cancelAnimationFrame(S.raf);
    root.classList.add("is-ride");
    window.WatersRide.open({
      track: `${trackName}-${kind === "ms" ? "ms" : "lc"}`,
      onClose: () => {
        if (!S.ride) return;
        S.ride = false;
        root.classList.remove("is-ride");
        if (!S.open) return;
        if (back === "universe" && S.active === "technology" && uniOn()) S.uni.redive();
        else overview();
        S.last = 0;
        cancelAnimationFrame(S.raf);
        S.raf = requestAnimationFrame(frame);
      },
    });
  }

  /* Chapter 03 hub. The universe draws on this canvas so the rail and camera stay put;
     the chapter panel becomes its text version. Without the module the old panel remains. */
  const uniOn = () => !!S.uni && S.active === "technology" && !S.uniText && !S.finale;

  function makeUniverse() {
    if (S.uni || !window.WatersUniverse || !window.WatersSim) return;
    S.uni = window.WatersUniverse.create({
      ctx,
      C,
      rgba,
      glow,
      dot,
      lerp,
      clamp,
      ease,
      TAU,
      reduce,
      S,
      esc,
      root,
      cursor: (c) => (canvas.style.cursor = c),
      onJourney: (track, kind) => enterRide(kind, track, "universe"),
      onText: () => {
        S.uniText = true;
        renderPanel();
        setHint();
        requestAnimationFrame(() => els.panel.querySelector("h2")?.focus({ preventScroll: true }));
      },
    });
  }

  function leaveRide() {
    if (!S.ride) return;
    S.ride = false;
    root.classList.remove("is-ride");
    if (window.WatersRide && window.WatersRide.isOpen()) window.WatersRide.close();
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

  function drawGlobe(P, a, k, o = {}) {
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
    if (o.dots !== false) for (const d of GLOBE_DOTS) {
      const p = project(add(P, [
        R * (d[0] * Math.cos(spin) - d[2] * Math.sin(spin)),
        R * d[1],
        R * (d[0] * Math.sin(spin) + d[2] * Math.cos(spin)),
      ]));
      if (p.z < pc.z - 0.1) continue;
      dot(p.x, p.y, 0.012 * p.s, C.ice, 0.35 * a);
    }
    strokePts(ring(P, R * 1.28, 1.2, 0.35, S.t * 0.2, 80), C.cyan, 0.3 * a, 1, pc.z, 0.15);
    if (o.sites === false) return R;

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

  /* ---------- opening: seeing is not the same as understanding ---------- */

  // Scroll track 0..1. Each window is [fade in from, fully in, hold until, gone by].
  const OPEN_BEATS = {
    see: [-1, 0, 0.028, 0.04],
    understand: [0.042, 0.054, 0.085, 0.097],
    medicine: [0.1, 0.112, 0.16, 0.172],
    water: [0.177, 0.189, 0.23, 0.242],
    food: [0.247, 0.259, 0.295, 0.307],
    material: [0.312, 0.324, 0.36, 0.372],
    appearance: [0.377, 0.389, 0.43, 0.442],
    within: [0.457, 0.469, 0.5, 0.512],
    identity: [0.512, 0.524, 0.545, 0.556],
    observe: [0.556, 0.565, 0.576, 0.585],
    separate: [0.585, 0.594, 0.606, 0.616],
    analytical: [0.616, 0.627, 0.675, 0.687],
    bio: [0.692, 0.705, 0.755, 0.767],
    dx: [0.772, 0.785, 0.835, 0.847],
    heat: [0.852, 0.865, 0.91, 0.92],
    together: [0.922, 0.932, 0.952, 0.96],
    waters: [0.962, 0.97, 0.98, 0.986],
    mark: [0.986, 0.993, 2, 3],
  };
  const OPEN_STOPS = [0, 0.07, 0.14, 0.21, 0.277, 0.343, 0.41, 0.49, 0.535, 0.571, 0.6, 0.632, 0.712, 0.792, 0.872, 0.945, 0.976, 0.995, 1];
  const OPEN_BREATHE = [
    [0.054, 0.085],
    [0.389, 0.43],
    [0.932, 0.952],
    [0.97, 0.98],
  ];
  // One continuous particle timeline: each keyframe is a formation held over [a, b].
  // Keyframes with `dur` also run on their own clock while held, so the science plays out without scrolling.
  const KF = [
    { s: "globe", a: -1, b: 0.085, zoom: 1.16, side: 1 },
    { s: "tablet", a: 0.115, b: 0.165, zoom: 1.3, side: 1 },
    { s: "drop", a: 0.19, b: 0.232, zoom: 1.3, side: 1 },
    { s: "food", a: 0.257, b: 0.297, zoom: 1.3, side: 1 },
    { s: "material", a: 0.322, b: 0.362, zoom: 1.22, side: 1 },
    { s: "lineup", a: 0.388, b: 0.435, zoom: 0.95, side: 0 },
    { s: "micro", a: 0.47, b: 0.55, zoom: 1.35, side: 0 },
    { s: "mixture", a: 0.566, b: 0.605, zoom: 1.45, side: 0 },
    { s: "separation", a: 0.628, b: 0.68, zoom: 1, side: 0, dur: 7 },
    { s: "cells", a: 0.708, b: 0.76, zoom: 1.2, side: 0, dur: 9 },
    { s: "dx", a: 0.788, b: 0.84, zoom: 1.2, side: 0, dur: 7 },
    { s: "heat", a: 0.868, b: 0.915, zoom: 1.2, side: 0, dur: 8 },
    { s: "quad", a: 0.935, b: 0.955, zoom: 1.05, side: 0 },
    { s: "core", a: 0.975, b: 2, zoom: 1, side: 0 },
  ];
  const KI = Object.fromEntries(KF.map((k, i) => [k.s, i]));
  const OBJ = ["tablet", "drop", "food", "material"];
  const OBJ_LABEL = ["A medicine tablet", "A drop of water", "A food sample", "A material surface"];
  const OBJ_MOL = [0, 2, 1, 3];
  const COMP = ["cyan", "violet", "mint", "blue"];
  const DIVISIONS = ["Analytical Sciences", "Biosciences", "Advanced Diagnostics", "Materials Sciences"];

  const OPEN_DOTS = fib(720);
  const OPEN_N = OPEN_DOTS.length;
  const OPEN_PER_MOL = OPEN_N / 4;
  const sm = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
  const win = (p, [a, b, c, d]) => (p <= a || p >= d ? 0 : p < b ? sm((p - a) / (b - a)) : p <= c ? 1 : 1 - sm((p - c) / (d - c)));
  const mixC = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
  const rotX = ([x, y, z], a) => [x, y * Math.cos(a) - z * Math.sin(a), y * Math.sin(a) + z * Math.cos(a)];
  const rotY = ([x, y, z], a) => [x * Math.cos(a) + z * Math.sin(a), y, -x * Math.sin(a) + z * Math.cos(a)];
  const rotZ = ([x, y, z], a) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a), z];

  const seeded = (() => {
    let s = 20240611;
    return () => {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
  })();
  const OPEN_SEED = OPEN_DOTS.map(() => seeded());
  const gauss = () => Math.sqrt(-2 * Math.log(seeded() + 1e-9)) * Math.cos(TAU * seeded());
  const ballJitter = (r) => [(seeded() - 0.5) * 2 * r, (seeded() - 0.5) * 2 * r, (seeded() - 0.5) * 2 * r];

  function recenter(M) {
    const lo = [0, 1, 2].map((i) => Math.min(...M.atoms.map((a) => a.p[i])));
    const hi = [0, 1, 2].map((i) => Math.max(...M.atoms.map((a) => a.p[i])));
    M.atoms.forEach((a) => (a.p = a.p.map((v, i) => v - (lo[i] + hi[i]) / 2)));
    return M;
  }

  // Structural sketches only — never labelled as specific products.
  const MOLS = (() => {
    const ring = { atoms: [], bonds: [], hb: [] };
    for (let i = 0; i < 6; i += 1) {
      const a = Math.PI / 2 + (i / 6) * TAU;
      ring.atoms.push({ p: [Math.cos(a) * 0.24, Math.sin(a) * 0.24, 0], k: "cyan" });
      ring.bonds.push([i, (i + 1) % 6]);
    }
    ring.atoms.push(
      { p: [0, 0.5, 0], k: "violet" },
      { p: [0, -0.5, 0], k: "blue" },
      { p: [0.22, -0.64, 0], k: "cyan" },
      { p: [0.22, -0.88, 0], k: "violet" },
      { p: [0.44, -0.52, 0], k: "cyan" }
    );
    ring.bonds.push([0, 6], [3, 7], [7, 8], [8, 9], [8, 10]);
    ring.atoms.forEach((a) => (a.p = [-a.p[1], a.p[0], a.p[2]]));

    const chain = { atoms: [], bonds: [], hb: [] };
    for (let i = 0; i < 9; i += 1) {
      chain.atoms.push({ p: [-0.5 + i * 0.115, i % 2 ? 0.07 : -0.07, Math.sin(i * 0.9) * 0.05], k: "cyan" });
      if (i) chain.bonds.push([i - 1, i]);
    }
    chain.atoms.push({ p: [0.5, 0.2, 0], k: "violet" }, { p: [0.55, -0.16, 0], k: "violet" });
    chain.bonds.push([8, 9], [8, 10]);

    const water = { atoms: [], bonds: [], hb: [] };
    const wc = [90, 210, 330].map((deg) => [Math.cos(deg * DEG) * 0.3, Math.sin(deg * DEG) * 0.3, (deg - 210) / 1200]);
    wc.forEach((o, i) => {
      const n = wc[(i + 1) % 3];
      const th = Math.atan2(n[1] - o[1], n[0] - o[0]);
      const base = water.atoms.length;
      water.atoms.push({ p: o, k: "violet" });
      [th, th + 104.5 * DEG].forEach((h) => water.atoms.push({ p: [o[0] + Math.cos(h) * 0.15, o[1] + Math.sin(h) * 0.15, o[2]], k: "ice" }));
      water.bonds.push([base, base + 1], [base, base + 2]);
      water.hb.push([base + 1, ((i + 1) % 3) * 3]);
    });

    const lattice = { atoms: [], bonds: [], hb: [], tilt: 0.55 };
    const at = (x, y, z) => (x * 3 + y) * 3 + z;
    for (let x = 0; x < 3; x += 1)
      for (let y = 0; y < 3; y += 1)
        for (let z = 0; z < 3; z += 1) {
          lattice.atoms.push({ p: [(x - 1) * 0.19, (y - 1) * 0.19, (z - 1) * 0.19], k: (x + y + z) % 2 ? "violet" : "blue" });
          if (x) lattice.bonds.push([at(x - 1, y, z), at(x, y, z)]);
          if (y) lattice.bonds.push([at(x, y - 1, z), at(x, y, z)]);
          if (z) lattice.bonds.push([at(x, y, z - 1), at(x, y, z)]);
        }
    return [ring, chain, water, lattice].map(recenter);
  })();

  // Small, generic analyte sketches for the separation scene — illustrative, never named.
  const ANA = (() => {
    const hex = (cx, cy) => Array.from({ length: 6 }, (_, i) => [cx + Math.cos(Math.PI / 6 + (i * TAU) / 6) * 0.24, cy + Math.sin(Math.PI / 6 + (i * TAU) / 6) * 0.24, 0]);
    const cyc = (o) => Array.from({ length: 6 }, (_, i) => [o + i, o + ((i + 1) % 6)]);
    const mk = (atoms, bonds) => recenter({ atoms: atoms.map(([p, k]) => ({ p, k })), bonds, hb: [] });
    const phenol = mk([...hex(0, 0).map((p) => [p, "cyan"]), [[0, 0.5, 0], "violet"]], [...cyc(0), [1, 6]]);
    const chainAtoms = Array.from({ length: 6 }, (_, i) => [[-0.36 + i * 0.13, i % 2 ? 0.07 : -0.07, 0], "cyan"]);
    const chain = mk([...chainAtoms, [[0.46, 0.2, 0], "violet"]], [...Array.from({ length: 5 }, (_, i) => [i, i + 1]), [5, 6]]);
    const fused = mk([...hex(-0.208, 0), ...hex(0.208, 0)].map((p) => [p, "cyan"]), [...cyc(0), ...cyc(6)]);
    return [phenol, chain, MOLS[0], fused];
  })();

  function allocParts(M) {
    const items = [
      ...M.atoms.map((a) => ({ w: a.k === "ice" ? 0.55 : 1, a })),
      ...M.bonds.map(([i, j]) => {
        const A = M.atoms[i].p;
        const B = M.atoms[j].p;
        return { w: Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]) * 2.4, b: [A, B, M.atoms[i].k] };
      }),
    ];
    const total = items.reduce((s, it) => s + it.w, 0);
    const parts = [];
    for (let j = 0; j < OPEN_PER_MOL; j += 1) {
      let u = ((j + 0.5) / OPEN_PER_MOL) * total;
      const it = items.find((x) => (u -= x.w) <= 0) || items[items.length - 1];
      if (it.a) parts.push({ local: add(it.a.p, ballJitter(0.04)), col: it.a.k, atom: true });
      else parts.push({ local: add(mix(it.b[0], it.b[1], seeded()), ballJitter(0.012)), col: it.b[2] === "ice" ? "ice" : "blue", atom: false });
    }
    return parts.sort((p, q) => q.local[1] - p.local[1]);
  }
  const MOL_PARTS = MOLS.map(allocParts);
  const ANA_PARTS = ANA.map(allocParts);

  const tear = (d, s) => {
    const t = Math.acos(clamp(d[1], -1, 1));
    const az = Math.atan2(d[2], d[0]);
    const r = Math.sin(t) * Math.pow(Math.sin(t / 2), 0.9) * 1.05 * s;
    return [Math.cos(az) * r, (Math.cos(t) * 1.15 + 0.05) * s, Math.sin(az) * r];
  };
  // Everyday objects, sampled as particle surfaces in their own local frame.
  const SHAPES = {
    tablet: OPEN_DOTS.map(() => {
      const u = seeded();
      const th = seeded() * TAU;
      if (u < 0.52) {
        const r = Math.sqrt(seeded()) * 0.94;
        let x = Math.cos(th) * r;
        if (Math.abs(x) < 0.05) x = Math.sign(x || 1) * (0.05 + seeded() * 0.02);
        return [x, 0.17 + 0.05 * (1 - r * r), Math.sin(th) * r];
      }
      if (u < 0.64) {
        const r = Math.sqrt(seeded()) * 0.94;
        return [Math.cos(th) * r, -0.17 - 0.05 * (1 - r * r), Math.sin(th) * r];
      }
      const y = (seeded() - 0.5) * 0.34;
      const r = 1 - 0.07 * ((2 * Math.abs(y)) / 0.34) ** 2;
      return [Math.cos(th) * r, y, Math.sin(th) * r];
    }),
    drop: OPEN_DOTS.map((d, i) => (seeded() < 0.1 ? tear(OPEN_DOTS[(i * 37) % OPEN_N], 0.3 + seeded() * 0.5) : tear(d, 1))),
    food: OPEN_DOTS.map(([x, y, z]) => {
      let Y = y * 0.62;
      if (Y > 0 && Math.abs(z) < 0.18) Y *= 0.5 + Math.abs(z) * 2.7;
      return [x * 1.25, Y, z * 0.64];
    }),
    material: OPEN_DOTS.map((d, i) => {
      if (i < 576) return [((i % 24) / 23) * 2 - 1, 0.04, (Math.floor(i / 24) / 23) * 2 - 1];
      const e = i % 4;
      const t = seeded() * 2 - 1;
      const y = (seeded() - 0.5) * 0.09;
      return e === 0 ? [t, y, 1.02] : e === 1 ? [t, y, -1.02] : e === 2 ? [1.02, y, t] : [-1.02, y, t];
    }),
  };

  // Liquid chromatography in miniature: components move at different speeds, broaden, and elute in turn.
  const SEP = { X0: -2.1, XD: 1.0, Y0: 0.85, T0: -2.1, T1: 2.1, YT: -0.48, speed: [1, 0.74, 0.55, 0.42] };
  const SEP_K = 1 / (0.86 * SEP.speed[3]);
  const SEP_PEAK = SEP.speed.map((v) => {
    const t = 1 / (SEP_K * v);
    const sig = 0.05 + 0.12 * t;
    return { t, x: lerp(SEP.T0, SEP.T1, t), sig, h: 0.075 / sig };
  });
  const SEP_JIT = OPEN_DOTS.map(() => [gauss(), seeded() - 0.5]);
  const MIX_POS = COMP.map(() => Array.from({ length: 30 }, () => [gauss() * 0.72, gauss() * 0.36, gauss() * 0.3]));

  // Biosciences: cells pass a laser one at a time; each lands in its population on a two-marker plot.
  const CELLS = (() => {
    const n = OPEN_N / 12;
    const pop = Array.from({ length: n }, (_, c) => c % 3);
    for (let c = n - 1; c > 0; c -= 1) {
      const r = Math.floor(seeded() * (c + 1));
      [pop[c], pop[r]] = [pop[r], pop[c]];
    }
    const centre = [
      [0.22, 0.24],
      [0.74, 0.3],
      [0.7, 0.76],
    ];
    const plot = pop.map((g) => [clamp(centre[g][0] + gauss() * 0.07, 0.03, 0.97), clamp(centre[g][1] + gauss() * 0.07, 0.03, 0.97)]);
    return { n, pop, plot, col: ["cyan", "violet", "mint"], LX: -0.6, SY: 0.05, X0: 0.35, X1: 2.05, Y0: -0.85, Y1: 0.75 };
  })();

  // Diagnostics: a few target organisms hide among many other particles until the test captures them.
  const DX = (() => {
    const rods = 8;
    const cx = -1.2;
    const cy = 0.1;
    return {
      rods,
      cx,
      cy,
      probe: [0.05, 0.1],
      start: Array.from({ length: rods }, () => [cx + clamp(gauss() * 0.4, -0.8, 0.8), cy + clamp(gauss() * 0.24, -0.45, 0.45), 0]),
      tc: Array.from({ length: rods }, (_, r) => 0.12 + r * 0.075),
      bg: OPEN_DOTS.map(() => [cx + clamp(gauss() * 0.55, -1.05, 1.05), cy + clamp(gauss() * 0.32, -0.6, 0.6), gauss() * 0.2]),
      G: { X0: 0.75, X1: 2.1, Y0: -0.55, Y1: 0.65, thr: 0.45 },
    };
  })();
  const dxCaptured = (T) => DX.tc.reduce((s, t) => s + sm((T - t - 0.12) / 0.03), 0) / DX.rods;

  // Materials: a heated crystal vibrates harder, loses its order at the melting point and flows.
  const HEAT = {
    X: -1.15,
    Y: 0.1,
    Tm: 0.6,
    sig: 0.045,
    liquid: OPEN_DOTS.map(() => [clamp(gauss() * 0.45, -1, 1), -0.45 + Math.abs(gauss()) * 0.09, clamp(gauss() * 0.3, -0.5, 0.5)]),
    G: { X0: 0.45, X1: 2.1, Y0: -0.45, Y1: 0.75 },
  };
  const heatMelt = (T) => sm((T - (HEAT.Tm - 0.08)) / 0.16);
  const heatFlow = (T) => 0.06 * T + 0.85 * Math.exp(-((T - HEAT.Tm) ** 2) / (2 * HEAT.sig * HEAT.sig));

  // Narrow screens stack each vignette: the specimen above, its measurement below.
  const VSTACK = {
    cells: [
      [-1.42, 0.05],
      [1.2, -0.05],
    ],
    dx: [
      [-1.0, 0.1],
      [1.425, 0.05],
    ],
    heat: [
      [-1.3, 0.1],
      [1.275, 0.15],
    ],
  };
  function vmap(name, part, x, y) {
    if (!S.narrow) return [x, y];
    const c = VSTACK[name][part];
    return [x - c[0], y - c[1] + (part ? -0.8 : 0.95)];
  }

  function quadLocal(g, j, i) {
    if (g === 0) return MOL_PARTS[0][j].local.map((v) => v * 0.42);
    if (g === 3) return MOL_PARTS[3][j].local.map((v) => v * 0.45);
    if (g === 1) {
      if (j < 140) {
        const a = (j / 140) * TAU;
        return [Math.cos(a) * 0.26, Math.sin(a) * 0.26, OPEN_DOTS[i][2] * 0.03];
      }
      return OPEN_DOTS[i].map((v) => v * 0.08);
    }
    const x = lerp(-0.25, 0.25, (j % 45) / 44);
    const a = Math.floor(j / 45) * (TAU / 4) + x * 4;
    const r = 0.075 * Math.sqrt(Math.max(0, 1 - (x / 0.27) ** 8));
    return [x, Math.cos(a) * r, Math.sin(a) * r];
  }

  const coarse = window.matchMedia("(hover: none)").matches;
  const OP = {
    ptrT: -9,
    lx: 0,
    ly: 0,
    lensOn: false,
    moved: 0,
    flash: [-9, -9, -9, -9],
    shock: false,
    ripples: [],
    molA: 0,
    spinV: 0,
    drag: null,
    quietUntil: 0,
    dir: 1,
    p: 0,
    target: 0,
    age: 0,
    idle: 0,
    hold: 0,
    after: 0,
    sep: 0,
    clk: KF.map(() => 0),
    st: { A: 0, B: 0, e: 0 },
    cs: 1,
    sn: 0,
    touching: false,
  };
  const opEls = {
    box: $(".wm-open"),
    lines: [...root.querySelectorAll(".wm-open [data-beat]")],
    cue: $(".wm-open-cue"),
    bar: $(".wm-open-progress i"),
    scale: $(".wm-open-scale"),
  };
  const SCALE_MARKS = { 7: "Earth", "-2": "Everyday objects", "-9": "Molecules" };

  function splitWords(el) {
    let i = 0;
    const walk = (node) => {
      [...node.childNodes].forEach((c) => {
        if (c.nodeType === 1) return walk(c);
        if (c.nodeType !== 3) return;
        const frag = document.createDocumentFragment();
        c.textContent.split(/(\s+)/).forEach((t) => {
          if (!t) return;
          if (/^\s+$/.test(t)) return frag.append(t);
          const w = document.createElement("span");
          w.className = "w";
          w.style.setProperty("--i", i++);
          w.textContent = t;
          frag.append(w);
        });
        c.replaceWith(frag);
      });
    };
    walk(el);
    el.style.setProperty("--n", i);
  }
  opEls.lines.forEach(splitWords);

  function scaleExp(p) {
    if (p < 0.09) return 7;
    if (p < 0.112) return Math.round(lerp(7, -2, sm((p - 0.09) / 0.022)));
    if (p < 0.43) return -2;
    return Math.round(lerp(-2, -9, sm((p - 0.43) / 0.04)));
  }

  function openLayout() {
    if (S.narrow) {
      return {
        lp: [
          [-0.95, 0.85, 0],
          [0.95, 0.85, 0],
          [-0.95, -0.75, 0],
          [0.95, -0.75, 0],
        ],
        lk: 0.5,
        ms: 0.72,
        mix: [0, 0.1, 0],
        mx: 0.6,
        sx: 0.92,
        qr: 0.85,
        qy: 1.25,
      };
    }
    return {
      lp: [
        [-2.1, 0.18, 0],
        [-0.7, 0.18, 0],
        [0.7, 0.18, 0],
        [2.1, 0.18, 0],
      ],
      lk: 0.42,
      ms: 0.62,
      mix: [0, 0.15, 0],
      mx: 1,
      sx: 1,
      qr: 1.35,
      qy: 0.62,
    };
  }

  function stageAt(p) {
    for (let k = 0; k < KF.length; k += 1) {
      if (p > KF[k].b) continue;
      if (k === 0 || p >= KF[k].a) return { A: k, B: k, e: 0 };
      return { A: k - 1, B: k, e: sm((p - KF[k - 1].b) / (KF[k].a - KF[k - 1].b)) };
    }
    return { A: KF.length - 1, B: KF.length - 1, e: 0 };
  }
  const localT = (k) => {
    const K = KF[k];
    const scroll = clamp((OP.p - (K.a + 0.004)) / (K.b - K.a - 0.004), 0, 1);
    return K.dur ? Math.max(scroll, clamp(OP.clk[k] / K.dur, 0, 1)) : scroll;
  };
  const weightOf = (k) => {
    const { A, B, e } = OP.st;
    return (A === k ? 1 - e : 0) + (B === k && A !== k ? e : 0);
  };

  function objPoint(name, p, k, pos) {
    const t = reduce ? 0 : S.t;
    let q;
    if (name === "tablet") q = rotX(rotZ(rotY(p, t * 0.3 + OP.molA), 0.3 + Math.sin(t * 0.4) * 0.08), 0.42);
    else if (name === "drop") q = rotY(p, t * 0.2 + OP.molA);
    else if (name === "food") q = rotX(rotZ(rotY(p, t * 0.25 + OP.molA), 0.35), 0.45);
    else q = rotX(rotY(p, 0.62 + OP.molA * 0.6 + Math.sin(t * 0.2) * 0.12), 0.95);
    return { w: [pos[0] + q[0] * k, pos[1] + q[1] * k, pos[2] + q[2] * k], depth: q[2] };
  }

  function objLook(name, p, seed) {
    const t = reduce ? 0 : S.t;
    if (name === "drop") {
      const glint = p[0] < -0.25 && p[1] > 0.1 ? 1.8 : 1;
      return { col: mixC(C.cyan, C.ice, 0.55), a: (Math.hypot(p[0], p[2]) < 0.5 && Math.abs(p[1]) < 0.6 ? 0.5 : 1) * glint };
    }
    if (name === "material") {
      const sweep = Math.sin(t * 0.6) * 1.5;
      return { col: mixC(C.steel, C.ice, 0.5), a: 1 + 1.6 * Math.exp(-((p[0] + p[2] * 0.7 - sweep) ** 2) / 0.04) };
    }
    if (name === "food") return { col: mixC(C.mint, C.ice, 0.72), a: 1 };
    return { col: seed < 0.08 ? mixC(C.cyan, C.ice, 0.5) : C.ice, a: 1 };
  }

  function molLocal(M, local, g, k) {
    let [x, y, z] = local;
    if (M.tilt) {
      const c = Math.cos(M.tilt);
      const s = Math.sin(M.tilt);
      [y, z] = [y * c - z * s, y * s + z * c];
    }
    const a = (reduce ? 0 : S.t * 0.22 * (g % 2 ? -1 : 1)) + g * 0.9 + OP.molA;
    const c = Math.cos(a);
    const s = Math.sin(a);
    return [(x * c - z * s) * k, y * k, (x * s + z * c) * k];
  }

  function sepBand(g, T) {
    const len = SEP.XD - SEP.X0;
    const d = T * SEP_K * SEP.speed[g] * len;
    return { cx: SEP.X0 + d, bw: 0.03 + 0.08 * Math.min(1, d / len), past: d - len, len };
  }
  const sepTop = (g) => [SEP_PEAK[g].x, SEP.YT + SEP_PEAK[g].h * 0.9 + 0.34, 0];

  function formAt(k, i, L) {
    const seed = OPEN_SEED[i];
    const g = i % 4;
    const j = (i - g) / 4;
    const live = reduce ? 0 : 1;
    const t = reduce ? 0 : S.t;
    const s = KF[k].s;
    if (s === "globe") {
      const d = OPEN_DOTS[i];
      const br = 1 + 0.018 * Math.sin(S.t * 0.9 + seed * TAU) * live;
      return {
        w: [br * (d[0] * OP.cs - d[2] * OP.sn), br * d[1], br * (d[0] * OP.sn + d[2] * OP.cs)],
        col: seed < 0.1 ? C.cyan : seed > 0.94 ? C.violet : C.ice,
        size: seed < 0.1 ? 0.016 : 0.011,
        a: 1,
        globe: true,
      };
    }
    if (OBJ.includes(s)) {
      const p = SHAPES[s][i];
      const o = objPoint(s, p, s === "drop" ? 0.85 : 1, [0, 0, 0]);
      const look = objLook(s, p, seed);
      return { w: o.w, col: look.col, size: 0.011, a: look.a * (0.4 + 0.6 * clamp((o.depth + 1) / 2, 0, 1)) };
    }
    if (s === "lineup") {
      const name = OBJ[g];
      const p = SHAPES[name][i];
      const o = objPoint(name, p, L.lk * (name === "drop" ? 0.85 : 1), L.lp[g]);
      const look = objLook(name, p, seed);
      return { w: o.w, col: look.col, size: 0.013, a: look.a * (0.45 + 0.55 * clamp((o.depth + 1) / 2, 0, 1)) };
    }
    if (s === "micro") {
      const part = MOL_PARTS[OBJ_MOL[g]][j];
      return {
        w: add(L.lp[g], molLocal(MOLS[OBJ_MOL[g]], part.local, g, L.ms)),
        col: mixC(C[COMP[g]], C[part.col], 0.35),
        size: part.atom ? 0.014 : 0.009,
        a: 1,
      };
    }
    if (s === "mixture") {
      const grp = Math.floor(j / 6);
      const c = MIX_POS[g][grp];
      const ph = (g * 30 + grp) * 1.7;
      const a = ((j % 6) / 6) * TAU + t * 0.8 + ph;
      return {
        w: [L.mix[0] + c[0] * L.mx + Math.sin(t * 0.6 + ph) * 0.07 + Math.cos(a) * 0.05, L.mix[1] + c[1] + Math.cos(t * 0.5 + ph * 1.3) * 0.06 + Math.sin(a) * 0.05, c[2]],
        col: C[COMP[g]],
        size: 0.011,
        a: 1,
      };
    }
    if (s === "separation") {
      const T = localT(k);
      const B = sepBand(g, T);
      const [bx, by] = SEP_JIT[i];
      if (B.past <= 0) return { w: [(B.cx + bx * B.bw) * L.sx, SEP.Y0 + by * 0.2, 0], col: C[COMP[g]], size: 0.011, a: 1 };
      const u = ease(clamp(B.past / (B.len * 0.35), 0, 1));
      const top = sepTop(g);
      const mol = molLocal(ANA[g], ANA_PARTS[g][j].local, g, 0.34);
      const end = [(top[0] + mol[0]) * L.sx, top[1] + mol[1], mol[2]];
      return { w: bez([SEP.XD * L.sx + 0.12, SEP.Y0, 0], [end[0], SEP.Y0, 0], end, u), col: C[COMP[g]], size: 0.011, a: 1 };
    }
    if (s === "cells") {
      const T = localT(k);
      const c = Math.floor(i / 12);
      const slot = i % 12;
      const V = CELLS;
      const sp = (T - (c / V.n) * 0.72) / 0.22;
      const loc = slot < 10 ? [Math.cos((slot / 10) * TAU + c) * 0.045, Math.sin((slot / 10) * TAU + c) * 0.045, 0] : [(slot - 10.5) * 0.024, 0, 0.01];
      const pc = C[V.col[V.pop[c]]];
      if (sp <= 1) {
        const x = lerp(-2.25, V.LX, sp);
        const wob = Math.sin(t * 2 + c) * 0.006;
        const at = vmap("cells", 0, x + loc[0], V.SY + loc[1] + wob);
        return {
          w: [at[0], at[1], loc[2]],
          col: sp > 0.9 ? mixC(C.ice, pc, (sp - 0.9) / 0.1) : C.ice,
          size: slot < 10 ? 0.009 : 0.013,
          a: clamp(1 + (x + 2.25) / 0.35, 0, 1) * (1 + 2.2 * Math.max(0, 1 - Math.abs(sp - 1) / 0.12)),
        };
      }
      const u = ease(clamp((sp - 1) / 0.55, 0, 1));
      const P = V.plot[c];
      const end = [...vmap("cells", 1, lerp(V.X0, V.X1, P[0]), lerp(V.Y0, V.Y1, P[1])), 0];
      const from = [...vmap("cells", 0, V.LX, V.SY), 0];
      const ctl = S.narrow ? [from[0] + 0.5, (from[1] + end[1]) / 2, 0] : [V.LX + 0.7, V.SY, 0];
      const at = bez(from, ctl, end, u);
      const shrink = 1 - u * 0.75;
      return { w: [at[0] + loc[0] * shrink, at[1] + loc[1] * shrink, 0], col: pc, size: lerp(0.01, 0.012, u), a: 1 + 1.5 * Math.max(0, 1 - (sp - 1) / 0.15) };
    }
    if (s === "dx") {
      const T = localT(k);
      const drift = [Math.sin(t * 0.5 + seed * 20) * 0.03, Math.cos(t * 0.4 + seed * 31) * 0.025, 0];
      if (i % 9) {
        const b = add(DX.bg[i], drift);
        const at = vmap("dx", 0, b[0], b[1]);
        return { w: [at[0], at[1], b[2]], col: mixC(C.ice, C.violet, 0.25), size: 0.01, a: 0.42 };
      }
      const r = Math.floor(i / 90);
      const slot = (i / 9) % 10;
      const loc = [lerp(-0.065, 0.065, (slot % 5) / 4), slot < 5 ? 0.02 : -0.02, 0];
      const u = ease(clamp((T - DX.tc[r]) / 0.12, 0, 1));
      const ang = (r / DX.rods) * TAU;
      const home = add(DX.start[r], drift);
      const at = mix(home, [DX.probe[0] + Math.cos(ang) * 0.2, DX.probe[1] + Math.sin(ang) * 0.2, 0], u);
      const q = rotZ(loc, lerp(r * 0.7, ang + Math.PI / 2, u));
      const lit = sm((T - 0.03) / 0.08);
      const w = vmap("dx", 0, at[0] + q[0], at[1] + q[1]);
      return { w: [w[0], w[1], 0], col: mixC(mixC(C.ice, C.violet, 0.25), C.mint, lit), size: lerp(0.01, 0.013, lit), a: lerp(0.42, 1.4, lit) };
    }
    if (s === "heat") {
      const T = localT(k);
      const m = heatMelt(T);
      const ix = i % 12;
      const iy = Math.floor(i / 12) % 10;
      const iz = Math.floor(i / 120);
      const lat = rotX(rotY([(ix - 5.5) * 0.085, (iy - 4.5) * 0.085, (iz - 2.5) * 0.085], 0.55), 0.22);
      const amp = (0.003 + 0.024 * Math.min(T, HEAT.Tm)) * live;
      const vib = [Math.sin(t * 9 + seed * 50) * amp, Math.cos(t * 8 + seed * 70) * amp, Math.sin(t * 7 + seed * 90) * amp];
      const liq = HEAT.liquid[i];
      const flow = [Math.sin(t * 0.7 + seed * 40) * 0.04 * m, 0, Math.cos(t * 0.6 + seed * 40) * 0.04 * m];
      const p = add(add(mix(lat, liq, m), vib), flow);
      const at = vmap("heat", 0, HEAT.X + p[0], HEAT.Y + p[1]);
      return { w: [at[0], at[1], p[2]], col: mixC(mixC(C.blue, C.violet, Math.min(1, T * 1.4)), C.cyan, m * 0.4), size: 0.011, a: 0.95 };
    }
    if (s === "quad") {
      const a = (g / 4) * TAU - Math.PI * 0.75 + t * 0.12;
      const c = [Math.cos(a) * L.qr, Math.sin(a) * L.qr * L.qy + 0.05, 0];
      const ql = quadLocal(g, j, i);
      const q = g === 1 ? rotZ(rotX(ql, 0.35), t * 0.4) : g === 2 ? rotZ(rotX(ql, t * 1.2), 0.5) : rotY(ql, t * 0.4 + g);
      return { w: add(c, q), col: C[COMP[g]], size: 0.011, a: 1 };
    }
    const d = OPEN_DOTS[i];
    return { w: [d[0] * 0.14, d[1] * 0.14, d[2] * 0.14], col: C.cyan, size: 0.01, a: 1 };
  }

  function startOpening(at = 0) {
    S.opening = true;
    Object.assign(OP, { dir: 1, p: 0, target: 0, age: 0, idle: 0, hold: 0, after: 0, sep: 0, touching: false, shock: false });
    OP.st = stageAt(0);
    applyPalette(false);
    root.classList.remove("is-brand");
    root.classList.add("is-opening");
    els.intro.classList.add("is-gone");
    OP.ripples = [];
    OP.clk = KF.map(() => 0);
    OP.flash = [-9, -9, -9, -9];
    OP.lensOn = false;
    OP.moved = 0;
    OP.drag = null;
    OP.spinV = 0;
    if (at > 0) {
      OP.p = OP.target = at;
      OP.age = 4;
      OP.dir = -1;
      OP.st = stageAt(at);
    } else {
      S.zoom = S.narrow ? 1.4 : 0.66;
      S.shift = S.narrow ? 0 : S.w * 0.17;
      S.cam = [0, 0, 0];
      S.hud = 0.3;
    }
    opEls.lines.concat([opEls.cue, opEls.scale]).forEach((el) => {
      if (el) el._k = -1;
    });
  }

  function endOpening() {
    if (!S.opening) return;
    S.opening = false;
    OP.after = OP.st.B === KI.core ? 1 : 0.4;
    root.classList.remove("is-opening");
    setBrandTheme(S.brand, { persist: false });
    S.assemble = 0;
    S.intro = true;
    S.wheelAcc = 0;
    OP.quietUntil = performance.now() + 2200;
    setHint();
    setTimeout(() => {
      if (!S.open || S.opening || !S.intro) return;
      els.intro.classList.remove("is-gone");
      $(".wm-begin").focus({ preventScroll: true });
    }, 650);
  }

  function openingStop(dir) {
    OP.idle = 0;
    OP.dir = dir;
    const t = OP.target;
    if (dir > 0) OP.target = OPEN_STOPS.find((s) => s > t + 0.005) ?? 1;
    else OP.target = [...OPEN_STOPS].reverse().find((s) => s < t - 0.005) ?? 0;
  }

  function openingNudge(delta) {
    OP.idle = 0;
    if (delta) OP.dir = Math.sign(delta);
    const breathe = OPEN_BREATHE.some(([a, b]) => OP.target > a && OP.target < b) ? 0.55 : 1;
    OP.target = clamp(OP.target + delta * breathe, 0, 1);
  }

  function tickOpening(dt) {
    OP.age += dt;
    OP.idle += dt;
    if (!OP.drag) {
      S.globeSpin += OP.spinV;
      OP.molA += OP.spinV;
      OP.spinV *= Math.pow(0.05, dt);
    }
    OP.ripples.forEach((r) => (r.t += dt));
    OP.ripples = OP.ripples.filter((r) => r.t < 1.8);
    if (OP.idle > 0.7 && !OP.touching) {
      const t = OP.target;
      const near = OP.dir < 0 ? [...OPEN_STOPS].reverse().find((s) => s <= t) : OPEN_STOPS.find((s) => s >= t);
      if (near != null && Math.abs(near - t) < 0.06) OP.target = lerp(OP.target, near, Math.min(1, dt * 4));
    }
    OP.p = lerp(OP.p, OP.target, Math.min(1, dt * (reduce ? 9 : 2.1)));
    if (Math.abs(OP.p - OP.target) < 1e-4) OP.p = OP.target;
    OP.st = stageAt(OP.p);
    KF.forEach((K, k) => {
      if (!K.dur) return;
      if (OP.st.A === k && OP.st.B === k) OP.clk[k] += dt;
      else if (OP.st.A !== k && OP.st.B !== k) OP.clk[k] = 0;
    });
    OP.sep = sm((OP.p - 0.555) / 0.04);
    if (OP.target >= 0.999 && OP.p > 0.99) {
      OP.hold += dt;
      if (OP.hold > 2.2) endOpening();
    } else OP.hold = 0;
  }

  function openingCamera() {
    const { A, B, e } = OP.st;
    const z = (k) => (KF[k].s === "core" ? (S.narrow ? 0.78 : 1) : KF[k].zoom * (S.narrow ? 1.85 : 1));
    const fly = reduce ? 1 : ease(OP.age / 3.2);
    const ee = sm(e);
    const side = lerp(KF[A].side, KF[B].side, ee);
    const core = B === KI.core ? (A === B ? 1 : ee) : 0;
    return {
      cam: [0, 0, 0],
      zoom: lerp(z(A), z(B), ee) * lerp(0.74, 1, fly),
      shift: S.narrow ? 0 : S.w * 0.17 * side,
      shiftY: (S.narrow ? -S.h * 0.1 : -S.h * 0.05 * (1 - side)) * (1 - core),
    };
  }

  function canvasLabel(text, x, y, a, opts = {}) {
    if (a <= 0.01) return;
    ctx.globalCompositeOperation = "source-over";
    ctx.font = `500 ${opts.size || 10}px 'IBM Plex Mono', monospace`;
    ctx.textAlign = opts.align || "center";
    ctx.textBaseline = "middle";
    if ("letterSpacing" in ctx) ctx.letterSpacing = "2.5px";
    ctx.fillStyle = rgba(opts.col || C.ice, a);
    ctx.fillText(text.toUpperCase(), x, y);
    if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
    ctx.textAlign = "start";
    ctx.globalCompositeOperation = "lighter";
  }

  function drawBonds(M, at, g, k, a, colKey) {
    if (a <= 0.01) return;
    const pts = M.atoms.map((atom) => project(add(at, molLocal(M, atom.p, g, k))));
    ctx.lineWidth = 1;
    ctx.strokeStyle = rgba(C[colKey], 0.38 * a);
    ctx.beginPath();
    M.bonds.forEach(([i, j]) => {
      ctx.moveTo(pts[i].x, pts[i].y);
      ctx.lineTo(pts[j].x, pts[j].y);
    });
    ctx.stroke();
    if (M.hb.length) {
      ctx.setLineDash([3, 5]);
      ctx.strokeStyle = rgba(C.violet, 0.5 * a);
      ctx.beginPath();
      M.hb.forEach(([i, j]) => {
        ctx.moveTo(pts[i].x, pts[i].y);
        ctx.lineTo(pts[j].x, pts[j].y);
      });
      ctx.stroke();
      ctx.setLineDash([]);
    }
    M.atoms.forEach((atom, i) => glow(pts[i].x, pts[i].y, 0.08 * pts[i].s * k, C[atom.k], 0.26 * a));
  }

  function drawOpening() {
    const { A, B, e } = OP.st;
    const L = openLayout();
    const appear = reduce ? 1 : ease(OP.age / 2.2);
    const live = reduce ? 0 : 1;
    const globeW = weightOf(KI.globe);
    const R = drawGlobe([0, 0, 0], appear * globeW, 1 / 0.58, { dots: false, sites: false });
    OP.cs = Math.cos(S.globeSpin);
    OP.sn = Math.sin(S.globeSpin);
    const pc = project([0, 0, 0]);
    const press = S.narrow ? 70 : 120;
    const reach = Math.max(S.w, S.h) * 0.75;
    const scanY = Math.sin(S.t * 0.45) * R * 1.1;
    const near = [];
    const hasPtr = S.px > -999 && (!coarse || S.t - OP.ptrT < 2.5);
    const lensR = S.narrow ? 56 : 78;
    const lw = appear * globeW;
    const playful = B <= KI.lineup;
    ctx.globalCompositeOperation = "lighter";

    const ltx = hasPtr ? S.px : pc.x + Math.cos(S.t * 0.37) * R * pc.s * 0.5;
    const lty = hasPtr ? S.py : pc.y + Math.sin(S.t * 0.53) * R * pc.s * 0.42;
    if (!OP.lensOn) {
      OP.lx = ltx;
      OP.ly = lty;
      OP.lensOn = true;
    }
    OP.lx = lerp(OP.lx, ltx, hasPtr ? 0.35 : 0.06);
    OP.ly = lerp(OP.ly, lty, hasPtr ? 0.35 : 0.06);
    const lensPts = [];

    const dive = (A === KI.lineup && B === KI.micro ? Math.sin(Math.PI * e) : A === KI.globe && B === KI.tablet ? Math.sin(Math.PI * e) * 0.45 : 0) * live;
    if (dive > 0.01) {
      const far = Math.hypot(S.w, S.h) * 0.6;
      for (let i = 0; i < 110; i += 1) {
        const sd = OPEN_SEED[i * 6];
        const ang = sd * TAU * 7.3;
        const u = (sd * 3.1 + S.t * (0.35 + sd * 0.4)) % 1;
        const r0 = lerp(pc.s * 0.25, far, u * u);
        const len = (20 + 140 * u) * dive;
        ctx.strokeStyle = rgba(i % 4 ? C.ice : C.cyan, 0.32 * dive * (1 - u * 0.6));
        ctx.lineWidth = 0.6 + u;
        ctx.beginPath();
        ctx.moveTo(pc.x + Math.cos(ang) * r0, pc.y + Math.sin(ang) * r0);
        ctx.lineTo(pc.x + Math.cos(ang) * (r0 + len), pc.y + Math.sin(ang) * (r0 + len));
        ctx.stroke();
      }
    }

    for (const r of OP.ripples) {
      const k = 1 - r.t / 1.8;
      ctx.strokeStyle = rgba(C.cyan, 0.22 * k * k);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.t * reach, 0, TAU);
      ctx.stroke();
    }

    for (let i = 0; i < OPEN_N; i += 1) {
      const seed = OPEN_SEED[i];
      const fa = formAt(A, i, L);
      let f = fa;
      let ei = 0;
      if (A !== B) {
        const fb = formAt(B, i, L);
        ei = ease(clamp((e - seed * 0.35) / 0.65, 0, 1));
        const swirl = Math.sin(ei * Math.PI) * 0.2 * live;
        const w = mix(fa.w, fb.w, ei);
        f = {
          w: [w[0] - (fb.w[1] - fa.w[1]) * swirl * 0.3, w[1] + (fb.w[0] - fa.w[0]) * swirl * 0.3, w[2] + swirl],
          col: mixC(fa.col, fb.col, ei),
          size: lerp(fa.size, fb.size, ei),
          a: lerp(fa.a, fb.a, ei),
        };
      }
      const q = project(f.w);
      const front = q.z >= pc.z - 0.1;
      let alpha = appear * f.a * (0.65 + 0.35 * Math.sin(S.t * 1.4 + seed * 40));
      let size = f.size;
      if (fa.globe) {
        alpha *= front ? 0.9 : lerp(0.14, 0.9, ei);
        const band = (1 - ei) * Math.max(0, 1 - Math.abs(fa.w[1] - scanY) / 0.14);
        alpha *= 1 + band * 1.4;
        size *= 1 + band * 0.5;
      }
      let { x, y } = q;
      for (const r of OP.ripples) {
        const rx = x - r.x;
        const ry = y - r.y;
        const rd = Math.hypot(rx, ry);
        const off = Math.abs(rd - r.t * reach);
        if (off < 60) {
          const k = (1 - off / 60) * (1 - r.t / 1.8);
          x += (rx / (rd || 1)) * k * 26;
          y += (ry / (rd || 1)) * k * 26;
          alpha *= 1 + k * 2.2;
        }
      }
      const dx = x - S.px;
      const dy = y - S.py;
      const dd = Math.hypot(dx, dy);
      if (live && playful && dd < press) {
        const k = (1 - dd / press) ** 2;
        x += (dx / (dd || 1)) * k * 22;
        y += (dy / (dd || 1)) * k * 22;
        alpha *= 1 + k * 2;
      }
      if (playful && lw < 0.3 && dd < press && near.length < 120) near.push({ x, y, f: 1 - dd / press });
      if (lw > 0.01 && front && lensPts.length < 46 && Math.hypot(x - OP.lx, y - OP.ly) < lensR - 6) lensPts.push({ x, y, seed, col: f.col });
      dot(x, y, size * q.s, f.col, alpha);
      if (seed < 0.06 || seed > 0.97) glow(x, y, size * q.s * 6, f.col, 0.2 * alpha);
    }

    if (lw > 0.01) {
      ctx.globalCompositeOperation = "source-over";
      ctx.save();
      ctx.beginPath();
      ctx.arc(OP.lx, OP.ly, lensR, 0, TAU);
      ctx.clip();
      ctx.fillStyle = `rgba(4, 9, 28, ${0.72 * lw})`;
      ctx.fillRect(OP.lx - lensR, OP.ly - lensR, lensR * 2, lensR * 2);
      ctx.globalCompositeOperation = "lighter";
      const g = ctx.createRadialGradient(OP.lx, OP.ly, 0, OP.lx, OP.ly, lensR);
      g.addColorStop(0, rgba(C.blue, 0.16 * lw));
      g.addColorStop(1, rgba(C.blue, 0));
      ctx.fillStyle = g;
      ctx.fillRect(OP.lx - lensR, OP.ly - lensR, lensR * 2, lensR * 2);
      for (const q of lensPts) {
        const rr = S.narrow ? 4.2 : 5.6;
        const rot = q.seed * TAU + S.t * 0.6 * live;
        const ring = [];
        for (let j = 0; j < 6; j += 1) ring.push([q.x + Math.cos(rot + (j * TAU) / 6) * rr, q.y + Math.sin(rot + (j * TAU) / 6) * rr]);
        ctx.strokeStyle = rgba(q.col, 0.75 * lw);
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        ring.forEach(([x, y], j) => (j ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.closePath();
        if (q.seed < 0.5) {
          ctx.moveTo(ring[0][0], ring[0][1]);
          ctx.lineTo(ring[0][0] + Math.cos(rot) * rr, ring[0][1] + Math.sin(rot) * rr);
        }
        ctx.stroke();
        ring.forEach(([x, y], j) => dot(x, y, 1.1, j % 3 ? C.cyan : C.violet, 0.9 * lw));
      }
      ctx.restore();
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = rgba(C.cyan, 0.6 * lw);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(OP.lx, OP.ly, lensR, 0, TAU);
      ctx.stroke();
      for (let j = 0; j < 24; j += 1) {
        const a = (j / 24) * TAU + S.t * 0.15;
        ctx.strokeStyle = rgba(C.ice, (j % 6 ? 0.25 : 0.55) * lw);
        ctx.beginPath();
        ctx.moveTo(OP.lx + Math.cos(a) * (lensR + 3), OP.ly + Math.sin(a) * (lensR + 3));
        ctx.lineTo(OP.lx + Math.cos(a) * (lensR + (j % 6 ? 6 : 11)), OP.ly + Math.sin(a) * (lensR + (j % 6 ? 6 : 11)));
        ctx.stroke();
      }
      const hint = lw * clamp(1 - OP.moved / 900, 0, 1) * clamp((OP.age - 1.6) / 1, 0, 1);
      if (S.narrow) canvasLabel("Look closer", OP.lx, OP.ly + lensR + 22, 0.8 * hint);
      else canvasLabel(hasPtr ? "Look closer" : "Look closer  ·  move me", OP.lx + lensR + 22, OP.ly, 0.8 * hint, { align: "start" });
    }

    if (live && near.length > 1) {
      ctx.lineWidth = 0.8;
      const link = S.narrow ? 34 : 46;
      for (let i = 0; i < near.length; i += 1) {
        for (let j = i + 1; j < near.length; j += 1) {
          const P1 = near[i];
          const P2 = near[j];
          const d = Math.hypot(P1.x - P2.x, P1.y - P2.y);
          if (d > link) continue;
          ctx.strokeStyle = rgba(i % 3 ? C.cyan : C.violet, (1 - d / link) * 0.9 * Math.sqrt(Math.min(P1.f, P2.f)) * appear);
          ctx.beginPath();
          ctx.moveTo(P1.x, P1.y);
          ctx.lineTo(P2.x, P2.y);
          ctx.stroke();
        }
      }
    }

    OBJ.forEach((name, g) => {
      const k = KI[name];
      const a = weightOf(k) ** 2;
      if (a > 0.01) {
        const q = project([0, name === "drop" ? -1.35 : name === "material" ? -1.55 : -1.15, 0]);
        canvasLabel(OBJ_LABEL[g], q.x, q.y + 18, 0.75 * a);
      }
      const la = weightOf(KI.lineup) ** 2;
      if (la > 0.01) {
        const q = project(add(L.lp[g], [0, -L.lk * 1.45, 0]));
        canvasLabel(OBJ_LABEL[g], q.x, q.y + 12, 0.7 * la, { size: S.narrow ? 8 : 10 });
      }
    });

    const mw = weightOf(KI.micro) ** 2;
    if (mw > 0.01) OBJ_MOL.forEach((m, g) => drawBonds(MOLS[m], L.lp[g], g, L.ms, mw, COMP[g]));

    const sw = weightOf(KI.separation);
    if (sw > 0.01) {
      const T = A === KI.separation || B === KI.separation ? localT(KI.separation) : 0;
      const P = (x, y) => project([x * L.sx, y, 0]);
      const top0 = P(SEP.X0, SEP.Y0 + 0.16);
      const top1 = P(SEP.XD, SEP.Y0 + 0.16);
      const bot0 = P(SEP.X0, SEP.Y0 - 0.16);
      const bot1 = P(SEP.XD, SEP.Y0 - 0.16);
      ctx.strokeStyle = rgba(C.ice, 0.35 * sw);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(top0.x, top0.y);
      ctx.lineTo(top1.x, top1.y);
      ctx.moveTo(bot0.x, bot0.y);
      ctx.lineTo(bot1.x, bot1.y);
      ctx.stroke();
      const d0 = P(SEP.XD, SEP.Y0 + 0.24);
      const d1 = P(SEP.XD + 0.24, SEP.Y0 - 0.24);
      let hot = 0;
      SEP.speed.forEach((_, g) => {
        const b = sepBand(g, T);
        const near = Math.max(0, 1 - Math.abs(b.cx - SEP.XD) / (b.bw * 3 + 0.05));
        hot = Math.max(hot, near);
        if (b.past > 0 && OP.flash[g] < 0) OP.flash[g] = S.t;
        if (b.past <= 0) OP.flash[g] = -9;
      });
      ctx.strokeStyle = rgba(C.cyan, (0.45 + hot * 0.55) * sw);
      ctx.strokeRect(d0.x, d0.y, d1.x - d0.x, d1.y - d0.y);
      glow((d0.x + d1.x) / 2, (d0.y + d1.y) / 2, (0.25 + hot * 0.3) * d0.s, C.cyan, (0.15 + hot * 0.6) * sw);
      const lab = S.narrow ? 8 : 10;
      canvasLabel("Sample", top0.x, top0.y - 16, 0.6 * sw, { size: lab, align: "start" });
      const mid = P((SEP.X0 + SEP.XD) / 2, SEP.Y0 + 0.16);
      canvasLabel("Column", mid.x, mid.y - 16, 0.6 * sw, { size: lab });
      canvasLabel("Detector", (d0.x + d1.x) / 2, d0.y - 16, 0.75 * sw, { size: lab, col: C.cyan });

      const base0 = P(SEP.T0, SEP.YT);
      const base1 = P(SEP.T1, SEP.YT);
      ctx.strokeStyle = rgba(C.ice, 0.2 * sw);
      ctx.beginPath();
      ctx.moveTo(base0.x, base0.y);
      ctx.lineTo(base1.x, base1.y);
      ctx.stroke();
      canvasLabel("Time →", base1.x, base1.y + 18, 0.55 * sw, { size: lab, align: "end" });
      canvasLabel("Signal", base0.x, base0.y - 18, 0.55 * sw, { size: lab, align: "start" });
      const head = lerp(SEP.T0, SEP.T1, T);
      const sig = (x) => SEP_PEAK.reduce((s, pk) => s + pk.h * Math.exp(-((x - pk.x) ** 2) / (2 * pk.sig * pk.sig)), 0);
      SEP_PEAK.forEach((pk, g) => {
        if (head < pk.x - pk.sig * 3) return;
        ctx.fillStyle = rgba(C[COMP[g]], 0.16 * sw);
        ctx.beginPath();
        const x0 = pk.x - pk.sig * 3;
        const x1 = Math.min(head, pk.x + pk.sig * 3);
        ctx.moveTo(P(x0, SEP.YT).x, P(x0, SEP.YT).y);
        for (let x = x0; x <= x1; x += pk.sig / 6) {
          const q = P(x, SEP.YT + pk.h * Math.exp(-((x - pk.x) ** 2) / (2 * pk.sig * pk.sig)));
          ctx.lineTo(q.x, q.y);
        }
        ctx.lineTo(P(x1, SEP.YT).x, P(x1, SEP.YT).y);
        ctx.fill();
      });
      const trace = [];
      for (let x = SEP.T0; x <= head; x += (SEP.T1 - SEP.T0) / 220) trace.push(P(x, SEP.YT + sig(x)));
      if (trace.length > 1) {
        strokePts(trace, C.cyan, 0.9 * sw, 1.6);
        const tip = trace[trace.length - 1];
        if (T < 0.999) glow(tip.x, tip.y, 0.12 * tip.s, C.cyan, 0.9 * sw);
      }
      SEP_PEAK.forEach((pk, g) => {
        const ft = S.t - OP.flash[g];
        if (OP.flash[g] > 0 && ft < 1.2) {
          const q = P(pk.x, SEP.YT + pk.h);
          glow(q.x, q.y, (0.15 + ft * 0.5) * q.s, C[COMP[g]], (1 - ft / 1.2) * 0.9 * sw);
        }
        const b = sepBand(g, T);
        const settle = sm((b.past / (b.len * 0.35) - 0.8) / 0.2);
        const tp = sepTop(g);
        drawBonds(ANA[g], [tp[0] * L.sx, tp[1], 0], g, 0.34, settle * sw, COMP[g]);
      });
    }

    let vig = "cells";
    const P2 = (x, y, part = 1) => project([...vmap(vig, part, x, y), 0]);
    const lab = S.narrow ? 8 : 10;
    const axes = (G, a, xl, yl) => {
      const o = P2(G.X0, G.Y0);
      const xe = P2(G.X1, G.Y0);
      const ye = P2(G.X0, G.Y1);
      ctx.strokeStyle = rgba(C.ice, 0.22 * a);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(ye.x, ye.y);
      ctx.lineTo(o.x, o.y);
      ctx.lineTo(xe.x, xe.y);
      ctx.stroke();
      canvasLabel(xl, xe.x, xe.y + 16, 0.55 * a, { size: lab, align: "end" });
      canvasLabel(yl, ye.x, ye.y - 14, 0.55 * a, { size: lab, align: "start" });
    };
    const curve = (G, f, head, a, col) => {
      const pts = [];
      for (let u = 0; u <= head; u += 1 / 160) pts.push(P2(lerp(G.X0, G.X1, u), lerp(G.Y0, G.Y1, f(u))));
      if (pts.length < 2) return null;
      strokePts(pts, col, 0.9 * a, 1.6);
      const tip = pts[pts.length - 1];
      if (head < 0.999) glow(tip.x, tip.y, 0.12 * tip.s, col, 0.9 * a);
      return tip;
    };

    const bw = weightOf(KI.cells);
    if (bw > 0.01) {
      const T = localT(KI.cells);
      const V = CELLS;
      vig = "cells";
      const l0 = P2(V.LX, V.SY + 0.32, 0);
      const l1 = P2(V.LX, V.SY - 0.32, 0);
      const near = Array.from({ length: V.n }, (_, c) => Math.max(0, 1 - Math.abs((T - (c / V.n) * 0.72) / 0.22 - 1) / 0.08)).reduce((m, v) => Math.max(m, v), 0);
      const lg = ctx.createLinearGradient(l0.x, l0.y, l1.x, l1.y);
      lg.addColorStop(0, rgba(C.cyan, 0));
      lg.addColorStop(0.5, rgba(C.cyan, (0.55 + near * 0.45) * bw));
      lg.addColorStop(1, rgba(C.cyan, 0));
      ctx.strokeStyle = lg;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(l0.x, l0.y);
      ctx.lineTo(l1.x, l1.y);
      ctx.stroke();
      const lc = P2(V.LX, V.SY, 0);
      glow(lc.x, lc.y, (0.12 + near * 0.2) * lc.s, C.cyan, (0.3 + near * 0.6) * bw);
      canvasLabel("Laser", l0.x, l0.y - 12, 0.75 * bw, { size: lab, col: C.cyan });
      const s0 = P2(-2.15, V.SY + 0.16, 0);
      canvasLabel("Cells, single file", s0.x, s0.y, 0.6 * bw, { size: lab, align: "start" });
      axes({ X0: V.X0, X1: V.X1, Y0: V.Y0, Y1: V.Y1 }, bw, "Marker 1 →", "Marker 2 ↑");
    }

    const dw = weightOf(KI.dx);
    if (dw > 0.01) {
      const T = localT(KI.dx);
      const G = DX.G;
      vig = "dx";
      const pr = P2(DX.probe[0], DX.probe[1], 0);
      const got = dxCaptured(T);
      ctx.strokeStyle = rgba(C.mint, (0.35 + got * 0.5) * dw);
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.arc(pr.x, pr.y, 0.2 * pr.s * (S.narrow ? 0.92 : 1), 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      glow(pr.x, pr.y, 0.25 * pr.s, C.mint, (0.15 + got * 0.5) * dw);
      const sl = P2(DX.cx, DX.cy + 0.78, 0);
      canvasLabel("Patient sample", sl.x, sl.y, 0.6 * dw, { size: lab });
      canvasLabel("Capture", pr.x, pr.y - 0.32 * pr.s, 0.6 * dw, { size: lab, col: C.mint });
      axes(G, dw, "Time →", "Signal");
      const th0 = P2(G.X0, lerp(G.Y0, G.Y1, G.thr));
      const th1 = P2(G.X1, lerp(G.Y0, G.Y1, G.thr));
      ctx.strokeStyle = rgba(C.violet, 0.5 * dw);
      ctx.setLineDash([4, 5]);
      ctx.beginPath();
      ctx.moveTo(th0.x, th0.y);
      ctx.lineTo(th1.x, th1.y);
      ctx.stroke();
      ctx.setLineDash([]);
      canvasLabel("Threshold", th1.x, th1.y - 12, 0.5 * dw, { size: lab, align: "end", col: C.violet });
      curve(G, (u) => 0.04 + dxCaptured(u) * 0.9 + Math.sin(u * 90) * 0.006, T, dw, C.mint);
      if (got > G.thr) {
        const k = sm((got - G.thr) / 0.08);
        const q = P2((G.X0 + G.X1) / 2, G.Y1 + 0.34);
        canvasLabel("Target detected", q.x, q.y, k * dw, { size: lab + 2, col: C.mint });
      }
    }

    const hw = weightOf(KI.heat);
    if (hw > 0.01) {
      const T = localT(KI.heat);
      const G = HEAT.G;
      vig = "heat";
      const m = heatMelt(T);
      axes(G, hw, "Temperature →", "Heat flow");
      const tip = curve(G, (u) => 0.08 + heatFlow(u) * 0.95, T, hw, C.violet);
      const pk = P2(lerp(G.X0, G.X1, HEAT.Tm), lerp(G.Y0, G.Y1, 0.08 + heatFlow(HEAT.Tm) * 0.95));
      if (T > HEAT.Tm + 0.02) canvasLabel("Melting point", pk.x + 12, pk.y + 4, sm((T - HEAT.Tm - 0.02) / 0.05) * hw, { size: lab, col: C.violet, align: "start" });
      const st = P2(HEAT.X, HEAT.Y + 0.72, 0);
      canvasLabel(m < 0.2 ? "Solid" : m < 0.85 ? "Melting" : "Liquid", st.x, st.y, 0.7 * hw, { size: lab });
      if (tip) {
        const bar0 = P2(HEAT.X - 1.05, HEAT.Y - 0.3, 0);
        const bar1 = P2(HEAT.X - 1.05, HEAT.Y + 0.5, 0);
        ctx.strokeStyle = rgba(C.ice, 0.18 * hw);
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(bar0.x, bar0.y);
        ctx.lineTo(bar1.x, bar1.y);
        ctx.stroke();
        ctx.strokeStyle = rgba(mixC(C.blue, C.violet, T), 0.9 * hw);
        ctx.beginPath();
        ctx.moveTo(bar0.x, bar0.y);
        ctx.lineTo(bar0.x, lerp(bar0.y, bar1.y, T));
        ctx.stroke();
        ctx.lineWidth = 1;
        canvasLabel("Heat", bar0.x, bar0.y + 14, 0.55 * hw, { size: lab });
      }
    }

    const qw = weightOf(KI.quad) ** 2;
    if (qw > 0.01) {
      DIVISIONS.forEach((name, g) => {
        const a = (g / 4) * TAU - Math.PI * 0.75 + (reduce ? 0 : S.t) * 0.12;
        const q = project([Math.cos(a) * L.qr, Math.sin(a) * L.qr * L.qy + 0.05 - 0.42, 0]);
        canvasLabel(name, q.x, q.y, 0.8 * qw, { size: lab, col: C[COMP[g]] });
      });
    }

    const cw = weightOf(KI.core);
    if (cw < 0.5) OP.shock = false;
    else if (cw > 0.96 && !OP.shock) {
      OP.shock = true;
      if (live) OP.ripples.push({ x: pc.x, y: pc.y, t: 0 });
    }
    if (cw > 0.01) {
      glow(pc.x, pc.y, 1.3 * pc.s * cw, C.blue, 0.26 * cw);
      glow(pc.x, pc.y, 0.45 * pc.s, C.cyan, 0.65 * cw);
      glassSphere(pc.x, pc.y, 0.2 * pc.s * cw, C.cyan, cw);
    }
  }

  function drawOpeningAfterglow(dt) {
    OP.after = Math.max(0, OP.after - dt / 0.9);
    const c = project([0, 0, 0]);
    ctx.globalCompositeOperation = "lighter";
    glow(c.x, c.y, 0.6 * c.s, C.cyan, 0.55 * OP.after);
  }

  function setOpenK(el, k, r = 1) {
    const v = Math.round(clamp(k, 0, 1) * 1000) / 1000;
    const rv = Math.round(clamp(r, 0, 1) * 1000) / 1000;
    if (el._k === v && el._r === rv) return;
    el._k = v;
    el._r = rv;
    el.style.setProperty("--k", v);
    el.style.setProperty("--r", rv);
    el.style.visibility = v <= 0.001 ? "hidden" : "visible";
  }

  function syncOpening() {
    const p = OP.p;
    const ready = reduce ? 1 : clamp((OP.age - 0.9) / 1.4, 0, 1);
    opEls.lines.forEach((el) => {
      const W = OPEN_BEATS[el.dataset.beat];
      const k = win(p, W);
      const rising = p <= W[2];
      const r = (rising ? k : 1) * (el.dataset.beat === "see" ? ready : 1);
      setOpenK(el, rising ? (r > 0 ? 1 : 0) : k, r);
    });
    if (opEls.scale) {
      const n = scaleExp(p);
      if (opEls.scale._n !== n) {
        opEls.scale._n = n;
        opEls.scale.querySelector("b").innerHTML = `≈ 10<sup>${n < 0 ? "−" + -n : n}</sup> m`;
        const mark = SCALE_MARKS[n];
        const em = opEls.scale.querySelector("em");
        if (mark) em.textContent = mark;
        em.classList.toggle("is-on", !!mark);
      }
      setOpenK(opEls.scale, ready * (1 - sm((p - 0.55) / 0.03)));
    }
    setOpenK(opEls.cue, clamp((OP.age - 2.4) / 1, 0, 1) * (1 - sm(p / 0.04)));
    opEls.bar.style.transform = `scaleY(${p.toFixed(4)})`;
  }

  /* ---------- frame ---------- */

  function targets() {
    const active = S.active;
    const youLit = active === "you" && S.youT > 5.4;
    if (S.opening) {
      ORDER.forEach((id) => Object.assign(S.fx[id], { ta: 0, tk: 1, topen: 0 }));
      S.fx.core.ta = 0;
      return;
    }
    ORDER.forEach((id) => {
      const fx = S.fx[id];
      let a;
      if (S.finale) a = 1 - ease(S.closing * 1.2);
      else if (active) a = id === active ? 1 : active === "you" ? (youLit ? 0.22 : 0.04) : 0.15;
      else if (S.hover) a = id === S.hover ? 1 : 0.26;
      else a = S.intro ? (id === "you" ? 0.45 : 0.72) : id === "you" ? 0.6 : 0.92;
      fx.ta = a * ease(S.assemble * 1.3 - ORDER.indexOf(id) * 0.08) * (1 - ease(S.uniK));
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
    core.ta *= 1 - ease(S.uniK);
  }

  function cameraTargets() {
    if (S.opening) return openingCamera();
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
    if (S.intro && !active && !S.finale && !S.narrow) {
      shift = S.w * 0.16;
      zoom = 0.86;
    }
    if (S.finale) zoom = (S.narrow ? 0.78 : 1) * (1 - ease(S.closing) * 0.25);
    let shiftY = S.narrow && !S.finale ? -S.h * (active ? 0.27 : S.intro ? 0.16 : 0) : 0;
    if (S.uniK > 0.001) {
      const u = ease(S.uniK);
      zoom *= 1 + 1.6 * u;
      shift *= 1 - u;
      shiftY *= 1 - u;
    }
    return { cam, zoom, shift, shiftY };
  }

  function frame(time) {
    if (!S.open) return;
    const dt = S.last ? Math.min(0.05, (time - S.last) / 1000) : 0.016;
    S.last = time;
    const speed = reduce ? 0.25 : 1;
    S.t += dt * speed;
    S.assemble = S.opening ? 0 : Math.min(1, S.assemble + dt / (reduce ? 0.2 : 2.4));
    S.closing = clamp(S.closing + (S.finale ? dt / 1.4 : -dt / 0.8), 0, 1);
    if (S.active === "you") S.youT += dt;
    S.smx = lerp(S.smx, S.mx, Math.min(1, dt * 3));
    S.smy = lerp(S.smy, S.my, Math.min(1, dt * 3));

    if (S.ride) return;

    S.uniK = lerp(S.uniK, uniOn() ? 1 : 0, Math.min(1, dt * (reduce ? 8 : 1.6)));
    if (S.opening) tickOpening(dt);
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
    const idleYaw = S.active ? 0 : Math.sin(S.t * 0.11) * (S.opening ? 0.12 : 0.3);
    S.yaw = lerp(S.yaw, idleYaw + S.smx * (S.active ? 0.14 : S.opening ? 0.22 : 0.38), kc);
    S.pitch = lerp(S.pitch, 0.16 + S.smy * (S.active ? 0.06 : S.opening ? 0.1 : 0.16), kc);
    S.hud = lerp(S.hud, S.opening ? 0.3 * (1 - OP.sep) : S.intro ? 0.4 : 1, Math.min(1, dt * 1.5));

    for (const d of S.dust) {
      d.p[0] += d.v[0] * dt * speed;
      d.p[1] += d.v[1] * dt * speed;
      if (d.p[1] > 4) d.p[1] = -4;
    }

    ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
    drawBackdrop();
    if (S.opening) {
      S.uni?.draw(dt, 0);
      drawOpening();
      ctx.globalCompositeOperation = "source-over";
      syncOpening();
      S.raf = requestAnimationFrame(frame);
      return;
    }
    if (OP.after > 0) drawOpeningAfterglow(dt);
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
    S.uni?.draw(dt, S.uniK, S.proj.technology);

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
      (opEls.box
        ? `<button type="button" class="wm-rail-btn wm-rail-open" data-step="open" title="Prologue"><span>00</span><em>Prologue</em></button>`
        : "") +
      ORDER.map((id, i) => {
        const c = comp(id);
        return `<button type="button" class="wm-rail-btn" data-step="${i}" title="${esc(c.label)}"><span>${c.index}</span><em>${esc(c.label)}</em></button>`;
      }).join("") +
      `<button type="button" class="wm-rail-btn wm-rail-ira" data-step="6" title="IRA"><span>IRA</span><em>What's next</em></button>`;
    els.rail.querySelectorAll(".wm-rail-btn").forEach((b) =>
      b.addEventListener("click", () => (b.dataset.step === "open" ? enterOpening(0) : goStep(Number(b.dataset.step))))
    );
    els.sources.querySelector(".wm-sources-list").innerHTML = S.data.sources
      .map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label)}</a></li>`)
      .join("");
  }

  /* Labels are pinned to 3D anchors; on short screens they collide. Nudge overlapping pills
     apart vertically and keep them below the top chapter rail. y is each pill's bottom edge. */
  function spreadLabels(boxes) {
    const gap = 6;
    const rb = els.rail?.getBoundingClientRect();
    const rootTop = root.getBoundingClientRect().top;
    const minBottom = (rb && rb.height ? rb.bottom - rootTop : 0) + gap;
    const maxBottom = root.clientHeight - 40;
    for (let it = 0; it < 8; it += 1) {
      let moved = false;
      boxes.forEach((a) => {
        a.y = Math.min(maxBottom, Math.max(a.y, minBottom + a.h));
      });
      for (let i = 0; i < boxes.length; i += 1) {
        for (let j = i + 1; j < boxes.length; j += 1) {
          const a = boxes[i];
          const b = boxes[j];
          if (Math.abs(a.x - b.x) * 2 >= a.w + b.w + gap * 2) continue;
          const [up, dn] = a.y <= b.y ? [a, b] : [b, a];
          const overlap = up.y + gap - (dn.y - dn.h);
          if (overlap <= 0) continue;
          up.y -= overlap / 2;
          dn.y += overlap / 2;
          moved = true;
        }
      }
      if (!moved) break;
    }
  }

  function syncDom() {
    root.classList.toggle("is-intro", S.intro);
    const showLabels = !S.intro && !S.active && !S.finale && S.assemble > 0.7;
    els.labels.classList.toggle("is-show", showLabels);
    const boxes = [];
    els.labels.querySelectorAll(".wm-label").forEach((b) => {
      const id = b.dataset.part;
      const p = S.proj[id];
      if (!p) return;
      const L = LAYOUT[id].label;
      const q = project(add(posOf(id), L));
      if (!b._w || b._wAt !== innerWidth) {
        b._w = b.offsetWidth;
        b._h = b.offsetHeight;
        b._wAt = innerWidth;
      }
      boxes.push({ b, id, x: q.x, y: q.y, w: b._w, h: b._h });
    });
    spreadLabels(boxes);
    boxes.forEach(({ b, id, x, y }) => {
      b._y = b._y == null ? y : b._y + (y - b._y) * 0.25;
      b.style.transform = `translate(${Math.round(x)}px, ${Math.round(b._y)}px) translate(-50%, -100%)`;
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

  const DIV_COLORS = ["cyan", "violet", "mint", "blue"];
  const divColor = (name) => {
    const i = (S.data?.company.divisions || []).findIndex((d) => d.name === name);
    return rgba(C[DIV_COLORS[Math.max(0, i)]], 1);
  };
  const divChips = (names) =>
    `<span class="wm-div-chips">${names.map((n) => `<span style="--c:${divColor(n)}">${esc(n)}</span>`).join("")}</span>`;

  function divisionHTML(d) {
    return `<p class="wm-div-her">${esc(d.heritage)}</p>
      <p class="wm-div-q">${esc(d.question)}</p>
      <p class="wm-div-simple">${esc(d.simple)}</p>
      <h4>How it works</h4>
      <p class="wm-div-how">${esc(d.how)}</p>
      <h4>Key technologies</h4>
      <ul class="wm-div-tech">${d.tech
        .map(
          (t) => `<li><strong>${esc(t.name)}</strong><span>${esc(t.what)}</span>${
            t.status === "pending"
              ? `<small class="wm-pending">Pending validation${t.source ? ` · <a href="${esc(t.source)}" target="_blank" rel="noopener">source</a>` : ""}</small>`
              : ""
          }</li>`
        )
        .join("")}</ul>
      <h4>Where it's used</h4>
      <div class="wm-div-used">${d.used.map((u) => `<span>${esc(u)}</span>`).join("")}</div>
      <p class="wm-plain"><span>For example</span>${esc(d.example)}</p>`;
  }

  function uniTextHTML(u) {
    return `<button type="button" class="wm-uni-return">← Back to the interactive universe</button>
      <p class="wm-uni-tlegend">${esc(u.legend.simulation)}. ${esc(u.legend.labels)}. ${esc(u.legend.products)}.</p>
      <h3>${esc(u.title)}</h3>
      <ul class="wm-uni-tlist">${u.areas
        .map(
          (a) => `<li style="--c:${divColor(a.division)}"><strong>${esc(a.division)}</strong>
            <span>${esc(a.question)} ${esc(a.teaser)}</span>
            <em>${a.experience === "available" ? "Interactive journeys available" : "Interactive experience in progress"}</em>
            ${a.note ? `<span class="wm-muted">${esc(a.note)}</span>` : ""}</li>`
        )
        .join("")}</ul>`;
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
        <div class="wm-div-tabs" role="tablist" aria-label="Waters divisions">${divs
          .map(
            (d, i) => `<button type="button" role="tab" class="wm-div-tab${i === S.division ? " is-on" : ""}" data-div="${i}"
              aria-selected="${i === S.division}" style="--c:${rgba(C[DIV_COLORS[i]], 1)}"><i></i><strong>${esc(d.name)}</strong><span>${esc(d.what)}</span></button>`
          )
          .join("")}</div>
        <article class="wm-div" role="tabpanel" style="--c:${rgba(C[DIV_COLORS[S.division]], 1)}">${divisionHTML(divs[S.division])}</article>
        <p class="wm-plain"><span>How they fit together</span>${esc(c.together)}</p>`;
    },
    impact(c) {
      return `${kicker(c)}<h2>${esc(c.title)}</h2>
        <p class="wm-lead">${esc(c.lead)}</p>
        <ul class="wm-areas">${c.areas
          .map(
            (a, i) => `<li data-area="${i}" tabindex="0"><i style="--c:${rgba(AREA_COLORS[i], 1)}"></i>
              <div><strong>${esc(a.name)}</strong><span>${esc(a.what)}</span>${a.divisions ? divChips(a.divisions) : ""}</div></li>`
          )
          .join("")}</ul>
        ${
          c.more
            ? `<h3>And beyond</h3><ul class="wm-areas is-more">${c.more
                .map((a) => `<li><div><strong>${esc(a.name)}</strong><span>${esc(a.what)}</span>${divChips(a.divisions)}</div></li>`)
                .join("")}</ul>`
            : ""
        }
        <p class="wm-plain"><span>The point</span>Not just measuring things — helping scientists make better decisions.</p>`;
    },
    technology(c) {
      const u = S.uni && c.universe;
      return `${kicker(c)}<h2 tabindex="-1">${esc(c.title)}</h2>
        ${u ? uniTextHTML(c.universe) : ""}
        <p class="wm-lead">${esc(c.lead)}</p>
        <div class="wm-chambers">${c.chambers
          .map(
            (ch, i) => `<article class="wm-chamber${S.chamber === i ? " is-on" : ""}" data-ch="${i}" tabindex="0">
              <header><span class="wm-ch-tag">${esc(ch.short)}</span><strong>${esc(ch.name)}</strong></header>
              <ol class="wm-steps">${ch.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>
              <p>${esc(ch.simple)}</p>
              <button type="button" class="wm-ride-enter" data-ride="${i === 1 ? "ms" : "lc"}" data-track="observe">How it works →</button>
              <button type="button" class="wm-ride-enter is-dive" data-ride="${i === 1 ? "ms" : "lc"}" data-track="ride">${i === 1 ? "Ride the ions" : "Become the sample"} →</button>
              <button type="button" class="wm-deep-btn" aria-expanded="false">Explain deeper</button>
              <div class="wm-deeper" hidden><span>The technical version</span>${esc(ch.deeper)}</div>
            </article>`
          )
          .join("")}</div>
        <p class="wm-plain"><span>Together</span>Think of it as separating and identifying what's inside a sample.</p>
        ${
          c.beyond
            ? `<h3>Beyond LC–MS <small>the other three divisions</small></h3>
              <div class="wm-chambers is-beyond">${c.beyond
                .map(
                  (b) => `<article class="wm-chamber is-beyond" style="--c:${divColor(b.division)}">
                    <header><span class="wm-ch-tag">${esc(b.short)}</span><strong>${esc(b.name)}</strong></header>
                    ${divChips([b.division])}
                    <ol class="wm-steps">${b.steps.map((x) => `<li>${esc(x)}</li>`).join("")}</ol>
                    <p>${esc(b.simple)}</p>
                    <button type="button" class="wm-deep-btn" aria-expanded="false">Explain deeper</button>
                    <div class="wm-deeper" hidden><span>The technical version</span>${esc(b.deeper)}</div>
                  </article>`
                )
                .join("")}</div>`
            : ""
        }`;
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
      els.panel.inert = false;
      return;
    }
    const c = comp(id);
    els.panel.dataset.part = id;
    const body = PANELS[id](c);
    els.panel.innerHTML = `<div class="wm-panel-body">${body}</div>${navFooter(id)}`;
    const hub = id === "technology" && uniOn();
    els.panel.classList.toggle("is-show", (id !== "you" || S.youStage >= 4) && !hub);
    els.panel.inert = hub;
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
          if (x.goto === "technology") {
            enterRide(/mass/i.test(x.name) ? "ms" : "lc");
            return;
          }
          if (x.goto) {
            goStep(ORDER.indexOf(x.goto));
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
    if (id === "science") {
      P.querySelectorAll("[data-div]").forEach((b) =>
        b.addEventListener("click", () => {
          S.division = Number(b.dataset.div);
          const divs = S.data.company.divisions;
          P.querySelectorAll("[data-div]").forEach((t) => {
            const on = t === b;
            t.classList.toggle("is-on", on);
            t.setAttribute("aria-selected", String(on));
          });
          const art = P.querySelector(".wm-div");
          art.style.setProperty("--c", rgba(C[DIV_COLORS[S.division]], 1));
          art.innerHTML = divisionHTML(divs[S.division]);
          art.classList.remove("is-swap");
          void art.offsetWidth;
          art.classList.add("is-swap");
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
      P.querySelector(".wm-uni-return")?.addEventListener("click", () => {
        S.uniText = false;
        renderPanel();
        setHint();
      });
      P.querySelectorAll("[data-ride]").forEach((b) =>
        b.addEventListener("click", (e) => {
          e.stopPropagation();
          enterRide(b.dataset.ride, b.dataset.track);
        })
      );
      P.querySelectorAll(".wm-chamber.is-beyond").forEach((card) =>
        card.querySelector(".wm-deep-btn").addEventListener("click", (e) => {
          const d = card.querySelector(".wm-deeper");
          d.hidden = !d.hidden;
          e.currentTarget.textContent = d.hidden ? "Explain deeper" : "Keep it simple";
          e.currentTarget.setAttribute("aria-expanded", String(!d.hidden));
        })
      );
      P.querySelectorAll(".wm-chamber:not(.is-beyond)").forEach((card) => {
        const on = () => {
          S.chamber = Number(card.dataset.ch);
          P.querySelectorAll(".wm-chamber").forEach((c) => c.classList.toggle("is-on", c === card));
        };
        card.addEventListener("mouseenter", on);
        card.addEventListener("focus", on);
        card.addEventListener("click", () => {
          on();
          enterRide(Number(card.dataset.ch) === 1 ? "ms" : "lc");
        });
        card.querySelector(".wm-deep-btn")?.addEventListener("click", (e) => {
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
    const key = uniOn()
      ? "universe"
      : S.active
      ? ["world", "people", "you"].includes(S.active) || S.level > 1
        ? "deep"
        : "active"
      : "overview";
    els.hint.textContent = S.finale ? "" : HINTS[key];
    root.classList.toggle("is-active", !!S.active);
    root.classList.toggle("is-universe", uniOn());
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
    if (S.active === id && id === "technology" && uniOn()) {
      /* the hub has its own depth; re-selecting the chapter keeps it */
    } else if (S.active === id) {
      if (["science", "impact", "technology"].includes(id)) {
        S.level = S.level > 1 ? 1 : 2;
        if (id === "technology" && S.level > 1 && S.chamber < 0) S.chamber = 0;
        renderPanel();
      }
    } else {
      if (S.active === "technology") S.uni?.leave();
      S.active = id;
      S.uniText = reduce;
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
    if (S.active === "technology") S.uni?.leave();
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

  function enterOpening(at = 0) {
    if (!opEls.box) return;
    leaveRide();
    if (S.finale) leaveFinale();
    S.active = null;
    S.level = 1;
    S.hover = null;
    S.globeTarget = null;
    renderPanel();
    setHint();
    startOpening(at);
  }

  function step(dir) {
    if (dir < 0 && !S.active && !S.finale && opEls.box) return enterOpening(0.99);
    if (S.finale) {
      if (dir < 0) goStep(ORDER.length - 1);
      return;
    }
    const i = S.active ? ORDER.indexOf(S.active) : -1;
    goStep(i + dir);
  }

  function enterFinale() {
    leaveRide();
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
    if (coarse && e.pointerType === "mouse") return;
    if (S.opening && S.px > -999) OP.moved += Math.hypot(e.clientX - r.left - S.px, e.clientY - r.top - S.py);
    S.px = e.clientX - r.left;
    S.py = e.clientY - r.top;
    OP.ptrT = S.t;
    if (S.intro || S.finale || S.opening) return;
    if (uniOn()) return S.uni.move(S.px, S.py);
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
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    if (S.opening) {
      if (OP.dragMoved > 6) return;
      if (!reduce) OP.ripples.push({ x, y, t: 0 });
      return;
    }
    if (uniOn()) return S.uni.click(x, y);
    const hit = hitTest(x, y);
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
    const inPanel = e.target.closest(".wm-panel, .wm-sources, .wm-uni-dive");
    if (inPanel && inPanel.scrollHeight > inPanel.clientHeight + 2) return;
    e.preventDefault();
    if (S.opening) {
      const px = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? S.h : 1);
      return openingNudge(clamp(px, -160, 160) / (S.h * 12));
    }
    const now = performance.now();
    if (now < OP.quietUntil) return;
    S.wheelAcc += e.deltaY;
    if (now < S.wheelLock) return;
    if (Math.abs(S.wheelAcc) > 40) {
      step(S.wheelAcc > 0 ? 1 : -1);
      S.wheelAcc = 0;
      S.wheelLock = now + 900;
    }
  }

  function onKey(e) {
    if (!S.open || S.ride) return;
    if (S.opening) {
      if (e.target.closest("button") && (e.key === "Enter" || e.key === " ")) return;
      const fwd = ["ArrowRight", "ArrowDown", "PageDown", " ", "Enter"].includes(e.key);
      const back = ["ArrowLeft", "ArrowUp", "PageUp"].includes(e.key);
      if (e.key === "Escape") endOpening();
      else if (fwd || back) openingStop(fwd ? 1 : -1);
      else return;
      e.preventDefault();
      return;
    }
    if (uniOn() && els.sources.hidden && S.uni.key(e)) {
      e.preventDefault();
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      if (!els.sources.hidden) els.sources.hidden = true;
      else if (S.finale) goStep(ORDER.length - 1);
      else if (S.active === "technology" && S.uni && S.uniText && !reduce) {
        S.uniText = false;
        renderPanel();
        setHint();
      }
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
  canvas.addEventListener("pointerdown", (e) => {
    OP.dragMoved = 0;
    if (uniOn() && e.pointerType !== "touch") {
      S.uni.down(e.clientX - canvas.getBoundingClientRect().left);
      root.classList.add("is-dragging");
      canvas.setPointerCapture?.(e.pointerId);
      return;
    }
    if (!S.opening || e.pointerType === "touch") return;
    OP.drag = { x: e.clientX };
    OP.spinV = 0;
    root.classList.add("is-dragging");
    canvas.setPointerCapture?.(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!OP.drag) return;
    const d = (e.clientX - OP.drag.x) * 0.006;
    OP.drag.x = e.clientX;
    OP.dragMoved += Math.abs(d / 0.006);
    S.globeSpin += d;
    OP.molA += d;
    OP.spinV = lerp(OP.spinV, d, 0.6);
  });
  const endDrag = () => {
    S.uni?.up();
    OP.drag = null;
    root.classList.remove("is-dragging");
  };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);
  canvas.addEventListener("pointerleave", () => {
    S.px = -9999;
    S.py = -9999;
    S.hover = null;
    S.mx = 0;
    S.my = 0;
  });
  canvas.addEventListener("click", onClick);
  root.addEventListener("wheel", onWheel, { passive: false });
  root.addEventListener(
    "touchstart",
    (e) => {
      S.touchY = e.touches[0]?.clientY ?? null;
      S.touchX = e.touches[0]?.clientX ?? null;
      OP.touchY = S.touchY;
      OP.touching = S.opening;
    },
    { passive: true }
  );
  root.addEventListener(
    "touchmove",
    (e) => {
      if (!S.opening || OP.touchY == null) return;
      e.preventDefault();
      const y = e.touches[0]?.clientY ?? OP.touchY;
      S.px = e.touches[0]?.clientX ?? S.px;
      S.py = y;
      OP.ptrT = S.t;
      openingNudge((OP.touchY - y) / (S.h * 7));
      OP.touchY = y;
    },
    { passive: false }
  );
  root.addEventListener(
    "touchend",
    (e) => {
      OP.touching = false;
      if (S.opening) {
        S.touchY = null;
        return;
      }
      if (S.touchY === null || e.target.closest(".wm-panel, .wm-uni-dive")) return;
      const dy = S.touchY - (e.changedTouches[0]?.clientY ?? S.touchY);
      const dx = (S.touchX ?? 0) - (e.changedTouches[0]?.clientX ?? S.touchX ?? 0);
      if (uniOn() && !S.uni.diving && Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) S.uni.turn(dx > 0 ? 1 : -1);
      else if (Math.abs(dy) > 50) step(dy > 0 ? 1 : -1);
      S.touchY = null;
    },
    { passive: true }
  );
  document.addEventListener("keydown", onKey);
  window.addEventListener("resize", () => S.open && resize());
  $(".wm-close").addEventListener("click", () => close());
  $(".wm-open-skip")?.addEventListener("click", () => endOpening());
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

  const themeBtn = $(".wm-theme-toggle");
  function setBrandTheme(on, { persist = true } = {}) {
    S.brand = !!on;
    applyPalette(S.brand);
    root.classList.toggle("is-brand", S.brand);
    if (themeBtn) {
      themeBtn.setAttribute("aria-pressed", S.brand ? "true" : "false");
      const label = themeBtn.querySelector(".wm-theme-toggle-text");
      if (label) label.textContent = S.brand ? "Brand on" : "Brand";
      themeBtn.title = S.brand ? "Switch to night colors" : "Waters brand colors";
    }
    if (persist) writeBrandPref(S.brand);
    if (S.data) {
      renderPanel();
      S.uni?.setData(comp("technology"), S.data.company.divisions);
    }
  }
  if (themeBtn) {
    themeBtn.addEventListener("click", () => setBrandTheme(!S.brand));
  }
  setBrandTheme(readBrandPref(), { persist: false });

  /* ---------- open / close ---------- */

  async function open(opts = {}) {
    S.opts = opts;
    if (S.open) return;
    root.hidden = false;
    document.body.classList.add("wm-lock");
    S.open = true;
    setBrandTheme(S.brand, { persist: false });
    S.intro = true;
    S.finale = false;
    S.active = null;
    S.hover = null;
    S.assemble = 0;
    S.closing = 0;
    S.last = 0;
    leaveRide();
    els.intro.classList.remove("is-gone");
    leaveFinale();
    renderPanel();
    resize();
    root.classList.remove("is-opening");
    S.opening = false;
    if (opts.opening !== false && opEls.box) {
      startOpening();
      cancelAnimationFrame(S.raf);
      S.raf = requestAnimationFrame(frame);
    }
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
    makeUniverse();
    S.uni?.setData(comp("technology"), S.data.company.divisions);
    setHint();
    if (S.opening) return;
    cancelAnimationFrame(S.raf);
    S.raf = requestAnimationFrame(frame);
    $(".wm-begin").focus({ preventScroll: true });
  }

  function close() {
    if (!S.open) return;
    S.open = false;
    cancelAnimationFrame(S.raf);
    leaveRide();
    els.intro.classList.add("is-gone");
    S.opening = false;
    root.classList.remove("is-open", "is-ride", "is-active", "is-finale", "is-opening");
    document.body.classList.remove("wm-lock");
    els.sources.hidden = true;
    setTimeout(() => {
      if (!S.open) root.hidden = true;
    }, 450);
    S.opts.onClose?.();
  }

  window.watersMachine = { open, close };
})();
