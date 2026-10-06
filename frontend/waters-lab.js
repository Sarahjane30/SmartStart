/* Cinematic LC / MS lab — pearl-white instrument inside the cosmic Waters machine.
   Animation teaches first; the panel only captions what the user is doing. */
(function (global) {
  const TAU = Math.PI * 2;
  const COMPOUNDS = [
    { id: "a", name: "Compound A", color: [96, 214, 255], ret: 0.28, mz: 180, speed: 1.0 },
    { id: "b", name: "Compound B", color: [112, 238, 208], ret: 0.52, mz: 310, speed: 0.72 },
    { id: "c", name: "Compound C", color: [170, 128, 255], ret: 0.78, mz: 445, speed: 0.48 },
  ];
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

  function create(kind) {
    return {
      kind: kind === "ms" ? "ms" : "lc",
      assemble: 0,
      phase: "idle", // idle | inject | separate | detect | explore | ionize | analyze | spectrum
      age: 0,
      focus: null,
      hover: null,
      peaks: COMPOUNDS.map((c) => ({ ...c, drawn: 0, lit: false })),
      ions: [],
      hits: { vial: null, peaks: [], continue: null, inject: null },
      camPull: 0,
      flash: 0,
    };
  }

  function startInject(lab) {
    if (lab.kind !== "lc" || (lab.phase !== "idle" && lab.phase !== "explore")) return;
    lab.phase = "inject";
    lab.age = 0;
    lab.focus = null;
    lab.peaks.forEach((p) => {
      p.drawn = 0;
      p.lit = false;
    });
    lab.flash = 1;
  }

  function continueToMs(lab) {
    lab.kind = "ms";
    lab.phase = "ionize";
    lab.age = 0;
    lab.focus = null;
    lab.assemble = Math.max(lab.assemble, 0.85);
    lab.ions = COMPOUNDS.map((c, i) => ({
      ...c,
      u: 0,
      delay: i * 0.35,
      trail: [],
    }));
    lab.peaks.forEach((p) => {
      p.drawn = 0;
      p.lit = false;
    });
    lab.flash = 1;
  }

  function update(lab, dt, reduce) {
    const speed = reduce ? 2.2 : 1;
    lab.assemble = Math.min(1, lab.assemble + dt / (reduce ? 0.35 : 1.6));
    lab.age += dt * speed;
    lab.flash = Math.max(0, lab.flash - dt * 1.8);
    lab.camPull = lerp(lab.camPull, lab.assemble > 0.4 ? 1 : 0, Math.min(1, dt * 2));

    if (lab.kind === "lc") {
      if (lab.phase === "inject" && lab.age > 1.1) {
        lab.phase = "separate";
        lab.age = 0;
      } else if (lab.phase === "separate" && lab.age > 3.4) {
        lab.phase = "detect";
        lab.age = 0;
      } else if (lab.phase === "detect") {
        lab.peaks.forEach((p) => {
          const start = p.ret * 2.8;
          if (lab.age > start) p.drawn = clamp((lab.age - start) / 0.55, 0, 1);
          if (p.drawn > 0.55) p.lit = true;
        });
        if (lab.age > 3.6) lab.phase = "explore";
      }
    } else {
      if (lab.phase === "ionize" && lab.age > 1.6) {
        lab.phase = "analyze";
        lab.age = 0;
      } else if (lab.phase === "analyze") {
        lab.ions.forEach((ion) => {
          const local = Math.max(0, lab.age - ion.delay);
          ion.u = clamp(local / 2.2, 0, 1);
        });
        if (lab.age > 3.4) {
          lab.phase = "spectrum";
          lab.age = 0;
        }
      } else if (lab.phase === "spectrum") {
        lab.peaks.forEach((p, i) => {
          const start = 0.25 + i * 0.45;
          if (lab.age > start) p.drawn = clamp((lab.age - start) / 0.5, 0, 1);
        });
        if (lab.age > 2.4) lab.phase = "explore";
      }
    }
  }

  function caption(lab) {
    if (lab.kind === "lc") {
      if (lab.phase === "idle") return "Click the sample vial — watch the mixture enter the machine.";
      if (lab.phase === "inject") return "Sample injected. Following the liquid through the tubing…";
      if (lab.phase === "separate")
        return "Inside the column, compounds stick differently — so they travel at different speeds.";
      if (lab.phase === "detect") return "Each compound hits the detector. The chromatogram draws itself.";
      if (lab.focus) {
        const p = lab.peaks.find((x) => x.id === lab.focus);
        return p ? `${p.name} · retention ${(p.ret * 5.4).toFixed(1)} min — everything else fades.` : "";
      }
      return "Click a peak to trace that compound back through the instrument.";
    }
    if (lab.phase === "ionize") return "Molecules pick up a charge — they become ions.";
    if (lab.phase === "analyze") return "Ions fan out by mass-to-charge ratio. Heavier paths curve differently.";
    if (lab.phase === "spectrum") return "The mass spectrum builds live from those trajectories.";
    if (lab.focus) {
      const p = lab.peaks.find((x) => x.id === lab.focus);
      return p ? `${p.name} · m/z ${p.mz} — matching ion highlighted in the analyzer.` : "";
    }
    return "Click a peak to identify its ion in the machine.";
  }

  function panelHtml(lab) {
    const title = lab.kind === "lc" ? "Liquid chromatography" : "Mass spectrometry";
    const tag = lab.kind === "lc" ? "LC" : "MS";
    const canInject = lab.kind === "lc" && (lab.phase === "idle" || lab.phase === "explore");
    const canMs = lab.kind === "lc" && lab.phase === "explore";
    const peaksReady = lab.phase === "explore" || lab.phase === "detect" || lab.phase === "spectrum";
    return `<div class="wm-lab-panel">
      <p class="wm-kicker"><span>${tag}</span>Live experiment</p>
      <h2>${esc(title)}</h2>
      <p class="wm-lab-caption">${esc(caption(lab))}</p>
      <div class="wm-lab-actions">
        ${canInject ? `<button type="button" class="wm-cta primary" data-lab="inject">Inject sample</button>` : ""}
        ${canMs ? `<button type="button" class="wm-cta primary" data-lab="ms">Follow into Mass Spec →</button>` : ""}
        ${lab.kind === "ms" && lab.phase === "explore" ? `<button type="button" class="wm-cta" data-lab="again">Run LC again</button>` : ""}
        <button type="button" class="wm-cta" data-lab="exit">← Back to the machine</button>
      </div>
      ${
        peaksReady
          ? `<div class="wm-lab-peaks">${lab.peaks
              .map(
                (p) =>
                  `<button type="button" class="wm-lab-peak${lab.focus === p.id ? " is-on" : ""}" data-peak="${p.id}" style="--c:${rgba(p.color, 1)}">
                    <i></i><strong>${esc(p.name)}</strong>
                    <span>${lab.kind === "lc" ? `${(p.ret * 5.4).toFixed(1)} min` : `m/z ${p.mz}`}</span>
                  </button>`
              )
              .join("")}</div>`
          : ""
      }
      <p class="wm-plain"><span>How to play</span>Hover parts wake up · click the vial or peaks · the graph and the machine stay linked.</p>
    </div>`;
  }

  /* ---- drawing helpers local to lab ---- */

  function metal(ctx, x, y, w, h, a, r = 8) {
    const g = ctx.createLinearGradient(x, y, x + w, y);
    g.addColorStop(0, rgba([210, 218, 230], 0.55 * a));
    g.addColorStop(0.35, rgba([248, 250, 255], 0.92 * a));
    g.addColorStop(0.7, rgba([186, 196, 214], 0.7 * a));
    g.addColorStop(1, rgba([120, 132, 158], 0.55 * a));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();
    ctx.strokeStyle = rgba([255, 255, 255], 0.35 * a);
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function glassTube(ctx, pts, a, width, col, flowU) {
    if (pts.length < 2) return;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = rgba([220, 230, 245], 0.22 * a);
    ctx.lineWidth = width + 3;
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.stroke();
    ctx.strokeStyle = rgba(col || [180, 200, 230], 0.55 * a);
    ctx.lineWidth = width;
    ctx.stroke();
    if (flowU != null) {
      const i = Math.floor(clamp(flowU, 0, 0.999) * (pts.length - 1));
      const p = pts[i];
      ctx.globalCompositeOperation = "lighter";
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, width * 2.2);
      g.addColorStop(0, rgba([96, 214, 255], 0.9 * a));
      g.addColorStop(1, rgba([96, 214, 255], 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, width * 2.2, 0, TAU);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
    }
  }

  function pathPts(api, origin, kind, assemble) {
    const { project } = api;
    const o = origin;
    const k = assemble;
    if (kind === "lc") {
      const vial = project([o[0] - 1.35 * k, o[1] + 0.55 * k, o[2] + 0.2]);
      const inject = project([o[0] - 0.85 * k, o[1] + 0.55 * k, o[2]]);
      const colTop = project([o[0] - 0.15 * k, o[1] + 0.95 * k, o[2]]);
      const colBot = project([o[0] - 0.15 * k, o[1] - 0.55 * k, o[2]]);
      const det = project([o[0] + 0.55 * k, o[1] - 0.55 * k, o[2]]);
      const graph = project([o[0] + 1.25 * k, o[1] - 0.15 * k, o[2] + 0.15]);
      const tube = [];
      for (let i = 0; i <= 28; i += 1) {
        const u = i / 28;
        let p;
        if (u < 0.18) p = project([lerp(o[0] - 1.35 * k, o[0] - 0.85 * k, u / 0.18), o[1] + 0.55 * k, o[2] + 0.1]);
        else if (u < 0.35) p = project([o[0] - 0.85 * k, lerp(o[1] + 0.55 * k, o[1] + 0.95 * k, (u - 0.18) / 0.17), o[2]]);
        else if (u < 0.72) {
          const t = (u - 0.35) / 0.37;
          p = project([o[0] - 0.15 * k, lerp(o[1] + 0.95 * k, o[1] - 0.55 * k, t), o[2]]);
        } else {
          const t = (u - 0.72) / 0.28;
          p = project([lerp(o[0] - 0.15 * k, o[0] + 0.55 * k, t), o[1] - 0.55 * k, o[2]]);
        }
        tube.push(p);
      }
      return { vial, inject, colTop, colBot, det, graph, tube };
    }
    const entry = project([o[0] - 1.1 * k, o[1], o[2]]);
    const ion = project([o[0] - 0.35 * k, o[1], o[2]]);
    const analyzer = project([o[0] + 0.55 * k, o[1], o[2]]);
    const graph = project([o[0] + 1.35 * k, o[1] + 0.15 * k, o[2]]);
    const tube = [];
    for (let i = 0; i <= 24; i += 1) {
      const u = i / 24;
      tube.push(project([lerp(o[0] - 1.1 * k, o[0] - 0.35 * k, u), o[1], o[2]]));
    }
    return { entry, ion, analyzer, graph, tube };
  }

  function drawChromatogram(ctx, box, lab, a) {
    const { x, y, w, h } = box;
    ctx.fillStyle = rgba([8, 14, 32], 0.72 * a);
    ctx.strokeStyle = rgba([180, 200, 230], 0.35 * a);
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 10);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = rgba([180, 200, 230], 0.55 * a);
    ctx.font = `600 ${Math.max(9, h * 0.08)}px "IBM Plex Mono", monospace`;
    ctx.fillText(lab.kind === "lc" ? "CHROMATOGRAM" : "MASS SPECTRUM", x + 10, y + 16);
    const base = y + h - 14;
    const left = x + 12;
    const right = x + w - 12;
    ctx.strokeStyle = rgba([160, 180, 210], 0.35 * a);
    ctx.beginPath();
    ctx.moveTo(left, base);
    ctx.lineTo(right, base);
    ctx.stroke();

    lab.hits.peaks = [];
    lab.peaks.forEach((p, i) => {
      if (p.drawn <= 0.01) return;
      const dim = lab.focus && lab.focus !== p.id ? 0.15 : 1;
      const px = lab.kind === "lc" ? lerp(left, right, p.ret) : lerp(left, right, 0.2 + i * 0.28);
      const peakH = h * 0.55 * p.drawn * (lab.focus === p.id ? 1.08 : 1);
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = rgba(p.color, 0.95 * a * dim);
      ctx.fillStyle = rgba(p.color, 0.22 * a * dim);
      ctx.lineWidth = lab.focus === p.id ? 2.4 : 1.6;
      ctx.beginPath();
      ctx.moveTo(px - 16, base);
      ctx.quadraticCurveTo(px - 6, base - peakH * 0.35, px, base - peakH);
      ctx.quadraticCurveTo(px + 6, base - peakH * 0.35, px + 16, base);
      ctx.fill();
      ctx.stroke();
      ctx.globalCompositeOperation = "source-over";
      lab.hits.peaks.push({ id: p.id, x: px, y: base - peakH * 0.55, r: 22 });
    });
  }

  function drawLc(lab, api) {
    const { ctx, project, glow, origin, alpha } = api;
    const a = alpha * ease(lab.assemble);
    if (a < 0.02) return;
    const k = 0.85 + 0.15 * ease(lab.assemble);
    const pts = pathPts(api, origin, "lc", k);
    const chassis = project([origin[0] - 0.15 * k, origin[1] + 0.15 * k, origin[2] - 0.2]);
    const cw = 2.35 * chassis.s * k;
    const ch = 1.55 * chassis.s * k;
    metal(ctx, chassis.x - cw * 0.42, chassis.y - ch * 0.55, cw, ch, a * 0.55, 14);
    // soft cyan edge light — not neon overload
    ctx.strokeStyle = rgba([96, 214, 255], 0.18 * a);
    ctx.lineWidth = 1;
    ctx.strokeRect(chassis.x - cw * 0.42 + 0.5, chassis.y - ch * 0.55 + 0.5, cw - 1, ch - 1);

    // sample vial
    const vialWake = lab.hover === "vial" || lab.phase === "idle" ? 1 : 0.7;
    const vialLift = lab.phase === "inject" ? ease(clamp(lab.age / 0.45, 0, 1)) * 18 : 0;
    const vx = pts.vial.x;
    const vy = pts.vial.y - vialLift;
    const vr = 0.13 * pts.vial.s;
    ctx.fillStyle = rgba([230, 240, 255], 0.75 * a * vialWake);
    ctx.beginPath();
    ctx.roundRect(vx - vr * 0.55, vy - vr * 1.6, vr * 1.1, vr * 2.4, 4);
    ctx.fill();
    const fluid = ctx.createLinearGradient(0, vy - vr, 0, vy + vr);
    fluid.addColorStop(0, rgba([96, 214, 255], 0.15 * a));
    fluid.addColorStop(0.4, rgba([112, 238, 208], 0.55 * a));
    fluid.addColorStop(1, rgba([170, 128, 255], 0.45 * a));
    ctx.fillStyle = fluid;
    ctx.fillRect(vx - vr * 0.42, vy - vr * 0.2, vr * 0.84, vr * 1.1);
    ctx.strokeStyle = rgba([255, 255, 255], 0.5 * a);
    ctx.stroke();
    if (lab.phase === "idle") {
      glow(vx, vy - vr * 1.8, vr * 2.2, [96, 214, 255], 0.25 * a * (0.6 + 0.4 * Math.sin(api.t * 3)));
      ctx.fillStyle = rgba([210, 230, 255], 0.85 * a);
      ctx.font = `600 ${Math.max(10, vr * 0.55)}px Inter, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText("INJECT SAMPLE", vx, vy - vr * 2.35);
      ctx.textAlign = "left";
    }
    lab.hits.vial = { x: vx, y: vy, r: vr * 2.2 };

    // injector block
    metal(ctx, pts.inject.x - 0.12 * pts.inject.s, pts.inject.y - 0.1 * pts.inject.s, 0.28 * pts.inject.s, 0.22 * pts.inject.s, a, 5);

    // column — glass chamber with stationary phase
    const top = pts.colTop;
    const bot = pts.colBot;
    const rw = 0.14 * top.s;
    const colG = ctx.createLinearGradient(top.x - rw, 0, top.x + rw, 0);
    colG.addColorStop(0, rgba([200, 212, 230], 0.35 * a));
    colG.addColorStop(0.45, rgba([248, 252, 255], 0.55 * a));
    colG.addColorStop(1, rgba([140, 155, 180], 0.4 * a));
    ctx.fillStyle = colG;
    ctx.beginPath();
    ctx.moveTo(top.x - rw, top.y);
    ctx.lineTo(top.x + rw, top.y);
    ctx.lineTo(bot.x + rw * 0.92, bot.y);
    ctx.lineTo(bot.x - rw * 0.92, bot.y);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = rgba([255, 255, 255], 0.4 * a);
    ctx.stroke();
    for (let i = 0; i < 40; i += 1) {
      const u = i / 40;
      dot(
        ctx,
        lerp(top.x, bot.x, u) + Math.sin(i * 2.1) * rw * 0.45,
        lerp(top.y, bot.y, u),
        0.8,
        [200, 210, 230],
        0.12 * a
      );
    }

    // compounds in column during separate/detect
    if (lab.phase === "separate" || lab.phase === "detect" || lab.phase === "explore") {
      COMPOUNDS.forEach((c, i) => {
        const dim = lab.focus && lab.focus !== c.id ? 0.12 : 1;
        let u;
        if (lab.phase === "separate") u = clamp((lab.age * c.speed) / 3.2, 0, 1);
        else u = 1;
        const x = lerp(top.x, bot.x, u);
        const y = lerp(top.y, bot.y, u);
        const spread = lab.phase === "separate" ? u * (0.35 + i * 0.2) * rw : 0;
        ctx.globalCompositeOperation = "lighter";
        glow(x + spread, y, rw * 1.6, c.color, 0.55 * a * dim);
        for (let n = 0; n < 5; n += 1) {
          dot(ctx, x + Math.sin(api.t * 2 + n + i) * spread, y + Math.cos(api.t + n) * 3, 1.6, c.color, 0.7 * a * dim);
        }
        ctx.globalCompositeOperation = "source-over";
      });
    }

    // detector
    metal(ctx, pts.det.x - 0.18 * pts.det.s, pts.det.y - 0.14 * pts.det.s, 0.4 * pts.det.s, 0.28 * pts.det.s, a, 6);
    glow(pts.det.x, pts.det.y, 0.2 * pts.det.s, [96, 214, 255], 0.2 * a * (lab.phase === "detect" ? 1 : 0.4));

    let flowU = null;
    if (lab.phase === "inject") flowU = ease(clamp(lab.age / 1.0, 0, 1));
    else if (lab.phase === "separate") flowU = 0.35 + 0.35 * ((lab.age * 0.2) % 1);
    glassTube(ctx, pts.tube, a, Math.max(2.5, 0.035 * top.s), [170, 190, 220], flowU);

    // live graph
    const gw = 1.35 * pts.graph.s;
    const gh = 0.85 * pts.graph.s;
    drawChromatogram(ctx, { x: pts.graph.x - gw * 0.15, y: pts.graph.y - gh * 0.7, w: gw, h: gh }, lab, a);

    if (lab.flash > 0) {
      ctx.globalCompositeOperation = "lighter";
      glow(chassis.x, chassis.y, cw * 0.4, [96, 214, 255], 0.35 * lab.flash * a);
      ctx.globalCompositeOperation = "source-over";
    }
  }

  function drawMs(lab, api) {
    const { ctx, project, glow, origin, alpha } = api;
    const a = alpha * ease(lab.assemble);
    if (a < 0.02) return;
    const k = 0.85 + 0.15 * ease(lab.assemble);
    const pts = pathPts(api, origin, "ms", k);
    const chassis = project([origin[0] + 0.15 * k, origin[1], origin[2] - 0.15]);
    const cw = 2.5 * chassis.s * k;
    const ch = 1.35 * chassis.s * k;
    metal(ctx, chassis.x - cw * 0.48, chassis.y - ch * 0.5, cw, ch, a * 0.5, 14);

    // ionization chamber — glass
    const ion = pts.ion;
    const ir = 0.32 * ion.s;
    const ig = ctx.createRadialGradient(ion.x - ir * 0.3, ion.y - ir * 0.3, ir * 0.1, ion.x, ion.y, ir);
    ig.addColorStop(0, rgba([245, 250, 255], 0.55 * a));
    ig.addColorStop(0.55, rgba([160, 190, 230], 0.2 * a));
    ig.addColorStop(1, rgba([80, 100, 140], 0.25 * a));
    ctx.fillStyle = ig;
    ctx.beginPath();
    ctx.arc(ion.x, ion.y, ir, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = rgba([255, 255, 255], 0.4 * a);
    ctx.stroke();
    if (lab.phase === "ionize" || lab.phase === "analyze") {
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < 12; i += 1) {
        const ang = api.t * 1.4 + (i / 12) * TAU;
        const rr = ir * (0.3 + 0.55 * ((api.t * 0.7 + i * 0.1) % 1));
        glow(ion.x + Math.cos(ang) * rr, ion.y + Math.sin(ang) * rr * 0.7, 6, [170, 128, 255], 0.35 * a);
      }
      ctx.globalCompositeOperation = "source-over";
    }

    glassTube(ctx, pts.tube, a, Math.max(2.5, 0.03 * ion.s), [170, 128, 255], lab.phase === "ionize" ? clamp(lab.age / 1.4, 0, 1) : null);

    // analyzer — fan trajectories
    const an = pts.analyzer;
    metal(ctx, an.x - 0.55 * an.s, an.y - 0.42 * an.s, 1.15 * an.s, 0.84 * an.s, a * 0.85, 12);
    COMPOUNDS.forEach((c, i) => {
      const dim = lab.focus && lab.focus !== c.id ? 0.12 : 1;
      const ionState = lab.ions[i];
      const u = lab.phase === "analyze" ? ionState?.u ?? 0 : lab.phase === "spectrum" || lab.phase === "explore" ? 1 : 0;
      if (u <= 0.01 && lab.phase === "ionize") return;
      const bend = (i - 1) * 0.28;
      const x0 = an.x - 0.45 * an.s;
      const y0 = an.y;
      const x1 = an.x + 0.45 * an.s;
      const y1 = an.y + bend * an.s;
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = rgba(c.color, 0.75 * a * dim * Math.max(0.2, u));
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo(lerp(x0, x1, 0.45), y0 + bend * an.s * 0.2, lerp(x0, x1, u), lerp(y0, y1, u));
      ctx.stroke();
      const px = lerp(x0, x1, u);
      const py = lerp(y0, y1, u);
      glow(px, py, 10, c.color, 0.55 * a * dim);
      ctx.globalCompositeOperation = "source-over";
    });

    const gw = 1.3 * pts.graph.s;
    const gh = 0.9 * pts.graph.s;
    drawChromatogram(ctx, { x: pts.graph.x - gw * 0.2, y: pts.graph.y - gh * 0.55, w: gw, h: gh }, lab, a);
  }

  function dot(ctx, x, y, r, color, a) {
    ctx.fillStyle = rgba(color, a);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }

  function draw(lab, api) {
    lab.hits = { vial: null, peaks: [], continue: null, inject: null };
    if (lab.kind === "lc") drawLc(lab, api);
    else drawMs(lab, api);
  }

  function hit(lab, x, y) {
    if (lab.hits.vial) {
      const v = lab.hits.vial;
      if (Math.hypot(x - v.x, y - v.y) < v.r) return { type: "vial" };
    }
    for (const p of lab.hits.peaks) {
      if (Math.hypot(x - p.x, y - p.y) < p.r) return { type: "peak", id: p.id };
    }
    return null;
  }

  function onAction(lab, action) {
    if (action === "inject") startInject(lab);
    else if (action === "ms") continueToMs(lab);
    else if (action === "again") {
      Object.assign(lab, create("lc"), { assemble: 1 });
    } else if (action === "exit") return "exit";
    else if (action?.type === "peak") {
      lab.focus = lab.focus === action.id ? null : action.id;
      lab.phase = "explore";
    } else if (action?.type === "vial") startInject(lab);
    return null;
  }

  global.WatersLab = { create, update, draw, hit, onAction, panelHtml, caption, COMPOUNDS };
})(window);
