// site/terminal.js -- the SQL terminal of the game, its prologue and the handbook's exercises page: one run pipeline
// (runSql: comma-join guard, strict check, sql.js, SQLite's errors explained, the date note), one editor (wireEditor:
// colouring, Tab completion, Ctrl+Enter, Ctrl+F, Tab, Enter auto-indent), the results table and the database settings.
// Side-effect free at import; the DOM is touched only inside wireEditor.
import { strictCheck, toSqlite, ilike, ymd, STRICT_SECTIONS } from "./strict.js";
import { esc } from "./ui.js";

// SQL colouring for the terminal: a <pre> under a transparent textarea (index.html .editor).
export const SQL_KEYWORDS = new Set(("select from where and or not in is null like ilike glob between join inner left right full outer " +
  "cross natural on using as group by order having limit offset distinct all union intersect except with recursive case " +
  "when then else end asc desc over partition rows range exists cast collate escape values insert into update set delete " +
  "create table view drop filter window").split(" "));
export function highlightSql(src) {
  const e = s => s.replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const re = /(--[^\n]*|\/\*[\s\S]*?(?:\*\/|$))|('(?:[^']|'')*'?|"(?:[^"]|"")*"?)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][A-Za-z0-9_]*)|([\s\S])/g;
  let out = "", m;
  while ((m = re.exec(src))) {
    const [t, com, str, num, word] = m;
    const cls = com ? "com" : str ? "str" : num ? "num"
      : word ? (SQL_KEYWORDS.has(word.toLowerCase()) ? "kw" : /^\s*\(/.test(src.slice(re.lastIndex)) ? "fn" : "id") : "";
    out += cls ? '<span class="sql-' + cls + '">' + e(t) + "</span>" : e(t);
  }
  return out + "\n";   // a trailing newline in a <pre> is dropped; keep the last empty line as tall as the textarea's
}
// Ctrl+F in the query box: one clause per line, AND/OR indented, keywords upper-cased. Only whitespace and
// case change (strings, comments and identifiers are kept), so the query means exactly the same.
const SQL_FUNCS = new Set("count sum avg min max abs round length lower upper substr trim replace coalesce ifnull nullif date time strftime rank dense_rank row_number lag lead ntile first_value last_value printf cast".split(" "));
const JOIN_LEAD = new Set(["left", "right", "inner", "full", "cross", "natural", "outer"]);
export function formatSql(src) {
  const re = /(\s+)|(--[^\n]*)|(\/\*[\s\S]*?(?:\*\/|$))|('(?:[^']|'')*'?|"(?:[^"]|"")*"?)|([A-Za-z_][A-Za-z0-9_]*)|([\s\S])/g;
  const parens = [];                                 // true for a subquery "(", false for a call, list or OVER
  let out = "", m, space = false, prev = "", start = true, between = false;
  const depth = () => parens.filter(Boolean).length;
  const top = () => !parens.length || parens[parens.length - 1];
  const br = extra => { out = out.replace(/\s+$/, "") + "\n" + "  ".repeat(depth() + extra); space = false; };
  while ((m = re.exec(src))) {
    const [t, ws, line, block, str, word] = m;
    if (ws) { space = out !== ""; continue; }
    const w = word ? word.toLowerCase() : "";
    if (word && top() && !start) {
      if (["from", "where", "group", "having", "order", "limit", "union", "intersect", "except", "window"].includes(w)
          || (w === "select" && prev !== "(") || ((JOIN_LEAD.has(w) || w === "join") && !JOIN_LEAD.has(prev))) br(0);
      else if ((w === "and" || w === "or") && !between) br(1);
    }
    if (w === "and" && between) between = false;
    if (w === "between") between = true;
    const text = word && (SQL_KEYWORDS.has(w) || (SQL_FUNCS.has(w) && /^\s*\(/.test(src.slice(re.lastIndex)))) ? word.toUpperCase() : t;
    if (t === ")" && parens.pop()) br(0);           // a subquery closes on its own line, under its opening
    if (space && out && !/\s$/.test(out)) out += " ";
    out += text; space = false;
    if (t === "(") { parens.push(/^\s*(select|with)\b/i.test(src.slice(re.lastIndex))); if (top() && parens.length) br(0); }
    if (line) br(0);
    if (t === ";") { out += "\n"; start = true; prev = ""; parens.length = 0; continue; }
    if (!str && !line && !block) prev = w || t;
    start = false;
  }
  return out.replace(/[ \t]+$/gm, "").trim();
}

// Strings, quoted names and comments blanked with spaces (newlines kept), so a regex over the result reads only the
// query's own words, at their own positions. A string or block comment left open stays as typed.
export const blankLiterals = s => s.replace(/'(?:[^']|'')*'|"(?:[^"]|"")*"|--[^\n]*|\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, " "));
const reEscape = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// The tables a query names after FROM or JOIN (CTE names too: the badges check them against sqlite_master).
export const tablesIn = sql => [...sql.matchAll(/\b(?:from|join)\s+([a-z_]+)/gi)].map(m => m[1].toLowerCase());
// { table: [[column, type, pk], ...] } (strictCheck's schema) -> { table: [column, ...] } for the tables named
// (sqliteHelp's and the completion's), never a table missing from the schema.
export const columns = (schema, names = Object.keys(schema)) =>
  Object.fromEntries(names.filter(t => schema[t]).map(t => [t, schema[t].map(c => c[0])]));

// --- Tab completion (owner, 2026-10-25) -------------------------------------------------------------------------
// suggestSql(text, caret, tables) -> { start, items: [{ text, kind, insert }] } or null. `tables` maps each table the
// player may see (the revealed schema in the game, the bakery on exercises.html) to its column names, so nothing
// unrevealed is ever offered; never a value (nothing inside a string or comment). Functions are only ones the strict
// terminal accepts and SQLite runs (a test checks against SQLITE_FUNCS and strictCheck).
export const SUGGEST_KEYWORDS = ["SELECT", "FROM", "WHERE", "GROUP BY", "HAVING", "ORDER BY", "LIMIT", "OFFSET", "JOIN", "LEFT JOIN",
  "INNER JOIN", "ON", "USING", "AS", "AND", "OR", "NOT", "IN", "IS NULL", "IS NOT NULL", "NULL", "LIKE", "ILIKE", "BETWEEN", "CASE", "WHEN",
  "THEN", "ELSE", "END", "WITH", "DISTINCT", "UNION", "UNION ALL", "INTERSECT", "EXCEPT", "EXISTS", "OVER", "PARTITION BY", "ASC", "DESC", "CAST"];
export const SUGGEST_FUNCS = ["count", "sum", "avg", "min", "max", "abs", "round", "length", "lower", "upper", "substr", "trim", "replace",
  "coalesce", "nullif", "string_agg", "rank", "dense_rank", "row_number", "lag", "lead", "ntile", "first_value", "last_value"];
export const SUGGEST_MAX = 6;
export function suggestSql(text, caret, tables) {
  if (/\w/.test(text[caret] || "")) return null;                       // mid-word: leave it alone
  const head = text.slice(0, caret), before = blankLiterals(head);
  // inside a string, a quoted name or a comment: values are never suggested (a line comment reaching the caret
  // swallows the sentinel; an open string or block comment stays visible)
  if (/['"]|\/\*/.test(before) || !blankLiterals(head + "\0").endsWith("\0")) return null;
  const m = before.match(/(?:([A-Za-z_]\w*)\.)?([A-Za-z_]\w*)?$/);
  const qual = m[1], word = m[2] || "";
  if (!qual && !word) return null;
  const pre = word.toLowerCase(), start = caret - word.length;
  const fits = s => s.toLowerCase().startsWith(pre) && s.toLowerCase() !== pre;
  const names = Object.keys(tables), all = blankLiterals(text);
  const col = t => c => ({ text: c, kind: "column", insert: c, t });
  let items;
  if (qual) {                                                          // alias.col or table.col
    const q = qual.toLowerCase();
    let t = names.find(n => n.toLowerCase() === q);
    for (const a of all.matchAll(/\b([A-Za-z_]\w*)\s+(?:as\s+)?(?=([A-Za-z_]\w*))/gi))
      if (!t && a[2].toLowerCase() === q) t = names.find(n => n.toLowerCase() === a[1].toLowerCase());
    items = t ? tables[t].filter(c => !pre || fits(c)).map(col(t)) : [];
  } else {
    const prev = (before.slice(0, start).match(/([A-Za-z_]\w*)\s*$/) || [])[1];
    const tbl = names.filter(fits).map(t => ({ text: t, kind: "table", insert: t }));
    if (prev && /^(from|join)$/i.test(prev)) items = tbl;
    else {
      const used = new Set((all.match(/[A-Za-z_]\w*/g) || []).map(w => w.toLowerCase()));
      const cols = names.filter(t => used.has(t.toLowerCase())).flatMap(t => tables[t].filter(fits).map(col(t)));
      const lower = word === pre;                                       // keep the player's keyword case
      const kws = SUGGEST_KEYWORDS.filter(fits).map(k => ({ text: lower ? k.toLowerCase() : k, kind: "keyword", insert: lower ? k.toLowerCase() : k }));
      const fns = SUGGEST_FUNCS.filter(fits).map(f => { const n = lower ? f : f.toUpperCase(); return { text: n + "()", kind: "function", insert: n + "(" }; });
      items = [...cols, ...kws, ...fns, ...tbl];
    }
  }
  const seen = new Set();
  items = items.filter(i => !seen.has(i.text) && seen.add(i.text)).slice(0, SUGGEST_MAX);
  return items.length ? { start, items } : null;
}
// The list under the caret, tied to the textarea as an aria listbox; tables() gives the visible schema. key(e) takes
// Tab, Up, Down and Escape while the list shows and returns true (Tab indents otherwise, Enter stays a newline);
// refresh() follows each edit, once the highlight holds the new text.
function suggester(ta, hl, tables, sync) {
  const ul = document.createElement("ul");
  ul.id = ta.id + "-suggest"; ul.className = "sql-suggest"; ul.setAttribute("role", "listbox"); ul.setAttribute("aria-label", "Suggestions"); ul.hidden = true;
  (ta.closest("dialog") || document.body).appendChild(ul);   // inside a modal dialog, or the top layer would hide it
  ta.setAttribute("aria-autocomplete", "list"); ta.setAttribute("aria-controls", ul.id);
  let cur = null, sel = 0;
  const hide = () => { cur = null; ul.hidden = true; ta.removeAttribute("aria-activedescendant"); };
  const mark = () => {
    [...ul.children].forEach((li, i) => li.setAttribute("aria-selected", String(i === sel)));
    ta.setAttribute("aria-activedescendant", ul.id + "-" + sel);
  };
  const accept = i => {
    const it = cur.items[i], s = cur.start, e = ta.selectionStart;
    ta.value = ta.value.slice(0, s) + it.insert + ta.value.slice(e);
    ta.selectionStart = ta.selectionEnd = s + it.insert.length;
    hide(); sync(); ta.focus();
  };
  const refresh = () => {
    cur = ta.selectionStart === ta.selectionEnd ? suggestSql(ta.value, ta.selectionStart, tables()) : null;
    if (!cur) return hide();
    sel = 0;
    ul.innerHTML = cur.items.map((it, i) => '<li role="option" id="' + ul.id + "-" + i + '">' + esc(it.text) + ' <span class="k">' + it.kind + "</span></li>").join("");
    [...ul.children].forEach((li, i) => li.addEventListener("pointerdown", ev => { ev.preventDefault(); accept(i); }));   // taps work on phones too
    // The caret's place: the highlight <pre> holds the same text in the same layout, so a Range on it measures the caret.
    const walk = document.createTreeWalker(hl, NodeFilter.SHOW_TEXT);
    let left = ta.selectionStart, node, r = null;
    while ((node = walk.nextNode())) { if (left <= node.length) { const g = document.createRange(); g.setStart(node, left); g.collapse(true); r = g.getClientRects()[0] || g.getBoundingClientRect(); break; } left -= node.length; }
    const box = ta.getBoundingClientRect();
    ul.hidden = false;
    ul.style.left = Math.max(4, Math.min((r ? r.left : box.left), innerWidth - ul.offsetWidth - 4)) + "px";
    ul.style.top = (r ? r.bottom : box.top) + 2 + "px";
    mark();
  };
  ta.addEventListener("blur", hide);
  window.addEventListener("scroll", hide, true);
  const key = e => {
    if (!cur) return false;
    if (e.key === "Tab" && !e.shiftKey) accept(sel);
    else if (e.key === "ArrowDown" || e.key === "ArrowUp") { sel = (sel + (e.key === "ArrowDown" ? 1 : cur.items.length - 1)) % cur.items.length; mark(); }
    else if (e.key === "Escape") hide();
    else { hide(); return false; }
    e.preventDefault(); e.stopPropagation();   // the list's Escape is not the page's (an enlarged schema stays open)
    return true;
  };
  return { key, refresh };
}
// The query box: a transparent textarea `ta` over the <pre> `hl` that colours it, growing instead of scrolling
// (never under minHeight px). run() on Ctrl+Enter; Ctrl+F formats (Cmd+F stays the browser's find); Tab completes
// while the list shows, else indents (Shift+Tab leaves the box); Enter keeps the line's indent. cols() gives the
// tables to complete. Returns sync(), to call after setting ta.value from code.
export function wireEditor(ta, hl, { run, cols, minHeight = 0 }) {
  const sync = () => {
    hl.innerHTML = highlightSql(ta.value);
    ta.style.height = "auto"; ta.style.height = Math.max(minHeight, ta.scrollHeight + 2) + "px";
  };
  const put = (text, s, en, caret) => { ta.value = ta.value.slice(0, s) + text + ta.value.slice(en); ta.selectionStart = ta.selectionEnd = caret; sync(); };
  const list = suggester(ta, hl, cols, sync);
  ta.addEventListener("input", () => { sync(); list.refresh(); });
  ta.addEventListener("keydown", e => {
    if (list.key(e)) return;
    const s = ta.selectionStart, en = ta.selectionEnd;
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); run(); }
    else if (e.ctrlKey && !e.metaKey && e.key.toLowerCase() === "f") { e.preventDefault(); ta.value = formatSql(ta.value); ta.selectionStart = ta.selectionEnd = ta.value.length; sync(); }
    else if (e.key === "Tab" && !e.shiftKey) { e.preventDefault(); put("\t", s, en, s + 1); }
    else if (e.key === "Enter") {
      e.preventDefault();
      const indent = ta.value.slice(ta.value.lastIndexOf("\n", s - 1) + 1, s).match(/^[ \t]*/)[0];
      put("\n" + indent, s, en, s + 1 + indent.length);
    }
  });
  sync();
  return sync;
}

export const ROW_CAP = 200;
export function renderResults(res) {
  if (!res) return '<p class="muted">No rows.</p>';
  const head = "<tr>" + res.columns.map(c => "<th>" + esc(c) + "</th>").join("") + "</tr>";
  const body = res.values.slice(0, ROW_CAP).map(r => "<tr>" + r.map(v => "<td>" + esc(v) + "</td>").join("") + "</tr>").join("");
  const more = res.values.length > ROW_CAP ? '<p class="muted">' + (res.values.length - ROW_CAP) + " more rows not shown.</p>" : "";
  return "<table>" + head + body + "</table>" + more;
}
export const EMPTY_RUN = '<p class="muted">Type a query in the box, then press Run.</p>';

// FROM a, b with no ON/WHERE/USING anywhere: the one query that can hang the page (sql.js runs on the main thread).
// ponytail: a text guard, not a timeout; move sql.js to a Worker with terminate() if students still find a way.
export function cartesian(sql) {
  const body = blankLiterals(sql);
  return /\bfrom\s+[a-z_][a-z0-9_]*(?:\s+(?:as\s+)?[a-z_][a-z0-9_]*)?\s*,\s*[a-z_]/i.test(body) && !/\b(?:where|on|using)\b/i.test(body);
}

// sql.js from cdnjs (index.html and exercises.html load its script), and the terminal's settings on a database.
export const openSqlJs = () => initSqlJs({ locateFile: f => "https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.13.0/" + f });
export function terminalDb(db) {
  db.run("PRAGMA query_only = 1");   // DROP/UPDATE/DELETE fail with "attempt to write a readonly database" instead of silently breaking the chapter
  db.run("PRAGMA case_sensitive_like = ON");   // LIKE as in PostgreSQL; ILIKE runs as REGEXP (toSqlite), bound to ilike()
  // One registration for both arities (x REGEXP p, and with ESCAPE): sql.js takes nArg from the function's length, -1 = any.
  db.create_function("regexp", Object.defineProperty((p, v, e) => ilike(p, v, e), "length", { value: -1 }));
  return db;
}
// Every table's columns as strictCheck reads them: { table: [[name, declared type, pk], ...] } (PRAGMA table_info).
export function readSchema(db) {
  const names = db.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")[0].values.map(r => r[0]);
  return Object.fromEntries(names.map(t => [t, db.exec("PRAGMA table_info(" + t + ")")[0].values.map(r => [r[1], r[2], r[5]])]));
}

export function strictHtml(r, base = "learn/") {   // base: the handbook folder as the caller links it (learn/exercises.js: "")
  const [page, label] = STRICT_SECTIONS[r.anchor];
  return '<div class="error strict"><div class="pg-error">ERROR: ' + esc(r.error) + '</div><p class="why">' + esc(r.why) + '</p><a href="' + base + page + ".html#" + r.anchor +
    '" target="_blank" rel="noopener">Grammar: ' + esc(label) + "</a></div>";
}

// SQLite's own errors, explained in one plain line built from the player's words and the tables on screen (the game
// passes only the revealed ones, so a line never names a hidden table). Wording only: what runs is unchanged.
// { type, why }: type is query_fail's fixed category (GA), never the query or a name the player typed; why may be "".
const CURLY = /[\u2018\u2019\u201C\u201D]/;
const HELP_STOP = new Set(["and", "or", "not", "order", "group", "by", "limit", "where", "from", "join", "on", "is", "null", "as", "select", "having", "in", "like", "ilike", "between", "union"]);
export function sqliteHelp(message, sql, tables) {
  const bare = blankLiterals(sql);
  const names = Object.keys(tables), list = a => a.join(", ");
  const quote = (col, op, value) => "If " + value + " is a value, put it in single quotes, as in " + col + " " + op + " '" + value.replace(/'/g, "''") + "'.";
  const valueAfter = w => {   // col = Hotel Ritz: the words after a comparison, up to w, none of them a keyword
    const m = bare.match(new RegExp("([A-Za-z_][\\w.]*)\\s*(=|<>|!=|<=|>=|<|>|\\blike\\b|\\bilike\\b)\\s*((?:[A-Za-z_]\\w*\\s+)*?)" + reEscape(w) + "(?![\\w])", "i"));
    return m && !m[3].split(/\s+/).some(x => HELP_STOP.has(x.toLowerCase())) ? quote(m[1], m[2], (m[3] + w).trim()) : "";
  };
  if (CURLY.test(bare)) return { type: "curly_quote", why: "Your keyboard typed curly quotes (\u2018 \u2019 or \u201C \u201D). SQL reads only the straight quote ': " +
    "retype it with the plain ' key, or turn off smart punctuation." };
  let m;
  if (/unrecognized token: "'/.test(message)) return { type: "unterminated", why: "A text value opens with ' and never closes: end it with a second ', as in 'Paris'." };
  if (/incomplete input/.test(message)) return { type: "incomplete", why: "The query ends before it is finished: look for a missing closing bracket or quote, or an unfinished clause." };
  if ((m = message.match(/no such table: (?:main\.)?(\S+)/))) {
    const x = m[1].toLowerCase(), next = (bare.match(new RegExp("\\b" + x + "\\s+([A-Za-z_]\\w*)", "i")) || [])[1];
    const near = names.find(t => next && t === x + "_" + next.toLowerCase()) || names.find(t => t === x.replace(/e?s$/, "") || t + "s" === x || t.replace(/_/g, "") === x.replace(/_/g, ""));
    return { type: "no_table", why: near ? "The table is called " + near + (near.includes("_") && next ? ", written with an underscore and no space." : ".") :
      "There is no table called " + m[1] + ". The tables on the schema are: " + list(names) + "." };
  }
  if ((m = message.match(/no such column: "?([^"\s]+)"?/))) {
    const x = m[1], q = valueAfter(x.split(".").pop());
    const from = tablesIn(sql).filter(t => tables[t]);
    const cols = from.map(t => (from.length > 1 ? t + ": " : "") + list(tables[t])).join("; ");
    return { type: "no_column", why: (from.length ? x + " is not a column of " + list(from) + (q ? "." : ", whose columns are " + cols + ".") : x + " is not a column of any table in the query.") + (q ? " " + q : "") };
  }
  if ((m = message.match(/near "([^"]*)": syntax error/))) {
    const w = m[1], va = /^\w+$/.test(w) ? valueAfter(w) : "";
    const why = va ? va.replace(/^If /, "SQL stopped at " + w + ". If ") :
      new RegExp(",\\s*" + reEscape(w) + "\\b", "i").test(bare) && /^[a-z]+$/i.test(w) ? "There is a comma just before " + w + ": remove it, or add what was meant to follow it." :
      "SQL stopped reading at " + (w ? w : "the end") + ". The mistake is there or just before it: often a missing comma or quote, a misspelt keyword, or clauses in the wrong order.";
    return { type: "syntax", why };
  }
  return { type: "other", why: "" };
}
export function errorHtml(error, help) {
  return help && help.why ? '<div class="error strict"><div class="pg-error">' + esc(error) + '</div><p class="why">' + esc(help.why) + "</p></div>" : '<div class="error">' + esc(error) + "</div>";
}
// No rows, and the WHERE compares a column with 1912-05-18 unquoted: SQL read a subtraction (owner, 2026-10-25).
export function dateArithmeticNote(sql, schema) {
  const m = blankLiterals(sql).match(/([A-Za-z_][\w.]*)\s*(?:=|<>|!=|<=|>=|<|>)\s*(\d{4})\s*-\s*(\d{1,2})\s*-\s*(\d{1,2})(?![\d.])/);
  if (!m) return "";
  const col = m[1].split(".").pop().toLowerCase(), [y, mo, d] = [m[2], m[3], m[4]];
  const int = Object.values(schema).some(cs => cs.some(([n, t]) => n.toLowerCase() === col && /INT/i.test(t)));
  const n = int && ymd(y + "-" + mo + "-" + d);   // the YYYYMMDD number the column holds ("" for no real date)
  return y + "-" + mo + "-" + d + " without quotes is arithmetic: " + y + " minus " + +mo + " minus " + +d + ", which is " + (y - mo - d) + "." +
    (n ? " " + m[1] + " holds dates as numbers written YYYYMMDD, as in " + m[1] + " = " + n + "." : "");
}

// One run, the same on every terminal. Returns { res, note } when it ran (res null for no rows; note the date hint
// when no rows came back), or { error, strict?, help? } when it did not; `outcome` is what GA's exercise_run and
// query_fail read: { kind: ok | refused | error, rule, type }. cols: the tables sqliteHelp may name (columns()).
// join: what the comma-join refusal calls the tables ("ledgers" in the game).
export function runSql(db, sql, schema, cols, join = "ledgers") {
  if (cartesian(sql)) return { res: null, error: "Two " + join + " side by side with nothing to match them: say what joins them (ON or WHERE).",
    outcome: { kind: "refused", rule: "cartesian", type: "refused" } };
  const strict = strictCheck(sql, schema);
  if (strict) return { res: null, error: "ERROR: " + strict.error, strict, outcome: { kind: "refused", rule: strict.anchor, type: "refused" } };
  try {
    const all = db.exec(toSqlite(sql)), res = all[all.length - 1] || null;
    return { res, error: null, note: res ? "" : dateArithmeticNote(sql, schema), outcome: { kind: "ok" } };
  } catch (e) {
    const help = sqliteHelp(e.message, sql, cols);
    return { res: null, error: e.message, help, outcome: { kind: "error", rule: "", type: help.type } };
  }
}
// What a run shows under the terminal. base: the handbook folder as the page links it (strictHtml).
export const runHtml = (r, base) => r.strict ? strictHtml(r.strict, base) : r.error ? errorHtml(r.error, r.help)
  : renderResults(r.res) + (r.note ? '<p class="muted">' + esc(r.note) + "</p>" : "");
// The run line beside Run: "error", or the row count.
export const runInfo = r => r.error ? "error" : (r.res ? r.res.values.length : 0) + " rows";

// History: most recent first, 20 at most, no repeat of the last one.
export function pushHistory(state, sql) {
  if (state.history[0] !== sql) state.history.unshift(sql);
  state.history = state.history.slice(0, 20);
}
