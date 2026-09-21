/* SmartStart motion helpers — count-up, reveal, ripple, tilt */

const ssReduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function countUp(el) {
  const target = parseFloat(el.dataset.count);
  if (Number.isNaN(target)) return;
  const suffix = el.dataset.suffix || "";
  const decimals = el.dataset.decimals ? Number(el.dataset.decimals) : 0;
  if (ssReduceMotion) {
    el.textContent = `${target.toFixed(decimals)}${suffix}`;
    return;
  }
  const duration = 850;
  const start = performance.now();
  function step(now) {
    const p = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = `${(target * eased).toFixed(decimals)}${suffix}`;
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function countUpAll(root) {
  (root || document).querySelectorAll("[data-count]").forEach(countUp);
}

function revealAll(root, selector, stepMs = 34) {
  const nodes = (root || document).querySelectorAll(selector);
  nodes.forEach((node, i) => {
    node.classList.add("reveal");
    const delay = ssReduceMotion ? 0 : Math.min(i * stepMs, 520);
    setTimeout(() => node.classList.add("in"), delay);
  });
}

function attachRipple(selector) {
  document.addEventListener("pointerdown", (e) => {
    if (ssReduceMotion) return;
    const btn = e.target.closest(selector);
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const span = document.createElement("span");
    span.className = "ripple";
    span.style.left = `${e.clientX - rect.left}px`;
    span.style.top = `${e.clientY - rect.top}px`;
    btn.appendChild(span);
    setTimeout(() => span.remove(), 640);
  });
}

function attachTilt(selector, strength = 5) {
  if (ssReduceMotion) return;
  document.addEventListener("pointermove", (e) => {
    const card = e.target.closest(selector);
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    card.style.transform = `translateY(-4px) rotateX(${-py * strength}deg) rotateY(${px * strength}deg)`;
  });
  document.addEventListener("pointerout", (e) => {
    const card = e.target.closest(selector);
    if (card) card.style.transform = "";
  });
}

attachRipple(".btn-primary, .btn-secondary, .path-btn, .btn-mini, .nav-btn, .role-btn, .wx-nav-btn, .chip, .jump-link");
attachTilt(".kpi");
