/* Knowledge library — the approved sources NIA and IRA answer from.
   Drafts never change answers; Onboarding Ops approval does. */
(() => {
  const K = {
    lib: null, filter: "all", q: "", sel: null, detail: null, mode: "view", view: "draft", test: null, testing: false,
    tab: "sources", ins: null, scope: null, prefill: null, note: null,
  };
  const FILTERS = [
    ["all", "All"],
    ["drafts", "Drafts waiting"],
    ["policy", "Policies"],
    ["playbook", "Playbooks"],
    ["catalog", "Apps & teams"],
    ["faq", "FAQ"],
    ["custom", "Added here"],
    ["retired", "Retired"],
  ];
  const AUD = { EMPLOYEE: "Employees · IRA", HR: "HR", IT: "IT", MANAGER: "Managers", OPS: "Ops" };
  const ACTION = {
    created: "created this source",
    drafted: "saved a draft",
    approved: "approved and published",
    discarded: "discarded the draft",
    retired: "retired this source",
    restored: "restored this source",
  };

  const root = () => document.getElementById("kb-root");

  async function send(method, path, body) {
    const res = await fetch(path, {
      method,
      headers: { "Content-Type": "application/json", ...employerAuthHeaders() },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      let detail = `${res.status}`;
      try {
        const d = (await res.json()).detail;
        detail = Array.isArray(d) ? d.map((x) => x.msg).join("; ") : d || detail;
      } catch {}
      throw new Error(detail);
    }
    return res.json();
  }

  function sectionsOf(body) {
    return String(body || "")
      .trim()
      .split(/^##\s+/m)
      .map((b) => b.trim())
      .filter(Boolean)
      .map((b) => {
        const i = b.indexOf("\n");
        const heading = (i < 0 ? b : b.slice(0, i)).trim();
        const text = i < 0 ? "" : b.slice(i + 1).replace(/\s+/g, " ").trim();
        return text ? { heading, text } : { heading: "Overview", text: heading };
      });
  }

  function when(iso) {
    try {
      return new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
    } catch {
      return iso || "";
    }
  }

  function refs(text) {
    return esc(text).replace(/\s?\[(\d+)\]/g, '<sup class="gr-ref">$1</sup>');
  }

  /* ---------- data ---------- */

  async function load() {
    [K.lib, K.ins] = await Promise.all([fetchJSON("/api/knowledge"), fetchJSON("/api/knowledge/insights")]);
    if (K.scope === null) K.scope = K.ins.counts.mine ? "mine" : "all";
    const ids = new Set(K.lib.sources.map((s) => s.id));
    if (!K.sel || !ids.has(K.sel)) K.sel = (K.lib.sources.find((s) => s.has_draft) || K.lib.sources[0])?.id || null;
    if (K.sel && K.mode === "view") K.detail = await fetchJSON(`/api/knowledge/sources/${encodeURIComponent(K.sel)}`);
    paint();
  }

  async function select(id) {
    K.sel = id;
    K.mode = "view";
    K.view = "draft";
    K.detail = await fetchJSON(`/api/knowledge/sources/${encodeURIComponent(id)}`);
    paint();
    document.querySelector(".kb-detail")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  window.renderKnowledge = () => {
    if (!K.lib) root().innerHTML = `<div class="card"><p class="muted">Loading the knowledge library…</p></div>`;
    if (K.mode !== "view") return paint();
    load().catch((err) => {
      root().innerHTML = `<div class="card"><p class="muted">Couldn't load the knowledge library: ${esc(err.message)}</p></div>`;
    });
  };

  window.ssOpenSource = (id) => {
    setSection("knowledge");
    K.mode = "view";
    K.tab = "sources";
    select(id).catch(() => showToast("That source isn't in the library any more."));
  };

  /* ---------- paint ---------- */

  function visible() {
    const q = K.q.trim().toLowerCase();
    return K.lib.sources.filter((s) => {
      if (K.filter === "retired") {
        if (s.status !== "retired") return false;
      } else if (s.status === "retired") return false;
      if (K.filter === "drafts" && !(s.has_draft || s.status === "draft")) return false;
      if (["policy", "playbook", "catalog", "faq", "custom"].includes(K.filter) && s.origin !== K.filter) return false;
      return !q || `${s.title} ${s.owner} ${s.category}`.toLowerCase().includes(q);
    });
  }

  function paint() {
    if (!K.lib) return;
    const c = K.lib.counts;
    const m = K.lib.assistant.model;
    const engine = m.enabled
      ? `<strong>Language model</strong><span>${esc(m.model)} · may only use cited passages</span>`
      : `<strong>Retrieval</strong><span>Quotes approved passages · add a model key to have answers written for you</span>`;
    root().innerHTML = `
      <div class="kb-hero">
        <div class="kb-hero-main">
          <span class="kb-kicker">Approved knowledge</span>
          <h2>NIA and IRA answer only from these sources</h2>
          <p>Every answer cites the passage it came from. When nothing here covers a question, they say so and name the team to ask.
            Edits are saved as drafts and change answers only after Onboarding Ops approves them.</p>
        </div>
        <div class="kb-stats">
          <div class="kb-stat"><b>${c.approved}</b><span>approved sources</span></div>
          <div class="kb-stat ${c.drafts ? "warn" : ""}"><b>${c.drafts}</b><span>draft${c.drafts === 1 ? "" : "s"} waiting</span></div>
          <div class="kb-stat"><b>${c.retired}</b><span>retired</span></div>
          <div class="kb-stat kb-engine" title="Set OPENAI_API_KEY or ANTHROPIC_API_KEY on the server to let a language model write answers from the same cited passages.">${engine}</div>
        </div>
      </div>
      ${tabsHtml()}
      ${K.tab === "insights" ? `<div class="kb-ins">${insightsHtml()}</div>` : `
      <div class="kb-grid">
        <aside class="card kb-list">
          <div class="kb-list-head">
            <input type="search" class="kb-search" placeholder="Search sources, owners…" value="${esc(K.q)}" aria-label="Search sources" />
            ${K.lib.can_edit ? `<button type="button" class="btn-primary kb-new">New source</button>` : ""}
          </div>
          <div class="kb-filters">${FILTERS.map(
            ([id, label]) =>
              `<button type="button" class="kb-filter ${K.filter === id ? "on" : ""}" data-f="${id}">${label}${
                id === "drafts" && c.drafts ? ` <span class="kb-dot">${c.drafts}</span>` : ""
              }</button>`
          ).join("")}</div>
          <div class="kb-rows">${listRows()}</div>
        </aside>
        <div class="kb-main">
          <div class="card kb-detail">${K.mode === "view" ? detailHtml() : editorHtml()}</div>
          <div class="card kb-test">${testHtml()}</div>
        </div>
      </div>`}`;
    wire();
  }

  /* ---------- questions we couldn't answer & flagged answers ---------- */

  function tabsHtml() {
    const n = K.ins.counts;
    const open = n.gaps + n.reviews;
    return `<div class="kb-tabs" role="tablist">
      <button type="button" role="tab" aria-selected="${K.tab === "sources"}" class="${K.tab === "sources" ? "on" : ""}" data-tab="sources">Sources</button>
      <button type="button" role="tab" aria-selected="${K.tab === "insights"}" class="${K.tab === "insights" ? "on" : ""}" data-tab="insights">
        Questions &amp; flags${open ? ` <span class="kb-dot">${open}</span>` : ""}</button>
    </div>`;
  }

  function day(iso) {
    try {
      return new Date(iso).toLocaleDateString([], { day: "numeric", month: "short" });
    } catch {
      return "";
    }
  }

  function noteForm(kind, id, placeholder, label) {
    return `<form class="kb-note" data-note="${kind}:${esc(id)}">
      <input name="note" maxlength="200" placeholder="${esc(placeholder)}" aria-label="Note" />
      <button type="submit" class="btn-primary">${esc(label)}</button>
      <button type="button" class="btn-secondary" data-ins="note-cancel">Cancel</button>
    </form>`;
  }

  function gapHtml(g) {
    const pills = [
      g.refused ? `<i class="kb-pill rose">Refused ×${g.refused}</i>` : "",
      g.weak ? `<i class="kb-pill amber">Weak answer ×${g.weak}</i>` : "",
      g.flagged ? `<i class="kb-pill blue">Asker wants this ×${g.flagged}</i>` : "",
    ].join("");
    const who = g.audiences.map((a) => `${esc(a.label)}${g.audiences.length > 1 ? ` (${a.count})` : ""}`).join(", ");
    const c = g.closest;
    const editable = K.lib.can_edit && g.can_act;
    const acts =
      K.note === `gap:${g.id}`
        ? noteForm("gap", g.id, "Why isn't this in scope? (optional)", "Dismiss")
        : `<div class="kb-ins-acts">
            ${editable ? `<button type="button" class="btn-primary" data-ins="write" data-id="${esc(g.id)}">Write a source</button>` : ""}
            ${editable && c ? `<button type="button" class="btn-secondary" data-ins="extend" data-src="${esc(c.source_id)}">Add to “${esc(c.title)}”</button>` : ""}
            <button type="button" class="btn-secondary" data-ins="test" data-id="${esc(g.id)}">Test it</button>
            ${editable ? `<button type="button" class="btn-secondary" data-ins="dismiss" data-id="${esc(g.id)}">Dismiss</button>` : ""}
            ${!g.can_act ? `<span class="muted tiny">${esc(g.team)} owns this${g.team === "HR" || g.team === "IT" ? "" : " · Onboarding Ops routes it"}</span>` : ""}
          </div>`;
    return `<article class="kb-gap">
      <div class="kb-gap-q">“${esc(g.question)}”${pills}</div>
      <p class="muted tiny">Asked ${g.count}× by ${who} · via ${esc(g.assistants.join(" & "))} · last ${esc(day(g.last_seen))}</p>
      ${g.variants.length ? `<p class="kb-gap-var">Also asked as ${g.variants.map((v) => `“${esc(v)}”`).join(", ")}</p>` : ""}
      ${
        c
          ? `<p class="kb-gap-near">Closest approved source <button type="button" class="kb-link" data-ins="open" data-src="${esc(c.source_id)}">${esc(c.title)} › ${esc(c.section)}</button> · ${esc(c.owner)}</p>`
          : `<p class="kb-gap-near">No approved source comes close.</p>`
      }
      ${acts}
    </article>`;
  }

  function reviewHtml(r) {
    const flags = r.flags;
    const one = (f) => `<li>
        <div class="kb-flag-h"><i class="kb-pill ${f.reason === "out_of_date" ? "amber" : "rose"}">${esc(f.reason_label)}</i>
          <span class="muted tiny">${esc(f.audience_label)} via ${esc(f.assistant)} · ${esc(day(f.at))}${f.section ? ` · cited › ${esc(f.section)}` : ""}${f.version ? ` · v${f.version}` : ""}</span></div>
        <p class="kb-flag-q">“${esc(f.question)}”</p>
        <p class="kb-flag-a">${refs(f.answer)}</p>
        ${f.comment ? `<p class="kb-flag-c"><span>They said:</span> ${esc(f.comment)}</p>` : ""}
      </li>`;
    const editable = K.lib.can_edit && r.can_act;
    const acts =
      K.note === `rev:${r.id}`
        ? noteForm("rev", r.id, "What did you check? (optional)", "Mark reviewed")
        : `<div class="kb-ins-acts">
            ${editable ? `<button type="button" class="btn-primary" data-ins="extend" data-src="${esc(r.source_id)}">Edit source</button>` : ""}
            <button type="button" class="btn-secondary" data-ins="open" data-src="${esc(r.source_id)}">Open source</button>
            ${editable ? `<button type="button" class="btn-secondary" data-ins="resolve" data-id="${esc(r.id)}">Mark reviewed · no change</button>` : ""}
            ${!r.can_act ? `<span class="muted tiny">${esc(r.team)} owns this${r.team === "HR" || r.team === "IT" ? "" : " · Onboarding Ops routes it"}</span>` : ""}
          </div>`;
    return `<article class="kb-review">
      <div class="kb-gap-q">${esc(r.title)}${r.reasons.map((x) => `<i class="kb-pill ${x.id === "out_of_date" ? "amber" : "rose"}">${esc(x.label)} ×${x.count}</i>`).join("")}</div>
      <p class="muted tiny">Owner ${esc(r.owner)} · ${flags.length} flag${flags.length === 1 ? "" : "s"} since ${esc(day(r.created))} · closes by itself when a new version is approved</p>
      <ol class="kb-flags">${flags.slice(0, 2).map(one).join("")}</ol>
      ${flags.length > 2 ? `<details class="kb-more"><summary>${flags.length - 2} more</summary><ol class="kb-flags">${flags.slice(2).map(one).join("")}</ol></details>` : ""}
      ${acts}
    </article>`;
  }

  function insightsHtml() {
    const ins = K.ins;
    const n = ins.counts;
    const teams = ins.teams.filter((t) => K.scope === "all" || t.mine);
    const scope = ins.my_team
      ? `<div class="kb-toggle">
          <button type="button" class="${K.scope === "mine" ? "on" : ""}" data-scope="mine">${ins.my_team === "Onboarding Ops" ? "Ops & unowned teams" : `${esc(ins.my_team)} team`}${n.mine ? ` · ${n.mine}` : ""}</button>
          <button type="button" class="${K.scope === "all" ? "on" : ""}" data-scope="all">All teams · ${n.gaps + n.reviews}</button>
        </div>`
      : "";
    const body = teams.length
      ? teams
          .map(
            (t) => `<section class="card kb-team">
            <header class="kb-team-h"><h3>${esc(t.team)}</h3>${t.mine ? `<i class="kb-pill blue">Your queue</i>` : ""}
              <span class="muted tiny">${t.gaps.length} unanswered · ${t.reviews.length} flagged</span></header>
            ${t.gaps.length ? `<h4 class="kb-sub">Questions we couldn't answer</h4>${t.gaps.map(gapHtml).join("")}` : ""}
            ${t.reviews.length ? `<h4 class="kb-sub">Flagged answers</h4>${t.reviews.map(reviewHtml).join("")}` : ""}
          </section>`
          )
          .join("")
      : `<div class="card kb-empty-ins"><strong>${K.scope === "mine" && n.gaps + n.reviews ? "Nothing for your team right now." : "Nothing waiting."}</strong>
          <p class="muted">Every question NIA or IRA refuses or only weakly answers lands here, grouped with similar questions and routed to the team that owns the closest source.
          Thumbs-down on an answer lands here too, with the asker's comment.</p></div>`;
    const closed = [
      ...ins.closed_gaps.map((g) => ({ at: g.resolution?.at, html: `“${esc(g.question)}” — ${
        g.status === "answered" ? `<span class="kb-ok">answered</span> ${esc(g.resolution.note)}${g.resolution.version ? ` (v${g.resolution.version})` : ""}`
          : `dismissed${g.resolution?.by ? ` by ${esc(g.resolution.by)}` : ""}: ${esc(g.resolution?.note || "")}`}` })),
      ...ins.closed_reviews.map((r) => ({ at: r.resolution?.at, html: `${esc(r.title)} flags — <span class="kb-ok">closed</span>${r.resolution?.by ? ` by ${esc(r.resolution.by)}` : ""}: ${esc(r.resolution?.note || "")}` })),
    ].sort((a, b) => String(b.at).localeCompare(String(a.at)));
    return `
      <div class="card kb-ins-head">
        <div>
          <h2>What people asked that we couldn't answer well</h2>
          <p class="muted tiny">${n.gaps} question${n.gaps === 1 ? "" : "s"} refused or weakly answered · ${n.reviews} source${n.reviews === 1 ? "" : "s"} flagged by askers · ${n.answered} answered since by approved sources.
            Only the question and the asker's audience are kept — never who asked.</p>
        </div>
        ${scope}
      </div>
      ${body}
      ${closed.length ? `<details class="card kb-closed"><summary>Recently closed · ${closed.length}</summary><ul>${closed.map((c) => `<li>${c.html} <span class="muted tiny">${esc(day(c.at))}</span></li>`).join("")}</ul></details>` : ""}`;
  }

  async function insAct(btn) {
    const kind = btn.dataset.ins;
    const gap = () => K.ins.teams.flatMap((t) => t.gaps).find((g) => g.id === btn.dataset.id);
    if (kind === "open" || kind === "extend") {
      K.tab = "sources";
      await select(btn.dataset.src);
      if (kind === "extend") {
        K.mode = "edit";
        paint();
      }
      return;
    }
    if (kind === "write") {
      const g = gap();
      K.prefill = {
        title: g.question.replace(/[?.!]+$/, "").slice(0, 120),
        owner: g.closest?.owner && g.closest.owner !== "SmartStart" ? g.closest.owner : "",
        category: "",
        audience: g.audiences.map((a) => a.id),
        keywords: [],
        body: `## Answer\n`,
        note: `Answers “${g.question}” (asked ${g.count}×)`.slice(0, 200),
      };
      K.tab = "sources";
      K.mode = "new";
      paint();
      document.querySelector('.kb-form [name="body"]')?.focus();
      return;
    }
    if (kind === "test") {
      const g = gap();
      K.tab = "sources";
      paint();
      runTest(g.question, g.audiences[0]?.id || "EMPLOYEE");
      return;
    }
    if (kind === "dismiss") K.note = `gap:${btn.dataset.id}`;
    else if (kind === "resolve") K.note = `rev:${btn.dataset.id}`;
    else if (kind === "note-cancel") K.note = null;
    paint();
    document.querySelector(".kb-note input")?.focus();
  }

  async function insNote(form) {
    const [kind, id] = form.dataset.note.split(/:(.+)/);
    const note = new FormData(form).get("note") || "";
    try {
      if (kind === "gap") {
        await send("POST", `/api/knowledge/gaps/${encodeURIComponent(id)}/dismiss`, { note });
        showToast("Dismissed — it stays logged if people keep asking");
      } else {
        await send("POST", `/api/knowledge/reviews/${encodeURIComponent(id)}/resolve`, { note });
        showToast("Marked reviewed");
      }
      K.note = null;
      await load();
    } catch (err) {
      showToast(err.message);
    }
  }

  function feedbackHtml(d) {
    const fb = d.feedback;
    if (!fb) return "";
    const r = fb.review;
    const parts = [];
    if (fb.helpful || fb.not_helpful) parts.push(`<span><b>${fb.helpful}</b> helpful · <b>${fb.not_helpful}</b> not helpful</span>`);
    if (fb.near_gaps) parts.push(`<span><b>${fb.near_gaps}</b> unanswered question${fb.near_gaps === 1 ? "" : "s"} point here</span>`);
    const banner = r
      ? `<div class="kb-banner rose"><div><strong>Flagged by ${r.flags.length} asker${r.flags.length === 1 ? "" : "s"}</strong>
          <span>${r.reasons.map((x) => `${esc(x.label)} ×${x.count}`).join(" · ")}${r.flags[0]?.comment ? ` — “${esc(r.flags[0].comment)}”` : ""}</span></div>
          <div class="kb-banner-acts"><button type="button" class="btn-secondary" data-tab="insights">See flags</button></div></div>`
      : "";
    return `${banner}${parts.length ? `<p class="kb-fb muted tiny">${parts.join("")}</p>` : ""}`;
  }

  function listRows() {
    const rows = visible();
    if (!rows.length) return `<p class="muted tiny kb-empty">No sources match.</p>`;
    return rows
      .map(
        (s) => `<button type="button" class="kb-row ${s.id === K.sel ? "on" : ""}" data-id="${esc(s.id)}">
          <span class="kb-row-t">${esc(s.title)}</span>
          <span class="kb-row-m">${esc(s.origin_label)} · ${esc(s.owner)}</span>
          <span class="kb-row-p">
            ${s.status === "draft" ? `<i class="kb-pill amber">New · awaiting approval</i>` : ""}
            ${s.has_draft && s.status !== "draft" ? `<i class="kb-pill amber">Draft waiting</i>` : ""}
            ${s.status === "retired" ? `<i class="kb-pill grey">Retired</i>` : ""}
            ${s.edited ? `<i class="kb-pill blue">v${s.version}</i>` : ""}
          </span>
        </button>`
      )
      .join("");
  }

  function sectionsHtml(secs, live) {
    const before = new Map((live || []).map((s) => [s.heading, s.text]));
    const after = new Set(secs.map((s) => s.heading));
    const body = secs
      .map((s) => {
        const tag = !live ? "" : !before.has(s.heading) ? "new" : before.get(s.heading) !== s.text ? "changed" : "";
        return `<section class="kb-sec ${tag}">
          <h4>${esc(s.heading)}${tag ? `<i class="kb-pill ${tag === "new" ? "green" : "amber"}">${tag === "new" ? "New section" : "Changed"}</i>` : ""}</h4>
          <p>${esc(s.text)}</p>
          ${tag === "changed" ? `<p class="kb-was"><span>Live now:</span> ${esc(before.get(s.heading))}</p>` : ""}
        </section>`;
      })
      .join("");
    const removed = live ? live.filter((s) => !after.has(s.heading)) : [];
    return (
      body +
      removed
        .map(
          (s) => `<section class="kb-sec removed"><h4>${esc(s.heading)}<i class="kb-pill rose">Removed</i></h4><p>${esc(s.text)}</p></section>`
        )
        .join("")
    );
  }

  function detailHtml() {
    const d = K.detail;
    if (!d) return `<p class="muted">Pick a source to read it.</p>`;
    const lib = K.lib;
    const live = d.approved ? sectionsOf(d.approved.body) : [];
    const draft = d.draft;
    const showDraft = draft && (K.view === "draft" || !d.approved);
    const shown = showDraft ? sectionsOf(draft.body) : live;
    const meta = showDraft ? draft : d.approved || {};
    const acts = [];
    if (lib.can_edit && d.status !== "retired") acts.push(`<button type="button" class="btn-secondary" data-act="edit">${draft ? "Edit draft" : "Edit"}</button>`);
    if (lib.can_approve && d.status === "approved") acts.push(`<button type="button" class="btn-secondary kb-danger" data-act="retire">Retire</button>`);
    if (lib.can_approve && d.status === "retired") acts.push(`<button type="button" class="btn-secondary" data-act="restore">Restore</button>`);
    const banner = draft
      ? `<div class="kb-banner">
          <div>
            <strong>${d.status === "draft" ? "New source" : "Draft"} by ${esc(draft.by)}</strong> · ${esc(when(draft.at))}
            <span>Not used for answers until Onboarding Ops approves it.${draft.note ? ` “${esc(draft.note)}”` : ""}</span>
          </div>
          <div class="kb-banner-acts">
            ${lib.can_approve ? `<button type="button" class="btn-primary" data-act="approve">Approve &amp; publish</button>` : `<span class="muted tiny">Waiting for Ops</span>`}
            ${lib.can_edit ? `<button type="button" class="btn-secondary" data-act="discard">Discard draft</button>` : ""}
          </div>
        </div>
        ${d.approved ? `<div class="kb-toggle" role="tablist">
          <button type="button" class="${showDraft ? "on" : ""}" data-view="draft">Draft · changes highlighted</button>
          <button type="button" class="${showDraft ? "" : "on"}" data-view="live">Live version</button>
        </div>` : ""}`
      : "";
    const retired =
      d.status === "retired"
        ? `<div class="kb-banner grey"><div><strong>Retired</strong><span>NIA and IRA no longer answer from this source.</span></div></div>`
        : "";
    const history = d.history || [];
    return `
      <header class="kb-d-head">
        <div>
          <span class="kb-origin">${esc(d.origin_label)}</span>
          <h3>${esc(meta.title || d.title)}</h3>
          <p class="muted tiny">Owner <strong>${esc(meta.owner || d.owner)}</strong> · ${esc(meta.category || d.category)} · version ${d.version}${
            d.updated ? ` · updated ${esc(d.updated)}` : ""
          }</p>
          <div class="kb-aud"><span class="muted tiny">Answers</span>${(meta.audience || d.audience)
            .map((a) => `<i class="kb-aud-pill">${esc(AUD[a] || a)}</i>`)
            .join("")}</div>
        </div>
        <div class="kb-d-acts">${acts.join("")}</div>
      </header>
      ${retired}${feedbackHtml(d)}${banner}
      <div class="kb-secs">${sectionsHtml(shown, showDraft && d.approved ? live : null)}</div>
      ${
        history.length
          ? `<details class="kb-history"><summary>History · ${history.length} change${history.length === 1 ? "" : "s"}</summary>
              <ol>${history
                .map(
                  (h) => `<li><strong>${esc(h.by)}</strong> ${esc(ACTION[h.action] || h.action)}${
                    h.action === "approved" ? ` (version ${h.version})` : ""
                  }<span class="muted tiny"> · ${esc(when(h.at))}${h.note ? ` · “${esc(h.note)}”` : ""}</span></li>`
                )
                .join("")}</ol>
            </details>`
          : `<p class="muted tiny kb-builtin">${d.builtin ? "Shipped with SmartStart · no edits yet." : ""}</p>`
      }`;
  }

  function editorHtml() {
    const d = K.mode === "edit" ? K.detail : null;
    const src = d
      ? d.draft || d.approved
      : K.prefill || { title: "", owner: "", category: "", audience: ["EMPLOYEE"], keywords: [], body: "## Overview\n" };
    return `
      <form class="kb-form" novalidate>
        <header class="kb-d-head"><div>
          <span class="kb-origin">${d ? esc(d.origin_label) : "New source"}</span>
          <h3>${d ? `Edit “${esc(d.title)}”` : "Add an approved source"}</h3>
          <p class="muted tiny">Saving creates a draft. Answers don't change until Onboarding Ops approves it.</p>
        </div></header>
        <label class="kb-f">Title<input name="title" required maxlength="120" value="${esc(src.title)}" /></label>
        <div class="kb-f-row">
          <label class="kb-f">Owning team<input name="owner" required maxlength="80" value="${esc(src.owner)}" placeholder="e.g. HR Operations" /></label>
          <label class="kb-f">Category<input name="category" maxlength="40" value="${esc(src.category)}" placeholder="e.g. HR" /></label>
        </div>
        <fieldset class="kb-f kb-f-aud"><legend>Who may be answered from it</legend>
          ${Object.entries(AUD)
            .map(
              ([k, v]) => `<label class="kb-check"><input type="checkbox" name="aud" value="${k}" ${src.audience.includes(k) ? "checked" : ""} /> ${esc(v)}</label>`
            )
            .join("")}
        </fieldset>
        <label class="kb-f">Keywords <span class="muted tiny">comma-separated words people use when asking</span>
          <input name="keywords" value="${esc((src.keywords || []).join(", "))}" placeholder="parking, car park" /></label>
        <label class="kb-f">Text <span class="muted tiny">Start each section with “## Heading”. Each section is cited on its own.</span>
          <textarea name="body" rows="14" required>${esc(src.body)}</textarea></label>
        <label class="kb-f">What changed? <span class="muted tiny">shown to the approver</span>
          <input name="note" maxlength="200" placeholder="e.g. FY27 meal allowance" value="${esc(d ? "" : K.prefill?.note || "")}" /></label>
        <p class="kb-err" hidden></p>
        <div class="kb-form-acts">
          <button type="submit" class="btn-primary">Save draft</button>
          <button type="button" class="btn-secondary" data-act="cancel">Cancel</button>
        </div>
      </form>`;
  }

  function answerCard(a, label) {
    const cites = a.citations || [];
    const badge = a.grounded
      ? `<span class="gr-badge ok">Grounded · ${cites.length} passage${cites.length === 1 ? "" : "s"}</span>`
      : `<span class="gr-badge none">No approved source · refused</span>`;
    return `<div class="kb-ans">
      <div class="kb-ans-head"><span>${esc(label)}</span>${badge}</div>
      <p>${refs(a.answer)}</p>
      ${
        cites.length
          ? `<ol class="kb-ans-cites">${cites
              .map(
                (c) => `<li><button type="button" class="kb-cite" data-id="${esc(c.source_id)}" ${c.kind === "record" ? "disabled" : ""}>
                  <b>${c.n}</b>${esc(c.title)} <span>› ${esc(c.section)} · ${esc(c.owner)}</span></button></li>`
              )
              .join("")}</ol>`
          : ""
      }
    </div>`;
  }

  function testHtml() {
    const t = K.test;
    const aud = t?.audience || (K.lib.role === "MANAGER" ? "MANAGER" : "EMPLOYEE");
    let out = `<p class="muted tiny">Ask what a joiner or colleague would ask. You'll see the answer now and, if drafts are waiting, the answer once they're approved.</p>`;
    if (K.testing) out = `<p class="muted">Checking the approved sources…</p>`;
    else if (t) {
      const same = t.current.answer === t.with_drafts.answer;
      out = same
        ? `<div class="kb-ans-grid one">${answerCard(t.current, "Answer now")}</div>
           <p class="muted tiny">${K.lib.counts.drafts ? "Pending drafts don't change this answer." : "No drafts are waiting."}</p>`
        : `<div class="kb-ans-grid">${answerCard(t.current, "Answer now")}${answerCard(t.with_drafts, "After drafts are approved")}</div>`;
    }
    return `
      <div class="card-head"><h2>Test a question</h2><span class="muted tiny">Uses exactly what NIA and IRA use</span></div>
      <form class="kb-test-form">
        <input name="q" required minlength="2" maxlength="300" placeholder="e.g. What's the daily meal limit when travelling?" value="${esc(t?.question || "")}" aria-label="Question" />
        <select name="aud" aria-label="Asked by">${Object.entries(AUD)
          .map(([k, v]) => `<option value="${k}" ${k === aud ? "selected" : ""}>${k === "EMPLOYEE" ? "Employee asks IRA" : `${esc(v)} asks NIA`}</option>`)
          .join("")}</select>
        <button type="submit" class="btn-primary">Ask</button>
      </form>
      <div class="kb-test-out">${out}</div>`;
  }

  /* ---------- actions ---------- */

  async function act(kind) {
    const id = K.sel;
    const path = `/api/knowledge/sources/${encodeURIComponent(id)}`;
    try {
      if (kind === "edit") {
        K.mode = "edit";
        return paint();
      }
      if (kind === "cancel") {
        K.mode = "view";
        K.prefill = null;
        return load();
      }
      if (kind === "approve") {
        await send("POST", `${path}/approve`);
        showToast("Approved — NIA and IRA now answer from this version");
      } else if (kind === "discard") {
        const r = await send("DELETE", `${path}/draft`);
        if (r.deleted) K.sel = null;
        showToast("Draft discarded");
      } else if (kind === "retire") {
        await send("POST", `${path}/retire`);
        showToast("Retired — NIA and IRA no longer answer from it");
      } else if (kind === "restore") {
        await send("POST", `${path}/restore`);
        showToast("Restored");
      }
      K.mode = "view";
      await load();
      if (K.test) runTest(K.test.question, K.test.audience);
    } catch (err) {
      showToast(err.message);
    }
  }

  async function save(form) {
    const f = new FormData(form);
    const body = {
      title: f.get("title"),
      owner: f.get("owner"),
      category: f.get("category") || "General",
      audience: f.getAll("aud"),
      keywords: String(f.get("keywords") || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      body: f.get("body"),
      note: f.get("note") || "",
    };
    const err = form.querySelector(".kb-err");
    const btn = form.querySelector('[type="submit"]');
    btn.disabled = true;
    try {
      const d =
        K.mode === "edit"
          ? await send("PUT", `/api/knowledge/sources/${encodeURIComponent(K.sel)}/draft`, body)
          : await send("POST", "/api/knowledge/sources", body);
      K.sel = d.id;
      K.mode = "view";
      K.view = "draft";
      K.prefill = null;
      showToast(K.lib.can_approve ? "Draft saved — approve it to publish" : "Draft saved — waiting for Ops approval");
      await load();
    } catch (e) {
      err.hidden = false;
      err.textContent = e.message;
      btn.disabled = false;
    }
  }

  async function runTest(question, audience) {
    K.testing = true;
    K.test = { question, audience, current: null, with_drafts: null };
    paintTest();
    try {
      K.test = await postJSON("/api/knowledge/preview", { question, audience });
    } catch (err) {
      K.test = null;
      showToast(err.message);
    } finally {
      K.testing = false;
      paintTest();
    }
  }

  function paintTest() {
    const box = document.querySelector(".kb-test");
    if (!box) return;
    box.innerHTML = testHtml();
    wireTest(box);
  }

  function wireTest(box) {
    box.querySelector(".kb-test-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const q = String(f.get("q") || "").trim();
      if (q.length >= 2) runTest(q, f.get("aud"));
    });
    box.querySelectorAll(".kb-cite[data-id]").forEach((b) => b.addEventListener("click", () => select(b.dataset.id)));
  }

  function wire() {
    const r = root();
    r.querySelectorAll("[data-tab]").forEach((b) =>
      b.addEventListener("click", () => {
        K.tab = b.dataset.tab;
        K.note = null;
        if (K.tab === "insights") K.mode = "view";
        paint();
        if (K.tab === "insights") load().catch((err) => showToast(err.message));
      })
    );
    if (K.tab === "insights") {
      r.querySelectorAll("[data-ins]").forEach((b) => b.addEventListener("click", () => insAct(b)));
      r.querySelectorAll("[data-scope]").forEach((b) =>
        b.addEventListener("click", () => {
          K.scope = b.dataset.scope;
          paint();
        })
      );
      r.querySelector(".kb-note")?.addEventListener("submit", (e) => {
        e.preventDefault();
        insNote(e.target);
      });
      return;
    }
    const search = r.querySelector(".kb-search");
    search.addEventListener("input", () => {
      K.q = search.value;
      r.querySelector(".kb-rows").innerHTML = listRows();
      wireRows();
    });
    r.querySelectorAll(".kb-filter").forEach((b) =>
      b.addEventListener("click", () => {
        K.filter = b.dataset.f;
        paint();
      })
    );
    r.querySelector(".kb-new")?.addEventListener("click", () => {
      K.mode = "new";
      K.prefill = null;
      paint();
      document.querySelector('.kb-form [name="title"]')?.focus();
    });
    wireRows();
    r.querySelectorAll("[data-act]").forEach((b) => b.addEventListener("click", () => act(b.dataset.act)));
    r.querySelectorAll("[data-view]").forEach((b) =>
      b.addEventListener("click", () => {
        K.view = b.dataset.view;
        paint();
      })
    );
    r.querySelector(".kb-form")?.addEventListener("submit", (e) => {
      e.preventDefault();
      save(e.target);
    });
    wireTest(r.querySelector(".kb-test"));
  }

  function wireRows() {
    root()
      .querySelectorAll(".kb-row")
      .forEach((b) => b.addEventListener("click", () => select(b.dataset.id)));
  }
})();
