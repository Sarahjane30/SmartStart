/* SmartStart Employer Command Center */

const state = {
  role: "All",
  section: "dashboard",
  dashboard: null,
  alerts: null,
  analytics: null,
  integrations: null,
};

const TITLES = {
  dashboard: ["Dashboard", "Pipeline status across all synthetic joiners"],
  alerts: ["Alerts", "Synthetic SLA breaches and pending onboarding tasks"],
  analytics: ["Analytics", "KPIs from synthetic timestamps — seed-stable demo"],
  roles: ["Role Views", "Mock iCIMS / ServiceNow / Jira connectors + role queues"],
};

async function fetchJSON(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json();
}

async function loadAll() {
  const roleQ = encodeURIComponent(state.role);
  const [dashboard, alerts, analytics, integrations] = await Promise.all([
    fetchJSON(`/api/dashboard?role_view=${roleQ}`),
    fetchJSON(`/api/alerts?role_view=${roleQ}`),
    fetchJSON(`/api/analytics`),
    fetchJSON(`/api/integrations`),
  ]);
  state.dashboard = dashboard;
  state.alerts = alerts;
  state.analytics = analytics;
  state.integrations = integrations;
  render();
}

function render() {
  renderDashboard();
  renderAlerts();
  renderAnalytics();
  renderRoles();
}

function kpi(label, value, hint = "") {
  return `<div class="kpi"><div class="label">${label}</div><div class="value">${value}</div>${
    hint ? `<div class="hint">${hint}</div>` : ""
  }</div>`;
}

function stateBadge(s) {
  return `<span class="badge state-${s}">${String(s).replaceAll("_", " ")}</span>`;
}

function docsBadge(status) {
  return `<span class="badge ${status === "Complete" ? "ok" : "warn"}">${status}</span>`;
}

function itBadge(row) {
  if (row.it_sla_breached) {
    return `<span class="badge danger">SLA · ${row.hardware_status}</span>`;
  }
  return `<span class="badge ${
    row.hardware_status === "Delivered" ? "ok" : "warn"
  }">${row.hardware_status}</span>`;
}

function filterRows(rows) {
  if (state.role === "All") return rows;
  if (state.role === "HR") {
    return rows.filter(
      (r) =>
        r.docs_status !== "Complete" ||
        ["OFFER_ACCEPTED", "DOCS_SUBMITTED", "IT_PROVISIONED"].includes(r.current_state)
    );
  }
  if (state.role === "IT") {
    return rows.filter(
      (r) =>
        r.it_sla_breached ||
        r.hardware_status !== "Delivered" ||
        r.current_state === "DOCS_SUBMITTED"
    );
  }
  return rows.filter(
    (r) =>
      r.current_state === "DAY1_ORIENTED" ||
      r.current_state === "PROJECT_READY" ||
      (r.assigned_tasks && r.assigned_tasks.length)
  );
}

function renderDashboard() {
  const data = state.dashboard;
  if (!data) return;
  const rows = filterRows(data.rows);
  const by = data.by_state || {};
  document.getElementById("dashboard-kpis").innerHTML = [
    kpi("Joiners", data.total_joiners, "Synthetic cohort"),
    kpi("Offer accepted", by.OFFER_ACCEPTED || 0),
    kpi("IT provisioned", by.IT_PROVISIONED || 0),
    kpi("Project ready", by.PROJECT_READY || 0),
  ].join("");
  document.getElementById("dashboard-count").textContent =
    `${rows.length} shown · role filter: ${state.role}`;
  document.querySelector("#joiners-table tbody").innerHTML = rows
    .map(
      (r) => `<tr>
      <td class="joiner-cell"><div class="name"><a class="btn-link" href="/employee?id=${encodeURIComponent(r.id)}">${esc(r.name)}</a></div><div class="email">${esc(r.email)}</div></td>
      <td>${r.role_type}</td>
      <td>${esc(r.department)}</td>
      <td>${stateBadge(r.current_state)}</td>
      <td>${r.days_in_pipeline}</td>
      <td>${docsBadge(r.docs_status)}</td>
      <td>${itBadge(r)}</td>
      <td>${esc(r.bottleneck || "—")}</td>
    </tr>`
    )
    .join("");
}

function renderAlerts() {
  const data = state.alerts;
  if (!data) return;
  document.getElementById("alerts-count").textContent =
    `${data.total} alerts · synthetic · as of ${fmt(data.as_of)}`;
  const list = document.getElementById("alerts-list");
  if (!data.alerts.length) {
    list.innerHTML = `<p class="muted">No alerts for this role view.</p>`;
    return;
  }
  list.innerHTML = data.alerts
    .map(
      (a) => `<article class="alert ${a.severity}">
      <div class="alert-top">
        <div class="alert-title">${esc(a.title)}</div>
        <div class="alert-meta">${a.severity.toUpperCase()} · ${esc(a.category)} · ${esc(a.role_view)}</div>
      </div>
      <div class="alert-msg">${esc(a.message)}</div>
    </article>`
    )
    .join("");
}

function renderAnalytics() {
  const a = state.analytics;
  if (!a) return;
  document.getElementById("analytics-kpis").innerHTML = [
    kpi("Avg onboarding days", a.avg_onboarding_days, "Synthetic timestamps"),
    kpi("Avg IT lead time", a.avg_it_lead_time_days, "Days to hardware"),
    kpi("Completion rate", `${a.completion_rate_pct}%`, "PROJECT_READY"),
    kpi("Active joiners", a.active_joiners, `${a.docs_pending} docs pending`),
  ].join("");

  drawBars(
    document.getElementById("bottleneck-chart"),
    Object.keys(a.bottleneck_counts || {}),
    Object.values(a.bottleneck_counts || {}),
    "#0f6a56"
  );
  drawLine(
    document.getElementById("trend-chart"),
    (a.onboarding_trend || []).map((p) => p.label),
    (a.onboarding_trend || []).map((p) => p.value),
    "#245b7a"
  );
  document.getElementById("state-days").innerHTML = Object.entries(a.avg_days_by_state || {})
    .map(
      ([s, v]) =>
        `<div class="state-day"><div class="s">${s.replaceAll("_", " ")}</div><div class="v">${v}d</div></div>`
    )
    .join("");
}

function renderRoles() {
  const data = state.integrations;
  if (!data) return;
  document.getElementById("integrations").innerHTML = (data.integrations || [])
    .map(
      (i) => `<div class="integration">
      <div class="sys">${esc(i.domain)}</div>
      <h3>${esc(i.system)}</h3>
      <dl>
        <dt>Status</dt><dd>${esc(i.status)}</dd>
        <dt>Records</dt><dd>${i.record_count}</dd>
        <dt>Open items</dt><dd>${i.open_items}</dd>
      </dl>
      <p class="muted tiny" style="margin:0.7rem 0 0">${esc((i.sample_payload && i.sample_payload.note) || "")}</p>
    </div>`
    )
    .join("");

  const rows = filterRows(state.dashboard?.rows || []);
  document.getElementById("role-focus-label").textContent =
    `${state.role} queue · ${rows.length} items`;
  document.getElementById("role-focus").innerHTML = rows
    .slice(0, 12)
    .map(
      (r) => `<div class="focus-item">
      <div><strong>${esc(r.name)}</strong><span>${esc(r.email)}</span></div>
      <div>${stateBadge(r.current_state)}</div>
      <div><span>${esc(r.bottleneck || "On track")}</span></div>
      <div>${r.role_type}</div>
    </div>`
    )
    .join("");
}

function drawBars(canvas, labels, values, color) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  if (!labels.length) return;
  const pad = { t: 24, r: 16, b: 70, l: 40 };
  const max = Math.max(...values, 1);
  const barW = (w - pad.l - pad.r) / labels.length;
  ctx.strokeStyle = "#d5ddd6";
  ctx.beginPath();
  ctx.moveTo(pad.l, h - pad.b);
  ctx.lineTo(w - pad.r, h - pad.b);
  ctx.stroke();
  labels.forEach((label, i) => {
    const x = pad.l + i * barW + barW * 0.15;
    const bh = ((h - pad.t - pad.b) * values[i]) / max;
    const y = h - pad.b - bh;
    ctx.fillStyle = color;
    ctx.fillRect(x, y, barW * 0.7, bh);
    ctx.fillStyle = "#5d6b63";
    ctx.font = "11px IBM Plex Mono, monospace";
    ctx.save();
    ctx.translate(x + barW * 0.35, h - pad.b + 12);
    ctx.rotate(-0.65);
    ctx.fillText(clip(label, 22), 0, 0);
    ctx.restore();
    ctx.fillStyle = "#1c2a24";
    ctx.fillText(String(values[i]), x + 4, y - 6);
  });
}

function drawLine(canvas, labels, values, color) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  if (!labels.length) return;
  const pad = { t: 24, r: 20, b: 36, l: 40 };
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 1);
  const plotW = w - pad.l - pad.r;
  const plotH = h - pad.t - pad.b;
  const points = values.map((v, i) => ({
    x: pad.l + (plotW * i) / Math.max(labels.length - 1, 1),
    y: pad.t + plotH - ((v - min) / span) * plotH,
    v,
    label: labels[i],
  }));
  ctx.strokeStyle = "#d5ddd6";
  ctx.beginPath();
  ctx.moveTo(pad.l, h - pad.b);
  ctx.lineTo(w - pad.r, h - pad.b);
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.stroke();
  points.forEach((p) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1c2a24";
    ctx.font = "11px IBM Plex Mono, monospace";
    ctx.fillText(String(p.v), p.x - 8, p.y - 10);
    ctx.fillStyle = "#5d6b63";
    ctx.fillText(p.label, p.x - 8, h - 12);
  });
}

function setSection(name) {
  state.section = name;
  document.querySelectorAll(".section").forEach((el) => el.classList.remove("active"));
  document.getElementById(`section-${name}`).classList.add("active");
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.section === name);
  });
  const [title, subtitle] = TITLES[name];
  document.getElementById("page-title").textContent = title;
  document.getElementById("page-subtitle").textContent = subtitle;
}

function esc(v) {
  return String(v)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
function clip(t, n) {
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}
function fmt(iso) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function wireUI() {
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => setSection(btn.dataset.section));
  });
  document.querySelectorAll(".role-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      state.role = btn.dataset.role;
      document.querySelectorAll(".role-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      await loadAll();
    });
  });
  document.getElementById("refresh-btn").addEventListener("click", () => loadAll());
}

wireUI();
loadAll().catch((err) => {
  console.error(err);
  document.getElementById("page-subtitle").textContent =
    `Failed to load synthetic API: ${err.message}`;
});
