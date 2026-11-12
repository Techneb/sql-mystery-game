// Where the site is served (owner, 2026-10-31): the game at https://alephb.uk/ritz-affair/ and The Clerk's Handbook at
// https://alephb.uk/learn/, both in the alephb-site repo (GitHub Pages, branch main). Sources, generators and tests
// stay here; site/ keeps the game at its root and the handbook in learn/, so `python3 -m http.server -d site` still
// plays everything locally. mystery.alephb.uk (this repo's Pages deploy) only bridges to the new home.
//   node publish.mjs <commit> <alephb-site dir>   writes <dir>/ritz-affair/ (site/ minus learn/) and <dir>/learn/
//                                                  (site/learn/), relinked and versioned; nothing else in <dir>
//   node publish.mjs bridge <out dir> [site]       writes the bridge for mystery.alephb.uk: index.html carries this
//                                                  origin's ritz.* keys to the game, every other page redirects
// Run both on the built site/ (python3 generate_db.py --seasons, then the tests): the season-N files are gitignored.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { versionText } from "./version_site.mjs";

import { GAME_URL, HANDBOOK } from "./site/shared.js";
import { importFragment } from "./site/state.js";

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
    out[to] = /\.(html|js|css|xml|json|svg|txt)$/.test(f) ? publishText(to, fs.readFileSync(p, "utf8")) : fs.readFileSync(p);
  }
  return out;
}

// The bridge's index.html runs this, its own source inlined (bridgeHtml): search = the old address's query, saved =
// [[key, value]] of the old origin's localStorage. The keys travel in the fragment only (state.js importFragment and
// readImport), which never reaches a server; with nothing saved, a plain redirect. Query kept either way.
// They travel once: the page then sets MOVED (the date) here, and with it a later visit redirects plainly, the old
// keys staying in place as a backup. Inlined, it may use no free name but GAME_URL, MOVED and importFragment: the
// module's imports here, the page's own definitions there (bridgeHtml).
export const MOVED = "ritz.moved";
export function bridgeTarget(search, saved) {
  const to = GAME_URL + (search || "");
  const keep = saved.filter(([k, v]) => /^ritz\./.test(k) && typeof v === "string");
  if (!keep.length || saved.some(([k]) => k === MOVED)) return to;
  return to + importFragment(Object.fromEntries(keep));
}

// The bridge's landing page: no GA, no ads, nothing but the redirect (meta refresh without JavaScript).
export function bridgeHtml() {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>The Ritz Affair has moved</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="canonical" href="${GAME_URL}">
<script>
var GAME_URL = ${JSON.stringify(GAME_URL)}, MOVED = ${JSON.stringify(MOVED)};
${importFragment.toString()}
${bridgeTarget.toString()}
var saved = [];
try { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); saved.push([k, localStorage.getItem(k)]); } } catch (e) {}
var to = bridgeTarget(location.search, saved);
try { if (to.indexOf("#import=") > 0) localStorage.setItem(MOVED, new Date().toISOString()); } catch (e) {}
location.replace(to);
</script>
<noscript><meta http-equiv="refresh" content="0; url=${GAME_URL}"></noscript>
</head><body><p>The Ritz Affair has moved to <a href="${GAME_URL}">${GAME_URL}</a>.</p></body></html>
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
    const to = rel.startsWith("learn/") ? HANDBOOK + (rel === "learn/index.html" ? "" : rel.slice(6)) : GAME_URL + rel;
    out[rel] = stubHtml(to);
  }
  return out;
}

// True when a and b are the same directory or one holds the other: a target like that would rmSync the source.
export function overlaps(a, b) {
  const inside = (x, y) => { const r = path.relative(path.resolve(y), path.resolve(x)); return !r.startsWith("..") && !path.isAbsolute(r); };
  return inside(a, b) || inside(b, a);
}
const guard = (dir, site) => { if (overlaps(dir, site)) throw new Error("publish.mjs: " + dir + " overlaps the source " + site + "; refusing to write there"); };

function writeTree(dir, files, v) {
  for (const [f, t] of Object.entries(files)) {
    const p = path.join(dir, f);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, typeof t === "string" && v ? versionText(f, t, v) : t);
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const [a, b, c] = process.argv.slice(2);
  if (a === "bridge" && b) {
    guard(b, c || "site");
    fs.rmSync(b, { recursive: true, force: true });
    writeTree(b, bridgeFiles(c || "site"));
  } else if (/^[0-9a-f]{4,40}$/i.test(a || "") && b) {
    guard(b, "site");
    for (const d of ["ritz-affair", "learn"]) fs.rmSync(path.join(b, d), { recursive: true, force: true });
    writeTree(b, publishFiles("site"), a);
  } else throw new Error("usage: node publish.mjs <commit> <alephb-site dir> | bridge <out dir> [site]");
}
