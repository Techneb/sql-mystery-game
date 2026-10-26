// site/monitor.js -- the teacher's GA4 numbers in three views (<body data-view>), each with a Count select and users
// per day with a Breakdown on its own pages: Global (monitor.html: the five counts compared, the site sections as a
// donut, a map of countries, devices and channels), Game (monitor-game.html: the chapter funnel with its retention,
// the solve rate, leaving, wrong answers and hints on the same I-XII grid, failures, modes, features) and Handbook
// (monitor-handbook.html: its pages as a donut, the exercises, level choice and run outcome, failures, features,
// Try it), read from the Apps Script's ?stats=<days>&key= and ?report= (apps_script.gs stats_, report_), so nobody
// opens GA. This module is the GA model (the Count metrics, the request builders, PANELS) and the views; the charts
// themselves are figures.js (Plotly figures, drawn by drawPlots below). Pure parts are exported for test_desk.mjs; the page wiring runs only in a browser.
// The board URL comes from ?board= or localStorage ritz.admin.board, as on admin.html; the passphrase stays in sessionStorage for the tab (shared.js deskPassphrase).
import { wireFeedback } from "./feedback.js";
import { DIMENSIONS, deskBoard, deskLinks, deskPassphrase, downloadText, escapeHtml as esc, gaText, reportUrl } from "./shared.js";
import { ROMAN, STAGES, barTable, chapterBarsFig, chapterLineFig, compact, donutHtml, fold, funnelFig, groupFig, hbarFig, legend, legendOf,
  lineFig, mapHtml, multiLineFig, pct, pctOf, plotHtml, r1, raw, retention, roman, solveRateFig, tableCsv, tableHtml, themed } from "./figures.js";
const hbar = (...a) => plotHtml(hbarFig(...a));

export const DAYS = [7, 30, 90];

const isoDate = d => String(d).replace(/^(\d{4})(\d\d)(\d\d)$/, "$1-$2-$3");
// GA dates come as YYYYMMDD. The line, then the same numbers as raw data; m picks the axis title and the unit.
export function usersHtml(users, w, m) {
  const pts = [...users].sort((a, b) => (a.date < b.date ? -1 : 1)).map(u => ({ label: isoDate(u.date), value: Number(u.users) || 0 }));
  const d = metricOf(m), avg = dailyAverage(pts.map(p => p.value));
  return plotHtml(lineFig(pts, d.label, d.unit, avgRef(avg))) + avgNote(avg, pts.length, d.unit) +
    raw("users-per-day", barTable("Day", pts.map(p => [p.label, p.value]), d.label, pts.length ? [["Average per day", avg]] : []));
}
// The mean of the daily counts over the days shown (a day without a row is a 0 in values), to one decimal; null with no
// days. A person active on several days counts on each: it is an average of daily counts, not of people.
export const dailyAverage = values => (values.length ? r1(values.reduce((a, b) => a + b, 0) / values.length) : null);
const avgRef = avg => (avg === null ? null : { value: avg, label: "avg " + compact(avg) });
const avgNote = (avg, n, unit) => (avg === null ? "" : '<p class="muted">Average per day: ' + esc(compact(avg)) + " " + esc(unit) +
  " (the mean of the daily counts over the " + n + " days shown, the dashed line; a person active on several days counts on each).</p>");
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
// The breakdown: legend, lines, the "Top 5 of N" note, and the date x series table as raw data.
export function breakdownHtml(res, users, dim, w, m) {
  const d = metricOf(m);
  const total = [...users].sort((a, b) => (a.date < b.date ? -1 : 1));
  const p = pivotSeries(res.rows || [], total.map(u => u.date));
  const tot = new Map(total.map(u => [String(u.date), Number(u.users) || 0]));
  const all = { label: "All " + d.unit, values: p.dates.map(d => tot.get(d) || 0), cls: "total" }, series = [all, ...p.series];
  const labels = p.dates.map(isoDate), name = BREAKDOWNS[dim] || "values", avg = dailyAverage(all.values);
  return '<p class="legend">' + series.map(s => '<span><i class="' + s.cls + ' key-line"></i>' + esc(s.label) + "</span>").join("") + "</p>" +
    plotHtml(multiLineFig(labels, series, d.label, avgRef(avg))) + avgNote(avg, labels.length, d.unit) +
    (p.count > p.series.length ? '<p class="muted">Top ' + p.series.length + " of " + p.count + " " + esc(name) + " (by " + esc(d.unit) + " summed over the days).</p>" : "") +
    raw("users-per-day-breakdown", '<div class="wide"><table class="detail stats"><thead><tr><th>Day</th>' + series.map(s => '<th class="num">' + esc(s.label) + "</th>").join("") + "</tr></thead><tbody>" +
      labels.map((l, i) => "<tr><td>" + esc(l) + "</td>" + series.map(s => '<td class="num">' + s.values[i] + "</td>").join("") + "</tr>").join("") + "</tbody>" +
      (labels.length ? "<tfoot><tr><td>Average per day</td>" + series.map(s => '<td class="num">' + dailyAverage(s.values) + "</td>").join("") + "</tr></tfoot>" : "") + "</table></div>");
}
const optionsHtml = (pairs, cur) => pairs.map(([v, l]) => '<option value="' + esc(v) + '"' + (String(v) === String(cur) ? " selected" : "") + ">" + esc(l) + "</option>").join("");
const breakdownSelect = (cur, keys) => '<label class="pick">Breakdown <select id="bd-dim">' +
  optionsHtml([["", "None"], ...keys.map(k => [k, DIMENSIONS[k] || k])], cur) + "</select></label>";
// p: the users panel ({res: {total, split}, error}): total the ?report= on [date] for the Count (Visitors on Global
// uses ?stats' users instead; s null: always the report), split the [date, dim] breakdown; null while reading.
// c: {m, dim} (the Count and the breakdown); keys: the view's breakdowns.
export function usersSection(s, w, p = {}, c = {}, keys = VIEW_BREAKDOWNS.global) {
  const m = c.m || "visitors", dim = c.dim || "", r = p.res || {};
  const head = '<div class="label-row"><span class="label">USERS PER DAY</span>' + breakdownSelect(dim, keys) + "</div>";
  if (p.error) return head + '<p class="status bad">Google Analytics said: ' + esc(p.error) + "</p>";
  const total = r.total ? daysFrom(r.total) : s && metricOf(m) === COUNT_METRICS.visitors ? s.users || [] : null;
  if (!total) return head + '<p class="muted">Reading the days...</p>';
  if (!dim) return head + usersHtml(total, w, m);
  if (!r.split) return head + '<p class="muted">Reading the breakdown...</p>';
  return head + breakdownHtml(r.split, total, dim, w, m);
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
// p: the countries panel ({res: {countries, top}, error}): countries the country reply (null while reading), top the
// top N's total reply (null while reading or when nothing is cut); n the Top; m the page's Count.
export function countriesSection(world, p = {}, n = 10, m = "visitors", w = 640) {
  const head = '<div class="label-row"><span class="label">COUNTRIES (' + (n ? "TOP " + n : "ALL") + ")</span>" + topSelect(n) + "</div>";
  if (p.error) return head + '<p class="status bad">Google Analytics said: ' + esc(p.error) + "</p>";
  const res = p.res && p.res.countries, sub = p.res && p.res.top;
  if (!res) return head + '<p class="muted">Reading the countries...</p>';
  const list = countriesFrom(res, n), cut = topTotalRequest({}, res, n);
  const foot = [...(cut && sub ? [["Top " + n + " (GA's total)", gaTotal(sub)]] : []), ["All countries (GA's total)", gaTotal(res)]];
  return head + '<p>' + esc(countriesTotal(res, sub, n, m)) + "</p>" + mapHtml(list, world, metricOf(m), foot, w) +
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
export function solveRateHtml(rows, w) {
  const f = funnel12(rows);
  return plotHtml(solveRateFig(f)) +
    raw("solve-rate", '<table class="detail stats"><thead><tr><th>Chapter</th><th>Opened</th><th>Solved</th><th>Solve rate</th></tr></thead><tbody>' +
      f.map(c => "<tr><td>" + roman(c.chapter) + '</td><td class="num">' + c.opened + '</td><td class="num">' + c.solved + '</td><td class="num">' + pct(c.solved, c.opened) + "</td></tr>").join("") + "</tbody></table>");
}
export function funnelHtml(rows, w) {
  const f = funnel12(rows);
  const finished = rows.filter(r => r.event === "game_finish").reduce((s, r) => s + (Number(r.users) || 0), 0);
  const ret = retention(f);
  return legend(STAGES.map(s => s[1])) + plotHtml(funnelFig(f)) +
    raw("chapter-funnel", '<table class="detail stats"><thead><tr><th>Chapter</th><th>Opened</th><th>Ran 1 query</th><th>Ran 5</th><th>Ran 20</th><th>Solved</th><th>Retention</th><th>Solve rate</th></tr></thead><tbody>' +
    f.map(c => "<tr><td>" + roman(c.chapter) + "</td>" + STAGES.map(([k]) => '<td class="num">' + c[k] + "</td>").join("") +
      '<td class="num">' + pctOf(ret(c)) + '</td><td class="num">' + pct(c.solved, c.opened) + "</td></tr>").join("") + "</tbody></table>") +
    '<p class="muted">Finished a part: ' + finished + " users.</p>";
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
// p: the donut's panel ({res: {slices}, error}), res null while reading; m the page's Count.
export function donutSection(kind, p = {}, m = "visitors") {
  const k = DONUTS[kind], d = metricOf(m), res = p.res && p.res.slices;
  const head = '<div class="label-row"><span class="label">' + k.label + "</span></div>";
  if (p.error) return head + '<p class="status bad">Google Analytics said: ' + esc(p.error) + "</p>";
  if (!res) return head + '<p class="muted">Reading the ' + kind + "...</p>";
  const list = (res.rows || []).map(([label, v]) => ({ label: gaText(label), value: Number(v) || 0 }));
  const unique = res.totals ? Number(res.totals[0]) || 0 : 0;
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
    return { m, label: metricOf(m).label, short: metricOf(m).short, values, sum, total: t ? Number(t[0]) || 0 : sum };
  });
  return { segs, bars };
}
// p: the compare panel ({res: {m: res} (null while reading), error}); stack: the Stack by dimension.
export function compareSection(p = {}, stack, w) {
  const dim = stack in STACKS ? stack : "sessionDefaultChannelGroup";
  const head = '<div class="label-row"><span class="label">COUNT METRICS COMPARED</span><label class="pick">Stack by <select id="stack-dim">' +
    optionsHtml(Object.entries(STACKS), dim) + "</select></label></div>";
  if (p.error) return head + '<p class="status bad">Google Analytics said: ' + esc(p.error) + "</p>";
  if (!p.res) return head + '<p class="muted">Reading the five counts...</p>';
  const st = stackData(p.res);
  return head + '<p class="legend">' + st.segs.map((s, j) => '<span><i class="c' + (j + 1) + '"></i>' + esc(s) + "</span>").join("") + "</p>" + plotHtml(groupFig(st)) +
    '<p class="muted">Visitors and players are people, sessions are visits, page views are pages loaded: the bars do not share a unit. The number over a group is GA&#39;s own total; a person in two segments (two devices, say) counts in both, so a group&#39;s bars can add up to more than its total.</p>' +
    raw("count-metrics-compared", '<div class="wide"><table class="detail stats"><thead><tr><th>Count</th>' + st.segs.map(s => '<th class="num">' + esc(s) + "</th>").join("") + '<th class="num">Total</th></tr></thead><tbody>' +
      st.bars.map(b => "<tr><td>" + esc(b.label) + "</td>" + b.values.map(v => '<td class="num">' + v + "</td>").join("") + '<td class="num">' + b.total + "</td></tr>").join("") + "</tbody></table></div>");
}

// The Global view (monitor.html). P: the panel states by id ({res: named replies | null, error}, see PANELS); c: the
// page's choices {m, dim, stack, top}. PAGES, devices and channels share one row.
export function statsHtml(s, w, world, P = {}, c = {}) {
  return usersSection(s, w, P.users, c) + compareSection(P.compare, c.stack, w) +
    countriesSection(world, P.countries, c.top ?? 10, c.m, w) + donutsRow(P, c.m);
}
// PAGES, devices and channels as three donuts on one row (Global and Handbook).
const donutsRow = (P, m, pages = pagesSection) => '<div class="donuts three"><div>' + pages(P.pages, m) + "</div>" +
  Object.keys(DONUTS).map(k => "<div>" + donutSection(k, P[k], m) + "</div>").join("") + "</div>";

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
// res: one reply per section (by its name) and the unfiltered count (all): a donut in SECTIONS' order and colours,
// GA's own total in the centre.
export function pagesSection(p, m) {
  const d = metricOf(m);
  return panel("PAGES", p, res => donutBody(SECTIONS.map(([l]) => ({ label: l, value: gaTotal(res[l]) })), d.unit, d.label + " by section", res.all,
    "Game is /, Handbook the /learn/ pages, Desk the teacher's pages (GA does not run there), Other the rest. The centre is GA's own count over every page; " +
      (isViews(d) ? "each page view sits in one section." : "a person can visit both the game and the handbook, so the slices may add up to more."),
    "pages", "Section", d.label, true));
}

// --- Game ---------------------------------------------------------------------------------------
export const GAME_FEATURES = { schema_enlarge: "Schema enlarged", suspects_open: "Suspects opened", history_reuse: "History query reused",
  grammar_link: "Grammar link followed", film_play: "Film played", film_end: "Film watched to the end", landing_about: "Landing about opened", theme_toggle: "Day/Night toggled",
  prologue_done: "Prologue finished", prologue_skip: "Prologue skipped", share: "Shared the result", tour_done: "Tour finished", tour_skip: "Tour skipped",
  ad_house_click: "House ad clicked", warmup_link: "Warm-up link followed", card_review: "Case card reopened", feedback: "Feedback link pressed" };
export const HANDBOOK_FEATURES = { schema_enlarge: "Schema enlarged", history_reuse: "History query reused", grammar_link: "Grammar link followed",
  howto_open: "How to use opened", solution_open: "Solution opened", try_it: "Try it link followed", theme_toggle: "Day/Night toggled", ad_house_click: "House ad clicked",
  tour_done: "Tour finished", tour_skip: "Tour skipped", feedback: "Feedback link pressed" };
export const MODES = { learn: "Learn", compete: "Compete" };
export const KINDS = { error: "SQLite error", refused: "Refused by the grammar check" };
export const LEVELS = { "warm-up": "Warm-up", practice: "Practice", challenge: "Challenge" };
// query_fail's type for a SQLite error (kind error; a refusal's type is "refused") and chapter_solve's route.
export const ERROR_TYPES = { syntax: "Syntax", no_table: "Unknown table", no_column: "Unknown column", unterminated: "Unclosed quote",
  incomplete: "Incomplete query", curly_quote: "Curly quotes", other: "Other" };
export const ROUTES = { same_result: "Same result as the solution", found: "Answer seen in a result", unseen: "Answer never on screen" };
// The share box's buttons (site/endings.js shareHtml data-net), in its order.
export const NETWORKS = { native: "Device share", x: "X", linkedin: "LinkedIn", copy: "Copy link" };
export const OUTCOMES = { ok: "Ran", error: "SQLite error", refused: "Refused by the grammar check" };
const ev = (days, dims, metrics, filters) => ({ days, dimensions: dims, metrics, filters });
const typeRequest = (d, pagePath) => ev(d, ["customEvent:type"], ["eventCount", "totalUsers"], { eventName: ["query_fail"], "customEvent:kind": ["error"], pagePath });
// AdSense's own clicks and impressions on the view's pages (GA has them once AdSense is linked, 2026-10-25).
const adRequest = (days, pagePath) => ev(days, [], ["publisherAdClicks", "publisherAdImpressions"], { pagePath });
// Chapter I onboarding (2026-10-25), learn mode, each stage its own GA count of users: Investigate pressed, the
// prologue and the tour (done / skipped, one [feature] reply), a first query in chapter I, chapter I solved.
export const ONBOARDING_STEPS = [["begin", "Pressed Investigate"], ["prologue_done", "Prologue finished"], ["prologue_skip", "Prologue skipped"],
  ["tour_done", "Tour finished"], ["tour_skip", "Tour skipped"], ["ran", "Ran a first query in chapter I"], ["solved", "Solved chapter I"]];
const LEARN_MODE = { "customEvent:mode": ["learn"] };
// Split by device (2026-10-26): begin, ran and solved carry deviceCategory (their totals stay GA's all-device count);
// the features need a second reply by device, since GA's rows by feature alone are the all-device bars.
export const DEVICES = { desktop: "Desktop", mobile: "Mobile", tablet: "Tablet" };
const OB_FEATURES = { eventName: ["feature_use"], "customEvent:feature": ["prologue_done", "prologue_skip", "tour_done", "tour_skip"], pagePath: GAME_PATHS };
export const onboardingRequests = d => ({ begin: ev(d, ["deviceCategory"], ["totalUsers"], { eventName: ["landing_begin"], ...LEARN_MODE }),
  features: ev(d, ["customEvent:feature"], ["totalUsers"], OB_FEATURES),
  byDevice: ev(d, ["customEvent:feature", "deviceCategory"], ["totalUsers"], OB_FEATURES),
  ran: ev(d, ["deviceCategory"], ["totalUsers"], { eventName: ["chapter_queries"], "customEvent:chapter": ["1"], "customEvent:count": ["1"], ...LEARN_MODE }),
  solved: ev(d, ["deviceCategory"], ["totalUsers"], { eventName: ["chapter_solve"], "customEvent:chapter": ["1"], ...LEARN_MODE }) });

// --- panels: everything a view draws from ?report= is a panel, PANELS[view][id] = {deps, requests} or {deps, load}.
// c is the page's context: {days, gen (one per period load), m (the Count), dim (the breakdown), stack (Stack by), top
// (the countries' Top), scope (the view's pagePath filter), fromStats (Visitors per day comes from ?stats)}. requests(c)
// names the panel's replies ({name: request | null}; null asks nothing and reads null), fetched in parallel; load(c,
// report, show) is for a panel whose second request needs the first reply (show draws a partial result). Every panel
// reloads with the period, and with any choice its deps name; a late reply for an older context is dropped.
const usersPanel = { deps: ["m", "dim"], requests: c => ({
  total: c.fromStats && c.m === "visitors" ? null : scoped(countRequest(c.days, ["date"], c.m), c.scope),
  split: c.dim ? breakdownRequest(c.days, c.dim, c.m, c.scope) : null }) };
const donutPanel = kind => ({ deps: ["m"], requests: c => ({ slices: scoped(donutRequest(c.days, kind, c.m), c.scope) }) });
// The countries, then GA's total for the top N when the Top cuts the list; a new Top keeps the country reply (memo,
// one per period load and Count) and only asks for that total.
let countriesMemo = {};
const countriesPanel = { deps: ["m", "top"], load: async (c, report, show) => {
  const req = countriesRequest(c.days, c.m, c.scope), k = c.gen + JSON.stringify(req);
  if (countriesMemo.k !== k) countriesMemo = { k, res: await report(req) };
  const countries = countriesMemo.res, q = topTotalRequest(req, countries, c.top);
  show({ countries, top: null });
  return { countries, top: q ? await report(q) : null };
} };
const featuresPanel = { deps: [], requests: c => ({ features: ev(c.days, ["customEvent:feature"], ["totalUsers", "eventCount"], { eventName: ["feature_use"], pagePath: c.scope }) }) };
const adsPanel = { deps: [], requests: c => ({ ads: adRequest(c.days, c.scope) }) };
const failsPanel = (where, kind) => ({ deps: [], requests: c => ({
  rule: ev(c.days, ["customEvent:rule"], ["eventCount", "totalUsers"], { eventName: ["query_fail"], pagePath: c.scope }),
  split: ev(c.days, ["customEvent:rule", "customEvent:kind", where], ["eventCount", "totalUsers"], { eventName: ["query_fail"], pagePath: c.scope }),
  type: typeRequest(c.days, c.scope),
  kind: kind ? ev(c.days, ["customEvent:kind"], ["eventCount"], { eventName: ["query_fail"], pagePath: c.scope }) : null }) });
const once = (name, f) => ({ deps: [], requests: c => ({ [name]: f(c.days) }) });
export const PANELS = {
  global: {
    users: usersPanel,
    compare: { deps: ["stack"], requests: c => Object.fromEntries(compareRequests(c.days, c.stack)) },
    countries: countriesPanel,
    pages: { deps: ["m"], requests: c => Object.fromEntries(sectionRequests(c.days, c.m).map((q, i) => [i < SECTIONS.length ? SECTIONS[i][0] : "all", q])) },
    devices: donutPanel("devices"),
    channels: donutPanel("channels"),
  },
  game: {
    users: usersPanel,
    onboarding: { deps: [], requests: c => onboardingRequests(c.days) },
    leave: once("leave", d => ev(d, ["customEvent:chapter"], ["totalUsers", "averageCustomEvent:seconds", "averageCustomEvent:queries"], { eventName: ["chapter_leave"] })),
    wrongHints: { deps: [], requests: c => ({ wrong: ev(c.days, ["customEvent:chapter", "customEvent:n"], ["totalUsers"], { eventName: ["answer_wrong"] }),
      hints: ev(c.days, ["customEvent:chapter"], ["totalUsers", "eventCount"], { eventName: ["hint_open"] }) }) },
    routes: once("routes", d => ev(d, ["customEvent:chapter", "customEvent:route"], ["totalUsers"], { eventName: ["chapter_solve"] })),
    fails: failsPanel("customEvent:chapter", true),
    modes: { deps: [], requests: c => ({ opened: ev(c.days, ["customEvent:mode"], ["totalUsers"], { eventName: ["chapter_open"] }),
      begun: ev(c.days, ["customEvent:mode"], ["totalUsers"], { eventName: ["landing_begin"] }), seen: ev(c.days, [], ["activeUsers"], { pagePath: GAME_PATHS }) }) },
    features: featuresPanel,
    ads: adsPanel,
    shares: once("shares", d => ev(d, ["customEvent:network"], ["totalUsers", "eventCount"], { eventName: ["feature_use"], "customEvent:feature": ["share"] })),
  },
  handbook: {
    users: usersPanel,
    countries: countriesPanel,
    pages: { deps: ["m"], requests: c => ({ pages: scoped(countRequest(c.days, ["pageTitle"], c.m), LEARN) }) },
    devices: donutPanel("devices"),
    channels: donutPanel("channels"),
    exercises: { deps: [], requests: c => ({ ran: ev(c.days, ["customEvent:exercise"], ["totalUsers"], { eventName: ["exercise_run"] }),
      outcomes: ev(c.days, ["customEvent:exercise", "customEvent:outcome"], ["totalUsers"], { eventName: ["exercise_run"] }),
      solved: ev(c.days, ["customEvent:exercise"], ["totalUsers", "averageCustomEvent:runs"], { eventName: ["exercise_solve"] }) }) },
    choices: { deps: [], requests: c => ({ levels: ev(c.days, ["customEvent:level"], ["totalUsers", "eventCount"], { eventName: ["exercise_level"] }),
      outcomes: ev(c.days, ["customEvent:outcome"], ["eventCount"], { eventName: ["exercise_run"] }) }) },
    fails: failsPanel("customEvent:exercise", false),
    features: featuresPanel,
    ads: adsPanel,
    tryIt: once("tryIt", d => ev(d, ["customEvent:exercise"], ["totalUsers", "eventCount"], { eventName: ["feature_use"], "customEvent:feature": ["try_it"] })),
  },
};
// The view's context for a period (tests and the page): the scope and where Visitors per day comes from.
export const context = (view, c = {}) => ({ days: DAYS[0], gen: 0, m: "visitors", dim: "", stack: "sessionDefaultChannelGroup", top: 10,
  scope: SCOPES[view], fromStats: view === "global", ...c });

// leave: [chapter] totalUsers, avg seconds, avg queries of chapter_leave: the users who left as bars, then GA's two
// averages per leave event as small aligned lines (no dot for a chapter nobody left: an average of nothing is no 0).
export function leaveHtml({ leave }, w) {
  const g = chapterGrid(leave, 3), has = c => c.values[0] > 0;
  const tip = c => [[c.values[0], "users who left", "c1"], [has(c) ? avg(c.values[1]) + " s" : "-", "avg seconds"], [has(c) ? avg(c.values[2]) : "-", "avg queries"]];
  const line = (label, j, title) => '<div class="label sub">' + label + "</div>" + plotHtml(chapterLineFig(g, c => (has(c) ? r1(c.values[j]) : null), title, tip));
  return plotHtml(chapterBarsFig(g.map(c => ({ chapter: c.chapter, values: [c.values[0]], tip: tip(c).slice(1) })), [["users who left", "c1"]], "Users")) +
    line("AVERAGE TIME BEFORE LEAVING", 1, "Avg seconds") + line("AVERAGE QUERIES BEFORE LEAVING", 2, "Avg queries") +
    '<p class="muted">Users who left a chapter they had not solved, and GA&#39;s average per leave event of the seconds spent and the queries run in it (an average, not a median).</p>' +
    raw("chapter-leave", tableHtml(["Chapter", "Users who left", "Avg seconds (per leave)", "Avg queries (per leave)"], g.map(c => [roman(c.chapter), c.values[0], has(c) ? avg(c.values[1]) : "-", has(c) ? avg(c.values[2]) : "-"])));
}
// rule: failures by rule; split: by rule x kind x where; type: SQLite errors by type; kind: by kind (game only, else
// null): the kind as a donut of failures, the SQLite errors per type (ERROR_TYPES' order, zeros listed) and per rule
// as bars of GA's own rows; the split as raw data. An empty rule is a plain SQL error (no Grammar section to link).
const ruleText = r => (r == null || r === "" ? "SQL error" : String(r));
export function failsHtml({ rule, split, type, kind }, w, where = "Chapter", name = "query-failures") {
  const rows = ((rule && rule.rows) || []).map(([r, e, u]) => ({ label: ruleText(r), values: [Number(e) || 0], tip: [[Number(u) || 0, "users"]] }));
  const cells = ((split && split.rows) || []).map(([r, k, c, e, u]) => [ruleText(r), gaText(k), where === "Chapter" && ROMAN[Number(c)] ? roman(Number(c)) : gaText(c), Number(e) || 0, Number(u) || 0]);
  const users = fixedItems(type, ERROR_TYPES, 2), types = fixedItems(type, ERROR_TYPES).map((t, i) => ({ ...t, values: [t.value], tip: [[users[i].value, "users"]] }));
  return (kind ? '<div class="label sub">BY KIND</div>' + donutBody(fixedItems(kind, KINDS), "failures", "Query failures by kind", kind, "", name + "-kind", "Kind", "Failures", true) : "") +
    (type ? '<div class="label sub">SQLITE ERRORS BY TYPE</div>' + hbar(types, [["errors", "c2"]], w, compact, "SQLite errors by type") +
      raw(name + "-type", tableHtml(["Type", "Errors", "Users"], types.map((t, i) => [t.label, t.value, users[i].value]))) + '<div class="label sub">BY GRAMMAR RULE</div>' : "") +
    hbar(rows, [["failures", "c6"]], w, compact, "Query failures by grammar rule") +
    '<p class="muted">Failed or refused runs, the first 3 per ' + (where === "Chapter" ? "chapter" : "exercise") + " per page load; the rule is the Grammar section a refusal links; SQL error is a plain SQLite error, with no rule.</p>" +
    raw(name, tableHtml(["Rule", "Kind", where, "Failures", "Users"], cells));
}
// routes: chapter_solve by chapter x route: users per route per chapter, side by side on the funnel's grid.
export function routesHtml({ routes }, w) {
  const by = new Map();
  for (const [c, r, u] of (routes && routes.rows) || []) by.set(c + "|" + r, Number(u) || 0);
  const keys = Object.keys(ROUTES), series = keys.map((k, j) => [ROUTES[k], ["c3", "c1", "c6"][j]]);
  const g = Array.from({ length: CHAPTERS }, (_, i) => ({ chapter: i + 1, values: keys.map(k => by.get(i + 1 + "|" + k) || 0) }));
  return legendOf(series) + plotHtml(chapterBarsFig(g, series, "Users")) +
    '<p class="muted">Answer never on screen means no query run in the chapter showed the answer before it was typed: a guess or a copied answer. Data starts 2026-10-25.</p>' +
    raw("solve-route", tableHtml(["Chapter", ...keys.map(k => ROUTES[k])], g.map(c => [roman(c.chapter), ...c.values])));
}
// wrong: answer_wrong by chapter x n; hints: hint_open by chapter: users with a 1st and a 3rd wrong answer and users
// who opened the hint, side by side per chapter on the funnel's grid.
export function wrongHintsHtml({ wrong, hints }, w) {
  const by = new Map();
  for (const [c, n, u] of (wrong && wrong.rows) || []) by.set(c + "|" + n, Number(u) || 0);
  const g = chapterGrid(hints, 2).map((h, i) => ({ chapter: i + 1, values: [by.get(i + 1 + "|1") || 0, by.get(i + 1 + "|3") || 0, h.values[0]], tip: [[h.values[1], "hint opens"]] }));
  const series = [["1st wrong answer", "c1"], ["3rd wrong answer", "c2"], ["opened the hint", "c4"]];
  return legendOf(series) + plotHtml(chapterBarsFig(g, series, "Users")) +
    raw("wrong-answers-hints", tableHtml(["Chapter", "Users with a 1st wrong answer", "Users with a 3rd", "Users who opened the hint", "Hint opens"],
      g.map(c => [roman(c.chapter), ...c.values, c.tip[0][0]])));
}
// Every known feature (zeros included) in its list's order, then any other GA reports, most users first.
export function featuresHtml({ features }, w, names, name = "feature-use") {
  const m = byFirst(features), keys = [...Object.keys(names), ...[...m.keys()].filter(k => !(k in names))];
  const rows = keys.map(k => ({ key: k, label: names[k] || gaText(k), values: [(m.get(k) || [0])[0]], ev: (m.get(k) || [0, 0])[1] }))
    .sort((a, b) => b.values[0] - a.values[0] || b.ev - a.ev); // most users first; ties keep the names' order (stable sort)
  return hbar(rows.map(r => ({ ...r, tip: [[r.ev, "uses"]] })), [["users", "c3"]], w, compact, "Feature use") +
    '<p class="muted">Users per feature, and how many times it was used in its tooltip.</p>' +
    raw(name, tableHtml(["Feature", "Parameter", "Users", "Uses"], rows.map(r => [r.label, r.key, r.values[0], r.ev])));
}
// ads: GA's AdSense totals on the view's pages (no dimension; zero when GA has none): clicks and impressions, each
// GA's own count, beside FEATURE USE (owner, 2026-10-25: clicks are not users, so they have their own chart).
export function adsHtml({ ads }, w, name = "google-ads") {
  const t = (ads && ads.totals) || (ads && ads.rows && ads.rows[0]) || [], clicks = Number(t[0]) || 0, shown = Number(t[1]) || 0;
  const series = [["clicks", "c3"], ["impressions", "c5"]], rate = ctr(clicks, shown);
  return '<p class="stat-line">Click-through rate (CTR): <b>' + rate + "</b></p>" + legendOf(series) +
    hbar([{ label: "Google's ads on these pages", values: [clicks, shown] }], series, w, compact, "Google's ad clicks and impressions") +
    '<p class="muted">GA&#39;s count of clicks on Google&#39;s ads and of their impressions on these pages, not users. The CTR is clicks / impressions, a ratio of those two GA totals. GA shows AdSense data about a day after the link.</p>' +
    raw(name, tableHtml(["Metric", "Count"], [["Ad clicks (Google)", clicks], ["Ad impressions (Google)", shown], ["Click-through rate (clicks / impressions)", rate]]));
}
// Clicks over impressions as a percentage to two decimals (ad CTRs are small); "-" without impressions.
export const ctr = (clicks, shown) => (shown ? (Math.round((10000 * clicks) / shown) / 100).toFixed(2) + "%" : "-");
// FEATURE USE and GOOGLE ADS side by side (two thirds and one third) when the box is wide enough, else stacked.
const PAIR_GAP = 28;
function featuresRow(P, w, names, prefix = "") {
  const wide = w >= 900, w1 = wide ? Math.floor(((w - PAIR_GAP) * 2) / 3) : w, w2 = wide ? w - PAIR_GAP - w1 : w;
  return '<div class="' + (wide ? "side-pair" : "") + '"><div>' + panel("FEATURE USE", P.features, res => featuresHtml(res, w1, names, prefix + "feature-use")) +
    "</div><div>" + panel("GOOGLE ADS", P.ads, res => adsHtml(res, w2, prefix + "google-ads")) + "</div></div>";
}
// onboardingRequests' replies: one bar per stage, each GA's own users (never a difference), the share of the
// Investigate pressers only in the tooltip and raw data.
export function onboardingHtml({ begin, features, byDevice, ran, solved }, w) {
  const f = byFirst(features), v = { begin: gaTotal(begin), ran: gaTotal(ran), solved: gaTotal(solved) };
  const rows = ONBOARDING_STEPS.map(([k, label]) => ({ key: k, label, values: [k in v ? v[k] : (f.get(k) || [0])[0]] }));
  const begun = rows[0].values[0];
  return hbar(rows.map(r => ({ ...r, tip: [[pct(r.values[0], begun), "of those who pressed Investigate"]] })), [["users", "c1"]], w, compact, "Chapter I onboarding") +
    '<p class="muted">Learn mode, users at each step, each GA&#39;s own count (a person can skip the prologue and finish the tour, and someone who began before the period still counts later). The prologue and tour events start 2026-10-25.</p>' +
    raw("onboarding", tableHtml(["Step", "Users", "Share of Investigate"], rows.map(r => [r.label, r.values[0], pct(r.values[0], begun)]))) +
    onboardingDevicesHtml({ begin, byDevice, ran, solved }, w);
}
// The same steps per device (DEVICES' order, then any other name GA gives; zeros listed): one bar per device, each
// GA's own users for that step and device; the share of that device's Investigate pressers in the tooltip and raw data.
export function onboardingDevicesHtml({ begin, byDevice, ran, solved }, w) {
  const one = res => new Map(((res && res.rows) || []).map(r => [String(r[0]), Number(r.at(-1)) || 0]));
  const fr = (byDevice && byDevice.rows) || [], f = new Map(fr.map(r => [r[0] + "|" + r[1], Number(r[2]) || 0]));
  const v = { begin: one(begin), ran: one(ran), solved: one(solved) };
  const seen = [...v.begin.keys(), ...v.ran.keys(), ...v.solved.keys(), ...fr.map(r => String(r[1]))];
  const devs = [...Object.keys(DEVICES), ...new Set(seen.filter(k => !(k in DEVICES)))];
  const at = (k, d) => (k in v ? v[k].get(d) : f.get(k + "|" + d)) || 0, begun = devs.map(d => at("begin", d));
  const series = devs.map((d, j) => [DEVICES[d] || gaText(d), "c" + (j + 1)]);
  const rows = ONBOARDING_STEPS.map(([k, label]) => ({ label, values: devs.map(d => at(k, d)) }));
  return '<div class="label sub">BY DEVICE</div>' + legendOf(series) +
    hbar(rows.map(r => ({ ...r, tip: series.map(([n], j) => [pct(r.values[j], begun[j]), "of " + n + " Investigate pressers"]) })), series, w, compact, "Chapter I onboarding by device") +
    '<p class="muted">Each bar GA&#39;s own users for that step on that device; the share of that device&#39;s Investigate pressers is in the tooltip.</p>' +
    raw("onboarding-devices", tableHtml(["Step", ...series.flatMap(([n]) => [n, n + " share"])], rows.map(r => [r.label, ...r.values.flatMap((x, j) => [x, pct(x, begun[j])])])));
}
// shares: feature_use share by network, users per button in NETWORKS' order (zeros listed), presses in the tooltip.
export function sharesHtml({ shares }, w) {
  const users = fixedItems(shares, NETWORKS), uses = fixedItems(shares, NETWORKS, 2);
  const rows = users.map((u, i) => ({ label: u.label, values: [u.value], tip: [[uses[i].value, "presses"]] }));
  return hbar(rows, [["users", "c3"]], w, compact, "Shares by network") +
    '<p class="muted">Users who pressed each button of the share box (Part II ending), presses in the tooltip. The network data starts 2026-10-25.</p>' +
    raw("shares-by-network", tableHtml(["Network", "Users", "Presses"], rows.map((r, i) => [r.label, r.values[0], uses[i].value])));
}
// opened: chapter_open by mode; begun: landing_begin by mode; seen: activeUsers on the game page: two donuts, GA's
// totals in the centre.
export function modesHtml({ opened, begun, seen }) {
  const b = gaTotal(begun), s = gaTotal(seen);
  return '<div class="donuts"><div>' + head("PLAYERS BY MODE") +
    donutBody(fixedItems(opened, MODES), "players", "Players who opened a chapter by mode", opened, "Users who opened a chapter, learn or compete: a person who played both counts in both.", "players-by-mode", "Mode", "Players", true) +
    "</div><div>" + head("BEGIN PRESSES") +
    donutBody(fixedItems(begun, MODES), "users", "Users who pressed Begin by mode", begun,
      "Users who pressed Investigate (learn) or Join (compete) on the landing card: " + b + " of the " + s + " visitors on the game page (" + pct(b, s) + ").", "begin-presses", "Mode", "Users who pressed Begin", true) +
    "</div></div>";
}
// The Game view (monitor-game.html): s the ?stats reply (its chapters; null while reading), P and c as statsHtml's.
export function gameHtml(s, w, P = {}, c = {}) {
  const ch = s ? s.chapters || [] : null, reading = '<p class="muted">Reading...</p>';
  return usersSection(null, w, P.users, c, VIEW_BREAKDOWNS.game) +
    panel("CHAPTER I ONBOARDING", P.onboarding, res => onboardingHtml(res, w)) +
    '<div class="label">CHAPTER FUNNEL</div>' + (ch ? funnelHtml(ch, w) : reading) +
    '<div class="label">SOLVE RATE</div>' + (ch ? solveRateHtml(ch, w) : reading) +
    panel("LEFT AN UNSOLVED CHAPTER", P.leave, res => leaveHtml(res, w)) +
    panel("WRONG ANSWERS AND HINTS", P.wrongHints, res => wrongHintsHtml(res, w)) +
    panel("SOLVE ROUTE", P.routes, res => routesHtml(res, w)) +
    panel("QUERY FAILURES", P.fails, res => failsHtml(res, w)) +
    (P.modes && P.modes.res ? modesHtml(P.modes.res) : panel("PLAYERS BY MODE", P.modes, () => "")) +
    featuresRow(P, w, GAME_FEATURES) +
    panel("SHARES BY NETWORK", P.shares, res => sharesHtml(res, w));
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
// ran: users by exercise; outcomes: ran by exercise x outcome; solved: solved by exercise with avg runs.
export function exercisesHtml({ ran, outcomes, solved }, w) {
  const r0 = byFirst(ran), s0 = byFirst(solved), out = new Map();
  for (const [e, o, u] of (outcomes && outcomes.rows) || []) out.set(e + "|" + o, Number(u) || 0);
  const rows = exRows(r0, s0).map(k => {
    const r = (r0.get(k) || [0])[0], [s, runs] = s0.get(k) || [0, 0];
    return { key: k, label: exTitle.get(k) || gaText(k), values: [r, s], runs, tip: [[pct(s, r), "solve rate"], [s ? avg(runs) : "-", "avg runs to solve"]] };
  });
  const series = [["ran a query", "c1"], ["solved", "c3"]];
  return legendOf(series) + hbar(rows, series, w, compact, "Exercises: ran and solved") +
    '<p class="muted">Users who ran a query on the exercise and who solved it; the solve rate is solved over ran, the runs to solve GA&#39;s average per solve event.</p>' +
    raw("exercises", tableHtml(["Exercise", "Ran", "Solved", "Solve rate", "Avg runs to solve", "Ran: ok", "Ran: error", "Ran: refused"],
      rows.map(r => [r.label, r.values[0], r.values[1], pct(r.values[1], r.values[0]), r.values[1] ? avg(r.runs) : "-", ...["ok", "error", "refused"].map(o => out.get(r.key + "|" + o) || 0)])));
}
// The handbook's pages by title (top 5 + Other, its suffix dropped), the page's Count, GA's total in the centre.
export function handbookPagesHtml(res, m) {
  const d = metricOf(m), items = ((res && res.rows) || []).map(([t, v]) => ({ label: pageName(t), value: Number(v) || 0 }));
  return donutBody(items, d.unit, d.label + " by handbook page", res, d.note + " on the /learn/ pages: " + (isViews(d) ? "each view is of one page." : "a person who read two pages counts in both slices."), "handbook-pages", "Page", d.label);
}
// levels: exercise_level by level (users, presses); outcomes: exercise_run by outcome (first runs): two donuts.
export function choicesHtml({ levels, outcomes }) {
  const lv = fixedItems(levels, LEVELS), presses = fixedItems(levels, LEVELS, 2);
  return '<div class="donuts"><div>' + head("LEVEL CHOICE") +
    donutBody(lv, "users", "Users by level button", levels, "Users who pressed a level button (" + presses.map(p => p.value + " " + p.label).join(", ") + " presses): a person who pressed two counts in both.", "level-choice", "Level", "Users", true) +
    "</div><div>" + head("RUN OUTCOME") +
    donutBody(fixedItems(outcomes, OUTCOMES), "runs", "First runs by outcome", outcomes, "The first run of each exercise per page load: it ran, SQLite failed, or the grammar check refused it.", "run-outcome", "Outcome", "First runs", true) +
    "</div></div>";
}
export function tryItHtml({ tryIt }, w) {
  const m = byFirst(tryIt), rows = exRows(m).map(k => ({ label: exTitle.get(k) || gaText(k), values: [(m.get(k) || [0])[0]], ev: (m.get(k) || [0, 0])[1] }));
  return hbar(rows.map(r => ({ ...r, tip: [[r.ev, "clicks"]] })), [["users", "c5"]], w, compact, "Try it links per exercise") +
    raw("try-it", tableHtml(["Exercise", "Users", "Clicks"], rows.map(r => [r.label, r.values[0], r.ev])));
}
// Global's layout on the /learn/ pages: users per day, the countries map, then PAGES, devices and channels as three
// donuts on one row, all following the Count. P and c as statsHtml's; world: the map outline.
export function handbookHtml(w, P = {}, c = {}, world = null) {
  return usersSection(null, w, P.users, c, VIEW_BREAKDOWNS.handbook) +
    countriesSection(world, P.countries, c.top ?? 10, c.m, w) +
    donutsRow(P, c.m, (p, m) => panel("PAGES", p, res => handbookPagesHtml(res.pages, m))) +
    panel("EXERCISES", P.exercises, res => exercisesHtml(res, w)) +
    (P.choices && P.choices.res ? choicesHtml(P.choices.res) : panel("LEVEL CHOICE", P.choices, () => "")) +
    panel("QUERY FAILURES BY RULE", P.fails, res => failsHtml(res, w, "Exercise", "exercise-failures")) +
    featuresRow(P, w, HANDBOOK_FEATURES, "handbook-") +
    panel("TRY IT LINKS", P.tryIt, res => tryItHtml(res, w));
}

// Each view: its renderer, whether it reads ?stats (stats) and draws nothing before it (wait), and whether it shows
// the map (world.json, the countries' centroids).
export const VIEWS = {
  global: { html: (s, w, P, c, world) => statsHtml(s, w, world, P, c), stats: true, wait: true, map: true },
  game: { html: (s, w, P, c) => gameHtml(s, w, P, c), stats: true, wait: false, map: false },
  handbook: { html: (s, w, P, c, world) => handbookHtml(w, P, c, world), stats: false, wait: false, map: true },
};

// --- page wiring (browser only) ----------------------------------------------------------------
const $ = id => document.getElementById(id);
// Every Export CSV button in box saves the table of its Raw data toggle as ga-<name>-<date>.csv.
function wireCsv(box) {
  box.addEventListener("click", e => {
    const b = e.target.closest && e.target.closest("button.csv");
    if (!b || !box.contains(b)) return;
    e.preventDefault();
    const t = b.closest("details").querySelector("table");
    downloadText("ga-" + b.dataset.csv + "-" + new Date().toISOString().slice(0, 10) + ".csv", tableCsv([...t.rows].map(r => [...r.cells].map(c => c.textContent))));
  });
}
// Plotly (window.Plotly, loaded by the three monitor pages from cdnjs) draws every .plot placeholder; a figure's
// "var(--x)" tokens are read from the page at draw time, so a mood change redraws them all (restyle). The world's
// topojson is self-hosted (site/topojson/), never fetched from Plotly's CDN.
const CONFIG = { responsive: true, displaylogo: false, topojsonURL: "topojson/",
  modeBarButtonsToRemove: ["select2d", "lasso2d", "autoScale2d", "toggleSpikelines", "hoverClosestCartesian", "hoverCompareCartesian", "hoverClosestGeo"] };
function resolved(v, css) {
  if (typeof v === "string") return v.replace(/var\(--([\w-]+)\)/g, (_, n) => css.getPropertyValue("--" + n).trim() || "#888");
  if (Array.isArray(v)) return v.map(x => resolved(x, css));
  return v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, resolved(x, css)])) : v;
}
function plot(el, react = false) {
  if (!window.Plotly) { el.textContent = "The chart library did not load: the numbers are under Raw data."; return; }
  const f = JSON.parse(el.dataset.fig), css = getComputedStyle(document.documentElement), touch = matchMedia("(pointer: coarse)").matches;
  window.Plotly[react ? "react" : "newPlot"](el, resolved(f.data, css), resolved(themed(f.layout, touch), css), CONFIG);
}
// Writes html into box, keeping each drawn plot whose figure is unchanged (no redraw while panels arrive one by one).
function drawPlots(box, html) {
  const keep = new Map([...box.querySelectorAll(".plot")].map(el => [el.dataset.fig, el]));
  box.innerHTML = html;
  for (const el of box.querySelectorAll(".plot")) {
    const was = keep.get(el.dataset.fig);
    if (was) { el.replaceWith(was); keep.delete(el.dataset.fig); } else plot(el);
  }
  if (window.Plotly) for (const el of keep.values()) window.Plotly.purge(el);
}
const restyle = () => document.querySelectorAll(".plot").forEach(el => plot(el, true));
const say = (msg, bad = false) => { const s = $("status"); s.textContent = msg; s.classList.toggle("bad", bad); };

async function main() {
  let { board, stored } = deskBoard();
  try { new URL(board); } catch { board = ""; }
  deskLinks(board, stored);
  if (!board) { $("nob").hidden = false; return; }
  const key = await deskPassphrase($("passgate"));
  if (!key) { say("The desk is locked: reload the page to try again.", true); return; }
  $("monitor").hidden = false;
  wireCsv($("stats"));
  new MutationObserver(restyle).observe(document.documentElement, { attributes: true, attributeFilter: ["data-mood"] });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", restyle);
  // The view (monitor.html Global, monitor-game.html, monitor-handbook.html), its panels and their states; the Count
  // and the breakdown are remembered per view (Global keeps the original keys).
  const view = document.body.dataset.view in PANELS ? document.body.dataset.view : "global", V = VIEWS[view], panels = PANELS[view], P = {};
  const sfx = view === "global" ? "" : "." + view, BD_KEY = "ritz.monitor.breakdown" + sfx, COUNT_KEY = "ritz.monitor.count" + sfx;
  const c = context(view);
  try { const d = localStorage.getItem(BD_KEY) || ""; if (VIEW_BREAKDOWNS[view].includes(d)) c.dim = d; } catch {}
  try { const m = localStorage.getItem(COUNT_KEY); if (VIEW_COUNTS[view].includes(m)) c.m = m; } catch {}
  $("count").innerHTML = optionsHtml(VIEW_COUNTS[view].map(v => [v, metricOf(v).label]), c.m);
  let last = null, wide = 0, world = null;
  const draw = () => {
    wide = $("stats").clientWidth;
    if (!last && V.wait) return;
    const focus = document.activeElement && document.activeElement.id;
    drawPlots($("stats"), V.html(last, Math.max(280, wide), P, c, world));
    if (focus && $(focus)) $(focus).focus();
  };
  const report = async req => {
    const r = await (await fetch(reportUrl(board, req, key), { signal: AbortSignal.timeout(40000) })).json();
    if (!r || !r.ok) throw new Error((r && r.error) || "no numbers");
    return r;
  };
  // One loader for every panel: its named replies in parallel (or its own load); a reply for an older context (the
  // period load, or a choice the panel's deps name) is dropped.
  const loadPanel = async id => {
    const p = panels[id], now = () => [c.gen, ...p.deps.map(d => c[d])].join("|"), want = now(), still = () => want === now();
    const st = P[id] = { res: null, error: null };
    draw();
    const show = res => { if (still()) { st.res = res; draw(); } };
    try {
      show(p.load ? await p.load(c, report, show)
        : Object.fromEntries(await Promise.all(Object.entries(p.requests(c)).map(async ([k, q]) => [k, q ? await report(q) : null]))));
    } catch (e) { if (still()) { st.error = e.message; draw(); } }
  };
  // A choice changed: every panel that depends on it reloads.
  const choose = (k, v) => { c[k] = v; for (const id in panels) if (panels[id].deps.includes(k)) loadPanel(id); };
  $("stats").addEventListener("change", e => {
    if (e.target.id === "stack-dim") choose("stack", e.target.value);
    if (e.target.id === "bd-dim") { try { localStorage.setItem(BD_KEY, e.target.value); } catch {} choose("dim", e.target.value); }
    if (e.target.id === "top-n") choose("top", Number(e.target.value));
  });
  $("count").addEventListener("change", e => { try { localStorage.setItem(COUNT_KEY, e.target.value); } catch {} choose("m", e.target.value); });
  // The centroids, fetched with this module's ?v= like the game's data files; without them the countries keep their table.
  if (V.map) fetch("world.json" + new URL(import.meta.url).search).then(r => r.json()).then(j => { world = j; draw(); }).catch(() => {});
  addEventListener("resize", () => { if ($("stats").clientWidth !== wide) draw(); });
  async function load(d) {
    const mine = ++c.gen;
    c.days = d;
    document.querySelectorAll("#days button").forEach(b => b.setAttribute("aria-pressed", String(Number(b.dataset.days) === d)));
    last = null;
    for (const id in panels) loadPanel(id);
    if (!V.stats) { say("The last " + d + " days, from Google Analytics (cached 10 minutes)."); return; }
    say("Reading the last " + d + " days...");
    try {
      const u = new URL(board);
      u.searchParams.set("stats", d); u.searchParams.set("key", key);
      const s = await (await fetch(u, { signal: AbortSignal.timeout(40000) })).json();
      if (mine !== c.gen) return;
      if (!s || !s.ok) throw new Error((s && s.error) || "no numbers");
      last = s; draw();
      say("The last " + s.days + " days, from Google Analytics (cached 10 minutes).");
    } catch (e) { if (mine === c.gen) say("Could not read the numbers: " + e.message, true); }
  }
  $("days").onclick = e => { const b = e.target.closest("button[data-days]"); if (b) load(Number(b.dataset.days)); };
  load(DAYS[0]);
}

if (typeof document !== "undefined") { wireFeedback(); main(); }
