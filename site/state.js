// site/state.js -- the game's saved state and what is read from it (pure: app.js keeps the storage and the page).
// Split out so badges.js, suspects.js and endings.js read the state without importing the game module.
import { OLD_ORIGIN, BOARD_KEY, HISTORY_MAX } from "./shared.js";

export function freshState() {
  return { mode: "learn", season: "", team: "", startedAt: 0, finishedAt: 0, outbox: [], db: 0, seasonName: "", penalty: 10, over: false, board: "",
           solved: [], part2: false, queries: {}, wrong: {}, wrongStreak: 0, errorStreak: 0,
           badges: [], history: [], notes: "", names: "", lastQueryLines: 0, totalQueries: 0, answers: {},
           film: [], opened: {}, milestones: {}, fails: {}, hints: [], hintsWhere: [], suspects: [], suspectsSeen: 0, badgesSeen: 0, introduced: null, runs: {}, cracked: {}, howto: {},
           extraSeen: false, extraSeen2: false, closedSeen: false, token: "", stoppedAt: 0, onboarding: "prologue", step1: "" };
}
// queries/wrong are keyed by chapter number: { "1": 3, "2": 7 }; runs[n] tracks the open chapter's successful runs
// (scanRun) and cracked[n] keeps the query shown on its case-board card once solved (winningQuery);
// howto[n] the decrypted "How it's done" of a solved learn chapter (howto.js openHowto), opened by the typed answer
// mode is "learn" (the 12-chapter investigation) or "compete" (Part I only, against the clock, season-<db>.*);
// in compete, season is the season record's id, db its database, startedAt its openedAt (the teacher's Open),
// token what "join" returned; outbox holds events not yet accepted by the Apps Script, so a lost connection
// never loses a row; over is set once the backend says the session is closed, and stoppedAt freezes the clock then;
// closedSeen once the #closed pop-up has been shown for it. introduced: the suspects the pop-up has shown, null until
// the first look seeds it with those met so far (a game saved before the pop-up, or a debug jump, shows none).
// step1 (learn only): chapter I's first answer, the date the theft is filed under, as typed ("" until found).
// onboarding (learn only): "prologue" (the clerk's first morning to come), "tour" (chapter I's callouts), "done".

// A saved game read back: every field of freshState, so nothing downstream needs a fallback. The one migration point:
// a save from before 2026-10-25's onboarding field (prologue "" | "done" | "skip" and tour) maps onto it, and a game
// already played (solved or queried) never gets the prologue.
export function migrateSave(saved) {
  const s = { ...saved };
  if (!("onboarding" in s) && Object.keys(s).length)
    s.onboarding = s.tour ? "done" : s.prologue ? "tour" : (s.solved || []).length || s.totalQueries ? "done" : "prologue";
  delete s.prologue; delete s.tour;
  if (!("badgesSeen" in s)) s.badgesSeen = (s.badges || []).length;   // an older save: its badges count as seen
  return { ...freshState(), ...s };
}

// Badges earned since the player last opened the Badges panel (the count on its button).
export const unseenBadges = state => Math.max(0, state.badges.length - (state.badgesSeen || 0));

// Chapter I's step 1 (chapters.json `step1`, learn only) while it is the question asked: a save from before the
// split (no step1 field) mid-chapter I starts there, a solved chapter I never does (owner, 2026-10-31).
export const stepOn = (state, ch) => ch && ch.step1 && !state.step1 && !state.solved.includes(ch.n) ? ch.step1 : null;
// What an answer's hash is for the question asked now (app.js submitAnswer): "step" chapter I's date, "early" its
// report before the date (not wrong, not yet), "solve" the chapter's answer (compete too: the season file carries its
// hashes), "eve" the 17th at step 1 (any spelling: still wrong, with its own reply and badge), else "wrong".
export function answerVerdict(hash, ch, state) {
  const step = stepOn(state, ch);
  if (step && step.answer_sha256.includes(hash)) return "step";
  if (ch.answer_sha256.includes(hash)) return step ? "early" : "solve";
  return step && step.eve_sha256.includes(hash) ? "eve" : "wrong";
}

export function currentChapter(state, chapters) {
  const next = state.solved.length + 1;
  const cap = state.part2 ? 12 : 8;
  return chapters.find(c => c.n === Math.min(next, cap));
}
export function part1Done(state) { return state.solved.includes(8); }
export function awaitingCode(state) { return state.mode !== "compete" && part1Done(state) && !state.part2; }
export function competeDone(state) { return state.mode === "compete" && part1Done(state); }
// Learning-mode and compete progress are separate localStorage keys (spec section 4).
export function storageKey(mode) { return mode === "compete" ? "ritz.compete" : "ritz.learn"; }
export function partStats(state, from, to) {
  let queries = 0;
  for (let n = from; n <= to; n++) queries += state.queries[n] || 0;
  return { queries };
}
// The tables the schema shows: every chapter's up to the current one.
export function visibleTables(chapters, state) {
  const cur = currentChapter(state, chapters).n;
  const seen = new Set();
  for (const ch of chapters) if (ch.n <= cur) ch.tables.forEach(t => seen.add(t));
  return seen;
}

// The move from the old subdomain (OLD_ORIGIN) to alephb.uk/ritz-affair/ (2026-10-31): the old origin's bridge page
// carries its ritz.* localStorage keys in the fragment, #import=<base64url of a JSON {key: value}>, and boot writes them
// once. Both halves of that format live here: importFragment(o) writes it (publish.mjs bridgeTarget, and the bridge page,
// which inlines its source: it may use no name but its argument and the browser's TextEncoder and btoa), readImport(hash)
// reads it back, the object, or null when the hash is not a well-formed import.
export function importFragment(o) {
  const bytes = new TextEncoder().encode(JSON.stringify(o));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return "#import=" + btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function readImport(hash) {
  const m = /^#import=([A-Za-z0-9_-]+)$/.exec(hash || "");
  if (!m) return null;
  try {
    const bin = atob(m[1].replace(/-/g, "+").replace(/_/g, "/"));
    const o = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0))));
    return o && typeof o === "object" && !Array.isArray(o) ? o : null;
  } catch { return null; }
}
// The import boot accepts (app.js importSaves): only from the bridge, i.e. when the page came from OLD_ORIGIN (the
// bridge's location.replace sends it as document.referrer under the default referrer policy; the bridge sets none),
// and never the desk's board URL (a live endpoint, entered on the desk). Null when there is nothing to import.
export function bridgeImport(hash, referrer) {
  let from = "";
  try { from = new URL(referrer).origin; } catch {}
  const o = from === OLD_ORIGIN ? readImport(hash) : null;
  if (o) delete o[BOARD_KEY];
  return o;
}
// A stored value parsed once: undefined when it is not JSON (JSON.parse never returns undefined).
const parsed = raw => { try { return JSON.parse(raw); } catch { return undefined; } };
// A parsed save's progress: chapters solved, then queries run (an unreadable save has none).
const progress = s => s === undefined ? [-1, 0] : [((s || {}).solved || []).length, (s || {}).totalQueries || 0];
const ahead = (a, b) => { const x = progress(a), y = progress(b); return x[0] > y[0] || (x[0] === y[0] && x[1] > y[1]); };
const seasonOf = s => s === undefined ? null : String((s || {}).season || "");
// The saves an import may replace when it is ahead: the learn save, and the compete save of the same season only.
const SAVE_RULES = {
  [storageKey("learn")]: ahead,
  [storageKey("compete")]: (a, b) => seasonOf(a) === seasonOf(b) && ahead(a, b),
};
// The writes an import makes, as {key: value}: only ritz.* keys with a string value; a key this origin already holds
// is kept, except a save SAVE_RULES lets the import replace, and a list (ritz.exercises, its history) merged with it,
// this origin's first (a history keeps its HISTORY_MAX newest). have(key): this origin's value.
export function importWrites(imported, have) {
  const out = {};
  for (const [k, v] of Object.entries(imported || {})) {
    if (!/^ritz\./.test(k) || typeof v !== "string") continue;
    const cur = have(k);
    if (cur == null) { out[k] = v; continue; }
    const a = parsed(v), b = parsed(cur);
    if (SAVE_RULES[k] && SAVE_RULES[k](a, b)) out[k] = v;
    else if (Array.isArray(a) && Array.isArray(b)) {
      const m = [...b, ...a.filter(x => !b.some(y => JSON.stringify(y) === JSON.stringify(x)))].slice(0, k.endsWith(".history") ? HISTORY_MAX : undefined);
      if (m.length > b.length) out[k] = JSON.stringify(m);
    }
  }
  return out;
}
