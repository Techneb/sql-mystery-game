// site/app.js -- The Ritz Affair: the game page (state storage, chapter flow, case board, schema diagram, the compete
// client, boot). Its parts live in their own modules: state.js (the saved state), terminal.js and strict.js (the SQL
// terminal), badges.js, suspects.js, endings.js, onboarding.js, ui.js, stats.js and shared.js. boot() only runs on
// the game page.
import { normalise, sha256, ADMIN_PASS_SHA256, fmtTime, resultsLink, askDialog } from "./shared.js";
import { wireFeedback } from "./feedback.js";
import { track, trackOnce, useFeature, queryFail, initConsent, initAds, quietStats } from "./stats.js";
import { freshState, migrateSave, currentChapter, part1Done, awaitingCode, competeDone, storageKey, partStats, visibleTables, unseenBadges } from "./state.js";
import { highlightSql, wireEditor, runSql, runHtml, runInfo, columns, openSqlJs, terminalDb, readSchema, pushHistory, ROW_CAP, EMPTY_RUN } from "./terminal.js";
import { BADGES, eggText, seenFilms, detectBadges, rank } from "./badges.js";
import { suspectsOn, metSuspects, foundSuspects, suspectCard, cardPicture, portraitSrc, iconSrc, boardSuspects } from "./suspects.js";
import { showExtra, showExtra2, part2Ending, certificateHtml } from "./endings.js";
import { prologueOn, tourOn, showPrologue, CALLOUTS } from "./onboarding.js";
import { openHowto, howtoHtml } from "./howto.js";
import { esc, btnLike, erdButtonHtml, themeButtonHtml, setIconButton, showCallouts, richText } from "./ui.js";

const NAMES_ASK = "Names for the certificate (both of you):";   // #names' label, and prompt()'s where <dialog> cannot open
export function resetMessage(mode) {   // the New investigation question (#reset, or confirm() as the fallback)
  return mode === "compete" ? "Abandon the season? The clock, notes and badges are erased; rows already on the leaderboard stay."
                            : "Start a new investigation? Progress, notes and badges are erased.";
}
let key = storageKey("learn");
function loadFrom(k) { try { return migrateSave(JSON.parse(localStorage.getItem(k) || "{}")); } catch { return freshState(); } }
let noPersist = false;
let saveWarned = false;
export function save(state) {
  if (noPersist) return;
  try { localStorage.setItem(key, JSON.stringify(state)); }
  catch { if (!saveWarned && typeof document !== "undefined") { saveWarned = true; toast("Progress is not being saved in this browser.", "Not saved"); } }
}

// --- compete mode: season, team, clock, events -------------------------------------------------
export function competeStats(state) {
  const s = partStats(state, 1, 8);
  let wrong = 0;
  for (let n = 1; n <= 8; n++) wrong += state.wrong[n] || 0;
  return { ...s, wrong };
}
// One row of the Apps Script's log sheet. The server stamps the time itself; the client's clock travels
// too (clientAt, and elapsedMs = now or the finish - openedAt) so the board can flag a disagreeing clock.
export function eventPayload(state, event, chapter, now = Date.now()) {
  const s = competeStats(state);
  return { event, team: state.team, season: state.season, chapter: chapter || state.solved.length,
           wrong: s.wrong, queries: s.queries, clientAt: now,
           elapsedMs: (state.finishedAt || now) - state.startedAt };
}
// The masthead clock: frozen at the finish, or when the session closed (stoppedAt), else running.
export function clockMs(state, now = Date.now()) {
  return (state.finishedAt || state.stoppedAt || now) - state.startedAt;
}
// The teacher's Open on this browser's clock: the backend sends its own clock (meta.now) with the record, so a
// browser clock that runs fast or slow cancels out of every elapsed time.
export function clockStart(meta, now = Date.now()) {
  const opened = Number(meta.openedAt), server = Number(meta.now);
  return Number.isFinite(server) && server > 0 ? opened - server + now : opened;
}
// The in-game watch on the season record (every 30 s): only in a compete game with a board, not finished, not over.
export function watchOn(state, board) {
  return !!board && state.mode === "compete" && !state.finishedAt && !state.over;
}

// The deploy loads this script as app.js?v=<commit> (version_site.mjs, run by the deploy); the data files are fetched
// with the same query, so a page never mixes this deploy's code with a previous deploy's cached data.
// Empty locally and under node.
const VERSION = new URL(import.meta.url).search;

const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];

const $ = id => document.getElementById(id);

let db, data, state, tableSizes = {}, schema = {}, sqlModule = null;
let seasonId = "", seasonMeta = null, metaUnreachable = false, boardUrl = "";

async function loadDb(stem) {
  const SQL = sqlModule = await openSqlJs();
  const buf = await (await fetch(stem + ".sqlite" + VERSION)).arrayBuffer();
  if (db) db.close();
  db = new SQL.Database(new Uint8Array(buf));
  terminalDb(db);
  const v = db.exec("SELECT sqlite_version()")[0].values[0][0];
  if (v.split(".").map(Number) < [3, 39]) console.warn("SQLite " + v + " is older than 3.39; RIGHT JOIN will fail");
  schema = { sqlite_master: [["type", "TEXT", 0], ["name", "TEXT", 0], ["tbl_name", "TEXT", 0], ["rootpage", "INTEGER", 0], ["sql", "TEXT", 0]], ...readSchema(db) };
  tableSizes = Object.fromEntries(Object.keys(schema).filter(t => t !== "sqlite_master").map(t => [t, db.exec("SELECT COUNT(*) FROM " + t)[0].values[0][0]]));
}
// The tables on the schema now -> their columns, for the completion and sqliteHelp (never a table the player has not been shown).
const visibleColumns = () => !data || !state ? {} : columns(schema, [...visibleTables(data.chapters, state)]);

// After a correct answer the solved chapter stays on screen (telegram, answer) until the clerk presses
// Next chapter; the new chapter's tables are revealed only then, so the reveal is actually seen.
let reviewing = null, nextPending = 0, pendingReveal = [];
// Chapter I's box on first arrival: a plain look-up, noise only (test_generate pins its rows, learn and seasons).
export const FIRST_QUERY = "SELECT * FROM police_report LIMIT 5";
// The query box's empty value: that first query, until a first chapter I query or a solve.
export const starterSql = state => !state.queries[1] && !state.solved.length ? FIRST_QUERY : "";
let syncSql = () => {};   // the query box's redraw, once boot has wired it (wireEditor)
function clearTerminal() { $("sql").value = starterSql(state); syncSql(); $("results").innerHTML = ""; $("run-info").textContent = ""; }
function reviewChapter(n) { reviewing = n; clearTerminal(); renderChapter(); }
function backToInvestigation() {
  reviewing = null; nextPending = 0; clearTerminal(); renderChapter();
  if (pendingReveal.length) { renderErd(pendingReveal); pendingReveal = []; }
}
// A table name in the Hint: a button that scrolls to the schema and flashes that table (showTable).
const tableLink = t => '<button type="button" class="table-link" data-table="' + esc(t) + '"><code>' + esc(t) + "</code></button>";
// "Where to look" (learn only, chapters.json `where`): escaped first, then each `name` becomes a table link.
export const whereHtml = s => esc(s).replace(/`([a-z_]+)`/g, (_, t) => tableLink(t));
export const objectiveHtml = (text, label, value, ch) => esc(text) + '<div class="answer-form"><b>' + label + "</b> " + esc(value) + "</div>" +
  // the chapter's SQL tool and new tables sit under a closed Hint toggle (a native <details>), so the
  // student tries first and opens it when stuck; a nested closed "Where to look" holds the chapter's line
  (ch && (ch.construct || (ch.tables || []).length || ch.where) ? '<details class="muted chapter-tools"><summary>Hint</summary>' +
    (ch.construct ? "<div><b>This chapter's tool:</b> " + esc(ch.construct) + "</div>" : "") +
    ((ch.tables || []).length ? "<div><b>New evidence:</b> " + ch.tables.map(tableLink).join(", ") + "</div>" : "") +
    (ch.where ? '<details class="hint-where"><summary>Where to look</summary><div>' + whereHtml(ch.where) + "</div></details>" : "") +
    "</details>" : "");

// Scroll the page to the schema box, then the box to table t, and flash its outline for a moment.
function showTable(t) {
  const box = $("erd"), g = box.querySelector('g.table[data-table="' + CSS.escape(t) + '"]:not(.hidden)');
  (g || box).scrollIntoView({ behavior: "smooth", block: "center" });   // the page and the schema box both move to it
  if (!g) return;
  g.classList.remove("flash"); void g.getBoundingClientRect(); g.classList.add("flash");
  setTimeout(() => g.classList.remove("flash"), 2400);
}

function renderChapter() {
  markSuspects(); markBadges();
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
    $("objective").innerHTML = objectiveHtml(ch.objective, "Your answer:", state.answers[ch.n], ch) + crackedHtml(state.cracked[ch.n]) + howtoHtml(state.howto[ch.n]);
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
    $("story").innerHTML = '<img class="portrait" src="' + portraitSrc("Rupert Blakeney") + '" alt="">' + richText(data.endings.part1);   // the unmasking: his face, only now
    $("objective").textContent = "Part I is closed. Lupin mentioned a Chapter IX. Somewhere in the archives a telegram is addressed to a curious clerk; its code, typed in the answer box...";
    $("btn-print").hidden = false;
  }
  // The ending stays in the story column after the Part II extra edition (showExtra2, which also has the film) is closed.
  if (state.solved.includes(12)) {
    $("story").innerHTML = part2Ending(data);
    $("objective").textContent = "Case closed. Twice.";
  }
  if (competeDone(state)) {
    $("story").textContent = "Case closed. Lupin is in irons, Ganimard is taking the credit, and the clock has stopped. " +
      "Your side of the clock read " + fmtTime(state.finishedAt - state.startedAt) + "; the leaderboard keeps the official time, " +
      "plus " + duration(PENALTY.wrong) + " per wrong answer.";
    $("objective").innerHTML = boardUrl
      ? 'Your result is on the class leaderboard: <a href="' + esc(resultsLink(boardUrl, state.season)) + '" target="_blank" rel="noopener">open it</a>.'
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

// Every run counts (ranks, badges, GA, the board's rows); a query that errors (a strict refusal or SQLite's own
// error) is kept out of History, so the list only holds queries worth re-running (owner, 2026-10-16).
export function recordQuery(state, chapter, sql, error) {
  state.queries[chapter] = (state.queries[chapter] || 0) + 1;
  state.totalQueries++;
  state.lastQueryLines = sql.split("\n").length;
  if (error) { state.errorStreak++; return; }
  state.errorStreak = 0;
  pushHistory(state, sql);
}

// GA chapter_queries: the milestone (1, 5 or 20 queries in a chapter) this run reaches, once each per chapter;
// `sent` is the highest already sent for it (state.milestones), so a reload never resends one.
export const QUERY_MILESTONES = [1, 5, 20];
export const queryMilestone = (count, sent = 0) => QUERY_MILESTONES.find(m => count >= m && m > sent) || 0;

// GA chapter_leave: the page hidden or closed with the current chapter open and unsolved; null otherwise.
export function chapterLeave(state, chapters, now = Date.now()) {
  const ch = currentChapter(state, chapters);
  if (!ch || state.solved.includes(ch.n) || !state.opened[ch.n]) return null;
  return { chapter: ch.n, mode: state.mode, seconds: Math.round((now - state.opened[ch.n]) / 1000), queries: state.queries[ch.n] || 0 };
}
// How a chapter was cracked, from its successful runs (state.runs[n] = { last, hit, same }, kept while it is open):
// last = the latest successful query, hit = the latest whose result (the rows on screen) held the answer, same =
// some such result was a single row, which is the official solution's result (every solution returns exactly one
// row, its answer: generate_db.check_chapter), its other columns allowed as on the exercises page (sameResult).
// The page only has the answer's hashes, so each cell and each pair of neighbouring cells is normalised and hashed.
export async function scanRun(run, sql, res, hashes) {
  run = { ...run, last: sql };
  if (!res || !/\bfrom\b/i.test(sql)) return run;   // a typed constant (SELECT 214) shows nothing the archives hold
  const seen = new Set();
  for (const r of res.values.slice(0, ROW_CAP))
    r.forEach((v, i) => { seen.add(normalise(String(v ?? ""))); if (i) seen.add(normalise((r[i - 1] ?? "") + " " + (v ?? ""))); });
  seen.delete("");
  const hit = (await Promise.all([...seen].map(sha256))).some(h => hashes.includes(h));
  return hit ? { ...run, hit: sql, same: !!run.same || res.values.length === 1 } : run;
}
// GA chapter_solve's route: same_result, found (the answer was in a result run in that chapter) or unseen
// (guessed, copied, or worked out elsewhere). Neither the query nor the answer is ever sent.
export const solveRoute = run => run && run.same ? "same_result" : run && run.hit ? "found" : "unseen";
// The query on the solved chapter's card: the last that showed the answer, else the last that ran before it.
export const winningQuery = run => run ? run.hit || run.last || "" : "";
export const crackedHtml = sql => sql ? '<div class="cracked"><b>The query that cracked it:</b><pre class="sql-view">' + highlightSql(sql) + "</pre></div>" : "";
let scanning = Promise.resolve();
const curChapter = () => state && data ? currentChapter(state, data.chapters).n : 0;

function runQuery() {
  const sql = $("sql").value.trim();
  if (!sql) { $("results").innerHTML = EMPTY_RUN; $("run-info").textContent = ""; return; }   // not a query: not counted
  const ch = currentChapter(state, data.chapters), st = state, t0 = performance.now();
  const r = runSql(db, sql, schema, visibleColumns()), { res, error } = r;
  recordQuery(st, ch.n, sql, error);
  if (!error && !st.solved.includes(ch.n)) {   // chained, so two quick runs never scan from the same stale record
    const n = ch.n;   // st, not state: an admin jump replaces the state, and the new one must not take this run
    scanning = scanning.then(() => scanRun(st.runs[n], sql, res, ch.answer_sha256))
      .then(x => { st.runs[n] = x; if (st === state) save(st); }).catch(e => console.warn("scanRun:", e.message));
  }
  const m = st.solved.includes(ch.n) ? 0 : queryMilestone(st.queries[ch.n], st.milestones[ch.n]);
  if (m) { st.milestones[ch.n] = m; track("chapter_queries", { chapter: ch.n, mode: st.mode, count: m }); }
  const fail = error && queryFail(st.fails, ch.n, r.outcome);
  if (fail) track("query_fail", { chapter: ch.n, mode: st.mode, ...fail });
  const ms = Math.round(performance.now() - t0);
  $("results").innerHTML = runHtml(r);
  $("run-info").textContent = runInfo(r) + (error ? "" : " - " + ms + " ms");
  renderHistory();
  const text = eggText(res);
  st.film = seenFilms(text, st.film);
  const faces = suspectsOn(st) ? foundSuspects(data.cast, res, st.suspects) : [];
  if (faces.length) { st.suspects.push(...faces); markSuspects(); }
  award(detectBadges(ctx({ sql, text, rows: error ? -1 : (res ? res.values.length : 0), cols: res ? res.columns.length : 0, error: !!error }), st.badges));
  save(st);
  return { sql, res, error };
}

function renderHistory() {
  $("history").innerHTML = state.history.map(q => "<li>" + esc(q) + "</li>").join("");
  [...$("history").children].forEach((li, i) => btnLike(li, () => { $("sql").value = state.history[i]; syncSql(); useFeature("history_reuse", { chapter: curChapter() }); }));
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
function toast(text, title) {
  const t = document.createElement("div"); t.className = "toast"; t.innerHTML = "<b>" + esc(title) + "</b><br>" + esc(text);
  $("toasts").appendChild(t); setTimeout(() => t.remove(), 5000);
}

function award(list) {
  list.forEach((b, i) => {
    state.badges.push(b.name); track("badge", { name: b.name });
    const t = document.createElement("div"); t.className = "toast"; t.innerHTML = "<b>Badge: " + esc(b.name) + "</b><br>" + esc(b.text);
    $("toasts").appendChild(t); setTimeout(() => t.remove(), 5000 + i * 400);   // stagger so a badge burst doesn't vanish as one block
  });
  if (list.length) { save(state); markBadges(); }
}

// Seconds per wrong answer on the board; a compete game takes its season record's penalty.
export const PENALTY = { wrong: 10 };
export function duration(s) { return s && s % 60 === 0 ? s / 60 + (s === 60 ? " minute" : " minutes") : s + " seconds"; }

function ctx(extra) {
  return { event: "query", sql: "", rows: 0, error: false, chapter: currentChapter(state, data.chapters).n, state,
           cols: 0, allTables: Object.keys(tableSizes), revealed: visibleTables(data.chapters, state),
           norm: "", text: "", lines: state.lastQueryLines, hour: new Date().getHours(),
           elapsed: Date.now() - (state.opened[currentChapter(state, data.chapters).n] || Date.now()),
           decoy: data.decoys ? data.decoys[currentChapter(state, data.chapters).n] : undefined, ...extra };
}

function renderBoard() {
  const label = n => (data.chapters.find(c => c.n === n) || {}).board || "";
  $("board").innerHTML = state.solved.map(n => { const p = cardPicture(n, state.answers[n]);
    return '<div class="card" data-n="' + n + '"><img class="card-pic' + (p.face ? " face" : "") + '" src="' + p.src + '" alt=""><b>' + ROMAN[n] + '</b> <span class="card-label">' +
      esc(label(n)) + "</span>" + (state.answers[n] ? "<br>" + esc(state.answers[n]) : "") + "</div>"; }).join("") +   // older saves have no answers: no "NULL" card
    '<div id="board-suspects" class="board-suspects" hidden></div>';
  $("board").querySelectorAll(".card").forEach(el => btnLike(el, () => { useFeature("card_review", { chapter: Number(el.dataset.n) }); reviewChapter(Number(el.dataset.n)); }));
  renderStrip();
}
function renderStrip() {
  const el = $("board-suspects");
  if (!el) return;
  const list = suspectsOn(state) ? boardSuspects(data.cast, state, data.chapters) : [];
  el.hidden = !list.length;
  el.title = "Suspects";
  el.innerHTML = list.map(s => { const t = esc(s.name + (s.cleared ? ", cleared" : ""));
    return '<span class="strip-face' + (s.cleared ? " cleared" : "") + '"><img src="' + portraitSrc(s.name) + '" alt="' + t + '" title="' + t + '"></span>'; }).join("");
  btnLike(el, openSuspects);
}

// The game's hooks for the endings (endings.js): save, the chapter GA reports, New investigation's question.
const hooks = () => ({ save: () => save(state), chapter: curChapter, reset: askReset });
const showTour = () => showCallouts(CALLOUTS, how => {
  state.onboarding = "done"; save(state);
  useFeature(how === "done" ? "tour_done" : "tour_skip", { chapter: 1 });
});
const afterPrologue = how => {
  state.onboarding = "tour"; save(state);
  useFeature(how === "done" ? "prologue_done" : "prologue_skip", { chapter: 1 });
  if (tourOn(state)) showTour();
};
function openSuspects() {
  useFeature("suspects_open", { chapter: curChapter() });
  renderSuspects(); $("suspects").hidden = false;
  award(detectBadges(ctx({ event: "suspects", faces: metSuspects(data.cast, state, data.chapters).length }), state.badges));
}
// New investigation (the masthead button, the Part II edition's replay): asked in #reset, a native <dialog> in the
// game's look (askDialog), the browser's own box where it cannot open.
async function askReset() {
  const msg = resetMessage(state.mode);
  if (await askDialog($("reset"), msg, () => confirm(msg) ? "ok" : "") === "ok") { state = freshState(); save(state); location.reload(); }
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
  $("btn-suspects").hidden = !suspectsOn(state);
  if (!suspectsOn(state)) return renderStrip();
  const met = metSuspects(data.cast, state, data.chapters);
  $("btn-suspects").classList.toggle("new", met.reduce((k, s) => k + 1 + s.notes.length, 0) > state.suspectsSeen);
  introduceSuspects(met.map(s => s.name));
  renderStrip();
}
// The first time a suspect is met, a pop-up (#newsuspects) shows their portrait and bio; suspects met together share
// one. It waits while a solved chapter is still on screen (the next chapter's names stay unread) and while the extra
// edition or the Part II pop-up is open. state.introduced: names already shown (a game saved before it starts full).
function introduceSuspects(met) {
  if (!state.introduced) { state.introduced = met; save(state); return; }   // null: the first look seeds it (state.js)
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
  state.badgesSeen = state.badges.length; save(state);
  markBadges();
}
// The Badges button carries a red count of the badges earned since the panel was last opened.
function markBadges() {
  const n = unseenBadges(state), b = $("btn-badges");
  b.dataset.unseen = n || "";
  b.setAttribute("aria-label", n ? "Badges, " + n + " new" : "Badges");
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
    await scanning;   // the last run's scan is in
    const run = state.runs[ch.n];
    state.cracked[ch.n] = winningQuery(run); delete state.runs[ch.n];
    if (ch.howto) state.howto[ch.n] = await openHowto(ch.howto, norm, ch.answer_sha256.indexOf(hash)).catch(() => null);   // learn only
    state.solved.push(ch.n); state.answers[ch.n] = raw.trim(); state.wrongStreak = 0; $("taunt").textContent = "";
    track("chapter_solve", { chapter: ch.n, mode: state.mode, seconds: Math.round((Date.now() - (state.opened[ch.n] || Date.now())) / 1000),
                             queries: state.queries[ch.n] || 0, wrong: state.wrong[ch.n] || 0, route: solveRoute(run) });
    $("reply").textContent = "Correct. Ganimard grunts, which is praise.";
    typeTelegram(ch.telegram);
    afterSolve(ch, "solve");
  } else {
    state.wrong[ch.n] = (state.wrong[ch.n] || 0) + 1; state.wrongStreak++;
    if ([1, 3].includes(state.wrong[ch.n])) track("answer_wrong", { chapter: ch.n, mode: state.mode, n: state.wrong[ch.n] });
    $("reply").textContent = judgeWrong(norm, data, state, metSuspects(data.cast, state, data.chapters).map(s => normalise(s.name)));
    if (state.wrongStreak % 3 === 0) typeTelegram(TAUNTS[(state.wrongStreak / 3 - 1) % TAUNTS.length], "taunt");
    afterWrong(norm);
  }
  $("answer").value = ""; save(state);
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
      if (state.mode !== "compete") showExtra(state, data, hooks());
    }
    if (state.mode === "compete") {
      if (ch.n === 8) { state.finishedAt = Date.now(); clearTimeout(watcher); queueEvent("finish", 8); renderChapter(); tickClock(); }
      else queueEvent("progress", ch.n);
    }
    if (ch.n === 12) { award(detectBadges(ctx({ event: "part2", chapter: ch.n }), state.badges)); showExtra2(state, data, hooks()); }
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
    fmtTime(clockMs(state)) + (boardUrl ? "" : " \u2014 NOT RECORDED") +
    (state.over ? " \u2014 THE SESSION IS OVER" : "");
}
function startClock() { clearInterval(ticker); tickClock(); if (!state.finishedAt && !state.stoppedAt) ticker = setInterval(tickClock, 1000); }
function stopClock(at = Date.now()) {
  state.over = true;
  if (!state.finishedAt && !state.stoppedAt) state.stoppedAt = at;
  save(state); clearInterval(ticker); tickClock();
}
// The teacher closed the season: freeze the clock (at the server's closedAt when known) and say so in the #closed
// pop-up, once per close (state.closedSeen; enterGame shows it on a reload that finds the season closed), never after
// a finish. The slip is the fallback where <dialog> cannot open.
const CLOSED_SLIP = "The teacher has closed the session. Your time is recorded up to this point.";
function sessionClosed(at) {
  stopClock(at); clearTimeout(watcher);
  showClosed();
}
function showClosed() {
  if (state.mode !== "compete" || !state.over || state.finishedAt || state.closedSeen) return;
  state.closedSeen = true; save(state);
  const d = $("closed");
  if (!d.showModal) { typeTelegram(CLOSED_SLIP, "taunt"); return; }
  d.querySelector(".closed-time").textContent = "Season: " + state.seasonName + " \u2014 " + state.team.toUpperCase() + " \u2014 " + fmtTime(clockMs(state));
  const a = d.querySelector("a");
  a.hidden = !boardUrl;
  if (boardUrl) a.href = resultsLink(boardUrl, state.season);
  if (!d.open) d.showModal();
}
// A student between answers posts nothing, so a slow poll of ?meta notices the close; an unknown season or an
// unreachable backend keeps playing and asks again.
let watcher = 0;
function watchClose() {
  clearTimeout(watcher);
  if (!watchOn(state, boardUrl)) return;
  watcher = setTimeout(async () => {
    let m = null;
    try { m = await fetchMeta(state.season); } catch {}
    if (!watchOn(state, boardUrl)) return;
    if (m && m.state === "closed") sessionClosed(m.closedAt ? clockStart({ openedAt: m.closedAt, now: m.now }) : Date.now());
    else watchClose();
  }, 30000);
}

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
        if (j.error === "session closed") sessionClosed();
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
  const r = await fetch(boardUrl, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(body), signal: AbortSignal.timeout(40000) });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.json();
}
// The season record (apps_script.gs ?meta=<id>): null when the backend does not know the season (or there is no
// board); throws when the backend is unreachable (network, timeout, an HTML error page instead of JSON).
async function fetchMeta(id) {
  if (!boardUrl || !id) return null;
  const u = new URL(boardUrl); u.searchParams.set("meta", id);
  const r = await fetch(u, { signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error("HTTP " + r.status);
  const m = await r.json();
  return m && m.id === id ? m : null;
}
const UNREACHABLE = "Could not reach the leaderboard. Reload the page.";
// Copies what the game uses from a season record; the clock runs from the teacher's Open.
function applyMeta(m) {
  if (!m) return;
  state.seasonName = String(m.name || ""); state.db = Number(m.db) || state.db;
  if (Number.isInteger(m.penalty)) state.penalty = m.penalty;
  if (m.openedAt) state.startedAt = clockStart(m);
  if (m.state === "closed") { state.over = true; if (m.closedAt && !state.stoppedAt) state.stoppedAt = clockStart({ openedAt: m.closedAt, now: m.now }); }
  PENALTY.wrong = state.penalty;
  save(state);
}
async function loadSeason() {
  data = await (await fetch("season-" + state.db + ".json" + VERSION)).json();
  await loadDb("season-" + state.db);
  PENALTY.wrong = state.penalty;
  startClock();
  flushOutbox();
  watchClose();
}
let competeLoading = false;
async function playCompete() {
  if (competeLoading) return;   // once per page: a second call (a late poll, a double click) does nothing
  competeLoading = true;
  await loadSeason();
  renderBoard(); renderHistory(); enterGame();
  $("notes").value = state.notes;
}
// Joined, the season not open yet: the landing card waits, asking the backend 5 s after each answer (one chain:
// a newer call supersedes an older one, waitGen).
let waiter = 0, waitGen = 0;
function waitForOpen() {
  $("landing").hidden = false;
  document.querySelector(".landing-buttons").hidden = true;
  $("compete-form").hidden = true;
  $("compete-wait").hidden = false;
  $("wait-name").textContent = state.seasonName;
  $("wait-team").textContent = state.team;
  $("status").textContent = "";
  clearTimeout(waiter);
  const gen = ++waitGen;
  const poll = async () => {
    let m;
    try { m = await fetchMeta(state.season); } catch { m = undefined; }
    if (gen !== waitGen) return;
    if (m === null || (m && m.state === "closed" && !m.openedAt)) {   // closed before it ever opened
      $("compete-wait").hidden = true;
      $("status").textContent = m ? "This session is closed." : "This season does not exist.";
      return;
    }
    if (!m || m.state === "created") { waiter = setTimeout(poll, 5000); return; }
    applyMeta(m);
    $("compete-wait").hidden = true;
    playCompete();
  };
  waiter = setTimeout(poll, 5000);
}
const JOIN_REFUSED = { "pseudo taken": "Someone already plays this season under that pseudo. Pick another.",
  "session closed": "This session is closed.", "no such season": "This season does not exist.",
  "busy, try again": "The archives are busy. Press Join again." };

async function joinCompete() {
  const team = $("team").value.trim();
  if ($("btn-start").disabled) return;   // Enter while a join is under way
  if (!team) { $("team").focus(); return; }
  track("landing_begin", { mode: "compete" });
  $("btn-start").disabled = true;
  $("status").textContent = "Joining...";
  const join = () => postBoard({ event: "join", team, season: seasonId, clientAt: Date.now() });
  let j;
  try {
    j = await join();
    if (j.error === "busy, try again") { await new Promise(r => setTimeout(r, 2000)); j = await join(); }   // once
  } catch { j = { error: "unreachable" }; }
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
  if (!seasonMeta && !metaUnreachable) {
    $("status").textContent = boardUrl ? "This season does not exist." : "This season link has no leaderboard: ask your teacher for the full link.";
    return;
  }
  if (seasonMeta && seasonMeta.state === "closed") { $("status").textContent = "This session is closed."; return; }
  if (metaUnreachable) $("status").textContent = UNREACHABLE;
  b.disabled = false; b.title = "Part I only, against the clock.";
  b.onclick = async () => {
    if (!seasonMeta) {   // unreachable at boot: ask again
      try { seasonMeta = await fetchMeta(seasonId); } catch { $("status").textContent = UNREACHABLE; return; }
      const no = !seasonMeta ? "This season does not exist." : seasonMeta.state === "closed" ? "This session is closed." : "";
      $("status").textContent = no || "The archives are open.";
      if (no) { b.disabled = true; return; }
    }
    $("compete-note").innerHTML = "Season: " + esc(seasonMeta.name) + ". Part I, chapters I to VIII, against the clock. " +
      duration(seasonMeta.penalty) + " per wrong answer; queries are free. The clock starts when your teacher opens the session " +
      'and stops when Lupin is named. Your pseudo and progress go to the class leaderboard (<a href="privacy.html" target="_blank">what is sent</a>).';
    $("compete-form").hidden = false; $("team").focus();
  };
  $("btn-start").onclick = joinCompete;
  $("team").addEventListener("keydown", e => { if (e.key === "Enter") joinCompete(); });
}

// Part II mood: dark palette + a later masthead date (see style.css's [data-mood="night"]). The palette is
// the reader's choice once they press the Day/Night edition button (per browser, THEME_KEY); until then
// it follows the story. The masthead date always follows the story.
const THEME_KEY = "ritz.theme";
function chosenTheme() { try { return localStorage.getItem(THEME_KEY); } catch { return null; } }
// Masthead "CHAPTER I OF VIII": the current chapter's numeral in bold, the rest plain.
export function mastheadChapterHtml(n, total, reviewing) {
  return (reviewing ? "Reviewing chapter <b>" : "Chapter <b>") + ROMAN[n] + "</b> of " + ROMAN[total];
}
const setErdButton = large => setIconButton($("btn-erd"), erdButtonHtml(large));
function applyMood() {
  const mood = chosenTheme() || (state && state.part2 ? "night" : "day");
  document.documentElement.dataset.mood = mood;
  setIconButton($("btn-theme"), { html: themeButtonHtml(mood), label: mood === "night" ? "Day edition" : "Night edition" });
}
function toggleTheme() {
  try { localStorage.setItem(THEME_KEY, document.documentElement.dataset.mood === "night" ? "day" : "night"); } catch {}
  applyMood();
  if (state && data) award(detectBadges(ctx({ event: "theme" }), state.badges));   // before boot has loaded them: no badge
  useFeature("theme_toggle", { chapter: curChapter() });
}

// Gates both ?chapter=N and the ?admin panel: nobody skips ahead just by knowing the query params.
// Passphrase is asked for once per page load (adminUnlocked persists after); ask the course owner
// for it, it is not committed in plaintext anywhere (its hash: ADMIN_PASS_SHA256 in shared.js).
let adminUnlocked = false;
function askPassphrase() {   // #passgate: a native <dialog> with a password field, so the letters are masked (Escape cancels)
  const d = $("passgate"), input = d.querySelector("input");
  input.value = "";
  return askDialog(d, null, () => prompt("Passphrase:") || "").then(v => d.showModal ? (v === "ok" ? input.value : "") : v);
}
async function unlockAdmin() {
  if (adminUnlocked) return true;
  const pass = await askPassphrase();
  if (!pass) return false;
  adminUnlocked = (await sha256(pass.trim().toLowerCase())) === ADMIN_PASS_SHA256;   // trimmed, lowercased: exactly what apps_script.gs compares; never the answer normaliser (its rules change)
  if (!adminUnlocked) toast("Wrong passphrase.", "Admin");
  return adminUnlocked;
}

// A debug start at chapter n (?chapter=N, the admin panel's jumps): chapters 1..n-1 solved without an answer (the
// board card shows its label alone), Part II from IX on, nothing saved and no statistics.
function debugState(n) {
  noPersist = true; quietStats();
  const s = freshState();
  for (let i = 1; i < n; i++) s.solved.push(i);
  if (n > 8) s.part2 = true;
  return s;
}
async function jumpToChapter(n) {
  if (!(await unlockAdmin())) return false;
  state = debugState(n);
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
  if (!$("sql").value) { $("sql").value = starterSql(state); syncSql(); }   // a first query that runs
  if (awaitingCode(state) && !state.extraSeen) showExtra(state, data, hooks());   // solved chapter VIII, closed the page before the extra edition
  if (state.mode !== "compete" && state.solved.includes(12) && !state.extraSeen2) showExtra2(state, data, hooks());   // the same for chapter XII
  if (!noPersist && prologueOn(state)) showPrologue(sqlModule, afterPrologue);   // learn mode's first visit
  else if (!noPersist && tourOn(state)) showTour();
  showClosed();   // the season closed while the page was shut
}

async function boot() {
  // The query box; it completes only the tables the schema shows (learn or compete): never one the evidence has not reached.
  syncSql = wireEditor($("sql"), $("sql-hl"), { run: () => db && state && runQuery(), cols: visibleColumns, minHeight: 160 });
  $("btn-theme").onclick = toggleTheme;
  wireFeedback(() => useFeature("feedback", { chapter: curChapter() }),
    () => state ? { chapter: String(curChapter()), mode: state.mode, part: state.part2 ? "2" : "1" } : {});
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
  if (!seasonId && savedLive && !part1Done(saved) && !saved.over && !debugChapter) seasonId = saved.season;
  let resuming = !!(savedLive && saved.season === seasonId && !debugChapter);
  if (resuming && !boardUrl) boardUrl = saved.board || "";
  if (seasonId) {
    try { seasonMeta = await fetchMeta(seasonId); } catch { metaUnreachable = true; }
  }
  // Without the link, an unfinished game resumes only into a season still running (or while the backend is
  // unreachable); a closed or unknown one is set over, so the landing shows. The save stays (the Sheet has the rows).
  if (!linked && resuming && !metaUnreachable && (!seasonMeta || seasonMeta.state === "closed")) {
    try { localStorage.setItem(storageKey("compete"), JSON.stringify({ ...saved, over: true })); } catch {}
    resuming = false; seasonId = ""; seasonMeta = null;
  }
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
      if (debugOk) state = debugState(debugChapter);
      else state = loadFrom(key);
    }
    await loadDb("mystery");
  }
  $("status").textContent = badBoard ? "The archives are open. The leaderboard link in this address is broken, so nothing is recorded."
    : resuming && metaUnreachable ? UNREACHABLE : "The archives are open.";

  $("btn-investigate").disabled = false;
  $("btn-investigate").onclick = () => { track("landing_begin", { mode: state.mode }); enterGame(); };
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
  // A refusal's Grammar link, the objective's Hint (once per chapter, kept in the state), the landing's About.
  $("results").addEventListener("click", e => { if (e.target.closest(".strict a")) useFeature("grammar_link", { chapter: curChapter() }); });
  // The house ad and the landing's warm-up link, as on the handbook (GA audit, 2026-10-25).
  document.addEventListener("click", e => {
    const tl = e.target.closest && e.target.closest(".table-link");
    if (tl) return showTable(tl.dataset.table);
    const a = e.target.closest && e.target.closest("a");
    if (!a) return;
    if (a.closest(".press-notice")) useFeature("ad_house_click", { chapter: curChapter() });
    else if (a.closest(".landing-warmup")) useFeature("warmup_link", { chapter: 1 });
  });
  document.addEventListener("toggle", e => {   // toggle does not bubble: caught on the way down
    const d = e.target;
    if (!d.open || !d.matches) return;
    if (d.matches("details.landing-about")) useFeature("landing_about", { chapter: curChapter() });
    if (d.matches("details.chapter-tools")) {
      const n = reviewing ?? curChapter();
      if (state.hints.includes(n)) return;
      state.hints.push(n); save(state);
      track("hint_open", { chapter: n, mode: state.mode });
    }
    if (d.matches("details.hint-where")) {   // once per chapter per save, like hint_open
      const n = reviewing ?? curChapter();
      if (state.hintsWhere.includes(n)) return;
      state.hintsWhere.push(n); save(state);
      track("hint_where", { chapter: n, mode: state.mode });
    }
  }, true);
  // Leaving with the chapter unsolved: once per chapter per page load, sent as a beacon so the close does not drop it.
  const leave = () => {
    const p = $("landing").hidden ? chapterLeave(state, data.chapters) : null;
    if (p) trackOnce("leave:" + p.chapter, "chapter_leave", { ...p, transport_type: "beacon" });
  };
  window.addEventListener("pagehide", leave);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") leave(); });
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
    if (large) useFeature("schema_enlarge", { chapter: curChapter() });
  };
  $("btn-suspects").onclick = openSuspects;
  $("notes").value = state.notes;
  $("notes").oninput = () => { state.notes = $("notes").value; save(state); };
  $("btn-reset").onclick = askReset;
  $("btn-print").onclick = async () => {
    if (!state.names) {
      const d = $("names"), input = d.querySelector("input");
      input.value = "";
      const v = await askDialog(d, null, () => prompt(NAMES_ASK) || "");
      state.names = d.showModal ? (v === "ok" ? input.value.trim() : "") : v;
      save(state);
    }
    $("certificate").innerHTML = certificateHtml(state);
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

if (typeof document !== "undefined" && document.getElementById("landing")) boot();   // the game page only
