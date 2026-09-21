// site/app.js -- The Ritz Affair. ES module: pure functions exported for node --test, boot() only in a browser.
export const STOP_WORDS = new Set(["the", "a", "suite", "no", "trunk", "mr", "mrs", "esq", "lord", "senor",
  "senora", "comtesse", "de", "rue", "report", "telegram", "account", "plate"]);

export function normalise(s) {
  // Same rules as normalise() in generate_db.py. Keep both in sync (fixture in chapters.json).
  const tokens = (String(s).toLowerCase().match(/[a-z0-9]+/g) || []).filter(t => !STOP_WORDS.has(t));
  if (tokens.length && tokens.every(t => /^[0-9]+$/.test(t))) return tokens.join("");
  return tokens.join(" ");
}

export async function sha256(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

if (typeof document !== "undefined") { /* boot() is added in Task 2 */ }
