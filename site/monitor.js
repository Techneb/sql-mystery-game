// site/monitor.js -- the teacher's GA4 numbers (monitor.html): users per day, the chapter funnel with its retention, the solve rate, a map
// of countries, devices and channels, read from the Apps Script's ?stats=<days>&key=<passphrase> (apps_script.gs
// stats_), so nobody opens GA. Pure renderers are exported for test_site.mjs; the page wiring runs only in a browser.
// The board URL comes from ?board= or localStorage ritz.admin.board, as on admin.html; the passphrase stays in memory.
import { BOARD_KEY, DIMENSIONS, deskLinks, deskPassphrase, escapeHtml as esc, reportUrl } from "./shared.js";

export const DAYS = [7, 30, 90];
export const pct = (a, b) => (b ? Math.round((100 * a) / b) + "%" : "-");
const NONE = '<p class="muted">Nothing in this period.</p>';

// A table whose last column is a CSS bar scaled to the largest value.
function barTable(head, rows) {
  if (!rows.length) return NONE;
  const max = Math.max(1, ...rows.map(r => r[1]));
  return '<table class="detail stats"><thead><tr><th>' + esc(head) + "</th><th>Users</th><th></th></tr></thead><tbody>" +
    rows.map(([k, v]) => "<tr><td>" + esc(k) + '</td><td class="num">' + esc(v) + '</td><td class="bar-cell"><span class="bar" style="width:' +
      Math.round((100 * v) / max) + '%"></span></td></tr>').join("") + "</tbody></table>";
}
// Every chart keeps its numbers under it, closed.
const raw = table => '<details class="numbers"><summary>Raw data</summary>' + table + "</details>";

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
export function lineSvg(points, w = 640) {
  const H = 200, L = 40, R = 44, T = 22, B = 24, pw = Math.max(1, w - L - R), ph = H - T - B;
  const tk = ticks(Math.max(...points.map(p => p.value))), top = tk.at(-1);
  const x = i => r1(L + (points.length < 2 ? pw / 2 : (i * pw) / (points.length - 1)));
  const y = v => r1(T + ph - (v * ph) / top);
  const xy = points.map((p, i) => [x(i), y(p.value)]);
  const line = "M" + xy.map(q => q.join(",")).join("L");
  const step = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor(pw / 70))));
  const strip = r1(points.length < 2 ? pw : pw / (points.length - 1));
  const last = xy.at(-1);
  return '<svg class="chart line-chart" width="' + w + '" height="' + H + '" viewBox="0 0 ' + w + " " + H + '" role="img" aria-label="Users per day">' +
    yAxis(tk, y, L, L + pw, compact, "Users") +
    points.map((p, i) => (i % step && i !== points.length - 1) || (i !== points.length - 1 && points.length - 1 - i < step / 2) ? "" :
      '<text class="tick" x="' + x(i) + '" y="' + (H - 6) + '" text-anchor="middle">' + esc(p.label.slice(5)) + "</text>").join("") +
    '<path class="area" d="' + line + "L" + last[0] + "," + (T + ph) + "L" + xy[0][0] + "," + (T + ph) + 'Z"/><path class="line" d="' + line + '"/>' +
    '<circle class="dot end" cx="' + last[0] + '" cy="' + last[1] + '" r="4"/><text class="val" x="' + (last[0] + 8) + '" y="' + (last[1] + 4) + '">' + esc(compact(points.at(-1).value)) + "</text>" +
    points.map((p, i) => '<g class="hit"' + tipAttrs(p.label, [[compact(p.value), "users"]]) + '><rect x="' + r1(xy[i][0] - strip / 2) + '" y="' + T + '" width="' + strip + '" height="' + ph + '"/><line class="cross" x1="' + xy[i][0] + '" x2="' + xy[i][0] + '" y1="' + T + '" y2="' + (T + ph) +
      '"/><circle class="dot" cx="' + xy[i][0] + '" cy="' + xy[i][1] + '" r="4"/></g>').join("") + "</svg>";
}
// GA dates come as YYYYMMDD. The line, then the same numbers as raw data.
export function usersHtml(users, w) {
  const pts = [...users].sort((a, b) => (a.date < b.date ? -1 : 1)).map(u => ({ label: isoDate(u.date), value: Number(u.users) || 0 }));
  if (!pts.length) return NONE;
  return lineSvg(pts, w) + raw(barTable("Day", pts.map(p => [p.label, p.value])));
}

// --- users per day broken down by one dimension (the select by its label): ?report= with dimensions [date, X] and
// activeUsers, one line per value for the top TOP values by users summed over the days (a user active on two days
// counts twice: a ranking, not a head count), in --c1..--c5, over the page's own users-per-day total as a neutral line.
export const TOP = 5;
// The dimensions that make sense per day (names from shared.js DIMENSIONS), and the plural the note uses.
export const BREAKDOWNS = { country: "countries", deviceCategory: "devices", sessionDefaultChannelGroup: "channels", sessionSource: "sources",
  operatingSystem: "operating systems", browser: "browsers", language: "languages", newVsReturning: "values", "customEvent:mode": "modes" };
export const breakdownRequest = (days, dim) => ({ days, dimensions: ["date", dim], metrics: ["activeUsers"] });
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
  return { dates: ds, count: by.size, series: top.map(([label, m], j) => ({ label: String(label), values: ds.map(d => m.get(d) || 0), cls: "c" + (j + 1) })) };
}
// One day's tooltip rows, the largest first: [value, label, key class].
export const dayTip = (series, i) => series.map(s => [s.values[i], s.label, s.cls]).sort((a, b) => b[0] - a[0]).map(([v, l, c]) => [compact(v), l, c]);
// Several lines on one axis, lineSvg's frame; the total (cls "total") drawn first, under the others. Each day's hover
// strip shows the crosshair and a dot per series.
export function multiLineSvg(labels, series, w = 640) {
  const H = 200, L = 40, R = 16, T = 22, B = 24, pw = Math.max(1, w - L - R), ph = H - T - B, n = labels.length;
  const tk = ticks(Math.max(1, ...series.flatMap(s => s.values))), top = tk.at(-1);
  const x = i => r1(L + (n < 2 ? pw / 2 : (i * pw) / (n - 1))), y = v => r1(T + ph - (v * ph) / top);
  const step = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(pw / 70)))), strip = r1(n < 2 ? pw : pw / (n - 1));
  const col = s => "var(--" + (s.cls === "total" ? "ink" : s.cls) + ")";
  return '<svg class="chart line-chart multi-chart" width="' + w + '" height="' + H + '" viewBox="0 0 ' + w + " " + H + '" role="img" aria-label="Users per day by value">' +
    yAxis(tk, y, L, L + pw, compact, "Users") +
    labels.map((l, i) => (i % step && i !== n - 1) || (i !== n - 1 && n - 1 - i < step / 2) ? "" :
      '<text class="tick" x="' + x(i) + '" y="' + (H - 6) + '" text-anchor="middle">' + esc(l.slice(5)) + "</text>").join("") +
    series.map(s => '<path class="sl ' + esc(s.cls) + '" style="stroke:' + col(s) + '" d="M' + s.values.map((v, i) => x(i) + "," + y(v)).join("L") + '"/>').join("") +
    labels.map((l, i) => '<g class="hit"' + tipAttrs(l, dayTip(series, i)) + '><rect x="' + r1(x(i) - strip / 2) + '" y="' + T + '" width="' + strip + '" height="' + ph +
      '"/><line class="cross" x1="' + x(i) + '" x2="' + x(i) + '" y1="' + T + '" y2="' + (T + ph) + '"/>' +
      series.map(s => '<circle class="dot" style="fill:' + col(s) + '" cx="' + x(i) + '" cy="' + y(s.values[i]) + '" r="4"/>').join("") + "</g>").join("") + "</svg>";
}
// The breakdown: legend, lines, the "Top 5 of N" note, and the date x series table as raw data.
export function breakdownHtml(res, users, dim, w) {
  const total = [...users].sort((a, b) => (a.date < b.date ? -1 : 1));
  const p = pivotSeries(res.rows || [], total.map(u => u.date));
  if (!p.series.length) return NONE;
  const tot = new Map(total.map(u => [String(u.date), Number(u.users) || 0]));
  const all = { label: "All users", values: p.dates.map(d => tot.get(d) || 0), cls: "total" }, series = [all, ...p.series];
  const labels = p.dates.map(isoDate), name = BREAKDOWNS[dim] || "values";
  return '<p class="legend">' + series.map(s => '<span><i class="' + s.cls + ' key-line"></i>' + esc(s.label) + "</span>").join("") + "</p>" +
    multiLineSvg(labels, series, w) +
    (p.count > p.series.length ? '<p class="muted">Top ' + p.series.length + " of " + p.count + " " + esc(name) + " (by users summed over the days).</p>" : "") +
    raw('<div class="wide"><table class="detail stats"><thead><tr><th>Day</th>' + series.map(s => '<th class="num">' + esc(s.label) + "</th>").join("") + "</tr></thead><tbody>" +
      labels.map((l, i) => "<tr><td>" + esc(l) + "</td>" + series.map(s => '<td class="num">' + s.values[i] + "</td>").join("") + "</tr>").join("") + "</tbody></table></div>");
}
const optionsHtml = (pairs, cur) => pairs.map(([v, l]) => '<option value="' + esc(v) + '"' + (String(v) === String(cur) ? " selected" : "") + ">" + esc(l) + "</option>").join("");
const breakdownSelect = cur => '<label class="pick">Breakdown <select id="bd-dim">' +
  optionsHtml([["", "None"], ...Object.keys(BREAKDOWNS).map(k => [k, DIMENSIONS[k] || k])], cur) + "</select></label>";
// opts.bd: {dim, res, error} (res null while reading); none or no dim: the single line.
export function usersSection(s, w, bd = {}) {
  const head = '<div class="label-row"><span class="label">USERS PER DAY</span>' + breakdownSelect(bd.dim || "") + "</div>";
  if (!bd.dim) return head + usersHtml(s.users || [], w);
  if (bd.error) return head + '<p class="status bad">Google Analytics said: ' + esc(bd.error) + "</p>";
  if (!bd.res) return head + '<p class="muted">Reading the breakdown...</p>';
  return head + breakdownHtml(bd.res, s.users || [], bd.dim, w);
}

// The countries' N: 10 comes with ?stats; any other is a ?report= on country (GA orders it by users, 0 = all).
export const TOP_COUNTRIES = [5, 10, 20, 50, 0];
export const countriesRequest = days => ({ days, dimensions: ["country"], metrics: ["activeUsers"] });
export const countriesFrom = (res, n) => (res.rows || []).slice(0, n || Infinity).map(([country, users]) => ({ country, users }));
const topSelect = cur => '<label class="pick">Top <select id="top-n">' + optionsHtml(TOP_COUNTRIES.map(n => [n, n || "All"]), cur) + "</select></label>";
// opts.top: {n, rows, error}; n 10 (or none) uses the ?stats list.
export function countriesSection(s, world, top = {}) {
  const n = top.n ?? 10, head = '<div class="label-row"><span class="label">COUNTRIES (' + (n ? "TOP " + n : "ALL") + ")</span>" + topSelect(n) + "</div>";
  if (n === 10) return head + mapHtml(s.countries || [], world);
  if (top.error) return head + '<p class="status bad">Google Analytics said: ' + esc(top.error) + "</p>";
  if (!top.rows) return head + '<p class="muted">Reading the countries...</p>';
  return head + mapHtml(top.rows, world);
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
  const f = funnel(rows);
  if (!f.length) return '<p class="muted">No chapter events in this period.</p>';
  return solveRateSvg(f, w) +
    raw('<table class="detail stats"><thead><tr><th>Chapter</th><th>Opened</th><th>Solved</th><th>Solve rate</th></tr></thead><tbody>' +
      f.map(c => "<tr><td>" + roman(c.chapter) + '</td><td class="num">' + c.opened + '</td><td class="num">' + c.solved + '</td><td class="num">' + pct(c.solved, c.opened) + "</td></tr>").join("") + "</tbody></table>");
}
const legend = names => '<p class="legend">' + names.map((name, j) => '<span><i class="c' + (j + 1) + '"></i>' + esc(name) + "</span>").join("") +
  '<span><i class="c6 key-line"></i>Retention (right axis)</span></p>';
export function funnelHtml(rows, w) {
  const f = funnel(rows);
  const finished = rows.filter(r => r.event === "game_finish").reduce((s, r) => s + (Number(r.users) || 0), 0);
  if (!f.length) return '<p class="muted">No chapter events in this period.</p>';
  const noQueries = f.every(c => !c.q1 && !c.q5 && !c.q20), ret = retention(f);
  return legend(STAGES.map(s => s[1])) + funnelSvg(f, w) +
    (noQueries ? '<p class="muted">Ran 1 / 5 / 20 queries: new event, GA shows it within about a day.</p>' : "") +
    raw('<table class="detail stats"><thead><tr><th>Chapter</th><th>Opened</th><th>Ran 1 query</th><th>Ran 5</th><th>Ran 20</th><th>Solved</th><th>Retention</th><th>Solve rate</th></tr></thead><tbody>' +
    f.map(c => "<tr><td>" + roman(c.chapter) + "</td>" + STAGES.map(([k]) => '<td class="num">' + c[k] + "</td>").join("") +
      '<td class="num">' + pctOf(ret(c)) + '</td><td class="num">' + pct(c.solved, c.opened) + "</td></tr>").join("") + "</tbody></table>") +
    '<p class="muted">Finished a part: ' + finished + " users.</p>";
}

// --- donuts: the first five slices by value, the rest folded into Other (never a seventh colour).
export function fold(items, n = 5) {
  const s = [...items].filter(i => i.value > 0).sort((a, b) => b.value - a.value);
  if (s.length <= n + 1) return s;
  return s.slice(0, n).concat([{ label: "Other", value: s.slice(n).reduce((t, i) => t + i.value, 0) }]);
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
export function donutHtml(items, what, aria) {
  const s = fold(items);
  if (!s.length) return NONE;
  const total = s.reduce((t, i) => t + i.value, 0), D = 180, c = D / 2;
  const svg = '<svg class="chart donut" width="' + D + '" height="' + D + '" viewBox="0 0 ' + D + " " + D + '" role="img" aria-label="' + esc(aria) + '">' +
    arcs(s.map(i => i.value)).map(([a0, a1], j) => '<path class="slice c' + (j + 1) + '"' + tipAttrs(s[j].label, [[s[j].value + " " + what, pct(s[j].value, total)]]) +
      ' d="' + arcPath(c, c, 52, 86, a0, a1) + '"/>').join("") +
    '<text class="val" x="' + c + '" y="' + (c + 2) + '" text-anchor="middle">' + compact(total) + '</text><text class="tick" x="' + c + '" y="' + (c + 18) + '" text-anchor="middle">' + esc(what) + "</text></svg>";
  return '<div class="donut-row">' + svg + '<ul class="donut-legend">' + s.map((i, j) => '<li><i class="c' + (j + 1) + '"></i><span>' + esc(i.label) +
    '</span><b class="num">' + i.value + '</b><span class="num muted">' + pct(i.value, total) + "</span></li>").join("") + "</ul></div>";
}

export function devicesHtml(rows) {
  const by = {};
  for (const r of rows) {
    const d = (by[r.device] ||= { opened: 0, solved: 0 });
    if (r.event === "chapter_open") d.opened += Number(r.users) || 0;
    if (r.event === "chapter_solve") d.solved += Number(r.users) || 0;
  }
  const list = Object.entries(by).sort((a, b) => b[1].opened - a[1].opened);
  if (!list.length) return NONE;
  return donutHtml(list.map(([d, c]) => ({ label: d, value: c.opened })), "users", "Users who opened a chapter, by device") +
    raw('<table class="detail stats"><thead><tr><th>Device</th><th>Opened a chapter</th><th>Solved one</th><th>Solve rate</th></tr></thead><tbody>' +
    list.map(([d, c]) => "<tr><td>" + esc(d) + '</td><td class="num">' + c.opened + '</td><td class="num">' + c.solved + '</td><td class="num">' +
      pct(c.solved, c.opened) + "</td></tr>").join("") + "</tbody></table>");
}
export function channelsHtml(rows) {
  const list = rows.map(c => ({ label: c.channel, value: Number(c.users) || 0 }));
  if (!list.length) return NONE;
  return donutHtml(list, "users", "Users by channel") + raw(barTable("Channel", list.map(i => [i.label, i.value])));
}

// --- map: site/world.json (Natural Earth 110m, equirectangular 84N-57S, 1000 units wide; its centroids in lon/lat
// under GA's English country names, ASCII-folded), one bubble per country, its area proportional to users.
export const MAP = { W: 1000, N: 84, S: -57 };
MAP.H = Math.round((MAP.W * (MAP.N - MAP.S)) / 360);
export const project = (lon, lat) => [r1(((lon + 180) * MAP.W) / 360), r1(((MAP.N - lat) * MAP.H) / (MAP.N - MAP.S))];
export const countryKey = s => String(s).normalize("NFD").replace(/\p{M}/gu, "").replace(/\p{Pi}|\p{Pf}/gu, "'");
export const bubbleR = (v, max, rMax = 40) => (max > 0 && v > 0 ? r1(Math.max(3, rMax * Math.sqrt(v / max))) : 0);
export function mapHtml(countries, world) {
  const list = countries.map(c => ({ label: c.country, value: Number(c.users) || 0 }));
  if (!list.length) return NONE;
  const max = Math.max(...list.map(c => c.value));
  const placed = [], off = [];
  for (const c of list) { const ll = world && world.centroids[countryKey(c.label)]; (ll && c.value > 0 ? placed : off).push({ ...c, xy: ll && project(...ll) }); }
  const svg = !world ? "" : '<svg class="chart map" viewBox="0 0 ' + MAP.W + " " + MAP.H + '" role="img" aria-label="Users by country">' +
    '<path class="land" d="' + world.land + '"/>' +
    placed.sort((a, b) => b.value - a.value).map(c => { const r = bubbleR(c.value, max); return '<g class="bubble"' + tipAttrs(c.label, [[c.value + " users", ""]]) +
      '><circle class="hitzone" cx="' + c.xy[0] + '" cy="' + c.xy[1] + '" r="' + Math.max(r, 18) + '"/><circle class="b" cx="' + c.xy[0] + '" cy="' + c.xy[1] + '" r="' + r + '"/></g>'; }).join("") + "</svg>";
  return svg + (world && off.length ? '<p class="muted">Not on the map: ' + off.map(c => esc(c.label) + " (" + c.value + ")").join(", ") + ".</p>" : "") +
    raw(barTable("Country", list.map(c => [c.label, c.value])));
}

// opts: {bd, top} as usersSection and countriesSection take them.
export function statsHtml(s, w, world, opts = {}) {
  return usersSection(s, w, opts.bd) +
    '<div class="label">CHAPTER FUNNEL</div>' + funnelHtml(s.chapters || [], w) +
    '<div class="label">SOLVE RATE</div>' + solveRateHtml(s.chapters || [], w) +
    countriesSection(s, world, opts.top) +
    '<div class="donuts"><div><div class="label">DEVICES (OPENED A CHAPTER)</div>' + devicesHtml(s.devices || []) +
    '</div><div><div class="label">CHANNELS</div>' + channelsHtml(s.channels || []) + "</div></div>";
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
  let board = new URLSearchParams(location.search).get("board") || "";
  try { board ||= localStorage.getItem(BOARD_KEY) || ""; } catch {}
  try { new URL(board); } catch { board = ""; }
  deskLinks(board);
  if (!board) { $("nob").hidden = false; return; }
  const key = await deskPassphrase($("passgate"));
  if (!key) { say("The desk is locked: reload the page to try again.", true); return; }
  $("monitor").hidden = false;
  wireTips($("stats"));
  let gen = 0, last = null, wide = 0, world = null, days = DAYS[0];
  // The breakdown (remembered per browser) and the countries' N; each extra report checks on return that it still
  // answers the current choice, so a late reply for an older one is dropped.
  const BD_KEY = "ritz.monitor.breakdown";
  const bd = { dim: "", res: null, error: null }, top = { n: 10, rows: null, error: null };
  try { const d = localStorage.getItem(BD_KEY) || ""; if (d in BREAKDOWNS) bd.dim = d; } catch {}
  const draw = () => {
    wide = $("stats").clientWidth;
    if (!last) return;
    const focus = document.activeElement && document.activeElement.id;
    $("stats").innerHTML = statsHtml(last, Math.max(280, wide), world, { bd, top });
    if (focus && $(focus)) $(focus).focus();
  };
  const report = async req => {
    const r = await (await fetch(reportUrl(board, req, key), { signal: AbortSignal.timeout(40000) })).json();
    if (!r || !r.ok) throw new Error((r && r.error) || "no numbers");
    return r;
  };
  const loadBd = async () => {
    bd.res = null; bd.error = null; draw();
    if (!bd.dim) return;
    const want = days + "|" + bd.dim, still = () => want === days + "|" + bd.dim;
    try { const r = await report(breakdownRequest(days, bd.dim)); if (still()) bd.res = r; }
    catch (e) { if (still()) bd.error = e.message; }
    if (still()) draw();
  };
  const loadTop = async () => {
    top.rows = null; top.error = null; draw();
    if (top.n === 10) return;
    const want = days + "|" + top.n, still = () => want === days + "|" + top.n;
    try { const r = await report(countriesRequest(days)); if (still()) top.rows = countriesFrom(r, top.n); }
    catch (e) { if (still()) top.error = e.message; }
    if (still()) draw();
  };
  $("stats").addEventListener("change", e => {
    if (e.target.id === "bd-dim") { bd.dim = e.target.value; try { localStorage.setItem(BD_KEY, bd.dim); } catch {} loadBd(); }
    if (e.target.id === "top-n") { top.n = Number(e.target.value); loadTop(); }
  });
  // The outline, fetched with this module's ?v= like the game's data files; without it the countries keep their table.
  fetch("world.json" + new URL(import.meta.url).search).then(r => r.json()).then(j => { world = j; draw(); }).catch(() => {});
  addEventListener("resize", () => { if ($("stats").clientWidth !== wide) draw(); });
  async function load(d) {
    const mine = ++gen;
    days = d;
    document.querySelectorAll("#days button").forEach(b => b.setAttribute("aria-pressed", String(Number(b.dataset.days) === days)));
    say("Reading the last " + days + " days...");
    try {
      const u = new URL(board);
      u.searchParams.set("stats", days); u.searchParams.set("key", key);
      const s = await (await fetch(u, { signal: AbortSignal.timeout(40000) })).json();
      if (mine !== gen) return;
      if (!s || !s.ok) throw new Error((s && s.error) || "no numbers");
      last = s; loadBd(); loadTop();
      say("The last " + s.days + " days, from Google Analytics (cached 10 minutes).");
    } catch (e) { if (mine === gen) say("Could not read the numbers: " + e.message, true); }
  }
  $("days").onclick = e => { const b = e.target.closest("button[data-days]"); if (b) load(Number(b.dataset.days)); };
  load(DAYS[0]);
}

if (typeof document !== "undefined") main();
