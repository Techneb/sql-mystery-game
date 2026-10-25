import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { strictCheck, STRICT_SECTIONS } from "./site/strict.js";
import { strictHtml } from "./site/terminal.js";
import { themeButtonHtml, erdButtonHtml } from "./site/ui.js";
import { colourBlock, colourPage, bakerySchema, plainSql, sideMenuPage, buildPages, sitemapXml, READING, CHAPTERS } from "./colour_learn.mjs";
import { execFileSync } from "node:child_process";
import { sameResult, sameValue, checkOptions, tablesNamed, startLevel, levelPick } from "./site/learn/exercises.js";

const data = JSON.parse(fs.readFileSync("site/chapters.json", "utf8"));
// The Clerk's Handbook (site/learn/): colour_learn.mjs writes its menu row, pagers, side menus and index list from
// CHAPTERS; the masthead nav and footer are repeated by hand, so these pin them.
const LEARN = "site/learn/";
const learnPages = fs.readdirSync(LEARN).filter((f) => f.endsWith(".html")).sort();
const learnHtml = Object.fromEntries(learnPages.map((f) => [f, fs.readFileSync(LEARN + f, "utf8")]));
// the index lists its pages in three groups (chapters, exercises, grammar), in reading order
// Reading order (the pagers): the chapters list, then the exercises card, then grammar; checked against colour_learn.mjs READING.
const tocGroups = learnHtml["index.html"].match(/<div class="toc-groups">([\s\S]*?)<\/div><!-- \/toc-groups -->/)[1];
const tocLinks = (html) => [...html.matchAll(/<a (?:class="toc-card" )?href="([^"]+)"/g)].map((m) => m[1]);
const chapterLinks = tocLinks(tocGroups.match(/<ol class="toc">([\s\S]*?)<\/ol>/)[1]);
const readingOrder = ["index.html", ...chapterLinks, ...tocLinks(tocGroups).filter((h) => !chapterLinks.includes(h))];

test("handbook: the generated blocks are fresh (node colour_learn.mjs changes nothing) and follow CHAPTERS", () => {
  assert.deepEqual(readingOrder, READING, "the index's table of contents is CHAPTERS, then exercises and grammar");
  assert.deepEqual(chapterLinks, CHAPTERS.map((c) => c[0]));
  const built = buildPages(learnHtml);
  for (const f of learnPages) assert.equal(built[f], learnHtml[f], f + ": run node colour_learn.mjs");
  // the blocks really are generated: a page whose menu, pager and side menu were emptied is rebuilt to the same bytes
  const blank = learnHtml["like.html"].replace(/(<!-- (menu|pager): colour_learn\.mjs -->\n)[\s\S]*?(<!-- \/\2 -->\n)/g, "$1$3")
    .replace(/<!-- side menu: colour_learn.mjs -->\n[\s\S]*?<!-- \/side menu -->\n/, "").replace('<main class="learn with-side">', '<main class="learn">');
  assert.notEqual(blank, learnHtml["like.html"]);
  assert.equal(buildPages({ ...learnHtml, "like.html": blank })["like.html"], learnHtml["like.html"]);
  assert.throws(() => buildPages({ ...learnHtml, "new.html": "" }), /CHAPTERS and site\/learn\/ disagree/);
  const xml = fs.readFileSync("site/sitemap.xml", "utf8");
  assert.equal(sitemapXml(xml, "today"), xml, "sitemap.xml: run node colour_learn.mjs");
  const dropped = xml.replace(/ {2}<url><loc>[^<]*\/learn\/like\.html<[^\n]*\n/, "");
  assert.ok(sitemapXml(dropped, "2099-01-01").includes("learn/like.html</loc><lastmod>2099-01-01<"), "a new page gets today's date");
});
const one = (html, re, what) => { const m = html.match(re); assert.ok(m, what); return m[1]; };
const unentity = (s) => s.replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

test("handbook: every page carries the same masthead nav and footer; the generated menu has one current item, in order", () => {
  assert.deepEqual([...readingOrder].sort(), learnPages, "the index's table of contents lists every page once");
  const nav = one(learnHtml["index.html"], /<nav class="learn-nav muted">([\s\S]*?)<\/nav>/, "index nav");
  const foot = one(learnHtml["index.html"], /<footer class="learn-foot muted">([\s\S]*?)<\/footer>/, "index footer");
  const links = (h) => [...h.matchAll(/<a href="([^"]+)"(?: title="[^"]*")?>([^<]*)<\/a>/g)].map((m) => m[2]);
  assert.deepEqual(links(nav), ["The Ritz Affair", "The Clerk's Handbook"], "the header: the game and the handbook only (owner, 2026-10-24)");
  assert.deepEqual(links(foot), ["Privacy notice", "The Clerk's Desk", "AlephB", "Contact"], "the footer: the rest, the desk included (Statistics has an id)");
  const admin = fs.readFileSync("site/admin.html", "utf8");
  assert.deepEqual(links(one(admin, /<nav class="learn-nav muted">([\s\S]*?)<\/nav>/, "admin nav")), links(nav), "the admin page's header");
  assert.deepEqual(links(one(admin, /<footer class="learn-foot muted">([\s\S]*?)<\/footer>/, "admin footer")), links(foot), "the admin page's footer");
  const desk = ["admin.html", "monitor.html", "monitor-game.html", "monitor-handbook.html", "explore.html"].map(f => [f, fs.readFileSync("site/" + f, "utf8")]);
  for (const [f, h] of desk.slice(1))
    for (const tag of [/<nav class="learn-nav muted">[\s\S]*?<\/nav>/, /<footer class="learn-foot muted">[\s\S]*?<\/footer>/, /<dialog id="passgate"[\s\S]*?<\/dialog>/])
      assert.equal(h.match(tag)[0], admin.match(tag)[0], f + " repeats the desk's " + tag.source.slice(1, 9));
  // The desk's own menu row: Setup, the three monitoring views and Pivot table, the same on the five pages but for the current marker.
  const deskMenu = (h, f) => one(h, /<\/header>\n<nav class="learn-menu">([\s\S]*?)<\/nav>/, f + " desk menu");
  const deskItems = ['<a id="setup-link" href="admin.html">Setup</a>', '<a id="monitor-link" href="monitor.html">Global</a>', '<a id="game-link" href="monitor-game.html">Game</a>',
    '<a id="handbook-link" href="monitor-handbook.html">Handbook</a>', '<a id="explore-link" href="explore.html">Pivot table</a>'];
  desk.forEach(([f, h], i) => {
    const want = deskItems.map((it, j) => (j === i ? '<span class="current" aria-current="page">' + it.match(/>([^<]*)</)[1] + "</span>" : it)).join(" &middot;\n  ");
    assert.equal(deskMenu(h, f), want, f + " menu: one current item, the others linked");
  });
  // each monitor page names its view for monitor.js; each carries the Count select beside the period buttons
  assert.deepEqual(desk.slice(1, 4).map(([, h]) => [h.match(/<body data-view="(\w+)">/)[1], /<span id="days"[^]*<label class="pick">Count <select id="count"><\/select><\/label>/.test(h)]), [["global", true], ["game", true], ["handbook", true]]);
  assert.equal((admin.match(/monitor-link/g) || []).length, 1, "the old SEASONS-row link is gone");
  const chapters = readingOrder.filter((f) => !["index.html", "exercises.html", "grammar.html"].includes(f));
  const linked = (f) => {
    const menu = one(learnHtml[f], /<nav class="learn-menu">([\s\S]*?)<\/nav>/, f + " menu");
    const cur = [...menu.matchAll(/<span class="current" aria-current="page">([^<]*)<\/span>/g)];
    assert.equal(cur.length, 1, f + ": one current item");
    assert.equal((menu.match(/class="current"/g) || []).length, chapters.includes(f) ? 2 : 1, f + ": Learning chapters is current on a learning page only");
    if (chapters.includes(f)) assert.ok(menu.includes(`<summary class="current">Learning chapters: ${cur[0][1]}</summary>`), f + " summary names the page");
    return menu.replace(cur[0][0], `<a href="${f}">${cur[0][1]}</a>`).replace(/<summary class="current">[^<]*<\/summary>/, "<summary>Learning chapters</summary>");
  };
  const ref = linked("index.html");
  assert.match(ref, /<details class="learn-chapters"><summary>Learning chapters<\/summary><ol>/, "a native disclosure, no script needed");
  const items = [...ref.matchAll(/<a href="([^"]+)">([^<]*)<\/a>/g)];
  assert.deepEqual(items.map((m) => m[1]), ["index.html", ...chapters, "exercises.html", "grammar.html"], "menu in table of contents order");
  assert.deepEqual(items.map((m) => m[2]).filter((t) => !/^\d/.test(t)), ["Index", "Exercises", "Grammar"]);
  items.slice(1, -2).forEach((m, i) => assert.ok(m[2].startsWith(`${i + 1}. `), "chapters numbered from 1: " + m[2]));
  // the game's consent banner and Statistics link, asked by handbook.js (one ritz.consent answer site-wide)
  assert.ok(foot.includes('<a href="../privacy.html">Privacy notice</a><span id="stats-link" hidden> &middot; <a href="#" id="btn-stats">Statistics</a></span>'), "the consent link in the footer");
  const banner = one(fs.readFileSync("site/index.html", "utf8"), /(<div id="consent"[\s\S]*?<\/div>)\n/, "the game's banner").replace('href="privacy.html"', 'href="../privacy.html"');
  for (const f of learnPages) {
    assert.ok(learnHtml[f].includes(banner + '\n<script type="module" src="handbook.js"></script>\n'), f + ": the game's banner, then handbook.js");
    if (f === "exercises.html") assert.ok(learnHtml[f].indexOf('src="handbook.js"') < learnHtml[f].indexOf('src="exercises.js"'), "consent set up before initAds");
    assert.equal(one(learnHtml[f], /<nav class="learn-nav muted">([\s\S]*?)<\/nav>/, f + " nav"), nav, f + " nav");
    assert.equal(one(learnHtml[f], /<footer class="learn-foot muted">([\s\S]*?)<\/footer>/, f + " footer"), foot, f + " footer");
    assert.equal(linked(f), ref, f + " menu (the current item is the page itself)");
  }
});

test("landing and privacy: the handbook's header nav under the masthead, its footer in .landing-foot", () => {
  const page = fs.readFileSync("site/index.html", "utf8");
  const labels = (h) => [...h.matchAll(/<a href="[^"]+"(?: id="[^"]+")?>([^<]*)<\/a>/g)].map((m) => m[1]);
  const nav = labels(one(learnHtml["index.html"], /<nav class="learn-nav muted">([\s\S]*?)<\/nav>/, "index nav"));
  const foot = labels(one(learnHtml["index.html"], /<footer class="learn-foot muted">([\s\S]*?)<\/footer>/, "index footer"));
  assert.deepEqual(labels(one(page, /<nav class="landing-nav muted">([\s\S]*?)<\/nav>/, "landing nav")), nav);
  const landingFoot = one(page, /<p class="muted landing-foot">([\s\S]*?)<\/p>/, "landing footer");
  assert.match(landingFoot, /<span id="stats-link" hidden> &middot; <a href="#" id="btn-stats">Statistics<\/a><\/span>/, "the consent link app.js shows and relabels");
  assert.deepEqual(labels(landingFoot), foot, "the handbook's footer, Statistics included");
  // privacy.html runs no consent code: the same header, the footer without Statistics or a link to itself
  const privacy = fs.readFileSync("site/privacy.html", "utf8");
  assert.deepEqual(labels(one(privacy, /<nav class="landing-nav muted">([\s\S]*?)<\/nav>/, "privacy nav")), nav);
  assert.deepEqual(labels(one(privacy, /<p class="muted landing-foot">([\s\S]*?)<\/p>/, "privacy footer")), foot.filter((t) => t !== "Statistics" && t !== "Privacy notice"));
});

test("Day/Night button: the game's button on every handbook page, the desk and the board, theme.js draws the game's icons", () => {
  const game = fs.readFileSync("site/index.html", "utf8");
  const btn = one(game, /\n(<button id="btn-theme"[^\n]*<\/button>)\n/, "the game's button");
  assert.equal(btn, `<button id="btn-theme" class="quiet theme-corner" title="Night edition" aria-label="Night edition">${themeButtonHtml("day")}</button>`);
  const pages = { ...learnHtml, "../admin.html": fs.readFileSync("site/admin.html", "utf8"), "../leaderboard.html": fs.readFileSync("site/leaderboard.html", "utf8"), "../monitor.html": fs.readFileSync("site/monitor.html", "utf8"), "../monitor-game.html": fs.readFileSync("site/monitor-game.html", "utf8"), "../monitor-handbook.html": fs.readFileSync("site/monitor-handbook.html", "utf8"), "../explore.html": fs.readFileSync("site/explore.html", "utf8") };
  for (const [f, html] of Object.entries(pages)) {
    assert.ok(/<body( data-view="\w+")?>\n/.test(html) && html.includes(">\n" + btn + "\n"), f + ": the same button, first in the body");
    const head = html.slice(0, html.indexOf("</head>"));
    assert.ok(head.includes(f.startsWith("../") ? '<script src="learn/theme.js"></script>' : '<script src="theme.js"></script>'), f + ": theme.js in <head>, no defer (no flash)");
  }
  const js = fs.readFileSync("site/learn/theme.js", "utf8").replace(/' \+ A \+ '/g, one(themeButtonHtml("day"), /<svg class="icon moon" ([^>]*)>/, "attrs"));
  for (const mood of ["day", "night"]) assert.ok(js.includes(one(themeButtonHtml(mood), /^(<svg[\s\S]*<\/svg>)/, mood)), mood + " icon matches ui.js");
  assert.match(js, /"ritz\.theme"/, "the game's key");
});

test("handbook: the previous/next pager follows the table of contents, links resolve, labels name the target's title", () => {
  readingOrder.forEach((f, i) => {
    const pager = one(learnHtml[f], /<nav class="learn-pager">([\s\S]*?)<\/nav>/, f + " pager");
    for (const [cls, want, word] of [["prev", readingOrder[i - 1], "Previous"], ["next", readingOrder[i + 1], "Next"]]) {
      const m = pager.match(new RegExp(`<a class="${cls}" href="([^"]+)">([^<]*)</a>`));
      if (!want) { assert.equal(m, null, `${f} has no ${cls}`); continue; }
      assert.ok(m, `${f} ${cls}`);
      assert.equal(m[1], want, `${f} ${cls} (so A's next is B exactly when B's previous is A)`);
      assert.ok(fs.existsSync(LEARN + m[1]), m[1]);
      assert.equal(m[2], `${word}: ${one(learnHtml[want], /<h1>([^<]*)<\/h1>/, want + " h1")}`, `${f} ${cls} label`);
    }
  });
});

test("handbook: sitemap lists the landing page, privacy and every learn page, and nothing missing", () => {
  const xml = fs.readFileSync("site/sitemap.xml", "utf8");
  const files = [...xml.matchAll(/<loc>https:\/\/mystery\.alephb\.uk\/([^<]*)<\/loc>/g)]
    .map((m) => (m[1] === "" || m[1].endsWith("/") ? m[1] + "index.html" : m[1]));
  assert.equal(files.length, (xml.match(/<loc>/g) || []).length, "every loc is on mystery.alephb.uk");
  for (const f of files) assert.ok(fs.existsSync("site/" + f), "sitemap entry exists: " + f);
  assert.deepEqual([...new Set(files)].sort(), ["index.html", "privacy.html", ...learnPages.map((f) => "learn/" + f)].sort());
});

test("search and previews: every indexed page has its own title, a description, a canonical at its sitemap URL, og tags and JSON-LD that parses", () => {
  const locs = [...fs.readFileSync("site/sitemap.xml", "utf8").matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);
  const titles = new Set();
  for (const loc of locs) {
    const rel = loc.replace("https://mystery.alephb.uk/", ""), f = "site/" + (rel === "" || rel.endsWith("/") ? rel + "index.html" : rel);
    const h = fs.readFileSync(f, "utf8"), meta = (re) => (h.match(re) || [])[1];
    const title = meta(/<title>([^<]+)<\/title>/);
    assert.ok(title && !titles.has(title), f + " has a unique title");
    titles.add(title);
    assert.equal(meta(/<link rel="canonical" href="([^"]+)">/), loc, f + " canonical is its sitemap URL");
    if (rel === "privacy.html") continue;
    assert.ok(meta(/<meta name="description" content="([^"]{50,})">/), f + " description");
    assert.ok(meta(/<meta property="og:title" content="([^"]+)">/), f + " og:title");
    assert.equal(meta(/<meta property="og:url" content="([^"]+)">/), loc, f + " og:url");
    assert.equal(meta(/<meta property="og:image" content="([^"]+)">/), "https://mystery.alephb.uk/landing-pillow.jpg", f + " og:image");
    assert.ok(fs.existsSync("site/landing-pillow.jpg") && h.includes('<meta name="twitter:card" content="summary_large_image">'), f + " twitter card");
    const ld = JSON.parse(meta(/<script type="application\/ld\+json">([^<]+)<\/script>/));
    assert.equal(ld["@context"], "https://schema.org", f + " JSON-LD");
  }
  for (const f of ["admin.html", "leaderboard.html", "monitor.html", "explore.html"]) assert.doesNotMatch(fs.readFileSync("site/" + f, "utf8"), /canonical|og:title/, f + " stays out of search");
});

test("handbook: no page names a game table or a cast member", () => {
  const tables = [...new Set(data.chapters.flatMap((c) => c.tables))];
  const cast = data.cast.flatMap((c) => [c.name, c.name.split(" ").pop()]);
  assert.ok(tables.length >= 13 && cast.length >= 12);
  for (const f of learnPages) {
    let text = unentity(learnHtml[f]);
    for (const c of data.chapters) text = text.split(c.title).join(" "); // chapter titles are allowed ("The Neighbouring Suite")
    for (const w of [...tables, ...cast]) assert.doesNotMatch(text, new RegExp(`\\b${w}\\b`, "i"), `${f} mentions ${w}`);
  }
});

test("handbook: every code block is already coloured by colour_learn.mjs", () => {
  let n = 0;
  for (const f of learnPages)
    for (const [, inner] of learnHtml[f].matchAll(/<pre(?: class="wrong")?><code>([\s\S]*?)<\/code><\/pre>/g)) {
      n++;
      assert.equal(colourBlock(inner), inner, `${f}: a code block is not coloured, run node colour_learn.mjs`);
    }
  assert.ok(n >= 40, "the handbook's code blocks were found");
});

test("handbook: each learning chapter's side menu lists the fourteen in order, its own sections under it", () => {
  assert.equal(chapterLinks.length, 14);
  const ids = [];
  for (const f of learnPages) {
    const h = learnHtml[f];
    assert.equal(sideMenuPage(h, f), h, f + ": run node colour_learn.mjs");
    const heads = [...h.matchAll(/<h2( id="([\w-]+)")?[^>]*>/g)];
    if (!["index.html", "exercises.html"].includes(f)) heads.forEach((m) => { assert.ok(m[2], f + ": every h2 has an id"); ids.push(m[2]); });
    const nav = h.match(/<nav class="side-menu" aria-label="Learning chapters"><ol>([\s\S]*?)<\/ol><\/nav>/);
    assert.equal(!!nav, chapterLinks.includes(f), f + ": a side menu on the learning chapters only");
    if (!nav) continue;
    assert.ok(h.includes('<main class="learn with-side">\n<!-- side menu: colour_learn.mjs -->\n'), f);
    const top = nav[1].replace(/\n    <ol>[\s\S]*?<\/ol>\n  /, "");
    const pages = [...top.matchAll(/<li(?: class="here")?>(?:<a href="([^"]+)">|<span aria-current="page">)/g)].map((m) => m[1] || f);
    assert.deepEqual(pages, chapterLinks, f + ": all fourteen, in table of contents order");
    assert.equal((top.match(/class="here"/g) || []).length, 1, f + ": one current chapter");
    assert.deepEqual([...nav[1].matchAll(/<a href="#([\w-]+)">/g)].map((m) => m[1]), heads.map((m) => m[2]), f + ": its sections are its h2s");
  }
  assert.equal(new Set(ids).size, ids.length, "h2 ids are unique across the handbook");
});

test("handbook: every example passes the strict terminal; each wrong one is refused, its refusal written by colour_learn.mjs", () => {
  const bakery = bakerySchema(learnHtml["database.html"]);
  assert.deepEqual(Object.keys(bakery).sort(), ["customer", "order_item", "orders", "product", "refund", "staff"]);
  let wrong = 0;
  for (const f of learnPages) {
    assert.equal(colourPage(learnHtml[f], bakery), learnHtml[f], f + ": run node colour_learn.mjs");
    for (const [, cls, inner] of learnHtml[f].matchAll(/<pre( class="wrong")?><code>([\s\S]*?)<\/code><\/pre>/g)) {
      const q = plainSql(inner);
      if (/^\s*CREATE TABLE/.test(q)) continue;
      if (cls) { wrong++; assert.ok(strictCheck(q, bakery), f + " wrong example refused: " + q); }
      else assert.equal(strictCheck(q, bakery), null, f + ": " + q);
    }
  }
  assert.ok(wrong >= 10);
  const page = learnHtml["grammar.html"];
  for (const [a, [f]] of Object.entries(STRICT_SECTIONS)) {
    assert.match(learnHtml[f + ".html"], new RegExp(`<h2 id="${a}"[ >]`), "section " + a + " on " + f);
    assert.ok(page.includes(f === "grammar" ? `href="#${a}"` : `href="${f}.html#${a}"`), "the grammar hub lists " + a);
  }
  assert.match(page, /follows PostgreSQL's rules/);
  assert.match(page, /<h2 id="order-of-execution">/);
  const ids = learnPages.flatMap((f) => [...learnHtml[f].matchAll(/ id="([\w-]+)"/g)].map((m) => m[1]));
  for (const a of Object.keys(STRICT_SECTIONS)) assert.equal(ids.filter((i) => i === a).length, 1, a + " is unique across the handbook");
  for (const f of learnPages)   // every in-handbook anchor link lands on an id
    for (const [, p, a] of learnHtml[f].matchAll(/href="([\w-]*\.html)?#([\w-]+)"/g))
      assert.match(learnHtml[p || f], new RegExp(` id="${a}"`), f + " links " + (p || "") + "#" + a);
  assert.ok(fs.readFileSync("site/index.html", "utf8").includes('class="dialect" href="learn/grammar.html"'), "the terminal's PostgreSQL label");
  assert.equal(strictCheck("SELECT id FROM orders WHERE day = 20260302", bakery).anchor, "types", "the page's text-against-number claim");
});

// --- The handbook's interactive exercises (site/learn/exercises.js) -------------------------------------------
// Each solution run on the bakery database by Python's sqlite3 with the terminal's semantics (generate_db.strict_conn),
// as the page runs it in sql.js, then checked the way the page checks a student's result.
const EX_RE = /<p class="exercise" id="([^"]+)"([^>]*)>[\s\S]*?Expected: (\d+) rows?\.<\/p>\n<details class="solution"><summary>Solution<\/summary>\n<pre><code>([\s\S]*?)<\/code><\/pre>\n<table class="result">([\s\S]*?)<\/table>/g;
const exercises = [...learnHtml["exercises.html"].matchAll(EX_RE)].map(([, slug, attrs, rows, code, table]) => {
  const dataset = Object.fromEntries([...attrs.matchAll(/data-(\w+)(?:="([^"]*)")?/g)].map(([, k, v]) => [k, v ?? ""]));
  const cells = (tag, tr) => [...tr.matchAll(new RegExp(`<${tag}>([^<]*)</${tag}>`, "g"))].map((m) => unentity(m[1]));
  const trs = [...table.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((m) => m[1]);
  return { slug, opts: checkOptions(dataset), rows: Number(rows), sql: plainSql(code),
    page: { columns: cells("th", trs[0]), values: trs.slice(1).map((tr) => cells("td", tr).map((v) => (v === "NULL" ? null : v))) } };
});
const exRun = JSON.parse(execFileSync("python3", ["-c", `
import sys, json, erd, generate_db as g
conn = g.strict_conn(erd.bakery_conn(open("site/learn/database.html").read()))
out = []
for q in json.load(sys.stdin):
    cur = conn.execute(g.sqlite_sql(q))
    out.append({"columns": [d[0] for d in cur.description], "values": [list(r) for r in cur.fetchall()]})
print(json.dumps(out))`], { input: JSON.stringify(exercises.map((e) => e.sql)), encoding: "utf8" }));

test("exercises: each solution's result marks its own question solved, and no other one", () => {
  assert.equal(exercises.length, 20);
  exercises.forEach((e, i) => {
    const res = exRun[i];
    assert.equal(res.values.length, e.rows, e.slug + ": the expected row count");
    assert.ok(sameResult(e.page, res, e.opts), e.slug + ": the page's printed result is the real one");
    exercises.forEach((o, j) => assert.equal(sameResult(res, exRun[j], o.opts), i === j, `${e.slug} result against ${o.slug}`));
    assert.ok(tablesNamed(e.sql, Object.keys(bakerySchema(learnHtml["database.html"]))).length >= 1, e.slug);
    const flipped = { ...res, values: [...res.values].reverse() };
    if (res.values.length > 1) assert.equal(sameResult(flipped, res, e.opts), !e.opts.ordered, e.slug + ": row order counts only when asked");
    assert.equal(sameResult({ ...res, values: res.values.slice(1) }, res, e.opts), false, e.slug + ": a missing row");
    const wider = { columns: ["x", ...res.columns].reverse(), values: res.values.map((r) => ["junk", ...r].reverse()) };
    assert.ok(sameResult(wider, res, e.opts), e.slug + ": extra columns, other order, other names");
  });
});

test("exercises: the order rule, the needed columns, the number tolerance", () => {
  assert.deepEqual(checkOptions({}), { ordered: false, need: null, tol: 1e-6 });
  assert.deepEqual(checkOptions({ ordered: "", need: "0,3", tolerance: "0.01" }), { ordered: true, need: [0, 3], tol: 0.01 });
  assert.ok(sameValue(7, "07") && sameValue(4.5, "4.50") && sameValue(21, 21.000000000000004) && sameValue(null, undefined));
  assert.ok(!sameValue(null, 0) && !sameValue("a", "A") && !sameValue(3.33, 3.32));
  assert.ok(sameValue(3.325, 3.32, 0.01) && sameValue(3.33, 3.32, 0.01) && !sameValue(3.34, 3.32, 0.01));
  const sol = { columns: ["id", "name"], values: [[4, "Croissant"], [6, "Almond croissant"]] };
  assert.ok(sameResult({ columns: ["name"], values: [["Almond croissant"], ["Croissant"]] }, sol, { need: [1] }), "only the name is asked");
  assert.ok(!sameResult({ columns: ["name"], values: [["Almond croissant"], ["Croissant"]] }, sol), "the id too, by default");
  assert.ok(sameResult(null, { columns: ["a"], values: [] }) && !sameResult(null, sol));
  assert.deepEqual(tablesNamed("SELECT 1 FROM orders o JOIN order_item oi ON 1 ORDER BY 1", ["customer", "order_item", "orders", "product"]), ["order_item", "orders"]);
});

test("exercises: every Try it link names a question; the page keeps its static content and loads its module", () => {
  const ids = exercises.map((e) => e.slug);
  for (const f of learnPages)
    for (const [, slug] of learnHtml[f].matchAll(/exercises\.html#([\w-]+)/g)) assert.ok(ids.includes(slug), f + " links " + slug);
  const page = learnHtml["exercises.html"];
  assert.equal((page.match(/<details class="solution">/g) || []).length, 20);
  assert.match(page, /<section id="workbench" class="workbench" hidden/, "the interactive part shows only once the script runs");
  assert.match(page, /<script type="module" src="exercises\.js"><\/script>/);
  assert.match(page, /class="dialect" href="grammar\.html"/, "the terminal's link to the grammar");
  assert.match(strictHtml(strictCheck("SELECT name FROM product WHERE price == 2", bakerySchema(learnHtml["database.html"])), ""), /href="select-where\.html#double-equals"/);
  assert.doesNotMatch(page + fs.readFileSync("site/learn/exercises.js", "utf8"), /[^\n -~]/, "pure ASCII");
});

test("exercises: the level shown first and the question each level button selects", () => {
  const items = [["a", "Warm-up"], ["b", "Warm-up"], ["c", "Practice"], ["d", "Challenge"], ["e", "Challenge"]].map(([slug, level]) => ({ slug, level }));
  assert.equal(startLevel(items, [], null), "Warm-up");
  assert.equal(startLevel(items, ["a", "b"], null), "Practice", "the first level with a question left");
  assert.equal(startLevel(items, [], "d"), "Challenge", "the linked question's level wins");
  assert.equal(startLevel(items, ["a", "b", "c", "d", "e"], null), "Warm-up", "all solved: the first level");
  assert.equal(levelPick(items, "Challenge", ["d"]).slug, "e", "its first unsolved question");
  assert.equal(levelPick(items, "Warm-up", ["a", "b"]).slug, "a", "all solved: its first question");
  const page = learnHtml["exercises.html"];
  const levels = [...page.matchAll(/<h2>([^<]*)<\/h2>\n<p class="exercise"/g)].map((m) => m[1]);
  assert.deepEqual(levels, ["Warm-up", "Practice", "Challenge"], "each level heading opens its questions");
  assert.match(page, /<div id="ex-static">\n<h2>Warm-up<\/h2>/, "the static questions, hidden by the script only");
  assert.match(page, /<details class="howto"><summary class="label">HOW TO USE THIS PAGE<\/summary>/, "closed by default, titled like HISTORY");
  assert.ok(page.indexOf('class="howto"') < page.indexOf('id="workbench"'), "above the workbench in the HTML, read without JavaScript");
  const js = fs.readFileSync(LEARN + "exercises.js", "utf8");
  assert.match(js, /bench\.querySelector\("\.wb-question"\)\.prepend\(howto\)/, "the script moves it above the question choice");
  assert.match(page, /<p id="ex-status" class="ex-status" aria-live="polite" hidden><\/p>/, "no empty frame");
  assert.doesNotMatch(js, /Run a query: the result is checked here|Solved\. Your result matched|Solved\. That is the answer/, "the solved mark says it alone");
  assert.match(page, /<span class="label">SCHEMA<\/span><button type="button" id="btn-erd" class="quiet" title="Enlarge the schema" aria-label="Enlarge the schema"><\/button><span class="erd-legend muted wb-legend">[\s\S]*?<\/span>\n    <\/span><\/div>/);
  assert.match(js, /erdButtonHtml\(large\)/, "the game's Enlarge/Close icon");
  assert.doesNotMatch(page, /class="in-game"/, "no In the game line on the exercises page (owner, 2026-10-20)");
  assert.match(page, /<span id="ex-solved" class="ex-solved" hidden>&#x2713; Solved<\/span>/);
  assert.match(page, /<details class="ex-history"><summary class="label">HISTORY<\/summary><ol id="history"><\/ol><\/details>/);
  // the game's ad box under the bakery schema, the house ad linking the handbook; no other handbook page has one
  const box = (h) => one(h, /(<details id="press-box"[\s\S]*?<\/details>)/, "ad box");
  assert.equal(box(page).replace(/\.\.\/handbook-ad/g, "handbook-ad").replace('href="./"', 'href="learn/" target="_blank" rel="noopener"').replace(/<!--[\s\S]*?-->\s*/g, ""),
    box(fs.readFileSync("site/index.html", "utf8")), "the same box as the game's");
  assert.ok(page.indexOf('id="press-box"') > page.indexOf("<!-- /bakery schema -->") && page.indexOf('id="press-box"') < page.indexOf('<div class="wb-terminal">'), "under the schema");
  for (const f of learnPages) if (f !== "exercises.html") assert.doesNotMatch(learnHtml[f], /press-box|adsbygoogle/, f + " carries no ad");
  assert.match(fs.readFileSync("site/privacy.html", "utf8"), /ritz\.exercises\.history/);
});
