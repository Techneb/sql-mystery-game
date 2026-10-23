// site/monitor.js -- the teacher's GA4 numbers (monitor.html): users per day, the chapter funnel, devices, countries and
// channels, read from the Apps Script's ?stats=<days>&key=<passphrase> (apps_script.gs stats_), so nobody opens GA.
// Pure renderers are exported for test_site.mjs; the page wiring runs only in a browser. The board URL comes from
// ?board= or localStorage ritz.admin.board, as on admin.html; the passphrase stays in memory.
import { BOARD_KEY, deskPassphrase, escapeHtml as esc } from "./shared.js";

export const DAYS = [7, 30, 90];
export const pct = (a, b) => (b ? Math.round((100 * a) / b) + "%" : "-");

// A table whose last column is a CSS bar scaled to the largest value.
function barTable(head, rows) {
  if (!rows.length) return '<p class="muted">Nothing in this period.</p>';
  const max = Math.max(1, ...rows.map(r => r[1]));
  return '<table class="detail stats"><thead><tr><th>' + esc(head) + "</th><th>Users</th><th></th></tr></thead><tbody>" +
    rows.map(([k, v]) => "<tr><td>" + esc(k) + '</td><td class="num">' + esc(v) + '</td><td class="bar-cell"><span class="bar" style="width:' +
      Math.round((100 * v) / max) + '%"></span></td></tr>').join("") + "</tbody></table>";
}

// GA dates come as YYYYMMDD.
export const usersHtml = users => barTable("Day", [...users].sort((a, b) => (a.date < b.date ? -1 : 1))
  .map(u => [String(u.date).replace(/^(\d{4})(\d\d)(\d\d)$/, "$1-$2-$3"), Number(u.users) || 0]));

// One line per chapter: opened, ran 1 / 5 / 20 queries (chapter_queries by count), solved, solved / opened.
export function funnel(rows) {
  const by = {};
  for (const r of rows) {
    const n = Number(r.chapter);
    if (!Number.isInteger(n) || n < 1) continue;
    const c = (by[n] ||= { chapter: n, opened: 0, q1: 0, q5: 0, q20: 0, solved: 0 });
    const users = Number(r.users) || 0;
    if (r.event === "chapter_open") c.opened += users;
    else if (r.event === "chapter_solve") c.solved += users;
    else if (r.event === "chapter_queries" && ["1", "5", "20"].includes(String(r.count))) c["q" + r.count] += users;
  }
  return Object.values(by).sort((a, b) => a.chapter - b.chapter);
}
export function funnelHtml(rows) {
  const f = funnel(rows);
  const finished = rows.filter(r => r.event === "game_finish").reduce((s, r) => s + (Number(r.users) || 0), 0);
  if (!f.length) return '<p class="muted">No chapter events in this period.</p>';
  return '<table class="detail stats"><thead><tr><th>Chapter</th><th>Opened</th><th>Ran 1 query</th><th>Ran 5</th><th>Ran 20</th><th>Solved</th><th>Solve rate</th></tr></thead><tbody>' +
    f.map(c => "<tr><td>" + c.chapter + '</td><td class="num">' + c.opened + '</td><td class="num">' + c.q1 + '</td><td class="num">' + c.q5 +
      '</td><td class="num">' + c.q20 + '</td><td class="num">' + c.solved + '</td><td class="num">' + pct(c.solved, c.opened) + "</td></tr>").join("") +
    '</tbody></table><p class="muted">Finished a part: ' + finished + " users.</p>";
}

export function devicesHtml(rows) {
  const by = {};
  for (const r of rows) {
    const d = (by[r.device] ||= { opened: 0, solved: 0 });
    if (r.event === "chapter_open") d.opened += Number(r.users) || 0;
    if (r.event === "chapter_solve") d.solved += Number(r.users) || 0;
  }
  const list = Object.entries(by).sort((a, b) => b[1].opened - a[1].opened);
  if (!list.length) return '<p class="muted">Nothing in this period.</p>';
  return '<table class="detail stats"><thead><tr><th>Device</th><th>Opened a chapter</th><th>Solved one</th><th>Solve rate</th></tr></thead><tbody>' +
    list.map(([d, c]) => "<tr><td>" + esc(d) + '</td><td class="num">' + c.opened + '</td><td class="num">' + c.solved + '</td><td class="num">' +
      pct(c.solved, c.opened) + "</td></tr>").join("") + "</tbody></table>";
}

export function statsHtml(s) {
  return '<div class="label">USERS PER DAY</div>' + usersHtml(s.users || []) +
    '<div class="label">CHAPTER FUNNEL</div>' + funnelHtml(s.chapters || []) +
    '<div class="label">DEVICES</div>' + devicesHtml(s.devices || []) +
    '<div class="label">COUNTRIES (TOP 10)</div>' + barTable("Country", (s.countries || []).map(c => [c.country, Number(c.users) || 0])) +
    '<div class="label">CHANNELS</div>' + barTable("Channel", (s.channels || []).map(c => [c.channel, Number(c.users) || 0]));
}

// --- page wiring (browser only) ----------------------------------------------------------------
const $ = id => document.getElementById(id);
const say = (msg, bad = false) => { const s = $("status"); s.textContent = msg; s.classList.toggle("bad", bad); };

async function main() {
  let board = new URLSearchParams(location.search).get("board") || "";
  try { board ||= localStorage.getItem(BOARD_KEY) || ""; } catch {}
  try { new URL(board); } catch { board = ""; }
  if (!board) { $("nob").hidden = false; return; }
  const key = await deskPassphrase($("passgate"));
  if (!key) { say("The desk is locked: reload the page to try again.", true); return; }
  $("monitor").hidden = false;
  let gen = 0;
  async function load(days) {
    const mine = ++gen;
    document.querySelectorAll("#days button").forEach(b => b.setAttribute("aria-pressed", String(Number(b.dataset.days) === days)));
    say("Reading the last " + days + " days...");
    try {
      const u = new URL(board);
      u.searchParams.set("stats", days); u.searchParams.set("key", key);
      const s = await (await fetch(u, { signal: AbortSignal.timeout(40000) })).json();
      if (mine !== gen) return;
      if (!s || !s.ok) throw new Error((s && s.error) || "no numbers");
      $("stats").innerHTML = statsHtml(s);
      say("The last " + s.days + " days, from Google Analytics (cached 10 minutes).");
    } catch (e) { if (mine === gen) say("Could not read the numbers: " + e.message, true); }
  }
  $("days").onclick = e => { const b = e.target.closest("button[data-days]"); if (b) load(Number(b.dataset.days)); };
  load(DAYS[0]);
}

if (typeof document !== "undefined") main();
