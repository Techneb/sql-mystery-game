// The handbook's exercises page made interactive: the bakery database (learn/database.html's script) built in the
// browser with sql.js, the game's terminal (terminal.js: the same run pipeline and editor as the game), and a check
// of the last result against the chosen question's solution, run on the same database. It never loads the game.
// The page itself stays complete without this script: every question, row count and solution is in the HTML.
import { wireEditor, runSql, runHtml, runInfo, pushHistory, EMPTY_RUN } from "../terminal.js";
import { toSqlite } from "../strict.js";
import { openBakery, sameResult, checkOptions } from "./bakery.js";
import { btnLike, erdButtonHtml, setIconButton, showCallouts, NARROW } from "../ui.js";
import { initAds, track, trackOnce, useFeature, queryFail } from "../stats.js";
import { escapeHtml } from "../shared.js";

const STORE = "ritz.exercises";                  // the questions solved
const HISTORY_STORE = "ritz.exercises.history";   // the queries run (the game keeps its own in ritz.learn)

// The bakery tables a solution reads (shown with the question).
export function tablesNamed(sql, names) { return names.filter(t => new RegExp("\\b" + t + "\\b", "i").test(sql)); }

// The levels (the page's Warm-up, Practice and Challenge headings). The level shown first: the linked question's,
// else the first level with a question left to solve. A level's button selects its first unsolved question.
export function startLevel(items, solved, slug) {
  const e = items.find(x => x.slug === slug) || items.find(x => !solved.includes(x.slug)) || items[0];
  return e.level;
}
// GA's name for a level: its heading in lower case (warm-up, practice, challenge).
export const levelId = level => level.toLowerCase();

export function levelPick(items, level, solved) {
  const list = items.filter(x => x.level === level);
  return list.find(x => !solved.includes(x.slug)) || list[0];
}

// The workbench's callouts (owner, 2026-10-25), the game's chapter I tour (ui.js showCallouts) on this page's parts.
// Shown once, when the workbench is up and the database ready; remembered in TOUR_STORE. Never a solution.
export const TOUR_STORE = "ritz.exercises.tour";
export const EX_CALLOUTS = [
  [".wb-schema", "The schema shows the bakery's tables, their columns and the lines that link them. Enlarge opens it full size."],
  ["#ex-run", "Write a query in the box above and press Run (or Ctrl+Enter). Tab completes table and column names."],
  ["#ex-pick", "Pick a level (Warm-up, Practice or Challenge), then a question from this list. If you get stuck, Show solution under the question opens a worked answer."],
  ["#ex-question", "A result that matches the question's gets a green Solved mark beside QUESTION and a tick in the list."],
  [".ex-history", "History keeps the queries you ran. Click one to put it back in the box."]];

function load(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; } }
function save(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private window: kept this visit only */ } }

async function boot() {
  const $ = id => document.getElementById(id);
  const bench = $("workbench");
  const items = [...document.querySelectorAll("p.exercise")].map(p => {
    const sol = p.nextElementSibling;
    let h = p.previousElementSibling;
    while (h && h.tagName !== "H2") h = h.previousElementSibling;
    return { p, slug: p.id, level: h.textContent, title: p.querySelector("b").textContent.replace(/\.$/, ""), sol, sql: sol.querySelector("pre code").textContent, opts: checkOptions(p.dataset) };
  });
  const levels = [...new Set(items.map(e => e.level))];
  let solved = load(STORE, []).filter(s => items.some(e => e.slug === s)), cur = items[0], level = null, db = null, schema = {}, names = [], cols = {};
  const hist = { history: load(HISTORY_STORE, []).filter(q => typeof q === "string") };
  const pick = $("ex-pick");
  const TICK = String.fromCharCode(0x2713), BLANK = String.fromCharCode(0x2003);   // a check mark, or an em space as wide
  const optionText = e => (solved.includes(e.slug) ? TICK : BLANK) + " " + e.title;
  $("ex-levels").innerHTML = levels.map(l => '<button type="button" class="quiet" aria-pressed="false">' + escapeHtml(l) + "</button>").join("");
  const buttons = [...$("ex-levels").children];
  function setLevel(l) {
    level = l;
    buttons.forEach((b, i) => b.setAttribute("aria-pressed", String(levels[i] === l)));
    pick.innerHTML = items.filter(e => e.level === l).map(e => '<option value="' + e.slug + '">' + escapeHtml(optionText(e)) + "</option>").join("");
  }
  const refreshTicks = () => [...pick.options].forEach(o => { o.textContent = optionText(items.find(e => e.slug === o.value)); });

  const status = (cls, text) => { const s = $("ex-status"); s.className = "ex-status " + cls; s.textContent = text || ""; s.hidden = !text; };
  const markSolved = () => { $("ex-solved").hidden = !solved.includes(cur.slug); };
  function show(e) {
    cur = e;
    if (e.level !== level) setLevel(e.level);
    pick.value = e.slug;
    const q = e.p.cloneNode(true);
    q.removeAttribute("id");
    const sol = e.sol.cloneNode(true);
    sol.open = false;
    sol.querySelector("summary").textContent = "Show solution";
    $("ex-question").replaceChildren(q, sol);
    $("ex-tables").textContent = names.length ? "Tables: " + tablesNamed(e.sql, names).join(", ") : "";
    markSolved();
    status("", "");   // the solved mark next to QUESTION says the rest
  }
  const choose = e => { show(e); history.replaceState(null, "", "#" + e.slug); };
  pick.onchange = () => choose(items.find(e => e.slug === pick.value));
  buttons.forEach((b, i) => { b.onclick = () => { track("exercise_level", { level: levelId(levels[i]) }); setLevel(levels[i]); choose(levelPick(items, levels[i], solved)); }; });

  // A #slug link ("Try it" on the other pages) lands on the workbench, its question chosen. The static questions
  // are hidden once the workbench is up (they stay in the HTML for readers without JavaScript), so the browser's
  // own jump finds no visible target; the page is scrolled again once loaded, unless the reader has moved.
  const fromHash = () => items.find(e => "#" + e.slug === location.hash);
  let moved = false;
  const land = () => { if (!moved) bench.scrollIntoView({ block: "start" }); };
  window.addEventListener("hashchange", () => { const e = fromHash(); if (e) { show(e); moved = false; land(); } });
  bench.hidden = false;
  $("ex-static").hidden = true;
  // How to use this page sits above the workbench in the HTML (read without JavaScript); with it, under History.
  const howto = document.querySelector("details.howto");
  if (howto) bench.querySelector(".wb-question").prepend(howto);   // above the question choice (owner, 2026-10-20)
  // The page title moves, small, to the top of the question column, so the schema and terminal start higher
  // (owner, 2026-10-20). Without JavaScript it stays the page's own heading.
  const title = document.querySelector("main h1");
  if (title) { bench.querySelector(".wb-question").prepend(title); title.classList.add("wb-title"); }
  // The schema's Enlarge button, as in the game: a fixed overlay, closed by the X, a second click or Escape.
  const erdBox = bench.querySelector(".bakery-erd"), erdBtn = $("btn-erd");
  const setErd = large => { erdBox.classList.toggle("large", large); setIconButton(erdBtn, erdButtonHtml(large)); };
  setErd(false);
  erdBtn.onclick = () => { const large = !erdBox.classList.contains("large"); setErd(large); if (large) useFeature("schema_enlarge"); };
  document.addEventListener("keydown", ev => { if (ev.key === "Escape" && erdBox.classList.contains("large")) { setErd(false); erdBtn.focus(); } });
  const linked = fromHash();
  setLevel(startLevel(items, solved, linked && linked.slug));
  show(linked || levelPick(items, level, solved));
  if (linked) {
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    for (const t of ["wheel", "touchmove", "keydown", "mousedown"]) window.addEventListener(t, () => { moved = true; }, { once: true, passive: true });
    land();
    if (document.readyState !== "complete") window.addEventListener("load", land, { once: true });
  }
  initAds();

  const ta = $("sql");
  const sync = wireEditor(ta, $("sql-hl"), { run, cols: () => cols, minHeight: matchMedia(NARROW).matches ? 64 : 140 });   // the whole bakery
  // History, as in the game: most recent first, 20 at most, a query that errors or is refused never kept; per browser.
  function renderHistory() {
    $("history").innerHTML = hist.history.map(q => "<li>" + escapeHtml(q) + "</li>").join("");
    [...$("history").children].forEach((li, i) => btnLike(li, () => { ta.value = hist.history[i]; sync(); ta.focus(); useFeature("history_reuse"); }));
  }
  renderHistory();
  $("ex-run").onclick = run;

  const solutions = {}, runs = {}, fails = {};   // this page load's runs and failed runs per question (GA)
  function run() {
    const sql = ta.value.trim();
    if (!db) return;
    if (!sql) { $("ex-results").innerHTML = EMPTY_RUN; $("ex-info").textContent = ""; return; }   // not a run
    const r = runSql(db, sql, schema, cols, "tables"), { res, error } = r;
    $("ex-results").innerHTML = runHtml(r, "");
    $("ex-info").textContent = runInfo(r);
    const ex = cur.slug, level = levelId(cur.level);
    runs[ex] = (runs[ex] || 0) + 1;
    trackOnce("run:" + ex, "exercise_run", { exercise: ex, level, outcome: r.outcome.kind });
    const fail = error && queryFail(fails, ex, r.outcome);
    if (fail) track("query_fail", { exercise: ex, ...fail });
    if (error) return status("wrong", "Fix the error first, then run it again.");
    pushHistory(hist, sql);
    save(HISTORY_STORE, hist.history);
    renderHistory();
    const hits = items.filter(e => sameResult(res, solutions[e.slug], e.opts));
    hits.forEach(e => { if (!solved.includes(e.slug)) solved.push(e.slug); });
    hits.forEach(e => trackOnce("solve:" + e.slug, "exercise_solve", { exercise: e.slug, level: levelId(e.level), runs: runs[e.slug] || 0 }));
    if (hits.length) { save(STORE, solved); refreshTicks(); markSolved(); }
    const rows = res ? res.values.length : 0, want = solutions[cur.slug] ? solutions[cur.slug].values.length : 0;
    if (hits.includes(cur)) status("", "");
    else if (hits.length) status("other", "Not this one, but that result answers " + hits.map(e => e.title).join(", ") + ".");
    else status("wrong", rows !== want ? "Not yet: " + rows + " rows, the question expects " + want + "." : "Not yet: the right number of rows, but not the same values" + (cur.opts.ordered ? " or not in the order asked." : "."));
  }

  try {
    ({ db, schema, cols } = await openBakery());
    names = Object.keys(schema);
    for (const e of items) { const all = db.exec(toSqlite(e.sql)); solutions[e.slug] = all[all.length - 1] || null; }
    $("ex-info").textContent = "Bakery database ready.";
    show(cur);
    if (linked) land();
    if (!load(TOUR_STORE, false)) {   // blocked storage: once per page load
      save(TOUR_STORE, true);
      showCallouts(EX_CALLOUTS, how => useFeature(how === "done" ? "tour_done" : "tour_skip"));
    }
  } catch (e) {
    $("ex-info").textContent = "The SQL engine did not load (" + e.message + "): the questions and solutions are still here.";
    $("ex-static").hidden = false;
  }
}

if (typeof document !== "undefined") boot();
