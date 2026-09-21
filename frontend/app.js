/* SmartStart Employer Command Center */

const employerSession = requireEmployerSession();
if (!employerSession) {
  /* redirect in progress */
}

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
  actions: {}, // joinerId -> { status, ownerId, ownerName, ownerTeam, at }
};

const TITLES = {
  dashboard: [
    "Dashboard",
    "Work-queue filters (HR / IT / Manager) show joiners with that kind of bottleneck — not which hiring manager owns them",
  ],
  alerts: ["Alerts", "SLA breaches and pending work for the selected work queue"],
  analytics: [
    "Analytics",
    "KPIs for the filtered queue — switch HR / IT / Manager and the numbers change",
  ],
  roles: ["Role Views", "Mock iCIMS / ServiceNow / Jira connectors + queue for this lens"],
};

const FILTER_EXPLAIN = {
  All: "<strong>All</strong> — every joiner in your scope. These buttons are <em>work queues</em> (who needs to act), not which hiring manager owns the person.",
  HR: "<strong>HR queue</strong> — only joiners whose bottleneck is docs / iCIMS. Assign opens People Ops teammates.",
  IT: "<strong>IT queue</strong> — only joiners whose bottleneck is hardware / ServiceNow / SLA. Assign opens IT partners.",
  Manager: "<strong>Manager queue</strong> — only joiners whose bottleneck is Day-1 or project assignment. Assign opens the hiring manager, mentor, and peer managers.",
};

function paintSignedIn() {
  const el = document.getElementById("signed-in-user");
  if (!el || !employerSession) return;
  const scope = employerSession.managerId
    ? `Team · ${employerSession.managerId}`
    : "Full cohort";
  el.innerHTML = `<strong>${esc(employerSession.displayName || employerSession.username)}</strong>
    <span class="muted tiny">${esc(employerSession.title || employerSession.employerPersona)} · ${esc(scope)}</span>`;
}

async function fetchJSON(path) {
  const res = await fetch(path, { headers: { ...employerAuthHeaders() } });
  if (!res.ok) {
    if (res.status === 401) {
      clearSession();
      window.location.replace("/?need=employer");
      throw new Error("Employer login required");
    }
    throw new Error(`${path} → ${res.status}`);
  }
  return res.json();
}

async function loadAll() {
  const roleQ = encodeURIComponent(state.role);
  const [dashboard, alerts, analytics, integrations] = await Promise.all([
    fetchJSON(`/api/dashboard?role_view=${roleQ}`),
    fetchJSON(`/api/alerts?role_view=${roleQ}`),
    fetchJSON(`/api/analytics?role_view=${roleQ}`),
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
  const raw = String(value);
  const match = raw.match(/^(-?\d+(?:\.\d+)?)(\D*)$/);
  const valueAttrs = match
    ? ` data-count="${match[1]}" data-suffix="${esc(match[2])}" data-decimals="${
        match[1].includes(".") ? match[1].split(".")[1].length : 0
      }"`
    : "";
  return `<div class="kpi ${tone}">
    <div class="kpi-accent" aria-hidden="true"></div>
    <div class="label">${label}</div>
    <div class="value"${valueAttrs}>${match ? "0" : esc(raw)}</div>
    ${hint ? `<div class="hint">${hint}</div>` : ""}
  </div>`;
}

function stateBadge(s) {
  return `<span class="badge state-${s}" title="Onboarding stage: ${String(s).replaceAll("_", " ")}">${String(s).replaceAll("_", " ")}</span>`;
}

function filterRows(rows) {
  // Server already scopes by role_view; keep identity for callers.
  return rows || [];
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

function paintFilterExplain() {
  const el = document.getElementById("filter-explain");
  if (!el) return;
  el.innerHTML = FILTER_EXPLAIN[state.role] || FILTER_EXPLAIN.All;
}

function actionCell(row) {
  const act = state.actions[row.id];
  if (!row.bottleneck) {
    return `<span class="muted tiny">—</span>`;
  }
  if (act?.status === "resolved") {
    return `<span class="bn-tag ok">Resolved${
      act.ownerName ? ` · ${esc(act.ownerName)}` : ""
    }</span>`;
  }
  if (act?.status === "assigned") {
    return `<div class="row-actions">
      <span class="owner-chip" title="${esc(act.ownerTeam || "")}">${esc(act.ownerName || "Assigned")}</span>
      <button type="button" class="btn-mini" data-act="assign" data-id="${esc(row.id)}">Reassign</button>
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
    kpi("In this view", data.total_joiners, `${state.role} employer lens`, "tone-all"),
    kpi("Offer accepted", by.OFFER_ACCEPTED || 0, "Early pipeline", "tone-hr"),
    kpi("IT provisioned", by.IT_PROVISIONED || 0, "Hardware stage", "tone-it"),
    kpi("Project ready", by.PROJECT_READY || 0, "Manager handoff done", "tone-mgr"),
  ].join("");
  const mgrNote = employerSession?.managerId
    ? `your team (${employerSession.displayName})`
    : "split across 4 hiring managers";
  document.getElementById("dashboard-count").textContent =
    `${rows.length} joiners · ${mgrNote} · each has their own mentor`;
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
      <td><span class="mgr-chip" title="${esc(r.manager_id)}">${esc(r.manager_name)}</span></td>
      <td>${stateBadge(r.current_state)}</td>
      <td>${pipelineProgress(r.current_state, r.days_in_pipeline)}</td>
      <td>${bottleneckTag(r.bottleneck)}</td>
      <td>${actionCell(r)}</td>
    </tr>`
    )
    .join("");

  countUpAll(document.getElementById("dashboard-kpis"));
  revealAll(document.querySelector("#joiners-table tbody"), ".joiner-row", 28);
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
  revealAll(list, ".alert", 30);
}

function renderAnalytics() {
  const a = state.analytics;
  if (!a) return;
  const focus = document.getElementById("analytics-focus");
  if (focus) {
    focus.innerHTML = `<strong>${esc(a.role_view || state.role)} view</strong> · ${esc(
      a.focus_note || ""
    )} · <span class="mono">${a.cohort_size || 0} joiners in cohort</span>`;
  }
  const bnSub = document.getElementById("bn-chart-sub");
  if (bnSub) bnSub.textContent = `${a.cohort_size || 0} joiners`;

  const kpis =
    state.role === "HR"
      ? [
          kpi("In HR queue", a.cohort_size, a.focus_note, "tone-hr"),
          kpi("Docs pending", a.docs_pending, "iCIMS packet still open", "tone-hr"),
          kpi("Avg days in view", a.avg_onboarding_days, "Since offer accepted", "tone-all"),
          kpi("Project ready", a.project_ready_count, "Already past HR gates", "tone-mgr"),
        ]
      : state.role === "IT"
        ? [
            kpi("In IT queue", a.cohort_size, a.focus_note, "tone-it"),
            kpi("Avg IT lead time", a.avg_it_lead_time_days, "Days to hardware", "tone-it"),
            kpi("SLA breaches", a.sla_breaches || 0, "ServiceNow synthetic", "tone-it"),
            kpi("Active in view", a.active_joiners, "Not project-ready yet", "tone-all"),
          ]
        : state.role === "Manager"
          ? [
              kpi("Manager queue", a.cohort_size, "Day-1 / project readiness", "tone-mgr"),
              kpi("Project ready", a.project_ready_count, "Ready for Jira assignment", "tone-mgr"),
              kpi("Completion rate", `${a.completion_rate_pct}%`, "Of this queue", "tone-mgr"),
              kpi("Avg days in view", a.avg_onboarding_days, "Hiring managers split the cohort", "tone-all"),
            ]
          : [
              kpi("Cohort size", a.cohort_size, "Full synthetic cohort", "tone-all"),
              kpi("Avg onboarding days", a.avg_onboarding_days, "Since offer accepted", "tone-all"),
              kpi("Avg IT lead time", a.avg_it_lead_time_days, "Days to hardware", "tone-it"),
              kpi("Completion rate", `${a.completion_rate_pct}%`, `${a.docs_pending} docs pending`, "tone-mgr"),
            ];
  document.getElementById("analytics-kpis").innerHTML = kpis.join("");
  countUpAll(document.getElementById("analytics-kpis"));

  drawBars(
    document.getElementById("bottleneck-chart"),
    Object.keys(a.bottleneck_counts || {}),
    Object.values(a.bottleneck_counts || {}),
    ["#163a7a", "#0e1631"]
  );
  drawBars(
    document.getElementById("trend-chart"),
    (a.onboarding_trend || []).map((p) => p.label),
    (a.onboarding_trend || []).map((p) => p.value),
    ["#1e4a8c", "#0e1631"]
  );
  const stateDays = document.getElementById("state-days");
  stateDays.innerHTML = Object.entries(a.avg_days_by_state || {})
    .map(
      ([s, v]) =>
        `<div class="state-day"><div class="s">${s.replaceAll("_", " ")}</div><div class="v" data-count="${v}" data-suffix="d" data-decimals="${
          String(v).includes(".") ? String(v).split(".")[1].length : 0
        }">0</div></div>`
    )
    .join("") || `<p class="muted">No joiners in this view.</p>`;
  countUpAll(stateDays);
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

  revealAll(document.getElementById("integrations"), ".integration", 60);

  const rows = filterRows(state.dashboard?.rows || []);
  document.getElementById("role-focus-label").textContent =
    `${state.role} queue · ${rows.length} items`;
  const focus = document.getElementById("role-focus");
  focus.innerHTML = rows
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
  revealAll(focus, ".focus-item", 32);
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
        <div><dt>Hiring manager</dt><dd>${esc(j.manager_name)} <span class="muted tiny">(${esc(j.manager_id)})</span></dd></div>
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
            act?.status === "assigned"
              ? `<span class="owner-chip">${esc(act.ownerName || "Assigned")}</span>`
              : ""
          }
          ${
            bn && act?.status !== "resolved"
              ? `<button type="button" class="btn-mini primary" data-act="assign" data-id="${esc(id)}">${
                  act?.status === "assigned" ? "Reassign" : "Assign owner"
                }</button>
                 <button type="button" class="btn-mini" data-act="resolve" data-id="${esc(id)}">Mark resolved</button>`
              : bn
                ? `<span class="bn-tag ok">Resolved${
                    act?.ownerName ? ` · ${esc(act.ownerName)}` : ""
                  }</span>`
                : ""
          }
          <a class="btn-link" href="/?need=employee">View as this joiner (portal) →</a>
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

function closeAssignModal() {
  document.getElementById("assign-modal").hidden = true;
  document.getElementById("assign-backdrop").hidden = true;
}

async function openAssignModal(id) {
  const modal = document.getElementById("assign-modal");
  const backdrop = document.getElementById("assign-backdrop");
  const body = document.getElementById("assign-body");
  modal.hidden = false;
  backdrop.hidden = false;
  body.innerHTML = `<p class="muted">Loading team…</p>`;
  try {
    const data = await fetchJSON(`/api/joiners/${encodeURIComponent(id)}/owners`);
    document.getElementById("assign-title").textContent =
      `Assign · ${data.joiner_name}`;
    document.getElementById("assign-sub").textContent = data.bottleneck
      ? `Bottleneck: ${data.bottleneck}`
      : "No active bottleneck — pick a partner anyway if you need one";
    document.getElementById("assign-kicker").textContent =
      `${data.queue} work queue · ${data.department} · hiring manager ${data.manager_name}`;

    const groups = {};
    for (const o of data.owners || []) {
      (groups[o.team] ||= []).push(o);
    }
    const order = ["HR", "IT", "Manager", "Mentor", "Ops"];
    const keys = [
      ...order.filter((k) => groups[k]),
      ...Object.keys(groups).filter((k) => !order.includes(k)),
    ];

    const recommended = (data.owners || []).filter((o) => o.recommended);
    body.innerHTML = `
      <p class="assign-lede">Pick someone on the <strong>${esc(data.queue)}</strong> team to own this joiner’s bottleneck. Synthetic demo only — not saved to a real system.</p>
      ${
        recommended.length
          ? `<p class="muted tiny assign-note">${recommended.length} suggested · click a row to assign</p>`
          : `<p class="muted tiny assign-note">${esc(data.note || "")}</p>`
      }
      ${keys
        .map((team) => {
          const rows = groups[team]
            .map((o) => {
              const initials = o.name
                .split(/\s+/)
                .map((p) => p[0])
                .join("")
                .slice(0, 2)
                .toUpperCase();
              return `<button type="button" class="owner-row ${
                o.recommended ? "recommended" : ""
              }" data-pick-owner="${esc(o.id)}" data-joiner="${esc(id)}"
                data-owner-name="${esc(o.name)}" data-owner-team="${esc(o.team)}">
                <span class="owner-avatar" aria-hidden="true">${esc(initials)}</span>
                <span class="owner-meta">
                  <strong>${esc(o.name)}</strong>
                  <span class="muted tiny">${esc(o.title)} · ${esc(o.focus)}</span>
                </span>
                ${
                  o.recommended
                    ? `<span class="owner-rec">Suggested</span>`
                    : `<span class="owner-pick">Select</span>`
                }
              </button>`;
            })
            .join("");
          return `<section class="owner-group">
            <h3>${esc(team)} team · ${groups[team].length}</h3>
            <div class="owner-list">${rows}</div>
          </section>`;
        })
        .join("")}`;
  } catch (err) {
    body.innerHTML = `<p class="load-error">Could not load team: ${esc(err.message)}</p>`;
  }
}

function confirmAssign(joinerId, ownerId, ownerName, ownerTeam) {
  state.actions[joinerId] = {
    status: "assigned",
    ownerId,
    ownerName,
    ownerTeam,
    at: new Date().toISOString(),
  };
  closeAssignModal();
  showToast(`Assigned to ${ownerName} (${ownerTeam}) — synthetic demo, not persisted`);
  render();
  if (state.selectedId === joinerId) openJoinerDrawer(joinerId);
}

function handleAction(act, id) {
  if (!id) return;
  if (act === "assign") {
    openAssignModal(id);
    return;
  }
  if (act === "resolve") {
    const prev = state.actions[id] || {};
    state.actions[id] = {
      ...prev,
      status: "resolved",
      at: new Date().toISOString(),
    };
    showToast("Bottleneck marked resolved (synthetic demo — not persisted)");
    render();
    if (state.selectedId === id) openJoinerDrawer(id);
  }
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

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, Math.max(h, 1));
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
}

function drawBars(canvas, labels, values, colors) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  const [c1, c2] = Array.isArray(colors) ? colors : [colors, colors];
  const pad = { t: 28, r: 18, b: 86, l: 42 };
  const max = Math.max(...values, 1);
  const barW = (w - pad.l - pad.r) / Math.max(labels.length, 1);
  const start = performance.now();
  const duration = ssReduceMotion ? 0 : 750;

  function paint(progress) {
    ctx.clearRect(0, 0, w, h);
    if (!labels.length) return;

    // horizontal guide lines
    ctx.strokeStyle = "#e6eaf6";
    ctx.lineWidth = 1;
    for (let g = 0; g <= 4; g += 1) {
      const gy = pad.t + ((h - pad.t - pad.b) * g) / 4;
      ctx.beginPath();
      ctx.moveTo(pad.l, gy);
      ctx.lineTo(w - pad.r, gy);
      ctx.stroke();
    }

    const grad = ctx.createLinearGradient(0, pad.t, 0, h - pad.b);
    grad.addColorStop(0, c2);
    grad.addColorStop(1, c1);

    labels.forEach((label, i) => {
      const x = pad.l + i * barW + barW * 0.16;
      const full = ((h - pad.t - pad.b) * values[i]) / max;
      const bh = full * progress;
      const y = h - pad.b - bh;
      ctx.fillStyle = grad;
      roundRect(ctx, x, y, barW * 0.68, bh, 7);
      ctx.fill();

      ctx.fillStyle = "#5a6784";
      ctx.font = "10px 'IBM Plex Mono', monospace";
      ctx.save();
      ctx.translate(x + barW * 0.68, h - pad.b + 14);
      ctx.rotate(-0.48);
      ctx.textAlign = "right";
      ctx.fillText(clip(label, 18), 0, 0);
      ctx.restore();

      ctx.fillStyle = "#0b1026";
      ctx.font = "600 12px Inter, sans-serif";
      ctx.fillText(String(values[i]), x + 3, Math.max(pad.t - 8, y - 7));
    });
  }

  function frame(now) {
    const p = duration === 0 ? 1 : Math.min(1, (now - start) / duration);
    paint(1 - Math.pow(1 - p, 3));
    if (p < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
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
  ctx.strokeStyle = "#e6eaf6";
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
    ctx.fillStyle = "#0b1026";
    ctx.font = "11px 'IBM Plex Mono', monospace";
    ctx.fillText(String(p.v), p.x - 8, p.y - 10);
    ctx.fillStyle = "#5a6784";
    ctx.fillText(p.label, p.x - 8, h - 12);
  });
}

function setSection(name) {
  state.section = name;
  document.querySelectorAll(".section").forEach((el) => el.classList.remove("active"));
  document.getElementById(`section-${name}`).classList.add("active");
  // Canvas charts only animate while visible, so repaint when the tab opens.
  if (name === "analytics") renderAnalytics();
  if (name === "roles") renderRoles();
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
  document.getElementById("sign-out-btn")?.addEventListener("click", exitToPortal);
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => setSection(btn.dataset.section));
  });
  document.querySelectorAll(".role-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      state.role = btn.dataset.role;
      document.querySelectorAll(".role-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      paintFilterExplain();
      await loadAll();
    });
  });
  document.getElementById("refresh-btn").addEventListener("click", () => loadAll());
  document.getElementById("drawer-close").addEventListener("click", closeDrawer);
  document.getElementById("drawer-backdrop").addEventListener("click", closeDrawer);
  document.getElementById("assign-close")?.addEventListener("click", closeAssignModal);
  document.getElementById("assign-backdrop")?.addEventListener("click", closeAssignModal);

  document.addEventListener("click", (e) => {
    const pick = e.target.closest("[data-pick-owner]");
    if (pick) {
      e.preventDefault();
      confirmAssign(
        pick.dataset.joiner,
        pick.dataset.pickOwner,
        pick.dataset.ownerName,
        pick.dataset.ownerTeam
      );
      return;
    }
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
    if (e.key === "Escape") {
      closeAssignModal();
      closeDrawer();
    }
  });
}

if (employerSession) {
  paintSignedIn();
  paintFilterExplain();
  // Hiring-manager accounts land on their team; default lens stays All within that team.
  if (employerSession.employerPersona === "Manager") {
    state.role = "All";
  } else if (employerSession.employerPersona === "HR") {
    state.role = "HR";
    document.querySelectorAll(".role-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.role === "HR");
    });
  } else if (employerSession.employerPersona === "IT") {
    state.role = "IT";
    document.querySelectorAll(".role-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.role === "IT");
    });
  }
  paintFilterExplain();
  wireUI();
  loadAll().catch((err) => {
    console.error(err);
    document.getElementById("page-subtitle").textContent =
      `Failed to load synthetic API: ${err.message}`;
  });
}
