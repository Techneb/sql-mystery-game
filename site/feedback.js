// site/feedback.js -- the Send feedback form behind #btn-feedback (ui.js feedbackButtonHtml), on the game, the
// handbook and the desk. A native <dialog> built here, posted to its own Apps Script (feedback_script.gs, not the
// compete backend), which appends a row to the owner's Sheet. Side-effect free at import; wireFeedback() wires a page.

// The feedback script's /exec URL (public by design: it only appends feedback rows). Empty: Send points to the email.
export const FEEDBACK_URL = "https://script.google.com/macros/s/AKfycbzR-3ijpW9RIFeR1zZg_zFdQ99nalwuxi0Lp8gTZZi7skItyNMSxoBqCJWcD1Rwj7NC/exec";
export const FEEDBACK_MAX = 2000, EMAIL_MAX = 120, PAGE_MAX = 200;
export const FEEDBACK_EMAIL = "contact@alephb.uk";

// The page sent with a message: the path alone (a query string can carry the board URL).
export const pagePath = loc => String(loc.pathname || "/").slice(0, PAGE_MAX);

// What helps reproduce a report, read from the browser (never the pseudo, answers or queries): device, system,
// browser, sizes, language, time zone, local time, the theme; plus the page's own extra (the game: chapter and mode).
export function clientContext(nav = {}, win = {}, extra = {}) {
  const ua = String(nav.userAgent || "");
  const os = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && nav.maxTouchPoints > 1) ? "iOS" : /Android/.test(ua) ? "Android"
    : /CrOS/.test(ua) ? "ChromeOS" : /Mac OS X|Macintosh/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "other";
  const m = ua.match(/Edg\/(\d+)/) ? ["Edge", ua.match(/Edg\/(\d+)/)[1]] : ua.match(/OPR\/(\d+)/) ? ["Opera", ua.match(/OPR\/(\d+)/)[1]]
    : ua.match(/(?:Firefox|FxiOS)\/(\d+)/) ? ["Firefox", ua.match(/(?:Firefox|FxiOS)\/(\d+)/)[1]]
    : ua.match(/(?:Chrome|CriOS)\/(\d+)/) ? ["Chrome", ua.match(/(?:Chrome|CriOS)\/(\d+)/)[1]]
    : ua.match(/Version\/(\d+).*Safari/) ? ["Safari", ua.match(/Version\/(\d+).*Safari/)[1]] : ["other", ""];
  const device = /iPad|Tablet/.test(ua) || (os === "iOS" && /Macintosh/.test(ua)) ? "tablet" : /Mobi|iPhone|Android/.test(ua) ? "mobile" : "desktop";
  const sc = win.screen || {};
  let tz = "", local = "";
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; local = new Date().toString().slice(0, 24); } catch {}
  const ctx = { device, os, browser: (m[0] + " " + m[1]).trim(), touch: nav.maxTouchPoints > 0 ? "yes" : "no",
    screen: sc.width ? sc.width + "x" + sc.height : "", window: win.innerWidth ? win.innerWidth + "x" + win.innerHeight : "",
    pixelRatio: win.devicePixelRatio ? String(win.devicePixelRatio) : "", language: String(nav.language || ""), timezone: tz, localTime: local,
    theme: (win.document && win.document.documentElement && win.document.documentElement.dataset.mood) || "", ...extra };
  for (const k of Object.keys(ctx)) ctx[k] = String(ctx[k]).slice(0, CTX_VALUE_MAX);
  return ctx;
}
export const CTX_VALUE_MAX = 80;

// The body to post, or the reason not to: the same rules as feedback_script.gs.
export function feedbackPayload(message, email, page, ctx) {
  const m = String(message || "").trim(), e = String(email || "").trim();
  if (!m) return { error: "Write a message first." };
  if (m.length > FEEDBACK_MAX) return { error: `At most ${FEEDBACK_MAX} characters, please.` };
  if (e && (e.length > EMAIL_MAX || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))) return { error: "That email address does not look right." };
  const body = { message: m, email: e, page: String(page).slice(0, PAGE_MAX) };
  if (ctx) body.ctx = ctx;
  return { body: JSON.stringify(body) };
}

const DIALOG = `<form method="dialog">
  <div class="label" id="feedback-title">SEND FEEDBACK</div>
  <p><label for="feedback-msg">Your message</label><textarea id="feedback-msg" rows="8" maxlength="${FEEDBACK_MAX}" required></textarea></p>
  <p><label for="feedback-email">Email, if you want an answer</label><input id="feedback-email" type="email" maxlength="${EMAIL_MAX}" autocomplete="email"></p>
  <p class="feedback-status" role="status"></p>
  <button value="send">Send</button> <button value="" class="quiet" formnovalidate>Cancel</button>
</form>`;

// Wires #btn-feedback: the dialog is created on the first click. onSend() runs after a message is accepted
// (the game and the handbook count it in GA; the desk passes nothing); extra() adds page facts to the context.
export function wireFeedback(onSend = () => {}, extra = () => ({})) {
  const btn = document.getElementById("btn-feedback");
  if (!btn) return;
  let d;
  btn.addEventListener("click", () => {
    if (!d) {
      d = document.createElement("dialog");
      d.id = "feedback"; d.className = "part2 feedback-dialog"; d.setAttribute("aria-labelledby", "feedback-title");
      d.innerHTML = DIALOG;
      document.body.appendChild(d);
      d.querySelector("form").addEventListener("submit", e => {
        if (e.submitter && e.submitter.value === "send") { e.preventDefault(); send(d, onSend, extra); }
      });
    }
    d.querySelector(".feedback-status").textContent = "";
    if (d.showModal) d.showModal(); else location.href = "mailto:" + FEEDBACK_EMAIL;
  });
}

async function send(d, onSend, extra) {
  const status = d.querySelector(".feedback-status"), sendBtn = d.querySelector('button[value="send"]');
  const msg = d.querySelector("#feedback-msg"), email = d.querySelector("#feedback-email");
  const p = feedbackPayload(msg.value, email.value, pagePath(location), clientContext(navigator, window, extra()));
  if (p.error) { status.textContent = p.error; return; }
  if (!FEEDBACK_URL) {
    status.innerHTML = `The form is not connected yet. Please write to <a href="mailto:${FEEDBACK_EMAIL}">${FEEDBACK_EMAIL}</a>.`;
    return;
  }
  sendBtn.disabled = true; status.textContent = "Sending...";
  try {
    // text/plain: no CORS preflight, which Apps Script cannot answer (as app.js postBoard)
    const r = await fetch(FEEDBACK_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: p.body, signal: AbortSignal.timeout(30000) });
    const j = r.ok ? await r.json() : { ok: false };
    if (!j.ok) throw new Error(j.error || "HTTP " + r.status);
    msg.value = ""; status.textContent = "Thanks, sent.";
    onSend();
  } catch (err) {
    status.textContent = err.message === "busy" ? "Too many messages right now. Try again in a few minutes." : "It could not be sent. Try again later, or write to " + FEEDBACK_EMAIL + ".";
  } finally { sendBtn.disabled = false; }
}
