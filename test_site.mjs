import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { normalise, sha256, teamKey, fmtTime, resultsLink } from "./site/shared.js";
import { freshState, migrateSave, currentChapter, part1Done, awaitingCode, competeDone, storageKey, partStats, visibleTables, unseenBadges } from "./site/state.js";
import { competeStats, eventPayload, clockStart, clockMs, watchOn, judgeWrong, TAUNTS, legendEntries, PENALTY, duration, recordQuery, mastheadChapterHtml, queryMilestone, chapterLeave, resetMessage, FIRST_QUERY, starterSql, scanRun, solveRoute, winningQuery, crackedHtml, objectiveHtml } from "./site/app.js";
import { renderResults, ROW_CAP, pushHistory, highlightSql, formatSql, cartesian, SQL_KEYWORDS, strictHtml, sqliteHelp, errorHtml, dateArithmeticNote, suggestSql, SUGGEST_FUNCS, SUGGEST_KEYWORDS, SUGGEST_MAX, runSql, runHtml, columns, blankLiterals } from "./site/terminal.js";
import { strictCheck, SQLITE_FUNCS, toSqlite, ilike, ymd } from "./site/strict.js";
import { detectBadges, BADGES, rank, FILM_LINES, seenFilms, eggText, EGG_ROWS } from "./site/badges.js";
import { metSuspects, foundSuspects, suspectsOn, boardSuspects, cardPicture } from "./site/suspects.js";
import { richText, themeButtonHtml, erdButtonHtml, calloutLeft, showCallouts } from "./site/ui.js";
import { track, GA_ID, consentDefaults, CONSENT_REGIONS, ADS_ON, ADS_CLIENT, AD_SLOT, adSlotHtml, adOutcome, AD_WAIT_MS, europeanZone, cmpLive, consentPath, googleStats, CMP_WAIT_MS, firstTime, trackOnce, useFeature, queryFail, QUERY_FAILS } from "./site/stats.js";
import * as onb from "./site/onboarding.js";
import { shareText, shareLinks, shareHtml, SHARE_URL } from "./site/endings.js";
import { execFileSync } from "node:child_process";
import * as shared from "./site/shared.js";
import { levelId } from "./site/learn/exercises.js";
import { openHowto, howtoHtml } from "./site/howto.js";

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
  assert.deepEqual(ev("suspects", { faces: 1 }), ["Paparazzo"]);
  assert.deepEqual(ev("suspects", { faces: 0 }), [], "an empty gallery earns nothing");
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

test("How it's done: each chapter's box opens with every accepted answer, as submitAnswer types it, and not otherwise", async () => {
  const data = JSON.parse(fs.readFileSync("site/chapters.json", "utf8"));
  const key = fs.readFileSync("solution.sql", "utf8").split("\n").filter(l => /^-- {3,}\d+\. /.test(l)).map(l => l.slice(40).trim());
  const want = JSON.parse(execFileSync("python3", ["-c", "import json, generate_db as g, plot; V = g.plant_values(1912); " +
    "print(json.dumps([g.howto_payload(V, c) for c in plot.CHAPTERS]))"], { encoding: "utf8" }));
  assert.equal(key.length, 12);
  for (const ch of data.chapters) {
    const full = normalise(key[ch.n - 1]), typed = [key[ch.n - 1], ...(ch.answer_sha256.length > 1 ? [full.split(" ").pop()] : [])];
    for (const t of typed) {
      const norm = normalise(t), i = ch.answer_sha256.indexOf(await sha256(norm));
      assert.ok(i >= 0, "chapter " + ch.n + " accepts " + t);
      assert.deepEqual(await openHowto(ch.howto, norm, i), want[ch.n - 1], "chapter " + ch.n + " opens with " + t);
    }
    assert.equal(await openHowto(ch.howto, "not the answer", 0), null);
    assert.equal(await openHowto(ch.howto, full, 5), null, "no such form");
  }
  const html = howtoHtml(want[6]);
  assert.match(html, /^<details class="howto-done"><summary>How it's done<\/summary><ol><li>/);
  assert.equal((html.match(/<pre class="sql-view">/g) || []).length, want[6].sql.length);
  assert.match(html, /The answer:/);
  assert.equal(howtoHtml(null), "", "an older save shows nothing extra");
  assert.equal(howtoHtml({ steps: ["<b>`x`</b>"], sql: [["", "SELECT 1"]] }).includes("&lt;b&gt;<code>x</code>"), true);
  assert.deepEqual(freshState().howto, {});
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
  assert.equal(mastheadChapterHtml(1, 8, false), "Chapter <b>I</b> of VIII");
  assert.equal(mastheadChapterHtml(3, 8, true), "Reviewing chapter <b>III</b> of VIII");
  assert.equal(mastheadChapterHtml(12, 12, false), "Chapter <b>XII</b> of XII");
  for (const h of [mastheadChapterHtml(9, 12, true), mastheadChapterHtml(8, 8, false)]) assert.equal(h.match(/<b>/g).length, 1);
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

// --- The strict terminal (PostgreSQL's rules, site/strict.js strictCheck) --------------------------------------
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
  const grammar = fs.readdirSync("site/learn").filter((f) => f.endsWith(".html")).sort().map((f) => fs.readFileSync("site/learn/" + f, "utf8")).join("\n");
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

test("europeanZone: Europe's time zones wait for the banner's Yes, the rest are counted at once", () => {
  for (const tz of ["Europe/Paris", "Europe/London", "Atlantic/Reykjavik", "Atlantic/Canary", "Arctic/Longyearbyen", "", undefined])
    assert.equal(europeanZone(tz), true, tz);
  for (const tz of ["America/New_York", "Asia/Kolkata", "Africa/Casablanca", "Atlantic/Bermuda", "Australia/Sydney"])
    assert.equal(europeanZone(tz), false, tz);
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
  const err = t => ({ kind: "error", rule: "", type: t }), refused = rule => ({ kind: "refused", rule, type: "refused" });
  assert.equal(queryFail(fails, 1, { kind: "ok" }), null, "a run that worked is no failure");
  assert.deepEqual(queryFail(fails, 1, err("no_table")), err("no_table"));
  assert.deepEqual(queryFail(fails, 1, refused("group-by")), refused("group-by"));
  assert.deepEqual(queryFail(fails, 1, refused("cartesian")), refused("cartesian"));
  assert.equal(queryFail(fails, 1, err("other")), null, "only the first " + QUERY_FAILS);
  assert.deepEqual(queryFail(fails, 2, err("other")), err("other"), "counted per chapter");
  assert.deepEqual(freshState().fails, {}, "kept in the saved state");
  assert.deepEqual(freshState().hints, [], "hint_open once per chapter, kept in the saved state");
  const chapters = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ n }));
  const s = { ...freshState(), solved: [1, 2], opened: { 3: 1000 }, queries: { 3: 7 } };
  assert.deepEqual(chapterLeave(s, chapters, 61000), { chapter: 3, mode: "learn", seconds: 60, queries: 7 });
  assert.equal(chapterLeave({ ...s, opened: {} }, chapters, 61000), null, "a chapter never opened");
  assert.equal(chapterLeave({ ...s, solved: [1, 2, 3, 4, 5, 6, 7, 8], opened: { 8: 1 } }, chapters), null, "Part I done, the code not given: nothing open");
  assert.equal(levelId("Warm-up"), "warm-up");
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
  for (const f of [...fs.readdirSync("site").map(f => "site/" + f), ...fs.readdirSync("site/learn").map(f => "site/learn/" + f)].filter(f => f.endsWith(".js")))
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

test("starterSql: chapter I's first query until a first chapter I run or a solve", () => {
  assert.equal(starterSql(freshState()), FIRST_QUERY);
  assert.equal(starterSql({ ...freshState(), queries: { 1: 1 } }), "");
  assert.equal(starterSql({ ...freshState(), solved: [1] }), "", "a reviewed or later chapter starts empty");
});

test("runSql: one outcome model for every terminal (comma join, refusal, SQLite error, rows, the date note)", () => {
  const T = { police_report: [["id", "INTEGER", 1], ["date", "INTEGER", 0], ["place", "TEXT", 0]], interview: [["id", "INTEGER", 1], ["person_name", "TEXT", 0]] };
  const db = q => ({ exec: sql => { if (/nope/.test(sql)) throw new Error("no such table: nope"); return q; } });
  const cols = columns(T, ["police_report"]);
  assert.deepEqual(cols, { police_report: ["id", "date", "place"] }, "columns() keeps only the tables named");
  const cart = runSql(db([]), "SELECT * FROM police_report, interview", T, cols);
  assert.deepEqual(cart.outcome, { kind: "refused", rule: "cartesian", type: "refused" });
  assert.match(cart.error, /^Two ledgers side by side/);
  assert.match(runSql(db([]), "SELECT * FROM police_report, interview", T, cols, "tables").error, /^Two tables/);
  const ref = runSql(db([]), "SELECT * FROM police_report WHERE place == 'x'", T, cols);
  assert.deepEqual(ref.outcome, { kind: "refused", rule: "double-equals", type: "refused" });
  assert.equal(ref.error, "ERROR: " + ref.strict.error);
  assert.equal(runHtml(ref, ""), strictHtml(ref.strict, ""));
  const bad = runSql(db([]), "SELECT * FROM nope", T, cols);
  assert.deepEqual(bad.outcome, { kind: "error", rule: "", type: "no_table" });
  assert.match(runHtml(bad), /There is no table called nope\. The tables on the schema are: police_report\./, "only the tables passed are named");
  const rows = { columns: ["id"], values: [[1]] };
  assert.deepEqual(runSql(db([rows]), "SELECT id FROM police_report", T, cols), { res: rows, error: null, note: "", outcome: { kind: "ok" } });
  const none = runSql(db([]), "SELECT * FROM police_report WHERE date = 1912-05-17", T, cols);
  assert.equal(none.res, null);
  assert.match(none.note, /^1912-05-17 without quotes is arithmetic/);
  assert.match(runHtml(none), /No rows\.<\/p><p class="muted">1912-05-17/);
  assert.equal(blankLiterals("a 'b' \"c\" -- d\ne /* f */"), "a             \ne        ", "strings, names and comments blanked in place");
});

test("the three terminals share one run pipeline and one editor", () => {
  for (const f of ["site/app.js", "site/onboarding.js", "site/learn/exercises.js"]) {
    const src = fs.readFileSync(f, "utf8");
    assert.match(src, /\brunSql\(/, f + " runs through runSql");
    assert.match(src, /\bwireEditor\(/, f + " wires its box with wireEditor");
    for (const own of ["strictCheck(", "sqliteHelp(", "cartesian(", "dateArithmeticNote(", "formatSql(", "wireSuggest("])
      assert.ok(!src.includes(own), f + " calls " + own + " itself");
    assert.ok(!/\.innerHTML = highlightSql/.test(src), f + " colours the box itself");
  }
  assert.ok(!fs.readFileSync("site/learn/exercises.js", "utf8").includes("app.js"), "the handbook never loads the game");
});

test("migrateSave: an old save gets every field and its onboarding step; a fresh one starts at the prologue", () => {
  assert.deepEqual(migrateSave({}), freshState());
  const old = { solved: [], totalQueries: 0, prologue: "skip", tour: false };
  assert.equal(migrateSave(old).onboarding, "tour");
  assert.ok(!("prologue" in migrateSave(old)) && !("tour" in migrateSave(old)));
  assert.equal(migrateSave({ ...old, tour: true }).onboarding, "done");
  assert.equal(migrateSave({ solved: [1, 2], prologue: "" }).onboarding, "done", "played before the prologue: never offered it");
  assert.equal(migrateSave({ solved: [], totalQueries: 4 }).onboarding, "done");
  assert.equal(migrateSave({ solved: [], totalQueries: 0, prologue: "" }).onboarding, "prologue");
  assert.equal(migrateSave({ solved: [3] }).introduced, null, "no introduced yet: the first look seeds it");
  assert.deepEqual(migrateSave({ solved: [3] }).cracked, {}, "every field of freshState");
  assert.equal(migrateSave({ onboarding: "tour", prologue: "done" }).onboarding, "tour", "a new save keeps its step");
});

test("GA feature names are literals the monitor lists", async () => {
  const monitor = await import("./site/monitor.js");
  const names = f => [...fs.readFileSync(f, "utf8").matchAll(/useFeature\(\s*([^,)]+)/g)].map(m => m[1].trim());
  const check = (files, known) => {
    for (const f of files) for (const n of names(f)) {
      const lits = n.split("?").pop().match(/"[^"]*"/g) || [];   // a name, or a ternary picking one: never built by concatenation
      assert.ok(lits.length && !n.includes("+"), f + ": a literal name, not " + n);
      for (const l of lits) assert.ok(JSON.parse(l) in known, f + ": " + l + " is not listed in monitor.js");
    }
  };
  check(["site/app.js", "site/endings.js", "site/onboarding.js", "site/ui.js", "site/terminal.js", "site/badges.js", "site/suspects.js", "site/state.js"], monitor.GAME_FEATURES);
  check(fs.readdirSync("site/learn").filter(f => f.endsWith(".js")).map(f => "site/learn/" + f), monitor.HANDBOOK_FEATURES);
});

// --- Onboarding (owner, 2026-10-25): the clerk's first morning, chapter I's callouts, the landing warm-up, the share line.
test("prologue: learn mode's first visit only, and its three steps work on the invented book", () => {
  const s = freshState();
  assert.equal(onb.prologueOn(s), true);
  assert.equal(onb.prologueOn({ ...s, mode: "compete" }), false, "never in compete");
  assert.equal(onb.prologueOn({ ...s, onboarding: "tour" }), false, "shown once");
  assert.equal(onb.prologueOn({ ...s, totalQueries: 3 }), false, "not for a game already under way");
  assert.equal(onb.tourOn(s), false, "the callouts come after the prologue");
  assert.equal(onb.tourOn({ ...s, onboarding: "tour" }), true);
  assert.equal(onb.tourOn({ ...s, onboarding: "done" }), false);
  assert.equal(onb.tourOn({ ...s, onboarding: "tour", mode: "compete" }), false);
  const where = onb.PROLOGUE_QUERY + " WHERE found_in = 'Garden'";
  assert.equal(strictCheck(onb.PROLOGUE_QUERY, onb.PROLOGUE_SCHEMA), null);
  assert.equal(strictCheck(where, onb.PROLOGUE_SCHEMA), null);
  assert.ok(onb.PROLOGUE_STEPS[1].includes("WHERE found_in = 'Garden'"), "step 2 says what to filter");
  const all = { columns: ["id", "item", "found_in", "day"], values: onb.PROLOGUE_ROWS };
  const garden = { ...all, values: onb.PROLOGUE_ROWS.filter(r => r[2] === "Garden") };
  assert.equal(onb.prologueAdvance(0, all), 1);
  assert.equal(onb.prologueAdvance(0, null), 0);
  assert.equal(onb.prologueAdvance(1, all), 1, "the whole book again does not move on");
  assert.equal(onb.prologueAdvance(1, garden), 2);
  for (const a of ["birdcage", "A birdcage", "Bird cage", "the BIRDCAGE"]) assert.ok(onb.prologueAnswer(a), a);
  for (const a of ["umbrella", "5", ""]) assert.ok(!onb.prologueAnswer(a), a);
  const data = JSON.parse(fs.readFileSync("site/chapters.json", "utf8"));
  const names = data.cast.flatMap(c => c.name.toLowerCase().split(" ")).filter(w => w.length > 3);
  const words = onb.PROLOGUE_ROWS.flat().join(" ").toLowerCase() + " " + onb.PROLOGUE_STEPS.join(" ").toLowerCase();
  for (const n of names) assert.ok(!words.includes(n), "no cast name in the prologue: " + n);
  const html = fs.readFileSync("site/index.html", "utf8");
  for (const id of ["prologue", "prologue-sql", "prologue-run", "prologue-results", "prologue-answer", "prologue-input", "prologue-submit", "prologue-done", "prologue-skip", "prologue-step"])
    assert.ok(html.includes('id="' + id + '"'), id);
  assert.ok(html.includes("Skip, I know SQL"));
});
test("callouts point at parts of the page, never at a table", () => {
  const html = fs.readFileSync("site/index.html", "utf8");
  const data = JSON.parse(fs.readFileSync("site/chapters.json", "utf8"));
  const tables = data.chapters.flatMap(c => c.tables);
  assert.ok(onb.CALLOUTS.length >= 3 && onb.CALLOUTS.length <= 4);
  for (const [sel, text] of onb.CALLOUTS) {
    const id = sel.match(/#([\w-]+)/)?.[1], cls = sel.match(/\.([\w-]+)$/)?.[1];
    assert.ok(id ? html.includes('id="' + id + '"') : html.includes('class="' + cls + '"'), sel);
    for (const t of tables) assert.ok(!text.toLowerCase().includes(t), text + " names " + t);
  }
  assert.equal(calloutLeft({ left: 300 }, 200, 390), 182, "kept inside the viewport");
  assert.equal(calloutLeft({ left: -20 }, 200, 390), 8);
  assert.equal(calloutLeft({ left: 50 }, 200, 1200), 50);
});
test("exercises tour: the game's callouts on the workbench, no solution, its GA features listed", async () => {
  const ex = await import("./site/learn/exercises.js"), monitor = await import("./site/monitor.js");
  const html = fs.readFileSync("site/learn/exercises.html", "utf8");
  const bench = html.slice(html.indexOf('id="workbench"'), html.indexOf('id="ex-static"'));
  assert.equal(ex.TOUR_STORE, "ritz.exercises.tour");
  assert.ok(ex.EX_CALLOUTS.length >= 4 && ex.EX_CALLOUTS.length <= 5);
  for (const [sel, text] of ex.EX_CALLOUTS) {
    const id = sel.match(/#([\w-]+)/)?.[1], cls = sel.match(/\.([\w-]+)$/)?.[1];
    assert.ok(id ? bench.includes('id="' + id + '"') : bench.includes('class="' + cls), sel);
    assert.ok(!/SELECT|FROM|WHERE|JOIN/.test(text), "no SQL in a callout: " + text);
  }
  assert.ok("tour_done" in monitor.HANDBOOK_FEATURES && "tour_skip" in monitor.HANDBOOK_FEATURES);
  assert.equal(typeof showCallouts, "function");
});
test("landing warm-up line links the handbook's first warm-up exercise; terminal hints mention Tab", () => {
  const html = fs.readFileSync("site/index.html", "utf8"), ex = fs.readFileSync("site/learn/exercises.html", "utf8");
  const slug = html.match(/class="landing-warmup"><strong>New to SQL\?<\/strong> <a href="learn\/exercises\.html#([\w-]+)"/)[1];
  const first = ex.slice(ex.indexOf("<h2>Warm-up</h2>")).match(/class="exercise" id="([\w-]+)"/)[1];
  assert.equal(slug, first);
  assert.match(html, /<kbd>Ctrl<\/kbd><span class="plus">\+<\/span><kbd>Enter<\/kbd> run<\/span><span class="kgrp"><kbd>Tab<\/kbd> complete/);
  assert.match(ex, /<kbd>Ctrl<\/kbd><span class="plus">\+<\/span><kbd>Enter<\/kbd> run<\/span><span class="kgrp"><kbd>Tab<\/kbd> complete/);
});
test("share line: rank and count only, X and LinkedIn links carry the site", () => {
  const t = shareText(rank(25), 140);
  assert.equal(t, "I solved The Ritz Affair, a free SQL detective game, as Ganimard himself in 140 queries.");
  const l = shareLinks(t);
  assert.ok(l.x.startsWith("https://x.com/intent/post?text=") && l.x.includes(encodeURIComponent(t)) && l.x.endsWith(encodeURIComponent(SHARE_URL)));
  assert.equal(l.linkedin, "https://www.linkedin.com/sharing/share-offsite/?url=" + encodeURIComponent("https://mystery.alephb.uk/"));
  const h = shareHtml(t);
  for (const n of ["x", "linkedin", "copy", "native"]) assert.ok(h.includes('data-net="' + n + '"'), n);
  assert.ok(!/&(?!amp;)/.test(h), "ampersands escaped in the markup");
});

// --- The deploy's cache-busting (version_site.mjs, run by pages.yml on the built site/) ---------------------
test("version_site.mjs: every local script, stylesheet and relative import carries the commit; each module has one URL", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ritz-v-")), out = path.join(tmp, "site");
  try {
    fs.cpSync("site", out, { recursive: true, filter: (f) => !path.extname(f) || /\.(html|js|css)$/.test(f) });
    execFileSync("node", ["version_site.mjs", "abc1234", out]);
    const files = fs.readdirSync(out, { recursive: true }).filter((f) => /\.(html|js)$/.test(f)).map((f) => f.split(path.sep).join("/"));
    const read = (f) => fs.readFileSync(path.join(out, f), "utf8");
    const refs = (f) => f.endsWith(".html")
      ? [...read(f).matchAll(/\b(?:src|href)="([^"#]+\.(?:js|css)(?:\?[^"]*)?)"/g)].map((m) => m[1]).filter((u) => !/^([a-z]+:|\/)/i.test(u))
      : [...read(f).matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)"(\.\.?\/[^"]+)"/g)].map((m) => m[1]);
    for (const f of files) for (const u of refs(f)) assert.match(u, /\.(js|css)\?v=abc1234$/, f + ": " + u);
    // Walk each page's module graph as a browser would: every URL is versioned, and one path never has two URLs.
    const importers = new Set();
    for (const page of files.filter((f) => f.endsWith(".html"))) {
      const seen = new Map();
      const walk = (from, u) => {
        const url = new URL(u, "https://x.invalid/" + from), p = url.pathname.slice(1);
        assert.equal(url.search, "?v=abc1234", page + ": " + p + " reached from " + from);
        assert.ok(!seen.has(p) || seen.get(p) === url.href, page + ": two URLs for " + p);
        if (seen.has(p) || !p.endsWith(".js")) return;
        seen.set(p, url.href);
        assert.ok(files.includes(p), page + ": " + p + " exists");
        for (const d of refs(p)) { importers.add(p); walk(p, d); }
      };
      for (const u of refs(page)) walk(page, u);
      if (page === "learn/exercises.html") {
        for (const m of ["stats.js", "terminal.js", "strict.js", "ui.js", "shared.js", "learn/handbook.js", "learn/exercises.js"]) assert.ok(seen.has(m), "exercises.html runs " + m);
        assert.ok(!seen.has("app.js"), "exercises.html never loads the game");
      }
    }
    // every module that imports another was reached from a page and checked above
    const withImports = files.filter((f) => f.endsWith(".js") && refs(f).length);
    assert.deepEqual([...importers].sort(), withImports.sort());
    assert.ok(withImports.length >= 7);
    // theme.js stays a classic script in <head>, no defer: the stored edition is set before the first paint.
    assert.match(read("learn/index.html").split("</head>")[0], /<script src="theme\.js\?v=abc1234"><\/script>/);
    assert.match(read("learn/index.html"), /href="\.\.\/style\.css\?v=abc1234"/);
    assert.match(fs.readFileSync("site/app.js", "utf8"), /from "\.\/stats\.js";/, "the source tree is left alone");
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test("feedback form: the payload follows feedback_script.gs's rules, the page is the path alone", async () => {
  const fb = await import("./site/feedback.js");
  assert.equal(fb.pagePath({ pathname: "/learn/like.html", search: "?board=secret" }), "/learn/like.html");
  assert.deepEqual(JSON.parse(fb.feedbackPayload("  Nice game ", " a@b.co ", "/").body), { message: "Nice game", email: "a@b.co", page: "/" });
  assert.ok(fb.feedbackPayload("   ", "", "/").error);
  assert.ok(fb.feedbackPayload("x".repeat(2001), "", "/").error);
  assert.ok(fb.feedbackPayload("x".repeat(2000), "", "/").body);
  assert.ok(fb.feedbackPayload("hi", "not an email", "/").error);
  const mac = fb.clientContext({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36", language: "fr-FR", maxTouchPoints: 0 },
    { innerWidth: 1400, innerHeight: 900, devicePixelRatio: 2, screen: { width: 1512, height: 982 } }, { chapter: 3 });
  assert.deepEqual([mac.device, mac.os, mac.browser, mac.touch, mac.window, mac.screen, mac.language, mac.chapter], ["desktop", "macOS", "Chrome 141", "no", "1400x900", "1512x982", "fr-FR", "3"]);
  const iphone = fb.clientContext({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1", maxTouchPoints: 5 }, {});
  assert.deepEqual([iphone.device, iphone.os, iphone.browser], ["mobile", "iOS", "Safari 18"]);
  const win = fb.clientContext({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0" }, {});
  assert.deepEqual([win.os, win.browser], ["Windows", "Edge 141"]);
  assert.deepEqual(JSON.parse(fb.feedbackPayload("hi", "", "/", { os: "macOS" }).body).ctx, { os: "macOS" });
  assert.ok(!/pseudo|team|answer|query/i.test(Object.keys(mac).join(" ")), "never the pseudo, answers or queries");
});

test("Hint: learn nests a closed Where to look, escaped, table names as schema links; compete has none", () => {
  for (const ch of data.chapters) {
    const h = objectiveHtml("Find it.", "Answer:", "x", ch);
    assert.ok(/<details class="muted chapter-tools"><summary>Hint<\/summary>[\s\S]*<details class="hint-where"><summary>Where to look<\/summary><div>[\s\S]*<\/div><\/details><\/details>$/.test(h), "chapter " + ch.n);
    for (const t of ch.tables) assert.ok(h.includes('<button type="button" class="table-link" data-table="' + t + '"><code>' + t + "</code></button>"));
    assert.ok(!h.includes("`"), "every backticked name became a link");
  }
  const evil = objectiveHtml("o", "A:", "v", { construct: "C", tables: ["t"], where: "<img src=x> & `person` \"q\"" });
  assert.ok(evil.includes("&lt;img src=x&gt; &amp; ") && !evil.includes("<img") && evil.includes('data-table="person"'), "escaped first");
  const compete = { ...data.chapters[0] }; delete compete.where;
  const c = objectiveHtml("o", "A:", "v", compete);
  assert.ok(c.includes("chapter-tools") && !c.includes("hint-where") && !c.includes("Where to look"));
  assert.deepEqual(freshState().hintsWhere, [], "hint_where once per chapter, kept in the saved state");
});

test("unseenBadges: badges earned since the panel was opened; an older save starts with none unseen", () => {
  const s = { ...freshState(), badges: ["A", "B", "C"], badgesSeen: 1 };
  assert.equal(unseenBadges(s), 2);
  assert.equal(unseenBadges({ ...s, badgesSeen: 3 }), 0);
  assert.equal(unseenBadges(migrateSave({ badges: ["A", "B"], solved: [1] })), 0);
  assert.equal(unseenBadges(freshState()), 0);
});
