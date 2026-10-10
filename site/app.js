// site/app.js -- The Ritz Affair. ES module: pure functions exported for node --test, boot() only in a browser.
import { normalise, sha256, teamKey, ADMIN_PASS_SHA256 } from "./shared.js";
export { normalise, sha256, teamKey, STOP_WORDS } from "./shared.js";

export function freshState() {
  return { mode: "learn", season: "", team: "", startedAt: 0, finishedAt: 0, outbox: [], db: 0, seasonName: "", penalty: 10, over: false, board: "",
           solved: [], part2: false, queries: {}, wrong: {}, wrongStreak: 0, errorStreak: 0,
           badges: [], history: [], notes: "", names: "", lastQueryLines: 0, totalQueries: 0, answers: {},
           film: [], opened: {}, suspects: [], suspectsSeen: 0, extraSeen: false, extraSeen2: false, token: "" };
}
// queries/wrong are keyed by chapter number: { "1": 3, "2": 7 }
// mode is "learn" (the 12-chapter investigation) or "compete" (Part I only, against the clock, season-<db>.*);
// in compete, season is the season record's id, db its database, startedAt its openedAt (the teacher's Open),
// token what "join" returned; outbox holds events not yet accepted by the Apps Script, so a lost connection
// never loses a row; over is set once the backend says the session is closed.
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
let saveWarned = false;
export function save(state) {
  if (noPersist) return;
  try { localStorage.setItem(key, JSON.stringify(state)); }
  catch { if (!saveWarned && typeof document !== "undefined") { saveWarned = true; toast("Progress is not being saved in this browser.", "Not saved"); } }
}

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
// One row of the Apps Script's log sheet. The server stamps the time itself; the client's clock travels
// too (clientAt, and elapsedMs = finish - openedAt at the finish) so the board can flag a disagreeing clock.
export function eventPayload(state, event, chapter, now = Date.now()) {
  const s = competeStats(state);
  return { event, team: state.team, season: state.season, chapter: chapter || state.solved.length,
           wrong: s.wrong, queries: s.queries, clientAt: now,
           ...(event === "finish" ? { elapsedMs: (state.finishedAt || now) - state.startedAt } : {}) };
}

// The deploy loads this script as app.js?v=<commit> (.github/workflows/pages.yml); the data files are fetched
// with the same query, so a page never mixes this deploy's code with a previous deploy's cached data.
// Empty locally and under node.
const VERSION = new URL(import.meta.url).search;

const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];

// One painted object per chapter beside its title: site/icons/chNN.png (96 px, transparent; prompts and
// how they were cut out in docs/mockups/chapter-icon-prompts.md).
const iconSrc = n => "icons/ch" + String(n).padStart(2, "0") + ".png";

// Portrait file per suspect in data.cast (site/portraits/*.jpg -- Style A/Lavery colour, generated;
// see docs/superpowers/specs section 8's visual-identity entry). Same six every mode; Lupin himself
// never gets one singled out, so no face reads guiltier than another before chapter VIII.
const PORTRAIT_FILE = { "Lord Ashcombe": "ashcombe", "Paul Sernine": "sernine", "Horace Velmont": "velmont",
  "Raul Ortega": "ortega", "Ines de Almagro": "almagro", "Rupert Blakeney": "blakeney" };

const $ = id => document.getElementById(id);

let db, data, state, tableSizes = {};
let seasonId = "", seasonMeta = null, boardUrl = "";

async function loadDb(stem) {
  const SQL = await initSqlJs({ locateFile: f => "https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.13.0/" + f });
  const buf = await (await fetch(stem + ".sqlite" + VERSION)).arrayBuffer();
  if (db) db.close();
  db = new SQL.Database(new Uint8Array(buf));
  db.run("PRAGMA query_only = 1");   // DROP/UPDATE/DELETE fail with "attempt to write a readonly database" instead of silently breaking the chapter
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
const objectiveHtml = (text, label, value, ch) => esc(text) + '<div class="answer-form"><b>' + label + "</b> " + esc(value) + "</div>" +
  // the chapter's SQL tool and new tables sit under a closed Hint toggle (a native <details>), so the
  // student tries first and opens it when stuck
  (ch && (ch.construct || (ch.tables || []).length) ? '<details class="muted chapter-tools"><summary>Hint</summary>' +
    (ch.construct ? "<div><b>This chapter's tool:</b> " + esc(ch.construct) + "</div>" : "") +
    (ch.tables.length ? "<div><b>New evidence:</b> " + esc(ch.tables.join(", ")) + "</div>" : "") + "</details>" : "");

function renderChapter() {
  markSuspects();
  const total = state.part2 ? 12 : 8;
  // Speed Reader: when the current chapter was first put in front of the player
  if (reviewing == null) { const n = currentChapter(state, data.chapters).n; if (!state.opened[n]) { state.opened[n] = Date.now(); save(state); track("chapter_open", { chapter: n, mode: state.mode }); } }
  document.querySelector(".answer-row").hidden = reviewing != null || competeDone(state);
  const pendingHere = nextPending && reviewing === nextPending;
  $("btn-back").hidden = reviewing == null || pendingHere;
  $("btn-next").hidden = !pendingHere;
  if (pendingHere) $("btn-next").textContent = "Next chapter: " + ROMAN[currentChapter(state, data.chapters).n] + " \u2192";
  if (reviewing != null) {
    const ch = data.chapters.find(c => c.n === reviewing);
    $("masthead-chapter").innerHTML = mastheadChapterHtml(ch.n, total, true);
    $("chapter-icon").src = iconSrc(ch.n);
    $("chapter-title").textContent = ch.title;
    $("story").innerHTML = richText(ch.story);
    $("objective").innerHTML = objectiveHtml(ch.objective, "Your answer:", state.answers[ch.n], ch);
    showTelegram(ch.telegram);
    return;
  }
  const ch = currentChapter(state, data.chapters);
  $("masthead-chapter").innerHTML = mastheadChapterHtml(ch.n, total, false);
  $("chapter-icon").src = iconSrc(ch.n);
  $("chapter-title").textContent = ch.title;
  $("story").innerHTML = richText(ch.story);
  $("objective").innerHTML = objectiveHtml(ch.objective, "Answer:", ch.answer_form, ch);
  const last = data.chapters.find(c => c.n === state.solved[state.solved.length - 1]);   // the bridge to this chapter stays in view
  if (last) showTelegram(last.telegram);
  if (awaitingCode(state)) {
    $("story").innerHTML = '<img class="portrait" src="portraits/blakeney.jpg" alt="">' + richText(data.endings.part1);   // the unmasking: his face, only now
    $("objective").textContent = "Part I is closed. Lupin mentioned a Chapter IX. Somewhere in the archives a telegram is addressed to a curious clerk; its code, typed in the answer box...";
    $("btn-print").hidden = false;
  }
  // The ending stays in the story column after the Part II extra edition (showExtra2, which also has the film) is closed.
  if (state.solved.includes(12)) {
    $("story").innerHTML = part2Ending();
    $("objective").textContent = "Case closed. Twice.";
  }
  if (competeDone(state)) {
    $("story").textContent = "Case closed. Lupin is in irons, Ganimard is taking the credit, and the clock has stopped. " +
      "Your side of the clock read " + fmtTime(state.finishedAt - state.startedAt) + "; the leaderboard keeps the official time, " +
      "plus " + duration(PENALTY.wrong) + " per wrong answer.";
    $("objective").innerHTML = boardUrl
      ? 'Your result is on the class leaderboard: <a href="leaderboard.html?data=' + encodeURIComponent(boardUrl) +
        "&season=" + encodeURIComponent(state.season) + '" target="_blank">open it</a>.'
      : "No leaderboard is connected to this season, so the result stays on this screen.";
    $("btn-print").hidden = false;
  }
  let box = document.getElementById("rank-box");   // the compete finish only: in learn mode the extra edition gives the rank
  if (competeDone(state)) {
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

// FROM a, b with no ON/WHERE/USING anywhere: the one query that can hang the page (sql.js runs on the main thread).
// ponytail: a text guard, not a timeout; move sql.js to a Worker with terminate() if students still find a way.
export function cartesian(sql) {
  const body = sql.replace(/--[^\n]*|\/\*[\s\S]*?\*\/|'(?:[^']|'')*'/g, " ");
  return /\bfrom\s+[a-z_][a-z0-9_]*(?:\s+(?:as\s+)?[a-z_][a-z0-9_]*)?\s*,\s*[a-z_]/i.test(body) && !/\b(?:where|on|using)\b/i.test(body);
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
  if (cartesian(sql)) { error = "Two ledgers side by side with nothing to match them: say what joins them (ON or WHERE)."; state.errorStreak++; }
  else try { const all = db.exec(sql); res = all[all.length - 1] || null; state.errorStreak = 0; }
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
  [...$("history").children].forEach((li, i) => btnLike(li, () => { $("sql").value = state.history[i]; syncSql(); }));
}

export const TAUNTS = [
  "MY DEAR CLERK STOP THREE GUESSES STOP GANIMARD GUESSED ONCE IN 1898 AND STILL BLUSHES STOP READ THE OBJECTIVE AGAIN STOP A L",
  "MY DEAR CLERK STOP THE DATA DOES NOT CHANGE ITS MIND STOP YOU MIGHT STOP A L",
  "MY DEAR CLERK STOP A QUERY IS CHEAPER THAN A GUESS STOP RUN ONE STOP A L",
];

export function judgeWrong(norm, data, state, met) {
  if (Object.hasOwn(data.wrong_suspects, norm) && (!met || met.includes(norm))) return data.wrong_suspects[norm];
  return data.wrong_default[state.wrongStreak % data.wrong_default.length];
}

let typer = null, typing = "";
function typeTelegram(text, id = "telegram") {
  clearInterval(typer);
  const el = $(id); el.textContent = ""; let i = 0; typing = text;
  const stop = () => { clearInterval(typer); el.textContent = text; typing = ""; };
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return stop();
  typer = setInterval(() => { el.textContent = text.slice(0, ++i); if (i >= text.length) stop(); }, 25);
  btnLike(el, stop);
}
// The last telegram is the only pointer to the current objective: shown at once (no typing) when a chapter is
// reviewed or the page reloads, unless it is the one being typed right now.
function showTelegram(text) {
  if (typing === text || $("telegram").textContent === text) return;
  clearInterval(typer); typing = "";
  $("telegram").textContent = text || "";
}
// Click or keyboard (Enter, Space) on an element that is not a <button>.
function btnLike(el, fn) {
  el.tabIndex = 0; el.setAttribute("role", "button");
  el.onclick = fn;
  el.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(e); } };
}
function toast(text, title) {
  const t = document.createElement("div"); t.className = "toast"; t.innerHTML = "<b>" + esc(title) + "</b><br>" + esc(text);
  $("toasts").appendChild(t); setTimeout(() => t.remove(), 5000);
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
  ["Haiku", "A chapter solved in three lines or fewer.", c => c.event === "solve" && c.lines <= 3 && (c.state.queries[c.chapter] || 0) > 0],
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
  ["Speed Reader", "A chapter solved within two minutes of opening it.", c => c.event === "solve" && c.elapsed < 120000 && (c.state.queries[c.chapter] || 0) > 0],
  ["Filed Under the 17th", "Filed the case under the wrong night. Duroc never sleeps, but he does count.",
    c => c.event === "answer" && c.chapter === 1 && c.decoy != null && c.norm === String(c.decoy)],
  ["Lamplighter", "Switched between the day and night editions. Paris has lit its lamps by hand since 1667.", c => c.event === "theme"],
  ["Gare du Nord", "Part I closed: Lupin has a name, if not a cell.", c => c.event === "part1"],
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
  const inline = t => esc(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\*(.+?)\*/g, "<i>$1</i>");
  const blocks = String(s).split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);
  const html = blocks.map(block => {
    const lines = block.split("\n").map(l => l.trim());
    if (!lines.every(l => l.startsWith("|"))) return blocks.length > 1 ? "<p>" + inline(lines.join(" ")) + "</p>" : inline(lines.join(" "));
    // a table: lines of | cells |, the first one the header
    const [head, ...rows] = lines.map(l => l.replace(/^\||\|$/g, "").split("|").map(c => inline(c.trim())));
    return "<table><thead><tr>" + head.map(c => "<th>" + c + "</th>").join("") + "</tr></thead><tbody>" +
      rows.map(r => "<tr>" + r.map(c => "<td>" + c + "</td>").join("") + "</tr>").join("") + "</tbody></table>";
  });
  return html.join("");
}

export function detectBadges(ctx, have) {
  return BADGES.filter(([name, , pred]) => !have.includes(name) && pred(ctx)).map(([name, text]) => ({ name, text }));
}

function award(list) {
  list.forEach((b, i) => {
    state.badges.push(b.name); track("badge", { name: b.name });
    const t = document.createElement("div"); t.className = "toast"; t.innerHTML = "<b>Badge: " + esc(b.name) + "</b><br>" + esc(b.text);
    $("toasts").appendChild(t); setTimeout(() => t.remove(), 5000 + i * 400);   // stagger so a badge burst doesn't vanish as one block
  });
  if (list.length) save(state);
}

export const RANKS = [[25, "Ganimard himself"], [40, "Chief Inspector"], [60, "Inspector"], [Infinity, "Constable"]];  // tune after the first class
export function rank(queries) { return RANKS.find(([q]) => queries <= q)[1]; }

// Seconds per wrong answer on the board; a compete game takes its season record's penalty.
export const PENALTY = { wrong: 10 };
export function duration(s) { return s && s % 60 === 0 ? s / 60 + (s === 60 ? " minute" : " minutes") : s + " seconds"; }
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
    esc(label(n)) + "</span>" + (state.answers[n] ? "<br>" + esc(state.answers[n]) : "") + "</div>").join("");   // older saves have no answers: no "NULL" card
  $("board").querySelectorAll(".card").forEach(el => btnLike(el, () => reviewChapter(Number(el.dataset.n))));
}

// A closing film (site/video/<name>.*) waits on its poster: browsers only allow sound after a click, so the student
// starts it with Play; then the browser's own controls (play/pause, timeline, sound, full screen) take over.
function filmHtml(name) {
  return '<div class="film-wrap"><video class="film" playsinline preload="metadata" poster="video/' + name + '.jpg">' +
    '<source src="video/' + name + '.webm" type="video/webm"><source src="video/' + name + '.mp4" type="video/mp4"></video>' +
    '<button class="film-play">&#9654; Play</button></div>';
}
function wireFilm(root) {
  const film = root.querySelector(".film"), btn = root.querySelector(".film-play");
  btn.onclick = () => { btn.hidden = true; film.controls = true; film.currentTime = 0; film.play(); };
  return film;
}

// Chapter VIII solved (learn mode): a one-off extra edition, the capture, the badge and rank; Continue then opens
// the Part II pop-up with the new objective.
// Shown once (state.extraSeen), on the solve or, if the page was closed first, on the next visit.
function showExtra() {
  const el = $("extra"), p1 = partStats(state, 1, 8);
  const badge = BADGES.find(([name]) => name === "Gare du Nord");
  el.innerHTML = '<div class="extra-card">' +
    '<div class="mast-title">LE PETIT JOURNAL</div><div class="mast-sub">EXTRA EDITION &mdash; PARIS &mdash; 20 MAY 1912</div>' +
    filmHtml("part1") +
    "<h1>LUPIN TAKEN AT THE GARE DU NORD</h1>" +
    '<img class="portrait" src="portraits/blakeney.jpg" alt="">' + '<div class="story">' + richText(data.endings.part1) + "</div>" +
    '<div class="extra-badge"><div class="label">BADGE</div><b>' + esc(badge[0]) + "</b> " + esc(badge[1]) +
    '<div class="muted">Part I in ' + p1.queries + " queries. Rank: " + esc(rank(p1.queries)) + "</div></div>" +
    '<button id="btn-extra">Continue</button></div>';
  el.hidden = false;
  const film = wireFilm(el);
  // Continue closes the edition and announces Part II in a modal (#part2, a native <dialog>: Escape closes it too).
  $("btn-extra").onclick = () => { film.pause(); el.hidden = true; state.extraSeen = true; save(state); $("part2").showModal(); };
}

// The Blue Star is never recovered: Lupin's telegram from London comes with a photograph of it, re-set as a ring.
const part2Ending = () => '<img class="portrait" src="portraits/comtesse.jpg" alt="">' + richText(data.endings.part2) +
  '<figure class="ending-photo"><img src="blue-star.jpg" alt="The Blue Star, re-set as a ring, on dark velvet by a window over London">' +
  "<figcaption>Enclosed with the telegram, a photograph. No message. The jeweller has been busy.</figcaption></figure>";

// Chapter XII solved (learn mode): the Part II extra edition, Part I's in the night palette: the film, the arrest,
// the Ganimard badge, then an invitation to replay while badges are missing (the New investigation button's reset).
// Shown once (state.extraSeen2), on the solve or, if the page was closed first, on the next visit.
function showExtra2() {
  const el = $("extra"), p2 = partStats(state, 9, 12);
  const badge = BADGES.find(([name]) => name === "Ganimard");
  const got = BADGES.filter(([name]) => state.badges.includes(name)).length, left = BADGES.length - got;
  el.innerHTML = '<div class="extra-card">' +
    '<div class="mast-title">LE PETIT JOURNAL</div><div class="mast-sub">EXTRA EDITION &mdash; PARIS &mdash; JUNE 1912</div>' +
    filmHtml("part2") +
    "<h1>THE COMTESSE ARRESTED AT THE RITZ</h1>" +
    '<div class="story">' + part2Ending() + "</div>" +
    '<div class="extra-badge"><div class="label">BADGE</div><b>' + esc(badge[0]) + "</b> " + esc(badge[1]) +
    '<div class="muted">Part II in ' + p2.queries + " queries.</div></div>" +
    '<div class="extra-badge"><div class="label">BADGES</div>' + (left
      ? "You found " + got + " of " + BADGES.length + " badges. " + left + (left > 1 ? " are" : " is") +
        " still hidden in the archives: start a new investigation to hunt for the rest."
      : "You found all " + BADGES.length + " badges. Ganimard has nothing left to teach you.") + "</div>" +
    (left ? '<button id="btn-replay">New investigation</button> ' : "") + '<button id="btn-extra2">Close</button></div>';
  el.hidden = false;
  const film = wireFilm(el);
  const close = () => { film.pause(); el.hidden = true; state.extraSeen2 = true; save(state); };
  $("btn-extra2").onclick = close;
  if (left) $("btn-replay").onclick = () => { close(); $("btn-reset").click(); };   // the same confirm, then the reset
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
function suspectCard(s, notes = []) {
  const file = PORTRAIT_FILE[s.name];
  const img = file ? '<img src="portraits/' + file + '.jpg" alt="">' : "";
  return '<div class="suspect">' + img + '<b>' + esc(s.name) + '</b><span class="muted">' + esc(s.nationality) + '</span><p>' + esc(s.bio) + '</p>' +
    notes.map(n => '<p class="note">' + esc(n) + '</p>').join("") + '</div>';
}
function renderSuspects() {
  const el = $("suspects"), met = metSuspects(data.cast, state, data.chapters);
  el.innerHTML = '<button class="quiet suspects-close">Close</button>' + (met.length ? met.map(s => suspectCard(s, s.notes)).join("")
    : '<p class="muted">Nobody yet. Ganimard suspects everyone, which is the same thing.</p>');
  el.querySelector(".suspects-close").onclick = () => el.hidden = true;
  state.suspectsSeen = met.reduce((k, s) => k + 1 + s.notes.length, 0); save(state);
  markSuspects();
}
// The Suspects button carries a dot while the gallery holds a face or a note the student has not opened yet.
function markSuspects() {
  const met = metSuspects(data.cast, state, data.chapters);
  $("btn-suspects").classList.toggle("new", met.reduce((k, s) => k + 1 + s.notes.length, 0) > (state.suspectsSeen || 0));
  introduceSuspects(met.map(s => s.name));
}
// The first time a suspect is met, a pop-up (#newsuspects) shows their portrait and bio; suspects met together share
// one. It waits while a solved chapter is still on screen (the next chapter's names stay unread) and while the extra
// edition or the Part II pop-up is open. state.introduced: names already shown (a game saved before it starts full).
function introduceSuspects(met) {
  if (!state.introduced) { state.introduced = met; save(state); return; }
  const fresh = data.cast.filter(s => met.includes(s.name) && !state.introduced.includes(s.name));
  const dlg = $("newsuspects");
  if (!fresh.length || reviewing != null || dlg.open || $("part2").open || !$("extra").hidden) return;
  state.introduced.push(...fresh.map(s => s.name)); save(state);
  dlg.querySelector(".label").textContent = fresh.length > 1 ? "NEW SUSPECTS" : "A NEW SUSPECT";
  dlg.querySelector(".cards").innerHTML = fresh.map(s => suspectCard(s)).join("");
  dlg.showModal();
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
    if (data.part2_code_sha256.includes(hash)) { state.part2 = true; applyMood(); $("reply").textContent = "The code is accepted. Ganimard has gone home. You have not."; afterSolve(null, "code"); }
    else { $("reply").textContent = "That is not the code. Four words, the first of them STOP, in a telegram nobody was meant to read."; }
    $("answer").value = ""; save(state); return;
  }
  if (ch.answer_sha256.includes(hash)) {   // compete too: the season file carries its hashes

    state.solved.push(ch.n); state.answers[ch.n] = raw.trim(); state.wrongStreak = 0; $("taunt").textContent = "";
    track("chapter_solve", { chapter: ch.n, mode: state.mode, seconds: Math.round((Date.now() - (state.opened[ch.n] || Date.now())) / 1000),
                             queries: state.queries[ch.n] || 0, wrong: state.wrong[ch.n] || 0 });
    $("reply").textContent = "Correct. Ganimard grunts, which is praise.";
    typeTelegram(ch.telegram);
    afterSolve(ch, "solve");
  } else {
    state.wrong[ch.n] = (state.wrong[ch.n] || 0) + 1; state.wrongStreak++;
    $("reply").textContent = judgeWrong(norm, data, state, metSuspects(data.cast, state, data.chapters).map(s => normalise(s.name)));
    if (state.wrongStreak % 3 === 0) typeTelegram(TAUNTS[(state.wrongStreak / 3 - 1) % TAUNTS.length], "taunt");
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
  if (!erdLoaded) { $("erd").innerHTML = await (await fetch("schema.svg" + VERSION)).text(); erdLoaded = true; }
  const vis = visibleTables(data.chapters, state);
  const cur = awaitingCode(state) || competeDone(state) || state.solved.includes(12) ? [] : currentChapter(state, data.chapters).tables;   // R2: marked until solved
  for (const g of $("erd").querySelectorAll("g.table")) {
    const t = g.dataset.table;
    g.classList.toggle("hidden", !vis.has(t));
    g.classList.toggle("reveal", newTables.includes(t));
    g.classList.toggle("current", cur.includes(t));
  }
  for (const p of $("erd").querySelectorAll("g.fk")) {
    const from = p.dataset.from.split(".")[0], to = p.dataset.to;
    p.classList.toggle("hidden", !(vis.has(from) && vis.has(to)));
  }
  fitErd();
  renderLegend();
  showCurrentTables();
  if (newTables.length) {
    $("erd").querySelectorAll(".stamp").forEach(s => s.remove());   // two reveals within 2.5 s must not overlap
    const s = document.createElement("div"); s.className = "stamp"; s.textContent = "NEW EVIDENCE";
    $("erd").appendChild(s); setTimeout(() => s.remove(), 2500);
  }
}

// The legend under the schema names only what the visible schema shows. visible = { fk: any visible table has a
// foreign key, cards: [[end, end], ...] the "1"/"N" labels of each visible line }.
export function legendEntries(visible) {
  const show = new Set(["pk"]);
  if (visible.fk) show.add("fk");
  if (visible.cards.some(c => c.includes("N"))) show.add("many");
  if (visible.cards.some(c => c[0] === "1" && c[1] === "1")) show.add("one");
  return show;
}

function renderLegend() {
  const svg = $("erd").querySelector("svg");
  if (!svg) return;
  const show = legendEntries({
    fk: !!svg.querySelector("g.table:not(.hidden) .key.fk"),
    cards: [...svg.querySelectorAll("g.fk:not(.hidden)")].map(g => [...g.querySelectorAll("text")].map(t => t.textContent.trim())),
  });
  for (const s of document.querySelectorAll("[data-legend]")) s.hidden = !show.has(s.dataset.legend);
}

// The current chapter's tables may sit below the schema box's fold (chapter 7's telegram): scroll the box,
// not the page (scrollIntoView would move the page too). When they all fit, leave it; otherwise bring the
// topmost one (smallest translate y, not DOM order: chapter 1's interview comes first but sits under police_report).
function showCurrentTables() {
  const box = $("erd"), cur = [...box.querySelectorAll("g.table.current:not(.hidden)")];
  if (!cur.length) return;
  const b = box.getBoundingClientRect();
  if (cur.every(g => { const r = g.getBoundingClientRect(); return r.top >= b.top && r.bottom <= b.bottom; })) return;
  const y = g => Number((g.getAttribute("transform").match(/-?[\d.]+/g) || [0, 0])[1]);
  const top = cur.reduce((a, g) => y(g) < y(a) ? g : a);
  box.scrollTop += top.getBoundingClientRect().top - b.top - 8;
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
  for (const g of svg.querySelectorAll("g.fk:not(.hidden)")) {   // lines may run down the outer side of a column
    const b = g.getBBox();
    if (b.width || b.height) { x0 = Math.min(x0, b.x); x1 = Math.max(x1, b.x + b.width); }
  }
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
    if (ch.n === 8 || ch.n === 12) track("game_finish", { part: ch.n === 8 ? 1 : 2, mode: state.mode });
    if (ch.n === 8) {
      award(detectBadges(ctx({ event: "part1", chapter: ch.n }), state.badges));
      const p1 = partStats(state, 1, 8);
      $("reply").textContent += " Rank: " + rank(p1.queries);
      if (state.mode !== "compete") showExtra();
    }
    if (state.mode === "compete") {
      if (ch.n === 8) { state.finishedAt = Date.now(); queueEvent("finish", 8); renderChapter(); tickClock(); }
      else queueEvent("progress", ch.n);
    }
    if (ch.n === 12) { award(detectBadges(ctx({ event: "part2", chapter: ch.n }), state.badges)); showExtra2(); }
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
  el.textContent = "Season: " + state.seasonName + " \u2014 " + state.team.toUpperCase() + " \u2014 " +
    fmtTime((state.finishedAt || Date.now()) - state.startedAt) + (boardUrl ? "" : " \u2014 NOT RECORDED") +
    (state.over ? " \u2014 THE SESSION IS OVER" : "");
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
  // A refusal drops the row; a closed session says so beside the clock and the game stays playable.
  if (!boardUrl || flushing || !state.outbox.length) return;
  flushing = true;
  try {
    while (state.outbox.length) {
      const j = await postBoard({ ...state.outbox[0], token: state.token || "" });
      if (!j.ok) {
        console.warn("leaderboard refused a row:", j.error, state.outbox[0]);
        if (j.error === "session closed") { state.over = true; tickClock(); }
      }
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

// text/plain so the browser sends no CORS preflight (Apps Script cannot answer one). Throws on network or HTTP failure;
// a JSON {ok:false, error} is the backend's own refusal and comes back as is.
async function postBoard(body) {
  const r = await fetch(boardUrl, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.json();
}
// The season record (apps_script.gs ?meta=<id>): null when unknown or unreachable.
async function fetchMeta(id) {
  if (!boardUrl || !id) return null;
  try {
    const u = new URL(boardUrl); u.searchParams.set("meta", id);
    const m = await (await fetch(u, { signal: AbortSignal.timeout(15000) })).json();
    return m && m.id === id ? m : null;
  } catch { return null; }
}
// Copies what the game uses from a season record; the clock runs from the teacher's Open.
function applyMeta(m) {
  if (!m) return;
  state.seasonName = String(m.name || ""); state.db = Number(m.db) || state.db;
  if (Number.isInteger(m.penalty)) state.penalty = m.penalty;
  if (m.openedAt) state.startedAt = Number(m.openedAt);
  if (m.state === "closed") state.over = true;
  PENALTY.wrong = state.penalty;
  save(state);
}
async function loadSeason() {
  data = await (await fetch("season-" + state.db + ".json" + VERSION)).json();
  await loadDb("season-" + state.db);
  PENALTY.wrong = state.penalty;
  startClock();
  flushOutbox();
}
async function playCompete() {
  await loadSeason();
  renderBoard(); renderHistory(); enterGame();
  $("notes").value = state.notes;
}
// Joined, the season not open yet: the landing card waits, asking the backend every 5 s.
let waiter = null;
function waitForOpen() {
  $("landing").hidden = false;
  document.querySelector(".landing-buttons").hidden = true;
  $("compete-form").hidden = true;
  $("compete-wait").hidden = false;
  $("wait-name").textContent = state.seasonName;
  $("wait-team").textContent = state.team;
  $("status").textContent = "";
  clearInterval(waiter);
  waiter = setInterval(async () => {
    const m = await fetchMeta(state.season);
    if (!m || m.state === "created") return;
    clearInterval(waiter);
    applyMeta(m);
    $("compete-wait").hidden = true;
    playCompete();
  }, 5000);
}
const JOIN_REFUSED = { "pseudo taken": "Someone already plays this season under that pseudo. Pick another.",
  "session closed": "This session is closed.", "no such season": "This season does not exist." };

async function joinCompete() {
  const team = $("team").value.trim();
  if (!team) { $("team").focus(); return; }
  $("btn-start").disabled = true;
  $("status").textContent = "Joining...";
  let j;
  try { j = await postBoard({ event: "join", team, season: seasonId, clientAt: Date.now() }); }
  catch { j = { error: "unreachable" }; }
  if (!j.ok) {
    $("status").textContent = JOIN_REFUSED[j.error] || (j.error === "unreachable"
      ? "The leaderboard is unreachable. Try again in a moment." : "The leaderboard refused: " + (j.error || "unknown") + ".");
    $("btn-start").disabled = false; $("team").focus(); return;
  }
  key = storageKey("compete");
  state = { ...freshState(), mode: "compete", season: seasonId, team, token: j.token, board: boardUrl };
  applyMeta(j.meta);
  if (j.meta.state === "created") waitForOpen(); else playCompete();
}

// The teacher's link (?season=<id>&board=<url>) names the season; boot has read its record (seasonMeta).
function offerCompete() {
  const b = $("btn-compete");
  if (!seasonId) return;   // no season link: Compete stays disabled
  if (!seasonMeta) {
    $("status").textContent = boardUrl ? "This season does not exist." : "This season link has no leaderboard: ask your teacher for the full link.";
    return;
  }
  if (seasonMeta.state === "closed") { $("status").textContent = "This session is closed."; return; }
  b.disabled = false; b.title = "Part I only, against the clock.";
  b.onclick = () => {
    $("compete-note").innerHTML = "Season: " + esc(seasonMeta.name) + ". Part I, chapters I to VIII, against the clock. " +
      duration(seasonMeta.penalty) + " per wrong answer; queries are free. The clock starts when your teacher opens the session " +
      'and stops when Lupin is named. Your pseudo and progress go to the class leaderboard (<a href="privacy.html" target="_blank">what is sent</a>).';
    $("compete-form").hidden = false; $("team").focus();
  };
  $("btn-start").onclick = joinCompete;
  $("team").addEventListener("keydown", e => { if (e.key === "Enter") joinCompete(); });
}

// --- usage statistics: Google Analytics 4, opt-in only (spec section 8) ---------------------------
// The course owner's GA4 measurement ID ("G-...", public by nature, may be committed). Empty: no banner,
// no Statistics link, no request to Google. Nothing loads before the reader says Yes (CNIL opt-in).
export const GA_ID = "G-QG0K0D1NQZ";
const CONSENT_KEY = "ritz.consent";   // "yes" | "no"; absent = not answered, the banner shows
function consent() { try { return localStorage.getItem(CONSENT_KEY); } catch { return null; } }
// ?ga=G-... tries the banner before an ID is committed, on localhost only (a link elsewhere cannot redirect the stats).
function gaId() {
  return GA_ID || (["localhost", "127.0.0.1"].includes(location.hostname) && new URLSearchParams(location.search).get("ga")) || "";
}
// Every analytics call goes through here. Never pass the pseudo, answers, query text or the board URL.
export function track(name, params) {
  if (noPersist || typeof window === "undefined" || typeof window.gtag !== "function" || consent() !== "yes") return false;
  window.gtag("event", name, params);
  return true;
}
function gaLoad(id) {
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  window.gtag("consent", "default", { ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied", analytics_storage: "denied" });
  window.gtag("consent", "update", { analytics_storage: "granted" });
  window.gtag("js", new Date());
  window.gtag("config", id, { allow_google_signals: false, allow_ad_personalization_signals: false });
  const s = document.createElement("script");
  s.async = true; s.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(id);
  document.head.appendChild(s);
}
// GA's cookie may sit on any parent domain (auto cookie_domain): expire _ga* on each of them.
function dropGaCookies() {
  const parts = location.hostname.split(".");
  for (const c of document.cookie.split(";")) {
    const name = c.split("=")[0].trim();
    if (!name.startsWith("_ga")) continue;
    for (let i = 0; i < parts.length; i++)
      document.cookie = name + "=; Max-Age=0; path=/; domain=" + parts.slice(i).join(".");
    document.cookie = name + "=; Max-Age=0; path=/";
  }
}
function setConsent(v) {
  const id = gaId();
  try { localStorage.setItem(CONSENT_KEY, v); } catch {}
  $("consent").hidden = true;
  window["ga-disable-" + id] = v !== "yes";   // honoured by gtag.js: no more hits, cookieless pings included
  if (v === "yes") { if (window.gtag) window.gtag("consent", "update", { analytics_storage: "granted" }); else gaLoad(id); }
  else { if (window.gtag) window.gtag("consent", "update", { analytics_storage: "denied" }); dropGaCookies(); }
}
function initConsent() {
  const id = gaId();
  if (!id) return;
  $("stats-link").hidden = false;
  $("btn-stats").onclick = e => { e.preventDefault(); $("consent").hidden = false; $("consent-yes").focus(); };
  $("consent-yes").onclick = () => setConsent("yes");
  $("consent-no").onclick = () => setConsent("no");
  const c = consent();
  if (c === "yes") gaLoad(id); else if (c !== "no") $("consent").hidden = false;
}

// The ad box under the schema (a native <details>: its summary is the toggle). Open by default; a student who
// closes it keeps it closed (per browser, ADS_KEY). Hidden until ads go live (ADS_ON, after AdSense approval
// and Google's consent message); ?ads=1 previews it on localhost.
export const ADS_ON = false;
const ADS_KEY = "ritz.ads";
function initAds() {
  const box = $("ad-box"), local = ["localhost", "127.0.0.1"].includes(location.hostname);
  if (!ADS_ON && !(local && new URLSearchParams(location.search).get("ads"))) return;
  try { if (localStorage.getItem(ADS_KEY) === "closed") box.open = false; } catch {}
  box.hidden = false;
  box.addEventListener("toggle", () => { try { localStorage.setItem(ADS_KEY, box.open ? "open" : "closed"); } catch {} });
}

// Part II mood: dark palette + a later masthead date (see style.css's [data-mood="night"]). The palette is
// the reader's choice once they press the Day/Night edition button (per browser, THEME_KEY); until then
// it follows the story. The masthead date always follows the story.
const THEME_KEY = "ritz.theme";
function chosenTheme() { try { return localStorage.getItem(THEME_KEY); } catch { return null; } }
// The Day/Night button: a sun offers the day edition, a crescent moon the night edition (icon-only under 900px).
const ICON_ATTRS = 'width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
export function themeButtonHtml(mood) {
  const svg = mood === "night"
    ? `<svg class="icon sun" ${ICON_ATTRS}><circle cx="8" cy="8" r="3"/><path d="M8 1.5V3M8 13V14.5M1.5 8H3M13 8H14.5M3.4 3.4L4.5 4.5M11.5 11.5L12.6 12.6M3.4 12.6L4.5 11.5M11.5 4.5L12.6 3.4"/></svg>`
    : `<svg class="icon moon" ${ICON_ATTRS}><path d="M14 8.53A6 6 0 1 1 7.47 2A4.67 4.67 0 0 0 14 8.53Z"/></svg>`;
  return `${svg}<span class="btn-text">${mood === "night" ? "Day edition" : "Night edition"}</span>`;
}
// Masthead "CHAPTER I OF VIII": the current chapter's numeral in bold, the rest plain.
export function mastheadChapterHtml(n, total, reviewing) {
  return (reviewing ? "REVIEWING " : "") + "CHAPTER <b>" + ROMAN[n] + "</b> OF " + ROMAN[total];
}
// The schema's Enlarge/Close button is icon-only: two arrows out to the corners, or an X once enlarged.
export function erdButtonHtml(large) {
  return large
    ? { label: "Close the schema", html: `<svg class="icon close" ${ICON_ATTRS}><path d="M3.5 3.5L12.5 12.5M12.5 3.5L3.5 12.5"/></svg>` }
    : { label: "Enlarge the schema", html: `<svg class="icon enlarge" ${ICON_ATTRS}><path d="M9.5 2.5H13.5V6.5M13.5 2.5L9 7M6.5 13.5H2.5V9.5M2.5 13.5L7 9"/></svg>` };
}
function setErdButton(large) {
  const btn = $("btn-erd"), { html, label } = erdButtonHtml(large);
  btn.innerHTML = html; btn.title = label; btn.setAttribute("aria-label", label);
}
function applyMood() {
  const mood = chosenTheme() || (state && state.part2 ? "night" : "day");
  document.documentElement.dataset.mood = mood;
  const btn = $("btn-theme"), label = mood === "night" ? "Day edition" : "Night edition";
  btn.innerHTML = themeButtonHtml(mood);
  btn.title = label; btn.setAttribute("aria-label", label);   // named when the phone shows the icon alone
  if (state) $("masthead-date").textContent = state.part2 ? "21 MAY 1912" : "18 MAY 1912";
}
function toggleTheme() {
  try { localStorage.setItem(THEME_KEY, document.documentElement.dataset.mood === "night" ? "day" : "night"); } catch {}
  applyMood();
  if (state && data) award(detectBadges(ctx({ event: "theme" }), state.badges));   // before boot has loaded them: no badge
}

// Gates both ?chapter=N and the ?admin panel: nobody skips ahead just by knowing the query params.
// Passphrase is asked for once per page load (adminUnlocked persists after); ask the course owner
// for it, it is not committed in plaintext anywhere (its hash: ADMIN_PASS_SHA256 in shared.js).
let adminUnlocked = false;
function askPassphrase() {   // #passgate: a native <dialog> with a password field, so the letters are masked (Escape cancels)
  return new Promise(resolve => {
    const d = $("passgate"), input = d.querySelector("input");
    input.value = "";
    d.onclose = () => resolve(d.returnValue === "ok" ? input.value : "");
    d.showModal();
  });
}
async function unlockAdmin() {
  if (adminUnlocked) return true;
  const pass = await askPassphrase();
  if (!pass) return false;
  adminUnlocked = (await sha256(pass.trim().toLowerCase())) === ADMIN_PASS_SHA256;   // trimmed, lowercased: exactly what apps_script.gs compares; never the answer normaliser (its rules change)
  if (!adminUnlocked) toast("Wrong passphrase.", "Admin");
  return adminUnlocked;
}

async function jumpToChapter(n) {
  if (!(await unlockAdmin())) return false;
  noPersist = true;
  state = freshState();
  for (let i = 1; i < n; i++) state.solved.push(i);   // no answer recorded: the board card shows its label alone
  if (n > 8) state.part2 = true;
  enterGame();
  return true;
}

// The in-game panel: chapter jumps and a link to the teacher's page (admin.html: seasons, board, export).
async function renderAdminPanel() {
  if (!new URLSearchParams(location.search).has("admin") || !(await unlockAdmin())) return;
  document.getElementById("admin-panel")?.remove();
  const el = document.createElement("div"); el.id = "admin-panel"; el.className = "admin-panel";
  el.innerHTML = '<span class="label">ADMIN</span>' +
    data.chapters.map(c => '<button data-n="' + c.n + '">' + c.n + '</button>').join("") +
    '<input id="admin-board" class="admin-board" placeholder="Apps Script /exec URL"> <a id="admin-link" target="_blank">Seasons and board</a>';
  el.querySelectorAll("button[data-n]").forEach(b => b.onclick = () => jumpToChapter(Number(b.dataset.n)));
  const input = el.querySelector("#admin-board"), link = el.querySelector("#admin-link");
  const sync = () => { const b = input.value.trim(); link.href = "admin.html" + (b ? "?board=" + encodeURIComponent(b) : ""); };
  input.value = boardUrl; sync();
  input.oninput = sync;
  document.body.appendChild(el);
}

function enterGame() {
  $("landing").hidden = true; applyMood(); renderChapter(); renderErd(); renderAdminPanel();
  if (awaitingCode(state) && !state.extraSeen) showExtra();   // solved chapter VIII, closed the page before the extra edition
  if (state.mode !== "compete" && state.solved.includes(12) && !state.extraSeen2) showExtra2();   // the same for chapter XII
}

async function boot() {
  $("btn-theme").onclick = toggleTheme;
  initConsent();
  initAds();
  applyMood();   // the reader's palette on the landing page too, before any state is loaded
  const params = new URLSearchParams(location.search);
  seasonId = params.get("season") || "";
  boardUrl = params.get("board") || "";   // the deployment URL travels in links, never in this public repo
  let badBoard = false;
  try { if (boardUrl) new URL(boardUrl); } catch { boardUrl = ""; badBoard = true; }
  const debugChapter = Number(params.get("chapter"));
  const linked = !!seasonId;
  // A player who reloads the page mid-season lands back in the game (or the waiting card), clock still running:
  // with the season link, always (a finished season shows its finish screen); without it, only while unfinished.
  const saved = loadFrom(storageKey("compete"));
  const savedLive = saved.mode === "compete" && saved.team && saved.token && saved.db > 0;
  if (!seasonId && savedLive && !part1Done(saved) && !debugChapter) seasonId = saved.season;
  const resuming = !!(savedLive && saved.season === seasonId && !debugChapter);
  if (resuming && !boardUrl) boardUrl = saved.board || "";
  if (seasonId) seasonMeta = await fetchMeta(seasonId);
  // debugChapter is gated by unlockAdmin() (same passphrase as the ?admin panel): only asked when
  // ?chapter=N is actually present, so a plain ?season= link never prompts for anything.
  let debugOk = false;
  if (resuming) {
    key = storageKey("compete");
    state = saved;
    applyMeta(seasonMeta);   // re-read once: the teacher may have opened or closed the session meanwhile
  }
  const playing = resuming && state.startedAt > 0;
  if (playing) await loadSeason();
  else {
    data = await (await fetch("chapters.json" + VERSION)).json();
    if (!resuming) {
      debugOk = debugChapter >= 1 && debugChapter <= 12 && await unlockAdmin();
      if (debugOk) {
        noPersist = true;
        state = freshState();
        for (let n = 1; n < debugChapter; n++) state.solved.push(n);   // no answer recorded: the board card shows its label alone
        if (debugChapter > 8) state.part2 = true;
      } else {
        state = loadFrom(key);
      }
    }
    await loadDb("mystery");
  }
  $("status").textContent = badBoard ? "The archives are open. The leaderboard link in this address is broken, so nothing is recorded." : "The archives are open.";
  $("btn-investigate").disabled = false;
  $("btn-investigate").onclick = enterGame;
  // A season link always shows the landing page (the student picks Compete there), unless a season game is under way.
  if (playing || (!linked && state.solved.length) || debugOk) enterGame();
  else if (resuming) waitForOpen();
  else renderAdminPanel();
  if (!resuming) offerCompete();
  $("btn-back").onclick = backToInvestigation;
  btnLike($("masthead-chapter"), e => {
    e.stopPropagation();
    const menu = $("chapter-menu");
    if (!menu.hidden) { menu.hidden = true; return; }
    menu.innerHTML = ['<div class="chapter-menu-item" data-n="0">Current</div>']
      .concat(state.solved.map(n => '<div class="chapter-menu-item" data-n="' + n + '">' + ROMAN[n] + "</div>")).join("");
    menu.querySelectorAll(".chapter-menu-item").forEach(el => btnLike(el, () => {
      const n = Number(el.dataset.n);
      if (n === 0) backToInvestigation(); else reviewChapter(n);
      menu.hidden = true;
    }));
    menu.hidden = false;
  });
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
    else if (e.key === "Tab" && !e.shiftKey) {   // Shift+Tab stays the browser's: it leaves the box
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
  setErdButton(false);
  $("btn-erd").onclick = () => {
    const large = $("erd").classList.toggle("large");
    setErdButton(large);
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
  if (params.has("selftest")) {
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
