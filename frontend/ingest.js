/* SmartStart ingestion console — pulls mock sources into the product store */

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function showError(msg) {
  const el = document.getElementById("ingest-error");
  if (!msg) {
    el.hidden = true;
    el.textContent = "";
    return;
  }
  el.hidden = false;
  el.textContent = msg;
}

async function loadStatus() {
  showError("");
  const res = await fetch("/api/ingest/status");
  if (!res.ok) {
    showError(`Could not load ingest status (${res.status})`);
    return;
  }
  const data = await res.json();
  renderStatus(data);
}

function renderStatus(data) {
  const sources = data.sources || {};
  const ss = data.smartstart || {};
  const srcList = [sources.icims, sources.servicenow, sources.jira].filter(Boolean);

  document.getElementById("ingest-kpis").innerHTML = [
    { label: "Source candidates (iCIMS)", value: sources.icims?.record_count ?? 0 },
    { label: "Source tickets (SNOW)", value: sources.servicenow?.record_count ?? 0 },
    { label: "Source issues (Jira)", value: sources.jira?.record_count ?? 0 },
    { label: "SmartStart joiners", value: ss.joiner_count ?? 0 },
  ]
    .map(
      (k) => `<div class="kpi"><span>${esc(k.label)}</span><strong>${esc(k.value)}</strong></div>`
    )
    .join("");

  const marks = { iCIMS: "icims", ServiceNow: "snow", Jira: "jira" };
  document.getElementById("source-cards").innerHTML = srcList
    .map((s) => {
      const mark = marks[s.system] || "icims";
      return `<article class="ingest-source">
        <span class="src-mark ${mark}">${mark === "snow" ? "SN" : mark === "jira" ? "J" : "iC"}</span>
        <div>
          <h3>${esc(s.system)}</h3>
          <p>${esc(s.domain)} · ${esc(s.record_count)} records · ${esc(s.open_items)} open</p>
        </div>
        <a href="${esc(s.endpoint)}">Open mock UI</a>
      </article>`;
    })
    .join("");

  document.getElementById("smartstart-card").innerHTML = `
    <h3>SmartStart operational store</h3>
    <p class="muted" style="color:rgba(232,238,248,.7);margin:0;font-size:0.85rem">${esc(ss.note || "")}</p>
    <dl>
      <dt>Joiners</dt><dd>${esc(ss.joiner_count)}</dd>
      <dt>Document packets</dt><dd>${esc(ss.document_packets)}</dd>
      <dt>IT tickets</dt><dd>${esc(ss.it_tickets)}</dd>
    </dl>
  `;

  const last = data.last_run;
  const meta = document.getElementById("last-run-meta");
  const log = document.getElementById("last-run-log");
  if (!last) {
    meta.textContent = "never";
    log.textContent = "No ingest run yet — click Run ingest.";
  } else {
    meta.textContent = `${last.status} · ${last.finished_at || ""}`;
    log.textContent = JSON.stringify(last, null, 2);
  }
}

async function runIngest() {
  showError("");
  const headers = typeof employerAuthHeaders === "function" ? employerAuthHeaders() : {};
  if (!headers.Authorization) {
    showError("Sign in to the Command Center first (employer login), then return here to run ingest.");
    return;
  }
  const btn = document.getElementById("run-ingest-btn");
  btn.disabled = true;
  btn.textContent = "Ingesting…";
  try {
    const res = await fetch("/api/ingest/run", { method: "POST", headers });
    if (res.status === 401) {
      showError("Employer session expired — sign in again from the portal.");
      return;
    }
    if (!res.ok) {
      showError(`Ingest failed (${res.status})`);
      return;
    }
    await loadStatus();
  } finally {
    btn.disabled = false;
    btn.textContent = "Run ingest";
  }
}

document.getElementById("refresh-btn").addEventListener("click", loadStatus);
document.getElementById("run-ingest-btn").addEventListener("click", runIngest);
loadStatus();
