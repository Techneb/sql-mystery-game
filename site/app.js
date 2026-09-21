// site/app.js -- The Ritz Affair. ES module: pure functions exported for node --test, boot() only in a browser.
export const STOP_WORDS = new Set(["the", "a", "suite", "no", "trunk", "mr", "mrs", "esq", "lord", "senor",
  "senora", "comtesse", "de", "rue", "report", "telegram", "account", "plate"]);

export function normalise(s) {
  // Same rules as normalise() in generate_db.py. Keep both in sync (fixture in chapters.json).
  const tokens = (String(s).toLowerCase().match(/[a-z0-9]+/g) || []).filter(t => !STOP_WORDS.has(t));
  if (tokens.length && tokens.every(t => /^[0-9]+$/.test(t))) return tokens.join("");
  return tokens.join(" ");
}

export async function sha256(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

export function freshState() {
  return { solved: [], part2: false, queries: {}, hints: {}, wrong: {}, wrongStreak: 0, errorStreak: 0,
           badges: [], history: [], notes: "", names: "", lastQueryLines: 0, totalQueries: 0, answers: {} };
}
// queries/hints/wrong are keyed by chapter number: { "1": 3, "2": 7 }
export function currentChapter(state, chapters) {
  const next = state.solved.length + 1;
  const cap = state.part2 ? 12 : 8;
  return chapters.find(c => c.n === Math.min(next, cap));
}
export function part1Done(state) { return state.solved.includes(8); }
export function awaitingCode(state) { return part1Done(state) && !state.part2; }

const KEY = "ritz.learn";
export function load() { try { return { ...freshState(), ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch { return freshState(); } }
let noPersist = false;
export function save(state) { if (noPersist) return; try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} }

const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
const $ = id => document.getElementById(id);

let db, data, state, tableSizes = {};

async function loadDb() {
  const SQL = await initSqlJs({ locateFile: f => "https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.13.0/" + f });
  const buf = await (await fetch("mystery.sqlite")).arrayBuffer();
  db = new SQL.Database(new Uint8Array(buf));
  const v = db.exec("SELECT sqlite_version()")[0].values[0][0];
  if (v.split(".").map(Number) < [3, 39]) console.warn("SQLite " + v + " is older than 3.39; RIGHT JOIN will fail");
  for (const [t] of db.exec("SELECT name FROM sqlite_master WHERE type='table'")[0].values)
    tableSizes[t] = db.exec("SELECT COUNT(*) FROM " + t)[0].values[0][0];
}

let reviewing = null;
function reviewChapter(n) { reviewing = n; renderChapter(); }
function backToInvestigation() { reviewing = null; renderChapter(); }

function renderChapter() {
  const total = state.part2 ? 12 : 8;
  document.querySelector(".answer-row").hidden = reviewing != null;
  $("btn-back").hidden = reviewing == null;
  if (reviewing != null) {
    const ch = data.chapters.find(c => c.n === reviewing);
    $("masthead-chapter").textContent = "REVIEWING CHAPTER " + ROMAN[ch.n] + " OF " + ROMAN[total];
    $("chapter-title").textContent = ch.title;
    $("story").textContent = ch.story;
    $("objective").textContent = ch.objective + " Your answer: " + state.answers[ch.n] + ".";
    $("witnesses").innerHTML = "";
    return;
  }
  const ch = currentChapter(state, data.chapters);
  $("masthead-chapter").textContent = "CHAPTER " + ROMAN[ch.n] + " OF " + ROMAN[total];
  $("chapter-title").textContent = ch.title;
  $("story").textContent = ch.story;
  $("objective").textContent = ch.objective + " Answer: " + ch.answer_form + ".";
  if (awaitingCode(state)) {
    $("story").textContent = data.endings.part1;
    $("objective").textContent = "Part I is closed. Lupin mentioned a Chapter IX. Somewhere in the archives a telegram is addressed to a curious clerk; its code, typed in the answer box, opens Part II.";
    $("btn-print").hidden = false;
  }
  if (state.solved.includes(12)) { $("story").textContent = data.endings.part2; $("objective").textContent = "Case closed. Twice."; }
  renderWitnesses();
  let box = document.getElementById("rank-box");
  if (part1Done(state)) {
    if (!box) { box = document.createElement("div"); box.id = "rank-box"; box.className = "box"; $("objective").parentElement.after(box); }
    const p1 = partStats(state, 1, 8);
    box.innerHTML = '<div class="label">RANK</div>' + esc(rank(p1.queries, p1.hints)) + " - " + p1.queries + " queries, " + p1.hints + " witnesses<br>" +
      esc(state.badges.join(", "));
  } else if (box) box.remove();
}

const WITNESS = ["Ask the concierge", "Ask the chambermaid", "Open Ganimard's notebook"];
function renderWitnesses() {
  const ch = currentChapter(state, data.chapters);
  const opened = state.hints[ch.n] || 0;
  const el = $("witnesses"); el.innerHTML = "";
  if (awaitingCode(state) || state.solved.includes(12)) return;
  ch.hints.slice(0, opened).forEach(h => { const d = document.createElement("div"); d.className = "hint"; d.textContent = h; el.appendChild(d); });
  if (opened < 3) {
    const b = document.createElement("button"); b.textContent = WITNESS[opened] + (opened === 2 ? " (the query, with blanks)" : "");
    b.onclick = () => { state.hints[ch.n] = opened + 1; save(state); renderWitnesses(); };
    el.appendChild(b);
  }
}

export const ROW_CAP = 200;
const esc = s => String(s === null || s === undefined ? "NULL" : s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

export function renderResults(res) {
  if (!res) return '<p class="muted">No rows.</p>';
  const head = "<tr>" + res.columns.map(c => "<th>" + esc(c) + "</th>").join("") + "</tr>";
  const body = res.values.slice(0, ROW_CAP).map(r => "<tr>" + r.map(v => "<td>" + esc(v) + "</td>").join("") + "</tr>").join("");
  const more = res.values.length > ROW_CAP ? '<p class="muted">' + (res.values.length - ROW_CAP) + " more rows not shown.</p>" : "";
  return "<table>" + head + body + "</table>" + more;
}

export function pushHistory(state, sql) {
  if (state.history[0] !== sql) state.history.unshift(sql);
  state.history = state.history.slice(0, 20);
}

function runQuery() {
  const sql = $("sql").value.trim();
  if (!sql) return;
  const ch = currentChapter(state, data.chapters);
  state.queries[ch.n] = (state.queries[ch.n] || 0) + 1;
  state.totalQueries++;
  pushHistory(state, sql);
  let res = null, error = null, t0 = performance.now();
  try { const all = db.exec(sql); res = all[all.length - 1] || null; state.errorStreak = 0; }
  catch (e) { error = e.message; state.errorStreak++; }
  const ms = Math.round(performance.now() - t0);
  $("results").innerHTML = error ? '<div class="error">' + esc(error) + "</div>" : renderResults(res);
  $("run-info").textContent = error ? "error" : (res ? res.values.length : 0) + " rows - " + ms + " ms";
  state.lastQueryLines = sql.split("\n").length;
  renderHistory();
  award(detectBadges(ctx({ sql, rows: error ? -1 : (res ? res.values.length : 0), error: !!error }), state.badges));
  save(state);
  return { sql, res, error };
}

function renderHistory() {
  $("history").innerHTML = state.history.map(q => "<li>" + esc(q) + "</li>").join("");
  [...$("history").children].forEach((li, i) => li.onclick = () => { $("sql").value = state.history[i]; });
}

export const TAUNTS = [
  "MY DEAR CLERK STOP THREE GUESSES STOP GANIMARD GUESSED ONCE IN 1898 AND STILL BLUSHES STOP READ THE OBJECTIVE AGAIN STOP A L",
  "MY DEAR CLERK STOP THE DATA DOES NOT CHANGE ITS MIND STOP YOU MIGHT STOP A L",
  "MY DEAR CLERK STOP A QUERY IS CHEAPER THAN A GUESS STOP RUN ONE STOP A L",
];

export function judgeWrong(norm, data, state) {
  if (data.wrong_suspects[norm]) return data.wrong_suspects[norm];
  return data.wrong_default[state.wrongStreak % data.wrong_default.length];
}

let typer = null;
function typeTelegram(text) {
  clearInterval(typer);
  const el = $("telegram"); el.textContent = ""; let i = 0;
  typer = setInterval(() => { el.textContent = text.slice(0, ++i); if (i >= text.length) clearInterval(typer); }, 25);
  el.onclick = () => { clearInterval(typer); el.textContent = text; };
}

const tablesIn = sql => [...sql.matchAll(/\b(?:from|join)\s+([a-z_]+)/gi)].map(m => m[1].toLowerCase());
export const BADGES = [
  ["Tourist", "SELECT * on a table of over a thousand rows. Ganimard sighs.", c => c.event === "query" && /select\s+\*/i.test(c.sql) && tablesIn(c.sql).some(t => c.bigTables.includes(t))],
  ["Needle", "A query that returned exactly one row.", c => c.event === "query" && c.rows === 1],
  ["Haystack", "A result too long to show. Two hundred rows is the clerk's limit.", c => c.event === "query" && c.rows > ROW_CAP],
  ["First JOIN", "Two ledgers, one question.", c => c.event === "query" && /\bjoin\b/i.test(c.sql)],
  ["Three's a Crowd", "Three tables in one query.", c => c.event === "query" && (c.sql.match(/\bjoin\b/gi) || []).length >= 2],
  ["Early HAVING", "HAVING before chapter 4. Somebody has been reading ahead.", c => c.event === "query" && /\bhaving\b/i.test(c.sql) && c.chapter < 4],
  ["Aliased", "AS. Ganimard approves of short names.", c => c.event === "query" && /\bas\b/i.test(c.sql)],
  ["Novelist", "A query of more than fifteen lines.", c => c.event === "query" && c.sql.split("\n").length > 15],
  ["Haiku", "A chapter solved in three lines or fewer.", c => c.event === "solve" && c.lines <= 3],
  ["Typo", "Five errors in a row. The typewriter is not to blame.", c => c.event === "query" && c.error && c.state.errorStreak >= 5],
  ["Persistent", "Twenty queries in one chapter.", c => c.event === "query" && (c.state.queries[c.chapter] || 0) >= 20],
  ["Sniper", "A chapter solved on the first query.", c => c.event === "solve" && c.state.queries[c.chapter] === 1],
  ["Insomniac", "A query run between midnight and five.", c => c.event === "query" && new Date().getHours() < 5],
  ["Trespasser", "Queried a table the evidence has not reached yet.", c => c.event === "query" && tablesIn(c.sql).some(t => !c.revealed.has(t) && t !== "sqlite_master")],
  ["Archivist", "Read sqlite_master. The card catalogue, in other words.", c => c.event === "query" && /sqlite_master/i.test(c.sql)],
  ["Anagram", "Accused Paul Sernine. Lupin is vain, not stupid.", c => c.event === "answer" && c.norm === "paul sernine"],
  ["Wrong Frenchman", "Accused Horace Velmont. The Prefect's wife is unamused.", c => c.event === "answer" && c.norm === "horace velmont"],
  ["Gentleman", "Answered 'Arsene Lupin'. Yes. Under which name?", c => c.event === "answer" && c.norm === "arsene lupin"],
  ["Window Shopper", "OVER ( before chapter 8.", c => c.event === "query" && /\bover\s*\(/i.test(c.sql) && c.chapter < 8],
  ["Recursive", "WITH RECURSIVE. Ganimard has never seen one and never will.", c => c.event === "query" && /with\s+recursive/i.test(c.sql)],
  ["Egg Hunter", "Found the telegram to the curious clerk.", c => c.event === "code"],
  ["Clean Sweep", "Part I without a single witness.", c => c.event === "part1" && [1, 2, 3, 4, 5, 6, 7, 8].every(n => !(c.state.hints[n] > 0))],
  ["Ganimard", "All twelve chapters. The inspector retires; you take his desk.", c => c.event === "part2"],
];

export function detectBadges(ctx, have) {
  return BADGES.filter(([name, , pred]) => !have.includes(name) && pred(ctx)).map(([name, text]) => ({ name, text }));
}

function award(list) {
  for (const b of list) {
    state.badges.push(b.name);
    const t = document.createElement("div"); t.className = "toast"; t.innerHTML = "<b>Badge: " + esc(b.name) + "</b><br>" + esc(b.text);
    $("toasts").appendChild(t); setTimeout(() => t.remove(), 5000);
  }
  if (list.length) save(state);
}

export const RANKS = [[25, 0, "Ganimard himself"], [40, 3, "Chief Inspector"], [60, 6, "Inspector"], [Infinity, Infinity, "Constable"]];  // tune after the first class
export function rank(queries, hints) { return RANKS.find(([q, h]) => queries <= q && hints <= h)[2]; }
export function partStats(state, from, to) {
  let queries = 0, hints = 0;
  for (let n = from; n <= to; n++) { queries += state.queries[n] || 0; hints += state.hints[n] || 0; }
  return { queries, hints };
}

function renderCertificate() {
  const p1 = partStats(state, 1, 8), p2 = partStats(state, 9, 12);
  const r1 = part1Done(state) ? rank(p1.queries, p1.hints) : "";
  $("certificate").innerHTML =
    '<div class="mast-title">LE PETIT JOURNAL</div><div class="mast-sub">PARIS &mdash; ' + new Date().toLocaleDateString("en-GB") + "</div>" +
    "<h1>CASE CLOSED" + (state.solved.includes(12) ? ", TWICE" : "") + "</h1>" +
    "<p>The Prefecture of Police certifies that <b>" + esc(state.names || "the clerk") + "</b> unmasked Arsene Lupin in " + state.solved.filter(n => n <= 8).length + " chapters, " +
    p1.queries + " queries and " + p1.hints + " witnesses, and is hereby ranked <b>" + esc(r1) + "</b>." +
    (state.part2 ? " Part II: " + state.solved.filter(n => n > 8).length + " of 4 chapters, " + p2.queries + " queries.</p>" : "</p>") +
    '<p class="label">BADGES</p><ul class="badges">' + state.badges.map(b => "<li>" + esc(b) + "</li>").join("") + "</ul>" +
    (state.notes ? '<p class="label">NOTES</p><pre>' + esc(state.notes) + "</pre>" : "") +
    "<p class=\"muted\">Ganimard's signature is illegible, as always.</p>";
}

function ctx(extra) {
  return { event: "query", sql: "", rows: 0, error: false, chapter: currentChapter(state, data.chapters).n, state,
           bigTables: Object.keys(tableSizes).filter(t => tableSizes[t] > 1000), revealed: visibleTables(data.chapters, state),
           norm: "", lines: state.lastQueryLines, ...extra };
}

function renderBoard() {
  $("board").innerHTML = state.solved.map(n => '<div class="card" data-n="' + n + '"><b>' + ROMAN[n] + "</b> " + esc(state.answers[n]) + "</div>").join("");
  $("board").querySelectorAll(".card").forEach(el => el.onclick = () => reviewChapter(Number(el.dataset.n)));
}

let visBefore = new Set();
async function submitAnswer() {
  const raw = $("answer").value; const norm = normalise(raw);
  if (!norm) return;
  visBefore = new Set(visibleTables(data.chapters, state));
  const hash = await sha256(norm);
  const ch = currentChapter(state, data.chapters);
  if (awaitingCode(state)) {
    if (hash === data.part2_code_sha256) { state.part2 = true; $("reply").textContent = "The code is accepted. Ganimard has gone home. You have not."; afterSolve(null, "code"); }
    else { $("reply").textContent = "That is not the code. It is four words, in a telegram nobody was meant to read."; }
    $("answer").value = ""; save(state); return;
  }
  if (hash === ch.answer_sha256) {
    state.solved.push(ch.n); state.answers[ch.n] = raw.trim(); state.wrongStreak = 0;
    $("reply").textContent = "Correct. Ganimard grunts, which is praise.";
    typeTelegram(ch.telegram);
    afterSolve(ch, "solve");
  } else {
    state.wrong[ch.n] = (state.wrong[ch.n] || 0) + 1; state.wrongStreak++;
    $("reply").textContent = judgeWrong(norm, data, state);
    if (state.wrongStreak % 3 === 0) typeTelegram(TAUNTS[(state.wrongStreak / 3 - 1) % TAUNTS.length]);
    afterWrong(norm);   // Task 7 badge hook; define as an empty function here
  }
  $("answer").value = ""; save(state);
}

export function visibleTables(chapters, state) {
  const cur = currentChapter(state, chapters).n;
  const seen = new Set();
  for (const ch of chapters) if (ch.n <= cur) ch.tables.forEach(t => seen.add(t));
  return seen;
}

let erdLoaded = false;
async function renderErd(newTables = []) {
  if (!erdLoaded) { $("erd").innerHTML = await (await fetch("schema.svg")).text(); erdLoaded = true; }
  const vis = visibleTables(data.chapters, state);
  for (const g of $("erd").querySelectorAll("g.table")) {
    const t = g.dataset.table;
    g.classList.toggle("hidden", !vis.has(t));
    g.classList.toggle("reveal", newTables.includes(t));
  }
  for (const p of $("erd").querySelectorAll("path.fk")) {
    const from = p.dataset.from.split(".")[0], to = p.dataset.to;
    p.classList.toggle("hidden", !(vis.has(from) && vis.has(to)));
  }
  if (newTables.length) {
    const s = document.createElement("div"); s.className = "stamp"; s.textContent = "NEW EVIDENCE";
    $("erd").appendChild(s); setTimeout(() => s.remove(), 2500);
  }
}

function afterSolve(ch, event) {
  renderBoard(); renderChapter();
  const newTables = [...visibleTables(data.chapters, state)].filter(t => !visBefore.has(t));
  renderErd(newTables);
  if (event === "solve") {
    award(detectBadges(ctx({ event: "solve", chapter: ch.n }), state.badges));
    if (ch.n === 8) {
      award(detectBadges(ctx({ event: "part1", chapter: ch.n }), state.badges));
      const p1 = partStats(state, 1, 8);
      $("reply").textContent += " Rank: " + rank(p1.queries, p1.hints);
    }
    if (ch.n === 12) award(detectBadges(ctx({ event: "part2", chapter: ch.n }), state.badges));
  } else if (event === "code") {
    award(detectBadges(ctx({ event: "code" }), state.badges));
  }
}
function afterWrong(norm) {
  award(detectBadges(ctx({ event: "answer", norm }), state.badges));
}

async function boot() {
  data = await (await fetch("chapters.json")).json();
  const debugChapter = Number(new URLSearchParams(location.search).get("chapter"));
  if (debugChapter >= 1 && debugChapter <= 12) {
    noPersist = true;
    state = freshState();
    for (let n = 1; n < debugChapter; n++) { state.solved.push(n); state.answers[n] = "(debug)"; }
    if (debugChapter > 8) state.part2 = true;
  } else {
    state = load();
  }
  await loadDb();
  $("status").textContent = "The archives are open.";
  $("btn-investigate").disabled = false;
  $("btn-investigate").onclick = () => { $("landing").hidden = true; renderChapter(); renderErd(); };
  if (state.solved.length || debugChapter) { $("landing").hidden = true; renderChapter(); renderErd(); }
  $("btn-back").onclick = backToInvestigation;
  $("masthead-chapter").onclick = e => {
    e.stopPropagation();
    const menu = $("chapter-menu");
    if (!menu.hidden) { menu.hidden = true; return; }
    menu.innerHTML = ['<div class="chapter-menu-item" data-n="0">Current</div>']
      .concat(state.solved.map(n => '<div class="chapter-menu-item" data-n="' + n + '">' + ROMAN[n] + "</div>")).join("");
    menu.querySelectorAll(".chapter-menu-item").forEach(el => el.onclick = () => {
      const n = Number(el.dataset.n);
      if (n === 0) backToInvestigation(); else reviewChapter(n);
      menu.hidden = true;
    });
    menu.hidden = false;
  };
  document.addEventListener("click", () => { $("chapter-menu").hidden = true; });
  $("btn-run").onclick = runQuery;
  $("sql").addEventListener("keydown", e => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); runQuery(); }
    else if (e.key === "Tab") {
      e.preventDefault();
      const el = e.target, s = el.selectionStart, en = el.selectionEnd;
      el.value = el.value.slice(0, s) + "\t" + el.value.slice(en);
      el.selectionStart = el.selectionEnd = s + 1;
    } else if (e.key === "Enter") {
      e.preventDefault();
      const el = e.target, s = el.selectionStart, en = el.selectionEnd;
      const lineStart = el.value.lastIndexOf("\n", s - 1) + 1;
      const indent = el.value.slice(lineStart, s).match(/^[ \t]*/)[0];
      el.value = el.value.slice(0, s) + "\n" + indent + el.value.slice(en);
      el.selectionStart = el.selectionEnd = s + 1 + indent.length;
    }
  });
  renderHistory();
  $("btn-answer").onclick = submitAnswer;
  $("answer").addEventListener("keydown", e => { if (e.key === "Enter") submitAnswer(); });
  renderBoard();
  $("btn-erd").onclick = () => {
    const large = $("erd").classList.toggle("large");
    $("btn-erd").textContent = large ? "Close" : "Enlarge";
  };
  $("notes").value = state.notes;
  $("notes").oninput = () => { state.notes = $("notes").value; save(state); };
  $("btn-reset").onclick = () => { if (confirm("Start a new investigation? Progress, notes and badges are erased.")) { state = freshState(); save(state); location.reload(); } };
  $("btn-print").onclick = () => {
    if (!state.names) { state.names = prompt("Names for the certificate (both of you):") || ""; save(state); }
    renderCertificate();
    window.print();
  };
  if (location.search.includes("selftest")) {
    let failures = 0;
    for (const [raw, want] of data.normalise_fixture) {
      const got = normalise(raw);
      if (got !== want) { failures++; console.error("normalise mismatch", raw, "got", got, "want", want); }
    }
    const personCount = db.exec("SELECT COUNT(*) FROM person")[0].values[0][0];
    if (!(personCount > 5000)) { failures++; console.error("person table has only " + personCount + " rows"); }
    const version = db.exec("SELECT sqlite_version()")[0].values[0][0];
    $("status").textContent = failures
      ? "SELFTEST FAILED: " + failures + " (see console)"
      : "SELFTEST OK: " + data.normalise_fixture.length + " normalisation cases, SQLite " + version;
  }
}

if (typeof document !== "undefined") boot();
