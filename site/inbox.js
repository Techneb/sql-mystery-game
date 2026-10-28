// site/inbox.js -- the desk's Feedback page (inbox.html): the Send feedback rows, newest first, with Claude's reply
// draft for each one that left an email (feedback_script.gs: doGet ?list=1&key=, doPost actions draft, redraft, save,
// send, discard). It talks to the feedback script (FEEDBACK_URL), not the compete board; the passphrase as on every desk
// page. Pure parts are exported for test_desk.mjs; the page wiring runs only in a browser.
import { FEEDBACK_URL, wireFeedback } from "./feedback.js";
import { askDialog, deskBoard, deskLinks, deskPassphrase, escapeHtml as esc } from "./shared.js";

export const FILTERS = [["todo", "To do"], ["replied", "Replied"], ["discarded", "Discarded"], ["all", "All"]];
// A status's filter: "" to do, "replied <date>", "discarded <date>" (or the older "done"); anything else the owner
// typed shows under All only.
export function statusKind(status) {
  const s = String(status || "").trim();
  return !s ? "todo" : /^replied/i.test(s) ? "replied" : /^(discarded|done)/i.test(s) ? "discarded" : "other";
}
export const matches = (r, f) => f === "all" || statusKind(r.status) === f;
const closed = r => ["replied", "discarded"].includes(statusKind(r.status));

// The draft's Markdown as the email's HTML: a mirror of feedback_script.gs mdHtml_ (test_backend.mjs checks they agree).
// Everything escaped first, then only paragraphs, **bold**, `code`, ``` fences and "- " lists.
const MD_CODE = "font-family:Menlo,Consolas,monospace;font-size:90%;background:#f1f1ee;color:#1f2328;padding:1px 4px;border-radius:4px";
const MD_PRE = "font-family:Menlo,Consolas,monospace;font-size:13px;line-height:1.45;background:#f1f1ee;color:#1f2328;padding:10px 12px;border-radius:6px;white-space:pre-wrap;overflow-wrap:anywhere;margin:0 0 12px";
const mdInline = s => s.split(/(`[^`\n]+`)/).map((p, i) =>
  i % 2 ? '<code style="' + MD_CODE + '">' + p.slice(1, -1) + "</code>" : p.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")).join("");
export function mdHtml(md) {
  const lines = esc(String(md ?? "").replace(/\r\n?/g, "\n")).split("\n"), out = [];
  let para = [];
  const flush = () => {   // a paragraph: runs of "- " lines become a list, other runs one <p> with <br>s
    for (let i = 0; i < para.length;) {
      const list = /^- /.test(para[i]), run = [];
      while (i < para.length && /^- /.test(para[i]) === list) run.push(para[i++]);
      out.push(list ? '<ul style="margin:0 0 12px;padding-left:22px">' + run.map(l => "<li>" + mdInline(l.slice(2)) + "</li>").join("") + "</ul>"
        : '<p style="margin:0 0 12px">' + run.map(mdInline).join("<br>") + "</p>");
    }
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    if (/^```/.test(lines[i].trim())) {
      flush();
      const code = [];
      while (++i < lines.length && lines[i].trim() !== "```") code.push(lines[i]);
      out.push('<pre style="' + MD_PRE + '">' + code.join("\n") + "</pre>");
    } else if (!lines[i].trim()) flush();
    else para.push(lines[i]);
  }
  flush();
  return out.join("\n");
}
export const fmtReceived = ms => (ms ? new Date(Number(ms)).toISOString().slice(0, 16).replace("T", " ") + " UTC" : "(no date)");

// The context fields shown on the card's muted line, in this order; anything else the row holds is left out.
const META = ["device", "os", "browser", "screen", "window", "pixelRatio", "touch", "language", "timezone", "localTime", "theme"];

const DISCARD = '<button data-act="discard" class="quiet" title="Discard: no reply, filed under Discarded" aria-label="Discard this message">Discard</button>';

export function rowHtml(r) {
  const where = [r.page, r.chapter && "chapter " + r.chapter, r.mode, r.part && "part " + r.part].filter(Boolean).map(esc).join(" &middot; ");
  const meta = META.filter(k => String(r[k] || "").trim()).map(k => '<span title="' + esc(k) + '">' + esc(r[k]) + "</span>").join(" &middot; ");
  const status = String(r.status || "").trim();
  let body = "";
  if (r.email && !closed(r)) {
    body = '<label class="fb-label" for="d' + esc(r.row) + '">Reply to ' + esc(r.email) + "</label>" +
      '<textarea id="d' + esc(r.row) + '" class="fb-draft" rows="9" maxlength="10000" placeholder="No draft yet: Claude writes one within 5 minutes, or press Draft now.">' + esc(r.draft) + "</textarea>" +
      '<div class="fb-label">Preview</div><div class="fb-preview">' + mdHtml(r.draft) + "</div>" +
      '<div class="fb-rewrite"><input class="fb-instr" maxlength="2000" placeholder="Instructions for Claude, e.g. shorter, give the chapter III hint" aria-label="Instructions for Claude">' +
      '<button data-act="redraft" class="quiet">Rewrite</button></div>' +
      '<div class="fb-actions">' + (r.draft ? "" : '<button data-act="draft" class="quiet">Draft now</button>') +
      '<button data-act="save" class="quiet">Save draft</button><button data-act="send">Send</button>' + DISCARD + "</div>";
  } else if (r.email) {
    body = '<p class="fb-meta muted">To ' + esc(r.email) + "</p>" + (r.draft ? '<details class="fb-sent"><summary>Reply</summary><div class="fb-preview">' + mdHtml(r.draft) + "</div></details>" : "");
  } else if (!closed(r)) {
    body = '<p class="fb-meta muted">No email: nothing to reply to.</p><div class="fb-actions">' + DISCARD + "</div>";
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

const WAIT = { draft: "Claude is writing a draft...", redraft: "Claude is rewriting the draft...", save: "Saving the draft...", send: "Sending...", discard: "Discarding..." };
const DONE = { draft: "Drafted, and saved in Gmail.", redraft: "Rewritten, and saved in Gmail.", save: "Saved in Gmail.", send: "Sent.", discard: "Discarded." };

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
  $("list").addEventListener("input", e => {   // the live preview under each draft
    const ta = e.target.closest(".fb-draft"), pv = ta && ta.closest(".fb-card").querySelector(".fb-preview");
    if (pv) pv.innerHTML = mdHtml(ta.value);
  });
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
