/* Mock ServiceNow frontend — standalone ITSM (not SmartStart) */

const TITLES = {
  catalog: ["Service Catalog", "Published catalog items"],
  requests: ["Requests", "Source RITMs — SmartStart pulls these via API"],
  incidents: ["Incidents", "SLA risk and desk incidents"],
  hardware: ["Hardware", "Laptop provisioning queue"],
  access: ["Access", "Software entitlement queue"],
  sla: ["SLA", "Breached and at-risk onboarding requests"],
  reports: ["Reports", "Source-system notes only"],
  integrations: ["Integrations", "Event feed for SmartStart to consume"],
  settings: ["Settings", "Demo environment"],
};

function esc(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function chip(label, tone = "") {
  return `<span class="chip ${tone}">${esc(label)}</span>`;
}

function toneFor(v) {
  const s = String(v);
  if (["Delivered", "Closed Complete", "5 - Closed Complete", "Granted", "Delivered"].some((x) => s.includes(x)))
    return "ok";
  if (["Configured", "Ordered", "Work in Progress", "Pending"].some((x) => s.includes(x)))
    return "warn";
  if (["Breached", "Failed", "Critical"].some((x) => s.includes(x))) return "bad";
  return "blue";
}

function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => {
    el.hidden = true;
  }, 3200);
}

function showError(msg) {
  const el = document.getElementById("global-error");
  if (!msg) {
    el.hidden = true;
    el.textContent = "";
    return;
  }
  el.hidden = false;
  el.textContent = msg;
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...SnowSession.headers(),
      ...(opts.headers || {}),
    },
  });
  if (res.status === 401) {
    SnowSession.clear();
    window.location.replace("/");
    throw new Error("Session expired");
  }
  if (!res.ok) {
    let detail = `${res.status}`;
    try {
      const body = await res.json();
      detail = body.detail || detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  return res.json();
}

function showSection(name) {
  document.querySelectorAll(".section").forEach((s) => s.classList.remove("active"));
  document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
  document.getElementById(`section-${name}`).classList.add("active");
  document.querySelector(`.nav-btn[data-section="${name}"]`)?.classList.add("active");
  const [title, sub] = TITLES[name] || [name, ""];
  document.getElementById("page-title").textContent = title;
  document.getElementById("page-sub").textContent = sub;
  loadSection(name);
}

async function loadSection(name) {
  showError("");
  try {
    if (name === "catalog") await renderCatalog();
    else if (name === "requests") await renderRequests();
    else if (name === "incidents") await renderIncidents();
    else if (name === "hardware") await renderHardware();
    else if (name === "access") await renderAccess();
    else if (name === "sla") await renderSla();
    else if (name === "integrations") await renderIntegrations();
  } catch (e) {
    showError(String(e.message || e));
  }
}

async function renderCatalog() {
  const data = await api("/api/catalog");
  document.querySelector("#catalog-table tbody").innerHTML = (data.catalog || [])
    .map(
      (c) => `<tr>
      <td class="mono">${esc(c.id)}</td>
      <td><strong>${esc(c.name)}</strong></td>
      <td>${esc(c.category)}</td>
      <td>${esc(c.description)}</td>
      <td>${c.active ? chip("Active", "ok") : chip("Inactive", "warn")}</td>
    </tr>`
    )
    .join("");
}

function actionButtons(r) {
  const n = r.number;
  const bits = [];
  if (r.hardware_status === "Pending") {
    bits.push(`<button type="button" class="btn-mini" data-act="order" data-n="${esc(n)}">Order</button>`);
    bits.push(`<button type="button" class="btn-mini" data-act="configure" data-n="${esc(n)}">Configure</button>`);
  }
  if (r.hardware_status === "Ordered") {
    bits.push(`<button type="button" class="btn-mini" data-act="configure" data-n="${esc(n)}">Configure</button>`);
  }
  if (r.hardware_status === "Configured" || r.hardware_status === "Ordered" || r.hardware_status === "Pending") {
    bits.push(`<button type="button" class="btn-mini ok" data-act="deliver" data-n="${esc(n)}">Mark Delivered</button>`);
  }
  if (!r.access_granted) {
    bits.push(`<button type="button" class="btn-mini ok" data-act="grant-access" data-n="${esc(n)}">Grant Access</button>`);
  }
  if (r.hardware_status === "Delivered" && r.access_granted && !String(r.state).includes("Closed")) {
    bits.push(`<button type="button" class="btn-mini" data-act="close" data-n="${esc(n)}">Close Complete</button>`);
  }
  if (!bits.length) return chip("Complete", "ok");
  return bits.join(" ");
}

function bindActions(root) {
  root.querySelectorAll("[data-act]").forEach((btn) => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const act = btn.getAttribute("data-act");
      const n = btn.getAttribute("data-n");
      const res = await api(`/api/requests/${n}/${act}`, { method: "POST" });
      const ev = res.event?.event_type || act;
      toast(`${ev} · ${n}`);
      const active = document.querySelector(".nav-btn.active")?.getAttribute("data-section");
      await loadSection(active || "requests");
      if (active === "requests") openRequest(n);
    };
  });
}

async function renderRequests() {
  const params = new URLSearchParams();
  const q = document.getElementById("req-q").value.trim();
  const hw = document.getElementById("f-hw").value;
  const sla = document.getElementById("f-sla").value;
  if (q) params.set("q", q);
  if (hw) params.set("hardware_status", hw);
  if (sla) params.set("sla_breached", sla);
  const data = await api(`/api/requests${params.toString() ? `?${params}` : ""}`);
  const tbody = document.querySelector("#req-table tbody");
  tbody.innerHTML = (data.requests || [])
    .map(
      (r) => `<tr data-ritm="${esc(r.number)}">
      <td class="mono"><button type="button" class="linkish">${esc(r.number)}</button></td>
      <td>${esc(r.short_description)}</td>
      <td>${esc(r.state)}</td>
      <td>${chip(r.hardware_status, toneFor(r.hardware_status))}</td>
      <td>${r.access_granted ? chip("Granted", "ok") : chip("Pending", "warn")}</td>
      <td class="mono">${esc(r.lead_time_days)}d / ${esc(r.sla_target_days)}d</td>
      <td>${r.sla_breached ? chip("Breached", "bad") : chip("Within SLA", "ok")}</td>
      <td>${actionButtons(r)}</td>
    </tr>`
    )
    .join("");
  tbody.querySelectorAll("tr").forEach((tr) => {
    tr.querySelector(".linkish")?.addEventListener("click", (e) => {
      e.stopPropagation();
      openRequest(tr.getAttribute("data-ritm"));
    });
  });
  bindActions(tbody);
}

async function openRequest(number) {
  const data = await api(`/api/requests/${number}`);
  const r = data.request;
  const panel = document.getElementById("req-detail");
  panel.hidden = false;
  panel.innerHTML = `
    <div class="panel-head">
      <div>
        <h2>${esc(r.number)}</h2>
        <p class="muted tiny">${esc(r.short_description)}</p>
      </div>
      <button type="button" class="btn-secondary" id="close-req">Close</button>
    </div>
    <div class="panel-body">
      <dl class="dl-grid">
        <dt>Requested for</dt><dd>${esc(r.requested_for)} <span class="mono muted tiny">${esc(r.requested_for_email)}</span></dd>
        <dt>Department</dt><dd>${esc(r.department)}</dd>
        <dt>Manager</dt><dd>${esc(r.manager)}</dd>
        <dt>Assignment group</dt><dd>${esc(r.assignment_group)}</dd>
        <dt>Assigned to</dt><dd>${esc(r.assigned_to)}</dd>
        <dt>State</dt><dd>${esc(r.state)}</dd>
        <dt>Hardware</dt><dd>${chip(r.hardware_status, toneFor(r.hardware_status))}</dd>
        <dt>Software</dt><dd>${esc((r.software_access || []).join(", "))}</dd>
        <dt>Access</dt><dd>${r.access_granted ? chip("Granted", "ok") : chip("Pending", "warn")}</dd>
        <dt>SLA</dt><dd>${r.sla_breached ? chip("Breached", "bad") : chip("Within SLA", "ok")} · ${esc(r.lead_time_days)}d / ${esc(r.sla_target_days)}d</dd>
      </dl>
      <p style="margin-top:0.85rem">${actionButtons(r)}</p>
      <h3 style="margin:1rem 0 0.4rem;font-size:0.95rem">Activity</h3>
      <ul class="activity-list">
        ${(r.activity || [])
          .slice()
          .reverse()
          .map((a) => `<li><time>${esc(a.at)}</time>${esc(a.label)}${a.detail ? ` — ${esc(a.detail)}` : ""}</li>`)
          .join("")}
      </ul>
    </div>`;
  panel.querySelector("#close-req").onclick = () => {
    panel.hidden = true;
  };
  bindActions(panel);
  panel.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function renderIncidents() {
  const data = await api("/api/incidents");
  document.querySelector("#inc-table tbody").innerHTML = (data.incidents || [])
    .map(
      (i) => `<tr>
      <td class="mono">${esc(i.number)}</td>
      <td>${esc(i.short_description)}</td>
      <td>${esc(i.caller)}</td>
      <td>${chip(i.priority, i.priority.startsWith("1") || i.priority.startsWith("2") ? "bad" : "warn")}</td>
      <td>${esc(i.state)}</td>
      <td class="mono">${esc(i.related_ritm || "—")}</td>
    </tr>`
    )
    .join("");
}

async function renderHardware() {
  const data = await api("/api/requests");
  const rows = (data.requests || []).filter((r) => r.hardware_status !== "Delivered");
  const tbody = document.querySelector("#hw-table tbody");
  tbody.innerHTML = rows
    .map(
      (r) => `<tr>
      <td class="mono">${esc(r.number)}</td>
      <td>${esc(r.requested_for)}</td>
      <td>${chip(r.hardware_status, toneFor(r.hardware_status))}</td>
      <td>${esc(r.department)}</td>
      <td>${actionButtons(r)}</td>
    </tr>`
    )
    .join("") || `<tr><td colspan="5" class="muted">All hardware delivered</td></tr>`;
  bindActions(tbody);
}

async function renderAccess() {
  const data = await api("/api/requests");
  const rows = (data.requests || []).filter((r) => !r.access_granted);
  const tbody = document.querySelector("#access-table tbody");
  tbody.innerHTML = rows
    .map(
      (r) => `<tr>
      <td class="mono">${esc(r.number)}</td>
      <td>${esc(r.requested_for)}</td>
      <td>${esc((r.software_access || []).join(", "))}</td>
      <td>${chip("Pending", "warn")}</td>
      <td><button type="button" class="btn-mini ok" data-act="grant-access" data-n="${esc(r.number)}">Grant Access</button></td>
    </tr>`
    )
    .join("") || `<tr><td colspan="5" class="muted">All access granted</td></tr>`;
  bindActions(tbody);
}

async function renderSla() {
  const data = await api("/api/sla");
  document.getElementById("sla-kpis").innerHTML = [
    ["SLA Breached", data.breached_count],
    ["At Risk", data.at_risk_count],
  ]
    .map(([l, v]) => `<div class="kpi"><span>${esc(l)}</span><strong>${esc(v)}</strong></div>`)
    .join("");

  const rowHtml = (r) => `<tr>
    <td class="mono">${esc(r.number)}</td>
    <td>${esc(r.requested_for)}</td>
    <td class="mono">${esc(r.lead_time_days)}d / ${esc(r.sla_target_days)}d</td>
    <td>${chip(r.hardware_status, toneFor(r.hardware_status))}</td>
  </tr>`;

  document.querySelector("#sla-breach-table tbody").innerHTML =
    (data.breached || []).map(rowHtml).join("") ||
    `<tr><td colspan="4" class="muted">No breaches</td></tr>`;
  document.querySelector("#sla-risk-table tbody").innerHTML =
    (data.at_risk || []).map(rowHtml).join("") ||
    `<tr><td colspan="4" class="muted">None at risk</td></tr>`;
}

async function renderIntegrations() {
  const data = await api("/api/integration/status");
  const integ = (data.integrations || [])[0] || {};
  document.getElementById("integ-status").innerHTML = `
    <dl class="dl-grid">
      <dt>Integration</dt><dd>${esc(integ.name || "External Onboarding Platform")}</dd>
      <dt>Status</dt><dd>${chip(integ.status || "Connected", "ok")}</dd>
      <dt>Type</dt><dd>${esc(integ.type || "REST API / Event Feed")}</dd>
      <dt>Last successful transmission</dt><dd class="mono">${esc(integ.last_successful_transmission || "—")}</dd>
      <dt>Records transmitted</dt><dd>${esc(integ.records_transmitted ?? 30)}</dd>
      <dt>Events today</dt><dd>${esc(integ.events_today ?? 0)}</dd>
    </dl>
    <p class="muted tiny" style="margin-top:0.85rem">${esc(data.note || "")}</p>
    <p class="muted tiny">Public event feed: <code class="mono">GET /api/events</code></p>`;

  document.querySelector("#integ-log tbody").innerHTML = (data.activity || [])
    .map(
      (a) => `<tr>
      <td class="mono tiny">${esc(a.at)}</td>
      <td>${esc(a.kind)}</td>
      <td><strong>${esc(a.event_type)}</strong></td>
      <td class="mono">${esc(a.record)}</td>
      <td>${chip(a.delivery, a.delivery === "Delivered" ? "ok" : "warn")}</td>
    </tr>`
    )
    .join("") ||
    `<tr><td colspan="5" class="muted">No events yet — deliver hardware or grant access</td></tr>`;
}

const session = SnowSession.require();
if (session) {
  document.getElementById("user-name").textContent = session.display_name || "Riley Chen";
  document.getElementById("user-title").textContent = session.title || "IT Service Desk Analyst";

  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => showSection(btn.getAttribute("data-section")));
  });
  document.getElementById("refresh-btn").onclick = () => {
    const active = document.querySelector(".nav-btn.active")?.getAttribute("data-section") || "requests";
    loadSection(active);
  };
  document.getElementById("sign-out").onclick = () => {
    SnowSession.clear();
    window.location.href = "/";
  };
  document.getElementById("reseed-btn").onclick = async () => {
    await api("/api/admin/reseed?seed=42", { method: "POST" });
    toast("Cohort reseeded (seed 42)");
    showSection("requests");
  };
  ["req-q", "f-hw", "f-sla"].forEach((id) => {
    const el = document.getElementById(id);
    el.addEventListener(id === "req-q" ? "input" : "change", () => {
      if (document.getElementById("section-requests").classList.contains("active")) {
        renderRequests();
      }
    });
  });
  showSection("requests");
}
