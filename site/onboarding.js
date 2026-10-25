// site/onboarding.js -- a new player's first minutes in learn mode (owner, 2026-10-25): the clerk's first morning (a
// prologue on a tiny book built in the browser) and chapter I's callouts. state.onboarding walks "prologue" -> "tour"
// -> "done"; only New investigation (freshState) offers them again. Side-effect free at import.
import { normalise } from "./shared.js";
import { runSql, runHtml, runInfo, wireEditor, terminalDb, columns, EMPTY_RUN } from "./terminal.js";
import { esc } from "./ui.js";

const $ = id => document.getElementById(id);

// The book: never in mystery.sqlite, no cast, no planted value. Three steps: run the query, add a WHERE, answer.
export const PROLOGUE_QUERY = "SELECT * FROM lost_property";
export const PROLOGUE_ROWS = [[1, "umbrella", "Lobby", "Monday"], [2, "opera glasses", "Bar", "Monday"], [3, "left glove", "Dining room", "Tuesday"],
  [4, "walking stick", "Lobby", "Wednesday"], [5, "birdcage", "Garden", "Wednesday"], [6, "pocket watch", "Bar", "Thursday"]];
export const PROLOGUE_SCHEMA = { lost_property: [["id", "INTEGER", 1], ["item", "TEXT", 0], ["found_in", "TEXT", 0], ["day", "TEXT", 0]] };
export const PROLOGUE_STEPS = [
  "The query below asks for every row of the book. Press Run. Each row is one thing a guest left behind.",
  "Well read. Now keep only what was found in the garden: add WHERE found_in = 'Garden' at the end of the query and press Run again.",
  "One row is left. What did the guest leave in the garden? Type it in the answer box and press Submit.",
  "Correct. That is the job: query, read, answer. The inspector's archives are bigger, and their answers are not on the first page."];
export const prologueOn = state => state.mode !== "compete" && state.onboarding === "prologue" && !state.solved.length && !state.totalQueries;
export const tourOn = state => state.mode !== "compete" && state.onboarding === "tour" && !state.solved.length;
// The step a successful run leads to: the whole book moves on from step 0, the garden's lone row from step 1.
export function prologueAdvance(step, res) {
  if (!res) return step;
  if (step === 0 && res.values.length === PROLOGUE_ROWS.length) return 1;
  if (step === 1 && res.values.length === 1 && res.values[0].includes("birdcage")) return 2;
  return step;
}
export const prologueAnswer = a => normalise(a).replace(/ /g, "").includes("birdcage");

// The #prologue dialog, on sql.js's module SQL; done("done" | "skip") once it closes (Escape skips). Nothing happens
// where it cannot open (no <dialog>, sql.js not loaded): the prologue then waits for the next visit.
export function showPrologue(SQL, done) {
  const d = $("prologue");
  if (!d.showModal || !SQL) return;
  const pdb = new SQL.Database();
  pdb.run("CREATE TABLE lost_property (id INTEGER PRIMARY KEY, item TEXT, found_in TEXT, day TEXT)");
  for (const r of PROLOGUE_ROWS) pdb.run("INSERT INTO lost_property VALUES (?, ?, ?, ?)", r);
  terminalDb(pdb);
  const ta = $("prologue-sql"), cols = columns(PROLOGUE_SCHEMA);
  let step = 0;
  const show = () => {
    const el = $("prologue-step");   // a numbered, flashed box: a new step must not pass unnoticed (owner, 2026-10-25)
    el.innerHTML = '<span class="step-no">' + (step < 3 ? "Step " + (step + 1) + " of 3" : "Done") + "</span> " + esc(PROLOGUE_STEPS[step]);
    el.classList.remove("fresh"); void el.offsetWidth; el.classList.add("fresh");
    if (step) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    $("prologue-answer").hidden = step !== 2;
    $("prologue-done").hidden = step < 3;
    $("prologue-skip").hidden = step >= 3;
    if (step === 2) $("prologue-input").focus();
    if (step === 3) $("prologue-done").focus();
  };
  const run = () => {
    const sql = ta.value.trim();
    if (!sql) { $("prologue-results").innerHTML = EMPTY_RUN; return; }
    const r = runSql(pdb, sql, PROLOGUE_SCHEMA, cols);
    $("prologue-results").innerHTML = runHtml(r);
    $("prologue-info").textContent = runInfo(r);
    const next = r.error ? step : prologueAdvance(step, r.res);
    if (next !== step) { step = next; show(); }
  };
  const close = how => { pdb.close(); d.close(); done(how); };
  ta.value = PROLOGUE_QUERY; show();
  const sync = wireEditor(ta, d.querySelector(".sql-hl"), { run, cols: () => cols });
  $("prologue-run").onclick = run;
  const answer = () => {
    if (prologueAnswer($("prologue-input").value)) { step = 3; $("prologue-reply").textContent = ""; show(); }
    else $("prologue-reply").textContent = "Not quite. Look at the item column of the row you found.";
  };
  $("prologue-submit").onclick = answer;
  $("prologue-input").onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); answer(); } };
  $("prologue-done").onclick = () => close("done");
  $("prologue-skip").onclick = () => close("skip");
  d.oncancel = e => { e.preventDefault(); close(step >= 3 ? "done" : "skip"); };   // Escape skips
  d.showModal();
  sync();   // measured once the dialog is open
  ta.focus();
}

// Chapter I's callouts, shown once after the prologue or its skip (ui.js showCallouts). They point at the parts of
// the page, never at a table or anything that hints at the answer.
export const CALLOUTS = [
  ["#erd", "The schema lists the tables you can query and their columns. More appear as the case goes on."],
  ["#btn-run", "Write SQL in the box above and press Run (or Ctrl+Enter). The results appear underneath."],
  ["#objective", "The objective says what to find. Your answer goes in the box under the terminal."],
  ["#board", "Every answer you find is pinned to the case board."]];
