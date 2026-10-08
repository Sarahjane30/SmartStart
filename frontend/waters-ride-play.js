/* Waters LC — become the sample, played rather than watched.
   Four live stages that wait for the reader: choose a molecule, turn the injector, get through
   the column, read your own peak. Scroll only moves between stages; transitions play themselves. */
(function (global) {
  const RIDE = global.WatersRide;
  if (!RIDE) return;
  const kit = RIDE.kit;
  const { S, R, G, W, sm, win, easeIO, camMix, bgVoid, stars, instrument, autopilot, switchTrack, close } = kit;
  const { TAU, DEG, v, lerp, clamp, rgba } = G;
  const cx = () => kit.ctx;

  const FONT = "Inter, system-ui, sans-serif";
  const MONO = '"IBM Plex Mono", ui-monospace, monospace';
  const WHITE = [255, 255, 255];
  const INK = [200, 216, 245];
  const REST = 0.5;
  const LAST = 4;
  const NAMES = ["WHO ARE YOU", "THE MACHINE", "THE INJECTOR", "INSIDE THE COLUMN", "YOUR PEAK"];
  const S_PICK = 0;
  const S_MACHINE = 1;
  const S_INJECT = 2;
  const S_COLUMN = 3;
  const S_PEAK = 4;

  /* Retention follows the usual reversed-phase rule: log k falls linearly as the organic
     fraction rises, steeper for greasier molecules. */
  const MOLS = [
    {
      name: "Paracetamol", mol: "a", trait: "Water-loving", k0: 0.35, sens: 0.8,
      line: "Loves water. Barely notices the greasy beads.",
      reason: "you love water, so the greasy C18 beads barely held you",
      column: "You love water, so the greasy C18 beads barely hold you. Watch the others fall behind.",
    },
    {
      name: "Caffeine", mol: "c", trait: "In between", k0: 1.4, sens: 1,
      line: "Half at home in water, half on the beads.",
      reason: "you're half water-loving and half greasy, so the beads held you some of the time",
      column: "You're in between: the C18 beads grab you now and then, and let go.",
    },
    {
      name: "Ibuprofen", mol: "b", trait: "Greasy", k0: 4.5, sens: 1.35,
      line: "Hates water. Clings to anything greasy.",
      reason: "you're greasy, so the C18 beads kept grabbing you",
      column: "You're greasy, and these beads are coated in greasy C18 chains. They'll keep grabbing you.",
    },
  ].map((m) => ({ ...m, ...{ color: W.molById(m.mol).color, shape: W.molById(m.mol) } }));

  const PHI0 = 0.1;
  const PHI1 = 0.9;
  const V0 = 0.25;
  const MOVE_MEAN = 0.7;
  const MIN_PER_S = 0.125;
  const kOf = (i, phi) => MOLS[i].k0 * Math.pow(10, -MOLS[i].sens * 2 * (phi - 0.3));
  const expRand = (mean) => -Math.log(1 - Math.random() * 0.999) * mean;

  const PL = {
    mol: null,
    hov: [0, 0, 0],
    rotor: 0,
    tap: false,
    injected: false,
    injT: 0,
    phi: 0.3,
    sim: null,
    result: null,
    chromT: null,
    advanceAt: null,
    doneAt: -10,
    nudgeT: -10,
    grabHover: false,
    camZ: 0,
    spd: 6.5,
    breakT: null,
  };
  const BREAK_SECS = 3.6;
  const breakK = () => (PL.breakT == null ? 0 : clamp((S.time - PL.breakT) / BREAK_SECS, 0, 1));

  function resetRun() {
    PL.rotor = 0;
    PL.tap = false;
    PL.injected = false;
    PL.sim = null;
    PL.result = null;
    PL.chromT = null;
    PL.phi = 0.3;
  }

  const done = (c) =>
    c === S_PICK ? PL.mol != null
      : c === S_MACHINE ? breakK() >= 1
        : c === S_INJECT ? PL.injected
          : c === S_COLUMN ? PL.result != null : true;
  const firstOpen = () => {
    for (let c = 0; c < LAST; c += 1) if (!done(c)) return c;
    return LAST;
  };
  const atRest = (c) => Math.abs(S.P - (c + REST)) < 0.03 && !S.auto;

  function go(c) {
    if (c < 0 || c > LAST) return;
    if (c > firstOpen()) {
      PL.nudgeT = S.time;
      return;
    }
    autopilot(c + REST, 0.85);
  }

  function step(dir) {
    const c = clamp(Math.round(S.T - REST), 0, LAST);
    if (dir > 0 && !done(c)) {
      PL.nudgeT = S.time;
      return;
    }
    go(c + dir);
  }

  /* ---------- drawing helpers: plain, readable type ---------- */

  function setTrack(c, px) {
    try {
      c.letterSpacing = `${px}px`;
    } catch (e) {
      /* letterSpacing unsupported */
    }
  }

  function txt(str, x, y, o = {}) {
    const { size = 16, weight = 400, mono = false, color = WHITE, alpha = 1, align = "left", track = 0, base = "middle" } = o;
    if (alpha <= 0.01) return 0;
    const c = cx();
    c.save();
    c.font = `${weight} ${size}px ${mono ? MONO : FONT}`;
    setTrack(c, size * track);
    c.textAlign = align;
    c.textBaseline = base;
    c.fillStyle = rgba(color, alpha);
    c.fillText(str, x, y);
    const wd = c.measureText(str).width;
    c.restore();
    return wd;
  }

  function width(str, size, weight = 400, mono = false, track = 0) {
    const c = cx();
    c.save();
    c.font = `${weight} ${size}px ${mono ? MONO : FONT}`;
    setTrack(c, size * track);
    const wd = c.measureText(str).width;
    c.restore();
    return wd;
  }

  function wrap(str, size, weight, maxW) {
    const words = str.split(" ");
    const lines = [];
    let line = "";
    words.forEach((wd) => {
      const t = line ? `${line} ${wd}` : wd;
      if (width(t, size, weight) > maxW && line) {
        lines.push(line);
        line = wd;
      } else line = t;
    });
    if (line) lines.push(line);
    return lines;
  }

  function glass(x, y, w, h, a, r = 14) {
    const c = cx();
    c.save();
    c.beginPath();
    c.roundRect(x, y, w, h, r);
    c.fillStyle = rgba([8, 14, 34], 0.66 * a);
    c.fill();
    c.strokeStyle = rgba([170, 205, 255], 0.16 * a);
    c.lineWidth = 1;
    c.stroke();
    c.restore();
  }

  const fs = () => clamp(Math.min(S.w * 0.0125, S.h * 0.024), 15, 18);

  /* Instruction card: kicker, title, body. Sits clear of the corner title and the rail. */
  function card(kicker, title, body, a, o = {}) {
    if (a <= 0.01) return 0;
    const narrow = S.w < 760;
    const x = o.x == null ? (narrow ? 18 : 40) : o.x;
    const y = narrow ? 84 : 96;
    const w = narrow ? S.w - 36 : Math.min(400, S.w * 0.32);
    const pad = 20;
    const bs = fs();
    const ts = clamp(Math.min(S.w * 0.02, S.h * 0.036), 21, 28);
    const lines = wrap(body, bs, 400, w - pad * 2);
    const h = pad + 16 + 10 + ts + 12 + lines.length * bs * 1.5 + pad - 4;
    glass(x, y, w, h, a);
    txt(kicker, x + pad, y + pad + 6, { size: 12, weight: 600, mono: true, track: 0.16, color: o.accent || [140, 200, 255], alpha: a });
    txt(title, x + pad, y + pad + 26 + ts / 2, { size: ts, weight: 800, alpha: a });
    lines.forEach((ln, i) => txt(ln, x + pad, y + pad + 38 + ts + bs * 0.75 + i * bs * 1.5, { size: bs, alpha: a * 0.86 }));
    return h;
  }

  function button(label, x, y, o = {}) {
    const { a = 1, color = [140, 200, 255], primary = false, act, align = "center" } = o;
    if (a <= 0.01) return 0;
    const size = 14;
    const tw = width(label, size, 600);
    const bw = tw + 36;
    const bh = 40;
    const x0 = align === "center" ? x - bw / 2 : align === "right" ? x - bw : x;
    const over = act ? kit.hot(x0, y - bh / 2, bw, bh, act) : false;
    const c = cx();
    c.save();
    c.beginPath();
    c.roundRect(x0, y - bh / 2, bw, bh, bh / 2);
    c.fillStyle = primary ? rgba(color, (over ? 0.36 : 0.22) * a) : rgba([20, 30, 60], (over ? 0.8 : 0.55) * a);
    c.fill();
    c.strokeStyle = rgba(primary ? color : [170, 205, 255], (over ? 0.8 : primary ? 0.55 : 0.22) * a);
    c.lineWidth = 1;
    c.stroke();
    c.restore();
    txt(label, x0 + bw / 2, y + 1, { size, weight: 600, align: "center", alpha: a });
    return bw;
  }

  function tag(str, x, y, a, color = WHITE) {
    if (a <= 0.01) return;
    const tw = width(str, 13, 600, true, 0.14);
    glass(x - tw / 2 - 12, y - 14, tw + 24, 28, a, 14);
    txt(str, x, y + 1, { size: 13, weight: 600, mono: true, track: 0.14, align: "center", color, alpha: a });
  }

  function halo(x, y, r, col, a) {
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

  const myColor = () => (PL.mol == null ? [140, 200, 255] : MOLS[PL.mol].color);

  /* Stage boundaries pass through a soft veil tinted by your molecule, so every stage hands
     over to the next without a cut. */
  function veil(k) {
    if (k <= 0.003) return;
    const c = cx();
    c.save();
    c.fillStyle = rgba([3, 7, 20], k);
    c.fillRect(0, 0, S.w, S.h);
    c.restore();
    halo(S.w / 2, S.h / 2, Math.max(S.w, S.h) * 0.45, myColor(), k * 0.22);
  }

  function hint(str, y, a) {
    const nud = Math.exp(-(S.time - PL.nudgeT) * 3);
    const pulse = 0.55 + 0.25 * Math.sin(S.time * 3) + nud * 0.4;
    const dx = Math.sin((S.time - PL.nudgeT) * 40) * 6 * nud;
    txt(str, S.w / 2 + dx, y, { size: 13, weight: 600, mono: true, track: 0.14, align: "center", color: WHITE, alpha: a * clamp(pulse, 0, 1) });
  }

  /* ---------- 0 · who are you ---------- */

  function choose(i) {
    if (PL.mol === i && PL.injected) return;
    PL.mol = i;
    resetRun();
    PL.doneAt = S.time;
    PL.advanceAt = S.time + 1.1;
  }

  function stagePick(t, dt) {
    const w = S.w;
    const h = S.h;
    bgVoid();
    stars(0.55);
    const chosen = PL.mol;
    const exitK = easeIO(win(t, 0.5, 1));
    const ta = sm(win(t, 0.12, 0.42)) * (1 - sm(win(t, 0.5, 0.66)));
    const size = clamp(Math.min(w * 0.045, h * 0.075), 30, 56);
    txt("Become the sample.", w / 2, h * 0.16, { size, weight: 800, align: "center", alpha: ta });
    const sub = chosen == null
      ? "Three molecules share one sample. Pick one. You'll travel through the instrument as it."
      : `You're ${MOLS[chosen].name}. ${MOLS[chosen].line}`;
    wrap(sub, fs() + 1, 400, Math.min(720, w - 60)).forEach((ln, i) =>
      txt(ln, w / 2, h * 0.16 + size * 0.95 + i * 26, { size: fs() + 1, align: "center", alpha: ta * 0.82 })
    );

    const narrow = w < 720;
    const cw = Math.min(w * (narrow ? 0.3 : 0.24), 300);
    MOLS.forEach((m, i) => {
      let x = w * (0.5 + (i - 1) * (narrow ? 0.32 : 0.26));
      let y = h * 0.52;
      const appear = sm(win(t, 0.14 + i * 0.05, 0.38 + i * 0.05));
      const mine = chosen === i;
      const focus = chosen == null ? 1 : mine ? 1 : 0.28;
      const over = chosen == null && t > 0.4 && t < 0.6 ? kit.hot(x - cw / 2, y - h * 0.17, cw, h * 0.42, () => choose(i)) : false;
      PL.hov[i] = lerp(PL.hov[i], over || mine ? 1 : 0, Math.min(1, dt * 8));
      let a = appear * focus;
      let ms = h * 0.03 * (1 + PL.hov[i] * 0.22);
      if (mine) {
        x = lerp(x, w / 2, exitK);
        y = lerp(y, h * 0.5, exitK);
        ms *= 1 + exitK * 4;
      } else a *= 1 - exitK;
      halo(x, y, ms * 5, m.color, a * (0.18 + PL.hov[i] * 0.22));
      W.drawMolecule(cx(), m.shape, x, y, ms, S.clock * 0.5 + i * 2, S.clock * 0.7 + i, a, { glow: 1 + PL.hov[i] * 0.6 });
      const la = a * (1 - exitK);
      const ny = h * 0.52 + h * 0.15;
      txt(m.name, x, ny, { size: 22, weight: 800, align: "center", alpha: la });
      txt(m.trait.toUpperCase(), x, ny + 26, { size: 12, weight: 600, mono: true, track: 0.16, align: "center", color: m.color, alpha: la });
      wrap(m.line, 15, 400, cw - 10).forEach((ln, k) => txt(ln, x, ny + 52 + k * 21, { size: 15, align: "center", alpha: la * 0.72 }));
    });
    if (chosen == null) hint("CLICK A MOLECULE TO BECOME IT", h * 0.9, ta);
  }

  /* ---------- 1 · the machine: one instrument that comes apart ---------- */

  const JOBS = { reservoir: "holds the solvents", detector: "sees what comes out", column: "where separation happens", injector: "where you're waiting", pump: "pushes the solvent" };
  const T_ASM = v(5.2, 1.15, 0.2);
  const T_LAID = v(5.55, 0.78, 0.2);

  function machineCam(b) {
    const narrow = S.w < 760;
    const k = easeIO(b);
    const d = lerp(narrow ? 10.5 : 8.2, narrow ? 17 : 13.4, k);
    const yaw = lerp(-0.55 + Math.sin(S.time * 0.12) * 0.06, 0.18, k) + S.smx * 0.06;
    const el = lerp(0.22, 0.2, k) - S.smy * 0.03;
    const tg = G.mix3(T_ASM, T_LAID, k);
    return { pos: v(tg.x + Math.sin(yaw) * Math.cos(el) * d, tg.y + Math.sin(el) * d, tg.z + Math.cos(yaw) * Math.cos(el) * d), target: tg, fov: 40 * DEG };
  }
  const machineShift = (b) => (S.w < 760 ? 0 : lerp(S.w * 0.12, S.w * 0.03, easeIO(b)));

  /* Machine stage exit and injector stage intro are one camera move, eased as a whole. */
  function flyIn(u) {
    const k = easeIO(clamp(u, 0, 1));
    return { cam: camMix(machineCam(1), C1_REST, k), shift: machineShift(1) * (1 - k) };
  }

  function openUp() {
    if (PL.breakT != null) return;
    PL.breakT = S.time;
    PL.advanceAt = S.time + BREAK_SECS + 1.6;
  }

  function stageMachine(t) {
    const w = S.w;
    const h = S.h;
    bgVoid();
    stars(0.4);
    const b = breakK();
    let cam = machineCam(b);
    let shift = machineShift(b);
    if (t > 0.5) {
      const f = flyIn(t - 0.5);
      cam = f.cam;
      shift = f.shift;
    }
    const c = cx();
    c.save();
    c.translate(shift, 0);
    kit.setCam(cam);
    W.drawTower(R, { break: b, time: S.clock, alpha: 1, detGlow: 0.35, loop: 1 });
    c.globalCompositeOperation = "source-over";
    R.flush(c);
    c.restore();

    const ua = sm(win(t, 0.34, 0.48)) * (1 - sm(win(t, 0.52, 0.6)));
    const pre = ua * (1 - sm(b / 0.12));
    W.STACK.forEach((m, i) => {
      const q = R.project(G.add(W.towerSlot(m), v(W.TOWER.w + 0.02, m.id === "reservoir" ? 0.2 : 0, 0)));
      if (!q.vis || pre <= 0.01) return;
      const al = pre * sm(win(t, 0.36 + i * 0.02, 0.44 + i * 0.02));
      const x0 = q.x + shift;
      const lx = x0 + 46 + (i % 2) * 16;
      c.save();
      c.strokeStyle = rgba([200, 225, 255], 0.45 * al);
      c.beginPath();
      c.moveTo(x0, q.y);
      c.lineTo(lx - 6, q.y);
      c.stroke();
      c.restore();
      const mine = m.id === "injector";
      txt(m.name, lx, q.y - 8, { size: 13, weight: 700, mono: true, track: 0.1, color: mine ? myColor() : WHITE, alpha: al });
      txt(JOBS[m.id], lx, q.y + 11, { size: 14, alpha: al * 0.75 });
    });
    if (pre > 0.01) {
      const q = R.project(G.add(W.towerSlot(W.STACK[3]), v(0, 0, W.TOWER.d)));
      const ph = (S.time * 0.9) % 1;
      halo(q.x + shift, q.y, 26, myColor(), 0.8 * pre);
      c.save();
      c.strokeStyle = rgba(myColor(), (1 - ph) * 0.8 * pre);
      c.lineWidth = 1.5;
      c.beginPath();
      c.arc(q.x + shift, q.y, 8 + ph * 30, 0, TAU);
      c.stroke();
      c.restore();
      tag(`YOU · ${MOLS[PL.mol == null ? 0 : PL.mol].name.toUpperCase()}`, q.x + shift - 90, q.y + 34, pre, myColor());
    }
    const post = ua * sm((b - 0.9) / 0.1);
    W.COMP_IDS.forEach((id, i) => {
      if (post <= 0.01) return;
      const q = R.project(W.COMP[id].c);
      if (!q.vis) return;
      const ly = q.y - W.COMP[id].r * q.s * 0.95 - (i % 2) * 26;
      tag(`0${i + 1}  ${W.COMP[id].label}`, q.x + shift, ly, post * (id === "injector" ? 1 : 0.85), id === "injector" ? myColor() : WHITE);
    });

    if (PL.breakT == null) {
      card("STAGE 1 · THE MACHINE", "This is where you are.", "A complete LC system, as it sits on a lab bench: a tower of stacked modules. You're in a tiny vial inside the sample manager. Open it up to see the path you're about to take.", ua, { accent: myColor() });
      button("Open it up", w / 2, h - 64, { a: ua, primary: true, color: myColor(), act: openUp });
    } else if (b < 1) {
      card("STAGE 1 · THE MACHINE", "Coming apart.", "Each module lifts off and becomes the part inside it: solvents, pump, injector, column, detector.", ua, { accent: myColor() });
    } else {
      card("STAGE 1 · THE MACHINE", "Five parts, one path.", "Laid out in the order the liquid flows. Your first stop: the injector, where you'll enter the stream.", ua, { accent: myColor() });
    }
  }

  /* ---------- 2 · the injector ---------- */

  const C1_REST = { pos: v(5.6, 1.3, 3.9), target: v(5.08, 0.8, 0.5), fov: 36 * DEG };
  const C1_OUT = { pos: v(6.55, 0.86, 1.05), target: v(7.7, 0.65, 0.15), fov: 52 * DEG };
  const ROTOR = v(5.2, 0.65, 0.6);
  const U_INJ = W.PATH.piece("injector").u0;
  const U_COL = W.PATH.piece("column").u0;
  const SWEEP = Math.PI / 3;
  const LEVER = 0.44;
  /* Matches drawInjector: the lever sits at 90° − 60°·rotor on the stator face. */
  const onValve = (k, rad) => {
    const an = (Math.PI / 180) * (90 - 60 * k);
    return v(ROTOR.x + Math.cos(an) * rad, ROTOR.y + Math.sin(an) * rad, 0.665);
  };

  function inject() {
    if (PL.injected) return;
    PL.injected = true;
    PL.rotor = 1;
    PL.injT = S.time;
    PL.doneAt = S.time;
    PL.advanceAt = S.time + 2.1;
  }

  function stageInject(t, dt) {
    const w = S.w;
    const h = S.h;
    bgVoid();
    stars(0.3);
    const fly = flyIn(0.5 + Math.min(t, 0.5));
    let cam = fly.cam;
    if (t > 0.5) cam = camMix(C1_REST, C1_OUT, easeIO(win(t, 0.5, 1)));
    cam = {
      ...cam,
      pos: G.add(cam.pos, v(Math.sin(S.time * 0.3) * 0.04 + S.smx * 0.08, -S.smy * 0.05, 0)),
    };
    const live = Math.abs(t - REST) < 0.06 && !PL.injected;
    const since = S.time - PL.injT;
    const dots = [];
    if (PL.injected) {
      const k = easeIO(clamp(since / 1.7, 0, 1));
      MOLS.forEach((m, i) => {
        const mine = i === PL.mol;
        dots.push({ u: lerp(U_INJ, U_COL + 0.02, k) - (i - 1) * 0.005, color: m.color, size: mine ? 0.05 : 0.03, alpha: mine ? 1 : 0.75 });
      });
    }
    const shift = t < 0.5 ? fly.shift : 0;
    cx().save();
    cx().translate(shift, 0);
    instrument(cam, { rotor: PL.rotor, loop: PL.injected ? 1 - clamp(since / 0.6, 0, 1) : 1, dots, colGlow: PL.injected ? 0.6 : 0.2, detGlow: 0.3 });
    cx().restore();

    const p0 = R.project(ROTOR);
    const p = { ...p0, x: p0.x + shift };
    const lever = (k, rad = LEVER) => {
      const q = R.project(onValve(k, rad));
      return { x: q.x + shift, y: q.y };
    };
    const knob = lever(PL.rotor);
    PL.grabHover = false;
    if (live) {
      const hit = (x, y) => Math.hypot(x - p.x, y - p.y) < LEVER * p.s * 1.25 || Math.hypot(x - knob.x, y - knob.y) < 44;
      if (S.down && S.down.grab == null) {
        S.down.grab = hit(S.down.x, S.down.y) ? "rotor" : false;
        if (S.down.grab) {
          S.down.ang0 = Math.atan2(S.down.y - p.y, S.down.x - p.x);
          S.down.r0 = PL.rotor;
        }
      }
      PL.grabHover = hit(S.mx, S.my);
      if (S.down && S.down.grab === "rotor") {
        let d = Math.atan2(S.my - p.y, S.mx - p.x) - S.down.ang0;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        PL.rotor = clamp(S.down.r0 + d / SWEEP, 0, 1);
      } else {
        const goal = PL.tap || PL.rotor > 0.55 ? 1 : 0;
        PL.rotor += (goal - PL.rotor) * Math.min(1, dt * (PL.tap ? 3.5 : 7));
      }
      if (PL.rotor > 0.985) inject();
    }

    const ua = sm(win(t, 0.36, 0.48)) * (1 - sm(win(t, 0.52, 0.62)));
    if (ua > 0.01) {
      const c = cx();
      const col = myColor();
      const path = (k0, k1, rad) => {
        c.beginPath();
        for (let i = 0; i <= 24; i += 1) {
          const q = lever(lerp(k0, k1, i / 24), rad);
          if (i) c.lineTo(q.x, q.y);
          else c.moveTo(q.x, q.y);
        }
      };
      c.save();
      c.lineCap = "round";
      c.setLineDash([2, 9]);
      c.strokeStyle = rgba(WHITE, 0.4 * ua);
      c.lineWidth = 2.5;
      path(0, 1, LEVER * 1.32);
      c.stroke();
      c.setLineDash([]);
      c.strokeStyle = rgba(col, 0.95 * ua);
      c.lineWidth = 4;
      if (PL.rotor > 0.01) {
        path(0, PL.rotor, LEVER * 1.32);
        c.stroke();
      }
      const end = lever(1, LEVER * 1.32);
      const pre = lever(0.93, LEVER * 1.32);
      const an = Math.atan2(end.y - pre.y, end.x - pre.x);
      c.fillStyle = rgba(PL.rotor > 0.5 ? col : WHITE, 0.7 * ua);
      c.beginPath();
      c.moveTo(end.x + Math.cos(an) * 10, end.y + Math.sin(an) * 10);
      c.lineTo(end.x + Math.cos(an + 2.4) * 9, end.y + Math.sin(an + 2.4) * 9);
      c.lineTo(end.x + Math.cos(an - 2.4) * 9, end.y + Math.sin(an - 2.4) * 9);
      c.fill();
      c.restore();
      if (!PL.injected) {
        const ph = (S.time * 0.8) % 1;
        c.save();
        c.strokeStyle = rgba(col, (1 - ph) * 0.7 * ua);
        c.lineWidth = 1.5;
        c.beginPath();
        c.arc(knob.x, knob.y, 14 + ph * 24, 0, TAU);
        c.stroke();
        c.restore();
      }
      halo(knob.x, knob.y, 30 + PL.grabHover * 10, col, (0.35 + PL.grabHover * 0.25) * ua);
      const l0 = lever(-0.12, LEVER * 1.62);
      const l1 = lever(1.12, LEVER * 1.62);
      tag("LOAD", l0.x, l0.y, ua * (PL.rotor < 0.5 ? 1 : 0.55), WHITE);
      tag("INJECT", l1.x, l1.y, ua * (PL.rotor > 0.5 ? 1 : 0.7), PL.rotor > 0.5 ? col : WHITE);
    }

    const ca = sm(win(t, 0.34, 0.48)) * (1 - sm(win(t, 0.52, 0.64)));
    if (!PL.injected) {
      card("STAGE 2 · THE INJECTOR", "Turn the valve.", "You're waiting in the sample loop, the coil beside the valve, with the other molecules. Turn the handle from LOAD to INJECT: the rotor's grooves re-route the solvent through the loop.", ca, { accent: myColor() });
      hint("DRAG THE HANDLE ROUND  ·  OR CLICK THE VALVE", h - 30, ca);
    } else {
      card("STAGE 2 · THE INJECTOR", "Injected.", "The solvent stream, pushed by the pump at around 600 bar, sweeps the whole sample, you included, toward the column.", ca, { accent: myColor() });
    }
    void w;
  }

  /* ---------- 2 · inside the column ---------- */

  const LANES = [{ x: -1.1, y: 0.55 }, { x: 1.2, y: -0.35 }, { x: 0.35, y: 0.9 }];

  function simReset() {
    PL.sim = { t: 0, pos: [0, 0, 0], fin: [null, null, null], stuck: false, left: 0.6, kPrev: null, phiSum: 0, mx: S.w / 2, my: S.h * 0.56, stuckT: 0, anchor: null, bead: 0, release: -10 };
  }

  function simStep(dt) {
    const s = PL.sim;
    s.t += dt;
    s.phiSum += PL.phi * dt;
    const me = PL.mol;
    const k = kOf(me, PL.phi);
    if (s.kPrev != null && s.stuck) s.left *= k / s.kPrev;
    s.kPrev = k;
    MOLS.forEach((m, i) => {
      if (s.fin[i] != null) return;
      let vel;
      if (i === me) {
        s.left -= dt;
        if (s.stuck) {
          vel = 0;
          if (s.left <= 0) {
            s.stuck = false;
            s.left = expRand(MOVE_MEAN);
            s.release = S.time;
          }
        } else {
          vel = V0;
          if (s.left <= 0) {
            s.stuck = true;
            s.left = clamp(expRand(MOVE_MEAN * k), 0.18, 6);
            s.stuckT = S.time;
            s.anchor = { x: (Math.random() - 0.5) * 0.16, y: (Math.random() - 0.5) * 0.1 };
          }
        }
      } else vel = V0 / (1 + kOf(i, PL.phi));
      s.pos[i] = Math.min(1, s.pos[i] + vel * dt);
      if (s.pos[i] >= 1) s.fin[i] = s.t;
    });
    if (s.fin[me] != null && !PL.result) finish();
  }

  function finish() {
    const s = PL.sim;
    const tR = MOLS.map((m, i) => {
      if (s.fin[i] != null) return s.fin[i] * MIN_PER_S;
      return (s.t + (1 - s.pos[i]) / (V0 / (1 + kOf(i, PL.phi)))) * MIN_PER_S;
    });
    PL.result = { tR, phi: s.phiSum / Math.max(0.01, s.t) };
    PL.doneAt = S.time;
    PL.advanceAt = S.time + 2.2;
  }

  function slider(a) {
    const w = S.w;
    const h = S.h;
    const sw = Math.min(560, w * 0.5);
    const sx = w / 2 - sw / 2;
    const sy = h - 96;
    const live = a > 0.5 && !PL.result;
    const inside = (x, y) => x >= sx - 18 && x <= sx + sw + 18 && y >= sy - 26 && y <= sy + 26;
    if (live) {
      if (S.down && S.down.grab == null) S.down.grab = inside(S.down.x, S.down.y) ? "phi" : false;
      if (S.down && S.down.grab === "phi") PL.phi = clamp(PHI0 + ((S.mx - sx) / sw) * (PHI1 - PHI0), PHI0, PHI1);
      if (inside(S.mx, S.my)) PL.grabHover = true;
    }
    glass(sx - 24, sy - 46, sw + 48, 96, a, 16);
    const pct = Math.round(PL.phi * 100);
    txt("SOLVENT STRENGTH", sx, sy - 24, { size: 12, weight: 600, mono: true, track: 0.16, color: [140, 200, 255], alpha: a });
    txt(`${pct}% organic`, sx + sw, sy - 24, { size: 15, weight: 700, align: "right", alpha: a });
    const c = cx();
    const g = c.createLinearGradient(sx, 0, sx + sw, 0);
    g.addColorStop(0, rgba([60, 120, 230], a));
    g.addColorStop(1, rgba([210, 245, 255], a));
    c.save();
    c.beginPath();
    c.roundRect(sx, sy - 3, sw, 6, 3);
    c.fillStyle = rgba([255, 255, 255], 0.1 * a);
    c.fill();
    const kx = sx + ((PL.phi - PHI0) / (PHI1 - PHI0)) * sw;
    c.beginPath();
    c.roundRect(sx, sy - 3, kx - sx, 6, 3);
    c.fillStyle = g;
    c.fill();
    c.restore();
    halo(kx, sy, 26, [170, 225, 255], 0.45 * a);
    c.save();
    c.fillStyle = rgba(WHITE, a);
    c.beginPath();
    c.arc(kx, sy, 10, 0, TAU);
    c.fill();
    c.restore();
    txt("more water", sx, sy + 24, { size: 13, alpha: a * 0.6 });
    txt("stronger solvent: beads let go sooner", sx + sw, sy + 24, { size: 13, align: "right", alpha: a * 0.6 });
  }

  function gauge(a) {
    const h = S.h;
    const s = PL.sim;
    const x = S.w < 760 ? 26 : 52;
    const y0 = h * 0.4;
    const y1 = h * 0.78;
    const c = cx();
    c.save();
    c.beginPath();
    c.roundRect(x - 9, y0 - 12, 18, y1 - y0 + 24, 9);
    c.fillStyle = rgba([12, 22, 50], 0.7 * a);
    c.fill();
    c.strokeStyle = rgba([170, 205, 255], 0.25 * a);
    c.stroke();
    c.restore();
    txt("INLET", x, y0 - 28, { size: 11, weight: 600, mono: true, track: 0.14, align: "center", alpha: a * 0.6 });
    txt("OUTLET", x, y1 + 30, { size: 11, weight: 600, mono: true, track: 0.14, align: "center", alpha: a * 0.6 });
    if (!s) return;
    MOLS.forEach((m, i) => {
      const y = lerp(y0, y1, s.pos[i]);
      const mine = i === PL.mol;
      halo(x, y, mine ? 22 : 12, m.color, a * (mine ? 0.7 : 0.4));
      c.save();
      c.fillStyle = rgba(m.color, a);
      c.beginPath();
      c.arc(x, y, mine ? 6 : 4, 0, TAU);
      c.fill();
      c.restore();
      txt(mine ? `YOU · ${m.name}` : m.name, x + 18, y, { size: mine ? 13 : 12, weight: mine ? 700 : 500, color: mine ? WHITE : m.color, alpha: a * (mine ? 1 : 0.75) });
    });
  }

  function stageColumn(t, dt) {
    const w = S.w;
    const h = S.h;
    if (PL.mol == null) return;
    if (!PL.sim) simReset();
    const s = PL.sim;
    const running = atRest(S_COLUMN) && !PL.result;
    if (running) simStep(dt);
    const me = MOLS[PL.mol];
    const target = !PL.result && running ? (s.stuck ? 0.12 : 6.5) : t > 0.5 ? 11 : 6.5;
    PL.spd = lerp(PL.spd, target, Math.min(1, dt * 3));
    PL.camZ += PL.spd * dt;
    bgVoid();
    const cam = {
      x: Math.sin(S.clock * 0.21) * 0.2 + S.smx * 0.3,
      y: Math.cos(S.clock * 0.17) * 0.14 - S.smy * 0.22,
      z: PL.camZ,
      yaw: S.smx * 0.07,
      pitch: S.smy * 0.05,
      focus: 2.6,
    };
    W.drawLandscape(cx(), w, h, cam, S.clock, { alpha: 1, streakK: clamp(PL.spd / 6.5, 0.05, 1.4), focus: 2.6 });

    MOLS.forEach((m, i) => {
      if (i === PL.mol) return;
      const d = s.pos[i] - s.pos[PL.mol];
      if (d < 0.004 || d > 0.6) return;
      const z = 2.6 + d * 34;
      const q = W.landProject(cam, w, h, { x: LANES[i].x, y: LANES[i].y, z });
      const fa = clamp(1 - z / 22, 0, 1) * clamp((d - 0.004) / 0.02, 0, 1);
      W.drawMolecule(cx(), m.shape, q.x, q.y, 0.13 * q.s, S.clock * 0.6 + i, S.clock * 0.8, fa, { glow: 1.1 });
      if (z < 9) txt(m.name, q.x, q.y - 0.13 * q.s * 3.4, { size: 13, weight: 600, align: "center", color: m.color, alpha: fa * 0.9 });
    });

    const stuckK = s.stuck ? sm((S.time - s.stuckT) / 0.35) : 0;
    let tx = w / 2 + S.nmx * w * 0.16;
    let ty = h * 0.56 + S.nmy * h * 0.12;
    if (s.stuck && s.anchor) {
      tx = lerp(tx, w / 2 + s.anchor.x * w, stuckK);
      ty = lerp(ty, h * 0.56 + s.anchor.y * h, stuckK);
    }
    s.mx = lerp(s.mx, tx, Math.min(1, dt * 5));
    s.my = lerp(s.my, ty, Math.min(1, dt * 5));
    s.bead = lerp(s.bead, s.stuck ? 1 : 0, Math.min(1, dt * (s.stuck ? 5 : 2.5)));
    const ms = h * 0.05;
    const enter = sm(win(t, 0.2, 0.45));
    if (s.bead > 0.01) {
      const br = h * 0.2 * (1 + (1 - s.bead) * (s.stuck ? 0.3 : 1.4));
      const bx = s.mx + (s.anchor ? Math.sign(s.anchor.x || 1) : 1) * br * 0.95;
      W.drawBead(cx(), bx, s.my + br * 0.25, br, 0.4, s.bead * enter);
    }
    halo(s.mx, s.my, ms * 4, me.color, 0.35 * enter);
    W.drawMolecule(cx(), me.shape, s.mx, s.my, ms, S.clock * 0.5 + s.mx * 0.004, S.clock * 0.8 + s.my * 0.004, enter, { glow: 1.5 });
    if (stuckK > 0.05) {
      const c = cx();
      c.save();
      c.strokeStyle = rgba(me.color, 0.6 * stuckK);
      c.setLineDash([3, 6]);
      c.lineDashOffset = -S.time * 20;
      c.beginPath();
      c.arc(s.mx, s.my, ms * 3.6, 0, TAU);
      c.stroke();
      c.restore();
      txt("HELD BY A C18 BEAD", s.mx, s.my - ms * 4.4, { size: 13, weight: 600, mono: true, track: 0.14, align: "center", color: me.color, alpha: stuckK });
    }
    const rel = S.time - s.release;
    if (rel < 0.6) {
      const c = cx();
      c.save();
      c.strokeStyle = rgba(WHITE, (1 - rel / 0.6) * 0.6);
      c.lineWidth = 1.5;
      c.beginPath();
      c.arc(s.mx, s.my, ms * (2 + rel * 8), 0, TAU);
      c.stroke();
      c.restore();
    }

    PL.grabHover = false;
    const ua = sm(win(t, 0.34, 0.48)) * (1 - sm(win(t, 0.52, 0.64)));
    gauge(ua);
    slider(ua);
    const tmin = s.t * MIN_PER_S;
    const rx = w - (w < 760 ? 22 : 64);
    txt("TIME IN THE COLUMN", rx, 124, { size: 12, weight: 600, mono: true, track: 0.16, align: "right", color: [140, 200, 255], alpha: ua });
    txt(`${tmin.toFixed(2)} min`, rx, 156, { size: 28, weight: 800, align: "right", alpha: ua });
    txt(s.stuck ? "Held by a bead" : "Moving with the solvent", rx, 188, { size: 15, align: "right", color: s.stuck ? me.color : WHITE, alpha: ua * 0.85 });

    let body = me.column;
    const stuckFor = s.stuck ? S.time - s.stuckT : 0;
    if (stuckFor > 2.5 || (PL.mol === 2 && s.t > 8 && PL.phi < 0.45)) body = "Taking a while? Slide the solvent strength up. A stronger solvent pulls you off the beads sooner.";
    if (!PL.result) card("STAGE 3 · INSIDE THE COLUMN", "Get through the column.", body, ua * (w < 760 ? 0 : 1), { x: w < 760 ? 18 : 96, accent: me.color });

    if (PL.result) {
      const k = sm((S.time - PL.doneAt) / 0.5) * (1 - sm(win(t, 0.52, 0.62)));
      const size = clamp(Math.min(w * 0.045, h * 0.08), 30, 54);
      veil(k * 0.45);
      txt("You're out.", w / 2, h * 0.42, { size, weight: 800, align: "center", alpha: k });
      txt(`${PL.result.tR[PL.mol].toFixed(2)} min in the column`, w / 2, h * 0.42 + size * 0.9, { size: fs() + 2, align: "center", alpha: k * 0.85 });
    }
  }

  /* ---------- 3 · your peak ---------- */

  function chartFrame() {
    const w = S.w;
    const h = S.h;
    const cw = Math.min(900, w * 0.74);
    const short = h < 680;
    return { x0: w / 2 - cw / 2, x1: w / 2 + cw / 2, y0: h * (short ? 0.27 : 0.3), y1: h * (short ? 0.58 : 0.64), short };
  }

  function stagePeak(t) {
    const w = S.w;
    const h = S.h;
    bgVoid();
    stars(0.3);
    const res = PL.result;
    if (!res) return;
    if (PL.chromT == null && t > 0.42) PL.chromT = S.time;
    const reveal = PL.chromT == null ? 0 : clamp((S.time - PL.chromT) / 2.8, 0, 1);
    const a = sm(win(t, 0.3, 0.48));
    const me = PL.mol;
    const size = clamp(Math.min(w * 0.04, h * 0.07), 28, 48);
    txt("Your peak.", w / 2, h * 0.13, { size, weight: 800, align: "center", alpha: a });
    txt("What the detector drew as you, and the others, crossed its beam of UV light.", w / 2, h * 0.13 + size * 0.85, { size: fs(), align: "center", alpha: a * 0.8 });

    const F = chartFrame();
    const tMax = Math.ceil((Math.max(...res.tR) * 1.18 + 0.2) * 2) / 2;
    const X = (tm) => lerp(F.x0, F.x1, tm / tMax);
    const sig = res.tR.map((tr) => 0.012 + tr * 0.022);
    const ht = sig.map((sg) => 0.024 / sg);
    const hmax = Math.max(...ht);
    const Y = (val) => F.y1 - (val / hmax) * (F.y1 - F.y0) * (F.short ? 0.52 : 0.66);
    const sigAt = (tm) => res.tR.reduce((acc, tr, i) => acc + ht[i] * Math.exp(-((tm - tr) ** 2) / (2 * sig[i] ** 2)), 0);
    const c = cx();
    glass(F.x0 - 30, F.y0 - 36, F.x1 - F.x0 + 60, F.y1 - F.y0 + 84, a, 16);
    c.save();
    c.strokeStyle = rgba(WHITE, 0.2 * a);
    c.beginPath();
    c.moveTo(F.x0, F.y1);
    c.lineTo(F.x1, F.y1);
    c.stroke();
    const stepT = tMax > 6 ? 1 : 0.5;
    for (let tm = 0; tm <= tMax + 1e-6; tm += stepT) {
      const x = X(tm);
      c.strokeStyle = rgba(WHITE, 0.06 * a);
      c.beginPath();
      c.moveTo(x, F.y0 - 10);
      c.lineTo(x, F.y1);
      c.stroke();
      txt(stepT < 1 ? tm.toFixed(1) : String(tm), x, F.y1 + 18, { size: 12, mono: true, align: "center", alpha: a * 0.6 });
    }
    c.restore();
    txt("minutes", F.x1, F.y1 + 38, { size: 12, mono: true, align: "right", alpha: a * 0.5 });
    txt("UV signal", F.x0, F.y0 - 18, { size: 12, mono: true, alpha: a * 0.5 });

    const tEnd = reveal * tMax;
    res.tR.forEach((tr, i) => {
      const mine = i === me;
      c.save();
      c.beginPath();
      c.moveTo(X(0), F.y1);
      for (let tm = 0; tm <= tEnd; tm += tMax / 400) {
        c.lineTo(X(tm), Y(ht[i] * Math.exp(-((tm - tr) ** 2) / (2 * sig[i] ** 2))));
      }
      c.lineTo(X(tEnd), F.y1);
      c.closePath();
      c.fillStyle = rgba(MOLS[i].color, (mine ? 0.42 : 0.16) * a);
      c.fill();
      c.restore();
    });
    c.save();
    c.strokeStyle = rgba(WHITE, 0.9 * a);
    c.lineWidth = 1.6;
    c.beginPath();
    for (let tm = 0; tm <= tEnd; tm += tMax / 500) {
      const x = X(tm);
      const y = Y(sigAt(tm));
      if (tm === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.stroke();
    c.restore();
    if (reveal < 1 && reveal > 0) {
      const x = X(tEnd);
      halo(x, Y(sigAt(tEnd)), 22, [170, 225, 255], 0.8 * a);
      c.save();
      c.strokeStyle = rgba([170, 225, 255], 0.35 * a);
      c.beginPath();
      c.moveTo(x, F.y0 - 10);
      c.lineTo(x, F.y1);
      c.stroke();
      c.restore();
    }
    const labels = res.tR.map((tr, i) => {
      const mine = i === me;
      const str = mine ? `YOU · ${MOLS[i].name} · ${tr.toFixed(2)} min` : `${MOLS[i].name} · ${tr.toFixed(2)} min`;
      return { i, tr, str, mine, w: width(str, 13, mine ? 700 : 500) + 24, x: X(tr) };
    });
    const rows = [];
    labels.sort((p, q) => p.x - q.x).forEach((L) => {
      let r = 0;
      while ((rows[r] || []).some((o) => Math.abs(o.x - L.x) < (o.w + L.w) / 2 + 10)) r += 1;
      (rows[r] = rows[r] || []).push(L);
      L.row = r;
    });
    const top = Y(hmax) - 30;
    labels.forEach((L) => {
      const la = a * sm((tEnd - L.tr) / (tMax * 0.04));
      if (la <= 0.01) return;
      const col = MOLS[L.i].color;
      const ly = top - L.row * (F.short ? 31 : 36);
      c.save();
      c.strokeStyle = rgba(col, 0.45 * la);
      c.setLineDash([2, 4]);
      c.beginPath();
      c.moveTo(L.x, ly + 14);
      c.lineTo(L.x, Y(ht[L.i]) - 4);
      c.stroke();
      c.setLineDash([]);
      c.beginPath();
      c.roundRect(L.x - L.w / 2, ly - 14, L.w, 28, 14);
      c.fillStyle = L.mine ? rgba(col, 0.3 * la) : rgba([8, 14, 34], 0.85 * la);
      c.fill();
      c.strokeStyle = rgba(col, (L.mine ? 0.85 : 0.4) * la);
      c.stroke();
      c.restore();
      txt(L.str, L.x, ly + 1, { size: 13, weight: L.mine ? 700 : 500, align: "center", color: L.mine ? WHITE : col, alpha: la });
    });

    const ea = a * sm((reveal - 0.92) / 0.08);
    if (ea > 0.01) {
      const order = res.tR.map((tr, i) => [tr, i]).sort((p, q) => p[0] - q[0]).map((p) => p[1]);
      const rank = order.indexOf(me);
      const pct = Math.round(res.phi * 100);
      const l1 = `You came out ${["first", "second", "last"][rank]}, at ${res.tR[me].toFixed(2)} min, because ${MOLS[me].reason}.`;
      let l2;
      if (res.phi < 0.35) l2 = `You kept the solvent weak (${pct}% organic), so the beads held everyone longer: well separated, but slow.`;
      else if (res.phi < 0.62) l2 = `At about ${pct}% organic, the peaks came out well spread and in good time.`;
      else l2 = `You pushed the solvent strong (${pct}% organic), so the beads let go fast: a quick run, but the peaks crowd together.`;
      const gaps = order.slice(1).map((i, k) => (res.tR[i] - res.tR[order[k]]) / (2 * (sig[i] + sig[order[k]])));
      if (Math.min(...gaps) < 1) {
        l2 = `At about ${pct}% organic, some peaks came out on top of each other. That's poor separation: try a weaker solvent to spread them apart.`;
      }
      const y = F.y1 + (F.short ? 64 : 76);
      const lw = Math.min(900, w - 60);
      const lines = [...wrap(l1, fs() + 1, 600, lw), ...wrap(l2, fs(), 400, lw)];
      lines.forEach((ln, i) => txt(ln, w / 2, y + i * 24, { size: i === 0 ? fs() + 1 : fs(), weight: i < wrap(l1, fs() + 1, 600, lw).length ? 600 : 400, align: "center", alpha: ea * (i === 0 ? 1 : 0.82) }));

      const by = Math.max(y + lines.length * 24 + 26, Math.min(h - 54, y + lines.length * 26 + 42));
      const others = MOLS.map((m, i) => i).filter((i) => i !== me);
      const items = [
        ...others.map((i) => [`Try as ${MOLS[i].name}`, () => retry(i), true, MOLS[i].color]),
        ["Ride the ions (MS) →", () => switchTrack("ride-ms", 8), false],
        ["How LC works", () => switchTrack("observe-lc", 0), false],
        ["Back to the machine", () => close(), false],
      ];
      const gap = 12;
      const widths = items.map(([label]) => width(label, 14, 600) + 36);
      const total = widths.reduce((p, q) => p + q, 0) + gap * (items.length - 1);
      if (total < w - 40) {
        let x = w / 2 - total / 2;
        items.forEach(([label, act, primary, color], i) => {
          button(label, x, by, { a: ea, act, primary, color, align: "left" });
          x += widths[i] + gap;
        });
      } else {
        const rows = [items.slice(0, 2), items.slice(2)];
        rows.forEach((row, r) => {
          const ws = row.map(([label]) => width(label, 14, 600) + 36);
          let x = w / 2 - (ws.reduce((p, q) => p + q, 0) + gap * (row.length - 1)) / 2;
          row.forEach(([label, act, primary, color], i) => {
            button(label, x, by - 50 + r * 50, { a: ea, act, primary, color, align: "left" });
            x += ws[i] + gap;
          });
        });
      }
    }
  }

  function retry(i) {
    PL.mol = i;
    resetRun();
    PL.camZ = 0;
    autopilot(S_INJECT + REST, 0, true);
  }

  /* ---------- wiring ---------- */

  function edges(i, t) {
    if (i === 0) {
      const k = 1 - sm(win(t, 0, 0.25));
      if (k > 0.003) {
        const c = cx();
        c.fillStyle = rgba([0, 0, 0], k);
        c.fillRect(0, 0, S.w, S.h);
      }
    } else if (i !== S_INJECT) veil(1 - sm(win(t, 0, 0.32)));
    if (i < LAST && i !== S_MACHINE) veil(sm(win(t, 0.68, 1)));
  }

  const staged = (i, fn) => (t, dt) => {
    if (!S.auto && Math.floor(S.T) === i && Math.abs(S.T - (i + REST)) > 1e-3) autopilot(i + REST, 0.85);
    fn(t, dt);
    edges(i, t);
    if (PL.advanceAt && S.time >= PL.advanceAt && atRest(i)) {
      PL.advanceAt = null;
      go(i + 1);
    }
  };

  RIDE.registerTrack("ride-lc", {
    kind: "lc",
    ride: true,
    stages: true,
    names: NAMES,
    lo: 0,
    hi: LAST + 1,
    draw: [staged(S_PICK, stagePick), staged(S_MACHINE, stageMachine), staged(S_INJECT, stageInject), staged(S_COLUMN, stageColumn), staged(S_PEAK, stagePeak)],
    limit: () => firstOpen() + REST,
    step,
    go,
    enter: () => {
      PL.mol = null;
      PL.breakT = null;
      PL.advanceAt = null;
      PL.camZ = 0;
      resetRun();
    },
    cue: (c, t, idle) => done(c) && c < LAST && atRest(c) && !PL.advanceAt && idle,
    grab: () => PL.grabHover,
    click: (c) => {
      if (c === S_MACHINE && PL.breakT == null) openUp();
      if (c === S_INJECT && !PL.injected) {
        const p = R.project(ROTOR);
        if (Math.hypot(S.mx - p.x, S.my - p.y) < LEVER * p.s * 1.6) PL.tap = true;
      }
    },
  });
})(window);
