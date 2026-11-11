// The small "Try it here" tasks inside the lesson pages (<div class="task">: a question, then its solution in a
// closed <details>). handbook.js adds the button and imports this module on the first click, so a page nobody
// practises on never loads sql.js. Each task gets the game's terminal under its question (terminal.js runSql and
// wireEditor), on the bakery database (bakery.js, shared with the exercises page), and a run whose result matches
// the solution's (sameResult) shows the exercises page's green Solved. Nothing is stored.
import { wireEditor, runSql, runHtml, runInfo, EMPTY_RUN } from "../terminal.js";
import { toSqlite } from "../strict.js";
import { openBakery, sameResult, checkOptions } from "./bakery.js";

const PLAY = '<svg class="icon play" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 2.5L13 8L4.5 13.5Z"/></svg>';

// The task's rows as the solution counts them: "Not yet" says how far a result is.
export const notYet = (rows, want) => rows !== want ? "Not yet: " + rows + " rows, the task expects " + want + "."
  : "Not yet: the right number of rows, but not the same values.";

export async function openTask(task, n) {
  const sql = task.querySelector("details.solution pre code").textContent, opts = checkOptions(task.dataset);
  const bench = document.createElement("div");
  bench.className = "task-bench";
  bench.innerHTML = '<div class="editor"><pre class="sql-hl" aria-hidden="true"></pre><textarea id="task-sql-' + n + '" class="task-sql" spellcheck="false" autocorrect="off" autocapitalize="off" aria-label="Your SQL query for this task"></textarea></div>'
    + '<div class="row"><button type="button">' + PLAY + '<span class="btn-text">Run</span></button><span class="ex-solved" hidden>&#x2713; Solved</span><span class="muted" aria-live="polite">Loading the SQL engine...</span></div>'
    + '<div class="results" aria-live="polite" hidden></div>';
  task.querySelector(".task-try").replaceWith(bench);
  const ta = bench.querySelector("textarea"), out = bench.querySelector(".results"), [runBtn, solved, info] = bench.querySelector(".row").children;
  let bake = null, sol = null;
  function run() {
    const q = ta.value.trim();
    if (!bake) return;
    out.hidden = false;
    if (!q) { out.innerHTML = EMPTY_RUN; info.textContent = ""; return; }
    const r = runSql(bake.db, q, bake.schema, bake.cols, "tables");
    out.innerHTML = runHtml(r, "");
    if (r.error) { info.textContent = runInfo(r); return; }
    const ok = sameResult(r.res, sol, opts);
    if (ok) solved.hidden = false;
    info.textContent = ok ? runInfo(r) : notYet(r.res ? r.res.values.length : 0, sol ? sol.values.length : 0);
  }
  wireEditor(ta, bench.querySelector(".sql-hl"), { run, cols: () => (bake ? bake.cols : {}), minHeight: 64 });
  runBtn.onclick = run;
  ta.focus();
  try {
    bake = await openBakery();
    const all = bake.db.exec(toSqlite(sql));
    sol = all[all.length - 1] || null;
    info.textContent = "Ready: write your query, then press Run.";
  } catch (e) {
    info.textContent = "The SQL engine did not load (" + e.message + "). The solution is still under the task.";
  }
}
