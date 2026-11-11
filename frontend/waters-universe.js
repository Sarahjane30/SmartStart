/* Waters // Chapter 03 — the Technology universe.
   A ring of four scientific worlds drawn on the machine's canvas with the machine's own
   helpers. Each world animates its real process from WatersSim; the focused world wakes up.
   Drag, swipe, arrow keys or the world labels turn the ring; stepping inside a world opens
   its experience — the existing LC/MS journeys for Analytical Sciences, an in-progress
   preview for the others. All controls are DOM buttons, so the hub is keyboard and
   screen-reader operable; a text version lives in the chapter panel. */
(function (global) {
  "use strict";

  const SIM = global.WatersSim;

  function create(kit) {
    const { ctx, C, rgba, glow, dot, lerp, clamp, ease, TAU, reduce, S, esc, root } = kit;
    const sm = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
    const MONO = '"IBM Plex Mono", ui-monospace, monospace';

    const U = {
      k: 0,
      rot: 0,
      target: 0,
      focus: 0,
      dive: 0,
      diving: false,
      drag: null,
      moved: 0,
      hover: -1,
      t: 0,
      wake: [0, 0, 0, 0],
      clock: [0, 0, 0, 0],
      touched: false,
      areas: [],
      divisions: [],
      legend: {},
    };

    const box = document.createElement("div");
    box.className = "wm-uni";
    box.hidden = true;
    box.setAttribute("aria-label", "Technology universe");
    root.appendChild(box);

    function setData(tech, divisions) {
      const u = tech?.universe;
      U.areas = u ? u.areas : [];
      U.divisions = divisions || [];
      U.legend = u ? u.legend : {};
      if (!u) return;
      const n = U.areas.length;
      box.innerHTML = `
        <div class="wm-uni-intro"><p class="wm-uni-kick">${esc(u.title)}</p><p>${esc(u.intro)}</p></div>
        <div class="wm-uni-worlds">${U.areas
          .map(
            (a, i) => `<button type="button" class="wm-uni-world" data-i="${i}" style="--c:${rgba(C[a.accent], 1)}"
              aria-label="${esc(a.division)}: ${esc(a.question)}"><span>${String(i + 1).padStart(2, "0")}</span>${esc(a.division)}</button>`
          )
          .join("")}</div>
        <div class="wm-uni-focus" aria-live="polite"></div>
        <div class="wm-uni-turn">
          <button type="button" class="wm-uni-arrow" data-turn="-1" aria-label="Previous world">←</button>
          <span class="wm-uni-count"></span>
          <button type="button" class="wm-uni-arrow" data-turn="1" aria-label="Next world">→</button>
        </div>
        <p class="wm-uni-legend"><span><i></i>${esc(U.legend.simulation)}</span><span>${esc(U.legend.labels)}</span><span>${esc(U.legend.products)}</span></p>
        <button type="button" class="wm-uni-text">Text version</button>
        <section class="wm-uni-dive" hidden aria-live="polite"></section>`;
      box.querySelectorAll(".wm-uni-world").forEach((b) =>
        b.addEventListener("click", () => {
          const i = Number(b.dataset.i);
          if (i === U.focus) dive(true);
          else turnTo(i);
        })
      );
      box.querySelectorAll("[data-turn]").forEach((b) => b.addEventListener("click", () => turn(Number(b.dataset.turn))));
      box.querySelector(".wm-uni-text").addEventListener("click", () => kit.onText());
      U.n = n;
      renderFocus();
      box.classList.toggle("is-touched", U.touched);
      if (U.diving) {
        box.classList.add("is-dive");
        renderDive();
        box.querySelector(".wm-uni-dive").hidden = false;
      }
    }

    const area = (i) => U.areas[((i % U.n) + U.n) % U.n];
    const divisionOf = (a) => U.divisions.find((d) => d.name === a.division) || {};
    const wrap = (i) => ((i % U.n) + U.n) % U.n;

    function renderFocus() {
      const a = area(U.focus);
      if (!a) return;
      const live = a.experience === "available";
      box.querySelector(".wm-uni-focus").innerHTML = `
        <h3 style="--c:${rgba(C[a.accent], 1)}">${esc(a.division)}</h3>
        <p class="wm-uni-q">${esc(a.question)}</p>
        <p class="wm-uni-teaser">${esc(a.teaser)}</p>
        <button type="button" class="wm-uni-go${live ? "" : " is-soon"}">${live ? "Step inside" : "Preview · in progress"} <span aria-hidden="true">→</span></button>`;
      box.querySelector(".wm-uni-go").addEventListener("click", () => dive(true));
      box.querySelector(".wm-uni-count").textContent = `${String(U.focus + 1).padStart(2, "0")} / ${String(U.n).padStart(2, "0")}`;
      box.querySelectorAll(".wm-uni-world").forEach((b) => b.classList.toggle("is-front", Number(b.dataset.i) === U.focus));
    }

    function renderDive() {
      const a = area(U.focus);
      const d = divisionOf(a);
      const el = box.querySelector(".wm-uni-dive");
      const live = a.experience === "available";
      el.style.setProperty("--c", rgba(C[a.accent], 1));
      el.innerHTML = `
        <p class="wm-uni-kick">${esc(a.division)} <small>working label</small></p>
        <h3>${esc(a.question)}</h3>
        <p>${esc(d.simple || a.teaser)}</p>
        ${
          live
            ? `<p class="wm-uni-sub">Choose a journey</p><div class="wm-uni-journeys">${a.journeys
                .map(
                  (j, i) => `<button type="button" class="wm-uni-journey" data-j="${i}"><strong>${esc(j.label)}</strong><span>${esc(j.what)}</span><em aria-hidden="true">→</em></button>`
                )
                .join("")}</div>`
            : `<p class="wm-uni-status"><i></i>Interactive experience in progress</p>
               <p class="wm-uni-sub">Coming next</p><p>${esc(a.coming)}</p>
               ${a.note ? `<p class="wm-uni-note">${esc(a.note)}</p>` : ""}
               <button type="button" class="wm-uni-read">Read about ${esc(a.division)} as text</button>`
        }
        <button type="button" class="wm-uni-back">← Back to the universe</button>`;
      el.querySelectorAll("[data-j]").forEach((b) =>
        b.addEventListener("click", () => {
          const j = a.journeys[Number(b.dataset.j)];
          kit.onJourney(j.track, j.kind);
        })
      );
      el.querySelector(".wm-uni-read")?.addEventListener("click", () => kit.onText(a.division));
      el.querySelector(".wm-uni-back").addEventListener("click", () => dive(false));
    }

    function touch() {
      U.touched = true;
      box.classList.add("is-touched");
    }

    function turnTo(i) {
      if (U.diving) return;
      touch();
      const cur = wrap(Math.round(U.target));
      let d = wrap(i) - cur;
      if (d > U.n / 2) d -= U.n;
      if (d < -U.n / 2) d += U.n;
      U.target = Math.round(U.target) + d;
      U.focus = wrap(U.target);
      renderFocus();
    }
    const turn = (d) => turnTo(wrap(Math.round(U.target)) + d);

    function dive(on) {
      if (on === U.diving) return;
      touch();
      U.diving = on;
      const el = box.querySelector(".wm-uni-dive");
      box.classList.toggle("is-dive", on);
      if (on) {
        renderDive();
        el.hidden = false;
        requestAnimationFrame(() => el.querySelector("button")?.focus({ preventScroll: true }));
      } else {
        el.hidden = true;
        box.querySelector(".wm-uni-go")?.focus({ preventScroll: true });
      }
    }

    /* ---------- layout ---------- */

    function place(i) {
      const ang = ((i - U.rot) * TAU) / U.n;
      const z = Math.cos(ang);
      const depth = (1 - z) / 2;
      const narrow = S.narrow;
      const rx = narrow ? S.w * 0.44 : Math.min(S.w * 0.33, 560);
      const unit = Math.min(S.w, S.h) * (narrow ? 0.2 : 0.17);
      const scale = 1 / (1 + depth * 1.3);
      const cy = S.h * (narrow ? 0.4 : 0.44);
      const dv = ease(U.dive);
      const front = i === U.focus ? dv : 0;
      const x = S.w / 2 + Math.sin(ang) * rx * (1 + dv * 0.6) - (narrow ? 0 : S.w * 0.2 * front);
      const y = cy - depth * depth * S.h * 0.22 - (narrow ? S.h * 0.12 * front : 0);
      const vis = depth < 0.5 ? lerp(1, 0.62, depth / 0.5) : lerp(0.62, 0.04, (depth - 0.5) / 0.5);
      const alpha = vis * (i === U.focus ? 1 : 1 - dv * 0.9);
      return { x, y, u: unit * scale * (1 + front * 0.35), a: alpha, z, depth };
    }

    /* ---------- the four worlds ---------- */

    function label(text, x, y, a, o = {}) {
      if (a <= 0.02) return;
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

    function draw(dt, k, origin) {
      U.k = k;
      if (!U.n) return;
      U.t += dt * (reduce ? 0.3 : 1);
      if (!U.drag) U.rot = lerp(U.rot, U.target, Math.min(1, dt * (reduce ? 12 : 4.2)));
      U.dive = lerp(U.dive, U.diving ? 1 : 0, Math.min(1, dt * 3));
      box.hidden = k < 0.02;
      box.style.opacity = sm((k - 0.45) / 0.55).toFixed(3);
      box.classList.toggle("is-live", k > 0.9);
      if (k < 0.01) return;
      const arrive = sm(k);
      ctx.globalCompositeOperation = "lighter";
      if (origin && arrive < 0.999 && !reduce) {
        for (let m = 0; m < 120; m += 1) {
          const target = place(m % U.n);
          const r = Math.sin(m * 12.9898) * 43758.5453;
          const s = r - Math.floor(r);
          const q = sm(clamp((arrive - s * 0.3) / 0.7, 0, 1));
          const px = lerp(origin.x, target.x + Math.cos(m) * target.u * 0.8, q);
          const py = lerp(origin.y, target.y + Math.sin(m * 1.3) * target.u * 0.8, q);
          dot(px, py, 1.3, C[area(m).accent], 0.8 * (1 - q * 0.6));
        }
      }
      const order = U.areas.map((A, i) => ({ A, i, P: place(i) })).sort((p, q) => p.P.z - q.P.z);
      const btns = box.querySelectorAll(".wm-uni-world");
      order.forEach(({ A, i, P }) => {
        const front = i === U.focus;
        const goal = front || i === U.hover ? 1 : 0;
        U.wake[i] = lerp(U.wake[i], goal, Math.min(1, dt * 3));
        const a = P.a * sm(clamp((arrive - 0.25) / 0.75, 0, 1));
        glow(P.x, P.y, P.u * 2.2, C[A.accent], 0.07 * a);
        WORLDS[A.visual](P, a, U.wake[i] * (front ? 1 : 0.6), U.t, A, i);
        const b = btns[i];
        if (b) {
          const by = P.y + P.u * 1.35;
          if (!b._w || b._wAt !== S.w) {
            b._w = b.offsetWidth;
            b._wAt = S.w;
          }
          const bx = clamp(P.x, b._w / 2 + 8, S.w - b._w / 2 - 8);
          b.style.transform = `translate(${Math.round(bx)}px, ${Math.round(by)}px) translate(-50%, 0)`;
          const show = front || S.narrow ? 0 : clamp((0.8 - P.depth) / 0.2, 0, 1) * (1 - ease(U.dive));
          b.style.opacity = show.toFixed(3);
          b.style.visibility = show < 0.05 ? "hidden" : "visible";
          b.tabIndex = front ? -1 : 0;
        }
      });
      ctx.globalCompositeOperation = "source-over";
    }

    function hit(x, y) {
      let best = -1;
      let bz = -9;
      U.areas.forEach((_, i) => {
        const P = place(i);
        if (Math.abs(x - P.x) < P.u * 1.0 && Math.abs(y - P.y) < P.u * 1.2 && P.z > bz && P.a > 0.3) {
          best = i;
          bz = P.z;
        }
      });
      return best;
    }

    return {
      setData,
      draw,
      get diving() {
        return U.diving;
      },
      get active() {
        return U.k > 0.5;
      },
      enter() {
        U.drag = null;
      },
      leave() {
        if (U.diving) dive(false);
        U.hover = -1;
      },
      focusArea(id) {
        const i = U.areas.findIndex((a) => a.id === id);
        if (i >= 0) turnTo(i);
      },
      redive() {
        if (!U.diving) dive(true);
        else box.querySelector(".wm-uni-dive button")?.focus({ preventScroll: true });
      },
      turn,
      move(x, y) {
        if (U.drag) {
          const dx = x - U.drag.x;
          U.moved = Math.max(U.moved, Math.abs(dx));
          U.rot = U.drag.rot - dx / (S.narrow ? S.w * 0.5 : S.w * 0.28);
          return;
        }
        U.hover = U.diving ? -1 : hit(x, y);
        kit.cursor(U.hover >= 0 ? "pointer" : "grab");
      },
      down(x) {
        if (U.diving) return;
        U.drag = { x, rot: U.rot };
        U.moved = 0;
      },
      up() {
        if (!U.drag) return;
        U.drag = null;
        if (U.moved > 6) {
          touch();
          U.target = Math.round(U.rot);
          U.focus = wrap(U.target);
          renderFocus();
        }
      },
      click(x, y) {
        if (U.moved > 6) {
          U.moved = 0;
          return;
        }
        if (U.diving) return;
        const i = hit(x, y);
        if (i < 0) return;
        if (i === U.focus) dive(true);
        else turnTo(i);
      },
      key(e) {
        if (e.target.closest && e.target.closest("input, textarea")) return false;
        if (e.key === "Escape" && U.diving) {
          dive(false);
          return true;
        }
        if (U.diving) return false;
        if (e.key === "ArrowLeft") turn(-1);
        else if (e.key === "ArrowRight") turn(1);
        else if (e.key === "Enter" && !(e.target.closest && e.target.closest("button"))) dive(true);
        else return false;
        return true;
      },
    };
  }

  global.WatersUniverse = { create };
})(window);
