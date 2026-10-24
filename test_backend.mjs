// test_backend.mjs -- apps_script.gs in a node vm, with stubs for the Google services it calls. The Sheet stub
// coerces like the real one: a numeric-looking string becomes a number unless it starts with an apostrophe, and the
// apostrophe is not part of the value read back. Run: node --test test_backend.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import crypto from "node:crypto";

const KEY = "test passphrase";

function backend() {
  const props = new Map([["SHEET_ID", "sheet-1"], ["ADMIN_KEY", KEY]]);
  const tabs = new Map();
  const lock = { busy: false };
  const reports = [], cache = new Map();
  // GA4 Data API stub: one row per report, its dimension values named after the dimensions.
  let answer = null;   // setRunReport: a test's own GA answer (or a throw)
  const runReport = (req, property) => {
    reports.push({ req, property });
    if (answer) return answer(req);
    return { rows: [{ dimensionValues: req.dimensions.map(d => ({ value: d.name + "-v" })), metricValues: req.metrics.map((m, i) => ({ value: String(10 + i) })) }] };
  };
  const coerce = v => typeof v !== "string" ? v : v.startsWith("'") ? v.slice(1) : /^\d+(\.\d+)?$/.test(v) ? Number(v) : v;
  const newSheet = () => {
    const rows = [];
    return {
      rows,
      appendRow: r => { rows.push(r.map(coerce)); },
      getLastRow: () => rows.length,
      getRange: (r, c, nr, nc) => ({ getValues: () => rows.slice(r - 1, r - 1 + nr).map(x => x.slice(c - 1, c - 1 + nc)) }),
    };
  };
  const ctx = vm.createContext({
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props.get(k) ?? null, setProperty: (k, v) => props.set(k, String(v)) }) },
    SpreadsheetApp: {
      openById: () => ({ getSheetByName: n => tabs.get(n) || null, insertSheet: n => { const s = newSheet(); tabs.set(n, s); return s; } }),
      flush: () => {},
    },
    LockService: { getScriptLock: () => ({ tryLock: () => !lock.busy, releaseLock: () => {} }) },
    Utilities: {
      computeHmacSha256Signature: (v, k) => [...crypto.createHmac("sha256", k).update(v).digest()],
      base64EncodeWebSafe: b => Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_"),
      newBlob: s => ({ getBytes: () => [...Buffer.from(s, "utf8")] }),
    },
    AnalyticsData: { Properties: { runReport } },
    CacheService: { getScriptCache: () => ({ get: k => cache.get(k) ?? null, put: (k, v) => cache.set(k, v) }) },
    ContentService: { MimeType: { JSON: "json" }, createTextOutput: s => ({ setMimeType: () => ({ text: s }) }) },
  });
  vm.runInContext(fs.readFileSync(new URL("./apps_script.gs", import.meta.url), "utf8"), ctx);
  const post = body => JSON.parse(ctx.doPost({ postData: { contents: typeof body === "string" ? body : JSON.stringify(body) } }).text);
  const get = parameter => JSON.parse(ctx.doGet({ parameter }).text);
  const admin = (act, extra = {}) => post({ admin: act, key: KEY, ...extra });
  const create = () => admin("create", { name: "Group A", date: "2026-10-14", penalty: 30 }).season;
  return { post, get, admin, create, props, tabs, lock, reports, cache, log: () => tabs.get("log").rows, setRunReport: f => { answer = f; } };
}
const ev = (event, team, season, chapter, token, extra = {}) =>
  ({ event, team, season, chapter, wrong: 0, queries: chapter * 3, clientAt: 1700000000000, elapsedMs: chapter * 60000, token, ...extra });

test("the Sheet stub coerces like Sheets unless the value starts with an apostrophe", () => {
  const b = backend();
  b.create();
  b.tabs.get("log").appendRow(["007", "'007"]);
  assert.deepEqual(b.log().at(-1), [7, "007"]);
});

test("seasons: create, open, close; close from created; never reopened; admin key required", () => {
  const b = backend();
  assert.equal(b.post({ admin: "create", key: "wrong", name: "x", date: "2026-10-14" }).error, "wrong admin key");
  const s = b.create();
  assert.equal(s.state, "created");
  assert.match(s.id, /^[a-z0-9-]{1,40}$/);
  assert.ok(b.tabs.has("log"), "create makes the log tab, so joins never race to create it");
  assert.equal(b.admin("open", { season: s.id }).season.state, "open");
  assert.equal(b.admin("close", { season: s.id }).season.state, "closed");
  assert.ok(b.admin("close", { season: s.id }).ok, "close again: idempotent");
  assert.equal(b.admin("open", { season: s.id }).error, "a closed season cannot reopen");
  const t = b.create();
  const closed = b.admin("close", { season: t.id }).season;
  assert.equal(closed.state, "closed", "a season created by mistake can be closed");
  assert.equal(closed.openedAt, null);
  assert.equal(b.admin("open", { season: t.id }).ok, false);
  const u = b.create();
  assert.equal(b.admin("update", { season: u.id, name: "y", date: "2026-10-15" }).error, "unknown admin action", "no edit: a season is created as it plays");
});

test("join: one per pseudo after NFKC folding; '007' stays text and finishes after its seven progress rows", () => {
  const b = backend();
  const s = b.create();
  const j = b.post({ event: "join", team: "Alice", season: s.id, clientAt: 1 });
  assert.ok(j.ok && j.token && j.meta.id === s.id && typeof j.meta.now === "number", "the join reply's meta carries now");
  for (const dup of ["alice", " ALICE ", "\uff21lice"]) assert.equal(b.post({ event: "join", team: dup, season: s.id }).error, "pseudo taken", dup);
  const k = b.post({ event: "join", team: "007", season: s.id });
  assert.ok(k.ok);
  const stamp = b.log().at(-1)[0];
  assert.ok(typeof stamp === "number" && Math.abs(stamp - Date.now()) < 5000, "the timestamp is a number of ms, never a Date");
  assert.equal(b.post({ event: "join", team: "007", season: s.id }).error, "pseudo taken", "read back as text, so it matches");
  assert.equal(b.post({ event: "join", team: "=1+1", season: s.id }).ok, true, "a formula-looking pseudo is plain text now");
  assert.equal(b.post(ev("progress", "007", s.id, 1, k.token)).error, "session not open");
  b.admin("open", { season: s.id });
  assert.equal(b.post(ev("finish", "007", s.id, 8, k.token)).error, "finish before the seven progress rows");
  for (let n = 1; n <= 7; n++) assert.ok(b.post(ev("progress", "007", s.id, n, k.token)).ok, "progress " + n);
  assert.ok(b.post(ev("finish", "007", s.id, 8, k.token)).ok);
  const rows = b.get({ season: s.id });
  assert.ok(rows.every(r => r.season === s.id));
  assert.deepEqual([...new Set(rows.map(r => r.team))], ["Alice", "007", "=1+1"]);
  assert.equal(rows.filter(r => r.team === "007").length, 9);
});

test("progress: bad token, bad fields and posts after close refused; join after close refused", () => {
  const b = backend();
  const s = b.create();
  const j = b.post({ event: "join", team: "Bob", season: s.id });
  b.admin("open", { season: s.id });
  assert.equal(b.post(ev("progress", "Bob", s.id, 1, "forged")).error, "no token: join first");
  assert.equal(b.post(ev("progress", "Bob", s.id, 9, j.token)).error, "bad fields");
  assert.equal(b.post(ev("progress", "Bob", "nope", 1, j.token)).error, "no such season");
  assert.ok(b.post(ev("progress", "Bob", s.id, 1, j.token, { elapsedMs: -5, clientAt: "x" })).ok, "bad clocks: the row, empty cells");
  assert.deepEqual([...b.log().at(-1).slice(8)], ["", ""]);
  b.admin("close", { season: s.id });
  assert.equal(b.post(ev("progress", "Bob", s.id, 2, j.token)).error, "session closed");
  assert.equal(b.post({ event: "join", team: "Late", season: s.id }).error, "session closed");
});

test("busy lock: a join says busy, try again", () => {
  const b = backend();
  const s = b.create();
  b.lock.busy = true;
  assert.equal(b.post({ event: "join", team: "Eve", season: s.id }).error, "busy, try again");
  b.lock.busy = false;
  assert.ok(b.post({ event: "join", team: "Eve", season: s.id }).ok);
});

test("doGet reads: seasons, meta with now, unknown meta, rows of one season or all", () => {
  const b = backend();
  const s = b.create(), t = b.create();
  b.post({ event: "join", team: "A", season: s.id });
  b.post({ event: "join", team: "B", season: t.id });
  assert.deepEqual(b.get({ seasons: "1" }).map(x => x.id), [s.id, t.id]);
  const m = b.get({ meta: s.id });
  assert.equal(m.id, s.id);
  assert.ok(Math.abs(m.now - Date.now()) < 5000, "meta carries the server's now");
  assert.equal(b.get({ meta: "nope" }).ok, false);
  assert.deepEqual(b.get({ season: t.id }).map(r => r.team), ["B"]);
  assert.equal(b.get({}).length, 2);
  assert.equal(JSON.parse(b.props.get("SEASONS")).some(x => "now" in x), false, "now is never stored");
});

test("bodies that are not JSON objects, and our own exceptions, come back as {ok:false} JSON", () => {
  const b = backend();
  for (const body of ["null", "5", "not json", '"s"']) assert.equal(b.post(body).ok, false, body);
  b.props.delete("SHEET_ID");
  const r = b.get({ season: "s1" });
  assert.equal(r.ok, false);
  assert.match(r.error, /SHEET_ID/);
});

test("?stats: the admin key gate, days clamped to 1-90, the report shapes, cached per days value", () => {
  const b = backend();
  assert.equal(b.get({ stats: "7", key: "wrong" }).error, "wrong admin key");
  assert.equal(b.get({ stats: "7" }).ok, false);
  assert.equal(b.reports.length, 0, "no GA call without the key");
  const r = b.get({ stats: "7", key: " Test Passphrase " });
  assert.equal(r.ok, true);
  assert.equal(r.days, 7);
  assert.ok(b.reports.every(x => x.property === "properties/557203749"));
  assert.equal(b.reports[0].req.dateRanges[0].startDate, "6daysAgo");
  assert.deepEqual(r.users, [{ date: "date-v", users: 10 }]);
  assert.deepEqual(r.chapters, [{ chapter: "customEvent:chapter-v", event: "eventName-v", count: "customEvent:count-v", users: 10, events: 11 }]);
  assert.deepEqual([...b.reports[1].req.dimensionFilter.filter.inListFilter.values], ["chapter_open", "chapter_queries", "chapter_solve", "game_finish"]);
  assert.deepEqual(r.devices, [{ device: "deviceCategory-v", event: "eventName-v", users: 10 }]);
  assert.deepEqual([...b.reports[2].req.dimensionFilter.filter.inListFilter.values], ["chapter_open", "chapter_solve"]);
  assert.deepEqual(r.countries, [{ country: "country-v", users: 10 }]);
  assert.equal(b.reports[3].req.limit, 10);
  assert.deepEqual(r.channels, [{ channel: "sessionDefaultChannelGroup-v", users: 10 }]);
  const n = b.reports.length;
  assert.deepEqual(b.get({ stats: "7", key: KEY }), r, "cached");
  assert.equal(b.reports.length, n, "the cache answers");
  assert.equal(b.get({ stats: "500", key: KEY }).days, 90);
  assert.equal(b.get({ stats: "0", key: KEY }).days, 1);
  assert.equal(b.reports.at(-1).req.dateRanges[0].startDate, "today");
  assert.equal(b.get({ stats: "x", key: KEY }).days, 7);
});

test("?report: the admin key gate, the whitelist and limits, filters as an andGroup, GA's totals, cached per request", () => {
  const b = backend();
  const rep = (q, key = KEY) => b.get({ report: typeof q === "string" ? q : JSON.stringify(q), key });
  const ok = { days: 30, dimensions: ["country", "date"], metrics: ["activeUsers", "sessions"] };
  assert.equal(rep(ok, "wrong").error, "wrong admin key");
  assert.equal(b.reports.length, 0, "no GA call without the key");
  assert.equal(rep("{nope").error, "report is not JSON");
  assert.match(rep({ ...ok, dimensions: ["userId"] }).error, /unknown dimension: userId/);
  assert.match(rep({ ...ok, metrics: ["totalRevenue"] }).error, /unknown metric: totalRevenue/);
  assert.match(rep({ ...ok, filters: { userId: ["/"] } }).error, /unknown filter: userId/);
  assert.match(rep({ ...ok, dimensions: ["date", "country", "city", "browser", "language", "eventName", "deviceCategory", "operatingSystem", "sessionSource", "newVsReturning"] }).error, /at most 9 dimensions/);
  assert.equal(rep({ ...ok, metrics: [] }).error, "pick at least one metric");
  assert.equal(b.reports.length, 0, "nothing refused reaches GA");
  const r = rep({ ...ok, dimensions: ["country", "date", "country"], filters: { deviceCategory: ["mobile", "tablet"], browser: [] } });
  assert.equal(r.ok, true);
  assert.deepEqual(r.dimensions, ["country", "date"], "duplicates dropped, order kept");
  assert.deepEqual(r.rows, [["country-v", "date-v", 10, 11]]);
  const req = b.reports[0].req;
  assert.equal(b.reports[0].property, "properties/557203749");
  assert.equal(req.dateRanges[0].startDate, "29daysAgo");
  assert.equal(req.limit, 10000);
  assert.deepEqual([...req.metricAggregations], ["TOTAL"]);
  assert.equal(req.dimensionFilter.andGroup.expressions.length, 1, "an empty filter is no filter");
  assert.deepEqual(JSON.parse(JSON.stringify(req.dimensionFilter.andGroup.expressions[0])), { filter: { fieldName: "deviceCategory", inListFilter: { values: ["mobile", "tablet"] } } });
  assert.deepEqual(rep({ ...ok, filters: { deviceCategory: ["mobile", "tablet"] } }), r, "the same request is cached");
  assert.equal(b.reports.length, 1);
  rep({ ...ok, days: 7 });
  assert.equal(b.reports.length, 2, "another request is not");
  rep({ ...ok, start: "2026-10-01", end: "2026-10-20" });
  assert.deepEqual({ ...b.reports.at(-1).req.dateRanges[0] }, { startDate: "2026-10-01", endDate: "2026-10-20" });
  rep({ ...ok, days: 9999 });
  assert.equal(b.reports.at(-1).req.dateRanges[0].startDate, "424daysAgo");
  assert.equal(rep({ ...ok, dimensions: [] }).rows.length, 1, "metrics alone are a one-row report");
});

test("?report: a filter object matches exact values or prefixes, negated with not; custom metrics whitelisted", () => {
  const b = backend();
  const rep = q => b.get({ report: JSON.stringify(q), key: KEY });
  const base = { days: 7, dimensions: ["pagePath"], metrics: ["activeUsers", "averageCustomEvent:seconds", "customEvent:runs"] };
  assert.equal(rep({ ...base, filters: { pagePath: { beginsWith: ["/learn/"] }, eventName: ["page_view"] } }).ok, true);
  const exprs = JSON.parse(JSON.stringify(b.reports.at(-1).req.dimensionFilter.andGroup.expressions));
  assert.deepEqual(exprs, [{ filter: { fieldName: "eventName", inListFilter: { values: ["page_view"] } } },
    { filter: { fieldName: "pagePath", stringFilter: { matchType: "BEGINS_WITH", value: "/learn/" } } }], "one prefix is one stringFilter");
  rep({ ...base, filters: { pagePath: { exact: ["/", "/admin.html"], beginsWith: ["/learn/"], not: true } } });
  assert.deepEqual(JSON.parse(JSON.stringify(b.reports.at(-1).req.dimensionFilter.andGroup.expressions[0])), { notExpression: { orGroup: { expressions: [
    { filter: { fieldName: "pagePath", inListFilter: { values: ["/", "/admin.html"] } } },
    { filter: { fieldName: "pagePath", stringFilter: { matchType: "BEGINS_WITH", value: "/learn/" } } }] } } }, "exact or prefix, negated");
  const n = b.reports.length;
  assert.equal(rep({ ...base, filters: { pagePath: {} } }).ok, true);
  assert.equal(b.reports.at(-1).req.dimensionFilter, undefined, "an empty object is no filter");
  assert.match(rep({ ...base, filters: { pagePath: { beginsWith: Array(21).fill("/x") } } }).error, /at most 20 prefixes/);
  assert.equal(b.reports.length, n + 1);
  assert.match(rep({ ...base, metrics: ["customEvent:secret"] }).error, /unknown metric/);
});

test("?report: GA's error text comes back as {ok:false, error}, and totals are read when GA sends them", () => {
  const b = backend();
  b.setRunReport(() => { throw new Error("Please remove customEvent:chapter to make the request compatible"); });
  const bad = b.get({ report: JSON.stringify({ dimensions: ["customEvent:chapter", "sessionSource"], metrics: ["sessions"] }), key: KEY });
  assert.equal(bad.ok, false);
  assert.match(bad.error, /make the request compatible/);
  b.setRunReport(() => ({ rowCount: 42, rows: [], totals: [{ metricValues: [{ value: "1300" }] }] }));
  const r = b.get({ report: JSON.stringify({ dimensions: ["date"], metrics: ["activeUsers"] }), key: KEY });
  assert.deepEqual([r.rowCount, r.rows, r.totals], [42, [], [1300]]);
});
