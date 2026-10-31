import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { strictCheck, STRICT_SECTIONS } from "./site/strict.js";
import { strictHtml } from "./site/terminal.js";
import { themeButtonHtml, erdButtonHtml, feedbackButtonHtml } from "./site/ui.js";
import { colourBlock, colourPage, bakerySchema, plainSql, sideMenuPage, buildPages, sitemapXml, READING, CHAPTERS } from "./colour_learn.mjs";
import { execFileSync } from "node:child_process";
import { sameResult, sameValue, checkOptions, tablesNamed, startLevel, levelPick } from "./site/learn/exercises.js";
import path from "node:path";
import { publishFiles, bridgeFiles, bridgeTarget, bridgeHtml, ADSENSE_META, OLD, GAME, HOME } from "./publish.mjs";
import { versionText } from "./version_site.mjs";
import { readImport, importWrites } from "./site/state.js";

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
  const xml = fs.readFileSync("site/learn/sitemap.xml", "utf8");
  assert.equal(sitemapXml(xml, "today"), xml, "learn/sitemap.xml: run node colour_learn.mjs");
  const dropped = xml.replace(/ {2}<url><loc>[^<]*\/learn\/like\.html<[^\n]*\n/, "");
  assert.ok(sitemapXml(dropped, "2099-01-01").includes("learn/like.html</loc><lastmod>2099-01-01<"), "a new page gets today's date");
});
const one = (html, re, what) => { const m = html.match(re); assert.ok(m, what); return m[1]; };
// the header nav's two items, a link or the current section's span, and the current one alone
const navItems = (h) => [...h.matchAll(/<(?:a href="[^"]+"|span class="current" aria-current="page")(?: title="[^"]*")?>([^<]*)<\/(?:a|span)>/g)].map((m) => m[1]);
const navCurrent = (h) => [...h.matchAll(/<span class="current" aria-current="page"(?: title="[^"]*")?>([^<]*)<\/span>/g)].map((m) => m[1]);
const unentity = (s) => s.replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

test("handbook: every page carries the same masthead nav and footer; the generated menu has one current item, in order", () => {
  assert.deepEqual([...readingOrder].sort(), learnPages, "the index's table of contents lists every page once");
  const nav = one(learnHtml["index.html"], /<nav class="learn-nav muted">([\s\S]*?)<\/nav>/, "index nav");
  const foot = one(learnHtml["index.html"], /<footer class="learn-foot muted">([\s\S]*?)<\/footer>/, "index footer");
  const links = (h) => [...h.matchAll(/<a href="([^"]+)"(?: title="[^"]*")?>([^<]*)<\/a>/g)].map((m) => m[2]);
  assert.deepEqual(navItems(nav), ["The Ritz Affair", "The Clerk's Handbook"], "the header: the game and the handbook only (owner, 2026-10-24)");
  assert.deepEqual(navCurrent(nav), ["The Clerk's Handbook"], "the handbook's section in colour, a span (owner, 2026-10-26)");
  assert.deepEqual(links(foot), ["Privacy notice", "The Clerk's Desk", "AlephB", "Contact"], "the footer: the rest, the desk included (Statistics has an id)");
  const admin = fs.readFileSync("site/admin.html", "utf8");
  const adminNav = one(admin, /<nav class="learn-nav muted">([\s\S]*?)<\/nav>/, "admin nav");
  assert.deepEqual(navItems(adminNav), navItems(nav), "the admin page's header");
  assert.deepEqual(navCurrent(adminNav), [], "the desk is neither section");
  assert.deepEqual(links(one(admin, /<footer class="learn-foot muted">([\s\S]*?)<\/footer>/, "admin footer")), links(foot), "the admin page's footer");
  const desk = ["admin.html", "monitor.html", "monitor-game.html", "monitor-handbook.html", "explore.html", "inbox.html"].map(f => [f, fs.readFileSync("site/" + f, "utf8")]);
  for (const [f, h] of desk.slice(1))
    for (const tag of [/<nav class="learn-nav muted">[\s\S]*?<\/nav>/, /<footer class="learn-foot muted">[\s\S]*?<\/footer>/, /<dialog id="passgate"[\s\S]*?<\/dialog>/])
      assert.equal(h.match(tag)[0], admin.match(tag)[0], f + " repeats the desk's " + tag.source.slice(1, 9));
  // The desk's own menu row: Setup, the three monitoring views, Pivot table and Feedback, the same on the six pages but for the current marker.
  const deskMenu = (h, f) => one(h, /<\/header>\n<nav class="learn-menu">([\s\S]*?)<\/nav>/, f + " desk menu");
  const deskItems = ['<a id="setup-link" href="admin.html">Setup</a>', '<a id="monitor-link" href="monitor.html">Global</a>', '<a id="game-link" href="monitor-game.html">Game</a>',
    '<a id="handbook-link" href="monitor-handbook.html">Handbook</a>', '<a id="explore-link" href="explore.html">Pivot table</a>', '<a id="inbox-link" href="inbox.html">Feedback</a>'];
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
  const nav = navItems(one(learnHtml["index.html"], /<nav class="learn-nav muted">([\s\S]*?)<\/nav>/, "index nav"));
  const foot = labels(one(learnHtml["index.html"], /<footer class="learn-foot muted">([\s\S]*?)<\/footer>/, "index footer"));
  const gameNavs = [...page.matchAll(/<nav class="landing-nav muted( mast-nav)?">([\s\S]*?)<\/nav>/g)].map((m) => m[2]);
  assert.equal(gameNavs.length, 2, "the landing card and the game's masthead");
  // the masthead's nav also carries the chapter line (next to The Ritz Affair) and the Back button
  const bare = gameNavs[1].replace(/<span class="mast-chapter">[\s\S]*?<\/span><\/span>/, "").replace(/<button id="btn-back"[\s\S]*?<\/button>/, "");
  assert.match(gameNavs[1], /The Ritz Affair<\/span><span class="mast-chapter"> &mdash; <span id="masthead-chapter"/);
  assert.equal(bare, gameNavs[0], "otherwise the same nav on both");
  assert.deepEqual(navItems(gameNavs[0]), nav);
  assert.deepEqual(navCurrent(gameNavs[0]), ["The Ritz Affair"], "the game's section in colour");
  const landingFoot = one(page, /<p class="muted landing-foot">([\s\S]*?)<\/p>/, "landing footer");
  assert.match(landingFoot, /<span id="stats-link" hidden> &middot; <a href="#" id="btn-stats">Statistics<\/a><\/span>/, "the consent link app.js shows and relabels");
  assert.deepEqual(labels(landingFoot), foot, "the handbook's footer, Statistics included");
  // privacy.html runs no consent code: the same header, the footer without Statistics or a link to itself
  const privacy = fs.readFileSync("site/privacy.html", "utf8");
  const privacyNav = one(privacy, /<nav class="landing-nav muted">([\s\S]*?)<\/nav>/, "privacy nav");
  assert.deepEqual(navItems(privacyNav), nav);
  assert.deepEqual(navCurrent(privacyNav), [], "privacy.html is neither section");
  assert.deepEqual(labels(one(privacy, /<p class="muted landing-foot">([\s\S]*?)<\/p>/, "privacy footer")), foot.filter((t) => t !== "Statistics" && t !== "Privacy notice"));
});

test("Day/Night button: the game's button on every handbook page, the desk and the board, theme.js draws the game's icons", () => {
  const game = fs.readFileSync("site/index.html", "utf8");
  const btn = one(game, /\n(<button id="btn-theme"[^\n]*<\/button>)\n/, "the game's button");
  assert.equal(btn, `<button id="btn-theme" class="quiet theme-corner" title="Night edition" aria-label="Night edition">${themeButtonHtml("day")}</button>`);
  const corners = `<div class="corners">\n${feedbackButtonHtml}\n${btn}\n</div>`;
  assert.ok(game.includes("<body>\n" + corners + "\n"), "the game: Send feedback beside the button");
  const pages = { ...learnHtml, "../admin.html": fs.readFileSync("site/admin.html", "utf8"), "../leaderboard.html": fs.readFileSync("site/leaderboard.html", "utf8"), "../monitor.html": fs.readFileSync("site/monitor.html", "utf8"), "../monitor-game.html": fs.readFileSync("site/monitor-game.html", "utf8"), "../monitor-handbook.html": fs.readFileSync("site/monitor-handbook.html", "utf8"), "../explore.html": fs.readFileSync("site/explore.html", "utf8") };
  for (const [f, html] of Object.entries(pages)) {
    assert.ok(/<body( data-view="\w+")?>\n/.test(html) && html.includes(">\n" + corners + "\n"), f + ": the same Feedback link and button, first in the body");
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

// Each indexed page's file under site/ and the sitemap that lists it: the game's on alephb.uk/ritz-affair/, the handbook's on
// alephb.uk/learn/ (publish.mjs serves site/sitemap.xml as ritz-affair/sitemap.xml and learn/sitemap.xml as is).
const SITEMAPS = [["site/sitemap.xml", "https://alephb.uk/ritz-affair/", "site/"], ["site/learn/sitemap.xml", "https://alephb.uk/learn/", "site/learn/"]];
const indexed = () => SITEMAPS.flatMap(([sm, host, dir]) => {
  const xml = fs.readFileSync(sm, "utf8"), locs = [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);
  return locs.map((loc) => {
    assert.ok(loc.startsWith(host), sm + " lists only " + host + ": " + loc);
    const rel = loc.slice(host.length);
    return { loc, rel, f: dir + (rel === "" || rel.endsWith("/") ? rel + "index.html" : rel) };
  });
});
test("handbook: the sitemaps list the landing page and privacy, and every learn page on alephb.uk, and nothing missing", () => {
  const files = indexed().map((e) => e.f);
  for (const f of files) assert.ok(fs.existsSync(f), "sitemap entry exists: " + f);
  assert.deepEqual([...new Set(files)].sort(), ["site/index.html", "site/privacy.html", ...learnPages.map((f) => "site/learn/" + f)].sort());
  assert.equal(files.length, new Set(files).size, "each page once");
});

test("search and previews: every indexed page has its own title, a description, a canonical at its sitemap URL, og tags and JSON-LD that parses", () => {
  const titles = new Set();
  for (const { loc, rel, f } of indexed()) {
    const h = fs.readFileSync(f, "utf8"), meta = (re) => (h.match(re) || [])[1];
    const title = meta(/<title>([^<]+)<\/title>/);
    assert.ok(title && !titles.has(title), f + " has a unique title");
    titles.add(title);
    assert.equal(meta(/<link rel="canonical" href="([^"]+)">/), loc, f + " canonical is its sitemap URL");
    if (rel === "privacy.html") continue;
    assert.ok(meta(/<meta name="description" content="([^"]{50,})">/), f + " description");
    assert.ok(meta(/<meta property="og:title" content="([^"]+)">/), f + " og:title");
    assert.equal(meta(/<meta property="og:url" content="([^"]+)">/), loc, f + " og:url");
    assert.equal(meta(/<meta property="og:image" content="([^"]+)">/), "https://alephb.uk/ritz-affair/landing-pillow.jpg", f + " og:image");
    assert.ok(fs.existsSync("site/landing-pillow.jpg") && h.includes('<meta name="twitter:card" content="summary_large_image">'), f + " twitter card");
    const ld = JSON.parse(meta(/<script type="application\/ld\+json">([^<]+)<\/script>/));
    assert.equal(ld["@context"], "https://schema.org", f + " JSON-LD");
    if (f.startsWith("site/learn/")) assert.deepEqual(ld.isPartOf, { "@type": "WebSite", name: "AlephB", url: "https://alephb.uk/" }, f + " is part of alephb.uk");
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

// alephb.uk serves the game at /ritz-affair/ and the handbook at /learn/ (publish.mjs, pushed to alephb-site by
// .github/workflows/publish-alephb.yml); mystery.alephb.uk serves only the bridge (publish.mjs bridge).
const SKIPPED = new Set(["robots.txt", "ads.txt", ".gitkeep", ".DS_Store"]);
test("publish: alephb-site gets every file of site/, every local URL and import resolves across both folders, one versioned URL per module", () => {
  const files = publishFiles("site");
  const want = fs.readdirSync("site", { recursive: true }).filter((f) => !fs.statSync("site/" + f).isDirectory() && !SKIPPED.has(path.basename(f)))
    .map((f) => (f.startsWith("learn/") ? f : "ritz-affair/" + f)).sort();
  assert.deepEqual(Object.keys(files).sort(), want, "every page and asset, the season files the deploy built included");
  for (const f of Object.keys(files)) assert.ok(f.startsWith("ritz-affair/") || f.startsWith("learn/"), f + ": only ritz-affair/ and learn/");
  if (fs.existsSync("site/season-1.sqlite")) assert.ok(files["ritz-affair/season-1.sqlite"] && files["ritz-affair/season-1.json"]);
  const v = "abc1234", out = Object.fromEntries(Object.entries(files).map(([f, t]) => [f, typeof t === "string" ? versionText(f, t, v) : t]));
  const has = (f) => Object.hasOwn(out, f);
  const modules = new Map();   // module path -> the URLs it is reached by
  for (const [f, t] of Object.entries(out)) {
    if (typeof t !== "string") continue;
    if (f !== "ritz-affair/privacy.html") assert.doesNotMatch(t, /mystery\.alephb\.uk/, f + " names the new home");   // privacy tells of the bridge
    const dir = path.posix.dirname(f);
    if (f.endsWith(".html")) {
      assert.equal(t.split(ADSENSE_META).length, 2, f + " carries the AdSense account tag once");
      for (const [, a, u] of t.matchAll(/\b(src|href)="([^"]+)"/g)) {
        const p = u.split(/[?#]/)[0];
        if (!p || /^([a-z]+:|\/\/|#)/i.test(u)) continue;
        const to = path.posix.normalize(dir + "/" + p + (p.endsWith("/") ? "index.html" : ""));
        assert.ok(has(to), f + " links a missing file: " + u);
        if (/\.(js|css)$/.test(p)) assert.ok(u.endsWith("?v=" + v), f + " versions " + u);
        if (p.endsWith(".js") && a === "src") modules.set(to, new Set([...(modules.get(to) || []), u.split("?")[1]]));
      }
    }
    if (f.endsWith(".js"))
      for (const [, u] of t.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)"(\.\.?\/[^"]+)"/g)) {
        const [p, q] = u.split("?"), to = path.posix.normalize(dir + "/" + p);
        assert.ok(has(to), f + " imports a missing module: " + u);
        assert.equal(q, "v=" + v, f + " versions " + u);
        modules.set(to, new Set([...(modules.get(to) || []), q]));
      }
  }
  for (const [m, qs] of modules) assert.equal(qs.size, 1, m + " has one URL");
  assert.ok(modules.has("ritz-affair/stats.js"), "learn/handbook.js and app.js share the game's stats.js");
  assert.match(out["learn/exercises.js"], /from "\.\.\/ritz-affair\/terminal\.js\?v=abc1234"/);
  assert.match(out["ritz-affair/index.html"], /href="\.\.\/learn\/exercises\.html#the-cheap-shelf"/);
  assert.match(out["ritz-affair/admin.html"], /src="\.\.\/learn\/theme\.js\?v=abc1234"/);
  assert.match(out["ritz-affair/index.html"], /<link rel="canonical" href="https:\/\/alephb\.uk\/ritz-affair\/">/);
  assert.match(out["learn/like.html"], /<link rel="canonical" href="https:\/\/alephb\.uk\/learn\/like\.html">/);
  assert.equal([...out["learn/sitemap.xml"].matchAll(/<loc>https:\/\/alephb\.uk\/learn\//g)].length, learnPages.length, "the /learn/ sitemap lists every page");
  assert.doesNotMatch(out["ritz-affair/sitemap.xml"], /\/learn\//, "the game's sitemap lists its own pages only");
  assert.equal(GAME, "https://alephb.uk/ritz-affair/");
  assert.equal(HOME, "https://alephb.uk/learn/");
});

test("publish: mystery.alephb.uk is named only by the bridge, the docs and test fixtures", () => {
  const named = execFileSync("git", ["grep", "-l", "mystery\\.alephb\\.uk"], { encoding: "utf8" }).split("\n").filter(Boolean);
  const allowed = (f) => f === "publish.mjs" || f === "site/privacy.html" || f === "CLAUDE.md" || f === "README.md" || f.startsWith("docs/") || /^test_\w+\.(mjs|py)$/.test(f) || f.startsWith(".github/workflows/");
  assert.deepEqual(named.filter((f) => !allowed(f)), [], "the site and the scripts name alephb.uk");
});

test("bridge: index.html carries the ritz.* keys in the fragment only, the query kept; every other page redirects to its new URL", () => {
  assert.equal(bridgeTarget("", []), GAME);
  assert.equal(bridgeTarget("?season=s3&board=https%3A%2F%2Fx", [["other", "1"]]), GAME + "?season=s3&board=https%3A%2F%2Fx", "nothing of ours saved: a plain redirect");
  const saved = [["ritz.learn", JSON.stringify({ solved: [1, 2], badges: ["Tourist"], notes: "été" })], ["ritz.theme", "night"],
    ["ritz.exercises", "[\"the-cheap-shelf\"]"], ["ritz.admin.board", "https://script.google.com/macros/s/x/exec"], ["_ga", "no"]];
  const to = bridgeTarget("?season=s3", saved);
  const u = new URL(to);
  assert.equal(u.origin + u.pathname, GAME);
  assert.equal(u.search, "?season=s3", "the query stays a query");
  assert.match(u.hash, /^#import=[A-Za-z0-9_-]+$/, "the keys travel in the fragment, base64url");
  assert.deepEqual(readImport(u.hash), Object.fromEntries(saved.filter(([k]) => k.startsWith("ritz."))), "every ritz.* key, nothing else, UTF-8 intact");
  // the page runs that same function on this origin's localStorage, with no GA or ad tag
  const html = bridgeHtml(), js = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  assert.doesNotMatch(html, /googletagmanager|adsbygoogle|gtag|\.js/);
  let went = "";
  const store = new Map(saved);
  const ls = { get length() { return store.size; }, key: (i) => [...store.keys()][i], getItem: (k) => store.get(k) ?? null };
  new Function("localStorage", "location", js)(ls, { search: "?season=s3", replace: (x) => { went = x; } });
  assert.equal(went, to);
  new Function("localStorage", "location", js)({ get length() { throw new Error("blocked"); } }, { search: "?a=1", replace: (x) => { went = x; } });
  assert.equal(went, GAME + "?a=1", "blocked storage: a plain redirect");
  const bridge = bridgeFiles("site");
  const pages = fs.readdirSync("site", { recursive: true }).filter((f) => f.endsWith(".html")).sort();
  assert.deepEqual(Object.keys(bridge).filter((f) => f.endsWith(".html")).sort(), pages, "every old page is served");
  for (const f of pages) {
    if (f === "index.html") continue;
    const want = f === "learn/index.html" ? HOME : f.startsWith("learn/") ? HOME + f.slice(6) : GAME + f;
    assert.ok(bridge[f].includes(`location.replace(${JSON.stringify(want)} + location.search + location.hash)`), f + " -> " + want);
    assert.ok(bridge[f].includes(`<link rel="canonical" href="${want}">`), f + " canonical");
  }
  assert.equal(bridge["robots.txt"], "User-agent: *\nAllow: /\n", "crawlers follow the redirects");
  assert.ok(Object.keys(bridge).every((f) => /\.(html|txt)$/.test(f)), "no script, data or ad file on the bridge");
  assert.ok(OLD.startsWith("https://mystery."));
});

test("bridge import: a key the new origin lacks is written; a held key is kept unless it is a save the import is ahead of", () => {
  const save = (solved, totalQueries) => JSON.stringify({ solved, totalQueries });
  const have = (o) => (k) => (k in o ? o[k] : null);
  const imp = { "ritz.learn": save([1, 2, 3], 40), "ritz.compete": save([1], 5), "ritz.theme": "night", "ritz.consent": "yes",
    "ritz.exercises": "[]", "evil": "x", "ritz.n": 5 };
  assert.deepEqual(importWrites(imp, have({})), { "ritz.learn": imp["ritz.learn"], "ritz.compete": imp["ritz.compete"], "ritz.theme": "night", "ritz.consent": "yes", "ritz.exercises": "[]" },
    "an empty origin takes every ritz.* string, nothing else");
  assert.deepEqual(importWrites(imp, have({ "ritz.learn": save([1], 99), "ritz.compete": save([1, 2], 0), "ritz.theme": "day", "ritz.consent": "no", "ritz.exercises": "[\"a\"]" })),
    { "ritz.learn": imp["ritz.learn"] }, "more chapters solved wins; theme, consent and exercises already here stay");
  assert.deepEqual(importWrites({ "ritz.learn": save([1, 2], 9) }, have({ "ritz.learn": save([1, 2, 3], 1) })), {}, "fewer chapters: kept");
  assert.deepEqual(importWrites({ "ritz.learn": save([1], 9) }, have({ "ritz.learn": save([1], 3) })), { "ritz.learn": save([1], 9) }, "same chapters, more queries");
  assert.deepEqual(importWrites({ "ritz.learn": save([1], 3) }, have({ "ritz.learn": save([1], 3) })), {}, "a tie keeps what is here");
  assert.deepEqual(importWrites({ "ritz.learn": save([1], 3) }, have({ "ritz.learn": "{broken" })), { "ritz.learn": save([1], 3) }, "an unreadable save here loses");
  for (const h of ["", "#", "#import=", "#import=!!", "#the-cheap-shelf", "#import=" + Buffer.from("[1]").toString("base64url"), "#import=" + Buffer.from("nope").toString("base64url")])
    assert.equal(readImport(h), null, h + " is no import");
  // app.js imports before anything reads storage, then drops the fragment
  const app = fs.readFileSync("site/app.js", "utf8");
  assert.match(app, /async function boot\(\) \{\n  importSaves\(\);/);
  assert.match(app, /history\.replaceState\(null, "", location\.pathname \+ location\.search\)/);
});

test("privacy: the notice lives with the game on alephb.uk and says the game and the handbook share their keys", () => {
  const h = fs.readFileSync("site/privacy.html", "utf8");
  assert.match(h, /<link rel="canonical" href="https:\/\/alephb\.uk\/ritz-affair\/privacy\.html">/);
  assert.match(h, /One answer, kept in <code>ritz\.consent<\/code>, covers\s+the game and the handbook/);
  assert.match(h, /the handbook, the Clerk's Desk and the leaderboard read and write the same day\/night choice/);
});
