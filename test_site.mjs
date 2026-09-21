import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { normalise, sha256 } from "./site/app.js";

const data = JSON.parse(fs.readFileSync("site/chapters.json", "utf8"));

test("normalise matches the generator's fixture", () => {
  for (const [raw, want] of data.normalise_fixture) assert.equal(normalise(raw), want, raw);
});

test("sha256 of a normalised answer is 64 hex chars", async () => {
  const h = await sha256(normalise("Lord Ashcombe"));
  assert.match(h, /^[0-9a-f]{64}$/);
});
