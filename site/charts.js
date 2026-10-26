// site/charts.js -- the desk's chart toolkit: inline SVG and tables drawn from plain numbers, none of it knowing GA
// (monitor.js holds the GA model and the views). Colours are the page's tokens (--rel, --rule, --ink, --paper, and
// admin.css's categorical --c1..--c6), so day and night follow for free. Pure renderers are exported for test_desk.mjs;
// wireTips and wireCsv run only in a browser.
import { csvText, downloadText, escapeHtml as esc, gaText } from "./shared.js";

export const pct = (a, b) => (b ? Math.round((100 * a) / b) + "%" : "-");

// A table whose last column is a CSS bar scaled to the largest value.
// foot: [label, value] rows (totals) under the bars, without a bar.
export function barTable(head, rows, valHead = "Users", foot = []) {
  const max = Math.max(1, ...rows.map(r => r[1]));
  return '<table class="detail stats"><thead><tr><th>' + esc(head) + "</th><th>" + esc(valHead) + "</th><th></th></tr></thead><tbody>" +
    rows.map(([k, v]) => "<tr><td>" + esc(k) + '</td><td class="num">' + esc(v) + '</td><td class="bar-cell"><span class="bar" style="width:' +
      Math.round((100 * v) / max) + '%"></span></td></tr>').join("") + "</tbody>" +
    (foot.length ? "<tfoot>" + foot.map(([k, v]) => "<tr><td>" + esc(k) + '</td><td class="num">' + esc(v) + "</td><td></td></tr>").join("") + "</tfoot>" : "") + "</table>";
}
// Every chart keeps its numbers under it, closed.
// Raw data under a chart, its Export CSV button inside the toggle, over the table (wireCsv reads the table it holds; owner 2026-10-24).
export const raw = (name, table) => '<details class="numbers"><summary>Raw data</summary><button type="button" class="quiet csv" data-csv="' + esc(name) +
  '">Export CSV</button>' + table + "</details>";
// cells: rows of cell texts (the header row first), as read from a Raw data table.
export const tableCsv = cells => csvText(cells.map(r => r.map(c => String(c).trim())));
// Every Export CSV button in box saves the table of its Raw data toggle as ga-<name>-<date>.csv.
export function wireCsv(box) {
  box.addEventListener("click", e => {
    const b = e.target.closest && e.target.closest("button.csv");
    if (!b || !box.contains(b)) return;
    e.preventDefault();
    const t = b.closest("details").querySelector("table");
    downloadText("ga-" + b.dataset.csv + "-" + new Date().toISOString().slice(0, 10) + ".csv", tableCsv([...t.rows].map(r => [...r.cells].map(c => c.textContent))));
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

export const r1 = v => +v.toFixed(1);
// The y axis: hairline grid, tick labels and the axis title above them.
export const yAxis = (tk, y, L, x2, fmt, title) => '<text class="axis-title" x="2" y="11">' + esc(title) + "</text>" +
  tk.map(v => '<line class="grid" x1="' + L + '" x2="' + x2 + '" y1="' + y(v) + '" y2="' + y(v) + '"/><text class="tick" x="' + (L - 6) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + fmt(v) + "</text>").join("");

// opts.ref {value, label}: a dashed horizontal reference line across the plot (an average, say), labelled at its right
// end; the ticks reach it. Any line chart takes one.
export const refLine = (ref, y, L, x2) => !ref ? "" : '<line class="ref-line" x1="' + L + '" x2="' + x2 + '" y1="' + y(ref.value) + '" y2="' + y(ref.value) +
  '"/><text class="ref-label" x="' + (x2 - 10) + '" y="' + r1(y(ref.value) - 4) + '" text-anchor="end">' + esc(ref.label) + "</text>";
const refMax = opts => (opts.ref ? opts.ref.value : 0);

// One series as a line (no legend, the label names it): 2 px line over a 10% wash, hairline grid, the last value
// labelled at its end dot; each point owns a full-height hover strip (crosshair and dot on :hover, the tooltip from
// its data-k/data-v).
export function lineSvg(points, w = 640, title = "Users", unit = "users", opts = {}) {
  const H = 200, L = 40, R = 44, T = 22, B = 24, pw = Math.max(1, w - L - R), ph = H - T - B;
  const tk = ticks(Math.max(...points.map(p => p.value), refMax(opts))), top = tk.at(-1);
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
    '<path class="area" d="' + line + "L" + last[0] + "," + (T + ph) + "L" + xy[0][0] + "," + (T + ph) + 'Z"/><path class="line" d="' + line + '"/>' + refLine(opts.ref, y, L, L + pw) +
    '<circle class="dot end" cx="' + last[0] + '" cy="' + last[1] + '" r="4"/><text class="val" x="' + (last[0] + 8) + '" y="' + (last[1] + 4) + '">' + esc(compact(points.at(-1).value)) + "</text>" +
    points.map((p, i) => '<g class="hit"' + tipAttrs(p.label, [[compact(p.value), unit]]) + '><rect x="' + r1(xy[i][0] - strip / 2) + '" y="' + T + '" width="' + strip + '" height="' + ph + '"/><line class="cross" x1="' + xy[i][0] + '" x2="' + xy[i][0] + '" y1="' + T + '" y2="' + (T + ph) +
      '"/><circle class="dot" cx="' + xy[i][0] + '" cy="' + xy[i][1] + '" r="4"/></g>').join("") + "</svg>";
}

// One day's tooltip rows, the largest first: [value, label, key class].
export const dayTip = (series, i) => series.map(s => [s.values[i], s.label, s.cls]).sort((a, b) => b[0] - a[0]).map(([v, l, c]) => [compact(v), l, c]);
// Several lines on one axis, lineSvg's frame; the total (cls "total") drawn first, under the others. Each day's hover
// strip shows the crosshair and a dot per series.
export function multiLineSvg(labels, series, w = 640, title = "Users", opts = {}) {
  const H = 200, L = 40, R = 16, T = 22, B = 24, pw = Math.max(1, w - L - R), ph = H - T - B, n = labels.length;
  const tk = ticks(Math.max(1, ...series.flatMap(s => s.values), refMax(opts))), top = tk.at(-1);
  const x = i => r1(L + (n < 2 ? pw / 2 : (i * pw) / (n - 1))), y = v => r1(T + ph - (v * ph) / top);
  const step = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(pw / 70)))), strip = r1(n < 2 ? pw : pw / (n - 1));
  const col = s => "var(--" + (s.cls === "total" ? "ink" : s.cls) + ")";
  return '<svg class="chart line-chart multi-chart" width="' + w + '" height="' + H + '" viewBox="0 0 ' + w + " " + H + '" role="img" aria-label="' + esc(title) + ' per day by value">' +
    yAxis(tk, y, L, L + pw, compact, title) +
    labels.map((l, i) => (i % step && i !== n - 1) || (i !== n - 1 && n - 1 - i < step / 2) ? "" :
      '<text class="tick" x="' + x(i) + '" y="' + (H - 6) + '" text-anchor="middle">' + esc(l.slice(5)) + "</text>").join("") +
    series.map(s => '<path class="sl ' + esc(s.cls) + '" style="stroke:' + col(s) + '" d="M' + s.values.map((v, i) => x(i) + "," + y(v)).join("L") + '"/>').join("") + refLine(opts.ref, y, L, L + pw) +
    labels.map((l, i) => '<g class="hit"' + tipAttrs(l, dayTip(series, i)) + '><rect x="' + r1(x(i) - strip / 2) + '" y="' + T + '" width="' + strip + '" height="' + ph +
      '"/><line class="cross" x1="' + x(i) + '" x2="' + x(i) + '" y1="' + T + '" y2="' + (T + ph) + '"/>' +
      series.map(s => '<circle class="dot" style="fill:' + col(s) + '" cx="' + x(i) + '" cy="' + y(s.values[i]) + '" r="4"/>').join("") + "</g>").join("") + "</svg>";
}

export const STAGES = [["opened", "Opened"], ["q1", "Ran 1 query"], ["q5", "Ran 5"], ["q20", "Ran 20"], ["solved", "Solved"]];
// A bar from the baseline up, its top corners rounded (r <= 2, at most half its width).
export const barPath = (x, y, bw, h) => { const r = Math.min(2, bw / 2, h); return "M" + x + "," + r1(y + h) + "v" + r1(-(h - r)) + "q0," + r1(-r) + " " + r1(r) + "," + r1(-r) +
  "h" + r1(bw - 2 * r) + "q" + r1(r) + ",0 " + r1(r) + "," + r1(r) + "v" + r1(h - r) + "Z"; };
// Chapters as the game names them.
export const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
export const roman = n => ROMAN[n] || String(n);
export const solveRate = c => (c.opened ? Math.round((100 * c.solved) / c.opened) : null);
// Retention: users who opened chapter N over those who opened chapter I (so I is 100%); null without chapter I openers.
export const retention = f => { const base = (f.find(c => c.chapter === 1) || {}).opened || 0; return c => (base ? Math.round((100 * c.opened) / base) : null); };
// Both chapter charts share one x layout (40 px each side, one column per chapter), so the solve rate lines up under
// the funnel.
export const CL = 40, CR = 40, CT = 22, CB = 24;
export const cols = (f, w) => { const pw = Math.max(1, w - CL - CR); return { pw, gw: pw / Math.max(1, f.length) }; };
// A percent line with dots: one point per chapter whose value is not null, mid-column.
export const pctLine = (f, val, gw, yr, cls) => {
  const pts = f.map((c, i) => [r1(CL + (i + 0.5) * gw), val(c)]).filter(p => p[1] !== null).map(([px, v]) => [px, yr(v)]);
  return pts.length ? '<path class="' + cls + '-line" d="M' + pts.map(p => p.join(",")).join("L") + '"/>' + pts.map(p => '<circle class="' + cls + '-dot" cx="' + p[0] + '" cy="' + p[1] + '" r="4"/>').join("") : "";
};
export const xLabels = (f, gw, H) => '<text class="tick" x="' + (CL - 6) + '" y="' + (H - 6) + '" text-anchor="end">Ch.</text>' +
  f.map((c, i) => '<text class="tick' + (gw < 32 ? " small" : "") + '" x="' + r1(CL + (i + 0.5) * gw) + '" y="' + (H - 6) + '" text-anchor="middle">' + roman(c.chapter) + "</text>").join("");
export const pctOf = v => (v === null ? "-" : v + "%");
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

export const legend = names => '<p class="legend">' + names.map((name, j) => '<span><i class="c' + (j + 1) + '"></i>' + esc(name) + "</span>").join("") +
  '<span><i class="c6 key-line"></i>Retention (right axis)</span></p>';

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

// Grouped vertical bars on one count axis: per metric (x group, its short name below) one bar per segment side by
// side in --c1..--c6, GA's total once centred over the group; each bar its own tooltip (metric, segment, value, share
// of the metric's total). st: {segs, bars: [{label, short, values, total}]}.
export function groupSvg(st, w = 640) {
  // groups too narrow for their names (390 px): every other name drops to a second line under the axis
  const L = 40, R = 16, T = 22, pw = Math.max(1, w - L - R), gw = pw / st.bars.length, two = gw < 64, B = two ? 36 : 24, H = 216 + B, ph = H - T - B;
  const tk = ticks(Math.max(1, ...st.bars.map(b => Math.max(b.total, ...b.values)))), top = tk.at(-1), y = v => r1(T + ph - (v * ph) / top);
  const n = Math.max(1, st.segs.length), inner = Math.min(gw * 0.8, n * 18), gap = inner / n > 4 ? 1 : 0, bw = (inner - gap * (n - 1)) / n;
  return '<svg class="chart stack-chart" width="' + w + '" height="' + H + '" viewBox="0 0 ' + w + " " + H + '" role="img" aria-label="Count metrics compared">' +
    yAxis(tk, y, L, L + pw, compact, "Count") +
    st.bars.map((b, i) => {
      const cx = L + (i + 0.5) * gw, x0 = cx - inner / 2;
      const bars = b.values.map((v, j) => !v ? "" : '<path class="seg c' + (j + 1) + '"' + tipAttrs(b.label, [[compact(v), st.segs[j], "c" + (j + 1)], [pct(v, b.total), "of the total"]]) +
        ' d="' + barPath(r1(x0 + j * (bw + gap)), y(v), r1(bw), r1(Math.max(1, T + ph - y(v)))) + '"/>').join("");
      return bars + '<text class="val" x="' + r1(cx) + '" y="' + (y(Math.max(b.total, ...b.values)) - 6) + '" text-anchor="middle">' + compact(b.total) + "</text>" +
        '<text class="tick" x="' + r1(cx) + '" y="' + (H - 6 - (two && i % 2 === 0 ? 12 : 0)) + '" text-anchor="middle">' + esc(b.short) + "</text>";
    }).join("") + '<line class="axis" x1="' + L + '" x2="' + (L + pw) + '" y1="' + (T + ph) + '" y2="' + (T + ph) + '"/></svg>';
}

// --- map: site/world.json (Natural Earth 110m, equirectangular 84N-57S, 1000 units wide; its centroids in lon/lat
// under GA's English country names, ASCII-folded), one bubble per country, its area proportional to users.
export const MAP = { W: 1000, N: 84, S: -57 };
MAP.H = Math.round((MAP.W * (MAP.N - MAP.S)) / 360);
export const project = (lon, lat) => [r1(((lon + 180) * MAP.W) / 360), r1(((MAP.N - lat) * MAP.H) / (MAP.N - MAP.S))];
export const countryKey = s => String(s).normalize("NFD").replace(/\p{M}/gu, "").replace(/\p{Pi}|\p{Pf}/gu, "'");
export const bubbleR = (v, max, rMax = 40) => (max > 0 && v > 0 ? r1(Math.max(3, rMax * Math.sqrt(v / max))) : 0);
// d: what a bubble counts ({label, unit}, e.g. "Visitors", "visitors"); foot: raw data's total rows.
export function mapHtml(countries, world, d = { label: "Visitors", unit: "visitors" }, foot = []) {
  const list = countries.map(c => ({ label: gaText(c.country), value: Number(c.users) || 0 }));
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

// Horizontal bars, one row per item (its label above its bars, so long names fit at 390 px), one bar per series in
// --c1.., the value at each bar's end; one hover row per item. rows: [{label, values, tip}], series: [[name, cls]].
// No rows: the empty frame.
export const hbarPath = (y, bw, h) => { const r = Math.min(2, h / 2, bw); return "M0," + y + "h" + r1(bw - r) + "q" + r + ",0 " + r + "," + r + "v" + r1(h - 2 * r) + "q0," + r + " " + -r + "," + r + "h" + r1(-(bw - r)) + "Z"; };
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
export const isNum = c => typeof c === "number" || /^(-|\d+(\.\d+)?%?)$/.test(String(c));
export const tableHtml = (heads, rows) => '<div class="wide"><table class="detail stats"><thead><tr>' + heads.map((h, i) => "<th" + (rows.length && i && isNum(rows[0][i]) ? ' class="num"' : "") + ">" + esc(h) + "</th>").join("") +
  "</tr></thead><tbody>" + rows.map(r => "<tr>" + r.map(c => "<td" + (isNum(c) ? ' class="num"' : "") + ">" + esc(c) + "</td>").join("") + "</tr>").join("") + "</tbody></table></div>";
export const legendOf = series => series.length > 1 ? '<p class="legend">' + series.map(([n, c]) => '<span><i class="' + c + '"></i>' + esc(n) + "</span>").join("") + "</p>" : "";

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

// One tooltip for every chart: a mark's data-k / data-v, written with textContent, beside the pointer (kept inside
// the window). A mouse leaving the box hides it; a touch tap shows it until the next tap elsewhere.
export function wireTips(box) {
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
