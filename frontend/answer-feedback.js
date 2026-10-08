/* Thumbs up / down on NIA and IRA answers. A thumbs-down lands with the cited
   sources' owners as a review task; on a refusal it tells them the question should be covered.
   Chat logs re-render, so state lives here, keyed by answer id. */
(() => {
  const S = (window.__ssAnswerFb = window.__ssAnswerFb || {});
  const DOWN = [
    ["not_helpful", "Didn't help"],
    ["out_of_date", "Out of date"],
    ["wrong", "Wrong"],
  ];
  const e = (v) =>
    String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const UP =
    '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path fill="currentColor" d="M2 21h4V9H2v12zm20-11a2 2 0 0 0-2-2h-6.3l1-4.6v-.3c0-.4-.2-.8-.4-1.1L13.2 1 6.6 7.6C6.2 8 6 8.5 6 9v10a2 2 0 0 0 2 2h9c.8 0 1.5-.5 1.8-1.2l3-7.1c.1-.2.2-.5.2-.7v-2z"/></svg>';
  const DOWN_ICON =
    '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path fill="currentColor" d="M22 3h-4v12h4V3zM2 14a2 2 0 0 0 2 2h6.3l-1 4.6v.3c0 .4.2.8.4 1.1l1.1 1 6.6-6.6c.4-.4.6-.9.6-1.4V5a2 2 0 0 0-2-2H7c-.8 0-1.5.5-1.8 1.2l-3 7.1c-.1.2-.2.5-.2.7v2z"/></svg>';

  function html(id) {
    const s = S[id];
    if (s.busy) return `<span class="fb-note">Sending…</span>`;
    if (s.done)
      return `<span class="fb-done">${e(s.message)}</span>
        <button type="button" class="fb-link" data-fb-act="change">Change</button>`;
    if (!s.grounded)
      return `<span class="fb-q">Should this be answerable?</span>
        <button type="button" class="fb-btn" data-fb-act="missing">Yes — ask the owners to add it</button>`;
    if (s.open)
      return `<div class="fb-form">
          <span class="fb-q">What was wrong?</span>
          <div class="fb-reasons" role="radiogroup">${DOWN.map(
            ([k, label]) =>
              `<button type="button" role="radio" aria-checked="${s.reason === k}" class="fb-chip ${s.reason === k ? "on" : ""}" data-fb-act="reason" data-fb-reason="${k}">${label}</button>`
          ).join("")}</div>
          <input class="fb-comment" maxlength="300" placeholder="Optional: what should it say? (sent to the source owner)" value="${e(s.comment || "")}" aria-label="Comment for the source owner" />
          <div class="fb-form-acts">
            <button type="button" class="fb-btn primary" data-fb-act="send">Send to owner</button>
            <button type="button" class="fb-link" data-fb-act="cancel">Cancel</button>
          </div>
        </div>`;
    return `<span class="fb-q">Was this helpful?</span>
      <button type="button" class="fb-thumb" data-fb-act="up" aria-label="Helpful" title="Helpful">${UP}</button>
      <button type="button" class="fb-thumb" data-fb-act="down" aria-label="Not helpful" title="Not helpful">${DOWN_ICON}</button>`;
  }

  window.ssFeedbackHtml = (g) => {
    if (!g || !g.answer_id) return "";
    S[g.answer_id] = S[g.answer_id] || { grounded: !!g.grounded, reason: "not_helpful" };
    return `<div class="fb" data-fb="${e(g.answer_id)}">${html(g.answer_id)}</div>`;
  };

  function repaint(box) {
    box.innerHTML = html(box.dataset.fb);
    box.querySelector(".fb-comment")?.focus();
  }

  async function send(box, body) {
    const id = box.dataset.fb;
    const s = S[id];
    s.busy = true;
    repaint(box);
    try {
      const res = await fetch(`/api/answers/${encodeURIComponent(id)}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.detail || `Couldn't send feedback (${res.status})`);
      Object.assign(s, { done: true, open: false, message: out.message });
    } catch (err) {
      Object.assign(s, { done: true, open: false, message: err.message });
    } finally {
      s.busy = false;
      repaint(box);
    }
  }

  document.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-fb-act]");
    const box = btn?.closest("[data-fb]");
    if (!box) return;
    const s = S[box.dataset.fb];
    const act = btn.dataset.fbAct;
    if (act === "up") return send(box, { vote: "up" });
    if (act === "missing") return send(box, { vote: "down", reason: "missing" });
    if (act === "down") s.open = true;
    else if (act === "reason") {
      s.comment = box.querySelector(".fb-comment")?.value || s.comment;
      s.reason = btn.dataset.fbReason;
    } else if (act === "cancel") s.open = false;
    else if (act === "change") s.done = false;
    else if (act === "send") {
      s.comment = box.querySelector(".fb-comment")?.value || "";
      return send(box, { vote: "down", reason: s.reason, comment: s.comment });
    }
    repaint(box);
  });

  document.addEventListener("keydown", (ev) => {
    if (ev.key !== "Enter" || !ev.target.matches?.(".fb-comment")) return;
    ev.preventDefault();
    ev.target.closest("[data-fb]")?.querySelector('[data-fb-act="send"]')?.click();
  });
})();
