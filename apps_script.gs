// apps_script.gs -- paste into a standalone Apps Script project, then Deploy > New deployment >
// Web app (Execute as: Me, Who has access: Anyone). The deployment URL is never committed: it travels in
// links (?board= for the game, ?data= for leaderboard.html, ?board= for admin.html).
// The sheet needs no manual setup: doPost creates a "log" tab and header row on first call.
//
// Script Properties (Project Settings > Script Properties):
//   SHEET_ID      the log sheet's id (required)
//   ADMIN_KEY     the admin passphrase: lets admin.html create, open, close and delete seasons (required for that)
//   TOKEN_SECRET  optional; signs the per-player tokens (falls back to ADMIN_KEY, then SHEET_ID)
//   SEASONS       written by this script (the season records), never by hand
//
// ?stats=<days>&key=<passphrase> (monitor.html) reads GA4 through the advanced service "Google Analytics Data API"
// (Services > + > Google Analytics Data API, identifier AnalyticsData), OAuth scope
// https://www.googleapis.com/auth/analytics.readonly. The account the script runs as needs Viewer on GA4 property
// 557203749, and `count` (chapter_queries) registered as an event-scoped custom dimension. ?report=<json>&key=
// (explore.html, the pivot table) runs one whitelisted GA report through the same service (report_ below).
//
// A season is a record {id, name, date, db, penalty, state, createdAt, openedAt, closedAt}; state goes
// created -> open -> closed (or created -> closed, for a season created by mistake), never back. Players "join"
// a season (one join per pseudo), then post "progress"
// and "finish" with the token "join" returned, only while the season is open; a "finish" needs its seven
// "progress" rows first. Answers are checked in the browser (the season files carry their hashes), so the
// game stays honour-based and off the marks. A season that is not open can be deleted: its record and every log
// row of it go for good, and its database is free for the next season.

var DBS = 5;   // generate_db.SEASONS: the pre-built databases site/season-1..5.*
var ID_RE = /^[a-z0-9-]{1,40}$/;

// Our own exceptions come back as JSON too, never as Google's HTML error page.
function doPost(e) {
  try { return json_(post_(e)); } catch (err) { return json_({ok: false, error: String(err)}); }
}
function doGet(e) {
  try { return json_(get_(e)); } catch (err) { return json_({ok: false, error: String(err)}); }
}

function post_(e) {
  var data;
  try { data = JSON.parse(e.postData.contents); } catch (err) { return {ok: false, error: "not JSON"}; }
  if (!data || typeof data !== "object") return {ok: false, error: "not an object"};
  if (data.admin) return locked_(function () { return admin_(data); });
  var team = String(data.team || "").trim(), id = String(data.season || "");
  if (!team || team.length > 40 || !ID_RE.test(id)) return {ok: false, error: "bad team or season"};
  var ev = String(data.event || "");
  if (ev === "join") {
    var log = getLogSheet_();   // opened before the lock: only the duplicate check and the append need it
    return locked_(function () { return join_(log, team, id, data); });
  }
  if (ev !== "progress" && ev !== "finish") return {ok: false, error: "bad fields"};
  var chapter = int_(data.chapter, 0, 8), wrong = int_(data.wrong, 0, 2000), queries = int_(data.queries, 0, 20000);
  if (chapter === null || wrong === null || queries === null) return {ok: false, error: "bad fields"};
  var season = find_(seasons_(), id);
  if (!season) return {ok: false, error: "no such season"};
  if (season.state !== "open") return {ok: false, error: season.state === "closed" ? "session closed" : "session not open"};
  if (String(data.token || "") !== token_(team, id)) return {ok: false, error: "no token: join first"};
  var sheet = getLogSheet_();
  if (ev === "finish" && countRows_(sheet, "progress", team, id) < 7) return {ok: false, error: "finish before the seven progress rows"};
  sheet.appendRow(row_(ev, team, id, chapter || "", wrong, queries, data.clientAt, data.elapsedMs));
  return {ok: true};
}

function join_(sheet, team, id, data) {
  var season = find_(seasons_(), id);
  if (!season) return {ok: false, error: "no such season"};
  if (season.state === "closed") return {ok: false, error: "session closed"};
  if (countRows_(sheet, "join", team, id) > 0) return {ok: false, error: "pseudo taken"};
  sheet.appendRow(row_("join", team, id, "", 0, 0, data.clientAt, ""));
  SpreadsheetApp.flush();   // the next join, once it holds the lock, must read this row
  return {ok: true, token: token_(team, id), meta: withNow_(season)};
}

// One log row, columns unchanged. The timestamp is a plain number of ms (Date.now()): a Date cell reads back shifted
// by the gap between the spreadsheet's time zone and the script's (7 hours on the real backend). The pseudo and the season id go in as text (a leading apostrophe): the Sheet would
// otherwise read "007" as 7, "1/2" as a date or "=x" as a formula, and the pseudo would no longer match its teamKey.
function row_(ev, team, id, chapter, wrong, queries, clientAt, elapsedMs) {
  return [Date.now(), ev, "'" + team, "'" + id, chapter, 0, wrong, queries,
          count_(clientAt, 9007199254740991), count_(elapsedMs, 86399999)];
}
// A non-negative integer up to hi, else an empty cell.
function count_(v, hi) {
  if (v === undefined || v === null || v === "") return "";
  var n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= hi ? n : "";
}

// The season record with the server's clock: the game cancels its own clock's offset with it.
function withNow_(s) {
  var o = JSON.parse(JSON.stringify(s));
  o.now = Date.now();
  return o;
}

function admin_(data) {
  if (!adminOk_(data)) return {ok: false, error: "wrong admin key"};
  var list = seasons_(), act = String(data.admin), now = Date.now(), s;
  if (act === "create") {
    var f = fields_(data);
    if (f.error) return f;
    getLogSheet_();   // creates the log tab now, under the lock, so joins never race to create it
    s = {id: "s" + now + "-" + Math.random().toString(36).slice(2, 6), name: f.name, date: f.date, db: pickDb_(list),
         penalty: f.penalty, state: "created", createdAt: now, openedAt: null, closedAt: null};
    list.push(s);
    return save_(list, s);
  }
  s = find_(list, String(data.season || ""));
  if (!s) return {ok: false, error: "no such season"};
  if (act === "open") {
    if (s.state === "open") return {ok: true, season: s};
    if (s.state !== "created") return {ok: false, error: "a closed season cannot reopen"};
    s.state = "open"; s.openedAt = now;
    return save_(list, s);
  }
  if (act === "close") {
    if (s.state === "closed") return {ok: true, season: s};
    s.state = "closed"; s.closedAt = now;   // from open, or from created (a season created by mistake frees its database)
    return save_(list, s);
  }
  if (act === "delete") {
    if (s.state === "open") return {ok: false, error: "close the season before deleting it"};
    var removed = deleteRows_(getLogSheet_(), s.id);
    var out = save_(list.filter(function (x) { return x.id !== s.id; }), s);   // pickDb_ no longer sees its database
    out.removedRows = removed;
    return out;
  }
  return {ok: false, error: "unknown admin action"};
}

function fields_(data) {
  var name = String(data.name || "").trim(), date = String(data.date || "");
  var penalty = data.penalty === undefined || data.penalty === "" ? 10 : int_(data.penalty, 0, 3600);
  if (!name || name.length > 60) return {error: "name must be 1 to 60 characters", ok: false};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return {error: "date must be YYYY-MM-DD", ok: false};
  if (penalty === null) return {error: "penalty must be 0 to 3600 seconds", ok: false};
  return {name: name, date: date, penalty: penalty};
}

// The database a new season plays: a never-used one (lowest number), else the one closed longest ago, else
// (all five busy) the one whose newest season is oldest. A reused database may be known to an earlier class.
function pickDb_(list) {
  var cands = [];
  for (var d = 1; d <= DBS; d++) {
    var mine = list.filter(function (s) { return s.db === d; });
    var active = mine.filter(function (s) { return s.state !== "closed"; });
    var tier = !mine.length ? 0 : active.length ? 2 : 1;
    var t = Math.max.apply(null, [0].concat(mine.map(function (s) { return tier === 1 ? s.closedAt || 0 : s.createdAt || 0; })));
    cands.push([tier, t, d]);
  }
  cands.sort(function (a, b) { return a[0] - b[0] || a[1] - b[1] || a[2] - b[2]; });
  return cands[0][2];
}

// ponytail: one Script Property holds 9 kB, about 40 season records; move them to a "seasons" Sheet tab past that.
function save_(list, s) {
  var txt = JSON.stringify(list);
  if (Utilities.newBlob(txt).getBytes().length > 9000) return {ok: false, error: "too many seasons for the SEASONS property"};
  PropertiesService.getScriptProperties().setProperty("SEASONS", txt);
  return {ok: true, season: s};
}

function seasons_() {
  var p = PropertiesService.getScriptProperties().getProperty("SEASONS");
  return p ? JSON.parse(p) : [];
}

function find_(list, id) {
  for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
  return null;
}

// Two joins with the same pseudo in the same second, or two admin writes, must not both read the old state.
// The game retries a "busy, try again" join once by itself. 25 simultaneous joins take about 22 s (the lock serialises
// them, about 0.9 s each), hence the 30 s wait; the game waits 40 s for a reply.
function locked_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return {ok: false, error: "busy, try again"};
  try { return fn(); } finally { lock.releaseLock(); }
}

// ?seasons=1 -> every season record; ?meta=<id> -> one record plus the server's `now`; ?season=<id> -> that
// season's rows; nothing -> every row (the admin page's export).
function get_(e) {
  var p = (e && e.parameter) || {};
  if (p.seasons) return adminOk_({key: p.key}) ? seasons_() : {ok: false, error: "wrong admin key"};
  if (p.report) return report_(p);
  if (p.stats) return stats_(p);
  if (p.meta) {
    var m = find_(seasons_(), String(p.meta));
    return m ? withNow_(m) : {ok: false, error: "no such season"};
  }
  var sheet = getLogSheet_();
  var rows = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 10).getValues() : [];
  var id = p.season ? String(p.season) : null;
  if (id === null && !adminOk_({key: p.key})) return {ok: false, error: "wrong admin key"};   // every season's rows: the desk only
  var out = [];
  rows.forEach(function (r) {
    if (id !== null && String(r[3]) !== id) return;
    out.push({timestamp: r[0].getTime ? r[0].getTime() : r[0], event: r[1], team: r[2], season: r[3],
              chapter: r[4], hints: r[5], wrong: r[6], queries: r[7], clientAt: r[8] || null, elapsedMs: r[9] || null});
  });
  return out;
}
// --- GA4 numbers for monitor.html -------------------------------------------------------------
var GA_PROPERTY = "properties/557203749";
var FUNNEL_EVENTS = ["chapter_open", "chapter_queries", "chapter_solve", "game_finish"];

// The last <days> days (1-90, default 7), cached 10 minutes per days value: the GA Data API has a daily quota.
function stats_(p) {
  if (!adminOk_({key: p.key})) return {ok: false, error: "wrong admin key"};
  var n = Math.floor(Number(p.stats)), days = isFinite(n) ? Math.min(90, Math.max(1, n)) : 7;
  var cache = CacheService.getScriptCache(), ck = "stats-" + days, hit = cache.get(ck);
  if (hit) return JSON.parse(hit);
  var range = {startDate: days === 1 ? "today" : (days - 1) + "daysAgo", endDate: "today"};
  var run = function (dims, metrics, more) {
    var req = {dateRanges: [range], dimensions: dims.map(function (d) { return {name: d}; }),
               metrics: metrics.map(function (m) { return {name: m}; })};
    for (var k in more || {}) req[k] = more[k];
    var res = AnalyticsData.Properties.runReport(req, GA_PROPERTY);
    return (res.rows || []).map(function (r) {
      return r.dimensionValues.map(function (v) { return v.value; }).concat(r.metricValues.map(function (v) { return Number(v.value); }));
    });
  };
  var top = function (metric, limit) { return {orderBys: [{metric: {metricName: metric}, desc: true}], limit: limit}; };
  var out = {
    ok: true, days: days,
    users: run(["date"], ["activeUsers"], {orderBys: [{dimension: {dimensionName: "date"}}]})
      .map(function (r) { return {date: r[0], users: r[1]}; }),
    chapters: chapters_(run),
    devices: run(["deviceCategory", "eventName"], ["totalUsers"], events_(["chapter_open", "chapter_solve"]))
      .map(function (r) { return {device: r[0], event: r[1], users: r[2]}; }),
    countries: run(["country"], ["activeUsers"], top("activeUsers", 10)).map(function (r) { return {country: r[0], users: r[1]}; }),
    channels: run(["sessionDefaultChannelGroup"], ["activeUsers"], top("activeUsers", 20)).map(function (r) { return {channel: r[0], users: r[1]}; })
  };
  cache.put(ck, JSON.stringify(out), 600);
  return out;
}

// Without `count` registered in GA the split fails: fall back to the funnel without the 1 / 5 / 20 columns.
function chapters_(run) {
  var map = function (r) { return {chapter: r[0], event: r[1], count: r[2], users: r[3], events: r[4]}; };
  try {
    return run(["customEvent:chapter", "eventName", "customEvent:count"], ["totalUsers", "eventCount"], events_(FUNNEL_EVENTS)).map(map);
  } catch (err) {
    return run(["customEvent:chapter", "eventName"], ["totalUsers", "eventCount"], events_(FUNNEL_EVENTS))
      .map(function (r) { return map([r[0], r[1], "", r[2], r[3]]); });
  }
}
// --- ?report=<json>&key= for explore.html (the pivot table) ------------------------------------
// json = {days | start, end, dimensions: [...], metrics: [...], filters: {dimension: [values] | {exact, beginsWith, not}}}.
// Only the whitelisted names below (shared.js DIMENSIONS and explore.js METRICS, a test checks they match), at most 9
// dimensions and 10 metrics (GA's limits); filters become an andGroup: a list is an inListFilter, an object matches its
// exact values or any of its beginsWith prefixes (an orGroup), negated when not is true (monitor.js's page sections).
// Event-scoped custom metrics come as customEvent:<param> (the sum) and averageCustomEvent:<param> (GA's average per event). GA refuses some combinations: its error text comes back as
// {ok:false, error} through doGet. Cached 10 minutes per normalised request.
var REPORT_DIMS = ["date", "eventName", "customEvent:chapter", "customEvent:count", "customEvent:mode", "customEvent:part",
  "customEvent:name", "deviceCategory", "operatingSystem", "browser", "country", "city", "language",
  "sessionDefaultChannelGroup", "sessionSource", "newVsReturning", "pagePath", "pageTitle", "customEvent:kind",
  "customEvent:rule", "customEvent:n", "customEvent:feature", "customEvent:exercise", "customEvent:level", "customEvent:outcome"];
var REPORT_METRICS = ["activeUsers", "totalUsers", "newUsers", "sessions", "engagedSessions", "eventCount",
  "userEngagementDuration", "averageSessionDuration", "screenPageViews", "customEvent:seconds", "averageCustomEvent:seconds",
  "customEvent:queries", "averageCustomEvent:queries", "customEvent:runs", "averageCustomEvent:runs", "customEvent:wrong",
  "averageCustomEvent:wrong", "publisherAdClicks", "publisherAdImpressions", "totalAdRevenue"];
var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function report_(p) {
  if (!adminOk_({key: p.key})) return {ok: false, error: "wrong admin key"};
  var q;
  try { q = JSON.parse(p.report); } catch (err) { return {ok: false, error: "report is not JSON"}; }
  if (!q || typeof q !== "object") return {ok: false, error: "report is not an object"};
  var names = function (list, allowed, max, what) {
    if (!Array.isArray(list)) throw new Error(what + "s must be a list");
    var out = [];
    list.forEach(function (n) {
      if (allowed.indexOf(n) < 0) throw new Error("unknown " + what + ": " + String(n).slice(0, 40));
      if (out.indexOf(n) < 0) out.push(n);
    });
    if (out.length > max) throw new Error("at most " + max + " " + what + "s");
    return out;
  };
  var dims = names(q.dimensions || [], REPORT_DIMS, 9, "dimension");
  var metrics = names(q.metrics || [], REPORT_METRICS, 10, "metric");
  if (!metrics.length) return {ok: false, error: "pick at least one metric"};
  var range;
  if (DATE_RE.test(String(q.start)) && DATE_RE.test(String(q.end)) && q.start <= q.end) range = {startDate: q.start, endDate: q.end};
  else {
    var n = Math.floor(Number(q.days)), days = isFinite(n) ? Math.min(425, Math.max(1, n)) : 7;
    range = {startDate: days === 1 ? "today" : (days - 1) + "daysAgo", endDate: "today"};
  }
  var filters = [], f = q.filters && typeof q.filters === "object" ? q.filters : {};
  Object.keys(f).sort().forEach(function (d) {
    if (REPORT_DIMS.indexOf(d) < 0) throw new Error("unknown filter: " + String(d).slice(0, 40));
    var str = function (v) { return String(v).slice(0, 200); }, list = function (v) { return Array.isArray(v) ? v : []; };
    var o = f[d], exact = Array.isArray(o) ? o : o && typeof o === "object" ? list(o.exact) : [];
    var begins = Array.isArray(o) || !o || typeof o !== "object" ? [] : list(o.beginsWith);
    if (exact.length > 500) throw new Error("at most 500 values per filter");
    if (begins.length > 20) throw new Error("at most 20 prefixes per filter");
    var ex = (exact.length ? [{filter: {fieldName: d, inListFilter: {values: exact.map(str)}}}] : []).concat(begins.map(function (v) {
      return {filter: {fieldName: d, stringFilter: {matchType: "BEGINS_WITH", value: str(v)}}};
    }));
    if (!ex.length) return;
    var e = ex.length === 1 ? ex[0] : {orGroup: {expressions: ex}};
    filters.push(o && o.not === true ? {notExpression: e} : e);
  });
  var req = {dateRanges: [range], dimensions: dims.map(function (d) { return {name: d}; }),
             metrics: metrics.map(function (m) { return {name: m}; }), metricAggregations: ["TOTAL"],
             orderBys: [{metric: {metricName: metrics[0]}, desc: true}], limit: 10000};
  if (filters.length) req.dimensionFilter = {andGroup: {expressions: filters}};
  var norm = JSON.stringify(req);
  var cache = CacheService.getScriptCache();
  var ck = "report-" + Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(norm, "report"));
  var hit = cache.get(ck);
  if (hit) return JSON.parse(hit);
  var res = AnalyticsData.Properties.runReport(req, GA_PROPERTY);
  var nums = function (vals) { return (vals || []).map(function (v) { return Number(v.value); }); };
  var out = {ok: true, range: range, dimensions: dims, metrics: metrics, rowCount: res.rowCount || 0,
    rows: (res.rows || []).map(function (r) {
      return (r.dimensionValues || []).map(function (v) { return v.value; }).concat(nums(r.metricValues));
    }),
    totals: res.totals && res.totals[0] ? nums(res.totals[0].metricValues) : null};
  // ponytail: CacheService refuses values over 100 KB, so a big report is simply not cached.
  try { cache.put(ck, JSON.stringify(out), 600); } catch (err) {}
  return out;
}

function events_(names) { return {dimensionFilter: {filter: {fieldName: "eventName", inListFilter: {values: names}}}}; }

function int_(v, lo, hi) {
  if (v === undefined || v === null || v === "") return lo === 0 ? 0 : null;
  var n = Number(v);
  return Number.isInteger(n) && n >= lo && n <= hi ? n : null;
}

// Pseudos compare NFKC-folded, trimmed, lowercased (shared.js teamKey, the same in admin.html and the board).
function teamKey_(name) {
  var s = String(name);
  return (s.normalize ? s.normalize("NFKC") : s).trim().toLowerCase();
}

// A token per player and season: HMAC of the pseudo, so it needs no storage and cannot be guessed without the secret.
function token_(team, id) {
  var props = PropertiesService.getScriptProperties();
  var secret = props.getProperty("TOKEN_SECRET") || props.getProperty("ADMIN_KEY") || props.getProperty("SHEET_ID");
  var sig = Utilities.computeHmacSha256Signature(teamKey_(team) + "|" + id, secret);
  return Utilities.base64EncodeWebSafe(sig);
}

function countRows_(sheet, ev, team, id) {
  if (sheet.getLastRow() < 2) return 0;
  var k = teamKey_(team);
  return sheet.getRange(2, 2, sheet.getLastRow() - 1, 3).getValues()   // event, team, season
    .filter(function (r) { return r[0] === ev && String(r[2]) === id && teamKey_(r[1]) === k; }).length;
}

// Deletes a season's rows bottom-up, one call per run of adjacent rows. Deleting rather than rewriting the range keeps
// every other cell as Sheets stored it (a rewrite would turn the text "007" back into 7). Rows appended meanwhile (an
// open season's progress posts take no lock) land below the snapshot, so they are never hit.
function deleteRows_(sheet, id) {
  var n = sheet.getLastRow() - 1, removed = 0;
  if (n < 1) return 0;
  var ids = sheet.getRange(2, 4, n, 1).getValues();
  for (var i = n - 1; i >= 0;) {
    if (String(ids[i][0]) !== id) { i--; continue; }
    var end = i;
    while (i >= 0 && String(ids[i][0]) === id) i--;
    sheet.deleteRows(i + 3, end - i);   // index k is sheet row k + 2; the run is indexes i+1..end
    removed += end - i;
  }
  return removed;
}

function getLogSheet_() {
  // Standalone deployment (not container-bound): the Sheet's own Extensions > Apps Script menu
  // hit a broken multi-account redirect in testing, so this is deployed as a separate script
  // pointed at the sheet by id. The id itself is never committed to source: after pasting this
  // file into the Apps Script editor, open Project Settings > Script Properties and add one
  // property SHEET_ID = <your sheet's id, the long string in its URL between /d/ and /edit>.
  var sheetId = PropertiesService.getScriptProperties().getProperty("SHEET_ID");
  if (!sheetId) throw new Error("Set the SHEET_ID script property (Project Settings > Script Properties) before deploying.");
  var ss = SpreadsheetApp.openById(sheetId);
  var sheet = ss.getSheetByName("log");
  if (!sheet) {
    sheet = ss.insertSheet("log");
    sheet.appendRow(["timestamp", "event", "team", "season", "chapter", "hints", "wrong", "queries", "clientAt", "elapsedMs"]);
  }
  return sheet;
}

function adminOk_(data) {
  var key = PropertiesService.getScriptProperties().getProperty("ADMIN_KEY");
  return !!key && String(data.key || "").trim().toLowerCase() === key.trim().toLowerCase();
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
