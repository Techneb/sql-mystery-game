// site/explore.js -- the desk's pivot table (explore.html): pick GA4 dimensions (rows) and metrics (columns), a period
// and filters, read from the Apps Script's ?report=<json>&key=<passphrase> (apps_script.gs report_, the same whitelist).
// Pure parts are exported for test_site.mjs; the page wiring runs only in a browser. Board URL and passphrase as on
// monitor.html.
import { BOARD_KEY, DIMENSIONS, deskLinks, deskPassphrase, escapeHtml as esc, gaText, reportUrl } from "./shared.js";

// The dimensions whitelist (DIMENSIONS) lives in shared.js, shared with monitor.js's breakdown.
export { DIMENSIONS, reportUrl };
export const METRICS = {
  activeUsers: "Active users", totalUsers: "Total users", newUsers: "New users", sessions: "Sessions",
  engagedSessions: "Engaged sessions", eventCount: "Events", userEngagementDuration: "Engagement time (s)",
  averageSessionDuration: "Avg session (s)", screenPageViews: "Page views",
};
export const MAX_DIMS = 9, MAX_METRICS = 10;

// state: {period: "7" | "30" | "90" | "custom", start, end, dims: [...], metrics: [...], filters: {dim: [values]}}
export function buildRequest(s) {
  const req = s.period === "custom" && s.start && s.end ? { start: s.start, end: s.end } : { days: Number(s.period) || 7 };
  req.dimensions = s.dims.slice(0, MAX_DIMS);
  req.metrics = s.metrics.slice(0, MAX_METRICS);
  const filters = {};
  for (const [d, vals] of Object.entries(s.filters || {})) if (vals && vals.length) filters[d] = [...vals];
  if (Object.keys(filters).length) req.filters = filters;
  return req;
}
// The values a filter offers: the same report with that one dimension and its users, same period, no other filter.
export const valuesRequest = (s, dim) => buildRequest({ ...s, dims: [dim], metrics: ["activeUsers"], filters: {} });

export const label = (name, dict) => dict[name] || name;
const cell = (name, v) => (name === "date" ? gaText(v).replace(/^(\d{4})(\d\d)(\d\d)$/, "$1-$2-$3") : gaText(v));
export const fmtNum = n => (n == null ? "(empty)" : Number.isInteger(n) ? n.toLocaleString("en-GB") : Number(n).toFixed(1));

// Sort a copy of res.rows by column i (dimensions as text, metrics as numbers).
export function sortRows(res, col, desc) {
  const nd = res.dimensions.length, sign = desc ? -1 : 1;
  return [...res.rows].sort((a, b) => sign * (col < nd ? String(a[col]).localeCompare(String(b[col]), "en", { numeric: true }) : a[col] - b[col]));
}

// The table: one column per dimension then per metric, every header a sort button, GA's own totals in the footer
// (user counts do not add across rows; GA's TOTAL counts each user once).
export function pivotHtml(res, sort = { col: res.dimensions.length, desc: true }) {
  if (!res.rows.length) return '<p class="muted">No rows for this period and these filters.</p>';
  const heads = res.dimensions.map(d => label(d, DIMENSIONS)).concat(res.metrics.map(m => label(m, METRICS)));
  const nd = res.dimensions.length;
  const th = heads.map((h, i) => '<th' + (i >= nd ? ' class="num"' : "") + ' aria-sort="' + (sort.col === i ? (sort.desc ? "descending" : "ascending") : "none") +
    '"><button data-col="' + i + '">' + esc(h) + (sort.col === i ? (sort.desc ? " &#9660;" : " &#9650;") : "") + "</button></th>").join("");
  const body = sortRows(res, sort.col, sort.desc).map(r => "<tr>" + r.map((v, i) =>
    i < nd ? "<td>" + esc(cell(res.dimensions[i], v)) + "</td>" : '<td class="num">' + esc(fmtNum(v)) + "</td>").join("") + "</tr>").join("");
  const foot = res.totals ? "<tfoot><tr><td" + (nd ? ' colspan="' + nd + '"' : "") + ">Total (GA, each user once)</td>" +
    res.totals.map(v => '<td class="num">' + esc(fmtNum(v)) + "</td>").join("") + "</tr></tfoot>" : "";
  const more = res.rowCount > res.rows.length ? '<p class="muted">Showing ' + res.rows.length + " of " + esc(res.rowCount) + " rows (the largest first).</p>" : "";
  return '<table class="detail stats"><thead><tr>' + th + "</tr></thead><tbody>" + body + "</tbody>" + foot + "</table>" + more;
}

const csvCell = v => { const t = v == null ? "" : String(v); return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
export function pivotCsv(res, sort) {
  const heads = res.dimensions.map(d => label(d, DIMENSIONS)).concat(res.metrics.map(m => label(m, METRICS)));
  const rows = sort ? sortRows(res, sort.col, sort.desc) : res.rows;
  return [heads, ...rows.map(r => r.map((v, i) => (i < res.dimensions.length ? cell(res.dimensions[i], v) : v)))]
    .map(r => r.map(csvCell).join(",")).join("\n") + "\n";
}

// The side panel's dropdowns: a <details class="ms"> whose <summary> is the button and whose panel holds checkboxes
// (native: Tab reaches it, Space/Enter opens it; the page adds Escape, outside click and arrows).
export function msHtml(id, summary, panel, name) {
  return '<details class="ms" id="' + esc(id) + '"><summary>' + summary + '</summary><div class="ms-panel" role="group" aria-label="' +
    esc(name) + '">' + panel + "</div></details>";
}
// A dimension or metric dropdown's button: the picked names as numbered chips, in picking (= column) order.
export const chipsHtml = (picked, dict, empty) => (picked.length
  ? picked.map((k, i) => '<span class="chip"><b>' + (i + 1) + "</b> " + esc(label(k, dict)) + "</span>").join(" ")
  : '<span class="muted">' + esc(empty) + "</span>");
// A filter's button: its dimension and how many values it keeps ("All" when none is picked).
export const filterCount = n => (n ? n + " picked" : "All");
export const filterSummary = (dim, n) => '<span class="ms-name">' + esc(label(dim, DIMENSIONS)) + '</span> <span class="ms-count">' + filterCount(n) + "</span>";
// Tick or untick k: ticking appends (the order picked is the column order); null when that would pass max.
export function toggleOrder(list, k, on, max) {
  if (!on) return list.filter(x => x !== k);
  if (list.includes(k)) return list;
  return list.length >= max ? null : [...list, k];
}
// Which dimensions get a filter dropdown: the chosen dimensions first, then those added by hand or still filtering.
export function filterDims(s, added = []) {
  const busy = Object.keys(s.filters || {}).filter(d => s.filters[d].length);
  return [...new Set([...s.dims, ...added, ...busy])].filter(d => d in DIMENSIONS);
}
export const addableDims = (s, added) => Object.keys(DIMENSIONS).filter(d => !filterDims(s, added).includes(d));

// A checkbox per name; ticked ones carry their order (the table's column order).
export function pickerHtml(dict, picked, kind) {
  return Object.entries(dict).map(([k, v]) => {
    const n = picked.indexOf(k);
    return '<label><input type="checkbox" data-' + kind + '="' + esc(k) + '"' + (n >= 0 ? " checked" : "") + "> " + esc(v) +
      '<span class="ord">' + (n >= 0 ? n + 1 : "") + "</span></label>";
  }).join("");
}
export const SEARCH_FROM = 10;
export function filterValuesHtml(dim, rows, chosen = []) {
  if (!rows.length) return '<p class="muted">No values in this period.</p>';
  const search = rows.length > SEARCH_FROM ? '<input type="search" class="ms-search" placeholder="Search" aria-label="Search ' +
    esc(label(dim, DIMENSIONS)) + ' values">' : "";
  return search + rows.slice(0, 200).map(([v, users]) => '<label><input type="checkbox" data-filter="' + esc(dim) + '" value="' + esc(v) + '"' +
    (chosen.includes(String(v)) ? " checked" : "") + "> " + esc(cell(dim, v)) + '<span class="n">' + esc(fmtNum(users)) + "</span></label>").join("");
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
  $("explore").hidden = false;
  const s = { period: "7", start: "", end: "", dims: ["date"], metrics: ["activeUsers", "sessions"], filters: {} };
  let res = null, sort = null, gen = 0;
  const get = async req => {
    const r = await (await fetch(reportUrl(board, req, key), { signal: AbortSignal.timeout(40000) })).json();
    if (!r || !r.ok) throw new Error((r && r.error) || "no numbers");
    return r;
  };
  const added = [], vals = {}; // filters added by hand; each dimension's values for the current period
  $("dims").insertAdjacentHTML("beforeend", msHtml("dims-ms", chipsHtml(s.dims, DIMENSIONS, "Choose dimensions"), pickerHtml(DIMENSIONS, s.dims, "dim"), "Dimensions"));
  $("metrics").insertAdjacentHTML("beforeend", msHtml("metrics-ms", chipsHtml(s.metrics, METRICS, "Choose metrics"), pickerHtml(METRICS, s.metrics, "metric"), "Metrics"));
  const sync = (box, picked, dict, empty) => { // in place, so the open panel and its focus stay
    box.querySelector("summary").innerHTML = chipsHtml(picked, dict, empty);
    box.querySelectorAll(".ms-panel input").forEach(i => {
      const n = picked.indexOf(i.dataset.dim || i.dataset.metric);
      i.parentNode.querySelector(".ord").textContent = n >= 0 ? n + 1 : "";
    });
  };
  const filters = () => {
    $("filter-list").innerHTML = filterDims(s, added).map(d => msHtml("f-" + d, filterSummary(d, (s.filters[d] || []).length),
      vals[d] ? filterValuesHtml(d, vals[d], s.filters[d]) : '<p class="muted">Reading...</p>', label(d, DIMENSIONS) + " values")).join("");
    const add = addableDims(s, added);
    $("filter-add").innerHTML = add.length ? msHtml("add-ms", "Add filter", add.map(d => '<button type="button" class="quiet" data-add="' +
      esc(d) + '">' + esc(label(d, DIMENSIONS)) + "</button>").join(""), "Add a filter") : "";
  };
  filters();
  const loadValues = async m => {
    const dim = m.id.slice(2);
    if (vals[dim]) return;
    const panel = m.querySelector(".ms-panel");
    try { vals[dim] = (await get(valuesRequest(s, dim))).rows; panel.innerHTML = filterValuesHtml(dim, vals[dim], s.filters[dim]); }
    catch (e) { panel.innerHTML = '<p class="muted">' + esc(e.message) + "</p>"; }
  };
  $("filter-list").addEventListener("toggle", e => { if (e.target.open) loadValues(e.target); }, true);
  $("filter-list").addEventListener("input", e => {
    if (!e.target.classList.contains("ms-search")) return;
    const q = e.target.value.trim().toLowerCase();
    e.target.parentNode.querySelectorAll("label").forEach(l => { l.hidden = !!q && !l.textContent.toLowerCase().includes(q); });
  });
  $("filter-add").addEventListener("click", e => {
    const b = e.target.closest("button[data-add]");
    if (!b) return;
    added.push(b.dataset.add); filters();
    const m = $("f-" + b.dataset.add); m.open = true; m.querySelector("summary").focus();
  });
  // Every dropdown: Escape closes it (focus back on its button), a click outside closes it, arrows move between options.
  document.addEventListener("keydown", e => {
    const m = e.target.closest && e.target.closest("details.ms[open]");
    if (!m) return;
    if (e.key === "Escape") { m.open = false; m.querySelector("summary").focus(); e.preventDefault(); }
    else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      const opts = [...m.querySelectorAll("summary, .ms-panel input, .ms-panel button")].filter(x => !x.closest("[hidden]"));
      const i = opts.indexOf(e.target) + (e.key === "ArrowDown" ? 1 : -1);
      if (opts[i]) { opts[i].focus(); e.preventDefault(); }
    }
  });
  document.addEventListener("click", e => e.target.isConnected && document.querySelectorAll("details.ms[open]").forEach(m => { if (!m.contains(e.target)) m.open = false; }));
  $("period").onchange = e => {
    if (e.target.type === "date") document.querySelector('input[value="custom"]').checked = true;
    s.period = document.querySelector('input[name="period"]:checked').value;
    s.start = $("start").value; s.end = $("end").value;
    for (const d in vals) delete vals[d];
    filters();
  };
  document.querySelector("aside").addEventListener("change", e => {
    const t = e.target;
    if (t.dataset.dim || t.dataset.metric) {
      const dim = !!t.dataset.dim, max = dim ? MAX_DIMS : MAX_METRICS;
      const next = toggleOrder(dim ? s.dims : s.metrics, t.dataset.dim || t.dataset.metric, t.checked, max);
      if (!next) { t.checked = false; return say("At most " + max + (dim ? " dimensions" : " metrics") + " (GA's limit).", true); }
      if (dim) { s.dims = next; sync($("dims-ms"), s.dims, DIMENSIONS, "Choose dimensions"); filters(); }
      else { s.metrics = next; sync($("metrics-ms"), s.metrics, METRICS, "Choose metrics"); }
    } else if (t.dataset.filter) {
      const d = t.dataset.filter, list = s.filters[d] || [];
      s.filters[d] = t.checked ? [...list, t.value] : list.filter(v => v !== t.value);
      t.closest("details").querySelector(".ms-count").textContent = filterCount(s.filters[d].length);
    }
  });
  const draw = () => { $("pivot").innerHTML = pivotHtml(res, sort); };
  $("pivot").onclick = e => {
    const b = e.target.closest("button[data-col]");
    if (!b || !res) return;
    const col = Number(b.dataset.col);
    sort = { col, desc: sort && sort.col === col ? !sort.desc : col >= res.dimensions.length };
    draw();
  };
  $("csv").onclick = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([pivotCsv(res, sort)], { type: "text/csv" }));
    a.download = "ga-pivot.csv"; a.click(); URL.revokeObjectURL(a.href);
  };
  $("run").onclick = async () => {
    if (!s.metrics.length) return say("Pick at least one metric.", true);
    const mine = ++gen;
    say("Asking Google Analytics...");
    try {
      const req = buildRequest(s), r = await get(req);
      if (mine !== gen) return;
      res = r; sort = { col: r.dimensions.length, desc: true }; draw(); $("csv").disabled = false;
      say(r.rows.length + " rows, " + (req.days ? "the last " + req.days + " days" : req.start + " to " + req.end) + ", from Google Analytics (cached 10 minutes).");
    } catch (e) { if (mine === gen) say("Google Analytics said: " + e.message, true); }
  };
  $("run").click();
}

if (typeof document !== "undefined") main();
