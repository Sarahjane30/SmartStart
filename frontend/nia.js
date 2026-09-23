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
  if (!res.ok) throw new Error(`NIA → ${res.status}`);
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

function niaRenderProactive() {
  const dismissed = niaDismissed();
  nia.proactive = nia.proactive.filter((p) => !dismissed.has(p.id));
  nia.proactive.forEach((p) => {
    const el = niaAppend(
      "bot",
      `<div class="nia-nudge">
        <span class="nia-nudge-icon" aria-hidden="true">!</span>
        <p>${esc(p.text)}</p>
        <div class="nia-nudge-acts">
          ${
            p.joiner_id
              ? `<button type="button" class="nia-mini" data-nia-q="Why is this joiner at risk?" data-nia-focus="${esc(p.joiner_id)}">Tell me more</button>`
              : `<button type="button" class="nia-mini" data-nia-q="Which team needs attention?">Tell me more</button>`
          }
          <button type="button" class="nia-mini nia-ghost" data-nia-dismiss="${esc(p.id)}">Dismiss</button>
        </div>
      </div>`,
      "nia-nudge-wrap"
    );
    el.dataset.nudge = p.id;
  });
  niaPaintBadge();
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
      niaPaintBadge();
    })
    .catch(() => {});
}

if (typeof employerSession !== "undefined" && employerSession) niaWire();
