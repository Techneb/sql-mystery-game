// site/board.js -- the objective box and the case board as HTML (pure, side-effect free): the Hint and its Where to
// look, chapter I's two steps, the case board's cards, the masthead's chapter line. app.js writes them into the page.
import { esc } from "./ui.js";
import { stepOn } from "./state.js";
import { cardPicture } from "./suspects.js";
import { highlightSql } from "./terminal.js";

export const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];

// Masthead "CHAPTER I OF VIII": the current chapter's numeral in bold, the rest plain.
export function mastheadChapterHtml(n, total, reviewing) {
  return (reviewing ? "Reviewing chapter <b>" : "Chapter <b>") + ROMAN[n] + "</b> of " + ROMAN[total];
}
// A solved chapter's review: the query that cracked it (app.js winningQuery), coloured.
export const crackedHtml = sql => sql ? '<div class="cracked"><b>The query that cracked it:</b><pre class="sql-view">' + highlightSql(sql) + "</pre></div>" : "";

// A table name in the Hint: a button that scrolls to the schema and flashes that table (app.js showTable).
const tableLink = t => '<button type="button" class="table-link" data-table="' + esc(t) + '"><code>' + esc(t) + "</code></button>";
// "Where to look" (learn only, chapters.json `where`): escaped first, then each `name` becomes a table link.
export const whereHtml = s => esc(s).replace(/`([a-z_]+)`/g, (_, t) => tableLink(t));
export const objectiveHtml = (text, label, value, ch, found = "") => esc(text) + '<div class="answer-form"><b>' + label + "</b> " + esc(value) + "</div>" + found +
  // the chapter's SQL tool and new tables sit under a closed Hint toggle (a native <details>), so the
  // student tries first and opens it when stuck; a nested closed "Where to look" holds the chapter's line
  (ch && (ch.construct || (ch.tables || []).length || ch.where) ? '<details class="muted chapter-tools"><summary>Hint</summary>' +
    (ch.construct ? "<div><b>This chapter's tool:</b> " + esc(ch.construct) + "</div>" : "") +
    ((ch.tables || []).length ? "<div><b>New evidence:</b> " + ch.tables.map(tableLink).join(", ") + "</div>" : "") +
    (ch.where ? '<details class="hint-where"><summary>Where to look</summary><div>' + whereHtml(ch.where) + "</div></details>" : "") +
    "</details>" : "");

// Chapter I's step 1 once answered: its label and the date as typed, under the answer line (step 2 and the review).
export const stepDoneHtml = (ch, state) => ch.step1 && state.step1 ? '<div class="answer-form"><b>' + esc(ch.step1.board) + ":</b> " + esc(state.step1) + "</div>" : "";
// The objective of the question asked now: step 1 (its own objective and Where to look) or the chapter's.
export function currentObjectiveHtml(ch, state) {
  const step = stepOn(state, ch);
  return step ? objectiveHtml(step.objective, "Answer:", step.answer_form, { ...ch, where: step.where })
    : objectiveHtml(ch.objective, "Answer:", ch.answer_form, ch, stepDoneHtml(ch, state));
}
// The Where to look opened on chapter n, as [its key in state.hintsWhere, hint_where's params]: chapter I's two steps
// count apart (keys 1 and "1b", param step 1 or 2), every other chapter by its number alone.
export function whereOpened(state, ch, n) {
  if (!ch || !ch.step1) return [n, { chapter: n, mode: state.mode }];
  const step = stepOn(state, ch) ? 1 : 2;
  return [step === 1 ? n : n + "b", { chapter: n, mode: state.mode, step }];
}

// The case board's cards: one per solved chapter (ROMAN label answer), chapter I's date under its report; the date
// alone on a card of its own (not a review link: the chapter is still open) between chapter I's two answers.
export function boardCardsHtml(state, chapters) {
  const label = n => (chapters.find(c => c.n === n) || {}).board || "";
  const step1 = (chapters.find(c => c.n === 1) || {}).step1;
  const dated = step1 && state.step1 ? esc(step1.board) + ": " + esc(state.step1) : "";
  const card = (n, attr, lab, answer, extra) => { const p = cardPicture(n, answer);
    return '<div class="card"' + attr + '><img class="card-pic' + (p.face ? " face" : "") + '" src="' + p.src + '" alt=""><b>' + ROMAN[n] + '</b> <span class="card-label">' +
      esc(lab) + "</span>" + (answer ? "<br>" + esc(answer) : "") + extra + "</div>"; };   // older saves have no answers: no "NULL" card
  return (dated && !state.solved.includes(1) ? card(1, "", step1.board, state.step1, "") : "") +
    state.solved.map(n => card(n, ' data-n="' + n + '"', label(n), state.answers[n], n === 1 && dated ? '<br><span class="card-step">' + dated + "</span>" : "")).join("");
}
