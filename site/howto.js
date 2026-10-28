// "How it's done" (learn only): a solved chapter's walkthrough, shipped in chapters.json encrypted under its answer
// (generate_db.howto_box, which documents the construction). Side-effect free: imported by app.js and the node tests.
import { esc } from "./ui.js";
import { highlightSql } from "./terminal.js";

const enc = new TextEncoder();
const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const xor = (a, b) => a.map((x, i) => x ^ b[i]);
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
async function hm(key, msg) {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, typeof msg === "string" ? enc.encode(msg) : msg));
}
async function stream(ck, data) {
  const key = await hm(ck, "enc"), out = new Uint8Array(data.length);
  for (let i = 0; i * 32 < data.length; i++) {
    const block = await hm(key, new Uint8Array([i >>> 24, (i >>> 16) & 255, (i >>> 8) & 255, i & 255]));
    for (let j = 0; j < 32 && i * 32 + j < data.length; j++) out[i * 32 + j] = data[i * 32 + j] ^ block[j];
  }
  return out;
}

// box: the chapter's `howto`; form: the normalised answer typed; i: its index in answer_sha256.
// Resolves with { steps, sql: [[note, sql]...] }, or null when the form does not open the box.
export async function openHowto(box, form, i) {
  if (!box || !box.wraps || !box.wraps[i]) return null;
  const pw = await crypto.subtle.importKey("raw", enc.encode(form), "PBKDF2", false, ["deriveBits"]);
  const k = new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: b64(box.salts[i]), iterations: box.iter }, pw, 256));
  const w = b64(box.wraps[i]), wrapped = w.slice(0, 32);
  if (!same(w.slice(32), (await hm(await hm(k, "wrap-mac"), wrapped)).slice(0, 16))) return null;
  const ck = xor(wrapped, await hm(k, "wrap")), ct = b64(box.ct);
  if (!same(b64(box.tag), await hm(await hm(ck, "mac"), ct))) return null;
  return JSON.parse(new TextDecoder().decode(await stream(ck, ct)));
}

// Under the "Correct" reply as soon as the chapter is solved, and in its board review, always open (owner,
// 2026-10-28); "" without a walkthrough (older saves).
export const howtoHtml = h => h && h.steps ? '<div class="howto-done"><div class="label">HOW IT\'S DONE</div><ol>' +
  h.steps.map(s => "<li>" + esc(s).replace(/`([^`]+)`/g, "<code>$1</code>") + "</li>").join("") + "</ol>" +
  '<div class="label">REFERENCE SQL</div>' +
  h.sql.map(([note, sql], i) => (i === h.sql.length - 1 ? '<p class="muted"><b>The answer:</b> ' + esc(note) + "</p>" : note ? '<p class="muted">' + esc(note) + "</p>" : "") + '<pre class="sql-view">' + highlightSql(sql) + "</pre>").join("") +
  "</div>" : "";
