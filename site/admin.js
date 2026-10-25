// site/admin.js -- the teacher's page (admin.html): create, open and close compete seasons, share their link and QR
// code, watch who joined, export the rows. Pure helpers are exported for test_site.mjs; the page wiring runs only in a
// browser. The Apps Script /exec URL comes from ?board= or localStorage ritz.admin.board, never from this repo; the
// passphrase stays in sessionStorage for the tab (shared.js deskPassphrase) and goes to the backend as `key` (apps_script.gs
// compares it with ADMIN_KEY).
import { BOARD_KEY, csvText as csv, downloadText, deskBoard, deskLinks, deskPassphrase, askDialog, officialTime, chapterSummary, fmtTime, escapeHtml as esc, resultsLink } from "./shared.js";
import { qrSvg } from "./qr.js";
import { ICON_ATTRS } from "./ui.js";

export const POLL_MS = 10000;
export const CSV_COLUMNS = ["timestamp", "event", "team", "season", "chapter", "wrong", "queries", "clientAt", "elapsedMs"];

// The Sheet's columns as CSV (shared.js csvText: RFC 4180, CRLF).
export const csvText = rows => csv([CSV_COLUMNS, ...rows.map(r => CSV_COLUMNS.map(c => r[c]))]);
export const csvFilename = name => (String(name).replace(/[\\/:*?"<>|\x00-\x1f]+/g, "-").trim() || "season") + ".csv";

// The link students open: the game next to this page. The board URL stays readable (it is shown in big type and
// fits a smaller QR code); anything that could end the parameter early is encoded.
export const studentLink = (gameUrl, id, board) =>
  gameUrl + "?season=" + encodeURIComponent(id) + "&board=" + encodeURIComponent(board).replace(/%2F/gi, "/").replace(/%3A/gi, ":");
export const boardLink = (id, board) => resultsLink(board, id);

// Joined and finished players per season id, from every row (doGet with no parameter).
export function seasonCounts(rows) {
  const by = {};
  for (const r of rows) (by[r.season] ||= []).push(r);
  const out = {};
  for (const [id, rs] of Object.entries(by)) {
    const ranking = officialTime(rs, {});
    out[id] = { joined: ranking.length, finished: ranking.filter(p => p.finished).length };
  }
  return out;
}

export const deleteMessage = (name, players) => 'Delete "' + name + '"? Its ' + players + " player" + (players === 1 ? "" : "s") +
  " and all their rows are erased for good. This cannot be undone: export the CSV first if you want to keep them.";

export const newestFirst = seasons => [...seasons].sort((a, b) => Number(b.createdAt) - Number(a.createdAt));

// Buttons in the game's icon style (app.js erdButtonHtml): a 16 px glyph stroked in currentColor over a one-word
// caption (owner, 2026-10-25), the action's full name in title (the tooltip) and aria-label.
// One row per action: when (which seasons show it) and run (the click; true when the seasons table should reload).
// run reads the page wiring below, at click time.
const always = () => true;
const ACTIONS = [
  { id: "open", label: "Open", word: "Open", glyph: '<path d="M4.5 2.5L13 8L4.5 13.5Z"/>', when: s => s.state === "created", run: async s => {
    const other = seasons.find(x => x.state === "open" && x.id !== s.id);
    if (other && !await ask('"' + other.name + '" is already open. Open "' + s.name + '" as well?', "Open it too")) return false;
    if ((await post({ admin: "open", season: s.id })).ok) say('"' + s.name + '" is open: every clock is running.');
    return true;
  } },
  { id: "close", label: "Close", word: "Close", glyph: '<rect x="3.5" y="3.5" width="9" height="9" rx="1"/>', when: s => s.state !== "closed", run: async s => {
    if (!await ask('Close "' + s.name + '"? The backend will refuse every later post; this cannot be undone.', "Close the season")) return false;
    if ((await post({ admin: "close", season: s.id })).ok) say('"' + s.name + '" is closed.');
    return true;
  } },
  { id: "copy", label: "Copy link", word: "Link", glyph: '<path d="M6.5 9.5L9.5 6.5M8.5 4.5L9.5 3.5A2.5 2.5 0 0 1 13 7L12 8M7.5 11.5L6.5 12.5A2.5 2.5 0 0 1 3 9L4 8"/>', when: always, run: async s => {
    const link = studentLink(gameUrl(), s.id, board);
    try { await navigator.clipboard.writeText(link); say("Link copied: " + link); } catch { say("Copy this link: " + link); }
  } },
  { id: "qr", label: "QR", word: "QR", glyph: '<rect x="2.5" y="2.5" width="4" height="4"/><rect x="9.5" y="2.5" width="4" height="4"/><rect x="2.5" y="9.5" width="4" height="4"/><rect x="9.5" y="9.5" width="4" height="4"/>', when: always, run: async s => {
    const link = studentLink(gameUrl(), s.id, board), d = $("qr");
    d.querySelector(".qr-name").textContent = s.name;
    d.querySelector(".qr-code").innerHTML = qrSvg(link, { size: 560 });
    d.querySelector(".qr-link").textContent = link;
    d.showModal();
  } },
  { id: "board", label: "Board", word: "Board", glyph: '<path d="M2.5 13.5V9H6V13.5M6 13.5V4.5H10V13.5M10 13.5V10.5H13.5V13.5M1.5 13.5H14.5"/>', when: always, run: async s => {
    window.open(boardLink(s.id, board), "_blank", "noopener");
  } },
  { id: "csv", label: "Export CSV", word: "CSV", glyph: '<path d="M8 2.5V9.5M5 6.5L8 9.5L11 6.5M2.5 10V13.5H13.5V10"/>', when: always, run: async s => {
    try {
      const rows = await getJson({ season: s.id }), list = Array.isArray(rows) ? rows : [];
      downloadText(csvFilename(s.name), csvText(list));
      say("Exported " + list.length + " rows of \"" + s.name + "\".");
    } catch (e) { say("Could not export: " + e.message, true); }
  } },
  { id: "rename", label: "Rename the season", word: "Rename", glyph: '<path d="M10.5 2.5L13.5 5.5L5.5 13.5H2.5V10.5Z"/>', when: always, run: async s => {
    // #rename: Enter = Rename (its first button), Escape or Cancel = nothing; the name goes in .value, never as markup
    const d = $("rename"), input = d.querySelector("input");
    input.value = s.name;
    const answer = await askDialog(d, null, () => { const v = prompt("New name for the season:", s.name); input.value = v || ""; return v == null ? "" : "ok"; });
    const name = answer === "ok" ? input.value.trim() : "";
    if (!name || name === s.name) return false;
    if ((await post({ admin: "rename", season: s.id, name })).ok) say('"' + s.name + '" is now "' + name + '".');
    return true;
  } },
  { id: "delete", label: "Delete the season", word: "Delete", glyph: '<path d="M2.5 4.5H13.5M6 4.5V2.5H10V4.5M4 4.5L4.75 13.5H11.25L12 4.5M6.75 7V11M9.25 7V11"/>', when: s => s.state !== "open", run: async s => {
    if (!await ask(deleteMessage(s.name, (counts[s.id] || { joined: 0 }).joined), "Delete the season")) return false;
    const out = await post({ admin: "delete", season: s.id });
    if (!out.ok) return false;
    say('"' + s.name + '" is deleted (' + out.removedRows + " rows).");
    if (selected === s.id) { clearTimeout(pollTimer); detailGen++; selected = ""; $("detail").innerHTML = ""; }
    return true;
  } }];
export function seasonsTableHtml(seasons, counts, selected) {
  if (!seasons.length) return '<p class="muted">No season yet: create one above.</p>';
  return '<table class="seasons"><thead><tr><th>Name</th><th>Date</th><th>State</th><th>Database</th><th>Joined</th><th>Finished</th><th></th></tr></thead><tbody>' +
    seasons.map(s => {
      const c = counts[s.id] || { joined: 0, finished: 0 }, id = esc(s.id);
      const btns = ACTIONS.filter(a => a.when(s))
        .map(({ id: a, label, word, glyph }) => '<button class="quiet icon-btn" data-act="' + a + '" data-id="' + id + '" title="' + label +
          '" aria-label="' + label + '"><svg class="icon" ' + ICON_ATTRS + ">" + glyph + '</svg><span class="act-word" aria-hidden="true">' + word + "</span></button>").join(" ");
      return '<tr data-id="' + id + '" class="' + (s.id === selected ? "selected" : "") + '" tabindex="0"><td>' + esc(s.name) +
        "</td><td>" + esc(s.date) + '</td><td class="state-' + esc(s.state) + '">' + esc(s.state) + "</td><td>" + esc(s.db) +
        "</td><td>" + c.joined + "</td><td>" + c.finished + '</td><td class="acts">' + btns + "</td></tr>";
    }).join("") + "</tbody></table>";
}

const num = (x, d = 1) => (x === null ? "-" : String(Math.round(x * 10 ** d) / 10 ** d));
export function detailHtml(meta, rows) {
  const ranking = officialTime(rows, meta);
  const players = ranking.length ? '<table class="detail"><thead><tr><th>Pseudo</th><th>Chapter</th><th>Solved</th><th>Time</th></tr></thead><tbody>' +
    ranking.map(p => "<tr><td>" + esc(p.team) + "</td><td>" + (p.finished ? "done" : p.chapter) + "</td><td>" + p.solved + "</td><td>" +
      (p.finished ? fmtTime(p.ms) + (p.flagged ? ' <abbr title="Server and browser clocks differ by more than a minute">?</abbr>' : "") : "-") +
      "</td></tr>").join("") + "</tbody></table>" : '<p class="muted">Nobody has joined yet.</p>';
  const summary = '<table class="detail"><thead><tr><th>Chapter</th><th>Solved by</th><th>Median minutes</th><th>Median queries</th><th>Median wrong</th></tr></thead><tbody>' +
    chapterSummary(rows, meta).map(c => "<tr><td>" + c.chapter + "</td><td>" + c.solvers + "</td><td>" + num(c.minutes) + "</td><td>" +
      num(c.queries) + "</td><td>" + num(c.wrong) + "</td></tr>").join("") + "</tbody></table>";
  return "<h2>" + esc(meta.name) + ' <span class="muted">' + esc(meta.date) + " &middot; " + esc(meta.state) + " &middot; penalty " +
    esc(meta.penalty) + " s</span></h2>" + '<div class="label">PLAYERS (' + ranking.length + ")</div>" + players +
    '<div class="label">PER CHAPTER</div>' + summary;
}

// --- page wiring (browser only) ----------------------------------------------------------------
const $ = id => document.getElementById(id);
let board = "", key = "", seasons = [], counts = {}, selected = "", pollTimer = 0, detailGen = 0;

const say = (msg, bad = false) => { const s = $("status"); s.textContent = msg; s.classList.toggle("bad", bad); };

async function getJson(params) {
  const u = new URL(board);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return (await fetch(u, { signal: AbortSignal.timeout(20000) })).json();
}
// Admin posts: text/plain like the game's, so the browser sends no CORS preflight the Apps Script cannot answer.
async function post(body) {
  try {
    const r = await fetch(board, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ ...body, key }), signal: AbortSignal.timeout(40000) });
    const out = await r.json();
    if (!out.ok) say("Refused: " + (out.error || "no reason given"), true);
    return out;
  } catch (e) { say("Could not reach the backend: " + e.message, true); return { ok: false }; }
}

async function loadSeasons() {
  if (!board) { $("seasons").innerHTML = '<p class="muted">Paste the board URL above first.</p>'; return; }
  try {
    const [list, rows] = await Promise.all([getJson({ seasons: 1, key }), getJson({ key })]);
    if (!Array.isArray(list)) throw new Error(list && list.error || "not a season list");
    seasons = newestFirst(list);
    counts = seasonCounts(Array.isArray(rows) ? rows : []);
    $("seasons").innerHTML = seasonsTableHtml(seasons, counts, selected);
  } catch (e) { say("Could not read the seasons: " + e.message, true); }
}

// One poll chain: each call supersedes the earlier ones (detailGen), and the next poll is scheduled only once
// this one has answered, so a click during a poll never leaves two chains running.
async function showDetail(id) {
  clearTimeout(pollTimer);
  const gen = ++detailGen;
  selected = id;
  document.querySelectorAll("table.seasons tr[data-id]").forEach(tr => tr.classList.toggle("selected", tr.dataset.id === id));
  try {
    const [meta, rows] = await Promise.all([getJson({ meta: id }), getJson({ season: id })]);
    if (gen !== detailGen) return;   // another row was clicked, or the same one refreshed, meanwhile
    if (!meta || meta.id !== id) { $("detail").innerHTML = '<p class="muted">This season does not exist.</p>'; return; }
    $("detail").innerHTML = detailHtml(meta, Array.isArray(rows) ? rows : []);
    // The seasons table's Joined and Finished cells follow the poll, from the same rows.
    const c = seasonCounts(Array.isArray(rows) ? rows.map(r => ({ ...r, season: id })) : [])[id] || { joined: 0, finished: 0 };
    const tr = document.querySelector('table.seasons tr[data-id="' + CSS.escape(id) + '"]');
    counts[id] = c;
    if (tr) { tr.cells[4].textContent = c.joined; tr.cells[5].textContent = c.finished; }
    if (meta.state !== "closed") pollTimer = setTimeout(() => showDetail(id), POLL_MS);
  } catch (e) {
    if (gen !== detailGen) return;
    say("Could not read the season: " + e.message, true); pollTimer = setTimeout(() => showDetail(id), POLL_MS);
  }
}


const gameUrl = () => new URL("./", location.href).href;

// #ask: the desk's own question box (Cancel focused, Escape cancels; textContent, so season names stay text)
async function ask(text, yes) {
  const d = $("ask");
  d.querySelector('button[value="ok"]').textContent = yes;
  return (await askDialog(d, text, () => confirm(text) ? "ok" : "")) === "ok";
}

async function act(a, id) {
  const s = seasons.find(x => x.id === id), A = ACTIONS.find(x => x.id === a);
  if (!s || !A || !(await A.run(s))) return;
  await loadSeasons();
  if (selected === id) showDetail(id);
}

async function create(e) {
  e.preventDefault();
  const name = $("c-name").value.trim();
  const out = await post({ admin: "create", name, date: $("c-date").value, penalty: Number($("c-penalty").value) });
  if (!out.ok) return;
  const s = out.season, reused = seasons.filter(x => x.db === s.db).map(x => '"' + x.name + '"');
  say('Created "' + s.name + '" on database ' + s.db + (reused.length ? ", already played by " + reused.join(", ") +
    ": a student from that class may know its answers." : "."));
  $("c-name").value = "";
  await loadSeasons();
  showDetail(s.id);
}

function setBoard(value) {
  board = "";
  const v = value.trim();
  try { if (v) { new URL(v); board = v; } } catch { say("That board URL is not a URL.", true); }
  let stored = true;
  try { if (board) localStorage.setItem(BOARD_KEY, board); } catch { stored = false; }
  deskLinks(board, stored);
}

async function main() {
  setBoard(deskBoard().board);
  $("board-url").value = board;
  $("c-date").value = new Date().toLocaleDateString("sv");   // YYYY-MM-DD in the teacher's time zone
  $("qr").querySelector("button").onclick = () => $("qr").close();
  $("btn-unlock").onclick = start;
  async function start() {
    if (!(key = await deskPassphrase($("passgate")))) { $("locked").hidden = false; return; }
    $("locked").hidden = true; $("desk").hidden = false;
    $("board-form").onsubmit = e => { e.preventDefault(); setBoard($("board-url").value); if (board) say("Board URL saved."); selected = ""; $("detail").innerHTML = ""; loadSeasons(); };
    $("create").onsubmit = create;
    $("btn-refresh").onclick = loadSeasons;
    $("seasons").onclick = e => {
      const b = e.target.closest("button[data-act]");
      if (b) return act(b.dataset.act, b.dataset.id);
      const tr = e.target.closest("tr[data-id]");
      if (tr) showDetail(tr.dataset.id);
    };
    $("seasons").onkeydown = e => { const tr = e.target.closest("tr[data-id]"); if (tr && e.target === tr && e.key === "Enter") showDetail(tr.dataset.id); };
    loadSeasons();
  }
  start();
}

if (typeof document !== "undefined") main();
