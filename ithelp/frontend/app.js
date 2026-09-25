/* Mock IT Help portal — employee self-service (synthetic). */

const token = localStorage.getItem("ithelp.token");
if (!token) {
  location.replace(`/login?next=${encodeURIComponent("/" + location.hash)}`);
}

const S = { me: null, catalog: null, favorites: JSON.parse(localStorage.getItem("ithelp.favorites") || "[]") };
const view = document.getElementById("view");

const esc = (s) =>
  String(s ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const initials = (n) => n.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();
const ago = (iso) => {
  const d = Math.round((Date.now() - new Date(iso)) / 86400000);
  return d <= 0 ? "Today" : d === 1 ? "Yesterday" : `${d} days ago`;
};

async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
  });
  if (res.status === 401) {
    localStorage.removeItem("ithelp.token");
    location.replace(`/login?next=${encodeURIComponent("/" + location.hash)}`);
    throw new Error("Signed out");
  }
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || `${res.status}`);
  return data;
}

function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.hidden = true), 2600);
}

function stateClass(s) {
  return s.startsWith("Closed") ? "closed" : s === "New" ? "new" : "open";
}

function ticketRow(t) {
  return `<a class="ih-ticket-row" href="#/ticket/${esc(t.number)}">
    <span class="ih-ticket-ic">✎</span>
    <span class="ih-ticket-main"><strong>${esc(t.number)}</strong> — ${esc(t.short_description)}<small>${esc(t.item_title)} · ${ago(t.opened_at)}</small></span>
    <span class="ih-state ${stateClass(t.state)}">${esc(t.state)}</span></a>`;
}

function tile(item) {
  return `<a class="ih-tile" href="#/item/${item.id}"><span class="ih-tile-ic">🖥︎</span>${esc(item.title)}</a>`;
}

/* ---------- views ---------- */

async function viewHome() {
  const [me, tickets] = await Promise.all([api("/api/me"), api("/api/tickets")]);
  S.me = me;
  const featured = S.catalog.featured.map((id) => S.catalog.items.find((i) => i.id === id));
  view.innerHTML = `<div class="ih-home">
    <div class="ih-col">
      <section class="ih-card">
        <h1>Hello, ${esc(me.name.split(" ")[0])}! Welcome to the Waters IT Service Portal.</h1>
        <form class="ih-inline-search" id="home-search"><input type="search" placeholder="Search" aria-label="Search" /><button aria-label="Search">⌕</button></form>
      </section>
      <section class="ih-card">
        <h2>Report something broken/not working</h2>
        <div class="ih-tiles">${featured.map(tile).join("")}</div>
        <div class="ih-right"><a class="ih-btn primary" href="#/report">View more</a></div>
      </section>
      <section class="ih-card">
        <h2>Request something new</h2>
        <div class="ih-tiles">${S.catalog.items.filter((i) => i.group === "request").map(tile).join("")}</div>
      </section>
    </div>
    <div class="ih-col narrow">
      <h2 class="ih-h">My Tickets Summary</h2>
      <div class="ih-summary">
        <a href="#/tickets" class="ih-sum red"><strong>${me.summary.awaiting_response}</strong>Tickets Awaiting Response</a>
        <a href="#/tickets" class="ih-sum"><strong>${me.summary.open}</strong>Open Tickets</a>
        <a href="#/tickets" class="ih-sum hl"><strong>${me.summary.closed_4_weeks}</strong>Tickets Closed in Last 4 Weeks</a>
      </div>
      <section class="ih-card">
        <h2>Most Recently Opened Tickets</h2>
        <div class="ih-ticket-list compact">${tickets.slice(0, 4).map(ticketRow).join("") || '<p class="ih-muted">No tickets yet.</p>'}</div>
      </section>
    </div>
  </div>`;
  view.querySelector("#home-search").addEventListener("submit", (e) => {
    e.preventDefault();
    location.hash = `#/search?q=${encodeURIComponent(e.target.querySelector("input").value)}`;
  });
}

function viewList(group) {
  const items = S.catalog.items.filter((i) => i.group === group);
  const title = group === "report" ? "Report Something Broken / Not Working Properly" : "Request New or Modified Access / Service";
  view.innerHTML = `<a class="ih-back" href="#/">← Back</a><section class="ih-card"><h1>${title}</h1>
    <div class="ih-catalog">${items
      .map((i) => `<a class="ih-cat" href="#/item/${i.id}"><strong>${esc(i.title)}</strong><span>${esc(i.summary)}</span></a>`)
      .join("")}</div></section>`;
}

function fieldHtml(f, me) {
  const req = f.required ? '<span class="ih-req">*</span> ' : "";
  const help = f.help ? `<p class="ih-help">${esc(f.help)}</p>` : "";
  let input;
  if (f.type === "user") {
    input = `<div class="ih-user-field"><span>ⓘ</span>${esc(me.name)}<span class="ih-x">×</span><span class="ih-caret">▾</span></div>`;
  } else if (f.type === "select") {
    input = `<select name="${f.key}" id="f-${f.key}"><option value="">-- None --</option>${f.options
      .map((o) => `<option>${esc(o)}</option>`)
      .join("")}</select>`;
  } else if (f.type === "textarea") {
    input = `<textarea name="${f.key}" id="f-${f.key}" rows="8" maxlength="${f.max || 4000}"></textarea>`;
  } else {
    input = `<input name="${f.key}" id="f-${f.key}" maxlength="${f.max || 500}" placeholder="${esc(f.placeholder || "")}" />`;
  }
  const wide = ["textarea"].includes(f.type) || f.key === "short_description" ? " wide" : "";
  return `<label class="ih-field${wide}" for="f-${f.key}"><span>${req}${esc(f.label)}</span>${f.type === "textarea" ? help : ""}${input}${
    f.type !== "textarea" ? help : ""
  }</label>`;
}

async function viewItem(id, params) {
  const item = await api(`/api/catalog/${encodeURIComponent(id)}`);
  const me = S.me || (S.me = await api("/api/me"));
  const fav = S.favorites.includes(id);
  const fromIra = params.get("from") === "ira";
  const required = item.fields.filter((f) => f.required && f.type !== "user");
  view.innerHTML = `<a class="ih-back" href="#/">← Back</a>
  <div class="ih-form-wrap">
    <form class="ih-card ih-form" id="item-form" novalidate>
      <header class="ih-form-head"><h1>${esc(item.title)}</h1>
        <button type="button" class="ih-fav${fav ? " on" : ""}" id="fav" aria-label="Favourite">${fav ? "♥" : "♡"}</button></header>
      <p class="ih-muted">${esc(item.summary)}</p>
      ${
        fromIra
          ? `<div class="ih-ira-tip"><span class="ih-ira-dot"></span><div><strong>IRA drafted this ticket for you in SmartStart.</strong>
            Copy each field from the IRA card and paste it below — then review and press Submit.</div></div>`
          : ""
      }
      <div class="ih-intro">${item.intro.map((p) => `<p>${esc(p)}</p>`).join("")}</div>
      <p class="ih-req-note"><span class="ih-req">*</span> Indicates required</p>
      <div class="ih-fields">${item.fields.map((f) => fieldHtml(f, me)).join("")}</div>
      <p class="ih-error" id="form-error" role="alert"></p>
    </form>
    <aside class="ih-card ih-submit-box">
      <button type="submit" form="item-form" class="ih-btn primary block">Submit</button>
      <h3>Required information</h3>
      <div class="ih-chips">${required.map((f) => `<span class="ih-chip" data-need="${f.key}">${esc(f.label)}</span>`).join("")}</div>
    </aside>
  </div>`;
  const form = view.querySelector("#item-form");
  const sync = () =>
    view.querySelectorAll("[data-need]").forEach((c) => {
      const el = form.elements[c.dataset.need];
      c.classList.toggle("done", !!(el && el.value.trim()));
    });
  form.addEventListener("input", sync);
  form.addEventListener("change", sync);
  view.querySelector("#fav").addEventListener("click", (e) => {
    S.favorites = S.favorites.includes(id) ? S.favorites.filter((x) => x !== id) : [...S.favorites, id];
    localStorage.setItem("ithelp.favorites", JSON.stringify(S.favorites));
    const on = S.favorites.includes(id);
    e.currentTarget.classList.toggle("on", on);
    e.currentTarget.textContent = on ? "♥" : "♡";
    toast(on ? "Added to My Favorites" : "Removed from My Favorites");
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const values = Object.fromEntries(new FormData(form).entries());
    const err = view.querySelector("#form-error");
    err.textContent = "";
    try {
      const t = await api("/api/tickets", { method: "POST", body: JSON.stringify({ item_id: id, values }) });
      viewSubmitted(t);
    } catch (ex) {
      err.textContent = ex.message;
      const first = required.find((f) => !String(values[f.key] || "").trim());
      if (first) form.elements[first.key]?.focus();
    }
  });
}

function viewSubmitted(t) {
  S.me = null;
  view.innerHTML = `<section class="ih-card ih-done">
    <span class="ih-done-ic">✓</span>
    <h1>Your ${t.kind === "incident" ? "incident" : "request"} has been submitted</h1>
    <p class="ih-big">${esc(t.number)}</p>
    <p>${esc(t.short_description)}</p>
    <p class="ih-muted">The IT Service Desk will pick this up and you'll be notified of progress. Keep the ticket number for reference.</p>
    <div class="ih-row"><a class="ih-btn primary" href="#/ticket/${esc(t.number)}">View ticket</a><a class="ih-btn" href="#/">Back to homepage</a></div>
  </section>`;
  window.scrollTo(0, 0);
}

async function viewTickets() {
  const tickets = await api("/api/tickets");
  view.innerHTML = `<section class="ih-card"><h1>My tickets</h1>
    <div class="ih-ticket-list">${tickets.map(ticketRow).join("") || '<p class="ih-muted">No tickets yet.</p>'}</div></section>`;
}

async function viewTicket(number) {
  const t = await api(`/api/tickets/${encodeURIComponent(number)}`);
  const item = await api(`/api/catalog/${t.item_id}`);
  const rows = item.fields
    .filter((f) => t.values[f.key])
    .map((f) => `<div class="ih-kv"><dt>${esc(f.label)}</dt><dd>${esc(t.values[f.key])}</dd></div>`)
    .join("");
  view.innerHTML = `<a class="ih-back" href="#/tickets">← My tickets</a>
  <section class="ih-card">
    <header class="ih-form-head"><h1>${esc(t.number)}</h1><span class="ih-state ${stateClass(t.state)}">${esc(t.state)}</span></header>
    <p class="ih-muted">${esc(t.item_title)} · opened ${ago(t.opened_at)}</p>
    <h2>${esc(t.short_description)}</h2>
    <dl class="ih-kvs">${rows}</dl>
    <h3>Activity</h3>
    <ol class="ih-activity">${t.activity.map((a) => `<li><strong>${esc(a.by)}</strong><span class="ih-muted"> · ${ago(a.at)}</span><p>${esc(a.text)}</p></li>`).join("")}</ol>
  </section>`;
}

function viewFavorites() {
  const items = S.catalog.items.filter((i) => S.favorites.includes(i.id));
  view.innerHTML = `<section class="ih-card"><h1>My Favorites</h1>${
    items.length
      ? `<div class="ih-catalog">${items.map((i) => `<a class="ih-cat" href="#/item/${i.id}"><strong>${esc(i.title)}</strong><span>${esc(i.summary)}</span></a>`).join("")}</div>`
      : '<p class="ih-muted">Tap the ♡ on any form to keep it here.</p>'
  }</section>`;
}

async function viewPhones() {
  const phones = await api("/api/phones");
  view.innerHTML = `<section class="ih-card"><h1>IT Service Desk Phone Numbers</h1>
    <p class="ih-muted">Mock numbers for the demo — not real contact details.</p>
    <dl class="ih-kvs">${phones.map((p) => `<div class="ih-kv"><dt>${esc(p.region)}</dt><dd>${esc(p.number)} <span class="ih-muted">· ${esc(p.hours)}</span></dd></div>`).join("")}</dl></section>`;
}

async function viewSearch(q) {
  const hits = await api(`/api/search?q=${encodeURIComponent(q)}`);
  view.innerHTML = `<section class="ih-card"><h1>Search results for “${esc(q)}”</h1>${
    hits.length
      ? `<div class="ih-catalog">${hits.map((i) => `<a class="ih-cat" href="#/item/${i.id}"><strong>${esc(i.title)}</strong><span>${esc(i.summary)}</span></a>`).join("")}</div>`
      : '<p class="ih-muted">No matching forms. Try “laptop”, “VPN” or “access”.</p>'
  }</section>`;
}

/* ---------- router ---------- */

async function route() {
  const [path, query = ""] = location.hash.replace(/^#/, "").split("?");
  const params = new URLSearchParams(query);
  const parts = path.split("/").filter(Boolean);
  const name = parts[0] || "home";
  document.querySelectorAll(".ih-side-link").forEach((a) => a.classList.toggle("active", a.dataset.route === name));
  document.getElementById("request-menu").hidden = true;
  try {
    if (name === "home") await viewHome();
    else if (name === "report" || name === "request") viewList(name);
    else if (name === "item") await viewItem(parts[1], params);
    else if (name === "tickets") await viewTickets();
    else if (name === "ticket") await viewTicket(parts[1]);
    else if (name === "favorites") viewFavorites();
    else if (name === "approvals") view.innerHTML = '<section class="ih-card"><h1>My approvals</h1><p class="ih-muted">Nothing is waiting for your approval.</p></section>';
    else if (name === "phones") await viewPhones();
    else if (name === "search") await viewSearch(params.get("q") || "");
    else location.hash = "#/";
  } catch (err) {
    view.innerHTML = `<section class="ih-card"><h1>Something went wrong</h1><p class="ih-muted">${esc(err.message)}</p><a class="ih-btn" href="#/">Homepage</a></section>`;
  }
}

async function boot() {
  if (!token) return;
  S.catalog = await api("/api/catalog");
  S.me = await api("/api/me");
  const ini = initials(S.me.name);
  document.getElementById("user-name").textContent = S.me.name;
  document.getElementById("user-initials").textContent = ini;
  document.getElementById("side-initials").textContent = ini;
  document.getElementById("side-name").textContent = S.me.name;
  document.getElementById("side-title").textContent = S.me.title;
  const menu = document.getElementById("request-menu");
  menu.innerHTML = S.catalog.items
    .filter((i) => i.group === "request")
    .map((i) => `<a href="#/item/${i.id}">${esc(i.title)}</a>`)
    .join("");
  const btn = document.getElementById("request-menu-btn");
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
    btn.setAttribute("aria-expanded", String(!menu.hidden));
  });
  document.addEventListener("click", () => (menu.hidden = true));
  document.getElementById("top-search").addEventListener("submit", (e) => {
    e.preventDefault();
    location.hash = `#/search?q=${encodeURIComponent(document.getElementById("top-search-input").value)}`;
  });
  document.getElementById("sign-out").addEventListener("click", () => {
    localStorage.removeItem("ithelp.token");
    location.href = "/login";
  });
  document.getElementById("user-chip").addEventListener("click", () => (location.hash = "#/tickets"));
  window.addEventListener("hashchange", route);
  route();
}

boot();
