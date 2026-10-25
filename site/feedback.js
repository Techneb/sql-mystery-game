// site/feedback.js -- the Send feedback form behind #btn-feedback (ui.js feedbackButtonHtml), on the game, the
// handbook and the desk. A native <dialog> built here, posted to its own Apps Script (feedback_script.gs, not the
// compete backend), which appends a row to the owner's Sheet. Side-effect free at import; wireFeedback() wires a page.

// The feedback script's /exec URL (public by design: it only appends feedback rows). Empty: Send points to the email.
export const FEEDBACK_URL = "";
export const FEEDBACK_MAX = 2000, EMAIL_MAX = 120, PAGE_MAX = 200;
export const FEEDBACK_EMAIL = "contact@alephb.uk";

// The page sent with a message: the path alone (a query string can carry the board URL).
export const pagePath = loc => String(loc.pathname || "/").slice(0, PAGE_MAX);

// The body to post, or the reason not to: the same rules as feedback_script.gs.
export function feedbackPayload(message, email, page) {
  const m = String(message || "").trim(), e = String(email || "").trim();
  if (!m) return { error: "Write a message first." };
  if (m.length > FEEDBACK_MAX) return { error: `At most ${FEEDBACK_MAX} characters, please.` };
  if (e && (e.length > EMAIL_MAX || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))) return { error: "That email address does not look right." };
  return { body: JSON.stringify({ message: m, email: e, page: String(page).slice(0, PAGE_MAX) }) };
}

const DIALOG = `<form method="dialog">
  <div class="label" id="feedback-title">SEND FEEDBACK</div>
  <p><label for="feedback-msg">Your message</label><textarea id="feedback-msg" rows="6" maxlength="${FEEDBACK_MAX}" required></textarea></p>
  <p><label for="feedback-email">Email, if you want an answer</label><input id="feedback-email" type="email" maxlength="${EMAIL_MAX}" autocomplete="email"></p>
  <p class="feedback-status" role="status"></p>
  <button value="send">Send</button> <button value="" class="quiet" formnovalidate>Cancel</button>
</form>`;

// Wires #btn-feedback: the dialog is created on the first click. onSend() runs after a message is accepted
// (the game and the handbook count it in GA; the desk passes nothing).
export function wireFeedback(onSend = () => {}) {
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
        if (e.submitter && e.submitter.value === "send") { e.preventDefault(); send(d, onSend); }
      });
    }
    d.querySelector(".feedback-status").textContent = "";
    if (d.showModal) d.showModal(); else location.href = "mailto:" + FEEDBACK_EMAIL;
  });
}

async function send(d, onSend) {
  const status = d.querySelector(".feedback-status"), sendBtn = d.querySelector('button[value="send"]');
  const msg = d.querySelector("#feedback-msg"), email = d.querySelector("#feedback-email");
  const p = feedbackPayload(msg.value, email.value, pagePath(location));
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
