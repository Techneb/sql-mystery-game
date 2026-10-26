// site/figures.js -- the desk's charts as Plotly figures ({aria, data, layout}) built from plain numbers, and the tables
// and helpers they share (raw data, CSV, roman numerals), none of it knowing GA (monitor.js holds the GA model and the
// views). Side-effect free, no DOM, no Plotly: a view writes plotHtml(fig), a placeholder carrying the figure, and
// monitor.js draws it with window.Plotly. Colours are written as the page's tokens ("var(--c1)", "var(--rel)": admin.css's
// categorical --c1..--c6, validated light and night with the dataviz skill's script) and resolved at draw time, so day
// and night follow. Every hover box is one hovertext string (tipText), on the mark or on an invisible carrier trace that
// owns a whole column (or row) so it can list every series.
import { csvText, escapeHtml as esc, gaText } from "./shared.js";

export const pct = (a, b) => (b ? Math.round((100 * a) / b) + "%" : "-");
export const compact = n => (n >= 1e6 ? +(n / 1e6).toFixed(1) + "M" : n >= 1e3 ? +(n / 1e3).toFixed(1) + "K" : String(n));
export const r1 = v => +v.toFixed(1);

// A table whose last column is a CSS bar scaled to the largest value.
// foot: [label, value] rows (totals) under the bars, without a bar.
export function barTable(head, rows, valHead = "Users", foot = []) {
  const max = Math.max(1, ...rows.map(r => r[1]));
  return '<table class="detail stats"><thead><tr><th>' + esc(head) + "</th><th>" + esc(valHead) + "</th><th></th></tr></thead><tbody>" +
    rows.map(([k, v]) => "<tr><td>" + esc(k) + '</td><td class="num">' + esc(v) + '</td><td class="bar-cell"><span class="bar" style="width:' +
      Math.round((100 * v) / max) + '%"></span></td></tr>').join("") + "</tbody>" +
    (foot.length ? "<tfoot>" + foot.map(([k, v]) => "<tr><td>" + esc(k) + '</td><td class="num">' + esc(v) + "</td><td></td></tr>").join("") + "</tfoot>" : "") + "</table>";
}
// Raw data under a chart, closed, its Export CSV button inside the toggle, over the table (monitor.js wireCsv reads the
// table it holds; owner 2026-10-24).
export const raw = (name, table) => '<details class="numbers"><summary>Raw data</summary><button type="button" class="quiet csv" data-csv="' + esc(name) +
  '">Export CSV</button>' + table + "</details>";
// cells: rows of cell texts (the header row first), as read from a Raw data table.
export const tableCsv = cells => csvText(cells.map(r => r.map(c => String(c).trim())));
// A table from a header and rows of cells, every cell escaped; numbers (and "40%", "3.5", "-") right-aligned.
export const isNum = c => typeof c === "number" || /^(-|\d+(\.\d+)?%?)$/.test(String(c));
export const tableHtml = (heads, rows) => '<div class="wide"><table class="detail stats"><thead><tr>' + heads.map((h, i) => "<th" + (rows.length && i && isNum(rows[0][i]) ? ' class="num"' : "") + ">" + esc(h) + "</th>").join("") +
  "</tr></thead><tbody>" + rows.map(r => "<tr>" + r.map(c => "<td" + (isNum(c) ? ' class="num"' : "") + ">" + esc(c) + "</td>").join("") + "</tr>").join("") + "</tbody></table></div>";
// Legends: each entry a toggle for series j of the plot it sits beside (monitor.js wires the click, shown() hides it).
export const keyHtml = (j, cls, name) => '<button type="button" class="key" data-series="' + j + '" aria-pressed="true"><i class="' + cls + '"></i>' + esc(name) + "</button>";
export const legendKeys = series => '<p class="legend">' + series.map(([n, c], j) => keyHtml(j, c, n)).join("") + "</p>";
export const legendOf = series => (series.length > 1 ? legendKeys(series) : "");
export const legend = names => legendKeys(names.map((name, j) => [name, "c" + (j + 1)]).concat([["Retention (right axis)", "c6 key-line"]]));

// Chapters as the game names them.
export const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
export const roman = n => ROMAN[n] || String(n);
export const STAGES = [["opened", "Opened"], ["q1", "Ran 1 query"], ["q5", "Ran 5"], ["q20", "Ran 20"], ["solved", "Solved"]];
export const solveRate = c => (c.opened ? Math.round((100 * c.solved) / c.opened) : null);
// Retention: users who opened chapter N over those who opened chapter I (so I is 100%); null without chapter I openers.
export const retention = f => { const base = (f.find(c => c.chapter === 1) || {}).opened || 0; return c => (base ? Math.round((100 * c.opened) / base) : null); };
export const pctOf = v => (v === null ? "-" : v + "%");

// --- the figure plumbing --------------------------------------------------------------------------
// A series' colour from its key class (c1..c6; the breakdown's total is the ink).
export const KEY = cls => "var(--" + (cls === "total" ? "ink" : cls) + ")";
// The hover box: its heading, then one line per row [value, label, key class], a dot in the series' colour; every
// text escaped (Plotly reads the rest as its small HTML).
export const tipText = (k, rows) => "<b>" + esc(k) + "</b>" + rows.map(([v, label, cls]) => "<br>" + (cls ? '<span style="color:' + KEY(cls) + '">\u25cf</span> ' : "") +
  "<b>" + esc(v) + "</b>" + (label ? " " + esc(label) : "")).join("");
const HT = "%{hovertext}<extra></extra>";
// An invisible trace owning the hover of each column (h: each row): x positions, y where the box points, each box's
// heading and tipText rows; a row's 4th cell is the series it belongs to, and meta keeps them so shown() can drop it.
const carrier = (x, y, heads, rows, h = false) => ({ type: "scatter", mode: "markers", x: h ? y : x, y: h ? x : y, hovertext: heads.map((k, i) => tipText(k, rows[i])),
  hovertemplate: HT, meta: { heads, rows }, marker: { opacity: 0, size: 12 }, cliponaxis: false });
// The figure with the series in hidden (a Set of legend indexes) left out: trace j hidden (series j is trace j in every
// chart with a legend), each carrier's box rebuilt without that series' rows; a donut hides slice j.
export function shown(fig, hidden) {
  if (!hidden || !hidden.size) return fig;
  if (fig.data[0] && fig.data[0].type === "pie") return { ...fig, layout: { ...fig.layout, hiddenlabels: [...hidden].map(j => "s" + j) } };
  return { ...fig, data: fig.data.map((t, i) => (hidden.has(i) ? { ...t, visible: false }
    : t.meta ? { ...t, hovertext: t.meta.heads.map((k, c) => tipText(k, t.meta.rows[c].filter(r => !hidden.has(r[3])))) } : t)) };
}
// The placeholder monitor.js draws; the figure travels escaped in the attribute, so the views stay strings.
export const plotHtml = fig => '<div class="plot" role="img" aria-label="' + esc(fig.aria) + '" style="height:' + fig.layout.height + 'px" data-fig="' +
  esc(JSON.stringify(fig)) + '"></div>';
// The desk's look over a figure's layout: Nunito Sans, transparent paper, light grids, the tooltip on the card; touch
// screens get no drag (the page must scroll; the modebar still offers zoom and pan) and room for the modebar.
const FONT = '"Nunito Sans", sans-serif';
const AXIS = { gridcolor: "var(--rule)", linecolor: "var(--rule)", zerolinecolor: "var(--rule)", tickcolor: "var(--rule)", automargin: true, tickfont: { size: 11 } };
export function themed(layout, touch = false) {
  const axes = Object.fromEntries(Object.keys(layout).filter(k => /^[xy]axis\d*$/.test(k)).map(k => [k, { ...AXIS, ...layout[k] }]));
  return { font: { family: FONT, size: 12, color: "var(--ink)" }, paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)", showlegend: false,
    hovermode: "closest", margin: { l: 8, r: 8, t: 10, b: 8 }, ...layout, ...axes,
    // a column (or row) box answers anywhere in its column, as the hover strips did
    ...(layout.hovermode === "x" || layout.hovermode === "y" ? { hoverdistance: -1 } : {}),
    // touch: the modebar always shows, so it gets its own strip over the plot
    ...(touch ? { dragmode: false, margin: { l: 8, r: 8, b: 8, ...layout.margin, t: ((layout.margin || {}).t ?? 10) + 28 } } : {}),
    hoverlabel: { bgcolor: "var(--card)", bordercolor: "var(--ink)", align: "left", font: { family: FONT, size: 13, color: "var(--ink)" } } };
}
const title = text => ({ text, font: { size: 12 } });
const zeroY = (ys, t) => ({ title: title(t), rangemode: "tozero", ...(Math.max(0, ...ys.filter(v => v != null)) ? {} : { range: [0, 1] }) });

// ref {value, label}: a dashed horizontal reference line across the plot (an average, say), labelled at its right end.
export const refLayout = ref => (!ref ? {} : {
  shapes: [{ type: "line", xref: "paper", x0: 0, x1: 1, y0: ref.value, y1: ref.value, line: { color: "var(--ink)", width: 1, dash: "dash" }, opacity: 0.55 }],
  annotations: [{ xref: "paper", x: 1, y: ref.value, text: esc(ref.label), showarrow: false, xanchor: "right", yanchor: "bottom", font: { size: 11 } }] });
const DAYX = { showspikes: true, spikemode: "across", spikesnap: "cursor", spikecolor: "var(--ink)", spikethickness: 1, spikedash: "solid", showgrid: false };

// One series per day as a line (no legend, the label names it), the last value labelled at its end dot.
export function lineFig(points, ytitle = "Users", unit = "users", ref = null) {
  const x = points.map(p => p.label), y = points.map(p => p.value), n = points.length;
  return { aria: ytitle + " per day", data: [
    { type: "scatter", mode: "lines", x, y, line: { color: "var(--rel)", width: 2 }, hovertext: points.map(p => tipText(p.label, [[compact(p.value), unit]])), hovertemplate: HT },
    ...(n ? [{ type: "scatter", mode: "markers+text", x: [x[n - 1]], y: [y[n - 1]], text: [compact(y[n - 1])], textposition: "middle right", cliponaxis: false,
      marker: { color: "var(--rel)", size: 8, line: { color: "var(--paper)", width: 2 } }, hoverinfo: "skip" }] : [])],
    layout: { height: 220, hovermode: "x", margin: { l: 8, r: 40, t: 10, b: 8 }, xaxis: DAYX, yaxis: zeroY(y, ytitle), ...refLayout(ref) } };
}
// One day's tooltip rows, the largest first: [value, label, key class].
export const dayTip = (series, i) => series.map((s, j) => [s.values[i], s.label, s.cls, j]).sort((a, b) => b[0] - a[0]).map(([v, l, c, j]) => [compact(v), l, c, j]);
// Several lines on one axis, the total (cls "total") first, under the others; each day's box lists every line.
export function multiLineFig(labels, series, ytitle = "Users", ref = null) {
  return { aria: ytitle + " per day by value", data: series.map(s => ({ type: "scatter", mode: "lines", x: labels, y: s.values, line: { color: KEY(s.cls), width: 2 },
      opacity: s.cls === "total" ? 0.45 : 1, hoverinfo: "skip" }))
    .concat([carrier(labels, labels.map((_, i) => Math.max(0, ...series.map(s => s.values[i]))), labels, labels.map((_, i) => dayTip(series, i)))]),
    layout: { height: 220, hovermode: "x", xaxis: DAYX, yaxis: zeroY(series.flatMap(s => s.values), ytitle), ...refLayout(ref) } };
}

// Grouped vertical bars on one count axis: per metric (x, its short name) one bar per segment in --c1..--c6, GA's total
// once over the group; each bar its own box (metric, segment, value, share of the metric's total).
// st: {segs, bars: [{label, short, values, total}]}.
export function groupFig(st) {
  const x = st.bars.map(b => b.short);
  const data = st.segs.length ? st.segs.map((seg, j) => ({ type: "bar", x, y: st.bars.map(b => b.values[j]), marker: { color: KEY("c" + (j + 1)) },
    hovertext: st.bars.map(b => tipText(b.label, [[compact(b.values[j]), seg, "c" + (j + 1)], [pct(b.values[j], b.total), "of the total"]])), hovertemplate: HT }))
    : [{ type: "bar", x, y: x.map(() => 0), hoverinfo: "skip" }];
  return { aria: "Count metrics compared", data, layout: { height: 260, barmode: "group", bargap: 0.25, xaxis: { type: "category", showgrid: false },
    yaxis: zeroY(st.bars.flatMap(b => [b.total, ...b.values]), "Count"),
    annotations: st.bars.map(b => ({ x: b.short, y: Math.max(b.total, ...b.values), text: "<b>" + compact(b.total) + "</b>", showarrow: false, yanchor: "bottom" })) } };
}

// --- the chapter grid: every chapter chart shares one x layout (fixed side margins, no automargin), so they line up.
const CHX = { type: "category", showgrid: false };
// a 0-100% axis (with tickvals Plotly drops ticksuffix, so the texts are given)
const PCT = { tickvals: [0, 25, 50, 75, 100], ticktext: ["0%", "25%", "50%", "75%", "100%"] };
const CHM = { l: 64, r: 52, t: 10, b: 30 };
const chY = (ys, t) => ({ ...zeroY(ys, t), automargin: false });
const chTip = c => "Chapter " + roman(c.chapter);
// The funnel as grouped bars, x = chapter, the five stages in --c1..--c5 on the left axis (users), the retention
// (opened / chapter I's opened) as a --c6 line on a titled right 0-100% axis (a dual axis the owner asked for,
// 2026-10-23); one box per chapter lists the five stages, the retention and the solve rate.
export function funnelFig(f) {
  const x = f.map(c => roman(c.chapter)), ret = retention(f);
  return { aria: "Chapter funnel and retention", data: STAGES.map(([k], j) => ({ type: "bar", x, y: f.map(c => c[k]), marker: { color: KEY("c" + (j + 1)) }, hoverinfo: "skip" }))
    .concat([{ type: "scatter", mode: "lines+markers", x, y: f.map(ret), yaxis: "y2", line: { color: "var(--c6)", width: 2 },
      marker: { color: "var(--c6)", size: 8, line: { color: "var(--paper)", width: 2 } }, hoverinfo: "skip" },
    carrier(x, f.map(c => Math.max(...STAGES.map(([k]) => c[k]))), f.map(chTip), f.map(c => STAGES.map(([k, name], j) => [c[k], name, "c" + (j + 1), j])
      .concat([[pctOf(ret(c)), "retention", "c6", STAGES.length], [pct(c.solved, c.opened), "solve rate"]])))]),
    layout: { height: 260, barmode: "group", bargap: 0.2, hovermode: "x", margin: CHM, xaxis: CHX, yaxis: chY(f.flatMap(c => STAGES.map(([k]) => c[k])), "Users"),
      yaxis2: { title: title("Retention"), overlaying: "y", side: "right", range: [0, 105], ...PCT, showgrid: false, zeroline: false, automargin: false } } };
}
// The solve rate (solved / opened) per chapter on a 0-100% axis, in the funnel's columns; chapters nobody opened have no dot.
export function solveRateFig(f) {
  const x = f.map(c => roman(c.chapter));
  return { aria: "Solve rate per chapter", data: [{ type: "scatter", mode: "lines+markers", x, y: f.map(solveRate), line: { color: "var(--rel)", width: 2 },
    marker: { color: "var(--rel)", size: 8, line: { color: "var(--paper)", width: 2 } }, hoverinfo: "skip" },
  carrier(x, f.map(c => solveRate(c) ?? 0), f.map(chTip), f.map(c => [[c.solved + " of " + c.opened + " solved (" + pct(c.solved, c.opened) + ")"]]))],
  layout: { height: 180, hovermode: "x", margin: CHM, xaxis: CHX, yaxis: { title: title("Solve rate"), range: [0, 105], ...PCT, automargin: false } } };
}
// Grouped bars per chapter on one axis titled t; g: [{chapter, values, tip}], series: [[name, key class]].
export function chapterBarsFig(g, series, t = "Users", fmt = compact) {
  const x = g.map(c => roman(c.chapter));
  return { aria: t + " per chapter", data: series.map(([, cls], j) => ({ type: "bar", x, y: g.map(c => c.values[j]), marker: { color: KEY(cls) }, hoverinfo: "skip" }))
    .concat([carrier(x, g.map(c => Math.max(0, ...c.values)), g.map(chTip), g.map(c => series.map(([name, cls], j) => [fmt(c.values[j]), name, cls, j]).concat(c.tip || [])))]),
    layout: { height: 200, barmode: "group", bargap: 0.25, hovermode: "x", margin: CHM, xaxis: CHX, yaxis: chY(g.flatMap(c => c.values), t) } };
}
// One value per chapter as a --c1 line with dots (no dot where val is null), a small chart under the bars it explains.
export function chapterLineFig(g, val, t, tip) {
  const x = g.map(c => roman(c.chapter)), y = g.map(val);
  return { aria: t + " per chapter", data: [{ type: "scatter", mode: "lines+markers", x, y, line: { color: "var(--c1)", width: 2 },
    marker: { color: "var(--c1)", size: 7, line: { color: "var(--paper)", width: 2 } }, hoverinfo: "skip" }, carrier(x, y.map(v => v ?? 0), g.map(chTip), g.map(tip))],
  layout: { height: 150, hovermode: "x", margin: CHM, xaxis: CHX, yaxis: chY(y, t) } };
}

// Horizontal bars, one row per item, its label above its bars (so long names fit at 390 px), one bar per series in its
// key colour, the value at each bar's end (zeros too); one box per row. rows: [{label, values, tip}], series: [[name,
// cls]]; w: the box's width, which cuts long labels. No rows: the empty frame.
export function hbarFig(rows, series, w = 640, fmt = compact, aria = "Bars") {
  const n = series.length, bw = 0.4 / n, max = Math.max(0, ...rows.flatMap(r => r.values)), chars = Math.max(10, Math.floor(w / 7.4));
  const cut = s => (s.length > chars ? s.slice(0, chars - 3) + "..." : s), ys = rows.map((_, i) => i);
  return { aria, data: series.map(([, cls], j) => ({ type: "bar", orientation: "h", x: rows.map(r => r.values[j] || 0), y: ys.map(i => i + 0.04 + bw * (j + 0.5)), width: bw * 0.85,
    marker: { color: KEY(cls) }, text: rows.map(r => fmt(r.values[j] || 0)), texttemplate: "%{text}", textposition: "outside", constraintext: "none", textfont: { size: 11 }, cliponaxis: false, hoverinfo: "skip" }))
    .concat(rows.length ? [carrier(ys.map(i => i + 0.25), rows.map(r => Math.max(0, ...r.values)), rows.map(r => r.label), rows.map(r => series.map(([name, c], j) => [fmt(r.values[j] || 0), name, c, j]).concat(r.tip || [])), true)] : []),
    layout: { height: Math.max(1, rows.length) * (24 + n * 13) + 34, hovermode: "y", margin: { l: 4, r: 40, t: 4, b: 8 },
      xaxis: { range: [0, (max || 1) * 1.12], rangemode: "tozero", zeroline: true },
      yaxis: { range: [Math.max(1, rows.length) - 0.5, -0.55], showticklabels: false, ticks: "", showgrid: false, zeroline: false },
      annotations: rows.map((r, i) => ({ xref: "paper", x: 0, y: i, xanchor: "left", yanchor: "bottom", text: esc(cut(r.label)), showarrow: false })) } };
}

// --- donuts: the first five slices by value, the rest folded into Other (never a seventh colour); Other keeps how
// many rows it sums (n), so raw data can say so.
export function fold(items, n = 5) {
  const s = [...items].filter(i => i.value > 0).sort((a, b) => b.value - a.value);
  if (s.length <= n + 1) return s;
  return s.slice(0, n).concat([{ label: "Other", value: s.slice(n).reduce((t, i) => t + i.value, 0), n: s.length - n }]);
}
// The ring, clockwise from 12 o'clock in the slices' order, total and what in the centre; nothing: the empty ring, 0.
export function donutFig(s, total, what, aria) {
  const sum = s.reduce((t, i) => t + i.value, 0);
  const pie = { type: "pie", hole: 0.6, sort: false, direction: "clockwise", rotation: 0, textinfo: "none", marker: { line: { color: "var(--paper)", width: 2 } } };
  return { aria, data: [sum ? { ...pie, values: s.map(i => i.value), labels: s.map((_, j) => "s" + j), marker: { ...pie.marker, colors: s.map((_, j) => KEY("c" + (j + 1))) },
    hovertext: s.map(i => tipText(i.label, [[i.value + " " + what, pct(i.value, total)]])), hovertemplate: HT }
    : { ...pie, values: [1], labels: ["empty"], marker: { ...pie.marker, colors: ["var(--rule)"] }, hoverinfo: "skip" }],
  layout: { width: 180, height: 180, margin: { l: 2, r: 2, t: 2, b: 2 },
    annotations: [{ xref: "paper", yref: "paper", x: 0.5, y: 0.5, showarrow: false, text: '<span style="font-size:22px"><b>' + compact(total) + "</b></span><br>" + esc(what) }] } };
}
// unique: GA's own total (each person once); without it the centre is the slices' sum. fixed: the items are a fixed
// list of entities (the site sections, the modes...), kept in their order and colour, zeros listed in the legend.
export function donutHtml(items, what, aria, unique, fixed = false) {
  const s = fixed ? items : fold(items);
  const sum = s.reduce((t, i) => t + i.value, 0), total = unique > 0 ? unique : sum;
  return '<div class="donut-row"><div class="donut">' + plotHtml(donutFig(s, total, what, aria)) + '</div><ul class="donut-legend">' + s.map((i, j) => '<li><button type="button" class="key" data-series="' + j + '" aria-pressed="true"><i class="c' + (j + 1) + '"></i><span>' + esc(i.label) +
    '</span><b class="num">' + i.value + '</b><span class="num muted">' + pct(i.value, total) + "</span></button></li>").join("") + "</ul></div>" +
    (sum > total ? '<p class="muted">' + total + " " + esc(what) + " in all; the slices add up to " + sum + " because some count in more than one.</p>" : "");
}

// --- the map: Plotly's own world (its topojson self-hosted in site/topojson/), one bubble per country at its centroid
// from site/world.json (lon/lat under GA's English country names, ASCII-folded), its area proportional to the count.
export const countryKey = s => String(s).normalize("NFD").replace(/\p{M}/gu, "").replace(/\p{Pi}|\p{Pf}/gu, "'");
export const MAX_BUBBLE = 60;   // px, the largest bubble's diameter
export function mapFig(placed, d, w = 640) {
  const max = Math.max(1, ...placed.map(c => c.value)), s = [...placed].sort((a, b) => b.value - a.value);
  return { aria: d.label + " by country", data: [{ type: "scattergeo", lon: s.map(c => c.ll[0]), lat: s.map(c => c.ll[1]), hovertext: s.map(c => tipText(c.label, [[c.value + " " + d.unit]])),
    hovertemplate: HT, marker: { size: s.map(c => c.value), sizemode: "area", sizeref: (2 * max) / MAX_BUBBLE ** 2, sizemin: 4, color: "var(--rel)", opacity: 0.6,
      line: { color: "var(--paper)", width: 1.5 } } }],
  layout: { height: Math.max(180, Math.round(Math.min(w, 1200) * 0.46)), margin: { l: 0, r: 0, t: 0, b: 0 },
    geo: { projection: { type: "natural earth" }, lataxis: { range: [-57, 84] }, resolution: 110, showframe: false, bgcolor: "rgba(0,0,0,0)",
      showland: true, landcolor: "var(--shade)", showcountries: true, countrycolor: "var(--rule)", showcoastlines: true, coastlinecolor: "var(--rule)", showocean: false, showlakes: false } } };
}
// d: what a bubble counts ({label, unit}); foot: raw data's total rows; world null (centroids not loaded): the table alone.
export function mapHtml(countries, world, d = { label: "Visitors", unit: "visitors" }, foot = [], w = 640) {
  const list = countries.map(c => ({ label: gaText(c.country), value: Number(c.users) || 0 }));
  const placed = [], off = [];
  for (const c of list) { const ll = world && world.centroids[countryKey(c.label)]; (ll && c.value > 0 ? placed : off).push({ ...c, ll }); }
  return (world ? plotHtml(mapFig(placed, d, w)) : "") + (world && off.length ? '<p class="muted">Not on the map: ' + off.map(c => esc(c.label) + " (" + c.value + ")").join(", ") + ".</p>" : "") +
    raw("countries", barTable("Country", list.map(c => [c.label, c.value]), d.label, foot));
}
