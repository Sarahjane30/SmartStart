/* Mock iCIMS frontend — standalone HR ATS (not SmartStart) */

const TITLES = {
  home: ["Home", "HR dashboard · synthetic cohort seed 42"],
  requisitions: ["Job Requisitions", "Open roles and candidate volume"],
  candidates: ["Candidates", "Searchable talent database"],
  interviews: ["Interviews", "Interview history across candidates"],
  offers: ["Offers", "Send, accept, or decline — updates live state"],
  newhires: ["New Hires", "Post–offer-acceptance employee records"],
  documents: ["Documents", "HR document verification"],
  readiness: ["Readiness", "Preboarding checklist"],
  reports: ["Reports", "Synthetic summary views"],
  integrations: ["Integrations", "External onboarding platform feed"],
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

function stageTone(stage) {
  if (stage === "Hired" || stage === "Offer Accepted" || stage === "Accepted" || stage === "Verified")
    return "ok";
  if (stage === "Offer" || stage === "Sent" || stage === "Submitted" || stage === "Interview")
    return "warn";
  if (stage === "Declined" || stage === "Missing" || stage === "Failed") return "bad";
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
      ...IcimsSession.headers(),
      ...(opts.headers || {}),
    },
  });
  if (res.status === 401) {
    IcimsSession.clear();
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
    if (name === "home") await renderHome();
    else if (name === "requisitions") await renderRequisitions();
    else if (name === "candidates") await renderCandidates();
    else if (name === "interviews") await renderInterviews();
    else if (name === "offers") await renderOffers();
    else if (name === "newhires") await renderNewHires();
    else if (name === "documents") await renderDocuments();
    else if (name === "readiness") await renderReadiness();
    else if (name === "integrations") await renderIntegrations();
  } catch (e) {
    showError(String(e.message || e));
  }
}

async function renderHome() {
  const d = await api("/api/dashboard");
  const kpis = [
    ["Active Candidates", d.active_candidates],
    ["Interviews This Week", d.interviews_this_week],
    ["Offers Pending", d.offers_pending],
    ["Offers Accepted", d.offers_accepted],
    ["New Hires", d.new_hires],
    ["Starting Soon", d.starting_soon],
  ];
  document.getElementById("home-kpis").innerHTML = kpis
    .map(([l, v]) => `<div class="kpi"><span>${esc(l)}</span><strong>${esc(v)}</strong></div>`)
    .join("");

  const order = ["Applied", "Screening", "Interview", "Offer", "Offer Accepted", "Hired"];
  const pipe = document.getElementById("pipeline");
  pipe.innerHTML = order
    .map((s, i) => {
      const n = (d.pipeline && d.pipeline[s]) || 0;
      const arrow = i < order.length - 1 ? `<span class="pipe-arrow">→</span>` : "";
      return `<div class="pipe-step"><strong>${n}</strong><span>${esc(s)}</span></div>${arrow}`;
    })
    .join("");

  const tbody = document.querySelector("#upcoming-table tbody");
  tbody.innerHTML = (d.upcoming_starts || [])
    .map(
      (r) => `<tr data-hire="${esc(r.employee_id)}">
      <td>${esc(r.employee)}</td><td>${esc(r.position)}</td><td>${esc(r.department)}</td>
      <td>${esc(r.manager)}</td><td>${esc(r.start_date)}</td>
      <td>${chip(r.status, r.status === "Ready" ? "ok" : "warn")}</td>
    </tr>`
    )
    .join("") || `<tr><td colspan="6" class="muted">No upcoming starts</td></tr>`;
  tbody.querySelectorAll("tr[data-hire]").forEach((tr) => {
    tr.addEventListener("click", () => {
      showSection("newhires");
      openHire(tr.getAttribute("data-hire"));
    });
  });
}

async function renderRequisitions() {
  const data = await api("/api/requisitions");
  document.getElementById("req-count").textContent = `${data.total} requisitions`;
  const tbody = document.querySelector("#req-table tbody");
  tbody.innerHTML = (data.requisitions || [])
    .map(
      (r) => `<tr data-req="${esc(r.id)}">
      <td class="mono">${esc(r.id)}</td>
      <td><button type="button" class="linkish">${esc(r.position)}</button></td>
      <td>${esc(r.department)}</td>
      <td>${esc(r.hiring_manager)}</td>
      <td>${esc(r.openings)}</td>
      <td>${esc(r.candidate_count)}</td>
      <td>${chip(r.status, stageTone(r.status))}</td>
      <td>${esc(r.created_date)}</td>
    </tr>`
    )
    .join("");
  tbody.querySelectorAll("tr").forEach((tr) => {
    tr.addEventListener("click", async () => {
      const id = tr.getAttribute("data-req");
      const detail = await api(`/api/requisitions/${id}`);
      document.getElementById("req-detail").hidden = false;
      document.getElementById("req-detail-title").textContent =
        `${detail.requisition.position} · ${detail.candidates.length} candidates`;
      document.querySelector("#req-cand-table tbody").innerHTML = detail.candidates
        .map(
          (c) => `<tr>
          <td><button type="button" class="linkish" data-open-cand="${esc(c.id)}">${esc(c.name)}</button>
            <div class="mono muted tiny">${esc(c.id)}</div></td>
          <td>${esc(c.candidate_type)}</td>
          <td>${chip(c.stage, stageTone(c.stage))}</td>
          <td>${esc(c.application_date)}</td>
        </tr>`
        )
        .join("");
      document.querySelectorAll("[data-open-cand]").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          showSection("candidates");
          openCandidate(btn.getAttribute("data-open-cand"));
        });
      });
    });
  });
}

function fillFilterOptions(candidates) {
  const depts = [...new Set(candidates.map((c) => c.department))].sort();
  const pos = [...new Set(candidates.map((c) => c.position))].sort();
  const mgrs = [...new Set(candidates.map((c) => c.hiring_manager))].sort();
  const setOpts = (id, values, label) => {
    const el = document.getElementById(id);
    const cur = el.value;
    el.innerHTML =
      `<option value="">${label}</option>` +
      values.map((v) => `<option>${esc(v)}</option>`).join("");
    el.value = cur;
  };
  setOpts("f-dept", depts, "All departments");
  setOpts("f-pos", pos, "All positions");
  setOpts("f-mgr", mgrs, "All managers");
}

async function renderCandidates() {
  const params = new URLSearchParams();
  const q = document.getElementById("cand-q").value.trim();
  const dept = document.getElementById("f-dept").value;
  const pos = document.getElementById("f-pos").value;
  const mgr = document.getElementById("f-mgr").value;
  const type = document.getElementById("f-type").value;
  const stage = document.getElementById("f-stage").value;
  if (q) params.set("q", q);
  if (dept) params.set("department", dept);
  if (pos) params.set("position", pos);
  if (mgr) params.set("manager", mgr);
  if (type) params.set("candidate_type", type);
  if (stage) params.set("stage", stage);

  const all = await api("/api/candidates");
  fillFilterOptions(all.candidates || []);
  const data = params.toString()
    ? await api(`/api/candidates?${params}`)
    : all;

  document.getElementById("cand-count").textContent = `${data.total} candidates`;
  const tbody = document.querySelector("#cand-table tbody");
  tbody.innerHTML = (data.candidates || [])
    .map(
      (c) => `<tr>
      <td class="mono">${esc(c.id)}</td>
      <td><button type="button" class="linkish" data-cand="${esc(c.id)}">${esc(c.name)}</button></td>
      <td>${esc(c.position)}</td>
      <td>${esc(c.department)}</td>
      <td>${esc(c.hiring_manager)}</td>
      <td>${esc(c.candidate_type)}</td>
      <td>${chip(c.stage, stageTone(c.stage))}</td>
      <td>${esc(c.application_date)}</td>
      <td><button type="button" class="btn-mini" data-cand="${esc(c.id)}">Open</button></td>
    </tr>`
    )
    .join("");
  tbody.querySelectorAll("[data-cand]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      openCandidate(el.getAttribute("data-cand"));
    });
  });
}

async function openCandidate(id) {
  const data = await api(`/api/candidates/${id}`);
  const c = data.candidate;
  const offer = data.offer;
  const panel = document.getElementById("cand-profile");
  panel.hidden = false;
  panel.innerHTML = `
    <div class="panel-head">
      <div>
        <h2>${esc(c.name)}</h2>
        <p class="muted tiny">${esc(c.position)} · ${esc(c.id)} · ${chip(c.stage, stageTone(c.stage))}</p>
      </div>
      <button type="button" class="btn-secondary" id="close-cand">Close</button>
    </div>
    <div class="panel-body">
      <div class="tabs" role="tablist">
        <button type="button" class="tab active" data-tab="overview">Overview</button>
        <button type="button" class="tab" data-tab="interviews">Interviews</button>
        <button type="button" class="tab" data-tab="offer">Offer</button>
        <button type="button" class="tab" data-tab="docs">Documents</button>
        <button type="button" class="tab" data-tab="activity">Activity</button>
      </div>
      <div class="tab-panel active" data-panel="overview">
        <dl class="dl-grid">
          <dt>Name</dt><dd>${esc(c.name)}</dd>
          <dt>Email</dt><dd class="mono">${esc(c.email)}</dd>
          <dt>Phone</dt><dd>${esc(c.phone)}</dd>
          <dt>Location</dt><dd>${esc(c.location)}</dd>
          <dt>Position</dt><dd>${esc(c.position)}</dd>
          <dt>Department</dt><dd>${esc(c.department)}</dd>
          <dt>Hiring manager</dt><dd>${esc(c.hiring_manager)}</dd>
          <dt>Employment type</dt><dd>${esc(c.candidate_type)}</dd>
          <dt>Expected start</dt><dd>${esc(c.expected_start_date)}</dd>
        </dl>
      </div>
      <div class="tab-panel" data-panel="interviews">
        ${(c.interviews || [])
          .map(
            (i) => `<div style="padding:0.5rem 0;border-bottom:1px solid #eef1f5">
            <strong>${esc(i.title)}</strong> ${chip(i.outcome, "ok")}
            ${i.rating ? `· Rating: ${esc(i.rating)}` : ""}
            <div class="muted tiny">${esc(i.interviewer)} · ${esc(i.scheduled_at)}</div>
          </div>`
          )
          .join("") || "<p class='muted'>No interviews yet</p>"}
      </div>
      <div class="tab-panel" data-panel="offer">
        ${
          offer
            ? `<dl class="dl-grid">
          <dt>Position</dt><dd>${esc(offer.position)}</dd>
          <dt>Compensation</dt><dd>${esc(offer.compensation_placeholder)}</dd>
          <dt>Offer date</dt><dd>${esc(offer.offer_date)}</dd>
          <dt>Proposed start</dt><dd>${esc(offer.proposed_start_date)}</dd>
          <dt>Status</dt><dd>${chip(offer.status, stageTone(offer.status))}</dd>
        </dl>`
            : "<p class='muted'>No offer on file</p>"
        }
      </div>
      <div class="tab-panel" data-panel="docs">
        <p class="muted">HR documents appear under New Hires after offer acceptance.</p>
      </div>
      <div class="tab-panel" data-panel="activity">
        <ul class="activity-list">
          ${(c.activity || [])
            .slice()
            .reverse()
            .map(
              (a) => `<li><time>${esc(a.at)}</time>${esc(a.label)}${
                a.detail ? ` — ${esc(a.detail)}` : ""
              }</li>`
            )
            .join("")}
        </ul>
      </div>
    </div>`;
  panel.querySelector("#close-cand").onclick = () => {
    panel.hidden = true;
  };
  panel.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      panel.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
      panel.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
      tab.classList.add("active");
      panel
        .querySelector(`.tab-panel[data-panel="${tab.getAttribute("data-tab")}"]`)
        .classList.add("active");
    });
  });
  panel.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function renderInterviews() {
  const data = await api("/api/interviews");
  document.querySelector("#int-table tbody").innerHTML = (data.interviews || [])
    .map(
      (i) => `<tr>
      <td>${esc(i.candidate_name)}<div class="muted tiny">${esc(i.position)}</div></td>
      <td>${esc(i.title)}</td>
      <td>${chip(i.outcome, "ok")}</td>
      <td>${esc(i.rating || "—")}</td>
      <td>${esc(i.interviewer)}</td>
      <td class="mono tiny">${esc(i.scheduled_at)}</td>
    </tr>`
    )
    .join("");
}

async function renderOffers() {
  const data = await api("/api/offers");
  const tbody = document.querySelector("#offer-table tbody");
  tbody.innerHTML = (data.offers || [])
    .map((o) => {
      const canAct = o.status === "Sent" || o.status === "Draft" || o.status === "Pending Approval";
      return `<tr>
      <td>${esc(o.candidate_name)}<div class="mono muted tiny">${esc(o.candidate_id)}</div></td>
      <td>${esc(o.position)}</td>
      <td>${esc(o.department)}</td>
      <td>${esc(o.offer_date)}</td>
      <td>${esc(o.proposed_start_date)}</td>
      <td>${chip(o.status, stageTone(o.status))}</td>
      <td>
        ${
          o.status === "Draft" || o.status === "Pending Approval"
            ? `<button type="button" class="btn-mini" data-send="${esc(o.id)}">Send Offer</button> `
            : ""
        }
        ${
          canAct && o.status !== "Accepted"
            ? `<button type="button" class="btn-mini ok" data-accept="${esc(o.id)}">Mark Accepted</button>
               <button type="button" class="btn-mini bad" data-decline="${esc(o.id)}">Mark Declined</button>`
            : o.status === "Accepted"
              ? chip("Accepted", "ok")
              : ""
        }
      </td>
    </tr>`;
    })
    .join("");

  tbody.querySelectorAll("[data-send]").forEach((btn) => {
    btn.onclick = async () => {
      await api(`/api/offers/${btn.getAttribute("data-send")}/send`, { method: "POST" });
      toast("Offer sent");
      renderOffers();
    };
  });
  tbody.querySelectorAll("[data-accept]").forEach((btn) => {
    btn.onclick = async () => {
      const res = await api(`/api/offers/${btn.getAttribute("data-accept")}/accept`, {
        method: "POST",
      });
      toast(`OFFER_ACCEPTED emitted for ${res.event?.record_id || "candidate"}`);
      renderOffers();
    };
  });
  tbody.querySelectorAll("[data-decline]").forEach((btn) => {
    btn.onclick = async () => {
      await api(`/api/offers/${btn.getAttribute("data-decline")}/decline`, { method: "POST" });
      toast("Offer declined");
      renderOffers();
    };
  });
}

async function renderNewHires() {
  const data = await api("/api/new-hires");
  document.getElementById("hire-count").textContent = `${data.total} new hires`;
  const tbody = document.querySelector("#hire-table tbody");
  tbody.innerHTML = (data.new_hires || [])
    .map(
      (h) => `<tr data-hire="${esc(h.employee_id)}">
      <td class="mono">${esc(h.employee_id)}</td>
      <td><button type="button" class="linkish">${esc(h.name)}</button></td>
      <td>${esc(h.role)}</td>
      <td>${esc(h.department)}</td>
      <td>${esc(h.hiring_manager)}</td>
      <td>${esc(h.employment_type)}</td>
      <td>${esc(h.start_date)}</td>
      <td>${esc(h.documents_complete)}/${esc(h.documents_total)} Documents</td>
      <td>${chip(h.preboarding_status, h.preboarding_status === "Ready" ? "ok" : "warn")}</td>
    </tr>`
    )
    .join("");
  tbody.querySelectorAll("tr").forEach((tr) => {
    tr.addEventListener("click", () => openHire(tr.getAttribute("data-hire")));
  });
}

async function openHire(employeeId) {
  showSection("newhires");
  const data = await api(`/api/new-hires/${employeeId}`);
  const h = data.new_hire;
  const docs = data.documents || [];
  const panel = document.getElementById("hire-profile");
  panel.hidden = false;
  panel.innerHTML = `
    <div class="panel-head">
      <div>
        <h2>${esc(h.name)}</h2>
        <p class="muted tiny">${esc(h.employee_id)} · ${esc(h.role)}</p>
      </div>
      <button type="button" class="btn-secondary" id="close-hire">Close</button>
    </div>
    <div class="panel-body">
      <div class="tabs">
        <button type="button" class="tab active" data-tab="emp">Employment</button>
        <button type="button" class="tab" data-tab="docs">Documents</button>
        <button type="button" class="tab" data-tab="pre">Preboarding</button>
        <button type="button" class="tab" data-tab="act">Activity</button>
      </div>
      <div class="tab-panel active" data-panel="emp">
        <dl class="dl-grid">
          <dt>Employee ID</dt><dd class="mono">${esc(h.employee_id)}</dd>
          <dt>Role</dt><dd>${esc(h.role)}</dd>
          <dt>Department</dt><dd>${esc(h.department)}</dd>
          <dt>Manager</dt><dd>${esc(h.hiring_manager)}</dd>
          <dt>Employment type</dt><dd>${esc(h.employment_type)}</dd>
          <dt>Start date</dt><dd>${esc(h.start_date)}</dd>
          <dt>Work location</dt><dd>${esc(h.work_location)}</dd>
        </dl>
      </div>
      <div class="tab-panel" data-panel="docs">
        ${docs
          .map(
            (d) => `<div style="padding:0.4rem 0;border-bottom:1px solid #eef1f5;display:flex;justify-content:space-between;gap:1rem">
            <span>${esc(d.document_name)}</span>
            ${chip(d.verification_status, stageTone(d.verification_status))}
          </div>`
          )
          .join("")}
      </div>
      <div class="tab-panel" data-panel="pre">
        <ul class="check-list">
          <li>Offer Accepted <span class="yes">✓</span></li>
          <li>Personal Information <span class="${h.personal_info_complete ? "yes" : "no"}">${h.personal_info_complete ? "✓" : "—"}</span></li>
          <li>Documents ${esc(h.documents_complete)}/${esc(h.documents_total)}</li>
          <li>Background Check <span class="${h.background_check ? "yes" : "no"}">${h.background_check ? "✓" : "—"}</span></li>
          <li>HR Ready — ${h.hr_ready ? '<span class="yes">READY</span>' : '<span class="no">Pending</span>'}</li>
        </ul>
      </div>
      <div class="tab-panel" data-panel="act">
        <ul class="activity-list">
          ${(h.activity || [])
            .slice()
            .reverse()
            .map((a) => `<li><time>${esc(a.at)}</time>${esc(a.label)}</li>`)
            .join("")}
        </ul>
      </div>
    </div>`;
  panel.querySelector("#close-hire").onclick = () => {
    panel.hidden = true;
  };
  panel.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      panel.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
      panel.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
      tab.classList.add("active");
      panel
        .querySelector(`.tab-panel[data-panel="${tab.getAttribute("data-tab")}"]`)
        .classList.add("active");
    });
  });
  panel.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function renderDocuments() {
  const data = await api("/api/documents");
  const tbody = document.querySelector("#doc-table tbody");
  tbody.innerHTML = (data.documents || [])
    .map((d) => {
      const canVerify = d.verification_status !== "Verified";
      return `<tr>
      <td>${esc(d.employee_name)}<div class="mono muted tiny">${esc(d.employee_id)}</div></td>
      <td>${esc(d.document_name)}</td>
      <td>${d.required ? "Yes" : "No"}</td>
      <td>${chip(d.submission_status, stageTone(d.submission_status))}</td>
      <td>${chip(d.verification_status, stageTone(d.verification_status))}</td>
      <td class="tiny mono">${esc(d.submitted_at || "—")}</td>
      <td>${
        canVerify
          ? `<button type="button" class="btn-mini ok" data-verify="${esc(d.id)}">Verify Document</button>`
          : chip("Verified", "ok")
      }</td>
    </tr>`;
    })
    .join("");
  tbody.querySelectorAll("[data-verify]").forEach((btn) => {
    btn.onclick = async () => {
      const res = await api(`/api/documents/${btn.getAttribute("data-verify")}/verify`, {
        method: "POST",
      });
      toast(`DOCUMENT_VERIFIED · ${res.document.document_name}`);
      renderDocuments();
    };
  });
}

async function renderReadiness() {
  const data = await api("/api/readiness");
  const root = document.getElementById("readiness-list");
  root.innerHTML = (data.readiness || [])
    .map((r) => {
      const ready = r.hr_status === "READY";
      return `<div class="readiness-card">
        <div>
          <strong>${esc(r.name)}</strong>
          <div class="mono muted tiny">${esc(r.employee_id)}</div>
        </div>
        <ul class="check-list">
          <li>Offer ${r.offer ? '<span class="yes">✓</span>' : "—"}</li>
          <li>Personal Information ${r.personal_information ? '<span class="yes">✓</span>' : "—"}</li>
          <li>Documents ${r.documents ? '<span class="yes">✓</span>' : "—"}</li>
          <li>Background Check ${r.background_check ? '<span class="yes">✓</span>' : "—"}</li>
        </ul>
        <div>
          <div>HR STATUS<br/><strong>${chip(r.hr_status, ready ? "ok" : "warn")}</strong></div>
          ${
            !r.hr_ready && r.documents
              ? `<button type="button" class="btn-mini ok" style="margin-top:0.5rem" data-ready="${esc(r.employee_id)}">Mark HR Ready</button>`
              : ""
          }
        </div>
      </div>`;
    })
    .join("") || "<p class='muted'>No new hires in preboarding</p>";

  root.querySelectorAll("[data-ready]").forEach((btn) => {
    btn.onclick = async () => {
      const res = await api(`/api/new-hires/${btn.getAttribute("data-ready")}/ready`, {
        method: "POST",
      });
      toast(`HR_PREBOARDING_COMPLETE · ${res.new_hire.name}`);
      renderReadiness();
    };
  });
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
    .join("") || `<tr><td colspan="5" class="muted">No events yet — accept an offer to emit OFFER_ACCEPTED</td></tr>`;
}

/* ---- boot ---- */
const session = IcimsSession.require();
if (session) {
  document.getElementById("user-name").textContent = session.display_name || "Jordan Blake";
  document.getElementById("user-title").textContent = session.title || "HR Business Partner";

  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => showSection(btn.getAttribute("data-section")));
  });
  document.getElementById("refresh-btn").onclick = () => {
    const active = document.querySelector(".nav-btn.active")?.getAttribute("data-section") || "home";
    loadSection(active);
  };
  document.getElementById("sign-out").onclick = () => {
    IcimsSession.clear();
    window.location.href = "/";
  };
  document.getElementById("reseed-btn").onclick = async () => {
    await api("/api/admin/reseed?seed=42", { method: "POST" });
    toast("Cohort reseeded (seed 42)");
    showSection("home");
  };

  ["cand-q", "f-dept", "f-pos", "f-mgr", "f-type", "f-stage"].forEach((id) => {
    const el = document.getElementById(id);
    el.addEventListener(id === "cand-q" ? "input" : "change", () => {
      if (document.getElementById("section-candidates").classList.contains("active")) {
        renderCandidates();
      }
    });
  });

  showSection("home");
}
