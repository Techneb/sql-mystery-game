import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { normalise, sha256, freshState, currentChapter, part1Done, awaitingCode, competeDone, storageKey, fmtTime, competeStats, eventPayload, clockStart, clockMs, watchOn, renderResults, ROW_CAP, pushHistory, judgeWrong, TAUNTS, visibleTables, legendEntries, detectBadges, BADGES, rank, partStats, PENALTY, duration, highlightSql, formatSql, metSuspects, foundSuspects, suspectsOn, FILM_LINES, seenFilms, eggText, EGG_ROWS, richText, track, GA_ID, consentDefaults, CONSENT_REGIONS, ADS_ON, ADS_CLIENT, AD_SLOT, adSlotHtml, adOutcome, AD_WAIT_MS, cartesian, strictCheck, strictHtml, SQLITE_FUNCS, SQL_KEYWORDS, toSqlite, ilike, recordQuery, STRICT_SECTIONS, teamKey, themeButtonHtml, erdButtonHtml, mastheadChapterHtml, resultsLink, europeanZone, cmpLive, consentPath, googleStats, CMP_WAIT_MS, queryMilestone, firstTime, trackOnce, useFeature, queryFail, QUERY_FAILS, chapterLeave, resetMessage, sqliteHelp, errorHtml, dateArithmeticNote, ymd, FIRST_QUERY, suggestSql, SUGGEST_FUNCS, SUGGEST_KEYWORDS, SUGGEST_MAX, boardSuspects, scanRun, solveRoute, winningQuery, crackedHtml, cardPicture } from "./site/app.js";
import { colourBlock, colourPage, bakerySchema, plainSql } from "./colour_learn.mjs";
import { execFileSync } from "node:child_process";
import * as shared from "./site/shared.js";
import { qrMatrix, qrSvg, dataPositions, MASKS, gfMul, gfExp } from "./site/qr.js";
import { sameResult, sameValue, checkOptions, tablesIn, startLevel, levelPick, levelId, runOutcome } from "./site/learn/exercises.js";

const data = JSON.parse(fs.readFileSync("site/chapters.json", "utf8"));

test("normalise matches the generator's fixture", () => {
  for (const [raw, want] of data.normalise_fixture) assert.equal(normalise(raw), want, raw);
});

test("normalise: a lone letter glues to its digits, honorifics and labels go, a trailing STOP goes, leading zeros go", () => {
  for (const s of ["B-3", "B 3", "B3"]) assert.equal(normalise(s), "b3", s);
  assert.equal(normalise("room 305"), "305");
  assert.equal(normalise("0305"), "305");
  assert.equal(normalise("0"), "0");
  assert.equal(normalise("M. Dupont"), "dupont");
  assert.equal(normalise("Monsieur Dupont"), "dupont");
  assert.equal(normalise("Countess Smith"), "smith");
  assert.equal(normalise("wire 12 STOP"), "12");
  assert.equal(normalise("stop reading the noise stop"), "stop reading noise");
  assert.equal(normalise("stop"), "stop", "a lone STOP is the answer, not punctuation");
});

test("answer hashes are lists; the Part II code has more than one accepted spelling", () => {
  for (const ch of data.chapters) assert.ok(Array.isArray(ch.answer_sha256) && ch.answer_sha256.length >= 1, "chapter " + ch.n);
  assert.ok(Array.isArray(data.part2_code_sha256) && data.part2_code_sha256.length >= 2);
});

test("sha256 of a normalised answer is 64 hex chars", async () => {
  const h = await sha256(normalise("Lord Ashcombe"));
  assert.match(h, /^[0-9a-f]{64}$/);
});

test("chapter progression gates Part II on the code", () => {
  const s = freshState();
  assert.equal(currentChapter(s, data.chapters).n, 1);
  s.solved = [1, 2, 3, 4, 5, 6, 7, 8];
  assert.equal(currentChapter(s, data.chapters).n, 8);
  assert.ok(part1Done(s) && awaitingCode(s));
  s.part2 = true;
  assert.equal(currentChapter(s, data.chapters).n, 9);
  s.solved.push(9, 10, 11, 12);
  assert.equal(currentChapter(s, data.chapters).n, 12);
});

test("renderResults caps rows and escapes", () => {
  const values = Array.from({ length: 250 }, (_, i) => [i, "<b>"]);
  const html = renderResults({ columns: ["id", "t"], values });
  assert.equal((html.match(/<tr>/g) || []).length, ROW_CAP + 1);
  assert.match(html, /50 more rows/);
  assert.match(html, /&lt;b&gt;/);
  assert.match(renderResults(null), /No rows/);
  assert.match(renderResults({ columns: ["x"], values: [[null]] }), /NULL/);
});

test("history keeps 20, newest first, no consecutive duplicates", () => {
  const s = freshState();
  for (let i = 0; i < 25; i++) pushHistory(s, "q" + i);
  pushHistory(s, "q24");
  assert.equal(s.history.length, 20);
  assert.equal(s.history[0], "q24");
});

test("wrong answers get suspect-specific or rotating default replies", () => {
  const s = freshState();
  assert.equal(judgeWrong("paul sernine", data, s), data.wrong_suspects["paul sernine"]);
  assert.equal(judgeWrong("paul sernine", data, s, ["paul sernine"]), data.wrong_suspects["paul sernine"]);
  assert.equal(judgeWrong("paul sernine", data, s, []), data.wrong_default[0], "an unmet suspect's alibi stays hidden");
  assert.equal(judgeWrong("constructor", data, s), data.wrong_default[0], "own keys only");
  s.wrongStreak = 0; const a = judgeWrong("nobody", data, s);
  s.wrongStreak = 1; const b = judgeWrong("nobody", data, s);
  assert.notEqual(a, b);
  assert.equal(TAUNTS.length, 3);
  for (const t of TAUNTS) assert.match(t, /STOP/);
});

test("tables are revealed chapter by chapter", () => {
  const s = freshState();
  assert.deepEqual([...visibleTables(data.chapters, s)].sort(), ["interview", "police_report"]);
  s.solved = [1, 2];
  assert.deepEqual([...visibleTables(data.chapters, s)].sort(), ["cab_ride", "hotel_register", "interview", "police_report", "suite"]);
  s.solved = [1, 2, 3, 4, 5, 6, 7, 8];
  assert.ok(!visibleTables(data.chapters, s).has("train_ticket"));
  s.part2 = true;
  assert.ok(visibleTables(data.chapters, s).has("train_ticket"));
});

test("the schema legend lists only what the visible schema shows", () => {
  const sorted = v => [...legendEntries(v)].sort();
  assert.deepEqual(sorted({ fk: false, cards: [] }), ["pk"]);   // chapter 1: two tables, no link
  assert.deepEqual(sorted({ fk: true, cards: [["1", "N"]] }), ["fk", "many", "pk"]);
  assert.deepEqual(sorted({ fk: true, cards: [["1", "1"]] }), ["fk", "one", "pk"]);
  assert.deepEqual(sorted({ fk: true, cards: [["N", "1"], ["1", "1"]] }), ["fk", "many", "one", "pk"]);
});

const base = () => ({ event: "query", sql: "", rows: 0, error: false, chapter: 1, state: freshState(),
                      cols: 0, allTables: ["person", "cab_ride", "police_report", "lift_log"], revealed: new Set(["police_report"]), norm: "", text: "", lines: 1, hour: 12, elapsed: 600000 });

test("badges fire on the right query shapes and only once", () => {
  const q = (s, cols = 7) => ({ ...base(), sql: s, rows: 3, cols });
  const names = ctx => detectBadges(ctx, []).map(b => b.name);
  assert.deepEqual(names(q("SELECT * FROM person")), ["Tourist", "Trespasser"]);
  assert.ok(names(q("SELECT * FROM police_report", 6)).length === 0, "six columns is not a tour");
  assert.ok(!names(q("SELECT id, suite, floor, price, checkin, checkout, guest_name FROM person")).includes("Tourist"), "naming them is the cure");
  assert.ok(names(q("SELECT a.id FROM a JOIN b ON a.x = b.y")).includes("First JOIN"));
  assert.ok(names(q("SELECT 1 FROM a JOIN b ON 1 JOIN c ON 1")).includes("Three's a Crowd"));
  assert.ok(names(q("SELECT x FROM t GROUP BY x HAVING COUNT(*) > 1")).includes("Early HAVING"));
  assert.ok(names(q("SELECT RANK() OVER (ORDER BY x) FROM t")).includes("Window Shopper"));
  assert.ok(names(q("SELECT * FROM sqlite_master")).includes("Archivist"));
  assert.ok(!names(q("SELECT * FROM sqlite_master")).includes("Trespasser"));
  assert.ok(!names(q("WITH ev AS (SELECT 1 AS x) SELECT x FROM ev")).includes("Trespasser"), "a CTE name is not a table");
  assert.ok(names(q("SELECT * FROM lift_log")).includes("Trespasser"));
  assert.ok(names({ ...base(), sql: "x", rows: 1 }).includes("Needle"));
  assert.ok(names({ ...base(), sql: "x", rows: 500 }).includes("Haystack"));
  assert.ok(names({ ...base(), event: "answer", norm: "paul sernine" }).includes("Anagram"));
  const one = { ...freshState(), queries: { 1: 1 } };
  assert.ok(names({ ...base(), event: "solve", lines: 2, state: one, chapter: 1 }).includes("Haiku"));
  assert.ok(!names({ ...base(), event: "solve", lines: 2 }).includes("Haiku"), "a guess is not a haiku");
  assert.ok(!names({ ...base(), event: "solve", elapsed: 1000 }).includes("Speed Reader"), "a fast guess is not reading");
  assert.deepEqual(detectBadges(q("SELECT * FROM person"), ["Tourist", "Trespasser"]), []);
  assert.equal(BADGES.length, 38);
  assert.deepEqual(names({ event: "theme" }), ["Lamplighter"]);
});

test("rank thresholds", () => {
  assert.equal(rank(21), "Ganimard himself", "the shortest path of solution.sql, chapters 1-8");
  assert.equal(rank(30), "Ganimard himself");
  assert.equal(rank(31), "Chief Inspector");
  assert.equal(rank(80), "Chief Inspector");
  assert.equal(rank(81), "Inspector");
  assert.equal(rank(130), "Inspector");
  assert.equal(rank(131), "Constable");
  const s = freshState(); s.queries = { 1: 5, 2: 7, 9: 100 };
  assert.deepEqual(partStats(s, 1, 8), { queries: 12 });
});

test("compete mode runs Part I only and never asks for the Part II code", () => {
  const s = { ...freshState(), mode: "compete", season: 7, team: "Alpha" };
  assert.equal(currentChapter(s, data.chapters).n, 1);
  assert.ok(!competeDone(s));
  s.solved = [1, 2, 3, 4, 5, 6, 7, 8];
  assert.equal(currentChapter(s, data.chapters).n, 8);
  assert.ok(part1Done(s) && competeDone(s) && !awaitingCode(s));
  const learn = { ...freshState(), solved: [1, 2, 3, 4, 5, 6, 7, 8] };
  assert.ok(awaitingCode(learn) && !competeDone(learn));
  assert.equal(storageKey("compete"), "ritz.compete");
  assert.equal(storageKey("learn"), "ritz.learn");
  assert.notEqual(storageKey("compete"), storageKey("learn"));
});

test("compete events carry the Part I totals the leaderboard scores", () => {
  const s = { ...freshState(), mode: "compete", season: "s7", team: "Alpha", solved: [1, 2, 3], startedAt: 400,
              queries: { 1: 4, 2: 6, 3: 5, 9: 100 }, wrong: { 1: 2, 3: 1, 11: 9 } };
  assert.deepEqual(competeStats(s), { queries: 15, wrong: 3 });
  assert.deepEqual(eventPayload(s, "progress", 3, 1000),
    { event: "progress", team: "Alpha", season: "s7", chapter: 3, wrong: 3, queries: 15, clientAt: 1000, elapsedMs: 600 });
  const f = { ...s, solved: [1, 2, 3, 4, 5, 6, 7, 8], startedAt: 5000, finishedAt: 65000 };
  assert.equal(eventPayload(f, "finish", 8, 70000).elapsedMs, 60000, "the finish carries the browser's own elapsed time");
  assert.equal(eventPayload(s, "progress", 0).chapter, 3, "chapter defaults to the number solved");
  assert.equal(fmtTime(0), "00:00");
  assert.equal(fmtTime(4000), "00:04");
  assert.equal(fmtTime(124000), "02:04");
  assert.equal(fmtTime(3600000), "60:00");
  assert.equal(fmtTime(-500), "00:00");
});

test("pseudos fold to one key per player, whatever the case or width", () => {
  assert.equal(teamKey(" Alice "), "alice");
  assert.equal(teamKey("\uFF21lice"), "alice", "look-alikes fold to the same key");
  assert.equal(PENALTY.wrong, 10, "the default until a season record sets it");
});

test("shared.js is what app.js re-exports", () => {
  assert.equal(normalise, shared.normalise);
  assert.equal(sha256, shared.sha256);
  assert.equal(teamKey, shared.teamKey);
  assert.match(shared.ADMIN_PASS_SHA256, /^[0-9a-f]{64}$/);
});

// A season's rows as doGet ?season=<id> returns them; progress/finish carry Part I running totals.
const T0 = 1_000_000;
const row = (event, team, chapter, min, wrong = 0, queries = 0, elapsedMs = null) =>
  ({ timestamp: T0 + min * 60000, event, team, season: "s1", chapter, hints: 0, wrong, queries, clientAt: null, elapsedMs });
const fixture = () => {
  const r = [row("join", "Alice", "", -5), row("join", "bob", "", -4), row("join", "Carol", "", -3), row("join", "Dan", "", 2)];
  for (let n = 1; n <= 7; n++) r.push(row("progress", n === 3 ? "ALICE" : "Alice", n, n * 2, n === 2 ? 1 : 0, n * 3));
  r.push(row("finish", "Alice", 8, 20, 1, 30, 20 * 60000 + 5000));          // 20:00 + 1 wrong x 30 s, clocks agree
  for (let n = 1; n <= 7; n++) r.push(row("progress", "bob", n, n * 2 + 1, 0, n * 2));
  r.push(row("finish", "bob", 8, 19, 0, 20, 17 * 60000));                    // 19:00, browser says 17:00: flagged
  r.push(row("progress", "Carol", 1, 4, 3, 10), row("progress", "Carol", 2, 9, 3, 16));
  return r;
};

test("officialTime ranks finishers by server time plus penalty, then the others by progress", () => {
  const out = shared.officialTime(fixture(), { openedAt: T0, penalty: 30 });
  assert.deepEqual(out.map(p => [p.rank, p.team, p.finished, p.solved, p.chapter]),
    [[1, "bob", true, 8, 8], [2, "Alice", true, 8, 8], [3, "Carol", false, 2, 3], [4, "Dan", false, 0, 1]]);
  assert.equal(out[0].ms, 19 * 60000);
  assert.equal(out[1].ms, 20 * 60000 + 30000, "one wrong answer at 30 s");
  assert.deepEqual(out.map(p => p.flagged), [true, false, false, false]);
  assert.equal(out[2].queries, 16);
  const harsh = shared.officialTime(fixture(), { openedAt: T0, penalty: 0 });
  assert.equal(harsh[1].ms, 20 * 60000, "no penalty, the server interval alone");
  assert.deepEqual(shared.officialTime([], { openedAt: T0, penalty: 10 }), []);
});

test("officialTime and chapterSummary: a negative interval (an old Date row) is flagged, elapsedMs stands in", () => {
  const rows = [row("join", "Gus", "", -500), row("progress", "Gus", 1, -480, 0, 3, 120000), row("finish", "Gus", 8, -400, 1, 9, 600000)];
  const [g] = shared.officialTime(rows, { openedAt: T0, penalty: 30 });
  assert.equal(g.ms, 600000 + 30000, "elapsedMs plus the penalty, never a negative time");
  assert.equal(g.flagged, true);
  const s = shared.chapterSummary(rows, { openedAt: T0 });
  assert.deepEqual([s[0].solvers, s[0].minutes, s[7].minutes], [1, 2, 10]);
  const [h] = shared.officialTime([row("finish", "Hal", 8, -400, 0, 9, null)], { openedAt: T0 });
  assert.ok(h.flagged, "no elapsedMs: still flagged");
});

test("clockMs runs, then freezes at the finish or when the session closed", () => {
  const s = { ...freshState(), startedAt: 1000 };
  assert.equal(clockMs(s, 61000), 60000, "running");
  assert.equal(clockMs({ ...s, stoppedAt: 31000 }, 99000), 30000, "frozen when the session closed");
  assert.equal(clockMs({ ...s, finishedAt: 21000, stoppedAt: 31000 }, 99000), 20000, "a finish wins");
});
test("watchOn: the close poll runs in an open compete game until the finish or the close", () => {
  const s = { ...freshState(), mode: "compete" };
  assert.equal(watchOn(s, "b"), true, "open, not finished: poll");
  assert.equal(watchOn({ ...s, finishedAt: 5 }, "b"), false, "finished: stop");
  assert.equal(watchOn({ ...s, over: true }, "b"), false, "closed: stop");
  assert.equal(watchOn(s, ""), false, "no board: never");
  assert.equal(watchOn({ ...s, mode: "learn" }, "b"), false, "learn mode: never");
});
test("clockStart cancels the browser clock's offset with the server's now", () => {
  const meta = { openedAt: 1_000_000, now: 1_600_000 };          // the server says: opened 10 minutes ago
  assert.equal(clockStart(meta, 1_600_000), 1_000_000, "clocks agree");
  assert.equal(clockStart(meta, 1_900_000), 1_300_000, "a browser 5 minutes fast still reads 10 minutes elapsed");
  assert.equal(1_900_000 - clockStart(meta, 1_900_000), 600_000);
  assert.equal(clockStart({ openedAt: 1_000_000 }, 5), 1_000_000, "no now (an older backend): openedAt as is");
});

test("officialTime: unfinished players tie on the row that solved their highest chapter, retries harmless", () => {
  // Carol and Dan both solved chapter 2; Carol first. Carol then sends a late duplicate of chapter 1 (a retry).
  const rows = [row("join", "Carol", "", -3), row("join", "Dan", "", -2),
    row("progress", "Carol", 1, 1), row("progress", "Dan", 1, 2), row("progress", "Carol", 2, 3), row("progress", "Dan", 2, 4),
    row("progress", "Carol", 1, 9)];
  assert.deepEqual(shared.officialTime(rows, { openedAt: T0 }).map(p => p.team), ["Carol", "Dan"]);
  // Nobody solved anything: the join row decides.
  assert.deepEqual(shared.officialTime([row("join", "Eve", "", 1), row("join", "Fay", "", 0)], { openedAt: T0 }).map(p => p.team), ["Fay", "Eve"]);
});

test("chapterSummary: solvers and medians per chapter, per-chapter queries and wrong from running totals", () => {
  const s = shared.chapterSummary(fixture(), { openedAt: T0, penalty: 30 });
  assert.equal(s.length, 8);
  assert.deepEqual(s[0], { chapter: 1, solvers: 3, minutes: 3, queries: 3, wrong: 0 });   // 2/3/4 min; 3/2/10 q; 0/0/3 wrong
  assert.deepEqual(s[1], { chapter: 2, solvers: 3, minutes: 5, queries: 3, wrong: 0 });   // 4/5/9; 3/2/6; 1/0/0
  assert.deepEqual(s[7], { chapter: 8, solvers: 2, minutes: 19.5, queries: 7.5, wrong: 0.5 });   // 9 and 6 queries
  assert.deepEqual(shared.chapterSummary([], { openedAt: T0 })[3], { chapter: 4, solvers: 0, minutes: null, queries: null, wrong: null });
});

test("built season files carry an answer hash list per chapter and the normaliser fixture", { skip: !fs.existsSync("site/season-1.json") }, () => {
  const season = JSON.parse(fs.readFileSync("site/season-1.json", "utf8"));
  assert.equal(season.chapters.length, 8);
  for (const ch of season.chapters) assert.ok(ch.answer_sha256.length >= 1 && ch.answer_sha256.every(h => /^[0-9a-f]{64}$/.test(h)), "chapter " + ch.n);
  assert.deepEqual(season.normalise_fixture, data.normalise_fixture);
  assert.equal(season.hashes_sha256, undefined);
});

test("penalty durations read naturally in the compete note", () => {
  assert.equal(duration(120), "2 minutes");
  assert.equal(duration(60), "1 minute");
  assert.equal(duration(10), "10 seconds");
  assert.equal(duration(0), "0 seconds");
});

test("terminal colouring: keywords, functions, names, strings, numbers, comments", () => {
  const h = highlightSql("SELECT count(*), name FROM person -- WHERE id = 1\nWHERE city = 'Paris' AND n > 42 /* x */");
  assert.match(h, /<span class="sql-kw">SELECT<\/span>/);
  assert.match(h, /<span class="sql-fn">count<\/span>/);
  assert.match(h, /<span class="sql-id">name<\/span>/);
  assert.match(h, /<span class="sql-com">-- WHERE id = 1<\/span>/, "a commented-out clause is one comment span");
  assert.match(h, /<span class="sql-str">'Paris'<\/span>/);
  assert.match(h, /<span class="sql-num">42<\/span>/);
  assert.match(h, /<span class="sql-com">\/\* x \*\/<\/span>/);
  assert.equal(highlightSql("a < b & c").replace(/<[^>]+>/g, ""), "a &lt; b &amp; c\n", "escaped, and nothing but the source text");
  assert.match(highlightSql("/* open"), /sql-com">\/\* open</, "an unclosed comment still colours to the end");
});

test("review badges: SQL skills, easter eggs, behaviour", () => {
  const q = (s, extra = {}) => detectBadges({ ...base(), sql: s, rows: 3, ...extra }, []).map(b => b.name);
  assert.ok(q("SELECT DISTINCT place FROM police_report").includes("Bouncer"));
  assert.ok(q("SELECT * FROM t WHERE id IN (SELECT id FROM u)").includes("Subpoena"));
  assert.ok(q("SELECT * FROM t WHERE x IS NULL").includes("Null and Void"));
  assert.ok(!q("SELECT * FROM t WHERE x IS NOT NULL").includes("Null and Void"));
  assert.ok(q("SELECT * FROM t WHERE name LIKE 'Dur%'").includes("Wildcard"));
  assert.ok(!q("SELECT * FROM t WHERE name LIKE 'Duroc'").includes("Wildcard"));
  assert.ok(q("SELECT 1 -- note").includes("Commentator"));
  assert.ok(q("SELECT * FROM t ORDER BY fare DESC LIMIT 1").includes("Top of the Class"));
  assert.ok(q("SELECT 1 WHERE 0", { rows: 0 }).includes("Ghost Hunter"));
  assert.ok(!q("SELEC", { rows: -1, error: true }).includes("Ghost Hunter"), "an error is not an empty result");
  assert.ok(q("SELECT *", { text: "monsieur proust reports a madeleine missing from his tea" }).includes("Madeleine"));
  assert.ok(!q("SELECT *", { text: "madeleine dupont" }).includes("Madeleine"), "the first name is not the pastry");
  assert.ok(q("SELECT *", { text: "asked the doorman for rosebud" }).includes("Rosebud"));
  assert.ok(q("SELECT * FROM police_report WHERE date > 20000101").includes("Time Traveller"));
  assert.ok(!q("SELECT * FROM police_report WHERE date = 19120518").includes("Time Traveller"));
  const films = seenFilms("i see dead people. houston? there is no spoon", ["rosebud"]);
  assert.equal(films.length, 4);
  assert.deepEqual(seenFilms("houston", films), films, "a film counts once");
  const row = ["A man in a cape asked the doorman for Rosebud"];
  assert.match(eggText({ values: [row] }), /rosebud/);
  assert.equal(eggText({ values: Array(EGG_ROWS + 1).fill(row) }), "", "a SELECT * over the archive finds no egg");
  assert.equal(eggText(null), "");
  const s = freshState(); s.film = FILM_LINES.slice(0, 5);
  assert.ok(detectBadges({ ...base(), state: s }, []).map(b => b.name).includes("Film Buff"));
  const ev = (event, extra = {}) => detectBadges({ ...base(), event, ...extra }, []).map(b => b.name);
  assert.deepEqual(ev("suspects"), ["Paparazzo"]);
  const quick = { ...freshState(), queries: { 1: 2 } };
  assert.ok(ev("solve", { elapsed: 90000, state: quick }).includes("Speed Reader"));
  assert.ok(!ev("solve", { elapsed: 200000, state: quick }).includes("Speed Reader"));
  assert.ok(ev("answer", { norm: "4100", decoy: 4100 }).includes("Filed Under the 17th"));
  assert.ok(!ev("answer", { norm: "4100", decoy: undefined }).includes("Filed Under the 17th"));
  assert.ok(!ev("answer", { norm: "4100", decoy: 4100, chapter: 2 }).includes("Filed Under the 17th"));
});

test("story markup: bold and italic only, everything else escaped", () => {
  assert.equal(richText("**Ganimard** has *a cat*."), "<b>Ganimard</b> has <i>a cat</i>.");
  assert.equal(richText("*'sends regards'*"), "<i>'sends regards'</i>");
  assert.equal(richText("<script>x</script> **<b>**"), "&lt;script&gt;x&lt;/script&gt; <b>&lt;b&gt;</b>");
  assert.equal(richText("One.\n\nTwo *b*."), "<p>One.</p><p>Two <i>b</i>.</p>", "a blank line starts a paragraph");
  assert.equal(richText("Boxes:\n\n| Box | From |\n| Night | 00:00 |"),
    "<p>Boxes:</p><table><thead><tr><th>Box</th><th>From</th></tr></thead><tbody><tr><td>Night</td><td>00:00</td></tr></tbody></table>");
  assert.ok(!richText("| <i> | x |").includes("<i>"), "table cells are escaped too");
  for (const c of data.chapters) assert.ok(!/\*/.test(richText(c.story).replace(/<\/?[bi]>/g, "")), "unbalanced markup in chapter " + c.n);
  for (const e of Object.values(data.endings)) assert.ok(!/\*/.test(richText(e)), "unbalanced markup in an ending");
  if (fs.existsSync("site/season-1.json"))   // compete has its own Part I stories (story_compete), same markup rules
    for (const c of JSON.parse(fs.readFileSync("site/season-1.json", "utf8")).chapters)
      assert.ok(!/\*/.test(richText(c.story).replace(/<\/?[bi]>/g, "")), "unbalanced markup in compete chapter " + c.n);
});

test("suggestSql: contexts, the player's case, no values", () => {
  const T = { police_report: ["id", "date", "type"], hotel_register: ["guest", "suite"] };
  const at = (q, t = T) => { const r = suggestSql(q, q.length, t); return r ? r.items.map(i => i.text) : []; };
  assert.deepEqual(at("SELECT * FROM po"), ["police_report"]);
  assert.deepEqual(at("select * from police_report JOIN h"), ["hotel_register"]);
  assert.deepEqual(at("SELECT pr. FROM police_report pr"), []);   // caret at the end, not after pr.
  const q = "SELECT pr. FROM police_report AS pr", r = suggestSql(q, 10, T);
  assert.deepEqual(r.items.map(i => i.text), ["id", "date", "type"]);
  assert.equal(r.start, 10);
  assert.deepEqual(at("SELECT hotel_register.s"), ["suite"]);
  assert.equal(at("SELECT * FROM police_report WHERE d")[0], "date");   // columns of the query's tables first
  assert.deepEqual(at("sel"), ["select"]);
  assert.deepEqual(at("SEL"), ["SELECT"]);
  assert.ok(at("SELECT co").includes("count()"));
  assert.ok(at("SELECT CO").includes("COUNT()"));
  assert.equal(suggestSql("SELECT co", 9, T).items.find(i => i.kind === "function").insert, "count(");
  assert.deepEqual(at("SELECT * FROM police_report WHERE type = 'bu"), []);   // never inside a string
  assert.deepEqual(at("-- se"), []);
  assert.deepEqual(at("SELECT 12"), []);
  assert.equal(suggestSql("SELECT dat", 9, T), null);   // mid-word
  assert.deepEqual(at("SELECT select"), []);           // a complete word is not offered again
  assert.ok(at("SELECT * FROM police_report WHERE ").length === 0);
  for (const p of ["a", "s", "c", "d", "l", "o", "r", "t", "u"]) assert.ok(at("SELECT " + p).length <= SUGGEST_MAX);
});

test("suggestSql offers only the revealed tables, and only functions the strict terminal runs", () => {
  const sch = {};
  for (const t of Object.keys(data.chapters.flatMap(c => c.tables).reduce((o, t) => (o[t] = 1, o), {}))) sch[t] = ["x"];
  for (const ch of data.chapters) {
    const vis = visibleTables(data.chapters, { solved: data.chapters.filter(c => c.n < ch.n).map(c => c.n), part2: ch.n > 8 });
    const T = Object.fromEntries([...vis].map(t => [t, ["x"]]));
    for (const c of "abcdefghijklmnopqrstuvwxyz_") {
      for (const it of (suggestSql("SELECT * FROM " + c, 15, T) || { items: [] }).items) assert.ok(vis.has(it.text), it.text + " in chapter " + ch.n);
      for (const it of (suggestSql("SELECT " + c, 8, T) || { items: [] }).items) if (it.kind === "table") assert.ok(vis.has(it.text));
    }
  }
  const s = { t: [["a", "TEXT", 0], ["n", "INTEGER", 0]] };
  for (const f of SUGGEST_FUNCS) {
    assert.ok(!Object.hasOwn(SQLITE_FUNCS, f), f);
    const ok = arg => { const r = strictCheck("SELECT " + f + "(" + arg + ") FROM t", s); return !r || !/does not exist/.test(r.error); };
    assert.ok(ok("a") || ok("n"), f);
  }
  for (const f of ["ifnull", "iif", "strftime", "group_concat", "instr", "printf"]) assert.ok(!SUGGEST_FUNCS.includes(f) && !SUGGEST_KEYWORDS.includes(f.toUpperCase()));
});

test("formatSql changes only whitespace and keyword case, and is stable", () => {
  const squash = q => q.replace(/\s+/g, "").toLowerCase();
  // solution.sql is formatted by generate_db.format_sql, the Python port: the JS formatter must leave it as it is.
  const queries = fs.readFileSync(new URL("./solution.sql", import.meta.url), "utf8").split(/;\n/)
    .map(q => q.split("\n").filter(l => !l.startsWith("--")).join("\n").trim()).filter(Boolean).map(q => q + ";");
  assert.ok(queries.length > 20);
  for (const q of queries) {
    const one = q.replace(/\s+/g, " ");
    assert.equal(squash(formatSql(one)), squash(one), q);
    assert.equal(formatSql(one), q, "the Python and JS formatters agree: " + q);
    assert.equal(formatSql(q), q, "formatting twice changes nothing: " + q);
  }
  const f = formatSql("select name from person where name = 'Paul from Where' and born between 1850 and 1890 -- and so on\n or id = 1");
  assert.match(f, /'Paul from Where'/, "strings keep their case and words");
  assert.match(f, /BETWEEN 1850 AND 1890/, "BETWEEN's AND stays on its line");
  assert.match(f, /-- and so on\n  OR id = 1$/, "a line comment still ends its line");
  assert.equal(formatSql("select rank() over (partition by suite order by time) from t"),
    "SELECT RANK() OVER (PARTITION BY suite ORDER BY time)\nFROM t", "OVER (...) stays on one line");
});

test("suspects appear when met, and their notes when their chapter is reached", () => {
  const cast = data.cast, st = freshState();
  assert.deepEqual(metSuspects(cast, st, data.chapters), [], "chapter 1: nobody yet");
  st.solved = [1, 2]; st.suspects = [];
  assert.deepEqual(metSuspects(cast, st, data.chapters).map(s => s.name), ["Lord Ashcombe"], "chapter 3 names His Lordship");
  const ash = metSuspects(cast, st, data.chapters)[0];
  assert.equal(ash.notes.length, 1, "only the notes of chapters reached");
  const res = { values: [["Raul Ortega", 218], ["Paul Sernine", 202]] };
  assert.deepEqual(foundSuspects(cast, res, []), ["Paul Sernine", "Raul Ortega"], "a result shows them: met");
  assert.deepEqual(foundSuspects(cast, res, ["Raul Ortega"]), ["Paul Sernine"]);
  const far = { values: Array(ROW_CAP).fill(["nobody"]).concat([["Horace Velmont"]]) };
  assert.deepEqual(foundSuspects(cast, far, []), [], "a row past the screen is not seen");
  st.suspects = ["Paul Sernine"];
  assert.ok(metSuspects(cast, st, data.chapters).some(s => s.name === "Paul Sernine" && s.notes.length === 0));
  st.solved = [1, 2, 3, 4, 5, 6, 7, 8]; st.part2 = true; st.solved.push(9, 10, 11);
  assert.equal(metSuspects(cast, st, data.chapters).length, 6, "chapter 12: all six met");
});

// The board's suspects strip crosses a suspect out once plot.CAST `cleared` is solved. Shortcut check: walking
// I-XII, a crossing never names an upcoming answer (a cast person) by elimination, and before VIII (the culprit)
// is solved no crossing ever leaves a single face standing, even with every suspect met early through a result.
test("the suspects strip never narrows the field to an upcoming answer", async () => {
  const cast = data.cast, names = cast.map(s => s.name);
  const answerOf = {};
  for (const ch of data.chapters) for (const nm of names) {
    const n = normalise(nm);
    if (ch.answer_sha256.includes(await sha256(n)) || ch.answer_sha256.includes(await sha256(n.split(" ").pop()))) answerOf[ch.n] = nm;
  }
  assert.deepEqual(answerOf, { 2: "Lord Ashcombe", 8: "Rupert Blakeney" });
  assert.ok(!cast.find(s => s.name === "Rupert Blakeney").cleared, "the culprit is never cleared");
  for (const s of cast) if (s.cleared) assert.ok(s.cleared >= s.meet && s.cleared <= 12, s.name);
  for (let k = 0; k <= 11; k++) for (const found of [[], names]) {
    const st = { ...freshState(), solved: [...Array(k).keys()].map(i => i + 1), part2: k >= 8, suspects: found, introduced: names };
    const strip = boardSuspects(cast, st, data.chapters), up = strip.filter(s => !s.cleared).map(s => s.name);
    const crossed = strip.length > up.length;
    if (k < 8 && crossed) assert.ok(up.length >= 2, "solved " + k + ": one face left standing");
    for (const [u, p] of Object.entries(answerOf)) if (Number(u) > k) {
      assert.ok(!strip.some(s => s.name === p && s.cleared), "solved " + k + ": " + p + " crossed out before chapter " + u);
      assert.ok(!(crossed && up.length === 1 && up[0] === p), "solved " + k + ": the strip names chapter " + u + "'s answer");
    }
  }
  const st = { ...freshState(), solved: [1, 2, 3, 4, 5, 6, 7, 8], part2: true, introduced: names };
  assert.deepEqual(boardSuspects(cast, st, data.chapters).filter(s => s.cleared).map(s => s.name), ["Lord Ashcombe", "Raul Ortega"]);
  assert.deepEqual(boardSuspects(cast, { ...st, introduced: [] }, data.chapters), [], "a face the pop-up has not shown stays off the strip");
});

test("route and winning query: what the clerk's own runs showed", async () => {
  const hashes = [await sha256("ashcombe")];
  let run = await scanRun(undefined, "SELECT 1", { values: [["nobody"]] }, hashes);
  assert.deepEqual(run, { last: "SELECT 1" });
  assert.equal(solveRoute(run), "unseen"); assert.equal(solveRoute(undefined), "unseen");
  assert.equal(winningQuery(run), "SELECT 1", "no result showed it: the last run before the answer");
  run = await scanRun(run, "FROM q2", { values: [["Lord Ashcombe", 212], ["Ortega", 218]] }, hashes);
  assert.equal(solveRoute(run), "found"); assert.equal(run.hit, "FROM q2");
  run = await scanRun(run, "FROM q3", null, hashes);
  assert.equal(winningQuery(run), "FROM q2", "the last query that showed the answer");
  run = await scanRun(run, "FROM q4", { values: [[212, "Lord", "Ashcombe"]] }, hashes);
  assert.equal(solveRoute(run), "same_result", "one row holding the answer: the solution's result, extra columns allowed");
  run = await scanRun(run, "FROM q5", { values: [["Ashcombe"], ["x"]] }, hashes);
  assert.equal(solveRoute(run), "same_result", "once seen, kept");
  const far = { values: Array(ROW_CAP).fill(["x"]).concat([["Ashcombe"]]) };
  assert.equal(solveRoute(await scanRun(undefined, "FROM q", far, hashes)), "unseen", "a row past the screen is not seen");
  assert.equal(solveRoute(await scanRun(undefined, "SELECT 'Ashcombe'", { values: [["Ashcombe"]] }, hashes)), "unseen", "a typed constant is no find");
  assert.equal(crackedHtml(""), "");
  assert.match(crackedHtml("SELECT '<b>'"), /&lt;b&gt;/);
});

test("case-board cards: a portrait for a cast person, the chapter's icon otherwise", () => {
  assert.deepEqual(cardPicture(2, "Lord Ashcombe"), { src: "portraits/ashcombe.jpg", face: true });
  assert.deepEqual(cardPicture(8, "blakeney"), { src: "portraits/blakeney.jpg", face: true });
  assert.deepEqual(cardPicture(12, "Cagliostro"), { src: "portraits/comtesse.jpg", face: true });
  assert.deepEqual(cardPicture(3, "75-2041"), { src: "icons/ch03.png", face: false });
  assert.deepEqual(cardPicture(5, undefined), { src: "icons/ch05.png", face: false }, "an old save without the answer");
  for (let n = 1; n <= 12; n++) assert.ok(fs.existsSync("site/" + cardPicture(n, "").src));
});


test("consent defaults: Europe denied; elsewhere analytics, and ads once they run", () => {
  assert.equal(CONSENT_REGIONS.length, 32);   // 27 EU + IS, LI, NO + GB, CH
  const ads = ["ad_storage", "ad_user_data", "ad_personalization"];
  for (const on of [false, true]) {
    const [eu, rest] = consentDefaults(on);
    assert.ok(["FR", "DE", "IE", "NO", "IS", "LI", "GB", "CH"].every(r => eu.region.includes(r)));
    assert.ok(!eu.region.includes("US") && !("region" in rest));
    for (const k of [...ads, "analytics_storage"]) assert.equal(eu[k], "denied");
    assert.equal(rest.analytics_storage, "granted");
    for (const k of ads) assert.equal(rest[k], on ? "granted" : "denied");
    assert.equal(eu.wait_for_update, on ? 500 : undefined);   // Google's message is async; the banner's Yes is not awaited
  }
});

test("track sends nothing after a No or without gtag", () => {
  assert.equal(track("chapter_open", { chapter: 1, mode: "learn" }), false);   // node: no window
  const calls = [], store = {};
  globalThis.window = { gtag: (...a) => calls.push(a) };
  const ls = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: k => store[k] ?? null } });
  try {
    assert.equal(track("badge", { name: "x" }), true);   // not answered: Consent Mode's defaults decide
    store["ritz.consent"] = "no";
    assert.equal(track("badge", { name: "x" }), false);   // the banner governs until Google's message is live
    store["ritz.consent"] = "yes";
    assert.equal(track("badge", { name: "x" }), true);
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[0], ["event", "badge", { name: "x" }]);
    delete window.gtag;
    assert.equal(track("badge", { name: "x" }), false);   // consent but gtag.js never set up
  } finally {
    delete globalThis.window;
    if (ls) Object.defineProperty(globalThis, "localStorage", ls); else delete globalThis.localStorage;
  }
});

test("ads on: Google's message governs only once its CMP is live, else the banner asks", () => {
  // The 2026-10-19 state before AdSense approval: __tcfapi answers, but nothing is loaded.
  assert.equal(cmpLive(null), false);
  assert.equal(cmpLive({ cmpStatus: null, gdprApplies: null }), false);
  assert.equal(cmpLive({ cmpStatus: "stub", gdprApplies: undefined }), false);
  assert.equal(cmpLive({ cmpStatus: "loaded", gdprApplies: true }), false);   // loaded but silent: the live site before approval
  assert.equal(cmpLive({ cmpStatus: "loaded", gdprApplies: false }), true);   // outside the GDPR: Google decides not to ask
  for (const e of ["cmpuishown", "tcloaded", "useractioncomplete"]) assert.equal(cmpLive({ eventStatus: e }), true, e);
  assert.equal(consentPath({}), "wait");
  assert.equal(consentPath({ waited: true }), "own");     // CMP_WAIT_MS passed after the ads script loaded
  assert.equal(consentPath({ failed: true }), "own");     // ads script blocked: no wait
  assert.equal(consentPath({ live: true, waited: true }), "google");
  assert.equal(CMP_WAIT_MS, 3000);
  assert.equal(googleStats({ modeStatus: 1 }), "granted");
  assert.equal(googleStats({ modeStatus: 2 }), "denied");
  assert.equal(googleStats({ modeStatus: 0 }), "unknown");
  assert.equal(googleStats({ tc: { gdprApplies: true, eventStatus: "cmpuishown" } }), "unknown");   // not answered yet
  assert.equal(googleStats({ tc: { gdprApplies: true, eventStatus: "useractioncomplete", purpose: { consents: { 1: true } } } }), "granted");
  assert.equal(googleStats({ tc: { gdprApplies: true, eventStatus: "tcloaded", purpose: { consents: {} } } }), "denied");
  assert.equal(googleStats({ tc: { gdprApplies: false, eventStatus: "tcloaded" } }), "unknown");
});

test("GA_ID is empty or a GA4 measurement ID", () => {
  assert.match(GA_ID, /^(G-[A-Z0-9]+)?$/);
});

test("ad slot: one responsive AdSense unit once AD_SLOT is filled", () => {
  assert.match(ADS_CLIENT, /^ca-pub-\d{16}$/);
  assert.match(AD_SLOT, /^(\d+)?$/);
  assert.equal(ADS_ON, AD_SLOT !== "");   // pasting the slot id is the whole switch-on
  const html = adSlotHtml("ca-pub-9765732642926043", "1234567890");
  assert.match(html, /^<ins class="adsbygoogle" style="display:block" /);
  assert.match(html, /data-ad-client="ca-pub-9765732642926043"/);
  assert.match(html, /data-ad-slot="1234567890"/);
  assert.match(html, /data-ad-format="auto" data-full-width-responsive="true"><\/ins>$/);
});

test("ad box: Google's ad only once filled, else the house ad comes back", () => {
  const at = (o) => adOutcome({ status: undefined, height: 0, elapsed: 0, failed: false, ...o });
  assert.equal(at({}), "wait");
  assert.equal(at({ status: "filled", height: 250 }), "ad");
  assert.equal(at({ status: "filled", height: 0 }), "wait");                     // filled but not laid out yet
  assert.equal(at({ status: "filled", height: 0, elapsed: AD_WAIT_MS }), "house");
  assert.equal(at({ status: "unfilled" }), "house");                             // Google had no ad (or no approval)
  assert.equal(at({ failed: true }), "house");                                   // script blocked or offline
  assert.equal(at({ failed: true, status: "filled", height: 250 }), "house");
  assert.equal(at({ elapsed: AD_WAIT_MS - 1 }), "wait");
  assert.equal(at({ elapsed: AD_WAIT_MS }), "house");                            // nothing came back in time
  assert.ok(AD_WAIT_MS >= 3000 && AD_WAIT_MS <= 6000);
});

test("a comma join with nothing to match is refused before it can hang the page", () => {
  assert.ok(cartesian("SELECT count(*) FROM bank_transaction, cab_ride"));
  assert.ok(cartesian("select * from a as x, b"));
  assert.ok(!cartesian("SELECT * FROM a, b WHERE a.id = b.a_id"));
  assert.ok(!cartesian("SELECT * FROM a JOIN b ON a.id = b.a_id"));
  assert.ok(!cartesian("SELECT * FROM a -- , b\nWHERE 1"), "a comment is not a join");
  assert.ok(!cartesian("SELECT 'a, b' FROM t"), "a string is not a join");
});

test("themeButtonHtml: a sun offers the day edition, a moon the night edition, pure ASCII", () => {
  const night = themeButtonHtml("night"), day = themeButtonHtml("day");
  assert.match(night, /class="icon sun"/); assert.match(night, />Day edition</); assert.doesNotMatch(night, /moon/);
  assert.match(day, /class="icon moon"/); assert.match(day, />Night edition</); assert.doesNotMatch(day, /sun/);
  for (const s of [night, day]) assert.match(s, /^[ -~]*$/);
});

test("erdButtonHtml: an enlarge icon, an X once the schema is large, named either way, pure ASCII", () => {
  const big = erdButtonHtml(true), small = erdButtonHtml(false);
  assert.equal(big.label, "Close the schema"); assert.match(big.html, /class="icon close"/); assert.doesNotMatch(big.html, /enlarge/);
  assert.equal(small.label, "Enlarge the schema"); assert.match(small.html, /class="icon enlarge"/); assert.doesNotMatch(small.html, /close/);
  for (const b of [big, small]) { assert.match(b.html + b.label, /^[ -~]*$/); assert.doesNotMatch(b.html, /btn-text/, "icon only"); }
});

test("mastheadChapterHtml: only the current chapter's numeral is bold", () => {
  assert.equal(mastheadChapterHtml(1, 8, false), "CHAPTER <b>I</b> OF VIII");
  assert.equal(mastheadChapterHtml(3, 8, true), "REVIEWING CHAPTER <b>III</b> OF VIII");
  assert.equal(mastheadChapterHtml(12, 12, false), "CHAPTER <b>XII</b> OF XII");
  for (const h of [mastheadChapterHtml(9, 12, true), mastheadChapterHtml(8, 8, false)]) assert.equal(h.match(/<b>/g).length, 1);
});

// The Clerk's Handbook (site/learn/): every page repeats its chrome by hand, so these pin it.
const LEARN = "site/learn/";
const learnPages = fs.readdirSync(LEARN).filter((f) => f.endsWith(".html")).sort();
const learnHtml = Object.fromEntries(learnPages.map((f) => [f, fs.readFileSync(LEARN + f, "utf8")]));
// the index lists its pages in three groups (chapters, exercises, grammar), in reading order
// Reading order (the pagers): the chapters list, then the exercises card, then grammar, whatever order the index shows its groups in.
const tocGroups = learnHtml["index.html"].match(/<div class="toc-groups">([\s\S]*?)<\/div><!-- \/toc-groups -->/)[1];
const tocLinks = (html) => [...html.matchAll(/<a (?:class="toc-card" )?href="([^"]+)"/g)].map((m) => m[1]);
const chapterLinks = tocLinks(tocGroups.match(/<ol class="toc">([\s\S]*?)<\/ol>/)[1]);
const readingOrder = ["index.html", ...chapterLinks, ...tocLinks(tocGroups).filter((h) => !chapterLinks.includes(h))];
const one = (html, re, what) => { const m = html.match(re); assert.ok(m, what); return m[1]; };
const unentity = (s) => s.replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

test("handbook: every page carries the same masthead nav, footer and chapter menu, only the current item differs", () => {
  assert.deepEqual([...readingOrder].sort(), learnPages, "the index's table of contents lists every page once");
  const nav = one(learnHtml["index.html"], /<nav class="learn-nav muted">([\s\S]*?)<\/nav>/, "index nav");
  const foot = one(learnHtml["index.html"], /<footer class="learn-foot muted">([\s\S]*?)<\/footer>/, "index footer");
  const links = (h) => [...h.matchAll(/<a href="([^"]+)"(?: title="[^"]*")?>([^<]*)<\/a>/g)].map((m) => m[2]);
  assert.deepEqual(links(nav), ["The Ritz Affair", "The Clerk's Handbook"], "the header: the game and the handbook only (owner, 2026-10-24)");
  assert.deepEqual(links(foot), ["Privacy notice", "The Clerk's Desk", "AlephB", "Contact"], "the footer: the rest, the desk included (Statistics has an id)");
  const admin = fs.readFileSync("site/admin.html", "utf8");
  assert.deepEqual(links(one(admin, /<nav class="learn-nav muted">([\s\S]*?)<\/nav>/, "admin nav")), links(nav), "the admin page's header");
  assert.deepEqual(links(one(admin, /<footer class="learn-foot muted">([\s\S]*?)<\/footer>/, "admin footer")), links(foot), "the admin page's footer");
  const desk = ["admin.html", "monitor.html", "monitor-game.html", "monitor-handbook.html", "explore.html"].map(f => [f, fs.readFileSync("site/" + f, "utf8")]);
  for (const [f, h] of desk.slice(1))
    for (const tag of [/<nav class="learn-nav muted">[\s\S]*?<\/nav>/, /<footer class="learn-foot muted">[\s\S]*?<\/footer>/, /<dialog id="passgate"[\s\S]*?<\/dialog>/])
      assert.equal(h.match(tag)[0], admin.match(tag)[0], f + " repeats the desk's " + tag.source.slice(1, 9));
  // The desk's own menu row: Setup, the three monitoring views and Pivot table, the same on the five pages but for the current marker.
  const deskMenu = (h, f) => one(h, /<\/header>\n<nav class="learn-menu">([\s\S]*?)<\/nav>/, f + " desk menu");
  const deskItems = ['<a id="setup-link" href="admin.html">Setup</a>', '<a id="monitor-link" href="monitor.html">Global</a>', '<a id="game-link" href="monitor-game.html">Game</a>',
    '<a id="handbook-link" href="monitor-handbook.html">Handbook</a>', '<a id="explore-link" href="explore.html">Pivot table</a>'];
  desk.forEach(([f, h], i) => {
    const want = deskItems.map((it, j) => (j === i ? '<span class="current" aria-current="page">' + it.match(/>([^<]*)</)[1] + "</span>" : it)).join(" &middot;\n  ");
    assert.equal(deskMenu(h, f), want, f + " menu: one current item, the others linked");
  });
  // each monitor page names its view for monitor.js; each carries the Count select beside the period buttons
  assert.deepEqual(desk.slice(1, 4).map(([, h]) => [h.match(/<body data-view="(\w+)">/)[1], /<span id="days"[^]*<label class="pick">Count <select id="count"><\/select><\/label>/.test(h)]), [["global", true], ["game", true], ["handbook", true]]);
  assert.equal((admin.match(/monitor-link/g) || []).length, 1, "the old SEASONS-row link is gone");
  const chapters = readingOrder.filter((f) => !["index.html", "exercises.html", "grammar.html"].includes(f));
  const linked = (f) => {
    const menu = one(learnHtml[f], /<nav class="learn-menu">([\s\S]*?)<\/nav>/, f + " menu");
    const cur = [...menu.matchAll(/<span class="current" aria-current="page">([^<]*)<\/span>/g)];
    assert.equal(cur.length, 1, f + ": one current item");
    assert.equal((menu.match(/class="current"/g) || []).length, chapters.includes(f) ? 2 : 1, f + ": Learning chapters is current on a learning page only");
    if (chapters.includes(f)) assert.ok(menu.includes(`<summary class="current">Learning chapters: ${cur[0][1]}</summary>`), f + " summary names the page");
    return menu.replace(cur[0][0], `<a href="${f}">${cur[0][1]}</a>`).replace(/<summary class="current">[^<]*<\/summary>/, "<summary>Learning chapters</summary>");
  };
  const ref = linked("index.html");
  assert.match(ref, /<details class="learn-chapters"><summary>Learning chapters<\/summary><ol>/, "a native disclosure, no script needed");
  const items = [...ref.matchAll(/<a href="([^"]+)">([^<]*)<\/a>/g)];
  assert.deepEqual(items.map((m) => m[1]), ["index.html", ...chapters, "exercises.html", "grammar.html"], "menu in table of contents order");
  assert.deepEqual(items.map((m) => m[2]).filter((t) => !/^\d/.test(t)), ["Index", "Exercises", "Grammar"]);
  items.slice(1, -2).forEach((m, i) => assert.ok(m[2].startsWith(`${i + 1}. `), "chapters numbered from 1: " + m[2]));
  // the game's consent banner and Statistics link, asked by handbook.js (one ritz.consent answer site-wide)
  assert.ok(foot.includes('<a href="../privacy.html">Privacy notice</a><span id="stats-link" hidden> &middot; <a href="#" id="btn-stats">Statistics</a></span>'), "the consent link in the footer");
  const banner = one(fs.readFileSync("site/index.html", "utf8"), /(<div id="consent"[\s\S]*?<\/div>)\n/, "the game's banner").replace('href="privacy.html"', 'href="../privacy.html"');
  for (const f of learnPages) {
    assert.ok(learnHtml[f].includes(banner + '\n<script type="module" src="handbook.js"></script>\n'), f + ": the game's banner, then handbook.js");
    if (f === "exercises.html") assert.ok(learnHtml[f].indexOf('src="handbook.js"') < learnHtml[f].indexOf('src="exercises.js"'), "consent set up before initAds");
    assert.equal(one(learnHtml[f], /<nav class="learn-nav muted">([\s\S]*?)<\/nav>/, f + " nav"), nav, f + " nav");
    assert.equal(one(learnHtml[f], /<footer class="learn-foot muted">([\s\S]*?)<\/footer>/, f + " footer"), foot, f + " footer");
    assert.equal(linked(f), ref, f + " menu (the current item must be the page itself)");
  }
});

test("landing and privacy: the handbook's header nav under the masthead, its footer in .landing-foot", () => {
  const page = fs.readFileSync("site/index.html", "utf8");
  const labels = (h) => [...h.matchAll(/<a href="[^"]+"(?: id="[^"]+")?>([^<]*)<\/a>/g)].map((m) => m[1]);
  const nav = labels(one(learnHtml["index.html"], /<nav class="learn-nav muted">([\s\S]*?)<\/nav>/, "index nav"));
  const foot = labels(one(learnHtml["index.html"], /<footer class="learn-foot muted">([\s\S]*?)<\/footer>/, "index footer"));
  assert.deepEqual(labels(one(page, /<nav class="landing-nav muted">([\s\S]*?)<\/nav>/, "landing nav")), nav);
  const landingFoot = one(page, /<p class="muted landing-foot">([\s\S]*?)<\/p>/, "landing footer");
  assert.match(landingFoot, /<span id="stats-link" hidden> &middot; <a href="#" id="btn-stats">Statistics<\/a><\/span>/, "the consent link app.js shows and relabels");
  assert.deepEqual(labels(landingFoot), foot, "the handbook's footer, Statistics included");
  // privacy.html runs no consent code: the same header, the footer without Statistics or a link to itself
  const privacy = fs.readFileSync("site/privacy.html", "utf8");
  assert.deepEqual(labels(one(privacy, /<nav class="landing-nav muted">([\s\S]*?)<\/nav>/, "privacy nav")), nav);
  assert.deepEqual(labels(one(privacy, /<p class="muted landing-foot">([\s\S]*?)<\/p>/, "privacy footer")), foot.filter((t) => t !== "Statistics" && t !== "Privacy notice"));
});

test("Day/Night button: the game's button on every handbook page, the desk and the board, theme.js draws the game's icons", () => {
  const game = fs.readFileSync("site/index.html", "utf8");
  const btn = one(game, /\n(<button id="btn-theme"[^\n]*<\/button>)\n/, "the game's button");
  assert.equal(btn, `<button id="btn-theme" class="quiet theme-corner" title="Night edition" aria-label="Night edition">${themeButtonHtml("day")}</button>`);
  const pages = { ...learnHtml, "../admin.html": fs.readFileSync("site/admin.html", "utf8"), "../leaderboard.html": fs.readFileSync("site/leaderboard.html", "utf8"), "../monitor.html": fs.readFileSync("site/monitor.html", "utf8"), "../monitor-game.html": fs.readFileSync("site/monitor-game.html", "utf8"), "../monitor-handbook.html": fs.readFileSync("site/monitor-handbook.html", "utf8"), "../explore.html": fs.readFileSync("site/explore.html", "utf8") };
  for (const [f, html] of Object.entries(pages)) {
    assert.ok(/<body( data-view="\w+")?>\n/.test(html) && html.includes(">\n" + btn + "\n"), f + ": the same button, first in the body");
    const head = html.slice(0, html.indexOf("</head>"));
    assert.ok(head.includes(f.startsWith("../") ? '<script src="learn/theme.js"></script>' : '<script src="theme.js"></script>'), f + ": theme.js in <head>, no defer (no flash)");
  }
  const js = fs.readFileSync("site/learn/theme.js", "utf8").replace(/' \+ A \+ '/g, one(themeButtonHtml("day"), /<svg class="icon moon" ([^>]*)>/, "attrs"));
  for (const mood of ["day", "night"]) assert.ok(js.includes(one(themeButtonHtml(mood), /^(<svg[\s\S]*<\/svg>)/, mood)), mood + " icon matches app.js");
  assert.match(js, /"ritz\.theme"/, "the game's key");
});

test("handbook: the previous/next pager follows the table of contents, links resolve, labels name the target's title", () => {
  readingOrder.forEach((f, i) => {
    const pager = one(learnHtml[f], /<nav class="learn-pager">([\s\S]*?)<\/nav>/, f + " pager");
    for (const [cls, want, word] of [["prev", readingOrder[i - 1], "Previous"], ["next", readingOrder[i + 1], "Next"]]) {
      const m = pager.match(new RegExp(`<a class="${cls}" href="([^"]+)">([^<]*)</a>`));
      if (!want) { assert.equal(m, null, `${f} has no ${cls}`); continue; }
      assert.ok(m, `${f} ${cls}`);
      assert.equal(m[1], want, `${f} ${cls} (so A's next is B exactly when B's previous is A)`);
      assert.ok(fs.existsSync(LEARN + m[1]), m[1]);
      assert.equal(m[2], `${word}: ${one(learnHtml[want], /<h1>([^<]*)<\/h1>/, want + " h1")}`, `${f} ${cls} label`);
    }
  });
});

test("handbook: sitemap lists the landing page, privacy and every learn page, and nothing missing", () => {
  const xml = fs.readFileSync("site/sitemap.xml", "utf8");
  const files = [...xml.matchAll(/<loc>https:\/\/mystery\.alephb\.uk\/([^<]*)<\/loc>/g)]
    .map((m) => (m[1] === "" || m[1].endsWith("/") ? m[1] + "index.html" : m[1]));
  assert.equal(files.length, (xml.match(/<loc>/g) || []).length, "every loc is on mystery.alephb.uk");
  for (const f of files) assert.ok(fs.existsSync("site/" + f), "sitemap entry exists: " + f);
  assert.deepEqual([...new Set(files)].sort(), ["index.html", "privacy.html", ...learnPages.map((f) => "learn/" + f)].sort());
});

test("search and previews: every indexed page has its own title, a description, a canonical at its sitemap URL, og tags and JSON-LD that parses", () => {
  const locs = [...fs.readFileSync("site/sitemap.xml", "utf8").matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);
  const titles = new Set();
  for (const loc of locs) {
    const rel = loc.replace("https://mystery.alephb.uk/", ""), f = "site/" + (rel === "" || rel.endsWith("/") ? rel + "index.html" : rel);
    const h = fs.readFileSync(f, "utf8"), meta = (re) => (h.match(re) || [])[1];
    const title = meta(/<title>([^<]+)<\/title>/);
    assert.ok(title && !titles.has(title), f + " has a unique title");
    titles.add(title);
    assert.equal(meta(/<link rel="canonical" href="([^"]+)">/), loc, f + " canonical is its sitemap URL");
    if (rel === "privacy.html") continue;
    assert.ok(meta(/<meta name="description" content="([^"]{50,})">/), f + " description");
    assert.ok(meta(/<meta property="og:title" content="([^"]+)">/), f + " og:title");
    assert.equal(meta(/<meta property="og:url" content="([^"]+)">/), loc, f + " og:url");
    assert.equal(meta(/<meta property="og:image" content="([^"]+)">/), "https://mystery.alephb.uk/landing-pillow.jpg", f + " og:image");
    assert.ok(fs.existsSync("site/landing-pillow.jpg") && h.includes('<meta name="twitter:card" content="summary_large_image">'), f + " twitter card");
    const ld = JSON.parse(meta(/<script type="application\/ld\+json">([^<]+)<\/script>/));
    assert.equal(ld["@context"], "https://schema.org", f + " JSON-LD");
  }
  for (const f of ["admin.html", "leaderboard.html", "monitor.html", "explore.html"]) assert.doesNotMatch(fs.readFileSync("site/" + f, "utf8"), /canonical|og:title/, f + " stays out of search");
});

test("handbook: no page names a game table or a cast member", () => {
  const tables = [...new Set(data.chapters.flatMap((c) => c.tables))];
  const cast = data.cast.flatMap((c) => [c.name, c.name.split(" ").pop()]);
  assert.ok(tables.length >= 13 && cast.length >= 12);
  for (const f of learnPages) {
    let text = unentity(learnHtml[f]);
    for (const c of data.chapters) text = text.split(c.title).join(" "); // chapter titles are allowed ("The Neighbouring Suite")
    for (const w of [...tables, ...cast]) assert.doesNotMatch(text, new RegExp(`\\b${w}\\b`, "i"), `${f} mentions ${w}`);
  }
});

test("handbook: every code block is already coloured by colour_learn.mjs", () => {
  let n = 0;
  for (const f of learnPages)
    for (const [, inner] of learnHtml[f].matchAll(/<pre(?: class="wrong")?><code>([\s\S]*?)<\/code><\/pre>/g)) {
      n++;
      assert.equal(colourBlock(inner), inner, `${f}: a code block is not coloured, run node colour_learn.mjs`);
    }
  assert.ok(n >= 40, "the handbook's code blocks were found");
});

const qrRows = (m) => m.map((r) => r.map((d) => (d ? "1" : "0")).join(""));

test("qrMatrix: HELLO WORLD at M is a version 1 code (21 x 21) with a finder in three corners", () => {
  const m = qrMatrix("HELLO WORLD", "M"), rows = qrRows(m);
  assert.equal(m.length, 21);
  for (const r of m) assert.equal(r.length, 21);
  const finder = ["1111111", "1000001", "1011101", "1011101", "1011101", "1000001", "1111111"];
  for (const [r0, c0] of [[0, 0], [0, 14], [14, 0]])
    finder.forEach((line, i) => assert.equal(rows[r0 + i].slice(c0, c0 + 7), line, `finder at ${r0},${c0} row ${i}`));
  assert.equal(qrMatrix("x".repeat(150), "M").length, 8 * 4 + 17, "a 150-byte link takes version 8 at M");
  assert.equal(qrMatrix("x".repeat(300), "M").length, 13 * 4 + 17, "versions above 10 work (13-M holds 331 bytes)");
  assert.throws(() => qrMatrix("x", "X"));
});

// Reference obtained independently with the Python library `qrcode` 8.x (Lincoln Loop), a separate
// implementation: QRCode(error_correction=ERROR_CORRECT_M, border=0) fed QRData(b"mystery.alephb.uk",
// mode=MODE_8BIT_BYTE), make(fit=True), get_matrix(). Version 2 (one alignment pattern), its own mask choice.
// The same comparison was run offline over 54 strings, versions 2 to 37, all four levels, masks forced,
// and every automatic choice decoded back with zxing-cpp.
test("qrMatrix matches an independent encoder's matrix for a fixed input", () => {
  const ref = [
    "1111111010100101001111111", "1000001010010100101000001", "1011101001001001101011101",
    "1011101011110010001011101", "1011101000010011101011101", "1000001001100100001000001",
    "1111111010101010101111111", "0000000010101000100000000", "1011011101111100001001011",
    "0000110111101110100101010", "0001001011010100001111100", "0110100001111001000101110",
    "1111001100001010011010100", "0000010111111011011111001", "0101111100010100110110110",
    "1000110110110010011110011", "0001111011001010111110101", "0000000010000010100011101",
    "1111111011100110101010011", "1000001011110111100011000", "1011101001000110111111000",
    "1011101011000001011011011", "1011101010100010101010110", "1000001001011110000001100",
    "1111111010010000001010111",
  ];
  assert.deepEqual(qrRows(qrMatrix("mystery.alephb.uk", "M")), ref);
});

test("qrMatrix invariants: format bits decode, Reed-Solomon syndromes vanish, data re-reads to the text", () => {
  const text = "HELLO WORLD", m = qrMatrix(text, "M");
  // Format information, first copy: column 8 rows 0-5, 7, 8, then row 8 columns 7, 5..0 (bit 0 first).
  const cells = [[0, 8], [1, 8], [2, 8], [3, 8], [4, 8], [5, 8], [7, 8], [8, 8], [8, 7], [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0]];
  const fmt = cells.reduce((v, [r, c], i) => v | (m[r][c] ? 1 << i : 0), 0);
  const second = [...Array(8)].map((_, i) => [8, 20 - i]).concat([...Array(7)].map((_, i) => [14 + i, 8]));
  assert.equal(second.reduce((v, [r, c], i) => v | (m[r][c] ? 1 << i : 0), 0), fmt, "both copies agree");
  // Unmasked by 0x5412, the 15 bits are a BCH codeword: divisible by 0x537 (polynomials over GF(2)).
  const raw = fmt ^ 0x5412;
  let rem = raw;
  for (let i = 14; i >= 10; i--) if ((rem >> i) & 1) rem ^= 0x537 << (i - 10);
  assert.equal(rem, 0, "format BCH remainder");
  assert.equal(raw >> 13, 0, "level bits 00 = M");
  const mask = (raw >> 10) & 7;
  // Unmask and read the 26 codewords back in placement order.
  const bits = dataPositions(1).map(([r, c]) => (m[r][c] !== MASKS[mask](r, c) ? 1 : 0));
  const cw = [...Array(26)].map((_, i) => bits.slice(i * 8, i * 8 + 8).reduce((v, b) => (v << 1) | b, 0));
  // 1-M is one block: 16 data + 10 EC codewords; c(x) evaluated at a^0..a^9 must be 0.
  for (let i = 0; i < 10; i++) assert.equal(cw.reduce((acc, b) => gfMul(acc, gfExp(i)) ^ b, 0), 0, `syndrome ${i}`);
  // Mode 0100, 8-bit count, the bytes, then the 0000 terminator and 0xEC/0x11 padding.
  const s = cw.slice(0, 16).map((b) => b.toString(2).padStart(8, "0")).join("");
  assert.equal(s.slice(0, 4), "0100");
  const n = parseInt(s.slice(4, 12), 2);
  const bytes = [...Array(n)].map((_, i) => parseInt(s.slice(12 + 8 * i, 20 + 8 * i), 2));
  assert.equal(String.fromCharCode(...bytes), text);
  assert.equal(s.slice(12 + 8 * n, 16 + 8 * n), "0000");
  assert.deepEqual(cw.slice(13, 16), [0xec, 0x11, 0xec]);
});

test("qrSvg is one well-formed svg with a crisp path and the quiet zone", () => {
  const svg = qrSvg("https://mystery.alephb.uk/?season=3", { size: 300 });
  const n = qrMatrix("https://mystery.alephb.uk/?season=3").length + 8;
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" [^>]*><rect [^>]*\/><path [^>]*\/><\/svg>$/);
  assert.ok(svg.includes(`width="300" height="300" viewBox="0 0 ${n} ${n}"`));
  assert.ok(svg.includes('shape-rendering="crispEdges"'));
  assert.equal((svg.match(/<path/g) || []).length, 1);
  const xs = [...svg.matchAll(/M(\d+) (\d+)/g)].flatMap((x) => [+x[1], +x[2]]);
  assert.equal(Math.min(...xs), 4, "dark modules start after a four-module quiet zone");
  assert.equal(Math.max(...xs), n - 5, "and end four modules before the edge");
  assert.ok(qrSvg("a", { quiet: 2, dark: "#123", light: "none" }).includes('fill="#123"'));
});

// --- admin page and board: pure helpers (the DOM wiring only runs in a browser) ---
const admin = await import("./site/admin.js");
const lb = await import("./site/leaderboard.js");
const BOARD = "https://example.invalid/macros/s/PLACEHOLDER/exec";

test("admin CSV: the Sheet's columns, RFC 4180 quoting of commas, quotes and line breaks", () => {
  const csv = admin.csvText([
    { timestamp: 1, event: "join", team: 'Le "Chat", noir', season: "s1-ab", chapter: "", wrong: 0, queries: 0, clientAt: null, elapsedMs: null },
    { timestamp: 2, event: "progress", team: "two\nlines", season: "s1-ab", chapter: 1, wrong: 2, queries: 9, clientAt: 5, elapsedMs: 60000 },
  ]);
  assert.equal(csv, "timestamp,event,team,season,chapter,wrong,queries,clientAt,elapsedMs\r\n" +
    '1,join,"Le ""Chat"", noir",s1-ab,,0,0,,\r\n' + '2,progress,"two\nlines",s1-ab,1,2,9,5,60000\r\n');
  assert.equal(admin.csvText([]), admin.CSV_COLUMNS.join(",") + "\r\n");
  assert.equal(admin.csvFilename('Group A: "Tue"/2'), "Group A- -Tue-2.csv", "file-name characters become dashes, a run becomes one");
});

test("admin student link: the game URL, the season id and a readable board URL", () => {
  assert.equal(admin.studentLink("https://mystery.example/", "s123-ab", BOARD),
    "https://mystery.example/?season=s123-ab&board=https://example.invalid/macros/s/PLACEHOLDER/exec");
  const odd = admin.studentLink("http://localhost:8000/", "s1", "https://x.invalid/exec?a=1&b=2");
  assert.ok(odd.endsWith("board=https://x.invalid/exec%3Fa%3D1%26b%3D2"));
  assert.equal(new URL(odd).searchParams.get("board"), "https://x.invalid/exec?a=1&b=2", "the game reads the board URL back intact");
  assert.equal(admin.boardLink("s1", BOARD), "leaderboard.html?data=" + encodeURIComponent(BOARD) + "&season=s1");
});

test("admin seasons table: newest first, counts per season, actions by state, values escaped", () => {
  const seasons = admin.newestFirst([
    { id: "s1", name: "<b>old</b>", date: "2026-10-01", db: 1, state: "closed", createdAt: 1 },
    { id: "s2", name: "new", date: "2026-10-14", db: 2, state: "created", createdAt: 2 }]);
  assert.deepEqual(seasons.map(s => s.id), ["s2", "s1"]);
  const counts = admin.seasonCounts(fixture().map(r => ({ ...r, season: "s1" })));
  assert.deepEqual(counts, { s1: { joined: 4, finished: 2 } });
  const html = admin.seasonsTableHtml(seasons, counts, "s1");
  assert.ok(!html.includes("<b>old") && html.includes("&#60;b&#62;old"), "a name is escaped");
  const [created, closed] = html.split('<tr data-id="').slice(1);
  assert.ok(created.includes('data-act="open"') && created.includes('data-act="close"'), "a season created by mistake can be closed");
  assert.ok(!closed.includes('data-act="open"') && !closed.includes('data-act="close"') && closed.includes('data-act="csv"'));
  assert.ok(closed.startsWith('s1" class="selected"'));
  const detail = admin.detailHtml({ id: "s1", name: "x", date: "d", state: "open", penalty: 30, openedAt: T0 },
    [...fixture(), row("join", "<img src=x onerror=alert(1)>", "", 1)]);
  assert.ok(!detail.includes("<img"), "a pseudo is escaped in the detail");
  assert.ok(detail.includes("PLAYERS (5)") && detail.includes("19:00 <abbr"));
});

test("admin seasons table: action buttons are icons named by title and aria-label, no visible text", () => {
  const html = admin.seasonsTableHtml([{ id: "s1", name: "x", date: "d", db: 1, state: "created", createdAt: 1 }], {}, "");
  const names = { open: "Open", close: "Close", copy: "Copy link", qr: "QR", board: "Board", csv: "Export CSV", delete: "Delete the season" };
  const btns = [...html.matchAll(/<button ([^>]*)>([\s\S]*?)<\/button>/g)];
  assert.deepEqual(btns.map(b => b[1].match(/data-act="(\w+)"/)[1]), Object.keys(names));
  for (const [, attrs, inner] of btns) {
    const name = names[attrs.match(/data-act="(\w+)"/)[1]];
    assert.ok(attrs.includes('title="' + name + '"') && attrs.includes('aria-label="' + name + '"'), name);
    assert.match(inner, /^<svg [^>]*aria-hidden="true"/, name + ": an svg");
    assert.equal(inner.replace(/<[^>]*>/g, "").trim(), "", name + ": no visible text");
  }
  const acts = state => [...admin.seasonsTableHtml([{ id: "s1", name: "x", date: "d", db: 1, state, createdAt: 1 }], {}, "")
    .matchAll(/data-act="(\w+)"/g)].map(m => m[1]);
  assert.ok(!acts("open").includes("delete"), "an open season cannot be deleted");
  assert.ok(acts("closed").includes("delete") && !acts("closed").includes("close"));
});

test("admin delete question: names the season and its players, suggests the CSV", () => {
  assert.equal(admin.deleteMessage("Group A", 3), 'Delete "Group A"? Its 3 players and all their rows are erased for good. ' +
    "This cannot be undone: export the CSV first if you want to keep them.");
  assert.ok(admin.deleteMessage("x", 1).includes("Its 1 player and"));
});

test("board: eight-cell strip, three states, every pseudo escaped", () => {
  assert.equal((lb.stripHtml(3).match(/<i class="on">/g) || []).length, 3);
  assert.equal((lb.stripHtml(3).match(/<i /g) || []).length, 8);
  assert.equal((lb.stripHtml(8).match(/<i class="on">/g) || []).length, 8);
  const rows = [...fixture(), row("join", "<b>Eve</b>", "", 3)];
  const meta = state => ({ id: "s1", name: "Group <A>", date: "2026-10-14", state, penalty: 30, openedAt: T0 });
  for (const st of ["created", "open", "closed"]) {
    const b = lb.boardHtml(meta(st), rows);
    assert.ok(!b.body.includes("<b>Eve") && b.body.includes("&#60;b&#62;Eve&#60;/b&#62;"), st + ": pseudo escaped");
    assert.equal(b.head, "Group &#60;A&#62;", st + ": name escaped");
  }
  const waiting = lb.boardHtml(meta("created"), rows);
  assert.ok(waiting.body.includes("Waiting for the teacher") && waiting.body.includes("5 detectives joined"));
  const open = lb.boardHtml(meta("open"), rows);
  assert.equal((open.body.match(/<tr /g) || []).length, 5);
  assert.ok(open.body.indexOf("bob") < open.body.indexOf("Alice") && open.body.indexOf("Alice") < open.body.indexOf("Carol"), "finished first, by time");
  assert.ok(open.body.includes("19:00 <abbr title=") && open.body.includes("20:30") && open.body.includes("chapter 3"));
  assert.ok(!open.body.includes("podium") && !open.dateline.includes("closed"));
  const closed = lb.boardHtml(meta("closed"), rows);
  assert.ok(closed.dateline.includes("Session closed") && closed.body.indexOf("podium") < closed.body.indexOf("ranking"));
  assert.ok(closed.body.includes('class="place-1"') && closed.body.includes('class="place-2"') && !closed.body.includes('class="place-3"'), "two finishers, two steps");
  assert.ok(lb.boardHtml(meta("open"), []).body.includes("No detective yet"));
  const nobodyDone = lb.boardHtml(meta("closed"), fixture().filter(r => r.event !== "finish"));
  assert.ok(!nobodyDone.body.includes("podium") && nobodyDone.body.includes("ranking"), "the podium shows finished players only");

});

test("admin and board pages: not in the sitemap, admin kept out of robots, the deploy versions their scripts, pure ASCII", () => {
  assert.doesNotMatch(fs.readFileSync("site/sitemap.xml", "utf8"), /admin\.html|leaderboard\.html|monitor\.html|explore\.html/);
  assert.match(fs.readFileSync("site/robots.txt", "utf8"), /^Disallow: \/monitor\.html$/m);
  assert.match(fs.readFileSync("site/monitor.html", "utf8"), /<meta name="robots" content="noindex">/);
  assert.match(fs.readFileSync("site/robots.txt", "utf8"), /^Disallow: \/explore\.html$/m);
  assert.match(fs.readFileSync("site/explore.html", "utf8"), /<meta name="robots" content="noindex">/);
  assert.match(fs.readFileSync("site/robots.txt", "utf8"), /^Disallow: \/admin\.html$/m);
  const yml = fs.readFileSync(".github/workflows/pages.yml", "utf8");
  for (const f of ["site/admin.html", "site/leaderboard.html", "site/admin.js", "site/leaderboard.js", "site/monitor.html", "site/monitor.js", "site/explore.html", "site/explore.js", "site/app.js", "site/learn/exercises.html", "site/learn/exercises.js"]) assert.ok(yml.includes(f), f);
  // every module importing app.js, shared.js, qr.js or stats.js is one the deploy versions
  const importers = ["site", "site/learn"].flatMap((d) => fs.readdirSync(d).filter((f) => f.endsWith(".js")).map((f) => d + "/" + f))
    .filter((f) => /from "\.\.?\/(app|shared|qr|stats)\.js"/.test(fs.readFileSync(f, "utf8")));
  assert.deepEqual(importers.sort(), ["site/admin.js", "site/app.js", "site/explore.js", "site/leaderboard.js", "site/learn/exercises.js", "site/learn/handbook.js", "site/monitor.js"]);
  assert.match(yml, /\(shared\|qr\|stats\)/, "app.js's stats.js import is versioned");
  assert.match(yml, /src=\\"handbook\\.js\\"[^\n]*site\/learn\/\*\.html/, "every handbook page's handbook.js is versioned");
  for (const f of importers) assert.ok(yml.includes(f), f + " is versioned by the deploy");
  for (const f of ["site/admin.html", "site/admin.js", "site/admin.css", "site/leaderboard.html", "site/leaderboard.js", "site/monitor.html", "site/monitor.js", "site/explore.html", "site/explore.js", "site/world.json"])
    assert.doesNotMatch(fs.readFileSync(f, "utf8"), /[^\n -~]/, f + " is pure ASCII");
});

test("resultsLink: the season's public board, board URL and season id encoded", () => {
  const board = "https://x.invalid/exec?a=1&b=2";
  const u = new URL(resultsLink(board, "s1 &x"), "https://mystery.example/");
  assert.equal(u.pathname, "/leaderboard.html");
  assert.equal(u.searchParams.get("data"), board);
  assert.equal(u.searchParams.get("season"), "s1 &x");
  assert.equal(freshState().closedSeen, false, "the close pop-up shows once per close");
});

test("compete has no Suspects gallery: learn's cards would point at learn's traps", () => {
  assert.equal(suspectsOn(freshState()), true);
  assert.equal(suspectsOn({ ...freshState(), mode: "compete" }), false);
});

// --- The strict terminal (PostgreSQL's rules, site/app.js strictCheck) --------------------------------------
// The plot's queries and the game schema come from generate_db.py --queries (plant_values and site/mystery.sqlite's schema, no build: fast).
const plotDump = JSON.parse(execFileSync("python3", ["generate_db.py", "--queries"], { encoding: "utf8" }));
const GAME = plotDump.schema;

test("strict terminal: every plot query (learn and seasons 1-5, LIKE traps also as ILIKE) and solution.sql passes", () => {
  assert.ok(plotDump.queries.length > 1000, "the dump lists the plot's queries");
  for (const [label, q] of plotDump.queries) assert.equal(strictCheck(q, GAME, true), null, label + ": " + q);
  const sol = fs.readFileSync("solution.sql", "utf8").split(/;\n/).map(q => q.split("\n").filter(l => !l.startsWith("--")).join("\n").trim()).filter(Boolean);
  assert.ok(sol.length > 20);
  for (const q of sol) assert.equal(strictCheck(q + ";", GAME, true), null, q);
});

test("strict terminal: each rule refuses its example, with PostgreSQL's error line and a handbook anchor", () => {
  const cases = [
    ["group-by", "SELECT dropoff, date FROM cab_ride GROUP BY dropoff", /column "cab_ride.date" must appear in the GROUP BY clause/],
    ["group-by", "SELECT * FROM cab_ride GROUP BY dropoff", /must appear in the GROUP BY/],
    ["group-by", "SELECT plate, COUNT(*) FROM cab_ride", /column "cab_ride.plate" must appear/],
    ["group-by", "SELECT p.name, COUNT(*) FROM person AS p JOIN address AS a ON a.id = p.address_id GROUP BY a.street", /"p.name"/],
    ["having", "SELECT plate FROM cab_ride HAVING COUNT(*) > 1", /must appear in the GROUP BY/],
    ["order-by-grouped", "SELECT dropoff FROM cab_ride GROUP BY dropoff ORDER BY date", /"cab_ride.date" must appear/],
    ["distinct-order", "SELECT DISTINCT dropoff FROM cab_ride ORDER BY date", /^for SELECT DISTINCT, ORDER BY expressions must appear in select list$/],
    ["double-quotes", "SELECT id FROM police_report WHERE place = \"Hotel Ritz\"", /^column "Hotel Ritz" does not exist$/],
    ["double-quotes", "SELECT \"Plate\" FROM cab_ride", /column "Plate" does not exist/],
    ["double-quotes", "SELECT id FROM \"Cab_Ride\"", /relation "Cab_Ride" does not exist/],
    ["double-quotes", "SELECT COUNT(*) AS 'total' FROM person", /syntax error at or near "'total'"/],
    ["double-quotes", "SELECT `plate` FROM cab_ride", /syntax error/],
    ["double-equals", "SELECT id FROM police_report WHERE date == 19120518", /^operator does not exist: integer == integer$/],
    ["types", "SELECT id FROM cab_ride WHERE time < 600", /^operator does not exist: text < integer$/],
    ["types", "SELECT id FROM police_report WHERE date = '19120518'", /^operator does not exist: integer = text$/],
    ["types", "SELECT id FROM cab_ride WHERE plate = 752041", /text = integer/],
    ["types", "SELECT id FROM police_report WHERE date LIKE '191205%'", /integer ~~ unknown/],
    ["types", "SELECT id FROM police_report WHERE date ILIKE '191205%'", /integer ~~\* unknown/],
    ["types", "SELECT SUM(plate) FROM cab_ride", /function sum\(text\) does not exist/],
    ["types", "SELECT SUM(fare > 3) FROM cab_ride", /function sum\(boolean\) does not exist/],
    ["types", "SELECT time + 1 FROM cab_ride", /text \+ integer/],
    ["aliases", "SELECT fare * 2 AS f FROM cab_ride WHERE f > 10", /^column "f" does not exist$/],
    ["aliases", "SELECT dropoff, COUNT(*) AS n FROM cab_ride GROUP BY dropoff HAVING n >= 3", /column "n" does not exist/],
    ["aliases", "SELECT dropoff, COUNT(*) AS n FROM cab_ride GROUP BY dropoff ORDER BY n + 1", /column "n" does not exist/],
    ["boolean", "SELECT id FROM police_report WHERE 1", /^argument of WHERE must be type boolean, not type integer$/],
    ["boolean", "SELECT id FROM hotel_register WHERE price", /argument of WHERE/],
    ["boolean", "SELECT id FROM cab_ride WHERE fare > 1 AND 2", /argument of AND/],
    ["boolean", "SELECT id FROM cab_ride WHERE NOT plate", /argument of NOT must be type boolean, not type text/],
    ["boolean", "SELECT CASE WHEN fare THEN 1 END FROM cab_ride", /argument of CASE\/WHEN/],
    ["boolean", "SELECT c.id FROM cab_ride AS c JOIN address AS a ON 1", /argument of JOIN\/ON/],
    ["limit-offset", "SELECT id FROM cab_ride LIMIT 5, 10", /^LIMIT #,# syntax is not supported$/],
    ["coalesce", "SELECT IFNULL(occupation, 'none') FROM person", /function ifnull\(text, text\) does not exist/],
    ["like-ilike", "SELECT id FROM cab_ride WHERE plate GLOB '75*'", /syntax error at or near "GLOB"/],
    ["like-ilike", "SELECT id FROM cab_ride WHERE plate REGEXP '75'", /syntax error/],
    ["date-functions", "SELECT strftime('%Y', 'now') FROM police_report", /function strftime/],
    ["group-concat", "SELECT group_concat(plate) FROM cab_ride", /function group_concat/],
    ["types", "SELECT fare || date FROM cab_ride", /^operator does not exist: integer \|\| integer$/],
    ["like-ilike", "SELECT id FROM person WHERE name = 'x' COLLATE NOCASE", /collation "nocase"/],
    ["coalesce", "SELECT id FROM person WHERE occupation IS 'jeweller'", /syntax error/],
    ["iif", "SELECT MAX(fare, 3) FROM cab_ride", /function max\(integer, integer\)/],
    ["date-functions", "SELECT date(date, '+1 day') FROM police_report", /^function date\(integer, text\) does not exist$/],
    ["date-functions", "SELECT time(time, '+1 hour') FROM cab_ride", /function time\(text, text\)/],
    ["types", "SELECT plate FROM cab_ride UNION SELECT fare FROM cab_ride", /^UNION types text and integer cannot be matched$/],
    ["types", "SELECT id, plate FROM cab_ride INTERSECT SELECT id, date FROM police_report", /^INTERSECT types text and integer cannot be matched$/],
    ["types", "SELECT fare FROM cab_ride EXCEPT SELECT plate FROM cab_ride", /^EXCEPT types integer and text cannot be matched$/],
    ["double-equals", "SELECT id FROM cab_ride WHERE plate == '75' AND (", /==/],   // the parser gives up, the token scan still refuses
  ];
  for (const [anchor, q, re] of cases) {
    const r = strictCheck(q, GAME);
    assert.ok(r, "refused: " + q);
    assert.equal(r.anchor, anchor, q);
    assert.match(r.error, re, q);
    assert.ok(r.why.length > 30 && /^[ -~]+$/.test(r.why + r.error), "a plain ASCII sentence: " + q);
  }
  assert.match(strictCheck(cases[0][1], GAME).why, /add cab_ride.date to GROUP BY/, "the why names the column");
  const html = strictHtml(strictCheck(cases[0][1], GAME));
  assert.match(html, /^<div class="error strict"><div class="pg-error">ERROR: column "cab_ride.date" must appear/);
  assert.match(html, /href="learn\/group-by-having\.html#group-by" target="_blank" rel="noopener">Grammar: GROUP BY<\/a>/);
  assert.match(strictHtml({ error: "<b>", why: "<i>", anchor: "types" }), /&lt;b&gt;.*&lt;i&gt;/, "escaped");
});

test("strict terminal: every replacement a refusal or the grammar page suggests names only functions SQLite has", () => {
  const have = new Set(JSON.parse(execFileSync("python3", ["-c",
    "import sqlite3, json; print(json.dumps([r[0] for r in sqlite3.connect(':memory:').execute('SELECT DISTINCT name FROM pragma_function_list')]))"],
    { encoding: "utf8" })));
  const grammar = learnPages.map((f) => fs.readFileSync(LEARN + f, "utf8")).join("\n");
  const writes = [...grammar.matchAll(/<tr><td>[^<]*<\/td><td>([^<]*)<\/td><\/tr>/g)].map(m => m[1]);
  assert.ok(writes.some(w => /CASE WHEN a &gt; b/.test(w)), "the Write column is read");
  const whys = Object.keys(SQLITE_FUNCS).map(f => strictCheck("SELECT " + f + "(fare, 3) FROM cab_ride", GAME).why);
  whys.push(strictCheck("SELECT MAX(fare, 3) FROM cab_ride", GAME).why, strictCheck("SELECT date(plate, '+1 day') FROM cab_ride", GAME).why);
  for (const s of [...writes, ...whys])
    for (const [, f] of s.replace(/^.*?: (write|use) /, "").matchAll(/\b([A-Za-z_]+)\(/g))
      assert.ok(SQL_KEYWORDS.has(f.toLowerCase()) || have.has(f.toLowerCase()), f + "() does not run in SQLite: " + s);
});

test("strict terminal: valid PostgreSQL is never refused", () => {
  const ok = [
    "SELECT COUNT(*) FROM cab_ride HAVING COUNT(*) > 1",
    "SELECT p.id, p.name, COUNT(*) FROM person AS p JOIN bank_account AS b ON b.person_id = p.id GROUP BY p.id",
    "SELECT * FROM person GROUP BY id",
    "SELECT dropoff, COUNT(*) AS n FROM cab_ride GROUP BY dropoff ORDER BY n DESC",
    "SELECT dropoff AS d, COUNT(*) FROM cab_ride GROUP BY d ORDER BY 2 DESC",
    "SELECT dropoff, COUNT(*) FROM cab_ride GROUP BY 1",
    "SELECT plate FROM cab_ride LIMIT 3",
    "SELECT plate FROM cab_ride WHERE plate ILIKE '75-%' AND pickup NOT ILIKE '%gare%'",
    "SELECT \"plate\" FROM \"cab_ride\"",
    "SELECT DISTINCT dropoff FROM cab_ride ORDER BY dropoff",
    "SELECT DISTINCT c.dropoff FROM cab_ride AS c ORDER BY dropoff",
    "SELECT DISTINCT * FROM suite ORDER BY floor",
    "SELECT suite, RANK() OVER (ORDER BY COUNT(*) DESC) FROM room_service GROUP BY suite",
    "SELECT id, SUM(amount) OVER (PARTITION BY account_id ORDER BY date) FROM bank_transaction",
    "SELECT COALESCE(occupation, 'none') FROM person",
    "SELECT id FROM cab_ride WHERE time < '06:00' AND (fare > 3 OR currency = 'pound')",
    "SELECT plate || ' ' || fare FROM cab_ride",
    "SELECT id FROM person WHERE occupation IS NOT NULL AND name IS DISTINCT FROM 'x'",
    "SELECT a.street, (SELECT COUNT(*) FROM person AS p WHERE p.address_id = a.id) AS n FROM address AS a ORDER BY n DESC",
    "SELECT name FROM person WHERE EXISTS (SELECT 1 FROM bank_account AS b WHERE b.person_id = person.id)",
    "SELECT CASE WHEN fare > 5 THEN 'dear' ELSE 'cheap' END AS kind, COUNT(*) FROM cab_ride GROUP BY kind",
    "SELECT CASE WHEN fare > 5 THEN 'dear' ELSE 'cheap' END, COUNT(*) FROM cab_ride GROUP BY CASE WHEN fare > 5 THEN 'dear' ELSE 'cheap' END",
    "SELECT id FROM cab_ride ORDER BY id LIMIT 5 OFFSET 10",
    "WITH x AS (SELECT dropoff, COUNT(*) AS n FROM cab_ride GROUP BY dropoff) SELECT dropoff FROM x WHERE n > 2",
    "SELECT COUNT(*) FILTER (WHERE fare > 3) FROM cab_ride",
    "SELECT LOWER(name) FROM person WHERE LOWER(name) LIKE '%grim%'",
    "SELECT id FROM cab_ride WHERE CAST(substr(time, 1, 2) AS INTEGER) < 6",
    "SELECT * FROM sqlite_master",
    "SELECT plate FROM cab_ride UNION SELECT guest_name FROM hotel_register ORDER BY 1",
    "SELECT name FROM person WHERE address_id IN (SELECT id FROM address WHERE number = 27)",
    "SELECT ROUND(AVG(fare), 1) AS avg_fare FROM cab_ride",
    "SELECT MAX(date) - MIN(date) FROM police_report",
    "SELECT name FROM person p WHERE p.born_year > 1870",
    "SELECT t.* FROM telegram AS t WHERE t.suite = 214",
    "SELECT id FROM person WHERE name = 'O''Brien'; SELECT 1;",
    "SELECT r.suite, COUNT(*) FROM room_service AS r JOIN suite AS s ON s.id = r.suite GROUP BY r.suite ORDER BY COUNT(*) DESC",
    "SELECT 'a' = 'a' AS same",
    "SELECT id FROM police_report WHERE TRUE",
    "SELECT x.n FROM (SELECT COUNT(*) AS n FROM cab_ride) AS x",
    "SELECT plate, fare FROM cab_ride UNION ALL SELECT guest_name, price FROM hotel_register",
    "SELECT plate FROM cab_ride UNION SELECT NULL",
    "SELECT fare FROM cab_ride UNION SELECT AVG(fare) FROM cab_ride",
    "SELECT fare FROM cab_ride UNION SELECT '3'",
    "WITH s AS (SELECT suite, time FROM lift_log UNION ALL SELECT suite, time FROM room_service) SELECT suite, COUNT(*) FROM s GROUP BY suite",
    "WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM n WHERE x < 5) SELECT x FROM n",
    "SELECT LEFT(plate, 2), RIGHT(plate, 4) FROM cab_ride WHERE LEFT(plate, 3) = '75-'",
    "SELECT fare::text, plate::integer + 1, (fare * 2)::numeric(6, 2) AS f FROM cab_ride WHERE time::text < '06:00'",
    "SELECT date('1912-05-18'), id FROM police_report",
  ];
  for (const q of ok) assert.equal(strictCheck(q, GAME, true), null, q);
  for (const q of ["PRAGMA table_info(person)", "SELECT * FROM pragma_table_info('person')", "SELECT"])
    assert.equal(strictCheck(q, GAME), null, "syntax the parser does not know goes to SQLite: " + q);
});

test("strict terminal: ILIKE runs as REGEXP bound to a case-insensitive LIKE, strings untouched", () => {
  assert.equal(toSqlite("SELECT x FROM t WHERE a ILIKE '%b%' AND c NOT ilike 'ILIKE'"), "SELECT x FROM t WHERE a REGEXP '%b%' AND c NOT REGEXP 'ILIKE'");
  assert.equal(toSqlite("SELECT 1"), "SELECT 1");
  assert.equal(toSqlite("SELECT LEFT(name, 3), right(name, n + 1) FROM t LEFT JOIN u ON 1 = 1 -- left(x, 1) 'a::b'"),
    "SELECT substr(name, 1, 3), substr(name, -(n + 1), n + 1) FROM t LEFT JOIN u ON 1 = 1 -- left(x, 1) 'a::b'");
  assert.equal(toSqlite("SELECT '7'::int, (a + b)::text, p.price::numeric(5, 2), a::int::text, COUNT(*)::text, x::double precision, 'a::b'"),
    "SELECT CAST('7' AS INTEGER), CAST((a + b) AS TEXT), CAST(p.price AS NUMERIC), CAST(CAST(a AS INTEGER) AS TEXT), CAST(COUNT(*) AS TEXT), CAST(x AS REAL), 'a::b'");
  // the translation runs, gives PostgreSQL's answers, and generate_db.sqlite_sql writes the same SQLite
  const q = "SELECT LEFT('Croissant', 3), RIGHT('Croissant', 4), RIGHT('Croissant', 0), RIGHT('Bun', 9), '7'::int + 1, '2.5'::numeric * 2, 12::text || 'x', '2026-03-05'::date";
  const got = execFileSync("python3", ["-c", "import sqlite3, sys, json, generate_db as g; assert g.sqlite_sql(sys.argv[1]) == sys.argv[2]; " +
    "print(json.dumps(sqlite3.connect(':memory:').execute(sys.argv[2]).fetchall()))", q, toSqlite(q)], { encoding: "utf8" });
  assert.deepEqual(JSON.parse(got), [["Cro", "sant", "", "Bun", 8, 5.0, "12x", "2026-03-05"]]);
  assert.equal(strictCheck(q, GAME, true), null, "accepted");
  assert.equal(ilike("%ritz%", "Hotel RITZ"), 1);
  assert.equal(ilike("75-_04_", "75-2041"), 1);
  assert.equal(ilike("75-_04", "75-2041"), 0, "anchored at both ends");
  assert.equal(ilike("a.c", "abc"), 0, "regex characters are literal");
  assert.equal(ilike("10!%", "10%", "!"), 1);
  assert.equal(ilike("10!%", "100", "!"), 0);
  assert.equal(ilike(null, "x"), null);
  assert.equal(ilike("%", "line\nbreak"), 1);
});

test("an errored query counts as a query but is not kept in History", () => {
  const s = freshState();
  recordQuery(s, 1, "SELECT 1", null);
  recordQuery(s, 1, "SELECT bad", "ERROR: column \"bad\" does not exist");
  recordQuery(s, 1, "SELECT 2\nFROM t", "no such table: t");
  assert.equal(s.queries[1], 3);
  assert.equal(s.totalQueries, 3);
  assert.deepEqual(s.history, ["SELECT 1"]);
  assert.equal(s.errorStreak, 2, "errors still feed the Typo badge");
  assert.equal(s.lastQueryLines, 2);
  recordQuery(s, 1, "SELECT 3", null);
  assert.equal(s.errorStreak, 0);
  assert.deepEqual(s.history, ["SELECT 3", "SELECT 1"]);
  const c = { ...freshState(), mode: "compete" };
  recordQuery(c, 2, "SELECT x", "error");
  assert.equal(competeStats(c).queries, 1, "compete rows count it too");
  assert.deepEqual(c.history, []);
});

test("handbook: every example passes the strict terminal; each wrong one is refused, its refusal written by colour_learn.mjs", () => {
  const bakery = bakerySchema(learnHtml["database.html"]);
  assert.deepEqual(Object.keys(bakery).sort(), ["customer", "order_item", "orders", "product", "refund", "staff"]);
  let wrong = 0;
  for (const f of learnPages) {
    assert.equal(colourPage(learnHtml[f], bakery), learnHtml[f], f + ": run node colour_learn.mjs");
    for (const [, cls, inner] of learnHtml[f].matchAll(/<pre( class="wrong")?><code>([\s\S]*?)<\/code><\/pre>/g)) {
      const q = plainSql(inner);
      if (/^\s*CREATE TABLE/.test(q)) continue;
      if (cls) { wrong++; assert.ok(strictCheck(q, bakery), f + " wrong example refused: " + q); }
      else assert.equal(strictCheck(q, bakery), null, f + ": " + q);
    }
  }
  assert.ok(wrong >= 10);
  const page = learnHtml["grammar.html"];
  for (const [a, [f]] of Object.entries(STRICT_SECTIONS)) {
    assert.match(learnHtml[f + ".html"], new RegExp(`<h2 id="${a}">`), "section " + a + " on " + f);
    assert.ok(page.includes(f === "grammar" ? `href="#${a}"` : `href="${f}.html#${a}"`), "the grammar hub lists " + a);
  }
  assert.match(page, /follows PostgreSQL's rules/);
  assert.match(page, /<h2 id="order-of-execution">/);
  const ids = learnPages.flatMap((f) => [...learnHtml[f].matchAll(/ id="([\w-]+)"/g)].map((m) => m[1]));
  for (const a of Object.keys(STRICT_SECTIONS)) assert.equal(ids.filter((i) => i === a).length, 1, a + " is unique across the handbook");
  for (const f of learnPages)   // every in-handbook anchor link lands on an id
    for (const [, p, a] of learnHtml[f].matchAll(/href="([\w-]*\.html)?#([\w-]+)"/g))
      assert.match(learnHtml[p || f], new RegExp(` id="${a}"`), f + " links " + (p || "") + "#" + a);
  assert.ok(fs.readFileSync("site/index.html", "utf8").includes('class="dialect" href="learn/grammar.html"'), "the terminal's PostgreSQL label");
  assert.equal(strictCheck("SELECT id FROM orders WHERE day = 20260302", bakery).anchor, "types", "the page's text-against-number claim");
});

test("europeanZone: Europe's time zones wait for the banner's Yes, the rest are counted at once", () => {
  for (const tz of ["Europe/Paris", "Europe/London", "Atlantic/Reykjavik", "Atlantic/Canary", "Arctic/Longyearbyen", "", undefined])
    assert.equal(europeanZone(tz), true, tz);
  for (const tz of ["America/New_York", "Asia/Kolkata", "Africa/Casablanca", "Atlantic/Bermuda", "Australia/Sydney"])
    assert.equal(europeanZone(tz), false, tz);
});

// --- The handbook's interactive exercises (site/learn/exercises.js) -------------------------------------------
// Each solution run on the bakery database by Python's sqlite3 with the terminal's semantics (generate_db.strict_conn),
// as the page runs it in sql.js, then checked the way the page checks a student's result.
const EX_RE = /<p class="exercise" id="([^"]+)"([^>]*)>[\s\S]*?Expected: (\d+) rows?\.<\/p>\n<details class="solution"><summary>Solution<\/summary>\n<pre><code>([\s\S]*?)<\/code><\/pre>\n<table class="result">([\s\S]*?)<\/table>/g;
const exercises = [...learnHtml["exercises.html"].matchAll(EX_RE)].map(([, slug, attrs, rows, code, table]) => {
  const dataset = Object.fromEntries([...attrs.matchAll(/data-(\w+)(?:="([^"]*)")?/g)].map(([, k, v]) => [k, v ?? ""]));
  const cells = (tag, tr) => [...tr.matchAll(new RegExp(`<${tag}>([^<]*)</${tag}>`, "g"))].map((m) => unentity(m[1]));
  const trs = [...table.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((m) => m[1]);
  return { slug, opts: checkOptions(dataset), rows: Number(rows), sql: plainSql(code),
    page: { columns: cells("th", trs[0]), values: trs.slice(1).map((tr) => cells("td", tr).map((v) => (v === "NULL" ? null : v))) } };
});
const exRun = JSON.parse(execFileSync("python3", ["-c", `
import sys, json, erd, generate_db as g
conn = g.strict_conn(erd.bakery_conn(open("site/learn/database.html").read()))
out = []
for q in json.load(sys.stdin):
    cur = conn.execute(g.sqlite_sql(q))
    out.append({"columns": [d[0] for d in cur.description], "values": [list(r) for r in cur.fetchall()]})
print(json.dumps(out))`], { input: JSON.stringify(exercises.map((e) => e.sql)), encoding: "utf8" }));

test("exercises: each solution's result marks its own question solved, and no other one", () => {
  assert.equal(exercises.length, 20);
  exercises.forEach((e, i) => {
    const res = exRun[i];
    assert.equal(res.values.length, e.rows, e.slug + ": the expected row count");
    assert.ok(sameResult(e.page, res, e.opts), e.slug + ": the page's printed result is the real one");
    exercises.forEach((o, j) => assert.equal(sameResult(res, exRun[j], o.opts), i === j, `${e.slug} result against ${o.slug}`));
    assert.ok(tablesIn(e.sql, Object.keys(bakerySchema(learnHtml["database.html"]))).length >= 1, e.slug);
    const flipped = { ...res, values: [...res.values].reverse() };
    if (res.values.length > 1) assert.equal(sameResult(flipped, res, e.opts), !e.opts.ordered, e.slug + ": row order counts only when asked");
    assert.equal(sameResult({ ...res, values: res.values.slice(1) }, res, e.opts), false, e.slug + ": a missing row");
    const wider = { columns: ["x", ...res.columns].reverse(), values: res.values.map((r) => ["junk", ...r].reverse()) };
    assert.ok(sameResult(wider, res, e.opts), e.slug + ": extra columns, other order, other names");
  });
});

test("exercises: the order rule, the needed columns, the number tolerance", () => {
  assert.deepEqual(checkOptions({}), { ordered: false, need: null, tol: 1e-6 });
  assert.deepEqual(checkOptions({ ordered: "", need: "0,3", tolerance: "0.01" }), { ordered: true, need: [0, 3], tol: 0.01 });
  assert.ok(sameValue(7, "07") && sameValue(4.5, "4.50") && sameValue(21, 21.000000000000004) && sameValue(null, undefined));
  assert.ok(!sameValue(null, 0) && !sameValue("a", "A") && !sameValue(3.33, 3.32));
  assert.ok(sameValue(3.325, 3.32, 0.01) && sameValue(3.33, 3.32, 0.01) && !sameValue(3.34, 3.32, 0.01));
  const sol = { columns: ["id", "name"], values: [[4, "Croissant"], [6, "Almond croissant"]] };
  assert.ok(sameResult({ columns: ["name"], values: [["Almond croissant"], ["Croissant"]] }, sol, { need: [1] }), "only the name is asked");
  assert.ok(!sameResult({ columns: ["name"], values: [["Almond croissant"], ["Croissant"]] }, sol), "the id too, by default");
  assert.ok(sameResult(null, { columns: ["a"], values: [] }) && !sameResult(null, sol));
  assert.deepEqual(tablesIn("SELECT 1 FROM orders o JOIN order_item oi ON 1 ORDER BY 1", ["customer", "order_item", "orders", "product"]), ["order_item", "orders"]);
});

test("exercises: every Try it link names a question; the page keeps its static content and loads its module", () => {
  const ids = exercises.map((e) => e.slug);
  for (const f of learnPages)
    for (const [, slug] of learnHtml[f].matchAll(/exercises\.html#([\w-]+)/g)) assert.ok(ids.includes(slug), f + " links " + slug);
  const page = learnHtml["exercises.html"];
  assert.equal((page.match(/<details class="solution">/g) || []).length, 20);
  assert.match(page, /<section id="workbench" class="workbench" hidden/, "the interactive part shows only once the script runs");
  assert.match(page, /<script type="module" src="exercises\.js"><\/script>/);
  assert.match(page, /class="dialect" href="grammar\.html"/, "the terminal's link to the grammar");
  assert.match(strictHtml(strictCheck("SELECT name FROM product WHERE price == 2", bakerySchema(learnHtml["database.html"])), ""), /href="select-where\.html#double-equals"/);
  assert.doesNotMatch(page + fs.readFileSync("site/learn/exercises.js", "utf8"), /[^\n -~]/, "pure ASCII");
});

test("exercises: the level shown first and the question each level button selects", () => {
  const items = [["a", "Warm-up"], ["b", "Warm-up"], ["c", "Practice"], ["d", "Challenge"], ["e", "Challenge"]].map(([slug, level]) => ({ slug, level }));
  assert.equal(startLevel(items, [], null), "Warm-up");
  assert.equal(startLevel(items, ["a", "b"], null), "Practice", "the first level with a question left");
  assert.equal(startLevel(items, [], "d"), "Challenge", "the linked question's level wins");
  assert.equal(startLevel(items, ["a", "b", "c", "d", "e"], null), "Warm-up", "all solved: the first level");
  assert.equal(levelPick(items, "Challenge", ["d"]).slug, "e", "its first unsolved question");
  assert.equal(levelPick(items, "Warm-up", ["a", "b"]).slug, "a", "all solved: its first question");
  const page = learnHtml["exercises.html"];
  const levels = [...page.matchAll(/<h2>([^<]*)<\/h2>\n<p class="exercise"/g)].map((m) => m[1]);
  assert.deepEqual(levels, ["Warm-up", "Practice", "Challenge"], "each level heading opens its questions");
  assert.match(page, /<div id="ex-static">\n<h2>Warm-up<\/h2>/, "the static questions, hidden by the script only");
  assert.match(page, /<details class="howto"><summary class="label">HOW TO USE THIS PAGE<\/summary>/, "closed by default, titled like HISTORY");
  assert.ok(page.indexOf('class="howto"') < page.indexOf('id="workbench"'), "above the workbench in the HTML, read without JavaScript");
  const js = fs.readFileSync(LEARN + "exercises.js", "utf8");
  assert.match(js, /bench\.querySelector\("\.wb-question"\)\.prepend\(howto\)/, "the script moves it above the question choice");
  assert.match(page, /<p id="ex-status" class="ex-status" aria-live="polite" hidden><\/p>/, "no empty frame");
  assert.doesNotMatch(js, /Run a query: the result is checked here|Solved\. Your result matched|Solved\. That is the answer/, "the solved mark says it alone");
  assert.match(page, /<span class="label">SCHEMA<\/span><span class="erd-legend muted wb-legend">[\s\S]*?<\/span>\n    <\/span><button type="button" id="btn-erd" class="quiet" title="Enlarge the schema" aria-label="Enlarge the schema"><\/button>/);
  assert.match(js, /erdButtonHtml\(large\)/, "the game's Enlarge/Close icon");
  assert.doesNotMatch(page, /class="in-game"/, "no In the game line on the exercises page (owner, 2026-10-20)");
  assert.match(page, /<span id="ex-solved" class="ex-solved" hidden>&#x2713; Solved<\/span>/);
  assert.match(page, /<details class="ex-history"><summary class="label">HISTORY<\/summary><ol id="history"><\/ol><\/details>/);
  // the game's ad box under the bakery schema, the house ad linking the handbook; no other handbook page has one
  const box = (h) => one(h, /(<details id="press-box"[\s\S]*?<\/details>)/, "ad box");
  assert.equal(box(page).replace(/\.\.\/handbook-ad/g, "handbook-ad").replace('href="./"', 'href="learn/" target="_blank" rel="noopener"').replace(/<!--[\s\S]*?-->\s*/g, ""),
    box(fs.readFileSync("site/index.html", "utf8")), "the same box as the game's");
  assert.ok(page.indexOf('id="press-box"') > page.indexOf("<!-- /bakery schema -->") && page.indexOf('id="press-box"') < page.indexOf('<div class="wb-terminal">'), "under the schema");
  for (const f of learnPages) if (f !== "exercises.html") assert.doesNotMatch(learnHtml[f], /press-box|adsbygoogle/, f + " carries no ad");
  assert.match(fs.readFileSync("site/privacy.html", "utf8"), /ritz\.exercises\.history/);
});

test("chapter_queries milestones: 1, 5 and 20 queries, once each, catching up one per run", () => {
  assert.equal(queryMilestone(0, 0), 0);
  assert.equal(queryMilestone(1, 0), 1);
  assert.equal(queryMilestone(2, 1), 0, "already sent");
  assert.equal(queryMilestone(5, 1), 5);
  assert.equal(queryMilestone(19, 5), 0);
  assert.equal(queryMilestone(20, 5), 20);
  assert.equal(queryMilestone(40, 20), 0, "nothing past 20");
  assert.equal(queryMilestone(7, undefined), 1, "a chapter begun before the tracker sends the lowest missing one first");
  assert.deepEqual(freshState().milestones, {}, "kept in the saved state");
});

test("GA guards: once per key per page load, the first three failed runs, the leave payload", () => {
  const seen = new Set();
  assert.equal(firstTime(seen, "a"), true);
  assert.equal(firstTime(seen, "a"), false, "once");
  assert.equal(firstTime(seen, "b"), true);
  const calls = [];
  globalThis.window = { gtag: (...a) => calls.push(a) };
  const ls = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: () => null } });
  try {
    assert.equal(useFeature("schema_enlarge", { chapter: 2 }), true);
    assert.equal(useFeature("schema_enlarge", { chapter: 3 }), false, "once per feature per page load");
    assert.equal(useFeature("try_it", { exercise: "x" }, "try_it:x"), true);
    assert.equal(useFeature("try_it", { exercise: "y" }, "try_it:y"), true, "try_it: once per slug");
    assert.equal(useFeature("try_it", { exercise: "x" }, "try_it:x"), false);
    assert.equal(trackOnce("leave:4", "chapter_leave", { chapter: 4 }), true);
    assert.equal(trackOnce("leave:4", "chapter_leave", { chapter: 4 }), false);
    assert.deepEqual(calls.map((c) => c[2]), [{ feature: "schema_enlarge", chapter: 2 }, { feature: "try_it", exercise: "x" }, { feature: "try_it", exercise: "y" }, { chapter: 4 }]);
  } finally {
    delete globalThis.window;
    if (ls) Object.defineProperty(globalThis, "localStorage", ls); else delete globalThis.localStorage;
  }
  const fails = {};
  assert.deepEqual(queryFail(fails, 1, null, false, { type: "no_table", why: "x" }), { kind: "error", rule: "", type: "no_table" });
  assert.deepEqual(queryFail(fails, 1, { anchor: "group-by" }, false), { kind: "refused", rule: "group-by", type: "refused" });
  assert.deepEqual(queryFail(fails, 1, null, true), { kind: "refused", rule: "cartesian", type: "refused" });
  assert.equal(queryFail(fails, 1, null, false), null, "only the first " + QUERY_FAILS);
  assert.deepEqual(queryFail(fails, 2, null, false), { kind: "error", rule: "", type: "other" }, "counted per chapter");
  assert.deepEqual(freshState().fails, {}, "kept in the saved state");
  assert.deepEqual(freshState().hints, [], "hint_open once per chapter, kept in the saved state");
  const chapters = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ n }));
  const s = { ...freshState(), solved: [1, 2], opened: { 3: 1000 }, queries: { 3: 7 } };
  assert.deepEqual(chapterLeave(s, chapters, 61000), { chapter: 3, mode: "learn", seconds: 60, queries: 7 });
  assert.equal(chapterLeave({ ...s, opened: {} }, chapters, 61000), null, "a chapter never opened");
  assert.equal(chapterLeave({ ...s, solved: [1, 2, 3, 4, 5, 6, 7, 8], opened: { 8: 1 } }, chapters), null, "Part I done, the code not given: nothing open");
  assert.equal(levelId("Warm-up"), "warm-up");
  assert.deepEqual([runOutcome(null, null), runOutcome("e", null), runOutcome("e", { anchor: "x" }), runOutcome("e", true)], ["ok", "error", "refused", "refused"]);
});

const monitor = await import("./site/monitor.js");
test("monitor: the chapter funnel from GA rows, devices, raw data, every value escaped", () => {
  const rows = [
    { chapter: "1", event: "chapter_open", count: "(not set)", users: 474 },
    { chapter: "1", event: "chapter_queries", count: "1", users: 300 },
    { chapter: "1", event: "chapter_queries", count: "5", users: 200 },
    { chapter: "1", event: "chapter_queries", count: "20", users: 40 },
    { chapter: "1", event: "chapter_solve", count: "(not set)", users: 127 },
    { chapter: "2", event: "chapter_open", count: "(not set)", users: 120 },
    { chapter: "(not set)", event: "game_finish", count: "(not set)", users: 9 }];
  assert.deepEqual(monitor.funnel(rows), [
    { chapter: 1, opened: 474, q1: 300, q5: 200, q20: 40, solved: 127 },
    { chapter: 2, opened: 120, q1: 0, q5: 0, q20: 0, solved: 0 }]);
  const html = monitor.funnelHtml(rows);
  assert.ok(html.includes("Finished a part: 9 users") && html.includes("<summary>Raw data</summary><button") && html.includes('data-k="Chapter I"'));
  assert.ok(html.includes("<td>I</td>") && html.includes("<td>II</td>") && html.includes("<th>Solve rate</th>") && html.includes('>27%<') && html.includes('>0%<'), "roman chapters, the solve rate in the raw data");
  assert.ok(html.includes("<th>Retention</th>") && html.includes('>100%<') && html.includes('>25%<'), "retention in the raw data: 120 of chapter I's 474");
  assert.ok(html.includes("Retention (right axis)") && !html.includes("Solve rate (right axis)"), "the legend names the line");
  const sr = monitor.solveRateHtml(rows);
  assert.ok(sr.includes('data-k="Chapter I" data-v="127 of 474 solved (27%)"') && sr.includes('data-v="0 of 120 solved (0%)"'), "the solve rate tooltip");
  assert.ok(sr.includes("<summary>Raw data</summary><button") && sr.includes("<td>II</td>") && sr.includes(">27%<"), "its own raw data");
  const fresh = monitor.funnelHtml(rows.filter(r => r.event !== "chapter_queries"));
  assert.ok(!fresh.includes("new event") && !fresh.includes("within about a day"), "no placeholder note: zeros are zeros (owner, 2026-10-24)");
  assert.equal(monitor.ROMAN[12], "XII");
  assert.equal(monitor.pct(1, 0), "-");
  const dev = monitor.donutSection("devices", { res: { rows: [["<b>desktop", 20], ["mobile", 10]] } }, "opened");
  assert.ok(dev.indexOf("&#60;b&#62;desktop") < dev.indexOf("mobile") && !dev.includes("<b>desktop"), "escaped, largest first");
  assert.ok(dev.includes(">67%<") && dev.includes("<th>Players who opened a chapter</th>") && dev.includes('data-v="20 players'), "share, raw data and tooltip follow the metric");
  assert.ok(!dev.includes("<select") && dev.includes("counts in both slices"), "no select of its own, the note follows the page's Count");
  const users = monitor.usersHtml([{ date: "20261022", users: 5 }, { date: "20261021", users: 10 }]);
  assert.ok(users.indexOf("2026-10-21") < users.indexOf("2026-10-22") && users.includes("width:100%") && users.includes("width:50%"));
  const dn = { devices: { res: { rows: [["mobile", 1]] } }, channels: { res: { rows: [["Organic Search", 1]] } } };
  const all = monitor.statsHtml({ users: [], chapters: [], countries: [{ country: "<script>", users: 3 }] }, 640, null, { dn });
  assert.ok(!all.includes("<script>") && all.includes("Organic Search") && !all.includes("CHAPTER FUNNEL"), "Global has no funnel any more");
  const full = monitor.statsHtml({ users: [{ date: "20261022", users: 5 }], chapters: rows,
    countries: [{ country: "France", users: 3 }] }, 640, { land: "M0,0Z", centroids: { France: [2, 46] } },
    { dn, top: { res: { rows: [["France", 3]], totals: [3] } }, pages: { res: [{ totals: [5] }, { totals: [3] }, { rows: [] }, { totals: [1] }, { totals: [7] }] } });
  assert.equal((full.match(/<svg /g) || []).length, 5, "users, the pages donut, map, two donuts");
  assert.ok(full.indexOf(">PAGES<") > full.indexOf("COUNTRIES") && full.includes("donuts three") && !full.includes("TOP PAGES"), "PAGES shares the donuts row, the top pages table is gone (owner, 2026-10-24)");
  assert.equal((full.match(/<summary>Raw data<\/summary><button[^>]*class="quiet csv"/g) || []).length, 5, "each with its raw data under it");
  const game = monitor.gameHtml({ chapters: rows }, 640, {});
  assert.ok(game.indexOf("CHAPTER FUNNEL") < game.indexOf(">SOLVE RATE<") && game.includes("Reading..."), "the funnel moved to Game; panels read in place");
});

test("monitor charts: ticks, the line inside its plot (one day too), vertical funnel bars, tooltips", () => {
  assert.deepEqual(monitor.ticks(220), [0, 100, 200, 300]);
  assert.deepEqual(monitor.ticks(680), [0, 200, 400, 600, 800]);
  assert.deepEqual(monitor.ticks(3), [0, 1, 2, 3]);
  assert.deepEqual(monitor.ticks(0), [0, 1]);
  assert.equal(monitor.compact(1300), "1.3K");
  assert.equal(monitor.compact(42), "42");
  const svg = monitor.lineSvg([{ label: "2026-10-20", value: 220 }, { label: "2026-10-21", value: 680 }, { label: "2026-10-22", value: 0 }], 390);
  assert.match(svg, /width="390"/);
  const d = svg.match(/class="line" d="M([^"]+)"/)[1].split("L").map(p => p.split(",").map(Number));
  assert.deepEqual(d.map(p => p[0]), [40, 193, 346], "first and last day on the plot edges (390 - 40 left - 44 right)");
  assert.equal(d[2][1], 176, "zero on the baseline (200 - 24 bottom)");
  assert.ok(d[1][1] > 22 && d[1][1] < d[0][1], "the peak below the top tick, above the 220 day");
  assert.equal((svg.match(/<g class="hit"/g) || []).length, 3, "one hover strip per day");
  assert.ok(svg.includes('data-k="2026-10-21" data-v="680\tusers"') && svg.includes(">Users</text>"), "the tooltip's data and the axis title");
  assert.ok(!svg.includes("<title>"), "no native title racing the tooltip");
  const one = monitor.lineSvg([{ label: "2026-10-22", value: 7 }], 390);
  assert.match(one, /class="line" d="M193,/, "a single day in the middle");
  assert.match(one, /<rect x="40" y="22" width="306"/, "its hover strip spans the plot");
  assert.equal(monitor.tipAttrs('a"<', [["1", "x", "c1"], ["2", "y"]]), ' data-k="a&#34;&#60;" data-v="1\tx\tc1\n2\ty"');
  const f = [{ chapter: 1, opened: 400, q1: 300, q5: 200, q20: 40, solved: 100 }, { chapter: 2, opened: 0, q1: 0, q5: 0, q20: 0, solved: 0 }];
  const fs2 = monitor.funnelSvg(f, 640);
  const bars = [...fs2.matchAll(/class="bar (c\d)" d="M([\d.]+),([\d.]+)v(-[\d.]+)/g)];
  assert.deepEqual(bars.map(m => m[1]), ["c1", "c2", "c3", "c4", "c5"], "the five stages in the categorical order; an empty chapter draws nothing");
  assert.ok(bars.every(m => Number(m[3]) === 196), "every bar stands on the baseline (220 - 24 bottom)");
  assert.deepEqual(bars.map(m => Math.round(2 - Number(m[4]))), [174, 131, 87, 17, 44], "heights scaled to the top tick (400 = 174 px)");
  assert.ok(Number(bars[1][2]) > Number(bars[0][2]), "side by side, left to right");
  assert.ok(fs2.includes('data-k="Chapter I"') && fs2.includes("100%\tretention\tc6\n25%\tsolve rate") && fs2.includes("40\tRan 20\tc4") && fs2.includes(">Users</text>"));
  assert.ok(fs2.includes(">I</text>") && fs2.includes(">II</text>"), "roman numerals on the x axis");
  assert.ok(fs2.includes(">Retention</text>") && fs2.includes(">100%</text>") && fs2.includes(">0%</text>"), "the right axis, titled, 0-100%");
  assert.match(fs2, /class="rate-line" d="M180,22L460,196"/, "retention: chapter I at 100% (the top), chapter II nobody opened at 0, mid-column");
  const ret = monitor.retention([{ chapter: 1, opened: 200 }, { chapter: 3, opened: 50 }]);
  assert.equal(ret({ chapter: 3, opened: 50 }), 25, "opened N over opened I");
  assert.equal(monitor.retention([{ chapter: 2, opened: 9 }])({ chapter: 2, opened: 9 }), null, "no chapter I, no retention");
  const noBase = monitor.funnelSvg([{ chapter: 1, opened: 0, q1: 0, q5: 0, q20: 0, solved: 0 }, { chapter: 2, opened: 5, q1: 0, q5: 0, q20: 0, solved: 1 }], 640);
  assert.ok(!noBase.includes("rate-line") && noBase.includes("-\tretention\tc6"), "chapter I with no openers: no line, a dash in the tooltip");
  const ss = monitor.solveRateSvg(f, 640);
  assert.match(ss, /class="solve-line" d="M180,107.5"/, "the solve rate: 25% a quarter up (136 - 114 / 4), in the funnel's column");
  assert.equal((ss.match(/class="solve-dot"/g) || []).length, 1, "no dot for a chapter nobody opened");
  assert.ok(ss.includes(">Solve rate</text>") && ss.includes(">100%</text>") && ss.includes(">II</text>") && (ss.match(/<g class="hit"/g) || []).length === 2);
  const twelve = monitor.funnelSvg(Array.from({ length: 12 }, (_, i) => ({ chapter: i + 1, opened: 10, q1: 5, q5: 3, q20: 1, solved: 2 })), 390);
  assert.ok(twelve.includes('class="tick small"') && twelve.includes(">XII</text>"), "twelve chapters at 390 px: smaller numerals");
  assert.match(twelve, /width="390"/);
  assert.ok(!/NaN|undefined/.test(fs2 + svg + one));
});

test("monitor donuts and map: folding, arcs, area-proportional bubbles, the projection, unknown countries listed", () => {
  const items = [7, 6, 5, 4, 3, 2, 1].map((v, i) => ({ label: "k" + i, value: v }));
  assert.deepEqual(monitor.fold(items).map(i => [i.label, i.value]), [["k0", 7], ["k1", 6], ["k2", 5], ["k3", 4], ["k4", 3], ["Other", 3]]);
  assert.equal(monitor.fold(items.slice(0, 6)).length, 6, "six slices are not folded");
  const a = monitor.arcs([1, 1, 2]);
  assert.deepEqual(a.map(([x, y]) => [+(x / Math.PI).toFixed(3), +(y / Math.PI).toFixed(3)]), [[0, 0.5], [0.5, 1], [1, 2]]);
  assert.equal(monitor.arcPath(90, 90, 52, 86, 0, Math.PI / 2), "M90,4A86,86 0 0 1 176,90L142,90A52,52 0 0 0 90,38Z");
  assert.equal((monitor.arcPath(90, 90, 52, 86, 0, 2 * Math.PI).match(/M/g) || []).length, 2, "a lone slice is two halves");
  const ch = monitor.donutSection("channels", { res: { rows: [["Direct", 3], ["<i>x", 1]] } });
  assert.ok(ch.includes(">75%<") && ch.includes("&#60;i&#62;x") && !ch.includes("<i>x") && ch.includes('class="slice c2"'));
  assert.equal(monitor.bubbleR(100, 100), 40);
  assert.equal(monitor.bubbleR(25, 100), 20, "area proportional: a quarter of the users, half the radius");
  assert.equal(monitor.bubbleR(0, 100), 0);
  assert.equal(monitor.bubbleR(1, 1e6), 3, "a minimum radius stays visible");
  assert.deepEqual(monitor.project(-180, 84), [0, 0]);
  assert.deepEqual(monitor.project(180, -57), [1000, monitor.MAP.H]);
  assert.equal(monitor.countryKey("C\u00f4te d\u2019Ivoire"), "Cote d'Ivoire");
  const world = JSON.parse(fs.readFileSync("site/world.json", "utf8"));
  assert.equal(world.height, monitor.MAP.H, "the outline and the bubbles share one projection");
  assert.ok(fs.statSync("site/world.json").size < 100000, "the outline stays small");
  for (const n of ["United States", "India", "France", "United Kingdom", "Germany", "Brazil", "Cote d'Ivoire", "Turkiye", "Singapore"]) assert.ok(world.centroids[n], n);
  const [fx, fy] = monitor.project(...world.centroids.France);
  assert.ok(fx > 500 && fx < 520 && fy > 100 && fy < 110, "France in western Europe");
  const m = monitor.mapHtml([{ country: "France", users: 40 }, { country: "C\u00f4te d\u2019Ivoire", users: 10 }, { country: "<b>Narnia", users: 2 }], world);
  assert.equal((m.match(/<g class="bubble"/g) || []).length, 2, "two bubbles");
  assert.ok(m.indexOf('data-k="France"') < m.indexOf('data-k="C\u00f4te'), "the biggest drawn first, the small ones on top");
  assert.ok(m.includes("Not on the map: &#60;b&#62;Narnia (2)") && !m.includes("<b>Narnia"));
  const bare = monitor.mapHtml([{ country: "France", users: 1 }], null);
  assert.ok(bare.includes("Raw data") && !bare.includes("<svg"), "without the outline, the table alone");
});

const explore = await import("./site/explore.js");
test("explore: the request from the side panel, the pivot table sorted with GA's totals, CSV, every value escaped", () => {
  const backendSrc = fs.readFileSync("apps_script.gs", "utf8");
  const list = (name) => JSON.parse(backendSrc.match(new RegExp("var " + name + " = (\\[[\\s\\S]*?\\]);"))[1]);
  assert.deepEqual(Object.keys(explore.DIMENSIONS), list("REPORT_DIMS"), "the page offers exactly the backend's dimensions");
  assert.deepEqual(Object.keys(explore.METRICS), list("REPORT_METRICS"), "and its metrics");
  const s = { period: "30", dims: ["country", "date"], metrics: ["activeUsers"], filters: { deviceCategory: ["mobile"], browser: [] } };
  assert.deepEqual(explore.buildRequest(s), { days: 30, dimensions: ["country", "date"], metrics: ["activeUsers"], filters: { deviceCategory: ["mobile"] } });
  assert.deepEqual(explore.buildRequest({ ...s, period: "custom", start: "2026-10-01", end: "2026-10-20", filters: {} }),
    { start: "2026-10-01", end: "2026-10-20", dimensions: ["country", "date"], metrics: ["activeUsers"] });
  assert.equal(explore.buildRequest({ ...s, period: "custom", start: "" }).days, 7, "an unfinished custom range falls back to 7 days");
  assert.deepEqual(explore.valuesRequest(s, "city"), { days: 30, dimensions: ["city"], metrics: ["activeUsers"] });
  const u = new URL(explore.reportUrl("https://script.example/exec", { days: 7 }, "pass"));
  assert.deepEqual(JSON.parse(u.searchParams.get("report")), { days: 7 });
  assert.equal(u.searchParams.get("key"), "pass");
  const res = { dimensions: ["date", "country"], metrics: ["activeUsers", "averageSessionDuration"], rowCount: 5, totals: [1300, 61.25],
    rows: [["20261021", "France", 300, 50.5], ["20261020", "<b>UK", 900, 70], ["20261022", "Spain, \"north\"", 100, 12]] };
  const html = explore.pivotHtml(res);
  assert.ok(html.indexOf("&#60;b&#62;UK") > 0 && html.indexOf("&#60;b&#62;UK") < html.indexOf("France") && html.indexOf("France") < html.indexOf("Spain"), "largest first metric first");
  assert.ok(html.includes("2026-10-20") && html.includes("Active users &#9660;") && html.includes(">Avg session (s)<"));
  assert.ok(html.includes('<td colspan="2">Total (GA, each user once)</td><td class="num">1,300</td><td class="num">61.3</td>'));
  assert.ok(html.includes("Showing 3 of 5 rows"));
  assert.ok(!html.includes("<b>"));
  const byDate = explore.pivotHtml(res, { col: 0, desc: false });
  assert.ok(byDate.indexOf("2026-10-20") < byDate.indexOf("2026-10-21") && byDate.includes('aria-sort="ascending"'));
  assert.deepEqual(explore.sortRows(res, 3, false).map(r => r[3]), [12, 50.5, 70]);
  assert.equal(explore.pivotCsv(res, { col: 0, desc: true }),
    'Date,Country,Active users,Avg session (s)\n2026-10-22,"Spain, ""north""",100,12\n2026-10-21,France,300,50.5\n2026-10-20,<b>UK,900,70\n');
  assert.ok(explore.pivotHtml({ ...res, rows: [] }).includes("No rows"));
  const pick = explore.pickerHtml(explore.DIMENSIONS, ["country", "date"], "dim");
  assert.ok(pick.includes('data-dim="country" checked> Country<span class="ord">1</span>') && pick.includes('data-dim="date" checked> Date<span class="ord">2</span>'));
  const vals = explore.filterValuesHtml("country", [["<i>x", 3], ["France", 1200]], ["France"]);
  assert.ok(vals.includes('value="France" checked') && vals.includes("&#60;i&#62;x") && vals.includes("1,200") && !vals.includes("<i>"));
  assert.ok(!vals.includes("ms-search"), "no search box for a short list");
  const many = explore.filterValuesHtml("city", Array.from({ length: 11 }, (_, i) => ["c" + i, i]));
  assert.ok(many.startsWith('<input type="search" class="ms-search"') && many.includes('aria-label="Search City values"'), "a search box past 10 values");
});

test("explore: the dropdowns' buttons, the picked order, which filters show", () => {
  assert.equal(explore.chipsHtml(["country", "deviceCategory"], explore.DIMENSIONS, "Choose dimensions"),
    '<span class="chip"><b>1</b> Country</span> <span class="chip"><b>2</b> Device</span>');
  assert.equal(explore.chipsHtml([], explore.METRICS, "Choose metrics"), '<span class="muted">Choose metrics</span>');
  assert.ok(explore.chipsHtml(["<x>"], {}, "").includes("&#60;x&#62;") , "an unknown name is escaped");
  assert.ok(explore.filterSummary("country", 0).endsWith('<span class="ms-count">All</span>'));
  assert.ok(explore.filterSummary("country", 3).includes("Country</span> <span class=\"ms-count\">3 picked"));
  assert.deepEqual(explore.toggleOrder(["a", "b"], "c", true, 9), ["a", "b", "c"], "ticking appends");
  assert.deepEqual(explore.toggleOrder(["a", "b", "c"], "a", false, 9), ["b", "c"]);
  assert.deepEqual(explore.toggleOrder(["b", "c"], "a", true, 9), ["b", "c", "a"], "untick and tick again moves it last");
  assert.equal(explore.toggleOrder(["a", "b"], "c", true, 2), null, "refused over the limit");
  assert.deepEqual(explore.toggleOrder(["a", "b"], "a", true, 2), ["a", "b"]);
  const s = { dims: ["country", "date"], filters: { browser: ["Chrome"], city: [] } };
  assert.deepEqual(explore.filterDims(s, ["deviceCategory"]), ["country", "date", "deviceCategory", "browser"], "chosen first, then added, then still filtering");
  const add = explore.addableDims(s, ["deviceCategory"]);
  assert.ok(add.includes("city") && !add.includes("browser") && add.length === Object.keys(explore.DIMENSIONS).length - 4);
  const m = explore.msHtml("f-x", "S", "<p>P</p>", 'A "b"');
  assert.equal(m, '<details class="ms" id="f-x"><summary>S</summary><div class="ms-panel" role="group" aria-label="A &#34;b&#34;"><p>P</p></div></details>');
  assert.deepEqual(explore.buildRequest({ period: "7", dims: s.dims, metrics: ["sessions"], filters: s.filters }),
    { days: 7, dimensions: ["country", "date"], metrics: ["sessions"], filters: { browser: ["Chrome"] } }, "an emptied filter means All");
});

test("monitor: users per day broken down by a dimension, the countries' N", () => {
  for (const k of Object.keys(monitor.BREAKDOWNS)) assert.ok(k in shared.DIMENSIONS, k + " is in the report whitelist");
  assert.equal(explore.DIMENSIONS, shared.DIMENSIONS, "one whitelist");
  assert.deepEqual(monitor.breakdownRequest(30, "country"), { days: 30, dimensions: ["date", "country"], metrics: ["activeUsers"] });
  const rows = [["20261022", "France", 5], ["20261021", "France", 3], ["20261022", "<b>UK", 9],
    ...["A", "B", "C", "D", "E"].map((c, i) => ["20261021", c, i + 1])];
  const p = monitor.pivotSeries(rows, ["20261020"]);
  assert.deepEqual(p.dates, ["20261020", "20261021", "20261022"], "the total's days too");
  assert.equal(p.count, 7);
  assert.deepEqual(p.series.map(s => s.label), ["<b>UK", "France", "E", "D", "C"], "top 5 by users over the period");
  assert.deepEqual(p.series[1].values, [0, 3, 5], "a missing day counts 0");
  assert.deepEqual(p.series.map(s => s.cls), ["c1", "c2", "c3", "c4", "c5"]);
  assert.deepEqual(monitor.dayTip(p.series, 1), [["5", "E", "c3"], ["4", "D", "c4"], ["3", "France", "c2"], ["3", "C", "c5"], ["0", "<b>UK", "c1"]], "largest first");
  const users = [{ date: "20261021", users: 12 }, { date: "20261022", users: 14 }];
  const html = monitor.breakdownHtml({ rows }, users, "country", 390);
  assert.ok(!html.includes("<b>UK") && html.includes("&#60;b&#62;UK"), "escaped");
  assert.ok(html.includes("Top 5 of 7 countries"), "the note");
  assert.ok(html.includes("All visitors") && (html.match(/<path class="sl /g) || []).length === 6, "five lines and the total");
  assert.equal((html.match(/<g class="hit"/g) || []).length, 2, "one hover strip per day");
  assert.ok(html.includes('data-k="2026-10-22" data-v="14\tAll visitors\ttotal\n9\t&#60;b&#62;UK\tc1'), "the tooltip, sorted");
  assert.ok(html.includes("<summary>Raw data</summary><button") && html.includes("<td>2026-10-21</td>"), "date x series raw data");
  assert.ok(!monitor.breakdownHtml({ rows: rows.slice(0, 2) }, users, "country", 390).includes("Top "), "no note when every value is drawn");
  const s = { users, chapters: [], devices: [], countries: [{ country: "France", users: 3 }], channels: [] };
  assert.ok(monitor.statsHtml(s, 390, null).includes('<option value="" selected>None</option>'), "None by default, the single line");
  assert.ok(monitor.statsHtml(s, 390, null, { bd: { dim: "country" } }).includes("Reading the breakdown"), "loading in place");
  const err = monitor.statsHtml(s, 390, null, { bd: { dim: "country", error: "<i>quota" } });
  assert.ok(err.includes("Google Analytics said: &#60;i&#62;quota"), "GA's error, escaped");
  assert.ok(monitor.statsHtml(s, 390, null, { bd: { dim: "browser", res: { rows: [["20261021", "Chrome", 4]] } } }).includes('<option value="browser" selected>Browser</option>'));
  // countries: always from ?report=
  assert.ok(monitor.statsHtml(s, 390, null).includes("COUNTRIES (TOP 10)"));
  const res = { rows: [["France", 9], ["Spain", 4], ["<Narnia>", 1]] };
  assert.deepEqual(monitor.countriesFrom(res, 2), [{ country: "France", users: 9 }, { country: "Spain", users: 4 }]);
  assert.equal(monitor.countriesFrom(res, 0).length, 3, "0 = all");
  assert.deepEqual(monitor.countriesRequest(7), { days: 7, dimensions: ["country"], metrics: ["activeUsers"] });
  const all = monitor.statsHtml(s, 390, null, { top: { n: 0, res } });
  assert.ok(all.includes("COUNTRIES (ALL)") && all.includes("&#60;Narnia&#62;") && !all.includes("<Narnia>"), "every row, escaped");
  const t20 = monitor.statsHtml(s, 390, null, { top: { n: 20 } });
  assert.ok(t20.includes("COUNTRIES (TOP 20)") && t20.includes("Reading the countries"));
});

test("monitor donuts: each picks its metric, Visitors by default, loading and GA errors in place", () => {
  assert.deepEqual(monitor.donutRequest(7, "devices"), { days: 7, dimensions: ["deviceCategory"], metrics: ["activeUsers"] });
  assert.deepEqual(monitor.donutRequest(30, "channels", "solved"),
    { days: 30, dimensions: ["sessionDefaultChannelGroup"], metrics: ["totalUsers"], filters: { eventName: ["chapter_solve"] } });
  assert.deepEqual(monitor.donutRequest(7, "devices", "opened").filters, { eventName: ["chapter_open"] });
  assert.deepEqual(monitor.donutRequest(7, "devices", "engaged").metrics, ["engagedSessions"]);
  // every metric and dimension the donuts ask for is one ?report= accepts
  const back = fs.readFileSync("apps_script.gs", "utf8");
  for (const m of Object.values(monitor.COUNT_METRICS)) assert.ok(back.match(/var REPORT_METRICS = [^;]*/)[0].includes('"' + m.metric + '"'), m.metric);
  for (const d of [...Object.values(monitor.DONUTS).map(k => k.dim), "eventName"]) assert.ok(back.match(/var REPORT_DIMS = [^;]*/)[0].includes('"' + d + '"'), d);
  const s = { users: [], chapters: [], countries: [] };
  const html = monitor.statsHtml(s, 390, null);
  assert.ok(!html.includes('id="dn-') && !html.includes('id="count"'), "no per-donut select; the common one is in monitor.html");
  assert.ok(html.includes("Reading the devices") && html.includes("Reading the channels"), "loading in place");
  const err = monitor.statsHtml(s, 390, null, { m: "sessions", dn: { channels: { error: "<i>quota" } } });
  assert.ok(err.includes("Google Analytics said: &#60;i&#62;quota"), "GA's error, escaped");
  assert.ok(monitor.donutNote("channels", "sessions").includes("two channels") && monitor.donutNote("devices", "visitors").includes("more than the people"));
  assert.ok(monitor.donutSection("devices", { res: { rows: [] } }).includes('<path class="slice empty"'), "no rows: the empty ring");
});

test("monitor: one Count select drives users per day and both donuts; the five counts compared", () => {
  assert.match(fs.readFileSync("site/monitor.html", "utf8"), /<span id="days"[^]*<label class="pick">Count <select id="count"><\/select><\/label>/, "one Count select beside the period buttons");
  assert.deepEqual(Object.values(monitor.COUNT_METRICS).map(d => d.short), ["Visitors", "Opened", "Solved", "Sessions", "Engaged", "Views"]);
  assert.deepEqual(monitor.countRequest(7, ["date"], "opened"), { days: 7, dimensions: ["date"], metrics: ["totalUsers"], filters: { eventName: ["chapter_open"] } });
  assert.deepEqual(monitor.breakdownRequest(30, "browser", "sessions"), { days: 30, dimensions: ["date", "browser"], metrics: ["sessions"] });
  const s = { users: [{ date: "20261022", users: 5 }], chapters: [], countries: [] };
  // users per day: Visitors draws ?stats' users at once, any other count waits for its [date] report
  assert.ok(monitor.statsHtml(s, 390, null).includes(">Visitors</text>"), "the axis title is the count");
  assert.ok(monitor.statsHtml(s, 390, null, { m: "sessions" }).includes("Reading the days"));
  const ses = monitor.statsHtml(s, 390, null, { m: "sessions", bd: { total: { rows: [["20261021", 30], ["20261022", 40]] } } });
  assert.ok(ses.includes(">Sessions</text>") && ses.includes('data-k="2026-10-22" data-v="40\tsessions"') && ses.includes("<th>Sessions</th>"), "axis, tooltip and raw data follow the count");
  const bdh = monitor.statsHtml(s, 390, null, { m: "opened", bd: { dim: "country", total: { rows: [["20261022", 9]] }, res: { rows: [["20261022", "France", 4]] } } });
  assert.ok(bdh.includes("All players") && bdh.includes(">Players who opened a chapter</text>"), "the breakdown's total and axis too");
  const dn = { devices: { res: { rows: [["mobile", 3]] } } };
  assert.ok(monitor.statsHtml(s, 390, null, { m: "engaged", dn }).includes("3 sessions") && monitor.statsHtml(s, 390, null, { m: "engaged", dn }).includes("Counts engaged sessions"), "the donuts follow the same count");
  // the comparison
  assert.deepEqual(monitor.compareRequests(7, "country").map(([m, q]) => [m, q.metrics[0], q.dimensions[0]]),
    [["visitors", "activeUsers", "country"], ["opened", "totalUsers", "country"], ["solved", "totalUsers", "country"], ["sessions", "sessions", "country"], ["engaged", "engagedSessions", "country"], ["views", "screenPageViews", "country"]]);
  const res = { visitors: { rows: [["desktop", 60], ["mobile", 30]] }, opened: { rows: [["desktop", 20], ["mobile", 25]] }, solved: { rows: [["mobile", 5]] },
    sessions: { rows: [["desktop", 90], ["mobile", 40], ["<b>tablet", 2]] }, engaged: { rows: [["desktop", 50]] } };
  const st = monitor.stackData(res);
  assert.deepEqual(st.segs, ["desktop", "mobile", "<b>tablet"], "one order for every bar, by the sum over the bars");
  assert.deepEqual(st.bars.map(b => [b.m, b.values, b.total]), [["visitors", [60, 30, 0], 90], ["opened", [20, 25, 0], 45], ["solved", [0, 5, 0], 5], ["sessions", [90, 40, 2], 132], ["engaged", [50, 0, 0], 50], ["views", [0, 0, 0], 0]]);
  assert.ok(monitor.donutNote("devices", "views").includes("each page view sits in one slice") && monitor.statsHtml(s, 390, null, { m: "views", dn }).includes("3 page views"), "page views: own unit, no overlap");
  const many = monitor.stackData({ visitors: { rows: ["a", "b", "c", "d", "e", "f", "g"].map((c, i) => [c, 10 - i]) } });
  assert.deepEqual(many.segs, ["a", "b", "c", "d", "e", "Other"]);
  assert.deepEqual(many.bars[0].values, [10, 9, 8, 7, 6, 9], "past six, the rest folds into Other");
  assert.equal(many.bars[1].total, 0, "a metric with no rows is an empty bar");
  const svg = monitor.groupSvg(st, 390);
  assert.match(svg, /width="390"/);
  assert.equal((svg.match(/class="seg /g) || []).length, 9, "one bar per non-zero segment");
  assert.ok(svg.includes('data-k="Players who opened a chapter" data-v="25\tmobile\tc2\n56%\tof the total"'), "tooltip: metric, segment, value, share of the total");
  assert.ok(svg.includes('text-anchor="middle">132</text>') && svg.includes(">Engaged</text>") && svg.includes(">Count</text>"), "totals on top, short names below, the axis titled");
  assert.equal((svg.match(/class="val"/g) || []).length, 6, "one total per group");
  assert.ok(svg.includes(">Visitors</text>") && /y="234"[^>]*>Visitors</.test(svg) && /y="246"[^>]*>Opened</.test(svg) && monitor.groupSvg(st, 1200).includes('height="240"'), "narrow groups: names on two staggered lines");
  const bars = [...svg.matchAll(/<path class="seg c\d"[^>]* d="M([\d.]+),([\d.]+)/g)];
  assert.ok(bars.every(m => Math.abs(Number(m[2]) - 216) < 0.2), "every bar stands on the baseline (240 - 24)");
  const xs = bars.slice(0, 2).map(m => Number(m[1]));
  assert.ok(xs[1] > xs[0], "a group's bars side by side, not stacked");
  assert.ok(!svg.includes("&<b>") && svg.includes("&#60;b&#62;tablet") && !/NaN|undefined/.test(svg));
  const sec = monitor.compareSection({ dim: "country", res }, 390);
  assert.ok(sec.includes("COUNT METRICS COMPARED") && sec.includes('<option value="country" selected>Country</option>') && sec.includes("do not share a unit"), "label, select, note");
  assert.ok(sec.includes('<i class="c3"></i>&#60;b&#62;tablet') && sec.includes("<td>Sessions</td>") && sec.includes('<td class="num">132</td>'), "legend and the metric x segment raw data");
  assert.ok(monitor.compareSection({}, 390).includes('<option value="sessionDefaultChannelGroup" selected>Channel</option>') && monitor.compareSection({}, 390).includes("Reading the five counts"), "Channel by default, loading in place");
  assert.ok(monitor.compareSection({ error: "<i>x" }, 390).includes("&#60;i&#62;x"));
  for (const d of Object.keys(monitor.STACKS)) assert.ok(fs.readFileSync("apps_script.gs", "utf8").match(/var REPORT_DIMS = [^;]*/)[0].includes('"' + d + '"'), d);
});

test("monitor countries follow the Count: units, labels, the overlap note, GA's totals for the top N and for all", () => {
  assert.deepEqual(monitor.countriesRequest(30, "solved"), { days: 30, dimensions: ["country"], metrics: ["totalUsers"], filters: { eventName: ["chapter_solve"] } });
  assert.deepEqual(monitor.countriesRequest(7, "sessions"), { days: 7, dimensions: ["country"], metrics: ["sessions"] });
  assert.deepEqual(monitor.countriesRequest(7, "ran", monitor.LEARN).filters, { eventName: ["exercise_run"], pagePath: { beginsWith: ["/learn/"] } }, "scoped");
  const world = JSON.parse(fs.readFileSync("site/world.json", "utf8"));
  const s = { users: [], chapters: [], countries: [{ country: "France", users: 3 }] };
  assert.ok(monitor.countriesSection(world, { n: 10 }, "visitors").includes("Reading the countries"), "Visitors too reads ?report=");
  const vis = monitor.countriesSection(world, { n: 10, res: { rows: [["France", 3]], totals: [3] } }, "visitors");
  assert.ok(vis.includes("3 visitors") && vis.includes('aria-label="Visitors by country"') && vis.includes("<th>Visitors</th>") && vis.includes("in two countries counts in both bubbles"), "Visitors");
  assert.ok(vis.includes("<p>The one country: 3 visitors.</p>") && vis.includes("<tfoot><tr><td>All countries (GA&#39;s total)</td><td class=\"num\">3</td>"), "every country shown: GA's total alone");
  // the Top cuts the list: GA's own total for the top N (a country filter), its share of GA's total for all
  const big = { rows: [["France", 900], ["Spain", 300], ["Italy", 2]], totals: [1100] }, req = monitor.countriesRequest(7, "solved", monitor.LEARN);
  assert.deepEqual(monitor.topTotalRequest(req, big, 2), { days: 7, dimensions: [], metrics: ["totalUsers"],
    filters: { eventName: ["chapter_solve"], pagePath: { beginsWith: ["/learn/"] }, country: ["France", "Spain"] } }, "the top N as a filter, the Count's own");
  assert.equal(monitor.topTotalRequest(req, big, 3), null, "nothing cut, no request");
  assert.equal(monitor.topTotalRequest(req, big, 0), null, "All, no request");
  const cut = monitor.countriesSection(world, { n: 2, res: big, sub: { rows: [[1050]], totals: [1050] } }, "solved");
  assert.ok(cut.includes("<p>Top 2: 1,050 players, 95% of 1,100 in all 3 countries.</p>"), "GA's numbers, never the rows' sum (1,200)");
  assert.ok(cut.includes("<td>Top 2 (GA&#39;s total)</td><td class=\"num\">1050</td>") && cut.includes("<td>All countries (GA&#39;s total)</td><td class=\"num\">1100</td>"), "both totals in the raw data");
  assert.ok(monitor.countriesSection(world, { n: 2, res: big }, "solved").includes("Top 2: reading GA&#39;s total..."), "reading in place");
  const ses = monitor.countriesSection(world, { n: 10, res: { rows: [["France", 12], ["Spain", 4]] } }, "sessions");
  assert.ok(ses.includes("12 sessions") && ses.includes("<th>Sessions</th>") && ses.includes('aria-label="Sessions by country"') && !ses.includes(" users"), "units follow");
  assert.ok(ses.includes(monitor.overlapNote("in two countries", "sessions", "bubbles").slice(0, 30)) && ses.includes("one person&#39;s sessions"), "the donuts' note");
  assert.ok(monitor.statsHtml(s, 390, world, { m: "opened", top: { n: 10 } }).includes("Reading the countries"), "statsHtml passes the Count");
});

test("a missing GA value reads (empty), never null or undefined", () => {
  const bad = /\bnull\b|\bundefined\b/;
  const map = monitor.mapHtml([{ country: null, users: 2 }, { country: undefined, users: 1 }], null);
  assert.ok(map.includes("(empty)") && !bad.test(map), "map raw data");
  const dn = monitor.donutSection("devices", { res: { rows: [[null, 3], ["mobile", 1]] } });
  assert.ok(dn.includes("(empty)") && !bad.test(dn), "donut");
  const st = monitor.compareSection({ dim: "country", res: { visitors: { rows: [[null, 2]] } } }, 390);
  assert.ok(st.includes("(empty)") && !bad.test(st), "grouped bars");
  assert.equal(monitor.pivotSeries([["20261021", null, 2]]).series[0].label, "(empty)");
  const res = { dimensions: ["date", "country"], metrics: ["activeUsers"], rowCount: 1, totals: null, rows: [["20261021", null, null]] };
  const pv = explore.pivotHtml(res);
  assert.ok(pv.includes("(empty)") && !bad.test(pv), "pivot");
  assert.ok(!bad.test(explore.pivotCsv(res)), "CSV");
});

test("monitor donuts: the centre is GA's own total, so both donuts agree on the visitors", () => {
  const rows = [["desktop", "70"], ["mobile", "40"]];
  const withTotal = monitor.donutSection("devices", { res: { rows, totals: [100] } }, "visitors");
  assert.ok(withTotal.includes(">100</text>") && withTotal.includes("the slices add up to 110"), "GA's 100 in the centre, the 110 explained");
  assert.ok(withTotal.includes("70%"), "shares of the people, not of the slices");
  const noTotal = monitor.donutSection("devices", { res: { rows } }, "visitors");
  assert.ok(noTotal.includes(">110</text>") && !noTotal.includes("the slices add up to 110"), "without GA's total, the sum and no note");
});

test("monitor raw data: an Export CSV button beside every Raw data toggle, and the CSV quoting", () => {
  const html = monitor.donutSection("devices", { res: { rows: [["desktop", "7"]], totals: [7] } }, "visitors");
  assert.ok(/<summary>Raw data<\/summary><button type="button" class="quiet csv" data-csv="devices">Export CSV<\/button>/.test(html));
  assert.equal(monitor.tableCsv([["Country", "Visitors"], ["Korea, South", " 3 "], ['A "b"', "1"]]),
    'Country,Visitors\r\n"Korea, South",3\r\n"A ""b""",1\r\n');
});

test("monitor views: every panel request is one ?report= accepts, the exercises match exercises.html, the new pages are deployed like monitor.html", () => {
  const back = fs.readFileSync("apps_script.gs", "utf8"), list = n => JSON.parse(back.match(new RegExp("var " + n + " = (\\[[^;]*\\]);"))[1]);
  const dims = list("REPORT_DIMS"), mets = list("REPORT_METRICS");
  for (const [view, panels] of Object.entries(monitor.PANELS)) for (const [id, f] of Object.entries(panels)) for (const q of f(7, "opened")) {
    for (const d of q.dimensions) assert.ok(dims.includes(d), view + "." + id + " " + d);
    for (const m of q.metrics) assert.ok(mets.includes(m), view + "." + id + " " + m);
    for (const d of Object.keys(q.filters || {})) assert.ok(dims.includes(d), view + "." + id + " filter " + d);
    assert.ok(q.dimensions.length <= 9 && q.metrics.length <= 10);
  }
  const page = fs.readFileSync("site/learn/exercises.html", "utf8");
  const found = [...page.matchAll(/<p class="exercise" id="([^"]+)"[^>]*><b>(\d+\. [^<]*?)\.?<\/b>/g)].map(m => [m[1], m[2]]);
  assert.deepEqual(monitor.EXERCISES, found, "slugs and titles in the page's order");
  assert.deepEqual(monitor.SECTIONS.map(s => s[0]), ["Game", "Handbook", "Desk", "Other"]);
  const yml = fs.readFileSync(".github/workflows/pages.yml", "utf8"), robots = fs.readFileSync("site/robots.txt", "utf8");
  for (const f of ["monitor-game.html", "monitor-handbook.html"]) {
    const h = fs.readFileSync("site/" + f, "utf8");
    assert.ok(yml.includes("site/" + f) && yml.includes('grep -q "monitor.js?v=$v" site/' + f), f + " versioned by the deploy");
    assert.match(robots, new RegExp("^Disallow: /" + f.replace(".", "\\.") + "$", "m"));
    assert.match(h, /<meta name="robots" content="noindex">/);
    assert.doesNotMatch(h, /[^\n -~]/, f + " is pure ASCII");
    assert.ok(monitor.DESK_PATHS.includes("/" + f));
  }
  assert.doesNotMatch(fs.readFileSync("site/sitemap.xml", "utf8"), /monitor-/);
});

test("monitor charts for the new events: GA's numbers only, empty frames and zero grids, every value escaped", () => {
  const bad = /NaN|undefined|null/;
  // empty replies: the frame, zeros on the grids, no placeholder note
  const empty = { rows: [] };
  const g = monitor.gameHtml(null, 390, Object.fromEntries(Object.entries(monitor.PANELS.game).map(([k, f]) => [k, { res: f(7).map(() => empty) }])), { total: empty });
  assert.ok(!bad.test(g) && !g.includes("No data yet") && !g.includes("within about a day") && !g.includes("Nothing in this period"));
  assert.ok(g.includes("LEFT AN UNSOLVED CHAPTER") && g.includes("AVERAGE TIME BEFORE LEAVING") && g.includes("AVERAGE QUERIES BEFORE LEAVING") && g.includes("WRONG ANSWERS AND HINTS"));
  assert.equal((g.match(/data-k="Chapter XII"/g) || []).length, 4, "chapters I-XII on the leave bars, its two average lines, wrong answers and hints");
  assert.ok(g.includes('data-k="Suspects opened" data-v="0\tusers\tc3\n0\tuses"'), "known features listed at zero");
  assert.ok(g.includes('data-k="Ad clicks (Google)" data-v="0\tclicks\tc3\n0\timpressions"'), "Google's ad clicks at zero");
  const fu = monitor.featuresHtml([{ rows: [["ad_house_click", 4, 5]] }, { rows: [[7, 300]], totals: [9, 310] }], 390, monitor.HANDBOOK_FEATURES);
  assert.ok(fu.includes('data-k="Ad clicks (Google)" data-v="9\tclicks\tc3\n310\timpressions"'), "GA's own totals");
  assert.ok(fu.indexOf("House ad clicked") < fu.indexOf("Ad clicks (Google)") && fu.indexOf("Ad clicks (Google)") < fu.indexOf("Schema enlarged"), "right after the house ad");
  assert.equal((g.match(/class="slice empty"/g) || []).length, 3, "the failure kind and both mode donuts: empty rings");
  assert.ok(g.indexOf("USERS PER DAY") < g.indexOf("CHAPTER FUNNEL") && g.includes('<option value="customEvent:mode">Mode</option>') && !g.includes('value="pageTitle"'), "users per day first, the game's breakdowns");
  const h = monitor.handbookHtml(390, Object.fromEntries(Object.entries(monitor.PANELS.handbook).map(([k, f]) => [k, { res: f(7, "ran").map(() => empty) }])), { total: empty }, "ran");
  assert.ok(!bad.test(h) && h.includes('data-k="20. Word of mouth"') && h.includes("<td>1. The cheap shelf</td>"), "every exercise at zero");
  assert.ok(h.includes('value="pageTitle"') && !h.includes('value="customEvent:mode"') && h.includes(">Readers who ran an exercise</text>"), "the handbook's breakdowns and Count");
  assert.equal((h.match(/class="slice empty"/g) || []).length, 5, "pages, devices, channels, level and outcome donuts: empty rings");
  // Global's layout on /learn/: the countries map, then PAGES, devices and channels on one row, all following the Count
  assert.ok(h.indexOf("USERS PER DAY") < h.indexOf("COUNTRIES (TOP 10)") && h.indexOf("COUNTRIES (TOP 10)") < h.indexOf('<div class="donuts three"><div>') &&
    h.indexOf('<div class="donuts three"><div>') < h.indexOf(">PAGES<") && h.indexOf("CHANNELS") < h.indexOf("EXERCISES"), "users, countries, the three donuts, then the exercises");
  assert.ok(h.includes("Counts the users who ran an exercise: a person on two devices"), "the donuts' overlap note follows the Count");
  for (const k of ["devices", "channels"]) {
    assert.ok(monitor.COUNTED.includes(k), k + " follows the Count");
    assert.deepEqual(monitor.PANELS.handbook[k](7, "ran")[0].filters, { eventName: ["exercise_run"], pagePath: { beginsWith: ["/learn/"] } }, k + " on /learn/");
  }
  const hc = monitor.handbookHtml(390, { devices: { res: [{ rows: [["mobile", 3]], totals: [2] }] } }, { total: empty }, "visitors", null, { n: 5, res: { rows: [["France", 4], ["Spain", 3], ["Italy", 1]] } });
  assert.ok(hc.includes("COUNTRIES (TOP 5)") && hc.includes("<td>Italy</td>") && hc.includes(">2</text>") && hc.includes("Reading the channels"), "every country from GA, sliced by Top; GA's total in the centre; reading in place");
  assert.ok(monitor.hbarSvg([], [["x", "c1"]], 390).includes('class="axis"'), "no rows: the empty frame");
  // the leave block reads GA's averages as they come, labelled as averages, no dot where nobody left
  const leave = monitor.leaveHtml([{ rows: [["2", 7, 95.25, 4.5], ["(not set)", 1, 1, 1]] }], 640);
  assert.ok(leave.includes('<td>II</td><td class="num">7</td><td class="num">95.3</td><td class="num">4.5</td>') && leave.includes('<td>III</td><td class="num">0</td><td class="num">-</td>'));
  assert.ok(leave.includes('data-v="7\tusers who left\tc1\n95.3 s\tavg seconds\n4.5\tavg queries"') && leave.includes("an average, not a median") && leave.includes(">Avg seconds</text>"));
  assert.equal((leave.match(/class="avg-dot"/g) || []).length, 2, "one dot per average line, chapter II only");
  // failures: the kind as a donut of GA's totals, bars from the [rule] reply, never summed from the split
  const fails = monitor.failsHtml([{ rows: [["<b>group-by", 12, 5]] }, { rows: [["group-by", "refused", "3", 7, 3], ["group-by", "refused", "4", 5, 4]] }, { rows: [["refused", 12], ["error", 4]], totals: [16] }], 390);
  assert.ok(fails.includes('data-k="&#60;b&#62;group-by" data-v="12\tfailures\tc6\n5\tusers"') && fails.includes("<td>III</td>") && !fails.includes("<b>group"));
  assert.ok(fails.indexOf("SQLite error") < fails.indexOf("Refused by") && fails.includes('data-k="Refused by the grammar check" data-v="12 failures\t75%"'), "kinds in a fixed order and colour");
  assert.ok(!monitor.failsHtml([empty, empty], 390).includes("BY KIND"), "the handbook's failures have no kind donut");
  const plain = monitor.failsHtml([{ rows: [["", 4, 2]] }, { rows: [["", "error", "1", 4, 2]] }], 390);
  assert.ok(plain.includes('data-k="SQL error"') && plain.includes("<td>SQL error</td>") && !plain.includes("(empty)"), "an empty rule reads SQL error");
  const wrong = monitor.wrongHintsHtml([{ rows: [["1", "1", 9], ["1", "3", 2]] }, { rows: [["1", 4, 6]] }], 390);
  assert.ok(wrong.includes('data-v="9\t1st wrong answer\tc1\n2\t3rd wrong answer\tc2\n4\topened the hint\tc4\n6\thint opens"') && wrong.includes("<td>XII</td>") && wrong.includes('<td>I</td><td class="num">9</td><td class="num">2</td><td class="num">4</td><td class="num">6</td>'));
  const modes = monitor.modesHtml([{ rows: [["compete", 3], ["learn", 6]], totals: [8] }, { rows: [["learn", 6], ["compete", 3]], totals: [8] }, { rows: [[20]] }]);
  assert.ok(modes.includes("8 of the 20 visitors on the game page (40%)") && modes.includes('<td>All (GA&#39;s total)</td><td class="num">8</td>') && modes.includes(">8</text>"), "GA's total (8), not 6 + 3");
  assert.ok(modes.indexOf('<i class="c1"></i><span>Learn') > 0 && modes.includes('<i class="c2"></i><span>Compete'), "learn and compete keep their colour whatever the order");
  assert.equal(monitor.gaTotal({ rows: [[20]] }), 20);
  assert.equal(monitor.gaTotal({ rows: [["a", 1], ["b", 2]] }), 0, "no total without GA's");
  const ex = monitor.exercisesHtml([{ rows: [["busy-hours", 10]] }, { rows: [["busy-hours", "ok", 4], ["busy-hours", "refused", 7]] }, { rows: [["busy-hours", 4, 3.333]] }], 390);
  assert.ok(ex.includes('<td>9. Busy hours</td><td class="num">10</td><td class="num">4</td><td class="num">40%</td><td class="num">3.3</td><td class="num">4</td><td class="num">0</td><td class="num">7</td>'));
  assert.ok(ex.indexOf("1. The cheap shelf") < ex.indexOf("9. Busy hours") && ex.indexOf("9. Busy hours") < ex.indexOf("20. Word of mouth"), "the page's order");
  // handbook pages: a donut by title, the suffix dropped, top 5 + Other named as a sum in raw data, GA's total in the centre
  const titles = ["<i>LIKE -- The Ritz Affair", "B", "C", "D", "E", "F", "G"].map((t, i) => [t, 10 - i]);
  const pages = monitor.handbookPagesHtml({ rows: titles, totals: [30] }, "visitors");
  assert.ok(pages.includes("&#60;i&#62;LIKE</span>") && !pages.includes("<i>LIKE") && !pages.includes("Ritz Affair"));
  assert.ok(pages.includes("<td>Other (sum of 2 rows)</td><td class=\"num\">9</td>") && pages.includes(">30</text>") && pages.includes("the slices add up to 49"));
  assert.deepEqual(monitor.PANELS.handbook.pages(7, "ran")[0], { days: 7, dimensions: ["pageTitle"], metrics: ["totalUsers"], filters: { eventName: ["exercise_run"], pagePath: { beginsWith: ["/learn/"] } } });
  const ch = monitor.choicesHtml([{ rows: [["challenge", 2, 5], ["warm-up", 4, 9]], totals: [5] }, { rows: [["ok", 7], ["refused", 2]], totals: [9] }]);
  assert.ok(ch.indexOf("Warm-up") < ch.indexOf("Practice") && ch.includes("9 Warm-up, 0 Practice, 5 Challenge presses") && ch.includes('data-k="Ran" data-v="7 runs\t78%"'));
  // Global's PAGES: a donut over the four sections, GA's unfiltered total in the centre, the overlap said
  const sec = monitor.pagesSection({ res: [{ totals: [5] }, { totals: [3] }, { rows: [] }, { totals: [1] }, { totals: [7] }] }, "visitors");
  assert.ok(sec.includes('class="chart donut"') && sec.includes('<i class="c3"></i><span>Desk</span><b class="num">0</b>') && sec.includes('<td>Handbook</td><td class="num">3</td>'));
  assert.ok(sec.includes(">7</text>") && sec.includes("the slices add up to 9") && sec.includes("both the game and the handbook") && sec.includes("<td>All (GA&#39;s total)</td><td class=\"num\">7</td>"));
  assert.deepEqual(monitor.sectionRequests(7, "opened")[1], { days: 7, dimensions: [], metrics: ["totalUsers"], filters: { eventName: ["chapter_open"], pagePath: { beginsWith: ["/learn/"] } } });
  assert.deepEqual(monitor.sectionRequests(7, "opened")[4], { days: 7, dimensions: [], metrics: ["totalUsers"], filters: { eventName: ["chapter_open"] } }, "the total is requested unfiltered");
  assert.ok(!("topPagesHtml" in monitor) && !("topPages" in monitor.PANELS.global), "the top pages table is gone");
  // the views' users per day are scoped to their pages
  assert.deepEqual(monitor.breakdownRequest(7, "pageTitle", "visitors", monitor.SCOPES.handbook).filters, { pagePath: { beginsWith: ["/learn/"] } });
  assert.deepEqual(monitor.breakdownRequest(7, "deviceCategory", "solved", monitor.SCOPES.game).filters, { eventName: ["chapter_solve"], pagePath: ["/", "/index.html"] });
  for (const v of ["game", "handbook"]) for (const k of monitor.VIEW_COUNTS[v]) assert.ok(monitor.metricOf(k).label, v + " " + k);
  assert.ok(monitor.panel("X", { error: "<q>" }, () => "").includes("&#60;q&#62;") && monitor.panel("X", null, () => "").includes("Reading..."));
  // the compared groups print GA's total over each group when the reply has one
  const st = monitor.stackData({ visitors: { rows: [["desktop", 6], ["mobile", 5]], totals: [9] } });
  assert.deepEqual([st.bars[0].sum, st.bars[0].total], [11, 9]);
  assert.ok(monitor.groupSvg(st, 390).includes('text-anchor="middle">9</text>'));
  const cb = monitor.chapterBarsSvg(monitor.chapterGrid({ rows: [["3", 4]] }), [["users", "c1"]], 390);
  assert.equal((cb.match(/class="bar c1"/g) || []).length, 1, "one bar, the zeros drawn as nothing");
});

test("desk: ?board= is stored and leaves the address bar, links stay bare unless storage is blocked; a stale passphrase is dropped", async () => {
  const mem = () => { const m = {}; return { m, getItem: k => m[k] ?? null, setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; } }; };
  const hist = { state: null, url: null, replaceState(s, t, u) { this.url = u; } };
  const s = mem(), board = "https://x.invalid/macros/s/ID/exec";
  assert.deepEqual(shared.deskBoard({ href: "http://h/monitor.html?board=" + encodeURIComponent(board) + "&n=1#top" }, s, hist), { board, stored: true });
  assert.equal(s.m[shared.BOARD_KEY], board);
  assert.equal(hist.url, "/monitor.html?n=1#top", "board gone, other params and the hash kept");
  hist.url = null;
  assert.deepEqual(shared.deskBoard({ href: "http://h/explore.html" }, s, hist), { board, stored: true }, "read back from storage");
  assert.equal(hist.url, null, "nothing to strip");
  const blocked = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
  assert.deepEqual(shared.deskBoard({ href: "http://h/admin.html?board=" + encodeURIComponent(board) }, blocked, hist), { board, stored: false });
  assert.equal(hist.url, null, "kept in the address bar when it could not be stored");
  const a = { getAttribute: () => "monitor-game.html", href: "" };
  shared.deskLinks(board, true, [a]); assert.equal(a.href, "monitor-game.html");
  shared.deskLinks(board, false, [a]); assert.equal(a.href, "monitor-game.html?board=" + encodeURIComponent(board));
  // a stored passphrase that does not match the hash is dropped and the gate opens
  const ss = mem(); ss.setItem(shared.DESK_KEY, "not the passphrase");
  let shown = 0;
  const d = { querySelector: () => ({ textContent: "", value: "" }), showModal: () => { shown++; } };
  const p = shared.deskPassphrase(d, ss);
  await new Promise(r => setTimeout(r, 50));
  assert.equal(shown, 1); assert.equal(ss.getItem(shared.DESK_KEY), null);
  d.returnValue = "cancel"; d.onclose();
  assert.equal(await p, "");
});

test("desk type: the five desk pages get Nunito through admin.css; the game, the handbook, the board and privacy keep the 1912 faces", () => {
  const css = fs.readFileSync("site/admin.css", "utf8");
  const faces = [...css.matchAll(/@font-face \{[^}]*font-family: "([^"]+)";[^}]*font-display: swap; src: url\((fonts\/[^)]+\.woff2)\)/g)];
  assert.deepEqual(faces.map((m) => m[1]).sort(), ["Nunito", "Nunito", "Nunito Sans", "Nunito Sans"]);
  for (const m of faces) assert.ok(fs.existsSync("site/" + m[2]), m[2] + " is self-hosted");
  assert.ok(fs.existsSync("site/fonts/OFL.txt"), "the OFL licence ships with the fonts");
  assert.match(css, /body, body \*:not\(code, pre\) \{ font-family: "Nunito Sans"[^}]*!important/);
  for (const f of ["admin.html", "monitor.html", "monitor-game.html", "monitor-handbook.html", "explore.html"]) {
    const h = fs.readFileSync("site/" + f, "utf8");
    assert.match(h, /<link rel="stylesheet" href="admin\.css">/, f + " loads admin.css");
    assert.doesNotMatch(h, /fonts\.googleapis/, f + " no longer asks Google Fonts for the 1912 faces");
  }
  for (const f of ["index.html", "leaderboard.html", "privacy.html", ...learnPages.map((f) => "learn/" + f)]) {
    const h = fs.readFileSync("site/" + f, "utf8");
    assert.doesNotMatch(h, /admin\.css|Nunito/, f + " keeps its own type");
    assert.match(h, /fonts\.googleapis\.com\/css2\?family=Playfair\+Display/, f + " still loads the 1912 faces");
  }
  for (const f of ["site/style.css", "site/learn/learn.css"]) assert.doesNotMatch(fs.readFileSync(f, "utf8"), /Nunito/, f + " stays 1912");
});

test("New investigation asks in the #reset dialog: Cancel first and focused, erasing only on its own value", () => {
  assert.equal(resetMessage("learn"), "Start a new investigation? Progress, notes and badges are erased.");
  assert.match(resetMessage("compete"), /^Abandon the season\?.*erased/);
  const d = fs.readFileSync("site/index.html", "utf8").match(/<dialog id="reset"[^>]*aria-labelledby="reset-title"[^]*?<\/dialog>/);
  assert.ok(d, "#reset is a labelled native <dialog>");
  assert.match(d[0], /<button value="" class="quiet" autofocus>Cancel<\/button>\s*<button value="ok">/);
  const ask = fs.readFileSync("site/admin.html", "utf8").match(/<dialog id="ask"[^]*?<\/dialog>/);
  assert.match(ask[0], /<button value="" class="quiet" autofocus>Cancel<\/button>\s*<button value="ok">/);
  // #names: Enter in the field submits the first button, which must be Print
  assert.match(fs.readFileSync("site/index.html", "utf8"), /<dialog id="names"[^]*?<label for="names-input">[^]*?<\/p>\s*<button value="ok">Print/);
  // the browser's own boxes survive only as askDialog's fallbacks, and on no other page
  for (const f of ["site/app.js", "site/admin.js", "site/explore.js", "site/monitor.js", "site/leaderboard.js", "site/learn/exercises.js", "site/learn/handbook.js", "site/learn/theme.js", "site/shared.js", "site/stats.js", "site/qr.js"])
    for (const m of fs.readFileSync(f, "utf8").matchAll(/^.*\b(confirm|prompt|alert)\([^)].*$/gm))
      assert.match(m[0], /askDialog\(/, f + ": " + m[0].trim());
});

test("askDialog resolves with the closing button's value, Escape's stale value cleared, fallback without <dialog>", async () => {
  const p = { textContent: "" };
  const d = { returnValue: "ok", querySelector: () => p, showModal() { assert.equal(this.returnValue, ""); this.returnValue = "ok"; this.onclose(); } };
  assert.equal(await shared.askDialog(d, "Sure?", () => assert.fail("no fallback")), "ok");
  assert.equal(p.textContent, "Sure?");
  const esc = { returnValue: "ok", querySelector: () => null, showModal() { this.onclose(); } };
  assert.equal(await shared.askDialog(esc, "x", () => "no"), "");
  assert.equal(await shared.askDialog({ querySelector: () => null }, "x", () => "fallback"), "fallback");
});

test("SQLite's errors get one plain line from the player's words and the tables on screen", () => {
  const T = { police_report: ["id", "date", "place"], interview: ["id", "person_name"] };
  const h = (m, q) => sqliteHelp(m, q, T);
  assert.deepEqual(h('near "Ritz": syntax error', "SELECT * FROM police_report WHERE place = Hotel Ritz"),
    { type: "syntax", why: "SQL stopped at Ritz. If Hotel Ritz is a value, put it in single quotes, as in place = 'Hotel Ritz'." });
  assert.match(h("no such column: Ritz", "SELECT * FROM police_report WHERE place = Ritz").why, /place = 'Ritz'/);
  assert.match(h("no such column: name", "SELECT * FROM interview WHERE name = 'x'").why, /columns are id, person_name\./);
  assert.equal(h("no such table: interviews", "SELECT * FROM interviews").why, "The table is called interview.");
  assert.match(h("no such table: police", "SELECT * FROM police report").why, /police_report, written with an underscore/);
  assert.equal(h("no such table: suspects", "SELECT * FROM suspects").why, "There is no table called suspects. The tables on the schema are: police_report, interview.");
  assert.equal(h("no such table: telegrams", "SELECT * FROM telegrams").why.includes("telegram,"), false, "a hidden table is never named");
  assert.doesNotMatch(h("no such table: telegrams", "SELECT * FROM telegrams").why, /The table is called/);
  assert.equal(h('unrecognized token: "\'Ritz"', "SELECT 1 WHERE 'Ritz").type, "unterminated");
  assert.equal(h("incomplete input", "SELECT (1").type, "incomplete");
  assert.match(h('near "FROM": syntax error', "SELECT id, FROM police_report").why, /comma just before FROM/);
  assert.equal(h('near "\u2019": syntax error', "SELECT * FROM police_report WHERE place = \u2018Ritz\u2019").type, "curly_quote");
  assert.equal(h('near "x": syntax error', "SELECT '\u2019' x x").type, "syntax", "a curly quote inside a string is fine");
  assert.equal(h("out of memory", "SELECT 1").type, "other");
  assert.equal(errorHtml("no such table: a<b", null), '<div class="error">no such table: a&lt;b</div>');
  assert.match(errorHtml("e", { why: "<i>" }), /<p class="why">&lt;i&gt;/);
});

test("date mistakes: a quoted date names the YYYYMMDD number, an unquoted one is arithmetic", () => {
  assert.equal(ymd("1912-05-18"), "19120518"); assert.equal(ymd("18/05/1912"), "19120518"); assert.equal(ymd("05/18/1912"), "19120518");
  assert.equal(ymd("1912-13-01"), ""); assert.equal(ymd("May 18"), "");
  assert.match(strictCheck("SELECT * FROM police_report WHERE date = '1912-05-17'", GAME).why, /YYYYMMDD.*as in date = 19120517\.$/, "built from what was typed");
  assert.equal(strictCheck("SELECT * FROM police_report WHERE date = '1912-05-17'", GAME).anchor, "types", "the rule is unchanged");
  assert.equal(strictCheck("SELECT * FROM police_report WHERE date = 1912-05-17", GAME), null, "valid SQL still runs");
  assert.equal(dateArithmeticNote("SELECT * FROM police_report WHERE date = 1912-05-17", GAME),
    "1912-05-17 without quotes is arithmetic: 1912 minus 5 minus 17, which is 1890. date holds dates as numbers written YYYYMMDD, as in date = 19120517.");
  assert.equal(dateArithmeticNote("SELECT * FROM police_report WHERE place = '1912-05-17'", GAME), "");
  assert.equal(FIRST_QUERY, "SELECT * FROM police_report LIMIT 5");
  assert.equal(strictCheck(FIRST_QUERY, GAME), null);
});
