// site/account.js -- optional player accounts (owner, 2026-11-14): Sign in with Google so learn-mode progress follows a
// player between devices. Off while GOOGLE_CLIENT_ID or ACCOUNTS_URL is empty (ACCOUNTS_ON, as stats.js ADS_ON follows
// AD_SLOT): no button, no Google script, no request. Google's ID token goes once to accounts_script.gs, which answers
// with its own session token (ritz.account); every later call carries that. What syncs is SYNC_KEYS only, merged by
// state.js importWrites (the bridge's rule: the save further along wins, lists are a union): never compete, consent or
// the desk. Side-effect free at import: startSync() and wireAccount() run a page.
import { importWrites } from "./state.js";
import { askDialog } from "./shared.js";
import { useFeature } from "./stats.js";

// The OAuth client (Web application) and the accounts script's /exec URL: both public by design, empty until the owner
// creates them. Pasting both is the whole switch-on.
export const GOOGLE_CLIENT_ID = "777203421471-ejn31449p1knbaf2tmm3sl04ng0d037q.apps.googleusercontent.com";
export const ACCOUNTS_URL = "https://script.google.com/macros/s/AKfycbz1_7s0fgH0Qz3H6b4SbnBFwvtLRRTYJ2p5qhpzw2c8KqQm5ggkJzwpP0t_dWK89xG_HQ/exec";
export const ACCOUNTS_ON = GOOGLE_CLIENT_ID !== "" && ACCOUNTS_URL !== "";

export const ACCOUNT_KEY = "ritz.account";   // {token, expires}: the script's session token, never Google's
export const SYNC_KEYS = ["ritz.learn", "ritz.exercises", "ritz.exercises.history"];   // accounts_script.gs SYNC_KEYS
export const SAVES_MAX = 180000;   // accounts_script.gs SAVES_MAX (four 45,000-character cells); a full learn save is ~32,000
export const GIS_SRC = "https://accounts.google.com/gsi/client";
export const PULL_WAIT_MS = 2000, PUSH_DELAY_MS = 3000;

// --- pure parts (tested) ---
// The stored account, or null when absent, unreadable or expired.
export function readAccount(raw, now = Date.now()) {
  try {
    const a = JSON.parse(raw);
    return a && typeof a.token === "string" && a.token && Number(a.expires) > now ? sessionOf(a) : null;
  } catch { return null; }
}
// What ritz.account keeps from a server answer: the session token, and, for the news opt-in, the address the sign-in
// proved with its signature and whether it is subscribed (prev: the stored account, for a pull's renewed token).
export function sessionOf(j, prev = {}) {
  const a = { token: j.token, expires: Number(j.expires) };
  for (const [k, type] of [["email", "string"], ["emailSig", "string"], ["updates", "boolean"]]) {
    const v = k in j ? j[k] : prev[k];
    if (typeof v === type) a[k] = v;
  }
  return a;
}
export const UPDATES_LABEL = "Email me about new games and updates (about once a month at most; unsubscribe anytime)";
// This browser's synced keys that hold a value, in SYNC_KEYS order. get(key): localStorage.getItem.
export function localSaves(get) {
  const out = {};
  for (const k of SYNC_KEYS) { const v = get(k); if (typeof v === "string") out[k] = v; }
  return out;
}
export const savesText = saves => JSON.stringify(localSaves(k => (saves || {})[k]));
// What a pull writes here: the server's synced keys through importWrites, this browser's value kept unless the
// server's is further along (lists merged).
export function pullWrites(remote, have) { return importWrites(localSaves(k => (remote || {})[k]), have); }
// The push body, or {error} when the saves are over the server's cap (nothing sent).
export function pushBody(token, saves, now, replace) {
  const s = localSaves(k => saves[k]);
  if (JSON.stringify(s).length > SAVES_MAX) return { error: "saves too large" };
  const b = { action: "push", token, saves: s, clientAt: now };
  if (replace) b.replace = replace;
  return { body: JSON.stringify(b) };
}

// Email and password (owner, 2026-11-14): the password never leaves the browser. It becomes a verifier, PBKDF2-SHA256
// with VERIFIER_ITERATIONS rounds salted by the address, and the server keeps only an HMAC of that (accounts_script.gs).
export const VERIFIER_ITERATIONS = 200000, PASSWORD_MIN = 8, EMAIL_MAX = 120;
export const normEmail = e => String(e || "").trim().toLowerCase();
// The form's checks in plain words, "" when fine (the server checks the address again; it never sees the password).
export function emailError(email) {
  const e = normEmail(email);
  if (!e) return "Type your email address.";
  return e.length > EMAIL_MAX || !/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(e) ? "That email address does not look right." : "";
}
export const passwordError = pw => String(pw || "").length < PASSWORD_MIN ? "Use a password of at least " + PASSWORD_MIN + " characters." : "";
export async function passwordVerifier(email, password, subtle = globalThis.crypto.subtle) {
  const enc = new TextEncoder();
  const k = await subtle.importKey("raw", enc.encode(String(password)), "PBKDF2", false, ["deriveBits"]);
  const bits = await subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: enc.encode("ritz-affair|" + normEmail(email)), iterations: VERIFIER_ITERATIONS }, k, 256);
  let bin = "";
  for (const b of new Uint8Array(bits)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
// The server's refusals, as the form says them.
export const EMAIL_ERRORS = { "wrong email or password": "That email and password do not match an account.", "wrong code": "That code is not right. Check the email and try again.",
  "code expired": "That code has expired. Ask for a new one.", busy: "Too many tries. Wait a few minutes, then try again.", "try later": "No more codes can be sent today. Try again tomorrow.",
  "bad email": "That email address does not look right." };

// --- runtime ---
let account = null, lastPushed = null, timer = 0, wired = false;
const getItem = k => { try { return localStorage.getItem(k); } catch { return null; } };
function setAccount(a) {
  account = a;
  try { if (a) localStorage.setItem(ACCOUNT_KEY, JSON.stringify(a)); else localStorage.removeItem(ACCOUNT_KEY); } catch {}
}
// text/plain: no CORS preflight, which Apps Script cannot answer (as feedback.js)
async function call(body, ms = 30000) {
  const r = await fetch(ACCOUNTS_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body, signal: AbortSignal.timeout(ms) });
  const j = r.ok ? await r.json() : { ok: false, error: "HTTP " + r.status };
  if (!j.ok) { if (j.error === "bad token") setAccount(null); throw new Error(j.error || "failed"); }
  return j;
}
export const signedIn = () => !!account;

// The server's copy merged in; true when this browser's saves changed. Offline or slow: play locally.
async function pull(ms) {
  try {
    const j = await call(JSON.stringify({ action: "pull", token: account.token }), ms);
    setAccount(sessionOf(j, account));
    const w = pullWrites(j.saves, getItem);
    try { for (const [k, v] of Object.entries(w)) localStorage.setItem(k, v); } catch {}
    lastPushed = savesText(j.saves);
    if (savesText(localSaves(getItem)) !== lastPushed) schedulePush();   // this browser holds something the server lacks
    return Object.keys(w).length > 0;
  } catch { return false; }
}

// Sends this browser's saves when they changed since the last push (or always with replace: New investigation).
export function pushSaves({ beacon = false, replace } = {}) {
  if (!account) return;
  clearTimeout(timer);
  const saves = localSaves(getItem), text = savesText(saves);
  if (text === lastPushed && !replace) return;
  const p = pushBody(account.token, saves, Date.now(), replace);
  if (p.error) return;
  if (beacon && navigator.sendBeacon) { if (navigator.sendBeacon(ACCOUNTS_URL, p.body)) lastPushed = text; return; }
  call(p.body).then(() => { lastPushed = text; }, () => {});
}
export function schedulePush() { if (account) { clearTimeout(timer); timer = setTimeout(pushSaves, PUSH_DELAY_MS); } }

// At boot, before the page reads its saves: the stored account, its pull (PULL_WAIT_MS at most), a push on leaving.
// Resolves true when the saves changed. Once per page load (exercises.js and handbook.js both ask on exercises.html).
let syncing = null;
export function startSync() { return syncing || (syncing = sync()); }
async function sync() {
  if (!ACCOUNTS_ON) return false;
  account = readAccount(getItem(ACCOUNT_KEY));
  if (!account) { setAccount(null); return false; }
  window.addEventListener("pagehide", () => pushSaves({ beacon: true }));
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") pushSaves({ beacon: true }); });
  return pull(PULL_WAIT_MS);
}

// --- the UI: a corner button (Sign in, or Saved once signed in) beside Feedback on the game and every handbook page,
// a line on the game's landing card, and small dialogs ---
const G_LOGO = '<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';
export const signinButtonHtml = () => '<button type="button" class="gsi-btn">' + G_LOGO + "<span>Sign in with Google</span></button>";
const ICON = '<svg class="icon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
const CLOUD = ICON + '<path d="M4.5 12.5h7a3 3 0 0 0 .4-5.97A4 4 0 0 0 4.2 7.6 2.5 2.5 0 0 0 4.5 12.5Z"/><path d="M6.25 9.75L7.5 11L10 8.5"/></svg>';
const SIGN_IN = ICON + '<path d="M9.5 2.5h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-3"/><path d="M2.5 8h7M7 5.5L9.5 8L7 10.5"/></svg>';
// The corner button's inner HTML, title and aria-label: Saved once signed in, else Sign in (tested).
export const accountButton = signed => signed
  ? { html: CLOUD + '<span class="btn-text">Saved</span>', title: "Signed in, progress saved" }
  : { html: SIGN_IN + '<span class="btn-text">Sign in</span>', title: "Sign in to save your progress across devices" };
const ask = (title, body, buttons) => `<form method="dialog">
  <div class="label">${title}</div>
  <p class="ask-msg"></p>${body}
  ${buttons}
</form>`;
const MANAGE = ask("YOUR SAVED PROGRESS", `<p class="acct-updates"><label><input type="checkbox" class="acct-updates-box"> ${UPDATES_LABEL}</label></p><p class="acct-updates-msg muted" role="status"></p>`, '<button value="" autofocus>Close</button> <button value="signout" class="quiet">Sign out</button> <button value="delete" class="quiet">Delete my saved progress</button>');
const CONFIRM = ask("DELETE YOUR SAVED PROGRESS", "", '<button value="" autofocus>Cancel</button> <button value="delete" class="quiet">Delete it</button>');
// The corner's sign-in dialog: Google's button, then the email form; the code step replaces the email step.
const SIGNIN = `<form method="dialog" novalidate>
  <div class="label">SIGN IN</div>
  <p class="ask-msg"></p>
  <div class="gsi-box"></div>
  <p class="acct-or muted">or with your email</p>
  <div class="acct-step acct-email">
    <p><label for="acct-email">Email</label><input id="acct-email" type="email" autocomplete="email" maxlength="${EMAIL_MAX}" spellcheck="false"></p>
    <p><label for="acct-pass">Password</label><input id="acct-pass" type="password" autocomplete="current-password"></p>
    <p class="acct-updates"><label><input type="checkbox" id="acct-news"> ${UPDATES_LABEL}</label></p>
    <p class="acct-buttons"><button type="button" data-act="signin">Sign in</button> <button type="button" class="quiet" data-act="register">Create an account</button> <button type="button" class="quiet" data-act="forgot">Forgot password?</button></p>
  </div>
  <div class="acct-step acct-code" hidden>
    <p class="acct-sent"></p>
    <p><label for="acct-code">Code from the email</label><input id="acct-code" inputmode="numeric" autocomplete="one-time-code" maxlength="6"></p>
    <p class="acct-new" hidden><label for="acct-newpass">New password</label><input id="acct-newpass" type="password" autocomplete="new-password"></p>
    <p class="acct-buttons"><button type="button" data-act="code">Confirm</button> <button type="button" class="quiet" data-act="back">Back</button></p>
  </div>
  <p class="acct-error" role="alert"></p>
  <p class="acct-wait" aria-live="polite"></p>
  <button value="" class="quiet">Cancel</button>
</form>`;
const ACCOUNT_MSG = "Signed in. Your progress in the game and on the handbook's exercises page is saved and follows you to any device where you sign in.";
const DELETE_ASK = "Delete the progress saved with your account? This browser keeps its own copy, and you are signed out.";
const SIGNIN_MSG = "Sign in to keep your progress in the game and on the exercises page on every device you use.";

function loadGis() {
  if (globalThis.google && google.accounts && google.accounts.id) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = GIS_SRC; s.async = true; s.onload = resolve; s.onerror = () => reject(new Error("not loaded"));
    document.head.appendChild(s);
  });
}
function dialog(id, html) {
  let d = document.getElementById(id);
  if (!d) { d = document.createElement("dialog"); d.id = id; d.className = "part2 account-dialog"; d.innerHTML = html; document.body.appendChild(d); }
  return d;
}

// Wires the account UI: nothing at all while ACCOUNTS_ON is false, and never in compete (app.js does not call it
// there). onChange(): a sign-in changed the saves (the page reloads to read them).
export function wireAccount(onChange) {
  if (!ACCOUNTS_ON) return false;
  const corners = document.querySelector(".corners"), status = document.getElementById("status");
  let line = null, gisReady = false;
  if (status) { line = document.createElement("p"); line.className = "landing-account muted"; status.after(line); }   // the game's landing
  const corner = document.createElement("button");
  corner.id = "btn-account"; corner.className = "quiet account-corner";
  if (corners) corners.append(corner);
  corner.onclick = () => account ? manage() : signInDialog();

  async function manage() {
    const d = dialog("account", MANAGE), box = d.querySelector(".acct-updates-box"), note = d.querySelector(".acct-updates-msg");
    // The news opt-in: only with an address the sign-in proved (an older sign-in has none: sign in again to choose it).
    d.querySelector(".acct-updates").hidden = !account.email;
    box.checked = !!account.updates; note.textContent = "";
    box.onchange = async () => {
      const on = box.checked;
      box.disabled = true; note.textContent = "Saving...";
      try {
        await call(JSON.stringify({ action: "updates", token: account.token, on, email: account.email, emailSig: account.emailSig }));
        setAccount({ ...account, updates: on });
        note.textContent = on ? "Saved. We will write to " + account.email + "." : "Saved. You will get no emails about new games or updates.";
      } catch { box.checked = !on; note.textContent = "That did not go through. Try again later."; }
      finally { box.disabled = false; }
    };
    const v = await askDialog(d, ACCOUNT_MSG, () => confirm("Sign out?") ? "signout" : "");
    if (v === "signout") { setAccount(null); useFeature("account_signout"); render(); }
    if (v !== "delete" || await askDialog(dialog("account-delete", CONFIRM), DELETE_ASK, () => confirm(DELETE_ASK) ? "delete" : "") !== "delete") return;
    try {
      await call(JSON.stringify({ action: "delete", token: account.token }));
      setAccount(null); useFeature("account_delete"); render("Your saved progress is deleted.");
    } catch { render("It could not be deleted just now. Try again later."); }
  }
  function render(msg = "") {
    const b = accountButton(!!account);
    corner.innerHTML = b.html; corner.title = b.title; corner.setAttribute("aria-label", b.title);
    const sd = document.getElementById("account-signin");
    if (msg && sd) sd.querySelector(".ask-msg").textContent = msg;   // the corner's flow says it there
    if (!line) return;
    line.textContent = msg ? msg + " " : "";
    if (account) line.insertAdjacentHTML("beforeend", '<span class="account-text">Signed in, progress saved.</span>');
    else {
      line.insertAdjacentHTML("beforeend", '<span class="account-main"><span class="account-text">Save your progress across devices:</span> <span class="gsi-box">' + signinButtonHtml() +
        '</span></span> <button type="button" class="quiet account-email">or with your email</button>');
      line.querySelector(".gsi-btn").onclick = () => signIn(line.querySelector(".gsi-box"));
      line.querySelector(".account-email").onclick = () => signInDialog(true);
    }
  }
  async function signedInWith(j) {
    setAccount(sessionOf(j));
    useFeature("account_signin");
    if (await pull(10000)) return onChange();
    pushSaves();
    render();
  }
  // Google's script loads only now (one press); its own button replaces ours in box (in case its prompt is not shown).
  async function signIn(box) {
    try { await loadGis(); } catch { render("Google's sign-in did not load (a blocker, or no connection)."); return false; }
    if (!gisReady) {
      gisReady = true;
      google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, use_fedcm_for_prompt: true, callback: async r => {
        const d = document.getElementById("account-signin");
        if (d && d.open) d.close();
        render("Signing you in...");
        try { await signedInWith(await call(JSON.stringify({ action: "signin", idToken: r.credential }))); }
        catch { render("The sign-in did not go through. Try again later."); }
      } });
    }
    box.replaceChildren();
    google.accounts.id.renderButton(box, { theme: "outline", text: "signin_with", size: "large", shape: "rectangular" });
    google.accounts.id.prompt();
    return true;
  }
  // The corner's Sign in: a small dialog holding Google's button, so the corner row never changes shape.
  async function signInDialog(emailFirst = false) {
    const d = dialog("account-signin", SIGNIN);
    if (!d.dataset.wired) { d.dataset.wired = "1"; wireEmail(d); }
    d.querySelector(".ask-msg").textContent = SIGNIN_MSG;
    d.querySelector(".acct-error").textContent = "";
    if (d.showModal && !d.open) d.showModal();
    if (emailFirst) d.querySelector("#acct-email").focus();
    await signIn(d.querySelector(".gsi-box"));
  }
  // The email form: Sign in, Create an account (a code by email, then Confirm), Forgot password? (a code and a new password).
  function wireEmail(d) {
    const $ = sel => d.querySelector(sel), err = t => { $(".acct-error").textContent = t; };
    const wait = on => { $(".acct-wait").textContent = on ? "Sending... this can take ten seconds." : ""; };
    let pending = "";   // "register" or "reset" while the code step shows
    const step = kind => {
      pending = kind;
      $(".acct-email").hidden = !!kind; $(".acct-code").hidden = !kind; $(".acct-new").hidden = kind !== "reset";
      $(".acct-sent").textContent = kind ? "We sent a 6-digit code to " + normEmail($("#acct-email").value) + ". It works for 15 minutes." : "";
      $("#acct-code").value = ""; $("#acct-newpass").value = "";
      (kind ? $("#acct-code") : $("#acct-pass")).focus();
    };
    async function send(body, busy) {
      busy.disabled = true; busy.classList.add("busy"); busy.setAttribute("aria-busy", "true"); err(""); wait(true);
      try { return await call(JSON.stringify(body)); }
      catch (e) { err(EMAIL_ERRORS[e.message] || "That did not go through. Check the connection and try again."); return null; }
      finally { busy.disabled = false; busy.classList.remove("busy"); busy.removeAttribute("aria-busy"); wait(false); }
    }
    async function act(name, btn) {
      const email = $("#acct-email").value, pw = $("#acct-pass").value;
      const bad = emailError(email) || (name === "signin" || name === "register" ? passwordError(pw) : "");
      if (name !== "code" && name !== "back" && bad) return err(bad);
      if (name === "back") { err(""); return step(""); }
      if (name === "forgot") { if (await send({ action: "resetcode", email: normEmail(email) }, btn)) step("reset"); return; }
      if (name === "register") { if (await send({ action: "register", email: normEmail(email), verifier: await passwordVerifier(email, pw), updates: $("#acct-news").checked }, btn)) step("register"); return; }
      if (name === "signin") { const j = await send({ action: "signin", email: normEmail(email), verifier: await passwordVerifier(email, pw) }, btn); if (j) { d.close(); await signedInWith(j); } return; }
      const code = $("#acct-code").value.trim();   // Confirm
      if (!/^\d{6}$/.test(code)) return err("Type the 6 digits from the email.");
      let j;
      if (pending === "reset") {
        const np = $("#acct-newpass").value;
        if (passwordError(np)) return err(passwordError(np));
        j = await send({ action: "reset", email: normEmail(email), code, verifier: await passwordVerifier(email, np) }, btn);
      } else j = await send({ action: "verify", email: normEmail(email), code }, btn);
      if (j) { step(""); d.close(); await signedInWith(j); }
    }
    d.querySelectorAll("button[data-act]").forEach(b => { b.onclick = () => act(b.dataset.act, b); });
    d.addEventListener("keydown", e => {   // Enter in a field presses its step's first button
      if (e.key !== "Enter" || e.target.tagName !== "INPUT") return;
      e.preventDefault();
      e.target.closest(".acct-step").querySelector("button[data-act]").click();
    });
    $('[data-act="register"]').addEventListener("pointerdown", () => $("#acct-pass").setAttribute("autocomplete", "new-password"));
  }
  render();
  return true;
}
