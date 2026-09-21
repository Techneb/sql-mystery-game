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

export function freshState() {
  return { solved: [], part2: false, queries: {}, hints: {}, wrong: {}, wrongStreak: 0, errorStreak: 0,
           badges: [], history: [], notes: "", names: "", lastQueryLines: 0, totalQueries: 0 };
}
// queries/hints/wrong are keyed by chapter number: { "1": 3, "2": 7 }
export function currentChapter(state, chapters) {
  const next = state.solved.length + 1;
  const cap = state.part2 ? 12 : 8;
  return chapters.find(c => c.n === Math.min(next, cap));
}
export function part1Done(state) { return state.solved.includes(8); }
export function awaitingCode(state) { return part1Done(state) && !state.part2; }

const KEY = "ritz.learn";
export function load() { try { return { ...freshState(), ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch { return freshState(); } }
export function save(state) { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} }

const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
const $ = id => document.getElementById(id);

let db, data, state, tableSizes = {};

async function loadDb() {
  const SQL = await initSqlJs({ locateFile: f => "https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.13.0/" + f });
  const buf = await (await fetch("mystery.sqlite")).arrayBuffer();
  db = new SQL.Database(new Uint8Array(buf));
  const v = db.exec("SELECT sqlite_version()")[0].values[0][0];
  if (v.split(".").map(Number) < [3, 39]) console.warn("SQLite " + v + " is older than 3.39; RIGHT JOIN will fail");
  for (const [t] of db.exec("SELECT name FROM sqlite_master WHERE type='table'")[0].values)
    tableSizes[t] = db.exec("SELECT COUNT(*) FROM " + t)[0].values[0][0];
}

function renderChapter() {
  const ch = currentChapter(state, data.chapters);
  const total = state.part2 ? 12 : 8;
  $("masthead-chapter").textContent = "CHAPTER " + ROMAN[ch.n] + " OF " + ROMAN[total];
  $("chapter-title").textContent = ch.title;
  $("story").textContent = ch.story;
  $("objective").textContent = ch.objective + " Answer: " + ch.answer_form + ".";
  if (awaitingCode(state)) {
    $("story").textContent = data.endings.part1;
    $("objective").textContent = "Part I is closed. Lupin mentioned a Chapter IX. Somewhere in the archives a telegram is addressed to a curious clerk; its code, typed in the answer box, opens Part II.";
    $("btn-print").hidden = false;
  }
  if (state.solved.includes(12)) { $("story").textContent = data.endings.part2; $("objective").textContent = "Case closed. Twice."; }
  // witnesses, board, telegram and ERD are rendered by their own tasks
}

async function boot() {
  data = await (await fetch("chapters.json")).json();
  state = load();
  await loadDb();
  $("status").textContent = "The archives are open.";
  $("btn-investigate").disabled = false;
  $("btn-investigate").onclick = () => { $("landing").hidden = true; renderChapter(); };
  if (state.solved.length) { $("landing").hidden = true; renderChapter(); }
}

if (typeof document !== "undefined") boot();
