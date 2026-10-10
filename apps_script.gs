// apps_script.gs -- paste into a standalone Apps Script project, then Deploy > New deployment >
// Web app (Execute as: Me, Who has access: Anyone). The deployment URL is never committed: it travels in
// links (?board= for the game, ?data= for leaderboard.html, ?board= for admin.html).
// The sheet needs no manual setup: doPost creates a "log" tab and header row on first call.
//
// Script Properties (Project Settings > Script Properties):
//   SHEET_ID      the log sheet's id (required)
//   ADMIN_KEY     the admin passphrase: lets admin.html create, edit, open and close seasons (required for that)
//   TOKEN_SECRET  optional; signs the per-player tokens (falls back to ADMIN_KEY, then SHEET_ID)
//   SEASONS       written by this script (the season records), never by hand
//
// A season is a record {id, name, date, db, penalty, state, createdAt, openedAt, closedAt}; state goes
// created -> open -> closed (or created -> closed, for a season created by mistake), never back. Players "join"
// a season (one join per pseudo), then post "progress"
// and "finish" with the token "join" returned, only while the season is open; a "finish" needs its seven
// "progress" rows first. Answers are checked in the browser (the season files carry their hashes), so the
// game stays honour-based and off the marks.

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
  if (act === "update") {
    if (s.state !== "created") return {ok: false, error: "only a season not yet opened can be edited"};
    var g = fields_(data);
    if (g.error) return g;
    s.name = g.name; s.date = g.date; s.penalty = g.penalty;
    return save_(list, s);
  }
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
  if (p.seasons) return seasons_();
  if (p.meta) {
    var m = find_(seasons_(), String(p.meta));
    return m ? withNow_(m) : {ok: false, error: "no such season"};
  }
  var sheet = getLogSheet_();
  var rows = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 10).getValues() : [];
  var id = p.season ? String(p.season) : null;
  var out = [];
  rows.forEach(function (r) {
    if (id !== null && String(r[3]) !== id) return;
    out.push({timestamp: r[0].getTime ? r[0].getTime() : r[0], event: r[1], team: r[2], season: r[3],
              chapter: r[4], hints: r[5], wrong: r[6], queries: r[7], clientAt: r[8] || null, elapsedMs: r[9] || null});
  });
  return out;
}


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
