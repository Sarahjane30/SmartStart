/* Waters LC/MS — the ride.
   One continuous, scroll-driven film. Scroll is the camera; the cursor bends the world;
   a click isolates one phenomenon; drag orbits; hover whispers. The only chrome is a corner
   mark, a chapter whisper and a hairline progress rail. */
(function (global) {
  const G = global.WatersGfx3D;
  const W = global.WatersRideWorld;
  const { TAU, DEG, v, add, sub, mul, mix3, lerp, clamp, ease, rgba, shade, CYAN, VIOLET, MINT } = G;
  const { MAGENTA, WHITE } = W;

  const END = 11;
  const CHAPTERS = [
    "LIQUID CHROMATOGRAPHY",
    "THE MACHINE",
    "THE DIVE",
    "THE PATH OF A SAMPLE",
    "INSIDE THE COLUMN",
    "PERSONALITY",
    "THE DETECTOR",
    "THE CHROMATOGRAM",
    "IONIZATION",
    "THE MASS SPECTROMETER",
    "THE SPECTRUM",
  ];
  const reduce = global.matchMedia && global.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const win = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
  const sm = (x) => {
    const k = clamp(x, 0, 1);
    return k * k * (3 - 2 * k);
  };
  const easeIO = (x) => {
    const k = clamp(x, 0, 1);
    return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
  };
  const easeIn = (x) => {
    const k = clamp(x, 0, 1);
    return k * k * k;
  };
  const bell = (t, a, b, f = 0.06) => sm(win(t, a, a + f)) * (1 - sm(win(t, b - f, b)));
  const K = (t, pos, target, fov) => ({ t, pos: v(...pos), target: v(...target), fov: fov * DEG });

  function track(keys, t) {
    if (t <= keys[0].t) return keys[0];
    for (let i = 0; i < keys.length - 1; i += 1) {
      const a = keys[i];
      const b = keys[i + 1];
      if (t <= b.t) {
        const k = easeIO((t - a.t) / (b.t - a.t || 1));
        return { pos: mix3(a.pos, b.pos, k), target: mix3(a.target, b.target, k), fov: lerp(a.fov, b.fov, k) };
      }
    }
    return keys[keys.length - 1];
  }
  const camMix = (a, b, k) => ({ pos: mix3(a.pos, b.pos, k), target: mix3(a.target, b.target, k), fov: lerp(a.fov, b.fov, k) });

  /* ---------- state ---------- */

  const S = {
    open: false,
    T: 0,
    P: 0,
    prevP: 0,
    w: 1,
    h: 1,
    dpr: 1,
    time: 0,
    clock: 0,
    flow: 0,
    timeScale: 1,
    last: 0,
    raf: 0,
    mx: -9999,
    my: -9999,
    pmx: 0,
    pmy: 0,
    cvx: 0,
    cvy: 0,
    nmx: 0,
    nmy: 0,
    smx: 0,
    smy: 0,
    down: null,
    orbit: { yaw: 0, pitch: 0 },
    auto: null,
    peak: null,
    ion: null,
    boomT: -10,
    snapT: -10,
    hot: [],
    tip: "",
    hoverPeak: null,
    hoverIon: null,
    heroOff: { x: 0, y: 0 },
    molOff: [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }],
    lastInput: 0,
    chapter: -1,
    onClose: null,
    parts: [],
    stars: [],
    dust: [],
  };
  let root = null;
  let cv = null;
  let ctx = null;
  let layer = null;
  let lctx = null;
  let ui = {};
  const R = G.makeRenderer();

  const OVERVIEW = K(0, [5.2, 3.1, 12.8], [5.2, 0.85, 0.2], 42);

  /* ---------- typography ---------- */

  const FONT = "Inter, system-ui, sans-serif";
  const MONO = '"IBM Plex Mono", ui-monospace, monospace';

  function setTrack(c, px) {
    try {
      c.letterSpacing = `${px}px`;
    } catch (e) {
      /* letterSpacing unsupported */
    }
  }

  function type(text, x, y, o = {}) {
    const {
      size = 16, weight = 800, mono = false, track = 0, alpha = 1, color = WHITE, align = "center",
      sx = 1, sy = 1, stroke = false, lw = 1, blur = 0, base = "middle", c = ctx,
    } = o;
    if (alpha <= 0.005) return 0;
    c.save();
    c.translate(x, y);
    c.scale(sx, sy);
    c.font = `${weight} ${size}px ${mono ? MONO : FONT}`;
    c.textAlign = align;
    c.textBaseline = base;
    setTrack(c, size * track);
    if (blur > 0.3) c.filter = `blur(${blur.toFixed(1)}px)`;
    if (stroke) {
      c.strokeStyle = rgba(color, alpha);
      c.lineWidth = lw;
      c.strokeText(text, 0, 0);
    } else {
      c.fillStyle = rgba(color, alpha);
      c.fillText(text, 0, 0);
    }
    const wd = c.measureText(text).width;
    c.restore();
    return wd * sx;
  }

  function measure(text, size, weight = 800, track = 0, mono = false) {
    ctx.save();
    ctx.font = `${weight} ${size}px ${mono ? MONO : FONT}`;
    setTrack(ctx, size * track);
    const wd = ctx.measureText(text).width;
    ctx.restore();
    return wd;
  }

  /* Enormous outlined word that sits behind the scene, sliding with the camera. */
  function ghost(text, alpha, o = {}) {
    if (alpha <= 0.01) return;
    const size = Math.min(S.h * 0.34, (S.w / Math.max(4, text.length)) * 1.55) * (o.scale || 1);
    type(text, S.w / 2 + (o.dx || 0), S.h * (o.y || 0.5), {
      size, weight: 800, stroke: true, lw: 1.2, alpha: alpha * 0.16, track: 0.02, color: o.color || [200, 225, 255],
    });
  }

  /* Small mono whisper. */
  function whisper(text, x, y, alpha, o = {}) {
    return type(text, x, y, { size: o.size || 10.5, weight: o.weight || 500, mono: true, track: o.track == null ? 0.32 : o.track, alpha, color: o.color || [200, 216, 245], align: o.align || "left" });
  }

  function hot(x, y, w, h, act) {
    S.hot.push({ x, y, w, h, act });
    return S.mx >= x && S.mx <= x + w && S.my >= y && S.my <= y + h;
  }

  /* ---------- backgrounds ---------- */

  function bgBlack(a = 1) {
    ctx.fillStyle = rgba([0, 0, 0], a);
    ctx.fillRect(0, 0, S.w, S.h);
  }

  function bgVoid(alpha = 1, energy = 0) {
    const cx = S.w / 2 - S.smx * 30;
    const cy = S.h * 0.48 - S.smy * 20;
    const Rr = Math.max(S.w, S.h);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Rr * 0.78);
    const c0 = W.mixC([13, 26, 66], [52, 14, 78], energy);
    const c1 = W.mixC([6, 12, 34], [20, 6, 40], energy);
    g.addColorStop(0, rgba(c0, alpha));
    g.addColorStop(0.45, rgba(c1, alpha));
    g.addColorStop(1, rgba([2, 3, 10], alpha));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S.w, S.h);
  }

  function stars(alpha = 1, opts = {}) {
    const { px = 0, py = 0, streak = 0, color = [200, 220, 255] } = opts;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    S.stars.forEach((s) => {
      let x = (s.x * S.w + px * s.z - S.smx * 20 * s.z) % S.w;
      let y = (s.y * S.h + py * s.z - S.smy * 14 * s.z) % S.h;
      if (x < 0) x += S.w;
      if (y < 0) y += S.h;
      const a = alpha * s.a * (0.6 + 0.4 * Math.sin(S.time * s.tw + s.x * 40));
      ctx.fillStyle = rgba(color, a);
      if (streak > 0.5) {
        ctx.strokeStyle = rgba(color, a);
        ctx.lineWidth = s.z * 1.2;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - streak * s.z, y);
        ctx.stroke();
      } else {
        ctx.fillRect(x, y, s.z * 1.6, s.z * 1.6);
      }
    });
    ctx.restore();
  }

  function vignette(a = 0.6) {
    const g = ctx.createRadialGradient(S.w / 2, S.h / 2, Math.min(S.w, S.h) * 0.35, S.w / 2, S.h / 2, Math.max(S.w, S.h) * 0.75);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, `rgba(0,0,0,${a})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S.w, S.h);
  }

  function flash(a, color = [220, 240, 255]) {
    if (a <= 0.005) return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const g = ctx.createRadialGradient(S.w / 2, S.h / 2, 0, S.w / 2, S.h / 2, Math.max(S.w, S.h) * 0.7);
    g.addColorStop(0, rgba(color, a));
    g.addColorStop(1, rgba(color, a * 0.25));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S.w, S.h);
    ctx.restore();
  }

  /* ---------- 3D scenes ---------- */

  function applyOrbit(cam) {
    const yaw = S.orbit.yaw + S.smx * 0.05;
    const pitch = S.orbit.pitch - S.smy * 0.03;
    const d = sub(cam.pos, cam.target);
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    let p = v(d.x * cy + d.z * sy, d.y, -d.x * sy + d.z * cy);
    const r = Math.hypot(p.x, p.z);
    const el = Math.atan2(p.y, r) + pitch;
    const L = G.len(p);
    const elc = clamp(el, -1.2, 1.3);
    const k = (Math.cos(elc) * L) / (r || 1);
    p = v(p.x * k, Math.sin(elc) * L, p.z * k);
    return { pos: add(cam.target, p), target: cam.target, fov: cam.fov };
  }

  function setCam(cam, orbit = true) {
    const c = orbit ? applyOrbit(cam) : cam;
    R.w = S.w;
    R.h = S.h;
    R.cam.pos = c.pos;
    R.cam.target = c.target;
    R.cam.fov = c.fov;
    R.prep();
  }

  function instrument(cam, st, alpha = 1) {
    setCam(cam);
    W.drawInstrument(R, { time: S.clock, alpha, ...st });
    ctx.globalCompositeOperation = "source-over";
    R.flush(ctx);
    ctx.globalCompositeOperation = "source-over";
  }

  function hoverComps(explode, labels = true) {
    let best = null;
    W.COMP_IDS.forEach((id) => {
      const p = R.project(W.compCenter(id, explode));
      if (!p.vis) return;
      const rr = W.COMP[id].r * p.s * 0.75;
      const d = Math.hypot(S.mx - p.x, S.my - p.y);
      if (d < rr && (!best || d < best.d)) best = { id, d, p, rr };
    });
    if (best && labels) {
      const c = W.COMP[best.id];
      S.tip = `${c.label} — ${c.line}`;
      ctx.save();
      ctx.strokeStyle = rgba([200, 230, 255], 0.35);
      ctx.setLineDash([2, 6]);
      ctx.beginPath();
      ctx.arc(best.p.x, best.p.y, best.rr, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
    return best;
  }

  /* ---------- 00 · black, type, particles ---------- */

  function layout00() {
    const lsize = Math.min(S.w * 0.17, S.h * 0.3);
    const csize = Math.min(S.w * 0.05, S.h * 0.085);
    return { lsize, ly: S.h * 0.43, csize, cy: S.h * 0.66, ctrack: 0.28 };
  }

  function sampleParticles() {
    const L = layout00();
    const off = document.createElement("canvas");
    off.width = Math.max(1, S.w | 0);
    off.height = Math.max(1, S.h | 0);
    const o = off.getContext("2d");
    type("CHROMATOGRAPHY", S.w / 2, L.cy, { size: L.csize, weight: 800, track: L.ctrack, c: o });
    const data = o.getImageData(0, 0, off.width, off.height).data;
    const step = Math.max(2, Math.round(L.csize / 26));
    const pts = [];
    for (let y = 0; y < off.height; y += step) {
      for (let x = 0; x < off.width; x += step) {
        if (data[(y * off.width + x) * 4 + 3] > 120) pts.push([x, y]);
      }
    }
    const max = 2600;
    const stride = Math.max(1, pts.length / max);
    S.parts = [];
    let seed = 3;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < pts.length; i += stride) {
      const [hx, hy] = pts[Math.floor(i)];
      S.parts.push({ hx, hy, rx: r(), ry: r(), sp: 0.5 + r(), ph: r() * TAU, c: r(), ox: 0, oy: 0, vx: 0, vy: 0 });
    }
  }

  function updateWake(dt) {
    const rad = Math.min(S.w, S.h) * 0.16;
    for (const p of S.parts) {
      if (p.sx != null) {
        const dx = p.sx - S.mx;
        const dy = p.sy - S.my;
        const d2 = dx * dx + dy * dy;
        if (d2 < rad * rad) {
          const f = 1 - Math.sqrt(d2) / rad;
          p.vx += (S.cvx * 0.5 + (dx / rad) * 90) * f * dt * 6;
          p.vy += (S.cvy * 0.5 + (dy / rad) * 90) * f * dt * 6;
        }
      }
      p.vx -= p.ox * dt * 3.2;
      p.vy -= p.oy * dt * 3.2;
      p.vx *= Math.exp(-dt * 2.4);
      p.vy *= Math.exp(-dt * 2.4);
      p.ox += p.vx * dt;
      p.oy += p.vy * dt;
    }
  }

  function ch00(t) {
    bgBlack();
    const L = layout00();
    const w = S.w;
    const h = S.h;

    const appear = win(t, 0.02, 0.27);
    const stretch = easeIO(win(t, 0.25, 0.5));
    const fill = win(t, 0.28, 0.56);
    const melt = easeIn(win(t, 0.64, 0.9));
    const word = "LIQUID";
    const track = 0.04;
    const totalW = measure(word, L.lsize, 800, track);
    const sxMax = (w * 1.12) / totalW;
    const sxW = lerp(1, sxMax, stretch);
    const syW = lerp(1, 0.58, stretch) * (1 + melt * 0.9);

    layer.width = Math.max(1, w * S.dpr) | 0;
    layer.height = Math.max(1, h * S.dpr) | 0;
    lctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
    lctx.clearRect(0, 0, w, h);
    let cursorX = w / 2 - totalW / 2;
    for (let i = 0; i < word.length; i += 1) {
      const ch = word[i];
      const cw = measure(ch, L.lsize, 800, track);
      const k = ease(clamp(appear * 1.7 - i * 0.12, 0, 1));
      const sc = lerp(0.28, 1, k);
      const lx = w / 2 + (cursorX + cw / 2 - w / 2) * sxW;
      const ly = L.ly + melt * h * 0.16;
      type(ch, lx, ly, {
        size: L.lsize, weight: 800, sx: sc * sxW, sy: sc * syW, alpha: k * (1 - melt), blur: (1 - k) * 14 + melt * 10,
        color: WHITE, c: lctx, track: 0,
      });
      cursorX += cw;
    }
    if (fill > 0) {
      lctx.save();
      lctx.globalCompositeOperation = "source-atop";
      const top = L.ly + L.lsize * syW * 0.4 - fill * L.lsize * syW * 0.95;
      const g = lctx.createLinearGradient(0, top - 30, w, top + L.lsize);
      const sh = (S.clock * 0.08) % 1;
      g.addColorStop(0, rgba([96, 214, 255], 1));
      g.addColorStop(clamp(0.3 + sh * 0.4, 0, 1), rgba([210, 245, 255], 1));
      g.addColorStop(1, rgba([150, 120, 255], 1));
      lctx.fillStyle = g;
      lctx.beginPath();
      lctx.moveTo(0, h);
      for (let x = 0; x <= w; x += 12) {
        lctx.lineTo(x, top + Math.sin(x * 0.012 + S.clock * 2.2) * 9 + Math.sin(x * 0.031 - S.clock * 1.4) * 4);
      }
      lctx.lineTo(w, h);
      lctx.closePath();
      lctx.fill();
      lctx.restore();
    }
    ctx.drawImage(layer, 0, 0, w, h);

    const cAppear = win(t, 0.12, 0.34);
    const cText = cAppear * (1 - sm(win(t, 0.38, 0.47)));
    if (cText > 0.01) {
      type("CHROMATOGRAPHY", w / 2, L.cy, {
        size: L.csize, weight: 800, track: L.ctrack, alpha: cText, sx: lerp(0.7, 1, ease(cAppear)), sy: lerp(0.7, 1, ease(cAppear)),
        blur: (1 - ease(cAppear)) * 10,
      });
    }

    const pa = sm(win(t, 0.36, 0.45)) * (1 - sm(win(t, 0.97, 1)));
    if (pa > 0.01 && S.parts.length) {
      const frag = win(t, 0.38, 0.74);
      const collapse = easeIO(win(t, 0.84, 1));
      const cx = w / 2;
      const cy = h / 2;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (const p of S.parts) {
        const k = ease(clamp(frag * 1.5 - (p.hx / w) * 0.5, 0, 1));
        const u = (p.rx + S.clock * 0.03 * p.sp) % 1;
        const rx = -0.05 * w + u * 1.1 * w;
        const ry = h * 0.56 + Math.sin(u * TAU * 1.3 + S.clock * 0.9) * h * 0.07 + (p.ry - 0.5) * h * 0.08 * (0.35 + 0.65 * Math.pow(Math.sin(u * TAU * 2.7 + p.ph), 2));
        const turb = Math.sin(Math.PI * k) * 70;
        let x = lerp(p.hx, rx, k) + Math.sin(p.ph + S.clock * 2) * turb;
        let y = lerp(p.hy, ry, k) + Math.cos(p.ph * 1.3 + S.clock * 1.7) * turb;
        if (collapse > 0) {
          const ang = p.ph + S.clock * 3 + collapse * 4;
          const rr = (4 + p.ry * 40) * (1 - collapse * 0.9);
          x = lerp(x, cx + Math.cos(ang) * rr, collapse);
          y = lerp(y, cy + Math.sin(ang) * rr, collapse);
        }
        x += p.ox;
        y += p.oy;
        p.sx = x;
        p.sy = y;
        const col = p.c < 0.6 ? [96, 214, 255] : p.c < 0.85 ? [200, 240, 255] : [170, 128, 255];
        ctx.fillStyle = rgba(col, pa * (0.45 + p.c * 0.45));
        const sz = 1.2 + p.c * 1.3;
        ctx.fillRect(x - sz / 2, y - sz / 2, sz, sz);
      }
      ctx.restore();
    }
    const glowK = win(t, 0.86, 1);
    if (glowK > 0) {
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, 60);
      g.addColorStop(0, rgba([210, 245, 255], glowK * 0.9));
      g.addColorStop(1, rgba([96, 214, 255], 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, 60, 0, TAU);
      ctx.fill();
    }
    whisper("SEPARATE  ·  IDENTIFY  ·  MEASURE", w / 2, h * 0.9, bell(t, 0.3, 0.7, 0.08) * 0.55, { align: "center", track: 0.5 });
  }

  /* ---------- 01 · the machine doesn't appear ---------- */

  function cam01(t) {
    const reveal = sm(win(t, 0.07, 0.8));
    const tip = W.PATH.at(reveal);
    const ahead = W.PATH.at(Math.min(1, reveal + 0.035));
    const target = mix3(tip, ahead, 0.4);
    const sway = Math.sin(reveal * 7) * 0.5;
    const dist = lerp(1.2, 2.5, sm(win(t, 0.0, 0.2)));
    const follow = { pos: add(target, v(-0.8 + sway, 0.45 + reveal * 0.3, dist)), target, fov: 46 * DEG };
    return { cam: camMix(follow, OVERVIEW, easeIO(win(t, 0.8, 1))), reveal };
  }

  function currentComp(reveal) {
    let id = "reservoir";
    W.COMP_IDS.forEach((k) => {
      if (reveal + 0.03 >= W.COMP[k].u) id = k;
    });
    return id;
  }

  function compLabel(id, explode, alpha, idx) {
    const p = R.project(W.compCenter(id, explode));
    if (!p.vis || alpha <= 0.01) return;
    const c = W.COMP[id];
    const x = p.x + W.COMP[id].r * p.s * 0.55;
    const y = p.y - W.COMP[id].r * p.s * 0.55;
    ctx.save();
    ctx.strokeStyle = rgba([200, 230, 255], alpha * 0.4);
    ctx.beginPath();
    ctx.moveTo(x - 10, y + 10);
    ctx.lineTo(x, y);
    ctx.lineTo(x + 26, y);
    ctx.stroke();
    ctx.restore();
    whisper(`0${idx + 1}  ${c.label}`, x + 32, y, alpha, { weight: 600, color: WHITE });
    whisper(c.line, x + 32, y + 16, alpha * 0.6, { track: 0.04, size: 11 });
  }

  function ch01(t) {
    const { cam, reveal } = cam01(t);
    bgBlack();
    bgVoid(sm(win(t, 0.04, 0.4)));
    stars(sm(win(t, 0.1, 0.5)) * 0.5);
    const cur = currentComp(reveal);
    const cu = W.COMP[cur].u;
    if (reveal > 0.01) ghost(W.COMP[cur].label, sm(win(reveal, cu - 0.03, cu + 0.04)) * (1 - win(t, 0.82, 0.95)), { dx: -(reveal - cu) * S.w * 2.4 });
    instrument(cam, { reveal: t < 0.07 ? 0 : reveal, detGlow: 0.3, loop: 0.4 }, sm(win(t, 0.03, 0.1)));
    if (t < 0.14) {
      const k = win(t, 0, 0.14);
      const p = R.project(W.PATH.at(0));
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < 3; i += 1) {
        const ph = ((S.time * 0.9 + i / 3) % 1);
        ctx.strokeStyle = rgba([150, 225, 255], (1 - ph) * 0.6 * (1 - k));
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 6 + ph * 70, 0, TAU);
        ctx.stroke();
      }
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 40);
      g.addColorStop(0, rgba([220, 248, 255], 0.9 * (1 - k * 0.5)));
      g.addColorStop(1, rgba([96, 214, 255], 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 40, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    if (t > 0.07 && t < 0.86) {
      const idx = W.COMP_IDS.indexOf(cur);
      const a = sm(win(reveal, cu - 0.01, cu + 0.04)) * (1 - win(t, 0.78, 0.86));
      compLabel(cur, 0, a, idx);
    }
    if (t > 0.86) hoverComps(0);
    whisper("A PULSE.  ONE TUBE.  THEN ANOTHER.", 28, S.h - 34, bell(t, 0.02, 0.3, 0.05) * 0.5);
  }

  /* ---------- 02 · scroll = camera ---------- */

  const K02 = [
    K(0, [5.2, 3.1, 12.8], [5.2, 0.85, 0.2], 42),
    K(0.16, [3.05, 0.95, 2.15], [2.7, 0.3, 0.6], 38),
    K(0.26, [3.4, 0.7, 1.45], [3.85, 0.6, 0.8], 44),
    K(0.3, [3.72, 0.62, 0.95], [4.3, 0.64, 0.74], 62),
    K(0.44, [5.1, 1.05, 2.05], [5.2, 0.62, 0.6], 36),
    K(0.58, [5.55, 0.9, 1.55], [5.8, 0.66, 0.6], 40),
    K(0.62, [5.85, 0.7, 0.95], [6.2, 0.66, 0.45], 62),
    K(0.8, [6.05, 0.98, 0.95], [7.4, 0.65, 0.15], 42),
    K(1, [6.75, 1.3, 1.8], [7.9, 0.6, 0.15], 44),
  ];

  function ch02(t) {
    bgVoid();
    stars(0.4);
    ghost("PUMP", bell(t, 0.07, 0.3, 0.06), { scale: lerp(1.25, 1, ease(win(t, 0.07, 0.16))) });
    ghost("INJECTOR", bell(t, 0.44, 0.61, 0.05), { scale: lerp(1.2, 1, ease(win(t, 0.44, 0.52))) });
    ghost("COLUMN", bell(t, 0.8, 1.05, 0.05), { scale: lerp(1.25, 1, ease(win(t, 0.8, 0.9))) });
    const cam = track(K02, t);
    const rotor = sm(win(t, 0.49, 0.54));
    const plugU = lerp(W.PATH.piece("injector").u0, W.PATH.piece("column").u0 + 0.04, win(t, 0.54, 0.82));
    const dots = t > 0.53 ? [{ u: plugU, color: VIOLET, size: 0.035 }, { u: plugU - 0.006, color: VIOLET, size: 0.025, alpha: 0.6 }] : [];
    instrument(cam, { rotor, loop: 1 - win(t, 0.54, 0.6), dots, colGlow: win(t, 0.8, 1) });

    const tun1 = bell(t, 0.285, 0.455, 0.025);
    const tun2 = bell(t, 0.605, 0.805, 0.03);
    W.drawTunnel(ctx, S.w, S.h, S.clock, { alpha: tun1, speed: 1.3 });
    W.drawTunnel(ctx, S.w, S.h, S.clock, { alpha: tun2, speed: lerp(1.6, 5, win(t, 0.62, 0.8)), sample: VIOLET, bend: 1.4 });
    flash(bell(t, 0.28, 0.31, 0.015) * 0.25 + bell(t, 0.6, 0.63, 0.015) * 0.3 + bell(t, 0.785, 0.82, 0.018) * 0.4);

    whisper("THE PUMP — TWO PISTONS, ONE FLOW THAT NEVER STUTTERS", 28, S.h - 34, bell(t, 0.1, 0.28, 0.04) * 0.6);
    whisper("INSIDE THE TUBING  ·  0.13 MM", 28, S.h - 34, bell(t, 0.3, 0.45, 0.03) * 0.6);
    whisper("THE ROTOR TURNS — THE SAMPLE ENTERS", 28, S.h - 34, bell(t, 0.47, 0.6, 0.03) * 0.6);
    whisper("ACCELERATING", 28, S.h - 34, bell(t, 0.63, 0.79, 0.03) * 0.6);
    whisper("THE COLUMN", 28, S.h - 34, bell(t, 0.82, 1.02, 0.04) * 0.6);
    if (t < 0.06) hoverComps(0);
  }

  /* ---------- 03 · everything breaks apart ---------- */

  function cam03(t) {
    const c = v(5.2, 1.4, 0.2);
    const yaw = lerp(-0.12, 0.36, easeIO(t));
    const dist = lerp(13.2, 14.6, t);
    const pitch = 0.22;
    const orbit = {
      pos: add(c, v(Math.sin(yaw) * dist * Math.cos(pitch), Math.sin(pitch) * dist, Math.cos(yaw) * dist * Math.cos(pitch))),
      target: c,
      fov: 42 * DEG,
    };
    return camMix(K02[K02.length - 1], orbit, easeIO(win(t, 0, 0.24)));
  }
  const explode03 = (t) => win(t, 0.05, 0.7) * 0.92;

  function samplePath(explode, k, alpha) {
    if (k <= 0 || alpha <= 0.01) return;
    const pts = [];
    W.COMP_IDS.forEach((id) => pts.push(R.project(W.compCenter(id, explode))));
    if (pts.some((p) => !p.vis)) return;
    const segs = [];
    let total = 0;
    for (let i = 0; i < pts.length - 1; i += 1) {
      const l = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
      segs.push(l);
      total += l;
    }
    let left = total * k;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = rgba(VIOLET, alpha * 0.85);
    ctx.lineWidth = 1.4;
    ctx.setLineDash([2, 7]);
    ctx.lineDashOffset = -S.time * 30;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    let end = pts[0];
    for (let i = 0; i < segs.length && left > 0; i += 1) {
      const f = Math.min(1, left / segs[i]);
      end = { x: lerp(pts[i].x, pts[i + 1].x, f), y: lerp(pts[i].y, pts[i + 1].y, f) };
      ctx.lineTo(end.x, end.y);
      left -= segs[i];
    }
    ctx.stroke();
    ctx.setLineDash([]);
    const g = ctx.createRadialGradient(end.x, end.y, 0, end.x, end.y, 18);
    g.addColorStop(0, rgba([235, 220, 255], alpha));
    g.addColorStop(1, rgba(VIOLET, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(end.x, end.y, 18, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function ch03(t) {
    bgVoid();
    stars(0.5);
    const e = explode03(t);
    const k = W.explodeOffsets(e)._k;
    instrument(cam03(t), { explode: e, headSplit: k(0.1), rotorOut: k(0.2), spin: k(0.2) * 2.4, colGlow: 0.3 });
    samplePath(e, win(t, 0.55, 0.85), bell(t, 0.5, 1.1, 0.05));
    const hv = hoverComps(e);
    if (hv) compLabel(hv.id, e, 0.9, W.COMP_IDS.indexOf(hv.id));

    const a1 = bell(t, 0.48, 1.1, 0.06);
    whisper("THE PATH OF A SAMPLE", S.w / 2, S.h * 0.83, a1 * 0.85, { align: "center", track: 0.6, size: 11 });
    const a2 = sm(win(t, 0.68, 0.78));
    if (a2 > 0.01) {
      const size = 15;
      const label = "FOLLOW IT  →";
      const tw = measure(label, size, 600, 0.3);
      const x = S.w / 2 - tw / 2;
      const y = S.h * 0.83 + 34;
      const over = hot(x - 10, y - 16, tw + 20, 32, () => autopilot(4.62, 0.55));
      type(label, S.w / 2 + (over ? 4 : 0), y, { size, weight: 600, track: 0.3, alpha: a2 });
      ctx.fillStyle = rgba(WHITE, a2 * 0.8);
      ctx.fillRect(x, y + 14, tw * (over ? 1 : 0.18), 1);
    }
    whisper("DRAG TO TURN IT", 28, S.h - 34, bell(t, 0.25, 0.7, 0.06) * 0.45);
  }

  /* ---------- 04 · you become the molecule ---------- */

  function landCam(t, focus = 5) {
    return {
      x: Math.sin(S.clock * 0.21) * 0.25 + S.smx * 0.45,
      y: Math.cos(S.clock * 0.17) * 0.18 - S.smy * 0.3,
      z: S.flow + t * 26,
      yaw: S.smx * 0.1,
      pitch: S.smy * 0.07,
      focus,
    };
  }

  function heroState(t) {
    const k = easeIO(win(t, 0.36, 0.6));
    return { rel: lerp(17, 2.4, k), x: lerp(1.6, 0, k), y: lerp(0.9, 0.05, k), vis: win(t, 0.34, 0.4) };
  }

  function ch04(t) {
    const dive = win(t, 0, 0.22);
    if (t < 0.24) {
      bgVoid();
      stars(0.5 * (1 - dive));
      const e = 0.92;
      const ex = W.explodeOffsets(e);
      const inlet = add(v(6.36, 0.65, 0.15), ex.column);
      const mid = add(W.compCenter("column", e), v(0, 0, 0));
      const keys = [
        { t: 0, ...cam03(1) },
        K(0.11, [inlet.x - 1.4, inlet.y + 0.5, inlet.z + 1.5], [mid.x, mid.y, mid.z], 42),
        K(0.22, [inlet.x - 0.42, inlet.y + 0.01, inlet.z + 0.03], [inlet.x + 1, inlet.y, inlet.z], 74),
      ];
      const k = W.explodeOffsets(e)._k;
      instrument(track(keys, t), {
        explode: e, headSplit: k(0.1), rotorOut: k(0.2), spin: k(0.2) * 2.4, only: ["column"], dim: 1 - sm(win(t, 0.02, 0.12)), colGlow: 1,
      });
    }
    if (t > 0.17) {
      const a = sm(win(t, 0.17, 0.25));
      bgVoid(a);
      const hero = heroState(t);
      const freezeK = sm(win(t, 0.56, 0.62)) * (1 - sm(win(t, 0.88, 0.96)));
      const focus = lerp(5, hero.rel, freezeK);
      const cam = landCam(t, focus);
      ctx.globalAlpha = 1;
      W.drawLandscape(ctx, S.w, S.h, cam, S.flow, { alpha: a * (1 - sm(win(t, 0.93, 1))), streakK: 1 - freezeK * 0.9, focus });
      if (hero.vis > 0) {
        const mol = W.molById("b");
        const p = W.landProject(cam, S.w, S.h, { x: hero.x, y: hero.y, z: hero.rel });
        const dx = S.mx - p.x;
        const dy = S.my - p.y;
        const pull = freezeK > 0.2 ? 1 : 0;
        const lim = Math.min(S.w, S.h) * 0.08;
        const d = Math.hypot(dx, dy) || 1;
        const tx = pull * (dx / d) * Math.min(lim, d * 0.25);
        const ty = pull * (dy / d) * Math.min(lim, d * 0.25);
        S.heroOff.x = lerp(S.heroOff.x, tx, 0.08);
        S.heroOff.y = lerp(S.heroOff.y, ty, 0.08);
        const hx = lerp(p.x + S.heroOff.x, S.w * 0.12, sm(win(t, 0.92, 1)));
        const hy = lerp(p.y + S.heroOff.y, S.h * 0.52, sm(win(t, 0.92, 1)));
        const size = 0.15 * p.s * lerp(1, 0.4, sm(win(t, 0.92, 1)));
        W.drawMolecule(ctx, mol, hx, hy, size, S.clock * 0.5 + S.heroOff.y * 0.01, S.clock * 0.8 + S.heroOff.x * 0.012, hero.vis * a, { glow: 1.4 });
        if (freezeK > 0.05) {
          ctx.save();
          ctx.strokeStyle = rgba(WHITE, freezeK * 0.3);
          ctx.setLineDash([2, 5]);
          ctx.beginPath();
          ctx.arc(hx, hy, size * 6.5, 0, TAU);
          ctx.stroke();
          ctx.restore();
          whisper("MOLECULE B  ·  m/z 445.2", hx + size * 7, hy - size * 4, freezeK * 0.75, { weight: 600 });
          if (Math.hypot(S.mx - hx, S.my - hy) < size * 6.5) S.tip = "This one. Move — it notices you.";
        }
      }
      const ft = bell(t, 0.6, 0.94, 0.05);
      if (ft > 0.01) {
        const size = Math.min(S.w * 0.06, 72);
        type("FOLLOW THIS ONE.", S.w / 2, S.h * 0.8, { size, weight: 800, track: 0.02, alpha: ft, blur: (1 - ft) * 8 });
      }
      whisper("INSIDE THE COLUMN  ·  1.7 µm POROUS SILICA", 28, S.h - 34, bell(t, 0.26, 0.56, 0.05) * 0.55);
      const whip = sm(win(t, 0.93, 1));
      if (whip > 0) {
        side05(0, whip);
        motionBlur(whip * (1 - whip) * 4);
      }
      flash(bell(t, 0.16, 0.27, 0.04) * 0.55);
    }
  }

  function motionBlur(k) {
    if (k <= 0.01) return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 60; i += 1) {
      const y = ((i * 97.13) % 1) * S.h;
      const yy = (Math.sin(i * 12.9898) * 43758.5453) % 1;
      const ly = Math.abs(yy) * S.h;
      ctx.strokeStyle = rgba([180, 220, 255], k * 0.25);
      ctx.lineWidth = 1 + (i % 3);
      ctx.beginPath();
      ctx.moveTo(0, (y + ly) / 2);
      ctx.lineTo(S.w, (y + ly) / 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  /* ---------- 05 · three personalities (side-on) ---------- */

  function molPos05(t) {
    const w = S.w;
    const h = S.h;
    const m = Math.min(w, h);
    const anchorR = m * 0.15;
    const anchor = { x: w * 0.46, y: h * 0.53 + anchorR + m * 0.03, r: anchorR };
    const xa = lerp(-0.06, 1.35, easeIn(win(t, 0.03, 0.42)) * 0.7 + win(t, 0.03, 0.42) * 0.3) * w;
    const A = { x: xa, y: h * 0.31 + Math.sin(S.clock * 2) * 5, speed: 1 };
    let bx;
    if (t < 0.22) bx = lerp(0.12, 0.46, easeIO(win(t, 0, 0.22)));
    else if (t < 0.74) bx = 0.46;
    else bx = lerp(0.46, 1.25, easeIn(win(t, 0.74, 1)));
    const caught = t >= 0.22 && t < 0.74;
    const B = { x: bx * w, y: caught ? anchor.y - anchor.r - m * 0.016 : h * 0.5, caught };
    if (!caught && t < 0.22) B.y = lerp(h * 0.52, anchor.y - anchor.r - m * 0.016, easeIO(win(t, 0.12, 0.22)));
    const wig = Math.sin(t * TAU * 4.3 + 1);
    const C = {
      x: (lerp(0.06, 1.15, Math.pow(t, 1.08)) + Math.sin(t * TAU * 3) * 0.035) * w,
      y: h * 0.73 + wig * h * 0.06 + Math.sin(S.clock * 3.1) * 4,
      touch: wig > 0.86,
    };
    return { A, B, C, anchor };
  }

  function side05(t, alpha = 1, opts = {}) {
    const { drift = t * 0.34 + S.flow * 0.01, scale = 1, exit = 0 } = opts;
    const w = S.w;
    const h = S.h;
    const par = { x: S.smx, y: S.smy };
    ctx.save();
    ctx.globalAlpha = alpha;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, rgba([6, 14, 38], alpha));
    g.addColorStop(0.5, rgba([10, 24, 60], alpha));
    g.addColorStop(1, rgba([4, 8, 22], alpha));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
    W.drawSideLayer(ctx, w, h, 0, drift, par, alpha * 0.4, scale);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 70; i += 1) {
      const y = (((i * 0.6180339) % 1) * h - h / 2) * scale + h / 2;
      const sp = 0.5 + ((i * 0.37) % 1);
      const x = (((S.clock * 0.12 * sp + i * 0.137 + drift * 2) % 1.2) - 0.1) * w;
      ctx.strokeStyle = rgba([140, 210, 255], alpha * 0.16);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 50 + sp * 90, y);
      ctx.stroke();
    }
    ctx.restore();
    W.drawSideLayer(ctx, w, h, 1, drift, par, alpha, scale);

    const P = molPos05(t);
    const m = Math.min(w, h);
    const sc = (p) => ({ x: w / 2 + (p.x - w / 2) * scale, y: h / 2 + (p.y - h / 2) * scale });
    const an = sc(P.anchor);
    W.drawBead(ctx, an.x, an.y, P.anchor.r * scale, 0, alpha);
    const size = m * 0.02 * scale;
    const mols = [
      { mol: W.molById("a"), p: P.A, i: 0 },
      { mol: W.molById("b"), p: P.B, i: 1 },
      { mol: W.molById("c"), p: P.C, i: 2 },
    ];
    mols.forEach(({ mol, p, i }) => {
      const off = S.molOff[i];
      const q = sc(p);
      const dx = q.x - S.mx;
      const dy = q.y - S.my;
      const d = Math.hypot(dx, dy) || 1;
      const push = d < 140 ? (140 - d) * 0.35 : 0;
      off.x = lerp(off.x, (dx / d) * push, 0.1);
      off.y = lerp(off.y, (dy / d) * push, 0.1);
      const x = q.x + (p.caught ? off.x * 0.2 : off.x);
      const y = q.y + (p.caught ? off.y * 0.2 : off.y);
      p.sx = x;
      p.sy = y;
      if (i === 0 && t > 0.02 && t < 0.5) {
        const tl = ctx.createLinearGradient(x - w * 0.3, y, x, y);
        tl.addColorStop(0, rgba(CYAN, 0));
        tl.addColorStop(1, rgba(CYAN, alpha * 0.6));
        ctx.strokeStyle = tl;
        ctx.lineWidth = size * 1.6;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(x - w * 0.3, y);
        ctx.lineTo(x - size * 3, y);
        ctx.stroke();
      }
      if (i === 1 && p.caught) {
        const ph = (S.time * 0.9) % 1;
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.strokeStyle = rgba(VIOLET, alpha * (1 - ph) * 0.7);
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(x, y, size * (4 + ph * 10), 0, TAU);
        ctx.stroke();
        ctx.strokeStyle = rgba(VIOLET, alpha * 0.5);
        ctx.setLineDash([2, 3]);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(an.x, an.y - P.anchor.r * scale);
        ctx.stroke();
        ctx.restore();
      }
      if (i === 2 && p.touch) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        const g2 = ctx.createRadialGradient(x, y, 0, x, y, size * 9);
        g2.addColorStop(0, rgba(MINT, alpha * 0.5));
        g2.addColorStop(1, rgba(MINT, 0));
        ctx.fillStyle = g2;
        ctx.beginPath();
        ctx.arc(x, y, size * 9, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
      const jit = p.caught ? Math.sin(S.time * 30) * 0.15 : 0;
      W.drawMolecule(ctx, mol, x, y, size * (1 + jit * 0.1), S.clock * (i === 2 ? 1.6 : 0.5), S.clock * (i === 0 ? 2 : 0.7) + i, alpha * (1 - exit), { glow: 1.2 });
      if (Math.hypot(S.mx - x, S.my - y) < size * 6) S.tip = `${mol.short} · ${mol.trait} — ${mol.line}`;
    });

    if (opts.labels !== false && alpha > 0.5) {
      const la = alpha * (1 - exit);
      const tag = (p, mol, text, a, sub2) => {
        if (a <= 0.01) return;
        const x = p.sx + size * 6;
        const y = p.sy - size * 6;
        ctx.strokeStyle = rgba(mol.color, a * 0.6);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(p.sx + size * 3, p.sy - size * 3);
        ctx.lineTo(x, y);
        ctx.lineTo(x + 18, y);
        ctx.stroke();
        whisper(`${mol.short}   ${text}`, x + 24, y, a, { weight: 600, color: WHITE });
        if (sub2) whisper(sub2, x + 24, y + 15, a * 0.55, { track: 0.12 });
      };
      tag(P.A, W.molById("a"), "VELOCITY", bell(t, 0.06, 0.42, 0.06) * la, "rushes through · tR 1.2 min");
      const held = clamp((t - 0.22) / 0.52, 0, 1) * 3.1;
      tag(P.B, W.molById("b"), "RETENTION", bell(t, 0.2, 0.86, 0.06) * la, P.B.caught ? `held ${held.toFixed(1)} s` : "released · tR 4.1 min");
      tag(P.C, W.molById("c"), "INTERACTION", bell(t, 0.3, 0.97, 0.06) * la, `binds · releases · ${Math.floor(t * 9)} contacts`);
    }
    W.drawSideLayer(ctx, w, h, 2, drift, par, alpha * 0.55, scale);
  }

  function ch05(t) {
    side05(t, 1);
    whisper("SAME FLOW.  THREE PERSONALITIES.", 28, S.h - 34, bell(t, 0.04, 0.5, 0.05) * 0.55);
    whisper("HOVER A MOLECULE", S.w / 2, S.h * 0.93, bell(t, 0.3, 0.9, 0.05) * 0.4, { align: "center", track: 0.5 });
  }

  /* ---------- 06 · the world stretches, BOOM, the graph is born ---------- */

  const PEAKS = W.MOLS.map((mol, i) => ({ mol, i, x: [0.22, 0.46, 0.72][i], s: [0.013, 0.022, 0.034][i], h: [1, 0.72, 0.58][i] }));

  function chromBox(k) {
    const a = { x0: S.w * 0.1, x1: S.w * 0.9, base: S.h * 0.72, height: S.h * 0.42 };
    const b = { x0: S.w * 0.04, x1: S.w * 0.96, base: S.h * 0.84, height: S.h * 0.62 };
    return { x0: lerp(a.x0, b.x0, k), x1: lerp(a.x1, b.x1, k), base: lerp(a.base, b.base, k), height: lerp(a.height, b.height, k) };
  }

  function chromPts(box, o = {}) {
    const { head = 1, only = null, iso = 0, shrink = 0, warp = 0, shiftX = 0, zoom = 1 } = o;
    const n = 520;
    const out = [];
    const cx = (box.x0 + box.x1) / 2;
    for (let i = 0; i <= n; i += 1) {
      const u = i / n;
      if (u > head) break;
      let y = 0;
      let wt = 0;
      PEAKS.forEach((p) => {
        const g = Math.exp(-0.5 * Math.pow((u - p.x) / p.s, 2));
        let k = 1;
        if (only != null && p.i !== only) k = 1 - iso;
        if (only != null && p.i === only) k = 1 - shrink;
        y += k * p.h * g;
        if (only == null || p.i === only) wt = Math.max(wt, g);
      });
      y += Math.sin(u * 410 + S.clock * 0.3) * 0.004 + Math.sin(u * 133) * 0.003;
      let X = box.x0 + u * (box.x1 - box.x0);
      X = cx + (X - cx) * zoom + shiftX;
      let Y = box.base - y * box.height * (1 + iso * 0.15);
      if (warp > 0 && S.mx > -999) {
        const d = Math.hypot(X - S.mx, Y - S.my);
        const f = Math.exp(-Math.pow(d / 110, 2)) * warp * (y > 0.04 ? 1 : 0.25);
        X += (S.mx - X) * f * 0.2;
        Y += (S.my - Y) * f * 0.45;
      }
      const al = only == null ? 1 : lerp(1, wt > 0.02 ? 1 : 0, iso);
      out.push({ x: X, y: Y, u, al });
    }
    return out;
  }

  function drawChrom(box, o = {}) {
    const { alpha = 1 } = o;
    const pts = chromPts(box, o);
    if (pts.length < 2) return pts;
    const grad = ctx.createLinearGradient(box.x0, 0, box.x1, 0);
    const stops = [[0, WHITE]];
    PEAKS.forEach((p) => {
      stops.push([p.x - p.s * 3, WHITE], [p.x, p.mol.color], [p.x + p.s * 3, WHITE]);
    });
    stops.push([1, WHITE]);
    const span = box.x1 - box.x0;
    const fx = (u) => clamp((((box.x0 + u * span - (box.x0 + box.x1) / 2) * (o.zoom || 1) + (box.x0 + box.x1) / 2 + (o.shiftX || 0)) - box.x0) / span, 0, 1);
    stops.forEach(([u, c]) => {
      let a = alpha;
      if (o.only != null) {
        const p = PEAKS[o.only];
        const inside = Math.abs(u - p.x) < p.s * 3.2;
        a *= inside ? 1 : 1 - o.iso;
      }
      grad.addColorStop(fx(u), rgba(c, a));
    });
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(pts[0].x, box.base);
    pts.forEach((p) => ctx.lineTo(p.x, p.y));
    ctx.lineTo(pts[pts.length - 1].x, box.base);
    ctx.closePath();
    const fill = ctx.createLinearGradient(0, box.base - box.height, 0, box.base);
    fill.addColorStop(0, rgba([96, 214, 255], alpha * 0.16 * (o.only != null ? 1 - o.iso * 0.3 : 1)));
    fill.addColorStop(1, rgba([96, 214, 255], 0));
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.globalCompositeOperation = "lighter";
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.strokeStyle = grad;
    ctx.lineJoin = "round";
    ctx.lineWidth = 7;
    ctx.globalAlpha = 0.18;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1.8;
    ctx.stroke();
    const hd = pts[pts.length - 1];
    if ((o.head || 1) < 1) {
      const g = ctx.createRadialGradient(hd.x, hd.y, 0, hd.x, hd.y, 26);
      g.addColorStop(0, rgba(WHITE, alpha));
      g.addColorStop(1, rgba(CYAN, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(hd.x, hd.y, 26, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
    return pts;
  }

  const K06 = [
    K(0.15, [8.98, 0.76, 0.66], [9.5, 0.62, 0.48], 56),
    K(0.42, [9.55, 1.05, 2.7], [10.05, 0.6, 0.3], 40),
  ];

  function detectorScreen() {
    return R.project(add(W.COMP.detector.c, v(-0.14, 0, 0.44)));
  }

  function ch06(t) {
    const w = S.w;
    const h = S.h;
    if (t < 0.22) {
      const go = easeIn(win(t, 0, 0.2));
      const scale = 1 - easeIn(win(t, 0.06, 0.21)) * 0.97;
      side05(1, 1 - sm(win(t, 0.16, 0.22)), { drift: 0.34 + S.flow * 0.01 + go * 2.2, scale, exit: win(t, 0, 0.1), labels: false });
      const k = win(t, 0.05, 0.22);
      if (k > 0) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        for (let i = 0; i < 90; i += 1) {
          const ang = i * 2.399;
          const r0 = Math.max(w, h) * (0.15 + ((i * 0.618 + S.time * 1.8) % 1) * 0.7);
          const r1 = r0 * (1 - 0.25 * k);
          ctx.strokeStyle = rgba([180, 220, 255], k * (1 - k) * 1.4 * 0.5);
          ctx.beginPath();
          ctx.moveTo(w / 2 + Math.cos(ang) * r0, h / 2 + Math.sin(ang) * r0);
          ctx.lineTo(w / 2 + Math.cos(ang) * r1, h / 2 + Math.sin(ang) * r1);
          ctx.stroke();
        }
        ctx.restore();
      }
      whisper("BACK TO INSTRUMENT SCALE", 28, h - 34, bell(t, 0.04, 0.22, 0.03) * 0.5);
    }
    if (t >= 0.15) {
      const a3 = sm(win(t, 0.15, 0.22)) * (1 - sm(win(t, 0.52, 0.64)));
      bgVoid(sm(win(t, 0.15, 0.22)));
      stars(0.35);
      const cam = track(K06, t);
      const u0 = W.PATH.piece("t4").u0;
      const u1 = W.PATH.piece("t4").u1;
      const run = win(t, 0.2, 0.42);
      const dots = t < 0.425 ? [
        { u: lerp(u0, u1, run), color: [230, 245, 255], size: 0.06 },
        { u: lerp(u0, u1, run * 0.6), color: MINT, size: 0.045, alpha: 0.7 },
        { u: lerp(u0, u1, run * 0.3), color: VIOLET, size: 0.045, alpha: 0.6 },
      ] : [];
      const glow = t < 0.42 ? 0.2 : 1 - win(t, 0.42, 0.7) * 0.6;
      if (a3 > 0.01) instrument(cam, { only: ["column", "detector"], dim: 0, dots, detGlow: glow }, a3);
      else setCam(cam);
      const d = detectorScreen();
      whisper("THE DETECTOR IS WAITING", 28, h - 34, bell(t, 0.24, 0.42, 0.04) * 0.55);

      const ringK = easeIO(win(t, 0.42, 0.56));
      const toLine = easeIO(win(t, 0.52, 0.68));
      if (t >= 0.42) {
        const box = chromBox(0);
        const maxR = Math.hypot(w, h) * 0.55;
        const r = 12 + ringK * maxR * (1 - toLine * 0.4);
        const cx = lerp(d.x, w / 2, toLine);
        const cy = lerp(d.y, box.base, toLine);
        const rx = lerp(r, (box.x1 - box.x0) / 2, toLine);
        const ry = lerp(r, 0.5, toLine);
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        const ra = (1 - win(t, 0.62, 0.7));
        ctx.strokeStyle = rgba([210, 240, 255], ra * 0.9);
        ctx.lineWidth = lerp(3, 1.6, toLine);
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, Math.max(0.5, ry), 0, 0, TAU);
        ctx.stroke();
        ctx.strokeStyle = rgba(CYAN, ra * 0.3 * (1 - toLine));
        ctx.lineWidth = 14;
        ctx.stroke();
        ctx.restore();
        flash(bell(t, 0.42, 0.47, 0.012) * 0.7);
      }
      const head = win(t, 0.66, 0.98);
      if (head > 0) {
        const box = chromBox(0);
        ctx.fillStyle = rgba(WHITE, 0.25);
        ctx.fillRect(box.x0, box.base, (box.x1 - box.x0) * win(t, 0.62, 0.7), 1);
        drawChrom(box, { head, alpha: sm(win(t, 0.64, 0.7)) });
        whisper("THE PULSE BECOMES A GRAPH", 28, h - 34, bell(t, 0.7, 1.02, 0.04) * 0.6);
      }
    }
  }

  /* ---------- 07 · the chromatogram ---------- */

  const STAGES = ["PEAK", "DETECTOR", "TUBE", "COLUMN", "MOLECULE"];
  const STAGE_T = [0.42, 0.52, 0.66, 0.78, 0.9];

  function selectedPeak() {
    return S.peak == null ? 2 : S.peak;
  }

  function ch07(t) {
    const w = S.w;
    const h = S.h;
    bgVoid();
    stars(0.25);
    const grow = easeIO(win(t, 0, 0.12));
    const box = chromBox(grow);
    if (t > 0.3 && S.peak == null) S.peak = 2;
    const only = t > 0.29 ? selectedPeak() : null;
    const iso = sm(win(t, 0.3, 0.42));
    if (t < 0.52) {
      let shiftX = 0;
      if (only != null) {
        const px = box.x0 + PEAKS[only].x * (box.x1 - box.x0);
        shiftX = (w / 2 - px) * iso;
      }
      const shrink = easeIn(win(t, 0.42, 0.52));
      ctx.fillStyle = rgba(WHITE, 0.25 * (1 - iso));
      ctx.fillRect(box.x0, box.base, box.x1 - box.x0, 1);
      for (let m = 0; m <= 5; m += 1) {
        const x = box.x0 + (m / 5.5) * (box.x1 - box.x0) + 0.02 * (box.x1 - box.x0);
        whisper(`${m}`, x, box.base + 18, (1 - iso) * 0.5 * grow, { align: "center", track: 0 });
      }
      whisper("min", box.x1, box.base + 18, (1 - iso) * 0.5 * grow, { align: "right" });
      const pts = drawChrom(box, { only, iso, shrink, warp: (1 - iso) * grow, shiftX, zoom: 1 + iso * 0.6 });
      S.hoverPeak = null;
      if (iso < 0.05) {
        PEAKS.forEach((p) => {
          const X = box.x0 + p.x * (box.x1 - box.x0);
          const Y = box.base - p.h * box.height;
          const half = Math.max(26, p.s * (box.x1 - box.x0) * 2.4);
          if (Math.abs(S.mx - X) < half && S.my > Y - 50 && S.my < box.base + 12) S.hoverPeak = p.i;
          const lab = `${p.mol.short}   tR ${p.mol.rt.toFixed(1)} min`;
          const hv = S.hoverPeak === p.i;
          whisper(lab, X, Y - 34, grow * (hv ? 1 : 0.55), { align: "center", weight: hv ? 600 : 500, color: hv ? p.mol.color : [200, 216, 245] });
          if (hv) S.tip = `${p.mol.short} · ${p.mol.trait} — ${p.mol.line} Click to follow it back.`;
        });
      }
      if (only != null && t < 0.52) {
        const p = PEAKS[only];
        whisper(`${p.mol.short}  ·  ${p.mol.trait}  ·  tR ${p.mol.rt.toFixed(1)} min`, w / 2, box.base + 26, iso * (1 - shrink), { align: "center", weight: 600, color: p.mol.color });
        if (shrink > 0) {
          const apex = pts.reduce((a, b) => (b.y < a.y ? b : a), pts[0]);
          const g = ctx.createRadialGradient(apex.x, apex.y, 0, apex.x, apex.y, 40);
          g.addColorStop(0, rgba(WHITE, shrink));
          g.addColorStop(1, rgba(p.mol.color, 0));
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(apex.x, apex.y, 40, 0, TAU);
          ctx.fill();
        }
      }
      whisper("CHROMATOGRAM  ·  ABSORBANCE  /  TIME", 28, 70, grow * (1 - iso) * 0.5);
      whisper(S.peak == null ? "CLICK A PEAK" : "", w / 2, h * 0.9, bell(t, 0.08, 0.3, 0.04) * 0.6, { align: "center", track: 0.5 });
      whisper("MOVE CLOSE — THE PEAKS LEAN TOWARD YOU", 28, h - 34, bell(t, 0.1, 0.3, 0.04) * 0.4);
    }
    const mol = PEAKS[selectedPeak()].mol;
    if (t >= 0.5 && t < 0.68) {
      const k = win(t, 0.52, 0.66);
      const keys = [
        K(0.52, [10.7, 1.15, 2.9], [10.1, 0.6, 0.3], 40),
        K(0.66, [9.35, 1.0, 1.75], [8.75, 0.65, 0.2], 46),
      ];
      const a = sm(win(t, 0.5, 0.54));
      instrument(track(keys, t), {
        only: ["column", "detector"], dim: 0, detGlow: 0.7 * (1 - k),
        dots: [{ u: lerp(W.PATH.piece("t4").u1, W.PATH.piece("t4").u0, k), color: mol.color, size: 0.06 }],
      }, a);
    }
    W.drawTunnel(ctx, w, h, S.clock, { alpha: bell(t, 0.655, 0.795, 0.02), speed: 2.4, dir: -1, tint: mol.color });
    if (t >= 0.78 && t < 0.92) {
      const k = win(t, 0.79, 0.9);
      const keys = [
        K(0.79, [8.9, 1.25, 1.75], [8.1, 0.65, 0.15], 46),
        K(0.9, [7.0, 1.15, 1.6], [6.3, 0.65, 0.15], 50),
      ];
      bgVoid(sm(win(t, 0.78, 0.8)));
      instrument(track(keys, t), {
        only: ["column"], dim: 0, colGlow: 0.8,
        dots: [{ u: lerp(W.PATH.piece("column").u1, W.PATH.piece("column").u0, k), color: mol.color, size: 0.06 }],
      });
    }
    if (t >= 0.9) {
      const a = sm(win(t, 0.9, 0.95));
      bgVoid(a);
      stars(0.3 * a);
      const size = Math.min(w, h) * 0.045 * lerp(0.45, 1, easeIO(win(t, 0.9, 1)));
      W.drawMolecule(ctx, mol, w / 2, h / 2, size, S.clock * 0.4, S.clock * 0.6, a, { glow: 1.4 });
    }
    flash(bell(t, 0.5, 0.53, 0.01) * 0.3 + bell(t, 0.775, 0.8, 0.01) * 0.3 + bell(t, 0.895, 0.915, 0.008) * 0.35);

    if (t > 0.38) {
      let cur = 0;
      STAGE_T.forEach((s, i) => {
        if (t >= s) cur = i;
      });
      ghost(STAGES[cur], bell(t, 0.4, 1.04, 0.04) * 0.9, { y: 0.5 });
      const a = sm(win(t, 0.38, 0.44));
      const parts = STAGES.map((s, i) => ({ s, i }));
      const gap = 30;
      const sizes = parts.map((p) => measure(p.s, 10.5, 600, 0.32, true));
      const total = sizes.reduce((x, y) => x + y, 0) + gap * (parts.length - 1);
      let x = w / 2 - total / 2;
      parts.forEach((p, i) => {
        const on = i === cur;
        whisper(p.s, x, h * 0.86, a * (on ? 1 : i < cur ? 0.45 : 0.2), { weight: 600, color: on ? mol.color : WHITE });
        x += sizes[i];
        if (i < parts.length - 1) whisper("→", x + gap / 2 - 4, h * 0.86, a * 0.3, { track: 0 });
        x += gap;
      });
    }
  }

  /* ---------- 08 · LC → MS : flow becomes energy ---------- */

  function ions08(mol) {
    const list = [mol.mz, ...mol.frags];
    return list.map((mz, i) => ({
      mz,
      parent: i === 0,
      ang: -0.9 + i * 0.72 + (i % 2 ? 0.25 : -0.1),
      curl: (i === 0 ? 0.35 : 0.9 + i * 0.35) * (i % 2 ? 1 : -1),
      speed: i === 0 ? 0.85 : 1 - i * 0.06,
    }));
  }

  function ionPos(ion, s, cx, cy, m) {
    const d = s * m * 0.95 * ion.speed;
    const a = ion.ang + ion.curl * s * s * 1.6;
    return { x: cx + Math.cos(a) * d * 1.3, y: cy + Math.sin(a) * d * 0.75 };
  }

  function bolt(x0, y0, x1, y1, alpha, color, jag = 0.18) {
    let pts = [[x0, y0], [x1, y1]];
    for (let lvl = 0; lvl < 5; lvl += 1) {
      const next = [];
      for (let i = 0; i < pts.length - 1; i += 1) {
        const [ax, ay] = pts[i];
        const [bx, by] = pts[i + 1];
        const l = Math.hypot(bx - ax, by - ay);
        const n = Math.sin(i * 91.7 + lvl * 13.1 + Math.floor(S.time * 18) * 7.7);
        next.push([ax, ay], [(ax + bx) / 2 + (-(by - ay) / l) * l * jag * n, (ay + by) / 2 + ((bx - ax) / l) * l * jag * n]);
      }
      next.push(pts[pts.length - 1]);
      pts = next;
    }
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    [[6, 0.2], [1.6, 1]].forEach(([lw, k]) => {
      ctx.strokeStyle = rgba(lw > 2 ? color : WHITE, alpha * k);
      ctx.lineWidth = lw;
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
    });
    ctx.restore();
  }

  function ch08(t) {
    const w = S.w;
    const h = S.h;
    const m = Math.min(w, h);
    const energy = sm(win(t, 0.22, 0.32));
    bgVoid(1, energy);
    const mol = PEAKS[selectedPeak()].mol;
    const ions = ions08(mol);
    const s = win(t, 0.3, 1);
    const p1 = ionPos(ions[0], s, w / 2, h / 2, m);
    const p2 = ionPos(ions[2], s, w / 2, h / 2, m);
    const f1 = easeIO(win(t, 0.55, 0.72));
    const f2 = easeIO(win(t, 0.74, 0.88));
    const back = easeIO(win(t, 0.88, 1));
    let panX = (w / 2 - p1.x) * f1;
    let panY = (h / 2 - p1.y) * f1;
    panX = lerp(panX, w / 2 - p2.x, f2) * (1 - back);
    panY = lerp(panY, h / 2 - p2.y, f2) * (1 - back);
    stars(0.5, { px: panX * 0.6, py: panY * 0.6, streak: Math.abs(panX - (S.lastPan || 0)) * 3, color: energy > 0.5 ? [255, 190, 240] : [200, 220, 255] });
    S.lastPan = panX;

    ghost("FLOW", bell(t, -0.1, 0.27, 0.05), { color: [150, 220, 255] });
    ghost("ENERGY", bell(t, 0.27, 0.5, 0.03), { scale: lerp(1.3, 1, ease(win(t, 0.27, 0.34))), color: [255, 170, 230] });
    ghost("TRAJECTORY", bell(t, 0.47, 0.72, 0.04), { color: [255, 170, 230] });
    ghost("MASS", bell(t, 0.72, 0.96, 0.04), { color: [255, 170, 230] });

    ctx.save();
    ctx.translate(panX, panY);
    const cx = w / 2;
    const cy = h / 2;
    const nIn = easeIO(win(t, 0.04, 0.18)) * (1 - win(t, 0.3, 0.45));
    if (nIn > 0) {
      const tipX = lerp(-40, cx - m * 0.22, nIn);
      const g = ctx.createLinearGradient(0, cy - 8, 0, cy + 8);
      g.addColorStop(0, "rgb(220,228,244)");
      g.addColorStop(0.5, "rgb(120,132,160)");
      g.addColorStop(1, "rgb(60,70,96)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-60, cy - 9);
      ctx.lineTo(tipX - 30, cy - 9);
      ctx.lineTo(tipX, cy - 2);
      ctx.lineTo(tipX, cy + 2);
      ctx.lineTo(tipX - 30, cy + 9);
      ctx.lineTo(-60, cy + 9);
      ctx.closePath();
      ctx.fill();
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < 40; i += 1) {
        const k = ((S.time * 0.9 + i / 40) % 1);
        const sp = (Math.sin(i * 7.1) * 0.5) * k;
        const x = tipX + k * m * 0.2;
        const y = cy + sp * m * 0.12;
        ctx.fillStyle = rgba(W.mixC(mol.color, MAGENTA, energy), (1 - k) * 0.6 * nIn);
        ctx.beginPath();
        ctx.arc(x, y, 1.2 + (1 - k) * 2, 0, TAU);
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
      whisper("ELECTROSPRAY  ·  +3.0 kV", tipX - 150, cy - 26, nIn * 0.6);
    }

    const intact = 1 - sm(win(t, 0.3, 0.36));
    if (intact > 0.01) {
      const jit = win(t, 0, 0.3) * 1.4;
      const jx = Math.sin(S.time * 47) * jit * 4;
      const jy = Math.cos(S.time * 53) * jit * 4;
      W.drawMolecule(ctx, mol, cx + jx, cy + jy, m * 0.03, S.clock * 0.4, S.clock * 0.6, intact, { glow: 1.4 + energy, energy, jitter: jit });
    }
    const zap = bell(t, 0.22, 0.33, 0.02);
    if (zap > 0) {
      const tipX = cx - m * 0.22;
      bolt(tipX, cy, cx, cy, zap, MAGENTA);
      bolt(cx - w * 0.6, cy - h * 0.5, cx, cy, zap * 0.7, VIOLET, 0.22);
      bolt(cx + w * 0.6, cy + h * 0.4, cx, cy, zap * 0.6, MAGENTA, 0.2);
      bolt(cx + w * 0.2, -h * 0.2, cx, cy, zap * 0.5, VIOLET, 0.25);
    }
    if (t > 0.3) {
      const ia = sm(win(t, 0.3, 0.34));
      ions.forEach((ion, i) => {
        const conv = easeIn(win(t, 0.88, 1));
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.beginPath();
        for (let k = 0; k <= 30; k += 1) {
          const q = ionPos(ion, (s * k) / 30, cx, cy, m);
          if (k) ctx.lineTo(q.x, q.y);
          else ctx.moveTo(q.x, q.y);
        }
        ctx.strokeStyle = rgba(i === 0 ? WHITE : MAGENTA, ia * 0.4 * (1 - conv));
        ctx.lineWidth = 1.2;
        ctx.stroke();
        let p = ionPos(ion, s, cx, cy, m);
        const target = { x: w / 2 - panX, y: h / 2 - panY };
        p = { x: lerp(p.x, target.x + (i - 1.5) * 6, conv), y: lerp(p.y, target.y, conv) };
        const r = (ion.parent ? 9 : 6) * (1 + Math.sin(S.time * 8 + i) * 0.1);
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 5);
        g.addColorStop(0, rgba(WHITE, ia));
        g.addColorStop(0.25, rgba(i === 0 ? [255, 200, 240] : MAGENTA, ia * 0.8));
        g.addColorStop(1, rgba(MAGENTA, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * 5, 0, TAU);
        ctx.fill();
        ctx.restore();
        whisper(`${ion.parent ? "[M+H]⁺ " : ""}m/z ${ion.mz.toFixed(1)}`, p.x + 16, p.y - 14, ia * (1 - conv) * 0.85, { weight: 600, color: [255, 220, 245] });
      });
    }
    const ap = easeIn(win(t, 0.86, 1));
    if (ap > 0) {
      const R0 = 20 + ap * Math.max(w, h) * 0.8;
      ctx.strokeStyle = rgba([255, 200, 240], (1 - ap) * 0.7 + 0.2);
      ctx.lineWidth = 2 + ap * 30;
      ctx.beginPath();
      ctx.arc(w / 2 - panX, h / 2 - panY, R0, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
    flash(zap * 0.7, [255, 220, 250]);
    whisper("THE PEAK BECOMES A MOLECULE AGAIN", 28, h - 34, bell(t, 0.0, 0.2, 0.04) * 0.55);
    whisper("IONIZED", 28, h - 34, bell(t, 0.24, 0.42, 0.03) * 0.6, { color: [255, 190, 240] });
    whisper("FRAGMENTS FLY BY MASS-TO-CHARGE", 28, h - 34, bell(t, 0.44, 0.86, 0.04) * 0.55, { color: [255, 190, 240] });
  }

  /* ---------- 09 · through the mass spectrometer ---------- */

  const DET_Z = 20.5;
  W.QUAD.len = DET_Z - 0.3;
  const BEAM = (() => {
    let seed = 11;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    return Array.from({ length: 220 }, () => ({
      z: r() * 22, ax: 0.05 + r() * 0.2, ay: 0.05 + r() * 0.2, w: 1.6 + r() * 2, ph: r() * TAU, v: 0.6 + r() * 0.8,
      un: r() < 0.22, c: r(),
    }));
  })();

  function camZ09(t) {
    return -2 + Math.min(t, 0.875) * 24;
  }

  function named09(mol) {
    return [mol.mz, ...mol.frags].map((mz, i) => ({ mz, i, ph: i * 1.7, ax: 0.18 + i * 0.03, ay: 0.14 + (i % 2) * 0.06 }));
  }

  function ch09(t) {
    const w = S.w;
    const h = S.h;
    const mol = PEAKS[selectedPeak()].mol;
    bgVoid(1, 1);
    const camZ = camZ09(t);
    if (t > 0.45 && S.ion == null) S.ion = 0;
    const named = named09(mol);
    const traced = S.ion != null ? named[S.ion] : null;
    const lock = traced ? sm(win(t, Math.max(0.2, S.ionAt || 0.45), (S.ionAt || 0.45) + 0.12)) : 0;
    const ionXY = (n, z) => ({ x: Math.sin(z * 1.1 + n.ph + S.clock * 2.2) * n.ax, y: Math.cos(z * 0.9 + n.ph * 1.3 + S.clock * 1.7) * n.ay });
    let tz = camZ + 1.5;
    let tp = traced ? ionXY(traced, tz) : { x: 0, y: 0 };
    if (traced && tz >= DET_Z) tz = DET_Z;
    const cx = lerp(S.smx * 0.12, tp.x * 0.8, lock);
    const cy = lerp(-S.smy * 0.1, tp.y * 0.8, lock);
    R.w = w;
    R.h = h;
    R.cam.pos = v(cx, cy, camZ);
    R.cam.target = v(lerp(cx * 0.4, tp.x, lock), lerp(cy * 0.4, tp.y, lock), camZ + 5);
    R.cam.fov = 74 * DEG;
    R.prep();
    W.drawQuad(R, ctx, camZ, S.clock, 1);
    for (let z = Math.ceil(camZ * 1.25) / 1.25; z < Math.min(DET_Z, camZ + 14); z += 0.8) {
      const pts = [];
      for (let i = 0; i <= 48; i += 1) {
        const th = (i / 48) * TAU;
        const r = 0.36 + 0.1 * Math.cos(2 * th) * Math.sin(S.clock * 7 + z * 0.9);
        pts.push(R.project(v(Math.cos(th) * r, Math.sin(th) * r, z)));
      }
      if (pts.some((p) => !p.vis)) continue;
      const depth = pts[0].z;
      const a = clamp(1 - (z - camZ) / 14, 0, 1) * 0.35;
      R.push(depth + 0.5, (c) => {
        c.globalCompositeOperation = "lighter";
        c.strokeStyle = rgba([210, 140, 255], a);
        c.lineWidth = 1;
        c.beginPath();
        pts.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
        c.stroke();
        c.globalCompositeOperation = "source-over";
      });
    }
    const glowAt = (p, r, col, a, cap = 9) => {
      if (!p.vis) return;
      const rr = clamp(r * p.s, 1.2, cap);
      R.push(p.z, (c) => {
        c.globalCompositeOperation = "lighter";
        const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, rr * 4);
        g.addColorStop(0, rgba(WHITE, a));
        g.addColorStop(0.3, rgba(col, a * 0.7));
        g.addColorStop(1, rgba(col, 0));
        c.fillStyle = g;
        c.beginPath();
        c.arc(p.x, p.y, rr * 4, 0, TAU);
        c.fill();
        c.globalCompositeOperation = "source-over";
      });
    };
    BEAM.forEach((b) => {
      const span = 22;
      let z = ((b.z + S.clock * b.v * 5) % span);
      z = camZ - 1 + z;
      if (z > DET_Z) return;
      let amp = 1;
      if (b.un) amp = 1 + Math.max(0, (z - camZ)) * 0.25;
      const x = Math.sin(z * b.w + b.ph) * b.ax * amp;
      const y = Math.cos(z * b.w * 0.9 + b.ph) * b.ay * amp;
      if (Math.hypot(x, y) > 0.55) return;
      const col = b.c < 0.5 ? MAGENTA : b.c < 0.8 ? [200, 140, 255] : [255, 220, 245];
      glowAt(R.project(v(x, y, z)), 0.012, col, 0.8);
    });
    for (let i = 0; i < 10; i += 1) {
      const th = S.clock * 1.6 + i * 0.63;
      const z = camZ + 0.6 + ((i * 0.37 + S.clock * 0.25) % 1) * 3;
      glowAt(R.project(v(cx + Math.cos(th + z) * 0.3, cy + Math.sin(th + z) * 0.3, z)), 0.01, [255, 200, 240], 0.35, 6);
    }
    S.hoverIon = null;
    const hits = [];
    named.forEach((n, i) => {
      if (traced && traced.i === i) return;
      const z = camZ + 2.4 + i * 1.1 + Math.sin(S.clock * 0.5 + i) * 0.3;
      if (z > DET_Z) return;
      const q = ionXY(n, z);
      const p = R.project(v(q.x, q.y, z));
      glowAt(p, 0.03, i === 0 ? [255, 210, 245] : MAGENTA, traced ? 0.4 : 1, 16);
      if (p.vis) hits.push({ i, p, n });
    });
    let tracedScreen = null;
    if (traced) {
      const p = R.project(v(tp.x, tp.y, tz));
      glowAt(p, 0.04, WHITE, 1, 20);
      tracedScreen = p;
    }
    const det = R.project(v(0, 0, DET_Z));
    if (det.vis) {
      G.drawDisc(R, v(0, 0, DET_Z + 0.02), v(0, 0, -1), 0.7, [60, 40, 90], { alpha: 1 });
      [0.2, 0.4, 0.6].forEach((r) => G.drawDisc(R, v(0, 0, DET_Z), v(0, 0, -1), r, [255, 170, 230], { alpha: 0.4, ring: true }));
    }
    R.flush(ctx);
    ctx.globalCompositeOperation = "source-over";

    if (!traced) {
      hits.forEach(({ i, p, n }) => {
        if (Math.hypot(S.mx - p.x, S.my - p.y) < 30) S.hoverIon = i;
        const hv = S.hoverIon === i;
        whisper(`m/z ${n.mz.toFixed(1)}`, p.x + 14, p.y - 12, hv ? 1 : 0.45, { weight: hv ? 600 : 500, color: [255, 215, 245] });
        if (hv) {
          S.tip = `m/z ${n.mz.toFixed(1)} · ${n.i === 0 ? "[M+H]⁺ — the whole molecule, charged" : "a fragment"} · click to TRACE ION`;
          ctx.strokeStyle = rgba(WHITE, 0.6);
          ctx.beginPath();
          ctx.arc(p.x, p.y, 22, 0, TAU);
          ctx.stroke();
        }
      });
      whisper("CLICK AN ION", w / 2, h * 0.9, bell(t, 0.06, 0.46, 0.05) * 0.6, { align: "center", track: 0.5, color: [255, 210, 245] });
    } else if (tracedScreen) {
      const a = lock * (1 - win(t, 0.86, 0.9));
      ctx.save();
      ctx.strokeStyle = rgba(WHITE, a * 0.8);
      const bx = tracedScreen.x;
      const by = tracedScreen.y;
      const s = 26;
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sy]) => {
        ctx.beginPath();
        ctx.moveTo(bx + sx * s, by + sy * (s - 8));
        ctx.lineTo(bx + sx * s, by + sy * s);
        ctx.lineTo(bx + sx * (s - 8), by + sy * s);
        ctx.stroke();
      });
      ctx.restore();
      whisper(`TRACE ION  ·  m/z ${traced.mz.toFixed(1)}`, bx + 36, by - 18, a, { weight: 600, color: WHITE });
    }
    const snap = t >= 0.875 ? 1 : 0;
    if (snap) {
      const k = win(t, 0.875, 1);
      const ctr = R.project(v(tp.x, tp.y, DET_Z));
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < 3; i += 1) {
        ctx.strokeStyle = rgba(WHITE, (1 - k) * 0.8);
        ctx.lineWidth = 2 - i * 0.5;
        ctx.beginPath();
        ctx.arc(ctr.x, ctr.y, 10 + k * (120 + i * 140), 0, TAU);
        ctx.stroke();
      }
      ctx.restore();
      flash(bell(t, 0.875, 0.91, 0.01) * 0.8, [255, 230, 250]);
      spectrumOverlay(mol, traced || named[0], k, 0);
    }
    whisper("INSIDE THE QUADRUPOLE  ·  RF + DC FIELDS", 28, h - 34, bell(t, 0.0, 0.4, 0.05) * 0.55, { color: [255, 200, 240] });
    whisper("ONLY ONE m/z SURVIVES THE PATH", 28, h - 34, bell(t, 0.42, 0.86, 0.05) * 0.55, { color: [255, 200, 240] });
  }

  /* ---------- 10 · spectrum, then the universe ---------- */

  function specPeaks(mol) {
    const main = [
      { mz: mol.mz, h: 0.62, kind: "[M+H]⁺" },
      { mz: mol.frags[0], h: 0.34, kind: "fragment" },
      { mz: mol.frags[1], h: 1, kind: "base peak" },
      { mz: mol.frags[2], h: 0.48, kind: "fragment" },
    ];
    const noise = [74, 96, 121, 233, 268, 352, 389].map((mz, i) => ({ mz, h: 0.04 + ((i * 37) % 7) / 100, kind: "noise" }));
    return main.concat(noise);
  }

  function specBox() {
    return { x0: S.w * 0.1, x1: S.w * 0.9, base: S.h * 0.76, height: S.h * 0.5, lo: 50, hi: 500 };
  }

  function spectrumOverlay(mol, traced, k, t10) {
    const box = specBox();
    const peaks = specPeaks(mol);
    const X = (mz) => box.x0 + ((mz - box.lo) / (box.hi - box.lo)) * (box.x1 - box.x0);
    ctx.save();
    ctx.fillStyle = rgba(WHITE, 0.3 * sm(k * 2));
    ctx.fillRect(box.x0, box.base, (box.x1 - box.x0) * sm(k * 1.5), 1);
    peaks.forEach((p, i) => {
      const isT = Math.abs(p.mz - traced.mz) < 0.01;
      const g = isT ? easeIO(win(k, 0, 0.6)) : easeIO(win(t10, 0.03 + i * 0.022, 0.13 + i * 0.022));
      if (g <= 0) return;
      const x = X(p.mz);
      const top = box.base - p.h * box.height * g;
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = rgba(isT ? WHITE : MAGENTA, 0.25);
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(x, box.base);
      ctx.lineTo(x, top);
      ctx.stroke();
      ctx.strokeStyle = rgba(isT ? WHITE : [255, 160, 225], 1);
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.globalCompositeOperation = "source-over";
      if (p.kind !== "noise") {
        whisper(p.mz.toFixed(1), x, top - 14, g * 0.85, { align: "center", track: 0.05, weight: 600, color: [255, 220, 245] });
        if (Math.abs(S.mx - x) < 14 && S.my < box.base && S.my > top - 24) S.tip = `m/z ${p.mz.toFixed(1)} · ${p.kind}`;
      }
    });
    ctx.restore();
    whisper("m/z", box.x1, box.base + 18, sm(k * 2) * 0.5, { align: "right" });
  }

  function ch10(t) {
    const w = S.w;
    const h = S.h;
    const mol = PEAKS[selectedPeak()].mol;
    const named = named09(mol);
    const traced = S.ion != null ? named[S.ion] : named[0];
    const cosmic = sm(win(t, 0.55, 0.9));
    bgVoid(1, 1 - cosmic);
    if (cosmic > 0) machineRings(cosmic);
    const zoom = easeIO(win(t, 0.3, 0.5));
    const toDots = easeIO(win(t, 0.5, 0.7));
    const toGal = easeIO(win(t, 0.66, 0.95));
    if (t < 0.52) {
      ctx.save();
      const sc = lerp(1, 0.22, zoom);
      ctx.translate(w / 2, h / 2);
      ctx.scale(sc, sc);
      ctx.translate(-w / 2, -h / 2);
      const fade = 1 - win(t, 0.46, 0.52);
      ctx.globalAlpha = fade;
      spectrumOverlay(mol, traced, 1, t);
      ctx.restore();
      ctx.globalAlpha = 1;
      whisper("THE SPECTRUM  ·  A FINGERPRINT BY MASS", 28, h - 34, bell(t, 0, 0.32, 0.04) * 0.6, { color: [255, 210, 245] });
    }
    if (zoom > 0) {
      const lines = specField();
      const la = sm(win(t, 0.32, 0.42)) * (1 - toDots);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      lines.forEach((l) => {
        ctx.strokeStyle = rgba(l.c, la * l.a);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(l.x, l.y0);
        ctx.lineTo(l.x, l.y1);
        ctx.stroke();
      });
      if (toDots > 0) {
        const m = Math.min(w, h);
        const rot = S.clock * 0.05;
        S.galaxy.forEach((p, j) => {
          const l = lines[j % lines.length];
          let x = l.x + Math.sin(p.ph + S.clock) * 30 * toDots;
          let y = lerp(l.y0, l.y1, p.f) + Math.cos(p.ph * 1.3 + S.clock) * 30 * toDots;
          const arm = (j % 3) * (TAU / 3);
          const rr = Math.sqrt(p.r) * m * 0.46;
          const ang = arm + rr * 0.011 + rot + p.sp * 0.5;
          const gx = w / 2 + Math.cos(ang) * rr;
          const gy = h / 2 + Math.sin(ang) * rr * 0.42;
          x = lerp(x, gx, toGal);
          y = lerp(y, gy, toGal);
          const col = W.mixC(l.c, p.c > 0.5 ? [150, 210, 255] : [200, 170, 255], toGal);
          ctx.fillStyle = rgba(col, toDots * (0.35 + p.c * 0.5));
          ctx.fillRect(x, y, 1.5, 1.5);
        });
      }
      ctx.restore();
    }
    if (toGal > 0.5) {
      const core = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.min(w, h) * 0.18);
      core.addColorStop(0, rgba([230, 240, 255], (toGal - 0.5) * 0.9));
      core.addColorStop(1, rgba([96, 140, 255], 0));
      ctx.fillStyle = core;
      ctx.fillRect(0, 0, w, h);
    }
    const end = sm(win(t, 0.82, 0.92));
    if (end > 0.01) {
      const size = Math.min(w * 0.058, 66);
      type("YOU WERE THE SAMPLE.", w / 2, h * 0.22, { size, weight: 800, track: 0.01, alpha: end, blur: (1 - end) * 8 });
      whisper("LIQUID CHROMATOGRAPHY  ·  MASS SPECTROMETRY", w / 2, h * 0.22 + size * 0.95, end * 0.6, { align: "center", track: 0.45 });
      const links = [
        ["↺  RIDE AGAIN", () => autopilot(0, 4, true)],
        ["BACK TO THE MACHINE  →", () => close()],
      ];
      const y = h * 0.86;
      let x = w / 2 - 170;
      links.forEach(([label, act], i) => {
        const tw = measure(label, 11, 600, 0.32, true);
        const lx = i === 0 ? w / 2 - 40 - tw : w / 2 + 40;
        const over = hot(lx - 8, y - 14, tw + 16, 28, act);
        whisper(label, lx, y, end * (over ? 1 : 0.6), { weight: 600, color: WHITE });
        ctx.fillStyle = rgba(WHITE, end * 0.7);
        ctx.fillRect(lx, y + 11, tw * (over ? 1 : 0.15), 1);
        x += tw;
      });
    }
  }

  function specField() {
    if (S.field && S.field.w === S.w && S.field.h === S.h) return S.field.lines;
    const lines = [];
    const cols = 9;
    const rows = 7;
    let seed = 21;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const cw = S.w / cols;
    const ch = S.h / rows;
    for (let i = 0; i < cols; i += 1) {
      for (let j = 0; j < rows; j += 1) {
        const n = 6 + Math.floor(r() * 6);
        for (let k = 0; k < n; k += 1) {
          const x = i * cw + cw * 0.1 + r() * cw * 0.8;
          const base = j * ch + ch * 0.8;
          const hh = ch * (0.08 + Math.pow(r(), 2) * 0.62);
          lines.push({ x, y0: base, y1: base - hh, a: 0.3 + r() * 0.6, c: r() < 0.6 ? MAGENTA : r() < 0.5 ? [200, 160, 255] : [150, 210, 255] });
        }
      }
    }
    S.field = { w: S.w, h: S.h, lines };
    return lines;
  }

  function machineRings(a) {
    const cx = S.w / 2 - S.smx * 14;
    const cy = S.h / 2 - S.smy * 10;
    const m = Math.min(S.w, S.h);
    ctx.save();
    ctx.lineWidth = 1;
    [0.26, 0.4, 0.56].forEach((f, i) => {
      ctx.strokeStyle = rgba([200, 225, 255], (i === 1 ? 0.06 : 0.035) * a);
      ctx.setLineDash(i === 2 ? [2, 7] : []);
      ctx.beginPath();
      ctx.arc(cx, cy, m * f, 0, TAU);
      ctx.stroke();
    });
    ctx.setLineDash([]);
    const tr = m * 0.4;
    for (let i = 0; i < 144; i += 1) {
      const an = S.time * 0.02 + (i / 144) * TAU;
      const l = i % 12 === 0 ? 12 : i % 3 === 0 ? 6 : 3;
      ctx.strokeStyle = rgba([200, 225, 255], (i % 12 === 0 ? 0.12 : 0.05) * a);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(an) * tr, cy + Math.sin(an) * tr);
      ctx.lineTo(cx + Math.cos(an) * (tr + l), cy + Math.sin(an) * (tr + l));
      ctx.stroke();
    }
    ctx.restore();
    stars(a * 0.8);
  }

  const DRAW = [ch00, ch01, ch02, ch03, ch04, ch05, ch06, ch07, ch08, ch09, ch10];

  /* ---------- autopilot, frame, chrome ---------- */

  function autopilot(goal, speed = 0.4, jump = false) {
    if (jump) {
      S.T = goal;
      S.P = goal;
      S.peak = null;
      S.ion = null;
      S.ionAt = null;
      S.parts.forEach((p) => {
        p.ox = p.oy = p.vx = p.vy = 0;
      });
      return;
    }
    S.auto = { goal, speed };
  }

  function frame(time) {
    if (!S.open) return;
    const dt = S.last ? Math.min(0.05, (time - S.last) / 1000) : 0.016;
    S.last = time;
    S.time += dt;
    if (S.auto) {
      const dir = Math.sign(S.auto.goal - S.T);
      S.T += dir * Math.min(Math.abs(S.auto.goal - S.T), dt * S.auto.speed);
      if (Math.abs(S.auto.goal - S.T) < 1e-4) S.auto = null;
    }
    S.T = clamp(S.T, 0, END - 0.001);
    S.prevP = S.P;
    S.P += (S.T - S.P) * (1 - Math.exp(-dt * (reduce ? 12 : 3.4)));
    if (Math.abs(S.T - S.P) < 1e-4) S.P = S.T;
    const c = Math.min(END - 1, Math.floor(S.P));
    const t = S.P - c;

    const frozen = c === 4 && t > 0.57 && t < 0.9;
    S.timeScale = lerp(S.timeScale, frozen ? 0.05 : 1, Math.min(1, dt * 4));
    S.clock += dt * S.timeScale;
    S.flow += dt * 0.9 * S.timeScale;

    S.smx = lerp(S.smx, S.nmx, Math.min(1, dt * 3));
    S.smy = lerp(S.smy, S.nmy, Math.min(1, dt * 3));
    S.cvx = (S.mx - S.pmx) / Math.max(dt, 1e-3);
    S.cvy = (S.my - S.pmy) / Math.max(dt, 1e-3);
    S.pmx = S.mx;
    S.pmy = S.my;
    if (!S.down && c !== 3) {
      S.orbit.yaw = lerp(S.orbit.yaw, 0, Math.min(1, dt * 1.2));
      S.orbit.pitch = lerp(S.orbit.pitch, 0, Math.min(1, dt * 1.2));
    }
    if (c === 0) updateWake(dt);

    if (S.prevP < 6.42 && S.P >= 6.42) boom("boom");
    if (S.prevP < 9.875 && S.P >= 9.875) boom("snap");

    S.hot = [];
    S.tip = "";
    ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.filter = "none";
    const since = S.time - S.boomT;
    if (!reduce && since < 0.7) {
      const k = Math.exp(-since * 6) * 22;
      ctx.translate((Math.random() - 0.5) * k, (Math.random() - 0.5) * k);
    }
    DRAW[c](t, dt);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    if (since < 0.8) flash(Math.exp(-since * 5) * 0.35, S.boomKind === "snap" ? [255, 220, 250] : [220, 240, 255]);
    vignette(c === 0 ? 0.2 : 0.55);
    chrome(c, t);
    S.raf = requestAnimationFrame(frame);
  }

  function boom(kind) {
    S.boomT = S.time;
    S.boomKind = kind;
    root.classList.remove("is-boom");
    void root.offsetWidth;
    root.classList.add("is-boom");
  }

  function chrome(c, t) {
    if (c !== S.chapter) {
      S.chapter = c;
      ui.no.textContent = String(c).padStart(2, "0");
      ui.name.textContent = CHAPTERS[c];
      ui.chap.classList.remove("is-in");
      void ui.chap.offsetWidth;
      ui.chap.classList.add("is-in");
      root.dataset.chapter = String(c);
      ui.ticks.forEach((el, i) => el.classList.toggle("is-on", i <= c));
    }
    ui.fill.style.transform = `scaleY(${(S.P / (END - 0.001)).toFixed(4)})`;
    const idle = S.time - S.lastInput > 6;
    ui.cue.classList.toggle("is-show", (S.P < 0.06 || (idle && c < 10)) && !S.auto);
    root.classList.toggle("is-energy", c >= 8 && !(c === 10 && t > 0.7));
    const hv = S.hot.some((h) => S.mx >= h.x && S.mx <= h.x + h.w && S.my >= h.y && S.my <= h.y + h.h);
    const clicky = hv || (c === 7 && S.hoverPeak != null && t < 0.3) || (c === 9 && S.hoverIon != null);
    root.style.cursor = S.down && S.down.moved ? "grabbing" : clicky ? "pointer" : c === 3 ? "grab" : "default";
    if (S.tip) {
      ui.tip.textContent = S.tip;
      ui.tip.style.transform = `translate(${Math.min(S.mx + 18, S.w - 300)}px, ${S.my + 16}px)`;
      ui.tip.classList.add("is-show");
    } else {
      ui.tip.classList.remove("is-show");
    }
  }

  /* ---------- input ---------- */

  function onWheel(e) {
    e.preventDefault();
    const unit = e.deltaMode === 1 ? 18 : e.deltaMode === 2 ? S.h : 1;
    S.T = clamp(S.T + e.deltaY * unit * 0.00085, 0, END - 0.001);
    S.auto = null;
    S.lastInput = S.time;
  }

  function onKey(e) {
    if (!S.open) return;
    const step = { ArrowDown: 0.1, ArrowRight: 0.1, PageDown: 0.5, " ": 0.25, ArrowUp: -0.1, ArrowLeft: -0.1, PageUp: -0.5 }[e.key];
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopImmediatePropagation();
      close();
      return;
    }
    if (step != null) {
      S.T = clamp(S.T + step, 0, END - 0.001);
      S.auto = null;
    } else if (e.key === "Home") S.T = 0;
    else if (e.key === "End") S.T = END - 0.001;
    else return;
    e.preventDefault();
    e.stopImmediatePropagation();
    S.lastInput = S.time;
  }

  function pointer(e) {
    const r = root.getBoundingClientRect();
    S.mx = e.clientX - r.left;
    S.my = e.clientY - r.top;
    S.nmx = (S.mx / S.w) * 2 - 1;
    S.nmy = (S.my / S.h) * 2 - 1;
  }

  function onMove(e) {
    pointer(e);
    S.lastInput = S.time;
    if (S.down) {
      const dx = S.mx - S.down.x;
      const dy = S.my - S.down.y;
      if (Math.hypot(dx, dy) > 5) S.down.moved = true;
      if (S.down.moved && e.pointerType !== "touch") {
        S.orbit.yaw = S.down.yaw - dx * 0.006;
        S.orbit.pitch = clamp(S.down.pitch + dy * 0.004, -0.5, 0.7);
      }
      if (e.pointerType === "touch") {
        S.T = clamp(S.down.T - dy * 0.0024, 0, END - 0.001);
        S.auto = null;
      }
    }
  }

  function onDown(e) {
    if (e.target.closest(".wr-esc, .wr-rail")) return;
    pointer(e);
    S.down = { x: S.mx, y: S.my, yaw: S.orbit.yaw, pitch: S.orbit.pitch, T: S.T, moved: false };
    try {
      root.setPointerCapture(e.pointerId);
    } catch (err) {
      /* capture unsupported */
    }
  }

  function onUp(e) {
    if (!S.down) return;
    const wasDrag = S.down.moved;
    S.down = null;
    if (wasDrag) return;
    pointer(e);
    click();
  }

  function click() {
    const h = S.hot.find((z) => S.mx >= z.x && S.mx <= z.x + z.w && S.my >= z.y && S.my <= z.y + z.h);
    if (h) {
      h.act();
      return;
    }
    const c = Math.floor(S.P);
    const t = S.P - c;
    if (c === 7 && t < 0.3 && S.hoverPeak != null) {
      S.peak = S.hoverPeak;
      S.T = Math.max(S.T, 7.28);
      autopilot(7.995, 0.13);
    } else if (c === 9 && S.ion == null && S.hoverIon != null) {
      S.ion = S.hoverIon;
      S.ionAt = t;
      autopilot(9.995, 0.16);
    } else if (c === 0 || c === 10) {
      S.parts.forEach((p) => {
        const dx = p.sx - S.mx;
        const dy = p.sy - S.my;
        const d = Math.hypot(dx, dy) || 1;
        if (d < 220) {
          p.vx += (dx / d) * (220 - d) * 6;
          p.vy += (dy / d) * (220 - d) * 6;
        }
      });
    }
  }

  /* ---------- lifecycle ---------- */

  function build() {
    root = document.createElement("div");
    root.className = "wr";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-label", "LC/MS — the path of a sample. Scroll to travel.");
    root.innerHTML = `
      <canvas class="wr-canvas" aria-hidden="true"></canvas>
      <div class="wr-corner">WATERS <span>/</span> LC-MS</div>
      <div class="wr-chap"><span class="wr-chap-no">00</span><span class="wr-chap-name"></span></div>
      <div class="wr-rail" aria-hidden="true"><i class="wr-rail-fill"></i>${CHAPTERS.map((_, i) => `<b style="top:${(i / (END - 1)) * 100}%" data-ch="${i}"></b>`).join("")}</div>
      <div class="wr-cue"><span>SCROLL</span><i></i></div>
      <button type="button" class="wr-esc" aria-label="Leave the ride">ESC</button>
      <div class="wr-tip" role="status"></div>`;
    document.body.appendChild(root);
    cv = root.querySelector(".wr-canvas");
    ctx = cv.getContext("2d");
    layer = document.createElement("canvas");
    lctx = layer.getContext("2d");
    ui = {
      chap: root.querySelector(".wr-chap"),
      no: root.querySelector(".wr-chap-no"),
      name: root.querySelector(".wr-chap-name"),
      fill: root.querySelector(".wr-rail-fill"),
      ticks: [...root.querySelectorAll(".wr-rail b")],
      cue: root.querySelector(".wr-cue"),
      tip: root.querySelector(".wr-tip"),
    };
    root.addEventListener("wheel", onWheel, { passive: false });
    root.addEventListener("pointermove", onMove);
    root.addEventListener("pointerdown", onDown);
    root.addEventListener("pointerup", onUp);
    root.addEventListener("pointerleave", () => {
      S.mx = S.my = -9999;
    });
    root.querySelector(".wr-esc").addEventListener("click", close);
    ui.ticks.forEach((b) => b.addEventListener("click", () => autopilot(Number(b.dataset.ch) + 0.02, 2.2)));
    root.querySelector(".wr-rail").addEventListener("pointerdown", (e) => e.stopPropagation());
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", resize);

    let seed = 5;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    S.stars = Array.from({ length: 240 }, () => ({ x: r(), y: r(), z: 0.2 + r() * 0.8, a: 0.15 + r() * 0.6, tw: 0.5 + r() * 2 }));
    S.galaxy = Array.from({ length: 1600 }, () => ({ f: r(), ph: r() * TAU, r: r(), sp: r(), c: r() }));
  }

  function resize() {
    if (!root) return;
    S.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    S.w = root.clientWidth || window.innerWidth;
    S.h = root.clientHeight || window.innerHeight;
    cv.width = Math.round(S.w * S.dpr);
    cv.height = Math.round(S.h * S.dpr);
    cv.style.width = `${S.w}px`;
    cv.style.height = `${S.h}px`;
    sampleParticles();
  }

  function open(opts = {}) {
    if (!root) build();
    S.onClose = opts.onClose || null;
    const at = clamp(opts.at || 0, 0, END - 0.001);
    S.T = at;
    S.P = at;
    S.prevP = at;
    S.auto = null;
    S.peak = at >= 8 ? 2 : null;
    S.ion = null;
    S.ionAt = null;
    S.chapter = -1;
    S.lastInput = 0;
    S.time = 0;
    S.boomT = -10;
    S.open = true;
    root.hidden = false;
    root.classList.remove("is-closing");
    resize();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => S.open && sampleParticles());
    requestAnimationFrame(() => root.classList.add("is-open"));
    cancelAnimationFrame(S.raf);
    S.last = 0;
    S.raf = requestAnimationFrame(frame);
    root.focus && root.focus();
  }

  function close() {
    if (!S.open) return;
    S.open = false;
    cancelAnimationFrame(S.raf);
    root.classList.remove("is-open");
    root.classList.add("is-closing");
    setTimeout(() => {
      if (!S.open) root.hidden = true;
    }, 420);
    const cb = S.onClose;
    S.onClose = null;
    if (cb) cb();
  }

  global.WatersRide = {
    open,
    close,
    isOpen: () => S.open,
    seek: (p) => {
      S.T = clamp(p, 0, END - 0.001);
      S.P = S.T;
      S.auto = null;
    },
    state: () => ({ P: S.P, T: S.T, chapter: S.chapter, peak: S.peak, ion: S.ion, hoverIon: S.hoverIon, hoverPeak: S.hoverPeak }),
    pick: (kind, i) => {
      if (kind === "peak") S.peak = i;
      if (kind === "ion") {
        S.ion = i;
        S.ionAt = S.P - Math.floor(S.P);
      }
    },
  };
})(window);
