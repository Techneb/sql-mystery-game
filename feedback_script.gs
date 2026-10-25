// feedback_script.gs -- the Send feedback form's backend (site/feedback.js), a separate Apps Script deployment from
// the compete backend (apps_script.gs). Its /exec URL is public by design: it can only append a feedback row.
// Script Property SHEET_ID: the owner's Sheet; rows go to its "Feedback" tab: [ms timestamp, page, message, email].

var FEEDBACK_TAB = "Feedback";
var MAX_MESSAGE = 2000, MAX_EMAIL = 120, MAX_PAGE = 200;
var RATE_LIMIT = 30, RATE_WINDOW_S = 600;   // at most 30 messages per 10 minutes, all senders together

function doPost(e) {
  var out;
  try { out = feedback_(JSON.parse((e && e.postData && e.postData.contents) || "{}")); }
  catch (err) { out = { ok: false, error: String(err && err.message || err) }; }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function feedback_(b) {
  var message = String(b.message == null ? "" : b.message).trim();
  var email = String(b.email == null ? "" : b.email).trim();
  var page = String(b.page == null ? "" : b.page);
  if (!message || message.length > MAX_MESSAGE) return { ok: false, error: "message must be 1 to 2000 characters" };
  if (email && (email.length > MAX_EMAIL || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) return { ok: false, error: "bad email" };
  if (page.length > MAX_PAGE || page.charAt(0) !== "/") return { ok: false, error: "bad page" };
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { ok: false, error: "busy" };
  try {
    var cache = CacheService.getScriptCache();
    var key = "feedback-" + Math.floor(Date.now() / (RATE_WINDOW_S * 1000));   // one counter per 10-minute window
    var n = Number(cache.get(key) || 0);
    if (n >= RATE_LIMIT) return { ok: false, error: "busy" };
    cache.put(key, String(n + 1), RATE_WINDOW_S);
    var book = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty("SHEET_ID"));
    var sheet = book.getSheetByName(FEEDBACK_TAB);
    if (!sheet) { sheet = book.insertSheet(FEEDBACK_TAB); sheet.appendRow(["at", "page", "message", "email"]); }
    // text cells start with an apostrophe: never a formula, never coerced into a number or a date
    sheet.appendRow([Date.now(), "'" + page, "'" + message, "'" + email]);
    return { ok: true };
  } finally { lock.releaseLock(); }
}

// Run once from the editor after setting SHEET_ID: Google asks the owner to allow the Sheet access, and the tab is made.
function setup() {
  var book = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty("SHEET_ID"));
  if (!book.getSheetByName(FEEDBACK_TAB)) book.insertSheet(FEEDBACK_TAB).appendRow(["at", "page", "message", "email"]);
}
