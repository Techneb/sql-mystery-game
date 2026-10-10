// site/admin.js -- the teacher's page (admin.html): create, open and close compete seasons, share their link and QR
// code, watch who joined, export the rows. Pure helpers are exported for test_site.mjs; the page wiring runs only in a
// browser. The Apps Script /exec URL comes from ?board= or localStorage ritz.admin.board, never from this repo; the
// passphrase stays in memory and goes to the backend as `key` (apps_script.gs compares it with ADMIN_KEY).
import { sha256, ADMIN_PASS_SHA256, officialTime, chapterSummary, fmtTime, escapeHtml as esc } from "./shared.js";
import { qrSvg } from "./qr.js";

export const POLL_MS = 10000;
export const BOARD_KEY = "ritz.admin.board";
export const CSV_COLUMNS = ["timestamp", "event", "team", "season", "chapter", "wrong", "queries", "clientAt", "elapsedMs"];

// RFC 4180: a field with a comma, a quote or a line break goes in quotes, its quotes doubled; lines end CRLF.
export const csvField = v => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
export const csvText = rows => [CSV_COLUMNS, ...rows.map(r => CSV_COLUMNS.map(c => r[c]))]
  .map(cells => cells.map(csvField).join(",")).join("\r\n") + "\r\n";
export const csvFilename = name => (String(name).replace(/[\\/:*?"<>|\x00-\x1f]+/g, "-").trim() || "season") + ".csv";

// The link students open: the game next to this page. The board URL stays readable (it is shown in big type and
// fits a smaller QR code); anything that could end the parameter early is encoded.
export const studentLink = (gameUrl, id, board) =>
  gameUrl + "?season=" + encodeURIComponent(id) + "&board=" + encodeURIComponent(board).replace(/%2F/gi, "/").replace(/%3A/gi, ":");
export const boardLink = (id, board) => "leaderboard.html?data=" + encodeURIComponent(board) + "&season=" + encodeURIComponent(id);

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

export const newestFirst = seasons => [...seasons].sort((a, b) => Number(b.createdAt) - Number(a.createdAt));

const ACTIONS = [["open", "Open"], ["close", "Close"], ["copy", "Copy link"], ["qr", "QR"], ["board", "Board"], ["csv", "Export CSV"]];
export function seasonsTableHtml(seasons, counts, selected) {
  if (!seasons.length) return '<p class="muted">No season yet: create one above.</p>';
  return '<table class="seasons"><thead><tr><th>Name</th><th>Date</th><th>State</th><th>Database</th><th>Joined</th><th>Finished</th><th></th></tr></thead><tbody>' +
    seasons.map(s => {
      const c = counts[s.id] || { joined: 0, finished: 0 }, id = esc(s.id);
      const btns = ACTIONS.filter(([a]) => (a !== "open" || s.state === "created") && (a !== "close" || s.state !== "closed"))
        .map(([a, label]) => '<button class="quiet" data-act="' + a + '" data-id="' + id + '">' + label + "</button>").join(" ");
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
let board = "", key = "", seasons = [], selected = "", pollTimer = 0, detailGen = 0;

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
    const [list, rows] = await Promise.all([getJson({ seasons: 1 }), getJson({})]);
    if (!Array.isArray(list)) throw new Error(list && list.error || "not a season list");
    seasons = newestFirst(list);
    $("seasons").innerHTML = seasonsTableHtml(seasons, seasonCounts(Array.isArray(rows) ? rows : []), selected);
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
    if (tr) { tr.cells[4].textContent = c.joined; tr.cells[5].textContent = c.finished; }
    if (meta.state !== "closed") pollTimer = setTimeout(() => showDetail(id), POLL_MS);
  } catch (e) {
    if (gen !== detailGen) return;
    say("Could not read the season: " + e.message, true); pollTimer = setTimeout(() => showDetail(id), POLL_MS);
  }
}


const gameUrl = () => new URL("./", location.href).href;

async function act(a, id) {
  const s = seasons.find(x => x.id === id);
  if (!s) return;
  if (a === "open") {
    const other = seasons.find(x => x.state === "open" && x.id !== id);
    if (other && !confirm('"' + other.name + '" is already open. Open "' + s.name + '" as well?')) return;
    if ((await post({ admin: "open", season: id })).ok) say('"' + s.name + '" is open: every clock is running.');
  } else if (a === "close") {
    if (!confirm('Close "' + s.name + '"? The backend will refuse every later post; this cannot be undone.')) return;
    if ((await post({ admin: "close", season: id })).ok) say('"' + s.name + '" is closed.');
  } else if (a === "copy") {
    const link = studentLink(gameUrl(), id, board);
    try { await navigator.clipboard.writeText(link); say("Link copied: " + link); } catch { say("Copy this link: " + link); }
    return;
  } else if (a === "qr") {
    const link = studentLink(gameUrl(), id, board), d = $("qr");
    d.querySelector(".qr-name").textContent = s.name;
    d.querySelector(".qr-code").innerHTML = qrSvg(link, { size: 560 });
    d.querySelector(".qr-link").textContent = link;
    d.showModal();
    return;
  } else if (a === "board") {
    window.open(boardLink(id, board), "_blank", "noopener");
    return;
  } else if (a === "csv") {
    try {
      const rows = await getJson({ season: id });
      const url = URL.createObjectURL(new Blob([csvText(Array.isArray(rows) ? rows : [])], { type: "text/csv;charset=utf-8" }));
      const link = Object.assign(document.createElement("a"), { href: url, download: csvFilename(s.name) });
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      say("Exported " + (Array.isArray(rows) ? rows.length : 0) + " rows of \"" + s.name + "\".");
    } catch (e) { say("Could not export: " + e.message, true); }
    return;
  }
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

// The passphrase dialog: asked again until it matches, never stored. Cancel leaves the page locked.
function unlock() {
  const d = $("passgate"), input = $("pass"), msg = d.querySelector(".gate-msg");
  return new Promise(resolve => {
    d.onclose = async () => {
      if (d.returnValue !== "ok") return resolve(false);
      const pass = input.value.trim().toLowerCase();
      if (pass && (await sha256(pass)) === ADMIN_PASS_SHA256) { key = pass; return resolve(true); }
      msg.textContent = "Wrong passphrase. Try again.";
      d.classList.remove("shake"); void d.offsetWidth; d.classList.add("shake");
      input.value = ""; d.returnValue = ""; d.showModal();
    };
    input.value = ""; d.returnValue = ""; d.showModal();
  });
}

function setBoard(value) {
  board = "";
  const v = value.trim();
  try { if (v) { new URL(v); board = v; } } catch { say("That board URL is not a URL.", true); }
  try { if (board) localStorage.setItem(BOARD_KEY, board); } catch {}
}

async function main() {
  const fromLink = new URLSearchParams(location.search).get("board") || "";
  let stored = "";
  try { stored = localStorage.getItem(BOARD_KEY) || ""; } catch {}
  setBoard(fromLink || stored);
  $("board-url").value = board;
  $("c-date").value = new Date().toLocaleDateString("sv");   // YYYY-MM-DD in the teacher's time zone
  $("qr").querySelector("button").onclick = () => $("qr").close();
  $("btn-unlock").onclick = start;
  async function start() {
    if (!(await unlock())) { $("locked").hidden = false; return; }
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
