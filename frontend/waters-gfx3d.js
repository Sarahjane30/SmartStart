/* Waters 3D graphics kit — a small canvas renderer shared by the Waters experiences.
   Perspective camera, painter's-algorithm depth queue, Lambert + specular + Fresnel
   shading, glass transparency and screen-space tubing. No WebGL dependency. */
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
      /* Near-plane clip in camera space. Without it a face with one corner just in front of the
         lens projects with a huge scale and smears across the frame as a flat slab. */
      near: 0.1,
      nearFade: 1.1,
      clipProject(world) {
        const { f } = this.basis;
        const cp = this.cam.pos;
        const zs = world.map((p) => dot(sub(p, cp), f));
        let minZ = Infinity;
        for (const z of zs) minZ = Math.min(minZ, z);
        if (minZ >= this.near) return { pts: world.map((p) => this.project(p)), minZ };
        const out = [];
        const n = world.length;
        for (let i = 0; i < n; i += 1) {
          const j = (i + 1) % n;
          const a = world[i];
          const b = world[j];
          const za = zs[i];
          const zb = zs[j];
          if (za >= this.near) out.push(this.project(a));
          if ((za >= this.near) !== (zb >= this.near)) {
            const t = (this.near - za) / (zb - za);
            out.push(this.project(mix3(a, b, t)));
          }
        }
        if (out.length < 3) return null;
        return { pts: out, minZ: this.near };
      },
      /* Opacity multiplier so geometry dissolves as the lens reaches it instead of popping. */
      nearAlpha(minZ) {
        const k = smooth(clamp((minZ - this.near) / (this.nearFade - this.near), 0, 1));
        return k * k;
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
    const { color = PEARL, alpha: alpha0 = 1, radius = 10, skip = null, glass = false, edge = 0.22, lift = 0 } = opts;
    boxFaces(c, hs).forEach((f) => {
      if (skip && skip(f)) return;
      const toCam = sub(R.cam.pos, f.center);
      const facing = dot(f.n, toCam);
      if (!glass && facing <= 0) return;
      const clip = R.clipProject(f.corners);
      if (!clip) return;
      const pts = clip.pts;
      const alpha = alpha0 * R.nearAlpha(clip.minZ);
      if (alpha < 0.01) return;
      const lam = clamp(dot(f.n, LIGHT), 0, 1);
      const base = shade(color, 0.34 + lam * 0.52);
      const z = Math.max(R.project(f.center).z, clip.minZ) - lift;
      R.push(z, (ctx) => {
        facePath(ctx, pts, pts.length === 4 ? radius : 0);
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
      color = STEEL, alpha: alpha0 = 1, segments = 26, glass = false, caps = true,
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
      const clip = R.clipProject(quad);
      if (!clip) continue;
      const pts = clip.pts;
      const alpha = alpha0 * R.nearAlpha(clip.minZ);
      if (alpha < 0.01) continue;
      const lam = clamp(dot(nrm, LIGHT), 0, 1);
      const spec = Math.pow(clamp(dot(norm(add(LIGHT, toCam)), nrm), 0, 1), 26);
      const z = Math.max(R.project(center).z, clip.minZ);
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
        const clip = R.clipProject(circlePts(c, ax, r, segments).map((p) => p.p));
        if (!clip) return;
        const ring = clip.pts;
        const alpha = alpha0 * R.nearAlpha(clip.minZ);
        if (alpha < 0.01) return;
        const lam = clamp(dot(nrm, LIGHT), 0, 1);
        const col = capColor || shade(color, 0.9);
        const z = Math.max(R.project(c).z, clip.minZ) - 0.002;
        R.push(z, (ctx) => {
          facePath(ctx, ring, 0);
          const g = ctx.createLinearGradient(ring[0].x, ring[0].y, ring[(ring.length / 2) | 0].x, ring[(ring.length / 2) | 0].y);
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
    const { color = STEEL, alpha: alpha0 = 1, glass = true, fluid = null } = opts;
    const { f } = R.basis;
    for (let i = 0; i < pts.length - 1; i += 1) {
      let a = pts[i];
      let b = pts[i + 1];
      const za = dot(sub(a, R.cam.pos), f);
      const zb = dot(sub(b, R.cam.pos), f);
      if (za < R.near && zb < R.near) continue;
      if (za < R.near) a = mix3(a, b, (R.near - za) / (zb - za));
      else if (zb < R.near) b = mix3(a, b, (R.near - za) / (zb - za));
      const alpha = alpha0 * R.nearAlpha(Math.max(R.near, Math.min(za, zb)));
      if (alpha < 0.01) continue;
      const pa = R.project(a);
      const pb = R.project(b);
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
    let { alpha = 1, segments = 30, ring = false } = opts;
    const clip = R.clipProject(circlePts(c, axis, r, segments).map((p) => p.p));
    if (!clip) return;
    const pts = clip.pts;
    const p = R.project(c);
    if (!p.vis) return;
    alpha *= R.nearAlpha(clip.minZ);
    if (alpha < 0.01) return;
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


  global.WatersGfx3D = {
    TAU, DEG, LIGHT, PEARL, STEEL, DARK, CYAN, VIOLET, MINT,
    v, add, sub, mul, dot, cross, len, norm, mix3, lerp, clamp, ease, smooth, rgba, shade, esc,
    smoothPath, polyline, makeRenderer, facePath, circlePts,
    drawBox, drawCylinder, drawSphere, drawTube, drawDisc, decal, drawPost, drawShadow,
  };
})(window);
