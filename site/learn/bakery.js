// The bakery database in the browser, and the check of a result against a solution: shared by the exercises page
// (exercises.js) and the small tasks inside the lesson pages (tasks.js). Side-effect free at import.
import { openSqlJs, terminalDb, readSchema, columns } from "../terminal.js";

const VERSION = new URL(import.meta.url).search;

// How a question is checked, from its data attributes: data-ordered when the question asks for an order
// ("cheapest first"), data-need the solution's columns a result must show (indices, default all: the others are
// the solution's extras, such as an id), data-tolerance for numbers the question does not ask to round.
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

// sql.js and the bakery, built from learn/database.html's script (fetched + VERSION), once per page load:
// resolves to { db, schema, cols }. A failure is forgotten, so the next call tries again.
// sql.js itself: a <script> on exercises.html; a lesson page adds the same one (same version and SRI) on first use.
export const SQL_JS = "https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.13.0/sql-wasm.js";
export const SQL_JS_SRI = "sha384-DJiKBv+LC78e5InEB+MvFIAH079ynMK/ERTtFUCpDzXhH1Bht7aVfpg3yOVsuYl9";
const loadSqlJs = () => globalThis.initSqlJs ? Promise.resolve() : new Promise((ok, fail) => {
  const s = Object.assign(document.createElement("script"), { src: SQL_JS, integrity: SQL_JS_SRI, crossOrigin: "anonymous", onload: ok });
  s.onerror = () => { s.remove(); fail(new Error("sql.js did not load")); };
  document.head.append(s);
});
let bakery = null;
export function openBakery() {
  return bakery ||= (async () => {
    await loadSqlJs();
    const html = await (await fetch("database.html" + VERSION)).text();
    const script = new DOMParser().parseFromString(html, "text/html").querySelector("details.script code").textContent;
    const SQL = await openSqlJs();
    const db = new SQL.Database();
    db.run(script);
    terminalDb(db);
    const schema = readSchema(db);
    return { db, schema, cols: columns(schema) };
  })().catch(e => { bakery = null; throw e; });
}
