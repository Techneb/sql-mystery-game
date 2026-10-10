// Colours the SQL of every <pre><code> block in site/learn/*.html with the game's own highlighter, at build
// time, so the handbook pages stay free of JavaScript. Run it after editing any example: node colour_learn.mjs
// Idempotent: a coloured block is stripped back to plain SQL and coloured again to the same bytes.
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { highlightSql } from "./site/app.js";

const ENT = { "&lt;": "<", "&gt;": ">", "&amp;": "&", "&quot;": '"', "&#x27;": "'", "&#39;": "'" };
export const colourBlock = (inner) => highlightSql(inner.replace(/<\/?span[^>]*>/g, "")
  .replace(/&(lt|gt|amp|quot|#x27|#39);/g, (e) => ENT[e])).slice(0, -1);
export const colourPage = (html) => html.replace(/<pre><code>([\s\S]*?)<\/code><\/pre>/g,
  (_, inner) => "<pre><code>" + colourBlock(inner) + "</code></pre>");

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = "site/learn/";
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".html")).sort()) {
    const html = fs.readFileSync(dir + f, "utf8"), out = colourPage(html);
    if (out !== html) { fs.writeFileSync(dir + f, out); console.log("coloured " + dir + f); }
  }
}
