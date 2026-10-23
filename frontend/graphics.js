/* SmartStart portal graphics — animated particle globe (canvas, no deps) */

(function () {
  const canvas = document.getElementById("portal-canvas");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const POINT_COUNT = 780;
  const ACCENT_RATE = 0.11;
  const points = [];
  const golden = Math.PI * (3 - Math.sqrt(5));

  for (let i = 0; i < POINT_COUNT; i += 1) {
    const y = 1 - (i / (POINT_COUNT - 1)) * 2;
    const radius = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;
    const accent = Math.random() < ACCENT_RATE;
    points.push({
      x: Math.cos(theta) * radius,
      y,
      z: Math.sin(theta) * radius,
      accent,
      hue: accent ? (Math.random() < 0.35 ? "cyan" : "blue") : "white",
      pulse: Math.random() * Math.PI * 2,
      pulseRate: 0.6 + Math.random() * 1.6,
      size: accent ? 1.8 + Math.random() * 2.2 : 0.55 + Math.random() * 1.1,
    });
  }

  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  let width = 0;
  let height = 0;
  let dpr = 1;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = Math.max(rect.width, 1);
    height = Math.max(rect.height, 1);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  resize();
  window.addEventListener("resize", resize);
  if (typeof ResizeObserver === "function") {
    new ResizeObserver(resize).observe(canvas);
  }

  window.addEventListener("pointermove", (e) => {
    const rect = canvas.getBoundingClientRect();
    pointer.tx = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
    pointer.ty = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
  });

  function colorFor(point, depth, alphaBoost) {
    const alpha = Math.min(1, (0.2 + depth * 0.85) * alphaBoost);
    if (point.hue === "blue") return `rgba(88, 118, 255, ${alpha})`;
    if (point.hue === "cyan") return `rgba(60, 220, 245, ${alpha})`;
    return `rgba(232, 238, 255, ${alpha * 0.82})`;
  }

  function frame(time) {
    const t = time / 1000;
    pointer.x += (pointer.tx - pointer.x) * 0.045;
    pointer.y += (pointer.ty - pointer.y) * 0.045;

    ctx.clearRect(0, 0, width, height);

    const cx = width * 0.5;
    const cy = height * 0.46;
    const radius = Math.min(width, height) * 0.36;
    const spin = reduceMotion ? 0.6 : t * 0.16;
    const tiltX = (reduceMotion ? -0.18 : -0.2 + pointer.y * 0.32);
    const yaw = spin + pointer.x * 0.5;

    const cosY = Math.cos(yaw);
    const sinY = Math.sin(yaw);
    const cosX = Math.cos(tiltX);
    const sinX = Math.sin(tiltX);

    const projected = [];
    for (let i = 0; i < points.length; i += 1) {
      const p = points[i];
      const x1 = p.x * cosY - p.z * sinY;
      const z1 = p.x * sinY + p.z * cosY;
      const y2 = p.y * cosX - z1 * sinX;
      const z2 = p.y * sinX + z1 * cosX;

      const perspective = 1 / (1.9 - z2 * 0.55);
      const sx = cx + x1 * radius * perspective * 1.55;
      const sy = cy + y2 * radius * perspective * 1.55;
      const depth = (z2 + 1) / 2;
      projected.push({ p, sx, sy, depth, z: z2 });
    }

    projected.sort((a, b) => a.z - b.z);

    // faint links between nearby accent nodes on the front hemisphere
    const accents = projected.filter((q) => q.p.accent && q.z > -0.15);
    ctx.lineWidth = 0.6;
    for (let i = 0; i < accents.length; i += 1) {
      for (let j = i + 1; j < accents.length; j += 1) {
        const dx = accents[i].sx - accents[j].sx;
        const dy = accents[i].sy - accents[j].sy;
        const dist = Math.hypot(dx, dy);
        if (dist > radius * 0.42) continue;
        const fade = (1 - dist / (radius * 0.42)) * 0.22;
        ctx.strokeStyle = `rgba(110, 140, 255, ${fade})`;
        ctx.beginPath();
        ctx.moveTo(accents[i].sx, accents[i].sy);
        ctx.lineTo(accents[j].sx, accents[j].sy);
        ctx.stroke();
      }
    }

    // sweeping scan band highlights a slice of the globe
    const scan = reduceMotion ? 0.35 : (Math.sin(t * 0.55) + 1) / 2;

    for (let i = 0; i < projected.length; i += 1) {
      const { p, sx, sy, depth } = projected[i];
      const pulse = reduceMotion ? 1 : 0.7 + 0.3 * Math.sin(t * p.pulseRate + p.pulse);
      const nearScan = 1 - Math.min(1, Math.abs(depth - scan) * 5.5);
      const boost = 1 + nearScan * 1.1;
      const size = p.size * (0.45 + depth * 0.95) * pulse * (1 + nearScan * 0.5);

      if (p.accent) {
        ctx.beginPath();
        ctx.fillStyle = colorFor(p, depth, 0.12 * boost);
        ctx.arc(sx, sy, size * 3.4, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.beginPath();
      ctx.fillStyle = colorFor(p, depth, boost);
      ctx.arc(sx, sy, Math.max(0.35, size), 0, Math.PI * 2);
      ctx.fill();
    }

    if (!reduceMotion) requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
})();
