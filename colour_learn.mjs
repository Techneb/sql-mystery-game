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
  const script = plainSql(databaseHtml.match(/<details class="script">[\s\S]*?<pre><code>([\s\S]*?)<\/code><\/pre>/)[1]);
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

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = "site/learn/";
  const schema = bakerySchema(fs.readFileSync(dir + "database.html", "utf8"));
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".html")).sort()) {
    const html = fs.readFileSync(dir + f, "utf8"), out = colourPage(html, schema);
    if (out !== html) { fs.writeFileSync(dir + f, out); console.log("coloured " + dir + f); }
  }
}
