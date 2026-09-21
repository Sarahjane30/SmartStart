/* Shared renderers for mock source-system UIs */

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function tag(label, tone) {
  return `<span class="src-tag ${tone}">${esc(label)}</span>`;
}

async function bootSource(kind) {
  const endpoints = {
    icims: "/api/sources/icims",
    servicenow: "/api/sources/servicenow",
    jira: "/api/sources/jira",
  };
  const url = endpoints[kind];
  const res = await fetch(url);
  if (!res.ok) {
    document.getElementById("rows").innerHTML =
      `<tr><td colspan="6">Failed to load mock ${esc(kind)} data (${res.status})</td></tr>`;
    return;
  }
  const data = await res.json();
  if (kind === "icims") renderIcims(data);
  else if (kind === "servicenow") renderSnow(data);
  else renderJira(data);
}

function renderKpis(items) {
  document.getElementById("kpis").innerHTML = items
    .map(
      (item, i) =>
        `<div class="src-kpi" style="animation-delay:${i * 40}ms"><span>${esc(item.label)}</span><strong>${esc(item.value)}</strong></div>`
    )
    .join("");
}

function renderIcims(data) {
  const rows = data.candidates || [];
  const pending = rows.filter((r) => r.packet_status !== "Complete").length;
  const rework = rows.filter((r) => r.rework_flag).length;
  renderKpis([
    { label: "Candidates", value: rows.length },
    { label: "Packets open", value: pending },
    { label: "Rework", value: rework },
    { label: "System", value: "iCIMS" },
  ]);
  document.getElementById("count").textContent = `${rows.length} records`;
  document.getElementById("rows").innerHTML = rows
    .map((r) => {
      const tone =
        r.packet_status === "Complete" ? "ok" : r.rework_flag ? "bad" : "warn";
      return `<tr>
        <td class="mono">${esc(r.candidate_id)}</td>
        <td><strong>${esc(r.full_name)}</strong><br /><span class="mono" style="opacity:.7">${esc(r.email)}</span></td>
        <td>${esc(r.requisition)}<br /><span style="opacity:.7">${esc(r.job_title)}</span></td>
        <td>${esc(r.start_date)}</td>
        <td>${esc(r.hiring_manager)}</td>
        <td>${tag(r.packet_status, tone)}</td>
      </tr>`;
    })
    .join("");
}

function renderSnow(data) {
  const rows = data.tickets || [];
  const open = rows.filter((r) => r.hardware_status !== "Delivered").length;
  const breach = rows.filter((r) => r.sla_breached).length;
  renderKpis([
    { label: "RITMs", value: rows.length },
    { label: "Hardware open", value: open },
    { label: "SLA breached", value: breach },
    { label: "System", value: "ServiceNow" },
  ]);
  document.getElementById("count").textContent = `${rows.length} tickets`;
  document.getElementById("rows").innerHTML = rows
    .map((r) => {
      const sla = r.sla_breached ? tag("Breached", "bad") : tag("Within SLA", "ok");
      const hwTone =
        r.hardware_status === "Delivered"
          ? "ok"
          : r.hardware_status === "Configured"
            ? "warn"
            : "muted";
      return `<tr>
        <td class="mono">${esc(r.number)}</td>
        <td><strong>${esc(r.short_description)}</strong><br /><span style="opacity:.7">${esc(r.requested_for)}</span></td>
        <td>${esc(r.state)}</td>
        <td>${tag(r.hardware_status, hwTone)}</td>
        <td class="mono">${esc(r.lead_time_days)}d / ${esc(r.sla_target_days)}d</td>
        <td>${sla}</td>
      </tr>`;
    })
    .join("");
}

function renderJira(data) {
  const rows = data.issues || [];
  const done = rows.filter((r) => r.status === "Done").length;
  const open = rows.length - done;
  renderKpis([
    { label: "Issues", value: rows.length },
    { label: "Open", value: open },
    { label: "Done", value: done },
    { label: "Project", value: "ONB" },
  ]);
  document.getElementById("count").textContent = `${rows.length} issues`;
  document.getElementById("rows").innerHTML = rows
    .map((r) => {
      const tone =
        r.status === "Done" ? "ok" : r.status === "In Progress" ? "warn" : "muted";
      const tasks = (r.subtasks || []).slice(0, 3).map(esc).join(" · ") || "—";
      return `<tr>
        <td class="mono">${esc(r.key)}</td>
        <td><strong>${esc(r.summary)}</strong></td>
        <td>${tag(r.status, tone)}</td>
        <td>${esc(r.assignee)}</td>
        <td>${esc(r.reporter)}</td>
        <td style="max-width:220px;font-size:0.82rem">${tasks}</td>
      </tr>`;
    })
    .join("");
}
