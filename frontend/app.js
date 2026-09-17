/* SmartStart Employer Command Center */

const PIPELINE_STAGES = [
  "OFFER_ACCEPTED",
  "DOCS_SUBMITTED",
  "IT_PROVISIONED",
  "DAY1_ORIENTED",
  "PROJECT_READY",
];

const STAGE_LABELS = {
  OFFER_ACCEPTED: "Offer",
  DOCS_SUBMITTED: "Docs",
  IT_PROVISIONED: "IT",
  DAY1_ORIENTED: "Day-1",
  PROJECT_READY: "Ready",
};

const state = {
  role: "All",
  section: "dashboard",
  dashboard: null,
  alerts: null,
  analytics: null,
  integrations: null,
  selectedId: null,
  actions: {}, // joinerId -> { status: 'assigned'|'resolved', note }
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

function kpi(label, value, hint = "", tone = "") {
  return `<div class="kpi ${tone}">
    <div class="kpi-accent" aria-hidden="true"></div>
    <div class="label">${label}</div>
    <div class="value">${value}</div>
    ${hint ? `<div class="hint">${hint}</div>` : ""}
  </div>`;
}

function stateBadge(s) {
  return `<span class="badge state-${s}" title="Onboarding stage: ${String(s).replaceAll("_", " ")}">${String(s).replaceAll("_", " ")}</span>`;
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

function stageIndex(s) {
  const i = PIPELINE_STAGES.indexOf(s);
  return i < 0 ? 0 : i;
}

function pipelineProgress(current, days) {
  const idx = stageIndex(current);
  const pct = Math.round(((idx + 1) / PIPELINE_STAGES.length) * 100);
  const dayHint =
    typeof days === "number" ? ` · ${days} days since offer` : "";
  const dots = PIPELINE_STAGES.map((s, i) => {
    const cls = i < idx ? "done" : i === idx ? "current" : "todo";
    return `<span class="pipe-dot ${cls}" title="${STAGE_LABELS[s]}"></span>`;
  }).join("");
  return `<div class="pipe" title="${pct}% through onboarding${dayHint}">
    <div class="pipe-track"><div class="pipe-fill" style="width:${pct}%"></div></div>
    <div class="pipe-dots">${dots}</div>
  </div>`;
}

function bottleneckTag(text) {
  if (!text) {
    return `<span class="bn-tag ok"><span class="bn-dot" aria-hidden="true"></span>On track</span>`;
  }
  const t = String(text);
  let kind = "warn";
  if (/document|docs|iCIMS/i.test(t)) kind = "docs";
  else if (/IT|SLA|ServiceNow|hardware/i.test(t)) kind = "it";
  else if (/project|Jira/i.test(t)) kind = "mgr";
  else if (/Day-1|orientation/i.test(t)) kind = "day1";
  return `<span class="bn-tag ${kind}"><span class="bn-dot" aria-hidden="true"></span>${esc(t)}</span>`;
}

function actionCell(row) {
  const act = state.actions[row.id];
  if (!row.bottleneck) {
    return `<span class="muted tiny">—</span>`;
  }
  if (act?.status === "resolved") {
    return `<span class="bn-tag ok">Resolved</span>`;
  }
  if (act?.status === "assigned") {
    return `<div class="row-actions">
      <span class="muted tiny">Assigned</span>
      <button type="button" class="btn-mini" data-act="resolve" data-id="${esc(row.id)}">Resolve</button>
    </div>`;
  }
  return `<div class="row-actions">
    <button type="button" class="btn-mini primary" data-act="assign" data-id="${esc(row.id)}">Assign</button>
    <button type="button" class="btn-mini" data-act="resolve" data-id="${esc(row.id)}">Resolve</button>
  </div>`;
}

function renderDashboard() {
  const data = state.dashboard;
  if (!data) return;
  const rows = filterRows(data.rows);
  const by = data.by_state || {};
  document.getElementById("dashboard-kpis").innerHTML = [
    kpi("Joiners", data.total_joiners, "Full synthetic cohort", "tone-all"),
    kpi("Offer accepted", by.OFFER_ACCEPTED || 0, "HR · early pipeline", "tone-hr"),
    kpi("IT provisioned", by.IT_PROVISIONED || 0, "IT · hardware ready", "tone-it"),
    kpi("Project ready", by.PROJECT_READY || 0, "Manager · ship-ready", "tone-mgr"),
  ].join("");
  document.getElementById("dashboard-count").textContent =
    `${rows.length} shown · role filter: ${state.role}`;
  document.querySelector("#joiners-table tbody").innerHTML = rows
    .map(
      (r) => `<tr class="joiner-row ${state.selectedId === r.id ? "selected" : ""}" data-id="${esc(r.id)}" tabindex="0">
      <td class="joiner-cell">
        <button type="button" class="joiner-open" data-open="${esc(r.id)}">
          <div class="name">${esc(r.name)}</div>
          <div class="email">${esc(r.email)}</div>
        </button>
      </td>
      <td>${r.role_type}</td>
      <td>${esc(r.department)}</td>
      <td>${stateBadge(r.current_state)}</td>
      <td>${pipelineProgress(r.current_state, r.days_in_pipeline)}</td>
      <td>${bottleneckTag(r.bottleneck)}</td>
      <td>${actionCell(r)}</td>
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
      ${
        a.joiner_id
          ? `<button type="button" class="btn-mini" data-open="${esc(a.joiner_id)}">Open joiner</button>`
          : ""
      }
    </article>`
    )
    .join("");
}

function renderAnalytics() {
  const a = state.analytics;
  if (!a) return;
  document.getElementById("analytics-kpis").innerHTML = [
    kpi("Avg onboarding days", a.avg_onboarding_days, "Synthetic timestamps", "tone-all"),
    kpi("Avg IT lead time", a.avg_it_lead_time_days, "Days to hardware", "tone-it"),
    kpi("Completion rate", `${a.completion_rate_pct}%`, "PROJECT_READY", "tone-mgr"),
    kpi("Active joiners", a.active_joiners, `${a.docs_pending} docs pending`, "tone-hr"),
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
      <div>
        <button type="button" class="joiner-open" data-open="${esc(r.id)}"><strong>${esc(r.name)}</strong></button>
        <span>${esc(r.email)}</span>
      </div>
      <div>${stateBadge(r.current_state)}</div>
      <div>${bottleneckTag(r.bottleneck)}</div>
      <div class="row-actions">${
        r.bottleneck && !state.actions[r.id]
          ? `<button type="button" class="btn-mini primary" data-act="assign" data-id="${esc(r.id)}">Assign</button>`
          : r.role_type
      }</div>
    </div>`
    )
    .join("");
}

async function openJoinerDrawer(id) {
  state.selectedId = id;
  const drawer = document.getElementById("joiner-drawer");
  const backdrop = document.getElementById("drawer-backdrop");
  const body = document.getElementById("drawer-body");
  drawer.hidden = false;
  backdrop.hidden = false;
  drawer.setAttribute("aria-hidden", "false");
  body.innerHTML = `<p class="muted">Loading synthetic detail…</p>`;

  const row = (state.dashboard?.rows || []).find((r) => r.id === id);
  try {
    const detail = await fetchJSON(`/api/joiners/${encodeURIComponent(id)}`);
    const j = detail.joiner;
    document.getElementById("drawer-name").textContent = j.name;
    document.getElementById("drawer-email").textContent = j.email;
    document.getElementById("drawer-kicker").textContent =
      `${j.role_type} · ${j.department} · ${detail.days_in_pipeline} days in pipeline`;

    const idx = stageIndex(j.current_state);
    const timeline = PIPELINE_STAGES.map((s, i) => {
      const cls = i < idx ? "done" : i === idx ? "current" : "todo";
      return `<li class="tl-item ${cls}">
        <span class="tl-dot"></span>
        <div>
          <strong>${STAGE_LABELS[s]}</strong>
          <div class="muted tiny">${s.replaceAll("_", " ")}</div>
        </div>
      </li>`;
    }).join("");

    const tasks = (j.assigned_tasks || row?.assigned_tasks || []).length
      ? `<ul class="drawer-tasks">${(j.assigned_tasks || row.assigned_tasks)
          .map((t) => `<li>${esc(t)}</li>`)
          .join("")}</ul>`
      : `<p class="muted tiny">No assigned tasks yet.</p>`;

    const act = state.actions[id];
    const bn = detail.bottleneck || row?.bottleneck;
    body.innerHTML = `
      <dl class="drawer-meta">
        <div><dt>State</dt><dd>${stateBadge(j.current_state)}</dd></div>
        <div><dt>Mentor</dt><dd>${esc(j.mentor_name)}</dd></div>
        <div><dt>Docs</dt><dd>${esc(detail.documents.status)}</dd></div>
        <div><dt>Hardware</dt><dd>${esc(detail.it_ticket.hardware_status)}${
          detail.it_ticket.sla_breached ? ' <span class="badge danger">SLA</span>' : ""
        }</dd></div>
      </dl>
      <section class="drawer-section">
        <h3>Bottleneck</h3>
        ${bottleneckTag(bn)}
        <div class="row-actions drawer-acts">
          ${
            bn && act?.status !== "resolved"
              ? `<button type="button" class="btn-mini primary" data-act="assign" data-id="${esc(id)}">Assign owner</button>
                 <button type="button" class="btn-mini" data-act="resolve" data-id="${esc(id)}">Mark resolved</button>`
              : bn
                ? `<span class="bn-tag ok">Resolved (demo)</span>`
                : ""
          }
          <a class="btn-link" href="/employee?id=${encodeURIComponent(id)}">Open employee view →</a>
        </div>
      </section>
      <section class="drawer-section">
        <h3>Timeline</h3>
        <ol class="timeline">${timeline}</ol>
      </section>
      <section class="drawer-section">
        <h3>Tasks</h3>
        ${tasks}
      </section>
      <section class="drawer-section">
        <h3>Learning track</h3>
        <p>${esc(j.learning_track)} · ${esc(j.department_track)}</p>
        <p class="muted tiny">Join date ${esc(j.joining_date)}</p>
      </section>
    `;
    renderDashboard();
  } catch (err) {
    body.innerHTML = `<p class="load-error">Failed to load joiner: ${esc(err.message)}</p>`;
  }
}

function closeDrawer() {
  state.selectedId = null;
  document.getElementById("joiner-drawer").hidden = true;
  document.getElementById("drawer-backdrop").hidden = true;
  document.getElementById("joiner-drawer").setAttribute("aria-hidden", "true");
  renderDashboard();
}

function handleAction(act, id) {
  if (!id) return;
  state.actions[id] = {
    status: act === "resolve" ? "resolved" : "assigned",
    at: new Date().toISOString(),
  };
  showToast(
    act === "resolve"
      ? "Bottleneck marked resolved (synthetic demo — not persisted)"
      : "Owner assigned (synthetic demo — not persisted)"
  );
  render();
  if (state.selectedId === id) openJoinerDrawer(id);
}

function showToast(msg) {
  const el = document.getElementById("toast");
  el.hidden = false;
  el.textContent = msg;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => {
    el.hidden = true;
  }, 2800);
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
  return String(v ?? "")
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
  document.getElementById("drawer-close").addEventListener("click", closeDrawer);
  document.getElementById("drawer-backdrop").addEventListener("click", closeDrawer);

  document.addEventListener("click", (e) => {
    const openBtn = e.target.closest("[data-open]");
    if (openBtn) {
      e.preventDefault();
      openJoinerDrawer(openBtn.dataset.open);
      return;
    }
    const actBtn = e.target.closest("[data-act]");
    if (actBtn) {
      e.preventDefault();
      e.stopPropagation();
      handleAction(actBtn.dataset.act, actBtn.dataset.id);
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeDrawer();
  });
}

wireUI();
loadAll().catch((err) => {
  console.error(err);
  document.getElementById("page-subtitle").textContent =
    `Failed to load synthetic API: ${err.message}`;
});
