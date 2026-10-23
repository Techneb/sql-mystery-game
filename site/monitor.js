// site/monitor.js -- the teacher's GA4 numbers (monitor.html): users per day, the chapter funnel, devices, countries and
// channels, read from the Apps Script's ?stats=<days>&key=<passphrase> (apps_script.gs stats_), so nobody opens GA.
// Pure renderers are exported for test_site.mjs; the page wiring runs only in a browser. The board URL comes from
// ?board= or localStorage ritz.admin.board, as on admin.html; the passphrase stays in memory.
import { BOARD_KEY, deskLinks, deskPassphrase, escapeHtml as esc } from "./shared.js";

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

// --- charts: inline SVG drawn at the box's pixel width (text keeps its real size at 390 px), coloured by the page's
// tokens (--rel, --rule, --ink, --paper, and admin.css's --f1..--f5 funnel ramp), so day and night follow for free.
export const compact = n => (n >= 1e6 ? +(n / 1e6).toFixed(1) + "M" : n >= 1e3 ? +(n / 1e3).toFixed(1) + "K" : String(n));
// Clean ticks from 0 to at least max: steps of 1, 2 or 5 times a power of ten, about n of them.
export function ticks(max, n = 4) {
  if (!(max > 0)) return [0, 1];
  const raw = max / n, p = 10 ** Math.floor(Math.log10(raw));
  const step = Math.max(1, [1, 2, 5, 10].map(m => m * p).find(s => s >= raw));
  const out = [];
  for (let v = 0; v < max + step; v += step) out.push(v);
  return out;
}
const isoDate = d => String(d).replace(/^(\d{4})(\d\d)(\d\d)$/, "$1-$2-$3");

// Users per day as a line: one series (no legend, the label names it), 2 px line over a 10% wash, hairline grid, the
// last value labelled at its end dot; each day has a full-height hover strip with its own crosshair, dot and <title>.
export function lineSvg(points, w = 640) {
  const H = 200, L = 40, R = 44, T = 12, B = 24, pw = Math.max(1, w - L - R), ph = H - T - B;
  const tk = ticks(Math.max(...points.map(p => p.value))), top = tk.at(-1);
  const x = i => +(L + (points.length < 2 ? pw / 2 : (i * pw) / (points.length - 1))).toFixed(1);
  const y = v => +(T + ph - (v * ph) / top).toFixed(1);
  const xy = points.map((p, i) => [x(i), y(p.value)]);
  const line = "M" + xy.map(q => q.join(",")).join("L");
  const step = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor(pw / 70))));
  const strip = +(points.length < 2 ? pw : pw / (points.length - 1)).toFixed(1);
  const last = xy.at(-1);
  return '<svg class="chart line-chart" width="' + w + '" height="' + H + '" viewBox="0 0 ' + w + " " + H + '" role="img" aria-label="Users per day">' +
    tk.map(v => '<line class="grid" x1="' + L + '" x2="' + (L + pw) + '" y1="' + y(v) + '" y2="' + y(v) + '"/><text class="tick" x="' + (L - 6) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + compact(v) + "</text>").join("") +
    points.map((p, i) => (i % step && i !== points.length - 1) || (i !== points.length - 1 && points.length - 1 - i < step / 2) ? "" :
      '<text class="tick" x="' + x(i) + '" y="' + (H - 6) + '" text-anchor="middle">' + esc(p.label.slice(5)) + "</text>").join("") +
    '<path class="area" d="' + line + "L" + last[0] + "," + (T + ph) + "L" + xy[0][0] + "," + (T + ph) + 'Z"/><path class="line" d="' + line + '"/>' +
    '<circle class="dot end" cx="' + last[0] + '" cy="' + last[1] + '" r="4"/><text class="val" x="' + (last[0] + 8) + '" y="' + (last[1] + 4) + '">' + compact(points.at(-1).value) + "</text>" +
    points.map((p, i) => '<g class="hit"><rect x="' + (xy[i][0] - strip / 2) + '" y="' + T + '" width="' + strip + '" height="' + ph + '"/><line class="cross" x1="' + xy[i][0] + '" x2="' + xy[i][0] + '" y1="' + T + '" y2="' + (T + ph) +
      '"/><circle class="dot" cx="' + xy[i][0] + '" cy="' + xy[i][1] + '" r="4"/><title>' + esc(p.label) + ": " + esc(p.value) + " users</title></g>").join("") + "</svg>";
}
// GA dates come as YYYYMMDD. The line, then the same numbers as a table under a closed <details>.
export function usersHtml(users, w) {
  const pts = [...users].sort((a, b) => (a.date < b.date ? -1 : 1)).map(u => ({ label: isoDate(u.date), value: Number(u.users) || 0 }));
  if (!pts.length) return '<p class="muted">Nothing in this period.</p>';
  return lineSvg(pts, w) + '<details class="numbers"><summary>The numbers</summary>' + barTable("Day", pts.map(p => [p.label, p.value])) + "</details>";
}

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
export const STAGES = [["opened", "Opened"], ["q1", "Ran 1 query"], ["q5", "Ran 5"], ["q20", "Ran 20"], ["solved", "Solved"]];
// The funnel as grouped horizontal bars, one group per chapter, the five stages in an ordinal ramp of one hue (light =
// first step, dark = solved; validated with the dataviz skill's script, light and night); Opened is labelled at its
// tip, the solve rate at the right; each bar carries its <title>, and the table under the chart keeps every number.
export function funnelSvg(f, w = 640) {
  const L = 34, R = 84, bar = 5, gap = 2, group = STAGES.length * (bar + gap) - gap, pad = 12, T = 4;
  const pw = Math.max(1, w - L - R), max = Math.max(1, ...f.flatMap(c => STAGES.map(([k]) => c[k])));
  const H = T + f.length * (group + pad);
  return '<svg class="chart funnel-chart" width="' + w + '" height="' + H + '" viewBox="0 0 ' + w + " " + H + '" role="img" aria-label="Chapter funnel">' +
    f.map((c, i) => {
      const y0 = T + i * (group + pad);
      return '<text class="tick" x="' + (L - 8) + '" y="' + (y0 + group / 2 + 4) + '" text-anchor="end">' + c.chapter + "</text>" +
        '<line class="axis" x1="' + L + '" x2="' + L + '" y1="' + y0 + '" y2="' + (y0 + group) + '"/>' +
        STAGES.map(([k, name], j) => {
          const bw = +Math.max(c[k] ? 1 : 0, (c[k] * pw) / max).toFixed(1), y = y0 + j * (bar + gap), r = Math.min(2, bw / 2);
          return '<path class="f' + (j + 1) + '" d="M' + L + "," + y + "h" + +(bw - r).toFixed(1) + "q" + r + ",0 " + r + "," + r + "v" + (bar - 2 * r) + "q0," + r + " " + -r + "," + r +
            "h" + -(bw - r).toFixed(1) + 'Z"><title>Chapter ' + c.chapter + ", " + name + ": " + c[k] + "</title></path>";
        }).join("") +
        '<text class="val" x="' + +(L + (c.opened * pw) / max + 4).toFixed(1) + '" y="' + (y0 + bar + 1) + '">' + compact(c.opened) + "</text>" +
        '<text class="val" x="' + (w - 2) + '" y="' + (y0 + group / 2 + 4) + '" text-anchor="end">' + pct(c.solved, c.opened) + "</text>";
    }).join("") + "</svg>";
}
export function funnelHtml(rows, w) {
  const f = funnel(rows);
  const finished = rows.filter(r => r.event === "game_finish").reduce((s, r) => s + (Number(r.users) || 0), 0);
  if (!f.length) return '<p class="muted">No chapter events in this period.</p>';
  return '<p class="legend">' + STAGES.map(([, name], j) => '<span><i class="f' + (j + 1) + '"></i>' + name + "</span>").join("") +
    '<span class="muted">(right: solve rate)</span></p>' + funnelSvg(f, w) +
    '<table class="detail stats"><thead><tr><th>Chapter</th><th>Opened</th><th>Ran 1 query</th><th>Ran 5</th><th>Ran 20</th><th>Solved</th><th>Solve rate</th></tr></thead><tbody>' +
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

export function statsHtml(s, w) {
  return '<div class="label">USERS PER DAY</div>' + usersHtml(s.users || [], w) +
    '<div class="label">CHAPTER FUNNEL</div>' + funnelHtml(s.chapters || [], w) +
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
  deskLinks(board);
  if (!board) { $("nob").hidden = false; return; }
  const key = await deskPassphrase($("passgate"));
  if (!key) { say("The desk is locked: reload the page to try again.", true); return; }
  $("monitor").hidden = false;
  let gen = 0, last = null, wide = 0;
  const draw = () => { wide = $("stats").clientWidth; if (last) $("stats").innerHTML = statsHtml(last, Math.max(280, wide)); };
  addEventListener("resize", () => { if ($("stats").clientWidth !== wide) draw(); });
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
      last = s; draw();
      say("The last " + s.days + " days, from Google Analytics (cached 10 minutes).");
    } catch (e) { if (mine === gen) say("Could not read the numbers: " + e.message, true); }
  }
  $("days").onclick = e => { const b = e.target.closest("button[data-days]"); if (b) load(Number(b.dataset.days)); };
  load(DAYS[0]);
}

if (typeof document !== "undefined") main();
