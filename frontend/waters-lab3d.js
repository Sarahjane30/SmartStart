/* Waters instrument — explorable 3D simulation (LC and MS).
   Real perspective camera, depth-sorted geometry, glass/steel/pearl materials.
   The user enters the housing, isolates components, travels inside the column
   and follows molecules to the detector while the trace draws itself. */
(function (global) {
  const TAU = Math.PI * 2;
  const DEG = Math.PI / 180;

  /* ---------- small vector / math ---------- */
  const v = (x, y, z) => ({ x, y, z });
  const add = (a, b) => v(a.x + b.x, a.y + b.y, a.z + b.z);
  const sub = (a, b) => v(a.x - b.x, a.y - b.y, a.z - b.z);
  const mul = (a, k) => v(a.x * k, a.y * k, a.z * k);
  const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
  const cross = (a, b) =>
    v(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
  const len = (a) => Math.sqrt(dot(a, a));
  const norm = (a) => {
    const l = len(a) || 1;
    return v(a.x / l, a.y / l, a.z / l);
  };
  const mix3 = (a, b, k) => v(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, a.z + (b.z - a.z) * k);
  const lerp = (a, b, k) => a + (b - a) * k;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : 1 - Math.pow(1 - x, 3));
  const smooth = (x) => x * x * (3 - 2 * clamp(x, 0, 1));
  const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${clamp(a, 0, 1)})`;
  const shade = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
  const esc = (s) =>
    String(s ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

  const LIGHT = norm(v(-0.45, 0.82, 0.55));
  const FLOOR = -0.52;
  const PEARL = [238, 241, 248];
  const STEEL = [176, 186, 204];
  const DARK = [26, 34, 56];
  const CYAN = [96, 214, 255];
  const VIOLET = [170, 128, 255];
  const MINT = [112, 238, 208];

  // seconds of simulated run time that fill the chromatogram's x axis
  const RUN_WINDOW = 48;
  // simulated seconds per displayed minute of retention time
  const RT_PER_MIN = 9;

  const COMPOUNDS = [
    { id: "a", name: "Compound A", short: "A", color: [96, 214, 255], affinity: 0.1, mz: 180 },
    { id: "b", name: "Compound B", short: "B", color: [112, 238, 208], affinity: 0.45, mz: 310 },
    { id: "c", name: "Compound C", short: "C", color: [170, 128, 255], affinity: 0.78, mz: 445 },
  ];

  /* ---------- scene: LC instrument layout (instrument space, metres-ish) ---------- */
  const LC = {
    housing: { c: v(0, 0.62, 0), hs: v(1.75, 0.92, 0.72) },
    bottles: [v(-1.18, 1.78, -0.1), v(-0.78, 1.78, -0.1)],
    pump: { c: v(-1.0, 0.48, 0.02), hs: v(0.3, 0.26, 0.26) },
    injector: { c: v(-0.24, 0.72, 0.16) },
    column: { bottom: v(0.52, 0.1, 0), top: v(0.52, 1.12, 0), r: 0.105 },
    detector: { c: v(1.26, 0.5, 0.02), hs: v(0.32, 0.3, 0.26) },
  };

  const MS = {
    housing: { c: v(0, 0.62, 0), hs: v(1.8, 0.86, 0.7) },
    source: { c: v(-1.12, 0.62, 0.04) },
    cone: { c: v(-0.62, 0.62, 0) },
    quad: { a: v(-0.2, 0.62, 0), b: v(0.85, 0.62, 0), r: 0.075 },
    detector: { c: v(1.3, 0.62, 0), hs: v(0.22, 0.3, 0.26) },
  };

  const LC_PARTS = [
    { id: "reservoir", no: "01", label: "Reservoir", at: v(-0.98, 1.78, -0.1), r: 0.34,
      what: "Mobile phase — the liquid that carries the sample.", stage: { yaw: 0.5, pitch: 0.08, dist: 2.5 } },
    { id: "pump", no: "02", label: "Pump", at: LC.pump.c, r: 0.4,
      what: "Pushes the mobile phase at a precise, steady flow.", stage: { yaw: 0.62, pitch: 0.1, dist: 2.3 } },
    { id: "injector", no: "03", label: "Injector", at: LC.injector.c, r: 0.34,
      what: "Introduces your sample into the flowing stream.", stage: { yaw: 0.38, pitch: 0.08, dist: 1.95 } },
    { id: "column", no: "04", label: "Column", at: v(0.52, 0.62, 0), r: 0.5,
      what: "Packed with tiny particles — this is where compounds separate.", stage: { yaw: 0.32, pitch: 0.04, dist: 2.75 } },
    { id: "detector", no: "05", label: "Detector", at: LC.detector.c, r: 0.4,
      what: "Measures what leaves the column and turns it into signal.", stage: { yaw: 0.36, pitch: 0.1, dist: 2.35 } },
  ];

  const MS_PARTS = [
    { id: "source", no: "01", label: "Ion source", at: MS.source.c, r: 0.4,
      what: "The liquid is sprayed and molecules pick up charge — they become ions.", stage: { yaw: 0.46, pitch: 0.08, dist: 2.2 } },
    { id: "cone", no: "02", label: "Sampling cone", at: MS.cone.c, r: 0.3,
      what: "Ions are pulled into vacuum; solvent is stripped away.", stage: { yaw: 0.42, pitch: 0.08, dist: 1.85 } },
    { id: "quad", no: "03", label: "Mass analyzer", at: v(0.32, 0.62, 0), r: 0.55,
      what: "Four rods filter ions by mass-to-charge ratio.", stage: { yaw: 0.28, pitch: 0.16, dist: 2.9 } },
    { id: "detector", no: "04", label: "Detector", at: MS.detector.c, r: 0.34,
      what: "Counts the ions that make it through — that becomes the spectrum.", stage: { yaw: 0.42, pitch: 0.08, dist: 1.95 } },
  ];

  /* ---------- fluid path through the LC ---------- */
  function lcPath() {
    const { bottles, pump, injector, column, detector } = LC;
    return [
      add(bottles[0], v(0, -0.18, 0)),
      v(-1.18, 1.3, -0.1),
      v(-1.05, 0.95, 0.0),
      add(pump.c, v(-0.05, 0.22, 0.1)),
      add(pump.c, v(0.2, 0.0, 0.14)),
      v(-0.6, 0.52, 0.16),
      add(injector.c, v(-0.2, -0.04, 0.02)),
      add(injector.c, v(0.18, 0.02, 0.0)),
      v(0.18, 1.26, 0.02),
      add(column.top, v(0, 0.08, 0)),
      column.top,
      column.bottom,
      v(0.52, -0.02, 0.0),
      v(0.95, 0.02, 0.04),
      add(detector.c, v(-0.2, -0.16, 0.1)),
      add(detector.c, v(0, 0, 0.08)),
      add(detector.c, v(0.24, -0.1, 0.06)),
      v(1.72, -0.05, 0.02),
    ];
  }

  function msPath() {
    return [
      v(-1.6, 0.62, 0.04),
      add(MS.source.c, v(-0.12, 0, 0.02)),
      MS.source.c,
      MS.cone.c,
      MS.quad.a,
      MS.quad.b,
      MS.detector.c,
    ];
  }

  function smoothPath(pts, per = 7) {
    if (pts.length < 3) return pts.slice();
    const out = [];
    const P = (i) => pts[clamp(i, 0, pts.length - 1)];
    for (let i = 0; i < pts.length - 1; i += 1) {
      const p0 = P(i - 1);
      const p1 = P(i);
      const p2 = P(i + 1);
      const p3 = P(i + 2);
      for (let s = 0; s < per; s += 1) {
        const t = s / per;
        const t2 = t * t;
        const t3 = t2 * t;
        out.push(
          v(
            0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
            0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
            0.5 * (2 * p1.z + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3)
          )
        );
      }
    }
    out.push(pts[pts.length - 1]);
    return out;
  }

  function polyline(points) {
    const segs = [];
    let total = 0;
    for (let i = 0; i < points.length - 1; i += 1) {
      const l = len(sub(points[i + 1], points[i]));
      segs.push({ a: points[i], b: points[i + 1], l, s0: total });
      total += l;
    }
    segs.forEach((s) => {
      s.u0 = s.s0 / total;
      s.u1 = (s.s0 + s.l) / total;
    });
    return {
      points,
      segs,
      total,
      at(u) {
        const t = clamp(u, 0, 1) * total;
        for (const s of segs) {
          if (t <= s.s0 + s.l || s === segs[segs.length - 1]) {
            const k = s.l ? (t - s.s0) / s.l : 0;
            return mix3(s.a, s.b, clamp(k, 0, 1));
          }
        }
        return points[points.length - 1];
      },
      uAtIndex(i) {
        if (i <= 0) return 0;
        if (i >= segs.length) return 1;
        return segs[i].u0;
      },
    };
  }

  /* ---------- renderer ---------- */
  function makeRenderer() {
    return {
      q: [],
      w: 1,
      h: 1,
      cam: { pos: v(3, 2, 4), target: v(0, 0.6, 0), fov: 46 * DEG },
      basis: null,
      prep() {
        const c = this.cam;
        const f = norm(sub(c.target, c.pos));
        let up = v(0, 1, 0);
        if (Math.abs(dot(f, up)) > 0.995) up = v(0, 0, 1);
        const r = norm(cross(f, up));
        const u = cross(r, f);
        this.basis = { f, r, u };
        this.focal = this.h * 0.5 / Math.tan(c.fov / 2);
        this.q.length = 0;
      },
      project(p) {
        const d = sub(p, this.cam.pos);
        const { f, r, u } = this.basis;
        const z = dot(d, f);
        const s = this.focal / Math.max(0.06, z);
        return { x: this.w / 2 + dot(d, r) * s, y: this.h / 2 - dot(d, u) * s, z, s, vis: z > 0.06 };
      },
      push(z, draw) {
        this.q.push({ z, draw });
      },
      flush(ctx) {
        this.q.sort((a, b) => b.z - a.z);
        for (const item of this.q) item.draw(ctx);
        this.q.length = 0;
      },
      camDir() {
        return this.basis.f;
      },
    };
  }

  /* ---------- material drawing primitives ---------- */
  function facePath(ctx, pts, radius) {
    ctx.beginPath();
    if (!radius) {
      pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.closePath();
      return;
    }
    const n = pts.length;
    for (let i = 0; i < n; i += 1) {
      const p0 = pts[i];
      const p1 = pts[(i + 1) % n];
      const p2 = pts[(i + 2) % n];
      const d1 = Math.hypot(p1.x - p0.x, p1.y - p0.y) || 1;
      const d2 = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1;
      const r = Math.min(radius, d1 * 0.4, d2 * 0.4);
      const s = { x: p1.x + ((p0.x - p1.x) / d1) * r, y: p1.y + ((p0.y - p1.y) / d1) * r };
      const e = { x: p1.x + ((p2.x - p1.x) / d2) * r, y: p1.y + ((p2.y - p1.y) / d2) * r };
      if (i === 0) ctx.moveTo(s.x, s.y);
      else ctx.lineTo(s.x, s.y);
      ctx.quadraticCurveTo(p1.x, p1.y, e.x, e.y);
    }
    ctx.closePath();
  }

  function boxFaces(c, hs) {
    const S = [
      { n: v(1, 0, 0), ax: [v(0, 1, 0), v(0, 0, 1)] },
      { n: v(-1, 0, 0), ax: [v(0, 1, 0), v(0, 0, -1)] },
      { n: v(0, 1, 0), ax: [v(1, 0, 0), v(0, 0, 1)] },
      { n: v(0, -1, 0), ax: [v(1, 0, 0), v(0, 0, -1)] },
      { n: v(0, 0, 1), ax: [v(1, 0, 0), v(0, 1, 0)] },
      { n: v(0, 0, -1), ax: [v(-1, 0, 0), v(0, 1, 0)] },
    ];
    return S.map((f) => {
      const center = add(c, v(f.n.x * hs.x, f.n.y * hs.y, f.n.z * hs.z));
      const a = v(f.ax[0].x * hs.x, f.ax[0].y * hs.y, f.ax[0].z * hs.z);
      const b = v(f.ax[1].x * hs.x, f.ax[1].y * hs.y, f.ax[1].z * hs.z);
      return {
        n: f.n,
        center,
        corners: [
          add(add(center, mul(a, -1)), mul(b, -1)),
          add(add(center, a), mul(b, -1)),
          add(add(center, a), b),
          add(add(center, mul(a, -1)), b),
        ],
      };
    });
  }

  function drawBox(R, ctx0, c, hs, opts = {}) {
    // `lift` biases the sort depth: surface details (windows, vents, badges) sit on a panel, and
    // sorting by face centroid alone would let the panel they belong to cover them.
    const { color = PEARL, alpha = 1, radius = 10, skip = null, glass = false, edge = 0.22, lift = 0 } = opts;
    boxFaces(c, hs).forEach((f) => {
      if (skip && skip(f)) return;
      const toCam = sub(R.cam.pos, f.center);
      const facing = dot(f.n, toCam);
      if (!glass && facing <= 0) return;
      const pts = f.corners.map((p) => R.project(p));
      if (pts.some((p) => !p.vis)) return;
      const lam = clamp(dot(f.n, LIGHT), 0, 1);
      const base = shade(color, 0.34 + lam * 0.52);
      const z = R.project(f.center).z - lift;
      R.push(z, (ctx) => {
        facePath(ctx, pts, radius);
        const g = ctx.createLinearGradient(pts[0].x, pts[0].y, pts[2].x, pts[2].y);
        g.addColorStop(0, rgba(shade(base, 1.06), alpha * (glass ? 0.14 : 0.98)));
        g.addColorStop(0.55, rgba(base, alpha * (glass ? 0.08 : 0.95)));
        g.addColorStop(1, rgba(shade(base, 0.76), alpha * (glass ? 0.16 : 0.97)));
        ctx.fillStyle = g;
        ctx.fill();
        ctx.strokeStyle = rgba(glass ? [210, 230, 255] : shade(color, 1.15), alpha * edge);
        ctx.lineWidth = 1;
        ctx.stroke();
      });
    });
  }

  function circlePts(center, axis, r, n, phase = 0) {
    const a = norm(axis);
    let t = v(0, 1, 0);
    if (Math.abs(dot(a, t)) > 0.95) t = v(1, 0, 0);
    const u = norm(cross(a, t));
    const w = cross(a, u);
    const out = [];
    for (let i = 0; i < n; i += 1) {
      const th = phase + (i / n) * TAU;
      out.push({
        p: add(center, add(mul(u, Math.cos(th) * r), mul(w, Math.sin(th) * r))),
        n: norm(add(mul(u, Math.cos(th)), mul(w, Math.sin(th)))),
      });
    }
    return out;
  }

  function drawCylinder(R, a, b, r, opts = {}) {
    const {
      color = STEEL, alpha = 1, segments = 26, glass = false, caps = true,
      capColor = null, emissive = null, rim = 0.5,
    } = opts;
    const axis = sub(b, a);
    const top = circlePts(b, axis, r, segments);
    const bot = circlePts(a, axis, r, segments);
    for (let i = 0; i < segments; i += 1) {
      const j = (i + 1) % segments;
      const quad = [bot[i].p, bot[j].p, top[j].p, top[i].p];
      const center = mul(quad.reduce((acc, p) => add(acc, p), v(0, 0, 0)), 0.25);
      const nrm = norm(add(bot[i].n, bot[j].n));
      const toCam = norm(sub(R.cam.pos, center));
      const facing = dot(nrm, toCam);
      if (!glass && facing <= 0.02) continue;
      const pts = quad.map((p) => R.project(p));
      if (pts.some((p) => !p.vis)) continue;
      const lam = clamp(dot(nrm, LIGHT), 0, 1);
      const spec = Math.pow(clamp(dot(norm(add(LIGHT, toCam)), nrm), 0, 1), 26);
      const z = R.project(center).z;
      const fres = Math.pow(1 - clamp(facing, 0, 1), 2);
      R.push(z, (ctx) => {
        facePath(ctx, pts, 0);
        if (glass) {
          ctx.fillStyle = rgba([205, 225, 250], alpha * (0.05 + fres * 0.22));
          ctx.fill();
          if (fres > 0.55) {
            ctx.strokeStyle = rgba([225, 240, 255], alpha * 0.4 * rim);
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        } else {
          const base = shade(color, 0.34 + lam * 0.72);
          ctx.fillStyle = rgba(base, alpha);
          ctx.fill();
          if (spec > 0.02) {
            ctx.fillStyle = rgba([255, 255, 255], alpha * spec * 0.85);
            ctx.fill();
          }
          if (fres > 0.72) {
            ctx.strokeStyle = rgba(shade(color, 1.25), alpha * 0.4);
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        }
        if (emissive) {
          ctx.fillStyle = rgba(emissive[0], alpha * emissive[1] * (0.4 + lam * 0.6));
          ctx.fill();
        }
      });
    }
    if (caps) {
      [{ c: b, ax: axis, s: 1 }, { c: a, ax: mul(axis, -1), s: -1 }].forEach(({ c, ax }) => {
        const nrm = norm(ax);
        const toCam = sub(R.cam.pos, c);
        if (dot(nrm, toCam) <= 0) return;
        const ring = circlePts(c, ax, r, segments).map((p) => R.project(p.p));
        if (ring.some((p) => !p.vis)) return;
        const lam = clamp(dot(nrm, LIGHT), 0, 1);
        const col = capColor || shade(color, 0.9);
        const z = R.project(c).z - 0.002;
        R.push(z, (ctx) => {
          facePath(ctx, ring, 0);
          const g = ctx.createLinearGradient(ring[0].x, ring[0].y, ring[(segments / 2) | 0].x, ring[(segments / 2) | 0].y);
          g.addColorStop(0, rgba(shade(col, 0.6 + lam * 0.6), alpha * (glass ? 0.22 : 1)));
          g.addColorStop(1, rgba(shade(col, 0.42 + lam * 0.4), alpha * (glass ? 0.14 : 1)));
          ctx.fillStyle = g;
          ctx.fill();
          ctx.strokeStyle = rgba([255, 255, 255], alpha * 0.25);
          ctx.lineWidth = 1;
          ctx.stroke();
        });
      });
    }
  }

  function drawSphere(R, c, r, color, opts = {}) {
    const { alpha = 1, glow = 0, glass = false } = opts;
    const p = R.project(c);
    if (!p.vis) return;
    const rr = r * p.s;
    if (rr < 0.4) return;
    R.push(p.z, (ctx) => {
      if (glow > 0) {
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rr * 3.4);
        g.addColorStop(0, rgba(color, alpha * glow * 0.6));
        g.addColorStop(1, rgba(color, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, rr * 3.4, 0, TAU);
        ctx.fill();
      }
      const lx = p.x - rr * 0.42;
      const ly = p.y - rr * 0.46;
      const g = ctx.createRadialGradient(lx, ly, rr * 0.08, p.x, p.y, rr);
      if (glass) {
        g.addColorStop(0, rgba([255, 255, 255], alpha * 0.5));
        g.addColorStop(0.5, rgba(color, alpha * 0.18));
        g.addColorStop(1, rgba(color, alpha * 0.32));
      } else {
        g.addColorStop(0, rgba([255, 255, 255], alpha * 0.92));
        g.addColorStop(0.35, rgba(shade(color, 1.05), alpha));
        g.addColorStop(1, rgba(shade(color, 0.42), alpha));
      }
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, rr, 0, TAU);
      ctx.fill();
      if (!glass && rr > 2.4) {
        ctx.fillStyle = rgba([255, 255, 255], alpha * 0.8);
        ctx.beginPath();
        ctx.arc(lx, ly, rr * 0.22, 0, TAU);
        ctx.fill();
      }
    });
  }

  function drawTube(R, pts, r, opts = {}) {
    const { color = STEEL, alpha = 1, glass = true, fluid = null } = opts;
    for (let i = 0; i < pts.length - 1; i += 1) {
      const a = pts[i];
      const b = pts[i + 1];
      const pa = R.project(a);
      const pb = R.project(b);
      if (!pa.vis || !pb.vis) continue;
      const center = mix3(a, b, 0.5);
      const z = R.project(center).z;
      const dx = pb.x - pa.x;
      const dy = pb.y - pa.y;
      const l = Math.hypot(dx, dy) || 1;
      const nx = -dy / l;
      const ny = dx / l;
      const wa = Math.max(1.1, r * pa.s);
      const wb = Math.max(1.1, r * pb.s);
      R.push(z, (ctx) => {
        const quad = [
          { x: pa.x + nx * wa, y: pa.y + ny * wa },
          { x: pb.x + nx * wb, y: pb.y + ny * wb },
          { x: pb.x - nx * wb, y: pb.y - ny * wb },
          { x: pa.x - nx * wa, y: pa.y - ny * wa },
        ];
        const g = ctx.createLinearGradient(quad[0].x, quad[0].y, quad[3].x, quad[3].y);
        if (glass) {
          g.addColorStop(0, rgba([225, 238, 255], alpha * 0.34));
          g.addColorStop(0.35, rgba([160, 190, 225], alpha * 0.1));
          g.addColorStop(0.68, rgba([120, 150, 190], alpha * 0.16));
          g.addColorStop(1, rgba([210, 230, 255], alpha * 0.3));
        } else {
          g.addColorStop(0, rgba(shade(color, 1.18), alpha));
          g.addColorStop(0.3, rgba(shade(color, 0.92), alpha));
          g.addColorStop(0.75, rgba(shade(color, 0.5), alpha));
          g.addColorStop(1, rgba(shade(color, 0.72), alpha));
        }
        facePath(ctx, quad, 0);
        ctx.fillStyle = g;
        ctx.fill();
        if (glass) {
          ctx.strokeStyle = rgba([235, 245, 255], alpha * 0.28);
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.strokeStyle = rgba([255, 255, 255], alpha * 0.5);
          ctx.lineWidth = Math.max(0.6, wa * 0.3);
          ctx.beginPath();
          ctx.moveTo(pa.x + nx * wa * 0.45, pa.y + ny * wa * 0.45);
          ctx.lineTo(pb.x + nx * wb * 0.45, pb.y + ny * wb * 0.45);
          ctx.stroke();
        }
      });
      if (fluid) {
        R.push(z - 0.001, (ctx) => {
          ctx.globalCompositeOperation = "lighter";
          ctx.strokeStyle = rgba(fluid.color, alpha * fluid.alpha);
          ctx.lineWidth = Math.max(0.8, Math.min(wa, wb) * 1.1);
          ctx.beginPath();
          ctx.moveTo(pa.x, pa.y);
          ctx.lineTo(pb.x, pb.y);
          ctx.stroke();
          ctx.globalCompositeOperation = "source-over";
        });
      }
    }
  }

  function drawDisc(R, c, axis, r, color, opts = {}) {
    const { alpha = 1, segments = 30, ring = false } = opts;
    const pts = circlePts(c, axis, r, segments).map((p) => R.project(p.p));
    if (pts.some((p) => !p.vis)) return;
    const p = R.project(c);
    const lam = clamp(Math.abs(dot(norm(axis), LIGHT)), 0.2, 1);
    R.push(p.z, (ctx) => {
      facePath(ctx, pts, 0);
      if (ring) {
        ctx.strokeStyle = rgba(color, alpha);
        ctx.lineWidth = 1.2;
        ctx.stroke();
        return;
      }
      const g = ctx.createRadialGradient(p.x - r * p.s * 0.3, p.y - r * p.s * 0.3, 0, p.x, p.y, r * p.s);
      g.addColorStop(0, rgba(shade(color, 0.7 + lam * 0.6), alpha));
      g.addColorStop(1, rgba(shade(color, 0.42 + lam * 0.3), alpha));
      ctx.fillStyle = g;
      ctx.fill();
    });
  }

  /* Etched text on a surface — projected into the scene so it rides the perspective. */
  function decal(R, at, text, opts = {}) {
    const p = R.project(at);
    if (!p.vis) return;
    const size = (opts.size || 0.09) * p.s;
    if (size < 4.5) return;
    R.push(p.z - (opts.lift == null ? 0.5 : opts.lift), (ctx) => {
      ctx.save();
      ctx.font = `${opts.weight || 700} ${size}px ${opts.mono ? '"IBM Plex Mono", monospace' : "Inter, sans-serif"}`;
      ctx.textAlign = opts.align || "center";
      ctx.textBaseline = "middle";
      if (opts.track) {
        try {
          ctx.letterSpacing = `${size * opts.track}px`;
        } catch (e) {
          /* letterSpacing unsupported — fall through */
        }
      }
      ctx.fillStyle = rgba(opts.color || [118, 134, 168], opts.alpha == null ? 1 : opts.alpha);
      ctx.fillText(text, p.x, p.y);
      ctx.restore();
    });
  }

  /* Lab bench the instrument physically stands on, plus its mirrored smear. */
  function drawBench(R, alpha) {
    const corners = [
      v(-4.6, FLOOR, -3.2),
      v(4.6, FLOOR, -3.2),
      v(4.6, FLOOR, 3.6),
      v(-4.6, FLOOR, 3.6),
    ].map((p) => R.project(p));
    if (corners.some((p) => !p.vis)) return;
    R.push(900, (ctx) => {
      facePath(ctx, corners, 0);
      const g = ctx.createLinearGradient(corners[0].x, corners[0].y, corners[2].x, corners[2].y);
      g.addColorStop(0, rgba([16, 24, 48], alpha * 0.5));
      g.addColorStop(0.5, rgba([24, 34, 62], alpha * 0.82));
      g.addColorStop(1, rgba([12, 18, 38], alpha * 0.95));
      ctx.fillStyle = g;
      ctx.fill();
    });
    for (let i = -4; i <= 4; i += 1) {
      const a = R.project(v(i * 1.0, FLOOR, -3.2));
      const b = R.project(v(i * 1.0, FLOOR, 3.6));
      if (!a.vis || !b.vis) continue;
      R.push(899, (ctx) => {
        ctx.strokeStyle = rgba([96, 134, 190], alpha * 0.1);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      });
    }
  }

  /* Brushed deck plate inside the chassis that the fluidics are bolted to. */
  function drawDeck(R, c, hs, alpha) {
    drawBox(R, null, v(c.x, c.y - hs.y + 0.02, c.z), v(hs.x - 0.06, 0.022, hs.z - 0.06), {
      color: [176, 188, 210],
      alpha: alpha * 0.95,
      radius: 6,
      edge: 0.35,
    });
  }

  /* Machined standoff: a steel post on a base flange, how modules actually mount to a deck. */
  function drawPost(R, at, topY, deckY, r, alpha) {
    drawCylinder(R, v(at.x, deckY + 0.012, at.z), v(at.x, topY, at.z), r, {
      color: [158, 170, 194],
      alpha,
      segments: 16,
    });
    drawCylinder(R, v(at.x, deckY, at.z), v(at.x, deckY + 0.022, at.z), r * 1.9, {
      color: [128, 140, 168],
      alpha,
      segments: 18,
    });
  }

  /* Chassis skeleton left behind in cutaway, so you read "inside a machine" not "parts on a table". */
  function drawFrame(R, c, hs, alpha) {
    if (alpha <= 0.01) return;
    const xs = [c.x - hs.x, c.x + hs.x];
    const zs = [c.z - hs.z, c.z + hs.z];
    const ys = [c.y - hs.y, c.y + hs.y];
    xs.forEach((x) =>
      zs.forEach((z) =>
        drawCylinder(R, v(x, ys[0], z), v(x, ys[1], z), 0.034, {
          color: [206, 214, 232],
          alpha,
          segments: 10,
        })
      )
    );
    ys.forEach((y) =>
      zs.forEach((z) =>
        drawCylinder(R, v(xs[0], y, z), v(xs[1], y, z), 0.026, {
          color: [196, 206, 226],
          alpha: alpha * 0.8,
          segments: 8,
        })
      )
    );
  }

  /* Vertical mirror of a body, squashed into the bench so pearl picks up the surface. */
  function reflect(R, c, hs, color, alpha) {
    const top = R.project(v(c.x, FLOOR, c.z));
    const bottom = R.project(v(c.x, FLOOR - hs.y * 1.3, c.z));
    if (!top.vis || !bottom.vis) return;
    const w = hs.x * top.s;
    R.push(880, (ctx) => {
      const g = ctx.createLinearGradient(top.x, top.y, bottom.x, bottom.y);
      g.addColorStop(0, rgba(color, alpha * 0.2));
      g.addColorStop(1, rgba(color, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(top.x - w, top.y);
      ctx.lineTo(top.x + w, top.y);
      ctx.lineTo(bottom.x + w * 0.82, bottom.y);
      ctx.lineTo(bottom.x - w * 0.82, bottom.y);
      ctx.closePath();
      ctx.fill();
    });
  }

  function drawShadow(R, c, rx, rz, alpha) {
    const p = R.project(v(c.x, FLOOR + 0.004, c.z));
    if (!p.vis) return;
    R.push(p.z + 4, (ctx) => {
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rx * p.s);
      g.addColorStop(0, rgba([2, 6, 18], alpha));
      g.addColorStop(1, rgba([2, 6, 18], 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, rx * p.s, rz * p.s * 0.45, 0, 0, TAU);
      ctx.fill();
    });
  }

  /* ---------- instrument state ---------- */
  function create(kind, opts = {}) {
    const isMs = kind === "ms";
    const raw = isMs ? msPath() : lcPath();
    const path = polyline(raw);
    // Tubing is drawn from a smoothed copy so bends read as bent capillary, not mitred corners.
    // LC splits either side of index 10/11 because the column barrel between them is its own body.
    const tubeRuns = isMs
      ? [smoothPath(raw, 6)]
      : [smoothPath(raw.slice(0, 11), 6), smoothPath(raw.slice(11), 6)];
    // only real bends get a compression fitting; otherwise the capillary looks beaded
    const joints = [];
    if (!isMs) {
      const col = LC.column;
      for (let i = 1; i < raw.length - 1; i += 1) {
        const p = raw[i];
        if (len(sub(p, col.top)) < 0.2 || len(sub(p, col.bottom)) < 0.2) continue;
        const inDir = norm(sub(p, raw[i - 1]));
        const outDir = norm(sub(raw[i + 1], p));
        if (dot(inDir, outDir) > 0.86) continue;
        joints.push({ p, dir: norm(add(inDir, outDir)) });
      }
    }
    const lab = {
      kind: isMs ? "ms" : "lc",
      R: makeRenderer(),
      reduce: !!opts.reduce,
      t: 0,
      stage: "exterior",
      stageT: 0,
      focus: null,
      hoverPart: null,
      selectedCompound: null,
      traceId: null,
      paused: false,
      flow: 1.0,
      scanMz: 180,
      autoScan: true,
      enterAnim: 0,
      cut: 0,
      path,
      molecules: [],
      ions: [],
      bed: [],
      signal: new Array(140).fill(0),
      spectrum: {},
      runT: 0,
      running: false,
      arrivals: {},
      raw,
      tubeRuns,
      joints,
      orbit: { yaw: isMs ? 0.52 : 0.62, pitch: 0.17, dist: isMs ? 8.2 : 7.8, target: v(0, 0.72, 0) },
      camNow: { pos: v(5.6, 2.6, 6.4), target: v(0, 0.72, 0), fov: 46 * DEG },
      drag: null,
      hud: null,
      dirty: true,
      onExit: opts.onExit || null,
      onSwitch: opts.onSwitch || null,
    };
    const col = LC.column;
    for (let i = 0; i < 560; i += 1) {
      lab.bed.push({
        y: Math.random(),
        ang: Math.random() * TAU,
        rad: Math.sqrt(Math.random()) * col.r * 0.88,
        r: 0.0038 + Math.random() * 0.005,
      });
    }
    lab.interior = [];
    for (let i = 0; i < 760; i += 1) {
      lab.interior.push({
        y: -2.8 + Math.random() * (BORE_TOP + 3.4),
        ang: Math.random() * TAU,
        rad: Math.sqrt(Math.random()) * BORE * 0.94,
        r: 0.028 + Math.random() * 0.042,
        tone: Math.random(),
      });
    }
    lab.colIn = path.uAtIndex(isMs ? 4 : 10);
    lab.colOut = path.uAtIndex(isMs ? 5 : 11);
    lab.detU = isMs ? 0.94 : path.uAtIndex(15);
    return lab;
  }

  function stageCam(lab) {
    const o = lab.orbit;
    const parts = lab.kind === "ms" ? MS_PARTS : LC_PARTS;
    let target = o.target;
    let dist = o.dist;
    let fov = 46 * DEG;
    let yaw = o.yaw;
    let pitch = o.pitch;

    if (lab.stage === "column-inside") {
      // down at the outlet end, looking back up the bore so the sample travels toward you
      const sway = Math.sin(lab.t * 0.2);
      return {
        pos: v(0.26 + sway * 0.08, -4.3, 0.8 + sway * 0.05),
        target: v(0, 1.1, 0),
        fov: 56 * DEG,
      };
    }
    if (lab.stage === "trace" && lab.traceId) {
      const m = lab.molecules.find((x) => x.id === lab.traceId) || lab.molecules.find((x) => x.cid === lab.traceId);
      if (m) {
        const p = lab.path.at(m.u);
        const ahead = lab.path.at(Math.min(1, m.u + 0.02));
        const dir = norm(sub(ahead, p));
        const side = norm(cross(dir, v(0, 1, 0)));
        // far enough back that the molecule stays in context instead of filling the lens
        return {
          pos: add(add(add(p, mul(side, 0.9)), mul(dir, -0.4)), v(0, 0.52, 0.85)),
          target: add(p, mul(dir, 0.22)),
          fov: 48 * DEG,
        };
      }
    }
    if (lab.focus) {
      const part = parts.find((p) => p.id === lab.focus);
      if (part) {
        target = part.at;
        dist = part.stage.dist;
        yaw = part.stage.yaw;
        pitch = part.stage.pitch;
        fov = 44 * DEG;
      }
    } else if (lab.stage === "inside") {
      dist = lab.kind === "ms" ? 4.1 : 3.9;
      pitch = 0.12;
    }
    const pos = v(
      target.x + Math.sin(yaw) * Math.cos(pitch) * dist,
      target.y + Math.sin(pitch) * dist,
      target.z + Math.cos(yaw) * Math.cos(pitch) * dist
    );
    return { pos, target, fov };
  }

  function update(lab, dt) {
    const speed = lab.reduce ? 1.8 : 1;
    lab.t += dt * speed;
    lab.stageT += dt;
    lab.cut = lerp(lab.cut, lab.stage === "exterior" ? 0 : 1, Math.min(1, dt * 2.6));
    lab.enterAnim = clamp(lab.enterAnim + (lab.stage === "exterior" ? -dt * 2 : dt * 1.2), 0, 1);

    const goal = stageCam(lab);
    const k = Math.min(1, dt * (lab.stage === "trace" ? 6 : 2.6));
    lab.camNow.pos = mix3(lab.camNow.pos, goal.pos, k);
    lab.camNow.target = mix3(lab.camNow.target, goal.target, k);
    lab.camNow.fov = lerp(lab.camNow.fov, goal.fov, k);

    if (lab.running && !lab.paused) {
      lab.runT += dt * speed;
      const base = 0.03 * lab.flow;
      lab.molecules.forEach((m) => {
        if (m.u >= 1) return;
        let s = base;
        if (m.u > lab.colIn && m.u < lab.colOut) {
          s = base * (1 - m.affinity * 0.72);
          if (m.stick > 0) {
            m.stick -= dt;
            s = base * 0.04;
          } else if (Math.random() < m.affinity * dt * 7) {
            m.stick = 0.02 + Math.random() * 0.1 * m.affinity;
          }
          m.spread = lerp(m.spread, 1, dt * 0.6);
        }
        m.u = clamp(m.u + s * dt * 0.95, 0, 1);
        if (!m.counted && m.u >= lab.detU) {
          m.counted = true;
          const comp = COMPOUNDS.find((c) => c.id === m.cid);
          const bin = clamp(Math.round((lab.runT / RUN_WINDOW) * lab.signal.length), 0, lab.signal.length - 1);
          for (let i = -3; i <= 3; i += 1) {
            const j = bin + i;
            if (j >= 0 && j < lab.signal.length) lab.signal[j] += Math.exp(-(i * i) / 3.2);
          }
          if (comp && lab.arrivals[comp.id] == null) lab.arrivals[comp.id] = lab.runT;
          lab.dirty = true;
        }
      });
      if (lab.kind === "ms") updateIons(lab, dt * speed);
    }
  }

  function updateIons(lab, dt) {
    if (lab.autoScan) {
      lab.scanMz = 140 + ((lab.t * 55) % 380);
    }
    lab.ions.forEach((ion) => {
      if (ion.dead) return;
      ion.u = clamp(ion.u + dt * 0.21 * (0.8 + 0.4 * lab.flow), 0, 1);
      if (ion.u > 0.56 && !ion.judged) {
        ion.judged = true;
        ion.pass = Math.abs(ion.mz - lab.scanMz) < 36;
        if (!ion.pass) ion.kick = (Math.random() - 0.5) * 0.14 + (ion.mz > lab.scanMz ? 0.05 : -0.05);
      }
      if (ion.judged && !ion.pass) {
        ion.off = (ion.off || 0) + dt * 0.5;
        if (ion.off > 0.5) ion.dead = true;
      }
      if (ion.u >= 0.995 && !ion.counted) {
        ion.counted = true;
        if (ion.pass !== false) {
          lab.spectrum[ion.mz] = (lab.spectrum[ion.mz] || 0) + 1;
          lab.dirty = true;
        }
      }
    });
    if (lab.ions.filter((i) => !i.dead && i.u < 1).length < 14 && lab.running) {
      COMPOUNDS.forEach((c) => {
        if (Math.random() < 0.3) spawnIon(lab, c);
      });
    }
  }

  function spawnIon(lab, c) {
    lab.ions.push({
      cid: c.id,
      mz: c.mz,
      color: c.color,
      u: 0.02,
      phase: Math.random() * TAU,
      wob: 0.3 + Math.random() * 0.7,
      judged: false,
      pass: null,
      counted: false,
    });
    if (lab.ions.length > 90) lab.ions.splice(0, 30);
  }

  function inject(lab) {
    lab.running = true;
    lab.paused = false;
    lab.runT = 0;
    lab.signal.fill(0);
    lab.arrivals = {};
    lab.molecules = [];
    COMPOUNDS.forEach((c) => {
      for (let i = 0; i < 16; i += 1) {
        lab.molecules.push({
          id: `${c.id}-${i}`,
          cid: c.id,
          color: c.color,
          affinity: c.affinity,
          u: lab.kind === "ms" ? 0.02 : 0.33 + Math.random() * 0.012,
          stick: 0,
          spread: 0,
          jitter: Math.random() * TAU,
          counted: false,
        });
      }
    });
    if (lab.kind === "ms") {
      lab.ions = [];
      lab.spectrum = {};
      COMPOUNDS.forEach((c) => {
        for (let i = 0; i < 5; i += 1) spawnIon(lab, c);
      });
    }
    lab.stage = lab.kind === "ms" ? "inside" : "inside";
    lab.focus = lab.kind === "ms" ? "source" : "injector";
    lab.stageT = 0;
    lab.dirty = true;
  }

  /* ---------- scene drawing: LC ---------- */
  function partAlpha(lab, id) {
    if (!lab.focus) return 1;
    return lab.focus === id ? 1 : 0.16;
  }

  function drawLcScene(lab) {
    const R = lab.R;
    const cut = lab.cut;
    const housingA = lerp(1, 0.2, cut);
    const h = LC.housing;

    drawBench(R, 1);
    reflect(R, h.c, h.hs, PEARL, 1 - cut * 0.7);
    drawShadow(R, h.c, 2.2, 1.3, 0.55 * (1 - cut * 0.4));

    // molded pearl housing; the front panel slides away as you enter
    drawBox(R, null, h.c, h.hs, {
      color: PEARL,
      alpha: housingA,
      radius: 16,
      glass: cut > 0.5,
      skip: (f) => f.n.z > 0.5 && cut > 0.12,
    });
    if (cut < 0.98) {
      const slide = cut * 1.1;
      const dz = h.hs.z + slide * 0.9;
      const doorA = (1 - cut) * 0.96;
      drawBox(R, null, add(h.c, v(0, slide * 0.1, dz)), v(h.hs.x, h.hs.y, 0.03), {
        color: PEARL,
        alpha: doorA,
        radius: 16,
      });
      // smoked inspection window so you can half-see the fluidics before entering
      drawBox(R, null, add(h.c, v(-0.12, 0.08 + slide * 0.1, dz + 0.034)), v(0.86, 0.5, 0.008), {
        color: [16, 26, 50],
        alpha: doorA * 0.94,
        radius: 10,
        edge: 0.7,
        lift: 0.5,
      });
      drawBox(R, null, add(h.c, v(-0.12, 0.32 + slide * 0.1, dz + 0.043)), v(0.8, 0.18, 0.002), {
        color: [150, 190, 235],
        alpha: doorA * 0.16,
        radius: 8,
        edge: 0,
        lift: 0.6,
      });
      // louvre vents on the right of the door
      for (let i = 0; i < 5; i += 1) {
        drawBox(
          R,
          null,
          add(h.c, v(1.24, -0.42 + i * 0.075 + slide * 0.1, dz + 0.032)),
          v(0.36, 0.014, 0.006),
          { color: [150, 164, 194], alpha: doorA * 0.8, radius: 3, edge: 0.4, lift: 0.5 }
        );
      }
      // horizontal seam across the chassis + wordmark + status lamp
      drawBox(R, null, add(h.c, v(0, -0.58 + slide * 0.1, dz + 0.031)), v(h.hs.x - 0.04, 0.006, 0.004), {
        color: [120, 136, 168],
        alpha: doorA * 0.55,
        radius: 2,
        edge: 0,
        lift: 0.5,
      });
      decal(R, add(h.c, v(-0.86, -0.72 + slide * 0.1, dz + 0.05)), "WATERS", {
        size: 0.15,
        track: 0.26,
        color: [74, 88, 120],
        alpha: doorA,
        align: "left",
      });
      decal(R, add(h.c, v(0.62, -0.72 + slide * 0.1, dz + 0.05)), "LC SYSTEM", {
        size: 0.075,
        track: 0.3,
        mono: true,
        weight: 600,
        color: [84, 100, 134],
        alpha: doorA * 0.9,
        align: "left",
      });
      const lamp = add(h.c, v(h.hs.x - 0.18, h.hs.y - 0.16, dz + 0.04));
      drawSphere(R, lamp, 0.026, CYAN, { alpha: 1 - cut, glow: 1.1 });
    }

    if (cut > 0.05) drawDeck(R, h.c, h.hs, cut);

    // feet, planted on the bench
    [-1, 1].forEach((sx) =>
      [-1, 1].forEach((sz) =>
        drawCylinder(
          R,
          v(h.c.x + sx * (h.hs.x - 0.2), h.c.y - h.hs.y + 0.02, h.c.z + sz * (h.hs.z - 0.18)),
          v(h.c.x + sx * (h.hs.x - 0.2), FLOOR + 0.01, h.c.z + sz * (h.hs.z - 0.18)),
          0.05,
          { color: [62, 74, 98], alpha: housingA, segments: 14 }
        )
      )
    );

    // chassis roof: the shelf the solvent bottles actually stand on, kept solid in cutaway
    drawBox(R, null, add(h.c, v(0, h.hs.y - 0.025, 0)), v(h.hs.x, 0.025, h.hs.z), {
      color: PEARL,
      alpha: Math.max(housingA, 0.82 * cut),
      radius: 8,
    });
    drawFrame(R, h.c, h.hs, cut * 0.5);

    // standoffs bolting each module to the deck, so nothing floats
    if (cut > 0.05) {
      const deckY = h.c.y - h.hs.y + 0.04;
      const posts = (at, bottomY, spread, r, a) =>
        [-spread, spread].forEach((dz) =>
          drawPost(R, v(at.x, 0, at.z + dz), bottomY, deckY, r, a * cut)
        );
      posts(LC.pump.c, LC.pump.c.y - LC.pump.hs.y, 0.14, 0.042, partAlpha(lab, "pump"));
      posts(LC.injector.c, LC.injector.c.y - 0.1, 0.0001, 0.05, partAlpha(lab, "injector"));
      posts(LC.detector.c, LC.detector.c.y - LC.detector.hs.y, 0.14, 0.042, partAlpha(lab, "detector"));
      posts(LC.column.bottom, LC.column.bottom.y - 0.07, 0.0001, 0.045, partAlpha(lab, "column"));
    }

    // solvent bottles on top
    LC.bottles.forEach((b, i) => {
      const a = partAlpha(lab, "reservoir");
      const bottomY = b.y - 0.3;
      drawCylinder(R, v(b.x, bottomY, b.z), v(b.x, b.y + 0.12, b.z), 0.15, {
        color: [220, 235, 255],
        alpha: a * 0.95,
        glass: true,
        segments: 24,
      });
      const level = bottomY + 0.3 + Math.sin(lab.t * 0.6 + i) * 0.004;
      drawCylinder(R, v(b.x, bottomY + 0.02, b.z), v(b.x, level, b.z), 0.133, {
        color: i ? [120, 200, 240] : [150, 215, 255],
        alpha: a * 0.5,
        segments: 22,
        caps: true,
      });
      drawCylinder(R, v(b.x, b.y + 0.12, b.z), v(b.x, b.y + 0.2, b.z), 0.055, {
        color: STEEL,
        alpha: a,
        segments: 14,
      });
    });

    // With a closed chassis the fluidics are simply not visible. Depth sorting is per-face, so a
    // module sitting nearer the camera in x would otherwise punch through the front panel.
    if (cut <= 0.02) return;

    // pump block with moving piston and rotating cam
    const pa = partAlpha(lab, "pump");
    const pump = LC.pump;
    drawBox(R, null, pump.c, pump.hs, { color: [226, 231, 242], alpha: pa, radius: 8 });
    const stroke = lab.running && !lab.paused ? Math.sin(lab.t * 7 * lab.flow) * 0.05 : 0;
    drawCylinder(
      R,
      add(pump.c, v(-0.3, 0.02, 0.0)),
      add(pump.c, v(-0.04 + stroke, 0.02, 0)),
      0.045,
      { color: [232, 238, 250], alpha: pa, segments: 18 }
    );
    drawDisc(R, add(pump.c, v(0.16, 0.06, pump.hs.z + 0.004)), v(0, 0, 1), 0.12, [120, 140, 175], { alpha: pa });
    const camAng = lab.t * 4.5 * (lab.running && !lab.paused ? lab.flow : 0);
    drawSphere(
      R,
      add(pump.c, v(0.16 + Math.cos(camAng) * 0.07, 0.06 + Math.sin(camAng) * 0.07, pump.hs.z + 0.02)),
      0.018,
      [255, 255, 255],
      { alpha: pa }
    );
    // pressure gauge
    gauge(R, add(pump.c, v(-0.1, 0.12, pump.hs.z + 0.01)), 0.075, lab, pa);

    // injector valve + vial in port
    const ia = partAlpha(lab, "injector");
    const inj = LC.injector.c;
    drawCylinder(R, add(inj, v(0, 0, -0.08)), add(inj, v(0, 0, 0.1)), 0.13, {
      color: [206, 214, 232],
      alpha: ia,
      segments: 24,
    });
    drawDisc(R, add(inj, v(0, 0, 0.102)), v(0, 0, 1), 0.125, [150, 165, 196], { alpha: ia });
    const valveAng = lab.running ? clamp((lab.runT - 0) * 2.2, 0, 1) * 1.1 : 0;
    drawCylinder(
      R,
      add(inj, v(Math.cos(valveAng) * 0.02, Math.sin(valveAng) * 0.02, 0.1)),
      add(inj, v(Math.cos(valveAng) * 0.09, Math.sin(valveAng) * 0.09, 0.1)),
      0.014,
      { color: [240, 244, 252], alpha: ia, segments: 10 }
    );
    // sample vial sitting in the port
    const vialBase = add(inj, v(0.0, 0.17, 0.0));
    const vialDrop = lab.running ? ease(clamp(lab.runT * 1.6, 0, 1)) * 0.07 : 0;
    const vb = add(vialBase, v(0, -vialDrop, 0));
    drawCylinder(R, vb, add(vb, v(0, 0.2, 0)), 0.045, {
      color: [226, 240, 255],
      alpha: ia,
      glass: true,
      segments: 18,
    });
    const fillH = lab.running ? 0.12 * (1 - clamp(lab.runT * 0.5, 0, 0.8)) : 0.12;
    drawCylinder(R, add(vb, v(0, 0.01, 0)), add(vb, v(0, 0.01 + fillH, 0)), 0.038, {
      color: [120, 210, 230],
      alpha: ia * 0.72,
      segments: 16,
    });
    drawCylinder(R, add(vb, v(0, 0.2, 0)), add(vb, v(0, 0.23, 0)), 0.03, {
      color: [150, 165, 196],
      alpha: ia,
      segments: 12,
    });
    // needle
    drawCylinder(R, add(vb, v(0, 0.02, 0)), add(vb, v(0, -0.06, 0)), 0.006, {
      color: [225, 232, 245],
      alpha: ia,
      segments: 8,
    });

    // column: steel end fittings, glass barrel, packed bed
    const ca = partAlpha(lab, "column");
    const col = LC.column;
    drawCylinder(R, add(col.bottom, v(0, -0.06, 0)), add(col.bottom, v(0, 0.05, 0)), col.r * 1.35, {
      color: [150, 164, 194],
      alpha: ca,
      segments: 20,
    });
    drawCylinder(R, add(col.top, v(0, -0.05, 0)), add(col.top, v(0, 0.06, 0)), col.r * 1.35, {
      color: [150, 164, 194],
      alpha: ca,
      segments: 20,
    });
    drawCylinder(R, col.bottom, col.top, col.r, {
      color: [220, 235, 255],
      alpha: ca,
      glass: true,
      segments: 30,
      caps: false,
    });
    drawPackedBed(lab, ca * 0.9);

    // detector module with a small live display
    const da = partAlpha(lab, "detector");
    const det = LC.detector;
    drawBox(R, null, det.c, det.hs, { color: [229, 234, 245], alpha: da, radius: 8 });
    drawBox(R, null, add(det.c, v(0, 0.04, det.hs.z + 0.004)), v(0.22, 0.14, 0.004), {
      color: [10, 18, 38],
      alpha: da,
      radius: 4,
      edge: 0.5,
      lift: 0.3,
    });
    miniTrace(R, add(det.c, v(0, 0.04, det.hs.z + 0.012)), 0.4, 0.24, lab, da);
    // flow cell glow when a compound passes
    const passing = lab.molecules.some((m) => Math.abs(m.u - lab.detU) < 0.02);
    drawSphere(R, add(det.c, v(-0.02, -0.08, 0.04)), 0.035, CYAN, {
      alpha: da,
      glow: passing ? 2.2 : 0.5,
    });

    // tubing + waste
    drawFluidPath(lab, cut);
  }

  function gauge(R, at, r, lab, alpha) {
    const p = R.project(at);
    if (!p.vis) return;
    const rr = r * p.s;
    const press = lab.running && !lab.paused ? 0.35 + 0.45 * lab.flow + Math.sin(lab.t * 6) * 0.03 : 0.08;
    R.push(p.z - 0.3, (ctx) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, rr, 0, TAU);
      ctx.fillStyle = rgba([14, 22, 44], alpha * 0.92);
      ctx.fill();
      ctx.strokeStyle = rgba([200, 215, 240], alpha * 0.6);
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.strokeStyle = rgba(CYAN, alpha * 0.85);
      ctx.lineWidth = Math.max(1, rr * 0.12);
      ctx.beginPath();
      ctx.arc(p.x, p.y, rr * 0.68, Math.PI * 0.78, Math.PI * 0.78 + press * Math.PI * 1.44);
      ctx.stroke();
    });
  }

  function miniTrace(R, at, w, h, lab, alpha) {
    const p = R.project(at);
    if (!p.vis) return;
    const W = w * p.s * 0.55;
    const H = h * p.s * 0.55;
    R.push(p.z - 0.4, (ctx) => {
      const x = p.x - W / 2;
      const y = p.y - H / 2;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, W, H);
      ctx.clip();
      ctx.strokeStyle = rgba(CYAN, alpha * 0.9);
      ctx.lineWidth = Math.max(0.8, W * 0.02);
      ctx.beginPath();
      const n = lab.signal.length;
      const max = Math.max(1, ...lab.signal);
      for (let i = 0; i < n; i += 1) {
        const sx = x + (i / (n - 1)) * W;
        const sy = y + H - 2 - (lab.signal[i] / max) * (H - 5);
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      }
      ctx.stroke();
      ctx.restore();
    });
  }

  function drawPackedBed(lab, alpha) {
    const R = lab.R;
    const col = LC.column;
    lab.bed.forEach((b, i) => {
      const y = lerp(col.bottom.y + 0.03, col.top.y - 0.03, b.y);
      const p = add(v(col.bottom.x, y, col.bottom.z), v(Math.cos(b.ang) * b.rad, 0, Math.sin(b.ang) * b.rad));
      drawSphere(R, p, b.r, i % 7 === 0 ? [214, 226, 244] : [182, 196, 222], { alpha: alpha * 0.62 });
    });
  }

  function drawFluidPath(lab, cut) {
    const R = lab.R;
    const path = lab.path;
    const alpha = lerp(0.58, 1, cut);
    const parts = lab.kind === "ms" ? MS_PARTS : LC_PARTS;
    const nearTo = (p) =>
      !lab.focus || parts.some((q) => q.id === lab.focus && len(sub(q.at, p)) < q.r * 2.4);

    lab.tubeRuns.forEach((run) => {
      for (let i = 0; i < run.length - 1; i += 1) {
        const mid = mix3(run[i], run[i + 1], 0.5);
        const near = nearTo(mid);
        drawTube(R, [run[i], run[i + 1]], 0.022, {
          glass: true,
          alpha: alpha * (near ? 1 : 0.24),
          fluid: lab.running
            ? { color: [120, 200, 240], alpha: 0.28 * (near ? 1 : 0.3) }
            : null,
        });
      }
    });
    // compression fittings where capillary meets capillary
    lab.joints.forEach((j) => {
      const a = alpha * (nearTo(j.p) ? 1 : 0.24);
      drawCylinder(R, add(j.p, mul(j.dir, -0.032)), add(j.p, mul(j.dir, 0.032)), 0.038, {
        color: [168, 180, 202],
        alpha: a,
        segments: 12,
      });
      drawCylinder(R, add(j.p, mul(j.dir, 0.03)), add(j.p, mul(j.dir, 0.055)), 0.026, {
        color: [196, 206, 226],
        alpha: a,
        segments: 10,
      });
    });
    // flowing solvent particles
    if (lab.running && !lab.paused) {
      for (let i = 0; i < 26; i += 1) {
        const u = ((lab.t * 0.08 * lab.flow + i / 26) % 1);
        const p = path.at(u);
        drawSphere(R, p, 0.009, [150, 215, 255], { alpha: 0.5, glow: 0.5 });
      }
    }
    // the sample molecules themselves
    lab.molecules.forEach((m) => {
      const dim = lab.selectedCompound && lab.selectedCompound !== m.cid ? 0.1 : 1;
      if (dim < 0.2 && lab.traceId) return;
      const base = lab.path.at(m.u);
      const wob = m.u > lab.colIn && m.u < lab.colOut ? 0.035 * m.spread : 0.012;
      const p = add(base, v(Math.sin(lab.t * 2 + m.jitter) * wob, Math.cos(lab.t * 1.7 + m.jitter) * wob * 0.6, Math.sin(m.jitter) * wob));
      const inside = lab.stage === "column-inside";
      drawSphere(R, p, inside ? 0.018 : 0.011, m.color, { alpha: dim, glow: 1.2 * dim });
    });
  }

  /* Readout panel in screen space, tethered to the detector with a leader line, so it stays
     legible at any camera distance instead of scaling with perspective. */
  function drawGraphOverlay(lab, ctx, w, h) {
    if (lab.stage === "column-inside") return;
    const W = clamp(w * 0.28, 230, 400);
    const H = W * 0.56;
    const x = w - W - 30;
    const y = clamp(h * 0.17, 76, h - H - 150);
    const det = lab.R.project(lab.kind === "ms" ? MS.detector.c : LC.detector.c);

    ctx.save();
    if (det && det.vis && det.x < x) {
      ctx.strokeStyle = rgba([120, 160, 210], 0.3);
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(det.x, det.y);
      ctx.lineTo(x - 10, y + H * 0.5);
      ctx.lineTo(x, y + H * 0.5);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = rgba(CYAN, 0.7);
      ctx.beginPath();
      ctx.arc(det.x, det.y, 2.6, 0, TAU);
      ctx.fill();
    }

    ctx.beginPath();
    ctx.roundRect(x, y, W, H, 12);
    ctx.fillStyle = rgba([7, 12, 28], 0.86);
    ctx.fill();
    ctx.strokeStyle = rgba([130, 165, 215], 0.26);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, W, H, 12);
    ctx.clip();

    const pad = 14;
    const base = y + H - 24;
    const top = y + 34;
    ctx.font = '600 10px "IBM Plex Mono", monospace';
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = rgba([140, 170, 212], 0.85);
    ctx.fillText(lab.kind === "ms" ? "MASS SPECTRUM" : "CHROMATOGRAM", x + pad, y + 20);
    ctx.fillStyle = rgba([110, 138, 180], 0.7);
    ctx.textAlign = "right";
    ctx.fillText(
      lab.kind === "ms" ? `m/z ${Math.round(lab.scanMz)}` : `${(lab.runT / RT_PER_MIN).toFixed(1)} min`,
      x + W - pad,
      y + 20
    );
    ctx.textAlign = "left";

    // baseline + axis
    ctx.strokeStyle = rgba([120, 150, 190, 1], 0.35);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + pad, base);
    ctx.lineTo(x + W - pad, base);
    ctx.stroke();

    if (lab.kind === "ms") drawSpectrumInto(lab, ctx, x + pad, top, W - pad * 2, base - top, base);
    else drawTraceInto(lab, ctx, x + pad, top, W - pad * 2, base - top, base);

    ctx.restore();
    ctx.restore();
  }

  function drawTraceInto(lab, ctx, x, y, W, H, base) {
    const max = Math.max(1, ...lab.signal);
    const n = lab.signal.length;
    const px = (i) => x + (i / (n - 1)) * W;
    const py = (val) => base - (val / max) * H;

    ctx.beginPath();
    ctx.moveTo(px(0), base);
    for (let i = 0; i < n; i += 1) ctx.lineTo(px(i), py(lab.signal[i]));
    ctx.lineTo(px(n - 1), base);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, y, 0, base);
    g.addColorStop(0, rgba(CYAN, 0.26));
    g.addColorStop(1, rgba(CYAN, 0));
    ctx.fillStyle = g;
    ctx.fill();

    ctx.strokeStyle = rgba(CYAN, 0.95);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < n; i += 1) {
      if (i === 0) ctx.moveTo(px(i), py(lab.signal[i]));
      else ctx.lineTo(px(i), py(lab.signal[i]));
    }
    ctx.stroke();

    Object.entries(lab.arrivals).forEach(([cid, time]) => {
      const comp = COMPOUNDS.find((c) => c.id === cid);
      if (!comp) return;
      const dim = lab.selectedCompound && lab.selectedCompound !== cid ? 0.22 : 1;
      const i = clamp(Math.round((time / RUN_WINDOW) * (n - 1)), 0, n - 1);
      const sx = px(i);
      const sy = py(lab.signal[i]);
      ctx.strokeStyle = rgba(comp.color, 0.35 * dim);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(sx, sy - 6);
      ctx.lineTo(sx, base);
      ctx.stroke();
      ctx.fillStyle = rgba(comp.color, dim);
      ctx.beginPath();
      ctx.arc(sx, sy, 2.8, 0, TAU);
      ctx.fill();
      ctx.font = "700 9px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(comp.short, sx, sy - 9);
      ctx.textAlign = "left";
    });

    if (!Object.keys(lab.arrivals).length) {
      ctx.fillStyle = rgba([110, 138, 180], 0.55);
      ctx.font = "400 10px Inter, sans-serif";
      ctx.fillText(lab.running ? "waiting for the first peak…" : "inject a sample to start", x, base + 15);
    }
  }

  /* ---------- scene drawing: MS ---------- */
  function drawMsScene(lab) {
    const R = lab.R;
    const h = MS.housing;
    const cut = lab.cut;
    const housingA = lerp(1, 0.18, cut);
    drawBench(R, 1);
    reflect(R, h.c, h.hs, PEARL, 1 - cut * 0.7);
    drawShadow(R, h.c, 2.3, 1.3, 0.55 * (1 - cut * 0.4));
    drawBox(R, null, h.c, h.hs, {
      color: PEARL,
      alpha: housingA,
      radius: 16,
      glass: cut > 0.5,
      skip: (f) => f.n.z > 0.5 && cut > 0.12,
    });
    if (cut < 0.98) {
      const dz = h.hs.z + cut * 1.0;
      const doorA = (1 - cut) * 0.96;
      drawBox(R, null, add(h.c, v(0, 0, dz)), v(h.hs.x, h.hs.y, 0.03), {
        color: PEARL,
        alpha: doorA,
        radius: 16,
      });
      // vacuum-side door: smoked porthole, vents, wordmark
      drawBox(R, null, add(h.c, v(0.1, 0.1, dz + 0.034)), v(0.72, 0.42, 0.008), {
        color: [16, 26, 50],
        alpha: doorA * 0.94,
        radius: 10,
        edge: 0.7,
        lift: 0.5,
      });
      for (let i = 0; i < 6; i += 1) {
        drawBox(R, null, add(h.c, v(-1.26, -0.4 + i * 0.07, dz + 0.032)), v(0.3, 0.012, 0.006), {
          color: [150, 164, 194],
          alpha: doorA * 0.8,
          radius: 3,
          edge: 0.4,
          lift: 0.5,
        });
      }
      decal(R, add(h.c, v(-0.9, -0.66, dz + 0.05)), "WATERS", {
        size: 0.15,
        track: 0.26,
        color: [74, 88, 120],
        alpha: doorA,
        align: "left",
      });
      decal(R, add(h.c, v(0.6, -0.66, dz + 0.05)), "MASS SPEC", {
        size: 0.075,
        track: 0.3,
        mono: true,
        weight: 600,
        color: [84, 100, 134],
        alpha: doorA * 0.9,
        align: "left",
      });
      drawSphere(R, add(h.c, v(h.hs.x - 0.18, h.hs.y - 0.16, dz + 0.04)), 0.026, VIOLET, {
        alpha: 1 - cut,
        glow: 1.1,
      });
    }
    if (cut > 0.05) drawDeck(R, h.c, h.hs, cut);
    [-1, 1].forEach((sx) =>
      [-1, 1].forEach((sz) =>
        drawCylinder(
          R,
          v(h.c.x + sx * (h.hs.x - 0.2), h.c.y - h.hs.y + 0.02, h.c.z + sz * (h.hs.z - 0.18)),
          v(h.c.x + sx * (h.hs.x - 0.2), FLOOR + 0.01, h.c.z + sz * (h.hs.z - 0.18)),
          0.05,
          { color: [62, 74, 98], alpha: housingA, segments: 14 }
        )
      )
    );

    drawFrame(R, h.c, h.hs, cut * 0.5);

    // standoffs holding the ion optics on the deck
    if (cut > 0.05) {
      const deckY = h.c.y - h.hs.y + 0.04;
      [
        [MS.source.c, 0.042, "source"],
        [MS.cone.c, 0.038, "cone"],
        [v(0.32, 0.62, 0), 0.046, "quad"],
        [MS.detector.c, 0.042, "detector"],
      ].forEach(([at, r, id]) => {
        drawPost(R, at, at.y - 0.11, deckY, r, partAlpha(lab, id) * cut);
      });
    }

    if (cut <= 0.02) return;

    // electrospray source: capillary + spray cone
    const sa = partAlpha(lab, "source");
    const src = MS.source.c;
    drawCylinder(R, add(src, v(-0.3, 0.02, 0)), add(src, v(-0.08, 0.0, 0)), 0.018, {
      color: [226, 232, 246],
      alpha: sa,
      segments: 12,
    });
    drawCylinder(R, add(src, v(-0.08, 0, 0)), add(src, v(-0.02, 0, 0)), 0.009, {
      color: [240, 245, 255],
      alpha: sa,
      segments: 10,
    });
    if (lab.running) {
      for (let i = 0; i < 44; i += 1) {
        const u = ((lab.t * 0.9 + i / 44) % 1);
        const spread = u * 0.1;
        const ang = (i / 44) * TAU;
        const p = add(src, v(u * 0.42, Math.cos(ang) * spread, Math.sin(ang) * spread));
        drawSphere(R, p, lerp(0.012, 0.004, u), i % 3 ? [150, 210, 245] : VIOLET, {
          alpha: sa * (1 - u) * 0.9,
          glow: 0.8,
        });
      }
    }

    // sampling cone
    const na = partAlpha(lab, "cone");
    const cone = MS.cone.c;
    drawCylinder(R, add(cone, v(-0.06, 0, 0)), add(cone, v(0.06, 0, 0)), 0.1, {
      color: [206, 215, 234],
      alpha: na,
      segments: 24,
    });
    drawDisc(R, add(cone, v(0.062, 0, 0)), v(1, 0, 0), 0.1, [150, 164, 194], { alpha: na });
    drawSphere(R, add(cone, v(0.07, 0, 0)), 0.016, CYAN, { alpha: na, glow: 1.4 });

    // quadrupole: four polished rods
    const qa = partAlpha(lab, "quad");
    const q = MS.quad;
    [
      v(0, q.r, 0),
      v(0, -q.r, 0),
      v(0, 0, q.r),
      v(0, 0, -q.r),
    ].forEach((off, i) => {
      const rodA = add(q.a, off);
      const rodB = add(q.b, off);
      const live = lab.running && !lab.paused ? 0.5 + 0.5 * Math.sin(lab.t * 9 + i * Math.PI / 2) : 0;
      drawCylinder(R, rodA, rodB, 0.028, {
        color: [214, 222, 240],
        alpha: qa,
        segments: 18,
        emissive: [i % 2 ? VIOLET : CYAN, 0.1 + live * 0.18],
      });
    });
    // ions inside the analyzer
    if (lab.kind === "ms") {
      lab.ions.forEach((ion) => {
        if (ion.dead) return;
        const dim = lab.selectedCompound && lab.selectedCompound !== ion.cid ? 0.12 : 1;
        const p = lab.path.at(ion.u);
        const inQuad = ion.u > 0.56;
        const amp = inQuad ? (ion.pass ? 0.02 : 0.02 + (ion.off || 0) * 0.5) : 0.012;
        const ang = lab.t * 9 + ion.phase;
        const off = v(0, Math.sin(ang) * amp * ion.wob, Math.cos(ang) * amp);
        const kicked = ion.pass === false ? v(0, (ion.kick || 0) * (ion.off || 0) * 3, 0) : v(0, 0, 0);
        drawSphere(R, add(add(p, off), kicked), 0.013, ion.color, {
          alpha: dim * (ion.pass === false ? clamp(1 - (ion.off || 0) * 2, 0, 1) : 1),
          glow: 1.4 * dim,
        });
      });
    }

    // detector
    const da = partAlpha(lab, "detector");
    drawBox(R, null, MS.detector.c, MS.detector.hs, { color: [229, 234, 245], alpha: da, radius: 8 });
    drawDisc(R, add(MS.detector.c, v(-MS.detector.hs.x - 0.004, 0, 0)), v(-1, 0, 0), 0.16, [120, 140, 175], { alpha: da });

    drawFluidPath(lab, cut);
  }

  function drawSpectrumInto(lab, ctx, x, y, W, H, base) {
    const entries = Object.entries(lab.spectrum);
    const max = Math.max(1, ...entries.map(([, c]) => c));
    const px = (mz) => x + clamp((Number(mz) - 120) / 380, 0, 1) * W;

    const mx = px(lab.scanMz);
    ctx.strokeStyle = rgba([200, 220, 255], 0.22);
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(mx, y);
    ctx.lineTo(mx, base);
    ctx.stroke();
    ctx.setLineDash([]);

    entries.forEach(([mz, count]) => {
      const comp = COMPOUNDS.find((c) => String(c.mz) === String(mz));
      const col = comp ? comp.color : CYAN;
      const dim = lab.selectedCompound && comp && lab.selectedCompound !== comp.id ? 0.2 : 1;
      const sx = px(mz);
      const bh = (count / max) * H;
      ctx.strokeStyle = rgba(col, 0.95 * dim);
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(sx, base);
      ctx.lineTo(sx, base - bh);
      ctx.stroke();
      ctx.fillStyle = rgba(col, dim);
      ctx.font = "600 9px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(mz, sx, base - bh - 5);
      ctx.textAlign = "left";
    });

    if (!entries.length) {
      ctx.fillStyle = rgba([110, 138, 180], 0.55);
      ctx.font = "400 10px Inter, sans-serif";
      ctx.fillText(lab.running ? "ions in flight…" : "inject a sample to start", x, base + 15);
    }
  }

  /* ---------- inside-the-column cinematic ----------
     The real column bore is ~2mm, so reusing the instrument-scale geometry would put the camera
     inside a single bead. The interior is its own blown-up space: a bore of radius 1, packed with
     particles, with the sample's progress through the column mapped onto the long axis. */
  const BORE = 1.0;
  const BORE_TOP = 3.6;

  function moleculeInBore(lab, m) {
    const span = lab.colOut - lab.colIn || 1;
    const f = clamp((m.u - lab.colIn) / span, 0, 1);
    const rad = (0.18 + 0.62 * (m.spread || 0.5)) * BORE;
    const ang = m.jitter * 2.1 + Math.sin(lab.t * 0.7 + m.jitter) * 0.25;
    return v(
      Math.cos(ang) * rad,
      lerp(BORE_TOP, -BORE_TOP, f) + Math.sin(lab.t * 1.4 + m.jitter) * 0.05,
      Math.sin(ang) * rad
    );
  }

  function drawColumnInterior(lab) {
    const R = lab.R;
    const cam = R.cam.pos;
    const near = (p) => len(sub(p, cam)) < 1.0;

    // bore wall, plus rings along it to read as a tube you are looking up
    drawCylinder(R, v(0, -BORE_TOP - 1.4, 0), v(0, BORE_TOP + 1.4, 0), BORE * 1.14, {
      color: [222, 236, 255],
      alpha: 0.9,
      glass: true,
      segments: 46,
      caps: false,
      rim: 2.2,
    });
    for (let i = -4; i <= 5; i += 1) {
      drawDisc(R, v(0, i * 0.9, 0), v(0, 1, 0), BORE * 1.14, [150, 196, 240], {
        alpha: 0.26,
        ring: true,
        segments: 40,
      });
    }

    // mobile phase threading up between the particles
    if (!lab.paused) {
      for (let i = 0; i < 150; i += 1) {
        const u = (lab.t * 0.15 * lab.flow + i / 150) % 1;
        const ang = i * 2.399;
        const rad = (0.1 + ((i * 17) % 83) / 92) * BORE;
        const a = v(Math.cos(ang) * rad, lerp(BORE_TOP, -BORE_TOP, u), Math.sin(ang) * rad);
        if (len(sub(a, cam)) < 1.6) continue;
        drawTube(R, [a, add(a, v(0, -0.42, 0))], 0.005, {
          glass: true,
          alpha: 0.5,
          fluid: { color: [150, 215, 250], alpha: 0.5 },
        });
      }
    }

    // the packed bed itself
    lab.interior.forEach((b) => {
      const p = v(Math.cos(b.ang) * b.rad, b.y, Math.sin(b.ang) * b.rad);
      if (near(p)) return;
      drawSphere(R, p, b.r, b.tone > 0.82 ? [222, 232, 248] : [178, 192, 218], { alpha: 0.92 });
    });

    // the sample, moving through the bed at its own pace
    lab.molecules.forEach((m) => {
      if (m.u <= lab.colIn || m.u >= lab.colOut) return;
      const dim = lab.selectedCompound && lab.selectedCompound !== m.cid ? 0.12 : 1;
      const p = moleculeInBore(lab, m);
      drawSphere(R, p, 0.055, m.color, { alpha: dim, glow: 1.6 * dim });
      if (dim > 0.5 && !lab.paused) {
        drawTube(R, [p, add(p, v(0, 0.34, 0))], 0.013, {
          glass: false,
          color: m.color,
          alpha: 0.26,
        });
      }
    });
  }

  /* ---------- render ---------- */
  function render(lab, ctx, w, h, dt) {
    const R = lab.R;
    R.w = w;
    R.h = h;
    R.cam.pos = lab.camNow.pos;
    R.cam.target = lab.camNow.target;
    R.cam.fov = lab.camNow.fov;
    R.prep();

    if (lab.stage === "column-inside") drawColumnInterior(lab);
    else if (lab.kind === "ms") drawMsScene(lab);
    else drawLcScene(lab);

    R.flush(ctx);
    drawGraphOverlay(lab, ctx, w, h);
    computeHits(lab);
  }

  /* ---------- picking ---------- */
  function computeHits(lab) {
    const parts = lab.kind === "ms" ? MS_PARTS : LC_PARTS;
    lab.hits = parts
      .map((p) => {
        const pr = lab.R.project(p.at);
        if (!pr.vis) return null;
        return { id: p.id, x: pr.x, y: pr.y, r: Math.max(18, p.r * pr.s * 0.72), z: pr.z };
      })
      .filter(Boolean);
  }

  function pick(lab, x, y) {
    if (!lab.hits || lab.stage === "column-inside") return null;
    let best = null;
    let bd = Infinity;
    for (const hit of lab.hits) {
      const d = Math.hypot(x - hit.x, y - hit.y);
      if (d < hit.r && d < bd) {
        bd = d;
        best = hit.id;
      }
    }
    return best;
  }

  /* ---------- interaction ---------- */
  function pointerDown(lab, x, y) {
    lab.drag = { x, y, moved: 0, yaw: lab.orbit.yaw, pitch: lab.orbit.pitch };
  }

  function pointerMove(lab, x, y) {
    if (lab.drag) {
      const dx = x - lab.drag.x;
      const dy = y - lab.drag.y;
      lab.drag.moved = Math.max(lab.drag.moved, Math.hypot(dx, dy));
      lab.orbit.yaw = lab.drag.yaw - dx * 0.006;
      lab.orbit.pitch = clamp(lab.drag.pitch + dy * 0.004, -0.35, 0.9);
      return "drag";
    }
    const id = pick(lab, x, y);
    lab.hoverPart = id;
    return id ? "pointer" : null;
  }

  function pointerUp(lab, x, y) {
    const drag = lab.drag;
    lab.drag = null;
    if (!drag || drag.moved > 6) return null;
    const id = pick(lab, x, y);
    if (id) {
      if (lab.stage === "exterior") enterInstrument(lab);
      lab.focus = lab.focus === id ? null : id;
      lab.stageT = 0;
      if (lab.stage === "trace") lab.stage = "inside";
      return "select";
    }
    if (lab.focus) {
      lab.focus = null;
      return "deselect";
    }
    return null;
  }

  function wheel(lab, delta) {
    if (lab.stage === "column-inside") return;
    lab.orbit.dist = clamp(lab.orbit.dist + delta * 0.0022, 0.9, 9);
  }

  function enterInstrument(lab) {
    lab.stage = "inside";
    lab.stageT = 0;
    lab.orbit.dist = lab.kind === "ms" ? 4.1 : 3.9;
  }

  function act(lab, action) {
    switch (action) {
      case "enter":
        enterInstrument(lab);
        break;
      case "exterior":
        lab.stage = "exterior";
        lab.focus = null;
        lab.orbit.dist = lab.kind === "ms" ? 5.6 : 5.4;
        break;
      case "inject":
        inject(lab);
        break
      case "pause":
        lab.paused = !lab.paused;
        break;
      case "inside-column":
        lab.stage = lab.stage === "column-inside" ? "inside" : "column-inside";
        lab.focus = lab.stage === "column-inside" ? "column" : lab.focus;
        // nothing to watch if the sample already eluted — start a fresh run
        if (lab.stage === "column-inside" && !lab.molecules.some((m) => m.u > lab.colIn && m.u < lab.colOut)) {
          inject(lab);
        }
        break;
      case "trace":
        if (lab.stage === "trace") {
          lab.stage = "inside";
          lab.traceId = null;
        } else {
          if (!lab.molecules.some((m) => m.u < 0.9)) inject(lab);
          const cid = lab.selectedCompound || "b";
          const m = lab.molecules.find((x) => x.cid === cid && x.u < 0.98) || lab.molecules[0];
          if (m) {
            lab.traceId = m.id;
            lab.selectedCompound = m.cid;
            lab.stage = "trace";
            lab.focus = null;
          }
        }
        break;
      case "flow-up":
        lab.flow = clamp(lab.flow + 0.25, 0.25, 2);
        break;
      case "flow-down":
        lab.flow = clamp(lab.flow - 0.25, 0.25, 2);
        break;
      case "scan":
        lab.autoScan = !lab.autoScan;
        break;
      case "exit":
        return "exit";
      case "to-ms":
        return "ms";
      case "to-lc":
        return "lc";
      default:
        if (action?.startsWith?.("compound:")) {
          const cid = action.split(":")[1];
          lab.selectedCompound = lab.selectedCompound === cid ? null : cid;
          if (lab.traceId && lab.selectedCompound) {
            const m = lab.molecules.find((x) => x.cid === lab.selectedCompound && x.u < 0.98);
            if (m) lab.traceId = m.id;
          }
        } else if (action?.startsWith?.("part:")) {
          const id = action.split(":")[1];
          if (lab.stage === "exterior") enterInstrument(lab);
          lab.focus = lab.focus === id ? null : id;
        }
    }
    return null;
  }

  function stageLabel(lab) {
    if (lab.stage === "exterior") return "Exterior";
    if (lab.stage === "column-inside") return "Inside the column";
    if (lab.stage === "trace") {
      const c = COMPOUNDS.find((x) => x.id === lab.selectedCompound);
      return `Tracing ${c ? c.name : "a molecule"}`;
    }
    const parts = lab.kind === "ms" ? MS_PARTS : LC_PARTS;
    const p = parts.find((x) => x.id === lab.focus);
    return p ? p.label : "Cutaway";
  }

  function caption(lab) {
    const parts = lab.kind === "ms" ? MS_PARTS : LC_PARTS;
    if (lab.stage === "exterior")
      return lab.kind === "ms"
        ? "A mass spectrometer. Step inside to see molecules become ions."
        : "A liquid chromatograph. Step inside — the sample is about to travel through it.";
    if (lab.stage === "column-inside")
      return "You're inside the packed bed. Compounds that stick to the particles fall behind — that's the separation.";
    if (lab.stage === "trace") {
      const c = COMPOUNDS.find((x) => x.id === lab.selectedCompound);
      return `Following ${c ? c.name : "one molecule"} through the system to the detector.`;
    }
    const p = parts.find((x) => x.id === lab.focus);
    if (p) return p.what;
    if (!lab.running) return "Click any component to isolate it, or inject the sample and watch it travel.";
    return "The sample is moving. Follow it — or step inside the column.";
  }

  function hudHtml(lab) {
    const parts = lab.kind === "ms" ? MS_PARTS : LC_PARTS;
    const btn = (act, label, cls = "") =>
      `<button type="button" class="wl-btn ${cls}" data-act="${act}">${esc(label)}</button>`;
    const controls = [];
    if (lab.stage === "exterior") controls.push(btn("enter", "Enter instrument", "primary"));
    else {
      if (!lab.running) controls.push(btn("inject", lab.kind === "ms" ? "Start the run" : "Inject sample", "primary"));
      else controls.push(btn("pause", lab.paused ? "Resume" : "Pause"));
      if (lab.kind === "lc" && lab.running) {
        controls.push(btn("inside-column", lab.stage === "column-inside" ? "Back out of column" : "Go inside the column"));
        controls.push(btn("trace", lab.stage === "trace" ? "Stop tracing" : "Trace a molecule"));
      }
      if (lab.kind === "ms" && lab.running) controls.push(btn("scan", lab.autoScan ? "Hold the m/z filter" : "Resume scanning"));
      if (lab.focus === "pump") {
        controls.push(btn("flow-down", "– flow"));
        controls.push(btn("flow-up", "+ flow"));
      }
      controls.push(btn("exterior", "Step back out"));
    }
    controls.push(btn(lab.kind === "lc" ? "to-ms" : "to-lc", lab.kind === "lc" ? "Into Mass Spec →" : "← Back to LC"));

    const chips = COMPOUNDS.map((c) => {
      const rt = lab.arrivals[c.id];
      const on = lab.selectedCompound === c.id;
      const meta = lab.kind === "ms" ? `m/z ${c.mz}` : rt ? `${(rt / RT_PER_MIN).toFixed(1)} min` : "in column";
      return `<button type="button" class="wl-chip${on ? " is-on" : ""}" data-act="compound:${c.id}" style="--c:${rgba(c.color, 1)}">
        <i></i><b>${esc(c.short)}</b><span>${esc(meta)}</span></button>`;
    }).join("");

    return `
      <div class="wl-top">
        <p class="wl-title"><span>${lab.kind.toUpperCase()}</span>${lab.kind === "lc" ? "Liquid chromatography" : "Mass spectrometry"}</p>
        <p class="wl-stage">${esc(stageLabel(lab))}${
          lab.running
            ? lab.kind === "ms"
              ? ` · scanning m/z ${Math.round(lab.scanMz)}`
              : ` · flow ${lab.flow.toFixed(2)} mL/min`
            : ""
        }</p>
      </div>
      <ol class="wl-parts">${parts
        .map(
          (p) => `<li><button type="button" class="wl-part${lab.focus === p.id ? " is-on" : ""}" data-act="part:${p.id}">
            <span>${p.no}</span>${esc(p.label)}</button></li>`
        )
        .join("")}</ol>
      <div class="wl-bottom">
        <p class="wl-caption">${esc(caption(lab))}</p>
        <div class="wl-controls">${controls.join("")}</div>
      </div>
      <div class="wl-chips">${chips}</div>
      <button type="button" class="wl-exit" data-act="exit">esc · exit instrument</button>`;
  }

  global.WatersLab3D = {
    create,
    update,
    render,
    pointerDown,
    pointerMove,
    pointerUp,
    wheel,
    act,
    hudHtml,
    caption,
    stageLabel,
    COMPOUNDS,
  };
})(window);
