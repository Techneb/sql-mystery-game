// apps_script.gs -- paste into Extensions > Apps Script of a Google Sheet, then Deploy > New deployment >
// Web app (Execute as: Me, Who has access: Anyone). The deployment URL is never committed: it travels in
// links (?board= for the game, ?data= for leaderboard.html), which the ?admin panel's Seasons section copies.
// The sheet needs no manual setup: doPost creates a "log" tab and header row on first call.

function doPost(e) {
  var data = JSON.parse(e.postData.contents);
  if (data.config) return json_(saveConfig_(data));
  var sheet = getLogSheet_();
  sheet.appendRow([new Date(), data.event || "", data.team || "", data.season || "",
                    data.chapter || "", data.hints || 0, data.wrong || 0, data.queries || 0]);
  return ContentService.createTextOutput(JSON.stringify({ok: true})).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  if (e && e.parameter && e.parameter.config) {
    var c = PropertiesService.getScriptProperties().getProperty("CONFIG");
    return json_(c ? JSON.parse(c) : {});
  }
  var sheet = getLogSheet_();
  var rows = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 8).getValues() : [];
  var out = rows.map(function (r) {
    return {timestamp: r[0].getTime ? r[0].getTime() : r[0], event: r[1], team: r[2], season: r[3],
            chapter: r[4], hints: r[5], wrong: r[6], queries: r[7]};
  });
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
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
    sheet.appendRow(["timestamp", "event", "team", "season", "chapter", "hints", "wrong", "queries"]);
  }
  return sheet;
}

// Game settings from the ?admin panel (ranks, telegrams, penalties), stored as one JSON Script Property.
// Anyone can POST to this web app, so a save must carry the admin passphrase: set Script Property
// ADMIN_KEY to it by hand (Project Settings > Script Properties). Without ADMIN_KEY, nobody can save.
// The game validates the values when it reads them, so this only guards who may write.
function saveConfig_(data) {
  var props = PropertiesService.getScriptProperties();
  var key = props.getProperty("ADMIN_KEY");
  if (!key || String(data.key || "").trim().toLowerCase() !== key.trim().toLowerCase()) return {ok: false, error: "wrong admin key"};
  var s = JSON.stringify(data.config);
  if (s.length > 8000) return {ok: false, error: "settings too large"};
  props.setProperty("CONFIG", s);
  return {ok: true};
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
