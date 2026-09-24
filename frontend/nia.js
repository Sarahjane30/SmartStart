/* NIA — New-Hire Intelligence Assistant (employer side).
 * Every answer comes from /api/nia/*, which reads the same role context as the dashboard.
 * NIA never performs consequential actions itself: confirm cards hand off to the
 * Command Center's own Assign / Resolve handlers only after the user confirms. */

const nia = {
  open: false,
  loaded: false,
  ready: null,
  busy: false,
  focus: null,
  proactive: [],
  shown: new Set(),
  known: new Set(),
  dismissKey: "smartstart_nia_dismissed",
};

const HEALTH_LABEL = { blocked: "Blocked", at_risk: "At risk", on_track: "On track" };

function niaEl(id) {
  return document.getElementById(id);
}

function niaDismissed() {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(nia.dismissKey) || "[]"));
  } catch {
    return new Set();
  }
}

function niaDismiss(id) {
  const set = niaDismissed();
  set.add(id);
  sessionStorage.setItem(nia.dismissKey, JSON.stringify([...set]));
  nia.proactive = nia.proactive.filter((p) => p.id !== id);
  niaPaintBadge();
}

function niaPaintBadge() {
  const badge = niaEl("nia-badge");
  const n = nia.proactive.length;
  badge.hidden = n === 0 || nia.open;
  badge.textContent = String(n);
}

function niaRich(text) {
  return esc(text)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br>");
}

function niaSourceUrl(block) {
  return block.url || `${location.protocol}//${location.hostname}:${block.port}/`;
}

async function niaPost(path, body) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...employerAuthHeaders() },
    body: JSON.stringify(body),
  });
  if (res.status === 401) {
    window.location.replace("/?need=employer");
    throw new Error("Employer login required");
  }
  if (!res.ok) {
    let detail = `NIA → ${res.status}`;
    try {
      detail = (await res.json()).detail || detail;
    } catch {}
    throw new Error(detail);
  }
  return res.json();
}

function niaFacts(b) {
  if (!b.rows.length) return "";
  return `<div class="nia-block">
    ${b.title ? `<p class="nia-block-title">${esc(b.title)}</p>` : ""}
    <dl class="nia-facts">${b.rows
      .map((r) => `<div><dt>${esc(r.label)}</dt><dd>${esc(r.value)}</dd></div>`)
      .join("")}</dl>
  </div>`;
}

function niaBullets(b) {
  return `<div class="nia-block">
    ${b.title ? `<p class="nia-block-title">${esc(b.title)}</p>` : ""}
    <ul class="nia-bullets">${b.items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>
  </div>`;
}

function niaJoinerCards(b) {
  return `<div class="nia-block">
    ${b.title ? `<p class="nia-block-title">${esc(b.title)}</p>` : ""}
    <div class="nia-cards">${b.items
      .map(
        (j) => `<article class="nia-card nia-${esc(j.health)}">
          <div class="nia-card-top">
            <div>
              <strong>${esc(j.name)}</strong>
              <span class="nia-card-sub">${esc(j.subtitle)}</span>
            </div>
            <span class="nia-health nia-${esc(j.health)}">${esc(HEALTH_LABEL[j.health] || j.health)} · ${esc(j.risk_score)}</span>
          </div>
          <p class="nia-card-issue">${esc(j.issue || j.stage)}</p>
          ${j.overall ? `<p class="nia-card-meta">Overall blocker: ${esc(j.overall)}</p>` : ""}
          <p class="nia-card-meta">${esc(j.stage)}${j.owner ? ` · ${esc(j.owner)}` : ""}${
            j.source ? ` · <span class="nia-src">${esc(j.source)}</span>` : ""
          }</p>
          ${typeof journeyStrip === "function" && j.journey ? journeyStrip(j.journey, "mini") : ""}
          <div class="nia-card-foot">
            <span class="nia-card-note">${esc(j.note || "")}</span>
            <span class="nia-card-acts">
              <button type="button" class="nia-mini" data-nia-open="${esc(j.id)}">Open</button>
              <button type="button" class="nia-mini" data-nia-q="Why is ${esc(j.name)} at risk?" data-nia-focus="${esc(j.id)}">Ask why</button>
            </span>
          </div>
        </article>`
      )
      .join("")}</div>
  </div>`;
}

function niaLink(b) {
  return `<a class="nia-source-btn" href="${esc(niaSourceUrl(b))}" target="_blank" rel="noopener"
      title="Opens the independent ${esc(b.system)} mock app in a new tab">
      <span>${esc(b.label)}</span>
      ${b.record ? `<code>${esc(b.record)}</code>` : `<em>${esc(b.domain || b.system)}</em>`}
      <span aria-hidden="true">↗</span>
    </a>`;
}

function niaConfirm(b, idx) {
  const who =
    b.action === "assign" ? `${b.owner_name} (${b.owner_team})` : b.action === "add_course" ? "Their Learning tab" : "SmartStart";
  return `<div class="nia-confirm" data-nia-confirm="${idx}">
    <p class="nia-block-title">Confirm action</p>
    <dl class="nia-facts">
      <div><dt>Action</dt><dd>${
        {
          assign: "Assign bottleneck owner",
          resolve: "Mark bottleneck resolved",
          reopen: "Reopen — still needs help",
          add_course: `Add course · ${b.course_title}`,
        }[b.action]
      }</dd></div>
      <div><dt>Joiner</dt><dd>${esc(b.joiner_name)}</dd></div>
      <div><dt>${b.action === "assign" ? "Assign to" : "Where"}</dt><dd>${esc(who)}</dd></div>
    </dl>
    <p class="nia-card-meta">${esc(b.note || "")}</p>
    <div class="nia-confirm-acts">
      <button type="button" class="nia-primary" data-nia-do="confirm">${esc(b.confirm_label || "Confirm")}</button>
      <button type="button" class="nia-mini" data-nia-do="cancel">Cancel</button>
    </div>
  </div>`;
}

/* --- HR onboarding cases ------------------------------------------------- */

const NC_ICON = { done: "✓", active: "◐", pending: "○", attention: "!" };

function ncIcon(status) {
  return `<span class="nc-ic nc-${esc(status)}" aria-hidden="true">${NC_ICON[status] || "○"}</span>`;
}

function ncInitials(name) {
  return esc(
    name
      .split(/\s+/)
      .map((p) => p[0] || "")
      .join("")
      .slice(0, 2)
      .toUpperCase()
  );
}

function ncHead(b) {
  return `<header class="nc-head">
    <span class="nc-avatar" aria-hidden="true">${ncInitials(b.name)}</span>
    <div class="nc-who">
      <strong>${esc(b.name)}</strong>
      <span>${esc(b.position)} · starts ${esc(b.start_label)} (${esc(b.when)}) · Manager ${esc(b.manager)}</span>
    </div>
    <span class="nc-pill nc-st-${esc(b.status)}">${esc(b.status_label)}</span>
  </header>`;
}

function ncGroup(g) {
  const chipsOnly = g.key === "Learning";
  const rows = g.items.filter((i) => !chipsOnly && !i.key.startsWith("access:"));
  const chips = g.items.filter((i) => chipsOnly || i.key.startsWith("access:"));
  return `<section class="nc-group">
    <header><strong>${esc(g.title)}</strong><span>${esc(g.owner)}</span><em>${g.done}/${g.total}</em></header>
    ${
      rows.length
        ? `<ul class="nc-items">${rows
            .map(
              (i) => `<li class="nc-row nc-${esc(i.status)}${i.auto ? "" : " nc-needs"}">
                ${ncIcon(i.status)}<span class="nc-label">${esc(i.label)}</span>
                <span class="nc-detail">${esc(i.auto ? i.detail : "Needs your confirmation")}</span>
              </li>`
            )
            .join("")}</ul>`
        : ""
    }
    ${
      chips.length
        ? `<div class="nc-chips">${chips
            .map((i) => `<span class="nc-chip nc-${esc(i.status)}" title="${esc(i.detail)}">${ncIcon(i.status)}${esc(i.label)}</span>`)
            .join("")}</div>`
        : ""
    }
  </section>`;
}

function ncConfirmField(c) {
  if (c.options) {
    return `<label class="nc-field"><span>${esc(c.label)}</span>
      <select data-nc-conf="${esc(c.key)}">${c.options
        .map((o) => `<option value="${esc(o.value)}"${o.value === c.value ? " selected" : ""}>${esc(o.label)}</option>`)
        .join("")}</select>
      <small>${esc(c.note)}</small></label>`;
  }
  return `<label class="nc-field"><span>${esc(c.label)}</span>
    <input data-nc-conf="${esc(c.key)}" value="${esc(c.value)}" maxlength="60" />
    <small>${esc(c.note)}</small></label>`;
}

function niaCasePlan(b, idx) {
  const conf = b.confirmations || [];
  return `<div class="nc-case" data-nia-case="${idx}">
    ${ncHead(b)}
    <div class="nc-progress" aria-label="${b.progress_pct}% complete"><span style="width:${b.progress_pct}%"></span></div>
    <p class="nc-meta">${b.counts.done} of ${b.counts.total} done · ${esc(b.initiated)}</p>
    ${
      conf.length
        ? `<div class="nc-confirm"><p class="nia-block-title">Needs your confirmation</p>${conf.map(ncConfirmField).join("")}</div>`
        : ""
    }
    <div class="nc-groups">${b.groups.map(ncGroup).join("")}</div>
    ${
      b.can_approve
        ? `<div class="nc-acts">
            <button type="button" class="nia-primary" data-nc-do="approve">Approve plan</button>
            <button type="button" class="nia-mini" data-nc-do="later">Not now</button>
          </div>
          <p class="nia-card-meta">Approving sends IT provisioning to the IT Service Desk and preparation to ${esc(
            b.manager
          )}. NIA then follows up with them — not you.</p>`
        : ""
    }
  </div>`;
}

function niaCaseStatus(b) {
  const a = b.attention;
  return `<div class="nc-case">
    ${ncHead(b)}
    <div class="nc-progress"><span style="width:${b.progress_pct}%"></span></div>
    <ol class="nc-steps">${b.steps
      .map((s) => `<li class="nc-${esc(s.status)}" title="${esc(s.detail)}">${ncIcon(s.status)}<span>${esc(s.label)}</span></li>`)
      .join("")}</ol>
    <div class="nc-att nc-att-${esc(a.level)}">
      <strong>${esc(a.headline)}</strong>
      ${a.reason ? `<p>${esc(a.reason)}</p>` : ""}
    </div>
    ${
      b.followups.length
        ? `<div class="nc-log"><p class="nia-block-title">NIA is handling</p><ul>${b.followups
            .map((e) => `<li><span>${esc(e.text)}</span>${e.to ? `<em>→ ${esc(e.to)}</em>` : ""}</li>`)
            .join("")}</ul></div>`
        : ""
    }
    <div class="nc-acts">
      <button type="button" class="nia-mini" data-nia-q="Show ${esc(b.name)}'s onboarding plan" data-nia-focus="${esc(b.joiner_id)}">View plan</button>
      <button type="button" class="nia-mini" data-nia-q="Show ${esc(b.name)}'s documents" data-nia-focus="${esc(b.joiner_id)}">Documents</button>
      <button type="button" class="nia-mini" data-nia-open="${esc(b.joiner_id)}">Open joiner</button>
    </div>
  </div>`;
}

function niaDocuments(b) {
  return `<div class="nc-case nc-docs">
    <ul class="nc-items">${b.rows
      .map(
        (r) => `<li class="nc-row nc-${esc(r.status)}">${ncIcon(r.status)}<span class="nc-label">${esc(r.name)}</span>
          <span class="nc-detail">${esc(r.detail)}</span></li>`
      )
      .join("")}</ul>
    ${b.action ? `<div class="nc-att nc-att-action"><strong>Action needed</strong><p>${esc(b.action)}</p></div>` : ""}
    <p class="nc-meta">${b.form_count} forms · ${esc(b.employee_id)}</p>
    ${
      b.state !== "complete"
        ? `<div class="nc-acts"><button type="button" class="nia-mini" data-nia-q="Send ${esc(
            b.name
          )} a reminder about the documents" data-nia-focus="${esc(b.joiner_id)}">Draft reminder</button></div>`
        : ""
    }
  </div>`;
}

function niaDraft(b, idx) {
  return `<div class="nc-draft" data-nia-draft="${idx}">
    <p class="nia-block-title">${esc(b.label)} · draft</p>
    <p class="nc-to">To <strong>${esc(b.to.name)}</strong> <span>${esc(b.to.address)}</span>${
      b.to.cc ? `<span>cc ${esc(b.to.cc)}</span>` : ""
    }</p>
    <input class="nc-subject" value="${esc(b.subject)}" maxlength="140" aria-label="Subject" />
    <textarea class="nc-body" rows="${Math.min(20, b.body.split("\n").length + 3)}" maxlength="4000" aria-label="Message">${esc(b.body)}</textarea>
    <p class="nia-card-meta">${esc(b.note)}</p>
    <div class="nc-acts">
      <button type="button" class="nia-primary" data-nc-do="send">Confirm &amp; send</button>
      <button type="button" class="nia-mini" data-nc-do="cancel">Cancel</button>
    </div>
  </div>`;
}

function niaDrafts(b, idx) {
  return `<div class="nc-draft" data-nia-drafts="${idx}">
    <p class="nia-block-title">${esc(b.label)} · ${b.items.length} drafts</p>
    <ul class="nc-recips">${b.items
      .map(
        (i) => `<li><label><input type="checkbox" checked value="${esc(i.joiner_id)}" />
          <strong>${esc(i.name)}</strong><span>${esc(i.detail)}</span><em>${esc(i.address)}</em></label></li>`
      )
      .join("")}</ul>
    <details class="nc-preview"><summary>Preview — ${esc(b.preview_name)}</summary><pre>${esc(b.preview)}</pre></details>
    <div class="nc-acts">
      <button type="button" class="nia-primary" data-nc-do="send">Confirm &amp; send ${b.items.length}</button>
      <button type="button" class="nia-mini" data-nc-do="cancel">Cancel</button>
    </div>
  </div>`;
}

function niaCaseComplete(b, idx) {
  return `<div class="nc-case nc-complete" data-nia-close="${idx}">
    <ul class="nc-items">${b.items
      .map((i) => {
        const st = i.done ? "done" : i.soft ? "active" : "pending";
        return `<li class="nc-row nc-${st}">${ncIcon(st)}<span class="nc-label">${esc(i.label)}</span>${
          !i.done && i.soft ? `<span class="nc-detail">Continues in their Learning tab</span>` : ""
        }</li>`;
      })
      .join("")}</ul>
    <p class="nc-meta">Project Ready within ${b.days} days of accepting the offer. No outstanding onboarding actions${
      b.learning_left ? ` — ${b.learning_left} learning module(s) continue after Project Ready` : ""
    }.</p>
    ${
      b.can_close
        ? `<div class="nc-acts"><button type="button" class="nia-primary" data-nc-do="close">Close case</button></div>`
        : ""
    }
  </div>`;
}

function niaCases(b) {
  return `<div class="nc-list">${b.items
    .map(
      (c) => `<button type="button" class="nc-list-row" data-nia-q="${esc(c.q)}" data-nia-focus="${esc(c.joiner_id)}">
        <span class="nc-avatar sm" aria-hidden="true">${ncInitials(c.name)}</span>
        <span class="nc-who"><strong>${esc(c.name)}</strong><span>${esc(c.position)} · ${esc(c.start_label)} (${esc(c.when)})</span>
          <span class="nc-line nc-lv-${esc(c.level)}">${esc(c.headline)}</span></span>
        <span class="nc-side"><span class="nc-pill nc-st-${esc(c.status)}">${esc(c.status_label)}</span>
          <span class="nc-mini-bar"><span style="width:${c.progress_pct}%"></span></span></span>
      </button>`
    )
    .join("")}</div>`;
}

function ncDone(card, html) {
  card.querySelectorAll("button, input, select, textarea").forEach((el) => (el.disabled = true));
  card.classList.add("is-done");
  niaAppend("bot", html);
}

function ncFail(card, err) {
  card.querySelectorAll("button, input, select, textarea").forEach((el) => (el.disabled = false));
  niaAppend("bot", `<div class="nia-text">That didn't go through (${esc(err.message)}) — nothing was changed.</div>`);
}

async function ncApprove(card, b) {
  const body = {};
  card.querySelectorAll("[data-nc-conf]").forEach((el) => (body[el.dataset.ncConf] = el.value));
  card.querySelectorAll("button, input, select").forEach((el) => (el.disabled = true));
  try {
    const res = await niaPost(`/api/nia/cases/${encodeURIComponent(b.joiner_id)}/approve`, body);
    ncDone(
      card,
      `<div class="nc-routed">
        <p class="nc-routed-title">✓ Onboarding initiated for ${esc(b.name)}</p>
        <ul>${res.routed
          .map((r) => `<li><span class="nc-team">${esc(r.team)}</span><span>${esc(r.what)}</span><em>${esc(r.status)}</em></li>`)
          .join("")}</ul>
        <p>I'll follow up with IT and ${esc(b.manager)} and only come back to you when HR needs to act.</p>
      </div>`
    );
    niaSuggest([`Draft a welcome email for ${b.first}`, `How's ${b.first}'s onboarding?`, "What am I waiting for?"]);
    window.loadAll?.().catch(() => {});
  } catch (err) {
    ncFail(card, err);
  }
}

async function ncSend(card, b) {
  const subject = card.querySelector(".nc-subject").value;
  const body = card.querySelector(".nc-body").value;
  card.querySelectorAll("button, input, textarea").forEach((el) => (el.disabled = true));
  try {
    await niaPost("/api/nia/comms/send", { joiner_id: b.joiner_id, kind: b.kind, subject, body });
    ncDone(
      card,
      `<div class="nia-text">Sent — <strong>${esc(b.label)}</strong> to ${esc(b.to.name)}. It's logged on ${esc(
        b.joiner_name
      )}'s case${b.to.audience === "Employee" ? " and shows in their SmartStart notifications" : ""}. (Simulated delivery — no real email.)</div>`
    );
  } catch (err) {
    ncFail(card, err);
  }
}

async function ncSendBulk(card, b) {
  const ids = [...card.querySelectorAll(".nc-recips input:checked")].map((el) => el.value);
  if (!ids.length) {
    niaAppend("bot", `<div class="nia-text">No one is ticked, so nothing was sent.</div>`);
    return;
  }
  card.querySelectorAll("button, input").forEach((el) => (el.disabled = true));
  try {
    const res = await niaPost("/api/nia/comms/send-bulk", { kind: b.kind, joiner_ids: ids });
    ncDone(
      card,
      `<div class="nia-text">Sent <strong>${res.count} ${esc(b.label.toLowerCase())}(s)</strong>. Each is logged on the joiner's case and shows in their SmartStart notifications. (Simulated delivery.)</div>`
    );
  } catch (err) {
    ncFail(card, err);
  }
}

async function ncClose(card, b) {
  card.querySelectorAll("button").forEach((el) => (el.disabled = true));
  try {
    await niaPost(`/api/nia/cases/${encodeURIComponent(b.joiner_id)}/close`, {});
    ncDone(card, `<div class="nia-text">Closed — ${esc(b.name)}'s onboarding case is complete. 🎉</div>`);
  } catch (err) {
    ncFail(card, err);
  }
}

function ncWire(el, reply) {
  const bind = (attr, handlers) => {
    el.querySelectorAll(`[${attr}]`).forEach((card) => {
      const block = reply.blocks[Number(card.getAttribute(attr))];
      card.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-nc-do]");
        if (!btn || btn.disabled) return;
        const fn = handlers[btn.dataset.ncDo];
        if (fn) fn(card, block);
      });
    });
  };
  const cancel = (card) => {
    card.querySelectorAll("button, input, select, textarea").forEach((x) => (x.disabled = true));
    card.classList.add("is-cancelled");
    niaAppend("bot", `<div class="nia-text">Okay — nothing was sent or changed.</div>`);
  };
  bind("data-nia-case", {
    approve: ncApprove,
    later: (card, b) => {
      cancel(card);
      niaSuggest([`Show ${b.first}'s documents`, "Show onboarding plans waiting for review"]);
    },
  });
  bind("data-nia-draft", { send: ncSend, cancel });
  bind("data-nia-drafts", { send: ncSendBulk, cancel });
  bind("data-nia-close", { close: ncClose });
}

function niaAppend(role, html, extraClass = "") {
  const log = niaEl("nia-log");
  const div = document.createElement("div");
  div.className = `nia-msg nia-${role} ${extraClass}`.trim();
  div.innerHTML = html;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
  return div;
}

function niaRenderReply(reply) {
  const links = reply.blocks.filter((b) => b.type === "link");
  const body = reply.blocks
    .map((b, i) => {
      if (b.type === "facts") return niaFacts(b);
      if (b.type === "bullets") return niaBullets(b);
      if (b.type === "joiners") return niaJoinerCards(b);
      if (b.type === "confirm") return niaConfirm(b, i);
      if (b.type === "case_plan") return niaCasePlan(b, i);
      if (b.type === "case_status") return niaCaseStatus(b);
      if (b.type === "documents") return niaDocuments(b);
      if (b.type === "draft") return niaDraft(b, i);
      if (b.type === "drafts") return niaDrafts(b, i);
      if (b.type === "case_complete") return niaCaseComplete(b, i);
      if (b.type === "cases") return niaCases(b);
      return "";
    })
    .join("");
  const sources = (reply.sources || [])
    .map((s) => `<span class="nia-src">${esc(s)}</span>`)
    .join("");
  const el = niaAppend(
    "bot",
    `<div class="nia-text">${niaRich(reply.text)}</div>
     ${body}
     ${links.length ? `<div class="nia-links">${links.map(niaLink).join("")}</div>` : ""}
     <div class="nia-sources"><span>Sources</span>${sources}</div>`
  );
  el.querySelectorAll("[data-nia-confirm]").forEach((card) => {
    const block = reply.blocks[Number(card.dataset.niaConfirm)];
    card.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-nia-do]");
      if (!btn) return;
      niaHandleConfirm(card, block, btn.dataset.niaDo === "confirm");
    });
  });
  ncWire(el, reply);
  if (reply.focus_joiner_id) nia.focus = reply.focus_joiner_id;
  niaSuggest(reply.suggestions || []);
}

function niaHandleConfirm(card, block, ok) {
  card.querySelectorAll("button").forEach((b) => (b.disabled = true));
  if (!ok) {
    card.classList.add("is-cancelled");
    niaAppend("bot", `<div class="nia-text">Cancelled — nothing was changed.</div>`);
    return;
  }
  if (block.action === "assign") {
    confirmAssign(block.joiner_id, block.owner_id, block.owner_name, block.owner_team);
    niaAppend(
      "bot",
      `<div class="nia-text">Done — <strong>${esc(block.joiner_name)}</strong>${block.joiner_name.endsWith("s") ? "'" : "'s"} bottleneck is assigned to <strong>${esc(
        block.owner_name
      )}</strong> in the Command Center.</div>`
    );
  } else if (block.action === "add_course") {
    window
      .addCourse(block.joiner_id, { course_id: block.course_id })
      .then(() => {
        card.classList.add("is-done");
        niaAppend(
          "bot",
          `<div class="nia-text">Added <strong>${esc(block.course_title)}</strong> to ${esc(
            block.joiner_name
          )}'s learning — they'll see it in their Learning tab with a notification.</div>`
        );
      })
      .catch((err) => {
        card.classList.add("is-cancelled");
        niaAppend("bot", `<div class="nia-text">That didn't go through (${esc(err.message)}) — nothing was changed.</div>`);
      });
    return;
  } else if (block.action === "resolve" || block.action === "reopen") {
    const poss = `${esc(block.joiner_name)}</strong>${block.joiner_name.endsWith("s") ? "'" : "'s"}`;
    handleAction(block.action, block.joiner_id).then((ok) => {
      if (!ok) {
        card.classList.add("is-cancelled");
        niaAppend("bot", `<div class="nia-text">That didn't go through — nothing was changed.</div>`);
        return;
      }
      card.classList.add("is-done");
      niaAppend(
        "bot",
        block.action === "resolve"
          ? `<div class="nia-text">Done — <strong>${poss} bottleneck is resolved and has left your alerts and queue. ${esc(
              block.note || ""
            )} If they still need help, just say so.</div>`
          : `<div class="nia-text">Reopened — <strong>${poss} bottleneck is back in your alerts and queue as <em>still needs help</em>.</div>`
      );
    });
    return;
  }
  card.classList.add("is-done");
}

function niaSuggest(list) {
  niaEl("nia-suggest").innerHTML = list
    .slice(0, 4)
    .map((s) => `<button type="button" class="nia-chip" data-nia-q="${esc(s)}">${esc(s)}</button>`)
    .join("");
}

function niaNudgeHtml(p) {
  const cta = p.cta_q
    ? `<button type="button" class="${p.kind === "detected" ? "nia-primary" : "nia-mini"}" data-nia-q="${esc(p.cta_q)}"${
        p.joiner_id ? ` data-nia-focus="${esc(p.joiner_id)}"` : ""
      }>${esc(p.cta_label || "Tell me more")}</button>`
    : p.joiner_id
      ? `<button type="button" class="nia-mini" data-nia-q="Why is this joiner at risk?" data-nia-focus="${esc(p.joiner_id)}">Tell me more</button>`
      : `<button type="button" class="nia-mini" data-nia-q="Which team needs attention?">Tell me more</button>`;
  const dismiss = `<button type="button" class="nia-mini nia-ghost" data-nia-dismiss="${esc(p.id)}">Dismiss</button>`;
  if (p.kind === "detected") {
    return `<div class="nia-detect">
      <p class="nd-title">${esc(p.title)}</p>
      <dl>${(p.fields || [])
        .map((f) => (f.label ? `<div><dt>${esc(f.label)}</dt><dd>${esc(f.value)}</dd></div>` : `<div class="nd-name">${esc(f.value)}</div>`))
        .join("")}</dl>
      <p>${esc(p.text)}</p>
      <div class="nia-nudge-acts">${cta}${dismiss}</div>
    </div>`;
  }
  return `<div class="nia-nudge">
    <span class="nia-nudge-icon" aria-hidden="true">${p.kind === "reminder" ? "↻" : "!"}</span>
    <p>${esc(p.text)}</p>
    <div class="nia-nudge-acts">${cta}${dismiss}</div>
  </div>`;
}

function niaRenderProactive() {
  const dismissed = niaDismissed();
  nia.proactive = nia.proactive.filter((p) => !dismissed.has(p.id));
  nia.proactive
    .filter((p) => !nia.shown.has(p.id))
    .forEach((p) => {
      nia.shown.add(p.id);
      const el = niaAppend("bot", niaNudgeHtml(p), "nia-nudge-wrap");
      el.dataset.nudge = p.id;
    });
  niaPaintBadge();
}

async function niaPollInbox() {
  if (document.hidden) return;
  try {
    const res = await fetchJSON("/api/nia/inbox");
    const dismissed = niaDismissed();
    const fresh = (res.proactive || []).filter((p) => !dismissed.has(p.id));
    const newlyDetected = fresh.filter((p) => p.kind === "detected" && !nia.known.has(p.id));
    fresh.forEach((p) => nia.known.add(p.id));
    nia.proactive = fresh;
    if (nia.loaded && nia.open) {
      // Mid-conversation only a brand-new joiner is worth interrupting for.
      fresh.filter((p) => p.kind !== "detected").forEach((p) => nia.shown.add(p.id));
      niaRenderProactive();
    } else niaPaintBadge();
    if (newlyDetected.length) {
      const name = (newlyDetected[0].fields || [])[0]?.value || "a new joiner";
      window.showToast?.(`NIA: new joiner detected — ${name}`);
      niaEl("nia-launcher").classList.add("is-pulse");
      window.loadAll?.().catch(() => {});
    }
  } catch {}
}

async function niaLoadWelcome() {
  try {
    const w = await fetchJSON("/api/nia/briefing");
    nia.loaded = true;
    niaEl("nia-role").textContent = w.assistant?.role_label || w.role;
    nia.proactive = w.proactive || [];
    niaRenderReply(w);
    niaRenderProactive();
  } catch (err) {
    niaAppend("bot", `<div class="nia-text">NIA is unavailable right now (${esc(err.message)}).</div>`);
  }
}

async function niaAsk(message, focusId) {
  const text = (message || "").trim();
  if (!text || nia.busy) return;
  if (focusId) nia.focus = focusId;
  nia.busy = true;
  niaAppend("user", `<div class="nia-text">${esc(text)}</div>`);
  const typing = niaAppend("bot", `<span class="nia-typing"><i></i><i></i><i></i></span>`, "nia-pending");
  window.iraGlobe?.setThinking(true);
  try {
    const reply = await niaPost("/api/nia/ask", { message: text, focus_joiner_id: nia.focus });
    typing.remove();
    niaRenderReply(reply);
  } catch (err) {
    typing.remove();
    niaAppend("bot", `<div class="nia-text">Something went wrong reaching NIA (${esc(err.message)}).</div>`);
  } finally {
    nia.busy = false;
    window.iraGlobe?.setThinking(false);
  }
}

function niaSetOpen(open) {
  nia.open = open;
  niaEl("nia-panel").hidden = !open;
  niaEl("nia-launcher").setAttribute("aria-expanded", String(open));
  niaEl("nia-launcher").classList.toggle("is-open", open);
  niaPaintBadge();
  if (open) {
    niaEl("nia-launcher").classList.remove("is-pulse");
    requestAnimationFrame(() => window.iraGlobe?.start());
    nia.ready = nia.ready || niaLoadWelcome();
    setTimeout(() => niaEl("nia-input").focus(), 50);
  }
}

function niaWire() {
  niaEl("nia-launcher").hidden = false;
  niaEl("nia-launcher").addEventListener("click", () => niaSetOpen(!nia.open));
  niaEl("nia-close").addEventListener("click", () => niaSetOpen(false));
  niaEl("nia-briefing-btn").addEventListener("click", () => {
    niaSetOpen(true);
    niaAsk("Give me my briefing");
  });
  niaEl("nia-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = niaEl("nia-input");
    niaAsk(input.value);
    input.value = "";
  });
  niaEl("nia-input").addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      niaSetOpen(false);
    }
  });
  niaEl("nia-panel").addEventListener("click", (e) => {
    const q = e.target.closest("[data-nia-q]");
    if (q) {
      niaAsk(q.dataset.niaQ, q.dataset.niaFocus || null);
      return;
    }
    const open = e.target.closest("[data-nia-open]");
    if (open) {
      openJoinerDrawer(open.dataset.niaOpen);
      return;
    }
    const dis = e.target.closest("[data-nia-dismiss]");
    if (dis) {
      niaDismiss(dis.dataset.niaDismiss);
      dis.closest(".nia-msg")?.remove();
    }
  });
  document.addEventListener("click", (e) => {
    const hook = e.target.closest("[data-nia-ask]");
    if (!hook) return;
    e.preventDefault();
    niaSetOpen(true);
    const name = hook.dataset.niaName || "this joiner";
    nia.ready.then(() => niaAsk(`Give me a complete picture of ${name}`, hook.dataset.niaAsk));
  });

  fetchJSON("/api/nia/briefing")
    .then((w) => {
      const dismissed = niaDismissed();
      nia.proactive = (w.proactive || []).filter((p) => !dismissed.has(p.id));
      nia.proactive.forEach((p) => nia.known.add(p.id));
      niaPaintBadge();
    })
    .catch(() => {});
  setInterval(niaPollInbox, 10000);
}

if (typeof employerSession !== "undefined" && employerSession) niaWire();
