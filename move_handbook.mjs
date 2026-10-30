// The Clerk's Handbook lives at https://alephb.uk/learn/ since 2026-10-30 (owner: AdSense reviews the root domain,
// whose own pages were too thin). Its sources stay here (site/learn/, the tests, colour_learn.mjs, bakery.py).
//   node move_handbook.mjs export <commit> <alephb-site dir>   copies site/learn/ to <dir>/learn/ and the game modules
//                                                              and assets it uses to <dir>/learn/lib/, versioned
//   node move_handbook.mjs stubs [dir]                          what the deploy runs on site/: every learn page becomes
//                                                              a redirect to its alephb.uk URL, the sitemap drops them,
//                                                              the game's own links to learn/ point there directly
import fs from "node:fs";
import path from "node:path";
import { versionText } from "./version_site.mjs";

export const GAME = "https://mystery.alephb.uk/";
export const HOME = "https://alephb.uk/learn/";
// What the handbook reaches through "../": copied beside it (lib/), everything else of "../" stays on the game's site.
// Every alephb.uk page carries the AdSense account tag (alephb-site's CLAUDE.md).
export const ADSENSE_META = '<meta name="google-adsense-account" content="ca-pub-9765732642926043">';
export const LIB = ["terminal.js", "strict.js", "ui.js", "stats.js", "shared.js", "feedback.js",
  "style.css", "favicon.svg", "handbook-ad.jpg", "handbook-ad-night.jpg"];

// One handbook file's text as alephb.uk serves it.
export function exportText(name, text) {
  if (name.endsWith(".js"))
    return text.replace(/"\.\.\/([^"?#]+\.js)"/g, (m, f) => (LIB.includes(f) ? `"./lib/${f}"` : m));
  if (!name.endsWith(".html")) return text;
  return text
    .replace('<meta charset="utf-8">', (m) => (text.includes(ADSENSE_META) ? m : m + "\n" + ADSENSE_META))
    .replaceAll("https://mystery.alephb.uk/learn/", HOME)
    .replace(/\b(src|href)="\.\.\/([^"]*)"/g, (m, a, u) => {
      const f = u.split(/[?#]/)[0];
      return LIB.includes(f) ? `${a}="lib/${u}"` : `${a}="${GAME}${u}"`;
    });
}

// The robots.txt-free sitemap of /learn/: the learn entries of the game's sitemap, moved.
export function learnSitemap(xml) {
  const urls = [...xml.matchAll(/<url>[\s\S]*?<\/url>/g)].map((m) => m[0]).filter((u) => u.includes(GAME + "learn/"));
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + urls.map((u) => "  " + u.replaceAll(GAME + "learn/", HOME)).join("\n") + "\n</urlset>\n";
}

export function exportFiles(site) {
  const out = {};
  for (const f of fs.readdirSync(path.join(site, "learn"), { recursive: true })) {
    const p = path.join(site, "learn", f);
    if (fs.statSync(p).isDirectory()) continue;
    out["learn/" + f] = /\.(html|js|css)$/.test(f) ? exportText(f, fs.readFileSync(p, "utf8")) : fs.readFileSync(p);
  }
  for (const f of LIB) out["learn/lib/" + f] = /\.(js|css)$/.test(f) ? fs.readFileSync(path.join(site, f), "utf8") : fs.readFileSync(path.join(site, f));
  out["learn/sitemap.xml"] = learnSitemap(fs.readFileSync(path.join(site, "sitemap.xml"), "utf8"));
  return out;
}

// A moved page: a script keeps the #slug (exercises' Try it links), the refresh and canonical serve crawlers.
export function stubHtml(page) {
  const to = HOME + (page === "index.html" ? "" : page);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>The Clerk's Handbook has moved</title>
<link rel="canonical" href="${to}">
<script>location.replace(${JSON.stringify(to)} + location.search + location.hash);</script>
<meta http-equiv="refresh" content="0; url=${to}">
</head><body><p>The Clerk's Handbook has moved to <a href="${to}">${to}</a>.</p></body></html>
`;
}

export const pruneSitemap = (xml) => xml.replace(/\s*<url>(?:(?!<\/url>)[\s\S])*?\/learn\/[\s\S]*?<\/url>/g, "");
// The game's own pages link the handbook directly (the stubs catch the rest, terminal.js's grammar links included).
export const gameLinks = (html) => html.replace(/\bhref="learn\//g, `href="${HOME}`);

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  const [mode, a, b] = process.argv.slice(2);
  if (mode === "export") {
    if (!/^[0-9a-f]{4,40}$/i.test(a || "") || !b) throw new Error("usage: node move_handbook.mjs export <commit> <alephb-site dir>");
    fs.rmSync(path.join(b, "learn"), { recursive: true, force: true });
    for (const [f, t] of Object.entries(exportFiles("site"))) {
      const p = path.join(b, f);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, typeof t === "string" ? versionText(f, t, a) : t);
    }
  } else if (mode === "stubs") {
    const site = a || "site";
    for (const f of fs.readdirSync(path.join(site, "learn"))) if (f.endsWith(".html")) fs.writeFileSync(path.join(site, "learn", f), stubHtml(f));
    for (const f of fs.readdirSync(site)) if (f.endsWith(".html")) {
      const p = path.join(site, f), t = fs.readFileSync(p, "utf8");
      if (gameLinks(t) !== t) fs.writeFileSync(p, gameLinks(t));
    }
    const sm = path.join(site, "sitemap.xml");
    fs.writeFileSync(sm, pruneSitemap(fs.readFileSync(sm, "utf8")));
  } else throw new Error("usage: node move_handbook.mjs export <commit> <dir> | stubs [dir]");
}
