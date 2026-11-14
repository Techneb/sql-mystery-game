// accounts_script.gs -- optional player accounts (site/account.js): learn-mode progress kept for a Google account so it
// follows the player between devices. A separate Apps Script deployment from the compete backend (apps_script.gs) and
// the feedback script; its /exec URL is public by design (account.js ACCOUNTS_URL): every action but signin needs a
// session token this script signed.
// Script Properties: SHEET_ID (the owner's Sheet; rows go to its "Saves" tab), SECRET (a long random string: account
// keys and session tokens are HMACs under it), GOOGLE_CLIENT_ID (the OAuth client the page signs in with).
// Actions (doPost, a JSON body sent as text/plain):
//   signin {idToken}           Google's ID token, checked by Google's tokeninfo endpoint -> {token, expires}
//   Email and password (owner, 2026-11-14), the password never leaving the browser: the page sends a verifier,
//   PBKDF2-SHA256 of it (account.js passwordVerifier), and the row keeps only HMAC(verifier|salt) and a random salt.
//   register  {email, verifier}       a 6-digit code mailed to the address (an existing account gets a note instead)
//   verify    {email, code}           the code -> the account's row, {token, expires}
//   signin    {email, verifier}       -> {token, expires}, or "wrong email or password"
//   resetcode {email}                 a code mailed if the account exists; the same answer either way
//   reset     {email, code, verifier} the code and a new password -> {token, expires}
//   updates   {token, on, email, emailSig}  the news opt-in (owner, 2026-11-14), below
//   GET ?unsubscribe=<token>          the link in a news email: a plain page, no sign-in
//   Codes: 15 minutes, 5 tries, kept only as HMACs in CacheService under the email key; the address is used only to
//   send the mail at that moment.
//   pull   {token}             -> {saves: {key: value}, token, expires} (a fresh 60-day token each time)
//   push   {token, saves, clientAt, replace?}  merged into the stored copy (merge_), never a wipe unless replace names the key
//   delete {token}             removes the account's row
// Nothing about the person is stored: the row's key is HMAC("account|" + sub, SECRET), sub being Google's account id,
// or HMAC("email|" + the lowercased address, SECRET); never the email, the name or the password. A row: key, created,
// updated (ms numbers, never Date cells), clientAt, the saves as one JSON text split across saves1..saves4 (a Sheet
// cell holds 50,000 characters at most), then pwHash and pwSalt for an email account.
// The news opt-in is separate from signing in: only a player who ticks "Email me about new games and updates" has the
// address written, in plaintext, to the "Updates" tab (UPDATES_HEADERS), never in the Saves row. The address comes
// from the sign-in itself (Google's verified email claim, or the email account's own address), returned to the page
// with emailSig = HMAC(key|address), so a page can only subscribe the address it signed in with. Unticking, Delete my
// saved progress or the unsubscribe link blank the address and set unsubscribed_at (the row stays as the record).

var TAB = "Saves";
var HEADERS = ["key", "created", "updated", "clientAt", "saves1", "saves2", "saves3", "saves4", "pwHash", "pwSalt"];
var SYNC_KEYS = ["ritz.learn", "ritz.exercises", "ritz.exercises.history"];   // the same list as account.js SYNC_KEYS
var CELL_MAX = 45000, CHUNKS = 4, SAVES_MAX = CELL_MAX * CHUNKS;   // a full learn save measured ~32,000 (2026-11-14)
var HISTORY_MAX = 20;                                               // shared.js HISTORY_MAX
var SESSION_MS = 60 * 24 * 3600 * 1000;
var RATE_LIMIT = 60, SIGNIN_LIMIT = 300, RATE_WINDOW_S = 600;      // per account, and every sign-in together, per 10 minutes
var ISSUERS = ["accounts.google.com", "https://accounts.google.com"];
var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/, EMAIL_MAX = 120;
var CODE_S = 900, CODE_TRIES = 5;                                   // a code lasts 15 minutes and 5 tries
var SENDS_PER_HOUR = 5, SENDS_PER_DAY = 80, FAILS_LIMIT = 10;       // per address per hour, all together per day (Gmail's quota), sign-in failures per 10 min
var MAIL_FROM = "The Ritz Affair <contact@alephb.uk>", MAIL_REPLY = "contact@alephb.uk";
var UPDATES_TAB = "Updates", UPDATES_HEADERS = ["email", "key", "consented_at", "source", "unsubscribed_at", "unsub_token"];

function doPost(e) {
  var out;
  try {
    var b = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    if (!b || typeof b !== "object" || Array.isArray(b)) throw new Error("bad request");
    var act = { signin: function (x) { return x.email != null ? emailSignin_(x) : signin_(x); }, pull: pull_, push: push_, "delete": delete_,
      register: register_, verify: verify_, resetcode: resetcode_, reset: reset_, updates: updates_ }[b.action];
    out = act ? act(b) : { ok: false, error: "unknown action" };
  } catch (err) { out = { ok: false, error: String(err && err.message || err) }; }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

// The unsubscribe link of a news email: ?unsubscribe=<the row's unsub_token>. A plain text page either way.
function doGet(e) {
  var t = (e && e.parameter && e.parameter.unsubscribe) || "", msg;
  try { msg = unsubscribeLink_(t) ? "You are unsubscribed. The Ritz Affair will not email you about new games or updates again."
    : "This unsubscribe link is not valid. Write to contact@alephb.uk and we will remove your address."; }
  catch (err) { msg = "Something went wrong. Write to contact@alephb.uk and we will remove your address."; }
  return ContentService.createTextOutput(msg).setMimeType(ContentService.MimeType.TEXT);
}

function prop_(k) {
  var v = PropertiesService.getScriptProperties().getProperty(k);
  if (!v) throw new Error("not configured");
  return v;
}
function hmac_(v) { return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(v, prop_("SECRET"))).replace(/=+$/, ""); }

// Counts one request in a 10-minute window; false once the window's limit is reached.
function rate_(name, limit) {
  var cache = CacheService.getScriptCache(), k = name + "-" + Math.floor(Date.now() / (RATE_WINDOW_S * 1000));
  var n = Number(cache.get(k) || 0);
  if (n >= limit) return false;
  cache.put(k, String(n + 1), RATE_WINDOW_S);
  return true;
}

function signin_(b) {
  var t = b.idToken;
  if (typeof t !== "string" || t.length < 20 || t.length > 4096 || !/^[A-Za-z0-9._-]+$/.test(t)) return { ok: false, error: "bad id token" };
  if (!rate_("signin", SIGNIN_LIMIT)) return { ok: false, error: "busy" };
  var r = UrlFetchApp.fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(t), { muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) return { ok: false, error: "bad id token" };
  var info = JSON.parse(r.getContentText());
  if (info.aud !== prop_("GOOGLE_CLIENT_ID") || ISSUERS.indexOf(info.iss) < 0 || !(Number(info.exp) * 1000 > Date.now())
      || typeof info.sub !== "string" || !/^[0-9]{1,64}$/.test(info.sub)) return { ok: false, error: "bad id token" };
  var key = hmac_("account|" + info.sub);
  return info.email_verified === true || info.email_verified === "true" ? mailed_(session_(key), key, info.email) : session_(key);
}

// token = key.expires.signature; the key is never secret alone, the signature makes the token.
function session_(key) {
  var exp = Date.now() + SESSION_MS;
  return { ok: true, token: key + "." + exp + "." + hmac_("session|" + key + "|" + exp), expires: exp };
}
function keyOf_(token) {
  var p = typeof token === "string" && token.length < 200 ? token.split(".") : [];
  if (p.length !== 3 || !/^[A-Za-z0-9_-]{43}$/.test(p[0]) || !/^[0-9]{13}$/.test(p[1]) || Number(p[1]) <= Date.now()) return null;
  return hmac_("session|" + p[0] + "|" + p[1]) === p[2] ? p[0] : null;
}
function authed_(b) {
  var key = keyOf_(b.token);
  if (!key) throw new Error("bad token");
  if (!rate_("acct-" + key, RATE_LIMIT)) throw new Error("busy");
  return key;
}

function tab_() {
  var ss = SpreadsheetApp.openById(prop_("SHEET_ID"));
  var s = ss.getSheetByName(TAB);
  if (!s) { s = ss.insertSheet(TAB); s.appendRow(HEADERS); }
  else if (s.getRange(1, 9, 1, 2).getValues()[0].join("") === "") s.getRange(1, 9, 1, 2).setValues([HEADERS.slice(8)]);   // a tab from before the email option
  return s;
}
// The account's row number, or 0. ponytail: a linear scan of column A, fine for thousands of rows; a key index if it grows.
function find_(sheet, key) {
  var n = sheet.getLastRow();
  if (n < 2) return 0;
  var keys = sheet.getRange(2, 1, n - 1, 1).getValues();
  for (var i = 0; i < keys.length; i++) if (String(keys[i][0]) === key) return i + 2;
  return 0;
}
function readSaves_(sheet, r) {
  var text = sheet.getRange(r, 5, 1, CHUNKS).getValues()[0].map(String).join("");
  try { var o = JSON.parse(text || "{}"); return o && typeof o === "object" && !Array.isArray(o) ? o : {}; } catch (err) { return {}; }
}

function pull_(b) {
  var key = authed_(b), sheet = tab_(), r = find_(sheet, key), out = session_(key);
  out.saves = r ? readSaves_(sheet, r) : {};
  out.updates = updatesOn_(key);
  return out;
}

// A save's progress: chapters solved, then queries run (state.js importWrites' rule).
function progress_(raw) {
  try { var s = JSON.parse(raw) || {}; return [(s.solved || []).length, Number(s.totalQueries) || 0]; } catch (err) { return [-1, 0]; }
}
function ahead_(a, b) { var x = progress_(a), y = progress_(b); return x[0] > y[0] || (x[0] === y[0] && x[1] > y[1]); }
function list_(raw) { try { var v = JSON.parse(raw); return Array.isArray(v) ? v : null; } catch (err) { return null; } }

// The stored copy merged with a device's, by state.js importWrites' rule with the device as "this origin": the learn
// save with more progress wins (a tie goes to the device, the latest write), lists are a union, the device's first (a
// history keeps its 20 newest). A key the device names in replace (New investigation) takes the device's value.
function merge_(stored, incoming, replace) {
  var out = {};
  SYNC_KEYS.forEach(function (k) {
    var a = incoming[k], b = stored[k];
    if (a == null) { if (typeof b === "string") out[k] = b; return; }
    if (typeof b !== "string" || replace.indexOf(k) >= 0) { out[k] = a; return; }
    if (k === "ritz.learn") { out[k] = ahead_(b, a) ? b : a; return; }
    var la = list_(a), lb = list_(b);
    if (!la || !lb) { out[k] = a; return; }
    var seen = la.map(function (x) { return JSON.stringify(x); });
    var m = la.concat(lb.filter(function (x) { return seen.indexOf(JSON.stringify(x)) < 0; }));
    out[k] = JSON.stringify(/\.history$/.test(k) ? m.slice(0, HISTORY_MAX) : m);
  });
  return out;
}

// What a push may carry: the synced keys only, each a JSON string, the whole within SAVES_MAX.
function checkSaves_(s) {
  if (!s || typeof s !== "object" || Array.isArray(s)) return "bad saves";
  for (var k in s) {
    if (SYNC_KEYS.indexOf(k) < 0 || typeof s[k] !== "string") return "bad saves";
    try { JSON.parse(s[k]); } catch (err) { return "bad saves"; }
  }
  return JSON.stringify(s).length > SAVES_MAX ? "saves too large" : "";
}

function push_(b) {
  var key = authed_(b), bad = checkSaves_(b.saves);
  if (bad) return { ok: false, error: bad };
  var replace = Array.isArray(b.replace) ? b.replace.filter(function (k) { return SYNC_KEYS.indexOf(k) >= 0; }) : [];
  var clientAt = b.clientAt == null || b.clientAt === "" ? "" : Number(b.clientAt);
  if (clientAt !== "" && !(Number.isInteger(clientAt) && clientAt >= 0)) return { ok: false, error: "bad clientAt" };
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { ok: false, error: "busy" };
  try {
    var sheet = tab_(), r = find_(sheet, key), now = Date.now();
    var text = JSON.stringify(merge_(r ? readSaves_(sheet, r) : {}, b.saves, replace));
    if (text.length > SAVES_MAX) return { ok: false, error: "saves too large" };
    var chunks = [];
    for (var i = 0; i < CHUNKS; i++) chunks.push(text_(text.slice(i * CELL_MAX, (i + 1) * CELL_MAX)));
    if (r) sheet.getRange(r, 2, 1, 7).setValues([[sheet.getRange(r, 2, 1, 1).getValues()[0][0], now, clientAt].concat(chunks)]);
    else sheet.appendRow([text_(key), now, now, clientAt].concat(chunks));
    SpreadsheetApp.flush();
  } finally { lock.releaseLock(); }
  return { ok: true };
}

function delete_(b) {
  var key = authed_(b), lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { ok: false, error: "busy" };
  try {
    var sheet = tab_(), r = find_(sheet, key);
    if (r) sheet.deleteRow(r);
    unsubscribe_(key);   // the news opt-in goes with the account
    return { ok: true, removed: !!r };
  } finally { lock.releaseLock(); }
}

// Text cells start with an apostrophe: never a formula (a chunk may begin with "="), never coerced into a number.
function text_(v) { return typeof v === "string" && v ? "'" + v : v; }

// --- email and password ---
function email_(v) {
  var e = typeof v === "string" ? v.trim().toLowerCase() : "";
  if (!e || e.length > EMAIL_MAX || !EMAIL_RE.test(e) || /[\r\n<>"]/.test(e)) throw new Error("bad email");
  return e;
}
function verifier_(v) {
  if (typeof v !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(v)) throw new Error("bad verifier");
  return v;
}
function code_(v) { return typeof v === "string" && /^[0-9]{6}$/.test(v.trim()) ? v.trim() : ""; }
function emailKey_(e) { return hmac_("email|" + e); }
function pwHash_(verifier, salt) { return hmac_("password|" + verifier + "|" + salt); }
// Equal strings, in time that depends only on their length.
function same_(a, b) {
  a = String(a); b = String(b);
  var d = a.length ^ b.length;
  for (var i = 0; i < Math.min(a.length, b.length); i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
function count_(name) { return Number(CacheService.getScriptCache().get(name) || 0); }
function bump_(name, ttl) { CacheService.getScriptCache().put(name, String(count_(name) + 1), ttl); }
// The day's mails, every address together, in a Script Property (CacheService keeps 6 hours at most).
function today_() { return String(Math.floor(Date.now() / 86400000)); }
function sentToday_() {
  var v = String(PropertiesService.getScriptProperties().getProperty("SENT_DAY") || "").split(":");
  return v[0] === today_() ? Number(v[1]) || 0 : 0;
}
function hourKey_(key) { return "sends-" + key + "-" + Math.floor(Date.now() / 3600000); }
// One mail to the address, within its hourly cap and the day's cap for every address together; an error, or "".
function allowSend_(key) {
  if (count_(hourKey_(key)) >= SENDS_PER_HOUR) return "busy";
  var n = sentToday_();
  if (n >= SENDS_PER_DAY) return "try later";   // Gmail's daily quota
  PropertiesService.getScriptProperties().setProperty("SENT_DAY", today_() + ":" + (n + 1));
  bump_(hourKey_(key), 3600);
  return "";
}

// A code for the address, kept only as an HMAC with what verify or reset needs.
function sendCode_(e, key, kind, extra) {
  var err = allowSend_(key);
  if (err) return { ok: false, error: err };
  var code = String(parseInt(Utilities.getUuid().replace(/-/g, "").slice(0, 12), 16) % 1000000);
  while (code.length < 6) code = "0" + code;
  var p = { kind: kind, code: hmac_("code|" + key + "|" + code), tries: 0 };
  for (var k in extra) p[k] = extra[k];
  CacheService.getScriptCache().put("pending-" + key, JSON.stringify(p), CODE_S);
  mail_(e, "Your code is " + code + ". It works for 15 minutes.\n\nIf you did not ask for it, you can ignore this email. Nothing happens without the code.");
  return { ok: true, sent: true };
}
// Gmail from contact@alephb.uk (as feedback_script.gs confirm_), MailApp if the alias or the scope is missing.
function mail_(to, text) {
  var subject = "Your Ritz Affair code", body = "Hello,\n\n" + text + "\n\nAlephB\nhttps://alephb.uk/ritz-affair/\n";
  try {
    // to passed email_ (no spaces, no line breaks): no header injection
    var mime = "From: " + MAIL_FROM + "\r\nTo: " + to + "\r\nSubject: " + subject + "\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n" + body;
    Gmail.Users.Messages.send({ raw: Utilities.base64EncodeWebSafe(mime) }, "me");
  } catch (err) {
    MailApp.sendEmail({ to: to, name: "The Ritz Affair", replyTo: MAIL_REPLY, subject: subject, body: body });
  }
}
// The pending code checked: {p}, or {error}. A wrong code counts a try; the fifth wrong one ends the code.
function checkCode_(key, kind, raw) {
  var cache = CacheService.getScriptCache(), name = "pending-" + key, p = null;
  try { p = JSON.parse(cache.get(name) || "null"); } catch (err) {}
  if (!p || p.kind !== kind) return { error: "code expired" };
  var c = code_(raw);
  if (c && same_(hmac_("code|" + key + "|" + c), p.code)) { cache.remove(name); return { p: p }; }
  p.tries++;
  if (p.tries >= CODE_TRIES) { cache.remove(name); return { error: "code expired" }; }
  cache.put(name, JSON.stringify(p), CODE_S);
  return { error: "wrong code" };
}
function salt_() { return Utilities.getUuid().replace(/-/g, ""); }
function withLock_(f) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { ok: false, error: "busy" };
  try { return f(); } finally { lock.releaseLock(); }
}
function pwOf_(sheet, r) { return r ? sheet.getRange(r, 9, 1, 2).getValues()[0].map(String) : ["", ""]; }

function register_(b) {
  var e = email_(b.email), v = verifier_(b.verifier), key = emailKey_(e), sheet = tab_();
  if (pwOf_(sheet, find_(sheet, key))[0]) {   // the account exists: the same answer, and a note instead of a code
    var err = allowSend_(key);
    if (err) return { ok: false, error: err };
    mail_(e, "Someone, probably you, tried to create a Ritz Affair account with this address, but it already has one. " +
      "Sign in, or choose Forgot password? to set a new password.");
    return { ok: true, sent: true };
  }
  var salt = salt_();
  return sendCode_(e, key, "register", { hash: pwHash_(v, salt), salt: salt, updates: b.updates === true });
}
function verify_(b) {
  var e = email_(b.email), key = emailKey_(e), c = checkCode_(key, "register", b.code);
  if (c.error) return { ok: false, error: c.error };
  return withLock_(function () {
    var sheet = tab_(), r = find_(sheet, key), now = Date.now();
    if (r) sheet.getRange(r, 9, 1, 2).setValues([[text_(c.p.hash), text_(c.p.salt)]]);
    else sheet.appendRow([text_(key), now, now, "", "", "", "", "", text_(c.p.hash), text_(c.p.salt)]);
    if (c.p.updates) subscribe_(key, e, "register");
    var out = mailed_(session_(key), key, e);
    out.updates = !!c.p.updates;
    return out;
  });
}
function emailSignin_(b) {
  var e = email_(b.email), v = verifier_(b.verifier), key = emailKey_(e);
  var fails = "fails-" + key + "-" + Math.floor(Date.now() / (RATE_WINDOW_S * 1000));
  if (count_(fails) >= FAILS_LIMIT) return { ok: false, error: "busy" };
  var sheet = tab_(), pw = pwOf_(sheet, find_(sheet, key));
  if (pw[0] && same_(pwHash_(v, pw[1]), pw[0])) { var out = mailed_(session_(key), key, e); out.updates = updatesOn_(key); return out; }
  bump_(fails, RATE_WINDOW_S);
  return { ok: false, error: "wrong email or password" };
}
function resetcode_(b) {
  var e = email_(b.email), key = emailKey_(e), sheet = tab_();
  if (!pwOf_(sheet, find_(sheet, key))[0]) {   // no such account: nothing sent, the same answer (and the same hourly cap)
    if (count_(hourKey_(key)) >= SENDS_PER_HOUR) return { ok: false, error: "busy" };
    if (sentToday_() >= SENDS_PER_DAY) return { ok: false, error: "try later" };
    bump_(hourKey_(key), 3600);
    return { ok: true, sent: true };
  }
  return sendCode_(e, key, "reset", {});
}
function reset_(b) {
  var e = email_(b.email), v = verifier_(b.verifier), key = emailKey_(e), c = checkCode_(key, "reset", b.code);
  if (c.error) return { ok: false, error: c.error };
  return withLock_(function () {
    var sheet = tab_(), r = find_(sheet, key), salt = salt_();
    if (!r) return { ok: false, error: "code expired" };
    sheet.getRange(r, 9, 1, 2).setValues([[text_(pwHash_(v, salt)), text_(salt)]]);
    return mailed_(session_(key), key, e);
  });
}

// --- the news opt-in (Updates tab) ---
function emailSig_(key, e) { return hmac_("optin|" + key + "|" + e); }
// A session answer with the address the sign-in proved, signed for this account (nothing is stored).
function mailed_(out, key, email) {
  try { var e = email_(email); out.email = e; out.emailSig = emailSig_(key, e); } catch (err) {}
  return out;
}
function updatesTab_() {
  var ss = SpreadsheetApp.openById(prop_("SHEET_ID")), s = ss.getSheetByName(UPDATES_TAB);
  if (!s) { s = ss.insertSheet(UPDATES_TAB); s.appendRow(UPDATES_HEADERS); }
  return s;
}
// The account's Updates row number (column B), or 0.
function updatesRow_(sheet, key) {
  var n = sheet.getLastRow();
  if (n < 2) return 0;
  var keys = sheet.getRange(2, 2, n - 1, 1).getValues();
  for (var i = 0; i < keys.length; i++) if (String(keys[i][0]) === key) return i + 2;
  return 0;
}
function updatesOn_(key) {
  var sheet = updatesTab_(), r = updatesRow_(sheet, key);
  return !!r && String(sheet.getRange(r, 1, 1, 1).getValues()[0][0]) !== "";
}
function unsubToken_(key) { return key + "." + hmac_("unsub|" + key); }
// Called under the script lock. One row per account: a new consent rewrites it.
function subscribe_(key, e, source) {
  var sheet = updatesTab_(), r = updatesRow_(sheet, key), row = [text_(e), text_(key), Date.now(), source, "", text_(unsubToken_(key))];
  if (r) sheet.getRange(r, 1, 1, 6).setValues([row]); else sheet.appendRow(row);
}
// Blanks the address and stamps unsubscribed_at; true when there was an address. Called under the script lock.
function unsubscribe_(key) {
  var sheet = updatesTab_(), r = updatesRow_(sheet, key);
  if (!r || String(sheet.getRange(r, 1, 1, 1).getValues()[0][0]) === "") return false;
  sheet.getRange(r, 1, 1, 1).setValues([[""]]);
  sheet.getRange(r, 5, 1, 1).setValues([[Date.now()]]);
  return true;
}
function updates_(b) {
  var key = authed_(b);
  if (typeof b.on !== "boolean") return { ok: false, error: "bad request" };
  var e = "";
  if (b.on) {
    e = email_(b.email);
    if (typeof b.emailSig !== "string" || !same_(emailSig_(key, e), b.emailSig)) return { ok: false, error: "bad email" };
  }
  return withLock_(function () {
    if (b.on) subscribe_(key, e, "manage"); else unsubscribe_(key);
    return { ok: true, updates: b.on };
  });
}
function unsubscribeLink_(t) {
  var p = typeof t === "string" && t.length < 200 ? t.split(".") : [];
  if (p.length !== 2 || !/^[A-Za-z0-9_-]{43}$/.test(p[0]) || !same_(hmac_("unsub|" + p[0]), p[1])) return false;
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error("busy");
  try { unsubscribe_(p[0]); return true; } finally { lock.releaseLock(); }
}
