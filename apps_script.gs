// apps_script.gs -- paste into Extensions > Apps Script of a Google Sheet, then Deploy > New deployment >
// Web app (Execute as: Me, Who has access: Anyone). Copy the deployment URL into leaderboard.html's
// APPS_SCRIPT_URL and, once the follow-up UI plan wires the Compete button, into site/app.js's.
// The sheet needs no manual setup: doPost creates a "log" tab and header row on first call.

function doPost(e) {
  var sheet = getLogSheet_();
  var data = JSON.parse(e.postData.contents);
  sheet.appendRow([new Date(), data.event || "", data.team || "", data.season || "",
                    data.chapter || "", data.hints || 0, data.wrong || 0, data.queries || 0]);
  return ContentService.createTextOutput(JSON.stringify({ok: true})).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  var sheet = getLogSheet_();
  var rows = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 8).getValues() : [];
  var out = rows.map(function (r) {
    return {timestamp: r[0].getTime ? r[0].getTime() : r[0], event: r[1], team: r[2], season: r[3],
            chapter: r[4], hints: r[5], wrong: r[6], queries: r[7]};
  });
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function getLogSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("log");
  if (!sheet) {
    sheet = ss.insertSheet("log");
    sheet.appendRow(["timestamp", "event", "team", "season", "chapter", "hints", "wrong", "queries"]);
  }
  return sheet;
}
