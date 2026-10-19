// The handbook's exercises page made interactive: the bakery database (learn/database.html's script) built in the
// browser with sql.js, the game's terminal rules (strictCheck, cartesian guard, query_only, case-sensitive LIKE),
// and a check of the last result against the chosen question's solution, run on the same database.
// The page itself stays complete without this script: every question, row count and solution is in the HTML.
import { highlightSql, formatSql, strictCheck, strictHtml, cartesian, toSqlite, renderResults, terminalDb, escapeHtml } from "../app.js";

const VERSION = new URL(import.meta.url).search;
const STORE = "ritz.exercises";

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

function loadSolved() { try { return JSON.parse(localStorage.getItem(STORE)) || []; } catch { return []; } }
function saveSolved(list) { try { localStorage.setItem(STORE, JSON.stringify(list)); } catch { /* private window: ticks last this visit only */ } }

async function boot() {
  const $ = id => document.getElementById(id);
  const bench = $("workbench");
  const items = [...document.querySelectorAll("p.exercise")].map(p => {
    const sol = p.nextElementSibling;
    return { p, slug: p.id, title: p.querySelector("b").textContent.replace(/\.$/, ""), sol, sql: sol.querySelector("pre code").textContent, opts: checkOptions(p.dataset) };
  });
  let solved = loadSolved().filter(s => items.some(e => e.slug === s)), cur = items[0], db = null, schema = {}, names = [];
  const pick = $("ex-pick");
  const TICK = String.fromCharCode(0x2713), BLANK = String.fromCharCode(0x2003);   // a check mark, or an em space as wide
  const optionText = e => (solved.includes(e.slug) ? TICK : BLANK) + " " + e.title;
  pick.innerHTML = items.map(e => '<option value="' + e.slug + '">' + escapeHtml(optionText(e)) + "</option>").join("");
  const refreshTicks = () => items.forEach((e, i) => { pick.options[i].textContent = optionText(e); });

  const status = (cls, text) => { const s = $("ex-status"); s.className = "ex-status " + cls; s.textContent = text; };
  function show(e) {
    cur = e;
    pick.value = e.slug;
    const q = e.p.cloneNode(true);
    q.removeAttribute("id");
    const sol = e.sol.cloneNode(true);
    sol.open = false;
    sol.querySelector("summary").textContent = "Show solution";
    $("ex-question").replaceChildren(q, sol);
    $("ex-tables").textContent = names.length ? "Tables: " + tablesIn(e.sql, names).join(", ") : "";
    if (solved.includes(e.slug)) status("solved", "Solved. Your result matched this question's.");
    else status("", e.opts.ordered ? "Run a query: the result is checked here, rows in the order the question asks." : "Run a query: the result is checked here, in any row order.");
  }
  pick.onchange = () => { show(items.find(e => e.slug === pick.value)); history.replaceState(null, "", "#" + cur.slug); };
  const fromHash = () => items.find(e => "#" + e.slug === location.hash);
  window.addEventListener("hashchange", () => { const e = fromHash(); if (e) { show(e); bench.scrollIntoView(); } });
  bench.hidden = false;
  const linked = fromHash();
  show(linked || items[0]);
  if (linked) bench.scrollIntoView();   // a "Try it" link lands on the terminal, the question chosen

  const ta = $("sql");
  const sync = () => { $("sql-hl").innerHTML = highlightSql(ta.value); ta.style.height = "auto"; ta.style.height = Math.max(140, ta.scrollHeight + 2) + "px"; };
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
    $("ex-results").innerHTML = strict ? strictHtml(strict, "grammar.html") : error ? '<div class="error">' + escapeHtml(error) + "</div>" : renderResults(res);
    $("ex-info").textContent = error ? "error" : (res ? res.values.length : 0) + " rows";
    if (error) return status("wrong", "Fix the error first, then run it again.");
    const hits = items.filter(e => sameResult(res, solutions[e.slug], e.opts));
    hits.forEach(e => { if (!solved.includes(e.slug)) solved.push(e.slug); });
    if (hits.length) { saveSolved(solved); refreshTicks(); }
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
  } catch (e) {
    $("ex-info").textContent = "The SQL engine did not load (" + e.message + "): the questions and solutions below still work.";
  }
}

if (typeof document !== "undefined") boot();
