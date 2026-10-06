/* Waters LC/MS ride — world assets.
   The instrument at ride scale (built from the shared WatersGfx3D kit), the porous landscape
   inside the column, the tubing tunnel, molecules and the quadrupole. Pure drawing: no state
   beyond cached sprites, so every scene can be scrubbed backwards by the scroll camera. */
(function (global) {
  const G = global.WatersGfx3D;
  const { TAU, v, add, sub, mul, mix3, lerp, clamp, ease, smooth, rgba, shade, PEARL, STEEL, CYAN, VIOLET, MINT } = G;

  const MAGENTA = [255, 96, 196];
  const WHITE = [255, 255, 255];
  const INK = [16, 24, 46];

  /* ---------- the three molecules ---------- */

  function hexRing(cx, cy, r, z = 0, phase = 0) {
    const out = [];
    for (let i = 0; i < 6; i += 1) {
      const a = phase + (i / 6) * TAU;
      out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r, z + (i % 2 ? 0.08 : -0.08)]);
    }
    return out;
  }

  function buildAtoms(kind) {
    const atoms = [];
    const bonds = [];
    const addAtom = (p, r, k) => atoms.push({ x: p[0], y: p[1], z: p[2], r, k }) - 1;
    const ring = (pts, k = 2) => {
      const idx = pts.map((p) => addAtom(p, 0.34, k));
      idx.forEach((id, i) => bonds.push([id, idx[(i + 1) % idx.length]]));
      return idx;
    };
    if (kind === "a") {
      const r = ring(hexRing(0, 0, 1));
      const o = addAtom([1.9, 0.2, 0.2], 0.4, 0);
      bonds.push([r[0], o]);
      const n = addAtom([-1.8, -0.4, -0.2], 0.38, 0);
      bonds.push([r[3], n]);
      const h = addAtom([-2.5, 0.3, 0.3], 0.22, 1);
      bonds.push([n, h]);
    } else if (kind === "b") {
      const r1 = ring(hexRing(-0.87, 0, 1, 0, Math.PI / 6));
      const r2 = ring(hexRing(0.87, 0, 1, 0, Math.PI / 6));
      bonds.push([r1[0], r2[3]]);
      let prev = r2[0];
      [[2.6, 0.5, 0.3], [3.4, -0.2, -0.2], [4.3, 0.4, 0.2]].forEach((p, i) => {
        const id = addAtom(p, i === 2 ? 0.42 : 0.32, i === 2 ? 0 : 2);
        bonds.push([prev, id]);
        prev = id;
      });
      const o2 = addAtom([4.9, -0.3, -0.3], 0.26, 1);
      bonds.push([prev, o2]);
      const t = addAtom([-2.6, 0.6, 0.4], 0.38, 0);
      bonds.push([r1[3], t]);
    } else {
      let prev = -1;
      const zig = [[-2.6, -0.4, 0], [-1.7, 0.3, 0.3], [-0.8, -0.3, -0.2], [0.1, 0.4, 0.2], [1.0, -0.3, -0.3], [1.9, 0.4, 0.1], [2.8, -0.2, 0.3]];
      zig.forEach((p, i) => {
        const id = addAtom(p, i % 3 === 0 ? 0.4 : 0.32, i % 3 === 0 ? 0 : 2);
        if (prev >= 0) bonds.push([prev, id]);
        prev = id;
      });
      [[-1.7, 1.3, 0.5, 2], [1.0, -1.3, -0.4, 4], [0.1, 1.4, -0.4, 3]].forEach(([x, y, z, at]) => {
        const id = addAtom([x, y, z], 0.24, 1);
        bonds.push([at, id]);
      });
    }
    const cx = atoms.reduce((s, a) => s + a.x, 0) / atoms.length;
    const cy = atoms.reduce((s, a) => s + a.y, 0) / atoms.length;
    atoms.forEach((a) => {
      a.x -= cx;
      a.y -= cy;
    });
    return { atoms, bonds };
  }

  const MOLS = [
    {
      id: "a", short: "A", color: CYAN, trait: "VELOCITY", rt: 1.2, mz: 180.1,
      frags: [163.1, 138.1, 110.1],
      line: "Barely touches the particles. First out.",
    },
    {
      id: "c", short: "C", color: MINT, trait: "INTERACTION", rt: 2.6, mz: 310.2,
      frags: [292.2, 248.1, 165.1],
      line: "Binds, lets go, binds again. Never the same path twice.",
    },
    {
      id: "b", short: "B", color: VIOLET, trait: "RETENTION", rt: 4.1, mz: 445.2,
      frags: [427.2, 301.1, 199.1],
      line: "Clings to the stationary phase. Held back. Last out.",
    },
  ];
  MOLS.forEach((m) => Object.assign(m, buildAtoms(m.id)));
  const molById = (id) => MOLS.find((m) => m.id === id) || MOLS[2];

  /* Molecule: rotated ball-and-stick cluster with a soft halo. `energy` pushes it toward
     the MS palette (hot white core, magenta rim). */
  function drawMolecule(ctx, mol, x, y, size, rx, ry, alpha = 1, opts = {}) {
    if (alpha <= 0.01 || size < 0.5) return;
    const { glow = 1, energy = 0, jitter = 0, blur = 0 } = opts;
    const cyr = Math.cos(ry);
    const syr = Math.sin(ry);
    const cxr = Math.cos(rx);
    const sxr = Math.sin(rx);
    const col = energy > 0 ? mixC(mol.color, MAGENTA, energy) : mol.color;
    const pts = mol.atoms.map((a, i) => {
      const jx = jitter ? Math.sin(i * 12.7 + jitter * 91) * 0.25 * jitter : 0;
      const jy = jitter ? Math.cos(i * 7.3 + jitter * 77) * 0.25 * jitter : 0;
      const X = a.x + jx;
      const Y = a.y + jy;
      const x1 = X * cyr + a.z * syr;
      const z1 = -X * syr + a.z * cyr;
      const y1 = Y * cxr - z1 * sxr;
      const z2 = Y * sxr + z1 * cxr;
      const persp = 1 / (1 + z2 * 0.06);
      return { x: x + x1 * size * persp, y: y + y1 * size * persp, z: z2, r: a.r * 1.55 * size * persp, k: a.k };
    });
    ctx.save();
    // Out-of-focus molecules: per-draw canvas blur filters are far too slow, so defocus is
    // faked by fading the sharp core and widening the halo.
    const soft = clamp(blur / 8, 0, 1);
    alpha *= 1 - soft * 0.55;
    if (glow > 0) {
      const R = size * 6 * (1 + soft * 0.8);
      const g = ctx.createRadialGradient(x, y, 0, x, y, R);
      g.addColorStop(0, rgba(col, alpha * 0.32 * glow));
      g.addColorStop(0.4, rgba(col, alpha * 0.1 * glow));
      g.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, R, 0, TAU);
      ctx.fill();
    }
    ctx.lineCap = "round";
    mol.bonds.forEach(([i, j]) => {
      const a = pts[i];
      const b = pts[j];
      ctx.strokeStyle = rgba(shade(col, 0.75), alpha * 0.85);
      ctx.lineWidth = Math.max(1, size * 0.16);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.strokeStyle = rgba(WHITE, alpha * 0.35);
      ctx.lineWidth = Math.max(0.5, size * 0.05);
      ctx.stroke();
    });
    pts
      .map((p, i) => ({ ...p, i }))
      .sort((a, b) => b.z - a.z)
      .forEach((p) => {
        const base = p.k === 1 ? [235, 242, 255] : p.k === 2 ? shade(col, 0.62) : col;
        const g = ctx.createRadialGradient(p.x - p.r * 0.4, p.y - p.r * 0.45, p.r * 0.06, p.x, p.y, p.r);
        g.addColorStop(0, rgba(WHITE, alpha * 0.95));
        g.addColorStop(0.3, rgba(shade(base, 1.08), alpha));
        g.addColorStop(1, rgba(shade(base, 0.34), alpha));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.6, p.r), 0, TAU);
        ctx.fill();
        if (energy > 0.2) {
          ctx.strokeStyle = rgba(MAGENTA, alpha * energy * 0.6);
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      });
    ctx.restore();
  }

  function mixC(a, b, k) {
    return [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
  }

  /* ---------- porous stationary-phase particle sprites (depth-of-field levels) ---------- */

  const BLUR_LEVELS = [0, 2.5, 6, 11, 18];
  let beadSprites = null;

  function makeBeadSprites() {
    if (beadSprites) return beadSprites;
    const D = 220;
    const PAD = 50;
    const base = document.createElement("canvas");
    base.width = base.height = D + PAD * 2;
    const b = base.getContext("2d");
    const c = D / 2 + PAD;
    const r = D / 2;
    const g = b.createRadialGradient(c - r * 0.38, c - r * 0.42, r * 0.05, c, c, r);
    g.addColorStop(0, "rgb(236,242,255)");
    g.addColorStop(0.25, "rgb(178,196,232)");
    g.addColorStop(0.7, "rgb(76,96,150)");
    g.addColorStop(1, "rgb(22,32,66)");
    b.fillStyle = g;
    b.beginPath();
    b.arc(c, c, r, 0, TAU);
    b.fill();
    b.save();
    b.beginPath();
    b.arc(c, c, r, 0, TAU);
    b.clip();
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 260; i += 1) {
      const u = rnd() * 2 - 1;
      const th = rnd() * TAU;
      const sr = Math.sqrt(1 - u * u);
      const nx = sr * Math.cos(th);
      const ny = sr * Math.sin(th);
      const nz = Math.abs(u);
      const px = c + nx * r;
      const py = c + ny * r;
      const pr = (2 + rnd() * 7) * (0.6 + nz * 0.5);
      const ang = Math.atan2(ny, nx);
      b.save();
      b.translate(px, py);
      b.rotate(ang);
      b.fillStyle = `rgba(6,12,34,${0.25 + nz * 0.45})`;
      b.beginPath();
      b.ellipse(0, 0, pr * Math.max(0.25, nz), pr, 0, 0, TAU);
      b.fill();
      b.strokeStyle = `rgba(220,235,255,${0.12 + nz * 0.25})`;
      b.lineWidth = 1;
      b.beginPath();
      b.ellipse(0.8, 0, pr * Math.max(0.25, nz), pr, 0, -1.2, 1.2);
      b.stroke();
      b.restore();
    }
    const rim = b.createRadialGradient(c, c, r * 0.72, c, c, r);
    rim.addColorStop(0, "rgba(96,214,255,0)");
    rim.addColorStop(1, "rgba(120,220,255,0.5)");
    b.fillStyle = rim;
    b.fillRect(0, 0, base.width, base.height);
    b.restore();

    beadSprites = BLUR_LEVELS.map((bl) => {
      if (!bl) return base;
      const cv = document.createElement("canvas");
      cv.width = cv.height = base.width;
      const x = cv.getContext("2d");
      x.filter = `blur(${bl}px)`;
      x.drawImage(base, 0, 0);
      return cv;
    });
    beadSprites.D = D;
    beadSprites.PAD = PAD;
    return beadSprites;
  }

  /* `level` is fractional: blends neighbouring blur sprites for a continuous depth of field. */
  function drawBead(ctx, x, y, radius, level, alpha) {
    const sp = makeBeadSprites();
    if (radius < 1 || alpha <= 0.01) return;
    const k = (radius * 2) / sp.D;
    const size = sp[0].width * k;
    const lv = clamp(level, 0, BLUR_LEVELS.length - 1);
    const i0 = Math.floor(lv);
    const f = lv - i0;
    ctx.globalAlpha = alpha * (1 - f);
    ctx.drawImage(sp[i0], x - size / 2, y - size / 2, size, size);
    if (f > 0.02 && i0 + 1 < sp.length) {
      ctx.globalAlpha = alpha * f;
      ctx.drawImage(sp[i0 + 1], x - size / 2, y - size / 2, size, size);
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- the forward landscape inside the column ---------- */

  const DEPTH = 40;
  function rng(seed) {
    let s = seed;
    return () => ((s = (s * 16807) % 2147483647) / 2147483647);
  }
  const LAND = (() => {
    const r = rng(42);
    const beads = [];
    while (beads.length < 150) {
      const x = (r() * 2 - 1) * 8;
      const y = (r() * 2 - 1) * 5.5;
      if (Math.abs(x) < 1.6 && Math.abs(y) < 1.2) continue;
      beads.push({ x, y, z: r() * DEPTH, r: 0.8 + r() * 1.3 });
    }
    const streaks = [];
    for (let i = 0; i < 260; i += 1) streaks.push({ x: (r() * 2 - 1) * 6, y: (r() * 2 - 1) * 4, z: r() * DEPTH, s: 0.6 + r() });
    const drifters = [];
    for (let i = 0; i < 22; i += 1) {
      drifters.push({ x: (r() * 2 - 1) * 4.5, y: (r() * 2 - 1) * 3, z: r() * DEPTH, m: i % 3, s: 0.3 + r() * 0.8, rot: r() * TAU });
    }
    return { beads, streaks, drifters };
  })();

  function landProject(cam, w, h, p) {
    const dx = p.x - cam.x;
    const dy = p.y - cam.y;
    const dz = p.z;
    const cy = Math.cos(cam.yaw);
    const sy = Math.sin(cam.yaw);
    const x1 = dx * cy - dz * sy;
    const z1 = dx * sy + dz * cy;
    const cp = Math.cos(cam.pitch);
    const sp = Math.sin(cam.pitch);
    const y1 = dy * cp - z1 * sp;
    const z2 = dy * sp + z1 * cp;
    const f = h * 0.9;
    return { x: w / 2 + (x1 / z2) * f, y: h / 2 - (y1 / z2) * f, z: z2, s: f / z2 };
  }

  const wrapZ = (z, camZ) => ((((z - camZ) % DEPTH) + DEPTH) % DEPTH);

  /* cam: { x, y, z, yaw, pitch, focus }  — the flow runs along +z */
  function drawLandscape(ctx, w, h, cam, clock, opts = {}) {
    const { alpha = 1, streakK = 1, focus = 5, drifters = true } = opts;
    const items = [];
    LAND.beads.forEach((b) => {
      const rel = wrapZ(b.z, cam.z);
      if (rel < 0.35) return;
      items.push({ z: rel, kind: 0, b });
    });
    if (drifters) {
      LAND.drifters.forEach((d) => {
        const rel = wrapZ(d.z + clock * d.s * 2.2, cam.z);
        if (rel < 0.6) return;
        items.push({ z: rel, kind: 1, d });
      });
    }
    items.sort((a, b) => b.z - a.z);
    const fog = (z) => clamp(1.35 - z / (DEPTH * 0.82), 0, 1);
    for (const it of items) {
      if (it.kind === 0) {
        const p = landProject(cam, w, h, { x: it.b.x, y: it.b.y, z: it.z });
        if (p.z < 0.3) continue;
        const rr = it.b.r * p.s;
        if (p.x < -rr * 2 || p.x > w + rr * 2 || p.y < -rr * 2 || p.y > h + rr * 2) continue;
        const lvl = clamp(Math.abs(p.z - focus) / 3.2, 0, 4);
        drawBead(ctx, p.x, p.y, rr, lvl, alpha * fog(p.z) * (p.z < 1.2 ? p.z / 1.2 : 1));
      } else {
        const d = it.d;
        const p = landProject(cam, w, h, { x: d.x, y: d.y, z: it.z });
        if (p.z < 0.5) continue;
        const m = MOLS[d.m];
        const lvl = Math.abs(p.z - focus) / 1.5;
        drawMolecule(ctx, m, p.x, p.y, 0.09 * p.s, clock * 0.4 + d.rot, clock * 0.7 + d.rot, alpha * fog(p.z) * 0.85, {
          glow: 0.8,
          blur: Math.min(8, lvl * 1.4),
        });
      }
    }
    if (streakK > 0) {
      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";
      LAND.streaks.forEach((s) => {
        const rel = wrapZ(s.z - clock * s.s * 3, cam.z);
        if (rel < 0.4 || rel > 22) return;
        const a = landProject(cam, w, h, { x: s.x, y: s.y, z: rel });
        const b = landProject(cam, w, h, { x: s.x, y: s.y, z: rel + 0.5 + streakK * 1.4 });
        const al = alpha * clamp(1 - rel / 22, 0, 1) * 0.35;
        ctx.strokeStyle = rgba([150, 220, 255], al);
        ctx.lineWidth = Math.max(0.6, 0.03 * a.s);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      });
      ctx.globalCompositeOperation = "source-over";
    }
  }

  /* ---------- side-on landscape: three parallax layers of particles ---------- */

  const SIDE = (() => {
    const r = rng(9);
    const layer = (n, r0, r1, lvl, speed, yJ) =>
      Array.from({ length: n }, (_, i) => ({ u: (i + r() * 0.6) / n, y: r(), r: r0 + r() * (r1 - r0), lvl, speed, yJ }));
    return [layer(14, 0.04, 0.08, 3, 0.25, 1), layer(6, 0.1, 0.15, 0, 1, 1), layer(3, 0.24, 0.34, 4, 2.4, 1)];
  })();

  /* drift: horizontal camera travel in screen widths. `skip(layer, bead)` lets a scene own a bead. */
  function drawSideLayer(ctx, w, h, li, drift, par, alpha, scale = 1) {
    const L = SIDE[li];
    const m = Math.min(w, h);
    const span = 1.4;
    L.forEach((b) => {
      let u = (b.u - drift * b.speed - par.x * 0.02 * b.speed) % span;
      if (u < 0) u += span;
      const x = (u - 0.2) * w;
      const y = (li === 1 ? 0.12 + b.y * 0.86 : b.y) * h + par.y * 14 * b.speed;
      const cx = w / 2 + (x - w / 2) * scale;
      const cy = h / 2 + (y - h / 2) * scale;
      drawBead(ctx, cx, cy, b.r * m * scale, b.lvl, alpha);
    });
  }

  /* ---------- tubing tunnel (inside the capillary) ---------- */

  function drawTunnel(ctx, w, h, clock, opts = {}) {
    const { alpha = 1, speed = 1, tint = CYAN, sample = null, bend = 1, dir = 1 } = opts;
    if (alpha <= 0.01) return;
    const N = 44;
    const ZMAX = 11;
    const m = Math.min(w, h);
    const center = (z) => ({
      x: w / 2 + Math.sin(clock * 0.6 + z * 0.22) * m * 0.06 * bend * (z / ZMAX) * 3,
      y: h / 2 + Math.cos(clock * 0.45 + z * 0.18) * m * 0.04 * bend * (z / ZMAX) * 3,
    });
    const travel = clock * speed * 2.2 * dir;
    const phase = ((travel % 1) + 1) % 1;
    ctx.save();
    ctx.fillStyle = rgba([3, 6, 18], alpha);
    ctx.fillRect(0, 0, w, h);
    const bg = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, m * 0.9);
    bg.addColorStop(0, rgba(shade(tint, 0.35), alpha * 0.55));
    bg.addColorStop(0.4, rgba([8, 16, 40], alpha * 0.5));
    bg.addColorStop(1, rgba([2, 4, 12], 0));
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = "lighter";
    for (let i = N - 1; i >= 0; i -= 1) {
      const z = ((i + 1 - phase) / N) * ZMAX + 0.15;
      const c = center(z);
      const r = (m * 0.5) / z;
      const a = alpha * clamp(1 - z / ZMAX, 0, 1) * (z < 0.6 ? z / 0.6 : 1);
      ctx.strokeStyle = rgba([200, 228, 255], a * (i % 4 === 0 ? 0.3 : 0.1));
      ctx.lineWidth = Math.max(0.6, 2.4 / z);
      ctx.beginPath();
      ctx.arc(c.x, c.y, r, 0, TAU);
      ctx.stroke();
    }
    [-0.7, -0.55, 2.3].forEach((ang, k) => {
      ctx.beginPath();
      for (let s = 0; s <= 30; s += 1) {
        const z = 0.2 + (s / 30) * ZMAX;
        const c = center(z);
        const r = (m * 0.5) / z;
        const x = c.x + Math.cos(ang) * r;
        const y = c.y + Math.sin(ang) * r;
        if (s) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
      ctx.strokeStyle = rgba([235, 245, 255], alpha * (k === 2 ? 0.1 : 0.22));
      ctx.lineWidth = k === 0 ? 3 : 1.2;
      ctx.stroke();
    });
    const r0 = rng(5);
    for (let i = 0; i < 220; i += 1) {
      const th = r0() * TAU;
      const rr = Math.sqrt(r0()) * 0.85;
      const zs = r0() * ZMAX;
      const sp = 0.7 + r0() * 0.8;
      const isSample = sample && i % 3 === 0;
      let z = (zs - clock * speed * 3.2 * sp * dir) % ZMAX;
      if (z < 0) z += ZMAX;
      z += 0.2;
      const z2 = z + 0.25 * speed * sp * dir;
      const c1 = center(z);
      const c2 = center(Math.max(0.2, z2));
      const s1 = (m * 0.5) / z;
      const s2 = (m * 0.5) / Math.max(0.2, z2);
      const a = alpha * clamp(1 - z / ZMAX, 0, 1) * 0.7;
      ctx.strokeStyle = rgba(isSample ? sample : tint, a);
      ctx.lineWidth = Math.max(0.8, (isSample ? 3.2 : 1.6) / z);
      ctx.beginPath();
      ctx.moveTo(c1.x + Math.cos(th) * rr * s1, c1.y + Math.sin(th) * rr * s1);
      ctx.lineTo(c2.x + Math.cos(th) * rr * s2, c2.y + Math.sin(th) * rr * s2);
      ctx.stroke();
    }
    ctx.restore();
  }

  /* ---------- the LC instrument at ride scale ---------- */

  const COMP = {
    reservoir: { c: v(0, 1.15, 0), r: 0.95, label: "RESERVOIR", line: "Solvents A + B. The mobile phase that will carry everything." },
    pump: { c: v(2.7, 0.45, 0.1), r: 0.85, label: "PUMP", line: "Two pistons, 1,000 bar, a flow that never stutters." },
    injector: { c: v(5.2, 0.7, 0.2), r: 0.8, label: "INJECTOR", line: "A rotor turns. The sample joins the stream." },
    column: { c: v(7.6, 0.65, 0.15), r: 1.2, label: "COLUMN", line: "Billions of porous particles. Where things separate." },
    detector: { c: v(10.35, 0.6, 0.1), r: 0.85, label: "DETECTOR", line: "Light through a flow cell. Every molecule leaves a mark." },
  };
  const COMP_IDS = Object.keys(COMP);

  const smoothP = (pts) => G.smoothPath(pts.map((p) => v(p[0], p[1], p[2])), 8);
  const TUBES = [
    { id: "t1", from: "reservoir", to: "pump", pts: smoothP([[0, 1.84, -0.38], [0, 2.12, -0.38], [0.8, 2.1, -0.1], [1.65, 1.15, 0.35], [2.1, 0.45, 0.62]]) },
    { id: "t1b", from: "reservoir", to: "pump", pts: smoothP([[0, 1.84, 0.38], [0, 2.02, 0.38], [0.85, 1.95, 0.5], [1.7, 1.05, 0.55], [2.1, 0.45, 0.62]]), side: true },
    { id: "t2", from: "pump", to: "injector", pts: smoothP([[3.25, 0.4, 0.62], [3.8, 0.6, 0.78], [4.45, 0.66, 0.72], [5.0, 0.65, 0.66]]) },
    { id: "t3", from: "injector", to: "column", pts: smoothP([[5.4, 0.65, 0.66], [5.85, 0.68, 0.6], [6.2, 0.66, 0.3], [6.36, 0.65, 0.15]]) },
    { id: "t4", from: "column", to: "detector", pts: smoothP([[8.86, 0.65, 0.15], [9.25, 0.62, 0.42], [9.6, 0.6, 0.5], [10.2, 0.6, 0.47]]) },
  ];
  const tubeById = (id) => TUBES.find((t) => t.id === id);

  const PATH = (() => {
    const pieces = [
      { id: "t1", pts: tubeById("t1").pts },
      { id: "pump", pts: [v(2.1, 0.45, 0.62), v(2.7, 0.4, 0.66), v(3.25, 0.4, 0.62)] },
      { id: "t2", pts: tubeById("t2").pts },
      { id: "injector", pts: [v(5.0, 0.65, 0.66), v(5.2, 0.65, 0.7), v(5.4, 0.65, 0.66)] },
      { id: "t3", pts: tubeById("t3").pts },
      { id: "column", pts: [v(6.36, 0.65, 0.15), v(8.86, 0.65, 0.15)] },
      { id: "t4", pts: tubeById("t4").pts },
    ];
    const all = [];
    pieces.forEach((p, i) => p.pts.forEach((q, j) => (i && !j ? null : all.push(q))));
    const line = G.polyline(all);
    let acc = 0;
    pieces.forEach((p) => {
      const l = G.polyline(p.pts).total;
      p.u0 = acc / line.total;
      acc += l;
      p.u1 = acc / line.total;
    });
    line.pieces = pieces;
    line.piece = (id) => pieces.find((p) => p.id === id);
    return line;
  })();
  COMP.reservoir.u = 0;
  COMP.pump.u = PATH.piece("pump").u0;
  COMP.injector.u = PATH.piece("injector").u0;
  COMP.column.u = PATH.piece("column").u0;
  COMP.detector.u = PATH.piece("t4").u1;

  /* Exploded offsets: one choreographed sequence, each part on its own delay. */
  function explodeOffsets(e) {
    const k = (d) => ease(clamp((e - d) / 0.55, 0, 1));
    return {
      reservoir: mul(v(-0.7, 1.7, -0.5), k(0)),
      pump: mul(v(-0.3, -0.35, 1.5), k(0.1)),
      injector: mul(v(0.1, 1.15, 0.6), k(0.2)),
      column: mul(v(0, 1.75, -0.6), k(0.28)),
      detector: mul(v(1.6, -0.2, 0.7), k(0.36)),
      _k: k,
    };
  }

  function slicePts(pts, f) {
    if (f >= 1) return pts;
    if (f <= 0) return [];
    const pl = G.polyline(pts);
    const out = [];
    for (let i = 0; i < pts.length; i += 1) {
      if (pl.uAtIndex(i) <= f) out.push(pts[i]);
      else break;
    }
    out.push(pl.at(f));
    return out;
  }

  /* st: { reveal, explode, time, rotor, loop, plug, detGlow, alpha, only, dots:[{u,color,size}], spin } */
  function drawInstrument(R, st) {
    const a = st.alpha == null ? 1 : st.alpha;
    const time = st.time || 0;
    const reveal = st.reveal == null ? 1 : st.reveal;
    const ex = explodeOffsets(st.explode || 0);
    const appear = (id) => {
      if (reveal >= 1) return 1;
      return ease(clamp((reveal - COMP[id].u + 0.035) / 0.07, 0, 1));
    };
    const vis = (id) => (st.only ? (st.only.includes(id) ? 1 : st.dim || 0) : 1);
    const off = (id) => add(ex[id], v(0, -(1 - appear(id)) * 0.7, 0));

    const fluid = { color: [120, 210, 255], alpha: 0.5 };
    TUBES.forEach((t) => {
      const ta = a * Math.min(vis(t.from), vis(t.to));
      if (ta <= 0.01) return;
      let f = 1;
      if (reveal < 1) {
        const pc = PATH.piece(t.side ? "t1" : t.id);
        f = clamp((reveal - pc.u0) / (pc.u1 - pc.u0), 0, 1);
      }
      if (f <= 0) return;
      const pts = slicePts(t.pts, f);
      const e = st.explode || 0;
      if (e > 0.001) {
        const gap = 0.12 * ease(clamp(e / 0.4, 0, 1));
        const n = pts.length;
        const cut0 = Math.floor(n * (0.5 - gap));
        const cut1 = Math.ceil(n * (0.5 + gap));
        const h1 = pts.slice(0, Math.max(2, cut0)).map((p) => add(p, ex[t.from]));
        const h2 = pts.slice(Math.min(n - 2, cut1)).map((p) => add(p, ex[t.to]));
        G.drawTube(R, h1, 0.04, { alpha: ta, fluid });
        G.drawTube(R, h2, 0.04, { alpha: ta, fluid });
        [h1[h1.length - 1], h2[0]].forEach((p) => G.drawSphere(R, p, 0.03, CYAN, { alpha: ta * 0.9, glow: 1.2 }));
      } else {
        G.drawTube(R, pts, 0.04, { alpha: ta, fluid });
      }
      if (f < 1 && f > 0) {
        const tip = pts[pts.length - 1];
        G.drawSphere(R, tip, 0.05, [200, 240, 255], { alpha: ta, glow: 3 });
      }
    });

    if (appear("reservoir") > 0 && vis("reservoir") > 0.01) drawReservoir(R, off("reservoir"), a * appear("reservoir") * vis("reservoir"), time);
    if (appear("pump") > 0 && vis("pump") > 0.01) drawPump(R, off("pump"), a * appear("pump") * vis("pump"), time, st);
    if (appear("injector") > 0 && vis("injector") > 0.01) drawInjector(R, off("injector"), a * appear("injector") * vis("injector"), time, st);
    if (appear("column") > 0 && vis("column") > 0.01) drawColumn(R, off("column"), a * appear("column") * vis("column"), time, st);
    if (appear("detector") > 0 && vis("detector") > 0.01) drawDetector(R, off("detector"), a * appear("detector") * vis("detector"), time, st);

    (st.dots || []).forEach((d) => {
      const p = PATH.at(d.u);
      G.drawSphere(R, p, d.size || 0.06, d.color, { alpha: a * (d.alpha == null ? 1 : d.alpha), glow: 3 });
    });
  }

  function drawReservoir(R, o, a, time) {
    G.drawBox(R, null, add(v(0, 0.5, 0), o), v(0.44, 0.05, 0.84), { color: PEARL, alpha: a, radius: 8 });
    [[-0.38, CYAN, "A"], [0.38, MINT, "B"]].forEach(([z, col, tag]) => {
      const base = add(v(0, 0.56, z), o);
      const lvl = 0.7 + Math.sin(time * 1.6 + z * 4) * 0.012;
      G.drawCylinder(R, add(base, v(0, 0.03, 0)), add(base, v(0, lvl, 0)), 0.27, {
        color: shade(col, 0.7), alpha: a * 0.6, segments: 24, emissive: [col, 0.35],
      });
      G.drawCylinder(R, base, add(base, v(0, 1.0, 0)), 0.3, { glass: true, alpha: a, segments: 28 });
      G.drawCylinder(R, add(base, v(0, 1.0, 0)), add(base, v(0, 1.16, 0)), 0.12, { glass: true, alpha: a, segments: 18 });
      G.drawCylinder(R, add(base, v(0, 1.16, 0)), add(base, v(0, 1.28, 0)), 0.14, { color: [44, 58, 100], alpha: a, segments: 20 });
      G.decal(R, add(base, v(0, 0.45, 0.31)), tag, { size: 0.2, weight: 800, color: [255, 255, 255], alpha: a * 0.75, lift: 0.4 });
    });
  }

  function drawPump(R, o, a, time, st) {
    const c = add(COMP.pump.c, o);
    const split = (st.headSplit || 0) * 0.55;
    G.drawBox(R, null, c, v(0.62, 0.42, 0.45), { color: PEARL, alpha: a, radius: 14 });
    G.drawBox(R, null, add(c, v(0.2, 0.24, 0.452)), v(0.3, 0.07, 0.004), { color: [16, 24, 46], alpha: a, radius: 4, lift: 0.3 });
    G.decal(R, add(c, v(0.2, 0.24, 0.46)), "1,000 bar · 0.6 mL/min", { size: 0.042, mono: true, weight: 500, color: [120, 220, 255], alpha: a, lift: 0.5 });
    G.decal(R, add(c, v(-0.36, 0.25, 0.46)), "BINARY PUMP", { size: 0.05, mono: true, weight: 600, color: [96, 112, 150], alpha: a, lift: 0.5 });
    G.drawSphere(R, add(c, v(-0.5, -0.3, 0.46)), 0.022, MINT, { alpha: a, glow: 1.5 });
    [-0.26, 0.26].forEach((hx, i) => {
      const h0 = add(c, v(hx, -0.1, 0.45 + split));
      G.drawCylinder(R, h0, add(h0, v(0, 0, 0.36)), 0.16, { color: STEEL, alpha: a, segments: 24, capColor: [210, 218, 232] });
      const s = 0.5 + 0.5 * Math.sin(time * 4.2 + i * Math.PI);
      const zr = 0.04 + s * 0.24;
      G.drawCylinder(R, add(h0, v(0, 0, zr)), add(h0, v(0, 0, zr + 0.045)), 0.166, {
        color: CYAN, alpha: a, segments: 24, emissive: [CYAN, 0.9], caps: false,
      });
      G.drawCylinder(R, add(h0, v(0, 0.16, 0.2)), add(h0, v(0, 0.28, 0.2)), 0.045, { color: [150, 160, 186], alpha: a, segments: 12 });
    });
  }

  function drawInjector(R, o, a, time, st) {
    const c = add(v(5.2, 0.65, 0), o);
    G.drawBox(R, null, c, v(0.5, 0.5, 0.4), { color: PEARL, alpha: a, radius: 14 });
    G.decal(R, add(c, v(-0.28, 0.38, 0.41)), "INJECTOR", { size: 0.05, mono: true, weight: 600, color: [96, 112, 150], alpha: a, lift: 0.5 });
    const out = (st.rotorOut || 0) * 0.6;
    const rp = add(c, v(0, 0, 0.4 + out));
    G.drawCylinder(R, rp, add(rp, v(0, 0, 0.12)), 0.32, { color: STEEL, alpha: a, segments: 32, capColor: [206, 214, 230] });
    const face = add(rp, v(0, 0, 0.125));
    const rot = (st.rotor || 0) * (TAU / 6) + (st.spin || 0);
    const ports = [];
    for (let i = 0; i < 6; i += 1) {
      const ang = (i / 6) * TAU + Math.PI / 6;
      ports.push(add(face, v(Math.cos(ang) * 0.21, Math.sin(ang) * 0.21, 0)));
      G.drawDisc(R, ports[i], v(0, 0, 1), 0.036, [18, 26, 48], { alpha: a });
    }
    for (let i = 0; i < 3; i += 1) {
      const ang0 = rot + (i * 2 / 6) * TAU + Math.PI / 6;
      const ang1 = ang0 + TAU / 6;
      const arc = [];
      for (let s = 0; s <= 6; s += 1) {
        const an = lerp(ang0, ang1, s / 6);
        arc.push(add(face, v(Math.cos(an) * 0.21, Math.sin(an) * 0.21, 0.004)));
      }
      G.drawTube(R, arc, 0.018, { glass: false, color: i === 0 ? VIOLET : [70, 96, 150], alpha: a });
    }
    const loopC = add(c, v(0.66, 0.05, 0.25));
    const coil = [];
    for (let s = 0; s <= 48; s += 1) {
      const an = (s / 48) * TAU * 3;
      coil.push(add(loopC, v(Math.cos(an) * 0.13, -0.24 + (s / 48) * 0.48, Math.sin(an) * 0.13)));
    }
    G.drawTube(R, coil, 0.022, { alpha: a, fluid: { color: VIOLET, alpha: 0.25 + (st.loop || 0) * 0.6 } });
    const vial = add(c, v(0.25, 0.5, 0.12));
    G.drawCylinder(R, vial, add(vial, v(0, 0.26, 0)), 0.09, { glass: true, alpha: a, segments: 20 });
    G.drawCylinder(R, add(vial, v(0, 0.01, 0)), add(vial, v(0, 0.15, 0)), 0.078, { color: shade(VIOLET, 0.7), alpha: a * 0.7, segments: 18, emissive: [VIOLET, 0.6] });
    G.drawCylinder(R, add(vial, v(0, 0.26, 0)), add(vial, v(0, 0.31, 0)), 0.095, { color: [44, 58, 100], alpha: a, segments: 18 });
    const nd = 0.5 + 0.5 * Math.sin(time * 1.1);
    G.drawCylinder(R, add(vial, v(0, 0.3 - nd * 0.12, 0)), add(vial, v(0, 0.62, 0)), 0.011, { color: [220, 228, 240], alpha: a, segments: 8 });
  }

  function drawColumn(R, o, a, time, st) {
    const a0 = add(v(6.36, 0.65, 0.15), o);
    const b0 = add(v(8.86, 0.65, 0.15), o);
    const X = (dx, p) => add(p, v(dx, 0, 0));
    G.drawCylinder(R, a0, X(0.16, a0), 0.19, { color: [150, 162, 188], alpha: a, segments: 24 });
    G.drawCylinder(R, X(-0.16, b0), b0, 0.19, { color: [150, 162, 188], alpha: a, segments: 24 });
    G.drawCylinder(R, X(0.16, a0), X(-0.16, b0), 0.13, { color: STEEL, alpha: a, segments: 30, emissive: [CYAN, 0.08 + (st.colGlow || 0) * 0.3] });
    G.drawCylinder(R, X(0.34, a0), X(-0.34, b0), 0.235, { glass: true, alpha: a, segments: 30 });
    const mid = mix3(a0, b0, 0.5);
    G.decal(R, add(mid, v(0, 0.02, 0.14)), "C18 · 1.7 µm · 2.1 × 50 mm", { size: 0.05, mono: true, weight: 600, color: [40, 54, 90], alpha: a, lift: 0.4 });
    const fl = (time * 0.25) % 1;
    const ring = mix3(X(0.2, a0), X(-0.2, b0), fl);
    G.drawCylinder(R, ring, X(0.03, ring), 0.133, { color: CYAN, alpha: a * 0.7, segments: 30, emissive: [CYAN, 0.9], caps: false });
  }

  function drawDetector(R, o, a, time, st) {
    const c = add(COMP.detector.c, o);
    G.drawBox(R, null, c, v(0.58, 0.46, 0.42), { color: PEARL, alpha: a, radius: 14 });
    G.drawBox(R, null, add(c, v(-0.14, 0, 0.424)), v(0.22, 0.15, 0.004), { color: [8, 14, 34], alpha: a, radius: 6, lift: 0.3 });
    const g = st.detGlow == null ? 0.5 : st.detGlow;
    G.drawSphere(R, add(c, v(-0.14, 0, 0.44)), 0.05, CYAN, { alpha: a, glow: 0.8 + g * 3 });
    G.drawCylinder(R, add(c, v(0.26, 0.46, 0)), add(c, v(0.26, 0.64, 0)), 0.13, { color: STEEL, alpha: a, segments: 22, emissive: [[255, 210, 150], 0.25] });
    G.decal(R, add(c, v(-0.3, 0.33, 0.43)), "PDA DETECTOR", { size: 0.05, mono: true, weight: 600, color: [96, 112, 150], alpha: a, lift: 0.5 });
    G.decal(R, add(c, v(0.3, -0.3, 0.43)), "λ 254 nm", { size: 0.045, mono: true, weight: 500, color: [96, 180, 230], alpha: a, lift: 0.5 });
  }

  function compCenter(id, explode) {
    const ex = explodeOffsets(explode || 0);
    return add(COMP[id].c, ex[id]);
  }

  /* ---------- quadrupole tunnel (MS) ---------- */

  const QUAD = { len: 30, rod: 0.62, r: 0.3 };
  function drawQuad(R, camZ, time, alpha) {
    const z0 = Math.max(-1, camZ + 0.25);
    [[1, 1], [-1, -1], [1, -1], [-1, 1]].forEach(([sx, sy], i) => {
      const pol = i < 2 ? 1 : -1;
      const pulse = 0.5 + 0.5 * Math.sin(time * 7 * pol);
      const glowC = pol > 0 ? MAGENTA : [150, 140, 255];
      const pts = [];
      for (let z = z0; z < QUAD.len; z += 0.6) pts.push(v(sx * QUAD.rod, sy * QUAD.rod, z));
      pts.push(v(sx * QUAD.rod, sy * QUAD.rod, QUAD.len));
      if (pts.length < 2) return;
      G.drawTube(R, pts, QUAD.r, { glass: false, color: [128, 134, 168], alpha, fluid: { color: glowC, alpha: 0.12 + pulse * 0.3 } });
      G.drawDisc(R, pts[pts.length - 1], v(0, 0, -1), QUAD.r, [150, 156, 190], { alpha });
    });
  }

  global.WatersRideWorld = {
    MOLS, molById, MAGENTA, WHITE, INK, mixC,
    drawMolecule, drawBead, makeBeadSprites, drawLandscape, landProject, drawSideLayer, SIDE, drawTunnel,
    COMP, COMP_IDS, TUBES, PATH, explodeOffsets, drawInstrument, compCenter,
    QUAD, drawQuad,
  };
})(window);
