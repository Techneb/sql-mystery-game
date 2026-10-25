// Builds the handbook pages (site/learn/*.html) in place, and the handbook's part of site/sitemap.xml. Run it after
// editing any example or the table of contents below: node colour_learn.mjs. The name is historical: it colours the
// SQL and also writes the navigation.
// It colours the SQL of every <pre><code> block with the game's own highlighter, at build time, so the handbook pages
// stay free of JavaScript. It also writes, after each <pre class="wrong"> block (on any learn page), the terminal's
// own refusal of it (strictCheck on the bakery schema of learn/database.html), so the page always shows what the game
// says. It writes the menu row, the pager, each learning chapter's side menu and the index's chapter list from
// CHAPTERS, between marker comments.
// Idempotent: a coloured block is stripped back to plain SQL and coloured again to the same bytes.
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { highlightSql } from "./site/terminal.js";
import { strictCheck } from "./site/strict.js";

const ENT = { "&lt;": "<", "&gt;": ">", "&amp;": "&", "&quot;": '"', "&#x27;": "'", "&#39;": "'" };
export const plainSql = (inner) => inner.replace(/<\/?span[^>]*>/g, "").replace(/&(lt|gt|amp|quot|#x27|#39);/g, (e) => ENT[e]);
export const colourBlock = (inner) => highlightSql(plainSql(inner)).slice(0, -1);
const escHtml = (s) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
// The bakery tables as strictCheck wants them ({ table: [[column, type, pk]] }), read from database.html's script.
export function bakerySchema(databaseHtml) {
  const script = plainSql(databaseHtml.match(/<details class="script">[\s\S]*?<pre[^>]*><code>([\s\S]*?)<\/code><\/pre>/)[1]);
  return Object.fromEntries([...script.matchAll(/CREATE TABLE (\w+) \(([^;]*)\);/g)].map(([, t, cols]) =>
    [t, cols.split(/,(?![^(]*\))/).map((c) => c.trim().split(/\s+/)).map((w) => [w[0], w[1], /PRIMARY KEY/.test(w.join(" ")) ? 1 : 0])]));
}
const refusalHtml = (r) => '<div class="refusal"><code>ERROR: ' + escHtml(r.error) + "</code> " + escHtml(r.why) + "</div>";
export const colourPage = (html, schema) => html
  .replace(/<pre( class="wrong")?><code>([\s\S]*?)<\/code><\/pre>(\n<div class="refusal">[\s\S]*?<\/div>)?/g, (_, wrong, inner) => {
    const out = "<pre" + (wrong || "") + "><code>" + colourBlock(inner) + "</code></pre>";
    if (!wrong) return out;
    const r = strictCheck(plainSql(inner), schema);
    if (!r) throw new Error("a wrong example is not refused: " + plainSql(inner));
    return out + "\n" + refusalHtml(r);
  });

// The handbook's table of contents, the one list its navigation is built from: the fourteen learning chapters in
// reading order, each [page, menu label, the index's one-line blurb]. Pages read: index, the chapters, exercises,
// grammar. Adding or reordering a chapter = one edit here (the new page copied from a sibling, for its markers), then
// node colour_learn.mjs. Pager and index labels are each target page's own <h1>.
export const CHAPTERS = [
  ["database.html", "Database", "the example data, with a script to recreate it."],
  ["schema.html", "Schema", "keys, relationships, exploring a database."],
  ["select-where.html", "SELECT", "choosing columns and filtering rows."],
  ["order-by-limit.html", "ORDER BY", "sorting and keeping the top rows."],
  ["like.html", "LIKE", "searching text with wildcards."],
  ["dates-times.html", "Dates", "comparing, ranges, substr and CAST, and why ISO dates sort."],
  ["group-by-having.html", "GROUP BY", "counting and summing per group."],
  ["joins.html", "JOIN", "combining tables and finding what is missing."],
  ["nulls.html", "NULL", "three-valued logic, COUNT, COALESCE and the NOT IN trap."],
  ["case-when.html", "CASE", "labels, buckets and conditional counts."],
  ["subqueries.html", "Subqueries", "scalar, IN, EXISTS, correlated and derived tables."],
  ["set-operations.html", "UNION", "stacking two results, the rows they share, the rows one lacks."],
  ["window-functions.html", "Windows", "ranking rows and comparing with the previous one."],
  ["ctes.html", "CTEs", "named steps and following chains."],
];
export const READING = ["index.html", ...CHAPTERS.map((c) => c[0]), "exercises.html", "grammar.html"];
const isChapter = (f) => CHAPTERS.some((c) => c[0] === f);

// Each generated block sits between a <!-- name: colour_learn.mjs --> line and a <!-- /name --> line.
const fill = (html, name, body, f) => {
  const re = new RegExp(`(<!-- ${name}: colour_learn\\.mjs -->\\n)[\\s\\S]*?(<!-- \\/${name} -->\\n)`);
  if (!re.test(html)) throw new Error(`${f}: no ${name} markers (copy them from a sibling page)`);
  return html.replace(re, (_, a, b) => a + body + b);
};
const h1 = (html, f) => { const m = html.match(/<h1>([^<]*)<\/h1>/); if (!m) throw new Error(f + ": no plain <h1>"); return m[1]; };
const item = (f, href, label) => (f === href ? `<span class="current" aria-current="page">${label}</span>` : `<a href="${href}">${label}</a>`);

// The menu row: Index, the Learning chapters dropdown (its summary current, naming the page, on a chapter page),
// Exercises, Grammar.
export function menuHtml(f) {
  const i = CHAPTERS.findIndex((c) => c[0] === f);
  const summary = i < 0 ? "<summary>Learning chapters</summary>" : `<summary class="current">Learning chapters: ${i + 1}. ${CHAPTERS[i][1]}</summary>`;
  return `<nav class="learn-menu">${item(f, "index.html", "Index")} &middot;\n  <details class="learn-chapters">${summary}<ol>\n` +
    CHAPTERS.map(([href, label], j) => `    <li>${item(f, href, `${j + 1}. ${label}`)}</li>\n`).join("") +
    `  </ol></details> &middot;\n  ${item(f, "exercises.html", "Exercises")} &middot;\n  ${item(f, "grammar.html", "Grammar")}</nav>\n`;
}
// The previous/next pager in reading order, each label naming the target's <h1> (the index keeps an empty prev slot).
export function pagerHtml(f, pages) {
  const i = READING.indexOf(f), prev = READING[i - 1], next = READING[i + 1];
  return '<nav class="learn-pager">' + (prev ? `<a class="prev" href="${prev}">Previous: ${h1(pages[prev], prev)}</a>` : "<span></span>") +
    (next ? `<a class="next" href="${next}">Next: ${h1(pages[next], next)}</a>` : "") + "</nav>\n";
}
// The side menu of a learning chapter: all fourteen, and under the current one its h2 sections (handbook.js marks the
// one being read). Inserted at the top of <main>, which gets the with-side class.
const SIDE_RE = /<!-- side menu: colour_learn.mjs -->\n[\s\S]*?<!-- \/side menu -->\n/;
export function sideMenuPage(html, f) {
  html = html.replace(SIDE_RE, "");
  if (!isChapter(f)) return html;
  const main = html.slice(html.indexOf('<main class="learn'));
  const sections = [...main.matchAll(/<h2 id="([\w-]+)"[^>]*>([\s\S]*?)<\/h2>/g)]
    .map(([, id, t]) => `      <li><a href="#${id}">${t.replace(/<[^>]+>/g, "")}</a></li>\n`).join("");
  const items = CHAPTERS.map(([href, label], j) => href !== f ? `  <li><a href="${href}">${j + 1}. ${label}</a></li>\n`
    : `  <li class="here"><span aria-current="page">${j + 1}. ${label}</span>` + (sections ? `\n    <ol>\n${sections}    </ol>\n  ` : "") + "</li>\n").join("");
  const nav = '<!-- side menu: colour_learn.mjs -->\n<nav class="side-menu" aria-label="Learning chapters"><ol>\n' + items + "</ol></nav>\n<!-- /side menu -->\n";
  return html.replace(/<main class="learn(?: with-side)?">\n/, '<main class="learn with-side">\n' + nav);
}
// The index's list of learning chapters: each target's <h1>, then its blurb.
const tocHtml = (pages) => '<ol class="toc">\n' + CHAPTERS.map(([href, , blurb]) => `<li><a href="${href}">${h1(pages[href], href)}</a>: ${blurb}</li>\n`).join("") + "</ol>\n";

// Every learn page ({ file: html } in, the same keys out): code coloured, refusals written, navigation generated.
export function buildPages(pages) {
  const odd = [...Object.keys(pages).filter((f) => !READING.includes(f)), ...READING.filter((f) => !(f in pages))];
  if (odd.length) throw new Error("CHAPTERS and site/learn/ disagree: " + odd.join(", "));
  const schema = bakerySchema(pages["database.html"]);
  return Object.fromEntries(READING.map((f) => {
    let h = fill(fill(colourPage(pages[f], schema), "menu", menuHtml(f), f), "pager", pagerHtml(f, pages), f);
    if (f === "index.html") h = fill(h, "toc", tocHtml(pages), f);
    return [f, sideMenuPage(h, f)];
  }));
}
// sitemap.xml: its other entries as they are, then the handbook in reading order, each keeping its lastmod (a new page
// gets today's).
export function sitemapXml(xml, today) {
  const loc = (f) => "https://mystery.alephb.uk/learn/" + (f === "index.html" ? "" : f);
  const last = (f) => (xml.match(new RegExp(`<loc>${loc(f).replace(/\./g, "\\.")}</loc><lastmod>([^<]*)</lastmod>`)) || [, today])[1];
  const lines = xml.split("\n"), first = lines.findIndex((l) => l.includes("<url>"));
  return [...lines.slice(0, first), ...lines.filter((l) => l.includes("<url>") && !l.includes("/learn/")),
    ...READING.map((f) => `  <url><loc>${loc(f)}</loc><lastmod>${last(f)}</lastmod></url>`), "</urlset>", ""].join("\n");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = "site/learn/";
  const pages = Object.fromEntries(fs.readdirSync(dir).filter((f) => f.endsWith(".html")).map((f) => [f, fs.readFileSync(dir + f, "utf8")]));
  for (const [f, out] of Object.entries(buildPages(pages)))
    if (out !== pages[f]) { fs.writeFileSync(dir + f, out); console.log("wrote " + dir + f); }
  const xml = fs.readFileSync("site/sitemap.xml", "utf8"), out = sitemapXml(xml, new Date().toISOString().slice(0, 10));
  if (out !== xml) { fs.writeFileSync("site/sitemap.xml", out); console.log("wrote site/sitemap.xml"); }
}
