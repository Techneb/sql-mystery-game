// Colours the SQL of every <pre><code> block in site/learn/*.html with the game's own highlighter, at build
// time, so the handbook pages stay free of JavaScript. Run it after editing any example: node colour_learn.mjs
// It also writes, after each <pre class="wrong"> block (on any learn page), the terminal's own refusal of it
// (strictCheck on the bakery schema of learn/database.html), so the page always shows what the game says.
// Idempotent: a coloured block is stripped back to plain SQL and coloured again to the same bytes.
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { highlightSql, strictCheck } from "./site/app.js";

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

// The side menu of a learning chapter page (one whose Learning chapters summary is current): all fourteen chapters,
// read from the page's own dropdown, and under the current one its h2 sections; handbook.js highlights the one read.
const SIDE_RE = /<!-- side menu: colour_learn.mjs -->\n[\s\S]*?<!-- \/side menu -->\n/;
export function sideMenuPage(html) {
  html = html.replace(SIDE_RE, "");
  const ol = html.match(/<details class="learn-chapters"><summary class="current">[^<]*<\/summary><ol>([\s\S]*?)<\/ol>/);
  if (!ol) return html;
  const main = html.slice(html.indexOf('<main class="learn'));
  const sections = [...main.matchAll(/<h2 id="([\w-]+)"[^>]*>([\s\S]*?)<\/h2>/g)]
    .map(([, id, t]) => `      <li><a href="#${id}">${t.replace(/<[^>]+>/g, "")}</a></li>\n`).join("");
  const items = [...ol[1].matchAll(/<li>(?:<a href="([^"]+)">|<span class="current" aria-current="page">)([^<]*)<\/(?:a|span)><\/li>/g)]
    .map(([, href, label]) => href ? `  <li><a href="${href}">${label}</a></li>\n`
      : `  <li class="here"><span aria-current="page">${label}</span>` + (sections ? `\n    <ol>\n${sections}    </ol>\n  ` : "") + "</li>\n").join("");
  const nav = '<!-- side menu: colour_learn.mjs -->\n<nav class="side-menu" aria-label="Learning chapters"><ol>\n' + items + "</ol></nav>\n<!-- /side menu -->\n";
  return html.replace(/<main class="learn(?: with-side)?">\n/, '<main class="learn with-side">\n' + nav);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = "site/learn/";
  const schema = bakerySchema(fs.readFileSync(dir + "database.html", "utf8"));
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".html")).sort()) {
    const html = fs.readFileSync(dir + f, "utf8"), out = sideMenuPage(colourPage(html, schema));
    if (out !== html) { fs.writeFileSync(dir + f, out); console.log("coloured " + dir + f); }
  }
}
