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
  workspace: null,
  userRole: "OPS",
  cardFilter: null,
};

const ROLE_TITLES = {
  HR: {
    dashboard: ["HR Dashboard", "Your HR queue, document alerts and HR-owned risk"],
    actions: ["My Actions", "Documents, rework and handoffs waiting on HR"],
    joiners: ["Joiners", "Full cohort — every journey, seen from HR"],
    alerts: ["Alerts", "HR work first, then IT delays that affect onboarding readiness"],
    analytics: ["HR Analytics", "Docs pending, rework, HR bottlenecks and delays"],
  },
  IT: {
    dashboard: ["IT Dashboard", "Your IT queue, SLA alerts and provisioning risk"],
    actions: ["IT Requests", "Laptops, VPN, application access and SLA escalations"],
    joiners: ["Joiners", "Full cohort — every journey, seen from IT"],
    alerts: ["Alerts", "SLA breaches and provisioning delays"],
    analytics: ["IT Analytics", "Hardware delays, SLA, access requests and provisioning time"],
  },
  MANAGER: {
    learning: ["Team Learning", "What your joiners have completed, what they're on now, and courses you've added"],
    dashboard: ["My Team", "Day 1, mentors and first projects for the people who report to you"],
    joiners: ["My Joiners", "Only the people who report to you"],
    actions: ["My Actions", "Day-1 orientation, mentor and project assignment"],
    alerts: ["Alerts", "What could delay your joiners' start"],
  },
};

const ROLE_ACTION_TITLE = {
  HR: "HR actions · documents & handoff",
  IT: "IT actions · laptop, VPN, access & SLA",
  MANAGER: "Your actions · Day 1, mentor & project",
  OPS: "Ops · route & unblock",
};

const J_ICON = { done: "✓", active: "●", attention: "⚠", blocked: "!", waiting: "○" };

const CARD_FILTERS = {
  all: () => true,
  actionable: (s) => (state.workspace?.actionable_joiners || []).includes(s.id),
  docs_pending: (s) => s.docs_status === "Pending",
  rework: (s) => s.rework,
  hr_at_risk: (s) => s.queue === "HR" && s.health !== "on_track",
  hardware: (s) => s.hardware_status !== "Delivered",
  sla: (s) => s.sla_breached,
  access: (s) => s.access_open,
  it_risk: (s) => s.queue === "IT" && s.health !== "on_track",
  on_track: (s) => s.health === "on_track",
  at_risk: (s) => s.health === "at_risk",
  blocked: (s) => s.health === "blocked",
  bottleneck: (s) => Boolean(s.bottleneck),
  project_pending: (s) => s.current_state === "DAY1_ORIENTED",
  project_ready: (s) => s.current_state === "PROJECT_READY",
};

function isOps() {
  return state.userRole === "OPS";
}

function titlesFor(section) {
  return ROLE_TITLES[state.userRole]?.[section] || TITLES[section] || [section, ""];
}

const TITLES = {
  dashboard: [
    "Dashboard",
    "Work-queue filters (HR / IT / Manager) show joiners with that kind of bottleneck — not which hiring manager owns them",
  ],
  alerts: ["Alerts", "SLA breaches and pending work for the selected work queue"],
  analytics: [
    "Analytics",
    "Queue metrics — who’s blocked, and where they sit in the pipeline",
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

async function postJSON(path, body = {}) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...employerAuthHeaders() },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = `${res.status}`;
    try {
      detail = (await res.json()).detail || detail;
    } catch {}
    throw new Error(detail);
  }
  return res.json();
}

function resolutionOf(id) {
  return summaryById(id)?.resolution || null;
}

function reopenedOf(id) {
  return summaryById(id)?.reopened || null;
}

async function loadAll() {
  // Non-Ops roles are locked to their own workspace; the server rejects other queue lenses.
  if (!isOps()) state.role = "All";
  const roleQ = encodeURIComponent(state.role);
  const [workspace, dashboard, alerts, analytics, integrations] = await Promise.all([
    fetchJSON(`/api/employer/workspace`),
    fetchJSON(`/api/dashboard?role_view=${roleQ}`),
    fetchJSON(`/api/alerts?role_view=${roleQ}`),
    state.userRole === "MANAGER" ? Promise.resolve(null) : fetchJSON(`/api/analytics?role_view=${roleQ}`),
    isOps() ? fetchJSON(`/api/integrations`) : Promise.resolve(null),
  ]);
  state.workspace = workspace;
  state.userRole = workspace.role;
  state.dashboard = dashboard;
  state.alerts = alerts;
  state.analytics = analytics;
  state.integrations = integrations;
  applyRoleShell();
  render();
}

function render() {
  renderDashboard();
  renderActions();
  renderJoiners();
  renderAlerts();
  renderAnalytics();
  renderRoles();
  if (state.section === "learning") window.renderTeamLearning?.();
}

function applyRoleShell() {
  const ws = state.workspace;
  if (!ws) return;
  document.body.dataset.role = ws.role.toLowerCase();
  const nav = document.getElementById("primary-nav");
  const allowed = ws.nav.map((n) => n.id);
  if (!allowed.includes(state.section)) state.section = "dashboard";
  nav.innerHTML = ws.nav
    .map(
      (n) =>
        `<button class="nav-btn ${n.id === state.section ? "active" : ""}" data-section="${esc(n.id)}">${esc(n.label)}${
          n.id === "actions" && ws.actionable_joiners.length
            ? ` <span class="nav-count">${ws.actionable_joiners.length}</span>`
            : ""
        }</button>`
    )
    .join("");

  document.querySelector(".role-filters").hidden = !ws.can_switch_queues;
  document.getElementById("filter-explain").hidden = !ws.can_switch_queues;

  const hero = document.getElementById("role-hero");
  hero.hidden = false;
  hero.innerHTML = `
    <span class="role-pill role-${esc(ws.role.toLowerCase())}">${esc(ws.role_label)}</span>
    <strong class="role-q">${esc(ws.question)}</strong>
    <span class="muted tiny">${esc(ws.scope.label)} · as of ${esc(fmt(ws.as_of))}</span>`;

  const signed = document.getElementById("signed-in-user");
  if (signed && employerSession) {
    signed.innerHTML = `<strong>${esc(employerSession.displayName || employerSession.username)}</strong>
      <span class="muted tiny">${esc(ws.role_label)} · ${esc(ws.scope.label)}</span>`;
  }
  const [title, subtitle] = titlesFor(state.section);
  document.getElementById("page-title").textContent = title;
  document.getElementById("page-subtitle").textContent = subtitle;
  document.querySelectorAll(".section").forEach((el) => {
    el.classList.toggle("active", el.id === `section-${state.section}`);
  });
}

const J_SHORT = { HR: "HR", IT: "IT", Manager: "Mgr", Project: "Proj" };

function journeyStrip(journey, compact = false) {
  const mini = compact === "mini";
  return `<div class="journey ${compact ? "compact" : ""} ${mini ? "mini" : ""}">${(journey || [])
    .map(
      (s) => `<span class="j-chip ${esc(s.status)}" title="${esc(s.stage)} · ${esc(s.detail)}">
        <span class="j-ico" aria-hidden="true">${J_ICON[s.status] || "○"}</span>${esc(mini ? J_SHORT[s.stage] || s.stage : s.stage)}${
          compact ? "" : `<span class="j-detail">${esc(s.detail)}</span>`
        }</span>`
    )
    .join("")}</div>`;
}

function summaryById(id) {
  return (state.workspace?.joiners || []).find((s) => s.id === id);
}

function roleCards(el) {
  const ws = state.workspace;
  el.classList.add("five");
  el.innerHTML = ws.cards
    .map((c) => {
      const html = kpi(esc(c.label), c.value, esc(c.hint), `tone-${c.tone} clickable ${state.cardFilter === c.filter ? "picked" : ""}`);
      return html.replace('<div class="kpi ', `<div role="button" tabindex="0" data-card-filter="${esc(c.filter)}" class="kpi `);
    })
    .join("");
  countUpAll(el);
}

function actionCard(s, compact = false) {
  const [primary, ...rest] = s.actions || [];
  if (!primary) return "";
  const who =
    state.userRole === "MANAGER"
      ? `mentor ${s.mentor_name}`
      : `manager ${s.manager_name}`;
  const reopened = s.reopened
    ? `<span class="reopen-chip" title="Reopened by ${esc(s.reopened.by)}">Still needs help</span>`
    : "";
  return `<article class="action-card sev-${esc(primary.severity)}">
    <div class="ac-who">
      <button type="button" class="joiner-open" data-open="${esc(s.id)}"><strong>${esc(s.name)}</strong></button>${reopened}
      <span class="muted tiny">${esc(s.role_type)} · ${esc(s.department)} · ${s.days_in_pipeline}d · ${esc(who)}</span>
    </div>
    <div class="ac-do">
      <div class="ac-label">${esc(primary.label)}</div>
      <div class="muted tiny">${esc(primary.detail)}</div>
      ${
        compact
          ? ""
          : rest
              .map((r) => `<div class="ac-sub">+ ${esc(r.label)} <span class="muted tiny">${esc(r.detail)}</span></div>`)
              .join("")
      }
    </div>
    ${compact ? "" : journeyStrip(s.journey, true)}
    <div class="ac-acts">${actionCell(s)}</div>
  </article>`;
}

function renderActions() {
  const ws = state.workspace;
  const list = document.getElementById("actions-list");
  if (!ws || !list) return;
  const [title] = titlesFor("actions");
  document.getElementById("actions-title").textContent = title;
  document.getElementById("actions-count").textContent =
    `${ws.action_queue.length} joiner(s) · sorted by urgency`;
  list.innerHTML = ws.action_queue.length
    ? ws.action_queue.map((s) => actionCard(s)).join("")
    : `<p class="muted">Nothing waiting on you right now.</p>`;
  revealAll(list, ".action-card", 28);
}

function renderJoiners() {
  const ws = state.workspace;
  const list = document.getElementById("joiners-list");
  if (!ws || !list) return;
  const [title] = titlesFor("joiners");
  document.getElementById("joiners-title").textContent = title;
  const pred = CARD_FILTERS[state.cardFilter] || CARD_FILTERS.all;
  const rows = ws.joiners.filter(pred);
  const chip = document.getElementById("joiners-filter");
  const card = ws.cards.find((c) => c.filter === state.cardFilter);
  if (card && state.cardFilter !== "all") {
    chip.hidden = false;
    chip.innerHTML = `${esc(card.label)} <button type="button" class="chip-x" data-clear-filter aria-label="Clear filter">×</button>`;
  } else {
    chip.hidden = true;
  }
  document.getElementById("joiners-count").textContent = `${rows.length} of ${ws.joiners.length}`;
  list.innerHTML = rows.length
    ? rows
        .map((s) => {
          const primary = (s.actions || [])[0] || {};
          return `<div class="joiner-line ${state.selectedId === s.id ? "selected" : ""}">
            <div class="jl-who">
              <button type="button" class="joiner-open" data-open="${esc(s.id)}"><strong>${esc(s.name)}</strong></button>
              <span class="muted tiny">${esc(s.role_type)} · ${esc(s.department)}${
                state.userRole === "MANAGER" ? "" : ` · ${esc(s.manager_name)}`
              }</span>
            </div>
            ${journeyStrip(s.journey, true)}
            <div class="jl-next"><span class="muted tiny">${
              primary.kind === "done" || primary.kind === "info" ? "Status" : "Your next step"
            }</span><span>${esc(primary.label || "—")}</span></div>
            <div class="jl-acts">${actionCell(s)}</div>
          </div>`;
        })
        .join("")
    : `<p class="muted">No joiners match this filter.</p>`;
  revealAll(list, ".joiner-line", 22);
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
  const res = resolutionOf(row.id);
  if (res) {
    return `<div class="row-actions">
      <span class="bn-tag ok" title="Resolved by ${esc(res.by)}">Resolved · ${esc(res.by)}</span>
      <button type="button" class="btn-mini" data-act="reopen" data-id="${esc(row.id)}">Still needs help</button>
    </div>`;
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
  if (!data || !state.workspace) return;
  const kpisEl = document.getElementById("dashboard-kpis");
  roleCards(kpisEl);

  const ops = isOps();
  document.getElementById("pipeline-card").hidden = !ops;
  document.getElementById("dash-split").hidden = ops;
  if (!ops) {
    const ws = state.workspace;
    const top = ws.action_queue.slice(0, 5);
    document.getElementById("needs-now-title").textContent =
      state.userRole === "IT" ? "IT requests needing you" : "Needs you now";
    document.getElementById("needs-now").innerHTML = top.length
      ? top.map((s) => actionCard(s, true)).join("")
      : `<p class="muted">You're all caught up.</p>`;
    const alerts = (state.alerts?.alerts || []).filter((a) => a.action_required).slice(0, 4);
    document.getElementById("dash-alerts").innerHTML = alerts.length
      ? alerts.map((a) => alertCard(a, true)).join("")
      : `<p class="muted">No alerts need your action.</p>`;
    revealAll(document.getElementById("needs-now"), ".action-card", 30);
    return;
  }

  const pred = CARD_FILTERS[state.cardFilter] || CARD_FILTERS.all;
  const rows = filterRows(data.rows).filter((r) => {
    const s = summaryById(r.id);
    return s ? pred(s) : true;
  });
  const card = state.workspace.cards.find((c) => c.filter === state.cardFilter);
  const filterNote = card && state.cardFilter !== "all" ? ` · filtered: ${card.label}` : "";
  document.getElementById("dashboard-count").textContent =
    `${rows.length} joiners · split across 4 hiring managers · each has their own mentor${filterNote}`;
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
      <td>${pipelineProgress(r.current_state, r.days_in_pipeline)}${journeyStrip(r.journey, "mini")}</td>
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
  const resolved = state.workspace?.resolved || [];
  const resolvedHtml = resolved.length
    ? `<h3 class="alert-group">Resolved · ${resolved.length}</h3>
       <p class="muted tiny">Removed from alerts and action queues. Reopen anything that still needs help.</p>
       ${resolved
         .map(
           (r) => `<div class="alert resolved-item">
             <div>
               <strong>${esc(r.name)}</strong> <span class="bn-tag ok">Resolved</span>
               <div class="muted tiny">${esc(r.issue || r.bottleneck)} · ${esc(r.queue)} queue · by ${esc(r.by)} · ${esc(fmt(r.at))}</div>
             </div>
             <div class="row-actions">
               <button type="button" class="btn-mini" data-open="${esc(r.joiner_id)}">Open</button>
               <button type="button" class="btn-mini primary" data-act="reopen" data-id="${esc(r.joiner_id)}">Still needs help</button>
             </div>
           </div>`
         )
         .join("")}`
    : "";
  if (!data.alerts.length) {
    list.innerHTML = `<p class="muted">No open alerts for this role view.</p>${resolvedHtml}`;
    return;
  }
  if (isOps()) {
    list.innerHTML = data.alerts.map((a) => alertCard(a)).join("") + resolvedHtml;
  } else {
    const act = data.alerts.filter((a) => a.action_required);
    const aware = data.alerts.filter((a) => !a.action_required);
    list.innerHTML = `
      <h3 class="alert-group">Action required · ${act.length}</h3>
      ${act.map((a) => alertCard(a)).join("") || `<p class="muted tiny">Nothing needs your action.</p>`}
      <h3 class="alert-group">For awareness · ${aware.length}</h3>
      ${aware.map((a) => alertCard(a)).join("") || `<p class="muted tiny">No cross-team delays affecting you.</p>`}
      ${resolvedHtml}`;
  }
  revealAll(list, ".alert", 30);
}

function alertCard(a, compact = false) {
  const tag = isOps()
    ? ""
    : `<span class="alert-tag ${a.action_required ? "act" : "aware"}">${
        a.action_required ? "Action required" : "Awareness"
      }</span>`;
  return `<article class="alert ${a.severity} ${compact ? "compact" : ""}">
      <div class="alert-top">
        <div class="alert-title">${esc(a.title)} ${tag}</div>
        <div class="alert-meta">${a.severity.toUpperCase()} · ${esc(a.category)}${isOps() ? ` · ${esc(a.role_view)}` : ""}</div>
      </div>
      <div class="alert-msg">${esc(a.message)}</div>
      ${
        a.joiner_id
          ? `<button type="button" class="btn-mini" data-open="${esc(a.joiner_id)}">Open joiner</button>`
          : ""
      }
    </article>`;
}

function shortBottleneck(label) {
  const map = {
    "Documents pending (iCIMS)": "Docs pending",
    "Document rework loop": "Docs rework",
    "IT SLA breach (ServiceNow)": "IT SLA breach",
    "IT provisioning in progress": "IT provisioning",
    "Awaiting Day-1 orientation": "Awaiting Day-1",
    "Awaiting project assignment (Jira)": "Awaiting project",
    "Offer-to-docs handoff": "Offer → docs",
    "On track": "On track",
  };
  return map[label] || label;
}

function shortStage(label) {
  const map = {
    "OFFER ACCEPTED": "Offer",
    "DOCS SUBMITTED": "Docs",
    "IT PROVISIONED": "IT",
    "DAY1 ORIENTED": "Day-1",
    "PROJECT READY": "Ready",
    OFFER_ACCEPTED: "Offer",
    DOCS_SUBMITTED: "Docs",
    IT_PROVISIONED: "IT",
    DAY1_ORIENTED: "Day-1",
    PROJECT_READY: "Ready",
  };
  const key = String(label).toUpperCase().replaceAll(" ", "_");
  return map[label] || map[key] || label;
}

function renderHBars(el, items, { tone = "navy" } = {}) {
  if (!el) return;
  if (!items.length) {
    el.innerHTML = `<p class="muted">Nothing in this view.</p>`;
    return;
  }
  const max = Math.max(...items.map((i) => i.value), 1);
  el.innerHTML = items
    .map(
      (item, idx) => {
        const pct = Math.round((100 * item.value) / max);
        return `<div class="h-bar-row reveal" style="--i:${idx}">
          <div class="h-bar-label">
            <span class="h-bar-name">${esc(item.label)}</span>
            ${item.hint ? `<span class="muted tiny">${esc(item.hint)}</span>` : ""}
          </div>
          <div class="h-bar-track" aria-hidden="true">
            <div class="h-bar-fill tone-${tone}" style="width:${pct}%"></div>
          </div>
          <div class="h-bar-value">${item.value}</div>
        </div>`;
      }
    )
    .join("");
  revealAll(el, ".h-bar-row", 40);
}

function renderInsightBreakdowns(el, breakdowns) {
  el.innerHTML = `<div class="charts-grid insights-grid">${(breakdowns || [])
    .map(
      (b) => `<div class="card insight-card">
        <div class="card-head"><h2>${esc(b.title)}</h2><span class="muted tiny">${esc(b.subtitle || "")}</span></div>
        <div class="${b.kind === "bars" ? "h-bars" : "insight-list"}" data-insight="${esc(b.id)}"></div>
      </div>`
    )
    .join("")}</div>`;
  for (const b of breakdowns || []) {
    const target = el.querySelector(`[data-insight="${b.id}"]`);
    if (b.kind === "bars") {
      renderHBars(target, b.items, { tone: "navy" });
    } else {
      target.innerHTML = b.items.length
        ? b.items
            .map(
              (i) => `<div class="insight-row">
                ${i.joiner_id ? `<button type="button" class="joiner-open" data-open="${esc(i.joiner_id)}">${esc(i.label)}</button>` : `<span>${esc(i.label)}</span>`}
                <span class="muted tiny">${esc(i.hint || "")}</span>
                <strong>${esc(i.value)}</strong>
              </div>`
            )
            .join("")
        : `<p class="muted tiny">Nothing here right now.</p>`;
    }
  }
}

function renderAnalytics() {
  const a = state.analytics;
  if (!a) return;
  const insights = a.role_insights;
  const panels = document.getElementById("analytics-panels");
  const insightsEl = document.getElementById("role-insights");
  if (!isOps() && insights) {
    panels.hidden = true;
    document.getElementById("analytics-focus").innerHTML =
      `<strong>${esc(insights.headline)}</strong> · <span class="mono">${state.workspace?.scope?.label || ""}</span>`;
    const kpiEl = document.getElementById("analytics-kpis");
    kpiEl.classList.add("five");
    kpiEl.innerHTML = insights.kpis.map((k) => kpi(esc(k.label), k.value, esc(k.hint || ""), "tone-all")).join("");
    countUpAll(kpiEl);
    renderInsightBreakdowns(insightsEl, insights.breakdowns);
    return;
  }
  panels.hidden = false;
  if (insights) renderInsightBreakdowns(insightsEl, insights.breakdowns);
  const focus = document.getElementById("analytics-focus");
  if (focus) {
    const asOf = a.as_of ? fmt(a.as_of) : "2026-09-15";
    focus.innerHTML = `<strong>${esc(a.role_view || state.role)} queue</strong> · ${esc(
      a.focus_note || ""
    )} · <span class="mono">${a.cohort_size || 0} joiners</span> · as of ${esc(asOf)}`;
  }
  const bnEntries = Object.entries(a.bottleneck_counts || {});
  const stuck = bnEntries.filter(([k]) => k !== "On track").reduce((n, [, v]) => n + v, 0);
  const onTrack = (a.bottleneck_counts || {})["On track"] || 0;
  const bnSub = document.getElementById("bn-chart-sub");
  if (bnSub) {
    bnSub.textContent = `${stuck} blocked · ${onTrack} on track`;
  }

  const bnByQueue = { HR: 0, IT: 0, Manager: 0, Ops: 0 };
  for (const [label, value] of bnEntries) {
    if (label === "On track") continue;
    const l = label.toLowerCase();
    if (l.includes("document") || l.includes("docs") || l.includes("icims") || l.includes("offer-to-docs")) {
      bnByQueue.HR += value;
    } else if (l.includes("it ") || l.includes("sla") || l.includes("servicenow") || l.includes("hardware") || l.includes("provisioning")) {
      bnByQueue.IT += value;
    } else if (l.includes("project") || l.includes("jira") || l.includes("day-1") || l.includes("orientation")) {
      bnByQueue.Manager += value;
    } else {
      bnByQueue.Ops += value;
    }
  }

  const kpis =
    state.role === "HR"
      ? [
          kpi("In HR queue", a.cohort_size, "Docs / early pipeline", "tone-hr"),
          kpi("Docs pending", a.docs_pending, "iCIMS packet still open", "tone-hr"),
          kpi("Already ready", a.project_ready_count, "Past HR gates", "tone-mgr"),
          kpi("Blocked now", stuck, `${bnByQueue.HR} in this queue`, "tone-it"),
        ]
      : state.role === "IT"
        ? [
            kpi("In IT queue", a.cohort_size, "Hardware / SLA", "tone-it"),
            kpi("SLA breaches", a.sla_breaches || 0, "ServiceNow synthetic", "tone-it"),
            kpi("Still active", a.active_joiners, "Not project-ready yet", "tone-all"),
            kpi("Blocked now", stuck, `${bnByQueue.IT} IT bottlenecks`, "tone-it"),
          ]
        : state.role === "Manager"
          ? [
              kpi("Manager queue", a.cohort_size, "Day-1 / project readiness", "tone-mgr"),
              kpi("Project ready", a.project_ready_count, "Ready for first Jira work", "tone-mgr"),
              kpi("Completion rate", `${a.completion_rate_pct}%`, "Of this queue", "tone-mgr"),
              kpi("Blocked now", stuck, `${bnByQueue.Manager} waiting on manager`, "tone-it"),
            ]
          : [
              kpi("Cohort size", a.cohort_size, "Joiners in this view", "tone-all"),
              kpi("Project ready", a.project_ready_count, `${a.completion_rate_pct}% of view`, "tone-mgr"),
              kpi("On track", onTrack, "No active bottleneck", "tone-all"),
              kpi(
                "Blocked now",
                stuck,
                `${bnByQueue.HR} HR · ${bnByQueue.IT} IT · ${bnByQueue.Manager} mgr`,
                "tone-it"
              ),
            ];
  document.getElementById("analytics-kpis").innerHTML = kpis.join("");
  countUpAll(document.getElementById("analytics-kpis"));

  const bnItems = Object.entries(a.bottleneck_counts || {})
    .filter(([label]) => label !== "On track")
    .map(([label, value]) => ({
      label: shortBottleneck(label),
      hint: label === shortBottleneck(label) ? "" : label,
      value,
    }));
  const bnEl = document.getElementById("bottleneck-bars");
  renderHBars(bnEl, bnItems, { tone: "navy" });
  if (bnEl && onTrack) {
    bnEl.insertAdjacentHTML(
      "beforeend",
      `<p class="muted tiny on-track-note">${onTrack} on track (no active bottleneck)</p>`
    );
  }

  const stageItems = (a.onboarding_trend || []).map((p) => ({
    label: shortStage(p.label),
    hint: p.label,
    value: p.value,
  }));
  renderHBars(document.getElementById("stage-bars"), stageItems, { tone: "slate" });
}

function renderRoles() {
  const data = state.integrations;
  if (!data || !isOps()) return;
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
        <span class="muted tiny">${esc(r.role_type)} · ${esc(r.department)}</span>
      </div>
      <div>${stateBadge(r.current_state)}</div>
      <div>${bottleneckTag(r.bottleneck)}</div>
      <div class="row-actions">${actionCell(r)}</div>
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

    let intelHtml = "";
    try {
      const intel = await fetchJSON(`/api/joiners/${encodeURIComponent(id)}/intelligence`);
      const why = (intel.why || []).map((d) => `<li>${esc(d)}</li>`).join("") || "<li>No drivers listed</li>";
      const blockers = (intel.blockers || [])
        .slice(0, 3)
        .map(
          (b) =>
            `<li><strong>${esc(b.title)}</strong> — ${esc(b.status)} · Owner: ${esc(b.owner)}</li>`
        )
        .join("");
      intelHtml = `
      <section class="drawer-section">
        <h3>Intelligence · ${esc(intel.risk_level || "—")} risk (${Number(intel.risk_score || 0).toFixed(0)})</h3>
        <p class="alert-title">${esc(intel.headline || "Onboarding watch")}</p>
        <p class="muted tiny">Why this score</p>
        <ul class="drawer-tasks">${why}</ul>
        ${
          blockers
            ? `<p class="muted tiny">Blockers</p><ul class="drawer-tasks">${blockers}</ul>`
            : ""
        }
        <p><strong>Recommended:</strong> ${esc(intel.recommended || "Continue standard cadence")}</p>
        <p class="muted tiny">Synthetic · evidence from SmartStart predictors + onboarding record</p>
      </section>`;
    } catch (_err) {
      intelHtml = "";
    }

    const viewer = detail.viewer_role || state.userRole;
    const t = detail.it_ticket;
    const d = detail.documents;
    let roleExtra = "";
    if (viewer === "IT" || viewer === "OPS") {
      roleExtra += `<p class="muted tiny">ServiceNow ${esc(t.ticket_id)} · ${esc(t.hardware_status)} · ${t.lead_time_days}d vs ${t.sla_target_days}d SLA</p>
        <div class="access-grid">${(detail.access || [])
          .map((x) => `<span class="access-chip ${esc(String(x.status).toLowerCase())}">${esc(x.name)} · ${esc(x.status)}</span>`)
          .join("")}</div>`;
    }
    if (viewer === "HR" || viewer === "OPS") {
      roleExtra += `<p class="muted tiny">iCIMS packet · ${d.form_count} forms · ${esc(d.status)}${
        d.rework_flag ? " · rework requested" : ""
      } · waiting ${d.waiting_days}d</p>`;
    }
    if (viewer === "MANAGER") {
      roleExtra += `<p class="muted tiny">Mentor ${esc(j.mentor_name)} · joins ${esc(j.joining_date)}</p>`;
    }
    const roleActions = (detail.role_actions || [])
      .map(
        (x, i) => `<li class="ra-item ${esc(x.kind)} ${i === 0 ? "first" : ""}">
          <strong>${esc(x.label)}</strong><span class="muted tiny">${esc(x.detail)}</span>
        </li>`
      )
      .join("");

    body.innerHTML = `
      <section class="drawer-section">
        <h3>Onboarding journey</h3>
        ${journeyStrip(detail.journey)}
      </section>
      <section class="drawer-section role-action-area">
        <h3>${esc(ROLE_ACTION_TITLE[viewer] || "Actions")}</h3>
        <ul class="ra-list">${roleActions}</ul>
        ${roleExtra}
      </section>
      <dl class="drawer-meta">
        <div><dt>State</dt><dd>${stateBadge(j.current_state)}</dd></div>
        <div><dt>Hiring manager</dt><dd>${esc(j.manager_name)} <span class="muted tiny">(${esc(j.manager_id)})</span></dd></div>
        <div><dt>Mentor</dt><dd>${esc(j.mentor_name)}</dd></div>
        <div><dt>Docs</dt><dd>${esc(detail.documents.status)}</dd></div>
        <div><dt>Hardware</dt><dd>${esc(detail.it_ticket.hardware_status)}${
          detail.it_ticket.sla_breached ? ' <span class="badge danger">SLA</span>' : ""
        }</dd></div>
      </dl>
      ${intelHtml}
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
            bn && resolutionOf(id)
              ? `<span class="bn-tag ok">Resolved · ${esc(resolutionOf(id).by)}</span>
                 <button type="button" class="btn-mini" data-act="reopen" data-id="${esc(id)}">Still needs help</button>`
              : bn
              ? `<button type="button" class="btn-mini primary" data-act="assign" data-id="${esc(id)}">${
                  act?.status === "assigned" ? "Reassign" : "Assign owner"
                }</button>
                 <button type="button" class="btn-mini" data-act="resolve" data-id="${esc(id)}">Mark resolved</button>`
              : ""
          }
          <button type="button" class="btn-mini nia-ask-btn" data-nia-ask="${esc(id)}" data-nia-name="${esc(j.name)}">Ask NIA</button>
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
      <section class="drawer-section" id="drawer-learning">
        <h3>Learning track</h3>
        <p>${esc(j.learning_track)} · ${esc(j.department_track)}</p>
        <p class="muted tiny">Join date ${esc(j.joining_date)}</p>
      </section>
    `;
    window.paintDrawerLearning?.(id);
    renderDashboard();
  } catch (err) {
    body.innerHTML = `<p class="load-error">Failed to load joiner: ${esc(err.message)}</p>`;
  }
}

function applyCardFilter(filter) {
  state.cardFilter = state.cardFilter === filter || filter === "all" ? null : filter;
  if (!isOps()) {
    if (state.cardFilter) setSection("joiners");
    renderJoiners();
  }
  renderDashboard();
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

async function handleAction(act, id) {
  if (!id) return;
  if (act === "assign") {
    openAssignModal(id);
    return;
  }
  if (act !== "resolve" && act !== "reopen") return;
  try {
    await postJSON(`/api/employer/joiners/${encodeURIComponent(id)}/${act}`);
  } catch (err) {
    showToast(`Couldn't ${act === "resolve" ? "resolve" : "reopen"}: ${err.message}`);
    return false;
  }
  if (act === "resolve") delete state.actions[id];
  showToast(
    act === "resolve"
      ? "Resolved — removed from alerts and your queue. Reopen it from Alerts if they still need help."
      : "Reopened — back in alerts and your queue as “still needs help”."
  );
  await loadAll();
  if (state.selectedId === id && !document.getElementById("joiner-drawer").hidden) openJoinerDrawer(id);
  return true;
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
  if (name === "learning") window.renderTeamLearning?.();
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.section === name);
  });
  const [title, subtitle] = titlesFor(name);
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
  document.getElementById("primary-nav").addEventListener("click", (e) => {
    const btn = e.target.closest(".nav-btn");
    if (btn) setSection(btn.dataset.section);
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
    const goto = e.target.closest("[data-goto]");
    if (goto) {
      e.preventDefault();
      setSection(goto.dataset.goto);
      return;
    }
    const cardBtn = e.target.closest("[data-card-filter]");
    if (cardBtn) {
      applyCardFilter(cardBtn.dataset.cardFilter);
      return;
    }
    if (e.target.closest("[data-clear-filter]")) {
      applyCardFilter("all");
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
    const cardBtn = e.target.closest?.("[data-card-filter]");
    if (cardBtn && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      applyCardFilter(cardBtn.dataset.cardFilter);
      return;
    }
    if (e.key === "Escape") {
      closeAssignModal();
      closeDrawer();
    }
  });
}

if (employerSession) {
  paintSignedIn();
  paintFilterExplain();
  state.userRole =
    { HR: "HR", IT: "IT", Manager: "MANAGER", Ops: "OPS" }[employerSession.employerPersona] || "OPS";
  if (!isOps()) {
    document.querySelector(".role-filters").hidden = true;
    document.getElementById("filter-explain").hidden = true;
  }
  paintFilterExplain();
  wireUI();
  loadAll().catch((err) => {
    console.error(err);
    document.getElementById("page-subtitle").textContent =
      `Failed to load synthetic API: ${err.message}`;
  });
}
