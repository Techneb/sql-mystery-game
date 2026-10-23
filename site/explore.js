// site/explore.js -- the desk's pivot table (explore.html): pick GA4 dimensions (rows) and metrics (columns), a period
// and filters, read from the Apps Script's ?report=<json>&key=<passphrase> (apps_script.gs report_, the same whitelist).
// Pure parts are exported for test_site.mjs; the page wiring runs only in a browser. Board URL and passphrase as on
// monitor.html.
import { BOARD_KEY, deskLinks, deskPassphrase, escapeHtml as esc } from "./shared.js";

// The whitelist, in the order the side panel lists it (apps_script.gs REPORT_DIMS / REPORT_METRICS, a test compares).
export const DIMENSIONS = {
  date: "Date", eventName: "Event", "customEvent:chapter": "Chapter", "customEvent:count": "Query milestone",
  "customEvent:mode": "Mode", "customEvent:part": "Part finished", "customEvent:name": "Badge", deviceCategory: "Device",
  operatingSystem: "Operating system", browser: "Browser", country: "Country", city: "City", language: "Language",
  sessionDefaultChannelGroup: "Channel", sessionSource: "Source", newVsReturning: "New or returning",
};
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
export function reportUrl(board, req, key) {
  const u = new URL(board);
  u.searchParams.set("report", JSON.stringify(req)); u.searchParams.set("key", key);
  return u.toString();
}
// The values a filter offers: the same report with that one dimension and its users, same period, no other filter.
export const valuesRequest = (s, dim) => buildRequest({ ...s, dims: [dim], metrics: ["activeUsers"], filters: {} });

export const label = (name, dict) => dict[name] || name;
const cell = (name, v) => (name === "date" ? String(v).replace(/^(\d{4})(\d\d)(\d\d)$/, "$1-$2-$3") : String(v));
export const fmtNum = n => (Number.isInteger(n) ? n.toLocaleString("en-GB") : Number(n).toFixed(1));

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

const csvCell = v => (/[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v));
export function pivotCsv(res, sort) {
  const heads = res.dimensions.map(d => label(d, DIMENSIONS)).concat(res.metrics.map(m => label(m, METRICS)));
  const rows = sort ? sortRows(res, sort.col, sort.desc) : res.rows;
  return [heads, ...rows.map(r => r.map((v, i) => (i < res.dimensions.length ? cell(res.dimensions[i], v) : v)))]
    .map(r => r.map(csvCell).join(",")).join("\n") + "\n";
}

// The side panel's pickers: a checkbox per name; ticked dimensions carry their order (the table's column order).
export function pickerHtml(dict, picked, kind) {
  return Object.entries(dict).map(([k, v]) => {
    const n = picked.indexOf(k);
    return '<label><input type="checkbox" data-' + kind + '="' + esc(k) + '"' + (n >= 0 ? " checked" : "") + "> " + esc(v) +
      (kind === "dim" && n >= 0 ? '<span class="ord">' + (n + 1) + "</span>" : "") + "</label>";
  }).join("");
}
export function filterValuesHtml(dim, rows, chosen = []) {
  if (!rows.length) return '<p class="muted">No values in this period.</p>';
  return rows.slice(0, 200).map(([v, users]) => '<label><input type="checkbox" data-filter="' + esc(dim) + '" value="' + esc(v) + '"' +
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
  const pickers = () => {
    $("dims").innerHTML = "<legend>DIMENSIONS (ROWS)</legend>" + pickerHtml(DIMENSIONS, s.dims, "dim");
    $("metrics").innerHTML = "<legend>METRICS (COLUMNS)</legend>" + pickerHtml(METRICS, s.metrics, "metric");
  };
  pickers();
  $("filters").insertAdjacentHTML("beforeend", Object.entries(DIMENSIONS).map(([k, v]) =>
    '<details data-dim="' + esc(k) + '"><summary>' + esc(v) + ' <span class="ord"></span></summary><div class="values"></div></details>').join(""));
  const loadValues = async d => {
    const box = d.querySelector(".values"), dim = d.dataset.dim;
    box.innerHTML = '<p class="muted">Reading...</p>';
    try { box.innerHTML = filterValuesHtml(dim, (await get(valuesRequest(s, dim))).rows, s.filters[dim]); }
    catch (e) { box.innerHTML = '<p class="muted">' + esc(e.message) + "</p>"; }
  };
  $("filters").addEventListener("toggle", e => { if (e.target.open) loadValues(e.target); }, true);
  $("period").onchange = e => {
    if (e.target.type === "date") document.querySelector('input[value="custom"]').checked = true;
    s.period = document.querySelector('input[name="period"]:checked').value;
    s.start = $("start").value; s.end = $("end").value;
    document.querySelectorAll("#filters details[open]").forEach(loadValues);
  };
  document.querySelector("aside").addEventListener("change", e => {
    const t = e.target, toggle = (list, k) => (t.checked ? list.includes(k) || list.push(k) : list.splice(list.indexOf(k), 1));
    if (t.dataset.dim) {
      if (t.checked && s.dims.length >= MAX_DIMS) { t.checked = false; return say("At most " + MAX_DIMS + " dimensions (GA's limit).", true); }
      toggle(s.dims, t.dataset.dim); pickers();
    } else if (t.dataset.metric) {
      if (t.checked && s.metrics.length >= MAX_METRICS) { t.checked = false; return say("At most " + MAX_METRICS + " metrics (GA's limit).", true); }
      toggle(s.metrics, t.dataset.metric); pickers();
    } else if (t.dataset.filter) {
      const list = (s.filters[t.dataset.filter] ||= []);
      toggle(list, t.value);
      const n = t.closest("details").querySelector(".ord");
      n.textContent = list.length ? list.length + " kept" : "";
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
