// site/ui.js -- small page widgets shared by the game and the handbook's exercises page: escaping, button-like
// elements, the icon buttons, the callout tour, the stories' markup. No import, side-effect free at import.

// HTML text of a value; null reads NULL (a result cell), so a missing value is never an empty cell.
export const esc = s => String(s === null || s === undefined ? "NULL" : s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

// Click or keyboard (Enter, Space) on an element that is not a <button>.
export function btnLike(el, fn) {
  el.tabIndex = 0; el.setAttribute("role", "button");
  el.onclick = fn;
  el.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(e); } };
}

// Icon buttons: a 16 px glyph stroked in currentColor (admin.js draws its own in the same style).
export const ICON_ATTRS = 'width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
// The Day/Night button: a sun offers the day edition, a crescent moon the night edition (icon-only under 900px).
export function themeButtonHtml(mood) {
  const svg = mood === "night"
    ? `<svg class="icon sun" ${ICON_ATTRS}><circle cx="8" cy="8" r="3"/><path d="M8 1.5V3M8 13V14.5M1.5 8H3M13 8H14.5M3.4 3.4L4.5 4.5M11.5 11.5L12.6 12.6M3.4 12.6L4.5 11.5M11.5 4.5L12.6 3.4"/></svg>`
    : `<svg class="icon moon" ${ICON_ATTRS}><path d="M14 8.53A6 6 0 1 1 7.47 2A4.67 4.67 0 0 0 14 8.53Z"/></svg>`;
  return `${svg}<span class="btn-text">${mood === "night" ? "Day edition" : "Night edition"}</span>`;
}
// The Send feedback button beside the Day/Night button on every page that has it (static HTML, a test checks): an
// envelope. feedback.js wireFeedback opens its form.
export const feedbackButtonHtml = `<button id="btn-feedback" class="quiet feedback-corner" title="Send feedback" aria-label="Send feedback">`
  + `<svg class="icon mail" ${ICON_ATTRS}><rect x="1.5" y="3.5" width="13" height="9" rx="1.5"/><path d="M2 4.5L8 9L14 4.5"/></svg><span class="btn-text">Feedback</span></button>`;
// The schema's Enlarge/Close button is icon-only: two arrows out to the corners, or an X once enlarged.
export function erdButtonHtml(large) {
  return large
    ? { label: "Close the schema", html: `<svg class="icon close" ${ICON_ATTRS}><path d="M3.5 3.5L12.5 12.5M12.5 3.5L3.5 12.5"/></svg>` }
    : { label: "Enlarge the schema", html: `<svg class="icon enlarge" ${ICON_ATTRS}><path d="M9.5 2.5H13.5V6.5M13.5 2.5L9 7M6.5 13.5H2.5V9.5M2.5 13.5L7 9"/></svg>` };
}
// An icon button's content and its name (title, aria-label): named when the phone shows the icon alone.
export function setIconButton(btn, { html, label }) {
  btn.innerHTML = html; btn.title = label; btn.setAttribute("aria-label", label);
}

// The callout's left edge under a target rect, kept inside a viewport of width vw.
export const calloutLeft = (rect, w, vw) => Math.max(8, Math.min(rect.left, vw - w - 8));
// Callouts in turn under each step's target ([selector, text]); done("done") after Got it, done("skip") on Skip or
// Escape. The game's chapter I tour (onboarding.js CALLOUTS) and the exercises page's (learn/exercises.js).
export function showCallouts(steps, done) {
  let i = 0;
  const el = document.createElement("div");
  el.className = "callout"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "A quick tour");
  document.body.appendChild(el);
  const place = () => {
    const t = document.querySelector(steps[i][0]); if (!t) return;
    const r = t.getBoundingClientRect();
    el.style.left = calloutLeft(r, el.offsetWidth, document.documentElement.clientWidth) + scrollX + "px";
    el.style.top = Math.min(r.bottom, r.top + 200) + scrollY + 8 + "px";   // under the target, or inside a tall one
  };
  const end = how => { el.remove(); removeEventListener("resize", place); done(how); };
  const step = () => {
    const last = i === steps.length - 1;
    el.innerHTML = "<p>" + esc(steps[i][1]) + '</p><div class="row"><span class="muted">' + (i + 1) + " of " + steps.length + "</span>" +
      (last ? "" : '<button class="quiet callout-skip">Skip</button>') + '<button class="callout-next">' + (last ? "Got it" : "Next") + "</button></div>";
    if (!last) el.querySelector(".callout-skip").onclick = () => end("skip");
    el.querySelector(".callout-next").onclick = () => { if (last) end("done"); else { i++; step(); } };
    document.querySelector(steps[i][0])?.scrollIntoView({ block: "center", behavior: "smooth" });
    place(); setTimeout(place, 500);   // again once the smooth scroll has settled
    el.querySelector(".callout-next").focus({ preventScroll: true });
  };
  addEventListener("resize", place);
  el.addEventListener("keydown", e => { if (e.key === "Escape") end("skip"); });
  step();
}

// Stories and endings carry **bold** and *italic* (plot.py); escaped first, so nothing else becomes markup.
export function richText(s) {
  const inline = t => esc(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\*(.+?)\*/g, "<i>$1</i>");
  const blocks = String(s).split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);
  const html = blocks.map(block => {
    const lines = block.split("\n").map(l => l.trim());
    if (!lines.every(l => l.startsWith("|"))) return blocks.length > 1 ? "<p>" + inline(lines.join(" ")) + "</p>" : inline(lines.join(" "));
    // a table: lines of | cells |, the first one the header
    const [head, ...rows] = lines.map(l => l.replace(/^\||\|$/g, "").split("|").map(c => inline(c.trim())));
    return "<table><thead><tr>" + head.map(c => "<th>" + c + "</th>").join("") + "</tr></thead><tbody>" +
      rows.map(r => "<tr>" + r.map(c => "<td>" + c + "</td>").join("") + "</tr>").join("") + "</tbody></table>";
  });
  return html.join("");
}
