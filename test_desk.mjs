import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { sha256 } from "./site/shared.js";
import { rank } from "./site/badges.js";
import * as shared from "./site/shared.js";
import { qrMatrix, qrSvg, dataPositions, MASKS, gfMul, gfExp } from "./site/qr.js";

// A season's rows as doGet ?season=<id> returns them; progress/finish carry Part I running totals.
const T0 = 1_000_000;
const row = (event, team, chapter, min, wrong = 0, queries = 0, elapsedMs = null) =>
  ({ timestamp: T0 + min * 60000, event, team, season: "s1", chapter, hints: 0, wrong, queries, clientAt: null, elapsedMs });
const fixture = () => {
  const r = [row("join", "Alice", "", -5), row("join", "bob", "", -4), row("join", "Carol", "", -3), row("join", "Dan", "", 2)];
  for (let n = 1; n <= 7; n++) r.push(row("progress", n === 3 ? "ALICE" : "Alice", n, n * 2, n === 2 ? 1 : 0, n * 3));
  r.push(row("finish", "Alice", 8, 20, 1, 30, 20 * 60000 + 5000));          // 20:00 + 1 wrong x 30 s, clocks agree
  for (let n = 1; n <= 7; n++) r.push(row("progress", "bob", n, n * 2 + 1, 0, n * 2));
  r.push(row("finish", "bob", 8, 19, 0, 20, 17 * 60000));                    // 19:00, browser says 17:00: flagged
  r.push(row("progress", "Carol", 1, 4, 3, 10), row("progress", "Carol", 2, 9, 3, 16));
  return r;
};

test("officialTime ranks finishers by server time plus penalty, then the others by progress", () => {
  const out = shared.officialTime(fixture(), { openedAt: T0, penalty: 30 });
  assert.deepEqual(out.map(p => [p.rank, p.team, p.finished, p.solved, p.chapter]),
    [[1, "bob", true, 8, 8], [2, "Alice", true, 8, 8], [3, "Carol", false, 2, 3], [4, "Dan", false, 0, 1]]);
  assert.equal(out[0].ms, 19 * 60000);
  assert.equal(out[1].ms, 20 * 60000 + 30000, "one wrong answer at 30 s");
  assert.deepEqual(out.map(p => p.flagged), [true, false, false, false]);
  assert.equal(out[2].queries, 16);
  const harsh = shared.officialTime(fixture(), { openedAt: T0, penalty: 0 });
  assert.equal(harsh[1].ms, 20 * 60000, "no penalty, the server interval alone");
  assert.deepEqual(shared.officialTime([], { openedAt: T0, penalty: 10 }), []);
});

test("officialTime and chapterSummary: a negative interval (an old Date row) is flagged, elapsedMs stands in", () => {
  const rows = [row("join", "Gus", "", -500), row("progress", "Gus", 1, -480, 0, 3, 120000), row("finish", "Gus", 8, -400, 1, 9, 600000)];
  const [g] = shared.officialTime(rows, { openedAt: T0, penalty: 30 });
  assert.equal(g.ms, 600000 + 30000, "elapsedMs plus the penalty, never a negative time");
  assert.equal(g.flagged, true);
  const s = shared.chapterSummary(rows, { openedAt: T0 });
  assert.deepEqual([s[0].solvers, s[0].minutes, s[7].minutes], [1, 2, 10]);
  const [h] = shared.officialTime([row("finish", "Hal", 8, -400, 0, 9, null)], { openedAt: T0 });
  assert.ok(h.flagged, "no elapsedMs: still flagged");
});

test("officialTime: unfinished players tie on the row that solved their highest chapter, retries harmless", () => {
  // Carol and Dan both solved chapter 2; Carol first. Carol then sends a late duplicate of chapter 1 (a retry).
  const rows = [row("join", "Carol", "", -3), row("join", "Dan", "", -2),
    row("progress", "Carol", 1, 1), row("progress", "Dan", 1, 2), row("progress", "Carol", 2, 3), row("progress", "Dan", 2, 4),
    row("progress", "Carol", 1, 9)];
  assert.deepEqual(shared.officialTime(rows, { openedAt: T0 }).map(p => p.team), ["Carol", "Dan"]);
  // Nobody solved anything: the join row decides.
  assert.deepEqual(shared.officialTime([row("join", "Eve", "", 1), row("join", "Fay", "", 0)], { openedAt: T0 }).map(p => p.team), ["Fay", "Eve"]);
});

test("chapterSummary: solvers and medians per chapter, per-chapter queries and wrong from running totals", () => {
  const s = shared.chapterSummary(fixture(), { openedAt: T0, penalty: 30 });
  assert.equal(s.length, 8);
  assert.deepEqual(s[0], { chapter: 1, solvers: 3, minutes: 3, queries: 3, wrong: 0 });   // 2/3/4 min; 3/2/10 q; 0/0/3 wrong
  assert.deepEqual(s[1], { chapter: 2, solvers: 3, minutes: 5, queries: 3, wrong: 0 });   // 4/5/9; 3/2/6; 1/0/0
  assert.deepEqual(s[7], { chapter: 8, solvers: 2, minutes: 19.5, queries: 7.5, wrong: 0.5 });   // 9 and 6 queries
  assert.deepEqual(shared.chapterSummary([], { openedAt: T0 })[3], { chapter: 4, solvers: 0, minutes: null, queries: null, wrong: null });
});

const qrRows = (m) => m.map((r) => r.map((d) => (d ? "1" : "0")).join(""));

test("qrMatrix: HELLO WORLD at M is a version 1 code (21 x 21) with a finder in three corners", () => {
  const m = qrMatrix("HELLO WORLD", "M"), rows = qrRows(m);
  assert.equal(m.length, 21);
  for (const r of m) assert.equal(r.length, 21);
  const finder = ["1111111", "1000001", "1011101", "1011101", "1011101", "1000001", "1111111"];
  for (const [r0, c0] of [[0, 0], [0, 14], [14, 0]])
    finder.forEach((line, i) => assert.equal(rows[r0 + i].slice(c0, c0 + 7), line, `finder at ${r0},${c0} row ${i}`));
  assert.equal(qrMatrix("x".repeat(150), "M").length, 8 * 4 + 17, "a 150-byte link takes version 8 at M");
  assert.equal(qrMatrix("x".repeat(300), "M").length, 13 * 4 + 17, "versions above 10 work (13-M holds 331 bytes)");
  assert.throws(() => qrMatrix("x", "X"));
});

// Reference obtained independently with the Python library `qrcode` 8.x (Lincoln Loop), a separate
// implementation: QRCode(error_correction=ERROR_CORRECT_M, border=0) fed QRData(b"mystery.alephb.uk",
// mode=MODE_8BIT_BYTE), make(fit=True), get_matrix(). Version 2 (one alignment pattern), its own mask choice.
// The same comparison was run offline over 54 strings, versions 2 to 37, all four levels, masks forced,
// and every automatic choice decoded back with zxing-cpp.
test("qrMatrix matches an independent encoder's matrix for a fixed input", () => {
  const ref = [
    "1111111010100101001111111", "1000001010010100101000001", "1011101001001001101011101",
    "1011101011110010001011101", "1011101000010011101011101", "1000001001100100001000001",
    "1111111010101010101111111", "0000000010101000100000000", "1011011101111100001001011",
    "0000110111101110100101010", "0001001011010100001111100", "0110100001111001000101110",
    "1111001100001010011010100", "0000010111111011011111001", "0101111100010100110110110",
    "1000110110110010011110011", "0001111011001010111110101", "0000000010000010100011101",
    "1111111011100110101010011", "1000001011110111100011000", "1011101001000110111111000",
    "1011101011000001011011011", "1011101010100010101010110", "1000001001011110000001100",
    "1111111010010000001010111",
  ];
  assert.deepEqual(qrRows(qrMatrix("mystery.alephb.uk", "M")), ref);
});

test("qrMatrix invariants: format bits decode, Reed-Solomon syndromes vanish, data re-reads to the text", () => {
  const text = "HELLO WORLD", m = qrMatrix(text, "M");
  // Format information, first copy: column 8 rows 0-5, 7, 8, then row 8 columns 7, 5..0 (bit 0 first).
  const cells = [[0, 8], [1, 8], [2, 8], [3, 8], [4, 8], [5, 8], [7, 8], [8, 8], [8, 7], [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0]];
  const fmt = cells.reduce((v, [r, c], i) => v | (m[r][c] ? 1 << i : 0), 0);
  const second = [...Array(8)].map((_, i) => [8, 20 - i]).concat([...Array(7)].map((_, i) => [14 + i, 8]));
  assert.equal(second.reduce((v, [r, c], i) => v | (m[r][c] ? 1 << i : 0), 0), fmt, "both copies agree");
  // Unmasked by 0x5412, the 15 bits are a BCH codeword: divisible by 0x537 (polynomials over GF(2)).
  const raw = fmt ^ 0x5412;
  let rem = raw;
  for (let i = 14; i >= 10; i--) if ((rem >> i) & 1) rem ^= 0x537 << (i - 10);
  assert.equal(rem, 0, "format BCH remainder");
  assert.equal(raw >> 13, 0, "level bits 00 = M");
  const mask = (raw >> 10) & 7;
  // Unmask and read the 26 codewords back in placement order.
  const bits = dataPositions(1).map(([r, c]) => (m[r][c] !== MASKS[mask](r, c) ? 1 : 0));
  const cw = [...Array(26)].map((_, i) => bits.slice(i * 8, i * 8 + 8).reduce((v, b) => (v << 1) | b, 0));
  // 1-M is one block: 16 data + 10 EC codewords; c(x) evaluated at a^0..a^9 must be 0.
  for (let i = 0; i < 10; i++) assert.equal(cw.reduce((acc, b) => gfMul(acc, gfExp(i)) ^ b, 0), 0, `syndrome ${i}`);
  // Mode 0100, 8-bit count, the bytes, then the 0000 terminator and 0xEC/0x11 padding.
  const s = cw.slice(0, 16).map((b) => b.toString(2).padStart(8, "0")).join("");
  assert.equal(s.slice(0, 4), "0100");
  const n = parseInt(s.slice(4, 12), 2);
  const bytes = [...Array(n)].map((_, i) => parseInt(s.slice(12 + 8 * i, 20 + 8 * i), 2));
  assert.equal(String.fromCharCode(...bytes), text);
  assert.equal(s.slice(12 + 8 * n, 16 + 8 * n), "0000");
  assert.deepEqual(cw.slice(13, 16), [0xec, 0x11, 0xec]);
});

test("qrSvg is one well-formed svg with a crisp path and the quiet zone", () => {
  const svg = qrSvg("https://mystery.alephb.uk/?season=3", { size: 300 });
  const n = qrMatrix("https://mystery.alephb.uk/?season=3").length + 8;
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" [^>]*><rect [^>]*\/><path [^>]*\/><\/svg>$/);
  assert.ok(svg.includes(`width="300" height="300" viewBox="0 0 ${n} ${n}"`));
  assert.ok(svg.includes('shape-rendering="crispEdges"'));
  assert.equal((svg.match(/<path/g) || []).length, 1);
  const xs = [...svg.matchAll(/M(\d+) (\d+)/g)].flatMap((x) => [+x[1], +x[2]]);
  assert.equal(Math.min(...xs), 4, "dark modules start after a four-module quiet zone");
  assert.equal(Math.max(...xs), n - 5, "and end four modules before the edge");
  assert.ok(qrSvg("a", { quiet: 2, dark: "#123", light: "none" }).includes('fill="#123"'));
});

// --- admin page and board: pure helpers (the DOM wiring only runs in a browser) ---
const admin = await import("./site/admin.js");
const lb = await import("./site/leaderboard.js");
const BOARD = "https://example.invalid/macros/s/PLACEHOLDER/exec";

test("admin CSV: the Sheet's columns, RFC 4180 quoting of commas, quotes and line breaks", () => {
  const csv = admin.csvText([
    { timestamp: 1, event: "join", team: 'Le "Chat", noir', season: "s1-ab", chapter: "", wrong: 0, queries: 0, clientAt: null, elapsedMs: null },
    { timestamp: 2, event: "progress", team: "two\nlines", season: "s1-ab", chapter: 1, wrong: 2, queries: 9, clientAt: 5, elapsedMs: 60000 },
  ]);
  assert.equal(csv, "timestamp,event,team,season,chapter,wrong,queries,clientAt,elapsedMs\r\n" +
    '1,join,"Le ""Chat"", noir",s1-ab,,0,0,,\r\n' + '2,progress,"two\nlines",s1-ab,1,2,9,5,60000\r\n');
  assert.equal(admin.csvText([]), admin.CSV_COLUMNS.join(",") + "\r\n");
  assert.equal(admin.csvFilename('Group A: "Tue"/2'), "Group A- -Tue-2.csv", "file-name characters become dashes, a run becomes one");
});

test("admin student link: the game URL, the season id and a readable board URL", () => {
  assert.equal(admin.studentLink("https://mystery.example/", "s123-ab", BOARD),
    "https://mystery.example/?season=s123-ab&board=https://example.invalid/macros/s/PLACEHOLDER/exec");
  const odd = admin.studentLink("http://localhost:8000/", "s1", "https://x.invalid/exec?a=1&b=2");
  assert.ok(odd.endsWith("board=https://x.invalid/exec%3Fa%3D1%26b%3D2"));
  assert.equal(new URL(odd).searchParams.get("board"), "https://x.invalid/exec?a=1&b=2", "the game reads the board URL back intact");
  assert.equal(admin.boardLink("s1", BOARD), "leaderboard.html?data=" + encodeURIComponent(BOARD) + "&season=s1");
});

test("admin seasons table: newest first, counts per season, actions by state, values escaped", () => {
  const seasons = admin.newestFirst([
    { id: "s1", name: "<b>old</b>", date: "2026-10-01", db: 1, state: "closed", createdAt: 1 },
    { id: "s2", name: "new", date: "2026-10-14", db: 2, state: "created", createdAt: 2 }]);
  assert.deepEqual(seasons.map(s => s.id), ["s2", "s1"]);
  const counts = admin.seasonCounts(fixture().map(r => ({ ...r, season: "s1" })));
  assert.deepEqual(counts, { s1: { joined: 4, finished: 2 } });
  const html = admin.seasonsTableHtml(seasons, counts, "s1");
  assert.ok(!html.includes("<b>old") && html.includes("&#60;b&#62;old"), "a name is escaped");
  const [created, closed] = html.split('<tr data-id="').slice(1);
  assert.ok(created.includes('data-act="open"') && created.includes('data-act="close"'), "a season created by mistake can be closed");
  assert.ok(!closed.includes('data-act="open"') && !closed.includes('data-act="close"') && closed.includes('data-act="csv"'));
  assert.ok(closed.startsWith('s1" class="selected"'));
  const detail = admin.detailHtml({ id: "s1", name: "x", date: "d", state: "open", penalty: 30, openedAt: T0 },
    [...fixture(), row("join", "<img src=x onerror=alert(1)>", "", 1)]);
  assert.ok(!detail.includes("<img"), "a pseudo is escaped in the detail");
  assert.ok(detail.includes("PLAYERS (5)") && detail.includes("19:00 <abbr"));
});

test("admin seasons table: action buttons are icons with a one-word caption, named by title and aria-label", () => {
  const html = admin.seasonsTableHtml([{ id: "s1", name: "x", date: "d", db: 1, state: "created", createdAt: 1 }], {}, "");
  const names = { open: "Open", close: "Close", copy: "Copy link", qr: "QR", board: "Board", csv: "Export CSV", rename: "Rename the season", delete: "Delete the season" };
  const btns = [...html.matchAll(/<button ([^>]*)>([\s\S]*?)<\/button>/g)];
  assert.deepEqual(btns.map(b => b[1].match(/data-act="(\w+)"/)[1]), Object.keys(names));
  for (const [, attrs, inner] of btns) {
    const name = names[attrs.match(/data-act="(\w+)"/)[1]];
    assert.ok(attrs.includes('title="' + name + '"') && attrs.includes('aria-label="' + name + '"'), name);
    assert.match(inner, /^<svg [^>]*aria-hidden="true"/, name + ": an svg");
    assert.match(inner, /<span class="act-word" aria-hidden="true">\w+<\/span>$/, name + ": a one-word caption under the icon");
  }
  const acts = state => [...admin.seasonsTableHtml([{ id: "s1", name: "x", date: "d", db: 1, state, createdAt: 1 }], {}, "")
    .matchAll(/data-act="(\w+)"/g)].map(m => m[1]);
  assert.ok(!acts("open").includes("delete"), "an open season cannot be deleted");
  assert.ok(["created", "open", "closed"].every(st => acts(st).includes("rename")), "every season can be renamed");
  assert.ok(acts("closed").includes("delete") && !acts("closed").includes("close"));
});

test("admin delete question: names the season and its players, suggests the CSV", () => {
  assert.equal(admin.deleteMessage("Group A", 3), 'Delete "Group A"? Its 3 players and all their rows are erased for good. ' +
    "This cannot be undone: export the CSV first if you want to keep them.");
  assert.ok(admin.deleteMessage("x", 1).includes("Its 1 player and"));
});

test("board: eight-cell strip, three states, every pseudo escaped", () => {
  assert.equal((lb.stripHtml(3).match(/<i class="on">/g) || []).length, 3);
  assert.equal((lb.stripHtml(3).match(/<i /g) || []).length, 8);
  assert.equal((lb.stripHtml(8).match(/<i class="on">/g) || []).length, 8);
  const rows = [...fixture(), row("join", "<b>Eve</b>", "", 3)];
  const meta = state => ({ id: "s1", name: "Group <A>", date: "2026-10-14", state, penalty: 30, openedAt: T0 });
  for (const st of ["created", "open", "closed"]) {
    const b = lb.boardHtml(meta(st), rows);
    assert.ok(!b.body.includes("<b>Eve") && b.body.includes("&#60;b&#62;Eve&#60;/b&#62;"), st + ": pseudo escaped");
    assert.equal(b.head, "Group &#60;A&#62;", st + ": name escaped");
  }
  const waiting = lb.boardHtml(meta("created"), rows);
  assert.ok(waiting.body.includes("Waiting for the teacher") && waiting.body.includes("5 detectives joined"));
  const open = lb.boardHtml(meta("open"), rows);
  assert.equal((open.body.match(/<tr /g) || []).length, 5);
  assert.ok(open.body.indexOf("bob") < open.body.indexOf("Alice") && open.body.indexOf("Alice") < open.body.indexOf("Carol"), "finished first, by time");
  assert.ok(open.body.includes("19:00 <abbr title=") && open.body.includes("20:30") && open.body.includes("chapter 3"));
  assert.ok(!open.body.includes("podium") && !open.dateline.includes("closed"));
  const closed = lb.boardHtml(meta("closed"), rows);
  assert.ok(closed.dateline.includes("Session closed") && closed.body.indexOf("podium") < closed.body.indexOf("ranking"));
  assert.ok(closed.body.includes('class="place-1"') && closed.body.includes('class="place-2"') && !closed.body.includes('class="place-3"'), "two finishers, two steps");
  assert.ok(lb.boardHtml(meta("open"), []).body.includes("No detective yet"));
  const nobodyDone = lb.boardHtml(meta("closed"), fixture().filter(r => r.event !== "finish"));
  assert.ok(!nobodyDone.body.includes("podium") && nobodyDone.body.includes("ranking"), "the podium shows finished players only");

});

test("admin and board pages: not in the sitemap, admin kept out of robots, pure ASCII", () => {
  assert.doesNotMatch(fs.readFileSync("site/sitemap.xml", "utf8"), /admin\.html|leaderboard\.html|monitor\.html|explore\.html/);
  assert.match(fs.readFileSync("site/robots.txt", "utf8"), /^Disallow: \/monitor\.html$/m);
  assert.match(fs.readFileSync("site/monitor.html", "utf8"), /<meta name="robots" content="noindex">/);
  assert.match(fs.readFileSync("site/robots.txt", "utf8"), /^Disallow: \/explore\.html$/m);
  assert.match(fs.readFileSync("site/explore.html", "utf8"), /<meta name="robots" content="noindex">/);
  assert.match(fs.readFileSync("site/robots.txt", "utf8"), /^Disallow: \/admin\.html$/m);
  for (const f of ["site/admin.html", "site/admin.js", "site/admin.css", "site/leaderboard.html", "site/leaderboard.js", "site/monitor.html", "site/monitor.js", "site/explore.html", "site/explore.js", "site/figures.js", "site/world.json", "site/topojson/world_110m.json", "site/monitor-game.html", "site/monitor-handbook.html"])
    assert.doesNotMatch(fs.readFileSync(f, "utf8"), /[^\n -~]/, f + " is pure ASCII");
});

const monitor = await import("./site/monitor.js");
const figures = await import("./site/figures.js");
const unesc = s => s.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n));
// Every figure a view's HTML carries (figures.js plotHtml's data-fig), parsed; their hover boxes.
const figsOf = html => [...html.matchAll(/data-fig="([^"]*)"/g)].map(m => JSON.parse(unesc(m[1])));
const hovers = html => figsOf(html).flatMap(f => f.data.flatMap(t => t.hovertext || []));
// A hover box drawn in html: its heading k and "value<TAB>label<TAB>key class" lines, written as escaped HTML text.
const hasTip = (html, k, v) => hovers(html).includes(figures.tipText(unesc(k), v.split("\n").map(l => l.split("\t").map(unesc))));
const heads = (html, k) => hovers(html).filter(h => h.startsWith("<b>" + k + "</b>")).length;
// The page's text without the figures (which legitimately hold null for a gap in a line).
const visible = html => html.replace(/ data-fig="[^"]*"/g, "");
const centres = html => figsOf(html).filter(f => f.data[0].type === "pie").map(f => f.layout.annotations[0].text);
const emptyRings = html => figsOf(html).filter(f => f.data[0].type === "pie" && f.data[0].marker.colors[0] === "var(--rule)").length;
// A panel state as the page holds it: {res: named replies}; a donut's reply is named slices, the countries' countries.
const dnP = res => ({ res: { slices: res } });
const ctP = (countries, top = null) => ({ res: { countries, top } });
test("monitor: the chapter funnel from GA rows, devices, raw data, every value escaped", () => {
  const rows = [
    { chapter: "1", event: "chapter_open", count: "(not set)", users: 474 },
    { chapter: "1", event: "chapter_queries", count: "1", users: 300 },
    { chapter: "1", event: "chapter_queries", count: "5", users: 200 },
    { chapter: "1", event: "chapter_queries", count: "20", users: 40 },
    { chapter: "1", event: "chapter_solve", count: "(not set)", users: 127 },
    { chapter: "2", event: "chapter_open", count: "(not set)", users: 120 },
    { chapter: "(not set)", event: "game_finish", count: "(not set)", users: 9 }];
  assert.deepEqual(monitor.funnel(rows), [
    { chapter: 1, opened: 474, q1: 300, q5: 200, q20: 40, solved: 127 },
    { chapter: 2, opened: 120, q1: 0, q5: 0, q20: 0, solved: 0 }]);
  const html = monitor.funnelHtml(rows);
  assert.ok(html.includes("Finished a part: 9 users") && html.includes("<summary>Raw data</summary><button") && heads(html, "Chapter I") === 1);
  assert.ok(html.includes("<td>I</td>") && html.includes("<td>II</td>") && html.includes("<th>Solve rate</th>") && html.includes('>27%<') && html.includes('>0%<'), "roman chapters, the solve rate in the raw data");
  assert.ok(html.includes("<th>Retention</th>") && html.includes('>100%<') && html.includes('>25%<'), "retention in the raw data: 120 of chapter I's 474");
  assert.ok(html.includes("Retention (right axis)") && !html.includes("Solve rate (right axis)"), "the legend names the line");
  const sr = monitor.solveRateHtml(rows);
  assert.ok(hasTip(sr, "Chapter I", "127 of 474 solved (27%)") && hasTip(sr, "Chapter II", "0 of 120 solved (0%)"), "the solve rate tooltip");
  assert.ok(sr.includes("<summary>Raw data</summary><button") && sr.includes("<td>II</td>") && sr.includes(">27%<"), "its own raw data");
  const fresh = monitor.funnelHtml(rows.filter(r => r.event !== "chapter_queries"));
  assert.ok(!fresh.includes("new event") && !fresh.includes("within about a day"), "no placeholder note: zeros are zeros (owner, 2026-10-24)");
  assert.equal(figures.ROMAN[12], "XII");
  assert.equal(figures.pct(1, 0), "-");
  const dev = monitor.donutSection("devices", dnP({ rows: [["<b>desktop", 20], ["mobile", 10]] }), "opened");
  assert.ok(visible(dev).indexOf("&#60;b&#62;desktop") < visible(dev).indexOf("mobile") && !dev.includes("<b>desktop"), "escaped, largest first");
  assert.ok(dev.includes(">67%<") && dev.includes("<th>Players who opened a chapter</th>") && hovers(dev).includes(figures.tipText("<b>desktop", [["20 players", "67%"]])), "share, raw data and tooltip follow the metric");
  assert.ok(!dev.includes("<select") && dev.includes("counts in both slices"), "no select of its own, the note follows the page's Count");
  const users = monitor.usersHtml([{ date: "20261022", users: 5 }, { date: "20261021", users: 10 }]);
  assert.ok(users.indexOf("2026-10-21") < users.indexOf("2026-10-22") && users.includes("width:100%") && users.includes("width:50%"));
  const dn = { devices: dnP({ rows: [["mobile", 1]] }), channels: dnP({ rows: [["Organic Search", 1]] }) };
  const all = monitor.statsHtml({ users: [], chapters: [], countries: [{ country: "<script>", users: 3 }] }, 640, null, dn);
  assert.ok(!all.includes("<script>") && all.includes("Organic Search") && !all.includes("CHAPTER FUNNEL"), "Global has no funnel any more");
  const full = monitor.statsHtml({ users: [{ date: "20261022", users: 5 }], chapters: rows,
    countries: [{ country: "France", users: 3 }] }, 640, { land: "M0,0Z", centroids: { France: [2, 46] } },
    { ...dn, countries: ctP({ rows: [["France", 3]], totals: [3] }), pages: { res: { Game: { totals: [5] }, Handbook: { totals: [3] }, Desk: { rows: [] }, Other: { totals: [1] }, all: { totals: [7] } } } });
  assert.equal(figsOf(full).length, 5, "users, the pages donut, map, two donuts");
  assert.ok(full.indexOf(">PAGES<") > full.indexOf("COUNTRIES") && full.includes("donuts three") && !full.includes("TOP PAGES"), "PAGES shares the donuts row, the top pages table is gone (owner, 2026-10-24)");
  assert.equal((full.match(/<summary>Raw data<\/summary><button[^>]*class="quiet csv"/g) || []).length, 5, "each with its raw data under it");
  const game = monitor.gameHtml({ chapters: rows }, 640, {});
  assert.ok(game.indexOf("CHAPTER FUNNEL") < game.indexOf(">SOLVE RATE<") && game.includes("Reading..."), "the funnel moved to Game; panels read in place");
});

test("monitor figures: the line per day (one day and none too), the funnel's dual axis, the solve rate, hover boxes", () => {
  assert.equal(figures.compact(1300), "1.3K");
  assert.equal(figures.compact(42), "42");
  const line = figures.lineFig([{ label: "2026-10-20", value: 220 }, { label: "2026-10-21", value: 680 }, { label: "2026-10-22", value: 0 }]);
  assert.deepEqual([line.data[0].x, line.data[0].y], [["2026-10-20", "2026-10-21", "2026-10-22"], [220, 680, 0]]);
  assert.equal(line.data[0].line.color, "var(--rel)", "a token, resolved at draw time");
  assert.deepEqual([line.data[1].x, line.data[1].text], [["2026-10-22"], ["0"]], "the last value labelled at its end dot");
  assert.equal(line.data[0].hovertext[1], figures.tipText("2026-10-21", [["680", "users"]]), "one box per day");
  assert.ok(line.layout.yaxis.title.text === "Users" && line.layout.hovermode === "x" && line.layout.yaxis.rangemode === "tozero");
  assert.equal(figures.tipText('a"<', [["1", "x", "c1"], ["2", "y"]]), '<b>a&#34;&#60;</b><br><span style="color:var(--c1)">\u25cf</span> <b>1</b> x<br><b>2</b> y', "escaped, a dot in the series' colour");
  const one = figures.lineFig([{ label: "2026-10-22", value: 7 }]);
  assert.deepEqual(one.data[1].y, [7], "a single day still shows its dot");
  const none = figures.lineFig([]);
  assert.ok(none.data.length === 1 && none.data[0].x.length === 0 && none.layout.yaxis.range[1] === 1, "no days: the empty frame");
  const f = [{ chapter: 1, opened: 400, q1: 300, q5: 200, q20: 40, solved: 100 }, { chapter: 2, opened: 0, q1: 0, q5: 0, q20: 0, solved: 0 }];
  const fu = figures.funnelFig(f), bars = fu.data.filter(t => t.type === "bar");
  assert.deepEqual(bars.map(t => t.marker.color), ["var(--c1)", "var(--c2)", "var(--c3)", "var(--c4)", "var(--c5)"], "the five stages in the categorical order");
  assert.deepEqual(bars.map(t => t.y[0]), [400, 300, 200, 40, 100]);
  assert.ok(bars.every(t => t.x.join() === "I,II") && fu.layout.barmode === "group", "roman numerals on x, grouped");
  const ret = fu.data.find(t => t.yaxis === "y2");
  assert.deepEqual(ret.y, [100, 0], "retention: chapter I at 100%, chapter II nobody opened at 0");
  assert.ok(ret.line.color === "var(--c6)" && fu.layout.yaxis.title.text === "Users", "the --c6 line, the left axis in users");
  const y2 = fu.layout.yaxis2;
  assert.ok(y2.overlaying === "y" && y2.side === "right" && y2.title.text === "Retention" && y2.ticktext.at(-1) === "100%" && y2.tickvals.at(-1) === 100, "the right axis, titled, 0-100%");
  assert.equal(fu.data.at(-1).hovertext[0], figures.tipText("Chapter I", [[400, "Opened", "c1"], [300, "Ran 1 query", "c2"], [200, "Ran 5", "c3"], [40, "Ran 20", "c4"], [100, "Solved", "c5"], ["100%", "retention", "c6"], ["25%", "solve rate"]]), "one box per chapter: stages, retention, solve rate");
  assert.equal(figures.retention([{ chapter: 1, opened: 200 }, { chapter: 3, opened: 50 }])({ chapter: 3, opened: 50 }), 25, "opened N over opened I");
  assert.equal(figures.retention([{ chapter: 2, opened: 9 }])({ chapter: 2, opened: 9 }), null, "no chapter I, no retention");
  const noBase = figures.funnelFig([{ chapter: 1, opened: 0, q1: 0, q5: 0, q20: 0, solved: 0 }, { chapter: 2, opened: 5, q1: 0, q5: 0, q20: 0, solved: 1 }]);
  assert.ok(noBase.data.find(t => t.yaxis === "y2").y.every(v => v === null) && noBase.data.at(-1).hovertext[1].includes("<b>-</b> retention"), "chapter I with no openers: no line, a dash in the box");
  const ss = figures.solveRateFig(f);
  assert.deepEqual(ss.data[0].y, [25, null], "25%, no dot for a chapter nobody opened");
  assert.ok(ss.layout.yaxis.title.text === "Solve rate" && ss.layout.yaxis.ticktext[2] === "50%" && ss.data.at(-1).hovertext.length === 2);
  assert.equal(ss.data.at(-1).hovertext[0], figures.tipText("Chapter I", [["100 of 400 solved (25%)"]]));
  const cb = figures.chapterBarsFig([{ chapter: 1, values: [1] }], [["users", "c1"]]), cl = figures.chapterLineFig([{ chapter: 1, values: [1] }], c => c.values[0], "Avg", () => []);
  for (const g of [ss, cb, cl]) assert.deepEqual(g.layout.margin, fu.layout.margin, "every chapter chart on one x layout, so they line up");
  assert.ok(!/NaN|undefined/.test(JSON.stringify([line, one, none, fu, noBase, ss])));
});

test("monitor donuts and map: folding, fixed colours, the empty ring, area-proportional bubbles, Plotly's world self-hosted, unknown countries listed", () => {
  const items = [7, 6, 5, 4, 3, 2, 1].map((v, i) => ({ label: "k" + i, value: v }));
  assert.deepEqual(figures.fold(items).map(i => [i.label, i.value]), [["k0", 7], ["k1", 6], ["k2", 5], ["k3", 4], ["k4", 3], ["Other", 3]]);
  assert.equal(figures.fold(items.slice(0, 6)).length, 6, "six slices are not folded");
  const d = figures.donutFig([{ label: "a", value: 1 }, { label: "b", value: 0 }, { label: "c", value: 3 }], 4, "users", "x");
  assert.deepEqual(d.data[0].marker.colors, ["var(--c1)", "var(--c2)", "var(--c3)"], "a slice keeps its colour, zeros included");
  assert.ok(d.data[0].sort === false && d.data[0].direction === "clockwise" && d.data[0].rotation === 0, "in the items' order, clockwise from 12");
  assert.ok(d.layout.annotations[0].text.includes("<b>4</b>") && d.layout.annotations[0].text.endsWith("<br>users"), "the total and its unit in the centre");
  const e = figures.donutFig([], 0, "users", "x");
  assert.ok(e.data[0].marker.colors[0] === "var(--rule)" && e.data[0].hoverinfo === "skip" && e.layout.annotations[0].text.includes("<b>0</b>"), "nothing: the empty ring, 0");
  const ch = monitor.donutSection("channels", dnP({ rows: [["Direct", 3], ["<i>x", 1]] }));
  assert.ok(ch.includes(">75%<") && ch.includes("&#60;i&#62;x") && !ch.includes("<i>x") && figsOf(ch)[0].data[0].marker.colors[1] === "var(--c2)");
  const world = JSON.parse(fs.readFileSync("site/world.json", "utf8"));
  assert.ok(fs.statSync("site/world.json").size < 100000 && !("land" in world), "the centroids only: Plotly draws the land");
  for (const n of ["United States", "India", "France", "United Kingdom", "Germany", "Brazil", "Cote d'Ivoire", "Turkiye", "Singapore"]) assert.ok(world.centroids[n], n);
  const [lon, lat] = world.centroids.France;
  assert.ok(lon > -5 && lon < 8 && lat > 42 && lat < 51, "France in western Europe");
  const topo = JSON.parse(fs.readFileSync("site/topojson/world_110m.json", "utf8"));
  assert.ok(topo.type === "Topology" && ["land", "countries", "coastlines"].every(k => k in topo.objects), "Plotly's world_110m, self-hosted (config topojsonURL)");
  assert.equal(figures.countryKey("C\u00f4te d\u2019Ivoire"), "Cote d'Ivoire");
  const m = figures.mapHtml([{ country: "C\u00f4te d\u2019Ivoire", users: 10 }, { country: "France", users: 40 }, { country: "<b>Narnia", users: 2 }], world);
  const geo = figsOf(m)[0].data[0];
  assert.ok(geo.type === "scattergeo" && geo.lon.length === 2, "two bubbles");
  assert.ok(geo.hovertext[0].startsWith("<b>France</b>") && geo.lon[0] === lon, "the biggest drawn first, the small ones on top");
  assert.ok(geo.marker.sizemode === "area" && geo.marker.size.join() === "40,10" && geo.marker.sizeref === (2 * 40) / figures.MAX_BUBBLE ** 2, "area proportional: the largest at MAX_BUBBLE px");
  assert.ok(m.includes("Not on the map: &#60;b&#62;Narnia (2)") && !m.includes("<b>Narnia"));
  const bare = figures.mapHtml([{ country: "France", users: 1 }], null);
  assert.ok(bare.includes("Raw data") && !bare.includes("data-fig"), "without the centroids, the table alone");
});

test("monitor figures: Plotly from one exact cdnjs version on the three monitor pages only, its world never from Plotly's CDN", () => {
  const pages = ["index.html", "admin.html", "explore.html", "leaderboard.html", "privacy.html", "monitor.html", "monitor-game.html", "monitor-handbook.html",
    ...fs.readdirSync("site/learn").filter(f => f.endsWith(".html")).map(f => "learn/" + f)];
  for (const p of pages) {
    const h = fs.readFileSync("site/" + p, "utf8"), tags = h.match(/<script[^>]*plotly[^>]*>/gi) || [];
    if (!p.startsWith("monitor")) { assert.equal(tags.length, 0, p + " loads no Plotly"); continue; }
    assert.equal(tags.length, 1, p);
    assert.match(tags[0], /^<script defer src="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/plotly\.js\/\d+\.\d+\.\d+\/plotly\.min\.js" integrity="sha512-[\w+/=]+" crossorigin="anonymous"/, p + ": an exact version, the full bundle, SRI");
    assert.ok(h.indexOf(tags[0]) < h.indexOf('<script type="module" src="monitor.js">'), p + ": deferred before the module, so it runs first");
  }
  const src = fs.readFileSync("site/monitor.js", "utf8");
  assert.match(src, /topojsonURL: "topojson\/"/);
  for (const f of fs.readdirSync("site").filter(f => f.endsWith(".js"))) assert.doesNotMatch(fs.readFileSync("site/" + f, "utf8"), /cdn\.plot\.ly/, f);
  assert.ok(!fs.existsSync("site/charts.js"), "the SVG renderers are gone");
});

const explore = await import("./site/explore.js");
test("explore: the request from the side panel, the pivot table sorted with GA's totals, CSV, every value escaped", () => {
  const backendSrc = fs.readFileSync("apps_script.gs", "utf8");
  const list = (name) => JSON.parse(backendSrc.match(new RegExp("var " + name + " = (\\[[\\s\\S]*?\\]);"))[1]);
  assert.deepEqual(Object.keys(explore.DIMENSIONS), list("REPORT_DIMS"), "the page offers exactly the backend's dimensions");
  assert.deepEqual(Object.keys(explore.METRICS), list("REPORT_METRICS"), "and its metrics");
  const s = { period: "30", dims: ["country", "date"], metrics: ["activeUsers"], filters: { deviceCategory: ["mobile"], browser: [] } };
  assert.deepEqual(explore.buildRequest(s), { days: 30, dimensions: ["country", "date"], metrics: ["activeUsers"], filters: { deviceCategory: ["mobile"] } });
  assert.deepEqual(explore.buildRequest({ ...s, period: "custom", start: "2026-10-01", end: "2026-10-20", filters: {} }),
    { start: "2026-10-01", end: "2026-10-20", dimensions: ["country", "date"], metrics: ["activeUsers"] });
  assert.equal(explore.buildRequest({ ...s, period: "custom", start: "" }).days, 7, "an unfinished custom range falls back to 7 days");
  assert.deepEqual(explore.valuesRequest(s, "city"), { days: 30, dimensions: ["city"], metrics: ["activeUsers"] });
  const u = new URL(explore.reportUrl("https://script.example/exec", { days: 7 }, "pass"));
  assert.deepEqual(JSON.parse(u.searchParams.get("report")), { days: 7 });
  assert.equal(u.searchParams.get("key"), "pass");
  const res = { dimensions: ["date", "country"], metrics: ["activeUsers", "averageSessionDuration"], rowCount: 5, totals: [1300, 61.25],
    rows: [["20261021", "France", 300, 50.5], ["20261020", "<b>UK", 900, 70], ["20261022", "Spain, \"north\"", 100, 12]] };
  const html = explore.pivotHtml(res);
  assert.ok(html.indexOf("&#60;b&#62;UK") > 0 && html.indexOf("&#60;b&#62;UK") < html.indexOf("France") && html.indexOf("France") < html.indexOf("Spain"), "largest first metric first");
  assert.ok(html.includes("2026-10-20") && html.includes("Active users &#9660;") && html.includes(">Avg session (s)<"));
  assert.ok(html.includes('<td colspan="2">Total (GA, each user once)</td><td class="num">1,300</td><td class="num">61.3</td>'));
  assert.ok(html.includes("Showing 3 of 5 rows"));
  assert.ok(!html.includes("<b>"));
  const byDate = explore.pivotHtml(res, { col: 0, desc: false });
  assert.ok(byDate.indexOf("2026-10-20") < byDate.indexOf("2026-10-21") && byDate.includes('aria-sort="ascending"'));
  assert.deepEqual(explore.sortRows(res, 3, false).map(r => r[3]), [12, 50.5, 70]);
  assert.equal(explore.pivotCsv(res, { col: 0, desc: true }),
    'Date,Country,Active users,Avg session (s)\r\n2026-10-22,"Spain, ""north""",100,12\r\n2026-10-21,France,300,50.5\r\n2026-10-20,<b>UK,900,70\r\n', "shared.js csvText: CRLF like the other exports");
  assert.equal(shared.csvText([["a", null, 'x "y"'], ["b\rc", 1, undefined]]), 'a,,"x ""y"""\r\n"b\rc",1,\r\n', "one CSV encoder: RFC 4180, null as empty, a bare CR quoted");
  assert.ok(explore.pivotHtml({ ...res, rows: [] }).includes("No rows"));
  const pick = explore.pickerHtml(explore.DIMENSIONS, ["country", "date"], "dim");
  assert.ok(pick.includes('data-dim="country" checked> Country<span class="ord">1</span>') && pick.includes('data-dim="date" checked> Date<span class="ord">2</span>'));
  const vals = explore.filterValuesHtml("country", [["<i>x", 3], ["France", 1200]], ["France"]);
  assert.ok(vals.includes('value="France" checked') && vals.includes("&#60;i&#62;x") && vals.includes("1,200") && !vals.includes("<i>"));
  assert.ok(!vals.includes("ms-search"), "no search box for a short list");
  const many = explore.filterValuesHtml("city", Array.from({ length: 11 }, (_, i) => ["c" + i, i]));
  assert.ok(many.startsWith('<input type="search" class="ms-search"') && many.includes('aria-label="Search City values"'), "a search box past 10 values");
});

test("explore: the dropdowns' buttons, the picked order, which filters show", () => {
  assert.equal(explore.chipsHtml(["country", "deviceCategory"], explore.DIMENSIONS, "Choose dimensions"),
    '<span class="chip"><b>1</b> Country</span> <span class="chip"><b>2</b> Device</span>');
  assert.equal(explore.chipsHtml([], explore.METRICS, "Choose metrics"), '<span class="muted">Choose metrics</span>');
  assert.ok(explore.chipsHtml(["<x>"], {}, "").includes("&#60;x&#62;") , "an unknown name is escaped");
  assert.ok(explore.filterSummary("country", 0).endsWith('<span class="ms-count">All</span>'));
  assert.ok(explore.filterSummary("country", 3).includes("Country</span> <span class=\"ms-count\">3 picked"));
  assert.deepEqual(explore.toggleOrder(["a", "b"], "c", true, 9), ["a", "b", "c"], "ticking appends");
  assert.deepEqual(explore.toggleOrder(["a", "b", "c"], "a", false, 9), ["b", "c"]);
  assert.deepEqual(explore.toggleOrder(["b", "c"], "a", true, 9), ["b", "c", "a"], "untick and tick again moves it last");
  assert.equal(explore.toggleOrder(["a", "b"], "c", true, 2), null, "refused over the limit");
  assert.deepEqual(explore.toggleOrder(["a", "b"], "a", true, 2), ["a", "b"]);
  const s = { dims: ["country", "date"], filters: { browser: ["Chrome"], city: [] } };
  assert.deepEqual(explore.filterDims(s, ["deviceCategory"]), ["country", "date", "deviceCategory", "browser"], "chosen first, then added, then still filtering");
  const add = explore.addableDims(s, ["deviceCategory"]);
  assert.ok(add.includes("city") && !add.includes("browser") && add.length === Object.keys(explore.DIMENSIONS).length - 4);
  const m = explore.msHtml("f-x", "S", "<p>P</p>", 'A "b"');
  assert.equal(m, '<details class="ms" id="f-x"><summary>S</summary><div class="ms-panel" role="group" aria-label="A &#34;b&#34;"><p>P</p></div></details>');
  assert.deepEqual(explore.buildRequest({ period: "7", dims: s.dims, metrics: ["sessions"], filters: s.filters }),
    { days: 7, dimensions: ["country", "date"], metrics: ["sessions"], filters: { browser: ["Chrome"] } }, "an emptied filter means All");
});

test("monitor: users per day broken down by a dimension, the countries' N", () => {
  for (const k of Object.keys(monitor.BREAKDOWNS)) assert.ok(k in shared.DIMENSIONS, k + " is in the report whitelist");
  assert.equal(explore.DIMENSIONS, shared.DIMENSIONS, "one whitelist");
  assert.deepEqual(monitor.breakdownRequest(30, "country"), { days: 30, dimensions: ["date", "country"], metrics: ["activeUsers"] });
  const rows = [["20261022", "France", 5], ["20261021", "France", 3], ["20261022", "<b>UK", 9],
    ...["A", "B", "C", "D", "E"].map((c, i) => ["20261021", c, i + 1])];
  const p = monitor.pivotSeries(rows, ["20261020"]);
  assert.deepEqual(p.dates, ["20261020", "20261021", "20261022"], "the total's days too");
  assert.equal(p.count, 7);
  assert.deepEqual(p.series.map(s => s.label), ["<b>UK", "France", "E", "D", "C"], "top 5 by users over the period");
  assert.deepEqual(p.series[1].values, [0, 3, 5], "a missing day counts 0");
  assert.deepEqual(p.series.map(s => s.cls), ["c1", "c2", "c3", "c4", "c5"]);
  assert.deepEqual(figures.dayTip(p.series, 1), [["5", "E", "c3"], ["4", "D", "c4"], ["3", "France", "c2"], ["3", "C", "c5"], ["0", "<b>UK", "c1"]], "largest first");
  const users = [{ date: "20261021", users: 12 }, { date: "20261022", users: 14 }];
  const html = monitor.breakdownHtml({ rows }, users, "country", 390);
  assert.ok(!html.includes("<b>UK") && html.includes("&#60;b&#62;UK"), "escaped");
  assert.ok(html.includes("Top 5 of 7 countries"), "the note");
  assert.ok(html.includes("All visitors") && figsOf(html)[0].data.filter(t => t.mode === "lines").length === 6, "five lines and the total");
  const bf = figsOf(html)[0];
  assert.ok(bf.data[0].line.color === "var(--ink)" && bf.data[0].opacity < 1 && bf.data[1].line.color === "var(--c1)", "the total in a neutral ink, then --c1..");
  assert.equal(bf.data.at(-1).hovertext.length, 2, "one box per day");
  assert.ok(bf.data.at(-1).hovertext[1].startsWith(figures.tipText("2026-10-22", [["14", "All visitors", "total"], ["9", "<b>UK", "c1"]])), "the box lists every line, largest first");
  assert.ok(html.includes("<summary>Raw data</summary><button") && html.includes("<td>2026-10-21</td>"), "date x series raw data");
  assert.ok(!monitor.breakdownHtml({ rows: rows.slice(0, 2) }, users, "country", 390).includes("Top "), "no note when every value is drawn");
  // the average per day: a dashed reference line (an option any line chart takes), the note and the raw data's footer
  assert.equal(monitor.dailyAverage([3, 0, 4]), 2.3);
  assert.equal(monitor.dailyAverage([]), null);
  assert.ok(!figures.lineFig([{ label: "2026-10-21", value: 4 }]).layout.shapes, "no reference line without the option");
  const withRef = figures.lineFig([{ label: "2026-10-21", value: 4 }], "Users", "users", { value: 2, label: "avg <2>" }).layout;
  assert.ok(withRef.shapes[0].y0 === 2 && withRef.shapes[0].y1 === 2 && withRef.shapes[0].line.dash === "dash" && withRef.annotations[0].text === "avg &#60;2&#62;", "dashed line at its value, label escaped");
  assert.equal(figures.multiLineFig(["2026-10-21"], [{ label: "a", values: [1], cls: "c1" }], "Users", { value: 1, label: "avg 1" }).layout.shapes.length, 1, "multiLineFig takes it too");
  const gap = monitor.breakdownHtml({ rows: [["20261020", "UK", 3], ["20261021", "UK", 4]] }, [{ date: "20261021", users: 12 }], "country", 390);
  assert.ok(figsOf(gap)[0].layout.annotations[0].text === "avg 6" && gap.includes("Average per day: 6 visitors") && figsOf(gap)[0].layout.shapes.length === 1, "a day without a total row counts 0; one line, for the total");
  assert.ok(gap.includes('<tfoot><tr><td>Average per day</td><td class="num">6</td><td class="num">3.5</td>'), "footer per column");
  const one = monitor.usersHtml([{ date: "20261021", users: 10 }, { date: "20261022", users: 5 }], 390);
  assert.ok(figsOf(one)[0].layout.shapes[0].y0 === 7.5 && one.includes("Average per day: 7.5") && one.includes("<td>Average per day</td><td class=\"num\">7.5</td>"), "users per day: line, note, footer");
  const s = { users, chapters: [], devices: [], countries: [{ country: "France", users: 3 }], channels: [] };
  assert.ok(monitor.statsHtml(s, 390, null).includes('<option value="" selected>None</option>'), "None by default, the single line");
  assert.ok(monitor.statsHtml(s, 390, null, {}, { dim: "country" }).includes("Reading the breakdown"), "loading in place");
  const err = monitor.statsHtml(s, 390, null, { users: { error: "<i>quota" } }, { dim: "country" });
  assert.ok(err.includes("Google Analytics said: &#60;i&#62;quota"), "GA's error, escaped");
  assert.ok(monitor.statsHtml(s, 390, null, { users: { res: { total: null, split: { rows: [["20261021", "Chrome", 4]] } } } }, { dim: "browser" }).includes('<option value="browser" selected>Browser</option>'));
  // countries: always from ?report=
  assert.ok(monitor.statsHtml(s, 390, null).includes("COUNTRIES (TOP 10)"));
  const res = { rows: [["France", 9], ["Spain", 4], ["<Narnia>", 1]] };
  assert.deepEqual(monitor.countriesFrom(res, 2), [{ country: "France", users: 9 }, { country: "Spain", users: 4 }]);
  assert.equal(monitor.countriesFrom(res, 0).length, 3, "0 = all");
  assert.deepEqual(monitor.countriesRequest(7), { days: 7, dimensions: ["country"], metrics: ["activeUsers"] });
  const all = monitor.statsHtml(s, 390, null, { countries: ctP(res) }, { top: 0 });
  assert.ok(all.includes("COUNTRIES (ALL)") && all.includes("&#60;Narnia&#62;") && !all.includes("<Narnia>"), "every row, escaped");
  const t20 = monitor.statsHtml(s, 390, null, {}, { top: 20 });
  assert.ok(t20.includes("COUNTRIES (TOP 20)") && t20.includes("Reading the countries"));
});

test("monitor donuts: each picks its metric, Visitors by default, loading and GA errors in place", () => {
  assert.deepEqual(monitor.donutRequest(7, "devices"), { days: 7, dimensions: ["deviceCategory"], metrics: ["activeUsers"] });
  assert.deepEqual(monitor.donutRequest(30, "channels", "solved"),
    { days: 30, dimensions: ["sessionDefaultChannelGroup"], metrics: ["totalUsers"], filters: { eventName: ["chapter_solve"] } });
  assert.deepEqual(monitor.donutRequest(7, "devices", "opened").filters, { eventName: ["chapter_open"] });
  assert.deepEqual(monitor.donutRequest(7, "devices", "engaged").metrics, ["engagedSessions"]);
  // every metric and dimension the donuts ask for is one ?report= accepts
  const back = fs.readFileSync("apps_script.gs", "utf8");
  for (const m of Object.values(monitor.COUNT_METRICS)) assert.ok(back.match(/var REPORT_METRICS = [^;]*/)[0].includes('"' + m.metric + '"'), m.metric);
  for (const d of [...Object.values(monitor.DONUTS).map(k => k.dim), "eventName"]) assert.ok(back.match(/var REPORT_DIMS = [^;]*/)[0].includes('"' + d + '"'), d);
  const s = { users: [], chapters: [], countries: [] };
  const html = monitor.statsHtml(s, 390, null);
  assert.ok(!html.includes('id="dn-') && !html.includes('id="count"'), "no per-donut select; the common one is in monitor.html");
  assert.ok(html.includes("Reading the devices") && html.includes("Reading the channels"), "loading in place");
  const err = monitor.statsHtml(s, 390, null, { channels: { error: "<i>quota" } }, { m: "sessions" });
  assert.ok(err.includes("Google Analytics said: &#60;i&#62;quota"), "GA's error, escaped");
  assert.ok(monitor.donutNote("channels", "sessions").includes("two channels") && monitor.donutNote("devices", "visitors").includes("more than the people"));
  assert.ok(monitor.donutSection("devices", dnP({ rows: [] })).includes("var(--rule)"), "no rows: the empty ring");
});

test("monitor: one Count select drives users per day and both donuts; the five counts compared", () => {
  assert.match(fs.readFileSync("site/monitor.html", "utf8"), /<span id="days"[^]*<label class="pick">Count <select id="count"><\/select><\/label>/, "one Count select beside the period buttons");
  assert.deepEqual(Object.values(monitor.COUNT_METRICS).map(d => d.short), ["Visitors", "Opened", "Solved", "Sessions", "Engaged", "Views"]);
  assert.deepEqual(monitor.countRequest(7, ["date"], "opened"), { days: 7, dimensions: ["date"], metrics: ["totalUsers"], filters: { eventName: ["chapter_open"] } });
  assert.deepEqual(monitor.breakdownRequest(30, "browser", "sessions"), { days: 30, dimensions: ["date", "browser"], metrics: ["sessions"] });
  const s = { users: [{ date: "20261022", users: 5 }], chapters: [], countries: [] };
  // users per day: Visitors draws ?stats' users at once, any other count waits for its [date] report
  assert.equal(figsOf(monitor.statsHtml(s, 390, null))[0].layout.yaxis.title.text, "Visitors", "the axis title is the count");
  assert.ok(monitor.statsHtml(s, 390, null, {}, { m: "sessions" }).includes("Reading the days"));
  const ses = monitor.statsHtml(s, 390, null, { users: { res: { total: { rows: [["20261021", 30], ["20261022", 40]] } } } }, { m: "sessions" });
  assert.ok(figsOf(ses)[0].layout.yaxis.title.text === "Sessions" && hasTip(ses, "2026-10-22", "40\tsessions") && ses.includes("<th>Sessions</th>"), "axis, tooltip and raw data follow the count");
  const bdh = monitor.statsHtml(s, 390, null, { users: { res: { total: { rows: [["20261022", 9]] }, split: { rows: [["20261022", "France", 4]] } } } }, { m: "opened", dim: "country" });
  assert.ok(bdh.includes("All players") && figsOf(bdh)[0].layout.yaxis.title.text === "Players who opened a chapter", "the breakdown's total and axis too");
  const dn = { devices: dnP({ rows: [["mobile", 3]] }) };
  assert.ok(monitor.statsHtml(s, 390, null, dn, { m: "engaged" }).includes("3 sessions") && monitor.statsHtml(s, 390, null, dn, { m: "engaged" }).includes("Counts engaged sessions"), "the donuts follow the same count");
  // the comparison
  assert.deepEqual(monitor.compareRequests(7, "country").map(([m, q]) => [m, q.metrics[0], q.dimensions[0]]),
    [["visitors", "activeUsers", "country"], ["opened", "totalUsers", "country"], ["solved", "totalUsers", "country"], ["sessions", "sessions", "country"], ["engaged", "engagedSessions", "country"], ["views", "screenPageViews", "country"]]);
  const res = { visitors: { rows: [["desktop", 60], ["mobile", 30]] }, opened: { rows: [["desktop", 20], ["mobile", 25]] }, solved: { rows: [["mobile", 5]] },
    sessions: { rows: [["desktop", 90], ["mobile", 40], ["<b>tablet", 2]] }, engaged: { rows: [["desktop", 50]] } };
  const st = monitor.stackData(res);
  assert.deepEqual(st.segs, ["desktop", "mobile", "<b>tablet"], "one order for every bar, by the sum over the bars");
  assert.deepEqual(st.bars.map(b => [b.m, b.values, b.total]), [["visitors", [60, 30, 0], 90], ["opened", [20, 25, 0], 45], ["solved", [0, 5, 0], 5], ["sessions", [90, 40, 2], 132], ["engaged", [50, 0, 0], 50], ["views", [0, 0, 0], 0]]);
  assert.ok(monitor.donutNote("devices", "views").includes("each page view sits in one slice") && monitor.statsHtml(s, 390, null, dn, { m: "views" }).includes("3 page views"), "page views: own unit, no overlap");
  const many = monitor.stackData({ visitors: { rows: ["a", "b", "c", "d", "e", "f", "g"].map((c, i) => [c, 10 - i]) } });
  assert.deepEqual(many.segs, ["a", "b", "c", "d", "e", "Other"]);
  assert.deepEqual(many.bars[0].values, [10, 9, 8, 7, 6, 9], "past six, the rest folds into Other");
  assert.equal(many.bars[1].total, 0, "a metric with no rows is an empty bar");
  const gf = figures.groupFig(st);
  assert.deepEqual(gf.data.map(t => t.marker.color), ["var(--c1)", "var(--c2)", "var(--c3)"], "one trace per segment, in the segments' order");
  assert.ok(gf.layout.barmode === "group" && gf.data[0].x.join() === "Visitors,Opened,Solved,Sessions,Engaged,Views" && gf.layout.yaxis.title.text === "Count", "grouped, short names below, the axis titled");
  assert.equal(gf.data[1].hovertext[1], figures.tipText("Players who opened a chapter", [["25", "mobile", "c2"], ["56%", "of the total"]]), "box: metric, segment, value, share of the total");
  assert.deepEqual(gf.layout.annotations.map(a => a.text), ["<b>90</b>", "<b>45</b>", "<b>5</b>", "<b>132</b>", "<b>50</b>", "<b>0</b>"], "GA's total once over each group");
  assert.ok(gf.data[2].hovertext[3].includes("&#60;b&#62;tablet") && !/NaN|undefined/.test(JSON.stringify(gf)));
  const sec = monitor.compareSection({ res }, "country", 390);
  assert.ok(sec.includes("COUNT METRICS COMPARED") && sec.includes('<option value="country" selected>Country</option>') && sec.includes("do not share a unit"), "label, select, note");
  assert.ok(sec.includes('<i class="c3"></i>&#60;b&#62;tablet') && sec.includes("<td>Sessions</td>") && sec.includes('<td class="num">132</td>'), "legend and the metric x segment raw data");
  assert.ok(monitor.compareSection({}, undefined, 390).includes('<option value="sessionDefaultChannelGroup" selected>Channel</option>') && monitor.compareSection({}, undefined, 390).includes("Reading the five counts"), "Channel by default, loading in place");
  assert.ok(monitor.compareSection({ error: "<i>x" }, undefined, 390).includes("&#60;i&#62;x"));
  for (const d of Object.keys(monitor.STACKS)) assert.ok(fs.readFileSync("apps_script.gs", "utf8").match(/var REPORT_DIMS = [^;]*/)[0].includes('"' + d + '"'), d);
});

test("monitor countries follow the Count: units, labels, the overlap note, GA's totals for the top N and for all", () => {
  assert.deepEqual(monitor.countriesRequest(30, "solved"), { days: 30, dimensions: ["country"], metrics: ["totalUsers"], filters: { eventName: ["chapter_solve"] } });
  assert.deepEqual(monitor.countriesRequest(7, "sessions"), { days: 7, dimensions: ["country"], metrics: ["sessions"] });
  assert.deepEqual(monitor.countriesRequest(7, "ran", monitor.LEARN).filters, { eventName: ["exercise_run"], pagePath: { beginsWith: ["/learn/"] } }, "scoped");
  const world = JSON.parse(fs.readFileSync("site/world.json", "utf8"));
  const s = { users: [], chapters: [], countries: [{ country: "France", users: 3 }] };
  assert.ok(monitor.countriesSection(world, {}, 10, "visitors").includes("Reading the countries"), "Visitors too reads ?report=");
  const vis = monitor.countriesSection(world, ctP({ rows: [["France", 3]], totals: [3] }), 10, "visitors");
  assert.ok(vis.includes("3 visitors") && vis.includes('aria-label="Visitors by country"') && vis.includes("<th>Visitors</th>") && vis.includes("in two countries counts in both bubbles"), "Visitors");
  assert.ok(vis.includes("<p>The one country: 3 visitors.</p>") && vis.includes("<tfoot><tr><td>All countries (GA&#39;s total)</td><td class=\"num\">3</td>"), "every country shown: GA's total alone");
  // the Top cuts the list: GA's own total for the top N (a country filter), its share of GA's total for all
  const big = { rows: [["France", 900], ["Spain", 300], ["Italy", 2]], totals: [1100] }, req = monitor.countriesRequest(7, "solved", monitor.LEARN);
  assert.deepEqual(monitor.topTotalRequest(req, big, 2), { days: 7, dimensions: [], metrics: ["totalUsers"],
    filters: { eventName: ["chapter_solve"], pagePath: { beginsWith: ["/learn/"] }, country: ["France", "Spain"] } }, "the top N as a filter, the Count's own");
  assert.equal(monitor.topTotalRequest(req, big, 3), null, "nothing cut, no request");
  assert.equal(monitor.topTotalRequest(req, big, 0), null, "All, no request");
  const cut = monitor.countriesSection(world, ctP(big, { rows: [[1050]], totals: [1050] }), 2, "solved");
  assert.ok(cut.includes("<p>Top 2: 1,050 players, 95% of 1,100 in all 3 countries.</p>"), "GA's numbers, never the rows' sum (1,200)");
  assert.ok(cut.includes("<td>Top 2 (GA&#39;s total)</td><td class=\"num\">1050</td>") && cut.includes("<td>All countries (GA&#39;s total)</td><td class=\"num\">1100</td>"), "both totals in the raw data");
  assert.ok(monitor.countriesSection(world, ctP(big), 2, "solved").includes("Top 2: reading GA&#39;s total..."), "reading in place");
  const ses = monitor.countriesSection(world, ctP({ rows: [["France", 12], ["Spain", 4]] }), 10, "sessions");
  assert.ok(ses.includes("12 sessions") && ses.includes("<th>Sessions</th>") && ses.includes('aria-label="Sessions by country"') && !ses.includes(" users"), "units follow");
  assert.ok(ses.includes(monitor.overlapNote("in two countries", "sessions", "bubbles").slice(0, 30)) && ses.includes("one person&#39;s sessions"), "the donuts' note");
  assert.ok(monitor.statsHtml(s, 390, world, {}, { m: "opened", top: 10 }).includes("Reading the countries"), "statsHtml passes the Count");
});

test("a missing GA value reads (empty), never null or undefined", () => {
  const bad = /\bnull\b|\bundefined\b/;
  const map = figures.mapHtml([{ country: null, users: 2 }, { country: undefined, users: 1 }], null);
  assert.ok(map.includes("(empty)") && !bad.test(map), "map raw data");
  const dn = monitor.donutSection("devices", dnP({ rows: [[null, 3], ["mobile", 1]] }));
  assert.ok(dn.includes("(empty)") && !bad.test(dn), "donut");
  const st = monitor.compareSection({ res: { visitors: { rows: [[null, 2]] } } }, "country", 390);
  assert.ok(st.includes("(empty)") && !bad.test(visible(st)) && !bad.test(hovers(st).join()), "grouped bars");
  assert.equal(monitor.pivotSeries([["20261021", null, 2]]).series[0].label, "(empty)");
  const res = { dimensions: ["date", "country"], metrics: ["activeUsers"], rowCount: 1, totals: null, rows: [["20261021", null, null]] };
  const pv = explore.pivotHtml(res);
  assert.ok(pv.includes("(empty)") && !bad.test(pv), "pivot");
  assert.ok(!bad.test(explore.pivotCsv(res)), "CSV");
});

test("monitor donuts: the centre is GA's own total, so both donuts agree on the visitors", () => {
  const rows = [["desktop", "70"], ["mobile", "40"]];
  const withTotal = monitor.donutSection("devices", dnP({ rows, totals: [100] }), "visitors");
  assert.ok(centres(withTotal)[0].includes("<b>100</b>") && withTotal.includes("the slices add up to 110"), "GA's 100 in the centre, the 110 explained");
  assert.ok(withTotal.includes("70%"), "shares of the people, not of the slices");
  const noTotal = monitor.donutSection("devices", dnP({ rows }), "visitors");
  assert.ok(centres(noTotal)[0].includes("<b>110</b>") && !noTotal.includes("the slices add up to 110"), "without GA's total, the sum and no note");
});

test("monitor raw data: an Export CSV button beside every Raw data toggle, and the CSV quoting", () => {
  const html = monitor.donutSection("devices", dnP({ rows: [["desktop", "7"]], totals: [7] }), "visitors");
  assert.ok(/<summary>Raw data<\/summary><button type="button" class="quiet csv" data-csv="devices">Export CSV<\/button>/.test(html));
  assert.equal(figures.tableCsv([["Country", "Visitors"], ["Korea, South", " 3 "], ['A "b"', "1"]]),
    'Country,Visitors\r\n"Korea, South",3\r\n"A ""b""",1\r\n');
});

test("monitor views: every panel request is one ?report= accepts, the exercises match exercises.html, the new pages are kept out of search like monitor.html", () => {
  const back = fs.readFileSync("apps_script.gs", "utf8"), list = n => JSON.parse(back.match(new RegExp("var " + n + " = (\\[[^;]*\\]);"))[1]);
  const dims = list("REPORT_DIMS"), mets = list("REPORT_METRICS");
  const asked = (view, p, c) => p.requests ? Object.values(p.requests(c)).filter(Boolean) : [monitor.countriesRequest(c.days, c.m, c.scope)];
  for (const [view, panels] of Object.entries(monitor.PANELS)) for (const [id, p] of Object.entries(panels)) for (const q of asked(view, p, monitor.context(view, { m: "opened", dim: "country", stack: "country" }))) {
    for (const d of q.dimensions) assert.ok(dims.includes(d), view + "." + id + " " + d);
    for (const m of q.metrics) assert.ok(mets.includes(m), view + "." + id + " " + m);
    for (const d of Object.keys(q.filters || {})) assert.ok(dims.includes(d), view + "." + id + " filter " + d);
    assert.ok(q.dimensions.length <= 9 && q.metrics.length <= 10);
  }
  const page = fs.readFileSync("site/learn/exercises.html", "utf8");
  const found = [...page.matchAll(/<p class="exercise" id="([^"]+)"[^>]*><b>(\d+\. [^<]*?)\.?<\/b>/g)].map(m => [m[1], m[2]]);
  assert.deepEqual(monitor.EXERCISES, found, "slugs and titles in the page's order");
  assert.deepEqual(monitor.SECTIONS.map(s => s[0]), ["Game", "Handbook", "Desk", "Other"]);
  const robots = fs.readFileSync("site/robots.txt", "utf8");
  for (const f of ["monitor-game.html", "monitor-handbook.html"]) {
    const h = fs.readFileSync("site/" + f, "utf8");
    assert.match(robots, new RegExp("^Disallow: /" + f.replace(".", "\\.") + "$", "m"));
    assert.match(h, /<meta name="robots" content="noindex">/);
    assert.doesNotMatch(h, /[^\n -~]/, f + " is pure ASCII");
    assert.ok(monitor.DESK_PATHS.includes("/" + f));
  }
  assert.doesNotMatch(fs.readFileSync("site/sitemap.xml", "utf8"), /monitor-/);
});

test("monitor charts for the new events: GA's numbers only, empty frames and zero grids, every value escaped", () => {
  const bad = /NaN|undefined|null/;
  // empty replies: the frame, zeros on the grids, no placeholder note
  const empty = { rows: [] };
  // every panel of a view loaded with empty replies, under their names (the countries' load: its two replies)
  const emptyPanels = (view, c = {}) => Object.fromEntries(Object.entries(monitor.PANELS[view]).map(([id, p]) => [id, { res: p.load ? { countries: empty, top: null }
    : Object.fromEntries(Object.entries(p.requests(monitor.context(view, c))).map(([k, q]) => [k, q && empty])) }]));
  const g = monitor.gameHtml(null, 390, emptyPanels("game"));
  assert.ok(!bad.test(visible(g)) && !bad.test(hovers(g).join()) && !g.includes("No data yet") && !g.includes("within about a day") && !g.includes("Nothing in this period"));
  assert.ok(g.includes("LEFT AN UNSOLVED CHAPTER") && g.includes("AVERAGE TIME BEFORE LEAVING") && g.includes("AVERAGE QUERIES BEFORE LEAVING") && g.includes("WRONG ANSWERS AND HINTS"));
  assert.equal(heads(g, "Chapter XII"), 5, "chapters I-XII on the leave bars, its two average lines, wrong answers and hints, solve route");
  assert.ok(g.includes("SOLVE ROUTE") && hasTip(g, "Unknown table", "0\terrors\tc2\n0\tusers") && g.includes("<td>Curly quotes</td>"), "the route grid and every error type at zero");
  assert.ok(hasTip(g, "Suspects opened", "0\tusers\tc3\n0\tuses"), "known features listed at zero");
  // Google's ads: their own chart beside FEATURE USE (owner, 2026-10-25), clicks and impressions, GA's totals, zero frame
  const adsKey = "Google&#39;s ads on these pages";
  assert.ok(g.includes("GOOGLE ADS") && hasTip(g, adsKey, "0\tclicks\tc3\n0\timpressions\tc5") && !heads(g, "Ad clicks (Google)"), "Google's ads at zero, out of the features");
  const fu = monitor.featuresHtml({ features: { rows: [["ad_house_click", 4, 5]] } }, 390, monitor.HANDBOOK_FEATURES);
  assert.ok(hasTip(fu, "House ad clicked", "4\tusers\tc3\n5\tuses") && !fu.includes("Ad clicks") && !fu.includes("impressions"), "users only");
  const ads = monitor.adsHtml({ ads: { rows: [[7, 300]], totals: [9, 310] } }, 390, "handbook-google-ads");
  assert.ok(hasTip(ads, adsKey, "9\tclicks\tc3\n310\timpressions\tc5") && ads.includes('<td>Ad clicks (Google)</td><td class="num">9</td>') && ads.includes('<td>Ad impressions (Google)</td><td class="num">310</td>'), "GA's own totals, raw data");
  assert.ok(/<summary>Raw data<\/summary><button[^>]*data-csv="handbook-google-ads"/.test(ads) && ads.includes('<i class="c5"></i>impressions'), "Export CSV and a legend");
  assert.ok(figsOf(monitor.adsHtml({ ads: empty }, 390))[0].data[0].x.join() === "0" && !bad.test(visible(monitor.adsHtml({ ads: empty }, 390))), "no reply rows: the zero frame");
  assert.equal(monitor.ctr(9, 310), "2.90%");
  assert.equal(monitor.ctr(3, 0), "-", "no impressions, no rate");
  assert.ok(ads.includes("CTR): <b>2.90%</b>") && ads.includes('<td>Click-through rate (clicks / impressions)</td><td class="num">2.90%</td>') && figsOf(ads)[0].data.filter(t => t.type === "bar").length === 2 && !hovers(ads).join().includes("%"), "CTR as a stat line and in raw data, never a bar");
  assert.ok(monitor.adsHtml({ ads: empty }, 390).includes("CTR): <b>-</b>"), "a dash without impressions");
  const wideG = monitor.gameHtml(null, 1000, emptyPanels("game"));
  assert.ok(wideG.includes('<div class="side-pair"><div>') && wideG.indexOf("FEATURE USE") < wideG.indexOf("GOOGLE ADS") && !g.includes('class="side-pair"'), "side by side when wide, stacked at 390 px");
  assert.equal(emptyRings(g), 3, "the failure kind and both mode donuts: empty rings");
  assert.ok(g.indexOf("USERS PER DAY") < g.indexOf("CHAPTER FUNNEL") && g.includes('<option value="customEvent:mode">Mode</option>') && !g.includes('value="pageTitle"'), "users per day first, the game's breakdowns");
  const h = monitor.handbookHtml(390, emptyPanels("handbook", { m: "ran" }), { m: "ran" });
  assert.ok(!bad.test(visible(h)) && heads(h, "20. Word of mouth") === 2 && h.includes("<td>1. The cheap shelf</td>"), "every exercise at zero");
  assert.ok(h.includes('value="pageTitle"') && !h.includes('value="customEvent:mode"') && figsOf(h)[0].layout.yaxis.title.text === "Readers who ran an exercise", "the handbook's breakdowns and Count");
  assert.equal(emptyRings(h), 5, "pages, devices, channels, level and outcome donuts: empty rings");
  // Global's layout on /learn/: the countries map, then PAGES, devices and channels on one row, all following the Count
  assert.ok(h.indexOf("USERS PER DAY") < h.indexOf("COUNTRIES (TOP 10)") && h.indexOf("COUNTRIES (TOP 10)") < h.indexOf('<div class="donuts three"><div>') &&
    h.indexOf('<div class="donuts three"><div>') < h.indexOf(">PAGES<") && h.indexOf("CHANNELS") < h.indexOf("EXERCISES"), "users, countries, the three donuts, then the exercises");
  assert.ok(h.includes("Counts the users who ran an exercise: a person on two devices"), "the donuts' overlap note follows the Count");
  for (const k of ["devices", "channels"]) {
    assert.ok(monitor.PANELS.handbook[k].deps.includes("m") && monitor.PANELS.global[k].deps.includes("m"), k + " follows the Count");
    assert.deepEqual(monitor.PANELS.handbook[k].requests(monitor.context("handbook", { m: "ran" })).slices.filters, { eventName: ["exercise_run"], pagePath: { beginsWith: ["/learn/"] } }, k + " on /learn/");
  }
  const hc = monitor.handbookHtml(390, { devices: dnP({ rows: [["mobile", 3]], totals: [2] }), countries: ctP({ rows: [["France", 4], ["Spain", 3], ["Italy", 1]] }) }, { m: "visitors", top: 5 });
  assert.ok(hc.includes("COUNTRIES (TOP 5)") && hc.includes("<td>Italy</td>") && centres(hc).some(t => t.includes("<b>2</b>")) && hc.includes("Reading the channels"), "every country from GA, sliced by Top; GA's total in the centre; reading in place");
  const hb0 = figures.hbarFig([], [["x", "c1"]], 390);
  assert.ok(hb0.data.length === 1 && hb0.data[0].x.length === 0 && hb0.layout.height > 0, "no rows: the empty frame");
  const hb = figures.hbarFig([{ label: "b", values: [0, 5] }, { label: "a", values: [3, 0] }], [["s1", "c3"], ["s2", "c5"]], 390);
  assert.deepEqual(hb.data.slice(0, 2).map(t => [t.marker.color, t.text]), [["var(--c3)", ["0", "3"]], ["var(--c5)", ["5", "0"]]], "zeros listed, a value at every bar's end");
  assert.deepEqual(hb.layout.annotations.map(a => a.text), ["b", "a"], "rows in the given order, labels above the bars");
  // the leave block reads GA's averages as they come, labelled as averages, no dot where nobody left
  const leave = monitor.leaveHtml({ leave: { rows: [["2", 7, 95.25, 4.5], ["(not set)", 1, 1, 1]] } }, 640);
  assert.ok(leave.includes('<td>II</td><td class="num">7</td><td class="num">95.3</td><td class="num">4.5</td>') && leave.includes('<td>III</td><td class="num">0</td><td class="num">-</td>'));
  assert.ok(hasTip(leave, "Chapter II", "7\tusers who left\tc1\n95.3 s\tavg seconds\n4.5\tavg queries") && leave.includes("an average, not a median") && figsOf(leave)[1].layout.yaxis.title.text === "Avg seconds");
  assert.equal(figsOf(leave).slice(1).flatMap(f => f.data[0].y.filter(v => v !== null)).length, 2, "one dot per average line, chapter II only");
  // failures: the kind as a donut of GA's totals, bars from the [rule] reply, never summed from the split
  const fails = monitor.failsHtml({ rule: { rows: [["<b>group-by", 12, 5]] }, split: { rows: [["group-by", "refused", "3", 7, 3], ["group-by", "refused", "4", 5, 4]] }, type: { rows: [["syntax", 9, 4], ["weird", 1, 1]] }, kind: { rows: [["refused", 12], ["error", 4]], totals: [16] } }, 390);
  assert.ok(hasTip(fails, "Syntax", "9\terrors\tc2\n4\tusers") && fails.includes('<td>Unknown column</td><td class="num">0</td><td class="num">0</td>') &&
    fails.indexOf("<td>Other</td>") < fails.indexOf("<td>weird</td>"), "error types in a fixed order, zeros listed, GA's other values after");
  assert.ok(hasTip(fails, "&#60;b&#62;group-by", "12\tfailures\tc6\n5\tusers") && fails.includes("<td>III</td>") && !fails.includes("<b>group"));
  assert.ok(fails.indexOf("SQLite error") < fails.indexOf("Refused by") && hasTip(fails, "Refused by the grammar check", "12 failures\t75%"), "kinds in a fixed order and colour");
  const hf = monitor.failsHtml({ rule: empty, split: empty, type: empty, kind: null }, 390, "Exercise", "exercise-failures");
  assert.ok(!hf.includes("BY KIND") && hf.includes("SQLITE ERRORS BY TYPE") && hf.includes("<td>Syntax</td>"), "the handbook's failures: by type, no kind donut");
  const routes = monitor.routesHtml({ routes: { rows: [["3", "unseen", 2], ["3", "same_result", 7], ["(not set)", "found", 1]] } }, 390);
  assert.ok(hasTip(routes, "Chapter III", "7\tSame result as the solution\tc3\n0\tAnswer seen in a result\tc1\n2\tAnswer never on screen\tc6") &&
    routes.includes('<td>III</td><td class="num">7</td><td class="num">0</td><td class="num">2</td>') && routes.includes("Data starts 2026-10-25"), "users per route per chapter, GA's rows");
  const plain = monitor.failsHtml({ rule: { rows: [["", 4, 2]] }, split: { rows: [["", "error", "1", 4, 2]] } }, 390);
  assert.ok(heads(plain, "SQL error") === 1 && plain.includes("<td>SQL error</td>") && !plain.includes("(empty)"), "an empty rule reads SQL error");
  // chapter I onboarding: every step GA's own count in the steps' order, zeros listed, the share of Investigate in raw data
  const ob = monitor.onboardingHtml({ begin: { rows: [[20]] }, features: { rows: [["tour_done", 6], ["prologue_skip", 4]] }, ran: { totals: [15] }, solved: { rows: [] } }, 390);
  assert.ok(ob.includes('<td>Pressed Investigate</td><td class="num">20</td><td class="num">100%</td>') && ob.includes('<td>Prologue skipped</td><td class="num">4</td><td class="num">20%</td>'));
  assert.ok(ob.includes('<td>Prologue finished</td><td class="num">0</td>') && ob.includes('<td>Ran a first query in chapter I</td><td class="num">15</td><td class="num">75%</td>') && ob.includes('<td>Solved chapter I</td><td class="num">0</td>'));
  assert.ok(ob.indexOf("Prologue finished") < ob.indexOf("Tour skipped") && ob.includes("start 2026-10-25") && !bad.test(visible(ob)));
  assert.ok(g.includes("CHAPTER I ONBOARDING") && g.indexOf("CHAPTER I ONBOARDING") < g.indexOf("CHAPTER FUNNEL"), "onboarding on the game page, empty frame");
  // by device: desktop, mobile, tablet in that order whatever GA's order, a missing device reads 0, the share per device
  const od = monitor.onboardingDevicesHtml({ begin: { rows: [["mobile", 10], ["desktop", 30]], totals: [39] }, byDevice: { rows: [["prologue_skip", "mobile", 6], ["prologue_skip", "desktop", 3]] },
    ran: { rows: [["desktop", 24]] }, solved: { rows: [] } }, 390);
  assert.ok(od.includes('<th class="num">Desktop</th>') && od.indexOf('<th class="num">Desktop</th>') < od.indexOf('<th class="num">Mobile</th>') && od.indexOf('<th class="num">Mobile</th>') < od.indexOf('<th class="num">Tablet</th>'));
  assert.ok(od.includes('<td>Pressed Investigate</td><td class="num">30</td><td class="num">100%</td><td class="num">10</td><td class="num">100%</td><td class="num">0</td><td class="num">-</td>'));
  assert.ok(od.includes('<td>Prologue skipped</td><td class="num">3</td><td class="num">10%</td><td class="num">6</td><td class="num">60%</td><td class="num">0</td>') &&
    od.includes('<td>Ran a first query in chapter I</td><td class="num">24</td><td class="num">80%</td><td class="num">0</td>') && od.includes('<td>Solved chapter I</td><td class="num">0</td>'));
  assert.ok(hovers(od).some(t => t.includes("<b>60%</b> of Mobile Investigate pressers")) && od.includes("Export CSV"));
  const od0 = monitor.onboardingDevicesHtml({ begin: { rows: [] }, byDevice: { rows: [] }, ran: { rows: [] }, solved: { rows: [] } }, 390);
  assert.ok(od0.includes("<td>Tour finished</td>") && od0.includes('<th class="num">Tablet</th>') && ob.includes("BY DEVICE"), "the empty frame, and under the all-devices bars");
  assert.equal(monitor.onboardingHtml({ begin: { rows: [["desktop", 30], ["mobile", 10]], totals: [39] }, features: empty, byDevice: empty, ran: empty, solved: empty }, 390)
    .includes('<td>Pressed Investigate</td><td class="num">39</td>'), true, "the all-devices bar is GA's total, never the devices added");
  assert.deepEqual(monitor.PANELS.game.onboarding.requests(monitor.context("game")).byDevice.dimensions, ["customEvent:feature", "deviceCategory"]);
  // shares by network: the share box's buttons in its order, zeros listed, presses in the tooltip
  const nets = [...new Set([...fs.readFileSync("site/endings.js", "utf8").matchAll(/data-net="(\w+)"/g)].map(m => m[1]))];
  assert.deepEqual(Object.keys(monitor.NETWORKS), nets, "NETWORKS = the share box's data-net values");
  assert.deepEqual(monitor.PANELS.game.shares.requests(monitor.context("game")).shares, { days: 7, dimensions: ["customEvent:network"], metrics: ["totalUsers", "eventCount"], filters: { eventName: ["feature_use"], "customEvent:feature": ["share"] } });
  const sh = monitor.sharesHtml({ shares: { rows: [["x", 3, 5]] } }, 390), sh0 = monitor.sharesHtml({ shares: { rows: [] } }, 390);
  assert.ok(sh.includes('<td>X</td><td class="num">3</td><td class="num">5</td>') && sh.includes('<td>Copy link</td><td class="num">0</td>') && sh.includes("starts 2026-10-25"));
  assert.ok(sh0.includes('<td>LinkedIn</td><td class="num">0</td>') && sh0.includes("Export CSV") && g.includes("SHARES BY NETWORK"));
  assert.deepEqual(monitor.PANELS.game.onboarding.requests(monitor.context("game")).ran.filters,{ eventName: ["chapter_queries"], "customEvent:chapter": ["1"], "customEvent:count": ["1"], "customEvent:mode": ["learn"] });
  const wrong = monitor.wrongHintsHtml({ wrong: { rows: [["1", "1", 9], ["1", "3", 2]] }, hints: { rows: [["1", 4, 6]] } }, 390);
  assert.ok(hasTip(wrong, "Chapter I", "9\t1st wrong answer\tc1\n2\t3rd wrong answer\tc2\n4\topened the hint\tc4\n6\thint opens") && wrong.includes("<td>XII</td>") && wrong.includes('<td>I</td><td class="num">9</td><td class="num">2</td><td class="num">4</td><td class="num">6</td>'));
  const modes = monitor.modesHtml({ opened: { rows: [["compete", 3], ["learn", 6]], totals: [8] }, begun: { rows: [["learn", 6], ["compete", 3]], totals: [8] }, seen: { rows: [[20]] } });
  assert.ok(modes.includes("8 of the 20 visitors on the game page (40%)") && modes.includes('<td>All (GA&#39;s total)</td><td class="num">8</td>') && centres(modes).every(t => t.includes("<b>8</b>")), "GA's total (8), not 6 + 3");
  assert.ok(modes.indexOf('<i class="c1"></i><span>Learn') > 0 && modes.includes('<i class="c2"></i><span>Compete'), "learn and compete keep their colour whatever the order");
  assert.equal(monitor.gaTotal({ rows: [[20]] }), 20);
  assert.equal(monitor.gaTotal({ rows: [["a", 1], ["b", 2]] }), 0, "no total without GA's");
  const ex = monitor.exercisesHtml({ ran: { rows: [["busy-hours", 10]] }, outcomes: { rows: [["busy-hours", "ok", 4], ["busy-hours", "refused", 7]] }, solved: { rows: [["busy-hours", 4, 3.333]] } }, 390);
  assert.ok(ex.includes('<td>9. Busy hours</td><td class="num">10</td><td class="num">4</td><td class="num">40%</td><td class="num">3.3</td><td class="num">4</td><td class="num">0</td><td class="num">7</td>'));
  assert.ok(ex.indexOf("1. The cheap shelf") < ex.indexOf("9. Busy hours") && ex.indexOf("9. Busy hours") < ex.indexOf("20. Word of mouth"), "the page's order");
  // handbook pages: a donut by title, the suffix dropped, top 5 + Other named as a sum in raw data, GA's total in the centre
  const titles = ["<i>LIKE -- The Ritz Affair", "B", "C", "D", "E", "F", "G"].map((t, i) => [t, 10 - i]);
  const pages = monitor.handbookPagesHtml({ rows: titles, totals: [30] }, "visitors");
  assert.ok(pages.includes("&#60;i&#62;LIKE</span>") && !pages.includes("<i>LIKE") && !pages.includes("Ritz Affair"));
  assert.ok(pages.includes("<td>Other (sum of 2 rows)</td><td class=\"num\">9</td>") && centres(pages)[0].includes("<b>30</b>") && pages.includes("the slices add up to 49"));
  assert.deepEqual(monitor.PANELS.handbook.pages.requests(monitor.context("handbook", { m: "ran" })).pages, { days: 7, dimensions: ["pageTitle"], metrics: ["totalUsers"], filters: { eventName: ["exercise_run"], pagePath: { beginsWith: ["/learn/"] } } });
  const ch = monitor.choicesHtml({ levels: { rows: [["challenge", 2, 5], ["warm-up", 4, 9]], totals: [5] }, outcomes: { rows: [["ok", 7], ["refused", 2]], totals: [9] } });
  assert.ok(ch.indexOf("Warm-up") < ch.indexOf("Practice") && ch.includes("9 Warm-up, 0 Practice, 5 Challenge presses") && hasTip(ch, "Ran", "7 runs\t78%"));
  // Global's PAGES: a donut over the four sections, GA's unfiltered total in the centre, the overlap said
  const sec = monitor.pagesSection({ res: { Game: { totals: [5] }, Handbook: { totals: [3] }, Desk: { rows: [] }, Other: { totals: [1] }, all: { totals: [7] } } }, "visitors");
  assert.ok(figsOf(sec)[0].data[0].type === "pie" && sec.includes('<div class="donut">') && sec.includes('<i class="c3"></i><span>Desk</span><b class="num">0</b>') && sec.includes('<td>Handbook</td><td class="num">3</td>'));
  assert.ok(centres(sec)[0].includes("<b>7</b>") && sec.includes("the slices add up to 9") && sec.includes("both the game and the handbook") && sec.includes("<td>All (GA&#39;s total)</td><td class=\"num\">7</td>"));
  assert.deepEqual(monitor.sectionRequests(7, "opened")[1], { days: 7, dimensions: [], metrics: ["totalUsers"], filters: { eventName: ["chapter_open"], pagePath: { beginsWith: ["/learn/"] } } });
  assert.deepEqual(monitor.sectionRequests(7, "opened")[4], { days: 7, dimensions: [], metrics: ["totalUsers"], filters: { eventName: ["chapter_open"] } }, "the total is requested unfiltered");
  assert.ok(!("topPagesHtml" in monitor) && !("topPages" in monitor.PANELS.global), "the top pages table is gone");
  // the views' users per day are scoped to their pages
  assert.deepEqual(monitor.breakdownRequest(7, "pageTitle", "visitors", monitor.SCOPES.handbook).filters, { pagePath: { beginsWith: ["/learn/"] } });
  assert.deepEqual(monitor.breakdownRequest(7, "deviceCategory", "solved", monitor.SCOPES.game).filters, { eventName: ["chapter_solve"], pagePath: ["/", "/index.html"] });
  for (const v of ["game", "handbook"]) for (const k of monitor.VIEW_COUNTS[v]) assert.ok(monitor.metricOf(k).label, v + " " + k);
  assert.ok(monitor.panel("X", { error: "<q>" }, () => "").includes("&#60;q&#62;") && monitor.panel("X", null, () => "").includes("Reading..."));
  // the compared groups print GA's total over each group when the reply has one
  const st = monitor.stackData({ visitors: { rows: [["desktop", 6], ["mobile", 5]], totals: [9] } });
  assert.deepEqual([st.bars[0].sum, st.bars[0].total], [11, 9]);
  assert.equal(figures.groupFig(st).layout.annotations[0].text, "<b>9</b>");
  const cb = figures.chapterBarsFig(monitor.chapterGrid({ rows: [["3", 4]] }), [["users", "c1"]]);
  assert.deepEqual(cb.data[0].y, [0, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0], "the I-XII grid, zeros where GA has nothing");
  assert.equal(cb.data[0].x.at(-1), "XII");
});

test("monitor panels: each view's panels cover everything its renderer reads; one loader keyed on deps", () => {
  // every panel loaded (empty replies under their names): no section still reads "Reading", so no renderer reads a
  // panel its view lacks; a view missing one of its panels shows that panel reading.
  const empty = { rows: [] }, s = { users: [], chapters: [] };
  const full = (view, c = {}) => Object.fromEntries(Object.entries(monitor.PANELS[view]).map(([id, p]) => [id, { res: p.load ? { countries: empty, top: null }
    : Object.fromEntries(Object.entries(p.requests(monitor.context(view, c))).map(([k, q]) => [k, q && empty])) }]));
  for (const view of Object.keys(monitor.PANELS)) {
    // a breakdown chosen, so users per day waits for its panel even where ?stats has the visitors
    const c = monitor.context(view, { dim: "country" }), P = full(view, c), html = monitor.VIEWS[view].html(s, 640, P, c, null);
    assert.ok(!html.includes("Reading"), view + ": every section drawn");
    for (const id of Object.keys(P)) {
      const less = { ...P }; delete less[id];
      assert.ok(monitor.VIEWS[view].html(s, 640, less, c, null).includes("Reading"), view + "." + id + " is read by the view");
    }
    for (const p of Object.values(monitor.PANELS[view])) assert.ok(Array.isArray(p.deps) && (typeof p.requests === "function" || typeof p.load === "function"));
  }
  // users per day on Global with Visitors asks nothing: ?stats' users draw it
  assert.deepEqual(monitor.PANELS.global.users.requests(monitor.context("global")), { total: null, split: null });
  assert.ok(monitor.PANELS.game.users.requests(monitor.context("game")).total.filters.pagePath, "the game's own pages");
  assert.deepEqual(Object.keys(monitor.PANELS.global.pages.requests(monitor.context("global"))), ["Game", "Handbook", "Desk", "Other", "all"]);
  assert.equal(monitor.PANELS.handbook.fails.requests(monitor.context("handbook")).kind, null, "the handbook asks no kind");
});

test("desk: ?board= is stored and leaves the address bar, links stay bare unless storage is blocked; a stale passphrase is dropped", async () => {
  const mem = () => { const m = {}; return { m, getItem: k => m[k] ?? null, setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; } }; };
  const hist = { state: null, url: null, replaceState(s, t, u) { this.url = u; } };
  const s = mem(), board = "https://x.invalid/macros/s/ID/exec";
  assert.deepEqual(shared.deskBoard({ href: "http://h/monitor.html?board=" + encodeURIComponent(board) + "&n=1#top" }, s, hist), { board, stored: true });
  assert.equal(s.m[shared.BOARD_KEY], board);
  assert.equal(hist.url, "/monitor.html?n=1#top", "board gone, other params and the hash kept");
  hist.url = null;
  assert.deepEqual(shared.deskBoard({ href: "http://h/explore.html" }, s, hist), { board, stored: true }, "read back from storage");
  assert.equal(hist.url, null, "nothing to strip");
  const blocked = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
  assert.deepEqual(shared.deskBoard({ href: "http://h/admin.html?board=" + encodeURIComponent(board) }, blocked, hist), { board, stored: false });
  assert.equal(hist.url, null, "kept in the address bar when it could not be stored");
  const a = { getAttribute: () => "monitor-game.html", href: "" };
  shared.deskLinks(board, true, [a]); assert.equal(a.href, "monitor-game.html");
  shared.deskLinks(board, false, [a]); assert.equal(a.href, "monitor-game.html?board=" + encodeURIComponent(board));
  // a stored passphrase that does not match the hash is dropped and the gate opens
  const ss = mem(); ss.setItem(shared.DESK_KEY, "not the passphrase");
  let shown = 0;
  const d = { querySelector: () => ({ textContent: "", value: "" }), showModal: () => { shown++; } };
  const p = shared.deskPassphrase(d, ss);
  for (const end = Date.now() + 3000; !shown && Date.now() < end;) await new Promise(r => setTimeout(r, 10));   // sha256 is async: wait for the gate, not a fixed 50 ms (flaky under CI load)
  assert.equal(shown, 1); assert.equal(ss.getItem(shared.DESK_KEY), null);
  d.returnValue = "cancel"; d.onclose();
  assert.equal(await p, "");
});

test("desk type: the five desk pages get Nunito through admin.css; the game, the handbook, the board and privacy keep the 1912 faces", () => {
  const css = fs.readFileSync("site/admin.css", "utf8");
  const faces = [...css.matchAll(/@font-face \{[^}]*font-family: "([^"]+)";[^}]*font-display: swap; src: url\((fonts\/[^)]+\.woff2)\)/g)];
  assert.deepEqual(faces.map((m) => m[1]).sort(), ["Nunito", "Nunito", "Nunito Sans", "Nunito Sans"]);
  for (const m of faces) assert.ok(fs.existsSync("site/" + m[2]), m[2] + " is self-hosted");
  assert.ok(fs.existsSync("site/fonts/OFL.txt"), "the OFL licence ships with the fonts");
  assert.match(css, /body, body \*:not\(code, pre\) \{ font-family: "Nunito Sans"[^}]*!important/);
  for (const f of ["admin.html", "monitor.html", "monitor-game.html", "monitor-handbook.html", "explore.html"]) {
    const h = fs.readFileSync("site/" + f, "utf8");
    assert.match(h, /<link rel="stylesheet" href="admin\.css">/, f + " loads admin.css");
    assert.doesNotMatch(h, /fonts\.googleapis/, f + " no longer asks Google Fonts for the 1912 faces");
  }
  for (const f of ["index.html", "leaderboard.html", "privacy.html", ...fs.readdirSync("site/learn").filter((f) => f.endsWith(".html")).sort().map((f) => "learn/" + f)]) {
    const h = fs.readFileSync("site/" + f, "utf8");
    assert.doesNotMatch(h, /admin\.css|Nunito/, f + " keeps its own type");
    assert.match(h, /fonts\.googleapis\.com\/css2\?family=Playfair\+Display/, f + " still loads the 1912 faces");
  }
  for (const f of ["site/style.css", "site/learn/learn.css"]) assert.doesNotMatch(fs.readFileSync(f, "utf8"), /Nunito/, f + " stays 1912");
});
