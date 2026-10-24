// site/monitor.js -- the teacher's GA4 numbers in three views (<body data-view>), each with a Count select and users
// per day with a Breakdown on its own pages: Global (monitor.html: the five counts compared, the site sections as a
// donut, a map of countries, devices and channels), Game (monitor-game.html: the chapter funnel with its retention,
// the solve rate, leaving, wrong answers and hints on the same I-XII grid, failures, modes, features) and Handbook
// (monitor-handbook.html: its pages as a donut, the exercises, level choice and run outcome, failures, features,
// Try it), read from the Apps Script's ?stats=<days>&key= and ?report= (apps_script.gs stats_, report_), so nobody opens GA. Pure renderers are exported for test_site.mjs; the page wiring runs only in a browser.
// The board URL comes from ?board= or localStorage ritz.admin.board, as on admin.html; the passphrase stays in sessionStorage for the tab (shared.js deskPassphrase).
import { DIMENSIONS, deskBoard, deskLinks, deskPassphrase, escapeHtml as esc, gaText, reportUrl } from "./shared.js";

export const DAYS = [7, 30, 90];
export const pct = (a, b) => (b ? Math.round((100 * a) / b) + "%" : "-");

// A table whose last column is a CSS bar scaled to the largest value.
// foot: [label, value] rows (totals) under the bars, without a bar.
function barTable(head, rows, valHead = "Users", foot = []) {
  const max = Math.max(1, ...rows.map(r => r[1]));
  return '<table class="detail stats"><thead><tr><th>' + esc(head) + "</th><th>" + esc(valHead) + "</th><th></th></tr></thead><tbody>" +
    rows.map(([k, v]) => "<tr><td>" + esc(k) + '</td><td class="num">' + esc(v) + '</td><td class="bar-cell"><span class="bar" style="width:' +
      Math.round((100 * v) / max) + '%"></span></td></tr>').join("") + "</tbody>" +
    (foot.length ? "<tfoot>" + foot.map(([k, v]) => "<tr><td>" + esc(k) + '</td><td class="num">' + esc(v) + "</td><td></td></tr>").join("") + "</tfoot>" : "") + "</table>";
}
// Every chart keeps its numbers under it, closed.
// Raw data under a chart, its Export CSV button inside the toggle, over the table (wireCsv reads the table it holds; owner 2026-10-24).
const raw = (name, table) => '<details class="numbers"><summary>Raw data</summary><button type="button" class="quiet csv" data-csv="' + esc(name) +
  '">Export CSV</button>' + table + "</details>";
const csvCell = v => /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
// cells: rows of cell texts (the header row first), as read from a Raw data table.
export const tableCsv = cells => cells.map(r => r.map(c => csvCell(String(c).trim())).join(",")).join("\r\n") + "\r\n";
function wireCsv(box) {
  box.addEventListener("click", e => {
    const b = e.target.closest && e.target.closest("button.csv");
    if (!b || !box.contains(b)) return;
    e.preventDefault();
    const t = b.closest("details").querySelector("table");
    const cells = [...t.rows].map(r => [...r.cells].map(c => c.textContent));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([tableCsv(cells)], { type: "text/csv;charset=utf-8" }));
    a.download = "ga-" + b.dataset.csv + "-" + new Date().toISOString().slice(0, 10) + ".csv"; a.click(); URL.revokeObjectURL(a.href);
  });
}

// --- charts: inline SVG coloured by the page's tokens (--rel, --rule, --ink, --paper, and admin.css's categorical
// --c1..--c6, validated light and night with the dataviz skill's script), so day and night follow for free. Every
// hoverable mark carries data-k (the tooltip's heading) and data-v (its rows, "value<TAB>label<TAB>key class" per line);
// the page shows them in one #chart-tip (wireTips), filled with textContent.
export const compact = n => (n >= 1e6 ? +(n / 1e6).toFixed(1) + "M" : n >= 1e3 ? +(n / 1e3).toFixed(1) + "K" : String(n));
export const tipAttrs = (k, rows) => ' data-k="' + esc(k) + '" data-v="' + esc(rows.map(r => r.join("\t")).join("\n")) + '"';
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
const r1 = v => +v.toFixed(1);
// The y axis: hairline grid, tick labels and the axis title above them.
const yAxis = (tk, y, L, x2, fmt, title) => '<text class="axis-title" x="2" y="11">' + esc(title) + "</text>" +
  tk.map(v => '<line class="grid" x1="' + L + '" x2="' + x2 + '" y1="' + y(v) + '" y2="' + y(v) + '"/><text class="tick" x="' + (L - 6) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + fmt(v) + "</text>").join("");

// One series as a line (no legend, the label names it): 2 px line over a 10% wash, hairline grid, the last value
// labelled at its end dot; each point owns a full-height hover strip (crosshair and dot on :hover, the tooltip from
// its data-k/data-v).
export function lineSvg(points, w = 640, title = "Users", unit = "users") {
  const H = 200, L = 40, R = 44, T = 22, B = 24, pw = Math.max(1, w - L - R), ph = H - T - B;
  const tk = ticks(Math.max(...points.map(p => p.value))), top = tk.at(-1);
  const x = i => r1(L + (points.length < 2 ? pw / 2 : (i * pw) / (points.length - 1)));
  const y = v => r1(T + ph - (v * ph) / top);
  const xy = points.map((p, i) => [x(i), y(p.value)]);
  const line = "M" + xy.map(q => q.join(",")).join("L");
  const step = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor(pw / 70))));
  const strip = r1(points.length < 2 ? pw : pw / (points.length - 1));
  const last = xy.at(-1);
  // no days: the empty frame (axis and grid)
  if (!last) return '<svg class="chart line-chart" width="' + w + '" height="' + H + '" viewBox="0 0 ' + w + " " + H + '" role="img" aria-label="' + esc(title) + ' per day">' + yAxis(tk, y, L, L + pw, compact, title) + "</svg>";
  return '<svg class="chart line-chart" width="' + w + '" height="' + H + '" viewBox="0 0 ' + w + " " + H + '" role="img" aria-label="' + esc(title) + ' per day">' +
    yAxis(tk, y, L, L + pw, compact, title) +
    points.map((p, i) => (i % step && i !== points.length - 1) || (i !== points.length - 1 && points.length - 1 - i < step / 2) ? "" :
      '<text class="tick" x="' + x(i) + '" y="' + (H - 6) + '" text-anchor="middle">' + esc(p.label.slice(5)) + "</text>").join("") +
    '<path class="area" d="' + line + "L" + last[0] + "," + (T + ph) + "L" + xy[0][0] + "," + (T + ph) + 'Z"/><path class="line" d="' + line + '"/>' +
    '<circle class="dot end" cx="' + last[0] + '" cy="' + last[1] + '" r="4"/><text class="val" x="' + (last[0] + 8) + '" y="' + (last[1] + 4) + '">' + esc(compact(points.at(-1).value)) + "</text>" +
    points.map((p, i) => '<g class="hit"' + tipAttrs(p.label, [[compact(p.value), unit]]) + '><rect x="' + r1(xy[i][0] - strip / 2) + '" y="' + T + '" width="' + strip + '" height="' + ph + '"/><line class="cross" x1="' + xy[i][0] + '" x2="' + xy[i][0] + '" y1="' + T + '" y2="' + (T + ph) +
      '"/><circle class="dot" cx="' + xy[i][0] + '" cy="' + xy[i][1] + '" r="4"/></g>').join("") + "</svg>";
}
// GA dates come as YYYYMMDD. The line, then the same numbers as raw data; m picks the axis title and the unit.
export function usersHtml(users, w, m) {
  const pts = [...users].sort((a, b) => (a.date < b.date ? -1 : 1)).map(u => ({ label: isoDate(u.date), value: Number(u.users) || 0 }));
  const d = metricOf(m);
  return lineSvg(pts, w, d.label, d.unit) + raw("users-per-day", barTable("Day", pts.map(p => [p.label, p.value]), d.label));
}
// A ?report= on [date] as usersHtml's [{date, users}].
export const daysFrom = res => (res.rows || []).map(([date, users]) => ({ date, users }));

// --- users per day broken down by one dimension (the select by its label): ?report= with dimensions [date, X] and
// the page's Count metric, one line per value for the top TOP values by users summed over the days (a user active on two days
// counts twice: a ranking, not a head count), in --c1..--c5, over the page's own users-per-day total as a neutral line.
export const TOP = 5;
// A GA value as a label; page titles lose the site's own suffix.
export const pageName = v => gaText(v).replace(/ -- The Ritz Affair$/, "");
// The dimensions that make sense per day (names from shared.js DIMENSIONS), and the plural the note uses.
export const BREAKDOWNS = { country: "countries", deviceCategory: "devices", sessionDefaultChannelGroup: "channels", sessionSource: "sources",
  operatingSystem: "operating systems", browser: "browsers", language: "languages", newVsReturning: "values", "customEvent:mode": "modes", pageTitle: "pages" };
// Each view's choice: the game is one page, the handbook has no mode.
export const VIEW_BREAKDOWNS = { global: Object.keys(BREAKDOWNS), game: Object.keys(BREAKDOWNS).filter(k => k !== "pageTitle"),
  handbook: Object.keys(BREAKDOWNS).filter(k => k !== "customEvent:mode") };
// scope: the view's pagePath filter (Game "/", Handbook /learn/), none on Global.
export const breakdownRequest = (days, dim, m, scope) => scoped(countRequest(days, ["date", dim], m), scope);
// rows [date, value, users] -> {dates (sorted, the union with the total's days), series [{label, values, cls}] for the
// top n values, most users first, a missing day counting 0; count: how many values there were}.
export function pivotSeries(rows, totalDates = [], n = TOP) {
  const by = new Map(), dates = new Set(totalDates.map(String));
  for (const [d, v, u] of rows) {
    dates.add(String(d));
    const m = by.get(v) || by.set(v, new Map()).get(v);
    m.set(String(d), (m.get(String(d)) || 0) + (Number(u) || 0));
  }
  const ds = [...dates].sort(), sum = m => [...m.values()].reduce((a, b) => a + b, 0);
  const top = [...by].sort((a, b) => sum(b[1]) - sum(a[1]) || String(a[0]).localeCompare(String(b[0]))).slice(0, n);
  return { dates: ds, count: by.size, series: top.map(([label, m], j) => ({ label: pageName(label), values: ds.map(d => m.get(d) || 0), cls: "c" + (j + 1) })) };
}
// One day's tooltip rows, the largest first: [value, label, key class].
export const dayTip = (series, i) => series.map(s => [s.values[i], s.label, s.cls]).sort((a, b) => b[0] - a[0]).map(([v, l, c]) => [compact(v), l, c]);
// Several lines on one axis, lineSvg's frame; the total (cls "total") drawn first, under the others. Each day's hover
// strip shows the crosshair and a dot per series.
export function multiLineSvg(labels, series, w = 640, title = "Users") {
  const H = 200, L = 40, R = 16, T = 22, B = 24, pw = Math.max(1, w - L - R), ph = H - T - B, n = labels.length;
  const tk = ticks(Math.max(1, ...series.flatMap(s => s.values))), top = tk.at(-1);
  const x = i => r1(L + (n < 2 ? pw / 2 : (i * pw) / (n - 1))), y = v => r1(T + ph - (v * ph) / top);
  const step = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(pw / 70)))), strip = r1(n < 2 ? pw : pw / (n - 1));
  const col = s => "var(--" + (s.cls === "total" ? "ink" : s.cls) + ")";
  return '<svg class="chart line-chart multi-chart" width="' + w + '" height="' + H + '" viewBox="0 0 ' + w + " " + H + '" role="img" aria-label="' + esc(title) + ' per day by value">' +
    yAxis(tk, y, L, L + pw, compact, title) +
    labels.map((l, i) => (i % step && i !== n - 1) || (i !== n - 1 && n - 1 - i < step / 2) ? "" :
      '<text class="tick" x="' + x(i) + '" y="' + (H - 6) + '" text-anchor="middle">' + esc(l.slice(5)) + "</text>").join("") +
    series.map(s => '<path class="sl ' + esc(s.cls) + '" style="stroke:' + col(s) + '" d="M' + s.values.map((v, i) => x(i) + "," + y(v)).join("L") + '"/>').join("") +
    labels.map((l, i) => '<g class="hit"' + tipAttrs(l, dayTip(series, i)) + '><rect x="' + r1(x(i) - strip / 2) + '" y="' + T + '" width="' + strip + '" height="' + ph +
      '"/><line class="cross" x1="' + x(i) + '" x2="' + x(i) + '" y1="' + T + '" y2="' + (T + ph) + '"/>' +
      series.map(s => '<circle class="dot" style="fill:' + col(s) + '" cx="' + x(i) + '" cy="' + y(s.values[i]) + '" r="4"/>').join("") + "</g>").join("") + "</svg>";
}
// The breakdown: legend, lines, the "Top 5 of N" note, and the date x series table as raw data.
export function breakdownHtml(res, users, dim, w, m) {
  const d = metricOf(m);
  const total = [...users].sort((a, b) => (a.date < b.date ? -1 : 1));
  const p = pivotSeries(res.rows || [], total.map(u => u.date));
  const tot = new Map(total.map(u => [String(u.date), Number(u.users) || 0]));
  const all = { label: "All " + d.unit, values: p.dates.map(d => tot.get(d) || 0), cls: "total" }, series = [all, ...p.series];
  const labels = p.dates.map(isoDate), name = BREAKDOWNS[dim] || "values";
  return '<p class="legend">' + series.map(s => '<span><i class="' + s.cls + ' key-line"></i>' + esc(s.label) + "</span>").join("") + "</p>" +
    multiLineSvg(labels, series, w, d.label) +
    (p.count > p.series.length ? '<p class="muted">Top ' + p.series.length + " of " + p.count + " " + esc(name) + " (by " + esc(d.unit) + " summed over the days).</p>" : "") +
    raw("users-per-day-breakdown", '<div class="wide"><table class="detail stats"><thead><tr><th>Day</th>' + series.map(s => '<th class="num">' + esc(s.label) + "</th>").join("") + "</tr></thead><tbody>" +
      labels.map((l, i) => "<tr><td>" + esc(l) + "</td>" + series.map(s => '<td class="num">' + s.values[i] + "</td>").join("") + "</tr>").join("") + "</tbody></table></div>");
}
const optionsHtml = (pairs, cur) => pairs.map(([v, l]) => '<option value="' + esc(v) + '"' + (String(v) === String(cur) ? " selected" : "") + ">" + esc(l) + "</option>").join("");
const breakdownSelect = (cur, keys) => '<label class="pick">Breakdown <select id="bd-dim">' +
  optionsHtml([["", "None"], ...keys.map(k => [k, DIMENSIONS[k] || k])], cur) + "</select></label>";
// bd: {dim, total, res, error}: total the ?report= on [date] for the metric m (Visitors on Global uses ?stats' users
// instead; s null: always the report), res the [date, dim] breakdown; either null while reading. keys: the view's breakdowns.
export function usersSection(s, w, bd = {}, m = "visitors", keys = VIEW_BREAKDOWNS.global) {
  const head = '<div class="label-row"><span class="label">USERS PER DAY</span>' + breakdownSelect(bd.dim || "", keys) + "</div>";
  if (bd.error) return head + '<p class="status bad">Google Analytics said: ' + esc(bd.error) + "</p>";
  const total = bd.total ? daysFrom(bd.total) : s && metricOf(m) === COUNT_METRICS.visitors ? s.users || [] : null;
  if (!total) return head + '<p class="muted">Reading the days...</p>';
  if (!bd.dim) return head + usersHtml(total, w, m);
  if (!bd.res) return head + '<p class="muted">Reading the breakdown...</p>';
  return head + breakdownHtml(bd.res, total, bd.dim, w, m);
}

// The countries follow the page's Count: one ?report= on country with the Count's metric (countRequest; GA orders it
// by that metric, 0 = all) gives the bubbles and GA's total over every country; when the Top cuts the list, a second
// one with the top N as a country filter gives GA's own total for them (a person in two of them counts once).
export const TOP_COUNTRIES = [5, 10, 20, 50, 0];
export const countriesRequest = (days, m, scope = null) => scoped(countRequest(days, ["country"], m), scope);
export const countriesFrom = (res, n) => (res.rows || []).slice(0, n || Infinity).map(([country, users]) => ({ country, users }));
// The top N's total request, or null when the Top keeps every country (GA's total already covers them).
export const topTotalRequest = (req, res, n) => {
  const rows = (res && res.rows) || [];
  return n && rows.length > n ? withFilters({ ...req, dimensions: [] }, { country: rows.slice(0, n).map(r => String(r[0])) }) : null;
};
const num = v => Number(v).toLocaleString("en");
// The line under the label: the top N's total and its share of every country's, both GA's own; sub null while reading.
export function countriesTotal(res, sub, n, m) {
  const d = metricOf(m), all = gaTotal(res), count = ((res && res.rows) || []).length;
  if (!n || count <= n) return (count === 1 ? "The one country" : "All " + count + " countries") + ": " + num(all) + " " + d.unit + ".";
  if (!sub) return "Top " + n + ": reading GA's total...";
  const t = gaTotal(sub);
  return "Top " + n + ": " + num(t) + " " + d.unit + ", " + pct(t, all) + " of " + num(all) + " in all " + count + " countries.";
}
const topSelect = cur => '<label class="pick">Top <select id="top-n">' + optionsHtml(TOP_COUNTRIES.map(n => [n, n || "All"]), cur) + "</select></label>";
// top: {n, res, sub, error}: res the country reply (null while reading), sub the top N's total reply; m the page's Count.
export function countriesSection(world, top = {}, m = "visitors") {
  const n = top.n ?? 10, head = '<div class="label-row"><span class="label">COUNTRIES (' + (n ? "TOP " + n : "ALL") + ")</span>" + topSelect(n) + "</div>";
  if (top.error) return head + '<p class="status bad">Google Analytics said: ' + esc(top.error) + "</p>";
  if (!top.res) return head + '<p class="muted">Reading the countries...</p>';
  const list = countriesFrom(top.res, n), cut = topTotalRequest({}, top.res, n);
  const foot = [...(cut && top.sub ? [["Top " + n + " (GA's total)", gaTotal(top.sub)]] : []), ["All countries (GA's total)", gaTotal(top.res)]];
  return head + '<p>' + esc(countriesTotal(top.res, top.sub, n, m)) + "</p>" + mapHtml(list, world, m, foot) +
    (list.length ? '<p class="muted">' + esc(overlapNote("in two countries", m, "bubbles")) + "</p>" : "");
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
// The funnel on the I-XII grid every chapter chart shares (zeros where GA has nothing), so they all line up.
export const funnel12 = rows => { const by = new Map(funnel(rows).map(c => [c.chapter, c]));
  return Array.from({ length: 12 }, (_, i) => by.get(i + 1) || { chapter: i + 1, opened: 0, q1: 0, q5: 0, q20: 0, solved: 0 }); };
export const STAGES = [["opened", "Opened"], ["q1", "Ran 1 query"], ["q5", "Ran 5"], ["q20", "Ran 20"], ["solved", "Solved"]];
// A bar from the baseline up, its top corners rounded (r <= 2, at most half its width).
const barPath = (x, y, bw, h) => { const r = Math.min(2, bw / 2, h); return "M" + x + "," + r1(y + h) + "v" + r1(-(h - r)) + "q0," + r1(-r) + " " + r1(r) + "," + r1(-r) +
  "h" + r1(bw - 2 * r) + "q" + r1(r) + ",0 " + r1(r) + "," + r1(r) + "v" + r1(h - r) + "Z"; };
// Chapters as the game names them.
export const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
const roman = n => ROMAN[n] || String(n);
export const solveRate = c => (c.opened ? Math.round((100 * c.solved) / c.opened) : null);
// Retention: users who opened chapter N over those who opened chapter I (so I is 100%); null without chapter I openers.
export const retention = f => { const base = (f.find(c => c.chapter === 1) || {}).opened || 0; return c => (base ? Math.round((100 * c.opened) / base) : null); };
// Both chapter charts share one x layout (40 px each side, one column per chapter), so the solve rate lines up under
// the funnel.
const CL = 40, CR = 40, CT = 22, CB = 24;
const cols = (f, w) => { const pw = Math.max(1, w - CL - CR); return { pw, gw: pw / Math.max(1, f.length) }; };
// A percent line with dots: one point per chapter whose value is not null, mid-column.
const pctLine = (f, val, gw, yr, cls) => {
  const pts = f.map((c, i) => [r1(CL + (i + 0.5) * gw), val(c)]).filter(p => p[1] !== null).map(([px, v]) => [px, yr(v)]);
  return pts.length ? '<path class="' + cls + '-line" d="M' + pts.map(p => p.join(",")).join("L") + '"/>' + pts.map(p => '<circle class="' + cls + '-dot" cx="' + p[0] + '" cy="' + p[1] + '" r="4"/>').join("") : "";
};
const xLabels = (f, gw, H) => '<text class="tick" x="' + (CL - 6) + '" y="' + (H - 6) + '" text-anchor="end">Ch.</text>' +
  f.map((c, i) => '<text class="tick' + (gw < 32 ? " small" : "") + '" x="' + r1(CL + (i + 0.5) * gw) + '" y="' + (H - 6) + '" text-anchor="middle">' + roman(c.chapter) + "</text>").join("");
const pctOf = v => (v === null ? "-" : v + "%");
// The funnel as vertical grouped bars, x = chapter, the five stages side by side in the categorical --c1..--c5 on the
// left axis (users), and the retention (opened / chapter I's opened) as a --c6 line with dots on a right 0-100% axis
// (a dual axis the owner asked for, 2026-10-23). Each chapter has one hover column whose tooltip lists the five
// stages, the retention and the solve rate.
export function funnelSvg(f, w = 640) {
  const H = 220, L = CL, T = CT, { pw, gw } = cols(f, w), ph = H - T - CB;
  const tk = ticks(Math.max(1, ...f.flatMap(c => STAGES.map(([k]) => c[k])))), top = tk.at(-1);
  const inner = gw * 0.8, gap = inner / STAGES.length > 4 ? 1 : 0, bw = (inner - gap * (STAGES.length - 1)) / STAGES.length;
  const y = v => r1(T + ph - (v * ph) / top), yr = v => r1(T + ph - (v * ph) / 100), ret = retention(f);
  return '<svg class="chart funnel-chart" width="' + w + '" height="' + H + '" viewBox="0 0 ' + w + " " + H + '" role="img" aria-label="Chapter funnel and retention">' +
    yAxis(tk, y, L, L + pw, compact, "Users") + '<text class="axis-title" x="' + (w - 2) + '" y="11" text-anchor="end">Retention</text>' +
    [0, 25, 50, 75, 100].map(v => '<text class="tick" x="' + (L + pw + 6) + '" y="' + (yr(v) + 4) + '">' + v + "%</text>").join("") + xLabels(f, gw, H) +
    f.map((c, i) => {
      const x0 = L + i * gw;
      return '<g class="hit"' + tipAttrs("Chapter " + roman(c.chapter), STAGES.map(([k, name], j) => [c[k], name, "c" + (j + 1)])
        .concat([[pctOf(ret(c)), "retention", "c6"], [pct(c.solved, c.opened), "solve rate"]])) +
        '><rect x="' + r1(x0) + '" y="' + T + '" width="' + r1(gw) + '" height="' + ph + '"/></g>' +
        STAGES.map(([k], j) => c[k] ? '<path class="bar c' + (j + 1) + '" d="' + barPath(r1(x0 + gw * 0.1 + j * (bw + gap)), y(c[k]), r1(bw), r1(T + ph - y(c[k]))) + '"/>' : "").join("");
    }).join("") + '<line class="axis" x1="' + L + '" x2="' + (L + pw) + '" y1="' + (T + ph) + '" y2="' + (T + ph) + '"/>' +
    pctLine(f, ret, gw, yr, "rate") + "</svg>";
}
// The solve rate (solved / opened) per chapter, one line with dots on a 0-100% axis, in the funnel's columns (its
// right gutter left empty so the chapters line up); chapters nobody opened have no dot.
export function solveRateSvg(f, w = 640) {
  const H = 160, { pw, gw } = cols(f, w), ph = H - CT - CB, yr = v => r1(CT + ph - (v * ph) / 100);
  return '<svg class="chart solve-chart" width="' + w + '" height="' + H + '" viewBox="0 0 ' + w + " " + H + '" role="img" aria-label="Solve rate per chapter">' +
    yAxis([0, 25, 50, 75, 100], yr, CL, CL + pw, v => v + "%", "Solve rate") + xLabels(f, gw, H) +
    f.map((c, i) => '<g class="hit"' + tipAttrs("Chapter " + roman(c.chapter), [[c.solved + " of " + c.opened + " solved (" + pct(c.solved, c.opened) + ")"]]) +
      '><rect x="' + r1(CL + i * gw) + '" y="' + CT + '" width="' + r1(gw) + '" height="' + ph + '"/></g>').join("") +
    '<line class="axis" x1="' + CL + '" x2="' + (CL + pw) + '" y1="' + (CT + ph) + '" y2="' + (CT + ph) + '"/>' + pctLine(f, solveRate, gw, yr, "solve") + "</svg>";
}
export function solveRateHtml(rows, w) {
  const f = funnel12(rows);
  return solveRateSvg(f, w) +
    raw("solve-rate", '<table class="detail stats"><thead><tr><th>Chapter</th><th>Opened</th><th>Solved</th><th>Solve rate</th></tr></thead><tbody>' +
      f.map(c => "<tr><td>" + roman(c.chapter) + '</td><td class="num">' + c.opened + '</td><td class="num">' + c.solved + '</td><td class="num">' + pct(c.solved, c.opened) + "</td></tr>").join("") + "</tbody></table>");
}
const legend = names => '<p class="legend">' + names.map((name, j) => '<span><i class="c' + (j + 1) + '"></i>' + esc(name) + "</span>").join("") +
  '<span><i class="c6 key-line"></i>Retention (right axis)</span></p>';
export function funnelHtml(rows, w) {
  const f = funnel12(rows);
  const finished = rows.filter(r => r.event === "game_finish").reduce((s, r) => s + (Number(r.users) || 0), 0);
  const ret = retention(f);
  return legend(STAGES.map(s => s[1])) + funnelSvg(f, w) +
    raw("chapter-funnel", '<table class="detail stats"><thead><tr><th>Chapter</th><th>Opened</th><th>Ran 1 query</th><th>Ran 5</th><th>Ran 20</th><th>Solved</th><th>Retention</th><th>Solve rate</th></tr></thead><tbody>' +
    f.map(c => "<tr><td>" + roman(c.chapter) + "</td>" + STAGES.map(([k]) => '<td class="num">' + c[k] + "</td>").join("") +
      '<td class="num">' + pctOf(ret(c)) + '</td><td class="num">' + pct(c.solved, c.opened) + "</td></tr>").join("") + "</tbody></table>") +
    '<p class="muted">Finished a part: ' + finished + " users.</p>";
}

// --- donuts: the first five slices by value, the rest folded into Other (never a seventh colour); Other keeps how
// many rows it sums (n), so raw data can say so.
export function fold(items, n = 5) {
  const s = [...items].filter(i => i.value > 0).sort((a, b) => b.value - a.value);
  if (s.length <= n + 1) return s;
  return s.slice(0, n).concat([{ label: "Other", value: s.slice(n).reduce((t, i) => t + i.value, 0), n: s.length - n }]);
}
// Slice angles in radians, clockwise from 12 o'clock.
export function arcs(values) {
  const total = values.reduce((t, v) => t + v, 0);
  let a = 0;
  return values.map(v => { const a0 = a; a += total ? (2 * Math.PI * v) / total : 0; return [a0, a]; });
}
// An annulus slice between radii r0 < r1 (a full turn is drawn as two halves, so a lone slice still shows).
export function arcPath(cx, cy, r0, r, a0, a1) {
  if (a1 - a0 >= 2 * Math.PI - 1e-9) return arcPath(cx, cy, r0, r, 0, Math.PI) + arcPath(cx, cy, r0, r, Math.PI, 2 * Math.PI);
  const p = (rad, a) => r1(cx + rad * Math.sin(a)) + "," + r1(cy - rad * Math.cos(a)), big = a1 - a0 > Math.PI ? 1 : 0;
  return "M" + p(r, a0) + "A" + r + "," + r + " 0 " + big + " 1 " + p(r, a1) + "L" + p(r0, a1) + "A" + r0 + "," + r0 + " 0 " + big + " 0 " + p(r0, a0) + "Z";
}
// unique: GA's own total (each person once); without it the centre is the slices' sum. fixed: the items are a fixed
// list of entities (the site sections, the modes...), kept in their order and colour, zeros listed in the legend.
// Nothing to draw: the empty ring, 0 in the centre.
export function donutHtml(items, what, aria, unique, fixed = false) {
  const s = fixed ? items : fold(items);
  const sum = s.reduce((t, i) => t + i.value, 0), total = unique > 0 ? unique : sum, D = 180, c = D / 2;
  const svg = '<svg class="chart donut" width="' + D + '" height="' + D + '" viewBox="0 0 ' + D + " " + D + '" role="img" aria-label="' + esc(aria) + '">' +
    (sum ? arcs(s.map(i => i.value)).map(([a0, a1], j) => s[j].value > 0 ? '<path class="slice c' + (j + 1) + '"' + tipAttrs(s[j].label, [[s[j].value + " " + what, pct(s[j].value, total)]]) +
      ' d="' + arcPath(c, c, 52, 86, a0, a1) + '"/>' : "").join("") : '<path class="slice empty" d="' + arcPath(c, c, 52, 86, 0, 2 * Math.PI) + '"/>') +
    '<text class="val" x="' + c + '" y="' + (c + 2) + '" text-anchor="middle">' + compact(total) + '</text><text class="tick" x="' + c + '" y="' + (c + 18) + '" text-anchor="middle">' + esc(what) + "</text></svg>";
  return '<div class="donut-row">' + svg + '<ul class="donut-legend">' + s.map((i, j) => '<li><i class="c' + (j + 1) + '"></i><span>' + esc(i.label) +
    '</span><b class="num">' + i.value + '</b><span class="num muted">' + pct(i.value, total) + "</span></li>").join("") + "</ul></div>" +
    (sum > total ? '<p class="muted">' + total + " " + esc(what) + " in all; the slices add up to " + sum + " because some count in more than one.</p>" : "");
}
// A fixed list of entities from rows [key, value...]: names' keys in order (key -> label), then any other key GA
// reports; col: the metric's column.
export function fixedItems(res, names, col = 1) {
  const m = new Map(((res && res.rows) || []).map(r => [String(r[0]), Number(r[col]) || 0]));
  return [...Object.keys(names), ...[...m.keys()].filter(k => !(k in names))].map(k => ({ label: names[k] || gaText(k), value: m.get(k) || 0 }));
}
// A donut panel's body: the donut over GA's total for res, a muted note, and raw data listing the slices (an Other
// fold named as a sum of rows) and GA's total.
export function donutBody(items, what, aria, res, note, name, head, valHead, fixed = false) {
  const unique = gaTotal(res), s = fixed ? items : fold(items);
  return donutHtml(items, what, aria, unique, fixed) + (note ? '<p class="muted">' + esc(note) + "</p>" : "") +
    raw(name, tableHtml([head, valHead], s.map(i => [i.n ? "Other (sum of " + i.n + " rows)" : i.label, i.value]).concat(unique ? [["All (GA's total)", unique]] : [])));
}

// The page's one Count select (beside the period buttons) drives users per day, the countries and both donuts, each read from ?report=
// (the backend allows eventName as a filter); the comparison chart draws all six. A user metric counts a person in
// every slice they fall in, so the slices may add up to more than the people. short: the comparison's x labels.
export const COUNT_METRICS = {
  visitors: { label: "Visitors", short: "Visitors", metric: "activeUsers", unit: "visitors", note: "Counts every visitor (active users)" },
  opened: { label: "Players who opened a chapter", short: "Opened", metric: "totalUsers", event: "chapter_open", unit: "players", note: "Counts the users who opened a chapter" },
  solved: { label: "Players who solved a chapter", short: "Solved", metric: "totalUsers", event: "chapter_solve", unit: "players", note: "Counts the users who solved a chapter" },
  sessions: { label: "Sessions", short: "Sessions", metric: "sessions", unit: "sessions", note: "Counts sessions" },
  engaged: { label: "Engaged sessions", short: "Engaged", metric: "engagedSessions", unit: "sessions", note: "Counts engaged sessions (GA's: 10 s or more, two pages or a key event)" },
  views: { label: "Page views", short: "Views", metric: "screenPageViews", unit: "page views", note: "Counts page views" },
};
// A Count of events (page views) puts each one in exactly one slice, unlike people and sessions.
const isViews = d => d.unit === "page views";
// The handbook's own people counts (not in the comparison, which draws COUNT_METRICS).
export const HANDBOOK_COUNTS = {
  ran: { label: "Readers who ran an exercise", short: "Ran", metric: "totalUsers", event: "exercise_run", unit: "readers", note: "Counts the users who ran an exercise" },
  exsolved: { label: "Readers who solved an exercise", short: "Solved", metric: "totalUsers", event: "exercise_solve", unit: "readers", note: "Counts the users who solved an exercise" },
};
// Each view's Count select, in order.
export const VIEW_COUNTS = { global: Object.keys(COUNT_METRICS), game: Object.keys(COUNT_METRICS), handbook: ["visitors", "ran", "exsolved", "sessions", "engaged", "views"] };
export const DONUTS = {
  devices: { dim: "deviceCategory", label: "DEVICES", head: "Device", many: "on two devices" },
  channels: { dim: "sessionDefaultChannelGroup", label: "CHANNELS", head: "Channel", many: "through two channels" },
};
// (declarations, hoisted: usersHtml above uses them)
export function metricOf(m) { return COUNT_METRICS[m] || HANDBOOK_COUNTS[m] || COUNT_METRICS.visitors; }
export function countRequest(days, dimensions, m) {
  const d = metricOf(m);
  return { days, dimensions, metrics: [d.metric], ...(d.event ? { filters: { eventName: [d.event] } } : {}) };
}
export const donutRequest = (days, kind, m) => countRequest(days, [DONUTS[kind].dim], m);
export const donutNote = (kind, m) => overlapNote(DONUTS[kind].many, m);
// What a Count counts and how one person can fall in several slices (many: "two devices").
export const overlapNote = (many, m, part = "slices") => {
  const d = metricOf(m);
  if (isViews(d)) return d.note + ": each page view sits in one " + part.slice(0, -1) + ", so the " + part + " add up to the total.";
  return d.unit === "sessions"
    ? d.note + ": each session sits in one " + part.slice(0, -1) + ", but one person's sessions can fall in several (" + many + ")."
    : d.note + ": a person " + many + " counts in both " + part + ", so the " + part + " may add up to more than the people.";
};
// sel: {res, error}, res null while reading; m the page's Count.
export function donutSection(kind, sel = {}, m = "visitors") {
  const k = DONUTS[kind], d = metricOf(m);
  const head = '<div class="label-row"><span class="label">' + k.label + "</span></div>";
  if (sel.error) return head + '<p class="status bad">Google Analytics said: ' + esc(sel.error) + "</p>";
  if (!sel.res) return head + '<p class="muted">Reading the ' + kind + "...</p>";
  const list = (sel.res.rows || []).map(([label, v]) => ({ label: gaText(label), value: Number(v) || 0 }));
  const unique = sel.res.totals ? Number(sel.res.totals[0]) || 0 : 0;
  return head + donutHtml(list, d.unit, d.label + " by " + k.head.toLowerCase(), unique) + '<p class="muted">' + esc(donutNote(kind, m)) + "</p>" +
    raw(k.label.toLowerCase(), barTable(k.head, list.map(i => [i.label, i.value]), d.label));
}

// --- the Count metrics side by side: one group each, a bar per segment of a dimension (its own select), so the totals
// show how the metrics differ and the bars the mix. One ?report= per metric on [dim] (countRequest, the donuts' shape).
export const STACKS = { deviceCategory: "Device", sessionDefaultChannelGroup: "Channel", country: "Country", newVsReturning: "New vs returning" };
export const compareRequests = (days, dim) => Object.keys(COUNT_METRICS).map(m => [m, countRequest(days, [dim], m)]);
// byMetric {m: res}: the segments ranked by their value summed over every bar (one order and colour for all bars;
// past n + 1 the rest fold into Other, as on the donuts), each metric's values in that order.
export function stackData(byMetric, n = 5) {
  const per = Object.keys(COUNT_METRICS).map(m => [m, new Map(((byMetric[m] || {}).rows || []).map(([l, v]) => [gaText(l), Number(v) || 0]))]);
  const sum = new Map();
  for (const [, mp] of per) for (const [l, v] of mp) sum.set(l, (sum.get(l) || 0) + v);
  const ranked = [...sum].filter(e => e[1] > 0).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(e => e[0]);
  const keep = ranked.length <= n + 1 ? ranked : ranked.slice(0, n), other = ranked.length > keep.length;
  const segs = other ? [...keep, "Other"] : keep;
  const bars = per.map(([m, mp]) => {
    const values = keep.map(l => mp.get(l) || 0);
    if (other) values.push([...mp].filter(e => !keep.includes(e[0])).reduce((t, e) => t + e[1], 0));
    // sum: the segments added (a person in two segments counts twice); total: GA's own total (each person once)
    // when the reply carries it, else the sum.
    const sum = values.reduce((a, b) => a + b, 0), t = (byMetric[m] || {}).totals;
    return { m, values, sum, total: t ? Number(t[0]) || 0 : sum };
  });
  return { segs, bars };
}
// Grouped vertical bars on one count axis: per metric (x group, its short name below) one bar per segment side by
// side in --c1..--c6, GA's total once centred over the group; each bar its own tooltip (metric, segment, value, share
// of the metric's total).
export function groupSvg(st, w = 640) {
  // groups too narrow for their names (390 px): every other name drops to a second line under the axis
  const L = 40, R = 16, T = 22, pw = Math.max(1, w - L - R), gw = pw / st.bars.length, two = gw < 64, B = two ? 36 : 24, H = 216 + B, ph = H - T - B;
  const tk = ticks(Math.max(1, ...st.bars.map(b => Math.max(b.total, ...b.values)))), top = tk.at(-1), y = v => r1(T + ph - (v * ph) / top);
  const n = Math.max(1, st.segs.length), inner = Math.min(gw * 0.8, n * 18), gap = inner / n > 4 ? 1 : 0, bw = (inner - gap * (n - 1)) / n;
  return '<svg class="chart stack-chart" width="' + w + '" height="' + H + '" viewBox="0 0 ' + w + " " + H + '" role="img" aria-label="Count metrics compared">' +
    yAxis(tk, y, L, L + pw, compact, "Count") +
    st.bars.map((b, i) => {
      const d = metricOf(b.m), cx = L + (i + 0.5) * gw, x0 = cx - inner / 2;
      const bars = b.values.map((v, j) => !v ? "" : '<path class="seg c' + (j + 1) + '"' + tipAttrs(d.label, [[compact(v), st.segs[j], "c" + (j + 1)], [pct(v, b.total), "of the total"]]) +
        ' d="' + barPath(r1(x0 + j * (bw + gap)), y(v), r1(bw), r1(Math.max(1, T + ph - y(v)))) + '"/>').join("");
      return bars + '<text class="val" x="' + r1(cx) + '" y="' + (y(Math.max(b.total, ...b.values)) - 6) + '" text-anchor="middle">' + compact(b.total) + "</text>" +
        '<text class="tick" x="' + r1(cx) + '" y="' + (H - 6 - (two && i % 2 === 0 ? 12 : 0)) + '" text-anchor="middle">' + esc(d.short) + "</text>";
    }).join("") + '<line class="axis" x1="' + L + '" x2="' + (L + pw) + '" y1="' + (T + ph) + '" y2="' + (T + ph) + '"/></svg>';
}
// cmp: {dim, res: {m: res} (null while reading), error}.
export function compareSection(cmp = {}, w) {
  const dim = cmp.dim in STACKS ? cmp.dim : "sessionDefaultChannelGroup";
  const head = '<div class="label-row"><span class="label">COUNT METRICS COMPARED</span><label class="pick">Stack by <select id="stack-dim">' +
    optionsHtml(Object.entries(STACKS), dim) + "</select></label></div>";
  if (cmp.error) return head + '<p class="status bad">Google Analytics said: ' + esc(cmp.error) + "</p>";
  if (!cmp.res) return head + '<p class="muted">Reading the five counts...</p>';
  const st = stackData(cmp.res);
  return head + '<p class="legend">' + st.segs.map((s, j) => '<span><i class="c' + (j + 1) + '"></i>' + esc(s) + "</span>").join("") + "</p>" + groupSvg(st, w) +
    '<p class="muted">Visitors and players are people, sessions are visits, page views are pages loaded: the bars do not share a unit. The number over a group is GA&#39;s own total; a person in two segments (two devices, say) counts in both, so a group&#39;s bars can add up to more than its total.</p>' +
    raw("count-metrics-compared", '<div class="wide"><table class="detail stats"><thead><tr><th>Count</th>' + st.segs.map(s => '<th class="num">' + esc(s) + "</th>").join("") + '<th class="num">Total</th></tr></thead><tbody>' +
      st.bars.map(b => "<tr><td>" + esc(metricOf(b.m).label) + "</td>" + b.values.map(v => '<td class="num">' + v + "</td>").join("") + '<td class="num">' + b.total + "</td></tr>").join("") + "</tbody></table></div>");
}

// --- map: site/world.json (Natural Earth 110m, equirectangular 84N-57S, 1000 units wide; its centroids in lon/lat
// under GA's English country names, ASCII-folded), one bubble per country, its area proportional to users.
export const MAP = { W: 1000, N: 84, S: -57 };
MAP.H = Math.round((MAP.W * (MAP.N - MAP.S)) / 360);
export const project = (lon, lat) => [r1(((lon + 180) * MAP.W) / 360), r1(((MAP.N - lat) * MAP.H) / (MAP.N - MAP.S))];
export const countryKey = s => String(s).normalize("NFD").replace(/\p{M}/gu, "").replace(/\p{Pi}|\p{Pf}/gu, "'");
export const bubbleR = (v, max, rMax = 40) => (max > 0 && v > 0 ? r1(Math.max(3, rMax * Math.sqrt(v / max))) : 0);
export function mapHtml(countries, world, m, foot = []) {
  const d = metricOf(m), list = countries.map(c => ({ label: gaText(c.country), value: Number(c.users) || 0 }));
  const max = Math.max(...list.map(c => c.value));
  const placed = [], off = [];
  for (const c of list) { const ll = world && world.centroids[countryKey(c.label)]; (ll && c.value > 0 ? placed : off).push({ ...c, xy: ll && project(...ll) }); }
  const svg = !world ? "" : '<svg class="chart map" viewBox="0 0 ' + MAP.W + " " + MAP.H + '" role="img" aria-label="' + esc(d.label) + ' by country">' +
    '<path class="land" d="' + world.land + '"/>' +
    placed.sort((a, b) => b.value - a.value).map(c => { const r = bubbleR(c.value, max); return '<g class="bubble"' + tipAttrs(c.label, [[c.value + " " + d.unit, ""]]) +
      '><circle class="hitzone" cx="' + c.xy[0] + '" cy="' + c.xy[1] + '" r="' + Math.max(r, 18) + '"/><circle class="b" cx="' + c.xy[0] + '" cy="' + c.xy[1] + '" r="' + r + '"/></g>'; }).join("") + "</svg>";
  return svg + (world && off.length ? '<p class="muted">Not on the map: ' + off.map(c => esc(c.label) + " (" + c.value + ")").join(", ") + ".</p>" : "") +
    raw("countries", barTable("Country", list.map(c => [c.label, c.value]), d.label, foot));
}

// opts: {m, bd, cmp, top} as usersSection, compareSection and countriesSection take them (m the page's Count),
// dn: {devices, channels} as donutSection takes them.
// The Global view (monitor.html). opts.pages: a panel state ({res: [replies] | null, error}); PAGES, devices and channels share one row.
export function statsHtml(s, w, world, opts = {}) {
  return usersSection(s, w, opts.bd, opts.m) + compareSection(opts.cmp, w) +
    countriesSection(world, opts.top, opts.m) +
    '<div class="donuts three"><div>' + pagesSection(opts.pages, opts.m) + "</div>" + Object.keys(DONUTS).map(k => "<div>" + donutSection(k, (opts.dn || {})[k], opts.m) + "</div>").join("") + "</div>";
}

// --- the three views ---------------------------------------------------------------------------
// monitor.html (Global), monitor-game.html (Game) and monitor-handbook.html (Handbook) all run this module; <body
// data-view> picks the view. Every number drawn is one GA returned: people are never added across rows (a total of
// people is GA's own `totals`), averages are GA's averageCustomEvent:<param> (per event) and say so, and a reply with
// no rows draws the chart's empty frame (zeros on a per-chapter or per-exercise grid).

// Page sections as pagePath filters (apps_script.gs report_: a list is exact paths, an object adds prefixes and not).
export const GAME_PATHS = ["/", "/index.html"];
export const DESK_PATHS = ["/admin.html", "/monitor.html", "/monitor-game.html", "/monitor-handbook.html", "/explore.html", "/leaderboard.html"];
export const LEARN = { beginsWith: ["/learn/"] };
export const SECTIONS = [["Game", GAME_PATHS], ["Handbook", LEARN], ["Desk", DESK_PATHS],
  ["Other", { exact: [...GAME_PATHS, ...DESK_PATHS], beginsWith: ["/learn/"], not: true }]];
const withFilters = (req, f) => ({ ...req, filters: { ...(req.filters || {}), ...f } });
export const scoped = (req, scope) => (scope ? withFilters(req, { pagePath: scope }) : req);
// The four sections, then the same count over every page (unfiltered): the donut's centre is GA's own total, never a sum.
export const sectionRequests = (days, m) => SECTIONS.map(([, f]) => scoped(countRequest(days, [], m), f)).concat([countRequest(days, [], m)]);
// Each view's pages, for its users per day, breakdown and Count.
export const SCOPES = { global: null, game: GAME_PATHS, handbook: LEARN };
// A reply's grand total for its first metric: GA's totals, else (no dimensions) its one row.
export const gaTotal = res => (res && res.totals ? Number(res.totals[0]) || 0 : res && res.rows && res.rows.length === 1 ? Number(res.rows[0].at(-1)) || 0 : 0);
// rows -> Map(first dimension value -> the row's metrics as numbers); nd: how many dimensions the reply has.
const byFirst = (res, nd = 1) => new Map(((res && res.rows) || []).map(r => [String(r[0]), r.slice(nd).map(v => Number(v) || 0)]));
const avg = v => (Math.round(v * 10) / 10).toString();

// Horizontal bars, one row per item (its label above its bars, so long names fit at 390 px), one bar per series in
// --c1.., the value at each bar's end; one hover row per item. rows: [{label, values, tip}], series: [[name, cls]].
// No rows: the empty frame.
const hbarPath = (y, bw, h) => { const r = Math.min(2, h / 2, bw); return "M0," + y + "h" + r1(bw - r) + "q" + r + ",0 " + r + "," + r + "v" + r1(h - 2 * r) + "q0," + r + " " + -r + "," + r + "h" + r1(-(bw - r)) + "Z"; };
export function hbarSvg(rows, series, w = 640, fmt = compact, aria = "Bars") {
  const LH = 16, BH = 8, G = 2, rh = LH + series.length * (BH + G) + 8, H = Math.max(1, rows.length) * rh + 4, R = 52, pw = Math.max(1, w - R);
  const max = Math.max(0, ...rows.flatMap(r => r.values)) || 1, chars = Math.max(10, Math.floor(w / 7.4));
  const cut = s => (s.length > chars ? s.slice(0, chars - 3) + "..." : s);
  return '<svg class="chart hbar-chart" width="' + w + '" height="' + H + '" viewBox="0 0 ' + w + " " + H + '" role="img" aria-label="' + esc(aria) + '">' +
    rows.map((r, i) => {
      const y0 = i * rh;
      return '<g class="hit"' + tipAttrs(r.label, series.map(([n, c], j) => [fmt(r.values[j]), n, c]).concat(r.tip || [])) + '><rect x="0" y="' + y0 + '" width="' + w + '" height="' + rh + '"/></g>' +
        '<text x="0" y="' + (y0 + 12) + '">' + esc(cut(r.label)) + "</text>" +
        series.map(([, c], j) => {
          const v = r.values[j] || 0, y = y0 + LH + j * (BH + G), bw = r1((v * pw) / max);
          return (v > 0 ? '<path class="bar ' + c + '" d="' + hbarPath(y, Math.max(1, bw), BH) + '"/>' : "") +
            '<text class="tick" x="' + r1(bw + 4) + '" y="' + (y + BH) + '">' + esc(fmt(v)) + "</text>";
        }).join("");
    }).join("") + '<line class="axis" x1="0.5" x2="0.5" y1="0" y2="' + H + '"/></svg>';
}
// Vertical grouped bars per chapter in the funnel's columns, on one axis titled `title`; f: [{chapter, values}].
export function chapterBarsSvg(f, series, w = 640, title = "Users", fmt = compact) {
  const H = 180, { pw, gw } = cols(f, w), ph = H - CT - CB;
  const tk = ticks(Math.max(1, ...f.flatMap(c => c.values))), top = tk.at(-1), y = v => r1(CT + ph - (v * ph) / top);
  const n = series.length, inner = gw * 0.7, gap = n > 1 && inner / n > 4 ? 1 : 0, bw = (inner - gap * (n - 1)) / n;
  return '<svg class="chart cols-chart" width="' + w + '" height="' + H + '" viewBox="0 0 ' + w + " " + H + '" role="img" aria-label="' + esc(title) + ' per chapter">' +
    yAxis(tk, y, CL, CL + pw, compact, title) + xLabels(f, gw, H) +
    f.map((c, i) => {
      const x0 = CL + i * gw;
      return '<g class="hit"' + tipAttrs("Chapter " + roman(c.chapter), series.map(([name, cls], j) => [fmt(c.values[j]), name, cls]).concat(c.tip || [])) +
        '><rect x="' + r1(x0) + '" y="' + CT + '" width="' + r1(gw) + '" height="' + ph + '"/></g>' +
        series.map(([, cls], j) => c.values[j] > 0 ? '<path class="bar ' + cls + '" d="' + barPath(r1(x0 + gw * 0.15 + j * (bw + gap)), y(c.values[j]), r1(bw), r1(CT + ph - y(c.values[j]))) + '"/>' : "").join("");
    }).join("") + '<line class="axis" x1="' + CL + '" x2="' + (CL + pw) + '" y1="' + (CT + ph) + '" y2="' + (CT + ph) + '"/></svg>';
}
// A table from a header and rows of cells, every cell escaped; numbers (and "40%", "3.5", "-") right-aligned.
const isNum = c => typeof c === "number" || /^(-|\d+(\.\d+)?%?)$/.test(String(c));
export const tableHtml = (heads, rows) => '<div class="wide"><table class="detail stats"><thead><tr>' + heads.map((h, i) => "<th" + (rows.length && i && isNum(rows[0][i]) ? ' class="num"' : "") + ">" + esc(h) + "</th>").join("") +
  "</tr></thead><tbody>" + rows.map(r => "<tr>" + r.map(c => "<td" + (isNum(c) ? ' class="num"' : "") + ">" + esc(c) + "</td>").join("") + "</tr>").join("") + "</tbody></table></div>";
const legendOf = series => series.length > 1 ? '<p class="legend">' + series.map(([n, c]) => '<span><i class="' + c + '"></i>' + esc(n) + "</span>").join("") + "</p>" : "";
// A panel: its label row, GA's error or "Reading..." in place, else body(res) with res the panel's replies.
const head = (label, extra = "") => '<div class="label-row"><span class="label">' + esc(label) + "</span>" + extra + "</div>";
export function panel(label, p, body, extra = "") {
  if (p && p.error) return head(label, extra) + '<p class="status bad">Google Analytics said: ' + esc(p.error) + "</p>";
  if (!p || !p.res) return head(label, extra) + '<p class="muted">Reading...</p>';
  return head(label, extra) + body(p.res);
}
// Chapters I-XII always (zeros where GA has nothing), each with the metrics of its row in res (first dimension the chapter).
export const CHAPTERS = 12;
export const chapterGrid = (res, k = 1) => { const m = byFirst(res); return Array.from({ length: CHAPTERS }, (_, i) => ({ chapter: i + 1, values: (m.get(String(i + 1)) || []).concat(Array(k).fill(0)).slice(0, k) })); };

// --- Global: users by site section ---------------------------------------------------------------
// res: the four sections then the unfiltered count: a donut in SECTIONS' order and colours, GA's own total in the centre.
export function pagesSection(p, m) {
  const d = metricOf(m);
  return panel("PAGES", p, res => donutBody(SECTIONS.map(([l], i) => ({ label: l, value: gaTotal(res[i]) })), d.unit, d.label + " by section", res[4],
    "Game is /, Handbook the /learn/ pages, Desk the teacher's pages (GA does not run there), Other the rest. The centre is GA's own count over every page; " +
      (isViews(d) ? "each page view sits in one section." : "a person can visit both the game and the handbook, so the slices may add up to more."),
    "pages", "Section", d.label, true));
}

// --- Game ---------------------------------------------------------------------------------------
export const GAME_FEATURES = { schema_enlarge: "Schema enlarged", suspects_open: "Suspects opened", history_reuse: "History query reused",
  grammar_link: "Grammar link followed", film_play: "Film played", film_end: "Film watched to the end", landing_about: "Landing about opened", theme_toggle: "Day/Night toggled" };
export const HANDBOOK_FEATURES = { schema_enlarge: "Schema enlarged", history_reuse: "History query reused", grammar_link: "Grammar link followed",
  howto_open: "How to use opened", solution_open: "Solution opened", try_it: "Try it link followed", theme_toggle: "Day/Night toggled", ad_house_click: "House ad clicked" };
export const MODES = { learn: "Learn", compete: "Compete" };
export const KINDS = { error: "SQLite error", refused: "Refused by the grammar check" };
export const LEVELS = { "warm-up": "Warm-up", practice: "Practice", challenge: "Challenge" };
export const OUTCOMES = { ok: "Ran", error: "SQLite error", refused: "Refused by the grammar check" };
const ev = (days, dims, metrics, filters) => ({ days, dimensions: dims, metrics, filters });
// Each panel: its ?report= requests for a period and the page's Count; the page fetches them in parallel. The panels
// in COUNTED follow the Count (reloaded when it changes); the others count what their events say.
export const COUNTED = ["pages", "devices", "channels"];
export const PANELS = {
  global: {
    pages: (d, m) => sectionRequests(d, m),
  },
  game: {
    leave: d => [ev(d, ["customEvent:chapter"], ["totalUsers", "averageCustomEvent:seconds", "averageCustomEvent:queries"], { eventName: ["chapter_leave"] })],
    wrongHints: d => [ev(d, ["customEvent:chapter", "customEvent:n"], ["totalUsers"], { eventName: ["answer_wrong"] }),
      ev(d, ["customEvent:chapter"], ["totalUsers", "eventCount"], { eventName: ["hint_open"] })],
    fails: d => [ev(d, ["customEvent:rule"], ["eventCount", "totalUsers"], { eventName: ["query_fail"], pagePath: GAME_PATHS }),
      ev(d, ["customEvent:rule", "customEvent:kind", "customEvent:chapter"], ["eventCount", "totalUsers"], { eventName: ["query_fail"], pagePath: GAME_PATHS }),
      ev(d, ["customEvent:kind"], ["eventCount"], { eventName: ["query_fail"], pagePath: GAME_PATHS })],
    modes: d => [ev(d, ["customEvent:mode"], ["totalUsers"], { eventName: ["chapter_open"] }), ev(d, ["customEvent:mode"], ["totalUsers"], { eventName: ["landing_begin"] }),
      ev(d, [], ["activeUsers"], { pagePath: GAME_PATHS })],
    features: d => [ev(d, ["customEvent:feature"], ["totalUsers", "eventCount"], { eventName: ["feature_use"], pagePath: GAME_PATHS })],
  },
  handbook: {
    pages: (d, m) => [scoped(countRequest(d, ["pageTitle"], m), LEARN)],
    // as on Global, on the /learn/ pages: devices, channels (the countries load as on Global, scoped)
    devices: (d, m) => [scoped(donutRequest(d, "devices", m), LEARN)],
    channels: (d, m) => [scoped(donutRequest(d, "channels", m), LEARN)],
    exercises: d => [ev(d, ["customEvent:exercise"], ["totalUsers"], { eventName: ["exercise_run"] }),
      ev(d, ["customEvent:exercise", "customEvent:outcome"], ["totalUsers"], { eventName: ["exercise_run"] }),
      ev(d, ["customEvent:exercise"], ["totalUsers", "averageCustomEvent:runs"], { eventName: ["exercise_solve"] })],
    choices: d => [ev(d, ["customEvent:level"], ["totalUsers", "eventCount"], { eventName: ["exercise_level"] }),
      ev(d, ["customEvent:outcome"], ["eventCount"], { eventName: ["exercise_run"] })],
    fails: d => [ev(d, ["customEvent:rule"], ["eventCount", "totalUsers"], { eventName: ["query_fail"], pagePath: LEARN }),
      ev(d, ["customEvent:rule", "customEvent:kind", "customEvent:exercise"], ["eventCount", "totalUsers"], { eventName: ["query_fail"], pagePath: LEARN })],
    features: d => [ev(d, ["customEvent:feature"], ["totalUsers", "eventCount"], { eventName: ["feature_use"], pagePath: LEARN })],
    tryIt: d => [ev(d, ["customEvent:exercise"], ["totalUsers", "eventCount"], { eventName: ["feature_use"], "customEvent:feature": ["try_it"] })],
  },
};

// One value per chapter as a line with dots on the I-XII grid (no dot where val is null), a small chart under the
// bars it explains; fmt formats the ticks, tip(c) the hover rows.
export function chapterLineSvg(f, val, w, title, tip) {
  const H = 130, { pw, gw } = cols(f, w), ph = H - CT - CB, vs = f.map(val).filter(v => v !== null);
  const tk = ticks(Math.max(1, ...vs), 3), top = tk.at(-1), y = v => r1(CT + ph - (v * ph) / top);
  return '<svg class="chart avg-chart" width="' + w + '" height="' + H + '" viewBox="0 0 ' + w + " " + H + '" role="img" aria-label="' + esc(title) + ' per chapter">' +
    yAxis(tk, y, CL, CL + pw, compact, title) + xLabels(f, gw, H) +
    f.map((c, i) => '<g class="hit"' + tipAttrs("Chapter " + roman(c.chapter), tip(c)) + '><rect x="' + r1(CL + i * gw) + '" y="' + CT + '" width="' + r1(gw) + '" height="' + ph + '"/></g>').join("") +
    '<line class="axis" x1="' + CL + '" x2="' + (CL + pw) + '" y1="' + (CT + ph) + '" y2="' + (CT + ph) + '"/>' + pctLine(f, val, gw, y, "avg") + "</svg>";
}
// res[0]: [chapter] totalUsers, avg seconds, avg queries of chapter_leave: the users who left as bars, then GA's two
// averages per leave event as small aligned lines (no dot for a chapter nobody left: an average of nothing is no 0).
export function leaveHtml(res, w) {
  const g = chapterGrid(res[0], 3), has = c => c.values[0] > 0;
  const tip = c => [[c.values[0], "users who left", "c1"], [has(c) ? avg(c.values[1]) + " s" : "-", "avg seconds"], [has(c) ? avg(c.values[2]) : "-", "avg queries"]];
  const line = (label, j, title) => '<div class="label sub">' + label + "</div>" + chapterLineSvg(g, c => (has(c) ? r1(c.values[j]) : null), w, title, tip);
  return chapterBarsSvg(g.map(c => ({ chapter: c.chapter, values: [c.values[0]], tip: tip(c).slice(1) })), [["users who left", "c1"]], w, "Users") +
    line("AVERAGE TIME BEFORE LEAVING", 1, "Avg seconds") + line("AVERAGE QUERIES BEFORE LEAVING", 2, "Avg queries") +
    '<p class="muted">Users who left a chapter they had not solved, and GA&#39;s average per leave event of the seconds spent and the queries run in it (an average, not a median).</p>' +
    raw("chapter-leave", tableHtml(["Chapter", "Users who left", "Avg seconds (per leave)", "Avg queries (per leave)"], g.map(c => [roman(c.chapter), c.values[0], has(c) ? avg(c.values[1]) : "-", has(c) ? avg(c.values[2]) : "-"])));
}
// res: [by rule, by rule x kind x where, by kind (game only)]: the kind as a donut of failures, bars per rule from
// GA's own [rule] rows; the split as raw data. An empty rule is a plain SQL error (no Grammar section to link).
const ruleText = r => (r == null || r === "" ? "SQL error" : String(r));
export function failsHtml(res, w, where = "Chapter", name = "query-failures") {
  const rows = ((res[0] && res[0].rows) || []).map(([r, e, u]) => ({ label: ruleText(r), values: [Number(e) || 0], tip: [[Number(u) || 0, "users"]] }));
  const split = ((res[1] && res[1].rows) || []).map(([r, k, c, e, u]) => [ruleText(r), gaText(k), where === "Chapter" && ROMAN[Number(c)] ? roman(Number(c)) : gaText(c), Number(e) || 0, Number(u) || 0]);
  return (res.length > 2 ? '<div class="label sub">BY KIND</div>' + donutBody(fixedItems(res[2], KINDS), "failures", "Query failures by kind", res[2], "", name + "-kind", "Kind", "Failures", true) +
      '<div class="label sub">BY GRAMMAR RULE</div>' : "") +
    hbarSvg(rows, [["failures", "c6"]], w, compact, "Query failures by grammar rule") +
    '<p class="muted">Failed or refused runs, the first 3 per ' + (where === "Chapter" ? "chapter" : "exercise") + " per page load; the rule is the Grammar section a refusal links; SQL error is a plain SQLite error, with no rule.</p>" +
    raw(name, tableHtml(["Rule", "Kind", where, "Failures", "Users"], split));
}
// res: [answer_wrong by chapter x n, hint_open by chapter]: users with a 1st and a 3rd wrong answer and users who
// opened the hint, side by side per chapter on the funnel's grid.
export function wrongHintsHtml(res, w) {
  const by = new Map();
  for (const [c, n, u] of (res[0] && res[0].rows) || []) by.set(c + "|" + n, Number(u) || 0);
  const hints = chapterGrid(res[1], 2);
  const g = hints.map((h, i) => ({ chapter: i + 1, values: [by.get(i + 1 + "|1") || 0, by.get(i + 1 + "|3") || 0, h.values[0]], tip: [[h.values[1], "hint opens"]] }));
  const series = [["1st wrong answer", "c1"], ["3rd wrong answer", "c2"], ["opened the hint", "c4"]];
  return legendOf(series) + chapterBarsSvg(g, series, w, "Users") +
    raw("wrong-answers-hints", tableHtml(["Chapter", "Users with a 1st wrong answer", "Users with a 3rd", "Users who opened the hint", "Hint opens"],
      g.map(c => [roman(c.chapter), ...c.values, c.tip[0][0]])));
}
// Every known feature (zeros included) in its list's order, then any other GA reports.
export function featuresHtml(res, w, names, name = "feature-use") {
  const m = byFirst(res[0]), keys = [...Object.keys(names), ...[...m.keys()].filter(k => !(k in names))];
  const rows = keys.map(k => ({ key: k, label: names[k] || gaText(k), values: [(m.get(k) || [0])[0]], ev: (m.get(k) || [0, 0])[1] }))
    .sort((a, b) => b.values[0] - a.values[0] || b.ev - a.ev); // most users first; ties keep the names' order (stable sort)
  return hbarSvg(rows.map(r => ({ ...r, tip: [[r.ev, "uses"]] })), [["users", "c3"]], w, compact, "Feature use") +
    raw(name, tableHtml(["Feature", "Parameter", "Users", "Uses"], rows.map(r => [r.label, r.key, r.values[0], r.ev])));
}
// res: [chapter_open by mode, landing_begin by mode, activeUsers on the game page]: two donuts, GA's totals in the centre.
export function modesHtml(res) {
  const begun = gaTotal(res[1]), seen = gaTotal(res[2]);
  return '<div class="donuts"><div>' + head("PLAYERS BY MODE") +
    donutBody(fixedItems(res[0], MODES), "players", "Players who opened a chapter by mode", res[0], "Users who opened a chapter, learn or compete: a person who played both counts in both.", "players-by-mode", "Mode", "Players", true) +
    "</div><div>" + head("BEGIN PRESSES") +
    donutBody(fixedItems(res[1], MODES), "users", "Users who pressed Begin by mode", res[1],
      "Users who pressed Investigate (learn) or Join (compete) on the landing card: " + begun + " of the " + seen + " visitors on the game page (" + pct(begun, seen) + ").", "begin-presses", "Mode", "Users who pressed Begin", true) +
    "</div></div>";
}
export function gameHtml(s, w, P = {}, bd, m) {
  const ch = s ? s.chapters || [] : null, reading = '<p class="muted">Reading...</p>';
  return usersSection(null, w, bd, m, VIEW_BREAKDOWNS.game) +
    '<div class="label">CHAPTER FUNNEL</div>' + (ch ? funnelHtml(ch, w) : reading) +
    '<div class="label">SOLVE RATE</div>' + (ch ? solveRateHtml(ch, w) : reading) +
    panel("LEFT AN UNSOLVED CHAPTER", P.leave, res => leaveHtml(res, w)) +
    panel("WRONG ANSWERS AND HINTS", P.wrongHints, res => wrongHintsHtml(res, w)) +
    panel("QUERY FAILURES", P.fails, res => failsHtml(res, w)) +
    (P.modes && P.modes.res ? modesHtml(P.modes.res) : panel("PLAYERS BY MODE", P.modes, () => "")) +
    panel("FEATURE USE", P.features, res => featuresHtml(res, w, GAME_FEATURES));
}

// --- Handbook -----------------------------------------------------------------------------------
// The twenty exercises of learn/exercises.html in its order, slug -> its numbered title (a test checks the page).
export const EXERCISES = [["the-cheap-shelf", "1. The cheap shelf"], ["early-customers", "2. Early customers"], ["every-croissant", "3. Every croissant"],
  ["untidy-emails", "4. Untidy emails"], ["the-counter-by-category", "5. The counter by category"], ["orders-by-town", "6. Orders by town"],
  ["takings-per-day", "7. Takings per day"], ["the-price-rise", "8. The price rise"], ["busy-hours", "9. Busy hours"], ["referred-from-afar", "10. Referred from afar"],
  ["the-staff-room", "11. The staff room"], ["morning-people", "12. Morning people"], ["above-their-category", "13. Above their category"],
  ["not-on-the-weekend-menu", "14. Not on the weekend menu"], ["no-bread-thank-you", "15. No bread, thank you"], ["money-back", "16. Money back"],
  ["best-seller-of-each-category", "17. Best seller of each category"], ["back-again", "18. Back again"], ["shutters-down", "19. Shutters down"], ["word-of-mouth", "20. Word of mouth"]];
const exTitle = new Map(EXERCISES);
// Every exercise in order (zeros included), then any slug GA reports that the list lacks.
const exRows = (...maps) => [...EXERCISES.map(e => e[0]), ...new Set(maps.flatMap(m => [...m.keys()]).filter(k => !exTitle.has(k)))];
// res: [ran by exercise, ran by exercise x outcome, solved by exercise with avg runs].
export function exercisesHtml(res, w) {
  const ran = byFirst(res[0]), solved = byFirst(res[2]), out = new Map();
  for (const [e, o, u] of (res[1] && res[1].rows) || []) out.set(e + "|" + o, Number(u) || 0);
  const rows = exRows(ran, solved).map(k => {
    const r = (ran.get(k) || [0])[0], [s, runs] = solved.get(k) || [0, 0];
    return { key: k, label: exTitle.get(k) || gaText(k), values: [r, s], runs, tip: [[pct(s, r), "solve rate"], [s ? avg(runs) : "-", "avg runs to solve"]] };
  });
  const series = [["ran a query", "c1"], ["solved", "c3"]];
  return legendOf(series) + hbarSvg(rows, series, w, compact, "Exercises: ran and solved") +
    '<p class="muted">Users who ran a query on the exercise and who solved it; the solve rate is solved over ran, the runs to solve GA&#39;s average per solve event.</p>' +
    raw("exercises", tableHtml(["Exercise", "Ran", "Solved", "Solve rate", "Avg runs to solve", "Ran: ok", "Ran: error", "Ran: refused"],
      rows.map(r => [r.label, r.values[0], r.values[1], pct(r.values[1], r.values[0]), r.values[1] ? avg(r.runs) : "-", ...["ok", "error", "refused"].map(o => out.get(r.key + "|" + o) || 0)])));
}
// The handbook's pages by title (top 5 + Other, its suffix dropped), the page's Count, GA's total in the centre.
export function handbookPagesHtml(res, m) {
  const d = metricOf(m), items = ((res && res.rows) || []).map(([t, v]) => ({ label: pageName(t), value: Number(v) || 0 }));
  return donutBody(items, d.unit, d.label + " by handbook page", res, d.note + " on the /learn/ pages: " + (isViews(d) ? "each view is of one page." : "a person who read two pages counts in both slices."), "handbook-pages", "Page", d.label);
}
// res: [exercise_level by level (users, presses), exercise_run by outcome (first runs)]: two donuts.
export function choicesHtml(res) {
  const lv = fixedItems(res[0], LEVELS), presses = fixedItems(res[0], LEVELS, 2);
  return '<div class="donuts"><div>' + head("LEVEL CHOICE") +
    donutBody(lv, "users", "Users by level button", res[0], "Users who pressed a level button (" + presses.map(p => p.value + " " + p.label).join(", ") + " presses): a person who pressed two counts in both.", "level-choice", "Level", "Users", true) +
    "</div><div>" + head("RUN OUTCOME") +
    donutBody(fixedItems(res[1], OUTCOMES), "runs", "First runs by outcome", res[1], "The first run of each exercise per page load: it ran, SQLite failed, or the grammar check refused it.", "run-outcome", "Outcome", "First runs", true) +
    "</div></div>";
}
export function tryItHtml(res, w) {
  const m = byFirst(res[0]), rows = exRows(m).map(k => ({ label: exTitle.get(k) || gaText(k), values: [(m.get(k) || [0])[0]], ev: (m.get(k) || [0, 0])[1] }));
  return hbarSvg(rows.map(r => ({ ...r, tip: [[r.ev, "clicks"]] })), [["users", "c5"]], w, compact, "Try it links per exercise") +
    raw("try-it", tableHtml(["Exercise", "Users", "Clicks"], rows.map(r => [r.label, r.values[0], r.ev])));
}
// Global's layout on the /learn/ pages: users per day, the countries map, then PAGES, devices and channels as three
// donuts on one row, all following the Count. world: the map outline; top: the countries as countriesSection takes them.
const first = p => p && { res: p.res && p.res[0], error: p.error };
export function handbookHtml(w, P = {}, bd, m, world = null, top = {}) {
  return usersSection(null, w, bd, m, VIEW_BREAKDOWNS.handbook) +
    countriesSection(world, top, m) +
    '<div class="donuts three"><div>' + panel("PAGES", P.pages, res => handbookPagesHtml(res[0], m)) + "</div>" +
    Object.keys(DONUTS).map(k => "<div>" + donutSection(k, first(P[k]), m) + "</div>").join("") + "</div>" +
    panel("EXERCISES", P.exercises, res => exercisesHtml(res, w)) +
    (P.choices && P.choices.res ? choicesHtml(P.choices.res) : panel("LEVEL CHOICE", P.choices, () => "")) +
    panel("QUERY FAILURES BY RULE", P.fails, res => failsHtml(res, w, "Exercise", "exercise-failures")) +
    panel("FEATURE USE", P.features, res => featuresHtml(res, w, HANDBOOK_FEATURES, "handbook-features")) +
    panel("TRY IT LINKS", P.tryIt, res => tryItHtml(res, w));
}

// --- page wiring (browser only) ----------------------------------------------------------------
const $ = id => document.getElementById(id);
const say = (msg, bad = false) => { const s = $("status"); s.textContent = msg; s.classList.toggle("bad", bad); };

// One tooltip for every chart: a mark's data-k / data-v, written with textContent, beside the pointer (kept inside
// the window). A mouse leaving the box hides it; a touch tap shows it until the next tap elsewhere.
function wireTips(box) {
  const tip = document.createElement("div");
  tip.className = "chart-tip"; tip.hidden = true; tip.setAttribute("role", "tooltip");
  document.body.append(tip);
  let cur = null;
  const hide = () => { tip.hidden = true; cur = null; };
  const show = e => {
    const m = e.target.closest && e.target.closest("[data-k]");
    if (!m || !box.contains(m)) return hide();
    if (m !== cur) {
      cur = m;
      const head = document.createElement("div");
      head.className = "tip-k"; head.textContent = m.dataset.k;
      tip.replaceChildren(head, ...m.dataset.v.split("\n").map(line => {
        const [v, label, key] = line.split("\t"), row = document.createElement("div"), b = document.createElement("b");
        if (key) { const i = document.createElement("i"); i.className = "key " + key; row.append(i); }
        b.textContent = v; row.append(b, label ? " " + label : "");
        return row;
      }));
      tip.hidden = false;
    }
    const pad = 12, tw = tip.offsetWidth, th = tip.offsetHeight;
    let x = e.clientX + pad, y = e.clientY + pad;
    if (x + tw > innerWidth - 4) x = Math.max(4, e.clientX - pad - tw);
    if (y + th > innerHeight - 4) y = Math.max(4, e.clientY - pad - th);
    tip.style.left = x + "px"; tip.style.top = y + "px";
  };
  box.addEventListener("pointermove", show);
  box.addEventListener("pointerleave", e => { if (e.pointerType !== "touch") hide(); });
  document.addEventListener("pointerdown", e => (box.contains(e.target) ? show(e) : hide()));
  addEventListener("scroll", hide, { passive: true });
}

async function main() {
  let { board, stored } = deskBoard();
  try { new URL(board); } catch { board = ""; }
  deskLinks(board, stored);
  if (!board) { $("nob").hidden = false; return; }
  const key = await deskPassphrase($("passgate"));
  if (!key) { say("The desk is locked: reload the page to try again.", true); return; }
  $("monitor").hidden = false;
  wireTips($("stats")); wireCsv($("stats"));
  let gen = 0, last = null, wide = 0, world = null, days = DAYS[0];
  // The breakdown (remembered per browser) and the countries' N; each extra report checks on return that it still
  // answers the current choice, so a late reply for an older one is dropped.
  // The view (monitor.html Global, monitor-game.html, monitor-handbook.html) and its panels' replies; the Count and
  // the breakdown are remembered per view (Global keeps the original keys).
  const view = document.body.dataset.view in PANELS ? document.body.dataset.view : "global", P = {}, scope = SCOPES[view];
  const sfx = view === "global" ? "" : "." + view, BD_KEY = "ritz.monitor.breakdown" + sfx, COUNT_KEY = "ritz.monitor.count" + sfx;
  const bd = { dim: "", total: null, res: null, error: null }, top = { n: 10, res: null, sub: null, error: null };
  const cmp = { dim: "sessionDefaultChannelGroup", res: null, error: null };
  try { const d = localStorage.getItem(BD_KEY) || ""; if (VIEW_BREAKDOWNS[view].includes(d)) bd.dim = d; } catch {}
  // The page's Count (beside the period buttons), remembered per browser; it drives users per day, the countries and the donuts.
  let m = "visitors";
  try { const c = localStorage.getItem(COUNT_KEY); if (VIEW_COUNTS[view].includes(c)) m = c; } catch {}
  $("count").innerHTML = optionsHtml(VIEW_COUNTS[view].map(v => [v, metricOf(v).label]), m);
  const dn = {};
  for (const k in DONUTS) dn[k] = { res: null, error: null };
  const draw = () => {
    wide = $("stats").clientWidth;
    if (!last && view === "global") return;
    const focus = document.activeElement && document.activeElement.id, w = Math.max(280, wide);
    $("stats").innerHTML = view === "game" ? gameHtml(last, w, P, bd, m) : view === "handbook" ? handbookHtml(w, P, bd, m, world, top)
      : statsHtml(last, w, world, { m, bd, cmp, top, dn, pages: P.pages });
    if (focus && $(focus)) $(focus).focus();
  };
  const report = async req => {
    const r = await (await fetch(reportUrl(board, req, key), { signal: AbortSignal.timeout(40000) })).json();
    if (!r || !r.ok) throw new Error((r && r.error) || "no numbers");
    return r;
  };
  // Users per day: the [date] total (on Global, Visitors takes ?stats' users) and the [date, dim] breakdown, in
  // parallel, both on the view's pages.
  const loadBd = async () => {
    bd.total = null; bd.res = null; bd.error = null; draw();
    const fromStats = view === "global" && m === "visitors";
    if (fromStats && !bd.dim) return;
    const want = days + "|" + m + "|" + bd.dim, still = () => want === days + "|" + m + "|" + bd.dim;
    try {
      const [t, r] = await Promise.all([fromStats ? null : report(scoped(countRequest(days, ["date"], m), scope)), bd.dim ? report(breakdownRequest(days, bd.dim, m, scope)) : null]);
      if (still()) { bd.total = t; bd.res = r; }
    } catch (e) { if (still()) bd.error = e.message; }
    if (still()) draw();
  };
  const loadCmp = async () => {
    cmp.res = null; cmp.error = null; draw();
    const want = days + "|" + cmp.dim, still = () => want === days + "|" + cmp.dim;
    try {
      const got = await Promise.all(compareRequests(days, cmp.dim).map(async ([k, q]) => [k, await report(q)]));
      if (still()) cmp.res = Object.fromEntries(got);
    } catch (e) { if (still()) cmp.error = e.message; }
    if (still()) draw();
  };
  // The countries (on the view's pages), then GA's total for the top N when the Top cuts the list; a new Top
  // (keep: the country reply stays) only refetches that total.
  const loadTop = async (keep = false) => {
    if (!keep) top.res = null;
    top.sub = null; top.error = null; draw();
    const want = days + "|" + top.n + "|" + m, still = () => want === days + "|" + top.n + "|" + m, req = countriesRequest(days, m, scope);
    try {
      if (!top.res) { const r = await report(req); if (!still()) return; top.res = r; draw(); }
      const q = topTotalRequest(req, top.res, top.n);
      if (q) { const t = await report(q); if (still()) top.sub = t; }
    } catch (e) { if (still()) top.error = e.message; }
    if (still()) draw();
  };
  const loadDn = async k => {
    const c = dn[k]; c.res = null; c.error = null; draw();
    const want = days + "|" + m, still = () => want === days + "|" + m;
    try { const r = await report(donutRequest(days, k, m)); if (still()) c.res = r; }
    catch (e) { if (still()) c.error = e.message; }
    if (still()) draw();
  };
  // One panel: its requests in parallel; a late reply for an older period (or Count, for a COUNTED panel) is dropped.
  const loadPanel = async id => {
    P[id] = { res: null, error: null }; draw();
    const now = () => days + (COUNTED.includes(id) ? "|" + m : ""), want = now(), still = () => want === now();
    try { const got = await Promise.all(PANELS[view][id](days, m).map(report)); if (still()) P[id].res = got; }
    catch (e) { if (still()) P[id].error = e.message; }
    if (still()) draw();
  };
  const loadPanels = () => { for (const id in PANELS[view]) loadPanel(id); };
  $("stats").addEventListener("change", e => {
    if (e.target.id === "stack-dim") { cmp.dim = e.target.value; loadCmp(); }
    if (e.target.id === "bd-dim") { bd.dim = e.target.value; try { localStorage.setItem(BD_KEY, bd.dim); } catch {} loadBd(); }
    if (e.target.id === "top-n") { top.n = Number(e.target.value); loadTop(true); }
  });
  $("count").addEventListener("change", e => {
    m = e.target.value;
    try { localStorage.setItem(COUNT_KEY, m); } catch {}
    for (const id of COUNTED) if (id in PANELS[view]) loadPanel(id);
    if (view !== "global") { loadBd(); if (view === "handbook") loadTop(); }
    else if (last) { loadBd(); loadTop(); for (const k in DONUTS) loadDn(k); }
  });
  // The outline, fetched with this module's ?v= like the game's data files; without it the countries keep their table.
  if (view !== "game") fetch("world.json" + new URL(import.meta.url).search).then(r => r.json()).then(j => { world = j; draw(); }).catch(() => {});
  addEventListener("resize", () => { if ($("stats").clientWidth !== wide) draw(); });
  async function load(d) {
    const mine = ++gen;
    days = d;
    document.querySelectorAll("#days button").forEach(b => b.setAttribute("aria-pressed", String(Number(b.dataset.days) === days)));
    say("Reading the last " + days + " days...");
    last = null; loadPanels();
    if (view !== "global") loadBd();
    if (view === "handbook") { loadTop(); say("The last " + days + " days, from Google Analytics (cached 10 minutes)."); return; }
    try {
      const u = new URL(board);
      u.searchParams.set("stats", days); u.searchParams.set("key", key);
      const s = await (await fetch(u, { signal: AbortSignal.timeout(40000) })).json();
      if (mine !== gen) return;
      if (!s || !s.ok) throw new Error((s && s.error) || "no numbers");
      last = s;
      if (view === "global") { loadBd(); loadCmp(); loadTop(); for (const k in DONUTS) loadDn(k); } else draw();
      say("The last " + s.days + " days, from Google Analytics (cached 10 minutes).");
    } catch (e) { if (mine === gen) say("Could not read the numbers: " + e.message, true); }
  }
  $("days").onclick = e => { const b = e.target.closest("button[data-days]"); if (b) load(Number(b.dataset.days)); };
  load(DAYS[0]);
}

if (typeof document !== "undefined") main();
