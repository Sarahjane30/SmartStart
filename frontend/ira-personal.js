/* SmartStart — IRA personalisation: Get to know me, Personalise IRA, Workplace Basics, Coach mode.
   Loaded before employee.js; relies on its globals (state, esc, fetchJSON, openDrawer, …) at call time. */

const ONBOARD_LATER_KEY = "smartstart_ira_onboard_later";

function iraApi(path, options) {
  return fetchJSON(`/api/ira/${encodeURIComponent(state.employeeId)}${path}`, options);
}

function jsonBody(method, body) {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

/* ---------- Get to know me ---------- */

function needsOnboarding() {
  const p = state.iraProfile;
  if (!p || p.onboarded) return false;
  return sessionStorage.getItem(`${ONBOARD_LATER_KEY}:${state.employeeId}`) !== "1";
}

function renderOnboard() {
  const host = document.getElementById("ira-onboard");
  if (!host) return;
  if (!state.onboard && !needsOnboarding()) {
    host.hidden = true;
    return;
  }
  if (!state.onboard) state.onboard = { step: -1, answers: { ...(state.iraProfile?.answers || {}) } };
  const ob = state.onboard;
  const qs = state.iraProfile.questionnaire;
  const first = (state.profile?.name || "there").split(" ")[0];
  host.hidden = false;
  const enter = ob.painted !== ob.step ? " enter" : "";
  ob.painted = ob.step;

  if (ob.step < 0) {
    host.innerHTML = `
      <div class="gk-card gk-intro${enter}">
        <span class="gk-orb" aria-hidden="true"></span>
        <h2>Hi ${esc(first)} — can I get to know you a little?</h2>
        <p>A few quick questions so I can explain things the way that works for you. It takes about a minute,
          and every question is optional.</p>
        <ul class="gk-promise">
          <li>How you like to learn and how I should talk to you</li>
          <li>What feels new or unsure, so I can help more there</li>
          <li>Only you can see this, and you can change or clear it any time</li>
        </ul>
        <div class="gk-actions">
          <button type="button" class="btn-primary" data-gk="start">Let's go</button>
          <button type="button" class="btn-link" data-gk="later">Maybe later</button>
        </div>
      </div>`;
  } else {
    const q = qs[ob.step];
    const last = ob.step === qs.length - 1;
    host.innerHTML = `
      <div class="gk-card${enter}">
        <div class="gk-top">
          <span class="gk-step">${ob.step + 1} of ${qs.length}</span>
          <div class="gk-dots">${qs.map((_, i) => `<i class="${i < ob.step ? "done" : i === ob.step ? "on" : ""}"></i>`).join("")}</div>
          <button type="button" class="btn-link gk-close" data-gk="later" aria-label="Close">Finish later</button>
        </div>
        <h2>${esc(q.title)}</h2>
        <p class="muted">${esc(q.prompt)}</p>
        ${q.fields.map((f) => gkField(f, ob.answers)).join("")}
        <div class="gk-actions">
          ${ob.step > 0 ? `<button type="button" class="btn-secondary" data-gk="back">Back</button>` : ""}
          <span class="gk-spacer"></span>
          <button type="button" class="btn-link" data-gk="skip">Skip this</button>
          <button type="button" class="btn-primary" data-gk="next">${last ? "Finish" : "Next"}</button>
        </div>
      </div>`;
  }
  host.querySelectorAll("[data-opt]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const { field, opt, multi } = btn.dataset;
      toggleAnswer(ob.answers, field, opt, multi === "1");
      renderOnboard();
    })
  );
  host.querySelectorAll("[data-gk]").forEach((btn) =>
    btn.addEventListener("click", () => onboardAction(btn.dataset.gk))
  );
}

function gkField(f, answers) {
  const val = answers[f.id];
  const picked = (v) => (f.multi ? (val || []).includes(v) : val === v);
  return `<fieldset class="gk-field">
    <legend>${esc(f.label)}${f.multi ? ` <span class="muted tiny">· pick any</span>` : ""}</legend>
    <div class="gk-opts">
      ${f.options
        .map(
          (o) => `<button type="button" class="gk-opt${picked(o.value) ? " on" : ""}" aria-pressed="${picked(o.value)}"
            data-field="${esc(f.id)}" data-opt="${esc(o.value)}" data-multi="${f.multi ? 1 : 0}">${esc(o.label)}</button>`
        )
        .join("")}
    </div>
  </fieldset>`;
}

function toggleAnswer(answers, field, value, multi) {
  if (!multi) {
    answers[field] = answers[field] === value ? undefined : value;
    return;
  }
  let list = (answers[field] || []).slice();
  if (list.includes(value)) list = list.filter((v) => v !== value);
  else if (value === "ready") list = ["ready"];
  else list = list.filter((v) => v !== "ready").concat(value);
  answers[field] = list;
}

async function onboardAction(act) {
  const ob = state.onboard;
  const qs = state.iraProfile.questionnaire;
  if (act === "later") {
    sessionStorage.setItem(`${ONBOARD_LATER_KEY}:${state.employeeId}`, "1");
    state.onboard = null;
    renderOnboard();
    return;
  }
  if (act === "start") ob.step = 0;
  if (act === "back") ob.step = Math.max(0, ob.step - 1);
  if (act === "skip") {
    qs[ob.step].fields.forEach((f) => delete ob.answers[f.id]);
    act = "next";
  }
  if (act === "next") {
    if (ob.step < qs.length - 1) ob.step += 1;
    else return finishOnboarding();
  }
  renderOnboard();
}

async function finishOnboarding() {
  const answers = cleanClientAnswers(state.onboard.answers);
  state.iraProfile = await iraApi("/profile", jsonBody("PUT", { answers, onboarded: true }));
  state.onboard = null;
  renderOnboard();
  await refreshBasics();
  pushIraWelcome();
}

function cleanClientAnswers(a) {
  const out = {};
  Object.entries(a || {}).forEach(([k, v]) => {
    if (Array.isArray(v) ? v.length : v) out[k] = v;
  });
  return out;
}

function pushIraWelcome() {
  if (!state.chatTurns) state.chatTurns = (state.chatbot?.turns || []).slice();
  state.chatTurns.push({ role: "assistant", text: state.iraProfile.welcome });
  const recs = (state.basics?.topics || []).filter((t) => t.recommended).map((t) => t.question);
  const practice = (state.iraProfile.traits?.practice || recs.length) ? ["Practice: Tell your manager you're stuck"] : [];
  state.chatSuggestions = [...recs.slice(0, 2), ...practice].slice(0, 3);
  if (!state.chatSuggestions.length) state.chatSuggestions = null;
  renderChat();
}

/* ---------- Personalise IRA drawer ---------- */

function openPersonalise() {
  openDrawer((body) => renderPersonalise(body));
}

function renderPersonalise(body) {
  const p = state.iraProfile;
  if (!state.editAnswers) state.editAnswers = { ...(p.answers || {}) };
  const a = state.editAnswers;
  const noticed = p.observed_labels || [];
  body.innerHTML = `
    <header class="wx-dr-head">
      <span class="muted tiny">Your IRA profile</span>
      <h2 id="wx-drawer-title">Personalise IRA</h2>
      <p>IRA uses this to decide how to explain things — shorter or step-by-step, with examples, and where to help more.
        It's only visible to you.</p>
    </header>

    <section class="wx-dr-sec">
      <h3>What IRA has noticed</h3>
      ${
        noticed.length
          ? `<ul class="pz-noticed">${noticed.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>`
          : `<p class="muted tiny">Nothing yet — IRA picks up simple patterns as you chat.</p>`
      }
      <p class="muted tiny">IRA only counts simple things (like how often you ask for templates or shorter answers).
        It never stores your messages.</p>
      <div class="wx-card-actions">
        <button type="button" class="wx-mini" id="pz-forget" ${Object.keys(p.observed || {}).length ? "" : "disabled"}>Forget what IRA noticed</button>
      </div>
    </section>

    ${p.questionnaire
      .map(
        (q) => `<section class="wx-dr-sec pz-q">
          <h3>${esc(q.title)}</h3>
          ${q.fields.map((f) => gkField(f, a)).join("")}
        </section>`
      )
      .join("")}

    <footer class="wx-dr-foot">
      <button type="button" class="btn-primary" id="pz-save">Save changes</button>
      <button type="button" class="btn-secondary" id="pz-reset">Clear everything</button>
    </footer>`;

  body.querySelectorAll("[data-opt]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const { field, opt, multi } = btn.dataset;
      toggleAnswer(a, field, opt, multi === "1");
      renderPersonalise(body);
    })
  );
  body.querySelector("#pz-save").addEventListener("click", async () => {
    state.iraProfile = await iraApi("/profile", jsonBody("PUT", { answers: cleanClientAnswers(a), onboarded: true }));
    state.editAnswers = null;
    closeDrawer();
    toast("IRA will use your new preferences");
    refreshBasics();
    renderOnboard();
  });
  body.querySelector("#pz-forget").addEventListener("click", async () => {
    state.iraProfile = await iraApi("/profile/forget", jsonBody("POST", { what: "observed" }));
    toast("IRA forgot what it noticed");
    renderPersonalise(body);
  });
  body.querySelector("#pz-reset").addEventListener("click", async () => {
    state.iraProfile = await iraApi("/profile/forget", jsonBody("POST", { what: "all" }));
    state.editAnswers = null;
    sessionStorage.removeItem(`${ONBOARD_LATER_KEY}:${state.employeeId}`);
    closeDrawer();
    refreshBasics();
    setTab("ask");
    renderOnboard();
  });
}

/* ---------- Workplace Basics ---------- */

async function refreshBasics() {
  try {
    state.basics = await iraApi("/basics");
    renderBasics();
  } catch (err) {
    console.error(err);
  }
}

function renderBasics() {
  const root = document.getElementById("basics-list");
  if (!root || !state.basics) return;
  const topics = state.basics.topics;
  const recs = topics.filter((t) => t.recommended);
  const card = (t) => `<button type="button" class="bx-card${t.recommended ? " rec" : ""}" data-topic="${esc(t.id)}">
      <span class="bx-card-top">
        ${t.recommended ? `<span class="bx-badge">For you</span>` : ""}
        ${t.practice ? `<span class="bx-badge soft">Practice</span>` : ""}
      </span>
      <strong>${esc(t.title)}</strong>
      <span class="bx-why">${esc(t.why)}</span>
      <span class="bx-more">Open guide →</span>
    </button>`;
  root.innerHTML = `
    ${
      recs.length
        ? `<section class="bx-group bx-recs">
            <h2>Recommended for you <span class="muted tiny">· based on what you told IRA</span></h2>
            <div class="bx-grid">${recs.slice(0, 3).map(card).join("")}</div>
          </section>`
        : `<section class="bx-hint">
            <p><strong>Want this tailored?</strong> Tell IRA what feels new and it'll highlight the guides that help most.</p>
            <button type="button" class="wx-mini primary" id="bx-personalise">Personalise IRA</button>
          </section>`
    }
    ${state.basics.groups
      .map(
        (g) => `<section class="bx-group">
          <h2>${esc(g)}</h2>
          <div class="bx-grid">${topics.filter((t) => t.group === g).map(card).join("")}</div>
        </section>`
      )
      .join("")}`;
  root.querySelectorAll("[data-topic]").forEach((btn) => btn.addEventListener("click", () => openBasic(btn.dataset.topic)));
  root.querySelector("#bx-personalise")?.addEventListener("click", openPersonalise);
}

async function openBasic(topicId) {
  openDrawer((body) => (body.innerHTML = `<p class="muted">Loading guide…</p>`));
  try {
    const g = await iraApi(`/basics/${encodeURIComponent(topicId)}`);
    drawerStack[drawerStack.length - 1] = (body) => renderBasicDrawer(body, g);
    paintDrawer();
  } catch (err) {
    drawerStack[drawerStack.length - 1] = (body) =>
      (body.innerHTML = `<p class="muted">Couldn't load this guide: ${esc(err.message)}</p>`);
    paintDrawer();
  }
}

function renderBasicDrawer(body, g) {
  body.innerHTML = `
    <header class="wx-dr-head">
      <span class="muted tiny">Workplace Basics · ${esc(g.group)}</span>
      <h2 id="wx-drawer-title">${esc(g.title)}</h2>
      <p>${esc(g.opener)}</p>
      ${g.reassure ? `<p class="bx-reassure">${esc(g.reassure)}</p>` : ""}
    </header>

    <section class="wx-dr-sec">
      <h3>Why it matters</h3>
      <p class="bx-p">${esc(g.why)}</p>
    </section>

    <section class="wx-dr-sec">
      <h3>${g.mode === "concise" ? "Structure" : "What you could say"}</h3>
      ${g.mode === "concise" ? `<p class="bx-structure">${esc(g.structure)}</p>` : ""}
      <pre class="bx-template">${esc(g.template)}</pre>
      <div class="wx-card-actions"><button type="button" class="wx-mini" id="bx-copy">Copy template</button></div>
    </section>

    ${
      g.steps.length
        ? `<section class="wx-dr-sec"><h3>Step by step</h3>
            <ol class="wx-lessons">${g.steps
              .map((s, i) => `<li><span class="wx-lesson-n">${i + 1}</span><div><p>${esc(s)}</p></div></li>`)
              .join("")}</ol></section>`
        : ""
    }

    <section class="wx-dr-sec">
      <h3>Small wording, big difference</h3>
      ${g.swaps
        .map(
          (s) => `<div class="bx-swap">
            <div class="bx-instead"><span>Instead of</span><s>“${esc(s.instead)}”</s></div>
            <div class="bx-say"><span>Try</span>“${esc(s.say)}”</div>
            <p class="muted tiny">${esc(s.why)}</p>
          </div>`
        )
        .join("")}
      <p class="bx-tip"><strong>Tip</strong> ${esc(g.tip)}</p>
    </section>

    <footer class="wx-dr-foot">
      ${g.practice ? `<button type="button" class="btn-primary" id="bx-practice">Practise this with IRA</button>` : ""}
      <button type="button" class="btn-secondary" id="bx-ask">Ask IRA about this</button>
    </footer>`;
  body.querySelector("#bx-copy").addEventListener("click", () => copyText(g.template, "Template copied"));
  body.querySelector("#bx-practice")?.addEventListener("click", () => {
    closeDrawer();
    setTab("ask");
    startCoach(g.practice);
  });
  body.querySelector("#bx-ask").addEventListener("click", () => {
    closeDrawer();
    askFromHome(g.question);
  });
}

/* ---------- Coach / practice mode ---------- */

async function startCoach(scenario) {
  const data = await iraApi("/coach", jsonBody("POST", { scenario }));
  enterCoach(data.start);
}

function enterCoach(info) {
  if (!info) return;
  if (!state.chatTurns) state.chatTurns = (state.chatbot?.turns || []).slice();
  state.coach = info;
  state.chatTurns.push({
    role: "assistant",
    text: `Practice mode — I'll play ${info.role}. ${info.setup}\nWrite what you'd say, just like you would for real. I'll reply in role, then give you feedback.`,
  });
  state.chatTurns.push({ role: "assistant", persona: info.role, text: info.opener });
  state.chatSuggestions = null;
  renderChat();
  document.getElementById("chat-input")?.focus();
}

function endCoach(silent) {
  if (!state.coach) return;
  const title = state.coach.title;
  state.coach = null;
  if (!silent) {
    state.chatTurns.push({
      role: "assistant",
      text: `Nice work practising “${title}”. When you're ready for the real thing, you've already done the hard part.`,
    });
  }
  state.chatSuggestions = ["Practice: Ask for feedback", "How do I ask for help?", "What should I do now?"];
  renderChat();
}

async function coachSend(message) {
  const c = state.coach;
  if (/^(end|stop|exit|quit)( practi[cs]e)?$/i.test(message.trim())) {
    state.chatTurns.push({ role: "user", text: message });
    return endCoach();
  }
  state.chatTurns.push({ role: "user", text: message });
  state.chatThinking = true;
  window.iraGlobe?.setThinking(true);
  renderChat();
  const started = performance.now();
  try {
    const data = await iraApi("/coach", jsonBody("POST", { scenario: c.scenario, message }));
    const wait = 800 - (performance.now() - started);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    const r = data.result;
    state.chatTurns.push({ role: "assistant", persona: r.role, text: r.in_role });
    state.chatTurns.push({ role: "assistant", coachResult: r });
  } finally {
    state.chatThinking = false;
    window.iraGlobe?.setThinking(false);
    renderChat();
  }
}

function coachCard(r, i) {
  const ticks = r.rubric
    .map((k) => `<li class="${k.ok ? "ok" : "miss"}"><span aria-hidden="true">${k.ok ? "✓" : "○"}</span>${esc(k.label)}</li>`)
    .join("");
  return `<div class="bubble assistant cx-card" data-coach-turn="${i}">
    <div class="bubble-meta">IRA · Coach feedback</div>
    <div class="cx-head">
      <strong>${esc(r.headline)}</strong>
      <span class="cx-score">${r.score}/${r.total}</span>
    </div>
    ${r.praise.map((p) => `<p class="cx-praise">${esc(p)}</p>`).join("")}
    ${r.improve ? `<p class="cx-improve">${esc(r.improve)}</p>` : ""}
    ${r.encourage ? `<p class="cx-encourage">${esc(r.encourage)}</p>` : ""}
    <ul class="cx-rubric">${ticks}</ul>
    ${
      !r.done && r.better
        ? `<details class="cx-better"><summary>See a version you could use</summary><pre>${esc(r.better)}</pre>
            <button type="button" class="wx-mini" data-cx="use">Edit this version</button></details>`
        : ""
    }
    <div class="wx-card-actions">
      <button type="button" class="wx-mini primary" data-cx="again">${r.done ? "Practise again" : "Try again"}</button>
      <button type="button" class="wx-mini" data-cx="other">Practise something else</button>
      <button type="button" class="wx-mini" data-cx="end">End practice</button>
    </div>
  </div>`;
}

function wireCoachCards() {
  document.querySelectorAll("#chat-log [data-coach-turn]").forEach((card) => {
    const r = state.chatTurns[Number(card.dataset.coachTurn)]?.coachResult;
    if (!r) return;
    card.querySelector('[data-cx="again"]').addEventListener("click", () => {
      if (!state.coach || state.coach.scenario !== r.scenario) return startCoach(r.scenario);
      state.chatTurns.push({ role: "assistant", persona: state.coach.role, text: state.coach.opener });
      renderChat();
      document.getElementById("chat-input")?.focus();
    });
    card.querySelector('[data-cx="other"]').addEventListener("click", () => {
      endCoach(true);
      askChat("Let's practise");
    });
    card.querySelector('[data-cx="end"]').addEventListener("click", () => endCoach());
    card.querySelector('[data-cx="use"]')?.addEventListener("click", () => {
      const input = document.getElementById("chat-input");
      input.value = r.better.replace(/\s*\n+\s*/g, " ");
      input.focus();
    });
  });
}

function renderCoachBanner() {
  const el = document.getElementById("coach-banner");
  const input = document.getElementById("chat-input");
  if (!el) return;
  const c = state.coach;
  el.hidden = !c;
  document.querySelector(".wx-ask")?.classList.toggle("coaching", !!c);
  if (!c) {
    if (input) input.placeholder = "Ask me anything about Waters…";
    return;
  }
  el.innerHTML = `<span class="cx-dot" aria-hidden="true"></span>
    <span><strong>Practice mode</strong> · IRA is playing ${esc(c.role)} — ${esc(c.title)}</span>
    <button type="button" class="wx-mini" id="coach-end">End practice</button>`;
  el.querySelector("#coach-end").addEventListener("click", () => endCoach());
  if (input) input.placeholder = `Reply to ${c.role === "your team" ? "the team" : c.role.split(" ")[0]} as you would for real…`;
}
