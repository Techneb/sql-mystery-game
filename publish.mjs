// Where the site is served (owner, 2026-10-31): the game at https://alephb.uk/ritz-affair/ and The Clerk's Handbook at
// https://alephb.uk/learn/, both in the alephb-site repo (GitHub Pages, branch main). Sources, generators and tests
// stay here; site/ keeps the game at its root and the handbook in learn/, so `python3 -m http.server -d site` still
// plays everything locally. mystery.alephb.uk (this repo's Pages deploy) only bridges to the new home.
//   node publish.mjs <commit> <alephb-site dir>   writes <dir>/ritz-affair/ (site/ minus learn/) and <dir>/learn/
//                                                  (site/learn/), relinked and versioned; nothing else in <dir>
//   node publish.mjs bridge <out dir> [site]       writes the bridge for mystery.alephb.uk: index.html carries this
//                                                  origin's ritz.* keys to the game, every other page redirects
//   node publish.mjs stubs [site]                  before the switch: site/learn/ pages become redirects in place
// Run both on the built site/ (python3 generate_db.py --seasons, then the tests): the season-N files are gitignored.
import fs from "node:fs";
import path from "node:path";
import { versionText } from "./version_site.mjs";

export const OLD = "https://mystery.alephb.uk/";
export const SITE = "https://alephb.uk/";
export const GAME = SITE + "ritz-affair/";
export const HOME = SITE + "learn/";
// Every alephb.uk page carries the AdSense account tag (alephb-site's CLAUDE.md).
export const ADSENSE_META = '<meta name="google-adsense-account" content="ca-pub-9765732642926043">';
// alephb.uk serves its own robots.txt and ads.txt at its root (site/robots.txt holds the lines its robots.txt needs).
const SKIP = new Set(["robots.txt", "ads.txt", ".gitkeep", ".DS_Store"]);

// One published file's text. The two folders sit side by side: the game's learn/ links become ../learn/, the
// handbook's ../ links and imports ../ritz-affair/. Versioned after, so a module has one URL from either side.
export function publishText(f, text) {
  const learn = f.startsWith("learn/");
  if (f.endsWith(".js")) return learn ? text.replace(/(\bfrom\s*|\bimport\s*\(?\s*)"\.\.\//g, '$1"../ritz-affair/') : text;
  if (!f.endsWith(".html")) return text;
  return text
    .replace('<meta charset="utf-8">', (m) => (text.includes(ADSENSE_META) ? m : m + "\n" + ADSENSE_META))
    .replace(learn ? /\b(src|href)="\.\.\//g : /\b(src|href)="learn\//g, learn ? '$1="../ritz-affair/' : '$1="../learn/');
}

// The alephb-site tree: { "ritz-affair/x" | "learn/x": text or Buffer }, unversioned.
export function publishFiles(site) {
  const out = {};
  for (const f of fs.readdirSync(site, { recursive: true })) {
    const p = path.join(site, f), rel = f.split(path.sep).join("/");
    if (fs.statSync(p).isDirectory() || SKIP.has(path.basename(f))) continue;
    const to = rel.startsWith("learn/") ? rel : "ritz-affair/" + rel;
    out[to] = /\.(html|js|css|xml|json|svg|txt)$/.test(f) && !/\.sqlite$/.test(f) ? publishText(to, fs.readFileSync(p, "utf8")) : fs.readFileSync(p);
  }
  return out;
}

// The bridge's index.html runs this, its own source inlined (bridgeHtml): search = the old address's query, saved =
// [[key, value]] of the old origin's localStorage. The keys travel in the fragment only (#import=, base64url JSON,
// state.js readImport), which never reaches a server; with nothing saved, a plain redirect. Query kept either way.
export function bridgeTarget(search, saved) {
  const to = "https://alephb.uk/ritz-affair/" + (search || "");
  const keep = saved.filter(([k, v]) => /^ritz\./.test(k) && typeof v === "string");
  if (!keep.length) return to;
  const bytes = new TextEncoder().encode(JSON.stringify(Object.fromEntries(keep)));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return to + "#import=" + btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// The bridge's landing page: no GA, no ads, nothing but the redirect (meta refresh without JavaScript).
export function bridgeHtml() {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>The Ritz Affair has moved</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="canonical" href="${GAME}">
<script>
${bridgeTarget.toString()}
var saved = [];
try { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); saved.push([k, localStorage.getItem(k)]); } } catch (e) {}
location.replace(bridgeTarget(location.search, saved));
</script>
<noscript><meta http-equiv="refresh" content="0; url=${GAME}"></noscript>
</head><body><p>The Ritz Affair has moved to <a href="${GAME}">${GAME}</a>.</p></body></html>
`;
}

// Any other old page: query and hash kept (exercises' #slug, a desk page's ?board=), meta refresh and canonical for crawlers.
export function stubHtml(to) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Moved to alephb.uk</title>
<link rel="canonical" href="${to}">
<script>location.replace(${JSON.stringify(to)} + location.search + location.hash);</script>
<meta http-equiv="refresh" content="0; url=${to}">
</head><body><p>This page has moved to <a href="${to}">${to}</a>.</p></body></html>
`;
}

// The bridge tree: { path: text } for every page of site/ (learn/ included), plus a robots.txt that lets crawlers
// follow the redirects. Nothing else is served there any more.
export function bridgeFiles(site) {
  const out = { "index.html": bridgeHtml(), "robots.txt": "User-agent: *\nAllow: /\n" };
  for (const f of fs.readdirSync(site, { recursive: true })) {
    const rel = f.split(path.sep).join("/");
    if (!rel.endsWith(".html") || rel === "index.html") continue;
    const to = rel.startsWith("learn/") ? HOME + (rel === "learn/index.html" ? "" : rel.slice(6)) : GAME + rel;
    out[rel] = stubHtml(to);
  }
  return out;
}

function writeTree(dir, files, v) {
  for (const [f, t] of Object.entries(files)) {
    const p = path.join(dir, f);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, typeof t === "string" && v ? versionText(f, t, v) : t);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  const [a, b, c] = process.argv.slice(2);
  if (a === "bridge" && b) {
    fs.rmSync(b, { recursive: true, force: true });
    writeTree(b, bridgeFiles(c || "site"));
  } else if (a === "stubs") {
    // Until the bridge is switched on (pages.yml, repository variable BRIDGE), mystery.alephb.uk keeps the whole game,
    // its learn/ pages redirecting to alephb.uk/learn/ as since 2026-10-30.
    const site = b || "site", stubs = Object.entries(bridgeFiles(site)).filter(([f]) => f.startsWith("learn/"));
    writeTree(site, Object.fromEntries(stubs));
    fs.rmSync(path.join(site, "learn", "sitemap.xml"), { force: true });
  } else if (/^[0-9a-f]{4,40}$/i.test(a || "") && b) {
    for (const d of ["ritz-affair", "learn"]) fs.rmSync(path.join(b, d), { recursive: true, force: true });
    writeTree(b, publishFiles("site"), a);
  } else throw new Error("usage: node publish.mjs <commit> <alephb-site dir> | bridge <out dir> [site] | stubs [site]");
}
