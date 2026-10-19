import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { normalise, sha256, freshState, currentChapter, part1Done, awaitingCode, competeDone, storageKey, fmtTime, competeStats, eventPayload, clockStart, clockMs, watchOn, renderResults, ROW_CAP, pushHistory, judgeWrong, TAUNTS, visibleTables, legendEntries, detectBadges, BADGES, rank, partStats, PENALTY, duration, highlightSql, formatSql, metSuspects, foundSuspects, suspectsOn, FILM_LINES, seenFilms, eggText, EGG_ROWS, richText, track, GA_ID, consentDefaults, CONSENT_REGIONS, ADS_ON, ADS_CLIENT, AD_SLOT, adSlotHtml, adOutcome, AD_WAIT_MS, cartesian, strictCheck, strictHtml, SQLITE_FUNCS, SQL_KEYWORDS, toSqlite, ilike, recordQuery, STRICT_SECTIONS, teamKey, themeButtonHtml, erdButtonHtml, mastheadChapterHtml, resultsLink, europeanZone, cmpLive, consentPath, googleStats, CMP_WAIT_MS } from "./site/app.js";
import { colourBlock, colourPage, bakerySchema, plainSql } from "./colour_learn.mjs";
import { execFileSync } from "node:child_process";
import * as shared from "./site/shared.js";
import { qrMatrix, qrSvg, dataPositions, MASKS, gfMul, gfExp } from "./site/qr.js";

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
  assert.equal(rank(45), "Ganimard himself");
  assert.equal(rank(46), "Chief Inspector");
  assert.equal(rank(70), "Chief Inspector");
  assert.equal(rank(71), "Inspector");
  assert.equal(rank(110), "Inspector");
  assert.equal(rank(111), "Constable");
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
  assert.equal(cmpLive({ cmpStatus: "loaded", gdprApplies: true }), true);
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
const readingOrder = ["index.html", ...[...learnHtml["index.html"].match(/<ol class="toc">([\s\S]*?)<\/ol>/)[1].matchAll(/<li><a href="([^"]+)"/g)].map((m) => m[1])];
const one = (html, re, what) => { const m = html.match(re); assert.ok(m, what); return m[1]; };
const unentity = (s) => s.replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

test("handbook: every page carries the same masthead nav, footer and chapter menu, only the current item differs", () => {
  assert.deepEqual([...readingOrder].sort(), learnPages, "the index's table of contents lists every page once");
  const nav = one(learnHtml["index.html"], /<nav class="learn-nav muted">([\s\S]*?)<\/nav>/, "index nav");
  const linked = (f) => {
    const menu = one(learnHtml[f], /<nav class="learn-menu">([\s\S]*?)<\/nav>/, f + " menu");
    assert.equal((menu.match(/class="current"/g) || []).length, 1, f + ": one current item");
    return menu.replace(/<span class="current" aria-current="page">([^<]*)<\/span>/, `<a href="${f}">$1</a>`);
  };
  const ref = linked("index.html");
  const items = [...ref.matchAll(/<a href="([^"]+)">([^<]*)<\/a>/g)];
  assert.deepEqual(items.map((m) => m[1]), readingOrder, "menu in table of contents order");
  items.slice(1).forEach((m, i) => assert.ok(m[2].startsWith(`${i + 1}. `), "menu numbered 1 to 10: " + m[2]));
  for (const f of learnPages) {
    assert.equal(one(learnHtml[f], /<nav class="learn-nav muted">([\s\S]*?)<\/nav>/, f + " nav"), nav, f + " nav");
    assert.equal(one(learnHtml[f], /<footer class="learn-foot muted">([\s\S]*?)<\/footer>/, f + " footer"), nav, f + " footer");
    assert.equal(linked(f), ref, f + " menu (the current item must be the page itself)");
  }
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
  const names = { open: "Open", close: "Close", copy: "Copy link", qr: "QR", board: "Board", csv: "Export CSV" };
  const btns = [...html.matchAll(/<button ([^>]*)>([\s\S]*?)<\/button>/g)];
  assert.deepEqual(btns.map(b => b[1].match(/data-act="(\w+)"/)[1]), Object.keys(names));
  for (const [, attrs, inner] of btns) {
    const name = names[attrs.match(/data-act="(\w+)"/)[1]];
    assert.ok(attrs.includes('title="' + name + '"') && attrs.includes('aria-label="' + name + '"'), name);
    assert.match(inner, /^<svg [^>]*aria-hidden="true"/, name + ": an svg");
    assert.equal(inner.replace(/<[^>]*>/g, "").trim(), "", name + ": no visible text");
  }
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
  assert.doesNotMatch(fs.readFileSync("site/sitemap.xml", "utf8"), /admin\.html|leaderboard\.html/);
  assert.match(fs.readFileSync("site/robots.txt", "utf8"), /^Disallow: \/admin\.html$/m);
  const yml = fs.readFileSync(".github/workflows/pages.yml", "utf8");
  for (const f of ["site/admin.html", "site/leaderboard.html", "site/admin.js", "site/leaderboard.js", "site/app.js"]) assert.ok(yml.includes(f), f);
  for (const f of ["site/admin.html", "site/admin.js", "site/admin.css", "site/leaderboard.html", "site/leaderboard.js"])
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
    ["sqlite-only", "SELECT id FROM cab_ride LIMIT 5, 10", /^LIMIT #,# syntax is not supported$/],
    ["sqlite-only", "SELECT IFNULL(occupation, 'none') FROM person", /function ifnull\(text, text\) does not exist/],
    ["sqlite-only", "SELECT id FROM cab_ride WHERE plate GLOB '75*'", /syntax error at or near "GLOB"/],
    ["sqlite-only", "SELECT id FROM cab_ride WHERE plate REGEXP '75'", /syntax error/],
    ["sqlite-only", "SELECT strftime('%Y', 'now') FROM police_report", /function strftime/],
    ["sqlite-only", "SELECT group_concat(plate) FROM cab_ride", /function group_concat/],
    ["sqlite-only", "SELECT fare || date FROM cab_ride", /^operator does not exist: integer \|\| integer$/],
    ["sqlite-only", "SELECT id FROM person WHERE name = 'x' COLLATE NOCASE", /collation "nocase"/],
    ["sqlite-only", "SELECT id FROM person WHERE occupation IS 'jeweller'", /syntax error/],
    ["sqlite-only", "SELECT MAX(fare, 3) FROM cab_ride", /function max\(integer, integer\)/],
    ["sqlite-only", "SELECT fare::text FROM cab_ride", /syntax error at or near "::"/],
    ["sqlite-only", "SELECT left(plate, 2) FROM cab_ride", /function left\(text, integer\)/],
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
  assert.match(html, /href="learn\/grammar\.html#group-by" target="_blank" rel="noopener">Grammar: GROUP BY<\/a>/);
  assert.match(strictHtml({ error: "<b>", why: "<i>", anchor: "types" }), /&lt;b&gt;.*&lt;i&gt;/, "escaped");
});

test("strict terminal: every replacement a refusal or the grammar page suggests names only functions SQLite has", () => {
  const have = new Set(JSON.parse(execFileSync("python3", ["-c",
    "import sqlite3, json; print(json.dumps([r[0] for r in sqlite3.connect(':memory:').execute('SELECT DISTINCT name FROM pragma_function_list')]))"],
    { encoding: "utf8" })));
  const grammar = fs.readFileSync("site/learn/grammar.html", "utf8");
  const writes = [...grammar.matchAll(/<tr><td>[^<]*<\/td><td>([^<]*)<\/td><\/tr>/g)].map(m => m[1]);
  assert.ok(writes.some(w => /CASE WHEN a &gt; b/.test(w)), "the Write column is read");
  const whys = Object.keys(SQLITE_FUNCS).map(f => strictCheck("SELECT " + f + "(fare, 3) FROM cab_ride", GAME).why);
  whys.push(strictCheck("SELECT MAX(fare, 3) FROM cab_ride", GAME).why, strictCheck("SELECT fare::text FROM cab_ride", GAME).why);
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
  ];
  for (const q of ok) assert.equal(strictCheck(q, GAME, true), null, q);
  for (const q of ["PRAGMA table_info(person)", "SELECT * FROM pragma_table_info('person')", "SELECT"])
    assert.equal(strictCheck(q, GAME), null, "syntax the parser does not know goes to SQLite: " + q);
});

test("strict terminal: ILIKE runs as REGEXP bound to a case-insensitive LIKE, strings untouched", () => {
  assert.equal(toSqlite("SELECT x FROM t WHERE a ILIKE '%b%' AND c NOT ilike 'ILIKE'"), "SELECT x FROM t WHERE a REGEXP '%b%' AND c NOT REGEXP 'ILIKE'");
  assert.equal(toSqlite("SELECT 1"), "SELECT 1");
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
  assert.deepEqual(Object.keys(bakery).sort(), ["customer", "order_item", "orders", "product"]);
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
  for (const a of Object.keys(STRICT_SECTIONS)) assert.match(page, new RegExp(`<h2 id="${a}">`), "section " + a);
  assert.match(page, /follows PostgreSQL's rules/);
  assert.ok(fs.readFileSync("site/index.html", "utf8").includes('class="dialect" href="learn/grammar.html"'), "the terminal's PostgreSQL label");
  assert.equal(strictCheck("SELECT id FROM orders WHERE day = 20260302", bakery).anchor, "types", "the page's text-against-number claim");
});

test("europeanZone: Europe's time zones wait for the banner's Yes, the rest are counted at once", () => {
  for (const tz of ["Europe/Paris", "Europe/London", "Atlantic/Reykjavik", "Atlantic/Canary", "Arctic/Longyearbyen", "", undefined])
    assert.equal(europeanZone(tz), true, tz);
  for (const tz of ["America/New_York", "Asia/Kolkata", "Africa/Casablanca", "Atlantic/Bermuda", "Australia/Sydney"])
    assert.equal(europeanZone(tz), false, tz);
});
