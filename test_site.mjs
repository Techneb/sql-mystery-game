import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { normalise, sha256, freshState, currentChapter, part1Done, awaitingCode, competeDone, storageKey, fmtTime, competeStats, eventPayload, renderResults, ROW_CAP, pushHistory, judgeWrong, TAUNTS, visibleTables, detectBadges, BADGES, rank, partStats, seasonUsage, nextFreeSeason, seasonLinks, nameTaken, applyConfig, currentConfig, configUrl, PENALTY, duration, highlightSql, formatSql, metSuspects, foundSuspects, FILM_LINES, seenFilms, eggText, EGG_ROWS, richText } from "./site/app.js";

const data = JSON.parse(fs.readFileSync("site/chapters.json", "utf8"));

test("normalise matches the generator's fixture", () => {
  for (const [raw, want] of data.normalise_fixture) assert.equal(normalise(raw), want, raw);
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
  assert.deepEqual([...visibleTables(data.chapters, s)].sort(), ["cab_ride", "hotel_register", "interview", "police_report"]);
  s.solved = [1, 2, 3, 4, 5, 6, 7, 8];
  assert.ok(!visibleTables(data.chapters, s).has("train_ticket"));
  s.part2 = true;
  assert.ok(visibleTables(data.chapters, s).has("train_ticket"));
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
  assert.ok(names({ ...base(), event: "solve", lines: 2 }).includes("Haiku"));
  assert.deepEqual(detectBadges(q("SELECT * FROM person"), ["Tourist", "Trespasser"]), []);
  assert.equal(BADGES.length, 37);
  assert.deepEqual(names({ event: "theme" }), ["Lamplighter"]);
});

test("rank thresholds", () => {
  assert.equal(rank(25), "Ganimard himself");
  assert.equal(rank(26), "Chief Inspector");
  assert.equal(rank(40), "Chief Inspector");
  assert.equal(rank(41), "Inspector");
  assert.equal(rank(61), "Constable");
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
  const s = { ...freshState(), mode: "compete", season: 7, team: "Alpha", solved: [1, 2, 3],
              queries: { 1: 4, 2: 6, 3: 5, 9: 100 }, wrong: { 1: 2, 3: 1, 11: 9 } };
  assert.deepEqual(competeStats(s), { queries: 15, wrong: 3 });
  assert.deepEqual(eventPayload(s, "progress", 3),
    { event: "progress", team: "Alpha", season: 7, chapter: 3, wrong: 3, queries: 15 });
  assert.equal(eventPayload(s, "start", 0).chapter, 3, "chapter defaults to the number solved");
  assert.equal(eventPayload({ ...freshState(), team: "B", season: 1 }, "start", 0).chapter, 0);
  assert.equal(fmtTime(0), "00:00");
  assert.equal(fmtTime(4000), "00:04");
  assert.equal(fmtTime(124000), "02:04");
  assert.equal(fmtTime(3600000), "60:00");
  assert.equal(fmtTime(-500), "00:00");
});

test("admin seasons: usage per season, next free number, share links", () => {
  const rows = [
    { timestamp: 100, event: "start", team: "A", season: 1 }, { timestamp: 300, event: "finish", team: "A", season: 1 },
    { timestamp: 200, event: "start", team: "B", season: 1 }, { timestamp: 50, event: "start", team: "C", season: 3 },
    { timestamp: 9, event: "start", team: "test", season: "" },
  ];
  const usage = seasonUsage(rows);
  assert.deepEqual(usage, [{ season: 1, teams: 2, last: 300 }, { season: 3, teams: 1, last: 50 }]);
  assert.equal(nextFreeSeason(usage), 2);
  assert.equal(nextFreeSeason([]), 1);
  const l = seasonLinks("https://x.uk/g/", 2, "https://s.g/exec?a=1");
  assert.equal(l.student, "https://x.uk/g/?season=2&board=https%3A%2F%2Fs.g%2Fexec%3Fa%3D1");
  assert.equal(l.leaderboard, "https://x.uk/g/leaderboard.html?data=https%3A%2F%2Fs.g%2Fexec%3Fa%3D1");
  assert.equal(seasonLinks("b/", 4, "").student, "b/?season=4");
});

test("compete refuses a name already used in the same season, whatever the case", () => {
  const rows = [{ team: "Alice", season: 2 }, { team: "Bob ", season: "3" }];
  assert.ok(nameTaken(rows, 2, " alice"));
  assert.ok(nameTaken(rows, 3, "BOB"));
  assert.ok(!nameTaken(rows, 3, "Alice"), "same name in another season is fine");
  assert.ok(!nameTaken([], 2, "Alice"));
});

test("admin settings: valid fields apply, invalid ones are refused and keep the default", () => {
  const before = currentConfig();
  try {
    assert.deepEqual(applyConfig([{ team: "x" }]), [], "an old backend answers rows: ignored");
    assert.deepEqual(applyConfig({ ranks: [10, 20, 30], penalty: { wrong: 5 }, taunts: [" A L ", "B"] }), []);
    assert.equal(rank(10), "Ganimard himself");
    assert.equal(rank(31), "Constable");
    assert.deepEqual(TAUNTS, ["A L", "B"]);
    assert.deepEqual(PENALTY, { wrong: 5 });
    assert.deepEqual(applyConfig({ ranks: [30, 20, 40], taunts: [], penalty: { wrong: -1 } }), ["ranks", "taunts", "penalty.wrong"]);
    assert.deepEqual(currentConfig().ranks, [10, 20, 30], "refused ranks change nothing");
    assert.equal(configUrl("https://s.g/exec"), "https://s.g/exec?config=1");
  } finally {
    applyConfig(before);
  }
  assert.deepEqual(currentConfig(), before);
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
  assert.ok(ev("solve", { elapsed: 90000 }).includes("Speed Reader"));
  assert.ok(!ev("solve", { elapsed: 200000 }).includes("Speed Reader"));
  assert.ok(ev("answer", { norm: "4100", decoy: 4100 }).includes("Filed Under the 17th"));
  assert.ok(!ev("answer", { norm: "4100", decoy: undefined }).includes("Filed Under the 17th"));
  assert.ok(!ev("answer", { norm: "4100", decoy: 4100, chapter: 2 }).includes("Filed Under the 17th"));
});

test("story markup: bold and italic only, everything else escaped", () => {
  assert.equal(richText("**Ganimard** has *a cat*."), "<b>Ganimard</b> has <i>a cat</i>.");
  assert.equal(richText("*'sends regards'*"), "<i>'sends regards'</i>");
  assert.equal(richText("<script>x</script> **<b>**"), "&lt;script&gt;x&lt;/script&gt; <b>&lt;b&gt;</b>");
  for (const c of data.chapters) assert.ok(!/\*/.test(richText(c.story).replace(/<\/?[bi]>/g, "")), "unbalanced markup in chapter " + c.n);
  for (const e of Object.values(data.endings)) assert.ok(!/\*/.test(richText(e)), "unbalanced markup in an ending");
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

