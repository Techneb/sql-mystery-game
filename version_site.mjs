// Ties every same-site script and stylesheet to one deploy: `node version_site.mjs <commit> [dir]` (dir: site).
// In every .html, a relative src/href ending .js or .css gets ?v=<commit>; in every .js, a relative import
// (`from "./x.js"`, `import "../x.js"`, `import("./x.js")`) does too. Browsers keep scripts for 10 minutes, so a
// fresh page never runs a stale cached script, and a module reached by two paths (stats.js from app.js and from
// learn/handbook.js) has one URL, one instance. app.js passes its own ?v= to the data files it fetches (VERSION).
import fs from "node:fs";
import path from "node:path";

const local = (u) => !/^([a-z][a-z0-9+.-]*:|\/\/|\/)/i.test(u);

export function versionText(name, text, v) {
  if (name.endsWith(".html"))
    return text.replace(/\b(src|href)="([^"?#]+\.(?:js|css))"/g, (m, a, u) => (local(u) ? `${a}="${u}?v=${v}"` : m));
  if (name.endsWith(".js"))
    return text.replace(/(\bfrom\s*|\bimport\s*\(?\s*)"(\.\.?\/[^"?#]+\.js)"/g, (m, p, u) => `${p}"${u}?v=${v}"`);
  return text;
}

// files: { relative path: text } -> the same map, versioned.
export const versionSite = (files, v) =>
  Object.fromEntries(Object.entries(files).map(([f, t]) => [f, versionText(f, t, v)]));

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  const [v, dir = "site"] = process.argv.slice(2);
  if (!/^[0-9a-f]{4,40}$/i.test(v || "")) throw new Error("usage: node version_site.mjs <commit> [dir]");
  for (const f of fs.readdirSync(dir, { recursive: true })) {
    if (!/\.(html|js)$/.test(f)) continue;
    const p = path.join(dir, f), t = fs.readFileSync(p, "utf8"), out = versionText(f, t, v);
    if (out !== t) fs.writeFileSync(p, out);
  }
}
