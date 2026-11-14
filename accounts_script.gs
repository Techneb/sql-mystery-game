// accounts_script.gs -- optional player accounts (site/account.js): learn-mode progress kept for a Google account so it
// follows the player between devices. A separate Apps Script deployment from the compete backend (apps_script.gs) and
// the feedback script; its /exec URL is public by design (account.js ACCOUNTS_URL): every action but signin needs a
// session token this script signed.
// Script Properties: SHEET_ID (the owner's Sheet; rows go to its "Saves" tab), SECRET (a long random string: account
// keys and session tokens are HMACs under it), GOOGLE_CLIENT_ID (the OAuth client the page signs in with).
// Actions (doPost, a JSON body sent as text/plain):
//   signin {idToken}           Google's ID token, checked by Google's tokeninfo endpoint -> {token, expires}
//   pull   {token}             -> {saves: {key: value}, token, expires} (a fresh 60-day token each time)
//   push   {token, saves, clientAt, replace?}  merged into the stored copy (merge_), never a wipe unless replace names the key
//   delete {token}             removes the account's row
// Nothing about the person is stored: the row's key is HMAC(sub, SECRET), sub being Google's account id; never the
// email or the name. A row: key, created, updated (ms numbers, never Date cells), clientAt, then the saves as one JSON
// text split across saves1..saves4 (a Sheet cell holds 50,000 characters at most).

var TAB = "Saves";
var HEADERS = ["key", "created", "updated", "clientAt", "saves1", "saves2", "saves3", "saves4"];
var SYNC_KEYS = ["ritz.learn", "ritz.exercises", "ritz.exercises.history"];   // the same list as account.js SYNC_KEYS
var CELL_MAX = 45000, CHUNKS = 4, SAVES_MAX = CELL_MAX * CHUNKS;   // a full learn save measured ~32,000 (2026-11-14)
var HISTORY_MAX = 20;                                               // shared.js HISTORY_MAX
var SESSION_MS = 60 * 24 * 3600 * 1000;
var RATE_LIMIT = 60, SIGNIN_LIMIT = 300, RATE_WINDOW_S = 600;      // per account, and every sign-in together, per 10 minutes
var ISSUERS = ["accounts.google.com", "https://accounts.google.com"];

function doPost(e) {
  var out;
  try {
    var b = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    if (!b || typeof b !== "object" || Array.isArray(b)) throw new Error("bad request");
    var act = { signin: signin_, pull: pull_, push: push_, "delete": delete_ }[b.action];
    out = act ? act(b) : { ok: false, error: "unknown action" };
  } catch (err) { out = { ok: false, error: String(err && err.message || err) }; }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
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
  return session_(hmac_("account|" + info.sub));
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
    return { ok: true, removed: !!r };
  } finally { lock.releaseLock(); }
}

// Text cells start with an apostrophe: never a formula (a chunk may begin with "="), never coerced into a number.
function text_(v) { return typeof v === "string" && v ? "'" + v : v; }
