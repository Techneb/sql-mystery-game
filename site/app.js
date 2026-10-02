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
  return { mode: "learn", season: 0, team: "", startedAt: 0, finishedAt: 0, outbox: [],
           solved: [], part2: false, queries: {}, wrong: {}, wrongStreak: 0, errorStreak: 0,
           badges: [], history: [], notes: "", names: "", lastQueryLines: 0, totalQueries: 0, answers: {},
           film: [], opened: {}, suspects: [], suspectsSeen: 0 };
}
// queries/wrong are keyed by chapter number: { "1": 3, "2": 7 }
// mode is "learn" (the 12-chapter investigation) or "compete" (Part I only, against the clock, season-N.*);
// outbox holds compete events not yet accepted by the Apps Script, so a lost connection never loses a row.
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
let key = storageKey("learn");
export function loadFrom(k) { try { return { ...freshState(), ...JSON.parse(localStorage.getItem(k) || "{}") }; } catch { return freshState(); } }
let noPersist = false;
export function save(state) { if (noPersist) return; try { localStorage.setItem(key, JSON.stringify(state)); } catch {} }

// --- compete mode: season, team, clock, events -------------------------------------------------
export function fmtTime(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
}
export function competeStats(state) {
  const s = partStats(state, 1, 8);
  let wrong = 0;
  for (let n = 1; n <= 8; n++) wrong += state.wrong[n] || 0;
  return { ...s, wrong };
}
// One row of the Apps Script's log sheet. The server stamps the time itself; nothing here is a clock.
export function eventPayload(state, event, chapter) {
  const s = competeStats(state);
  return { event, team: state.team, season: state.season, chapter: chapter || state.solved.length,
           wrong: s.wrong, queries: s.queries };
}

const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];

// One engraved-line prop per chapter, tied to its story beat (see docs/mockups/illustrations.html
// section 2). Inner markup only -- #chapter-icon in index.html carries the shared outer <svg> attrs.
// class="accent" picks up --red by day and --accent by night (see style.css's night palette).
const PROPS = {
  1: '<path d="M22 18h44l12 12v56H22z"/><path d="M66 18v12h12"/><path d="M30 40h34M30 47h34M30 54h26M30 61h34M30 68h20"/><g class="accent" stroke-width="2"><rect x="40" y="58" width="34" height="18" transform="rotate(-12 57 67)"/><path d="M46 68l22-4"/></g><path d="M28 24h10" stroke-width="1"/>',
  2: '<circle cx="72" cy="26" r="9" stroke-width="1.2"/><path d="M12 62h76M12 82h76"/><path d="M18 62v20M30 62v20M42 62v20M54 62v20M66 62v20M78 62v20"/><path d="M18 66c6-6 6 6 12 0M30 66c6-6 6 6 12 0M42 66c6-6 6 6 12 0M54 66c6-6 6 6 12 0M66 66c6-6 6 6 12 0" stroke-width="1.1"/><path d="M12 62l8-22h56l8 22" stroke-dasharray="2 3" stroke-width="1"/><path class="accent" d="M46 40v-8l10-6" stroke-width="2"/>',
  3: '<rect x="10" y="34" width="80" height="30" rx="2"/><rect x="14" y="38" width="72" height="22" rx="1" stroke-width="1"/><path d="M22 44h2v10M28 44h4v5h-4v5h4M38 44v10M46 44h4v5h-4" stroke-width="2.2"/><path d="M56 40v18M60 40v18M64 40v18M68 40v18M72 40v18M76 40v18M80 40v18" stroke-width="3" opacity=".85"/><circle cx="20" cy="76" r="7"/><circle cx="80" cy="76" r="7"/><path d="M27 76h46"/><path class="accent" d="M8 22c20 8 40 8 60-2" stroke-dasharray="1 4" stroke-width="2"/>',
  4: '<rect x="26" y="30" width="48" height="52" rx="3"/><rect x="32" y="36" width="36" height="18" rx="1" stroke-width="1"/><path d="M36 44h8M50 44h6M60 44h4" stroke-width="2.4"/><path d="M34 64h32M34 70h32M34 76h20" stroke-width="1"/><path d="M50 30v-14"/><path class="accent" d="M50 16h14v9H50z" stroke-width="2"/><path d="M30 82v6h40v-6" stroke-width="1"/>',
  5: '<circle cx="42" cy="44" r="22"/><circle cx="42" cy="44" r="16" stroke-width="1"/><path d="M58 60l22 22" stroke-width="5"/><path d="M58 60l22 22" stroke="var(--card)" stroke-width="2"/><path d="M32 36c4-6 12-8 18-4" stroke-width="1" opacity=".7"/><path class="accent" d="M36 48l5 5 9-12" stroke-width="2"/>',
  6: '<ellipse cx="34" cy="70" rx="16" ry="5"/><path d="M18 70v-6M50 70v-6"/><ellipse cx="34" cy="64" rx="16" ry="5" stroke-width="1"/><path d="M18 64v-6M50 64v-6"/><ellipse cx="34" cy="58" rx="16" ry="5" stroke-width="1"/><path d="M18 58v-6M50 58v-6"/><ellipse cx="34" cy="52" rx="16" ry="5" stroke-width="1"/><rect x="46" y="22" width="44" height="26" rx="1" transform="rotate(-8 68 35)"/><rect x="50" y="26" width="36" height="18" transform="rotate(-8 68 35)" stroke-width="1" stroke-dasharray="1 2"/><path class="accent" d="M60 78h28M60 84h20" stroke-width="2"/><path d="M58 72l-3 14" stroke-width="1"/>',
  7: '<rect x="14" y="60" width="72" height="14" rx="2"/><path d="M14 74l4 8h64l4-8" stroke-width="1"/><path d="M30 60V46c0-4 4-6 8-6h22"/><circle cx="66" cy="40" r="6"/><path d="M40 60v-8" stroke-width="1"/><path d="M22 66h8M70 66h8" stroke-width="1"/><path class="accent" d="M70 22l6-6M78 30l8-2M64 18l1-8" stroke-width="2"/>',
  8: '<path d="M40 14h8v10c6 4 8 10 8 18v42a6 6 0 0 1-6 6H38a6 6 0 0 1-6-6V42c0-8 2-14 8-18z"/><rect x="34" y="52" width="20" height="16" stroke-width="1"/><path d="M38 58h12M38 62h8" stroke-width="1"/><path d="M66 46c0 10 4 16 10 16s10-6 10-16z"/><path d="M76 62v22M68 84h16"/><path class="accent" d="M70 40c2-4 8-6 12-4M84 36l-2-4" stroke-width="1.5" stroke-dasharray="1 3"/><path d="M40 20h8" stroke-width="1"/>',
  9: '<rect x="14" y="34" width="72" height="46" rx="4"/><path d="M14 50h72M14 62h72" stroke-width="1"/><path d="M30 34v46M70 34v46" stroke-width="1"/><path d="M14 40c10-10 62-10 72 0" stroke-width="1"/><rect x="44" y="52" width="12" height="10" stroke-width="1"/><circle cx="50" cy="57" r="1.5"/><path class="accent" d="M18 66l14-8 2 12z" stroke-width="1.8"/><path class="accent" d="M76 40h10v10" stroke-width="1.8"/><path d="M20 80v6M80 80v6" stroke-width="1"/>',
  10: '<path d="M14 70h36M20 70V44h24v26"/><path d="M20 48h24" stroke-width="1"/><ellipse cx="32" cy="70" rx="18" ry="3" stroke-width="1"/><path d="M50 70h36M56 70V44h24v26"/><path d="M56 48h24" stroke-width="1"/><ellipse cx="68" cy="70" rx="18" ry="3" stroke-width="1"/><path class="accent" d="M50 30v52" stroke-dasharray="3 3" stroke-width="1.6"/><path d="M24 84h52" stroke-width="1" opacity=".6"/>',
  11: '<path d="M14 62a36 36 0 0 1 72 0z"/><path d="M14 62h72"/><path d="M20 58l4-2M30 42l3 3M50 30v5M70 42l-3 3M80 58l-4-2" stroke-width="1.4"/><text x="16" y="72" font-family="Special Elite, monospace" font-size="7" fill="currentColor" stroke="none">1</text><text x="80" y="72" font-family="Special Elite, monospace" font-size="7" fill="currentColor" stroke="none">5</text><path class="accent" d="M50 62L32 44" stroke-width="2.2"/><circle cx="50" cy="62" r="3" fill="currentColor" stroke="none"/><path d="M40 80h20" stroke-width="1"/>',
  12: '<path class="accent" d="M50 18l26 16v32L50 82 24 66V34z" stroke-width="2"/><path class="accent" d="M50 18v64M24 34l52 32M76 34L24 66M50 18l-26 16M50 18l26 16" stroke-width="1" opacity=".8"/><path d="M36 44l14-8 14 8-14 8z" stroke-width="1"/><path d="M12 90h76" stroke-width="1" stroke-dasharray="2 3"/><path d="M18 88c8-6 14-6 22 0" stroke-width="1"/><path d="M60 88c8-6 14-6 22 0" stroke-width="1"/>',
};

// Portrait file per suspect in data.cast (site/portraits/*.jpg -- Style A/Lavery colour, generated;
// see docs/superpowers/specs section 8's visual-identity entry). Same six every mode; Lupin himself
// never gets one singled out, so no face reads guiltier than another before chapter VIII.
const PORTRAIT_FILE = { "Lord Ashcombe": "ashcombe", "Paul Sernine": "sernine", "Horace Velmont": "velmont",
  "Raul Ortega": "ortega", "Ines de Almagro": "almagro", "Rupert Blakeney": "blakeney" };

const $ = id => document.getElementById(id);

let db, data, state, tableSizes = {};
let season = 0, seasonData = null, boardUrl = "";

async function loadDb(stem) {
  const SQL = await initSqlJs({ locateFile: f => "https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.13.0/" + f });
  const buf = await (await fetch(stem + ".sqlite")).arrayBuffer();
  if (db) db.close();
  db = new SQL.Database(new Uint8Array(buf));
  const v = db.exec("SELECT sqlite_version()")[0].values[0][0];
  if (v.split(".").map(Number) < [3, 39]) console.warn("SQLite " + v + " is older than 3.39; RIGHT JOIN will fail");
  tableSizes = {};
  for (const [t] of db.exec("SELECT name FROM sqlite_master WHERE type='table'")[0].values)
    tableSizes[t] = db.exec("SELECT COUNT(*) FROM " + t)[0].values[0][0];
}

// After a correct answer the solved chapter stays on screen (telegram, answer) until the clerk presses
// Next chapter; the new chapter's tables are revealed only then, so the reveal is actually seen.
let reviewing = null, nextPending = 0, pendingReveal = [];
function clearTerminal() { $("sql").value = ""; syncSql(); $("results").innerHTML = ""; $("run-info").textContent = ""; }
function reviewChapter(n) { reviewing = n; clearTerminal(); renderChapter(); }
function backToInvestigation() {
  reviewing = null; nextPending = 0; clearTerminal(); renderChapter();
  if (pendingReveal.length) { renderErd(pendingReveal); pendingReveal = []; }
}
const objectiveHtml = (text, label, value) => esc(text) + '<div class="answer-form"><b>' + label + "</b> " + esc(value) + "</div>";

function renderChapter() {
  markSuspects();
  const total = state.part2 ? 12 : 8;
  // Speed Reader: when the current chapter was first put in front of the player
  if (reviewing == null) { const n = currentChapter(state, data.chapters).n; if (!state.opened[n]) { state.opened[n] = Date.now(); save(state); } }
  document.querySelector(".answer-row").hidden = reviewing != null || competeDone(state);
  const pendingHere = nextPending && reviewing === nextPending;
  $("btn-back").hidden = reviewing == null || pendingHere;
  $("btn-next").hidden = !pendingHere;
  if (pendingHere) $("btn-next").textContent = "Next chapter: " + ROMAN[currentChapter(state, data.chapters).n] + " \u2192";
  if (reviewing != null) {
    const ch = data.chapters.find(c => c.n === reviewing);
    $("masthead-chapter").textContent = "REVIEWING CHAPTER " + ROMAN[ch.n] + " OF " + ROMAN[total];
    $("chapter-icon").innerHTML = PROPS[ch.n] || "";
    $("chapter-title").textContent = ch.title;
    $("story").innerHTML = richText(ch.story);
    $("objective").innerHTML = objectiveHtml(ch.objective, "Your answer:", state.answers[ch.n]);
    return;
  }
  const ch = currentChapter(state, data.chapters);
  $("masthead-chapter").textContent = "CHAPTER " + ROMAN[ch.n] + " OF " + ROMAN[total];
  $("chapter-icon").innerHTML = PROPS[ch.n] || "";
  $("chapter-title").textContent = ch.title;
  $("story").innerHTML = richText(ch.story);
  $("objective").innerHTML = objectiveHtml(ch.objective, "Answer:", ch.answer_form);
  if (awaitingCode(state)) {
    $("story").innerHTML = '<img class="portrait" src="portraits/blakeney.jpg" alt="">' + richText(data.endings.part1);   // the unmasking: his face, only now
    $("objective").textContent = "Part I is closed. Lupin mentioned a Chapter IX. Somewhere in the archives a telegram is addressed to a curious clerk; its code, typed in the answer box, opens Part II.";
    $("btn-print").hidden = false;
  }
  // The Blue Star is never recovered: Lupin's telegram from London comes with a photograph of it, re-set as a ring.
  if (state.solved.includes(12)) {
    $("story").innerHTML = '<img class="portrait" src="portraits/comtesse.jpg" alt="">' + richText(data.endings.part2) +
      '<figure class="ending-photo"><img src="blue-star.jpg" alt="The Blue Star, re-set as a ring, on dark velvet by a window over London">' +
      "<figcaption>Enclosed with the telegram, a photograph. No message. The jeweller has been busy.</figcaption></figure>";
    $("objective").textContent = "Case closed. Twice.";
  }
  if (competeDone(state)) {
    $("story").textContent = "Case closed. Lupin is in irons, Ganimard is taking the credit, and the clock has stopped. " +
      "Your side of the clock read " + fmtTime(state.finishedAt - state.startedAt) + "; the leaderboard keeps the official time, " +
      "plus " + duration(PENALTY.wrong) + " per wrong answer.";
    $("objective").innerHTML = boardUrl
      ? 'Your result is on the class leaderboard: <a href="leaderboard.html?data=' + encodeURIComponent(boardUrl) + '" target="_blank">open it</a>.'
      : "No leaderboard is connected to this season, so the result stays on this screen.";
    $("btn-print").hidden = false;
  }
  let box = document.getElementById("rank-box");
  if (part1Done(state)) {
    if (!box) { box = document.createElement("div"); box.id = "rank-box"; box.className = "box"; $("objective").parentElement.after(box); }
    const p1 = partStats(state, 1, 8);
    box.innerHTML = '<div class="label">RANK</div>' + esc(rank(p1.queries)) + " - " + p1.queries + " queries";
  } else if (box) box.remove();
}

// SQL colouring for the terminal: a <pre> under a transparent textarea (index.html .editor).
export const SQL_KEYWORDS = new Set(("select from where and or not in is null like glob between join inner left right full outer " +
  "cross natural on using as group by order having limit offset distinct all union intersect except with recursive case " +
  "when then else end asc desc over partition rows range exists cast collate escape values insert into update set delete " +
  "create table view drop filter window").split(" "));
export function highlightSql(src) {
  const e = s => s.replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const re = /(--[^\n]*|\/\*[\s\S]*?(?:\*\/|$))|('(?:[^']|'')*'?|"(?:[^"]|"")*"?)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][A-Za-z0-9_]*)|([\s\S])/g;
  let out = "", m;
  while ((m = re.exec(src))) {
    const [t, com, str, num, word] = m;
    const cls = com ? "com" : str ? "str" : num ? "num"
      : word ? (SQL_KEYWORDS.has(word.toLowerCase()) ? "kw" : /^\s*\(/.test(src.slice(re.lastIndex)) ? "fn" : "id") : "";
    out += cls ? '<span class="sql-' + cls + '">' + e(t) + "</span>" : e(t);
  }
  return out + "\n";   // a trailing newline in a <pre> is dropped; keep the last empty line as tall as the textarea's
}
// Ctrl+F in the query box: one clause per line, AND/OR indented, keywords upper-cased. Only whitespace and
// case change (strings, comments and identifiers are kept), so the query means exactly the same.
const SQL_FUNCS = new Set("count sum avg min max abs round length lower upper substr trim replace coalesce ifnull nullif date time strftime rank dense_rank row_number lag lead ntile first_value last_value printf cast".split(" "));
const JOIN_LEAD = new Set(["left", "right", "inner", "full", "cross", "natural", "outer"]);
export function formatSql(src) {
  const re = /(\s+)|(--[^\n]*)|(\/\*[\s\S]*?(?:\*\/|$))|('(?:[^']|'')*'?|"(?:[^"]|"")*"?)|([A-Za-z_][A-Za-z0-9_]*)|([\s\S])/g;
  const parens = [];                                 // true for a subquery "(", false for a call, list or OVER
  let out = "", m, space = false, prev = "", start = true, between = false;
  const depth = () => parens.filter(Boolean).length;
  const top = () => !parens.length || parens[parens.length - 1];
  const br = extra => { out = out.replace(/\s+$/, "") + "\n" + "  ".repeat(depth() + extra); space = false; };
  while ((m = re.exec(src))) {
    const [t, ws, line, block, str, word] = m;
    if (ws) { space = out !== ""; continue; }
    const w = word ? word.toLowerCase() : "";
    if (word && top() && !start) {
      if (["from", "where", "group", "having", "order", "limit", "union", "intersect", "except", "window"].includes(w)
          || (w === "select" && prev !== "(") || ((JOIN_LEAD.has(w) || w === "join") && !JOIN_LEAD.has(prev))) br(0);
      else if ((w === "and" || w === "or") && !between) br(1);
    }
    if (w === "and" && between) between = false;
    if (w === "between") between = true;
    const text = word && (SQL_KEYWORDS.has(w) || (SQL_FUNCS.has(w) && /^\s*\(/.test(src.slice(re.lastIndex)))) ? word.toUpperCase() : t;
    if (t === ")" && parens.pop()) br(0);           // a subquery closes on its own line, under its opening
    if (space && out && !/\s$/.test(out)) out += " ";
    out += text; space = false;
    if (t === "(") { parens.push(/^\s*(select|with)\b/i.test(src.slice(re.lastIndex))); if (top() && parens.length) br(0); }
    if (line) br(0);
    if (t === ";") { out += "\n"; start = true; prev = ""; parens.length = 0; continue; }
    if (!str && !line && !block) prev = w || t;
    start = false;
  }
  return out.replace(/[ \t]+$/gm, "").trim();
}
function syncSql() {
  const ta = $("sql");
  $("sql-hl").innerHTML = highlightSql(ta.value);
  ta.style.height = "auto"; ta.style.height = Math.max(160, ta.scrollHeight + 2) + "px";   // grows instead of scrolling: nothing to keep in sync
}

export const ROW_CAP = 200;
const esc = s => String(s === null || s === undefined ? "NULL" : s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

export function renderResults(res) {
  if (!res) return '<p class="muted">No rows.</p>';
  const head = "<tr>" + res.columns.map(c => "<th>" + esc(c) + "</th>").join("") + "</tr>";
  const body = res.values.slice(0, ROW_CAP).map(r => "<tr>" + r.map(v => "<td>" + esc(v) + "</td>").join("") + "</tr>").join("");
  const more = res.values.length > ROW_CAP ? '<p class="muted">' + (res.values.length - ROW_CAP) + " more rows not shown.</p>" : "";
  return "<table>" + head + body + "</table>" + more;
}

export function pushHistory(state, sql) {
  if (state.history[0] !== sql) state.history.unshift(sql);
  state.history = state.history.slice(0, 20);
}

function runQuery() {
  const sql = $("sql").value.trim();
  if (!sql) return;
  const ch = currentChapter(state, data.chapters);
  state.queries[ch.n] = (state.queries[ch.n] || 0) + 1;
  state.totalQueries++;
  pushHistory(state, sql);
  let res = null, error = null, t0 = performance.now();
  try { const all = db.exec(sql); res = all[all.length - 1] || null; state.errorStreak = 0; }
  catch (e) { error = e.message; state.errorStreak++; }
  const ms = Math.round(performance.now() - t0);
  $("results").innerHTML = error ? '<div class="error">' + esc(error) + "</div>" : renderResults(res);
  $("run-info").textContent = error ? "error" : (res ? res.values.length : 0) + " rows - " + ms + " ms";
  state.lastQueryLines = sql.split("\n").length;
  renderHistory();
  const text = eggText(res);
  state.film = seenFilms(text, state.film);
  const faces = foundSuspects(data.cast, res, state.suspects || (state.suspects = []));
  if (faces.length) { state.suspects.push(...faces); markSuspects(); }
  award(detectBadges(ctx({ sql, text, rows: error ? -1 : (res ? res.values.length : 0), cols: res ? res.columns.length : 0, error: !!error }), state.badges));
  save(state);
  return { sql, res, error };
}

function renderHistory() {
  $("history").innerHTML = state.history.map(q => "<li>" + esc(q) + "</li>").join("");
  [...$("history").children].forEach((li, i) => li.onclick = () => { $("sql").value = state.history[i]; syncSql(); });
}

export const TAUNTS = [
  "MY DEAR CLERK STOP THREE GUESSES STOP GANIMARD GUESSED ONCE IN 1898 AND STILL BLUSHES STOP READ THE OBJECTIVE AGAIN STOP A L",
  "MY DEAR CLERK STOP THE DATA DOES NOT CHANGE ITS MIND STOP YOU MIGHT STOP A L",
  "MY DEAR CLERK STOP A QUERY IS CHEAPER THAN A GUESS STOP RUN ONE STOP A L",
];

export function judgeWrong(norm, data, state) {
  if (data.wrong_suspects[norm]) return data.wrong_suspects[norm];
  return data.wrong_default[state.wrongStreak % data.wrong_default.length];
}

let typer = null;
function typeTelegram(text) {
  clearInterval(typer);
  const el = $("telegram"); el.textContent = ""; let i = 0;
  typer = setInterval(() => { el.textContent = text.slice(0, ++i); if (i >= text.length) clearInterval(typer); }, 25);
  el.onclick = () => { clearInterval(typer); el.textContent = text; };
}

const tablesIn = sql => [...sql.matchAll(/\b(?:from|join)\s+([a-z_]+)/gi)].map(m => m[1].toLowerCase());
export const BADGES = [
  ["Tourist", "SELECT * over seven columns or more. Ganimard sighs.", c => c.event === "query" && /select\s+\*/i.test(c.sql) && c.cols >= 7],
  ["Needle", "A query that returned exactly one row.", c => c.event === "query" && c.rows === 1],
  ["Haystack", "A result too long to show. Two hundred rows is the clerk's limit.", c => c.event === "query" && c.rows > ROW_CAP],
  ["First JOIN", "Two ledgers, one question.", c => c.event === "query" && /\bjoin\b/i.test(c.sql)],
  ["Three's a Crowd", "Three tables in one query.", c => c.event === "query" && (c.sql.match(/\bjoin\b/gi) || []).length >= 2],
  ["Early HAVING", "HAVING before chapter 4. Somebody has been reading ahead.", c => c.event === "query" && /\bhaving\b/i.test(c.sql) && c.chapter < 4],
  ["Aliased", "AS. Ganimard approves of short names.", c => c.event === "query" && /\bas\b/i.test(c.sql)],
  ["Novelist", "A query of more than fifteen lines.", c => c.event === "query" && c.sql.split("\n").length > 15],
  ["Haiku", "A chapter solved in three lines or fewer.", c => c.event === "solve" && c.lines <= 3],
  ["Typo", "Five errors in a row. The typewriter is not to blame.", c => c.event === "query" && c.error && c.state.errorStreak >= 5],
  ["Persistent", "Twenty queries in one chapter.", c => c.event === "query" && (c.state.queries[c.chapter] || 0) >= 20],
  ["Sniper", "A chapter solved on the first query.", c => c.event === "solve" && c.state.queries[c.chapter] === 1],
  ["Insomniac", "A query run between midnight and five.", c => c.event === "query" && c.hour < 5],
  ["Trespasser", "Queried a table the evidence has not reached yet.", c => c.event === "query" && tablesIn(c.sql).some(t => c.allTables.includes(t) && !c.revealed.has(t))],
  ["Archivist", "Read sqlite_master. The card catalogue, in other words.", c => c.event === "query" && /sqlite_master/i.test(c.sql)],
  ["Anagram", "Accused Paul Sernine. Lupin is vain, not stupid.", c => c.event === "answer" && c.norm === "paul sernine"],
  ["Wrong Frenchman", "Accused Horace Velmont. The Prefect's wife is unamused.", c => c.event === "answer" && c.norm === "horace velmont"],
  ["Gentleman", "Answered 'Arsene Lupin'. Yes. Under which name?", c => c.event === "answer" && c.norm === "arsene lupin"],
  ["Window Shopper", "OVER ( before chapter 8.", c => c.event === "query" && /\bover\s*\(/i.test(c.sql) && c.chapter < 8],
  ["Recursive", "WITH RECURSIVE. Ganimard has never seen one and never will.", c => c.event === "query" && /with\s+recursive/i.test(c.sql)],
  ["Egg Hunter", "Found the telegram to the curious clerk.", c => c.event === "code"],
  ["Bouncer", "DISTINCT. Nobody gets in twice.", c => c.event === "query" && /\bdistinct\b/i.test(c.sql)],
  ["Subpoena", "A query inside a query. A question within a question.", c => c.event === "query" && /\(\s*select\b/i.test(c.sql)],
  ["Null and Void", "IS NULL. The absence of evidence is evidence.", c => c.event === "query" && /\bis\s+null\b/i.test(c.sql)],
  ["Wildcard", "LIKE with a %. Half a name is still a name.", c => c.event === "query" && /\blike\s+'[^']*%/i.test(c.sql)],
  ["Commentator", "A comment in a query. Notes in the margin.", c => c.event === "query" && /--|\/\*/.test(c.sql)],
  ["Top of the Class", "ORDER BY ... DESC LIMIT 1. Only the best, or the worst.", c => c.event === "query" && /\border\s+by\b[\s\S]*\bdesc\b[\s\S]*\blimit\s+1\b/i.test(c.sql)],
  ["Ghost Hunter", "A query that found nothing. Lupin was here; the data says otherwise.", c => c.event === "query" && !c.error && c.rows === 0],
  ["Madeleine", "Found Monsieur Proust's report. Seven volumes to follow.", c => c.event === "query" && c.text.includes("a madeleine missing")],
  ["Rosebud", "Found the man in the cape. The sledge was never recovered either.", c => c.event === "query" && c.text.includes("rosebud")],
  ["Film Buff", "Five films quoted in the archives. Cinema was invented in Paris, after all.", c => c.event === "query" && c.state.film.length >= 5],
  ["Time Traveller", "Searched for a date after 1912. The banknote from 2000 was a hint.", c => c.event === "query" && /\b(19(1[3-9]|[2-9]\d)|20\d\d)\d{4}\b/.test(c.sql)],
  ["Paparazzo", "Opened the Suspects gallery. Faces, at last.", c => c.event === "suspects"],
  ["Speed Reader", "A chapter solved within two minutes of opening it.", c => c.event === "solve" && c.elapsed < 120000],
  ["Filed Under the 17th", "Filed the case under the wrong night. Duroc never sleeps, but he does count.",
    c => c.event === "answer" && c.chapter === 1 && c.decoy != null && c.norm === String(c.decoy)],
  ["Lamplighter", "Switched between the day and night editions. Paris has lit its lamps by hand since 1667.", c => c.event === "theme"],
  ["Ganimard", "All twelve chapters. The inspector retires; you take his desk.", c => c.event === "part2"],
];

// Film Buff: lowercase fragments of the movie lines in generate_db.py's noise pools (keep them verbatim there).
export const FILM_LINES = ["would be back", "rosebud", "offer he could not refuse", "no place like home", "tin suit",
  "do not give a damn", "i see dead people", "houston", "elementary, inspector", "may the force", "simply walk into",
  "little friend", "you talking to me", "there is no spoon", "bond, jean bond"];
// Easter eggs count only in a narrow result: a SELECT * over the archive must not hand them all out.
export const EGG_ROWS = 10;
export function eggText(res) {
  return res && res.values.length <= EGG_ROWS ? res.values.map(r => r.join(" ")).join(" ").toLowerCase() : "";
}
export function seenFilms(text, have) { return have.concat(FILM_LINES.filter(m => text.includes(m) && !have.includes(m))); }

// Stories and endings carry **bold** and *italic* (plot.py); escaped first, so nothing else becomes markup.
export function richText(s) {
  return esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\*(.+?)\*/g, "<i>$1</i>");
}

export function detectBadges(ctx, have) {
  return BADGES.filter(([name, , pred]) => !have.includes(name) && pred(ctx)).map(([name, text]) => ({ name, text }));
}

function award(list) {
  list.forEach((b, i) => {
    state.badges.push(b.name);
    const t = document.createElement("div"); t.className = "toast"; t.innerHTML = "<b>Badge: " + esc(b.name) + "</b><br>" + esc(b.text);
    $("toasts").appendChild(t); setTimeout(() => t.remove(), 5000 + i * 400);   // stagger so a badge burst doesn't vanish as one block
  });
  if (list.length) save(state);
}

export const RANKS = [[25, "Ganimard himself"], [40, "Chief Inspector"], [60, "Inspector"], [Infinity, "Constable"]];  // tune after the first class
export function rank(queries) { return RANKS.find(([q]) => queries <= q)[1]; }

// Settings the ?admin panel changes live: apps_script.gs stores them (Script Property CONFIG) and serves
// them at <board>?config=1; boot applies them over the defaults above. leaderboard.html reads `penalty`.
// Returns the fields it refused; a refused or missing field keeps its default.
export const PENALTY = { wrong: 10 };  // seconds per wrong answer, mirrored as the default in leaderboard.html
export function applyConfig(cfg) {
  if (!cfg || typeof cfg !== "object" || Array.isArray(cfg)) return [];
  const bad = [];
  const r = cfg.ranks;
  if (r !== undefined) {
    if (Array.isArray(r) && r.length === 3 && r.every((q, i) => Number.isInteger(q) && q > 0 && (!i || q > r[i - 1])))
      r.forEach((q, i) => { RANKS[i][0] = q; });
    else bad.push("ranks");
  }
  const t = cfg.taunts;
  if (t !== undefined) {
    if (Array.isArray(t) && t.length && t.every(s => typeof s === "string" && s.trim()))
      TAUNTS.splice(0, TAUNTS.length, ...t.map(s => s.trim()));
    else bad.push("taunts");
  }
  for (const k of ["wrong"]) {
    const v = cfg.penalty?.[k];
    if (v === undefined) continue;
    if (Number.isFinite(v) && v >= 0) PENALTY[k] = v; else bad.push("penalty." + k);
  }
  return bad;
}
export function currentConfig() {
  return { ranks: RANKS.slice(0, 3).map(([q]) => q), taunts: [...TAUNTS], penalty: { ...PENALTY } };
}
export function duration(s) { return s && s % 60 === 0 ? s / 60 + (s === 60 ? " minute" : " minutes") : s + " seconds"; }
export function configUrl(board) { const u = new URL(board); u.searchParams.set("config", "1"); return u.href; }
export function partStats(state, from, to) {
  let queries = 0;
  for (let n = from; n <= to; n++) queries += state.queries[n] || 0;
  return { queries };
}

function renderCertificate() {
  const p1 = partStats(state, 1, 8), p2 = partStats(state, 9, 12);
  const r1 = part1Done(state) ? rank(p1.queries) : "";
  $("certificate").innerHTML =
    '<div class="mast-title">LE PETIT JOURNAL</div><div class="mast-sub">PARIS &mdash; ' + new Date().toLocaleDateString("en-GB") + "</div>" +
    "<h1>CASE CLOSED" + (state.solved.includes(12) ? ", TWICE" : "") + "</h1>" +
    "<p>The Prefecture of Police certifies that <b>" + esc(state.names || "the clerk") + "</b> unmasked Arsene Lupin in " + state.solved.filter(n => n <= 8).length + " chapters, " +
    p1.queries + " queries, and is hereby ranked <b>" + esc(r1) + "</b>." +
    (state.part2 ? " Part II: " + state.solved.filter(n => n > 8).length + " of 4 chapters, " + p2.queries + " queries.</p>" : "</p>") +
    '<p class="label">BADGES</p><ul class="badges">' + state.badges.map(b => "<li>" + esc(b) + "</li>").join("") + "</ul>" +
    (state.notes ? '<p class="label">NOTES</p><pre>' + esc(state.notes) + "</pre>" : "") +
    "<p class=\"muted\">Ganimard's signature is illegible, as always.</p>";
}

function ctx(extra) {
  return { event: "query", sql: "", rows: 0, error: false, chapter: currentChapter(state, data.chapters).n, state,
           cols: 0, allTables: Object.keys(tableSizes), revealed: visibleTables(data.chapters, state),
           norm: "", text: "", lines: state.lastQueryLines, hour: new Date().getHours(),
           elapsed: Date.now() - (state.opened[currentChapter(state, data.chapters).n] || Date.now()),
           decoy: data.decoys ? data.decoys[currentChapter(state, data.chapters).n] : undefined, ...extra };
}

function renderBoard() {
  const label = n => (data.chapters.find(c => c.n === n) || {}).board || "";
  $("board").innerHTML = state.solved.map(n => '<div class="card" data-n="' + n + '"><b>' + ROMAN[n] + '</b> <span class="card-label">' +
    esc(label(n)) + "</span><br>" + esc(state.answers[n]) + "</div>").join("");
  $("board").querySelectorAll(".card").forEach(el => el.onclick = () => reviewChapter(Number(el.dataset.n)));
}

// A suspect is met once an unlocked chapter's story names them (cast.meet) or a result the student saw showed
// their name (state.suspects); each note joins the bio once its chapter is reached (plot.py CAST).
export function metSuspects(cast, state, chapters) {
  const reached = currentChapter(state, chapters).n, found = state.suspects || [];
  return cast.filter(s => s.meet <= reached || found.includes(s.name))
    .map(s => ({ ...s, notes: (s.notes || []).filter(([n]) => n <= reached).map(([, t]) => t) }));
}
export function foundSuspects(cast, res, have) {
  if (!res) return [];
  const text = res.values.slice(0, ROW_CAP).map(r => r.join(" ")).join(" ").toLowerCase();   // only rows on screen
  return cast.map(s => s.name).filter(n => !have.includes(n) && text.includes(n.toLowerCase()));
}
function renderSuspects() {
  const el = $("suspects"), met = metSuspects(data.cast, state, data.chapters);
  el.innerHTML = '<button class="quiet suspects-close">Close</button>' + (met.length ? met.map(s => {
    const file = PORTRAIT_FILE[s.name];
    const img = file ? '<img src="portraits/' + file + '.jpg" alt="">' : "";
    return '<div class="suspect">' + img + '<b>' + esc(s.name) + '</b><span class="muted">' + esc(s.nationality) + '</span><p>' + esc(s.bio) + '</p>' +
      s.notes.map(n => '<p class="note">' + esc(n) + '</p>').join("") + '</div>';
  }).join("") : '<p class="muted">Nobody yet. Ganimard suspects everyone, which is the same thing.</p>');
  el.querySelector(".suspects-close").onclick = () => el.hidden = true;
  state.suspectsSeen = met.reduce((k, s) => k + 1 + s.notes.length, 0); save(state);
  markSuspects();
}
// The Suspects button carries a dot while the gallery holds a face or a note the student has not opened yet.
function markSuspects() {
  const met = metSuspects(data.cast, state, data.chapters);
  $("btn-suspects").classList.toggle("new", met.reduce((k, s) => k + 1 + s.notes.length, 0) > (state.suspectsSeen || 0));
}

// Every badge is listed; a locked one shows no name and no text at all, so the DOM gives nothing away.
function renderBadges() {
  const el = $("badges");
  el.innerHTML = '<button class="quiet suspects-close">Close</button><h2 class="badges-title">Badges: ' +
    state.badges.length + " of " + BADGES.length + "</h2>" + BADGES.map(([name, text]) => state.badges.includes(name)
      ? '<div class="badge"><b>' + esc(name) + "</b><p>" + esc(text) + "</p></div>"
      : '<div class="badge locked"><b>???</b><p>Not yet earned.</p></div>').join("");
  el.querySelector(".suspects-close").onclick = () => el.hidden = true;
}

let visBefore = new Set();
async function submitAnswer() {
  const raw = $("answer").value; const norm = normalise(raw);
  if (!norm) return;
  visBefore = new Set(visibleTables(data.chapters, state));
  const hash = await sha256(norm);
  const ch = currentChapter(state, data.chapters);
  if (awaitingCode(state)) {
    if (hash === data.part2_code_sha256) { state.part2 = true; applyMood(); $("reply").textContent = "The code is accepted. Ganimard has gone home. You have not."; afterSolve(null, "code"); }
    else { $("reply").textContent = "That is not the code. It is four words, in a telegram nobody was meant to read."; }
    $("answer").value = ""; save(state); return;
  }
  if (hash === ch.answer_sha256) {
    state.solved.push(ch.n); state.answers[ch.n] = raw.trim(); state.wrongStreak = 0;
    $("reply").textContent = "Correct. Ganimard grunts, which is praise.";
    typeTelegram(ch.telegram);
    afterSolve(ch, "solve");
  } else {
    state.wrong[ch.n] = (state.wrong[ch.n] || 0) + 1; state.wrongStreak++;
    $("reply").textContent = judgeWrong(norm, data, state);
    if (state.wrongStreak % 3 === 0) typeTelegram(TAUNTS[(state.wrongStreak / 3 - 1) % TAUNTS.length]);
    afterWrong(norm);   // Task 7 badge hook; define as an empty function here
  }
  $("answer").value = ""; save(state);
}

export function visibleTables(chapters, state) {
  const cur = currentChapter(state, chapters).n;
  const seen = new Set();
  for (const ch of chapters) if (ch.n <= cur) ch.tables.forEach(t => seen.add(t));
  return seen;
}

let erdLoaded = false;
async function renderErd(newTables = []) {
  if (!erdLoaded) { $("erd").innerHTML = await (await fetch("schema.svg")).text(); erdLoaded = true; }
  const vis = visibleTables(data.chapters, state);
  for (const g of $("erd").querySelectorAll("g.table")) {
    const t = g.dataset.table;
    g.classList.toggle("hidden", !vis.has(t));
    g.classList.toggle("reveal", newTables.includes(t));
  }
  for (const p of $("erd").querySelectorAll("g.fk")) {
    const from = p.dataset.from.split(".")[0], to = p.dataset.to;
    p.classList.toggle("hidden", !(vis.has(from) && vis.has(to)));
  }
  fitErd();
  if (newTables.length) {
    $("erd").querySelectorAll(".stamp").forEach(s => s.remove());   // two reveals within 2.5 s must not overlap
    const s = document.createElement("div"); s.className = "stamp"; s.textContent = "NEW EVIDENCE";
    $("erd").appendChild(s); setTimeout(() => s.remove(), 2500);
  }
}

// Crop the viewBox to the tables revealed so far and fit that to the column (never upscaled past
// natural size); Enlarge shows the same crop at natural size, scrolling if it has to.
function fitErd() {
  const svg = $("erd").querySelector("svg");
  if (!svg) return;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const g of svg.querySelectorAll("g.table:not(.hidden)")) {
    const [tx, ty] = (g.getAttribute("transform").match(/-?[\d.]+/g) || [0, 0]).map(Number);
    const r = g.querySelector("rect");
    x0 = Math.min(x0, tx); y0 = Math.min(y0, ty);
    x1 = Math.max(x1, tx + Number(r.getAttribute("width"))); y1 = Math.max(y1, ty + Number(r.getAttribute("height")));
  }
  if (x0 === Infinity) return;
  const m = 8, w = x1 - x0 + 2 * m, h = y1 - y0 + 2 * m;
  svg.setAttribute("viewBox", [x0 - m, y0 - m, w, h].join(" "));
  svg.removeAttribute("width"); svg.removeAttribute("height");
  svg.style.maxWidth = w + "px";
  svg.style.width = $("erd").classList.contains("large") ? w + "px" : "100%";
}

function afterSolve(ch, event) {
  const newTables = [...visibleTables(data.chapters, state)].filter(t => !visBefore.has(t));
  const ending = awaitingCode(state) || competeDone(state) || state.solved.includes(12);
  if (event === "solve" && !ending) { reviewing = nextPending = ch.n; pendingReveal = newTables; }
  else renderErd(newTables);
  renderBoard(); renderChapter();
  if (nextPending) $("btn-next").scrollIntoView({ block: "nearest" });
  if (event === "solve") {
    award(detectBadges(ctx({ event: "solve", chapter: ch.n }), state.badges));
    if (ch.n === 8) {
      award(detectBadges(ctx({ event: "part1", chapter: ch.n }), state.badges));
      const p1 = partStats(state, 1, 8);
      $("reply").textContent += " Rank: " + rank(p1.queries);
    }
    if (state.mode === "compete") {
      if (ch.n === 8) { state.finishedAt = Date.now(); queueEvent("finish", 8); renderChapter(); tickClock(); }
      else queueEvent("progress", ch.n);
    }
    if (ch.n === 12) award(detectBadges(ctx({ event: "part2", chapter: ch.n }), state.badges));
  } else if (event === "code") {
    award(detectBadges(ctx({ event: "code" }), state.badges));
  }
}
function afterWrong(norm) {
  award(detectBadges(ctx({ event: "answer", norm }), state.badges));
}

// --- compete mode: the clock and the outbox ----------------------------------------------------
let ticker = null;
function tickClock() {
  const el = $("compete-info");
  el.hidden = false;
  el.textContent = "SEASON " + state.season + " \u2014 " + state.team.toUpperCase() + " \u2014 " +
    fmtTime((state.finishedAt || Date.now()) - state.startedAt) + (boardUrl ? "" : " \u2014 NOT RECORDED");
}
function startClock() { clearInterval(ticker); tickClock(); ticker = setInterval(tickClock, 1000); }

function queueEvent(event, chapter) {
  state.outbox.push(eventPayload(state, event, chapter));
  save(state);
  flushOutbox();
}
let flushing = false;
async function flushOutbox() {
  // Oldest first, one at a time, in order; a failure leaves the row in the outbox and retries in 30 s.
  // The body is text/plain so the browser sends no CORS preflight (Apps Script cannot answer one).
  if (!boardUrl || flushing || !state.outbox.length) return;
  flushing = true;
  try {
    while (state.outbox.length) {
      const r = await fetch(boardUrl, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
                                        body: JSON.stringify(state.outbox[0]) });
      if (!r.ok) throw new Error("HTTP " + r.status);
      state.outbox.shift();
      save(state);
    }
  } catch (e) {
    console.warn("leaderboard unreachable, retrying in 30 s:", e.message);
    setTimeout(flushOutbox, 30000);
  } finally {
    flushing = false;
  }
}

async function loadSeason() {
  data = seasonData || await (await fetch("season-" + season + ".json")).json();
  await loadDb("season-" + season);
  startClock();
  flushOutbox();
}

// One leaderboard row per name and season (leaderboard.html keys on name|season), so a second player
// typing the same name would merge into the first: refuse it up front.
export function nameTaken(rows, season, name) {
  const n = name.trim().toLowerCase();
  return rows.some(r => Number(r.season) === season && String(r.team).trim().toLowerCase() === n);
}

async function startCompete() {
  const team = $("team").value.trim();
  if (!team) { $("team").focus(); return; }
  $("btn-start").disabled = true;
  if (boardUrl) {
    $("status").textContent = "Checking the pseudo...";
    // An unreachable board must not block the class: the check is skipped, the game still starts.
    const rows = await fetch(boardUrl).then(r => r.json()).catch(() => []);
    if (nameTaken(rows, season, team)) {
      $("status").textContent = "Someone already plays season " + season + " as \"" + team + "\". Pick another pseudo.";
      $("btn-start").disabled = false; $("team").focus(); return;
    }
  }
  $("status").textContent = "Opening season " + season + "...";
  key = storageKey("compete");
  state = { ...freshState(), mode: "compete", season, team, startedAt: Date.now() };
  queueEvent("start", 0);
  await loadSeason();
  renderBoard(); renderHistory(); enterGame();
  $("notes").value = state.notes;
}

async function fetchSeason(n) {
  return fetch("season-" + n + ".json").then(r => r.ok ? r.json() : null).catch(() => null);
}

// The teacher's link (?season=N) names the season; without one, Compete asks for the number instead.
function offerCompete() {
  const b = $("btn-compete");
  if (season && !seasonData) { b.title = "Season " + season + " is not on this server. Ask your teacher to build it."; return; }
  b.disabled = false; b.title = "Part I only, against the clock.";
  b.onclick = async () => {
    if (!seasonData) {
      const n = Number(prompt("Season number (ask your teacher):"));
      if (!n) return;
      seasonData = await fetchSeason(n);
      if (!seasonData) { $("status").textContent = "Season " + n + " is not on this server."; return; }
      season = n;
    }
    $("compete-note").innerHTML = boardUrl
      ? "Part I, chapters I to VIII, against the clock. " + duration(PENALTY.wrong) +
        " per wrong answer; queries are free. The clock starts when you press the button and stops when Lupin is named." +
        ' Your pseudo and progress go to the class leaderboard (<a href="privacy.html" target="_blank">what is sent</a>).'
      : "No leaderboard is connected, so the clock runs locally and nothing is recorded.";
    $("compete-form").hidden = false; $("team").focus();
  };
  $("btn-start").onclick = startCompete;
  $("team").addEventListener("keydown", e => { if (e.key === "Enter") startCompete(); });
}

// Part II mood: dark palette + a later masthead date (see style.css's [data-mood="night"]). The palette is
// the reader's choice once they press the Day/Night edition button (per browser, THEME_KEY); until then
// it follows the story. The masthead date always follows the story.
const THEME_KEY = "ritz.theme";
function chosenTheme() { try { return localStorage.getItem(THEME_KEY); } catch { return null; } }
function applyMood() {
  const mood = chosenTheme() || (state && state.part2 ? "night" : "day");
  document.documentElement.dataset.mood = mood;
  $("btn-theme").textContent = mood === "night" ? "Day edition" : "Night edition";
  if (state) $("masthead-date").textContent = state.part2 ? "19 MAY 1912" : "18 MAY 1912";
}
function toggleTheme() {
  try { localStorage.setItem(THEME_KEY, document.documentElement.dataset.mood === "night" ? "day" : "night"); } catch {}
  applyMood();
  if (state && data) award(detectBadges(ctx({ event: "theme" }), state.badges));   // before boot has loaded them: no badge
}

// Gates both ?chapter=N and the ?admin panel: nobody skips ahead just by knowing the query params.
// Passphrase is asked for once per page load (adminUnlocked persists after); ask the course owner
// for it, it is not committed in plaintext anywhere.
const ADMIN_PASS_SHA256 = "9f955a0544ad84b27900a9818179cf4e53a5a362f911f69217afbe530d3c5c81";
let adminUnlocked = false, adminPass = "";  // adminPass: memory only, sent as the key when saving settings
async function unlockAdmin() {
  if (adminUnlocked) return true;
  const pass = prompt("Admin passphrase:");
  if (!pass) return false;
  adminUnlocked = (await sha256(normalise(pass))) === ADMIN_PASS_SHA256;
  if (adminUnlocked) adminPass = pass;
  if (!adminUnlocked) alert("Wrong passphrase.");
  return adminUnlocked;
}

async function jumpToChapter(n) {
  if (!(await unlockAdmin())) return false;
  noPersist = true;
  state = freshState();
  for (let i = 1; i < n; i++) { state.solved.push(i); state.answers[i] = "(debug)"; }
  if (n > 8) state.part2 = true;
  enterGame();
  return true;
}

// Admin Seasons view. Every deploy builds seasons 1-20 (pages.yml), so "managing" a season is only
// picking an unused number and sharing its links; usage is read back from the log sheet's rows.
export function seasonUsage(rows) {
  const by = new Map();
  for (const r of rows) {
    const n = Number(r.season);
    if (!n) continue;
    const u = by.get(n) || { season: n, teams: new Set(), last: 0 };
    u.teams.add(r.team);
    u.last = Math.max(u.last, Number(r.timestamp) || 0);
    by.set(n, u);
  }
  return [...by.values()].sort((a, b) => a.season - b.season).map(u => ({ ...u, teams: u.teams.size }));
}
export function nextFreeSeason(usage) { let n = 1; while (usage.some(u => u.season === n)) n++; return n; }
export function seasonLinks(base, n, board) {
  const q = encodeURIComponent(board);
  return { investigate: base + (board ? "?board=" + q : ""),
           student: base + "?season=" + n + (board ? "&board=" + q : ""),
           leaderboard: base + "leaderboard.html" + (board ? "?data=" + q : "") };
}

async function renderAdminPanel() {
  if (!location.search.includes("admin") || !(await unlockAdmin())) return;
  document.getElementById("admin-panel")?.remove();
  const el = document.createElement("div"); el.id = "admin-panel"; el.className = "admin-panel";
  el.innerHTML = '<span class="label">ADMIN</span>' +
    data.chapters.map(c => '<button data-n="' + c.n + '">' + c.n + '</button>').join("") +
    '<button id="admin-seasons-btn">Seasons</button> <button id="admin-settings-btn">Settings</button>' +
    '<input id="admin-board" class="admin-board" placeholder="Apps Script /exec URL">' +
    '<div id="admin-settings" class="admin-seasons" hidden>' +
    'Rank = most queries for Part I:<br>' +
    RANKS.slice(0, 3).map(([, name], i) => name + ' <input id="cfg-r' + i + '" type="number" min="1"> ').join("") +
    '<br>Leaderboard penalty, seconds per wrong answer ' +
    '<input id="cfg-pw" type="number" min="0"><br>Telegrams after every third wrong answer, one per line:' +
    '<textarea id="cfg-taunts" rows="4"></textarea><button id="cfg-save">Save</button>' +
    '<div id="cfg-msg" class="admin-msg"></div></div>' +
    '<div id="admin-seasons" class="admin-seasons" hidden>' +
    '<button id="admin-load">Reload</button>' +
    '<table id="admin-usage"></table>' +
    'Season <input id="admin-season" type="number" min="1" max="20"> ' +
    '<button id="admin-copy-student">Compete link</button> <button id="admin-copy-board">Leaderboard link</button>' +
    '<br><button id="admin-copy-learn">Investigate link</button> (carries your settings into learning mode)' +
    '<div id="admin-msg" class="admin-msg"></div></div>';
  el.querySelectorAll("button[data-n]").forEach(b => b.onclick = () => jumpToChapter(Number(b.dataset.n)));
  const q = id => el.querySelector("#" + id);
  q("admin-board").value = boardUrl;
  const loadUsage = async () => {
    const board = q("admin-board").value.trim();
    if (!board) { q("admin-msg").textContent = "Paste the /exec URL (or open ?admin&board=<url>) to see which seasons are used."; return; }
    q("admin-msg").textContent = "Loading...";
    try {
      const usage = seasonUsage(await (await fetch(board)).json());
      q("admin-usage").innerHTML = "<tr><th>Season</th><th>Players</th><th>Last activity</th></tr>" +
        usage.map(u => "<tr><td>" + u.season + "</td><td>" + u.teams + "</td><td>" +
          (u.last ? new Date(u.last).toISOString().slice(0, 10) : "-") + "</td></tr>").join("");
      q("admin-season").value = nextFreeSeason(usage);
      q("admin-msg").textContent = usage.length ? "" : "No season used yet.";
    } catch { q("admin-msg").textContent = "Could not read the leaderboard backend."; }
  };
  const copy = async which => {
    const n = Number(q("admin-season").value);
    if (which !== "investigate" && (!(n >= 1) || !(await fetchSeason(n)))) { q("admin-msg").textContent = "Season " + n + " is not on this server (1-20 are built)."; return; }
    const base = location.href.replace(/[?#].*$/, "").replace(/index\.html$/, "");
    const link = seasonLinks(base, n, q("admin-board").value.trim())[which];
    try { await navigator.clipboard.writeText(link); q("admin-msg").textContent = "Copied: " + link; }
    catch { q("admin-msg").textContent = link; }
  };
  q("admin-seasons-btn").onclick = () => { const s = q("admin-seasons"); s.hidden = !s.hidden; if (!s.hidden) loadUsage(); };
  const fillSettings = () => {
    const c = currentConfig();
    c.ranks.forEach((v, i) => { q("cfg-r" + i).value = v; });
    q("cfg-pw").value = c.penalty.wrong;
    q("cfg-taunts").value = c.taunts.join("\n");
  };
  q("admin-settings-btn").onclick = async () => {
    const s = q("admin-settings"); s.hidden = !s.hidden;
    if (s.hidden) return;
    const board = q("admin-board").value.trim();
    q("cfg-msg").textContent = board ? "Loading..." : "No /exec URL: showing the built-in defaults, saving is off.";
    if (board) {
      try { applyConfig(await (await fetch(configUrl(board))).json()); q("cfg-msg").textContent = ""; }
      catch { q("cfg-msg").textContent = "Could not read the settings; showing what this page has."; }
    }
    fillSettings();
  };
  q("cfg-save").onclick = async () => {
    const board = q("admin-board").value.trim();
    if (!board) { q("cfg-msg").textContent = "Paste the /exec URL first."; return; }
    const cfg = { ranks: [0, 1, 2].map(i => Number(q("cfg-r" + i).value)),
                  penalty: { wrong: Number(q("cfg-pw").value) },
                  taunts: q("cfg-taunts").value.split("\n").map(s => s.trim()).filter(Boolean) };
    const bad = applyConfig(cfg);
    if (bad.length) { q("cfg-msg").textContent = "Not saved, check: " + bad.join(", ") + " (ranks must be whole numbers, increasing)."; return; }
    q("cfg-msg").textContent = "Saving...";
    try {
      const r = await (await fetch(board, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
                                            body: JSON.stringify({ config: cfg, key: adminPass }) })).json();
      q("cfg-msg").textContent = r.ok ? "Saved. Players get it on their next page load."
        : "Refused by the backend: " + (r.error || "unknown") + ". Is ADMIN_KEY set to the admin passphrase?";
    } catch { q("cfg-msg").textContent = "Could not reach the backend (is apps_script.gs redeployed?)."; }
  };
  q("admin-load").onclick = loadUsage;
  q("admin-copy-student").onclick = () => copy("student");
  q("admin-copy-board").onclick = () => copy("leaderboard");
  q("admin-copy-learn").onclick = () => copy("investigate");
  document.body.appendChild(el);
}

function enterGame() { $("landing").hidden = true; applyMood(); renderChapter(); renderErd(); renderAdminPanel(); }

async function boot() {
  $("btn-theme").onclick = toggleTheme;
  applyMood();   // the reader's palette on the landing page too, before any state is loaded
  const params = new URLSearchParams(location.search);
  season = Number(params.get("season")) || 0;
  boardUrl = params.get("board") || "";   // the deployment URL travels in links, never in this public repo
  // Not awaited: settings only matter at the first wrong answer or the rank, well after load.
  if (boardUrl) fetch(configUrl(boardUrl)).then(r => r.json()).then(applyConfig).catch(() => {});
  const debugChapter = Number(params.get("chapter"));
  const linked = season > 0;
  // A team that reloads the page mid-season lands back in its game, clock still running: with the
  // season link, always (a finished season shows its finish screen); without it, only while unfinished.
  const saved = loadFrom(storageKey("compete"));
  const savedLive = saved.mode === "compete" && saved.team && saved.season > 0;
  if (!season && savedLive && !part1Done(saved) && !debugChapter) season = saved.season;
  if (season) seasonData = await fetchSeason(season);
  const resuming = !!(seasonData && savedLive && saved.season === season && !debugChapter);
  // debugChapter is gated by unlockAdmin() (same passphrase as the ?admin panel): only asked when
  // ?chapter=N is actually present, so a plain ?season= link never prompts for anything.
  let debugOk = false;
  if (resuming) {
    key = storageKey("compete");
    state = saved;
    await loadSeason();
  } else {
    data = await (await fetch("chapters.json")).json();
    debugOk = debugChapter >= 1 && debugChapter <= 12 && await unlockAdmin();
    if (debugOk) {
      noPersist = true;
      state = freshState();
      for (let n = 1; n < debugChapter; n++) { state.solved.push(n); state.answers[n] = "(debug)"; }
      if (debugChapter > 8) state.part2 = true;
    } else {
      state = loadFrom(key);
    }
    await loadDb("mystery");
  }
  $("status").textContent = "The archives are open.";
  $("btn-investigate").disabled = false;
  $("btn-investigate").onclick = enterGame;
  // A season link always shows the landing page (the student picks Compete there), unless a season game is under way.
  if (resuming || (!linked && state.solved.length) || debugOk) enterGame(); else renderAdminPanel();
  if (!resuming) offerCompete();
  $("btn-back").onclick = backToInvestigation;
  $("masthead-chapter").onclick = e => {
    e.stopPropagation();
    const menu = $("chapter-menu");
    if (!menu.hidden) { menu.hidden = true; return; }
    menu.innerHTML = ['<div class="chapter-menu-item" data-n="0">Current</div>']
      .concat(state.solved.map(n => '<div class="chapter-menu-item" data-n="' + n + '">' + ROMAN[n] + "</div>")).join("");
    menu.querySelectorAll(".chapter-menu-item").forEach(el => el.onclick = () => {
      const n = Number(el.dataset.n);
      if (n === 0) backToInvestigation(); else reviewChapter(n);
      menu.hidden = true;
    });
    menu.hidden = false;
  };
  document.addEventListener("click", () => { $("chapter-menu").hidden = true; });
  $("btn-run").onclick = runQuery;
  $("sql").addEventListener("keydown", e => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); runQuery(); }
    else if (e.ctrlKey && !e.metaKey && e.key.toLowerCase() === "f") {   // Ctrl only: Cmd+F stays the browser's find
      e.preventDefault();
      e.target.value = formatSql(e.target.value);
      e.target.selectionStart = e.target.selectionEnd = e.target.value.length;
      syncSql();
    }
    else if (e.key === "Tab") {
      e.preventDefault();
      const el = e.target, s = el.selectionStart, en = el.selectionEnd;
      el.value = el.value.slice(0, s) + "\t" + el.value.slice(en);
      el.selectionStart = el.selectionEnd = s + 1;
      syncSql();
    } else if (e.key === "Enter") {
      e.preventDefault();
      const el = e.target, s = el.selectionStart, en = el.selectionEnd;
      const lineStart = el.value.lastIndexOf("\n", s - 1) + 1;
      const indent = el.value.slice(lineStart, s).match(/^[ \t]*/)[0];
      el.value = el.value.slice(0, s) + "\n" + indent + el.value.slice(en);
      el.selectionStart = el.selectionEnd = s + 1 + indent.length;
      syncSql();
    }
  });
  $("sql").addEventListener("input", syncSql);
  syncSql();
  $("btn-next").onclick = backToInvestigation;
  $("btn-badges").onclick = () => { renderBadges(); $("badges").hidden = false; };
  renderHistory();
  $("btn-answer").onclick = submitAnswer;
  $("answer").addEventListener("keydown", e => { if (e.key === "Enter") submitAnswer(); });
  renderBoard();
  $("btn-erd").onclick = () => {
    const large = $("erd").classList.toggle("large");
    $("btn-erd").textContent = large ? "Close" : "Enlarge";
    fitErd();
  };
  $("btn-suspects").onclick = () => { renderSuspects(); $("suspects").hidden = false; award(detectBadges(ctx({ event: "suspects" }), state.badges)); };
  $("notes").value = state.notes;
  $("notes").oninput = () => { state.notes = $("notes").value; save(state); };
  $("btn-reset").onclick = () => {
    const msg = state.mode === "compete" ? "Abandon the season? The clock, notes and badges are erased; rows already on the leaderboard stay."
                                         : "Start a new investigation? Progress, notes and badges are erased.";
    if (confirm(msg)) { state = freshState(); save(state); location.reload(); }
  };
  $("btn-print").onclick = () => {
    if (!state.names) { state.names = prompt("Names for the certificate (both of you):") || ""; save(state); }
    renderCertificate();
    window.print();
  };
  if (location.search.includes("selftest")) {
    let failures = 0;
    for (const [raw, want] of data.normalise_fixture) {
      const got = normalise(raw);
      if (got !== want) { failures++; console.error("normalise mismatch", raw, "got", got, "want", want); }
    }
    const personCount = db.exec("SELECT COUNT(*) FROM person")[0].values[0][0];
    if (!(personCount > 5000)) { failures++; console.error("person table has only " + personCount + " rows"); }
    const version = db.exec("SELECT sqlite_version()")[0].values[0][0];
    $("status").textContent = failures
      ? "SELFTEST FAILED: " + failures + " (see console)"
      : "SELFTEST OK: " + data.normalise_fixture.length + " normalisation cases, SQLite " + version;
  }
}

if (typeof document !== "undefined") boot();
