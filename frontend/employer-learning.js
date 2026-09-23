/* Employer view of joiner learning: team progress, per-joiner module list, and "Add course".
 * Reads the same learning track the joiner sees in their Learning tab (/api/employer/*learning). */

const learn = { team: null, joinerId: null, detail: null, picked: null };

const LEARN_STATUS = {
  complete: ["Done", "done"],
  in_progress: ["In progress", "active"],
  available: ["Up next", "next"],
  locked: ["Locked", "locked"],
};

function learnCanView() {
  return state.userRole !== "IT";
}

function learnBar(pct) {
  return `<div class="learn-bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
    <span style="width:${Math.max(0, Math.min(100, pct))}%"></span>
  </div>`;
}

function learnModuleRow(m, canManage, joinerId) {
  const [label, cls] = LEARN_STATUS[m.status] || [m.status, ""];
  const added = m.assigned_by
    ? `<span class="learn-added" title="${esc(m.assigned_note || "")}">Added by ${esc(m.assigned_by)}${
        m.due_date ? ` · due ${esc(m.due_date)}` : ""
      }</span>`
    : "";
  const remove =
    canManage && m.assigned_by && m.status !== "complete"
      ? `<button type="button" class="learn-x" data-learn-remove="${esc(m.id)}" data-joiner="${esc(joinerId)}" aria-label="Remove ${esc(m.title)}">Remove</button>`
      : "";
  return `<li class="learn-mod ${cls}">
    <span class="learn-dot" aria-hidden="true"></span>
    <div class="learn-mod-main">
      <strong>${esc(m.title)}</strong>
      <span class="muted tiny">${esc(m.category)} · ${m.duration_minutes} min</span>
      ${added}
    </div>
    <span class="learn-status ${cls}">${label}</span>
    ${remove}
  </li>`;
}

async function renderTeamLearning() {
  const list = document.getElementById("learning-list");
  if (!list || !learnCanView()) return;
  try {
    learn.team = await fetchJSON("/api/employer/learning");
  } catch (err) {
    list.innerHTML = `<p class="load-error">Couldn't load learning: ${esc(err.message)}</p>`;
    return;
  }
  const t = learn.team;
  const rows = t.joiners;
  const behind = rows.filter((r) => r.completion_pct < 30).length;
  const added = rows.reduce((n, r) => n + r.assigned_count, 0);
  const overdue = rows.reduce((n, r) => n + r.overdue.length, 0);
  document.getElementById("learning-count").textContent = `${rows.length} joiner(s) · lowest progress first`;
  document.getElementById("learning-kpis").innerHTML = [
    ["Average completion", `${Math.round(t.average_pct)}%`],
    ["Under 30% complete", behind],
    ["Courses you've added", added],
    ["Overdue added courses", overdue],
  ]
    .map(([k, v]) => `<div class="learn-kpi"><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`)
    .join("");
  list.innerHTML = rows
    .map(
      (r) => `<article class="learn-card">
        <div class="learn-card-head">
          <div>
            <button type="button" class="joiner-open" data-open="${esc(r.joiner_id)}"><strong>${esc(r.name)}</strong></button>
            <span class="muted tiny">${esc(r.role_type)} · ${esc(r.department)} · mentor ${esc(r.mentor_name)}</span>
          </div>
          <span class="learn-pct">${Math.round(r.completion_pct)}%</span>
        </div>
        ${learnBar(r.completion_pct)}
        <p class="learn-meta">
          <span>${r.completed_count} of ${r.total_count} complete</span>
          ${r.current ? `<span>Now: <strong>${esc(r.current)}</strong></span>` : `<span>All available modules done</span>`}
          ${r.assigned_open ? `<span class="learn-added">${r.assigned_open} added course(s) open</span>` : ""}
          ${r.overdue.length ? `<span class="learn-overdue">Overdue: ${esc(r.overdue.join(", "))}</span>` : ""}
        </p>
        <div class="learn-card-acts">
          <button type="button" class="btn-mini" data-learn-view="${esc(r.joiner_id)}">View progress</button>
          ${t.can_manage ? `<button type="button" class="btn-mini primary" data-learn-add="${esc(r.joiner_id)}" data-name="${esc(r.name)}">+ Add course</button>` : ""}
        </div>
        <ul class="learn-mods" id="learn-mods-${esc(r.joiner_id)}" hidden></ul>
      </article>`
    )
    .join("");
}

async function learnToggleModules(joinerId) {
  const ul = document.getElementById(`learn-mods-${joinerId}`);
  if (!ul) return;
  if (!ul.hidden) {
    ul.hidden = true;
    return;
  }
  ul.hidden = false;
  ul.innerHTML = `<li class="muted tiny">Loading…</li>`;
  const d = await fetchJSON(`/api/employer/joiners/${encodeURIComponent(joinerId)}/learning`);
  ul.innerHTML = d.track.modules.map((m) => learnModuleRow(m, d.can_manage, joinerId)).join("");
}

async function paintDrawerLearning(joinerId) {
  const el = document.getElementById("drawer-learning");
  if (!el || !learnCanView()) return;
  try {
    const d = await fetchJSON(`/api/employer/joiners/${encodeURIComponent(joinerId)}/learning`);
    if (state.selectedId !== joinerId) return;
    const s = d.summary;
    el.innerHTML = `
      <div class="learn-drawer-head">
        <h3>Learning · ${Math.round(s.completion_pct)}%</h3>
        ${d.can_manage ? `<button type="button" class="btn-mini primary" data-learn-add="${esc(joinerId)}" data-name="${esc(document.getElementById("drawer-name").textContent)}">+ Add course</button>` : ""}
      </div>
      <p class="muted tiny">${esc(s.track_name)} · ${s.completed_count} of ${s.total_count} complete${
        s.current ? ` · now on ${esc(s.current)}` : ""
      }</p>
      ${learnBar(s.completion_pct)}
      <ul class="learn-mods">${d.track.modules.map((m) => learnModuleRow(m, d.can_manage, joinerId)).join("")}</ul>`;
  } catch {
    /* keep the static learning-track summary */
  }
}

async function openCourseModal(joinerId, name) {
  learn.joinerId = joinerId;
  learn.picked = null;
  document.getElementById("course-title").textContent = `Add a course for ${name}`;
  document.getElementById("course-sub").textContent = "Pick from the approved library, or add your own.";
  document.getElementById("course-form").reset();
  const lib = document.getElementById("course-library");
  lib.innerHTML = `<p class="muted tiny">Loading library…</p>`;
  document.getElementById("course-backdrop").hidden = false;
  document.getElementById("course-modal").hidden = false;
  const d = await fetchJSON(`/api/employer/joiners/${encodeURIComponent(joinerId)}/learning`);
  learn.detail = d;
  lib.innerHTML = d.library.length
    ? d.library
        .map(
          (c) => `<label class="course-opt">
            <input type="radio" name="course-pick" value="${esc(c.id)}" />
            <span><strong>${esc(c.title)}</strong><em>${esc(c.category)} · ${c.duration_minutes} min</em><small>${esc(c.description)}</small></span>
          </label>`
        )
        .join("")
    : `<p class="muted tiny">Every library course is already in their learning — add a custom one below.</p>`;
}

function closeCourseModal() {
  document.getElementById("course-backdrop").hidden = true;
  document.getElementById("course-modal").hidden = true;
}

async function addCourse(joinerId, body) {
  const out = await postJSON(`/api/employer/joiners/${encodeURIComponent(joinerId)}/learning`, body);
  showToast(`Added “${out.module.title}” — it's now in their Learning tab`);
  if (state.section === "learning") renderTeamLearning();
  if (state.selectedId === joinerId) paintDrawerLearning(joinerId);
  return out;
}

async function removeCourse(joinerId, moduleId) {
  const res = await fetch(
    `/api/employer/joiners/${encodeURIComponent(joinerId)}/learning/${encodeURIComponent(moduleId)}`,
    { method: "DELETE", headers: { ...employerAuthHeaders() } }
  );
  if (!res.ok) {
    showToast(`Couldn't remove: ${(await res.json()).detail || res.status}`);
    return;
  }
  showToast("Course removed from their learning");
  if (state.section === "learning") renderTeamLearning();
  if (state.selectedId === joinerId) paintDrawerLearning(joinerId);
}

function wireLearning() {
  document.getElementById("course-close").addEventListener("click", closeCourseModal);
  document.getElementById("course-cancel").addEventListener("click", closeCourseModal);
  document.getElementById("course-backdrop").addEventListener("click", closeCourseModal);
  document.getElementById("course-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const picked = document.querySelector('input[name="course-pick"]:checked')?.value || null;
    const title = document.getElementById("course-custom-title").value.trim();
    const body = {
      course_id: picked || null,
      title: picked ? null : title || null,
      minutes: Number(document.getElementById("course-custom-min").value || 30),
      note: document.getElementById("course-note").value.trim(),
      due_date: document.getElementById("course-due").value || null,
    };
    if (!body.course_id && !body.title) {
      showToast("Pick a library course or enter a custom title");
      return;
    }
    try {
      await addCourse(learn.joinerId, body);
      closeCourseModal();
    } catch (err) {
      showToast(`Couldn't add course: ${err.message}`);
    }
  });
  document.addEventListener("click", (e) => {
    const add = e.target.closest("[data-learn-add]");
    if (add) {
      e.preventDefault();
      openCourseModal(add.dataset.learnAdd, add.dataset.name || "this joiner");
      return;
    }
    const view = e.target.closest("[data-learn-view]");
    if (view) {
      e.preventDefault();
      learnToggleModules(view.dataset.learnView);
      return;
    }
    const rm = e.target.closest("[data-learn-remove]");
    if (rm) {
      e.preventDefault();
      removeCourse(rm.dataset.joiner, rm.dataset.learnRemove);
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !document.getElementById("course-modal").hidden) closeCourseModal();
  });
}

if (typeof employerSession !== "undefined" && employerSession) wireLearning();
window.renderTeamLearning = renderTeamLearning;
window.paintDrawerLearning = paintDrawerLearning;
window.addCourse = addCourse;
