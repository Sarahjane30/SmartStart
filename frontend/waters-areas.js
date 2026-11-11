/* Waters // Chapter 03 — the area experiences behind Biosciences, Advanced Diagnostics and
   Materials Sciences. Each is a full-screen scientific scene in three steps, drawn on the
   machine canvas from WatersSim models; the hub supplies the drawing kit, the screen region
   and the step, and renders the step text and controls in the DOM. Everything shown is an
   illustrative simulation, not instrument data. */
(function (global) {
  "use strict";

  const SIM = global.WatersSim;
  const W = 1000;
  const H = 600;
  const MONO = '"IBM Plex Mono", ui-monospace, monospace';
  const SANS = '"Inter", system-ui, sans-serif';
  const hash = (m, s) => {
    const v = Math.sin(m * s) * 43758.5453;
    return v - Math.floor(v);
  };

  function base(K) {
    const { ctx, rgba, lerp, clamp } = K;
    const B = { sc: 1, ox: 0, oy: 0 };
    B.fit = (R) => {
      B.sc = Math.min(R.w / W, R.h / H);
      B.ox = R.x + (R.w - W * B.sc) / 2;
      B.oy = R.y + (R.h - H * B.sc) / 2;
    };
    B.begin = () => {
      ctx.save();
      ctx.translate(B.ox, B.oy);
      ctx.scale(B.sc, B.sc);
    };
    B.end = () => ctx.restore();
    B.screen = (x, y, u) => ({ x: B.ox + x * B.sc, y: B.oy + y * B.sc, u: u * B.sc });
    B.local = (x, y) => ({ x: (x - B.ox) / B.sc, y: (y - B.oy) / B.sc });
    B.lw = (px) => px / B.sc;
    B.text = (t, x, y, a, o = {}) => {
      if (a <= 0.02) return;
      const px = Math.max(o.size || 11, (o.min || 9) / B.sc);
      const op = ctx.globalCompositeOperation;
      ctx.globalCompositeOperation = "source-over";
      ctx.font = `${o.weight || 500} ${px}px ${o.sans ? SANS : MONO}`;
      ctx.textAlign = o.align || "left";
      ctx.textBaseline = o.base || "middle";
      ctx.fillStyle = rgba(o.col || K.C.ice, a);
      ctx.fillText(o.sans ? t : t.toUpperCase(), x, y);
      ctx.globalCompositeOperation = op;
    };
    B.axes = (x, y, w, h, a) => {
      ctx.strokeStyle = rgba(K.C.ice, 0.28 * a);
      ctx.lineWidth = B.lw(1);
      ctx.beginPath();
      ctx.moveTo(x, y - h);
      ctx.lineTo(x, y);
      ctx.lineTo(x + w, y);
      ctx.stroke();
    };
    B.curve = (x, y, w, h, f, head, col, a, width = 1.6, lo = 0) => {
      ctx.strokeStyle = rgba(col, a);
      ctx.lineWidth = B.lw(width);
      ctx.beginPath();
      const N = Math.max(2, Math.round(160 * head));
      for (let k = 0; k <= N; k += 1) {
        const u = (k / N) * head;
        const yy = y - clamp(f(u), lo, 1.08) * h;
        k ? ctx.lineTo(x + u * w, yy) : ctx.moveTo(x + u * w, yy);
      }
      ctx.stroke();
    };
    B.box = (x, y, w, h, r, fill, stroke, lw = 1) => {
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
      else ctx.rect(x, y, w, h);
      if (fill) {
        ctx.fillStyle = fill;
        ctx.fill();
      }
      if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = B.lw(lw);
        ctx.stroke();
      }
    };
    B.fade = (cur, target, dt) => cur.map((v, i) => lerp(v, i === target ? 1 : 0, Math.min(1, dt * 3)));
    return B;
  }

  /* ---------- Biosciences: flow cytometry ---------- */

  function biosciences(K) {
    const { ctx, C, rgba, glow, dot, lerp, clamp, TAU } = K;
    const B = base(K);
    const F = SIM.flow;
    const pops = () => [C.cyan, C.violet, C.ice];
    const RATE = 1.8;
    const EVENTS = 42;
    const TUBE = { x: 60, y: 110, w: 150, h: 380 };
    const NOZ = { x: 430, top: 70, neck: 236, bot: 570, wTop: 66, wCh: 9 };
    const LY = 330;
    const DET = [
      { id: "ssc", label: "Side scatter", y: 236, key: "ssc" },
      { id: "fsc", label: "Forward scatter", y: 330, key: "fsc" },
      { id: "fl", label: "Fluorescence", y: 424, key: "fl" },
    ];
    const TR = { x: 560, w: 190, h: 54 };
    const PL = { x: 772, y: 450, s: 218 };
    const st = { T: 0, bindT: 0, gate: -1, emph: [1, 0, 0], stage: 0 };
    const tubeCells = Array.from({ length: 30 }, (_, i) => ({
      pop: [0, 0, 0, 1, 1, 2, 2][i % 7],
      x: hash(i, 1.3),
      y: hash(i, 2.7),
      ph: hash(i, 3.9) * TAU,
      r: 9 + hash(i, 4.1) * 5,
      bind: hash(i, 5.3),
    }));
    const antibodies = Array.from({ length: 22 }, (_, i) => ({ x: hash(i, 7.7), y: hash(i, 8.3), ph: hash(i, 9.1) * TAU, pop: i % 2 }));

    const pCross = 0.85 + ((LY - NOZ.neck) / (NOZ.bot - NOZ.neck)) * 1.6;
    function streamPos(p, k) {
      if (p < 0.85) {
        const q = p / 0.85;
        return { x: NOZ.x + (hash(k, 2.2) - 0.5) * NOZ.wTop * 1.2 * (1 - q) * (1 - q), y: lerp(NOZ.top + 16, NOZ.neck, q) };
      }
      return { x: NOZ.x, y: lerp(NOZ.neck, NOZ.bot, (p - 0.85) / 1.6) };
    }

    function drawCell(x, y, r, pop, bound, a, flash) {
      ctx.strokeStyle = rgba(C.ice, 0.6 * a);
      ctx.lineWidth = B.lw(1.1);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.stroke();
      dot(x + r * 0.15, y - r * 0.1, r * 0.38, C.ice, 0.3 * a);
      if (pop < 2 && bound > 0) {
        const col = pops()[pop];
        for (let m = 0; m < 6; m += 1) {
          const an = (m / 6) * TAU + pop;
          const bx = x + Math.cos(an) * r;
          const by = y + Math.sin(an) * r;
          if (m / 6 < bound) {
            ctx.strokeStyle = rgba(col, 0.85 * a);
            ctx.lineWidth = B.lw(1.2);
            ctx.beginPath();
            ctx.moveTo(bx, by);
            ctx.lineTo(bx + Math.cos(an) * 5, by + Math.sin(an) * 5);
            ctx.stroke();
            dot(bx + Math.cos(an) * 6, by + Math.sin(an) * 6, 2, col, (0.7 + flash) * a);
          }
        }
        if (flash > 0.02) glow(x, y, r * 3.4, col, flash * 0.85 * a);
      } else if (flash > 0.02) glow(x, y, r * 2.2, C.ice, flash * 0.35 * a);
    }

    function drawY(x, y, an, col, a) {
      const c = Math.cos(an);
      const s = Math.sin(an);
      const P = (u, v) => [x + u * c - v * s, y + u * s + v * c];
      ctx.strokeStyle = rgba(col, a);
      ctx.lineWidth = B.lw(1.4);
      ctx.beginPath();
      let p = P(0, 6);
      ctx.moveTo(p[0], p[1]);
      p = P(0, 0);
      ctx.lineTo(p[0], p[1]);
      p = P(-4, -5);
      ctx.lineTo(p[0], p[1]);
      p = P(0, 0);
      ctx.moveTo(p[0], p[1]);
      p = P(4, -5);
      ctx.lineTo(p[0], p[1]);
      ctx.stroke();
      p = P(0, 7);
      dot(p[0], p[1], 1.8, col, a);
    }

    function drawTube(a) {
      const { x, y, w, h } = TUBE;
      B.box(x, y, w, h, 26, rgba(C.ice, 0.035 * a), rgba(C.ice, 0.42 * a), 1.2);
      B.box(x - 8, y - 16, w + 16, 22, 6, rgba(C.steel, 0.4 * a), null);
      const bound = clamp(st.bindT * 0.16, 0, 1);
      tubeCells.forEach((c) => {
        const cx = x + 22 + c.x * (w - 44) + Math.sin(st.T * 0.5 + c.ph) * 6;
        const cy = y + 30 + c.y * (h - 60) + Math.cos(st.T * 0.4 + c.ph) * 8;
        drawCell(cx, cy, c.r, c.pop, clamp((bound - c.bind * 0.6) / 0.4, 0, 1), a, 0);
      });
      antibodies.forEach((b) => {
        const ax = x + 14 + b.x * (w - 28) + Math.sin(st.T * 0.8 + b.ph) * 10;
        const ay = y + 20 + b.y * (h - 40) + Math.cos(st.T * 0.7 + b.ph) * 10;
        drawY(ax, ay, st.T * 0.6 + b.ph, pops()[b.pop], 0.75 * a * (1 - bound * 0.85));
      });
      B.text("Sample", x + w / 2, y + h + 24, 0.7 * a, { align: "center" });
      ctx.strokeStyle = rgba(C.ice, 0.22 * a);
      ctx.lineWidth = B.lw(1);
      ctx.beginPath();
      ctx.moveTo(x + w / 2, y - 16);
      ctx.bezierCurveTo(x + w / 2, 30, NOZ.x, 20, NOZ.x, NOZ.top);
      ctx.stroke();
    }

    function drawNozzle(a, flashTot) {
      ctx.strokeStyle = rgba(C.ice, 0.42 * a);
      ctx.lineWidth = B.lw(1.2);
      [-1, 1].forEach((s) => {
        ctx.beginPath();
        ctx.moveTo(NOZ.x + s * NOZ.wTop, NOZ.top);
        ctx.bezierCurveTo(NOZ.x + s * NOZ.wTop, NOZ.neck - 70, NOZ.x + s * NOZ.wCh, NOZ.neck - 50, NOZ.x + s * NOZ.wCh, NOZ.neck);
        ctx.lineTo(NOZ.x + s * NOZ.wCh, NOZ.bot);
        ctx.stroke();
      });
      for (let m = 0; m < 16; m += 1) {
        const side = m % 2 ? 1 : -1;
        const ph = (st.T * 0.5 + m / 16) % 1;
        const yy = lerp(NOZ.top + 10, NOZ.bot, ph);
        const off = yy < NOZ.neck ? lerp(NOZ.wTop * 0.8, NOZ.wCh * 0.6, sm((yy - NOZ.top) / (NOZ.neck - NOZ.top))) : NOZ.wCh * 0.6;
        dot(NOZ.x + side * off, yy, 1.2, C.blue, 0.35 * a);
      }
      B.text("Sheath fluid", NOZ.x + NOZ.wTop + 10, NOZ.top + 30, 0.55 * a);
      const lx0 = 250;
      const g = ctx.createLinearGradient(lx0, 0, NOZ.x, 0);
      g.addColorStop(0, rgba(C.violet, 0.15 * a));
      g.addColorStop(1, rgba(C.violet, (0.65 + flashTot * 0.35) * a));
      ctx.strokeStyle = g;
      ctx.lineWidth = B.lw(2.4);
      ctx.beginPath();
      ctx.moveTo(lx0, LY);
      ctx.lineTo(NOZ.x, LY);
      ctx.stroke();
      B.box(lx0 - 34, LY - 14, 34, 28, 4, rgba(C.steel, 0.45 * a), rgba(C.ice, 0.3 * a));
      B.text("Laser", lx0 - 17, LY + 30, 0.7 * a, { align: "center", col: C.violet });
      glow(NOZ.x, LY, 26 + flashTot * 30, C.violet, (0.25 + flashTot * 0.6) * a);
    }

    function drawDetectors(a, cross) {
      DET.forEach((d) => {
        const dx = TR.x - 46;
        B.box(dx, d.y - 16, 26, 32, 4, rgba(C.steel, 0.35 * a), rgba(C.ice, 0.35 * a));
        B.text(d.label, dx + 13, d.y - 26, 0.6 * a, { align: "center" });
        if (cross) {
          const col = d.key === "fl" ? (cross.pop < 2 ? pops()[cross.pop] : C.ice) : C.ice;
          const hgt = d.key === "fl" ? cross.fl : d.key === "fsc" ? cross.fsc : cross.ssc;
          ctx.strokeStyle = rgba(col, 0.5 * cross.k * hgt * a);
          ctx.lineWidth = B.lw(1.4);
          ctx.beginPath();
          ctx.moveTo(NOZ.x, LY);
          ctx.lineTo(dx, d.y);
          ctx.stroke();
        }
      });
    }

    function drawTraces(a) {
      const span = 2.2;
      const kNow = Math.floor(st.T * RATE);
      DET.forEach((d) => {
        const y0 = d.y + TR.h / 2 - 6;
        B.axes(TR.x, y0, TR.w, TR.h, a * 0.8);
        ctx.lineWidth = B.lw(1.4);
        ctx.strokeStyle = rgba(d.key === "fl" ? C.violet : C.cyan, 0.85 * a);
        ctx.beginPath();
        for (let px = 0; px <= 90; px += 1) {
          const u = px / 90;
          const tau = st.T - (1 - u) * span;
          let v = 0;
          for (let k = kNow - 6; k <= kNow + 1; k += 1) {
            const tc = (k + pCross) / RATE;
            const sgl = F.signals(k);
            const hgt = sgl[d.key];
            v += hgt * Math.exp(-((tau - tc) ** 2) / (2 * 0.035 * 0.035));
          }
          const yy = y0 - clamp(v, 0, 1) * (TR.h - 6);
          px ? ctx.lineTo(TR.x + u * TR.w, yy) : ctx.moveTo(TR.x + u * TR.w, yy);
        }
        ctx.stroke();
      });
      B.text("Time →", TR.x + TR.w, DET[2].y + TR.h / 2 + 8, 0.5 * a, { align: "right" });
    }

    function drawPlot(a) {
      const { x, y, s } = PL;
      B.axes(x, y, s, s, a);
      B.text("Marker A →", x + s, y + 18, 0.6 * a, { align: "right" });
      B.text("Marker B ↑", x, y - s - 14, 0.6 * a);
      const n = Math.floor(st.T * EVENTS);
      const from = Math.max(0, n - 700);
      const cols = pops();
      for (let k = from; k < n; k += 1) {
        const c = F.cell(k);
        ctx.fillStyle = rgba(cols[c.pop], (k > n - 6 ? 1 : 0.6) * a);
        ctx.fillRect(x + c.x * s - 1.3, y - c.y * s - 1.3, 2.6, 2.6);
      }
      B.text(`${n.toLocaleString()} cells`, x + s, y - s - 14, 0.55 * a, { align: "right" });
      if (st.gate >= 0) {
        const P = F.populations[st.gate];
        const gx = x + P.fl[0] * s;
        const gy = y - P.fl[1] * s;
        ctx.setLineDash([B.lw(4), B.lw(4)]);
        ctx.strokeStyle = rgba(cols[st.gate], 0.95 * a);
        ctx.lineWidth = B.lw(1.6);
        ctx.beginPath();
        ctx.ellipse(gx, gy, s * 0.14, s * 0.14, 0, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
        const pct = Math.round(F.share(st.gate, Math.max(1, Math.min(n, 3000))) * 100);
        const name = st.gate === 2 ? "Unlabelled" : `Population ${P.id}`;
        B.text(`${name} · ${pct}%`, gx, gy - s * 0.14 - 14, a, { align: "center", col: cols[st.gate], size: 12, weight: 600 });
      } else if (st.stage === 2) {
        const pulse = 0.5 + 0.5 * Math.sin(st.T * 3);
        const P = F.populations[0];
        ctx.strokeStyle = rgba(C.cyan, (0.2 + pulse * 0.4) * a);
        ctx.lineWidth = B.lw(1.2);
        ctx.beginPath();
        ctx.arc(x + P.fl[0] * s, y - P.fl[1] * s, s * (0.12 + pulse * 0.03), 0, TAU);
        ctx.stroke();
      }
    }

    const sm = (v) => (v <= 0 ? 0 : v >= 1 ? 1 : v * v * (3 - 2 * v));

    return {
      setStage(i) {
        st.stage = i;
        if (i === 0) st.bindT = 0;
      },
      gate(i) {
        st.gate = i;
      },
      get gated() {
        return st.gate;
      },
      draw(dt, R, a) {
        st.T += dt * (K.reduce ? 0.35 : 1);
        st.bindT += dt;
        st.emph = B.fade(st.emph, st.stage, dt);
        B.fit(R);
        B.begin();
        ctx.globalCompositeOperation = "lighter";
        const e = st.emph.map((v) => 0.4 + 0.6 * v);
        drawTube(a * e[0]);
        const kNow = Math.floor(st.T * RATE);
        let cross = null;
        let flashTot = 0;
        for (let k = kNow - 5; k <= kNow; k += 1) {
          const p = st.T * RATE - k;
          if (p < 0 || p > 2.45) continue;
          const pos = streamPos(p, k);
          const near = Math.max(0, 1 - Math.abs(pos.y - LY) / 16);
          const sgl = F.signals(k);
          if (near > flashTot) {
            flashTot = near;
            cross = { ...sgl, k: near };
          }
          drawCell(pos.x, pos.y, 8 + F.populations[sgl.pop].fsc * 6, sgl.pop, 1, a * e[1], near);
        }
        drawNozzle(a * e[1], flashTot);
        drawDetectors(a * e[1], cross);
        drawTraces(a * e[1]);
        drawPlot(a * e[2]);
        B.end();
      },
      click(x, y) {
        const p = B.local(x, y);
        if (p.x >= PL.x - 20 && p.x <= PL.x + PL.s + 20 && p.y >= PL.y - PL.s - 20 && p.y <= PL.y + 20) {
          const fx = (p.x - PL.x) / PL.s;
          const fy = (PL.y - p.y) / PL.s;
          let best = 0;
          let bd = 9;
          F.populations.forEach((P, i) => {
            const d = Math.hypot(P.fl[0] - fx, P.fl[1] - fy);
            if (d < bd) {
              bd = d;
              best = i;
            }
          });
          st.gate = best;
          return 2;
        }
        if (p.x >= TUBE.x - 10 && p.x <= TUBE.x + TUBE.w + 10 && p.y >= TUBE.y - 20 && p.y <= TUBE.y + TUBE.h + 20) return 0;
        if (p.x >= 240 && p.x <= TR.x + TR.w && p.y >= NOZ.top && p.y <= NOZ.bot) return 1;
        return -1;
      },
      hit(x, y) {
        const p = B.local(x, y);
        return p.x >= TUBE.x - 10 && p.x <= PL.x + PL.s + 20 && p.y >= NOZ.top - 10 && p.y <= NOZ.bot;
      },
      controls(i) {
        if (i !== 2) return "";
        return `<div class="wm-uni-chips" role="group" aria-label="Gate a population">${["Population A", "Population B", "Unlabelled"]
          .map((n, g) => `<button type="button" data-gate="${g}" aria-pressed="${st.gate === g}">${n}</button>`)
          .join("")}</div>`;
      },
      wire(el, refresh) {
        el.querySelectorAll("[data-gate]").forEach((b) =>
          b.addEventListener("click", () => {
            st.gate = Number(b.dataset.gate);
            refresh();
          })
        );
      },
    };
  }

  /* ---------- Advanced Diagnostics: culture → identify → treat ---------- */

  function diagnostics(K) {
    const { ctx, C, rgba, glow, dot, clamp, TAU } = K;
    const B = base(K);
    const ID = SIM.identify;
    const AST = SIM.susceptibility;
    const st = { T: 0, stage: 0, emph: [1, 0, 0], since: 0, row: 0, picked: false };
    const bestRef = ID.best();

    function bottle(x, y, s, a, glowK) {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(s, s);
      B.box(-34, -40, 68, 110, 14, rgba(C.mint, 0.1 * a), rgba(C.ice, 0.42 * a));
      B.box(-14, -62, 28, 22, 3, rgba(C.steel, 0.5 * a), null);
      for (let m = 0; m < 18; m += 1) {
        const bx = -24 + hash(m, 3.3) * 48;
        const by = -20 + hash(m, 6.1) * 80;
        const an = m + st.T * 0.3;
        ctx.strokeStyle = rgba(C.mint, 0.8 * a);
        ctx.lineWidth = B.lw(1.6) / s;
        ctx.beginPath();
        ctx.moveTo(bx - Math.cos(an) * 3, by - Math.sin(an) * 3);
        ctx.lineTo(bx + Math.cos(an) * 3, by + Math.sin(an) * 3);
        ctx.stroke();
      }
      ctx.restore();
      glow(x, y + 62 * s, 40 * s, C.mint, glowK * 0.6 * a);
    }

    function drawCulture(a) {
      if (a < 0.02) return;
      B.end();
      ctx.save();
      const P = B.screen(300, 300, 190);
      K.worlds.culture(P, a, 1, st.T, { accent: "mint" }, 2);
      ctx.restore();
      B.begin();
    }

    function drawIdentify(a) {
      if (a < 0.02) return;
      const t = st.since;
      bottle(110, 300, 1.1, a, 1);
      const drop = clamp(t / 1.2, 0, 1);
      dot(150 + drop * 90, 260 - Math.sin(drop * Math.PI) * 60, 5, C.mint, a * (drop < 1 ? 1 : 0));
      B.box(236, 250, 40, 40, 6, rgba(C.steel, 0.35 * a), rgba(C.ice, 0.4 * a));
      glow(256, 270, 30, C.mint, clamp(t - 1.2, 0, 1) * 0.6 * a);
      const sx = 320;
      const sy = 420;
      const sw = 280;
      const shh = 220;
      B.axes(sx, sy, sw, shh, a);
      B.text("Sample fingerprint", sx, sy - shh - 16, 0.75 * a);
      const grow = clamp((t - 1.4) / 1.6, 0, 1);
      ID.sample.forEach((v, i) => {
        const bx = sx + 14 + i * (sw - 28) / 11;
        const hh = v * shh * 0.9 * clamp(grow * 12 - i, 0, 1);
        ctx.fillStyle = rgba(C.mint, 0.85 * a);
        ctx.fillRect(bx - 4, sy - hh, 8, hh);
      });
      B.text("Mass / charge →", sx + sw, sy + 18, 0.5 * a, { align: "right" });
      const lx = 650;
      const scan = clamp((t - 3.2) / 3.6, 0, 1);
      const cur = Math.min(ID.library.length - 1, Math.floor(scan * ID.library.length));
      ID.library.forEach((r, i) => {
        const ry = 150 + i * 78;
        const done = scan * ID.library.length > i + 0.6;
        const best = done && scan >= 1 && i === bestRef;
        const on = i === cur && scan < 1;
        B.box(lx, ry - 30, 320, 64, 10, rgba(best ? C.mint : C.ice, (best ? 0.12 : 0.03) * a), rgba(best ? C.mint : C.ice, (best ? 0.9 : on ? 0.5 : 0.18) * a), best ? 1.6 : 1);
        r.peaks.forEach((v, j) => {
          const bx = lx + 14 + j * 10;
          ctx.fillStyle = rgba(best ? C.mint : C.steel, 0.8 * a);
          ctx.fillRect(bx, ry + 22 - v * 40, 6, v * 40);
        });
        B.text(r.name, lx + 150, ry - 8, 0.85 * a, { size: 14, sans: true });
        if (done) {
          const sim = ID.similarity(ID.sample, r.peaks);
          B.text(`similarity ${sim.toFixed(2)}`, lx + 150, ry + 14, (best ? 1 : 0.55) * a, { col: best ? C.mint : C.ice });
        }
      });
      B.text("Reference library", lx, 96, 0.75 * a);
      if (scan >= 1) B.text(`Best match: ${ID.library[bestRef].name}`, lx, 488, a, { col: C.mint, size: 12, weight: 600 });
      if (scan > 0 && scan < 1) {
        ctx.strokeStyle = rgba(C.mint, 0.35 * a);
        ctx.lineWidth = B.lw(1);
        ctx.beginPath();
        ctx.moveTo(sx + sw, sy - shh / 2);
        ctx.lineTo(lx, 150 + cur * 78);
        ctx.stroke();
      }
      if (t > 9.5) st.since = 0;
    }

    function drawAST(a) {
      if (a < 0.02) return;
      const t = clamp(st.since / 5, 0, 1);
      const gx = 300;
      const gy = 150;
      const dx = 70;
      const dy = 92;
      B.text("Antibiotic concentration →", gx + dx * 7 + 24, gy - 64, 0.6 * a, { align: "right" });
      AST.conc.forEach((c, j) => B.text(String(c), gx + j * dx, gy - 40, 0.6 * a, { align: "center" }));
      if (!st.picked && st.since > 6) {
        st.row = (st.row + 1) % AST.drugs.length;
        st.since = 2.5;
      }
      AST.drugs.forEach((d, i) => {
        const y = gy + i * dy;
        const on = i === st.row;
        B.text(d, gx - 44, y, (on ? 1 : 0.6) * a, { align: "right", size: 11, col: on ? C.mint : C.ice });
        AST.conc.forEach((_, j) => {
          const g = AST.growth(i, j, t);
          const x = gx + j * dx;
          ctx.fillStyle = rgba(C.mint, (0.05 + g * 0.5) * a);
          ctx.strokeStyle = rgba(C.ice, (on ? 0.5 : 0.25) * a);
          ctx.lineWidth = B.lw(1);
          ctx.beginPath();
          ctx.arc(x, y, 24, 0, TAU);
          ctx.fill();
          ctx.stroke();
          for (let m = 0; m < Math.round(g * 9); m += 1) {
            const an = m * 2.3 + st.T * 0.2;
            const rx = x + Math.cos(m * 1.7) * 13;
            const ry = y + Math.sin(m * 2.9) * 13;
            ctx.strokeStyle = rgba(C.mint, 0.9 * a);
            ctx.lineWidth = B.lw(1.6);
            ctx.beginPath();
            ctx.moveTo(rx - Math.cos(an) * 3, ry - Math.sin(an) * 3);
            ctx.lineTo(rx + Math.cos(an) * 3, ry + Math.sin(an) * 3);
            ctx.stroke();
          }
        });
        const bpX = gx + AST.breakpoint[i] * dx + dx / 2;
        ctx.setLineDash([B.lw(3), B.lw(4)]);
        ctx.strokeStyle = rgba(C.violet, (on ? 0.8 : 0.35) * a);
        ctx.beginPath();
        ctx.moveTo(bpX, y - 34);
        ctx.lineTo(bpX, y + 34);
        ctx.stroke();
        ctx.setLineDash([]);
        const mic = AST.mic[i];
        if (t > 0.8 && mic < AST.conc.length) {
          ctx.strokeStyle = rgba(C.cyan, (on ? 1 : 0.5) * a);
          ctx.lineWidth = B.lw(2);
          ctx.beginPath();
          ctx.arc(gx + mic * dx, y, 30, 0, TAU);
          ctx.stroke();
        }
        if (t > 0.9) {
          const r = AST.result(i);
          const col = r === "S" ? C.mint : C.violet;
          B.box(gx + dx * 7 + 42, y - 16, 34, 32, 8, rgba(col, 0.16 * a), rgba(col, 0.8 * a));
          B.text(r, gx + dx * 7 + 59, y + 1, a, { align: "center", col, size: 14, weight: 700 });
        }
      });
      const i = st.row;
      if (t > 0.9) {
        const mic = AST.mic[i];
        const txt = mic < AST.conc.length ? `${AST.drugs[i]}: MIC ${AST.conc[mic]} · breakpoint ${AST.conc[AST.breakpoint[i]]}` : `${AST.drugs[i]}: grows at every concentration`;
        B.text(`${txt} → ${AST.result(i) === "S" ? "susceptible" : "resistant"}`, gx - 10, gy + 4 * dy - 10, a, { size: 12, weight: 600, col: AST.result(i) === "S" ? C.mint : C.violet });
      }
      B.text("MIC", gx - 44, gy + 4 * dy + 22, 0.5 * a, { align: "right", col: C.cyan });
      B.text("Breakpoint", gx + 10, gy + 4 * dy + 22, 0.5 * a, { col: C.violet });
      bottle(110, 300, 0.9, a * 0.7, 0.6);
    }

    return {
      setStage(i) {
        if (st.stage !== i) st.since = 0;
        st.stage = i;
      },
      draw(dt, R, a) {
        st.T += dt * (K.reduce ? 0.35 : 1);
        st.since += dt * (K.reduce ? 0.5 : 1);
        st.emph = B.fade(st.emph, st.stage, dt);
        B.fit(R);
        B.begin();
        ctx.globalCompositeOperation = "lighter";
        drawCulture(a * st.emph[0]);
        drawIdentify(a * st.emph[1]);
        drawAST(a * st.emph[2]);
        B.end();
      },
      click(x, y) {
        if (st.stage !== 2) return -1;
        const p = B.local(x, y);
        const i = Math.round((p.y - 150) / 92);
        if (i >= 0 && i < AST.drugs.length && p.x > 180 && p.x < 900) {
          st.row = i;
          st.picked = true;
          return 2;
        }
        return -1;
      },
      hit(x, y) {
        if (st.stage !== 2) return false;
        const p = B.local(x, y);
        return p.y > 110 && p.y < 470 && p.x > 180 && p.x < 900;
      },
      controls(i) {
        if (i !== 2) return "";
        return `<div class="wm-uni-chips" role="group" aria-label="Choose an antibiotic">${AST.drugs
          .map((d, r) => `<button type="button" data-row="${r}" aria-pressed="${st.picked && st.row === r}">${d}</button>`)
          .join("")}</div>`;
      },
      wire(el, refresh) {
        el.querySelectorAll("[data-row]").forEach((b) =>
          b.addEventListener("click", () => {
            st.row = Number(b.dataset.row);
            st.picked = true;
            refresh();
          })
        );
      },
    };
  }

  /* ---------- Materials Sciences: heat → flow → weigh ---------- */

  function materials(K) {
    const { ctx, C, rgba, glow, dot, lerp, clamp } = K;
    const B = base(K);
    const RH = SIM.rheology;
    const TG = SIM.tga;
    const st = { T: 0, stage: 0, emph: [1, 0, 0], liquid: 0.5, since: 0 };

    function drawHeat(a) {
      if (a < 0.02) return;
      B.end();
      ctx.save();
      K.worlds.lattice(B.screen(340, 300, 210), a, 1, st.T, { accent: "blue" }, 3);
      ctx.restore();
      B.begin();
    }

    function drawFlow(a) {
      if (a < 0.02) return;
      const x0 = 150;
      const x1 = 520;
      const yb = 430;
      const yt = 250;
      const amp = 60;
      const t = st.T;
      const d = RH.strain(t) * amp;
      B.box(x0 - 30, yb, x1 - x0 + 60, 18, 4, rgba(C.steel, 0.5 * a), rgba(C.ice, 0.3 * a));
      B.box(x0 - 30 + d, yt - 18, x1 - x0 + 60, 18, 4, rgba(C.blue, 0.4 * a), rgba(C.ice, 0.4 * a));
      ctx.strokeStyle = rgba(C.ice, 0.25 * a);
      ctx.lineWidth = B.lw(1);
      ctx.beginPath();
      ctx.moveTo((x0 + x1) / 2 + d, yt - 18);
      ctx.lineTo((x0 + x1) / 2 + d, yt - 70);
      ctx.stroke();
      B.text("Moving plate", (x0 + x1) / 2 + d, yt - 84, 0.6 * a, { align: "center" });
      B.text("Fixed plate", (x0 + x1) / 2, yb + 38, 0.6 * a, { align: "center" });
      const lag = RH.phase(st.liquid) / RH.omega;
      for (let i = 0; i < 10; i += 1) {
        const lx = x0 + (i / 9) * (x1 - x0);
        ctx.strokeStyle = rgba(C.blue, 0.75 * a);
        ctx.lineWidth = B.lw(1.6);
        ctx.beginPath();
        for (let s = 0; s <= 20; s += 1) {
          const h = s / 20;
          const solid = RH.strain(t) * amp * h;
          const fluid = RH.strain(t - lag * (1 - h) * 1.2) * amp * Math.pow(h, 0.7);
          const xx = lx + lerp(solid, fluid, st.liquid);
          const yy = lerp(yb, yt, h);
          s ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy);
        }
        ctx.stroke();
      }
      for (let m = 0; m < 26; m += 1) {
        const h = hash(m, 4.4);
        const lx = x0 + hash(m, 2.9) * (x1 - x0);
        dot(lx + RH.strain(t - lag * (1 - h) * st.liquid) * amp * h, lerp(yb, yt, h), 2, C.ice, 0.4 * a);
      }
      const px = 600;
      const py = 400;
      const pw = 360;
      const ph = 180;
      B.axes(px, py, pw, ph, a);
      ctx.strokeStyle = rgba(C.ice, 0.15 * a);
      ctx.beginPath();
      ctx.moveTo(px, py - ph / 2);
      ctx.lineTo(px + pw, py - ph / 2);
      ctx.stroke();
      const win = 4.2;
      B.curve(px, py - ph / 2, pw, ph / 2.4, (u) => RH.strain(t - win + u * win), 1, C.ice, 0.8 * a, 1.6, -1.08);
      B.curve(px, py - ph / 2, pw, ph / 2.4, (u) => RH.stress(t - win + u * win, st.liquid), 1, C.violet, 0.95 * a, 2, -1.08);
      B.text("Strain (deformation)", px, py - ph - 16, 0.7 * a, { col: C.ice });
      B.text("Stress (force needed)", px + 200, py - ph - 16, 0.9 * a, { col: C.violet });
      B.text("Time →", px + pw, py + 18, 0.5 * a, { align: "right" });
      const deg = Math.round((RH.phase(st.liquid) * 180) / Math.PI);
      const kind = st.liquid < 0.25 ? "Solid-like" : st.liquid > 0.75 ? "Liquid-like" : "Viscoelastic";
      B.text(`Phase lag δ = ${deg}° · ${kind}`, px, py + 46, a, { size: 13, weight: 600, col: C.blue });
    }

    function drawWeigh(a) {
      if (a < 0.02) return;
      const T = clamp((st.since % 12) / 10, 0, 1);
      const m = TG.mass(T);
      const fx = 150;
      const fy = 210;
      const fw = 300;
      const fh = 240;
      const hot = [lerp(C.blue[0], 255, T * 0.6), lerp(C.blue[1], 150, T * 0.6), lerp(C.blue[2], 120, T * 0.6)];
      B.box(fx, fy, fw, fh, 18, rgba(hot, 0.06 + 0.1 * T), rgba(hot, 0.5 * a), 1.4);
      glow(fx + fw / 2, fy + fh / 2, 160, hot, (0.08 + 0.25 * T) * a);
      B.text("Furnace", fx + 16, fy + 20, 0.6 * a);
      B.text(`${Math.round(25 + T * 775)} °C`, fx + fw - 16, fy + 20, 0.8 * a, { align: "right", col: hot });
      ctx.strokeStyle = rgba(C.ice, 0.5 * a);
      ctx.lineWidth = B.lw(1.2);
      ctx.beginPath();
      ctx.moveTo(fx + fw / 2, 120);
      ctx.lineTo(fx + fw / 2, fy + 120);
      ctx.moveTo(fx + fw / 2 - 120, 120);
      ctx.lineTo(fx + fw / 2 + 120, 120);
      ctx.stroke();
      B.text("Balance", fx + fw / 2 + 126, 120, 0.6 * a);
      ctx.beginPath();
      ctx.moveTo(fx + fw / 2 - 50, fy + 150);
      ctx.lineTo(fx + fw / 2 + 50, fy + 150);
      ctx.stroke();
      const sw = 70 * Math.sqrt(m);
      const sh = 40 * Math.sqrt(m);
      B.box(fx + fw / 2 - sw / 2, fy + 150 - sh, sw, sh, 4, rgba(C.blue, 0.5 * a), rgba(C.ice, 0.4 * a));
      const rate = TG.rate(T);
      for (let k = 0; k < 24; k += 1) {
        const ph = (st.T * 0.6 + k / 24) % 1;
        dot(fx + fw / 2 + (hash(k, 3.1) - 0.5) * sw * 1.2 + Math.sin(st.T + k) * 6, fy + 150 - sh - ph * 110, 1.8, hot, clamp(rate * 0.12, 0, 0.8) * (1 - ph) * a);
      }
      const px = 560;
      const py = 440;
      const pw = 390;
      const ph = 280;
      B.axes(px, py, pw, ph, a);
      B.curve(px, py, pw, ph, (u) => TG.mass(u), 1, C.ice, 0.22 * a, 1);
      B.curve(px, py, pw, ph, (u) => TG.mass(u), T, C.blue, a, 2);
      glow(px + T * pw, py - m * ph, 10, C.blue, 0.8 * a);
      B.text("Mass", px, py - ph - 16, 0.7 * a);
      B.text("Temperature →", px + pw, py + 18, 0.5 * a, { align: "right" });
      B.text(`${Math.round(m * 100)}% of the starting mass`, px, py + 46, a, { size: 13, weight: 600, col: C.blue });
      TG.steps.forEach((s, i) => {
        if (T > s.at + s.width * 2) B.text(i ? "Decomposition" : "Moisture", px + s.at * pw + 8, py - TG.mass(s.at) * ph - 16, 0.7 * a);
      });
    }

    return {
      setStage(i) {
        if (st.stage !== i) st.since = 0;
        st.stage = i;
      },
      draw(dt, R, a) {
        st.T += dt * (K.reduce ? 0.35 : 1);
        st.since += dt * (K.reduce ? 0.5 : 1);
        st.emph = B.fade(st.emph, st.stage, dt);
        B.fit(R);
        B.begin();
        ctx.globalCompositeOperation = "lighter";
        drawHeat(a * st.emph[0]);
        drawFlow(a * st.emph[1]);
        drawWeigh(a * st.emph[2]);
        B.end();
      },
      click() {
        return -1;
      },
      hit() {
        return false;
      },
      controls(i) {
        if (i !== 1) return "";
        return `<label class="wm-uni-slider"><span>Solid-like</span>
          <input type="range" min="0" max="100" value="${Math.round(st.liquid * 100)}" aria-label="From solid-like to liquid-like" />
          <span>Liquid-like</span></label>`;
      },
      wire(el) {
        el.querySelector(".wm-uni-slider input")?.addEventListener("input", (e) => (st.liquid = Number(e.target.value) / 100));
      },
    };
  }

  global.WatersAreas = { biosciences, diagnostics, materials };
})(window);
