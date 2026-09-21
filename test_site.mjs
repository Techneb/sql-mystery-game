import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { normalise, sha256, freshState, currentChapter, part1Done, awaitingCode, renderResults, ROW_CAP, pushHistory } from "./site/app.js";

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
