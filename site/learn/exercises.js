// The handbook's exercises page made interactive: the bakery database (learn/database.html's script) built in the
// browser with sql.js, the game's terminal rules (strictCheck, cartesian guard, query_only, case-sensitive LIKE),
// and a check of the last result against the chosen question's solution, run on the same database.
// The page itself stays complete without this script: every question, row count and solution is in the HTML.
import { highlightSql, formatSql, strictCheck, strictHtml, cartesian, toSqlite, renderResults, terminalDb, escapeHtml, pushHistory, btnLike, initAds } from "../app.js";

const VERSION = new URL(import.meta.url).search;
const STORE = "ritz.exercises";                  // the questions solved
const HISTORY_STORE = "ritz.exercises.history";   // the queries run (the game keeps its own in ritz.learn)

// How a question is checked, from its <p class="exercise"> data attributes: data-ordered when the question asks for
// an order ("cheapest first"), data-need the solution's columns a result must show (indices, default all: the
// others are the solution's extras, such as an id), data-tolerance for numbers the question does not ask to round.
export function checkOptions(dataset) {
  return {
    ordered: dataset.ordered !== undefined,
    need: dataset.need ? dataset.need.split(",").map(Number) : null,
    tol: dataset.tolerance ? Number(dataset.tolerance) : 1e-6,
  };
}

const asNumber = v => typeof v === "number" ? v : typeof v === "string" && /^\s*-?\d+(\.\d+)?\s*$/.test(v) ? Number(v) : null;
export function sameValue(a, b, tol = 1e-6) {
  if (a === null || a === undefined || b === null || b === undefined) return (a ?? null) === (b ?? null);
  const x = asNumber(a), y = asNumber(b);   // 7 and '07', 4.5 and 4.50 are the same answer
  if (x !== null && y !== null) return Math.abs(x - y) <= tol + 1e-9;
  return String(a) === String(b);
}
// ponytail: greedy row matching; two rows equal only within the tolerance could pair badly (never on this data).
function sameRows(U, S, ordered, tol) {
  if (ordered) return U.every((r, i) => r.every((v, j) => sameValue(v, S[i][j], tol)));
  const left = S.slice();
  return U.every(r => {
    const k = left.findIndex(s => s.every((v, j) => sameValue(r[j], v, tol)));
    return k >= 0 && left.splice(k, 1);
  });
}
// user, sol: sql.js results ({columns, values}, or null for no rows). Column names never count and the columns may
// come in any order; the result may carry more columns than the solution needs, never fewer, and exactly its rows.
export function sameResult(user, sol, { ordered = false, need = null, tol = 1e-6 } = {}) {
  const U = user ? user.values : [], S = sol ? sol.values : [];
  if (U.length !== S.length) return false;
  if (!S.length) return true;
  const cols = need || S[0].map((_, i) => i), width = U[0].length;
  const want = S.map(r => cols.map(i => r[i]));
  const cand = cols.map((_, k) => [...Array(width).keys()].filter(j => sameRows(U.map(r => [r[j]]), want.map(r => [r[k]]), false, tol)));
  const pick = used => used.length === cols.length ? sameRows(U.map(r => used.map(j => r[j])), want, ordered, tol)
    : cand[used.length].some(j => !used.includes(j) && pick([...used, j]));
  return pick([]);
}
// The bakery tables a solution reads (shown with the question).
export function tablesIn(sql, names) { return names.filter(t => new RegExp("\\b" + t + "\\b", "i").test(sql)); }

// The levels (the page's Warm-up, Practice and Challenge headings). The level shown first: the linked question's,
// else the first level with a question left to solve. A level's button selects its first unsolved question.
export function startLevel(items, solved, slug) {
  const e = items.find(x => x.slug === slug) || items.find(x => !solved.includes(x.slug)) || items[0];
  return e.level;
}
export function levelPick(items, level, solved) {
  const list = items.filter(x => x.level === level);
  return list.find(x => !solved.includes(x.slug)) || list[0];
}

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
  let solved = load(STORE, []).filter(s => items.some(e => e.slug === s)), cur = items[0], level = null, db = null, schema = {}, names = [];
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

  const status = (cls, text) => { const s = $("ex-status"); s.className = "ex-status " + cls; s.textContent = text; };
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
    $("ex-tables").textContent = names.length ? "Tables: " + tablesIn(e.sql, names).join(", ") : "";
    markSolved();
    if (solved.includes(e.slug)) status("solved", "Solved. Your result matched this question's.");
    else status("", e.opts.ordered ? "Run a query: the result is checked here, rows in the order the question asks." : "Run a query: the result is checked here, in any row order.");
  }
  const choose = e => { show(e); history.replaceState(null, "", "#" + e.slug); };
  pick.onchange = () => choose(items.find(e => e.slug === pick.value));
  buttons.forEach((b, i) => { b.onclick = () => { setLevel(levels[i]); choose(levelPick(items, levels[i], solved)); }; });

  // A #slug link ("Try it" on the other pages) lands on the workbench, its question chosen. The static questions
  // are hidden once the workbench is up (they stay in the HTML for readers without JavaScript), so the browser's
  // own jump finds no visible target; the page is scrolled again once loaded, unless the reader has moved.
  const fromHash = () => items.find(e => "#" + e.slug === location.hash);
  let moved = false;
  const land = () => { if (!moved) bench.scrollIntoView({ block: "start" }); };
  window.addEventListener("hashchange", () => { const e = fromHash(); if (e) { show(e); moved = false; land(); } });
  bench.hidden = false;
  $("ex-static").hidden = true;
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
  const sync = () => { $("sql-hl").innerHTML = highlightSql(ta.value); ta.style.height = "auto"; ta.style.height = Math.max(140, ta.scrollHeight + 2) + "px"; };
  // History, as in the game: most recent first, 20 at most, a query that errors or is refused never kept; per browser.
  function renderHistory() {
    $("history").innerHTML = hist.history.map(q => "<li>" + escapeHtml(q) + "</li>").join("");
    [...$("history").children].forEach((li, i) => btnLike(li, () => { ta.value = hist.history[i]; sync(); ta.focus(); }));
  }
  renderHistory();
  ta.addEventListener("input", sync);
  ta.addEventListener("keydown", ev => {
    if ((ev.ctrlKey || ev.metaKey) && ev.key === "Enter") { ev.preventDefault(); run(); }
    else if (ev.ctrlKey && !ev.metaKey && ev.key.toLowerCase() === "f") { ev.preventDefault(); ta.value = formatSql(ta.value); sync(); }
    else if (ev.key === "Tab" && !ev.shiftKey) {   // Shift+Tab leaves the box
      ev.preventDefault();
      const s = ta.selectionStart;
      ta.value = ta.value.slice(0, s) + "\t" + ta.value.slice(ta.selectionEnd);
      ta.selectionStart = ta.selectionEnd = s + 1;
      sync();
    }
  });
  sync();
  $("ex-run").onclick = run;

  const solutions = {};
  function run() {
    const sql = ta.value.trim();
    if (!sql || !db) return;
    let res = null, error = null, strict = null;
    if (cartesian(sql)) error = "Two tables side by side with nothing to match them: say what joins them (ON or WHERE).";
    else if ((strict = strictCheck(sql, schema))) error = strict.error;
    else try { const all = db.exec(toSqlite(sql)); res = all[all.length - 1] || null; } catch (e) { error = e.message; }
    $("ex-results").innerHTML = strict ? strictHtml(strict, "") : error ? '<div class="error">' + escapeHtml(error) + "</div>" : renderResults(res);
    $("ex-info").textContent = error ? "error" : (res ? res.values.length : 0) + " rows";
    if (error) return status("wrong", "Fix the error first, then run it again.");
    pushHistory(hist, sql);
    save(HISTORY_STORE, hist.history);
    renderHistory();
    const hits = items.filter(e => sameResult(res, solutions[e.slug], e.opts));
    hits.forEach(e => { if (!solved.includes(e.slug)) solved.push(e.slug); });
    if (hits.length) { save(STORE, solved); refreshTicks(); markSolved(); }
    const rows = res ? res.values.length : 0, want = solutions[cur.slug] ? solutions[cur.slug].values.length : 0;
    if (hits.includes(cur)) status("solved", "Solved. That is the answer to this question.");
    else if (hits.length) status("other", "Not this one, but that result answers " + hits.map(e => e.title).join(", ") + ".");
    else status("wrong", rows !== want ? "Not yet: " + rows + " rows, the question expects " + want + "." : "Not yet: the right number of rows, but not the same values" + (cur.opts.ordered ? " or not in the order asked." : "."));
  }

  try {
    const html = await (await fetch("database.html" + VERSION)).text();
    const script = new DOMParser().parseFromString(html, "text/html").querySelector("details.script code").textContent;
    const SQL = await initSqlJs({ locateFile: f => "https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.13.0/" + f });
    db = new SQL.Database();
    db.run(script);
    terminalDb(db);
    names = db.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")[0].values.map(r => r[0]);
    for (const t of names) schema[t] = db.exec("PRAGMA table_info(" + t + ")")[0].values.map(r => [r[1], r[2], r[5]]);
    for (const e of items) { const all = db.exec(toSqlite(e.sql)); solutions[e.slug] = all[all.length - 1] || null; }
    $("ex-info").textContent = "Bakery database ready.";
    show(cur);
    if (linked) land();
  } catch (e) {
    $("ex-info").textContent = "The SQL engine did not load (" + e.message + "): the questions and solutions are still here.";
    $("ex-static").hidden = false;
  }
}

if (typeof document !== "undefined") boot();
