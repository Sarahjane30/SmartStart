/* Waters // Chapter 03 — the Technology landing screen.
   Four large exploration panels, one per scientific area, each with its own live scene drawn
   on the machine's canvas from WatersSim. Choosing a panel expands its scene to the full
   screen and opens that area; Analytical Sciences leads into the existing LC/MS journeys,
   the other areas show an in-progress shell until their experiences are built. The panels
   and every control are DOM buttons, so the screen is keyboard and screen-reader operable;
   a text version lives in the chapter panel. */
(function (global) {
  "use strict";

  const SIM = global.WatersSim;

  function create(kit) {
    const { ctx, C, rgba, glow, dot, lerp, clamp, ease, TAU, reduce, S, esc, root } = kit;
    const sm = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
    const MONO = '"IBM Plex Mono", ui-monospace, monospace';
    const pad = (n) => String(n).padStart(2, "0");

    const U = {
      k: 0,
      t: 0,
      n: 0,
      index: "03",
      chapter: "",
      areas: [],
      divisions: [],
      legend: {},
      open: -1,
      shown: -1,
      x: 0,
      from: null,
      hover: -1,
      wake: [0, 0, 0, 0],
      lbl: true,
    };

    const box = document.createElement("div");
    box.className = "wm-uni";
    box.hidden = true;
    box.setAttribute("aria-label", "Explore the science");
    root.appendChild(box);
    let tiles = [];

    function setData(tech, divisions) {
      const u = tech?.universe;
      U.areas = u ? u.areas : [];
      U.n = U.areas.length;
      U.divisions = divisions || [];
      U.legend = u ? u.legend : {};
      if (!u) return;
      U.index = tech.index;
      U.chapter = tech.label;
      box.innerHTML = `
        <header class="wm-uni-head">
          <p class="wm-uni-kick">${esc(tech.index)} · ${esc(tech.label)}</p>
          <h2>${esc(u.title)}</h2>
          <p>${esc(u.intro)}</p>
        </header>
        <div class="wm-uni-grid">${U.areas
          .map((a, i) => {
            const live = a.experience === "available";
            return `<button type="button" class="wm-uni-tile" data-i="${i}" style="--c:${rgba(C[a.accent], 1)}">
              <span class="wm-uni-idx">${pad(i + 1)}${live ? "" : ` <em>· In progress</em>`}</span>
              <strong>${esc(a.division)}</strong>
              <span class="wm-uni-sub">${esc(a.subtitle)}</span>
              <span class="wm-uni-cta">Explore <i aria-hidden="true">→</i></span>
            </button>`;
          })
          .join("")}</div>
        <p class="wm-uni-legend"><i></i>${esc(U.legend.short || U.legend.simulation)}</p>
        <button type="button" class="wm-uni-text">Text version</button>
        <section class="wm-uni-area" hidden></section>`;
      tiles = [...box.querySelectorAll(".wm-uni-tile")];
      tiles.forEach((b, i) => {
        b.addEventListener("mouseenter", () => (U.hover = i));
        b.addEventListener("focus", () => (U.hover = i));
        b.addEventListener("mouseleave", () => U.hover === i && (U.hover = -1));
        b.addEventListener("blur", () => U.hover === i && (U.hover = -1));
        b.addEventListener("click", () => openArea(i));
      });
      box.querySelector(".wm-uni-text").addEventListener("click", () => kit.onText());
      if (U.open >= 0) {
        box.classList.add("is-area");
        renderArea(U.open);
        box.querySelector(".wm-uni-area").hidden = false;
      }
    }

    const area = (i) => U.areas[i];
    const divisionOf = (a) => U.divisions.find((d) => d.name === a.division) || {};

    function relRect(el) {
      const r = el.getBoundingClientRect();
      const q = root.getBoundingClientRect();
      return { x: r.left - q.left, y: r.top - q.top, w: r.width, h: r.height };
    }

    function renderArea(i) {
      const a = area(i);
      const d = divisionOf(a);
      const live = a.experience === "available";
      const sec = box.querySelector(".wm-uni-area");
      sec.style.setProperty("--c", rgba(C[a.accent], 1));
      sec.setAttribute("aria-label", a.division);
      sec.innerHTML = `
        <nav class="wm-uni-crumb" aria-label="Technology areas">
          <button type="button" class="wm-uni-back">← All four areas</button>
          <span>${esc(U.index)} ${esc(U.chapter)} <i>/</i> ${esc(a.division)}</span>
        </nav>
        <div class="wm-uni-copy">
          <p class="wm-uni-kick">${pad(i + 1)} · ${esc(a.subtitle)}</p>
          <h2 tabindex="-1">${esc(a.division)}</h2>
          <p class="wm-uni-tag">${esc(a.tagline)}</p>
          <p>${esc(d.simple || a.teaser)}</p>
          ${
            live
              ? `<p class="wm-uni-label">Choose a journey</p><div class="wm-uni-journeys">${a.journeys
                  .map(
                    (j, n) => `<button type="button" class="wm-uni-journey" data-j="${n}"><strong>${esc(j.label)}</strong><span>${esc(j.what)}</span><em aria-hidden="true">→</em></button>`
                  )
                  .join("")}</div>`
              : `<p class="wm-uni-status"><i></i>Full interactive experience in progress</p>
                 <p class="wm-uni-next"><span>Coming next</span>${esc(a.coming)}</p>
                 ${a.note ? `<p class="wm-uni-note">${esc(a.note)}</p>` : ""}
                 <button type="button" class="wm-uni-read">Read about ${esc(a.division)} as text</button>`
          }
        </div>`;
      sec.querySelectorAll("[data-j]").forEach((b) =>
        b.addEventListener("click", () => {
          const j = a.journeys[Number(b.dataset.j)];
          kit.onJourney(j.track, j.kind);
        })
      );
      sec.querySelector(".wm-uni-read")?.addEventListener("click", () => kit.onText());
      sec.querySelector(".wm-uni-back").addEventListener("click", () => closeArea());
    }

    function openArea(i) {
      if (U.open >= 0 || !tiles[i]) return;
      U.from = relRect(tiles[i]);
      U.open = i;
      U.shown = i;
      U.hover = -1;
      renderArea(i);
      box.classList.add("is-area");
      const sec = box.querySelector(".wm-uni-area");
      sec.hidden = false;
      setTimeout(() => sec.querySelector("h2")?.focus({ preventScroll: true }), reduce ? 0 : 420);
    }

    function closeArea(instant) {
      if (U.open < 0) return;
      const i = U.open;
      U.open = -1;
      if (instant) {
        U.x = 0;
        U.shown = -1;
      }
      box.classList.remove("is-area");
      box.querySelector(".wm-uni-area").hidden = true;
      if (!instant) tiles[i]?.focus({ preventScroll: true });
    }

    /* ---------- layout ---------- */

    function sceneIn(r) {
      if (r.w / r.h > 1.5) {
        const u = Math.min(r.h * 0.3, r.w * 0.12);
        return { x: r.x + r.w * 0.66, y: r.y + r.h * 0.5, u };
      }
      const u = Math.min(r.w * 0.3, r.h * 0.18);
      return { x: r.x + r.w * 0.34, y: r.y + r.h * 0.36, u };
    }

    function sceneFull() {
      if (S.narrow) return { x: S.w * 0.4, y: S.h * 0.26, u: Math.min(S.w * 0.2, S.h * 0.1) };
      return { x: S.w * 0.64, y: S.h * 0.52, u: Math.min(S.h * 0.22, S.w * 0.12) };
    }

    const mixRect = (a, b, k) => ({ x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), w: lerp(a.w, b.w, k), h: lerp(a.h, b.h, k) });
    const mixP = (a, b, k) => ({ x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), u: lerp(a.u, b.u, k) });

    /* ---------- the four worlds ---------- */

    function label(text, x, y, a, o = {}) {
      if (a <= 0.02 || !U.lbl) return;
      ctx.globalCompositeOperation = "source-over";
      ctx.font = `500 ${o.size || 9}px ${MONO}`;
      ctx.textAlign = o.align || "left";
      ctx.textBaseline = "middle";
      ctx.fillStyle = rgba(o.col || C.ice, a);
      if ("letterSpacing" in ctx) ctx.letterSpacing = "1.5px";
      ctx.fillText(text.toUpperCase(), x, y);
      if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
      ctx.globalCompositeOperation = "lighter";
    }

    function miniChart(x, y, w, h, a, col, f, head, o = {}) {
      ctx.strokeStyle = rgba(C.ice, 0.22 * a);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y - h);
      ctx.lineTo(x, y);
      ctx.lineTo(x + w, y);
      ctx.stroke();
      if (o.thr != null) {
        ctx.setLineDash([3, 4]);
        ctx.strokeStyle = rgba(C.violet, 0.5 * a);
        ctx.beginPath();
        ctx.moveTo(x, y - o.thr * h);
        ctx.lineTo(x + w, y - o.thr * h);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (o.ghost) {
        ctx.strokeStyle = rgba(C.ice, 0.18 * a);
        ctx.beginPath();
        for (let k = 0; k <= 60; k += 1) {
          const u = k / 60;
          const yy = y - o.ghost(u) * h;
          k ? ctx.lineTo(x + u * w, yy) : ctx.moveTo(x + u * w, yy);
        }
        ctx.stroke();
      }
      ctx.strokeStyle = rgba(col, 0.9 * a);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      const N = Math.max(2, Math.round(90 * head));
      for (let k = 0; k <= N; k += 1) {
        const u = (k / N) * head;
        const yy = y - clamp(f(u), 0, 1.05) * h;
        k ? ctx.lineTo(x + u * w, yy) : ctx.moveTo(x + u * w, yy);
      }
      ctx.stroke();
      glow(x + head * w, y - clamp(f(head), 0, 1.05) * h, 8, col, 0.7 * a);
    }

    function drawColumn(P, a, e, t, A) {
      const { x, y, u } = P;
      const col = C[A.accent];
      const top = y - u * 1.05;
      const bot = y + u * 1.05;
      const w = u * 0.34;
      const g = ctx.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
      g.addColorStop(0, rgba(C.ice, 0.1 * a));
      g.addColorStop(0.5, rgba(col, 0.05 * a));
      g.addColorStop(1, rgba(C.ice, 0.14 * a));
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = g;
      ctx.fillRect(x - w / 2, top, w, bot - top);
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = rgba(C.ice, 0.4 * a);
      ctx.lineWidth = 1;
      ctx.strokeRect(x - w / 2, top, w, bot - top);
      [top, bot].forEach((yy) => {
        ctx.fillStyle = rgba(C.steel, 0.5 * a);
        ctx.fillRect(x - w * 0.62, yy - u * 0.05, w * 1.24, u * 0.1);
      });
      ctx.strokeStyle = rgba(C.ice, 0.25 * a);
      ctx.beginPath();
      ctx.moveTo(x, top - u * 0.05);
      ctx.lineTo(x, top - u * 0.32);
      ctx.moveTo(x, bot + u * 0.05);
      ctx.lineTo(x, bot + u * 0.28);
      ctx.stroke();
      const run = SIM.lc.run;
      const T = (t * 0.11) % (run + 0.25);
      const comps = [C.cyan, C.violet, C.mint];
      ctx.save();
      ctx.beginPath();
      ctx.rect(x - w / 2, top, w, bot - top);
      ctx.clip();
      SIM.lc.speeds.forEach((_, i) => {
        const b = SIM.lc.band(i, T);
        if (b.eluted) return;
        const yy = top + b.pos * (bot - top);
        const hh = b.width * (bot - top);
        const lg = ctx.createLinearGradient(0, yy - hh, 0, yy + hh);
        lg.addColorStop(0, rgba(comps[i], 0));
        lg.addColorStop(0.5, rgba(comps[i], (0.45 + 0.4 * e) * a));
        lg.addColorStop(1, rgba(comps[i], 0));
        ctx.fillStyle = lg;
        ctx.fillRect(x - w / 2, yy - hh, w, hh * 2);
      });
      ctx.restore();
      SIM.lc.speeds.forEach((_, i) => {
        const tr = SIM.lc.retention(i);
        const k = 1 - clamp(Math.abs(T - tr) / 0.05, 0, 1);
        if (k > 0) glow(x, bot + u * 0.3, u * 0.22, comps[i], k * 0.9 * a);
      });
      for (let k = 0; k < 14; k += 1) {
        const ph = (t * 0.25 + k / 14) % 1;
        dot(x + Math.sin(k * 3.1 + t) * w * 0.3, top - u * 0.32 + ph * u * 0.27, 1.1, C.ice, 0.4 * a * (1 - ph));
      }
      if (e > 0.02) {
        const cw = u * 1.15;
        const ch = u * 0.7;
        const cx = x + u * 0.55;
        const cy = y + u * 0.55;
        const sig = (s) => SIM.lc.signal(s * run) / 1.3;
        miniChart(cx, cy, cw, ch, a * e, col, sig, clamp(T / run, 0, 1));
        label("Detector signal", cx, cy - ch - 10, 0.6 * a * e);
        label("Time →", cx + cw, cy + 12, 0.5 * a * e, { align: "right" });
        label("Column", x - w / 2 - 8, top + u * 0.2, 0.55 * a * e, { align: "right" });
      }
    }

    function drawFlow(P, a, e, t, A) {
      const { x, y, u } = P;
      const col = C[A.accent];
      const top = y - u * 1.1;
      const neck = y - u * 0.45;
      const bot = y + u * 1.05;
      const wTop = u * 0.55;
      const wCh = u * 0.09;
      ctx.strokeStyle = rgba(C.ice, 0.35 * a);
      ctx.lineWidth = 1;
      [-1, 1].forEach((s) => {
        ctx.beginPath();
        ctx.moveTo(x + s * wTop, top);
        ctx.bezierCurveTo(x + s * wTop, neck - u * 0.2, x + s * wCh, neck - u * 0.15, x + s * wCh, neck);
        ctx.lineTo(x + s * wCh, bot);
        ctx.stroke();
      });
      const ly = y + u * 0.15;
      const lg = ctx.createLinearGradient(x - u * 1.1, 0, x + u * 0.2, 0);
      lg.addColorStop(0, rgba(col, 0));
      lg.addColorStop(1, rgba(col, (0.5 + 0.4 * e) * a));
      ctx.strokeStyle = lg;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - u * 1.1, ly);
      ctx.lineTo(x + u * 0.12, ly);
      ctx.stroke();
      ctx.fillStyle = rgba(C.steel, 0.5 * a);
      ctx.fillRect(x - u * 1.24, ly - u * 0.06, u * 0.14, u * 0.12);
      const pops = [C.cyan, C.violet, C.ice];
      let flash = 0;
      let flashCol = col;
      const rate = SIM.flow.rate * (0.35 + 0.65 * e);
      const T = t * rate;
      const k0 = Math.floor(T) - 6;
      for (let k = k0; k < k0 + 9; k += 1) {
        const prog = T - k;
        const cell = SIM.flow.cell(k);
        let cx;
        let cy;
        if (prog < 0.5) {
          const q = prog / 0.5;
          cx = x + Math.sin(k * 2.3) * wTop * 0.6 * (1 - q);
          cy = lerp(top + u * 0.1, neck, q);
        } else {
          cx = x;
          cy = lerp(neck, bot, (prog - 0.5) / 1.6);
        }
        if (cy > bot || prog < 0) continue;
        const r = u * (0.05 + 0.025 * cell.scatter);
        const near = Math.max(0, 1 - Math.abs(cy - ly) / (u * 0.08));
        if (near > flash) {
          flash = near;
          flashCol = pops[cell.pop];
        }
        ctx.strokeStyle = rgba(C.ice, 0.55 * a);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, TAU);
        ctx.stroke();
        dot(cx, cy, r * 0.35, C.ice, 0.35 * a);
        if (cell.pop < 2) {
          for (let m = 0; m < 5; m += 1) {
            const an = (m / 5) * TAU + k;
            dot(cx + Math.cos(an) * r, cy + Math.sin(an) * r, 1.3, pops[cell.pop], (0.6 + near) * a);
          }
        }
        if (near > 0.05) glow(cx, cy, r * 3, pops[cell.pop], near * 0.8 * a);
      }
      glow(x, ly, u * 0.14, flashCol, (0.25 + flash * 0.6) * a);
      if (e > 0.02) {
        const px = x + u * 0.45;
        const py = y + u * 0.75;
        const pw = u * 0.95;
        const ph = u * 0.95;
        ctx.strokeStyle = rgba(C.ice, 0.22 * a * e);
        ctx.beginPath();
        ctx.moveTo(px, py - ph);
        ctx.lineTo(px, py);
        ctx.lineTo(px + pw, py);
        ctx.stroke();
        const n = Math.floor(T) - 1;
        for (let k = Math.max(0, n - 70); k <= n; k += 1) {
          const c = SIM.flow.cell(k);
          dot(px + c.x * pw, py - c.y * ph, 1.5, pops[c.pop], 0.85 * a * e * (k === n ? 1 : 0.7));
        }
        label("Laser", x - u * 1.1, ly - 12, 0.6 * a * e, { col });
        label("Marker A →", px + pw, py + 12, 0.5 * a * e, { align: "right" });
        label("Marker B", px, py - ph - 10, 0.5 * a * e);
      }
    }

    function bottlePath(x, y, u) {
      const w = u * 0.5;
      const top = y - u * 0.55;
      const bot = y + u * 0.95;
      const nw = u * 0.17;
      ctx.beginPath();
      ctx.moveTo(x - nw, y - u * 1.0);
      ctx.lineTo(x - nw, top - u * 0.18);
      ctx.quadraticCurveTo(x - w, top - u * 0.05, x - w, top + u * 0.25);
      ctx.lineTo(x - w, bot - u * 0.12);
      ctx.quadraticCurveTo(x - w, bot, x - w + u * 0.12, bot);
      ctx.lineTo(x + w - u * 0.12, bot);
      ctx.quadraticCurveTo(x + w, bot, x + w, bot - u * 0.12);
      ctx.lineTo(x + w, top + u * 0.25);
      ctx.quadraticCurveTo(x + w, top - u * 0.05, x + nw, top - u * 0.18);
      ctx.lineTo(x + nw, y - u * 1.0);
      return { w, top, bot };
    }

    function drawCulture(P, a, e, t, A, i) {
      const { x, y, u } = P;
      const col = C[A.accent];
      const H = SIM.culture.hours;
      const hrs = ((t * (0.6 + 1.8 * e)) % (H + 6));
      const h = Math.min(hrs, H);
      const g = SIM.culture.growth(h);
      const sig = SIM.culture.signal(h);
      const B = bottlePath(x, y, u);
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = rgba(C.ice, 0.04 * a);
      ctx.fill();
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = rgba(C.ice, 0.42 * a);
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = rgba(C.steel, 0.55 * a);
      ctx.fillRect(x - u * 0.2, y - u * 1.12, u * 0.4, u * 0.14);
      const liq = B.top + u * 0.35;
      ctx.save();
      bottlePath(x, y, u);
      ctx.clip();
      const lg = ctx.createLinearGradient(0, liq, 0, B.bot);
      lg.addColorStop(0, rgba(col, 0.08 * a));
      lg.addColorStop(1, rgba(col, (0.14 + 0.2 * g) * a));
      ctx.fillStyle = lg;
      ctx.fillRect(x - B.w, liq, B.w * 2, B.bot - liq);
      ctx.strokeStyle = rgba(C.ice, 0.3 * a);
      ctx.beginPath();
      ctx.moveTo(x - B.w, liq + Math.sin(t) * 1.5);
      ctx.lineTo(x + B.w, liq - Math.sin(t) * 1.5);
      ctx.stroke();
      const shown = Math.max(2, Math.round(70 * Math.min(1, g * 1.6)));
      for (let m = 0; m < shown; m += 1) {
        const hx = Math.sin(m * 91.7) * 0.5 + 0.5;
        const hy = Math.sin(m * 37.3) * 0.5 + 0.5;
        const bx = x - B.w * 0.8 + hx * B.w * 1.6 + Math.sin(t * 0.7 + m) * u * 0.03;
        const by = liq + u * 0.08 + hy * (B.bot - liq - u * 0.25) + Math.cos(t * 0.6 + m) * u * 0.03;
        const an = m * 1.7 + t * 0.3;
        const L = u * 0.035;
        ctx.strokeStyle = rgba(col, 0.85 * a);
        ctx.lineWidth = 2.2;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(bx - Math.cos(an) * L, by - Math.sin(an) * L);
        ctx.lineTo(bx + Math.cos(an) * L, by + Math.sin(an) * L);
        ctx.stroke();
      }
      const rateNow = SIM.culture.growth(h + 0.3) - g;
      for (let m = 0; m < 10; m += 1) {
        const ph = (t * 0.4 + m / 10) % 1;
        dot(x + Math.sin(m * 5.1) * B.w * 0.7, B.bot - u * 0.15 - ph * (B.bot - liq - u * 0.1), 1.2, C.ice, clamp(rateNow * 40, 0, 0.6) * a * (1 - ph));
      }
      ctx.restore();
      const sy = B.bot - u * 0.06;
      ctx.fillStyle = rgba(col, (0.25 + sig * 0.75) * a);
      ctx.beginPath();
      ctx.ellipse(x, sy, B.w * 0.55, u * 0.035, 0, 0, TAU);
      ctx.fill();
      glow(x, sy, u * (0.25 + sig * 0.45), col, (0.15 + sig * 0.6) * a);
      const positive = h >= SIM.culture.flagHours();
      if (e > 0.02) {
        const cx = x + u * 0.75;
        const cy = y + u * 0.75;
        const cw = u * 1.0;
        const ch = u * 0.85;
        miniChart(cx, cy, cw, ch, a * e, col, (s) => SIM.culture.signal(s * H), h / H, { thr: SIM.culture.threshold, ghost: () => 0.04 });
        label("Sensor signal", cx, cy - ch - 10, 0.6 * a * e);
        label(`${Math.floor(h)} h →`, cx + cw, cy + 12, 0.5 * a * e, { align: "right" });
        label("Threshold", cx + cw, cy - SIM.culture.threshold * ch - 8, 0.45 * a * e, { align: "right", col: C.violet });
        if (u > 110) label("Negative control", cx + 4, cy - 0.04 * ch - 8, 0.35 * a * e);
        if (positive) label("Flagged positive", cx, cy - ch - 26, sm((h - SIM.culture.flagHours()) / 1.5) * a * e, { col, size: 10 });
        label("Sensor", x + B.w + 8, sy, 0.55 * a * e);
      }
    }

    function drawLattice(P, a, e, t, A) {
      const { x, y, u } = P;
      const col = C[A.accent];
      const T = Math.min(1, ((t * (0.025 + 0.07 * e)) % 1.25));
      const amp = SIM.heat.amplitude(T);
      const m = SIM.heat.molten(T);
      const N = 8;
      const pts = [];
      const hot = mixRGB(C.blue, C.violet, Math.min(1, T * 1.3));
      for (let iz = 0; iz < 3; iz += 1)
        for (let iy = 0; iy < N; iy += 1)
          for (let ix = 0; ix < N; ix += 1) {
            const k = ix + iy * N + iz * N * N;
            const lx = (ix - (N - 1) / 2) / (N - 1);
            const ly = (iy - (N - 1) / 2) / (N - 1);
            const lz = iz / 2;
            const jx = Math.sin(t * 9 + k * 1.7) * amp;
            const jy = Math.cos(t * 8 + k * 2.3) * amp;
            const r1 = Math.sin(k * 12.9898) * 43758.5453;
            const r2 = Math.sin(k * 78.233) * 12345.678;
            const fx = (r1 - Math.floor(r1) - 0.5) * 1.5;
            const fy = 0.45 - (r2 - Math.floor(r2)) * 0.18 - lz * 0.05;
            const px = lerp(lx, fx, m) + jx;
            const py = lerp(ly * 0.9, fy, m) + jy;
            pts.push({ X: x + (px + lz * 0.14) * u * 1.15, Y: y + (py - lz * 0.12) * u * 1.15, ix, iy, iz, k });
          }
      const back = pts.filter((p) => p.iz === 0);
      ctx.strokeStyle = rgba(hot, 0.22 * a * (1 - m));
      ctx.lineWidth = 1;
      ctx.beginPath();
      back.forEach((p) => {
        if (p.ix < N - 1) {
          const q = back[p.ix + 1 + p.iy * N];
          ctx.moveTo(p.X, p.Y);
          ctx.lineTo(q.X, q.Y);
        }
        if (p.iy < N - 1) {
          const q = back[p.ix + (p.iy + 1) * N];
          ctx.moveTo(p.X, p.Y);
          ctx.lineTo(q.X, q.Y);
        }
      });
      ctx.stroke();
      pts.forEach((p) => dot(p.X, p.Y, 1.6 - p.iz * 0.25, hot, (0.85 - p.iz * 0.22) * a));
      const plateY = y + u * 0.72;
      const pg = ctx.createLinearGradient(x - u, 0, x + u, 0);
      pg.addColorStop(0, rgba(col, 0));
      pg.addColorStop(0.5, rgba(mixRGB(col, C.violet, T), (0.3 + T * 0.6) * a));
      pg.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = pg;
      ctx.fillRect(x - u * 0.95, plateY, u * 1.9, u * 0.05);
      glow(x, plateY, u * (0.4 + T * 0.5), mixRGB(col, C.violet, T), 0.15 + T * 0.3 * a);
      if (e > 0.02) {
        const cx = x + u * 0.85;
        const cy = y + u * 0.75;
        const cw = u * 1.0;
        const ch = u * 0.85;
        miniChart(cx, cy, cw, ch, a * e, C.violet, (s) => SIM.heat.heatFlow(s), T);
        label("Heat flow", cx, cy - ch - 10, 0.6 * a * e);
        label("Temperature →", cx + cw, cy + 12, 0.5 * a * e, { align: "right" });
        label(m < 0.05 ? "Solid · ordered" : m < 0.95 ? "Melting" : "Liquid · disordered", x - u * 0.6, y - u * 0.75, 0.6 * a * e);
      }
    }

    function mixRGB(p, q, k) {
      return [lerp(p[0], q[0], k), lerp(p[1], q[1], k), lerp(p[2], q[2], k)];
    }

    const WORLDS = { column: drawColumn, flow: drawFlow, culture: drawCulture, lattice: drawLattice };

    /* ---------- frame ---------- */

    function hash(m, s) {
      const v = Math.sin(m * s) * 43758.5453;
      return v - Math.floor(v);
    }

    /* The environment around an opened area: drifting particles shaped like that science. */
    function ambient(A, r, a) {
      const col = C[A.accent];
      for (let m = 0; m < 70; m += 1) {
        const sp = 0.004 + hash(m, 7.1) * 0.012;
        const px = r.x + ((hash(m, 12.9) + U.t * sp) % 1) * r.w;
        const py = r.y + hash(m, 78.2) * r.h + Math.sin(U.t * 0.4 + m) * 12;
        const s = 1 + hash(m, 3.7) * 2.4;
        const al = (0.12 + hash(m, 5.3) * 0.25) * a;
        if (A.visual === "flow") {
          ctx.strokeStyle = rgba(col, al);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(px, py, s * 2.4, 0, TAU);
          ctx.stroke();
        } else if (A.visual === "culture") {
          const an = m + U.t * 0.2;
          ctx.strokeStyle = rgba(col, al);
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(px - Math.cos(an) * s * 2, py - Math.sin(an) * s * 2);
          ctx.lineTo(px + Math.cos(an) * s * 2, py + Math.sin(an) * s * 2);
          ctx.stroke();
        } else if (A.visual === "lattice") {
          ctx.fillStyle = rgba(col, al);
          ctx.fillRect(px - s, py - s, s * 2, s * 2);
        } else {
          dot(px, py, s * 0.8, col, al * 1.4);
        }
      }
    }

    function drawTile(A, i, r, P, a, ex) {
      ctx.save();
      ctx.beginPath();
      const rad = 20 * (1 - ex);
      if (ctx.roundRect) ctx.roundRect(r.x, r.y, r.w, r.h, rad);
      else ctx.rect(r.x, r.y, r.w, r.h);
      ctx.clip();
      ctx.globalCompositeOperation = "source-over";
      if (ex > 0.01) {
        ctx.fillStyle = S.brand ? `rgba(235,245,252,${0.75 * ex * a})` : `rgba(3,5,14,${0.72 * ex * a})`;
        ctx.fillRect(r.x, r.y, r.w, r.h);
      }
      const g = ctx.createRadialGradient(P.x, P.y, 0, P.x, P.y, Math.max(r.w, r.h) * 0.7);
      g.addColorStop(0, rgba(C[A.accent], 0.16 * a));
      g.addColorStop(1, rgba(C[A.accent], 0));
      ctx.fillStyle = g;
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.globalCompositeOperation = "lighter";
      if (ex > 0.01) ambient(A, r, a * ex);
      U.lbl = P.u >= 70;
      WORLDS[A.visual](P, a, 0.55 + 0.45 * U.wake[i], U.t, A, i);
      ctx.restore();
    }

    function draw(dt, k, origin) {
      U.k = k;
      if (!U.n) return;
      U.t += dt * (reduce ? 0.3 : 1);
      U.x = lerp(U.x, U.open >= 0 ? 1 : 0, Math.min(1, dt * (reduce ? 12 : 3.2)));
      if (U.open < 0 && U.x < 0.003) U.shown = -1;
      box.hidden = k < 0.02;
      box.style.opacity = sm((k - 0.45) / 0.55).toFixed(3);
      box.classList.toggle("is-live", k > 0.9);
      if (k < 0.01 || !tiles.length) return;
      const arrive = sm(k);
      const ex = sm(U.x);
      const rects = tiles.map(relRect);
      ctx.globalCompositeOperation = "lighter";
      if (origin && arrive < 0.999 && !reduce) {
        for (let m = 0; m < 140; m += 1) {
          const r = rects[m % U.n];
          const q = sm(clamp((arrive - hash(m, 12.9898) * 0.3) / 0.7, 0, 1));
          const tx = r.x + hash(m, 3.1) * r.w;
          const ty = r.y + hash(m, 5.7) * r.h;
          dot(lerp(origin.x, tx, q), lerp(origin.y, ty, q), 1.3, C[area(m % U.n).accent], 0.8 * (1 - q * 0.7));
        }
      }
      const full = { x: 0, y: 0, w: S.w, h: S.h };
      const base = sm(clamp((arrive - 0.25) / 0.75, 0, 1));
      const order = U.areas.map((A, i) => i).sort((p, q) => (p === U.shown) - (q === U.shown));
      order.forEach((i) => {
        const A = U.areas[i];
        const chosen = i === U.shown;
        U.wake[i] = lerp(U.wake[i], chosen || i === U.hover ? 1 : 0, Math.min(1, dt * 3));
        let r = rects[i];
        let P = sceneIn(r);
        let a = base;
        if (chosen && U.from) {
          r = mixRect(U.from, full, ex);
          P = mixP(sceneIn(U.from), sceneFull(), ex);
        } else {
          a *= 1 - ex;
          if (U.hover >= 0 && i !== U.hover) a *= 0.6;
        }
        if (a > 0.01 && r.w > 4) drawTile(A, i, r, P, a, chosen ? ex : 0);
      });
      ctx.globalCompositeOperation = "source-over";
    }

    return {
      setData,
      draw,
      get diving() {
        return U.open >= 0;
      },
      leave() {
        closeArea(true);
        U.hover = -1;
      },
      redive() {
        box.querySelector(".wm-uni-area .wm-uni-journey, .wm-uni-area h2")?.focus({ preventScroll: true });
      },
      move() {
        kit.cursor("default");
      },
      click() {},
      key(e) {
        if (e.key === "Escape" && U.open >= 0) {
          closeArea();
          return true;
        }
        return false;
      },
    };
  }

  global.WatersUniverse = { create };
})(window);
