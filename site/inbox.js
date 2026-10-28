// site/inbox.js -- the desk's Feedback page (inbox.html): the Send feedback rows, newest first, with Claude's reply
// draft for each one that left an email (feedback_script.gs: doGet ?list=1&key=, doPost actions draft, redraft, save,
// send, done). It talks to the feedback script (FEEDBACK_URL), not the compete board; the passphrase as on every desk
// page. Pure parts are exported for test_desk.mjs; the page wiring runs only in a browser.
import { FEEDBACK_URL, wireFeedback } from "./feedback.js";
import { askDialog, deskBoard, deskLinks, deskPassphrase, escapeHtml as esc } from "./shared.js";

export const FILTERS = [["todo", "To do"], ["replied", "Replied"], ["all", "All"]];
const closed = r => /^(replied|done)/i.test(String(r.status || "").trim());
// To do: no status yet; Replied: "replied <date>"; All: every row (done and the owner's own words included).
export function matches(r, f) {
  const s = String(r.status || "").trim();
  return f === "all" ? true : f === "replied" ? /^replied/i.test(s) : !s;
}
export const fmtReceived = ms => (ms ? new Date(Number(ms)).toISOString().slice(0, 16).replace("T", " ") + " UTC" : "(no date)");

// The context fields shown on the card's muted line, in this order; anything else the row holds is left out.
const META = ["device", "os", "browser", "screen", "window", "pixelRatio", "touch", "language", "timezone", "localTime", "theme"];

export function rowHtml(r) {
  const where = [r.page, r.chapter && "chapter " + r.chapter, r.mode, r.part && "part " + r.part].filter(Boolean).map(esc).join(" &middot; ");
  const meta = META.filter(k => String(r[k] || "").trim()).map(k => '<span title="' + esc(k) + '">' + esc(r[k]) + "</span>").join(" &middot; ");
  const status = String(r.status || "").trim();
  let body = "";
  if (r.email && !closed(r)) {
    body = '<label class="fb-label" for="d' + esc(r.row) + '">Reply to ' + esc(r.email) + "</label>" +
      '<textarea id="d' + esc(r.row) + '" class="fb-draft" rows="9" maxlength="10000" placeholder="No draft yet: Claude writes one within 5 minutes, or press Draft now.">' + esc(r.draft) + "</textarea>" +
      '<div class="fb-rewrite"><input class="fb-instr" maxlength="2000" placeholder="Instructions for Claude, e.g. shorter, give the chapter III hint" aria-label="Instructions for Claude">' +
      '<button data-act="redraft" class="quiet">Rewrite</button></div>' +
      '<div class="fb-actions">' + (r.draft ? "" : '<button data-act="draft" class="quiet">Draft now</button>') +
      '<button data-act="save" class="quiet">Save draft</button><button data-act="send">Send</button><button data-act="done" class="quiet">Mark done</button></div>';
  } else if (r.email) {
    body = '<p class="fb-meta muted">To ' + esc(r.email) + "</p>" + (r.draft ? '<details class="fb-sent"><summary>Reply</summary><p class="fb-msg">' + esc(r.draft) + "</p></details>" : "");
  } else if (!closed(r)) {
    body = '<p class="fb-meta muted">No email: nothing to reply to.</p><div class="fb-actions"><button data-act="done" class="quiet">Mark done</button></div>';
  }
  return '<article class="fb-card" data-row="' + esc(r.row) + '" data-received="' + esc(r.received) + '">' +
    '<header class="fb-head"><span class="fb-date">' + esc(fmtReceived(r.received)) + '</span><span class="fb-status' + (status ? "" : " todo") + '">' + esc(status || "To do") + "</span>" +
    (where ? '<span class="fb-where">' + where + "</span>" : "") + "</header>" +
    '<p class="fb-msg">' + esc(r.message) + "</p>" +
    (meta ? '<p class="fb-meta muted">' + meta + "</p>" : "") +
    (String(r.other || "").trim() ? '<p class="fb-meta muted">' + esc(r.other) + "</p>" : "") +
    body + '<p class="fb-say" role="status" aria-live="polite"></p></article>';
}

export function listHtml(rows, f) {
  const shown = rows.filter(r => matches(r, f));
  return shown.length ? shown.map(rowHtml).join("") : '<p class="muted">Nothing here.</p>';
}
export const counts = rows => FILTERS.map(([f, name]) => name + " " + rows.filter(r => matches(r, f)).length).join(", ");

// The body of a desk action (text/plain JSON, as feedback.js posts).
export const actionBody = (action, r, key, extra = {}) => JSON.stringify({ action, row: r.row, received: r.received, key, ...extra });

const WAIT = { draft: "Claude is writing a draft...", redraft: "Claude is rewriting the draft...", save: "Saving the draft...", send: "Sending...", done: "Marking done..." };
const DONE = { draft: "Drafted, and saved in Gmail.", redraft: "Rewritten, and saved in Gmail.", save: "Saved in Gmail.", send: "Sent.", done: "Done." };

const $ = id => document.getElementById(id);
const say = (msg, bad = false) => { const s = $("status"); s.textContent = msg; s.classList.toggle("bad", bad); };

async function main() {
  const { board, stored } = deskBoard();
  deskLinks(board, stored);
  const key = await deskPassphrase($("passgate"));
  if (!key) { say("The desk is locked: reload the page to try again.", true); return; }
  $("inbox").hidden = false;
  let rows = [], filter = "todo";
  const draw = () => {
    for (const b of $("filters").querySelectorAll("button")) b.setAttribute("aria-pressed", String(b.dataset.f === filter));
    $("list").innerHTML = listHtml(rows, filter);
  };
  $("filters").innerHTML = FILTERS.map(([f, name]) => '<button class="quiet" data-f="' + f + '">' + name + "</button>").join("");
  $("filters").onclick = e => { const b = e.target.closest("button[data-f]"); if (b) { filter = b.dataset.f; draw(); } };
  const load = async () => {
    say("Reading the feedback...");
    try {
      const r = await (await fetch(FEEDBACK_URL + "?list=1&key=" + encodeURIComponent(key), { signal: AbortSignal.timeout(40000) })).json();
      if (!r || !r.ok) throw new Error((r && r.error) || "no rows");
      rows = r.rows; draw(); say(counts(rows) + ".");
    } catch (err) { say("The feedback script said: " + err.message, true); }
  };
  $("reload").onclick = load;
  $("list").addEventListener("click", async e => {
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;
    const card = btn.closest(".fb-card"), act = btn.dataset.act, r = rows.find(x => String(x.row) === card.dataset.row);
    if (!r) return;
    const text = card.querySelector(".fb-draft") ? card.querySelector(".fb-draft").value : "";
    const instruction = card.querySelector(".fb-instr") ? card.querySelector(".fb-instr").value : "";
    const msg = "Send this reply to " + r.email + " from contact@alephb.uk?";
    if (act === "send" && (await askDialog($("ask"), msg, () => (confirm(msg) ? "ok" : ""))) !== "ok") return;
    const line = card.querySelector(".fb-say");
    card.querySelectorAll("button, textarea, input").forEach(x => { x.disabled = true; });
    line.textContent = WAIT[act]; line.classList.remove("bad");
    try {
      const res = await (await fetch(FEEDBACK_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: actionBody(act, r, key, { text, instruction }), signal: AbortSignal.timeout(120000) })).json();
      if (!res || !res.ok) throw new Error((res && res.error) || "no answer");
      for (const k of ["draft", "draftId", "status"]) if (res[k] != null) r[k] = res[k];
      card.outerHTML = rowHtml(r);
      const fresh = $("list").querySelector('.fb-card[data-row="' + r.row + '"] .fb-say');
      if (fresh) fresh.textContent = DONE[act];
      say(counts(rows) + ".");
    } catch (err) {
      card.querySelectorAll("button, textarea, input").forEach(x => { x.disabled = false; });
      line.textContent = "Not done: " + err.message; line.classList.add("bad");
    }
  });
  await load();
}

if (typeof document !== "undefined") { wireFeedback(); main(); }
