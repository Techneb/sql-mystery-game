import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { normalise, sha256, freshState, currentChapter, part1Done, awaitingCode, competeDone, storageKey, fmtTime, competeStats, eventPayload, renderResults, ROW_CAP, pushHistory, judgeWrong, TAUNTS, visibleTables, detectBadges, BADGES, rank, partStats } from "./site/app.js";

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
                      bigTables: ["person", "cab_ride"], allTables: ["person", "cab_ride", "police_report", "lift_log"], revealed: new Set(["police_report"]), norm: "", lines: 1, hour: 12 });

test("badges fire on the right query shapes and only once", () => {
  const q = s => ({ ...base(), sql: s, rows: 3 });
  const names = ctx => detectBadges(ctx, []).map(b => b.name);
  assert.deepEqual(names(q("SELECT * FROM person")), ["Tourist", "Trespasser"]);
  assert.ok(names(q("SELECT * FROM police_report")).length === 0);
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
  assert.equal(BADGES.length, 22);
  assert.ok(!BADGES.some(([name]) => name === "Clean Sweep"), "Clean Sweep is gone while hints are off");
});

test("rank thresholds", () => {
  assert.equal(rank(25), "Ganimard himself");
  assert.equal(rank(26), "Chief Inspector");
  assert.equal(rank(40), "Chief Inspector");
  assert.equal(rank(41), "Inspector");
  assert.equal(rank(61), "Constable");
  const s = freshState(); s.queries = { 1: 5, 2: 7, 9: 100 }; s.hints = { 2: 1 };
  assert.deepEqual(partStats(s, 1, 8), { queries: 12, hints: 1 });
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
              queries: { 1: 4, 2: 6, 3: 5, 9: 100 }, hints: { 2: 1, 10: 3 }, wrong: { 1: 2, 3: 1, 11: 9 } };
  assert.deepEqual(competeStats(s), { queries: 15, hints: 1, wrong: 3 });
  assert.deepEqual(eventPayload(s, "progress", 3),
    { event: "progress", team: "Alpha", season: 7, chapter: 3, hints: 1, wrong: 3, queries: 15 });
  assert.equal(eventPayload(s, "start", 0).chapter, 3, "chapter defaults to the number solved");
  assert.equal(eventPayload({ ...freshState(), team: "B", season: 1 }, "start", 0).chapter, 0);
  assert.equal(fmtTime(0), "00:00");
  assert.equal(fmtTime(4000), "00:04");
  assert.equal(fmtTime(124000), "02:04");
  assert.equal(fmtTime(3600000), "60:00");
  assert.equal(fmtTime(-500), "00:00");
});
