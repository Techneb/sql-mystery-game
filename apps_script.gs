// apps_script.gs -- paste into a standalone Apps Script project, then Deploy > New deployment >
// Web app (Execute as: Me, Who has access: Anyone). The deployment URL is never committed: it travels in
// links (?board= for the game, ?data= for leaderboard.html), which the ?admin panel's Seasons section copies.
// The sheet needs no manual setup: doPost creates a "log" tab and header row on first call.
//
// Script Properties (Project Settings > Script Properties):
//   SHEET_ID   the log sheet's id (required)
//   ADMIN_KEY  the admin passphrase: lets the ?admin panel save settings and season answers (required for that)
//   TOKEN_SECRET  optional; signs the per-team tokens (falls back to ADMIN_KEY, then SHEET_ID)
//   CONFIG, HASHES_<season>, HASHES_FP_<season>  written by the admin panel or the deploy workflow, never by hand
//
// Anyone with a class link can POST here, so every row is validated, every event after "start" must carry the
// token "start" returned, and a "finish" needs its seven "progress" rows first. Compete answers are checked
// here against the season hashes, which the deploy workflow posts (python3 generate_db.py --post, with the
// BOARD_URL and ADMIN_KEY repository secrets) or the admin panel pastes: the season files on the site carry
// only a fingerprint of them, which ?hashes=1 lets the admin panel compare. Nothing here can tell two browsers typing the same pseudo apart: compete
// stays honour-based against a student who posts a rival's "start" first.

var EVENTS = ["start", "progress", "finish"];

function doPost(e) {
  var data;
  try { data = JSON.parse(e.postData.contents); } catch (err) { return json_({ok: false, error: "not JSON"}); }
  if (data.config) return json_(saveConfig_(data));
  if (data.hashes) return json_(saveHashes_(data));
  var team = String(data.team || "").trim(), season = int_(data.season, 1, 20);
  if (!team || team.length > 40 || season === null) return json_({ok: false, error: "bad team or season"});
  var token = token_(team, season);
  if (data.check) {
    if (String(data.token || "") !== token) return json_({ok: false, error: "no token: start first"});
    return json_(check_(season, int_(data.chapter, 1, 8), String(data.answer || "")));
  }
  var ev = String(data.event || "");
  var chapter = int_(data.chapter, 0, 8), wrong = int_(data.wrong, 0, 2000), queries = int_(data.queries, 0, 20000);
  if (EVENTS.indexOf(ev) < 0 || chapter === null || wrong === null || queries === null) return json_({ok: false, error: "bad fields"});
  if (ev !== "start" && String(data.token || "") !== token) return json_({ok: false, error: "no token: start first"});
  var sheet = getLogSheet_();
  if (ev === "finish" && progressRows_(sheet, team, season) < 7) return json_({ok: false, error: "finish before the seven progress rows"});
  sheet.appendRow([new Date(), ev, team, season, chapter || "", 0, wrong, queries,
                   Number(data.clientAt) || "", Number(data.elapsedMs) || ""]);
  return json_(ev === "start" ? {ok: true, token: token} : {ok: true});
}

// ?config=1 -> the settings; ?hashes=1 -> the fingerprint of each season's stored answers; ?season=N -> that
// season's rows; nothing -> every row (the admin panel's usage view).
function doGet(e) {
  var p = (e && e.parameter) || {};
  var props = PropertiesService.getScriptProperties();
  if (p.config) {
    var c = props.getProperty("CONFIG");
    return json_(c ? JSON.parse(c) : {});
  }
  if (p.hashes) {
    var fp = {};
    for (var s = 1; s <= 20; s++) { var f = props.getProperty("HASHES_FP_" + s); if (f) fp[s] = f; }
    return json_(fp);
  }
  var sheet = getLogSheet_();
  var rows = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 10).getValues() : [];
  var season = int_(p.season, 1, 20);
  var out = [];
  rows.forEach(function (r) {
    if (season !== null && Number(r[3]) !== season) return;
    out.push({timestamp: r[0].getTime ? r[0].getTime() : r[0], event: r[1], team: r[2], season: r[3],
              chapter: r[4], hints: r[5], wrong: r[6], queries: r[7], clientAt: r[8] || null, elapsedMs: r[9] || null});
  });
  return json_(out);
}

function int_(v, lo, hi) {
  if (v === undefined || v === null || v === "") return lo === 0 ? 0 : null;
  var n = Number(v);
  return Number.isInteger(n) && n >= lo && n <= hi ? n : null;
}

// A token per team and season: HMAC of the pseudo, so it needs no storage and cannot be guessed without the secret.
function token_(team, season) {
  var props = PropertiesService.getScriptProperties();
  var secret = props.getProperty("TOKEN_SECRET") || props.getProperty("ADMIN_KEY") || props.getProperty("SHEET_ID");
  var sig = Utilities.computeHmacSha256Signature(team.toLowerCase() + "|" + season, secret);
  return Utilities.base64EncodeWebSafe(sig);
}

function progressRows_(sheet, team, season) {
  if (sheet.getLastRow() < 2) return 0;
  return sheet.getRange(2, 2, sheet.getLastRow() - 1, 3).getValues()   // event, team, season
    .filter(function (r) { return r[0] === "progress" && r[1] === team && Number(r[2]) === season; }).length;
}

// The answer arrives normalised (app.js normalise); it is hashed and compared, never stored.
function check_(season, chapter, answer) {
  if (chapter === null) return {ok: false, error: "bad chapter"};
  var h = PropertiesService.getScriptProperties().getProperty("HASHES_" + season);
  if (!h) return {ok: false, error: "no answers stored for season " + season + ": paste them in the admin panel"};
  var hashes = JSON.parse(h)[chapter - 1] || [];
  return {ok: true, correct: hashes.indexOf(sha256_(answer)) >= 0};
}

function sha256_(s) {
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8);
  return digest.map(function (b) { return ("0" + (b & 255).toString(16)).slice(-2); }).join("");
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

// Game settings from the ?admin panel (ranks, telegrams, penalties), stored as one JSON Script Property.
// The game validates the values when it reads them; this guards who may write and keeps them in bounds.
function saveConfig_(data) {
  if (!adminOk_(data)) return {ok: false, error: "wrong admin key"};
  var c = data.config;
  if (c.penalty && !(Number.isInteger(c.penalty.wrong) && c.penalty.wrong >= 0 && c.penalty.wrong <= 3600)) return {ok: false, error: "penalty out of bounds"};
  if (c.taunts && !(Array.isArray(c.taunts) && c.taunts.length <= 10 && c.taunts.every(function (t) { return typeof t === "string" && t.length <= 300; }))) return {ok: false, error: "taunts out of bounds"};
  var s = JSON.stringify(c);
  if (s.length > 8000) return {ok: false, error: "settings too large"};
  PropertiesService.getScriptProperties().setProperty("CONFIG", s);
  return {ok: true};
}

// Season answer hashes, one property per season (a Script Property holds 9 kB; twenty seasons would not fit in one).
function saveHashes_(data) {
  if (!adminOk_(data)) return {ok: false, error: "wrong admin key"};
  var props = PropertiesService.getScriptProperties(), n = 0;
  Object.keys(data.hashes).forEach(function (season) {
    var s = int_(season, 1, 20), list = data.hashes[season];
    if (s === null || !Array.isArray(list) || list.length !== 8) return;
    props.setProperty("HASHES_" + s, JSON.stringify(list));
    props.setProperty("HASHES_FP_" + s, sha256_(list.map(function (hs) { return hs.join(""); }).join("")));   // same formula as generate_db.fingerprint
    n++;
  });
  return n ? {ok: true, seasons: n} : {ok: false, error: "no season in the payload"};
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
