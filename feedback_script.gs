// feedback_script.gs -- the Send feedback form's backend (site/feedback.js), a separate Apps Script deployment from
// the compete backend (apps_script.gs). Its /exec URL is public by design: it can only append a feedback row.
// Script Property SHEET_ID: the owner's Sheet; rows go to its "Feedback" tab, one column per HEADERS name. Each row is
// written by the names in the tab's first row, so the owner may reorder, hide or drop columns; a context field with no
// column of its own goes to "other". "status" is left empty for the owner (replied, fixed...).
// Each saved message is also emailed to NOTIFY_EMAIL (Script Property, else contact@alephb.uk); a failed email never
// loses the row. A sender who gave an email gets a short fixed confirmation (confirm_) from contact@alephb.uk, a Gmail
// "Send mail as" alias of the AlephB account, sent through the Gmail API (advanced service, scope gmail.send only).

var FEEDBACK_TAB = "Feedback";
var MAX_MESSAGE = 2000, MAX_EMAIL = 120, MAX_PAGE = 200;
var MAX_CTX_KEYS = 20, MAX_CTX_VALUE = 80;   // the browser's context (feedback.js clientContext): short strings only
var HEADERS = ["received", "status", "message", "email", "page", "chapter", "mode", "part", "device", "os", "browser",
  "screen", "window", "pixelRatio", "touch", "language", "timezone", "localTime", "theme", "other"];
var NOTIFY_DEFAULT = "contact@alephb.uk", CONFIRM_FROM = "The Ritz Affair <contact@alephb.uk>";
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
  var ctx = context_(b.ctx), ctxText = Object.keys(ctx).map(function (k) { return k + ": " + ctx[k]; }).join("\n");
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { ok: false, error: "busy" };
  try {
    var cache = CacheService.getScriptCache();
    var key = "feedback-" + Math.floor(Date.now() / (RATE_WINDOW_S * 1000));   // one counter per 10-minute window
    var n = Number(cache.get(key) || 0);
    if (n >= RATE_LIMIT) return { ok: false, error: "busy" };
    cache.put(key, String(n + 1), RATE_WINDOW_S);
    var book = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty("SHEET_ID"));
    var sheet = book.getSheetByName(FEEDBACK_TAB) || book.insertSheet(FEEDBACK_TAB);
    if (!sheet.getLastRow()) sheet.appendRow(HEADERS);
    var head = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
    sheet.appendRow(row_(head, new Date(), page, message, email, ctx));
  } finally { lock.releaseLock(); }
  notify_(page, message, email, ctxText);
  if (email) confirm_(email);
  return { ok: true };
}

// A short fixed confirmation to the sender. It never quotes the message (the form must not become a way to send
// someone else text) and goes at most once a day to one address.
function confirm_(email) {
  try {
    var cache = CacheService.getScriptCache(), key = "confirmed-" + email.toLowerCase();
    if (cache.get(key)) return;
    var subject = "We received your feedback on The Ritz Affair";
    var body = "Hello,\n\nThank you for your feedback on The Ritz Affair. It has reached us and is under review. If it " +
      "needs an answer, we will reply to this address.\n\nAlephB\nhttps://mystery.alephb.uk\n";
    try {
      // email passed the form's check (no spaces, so no header injection); subject and body are fixed ASCII
      var mime = "From: " + CONFIRM_FROM + "\r\nTo: " + email + "\r\nSubject: " + subject +
        "\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n" + body;
      Gmail.Users.Messages.send({ raw: Utilities.base64EncodeWebSafe(mime) }, "me");
    } catch (err) {   // the alias or the scope missing: the old sender, so the confirmation still goes
      console.warn("confirmation through Gmail failed: " + err);
      MailApp.sendEmail({ to: email, name: "The Ritz Affair", replyTo: NOTIFY_DEFAULT, subject: subject, body: body });
    }
    cache.put(key, "1", 21600);   // only once it is sent, so a failed attempt never blocks the next
  } catch (err) { console.warn("feedback confirmation failed: " + err); }
}

// One row in the tab's own column order. Text cells start with an apostrophe: never a formula, never coerced into a
// number or a date.
function row_(head, received, page, message, email, ctx) {
  var cells = { received: received, page: page, message: message, email: email }, other = [];
  Object.keys(ctx).forEach(function (k) {
    if (head.indexOf(k) >= 0 && !(k in cells)) cells[k] = ctx[k]; else other.push(k + ": " + ctx[k]);
  });
  cells.other = other.join("\n");
  return head.map(function (h) {
    var v = Object.prototype.hasOwnProperty.call(cells, h) ? cells[h] : "";
    return typeof v === "string" && v ? "'" + v : v;
  });
}

// Keeps only short string values under plain keys: the context is information, never trusted.
function context_(c) {
  var out = {};
  if (!c || typeof c !== "object") return out;
  Object.keys(c).slice(0, MAX_CTX_KEYS).forEach(function (k) {
    if (/^[A-Za-z]{1,20}$/.test(k) && c[k] != null) out[k] = String(c[k]).replace(/[\r\n]+/g, " ").slice(0, MAX_CTX_VALUE);
  });
  return out;
}

function notify_(page, message, email, ctxText) {
  try {
    var mail = { to: PropertiesService.getScriptProperties().getProperty("NOTIFY_EMAIL") || NOTIFY_DEFAULT,
      subject: "Ritz Affair feedback (" + page + ")",
      body: message + "\n\nPage: https://mystery.alephb.uk" + page + "\nEmail: " + (email || "(none)") +
        "\nReceived: " + new Date().toISOString() + (ctxText ? "\n\n" + ctxText : "") };
    if (email) mail.replyTo = email;
    MailApp.sendEmail(mail);
  } catch (err) { console.warn("feedback email failed: " + err); }
}

// Run once from the editor after setting SHEET_ID: Google asks the owner to allow the Sheet access, and the tab is made.
function setup() {
  var book = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty("SHEET_ID"));
  if (!book.getSheetByName(FEEDBACK_TAB)) book.insertSheet(FEEDBACK_TAB).appendRow(HEADERS);
}

