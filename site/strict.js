// site/strict.js -- the strict terminal's checker (strictCheck) and the rewrites SQLite needs (toSqlite). No DOM and
// no import, side-effect free: terminal.js runs it on every query; generate_db.sqlite_sql mirrors toSqlite.
// --- Strict terminal: PostgreSQL is the yardstick (learn/grammar.html, the hub of the rules) --------------------------------------
// strictCheck parses a query with the schema in hand and refuses what PostgreSQL would reject but SQLite runs
// anyway: ungrouped columns, aliases in WHERE, "text" in double quotes, ==, mixed types, a WHERE that is not a
// condition, SQLite-only syntax. A refusal is { error, why, anchor }; null means run it. Anything the parser does
// not know is let through (SQLite still reports its own errors): a false refusal is the worst bug here.
// Each refusal's anchor -> [the learn page whose section explains it, the link's label]; grammar.html lists them all.
export const STRICT_SECTIONS = { "group-by": ["group-by-having", "GROUP BY"], "having": ["group-by-having", "HAVING without GROUP BY"],
  "order-by-grouped": ["group-by-having", "ORDER BY after GROUP BY"], "group-concat": ["group-by-having", "string_agg and SUM"],
  "distinct-order": ["order-by-limit", "DISTINCT and ORDER BY"], "limit-offset": ["order-by-limit", "LIMIT and OFFSET"],
  "double-quotes": ["select-where", "Double quotes"], "double-equals": ["select-where", "One equals sign"], "types": ["select-where", "Types"],
  "aliases": ["select-where", "Aliases in WHERE and HAVING"], "boolean": ["select-where", "Conditions"],
  "like-ilike": ["like", "LIKE and ILIKE"], "coalesce": ["nulls", "COALESCE and IS"], "date-functions": ["dates-times", "Dates, substr and CAST"],
  "iif": ["case-when", "CASE, not IIF"], "sqlite-only": ["grammar", "Other shorthands"] };
const RESERVED = new Set(("select from where group by having order limit offset union intersect except join inner left right full outer " +
  "cross natural on using as and or not in is null like ilike glob regexp match between case when then else end with recursive " +
  "distinct all exists cast over partition window asc desc values collate escape true false filter isnull notnull").split(" "));
// array_agg, bool_and, bool_or, every: not in SQLite, kept so a GROUP BY around one is not refused for its argument (SQLite then names the function).
const AGGS = new Set("count sum avg min max total group_concat string_agg array_agg bool_and bool_or every".split(" "));
// Each suggestion must also run here (sql.js), not only in PostgreSQL: a test checks every function it names exists in SQLite.
const DATE_TEXT = "a comparison of the date text, as in d >= '1912-01-01', or substr(d, 1, 7) for its year and month";
export const SQLITE_FUNCS = { ifnull: "COALESCE(a, b)", iif: "CASE WHEN ... THEN ... ELSE ... END", group_concat: "string_agg(x, ', ')",
  instr: "text LIKE '%part%'", strftime: DATE_TEXT, julianday: DATE_TEXT, datetime: DATE_TEXT, unixepoch: DATE_TEXT,
  printf: "format()", total: "SUM(x)", randomblob: "random()", zeroblob: "nothing like it", last_insert_rowid: "RETURNING",
  changes: "nothing like it", total_changes: "nothing like it", likely: "the condition alone",
  unlikely: "the condition alone", likelihood: "the condition alone" };
// the section of the handbook that explains each one (STRICT_SECTIONS); the rest are on grammar.html
const FUNC_ANCHOR = { ifnull: "coalesce", group_concat: "group-concat", total: "group-concat", iif: "iif", instr: "like-ilike",
  strftime: "date-functions", julianday: "date-functions", datetime: "date-functions", unixepoch: "date-functions" };
const PG_TYPE = { int: "integer", num: "numeric", text: "text", bool: "boolean", str: "text" };
const pgT = t => PG_TYPE[t] || "unknown";
const isNum = t => t === "int" || t === "num";
function declType(t) {
  t = String(t || "").toLowerCase();
  return /int/.test(t) ? "int" : /char|text|clob|string/.test(t) ? "text" : /real|floa|doub|num|dec/.test(t) ? "num" : /bool/.test(t) ? "bool" : null;
}
class Refusal { constructor(error, why, anchor) { this.out = { error, why, anchor }; } }
const UNSUPPORTED = { unsupported: true };   // thrown when the parser meets syntax it does not know: no refusal
const refuse = (error, why, anchor) => { throw new Refusal(error, why, anchor); };

function sqlTokens(src) {
  const re = /(\s+|--[^\n]*|\/\*[\s\S]*?(?:\*\/|$))|('(?:[^']|'')*')|("(?:[^"]|"")*")|(`[^`]*`|\[[^\]]*\])|((?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)|([A-Za-z_][A-Za-z0-9_$]*)|(<=|>=|<>|!=|==|\|\||::|[-+*/%(),.;=<>|&~?:@^!])|([\s\S])/g;
  const out = []; let m;
  while ((m = re.exec(src))) {
    const [v, ws, str, qid, bq, num, word, op] = m;
    if (ws) continue;
    out.push({ t: str ? "str" : qid ? "qid" : bq ? "bq" : num ? "num" : word ? "word" : op ? "op" : "bad", v, lv: word ? v.toLowerCase() : v, pos: m.index, end: re.lastIndex });
  }
  return out;
}

function parseSql(src, toks) {
  let i = 0;
  const EOF = { t: "eof", v: "", lv: "", pos: src.length, end: src.length };
  const peek = (k = 0) => toks[i + k] || EOF;
  const is = (w, k = 0) => { const x = peek(k); return (x.t === "word" || x.t === "op") && x.lv === w; };
  const eat = w => { if (is(w)) { i++; return true; } return false; };
  const need = w => { if (!eat(w)) throw UNSUPPORTED; };
  const next = () => { if (i >= toks.length) throw UNSUPPORTED; return toks[i++]; };
  const mk = (s, n) => { n.from = toks[s].pos; n.to = toks[i - 1].end; return n; };
  const nameAhead = (k = 0) => peek(k).t === "qid" || (peek(k).t === "word" && !RESERVED.has(peek(k).lv));
  function ident(anyWord) {
    const x = peek();
    if (x.t === "bq") refuse('syntax error at or near "' + x.v[0] + '"', "SQL quotes a name with double quotes, not backticks or square brackets: write " +
      '"' + x.v.slice(1, -1) + '", or the bare name.', "double-quotes");
    if (x.t === "qid") { i++; return { name: x.v.slice(1, -1).replace(/""/g, '"'), q: true, raw: x.v }; }
    if (x.t === "word" && (anyWord || !RESERVED.has(x.lv))) { i++; return { name: x.lv, q: false, raw: x.v }; }
    throw UNSUPPORTED;
  }
  function statements() {
    const out = [];
    while (peek().t !== "eof") {
      if (eat(";")) continue;
      if (!is("select") && !is("with") && !is("values") && !is("(")) throw UNSUPPORTED;
      out.push(query());
      if (peek().t !== "eof" && !eat(";")) throw UNSUPPORTED;
    }
    return out;
  }
  function query() {
    const q = { k: "query", ctes: [], recursive: false, order: [] };
    if (eat("with")) {
      q.recursive = eat("recursive");
      do {
        const name = ident(); let cols = null;
        if (eat("(")) { cols = []; do cols.push(ident()); while (eat(",")); need(")"); }
        need("as"); eat("not"); eat("materialized"); need("(");
        const body = query(); need(")");
        q.ctes.push({ name, cols, body });
      } while (eat(","));
    }
    q.body = compound();
    if (is("order") && is("by", 1)) { i += 2; q.order = orderList(); }
    if (eat("limit")) {
      const a = expr();
      if (eat(",")) {
        const b = expr();
        refuse("LIMIT #,# syntax is not supported", "LIMIT " + a.text + ", " + b.text + " is not standard SQL: write LIMIT " + b.text +
          " OFFSET " + a.text + " (the row count first, then how many rows to skip).", "limit-offset");
      }
      q.limit = a;
      if (eat("offset")) q.offset = expr();
    } else if (eat("offset")) q.offset = expr();
    return q;
  }
  function compound() {
    const parts = [core()], ops = [];
    while (is("union") || is("intersect") || is("except")) { ops.push(next().v.toUpperCase()); eat("all") || eat("distinct"); parts.push(core()); }
    return { k: "compound", parts, ops };
  }
  function core() {
    if (eat("(")) { const q = query(); need(")"); return { k: "paren", q }; }
    if (eat("values")) {
      const rows = [];
      do { need("("); const r = []; do r.push(expr()); while (eat(",")); need(")"); rows.push(r); } while (eat(","));
      return { k: "values", rows };
    }
    need("select");
    const c = { k: "select", distinct: false, cols: [], from: null, where: null, group: [], having: null };
    if (eat("distinct")) { c.distinct = true; if (is("on")) throw UNSUPPORTED; } else eat("all");
    do c.cols.push(resultCol()); while (eat(","));
    if (eat("from")) c.from = fromList();
    if (eat("where")) c.where = expr();
    if (is("group") && is("by", 1)) { i += 2; do c.group.push(expr()); while (eat(",")); }
    if (eat("having")) c.having = expr();
    if (eat("window")) { c.windows = []; do { ident(); need("as"); need("("); c.windows.push(windowSpec()); } while (eat(",")); }
    return c;
  }
  function stringAlias() {
    const x = peek();
    if (x.t === "str") refuse('syntax error at or near "' + x.v + '"', "A column alias is a name, not a text value: write AS " + x.v.slice(1, -1).replace(/\W+/g, "_") +
      ", or AS \"" + x.v.slice(1, -1) + "\" in double quotes to keep spaces or capitals.", "double-quotes");
  }
  function resultCol() {
    if (eat("*")) return { star: true };
    if (nameAhead() && is(".", 1) && is("*", 2)) { const t = ident(); i += 2; return { star: t }; }
    const e = expr();
    let alias = null;
    if (eat("as")) { stringAlias(); alias = ident(); } else { stringAlias(); if (nameAhead()) alias = ident(); }
    return { e, alias };
  }
  function optAlias() {
    let alias = null, cols = null;
    if (eat("as")) alias = ident(); else if (nameAhead()) alias = ident();
    if (alias && eat("(")) { cols = []; do cols.push(ident()); while (eat(",")); need(")"); }
    return { alias, cols };
  }
  function fromItem() {
    if (eat("(")) {
      if (is("select") || is("with") || is("values")) { const q = query(); need(")"); return { k: "sub", q, ...optAlias() }; }
      const f = fromList(); need(")"); return f;
    }
    let name = ident();
    if (eat(".")) name = ident();
    if (is("(")) throw UNSUPPORTED;   // a table-valued function
    return { k: "table", name, ...optAlias() };
  }
  function fromList() {
    let left = fromItem();
    for (;;) {
      if (eat(",")) { left = { k: "join", l: left, r: fromItem() }; continue; }
      const natural = eat("natural");
      if (eat("left") || eat("right") || eat("full")) eat("outer");
      else if (!eat("inner") && !eat("cross") && !natural && !is("join")) break;
      need("join");
      const j = { k: "join", l: left, r: fromItem() };
      if (eat("on")) j.on = expr();
      else if (eat("using")) { need("("); do ident(); while (eat(",")); need(")"); }
      left = j;
    }
    return left;
  }
  function windowSpec() {   // after its "("
    const w = { partition: [], order: [] };
    if (nameAhead() && !["rows", "range", "groups"].includes(peek().lv)) ident();
    if (is("partition") && is("by", 1)) { i += 2; do w.partition.push(expr()); while (eat(",")); }
    if (is("order") && is("by", 1)) { i += 2; w.order = orderList(); }
    for (let d = 0; !(d === 0 && is(")"));) { const x = next(); if (x.v === "(") d++; if (x.v === ")") d--; }   // a frame clause: skipped
    need(")");
    return w;
  }
  function orderList() {
    const out = [];
    do {
      const e = expr(); eat("asc") || eat("desc");
      if (eat("nulls") && !eat("first") && !eat("last")) throw UNSUPPORTED;
      out.push({ e });
    } while (eat(","));
    return out;
  }
  function expr() { const s = i; const n = orExpr(); n.text = src.slice(toks[s].pos, toks[i - 1].end); return n; }
  function orExpr() { const s = i; let l = andExpr(); while (eat("or")) l = mk(s, { k: "logic", op: "OR", l, r: andExpr() }); return l; }
  function andExpr() { const s = i; let l = notExpr(); while (eat("and")) l = mk(s, { k: "logic", op: "AND", l, r: notExpr() }); return l; }
  function notExpr() { const s = i; if (eat("not")) return mk(s, { k: "not", e: notExpr() }); return cmpExpr(); }
  function cmpExpr() {
    const s = i;
    let l = otherExpr();
    for (;;) {
      const x = peek();
      if (x.t === "op" && ["=", "==", "<>", "!=", "<", "<=", ">", ">="].includes(x.v)) { i++; l = mk(s, { k: "cmp", op: x.v, l, r: otherExpr() }); continue; }
      if (eat("is")) {
        eat("not");
        if (eat("null") || eat("true") || eat("false") || eat("unknown")) { l = mk(s, { k: "is", l }); continue; }
        if (eat("distinct")) { need("from"); l = mk(s, { k: "cmp", op: "IS DISTINCT FROM", l, r: otherExpr() }); continue; }
        const v = peek().v;
        refuse('syntax error at or near "' + v + '"', "IS only goes with NULL, TRUE or FALSE: write = " + v + " to compare with " + v +
          ", or IS NOT DISTINCT FROM " + v + " if NULLs must match too.", "coalesce");
      }
      if (eat("isnull") || eat("notnull")) { l = mk(s, { k: "is", l }); continue; }
      const save = i; eat("not");
      if (eat("in")) {
        need("(");
        if (is("select") || is("with")) { const q = query(); need(")"); l = mk(s, { k: "insub", l, q }); continue; }
        const list = []; if (!is(")")) do list.push(expr()); while (eat(","));
        need(")"); l = mk(s, { k: "inlist", l, list }); continue;
      }
      if (["like", "ilike", "glob", "regexp", "match"].includes(peek().lv) && peek().t === "word") {
        const op = next().v;
        if (!/^i?like$/i.test(op)) refuse('syntax error at or near "' + op + '"', op.toUpperCase() + " is not standard SQL: match patterns with LIKE " +
          "(case-sensitive, % for any run of characters, _ for one) or ILIKE (the same, ignoring case).", "like-ilike");
        const r = otherExpr(); let esc = null;
        if (eat("escape")) esc = otherExpr();
        l = mk(s, { k: "like", op: op.toUpperCase(), l, r, esc }); continue;
      }
      if (eat("between")) { const lo = otherExpr(); need("and"); const hi = otherExpr(); l = mk(s, { k: "between", l, lo, hi }); continue; }
      i = save; break;
    }
    return l;
  }
  function otherExpr() { const s = i; let l = addExpr(); while (eat("||")) l = mk(s, { k: "concat", l, r: addExpr() }); return l; }
  function addExpr() { const s = i; let l = mulExpr(); while (is("+") || is("-")) { const op = next().v; l = mk(s, { k: "arith", op, l, r: mulExpr() }); } return l; }
  function mulExpr() { const s = i; let l = unary(); while (is("*") || is("/") || is("%")) { const op = next().v; l = mk(s, { k: "arith", op, l, r: unary() }); } return l; }
  function unary() { const s = i; if (eat("-") || eat("+")) return mk(s, { k: "neg", e: unary() }); return postfix(); }
  function postfix() {
    const s = i;
    let e = primary();
    while (eat("collate")) {
      const c = ident(true);
      if (!c.q && ["nocase", "rtrim", "binary"].includes(c.name)) refuse('collation "' + c.name + '" for encoding "UTF8" does not exist',
        "COLLATE " + c.raw + " is not standard SQL: to ignore case, compare lower(" + src.slice(e.from, e.to) + ") with a lower-case value, or use ILIKE.", "like-ilike");
      e = mk(s, { k: "collate", e });
    }
    while (eat("::")) { const type = castType(toks, i, t => { i = t; }); if (!type) throw UNSUPPORTED; e = mk(s, { k: "cast", e, type }); }
    return e;
  }
  function typeName() { const parts = []; while (peek().t === "word") parts.push(next().lv); if (eat("(")) while (!eat(")")) next(); return parts.join(" "); }
  function primary() {
    const s = i, x = peek();
    if (x.t === "num") { i++; return mk(s, { k: "lit", type: /[.eE]/.test(x.v) ? "num" : "int", v: x.v }); }
    if (x.t === "str") { i++; return mk(s, { k: "lit", type: "str", v: x.v }); }
    if (x.t === "op" && x.v === "(") {
      i++;
      if (is("select") || is("with") || is("values")) { const q = query(); need(")"); return mk(s, { k: "sub", q }); }
      const list = [expr()]; while (eat(",")) list.push(expr());
      need(")");
      return mk(s, list.length === 1 ? { k: "paren", e: list[0] } : { k: "row", list });
    }
    if (x.t === "bq" || x.t === "qid") return colRef();
    if (x.t !== "word") throw UNSUPPORTED;
    if (x.lv === "null") { i++; return mk(s, { k: "lit", type: "null" }); }
    if (x.lv === "true" || x.lv === "false") { i++; return mk(s, { k: "lit", type: "bool", v: x.lv }); }
    if (x.lv === "case") { i++; return caseExpr(s); }
    if (x.lv === "cast") { i++; need("("); const e = expr(); need("as"); const type = typeName(); need(")"); return mk(s, { k: "cast", e, type }); }
    if (x.lv === "exists") { i++; need("("); const q = query(); need(")"); return mk(s, { k: "exists", q }); }
    if (["current_date", "current_time", "current_timestamp"].includes(x.lv)) { i++; return mk(s, { k: "lit", type: null }); }
    if (is("(", 1)) return call();
    if (RESERVED.has(x.lv)) throw UNSUPPORTED;
    return colRef();
  }
  function colRef() {
    const s = i, a = ident();
    if (eat(".")) { if (is("*")) throw UNSUPPORTED; return mk(s, { k: "col", t: a, c: ident(true) }); }
    return mk(s, { k: "col", c: a });
  }
  function call() {
    const s = i, name = next().lv;
    need("(");
    const f = { k: "call", name, args: [] };
    if (eat("*")) f.star = true;
    else if (!is(")")) { eat("distinct") || eat("all"); do f.args.push(expr()); while (eat(",")); }
    if (is("order") && is("by", 1)) { i += 2; f.aggOrder = orderList(); }
    need(")");
    if (eat("filter")) { need("("); need("where"); f.filter = expr(); need(")"); }
    if (eat("over")) { if (eat("(")) f.over = windowSpec(); else { ident(); f.over = { partition: [], order: [] }; } }
    return mk(s, f);
  }
  function caseExpr(s) {
    const c = { k: "case", subject: null, whens: [], els: null };
    if (!is("when")) c.subject = expr();
    while (eat("when")) { const w = expr(); need("then"); c.whens.push({ w, t: expr() }); }
    if (eat("else")) c.els = expr();
    need("end");
    return mk(s, c);
  }
  return statements();
}

// A structural key for "is this SELECT/ORDER BY expression one of the GROUP BY expressions": columns by what they
// resolved to, so p.name and name (one table) match.
function exprKey(n) {
  const norm = v => { while (v && v.k === "paren") v = v.e; return v && v.k === "col" ? (v.res && v.res.rv ? "c:" + v.res.rv.id + "." + v.res.col : "c?:" + v.c.name) : v; };
  return JSON.stringify(norm(n), (k, v) => (k === "text" || k === "res" || k === "from" || k === "to" ? undefined : norm(v)));
}
const firstAgg = n => {
  if (!n || typeof n !== "object" || n.k === "sub" || n.k === "exists") return null;
  if (n.k === "call" && AGGS.has(n.name) && !n.over && !((n.name === "min" || n.name === "max") && n.args.length > 1)) return n;
  for (const [k, v] of Object.entries(n)) {
    if (k === "res" || k === "q") continue;
    for (const c of Array.isArray(v) ? v : [v]) { const a = c && typeof c === "object" ? firstAgg(c) : null; if (a) return a; }
  }
  return null;
};

function analyse(stmts, schema, src) {
  const text = n => (n.text !== undefined ? n.text : src.slice(n.from, n.to));
  const tables = new Map(Object.entries(schema).map(([t, cols]) => [t.toLowerCase(),
    cols.map(([name, type, pk]) => ({ name: String(name).toLowerCase(), type: declType(type), pk: !!pk }))]));
  let ids = 0;
  const colMap = cols => (cols ? new Map(cols.map(c => [c.name, c])) : null);

  function resolve(n, scope) {
    let loose = false;
    for (let sc = scope, depth = 0; sc; sc = sc.parent, depth++) {
      const hits = [];
      let unknown = false;
      for (const rv of sc.rvs) {
        if (n.t) { if (rv.name !== n.t.name) { if (n.t.q && rv.name.toLowerCase() === n.t.name.toLowerCase()) loose = true; continue; } }
        if (!rv.cols) { unknown = true; continue; }
        const col = rv.cols.get(n.c.name);
        if (col) hits.push({ rv, col: col.name, type: col.type, outer: depth > 0 });
        else if (n.c.q && rv.cols.has(n.c.name.toLowerCase())) loose = true;
        else if (n.t) unknown = true;   // the table is there but not that column: SQLite will say so
      }
      if (hits.length === 1 && !unknown) return hits[0];
      if (hits.length || unknown) return { unknown: true };
    }
    return loose ? { loose: true } : null;
  }

  function T(n, cx) {
    switch (n.k) {
      case "lit": return n.type;
      case "paren": return T(n.e, cx);
      case "collate": return T(n.e, cx);
      case "row": n.list.forEach(e => T(e, cx)); return null;
      case "col": {
        const r = (n.res = resolve(n, cx.scope));
        if (r && !r.unknown && !r.loose) return r.type;
        if (r && r.unknown) return null;
        const quoted = n.c.q || (n.t && n.t.q);
        if (r && r.loose) refuse('column "' + n.c.name + '" does not exist', "Names in double quotes keep their exact case, and " + text(n) +
          " matches nothing written that way: drop the quotes, or write the name in lower case.", "double-quotes");
        const alias = !n.t && cx.aliases && cx.aliases.get(n.c.name);
        if (alias) refuse('column "' + n.c.name + '" does not exist', text(n) + " is a name given in SELECT" + (
          cx.clause === "SELECT" ? ", and one SELECT item cannot use another item's alias" :
          cx.clause === "ORDER BY" || cx.clause === "GROUP BY" ? ", and " + cx.clause + " accepts an alias only on its own, not inside an expression" :
          ", and " + cx.clause + " is worked out before SELECT, so the name does not exist there yet") + ": repeat the expression itself, " + text(alias.e) + ".", "aliases");
        if (quoted && !n.t) refuse('column "' + n.c.name + '" does not exist', '"' + n.c.name + '" in double quotes is the name of a column, and there is none: ' +
          "a text value takes single quotes, '" + n.c.name.replace(/'/g, "''") + "'.", "double-quotes");
        return null;
      }
      case "neg": {
        const t = T(n.e, cx);
        if (t === "text" || t === "bool") refuse("operator does not exist: - " + pgT(t), text(n.e) + " is " + pgT(t) + ", and only numbers take a minus sign.", "types");
        return t === "str" ? null : t;
      }
      case "arith": {
        const a = T(n.l, cx), b = T(n.r, cx);
        if (a === "text" || b === "text" || a === "bool" || b === "bool") {
          const [bad, t] = a === "text" || a === "bool" ? [n.l, a] : [n.r, b];
          refuse("operator does not exist: " + pgT(a) + " " + n.op + " " + pgT(b), text(bad) + " is " + pgT(t) + ", and " + n.op +
            " works on numbers only: compare text as text, or convert it with CAST(" + text(bad) + " AS INTEGER) when it holds digits.", "types");
        }
        return a === "num" || b === "num" ? "num" : a === "int" || b === "int" ? "int" : null;
      }
      case "concat": {
        const a = T(n.l, cx), b = T(n.r, cx);
        if ((isNum(a) || a === "bool") && (isNum(b) || b === "bool")) refuse("operator does not exist: " + pgT(a) + " || " + pgT(b),
          "|| joins text, and " + text(n.l) + " and " + text(n.r) + " are both numbers: add them with +, or make one of them text first, as in CAST(" + text(n.l) + " AS TEXT) || ...", "types");
        return "text";
      }
      case "cmp": {
        const a = T(n.l, cx), b = T(n.r, cx);
        if (n.op === "==") refuse("operator does not exist: " + pgT(a) + " == " + pgT(b), "SQL compares with a single equals sign: write " +
          text(n.l) + " = " + text(n.r) + ".", "double-equals");
        clash(a, b, n.l, n.r, n.op);
        return "bool";
      }
      case "is": T(n.l, cx); return "bool";
      case "between": { const a = T(n.l, cx); clash(a, T(n.lo, cx), n.l, n.lo, ">="); clash(a, T(n.hi, cx), n.l, n.hi, "<="); return "bool"; }
      case "inlist": { const a = T(n.l, cx); n.list.forEach(e => clash(a, T(e, cx), n.l, e, "=")); return "bool"; }
      case "insub": {
        const a = T(n.l, cx), out = query(n.q, cx.scope, cx.ctes);
        if (out && out.length === 1) clash(a, out[0].type, n.l, { text: "the subquery's column" }, "=");
        return "bool";
      }
      case "like": {
        const a = T(n.l, cx), b = T(n.r, cx);
        if (n.esc) T(n.esc, cx);
        for (const [side, t] of [[n.l, a], [n.r, b]])
          if (isNum(t) || t === "bool") refuse("operator does not exist: " + pgT(a) + (n.op === "LIKE" ? " ~~ " : " ~~* ") + (b === "str" ? "unknown" : pgT(b)),
            n.op + " matches text, and " + text(side) + " is " + pgT(t) + ": compare numbers with =, < or BETWEEN instead.", "types");
        return "bool";
      }
      case "logic": boolean(T(n.l, cx), n.op, n.l); boolean(T(n.r, cx), n.op, n.r); return "bool";
      case "not": boolean(T(n.e, cx), "NOT", n.e); return "bool";
      case "case": {
        const subj = n.subject ? T(n.subject, cx) : null;
        for (const w of n.whens) { const t = T(w.w, cx); if (n.subject) clash(subj, t, n.subject, w.w, "="); else boolean(t, "CASE/WHEN", w.w); }
        const outs = [...n.whens.map(w => T(w.t, cx)), n.els ? T(n.els, cx) : null];
        return outs.find(t => t && t !== "null" && t !== "str") || (outs.includes("str") ? "text" : null);
      }
      case "cast": T(n.e, cx); return declType(n.type);
      case "sub": { const out = query(n.q, cx.scope, cx.ctes); return out && out.length ? out[0].type : null; }
      case "exists": query(n.q, cx.scope, cx.ctes); return "bool";
      case "call": return callType(n, cx);
    }
    return null;
  }
  function clash(a, b, l, r, op) {
    const bad = (a === "text" && isNum(b)) || (isNum(a) && b === "text") || (isNum(a) && b === "str") || (a === "str" && isNum(b)) ||
      (a === "bool" && (isNum(b) || b === "text")) || (b === "bool" && (isNum(a) || a === "text"));
    if (!bad) return;
    const [num, str] = isNum(a) && b === "str" ? [l, r] : isNum(b) && a === "str" ? [r, l] : [null, null];
    const msg = "operator does not exist: " + pgT(a) + " " + op + " " + pgT(b);
    if (num) {
      const v = text(str).slice(1, -1), day = ymd(v);
      if (day) refuse(msg, text(num) + " holds dates as numbers written YYYYMMDD, and " + text(str) + " is quoted text: drop the quotes and write it as one number, as in " + text(num) + " " + op + " " + day + ".", "types");
      refuse(msg, text(num) + " holds numbers and " + text(str) + " is quoted text: " + (/^-?\d+(\.\d+)?$/.test(v) ? "drop the quotes, as in " + text(num) + " " + op + " " + v + "." : "compare it with a number."), "types");
    }
    const [t, n] = a === "text" ? [l, r] : [r, l];
    if ((a === "text" || b === "text") && n.k === "lit") refuse(msg, text(t) + " is a text column and " + text(n) + " is a number: write the value as text in single quotes, in the column's own format.", "types");
    refuse(msg, text(l) + " is " + pgT(a) + " and " + text(r) + " is " + pgT(b) + ": compare values of the same type, or convert one with CAST(... AS ...).", "types");
  }
  function boolean(t, what, n) {
    if (isNum(t) || t === "text") refuse("argument of " + what + " must be type boolean, not type " + pgT(t),
      what + " needs a condition that is true or false, and " + text(n) + " is " + (t === "text" ? "text" : "a number") + ": compare it with something, as in " +
      text(n) + " = ... or " + text(n) + " IS NOT NULL.", "boolean");
  }
  function callType(n, cx) {
    const a = n.args.map(e => T(e, cx));
    if (n.filter) boolean(T(n.filter, cx), "FILTER", n.filter);
    if (n.aggOrder) n.aggOrder.forEach(o => T(o.e, cx));
    if (n.over) { n.over.partition.forEach(e => T(e, cx)); n.over.order.forEach(o => T(o.e, cx)); }
    const sig = n.name + "(" + a.map(pgT).join(", ") + ")";
    if (Object.hasOwn(SQLITE_FUNCS, n.name)) refuse("function " + sig + " does not exist", n.name + "() is not standard SQL: use " + SQLITE_FUNCS[n.name] + " instead.", FUNC_ANCHOR[n.name] || "sqlite-only");
    if ((n.name === "date" || n.name === "time") && n.args.length > 1) refuse("function " + sig + " does not exist",
      n.name + "() with a modifier is not standard SQL: use " + DATE_TEXT + " instead.", "date-functions");
    if ((n.name === "min" || n.name === "max") && n.args.length > 1) refuse("function " + sig + " does not exist",
      "With several arguments " + n.name + "() is not standard SQL: write " + (n.args.length === 2 ? "CASE WHEN " + text(n.args[0]) +
      (n.name === "max" ? " > " : " < ") + text(n.args[1]) + " THEN " + text(n.args[0]) + " ELSE " + text(n.args[1]) + " END" : "CASE WHEN ... THEN ... ELSE ... END") + ".", "iif");
    if ((n.name === "sum" || n.name === "avg") && (a[0] === "text" || a[0] === "bool")) refuse("function " + sig + " does not exist", a[0] === "bool"
      ? text(n.args[0]) + " is a condition (true or false), not a number: count where it holds with SUM(CASE WHEN " + text(n.args[0]) + " THEN 1 ELSE 0 END)."
      : n.name.toUpperCase() + " works on numbers, and " + text(n.args[0]) + " is text: use COUNT, MIN or MAX on text, or convert digits with CAST(... AS INTEGER).", "types");
    const first = a[0] === "str" ? "text" : a[0];
    switch (n.name) {
      case "count": case "length": case "row_number": case "rank": case "dense_rank": case "ntile": return "int";
      case "avg": case "percent_rank": case "cume_dist": return "num";
      case "round": return a.length > 1 || first !== "int" ? "num" : "int";
      case "sum": case "abs": case "min": case "max": case "lag": case "lead": case "first_value": case "last_value": case "nth_value": return first;
      case "coalesce": case "nullif": return a.map(t => (t === "str" ? "text" : t)).find(t => t && t !== "null") || null;
      case "lower": case "upper": case "trim": case "ltrim": case "rtrim": case "btrim": case "replace": case "substr": case "substring": case "concat": case "left": case "right":
      case "string_agg": case "format": return "text";
    }
    return null;
  }

  // One SELECT (or VALUES): returns its output columns [{name, type}] or null when unknown.
  function select(c, outer, ctes, order) {
    if (c.k === "paren") return query(c.q, outer, ctes);
    if (c.k === "values") { const cx = { scope: { rvs: [], parent: outer }, ctes, clause: "VALUES" }; const t = c.rows.map(r => r.map(e => T(e, cx))); return t[0].map((ty, j) => ({ name: "column" + (j + 1), type: ty === "str" ? "text" : ty, str: ty === "str" })); }
    const scope = { rvs: [], parent: outer }, ons = [];
    const addFrom = f => {
      if (f.k === "join") { addFrom(f.l); addFrom(f.r); if (f.on) ons.push(f.on); return; }
      let cols = null, base = false;
      if (f.k === "sub") { const out = query(f.q, outer, ctes); cols = out && out.map(o => ({ ...o, pk: false })); }
      else {
        const nm = f.name.name;
        if (ctes.has(nm)) cols = ctes.get(nm);
        else if (tables.has(nm) && (!f.name.q || nm === nm.toLowerCase())) { cols = tables.get(nm); base = true; }
        else if (f.name.q && (tables.has(nm.toLowerCase()) || ctes.has(nm.toLowerCase()))) refuse('relation "' + nm + '" does not exist',
          "Names in double quotes keep their exact case: write " + nm.toLowerCase() + " without quotes.", "double-quotes");
      }
      if (cols && f.cols) cols = f.cols.map((a, j) => ({ name: a.name, type: cols[j] ? cols[j].type : null, pk: false }));
      scope.rvs.push({ id: ++ids, name: f.alias ? f.alias.name : f.k === "table" ? f.name.name : "", cols: colMap(cols), base,
        pk: base ? cols.filter(x => x.pk).map(x => x.name) : [] });
    };
    if (c.from) addFrom(c.from);
    const aliases = new Map(c.cols.filter(r => r.alias).map(r => [r.alias.name, r]));
    const cx = clause => ({ scope, ctes, aliases, clause });
    const types = c.cols.map(r => (r.star ? null : T(r.e, cx("SELECT"))));
    for (const on of ons) boolean(T(on, cx("JOIN/ON")), "JOIN/ON", on);
    if (c.where) boolean(T(c.where, cx("WHERE")), "WHERE", c.where);
    const outNames = c.cols.map(r => (r.alias ? r.alias.name : r.e && r.e.k === "col" ? r.e.c.name : null));
    const bare = e => e.k === "col" && !e.t;
    const ordinal = e => e.k === "lit" && e.type === "int" && c.cols[Number(e.v) - 1] && !c.cols[Number(e.v) - 1].star ? c.cols[Number(e.v) - 1] : null;
    const keys = new Set(), gcols = new Set();
    const addKey = e => { keys.add(exprKey(e)); let v = e; while (v.k === "paren") v = v.e; if (v.k === "col" && v.res && v.res.rv) gcols.add(v.res.rv.id + "." + v.res.col); };
    for (const g of c.group) {
      const item = ordinal(g) || (bare(g) && !resolve(g, scope) && aliases.get(g.c.name));
      if (item) addKey(item.e);
      else { T(g, cx("GROUP BY")); addKey(g); }
    }
    if (c.having) boolean(T(c.having, cx("HAVING")), "HAVING", c.having);
    const orderItems = (order || []).filter(o => !ordinal(o.e) && !(bare(o.e) && outNames.includes(o.e.c.name)));
    for (const o of orderItems) T(o.e, cx("ORDER BY"));

    const agg = c.cols.map(r => r.e && firstAgg(r.e)).find(Boolean) || (c.having && firstAgg(c.having)) || orderItems.map(o => firstAgg(o.e)).find(Boolean);
    if (c.group.length || agg || c.having) {
      const whole = new Set(scope.rvs.filter(rv => rv.base && rv.pk.length && rv.pk.every(p => gcols.has(rv.id + "." + p))).map(rv => rv.id));
      const ok = col => !col.res || !col.res.rv || col.res.outer || gcols.has(col.res.rv.id + "." + col.res.col) || whole.has(col.res.rv.id);
      const stray = n => {
        if (!n || typeof n !== "object" || n.k === "sub" || n.k === "exists") return null;
        if (n.k && keys.has(exprKey(n))) return null;
        if (n.k === "col") return ok(n) ? null : n;
        if (n.k === "call" && n === firstAgg(n)) return null;
        for (const [k, v] of Object.entries(n)) {
          if (k === "res" || k === "q") continue;
          for (const x of Array.isArray(v) ? v : [v]) { const s = x && typeof x === "object" ? stray(x) : null; if (s) return s; }
        }
        return null;
      };
      const say = (rvName, col, where) => {
        const name = (rvName ? rvName + "." : "") + col, error = 'column "' + name + '" must appear in the GROUP BY clause or be used in an aggregate function';
        if (!c.group.length && c.having) refuse(error, "HAVING without GROUP BY makes the whole table one group, so " + name + " can only appear inside an aggregate: " +
          "add GROUP BY " + name + ", or move a row condition to WHERE.", "having");
        if (!c.group.length) refuse(error, text(agg) + " turns all the rows into one, so " + name + " has no single value to show: add GROUP BY " + name +
          " for one row per " + col + ", or leave " + name + " out.", "group-by");
        if (where === "ORDER BY") refuse(error, "After GROUP BY each row is a group, so ORDER BY can only use grouped columns, aggregates or SELECT aliases: sort by MAX(" +
          name + "), or add " + name + " to GROUP BY.", "order-by-grouped");
        refuse(error, "Each row of the result is one group, and " + name + " can hold several values inside a group: add " + name +
          " to GROUP BY, or wrap it in an aggregate such as MAX(" + name + ").", "group-by");
      };
      for (const r of c.cols) {
        if (r.star) {
          for (const rv of scope.rvs.filter(rv => r.star === true || rv.name === r.star.name))
            for (const col of rv.cols ? rv.cols.keys() : []) if (!gcols.has(rv.id + "." + col) && !whole.has(rv.id))
              refuse('column "' + rv.name + "." + col + '" must appear in the GROUP BY clause or be used in an aggregate function',
                "SELECT * lists every column, but after GROUP BY only the grouped columns and aggregates have one value per group: list those instead of *.", "group-by");
          continue;
        }
        const s = stray(r.e); if (s) say(s.res.rv.name, s.res.col, "SELECT");
      }
      if (c.having) { const s = stray(c.having); if (s) say(s.res.rv.name, s.res.col, "HAVING"); }
      for (const o of orderItems) { const s = stray(o.e); if (s) say(s.res.rv.name, s.res.col, "ORDER BY"); }
    }
    if (c.distinct) {
      const selected = new Set(c.cols.filter(r => !r.star).map(r => exprKey(r.e)));
      const starred = new Set(scope.rvs.filter(rv => c.cols.some(r => r.star === true || (r.star && r.star.name === rv.name))).map(rv => rv.id));
      for (const o of orderItems) {
        let v = o.e; while (v.k === "paren") v = v.e;
        if (selected.has(exprKey(v)) || (v.k === "col" && (!v.res || !v.res.rv || starred.has(v.res.rv.id)))) continue;
        refuse("for SELECT DISTINCT, ORDER BY expressions must appear in select list", "DISTINCT removes repeated rows before sorting, so " + text(o.e) +
          " is gone by then: sort by a column you selected, or use GROUP BY and sort by an aggregate such as MIN(" + text(o.e) + ").", "distinct-order");
      }
    }
    if (c.cols.some(r => r.star && !scope.rvs.filter(rv => r.star === true || rv.name === r.star.name).every(rv => rv.cols))) return null;
    return c.cols.flatMap((r, j) => (r.star ? scope.rvs.filter(rv => r.star === true || rv.name === r.star.name).flatMap(rv => [...rv.cols.values()].map(x => ({ name: x.name, type: x.type })))
      : [{ name: outNames[j], type: types[j] === "str" ? "text" : types[j] === "null" ? null : types[j], str: types[j] === "str" }]));
  }
  function query(q, outer, ctes) {
    ctes = new Map(ctes);
    for (const cte of q.ctes) {
      const names = cte.cols && cte.cols.map(x => x.name);
      if (q.recursive) ctes.set(cte.name.name, names ? names.map(name => ({ name, type: null })) : null);
      const out = query(cte.body, outer, ctes);
      ctes.set(cte.name.name, names ? names.map((name, j) => ({ name, type: out && out[j] ? out[j].type : null })) : out);
    }
    const parts = q.body.parts, single = parts.length === 1;
    const out = select(parts[0], outer, ctes, single ? q.order : null);
    // A quoted literal is PostgreSQL's "unknown" (it takes the other side's type), so only a certain text against a number is refused.
    parts.slice(1).forEach((p, k) => {
      const more = select(p, outer, ctes, null);
      if (out && more) out.forEach((a, j) => {
        const b = more[j], txt = x => x.type === "text" && !x.str;
        if (b && ((txt(a) && isNum(b.type)) || (isNum(a.type) && txt(b)))) {
          const col = (x, which) => "column " + (j + 1) + " of the " + which + " SELECT" + (x.name ? " (" + x.name + ")" : "") + " is " + pgT(x.type);
          refuse(q.body.ops[k] + " types " + pgT(a.type) + " and " + pgT(b.type) + " cannot be matched", col(a, "first").replace(/^c/, "C") + " but " +
            col(b, ["second", "third", "fourth", "fifth"][k] || k + 2 + "th") + ": each column must hold the same type in every SELECT, so line the columns up, or convert one with CAST(... AS ...).", "types");
        }
      });
    });
    for (const e of [q.limit, q.offset]) if (e) T(e, { scope: { rvs: [], parent: outer }, ctes, clause: "LIMIT" });
    return out;
  }
  for (const s of stmts) query(s, null, new Map());
}

// When the parser gives up, these tokens are still never PostgreSQL: refuse them by name.
function strictScan(toks, src) {
  for (let i = 0; i < toks.length; i++) {
    const x = toks[i], nx = toks[i + 1] || {};
    if (x.v === "==") refuse("operator does not exist: ==", "SQL compares with a single equals sign: write = instead of ==.", "double-equals");
    if (x.t === "bq") refuse('syntax error at or near "' + x.v[0] + '"', "SQL quotes a name with double quotes, not backticks or square brackets.", "double-quotes");
    if (x.t === "word" && nx.v === "(" && Object.hasOwn(SQLITE_FUNCS, x.lv) && (toks[i - 1] || {}).v !== ".")
      refuse("function " + x.lv + " does not exist", x.lv + "() is not standard SQL: use " + SQLITE_FUNCS[x.lv] + " instead.", FUNC_ANCHOR[x.lv] || "sqlite-only");
    if (x.t === "word" && ["glob", "regexp"].includes(x.lv)) refuse('syntax error at or near "' + x.v + '"',
      x.v.toUpperCase() + " is not standard SQL: match patterns with LIKE or ILIKE.", "like-ilike");
  }
  return src;
}

// schema: { table: [[column, declared type, pk], ...] } (PRAGMA table_info). debug: rethrow when the parser gives up
// (the plot test uses it, so every plot query is actually checked, not waved through).
export function strictCheck(sql, schema, debug = false) {
  let toks;
  try {
    toks = sqlTokens(sql);
    analyse(parseSql(sql, toks), schema, sql);
    return null;
  } catch (e) {
    if (e instanceof Refusal) return e.out;
    if (debug) throw e === UNSUPPORTED ? new Error("strictCheck could not parse: " + sql) : e;
    try { strictScan(toks || [], sql); } catch (r) { if (r instanceof Refusal) return r.out; }
    if (e !== UNSUPPORTED && typeof console !== "undefined") console.warn("strictCheck", e);
    return null;
  }
}
// The type after x:: (one word, "double precision", "character varying", an optional (p, s)): returns its name and
// calls done(index after it), or null.
const SQLITE_TYPE = { int: "INTEGER", integer: "INTEGER", int2: "INTEGER", int4: "INTEGER", int8: "INTEGER", smallint: "INTEGER", bigint: "INTEGER",
  real: "REAL", float: "REAL", float4: "REAL", float8: "REAL", "double precision": "REAL", numeric: "NUMERIC", decimal: "NUMERIC",
  text: "TEXT", varchar: "TEXT", char: "TEXT", character: "TEXT", "character varying": "TEXT", date: "TEXT", time: "TEXT", timestamp: "TEXT" };
function castType(toks, i, done) {
  if ((toks[i] || {}).t !== "word") return null;
  let name = toks[i++].lv;
  if ((name === "double" && (toks[i] || {}).lv === "precision") || (name === "character" && (toks[i] || {}).lv === "varying")) name += " " + toks[i++].lv;
  if ((toks[i] || {}).v === "(") { while (i < toks.length && toks[i].v !== ")") i++; if (i++ >= toks.length) return null; }
  done(i);
  return name;
}
// The index of the "(" that closes at toks[c], or of the ")" that the "(" at toks[o] opens; -1 when unbalanced.
function matchParen(toks, k, step) {
  for (let d = 0; k >= 0 && k < toks.length; k += step) {
    if (toks[k].v === "(") d += step; else if (toks[k].v === ")") d -= step;
    if (d === 0) return k;
  }
  return -1;
}
// One PostgreSQL form SQLite lacks, the leftmost, rewritten on tokens (strings and comments untouched); null when none is left.
function rewriteOne(sql, toks) {
  for (let i = 0; i < toks.length; i++) {
    const x = toks[i], prev = toks[i - 1] || {};
    if (x.v === "::") {
      let s = i - 1;
      if (s < 0) continue;
      if (toks[s].v === ")") {   // (expr), f(...), CAST(...), f(...) OVER (...) / FILTER (...)
        for (;;) {
          s = matchParen(toks, s, -1);
          if (s < 0) break;
          const w = toks[s - 1] || {};
          if (w.t !== "word") break;
          if ((w.lv === "over" || w.lv === "filter") && (toks[s - 2] || {}).v === ")") { s -= 2; continue; }
          if (!RESERVED.has(w.lv) || ["cast", "left", "right", "exists"].includes(w.lv)) s--;
          break;
        }
        if (s < 0) continue;
      } else if (!["word", "qid", "str", "num"].includes(toks[s].t)) continue;
      else if ((toks[s - 1] || {}).v === "." && ["word", "qid"].includes((toks[s - 2] || {}).t)) s -= 2;
      let end = -1;
      const type = castType(toks, i + 1, t => { end = t; });
      if (!type) continue;
      return sql.slice(0, toks[s].pos) + "CAST(" + sql.slice(toks[s].pos, prev.end) + " AS " + (SQLITE_TYPE[type] || type.toUpperCase()) + ")" + sql.slice(toks[end - 1].end);
    }
    if (x.t === "word" && (x.lv === "left" || x.lv === "right") && (toks[i + 1] || {}).v === "(" && prev.v !== ".") {
      const c = matchParen(toks, i + 1, 1), commas = [];
      for (let k = i + 2, d = 0; k < c; k++) { const v = toks[k].v; if (v === "(") d++; else if (v === ")") d--; else if (v === "," && d === 0) commas.push(k); }
      if (c < 0 || commas.length !== 1) continue;
      const a = sql.slice(toks[i + 2].pos, toks[commas[0] - 1].end), n = sql.slice(toks[commas[0] + 1].pos, toks[c - 1].end);
      // ponytail: a negative n (PostgreSQL: all but the last/first |n|) gives '' here; add it if a page ever needs it.
      return sql.slice(0, x.pos) + (x.lv === "left" ? "substr(" + a + ", 1, " + n + ")" : "substr(" + a + ", -(" + n + "), " + n + ")") + sql.slice(toks[c].end);
    }
  }
  return null;
}
// What the terminal hands sql.js: LEFT(x, n) -> substr(x, 1, n), RIGHT(x, n) -> substr(x, -(n), n) (n = 0 gives ''),
// x::type -> CAST(x AS type) (date and time stay text), and ILIKE -> REGEXP, which loadDb binds to ilike() (LIKE itself
// is case-sensitive there, as in PostgreSQL). generate_db.sqlite_sql does the same.
export function toSqlite(sql) {
  for (let r; (r = rewriteOne(sql, sqlTokens(sql))) !== null;) sql = r;
  let out = "", last = 0;
  for (const t of sqlTokens(sql)) if (t.t === "word" && t.lv === "ilike") { out += sql.slice(last, t.pos) + "REGEXP"; last = t.end; }
  return out + sql.slice(last);
}
export function ilike(pattern, value, escape) {
  if (pattern == null || value == null) return null;
  const p = String(pattern); let re = "";
  for (let i = 0; i < p.length; i++) {
    const ch = p[i];
    if (escape != null && ch === String(escape)) { i++; re += (p[i] || "").replace(/[\\^$.*+?()[\]{}|/-]/g, "\\$&"); }
    else re += ch === "%" ? "[\\s\\S]*" : ch === "_" ? "[\\s\\S]" : ch.replace(/[\\^$.*+?()[\]{}|/-]/g, "\\$&");
  }
  return new RegExp("^" + re + "$", "i").test(String(value)) ? 1 : 0;
}
// '1912-05-18', '18/05/1912', '05/18/1912' -> "19120518" (day first, unless the second part is over 12); else "".
export function ymd(v) {
  let m = v.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})$/), y, mo, d;
  if (m) [y, mo, d] = [m[1], +m[2], +m[3]];
  else if ((m = v.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})$/))) [y, d, mo] = +m[2] > 12 ? [m[3], +m[2], +m[1]] : [m[3], +m[1], +m[2]];
  else return "";
  return mo >= 1 && mo <= 12 && d >= 1 && d <= 31 ? y + String(mo).padStart(2, "0") + String(d).padStart(2, "0") : "";
}
