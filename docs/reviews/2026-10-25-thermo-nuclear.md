# Thermo-nuclear code quality review, 2026-10-25

Scope: `git diff de06ecf..origin/main` (38 commits shipped on 2026-10-25, head `c19fbaa`) and the modules it grew,
judged whole: `site/app.js`, `site/monitor.js`, `site/stats.js`, `apps_script.gs`, `site/admin.js`,
`site/learn/exercises.js`, `site/learn/handbook.js`, `site/shared.js`, `colour_learn.mjs`. Review only: no code
changed. Every proposal keeps the CLAUDE.md invariants: stdlib only, no build step and no bundler, pure logic
exported and tested, generated files never edited by hand, the Shortcut check, the deploy's `?v=` versioning.

Line numbers are those of `origin/main` at `c19fbaa`.

## Sizes

| File | 2026-10-24 (`de06ecf`) | 2026-10-25 | Change |
|---|---|---|---|
| `site/app.js` | 1,935 lines | 2,321 lines (150 KB) | +386 |
| `site/monitor.js` | 904 | 957 (82 KB, long lines) | +53 |
| `test_site.mjs` | 1,720 | 2,012 | +292 |
| `site/learn/exercises.js` | 225 | 243 | +18 |
| `site/admin.js` | 230 | 253 | +23 |
| `apps_script.gs` | 368 | 406 | +38 |

`app.js` was already past the 1,000 line limit and took the day's three biggest new subsystems (Tab completion,
SQLite error help, the prologue and callouts) plus sharing and the case board's new parts. `monitor.js` is 43 lines
from the limit. Both need splitting; the plan is in F2 and F14.

## Findings, by priority

Priorities: 1 structural regression, 2 missed simplification, 3 spaghetti / branching growth, 4 boundary or
contract, 5 file size, 6 modularity and reuse, 7 legibility. Sizes: S under an hour, M a half day, L a day or more.
Findings marked **[owner]** change behaviour or look, or a documented workflow, and are listed again at the end.

### P1. Structural regressions

#### F1. Three copies of the terminal, drifting apart (P1, M) [owner, for one sub-choice]

Where:
- run pipeline: `site/app.js:1190-1222` (`runQuery`), `site/app.js:1551-1563` (the prologue's `run`),
  `site/learn/exercises.js:189-200` (`run`);
- editor: `site/app.js:256-260` (`syncSql`) with `site/app.js:2247-2273` (keydown), `site/app.js:1538` + `1566-1568`
  (prologue `sync`, `oninput`, the `ta.dataset.suggest` guard), `site/learn/exercises.js:165-185`;
- `wireSuggest` contract: `site/app.js:309-311` ("Its keydown listener must be added before the box's own one"),
  `site/app.js:355` (`stopImmediatePropagation`).

What is wrong. Each surface reimplements cartesian guard -> `strictCheck` -> `db.exec(toSqlite(...))` ->
`sqliteHelp` -> `dateArithmeticNote` -> `strictHtml | errorHtml | renderResults`, and each wires its own
highlight-and-grow, Ctrl+Enter, Ctrl+F, Tab. The diff added the third copy (the prologue) and they already differ:
- the prologue skips the cartesian guard and the date note; it has no Ctrl+F and no Tab indent;
- exercises has no Enter auto-indent, and its Ctrl+F leaves the caret where it was (the game moves it to the end);
- the strict error string is `"ERROR: " + strict.error` in the game and prologue, `strict.error` on exercises
  (harmless today because only `strictHtml` displays it, which is exactly how such drift starts);
- every keystroke highlights the whole query twice: the box's own `input` listener calls sync, and
  `wireSuggest`'s `input` listener (`site/app.js:346`) calls `sync()` again (`site/app.js:330`), on all three
  surfaces;
- correctness depends on listener registration order, documented in a comment, enforced by nothing.

Restructuring (code judo: three pipelines and three editors become one of each). In the new `site/terminal.js`
(see F2):

```js
// One run: the outcome model every caller (and GA) reads.
export function runSql(db, sql, schema, cols, join = "ledgers") {
  if (cartesian(sql)) return { error: "Two " + join + " side by side ...", outcome: { kind: "refused", rule: "cartesian", type: "refused" } };
  const strict = strictCheck(sql, schema);
  if (strict) return { error: "ERROR: " + strict.error, strict, outcome: { kind: "refused", rule: strict.anchor, type: "refused" } };
  try {
    const all = db.exec(toSqlite(sql)), res = all[all.length - 1] || null;
    return { res, note: res ? "" : dateArithmeticNote(sql, schema), outcome: { kind: "ok" } };
  } catch (e) {
    const help = sqliteHelp(e.message, sql, cols);
    return { error: e.message, help, outcome: { kind: "error", rule: "", type: help.type } };
  }
}
export const runHtml = (r, base) => r.strict ? strictHtml(r.strict, base) : r.error ? errorHtml(r.error, r.help)
  : renderResults(r.res) + (r.note ? '<p class="muted">' + esc(r.note) + "</p>" : "");
// One editor: highlight and grow, Tab completion, Ctrl+Enter, Ctrl+F, Tab, Enter auto-indent; one keydown handler.
export function wireEditor(ta, hl, { run, cols, minHeight = 0, autoIndent = true }) { ... }
```

`wireEditor` owns the suggester (a `suggester(ta, hl, cols)` object with `key(e)` returning true when it took the
key, and `refresh()` called from the editor's single `input` handler), so the ordering contract,
`stopImmediatePropagation`, the double highlight and the prologue's `dataset.suggest` flag all go. `runQuery`
shrinks to the game's bookkeeping (count, scan, milestone, GA, eggs, suspects, badges); the prologue's `run` to
`prologueAdvance`; exercises' `run` to matching the solutions. `runOutcome` (`exercises.js:63`) is deleted: it is
`r.outcome.kind`.

Behaviour preservation: the game keeps its wording ("ledgers"), its 160 px minimum and its Enter auto-indent.
**[owner]** sub-choice: either keep today's per-surface differences as options (`autoIndent: false` and
`minHeight: 140` for exercises, the prologue without Ctrl+F) or give all three the game's editor; and the prologue
gaining the cartesian guard and the date note is a (tiny) visible change.

Tests: `test_site.mjs` "suggestSql: contexts..." and "...only the revealed tables" stay as they are; "SQLite's
errors get one plain line...", "date mistakes..." and "prologue: ... three steps" move onto `runSql`; add one
`runSql` table test (cartesian, refused, SQLite error with type, ok with and without the date note, outcome shape)
and one test that the three call sites import `runSql`/`wireEditor` and none calls `strictCheck` or
`highlightSql` directly (a grep, like the existing `askDialog` grep).

#### F2. The handbook imports the game, and app.js absorbed four new subsystems (P1 + P5, L)

Where: `site/learn/exercises.js:5` imports 22 names from `../app.js`; `site/app.js:2321` guards boot with
`document.getElementById("landing")` only because of that import; `site/app.js:3,5` re-export `shared.js` and
`stats.js` for the handbook and the tests.

What is wrong. The exercises page downloads and evaluates the whole 150 KB game module (chapter flow, badges,
compete client, extra editions) to get a terminal. The day's new terminal features (Tab completion, `sqliteHelp`,
`dateArithmeticNote`, `EMPTY_RUN`), a generic widget (`showCallouts`) and the prologue all landed in the game
module because that is where the terminal lives. The re-export lines are identity wrappers that exist only to
serve that wrong dependency.

Restructuring. Split `app.js` by the concepts it already has, each module stdlib, side-effect free at import,
pure parts exported (sizes measured on the current ranges):

| New module | Moves out of app.js | About |
|---|---|---|
| `site/strict.js` | lines 376-1076: `STRICT_SECTIONS`, `SQLITE_FUNCS`, `FUNC_ANCHOR`, tokenizer, `parseSql`, `analyse`, `strictScan`, `strictCheck`, `toSqlite`, `castType`, `ilike`, `ymd` | 700 |
| `site/terminal.js` | `SQL_KEYWORDS`, `highlightSql`, `formatSql` (205-255), `SUGGEST_*`, `suggestSql`, `wireSuggest` (262-357), `ROW_CAP`, `esc`, `renderResults`, `cartesian` (359-375), `terminalDb` (125-131), `strictHtml`, `sqliteHelp`, `errorHtml`, `dateArithmeticNote`, `EMPTY_RUN` (1077-1137), `pushHistory`, `tablesIn`, plus F1's `runSql`, `runHtml`, `wireEditor` and an `openSqlJs()` / `readSchema(db)` pair (today duplicated in `app.js:108-121` and `exercises.js:223-228`, sql.js URL included) | 300 |
| `site/ui.js` | `btnLike`, `ICON_ATTRS`, `themeButtonHtml`, `erdButtonHtml`, a new `setIconButton(btn, {html, label})` (F18), `showCallouts`, `calloutLeft` | 80 |
| `site/onboarding.js` | `PROLOGUE_*`, `prologueOn`, `prologueAdvance`, `prologueAnswer`, `showPrologue(SQL, done)`, `CALLOUTS`, `tourOn` | 100 |
| `site/badges.js` | `BADGES`, `FILM_LINES`, `EGG_ROWS`, `eggText`, `seenFilms`, `detectBadges`, `RANKS`, `rank` (1270-1353) | 85 |
| `site/endings.js` | `filmHtml`, `wireFilm`, `showExtra`, `showExtra2`, `part2Ending`, `renderCertificate`, `SHARE_URL`, `shareText`, `shareLinks`, `shareHtml`, `wireShare`; each takes `(state, data, hooks)` instead of reading module globals | 130 |
| `site/suspects.js` | `PORTRAIT_FILE`, `CARD_FACES`, `cardPicture`, `suspectsOn`, `metSuspects`, `foundSuspects`, `boardSuspects`, `suspectCard`, a new `portraitSrc(name)` (F18) | 60 |

`app.js` keeps state, storage, chapter flow, board, schema diagram, the compete client and `boot`: about 950 lines
once F1 and F7-F10 delete their duplicates. A second step, `site/compete.js` (the pure `competeStats`,
`eventPayload`, `clockMs`, `clockStart`, `watchOn`, `JOIN_REFUSED` and the outbox / watch wiring, lines 48-76 and
1835-2040, given a small context object), would take it to about 750; do it only when compete is next touched.

`exercises.js` then imports `../terminal.js`, `../strict.js`, `../ui.js`, `../stats.js` and `../shared.js`, never
`../app.js`. Delete `app.js:3` and `app.js:5`; `test_site.mjs` imports each name from its owner, and the test
"shared.js is what app.js re-exports" (`test_site.mjs:179`) goes. The `#landing` guard on boot can stay (cheap) but
is no longer load-bearing.

Keeping the cache-busting true: this split is only safe after F3 (generic versioning). With today's hand lists, a
forgotten `terminal.js` in `pages.yml:44` would make `index.html` load `app.js?v=X` importing an unversioned
`./terminal.js` that browsers may keep for 10 minutes after a deploy, which is precisely the stale-script bug the
lists exist to prevent. Module identity matters too: `exercises.html` must load one `stats.js`, so
`../stats.js?v=X` from `exercises.js` and `handbook.js` and `./stats.js?v=X` from `terminal.js` must all resolve to
the same URL, which a single rule guarantees and F3's test checks.

Behaviour preservation: pure moves plus parameterisation; no user-visible change. The handbook gets lighter (it no
longer evaluates the game).

Tests: the existing suite, with imports repointed; the deploy test of F3; the strict-terminal test that runs every
plot query (`test_site.mjs:995` onwards) imports `strictCheck` from `strict.js`.

### P2. Missed simplifications (code judo)

#### F3. Version every same-site script by one rule instead of two hand-kept lists (P2, S)

Where: `.github/workflows/pages.yml:37-67` (step "Tie the pages to this deploy's script and stylesheet": four `sed` lines naming files, then 17 `grep -q` checks);
`test_site.mjs:964-975` (a hard-coded list of importing modules and a regex on the workflow text).

What is wrong. Every new module (F2 adds seven, F14 one) means editing a `sed` alternation, a file list, a
`grep -q` line, the test's expected importer list and the CLAUDE.md paragraph that restates all of it. The test
checks that the lists mention the files, not that the deployed pages are actually versioned.

Restructuring. A stdlib node script, `version_site.mjs`, with a pure `versionSite(files, v)`: in every
`site/**/*.html`, every relative `src`/`href` ending `.js` or `.css` gets `?v=<v>`; in every `site/**/*.js`, every
`from "./x.js"` / `from "../x.js"` gets `?v=<v>`. The workflow step becomes `node version_site.mjs "${GITHUB_SHA::7}"`
(node 22 is already set up two steps earlier). The test runs `versionSite` on the real files in memory and asserts
that no relative import or local script/style reference is left unversioned, and that every module's URL for
`stats.js`, `shared.js` and `app.js` is the same string. The 17 `grep -q` lines, the importer list, the
`(shared|qr|stats)` regex test and most of the CLAUDE.md "Cache" invariant paragraph go.

Behaviour preservation: identical for every file in today's lists. **[owner]** (cache only, nothing visible): the
rule also versions `learn/theme.js` and `../style.css` on the handbook pages, which CLAUDE.md says are left
unversioned; versioning them only removes a stale-cache window.

Tests: new `versionSite` test as above; drop `test_site.mjs:966-972`.

#### F4. Monitor panels: positional replies, five hand-written loaders (P2, M)

Where: `site/monitor.js:591-625` (`PANELS` return arrays), `site/monitor.js:650-660` (`failsHtml`),
`site/monitor.js:684-698` (`featuresHtml`), `site/monitor.js:700-707` (`onboardingHtml`), `site/monitor.js:778`
(`first`), `site/monitor.js:868-922` (`loadBd`, `loadCmp`, `loadTop`, `loadDn`, `loadPanel`),
`site/monitor.js:845-949` (eight `view === ...` tests).

What is wrong. A panel's requests and its renderer agree only on array positions: `failsHtml` decides game versus
handbook by `res.length > 3` (kind donut) and `res.length > 2` (types), so the shape of the reply array is a mode
flag; the day's additions (`typeRequest`, `adRequest`, onboarding's four replies read as `res[0]..res[3]`) made the
coupling wider. In `main()` five loaders copy the same "reset, draw, `want`/`still` freshness key, try, catch,
draw" block, and the view is re-tested in eight places to decide which of them run.

Restructuring. Name the replies and make everything a panel:
- `PANELS[view][id] = { deps: ["days", "m"], requests: ctx => ({ rule, split, type, kind }) }`: the loader runs
  `Promise.all` over `Object.entries` and stores an object; renderers destructure (`failsHtml({ rule, split, type,
  kind }, w, ...)`, `kind ? donut : ""`). `first()` and `COUNTED` disappear (`COUNTED` is "`deps` includes `m`").
- The breakdown, the compare chart, the countries and the donuts become entries of the views that show them
  (`deps: ["days", "m", "bd"]` and so on); the countries' dependent second request is a panel whose `load(ctx,
  report)` is an async function rather than a request map. One `loadPanel(id)` keyed on its `deps` replaces the
  five loaders; `VIEWS[view] = { html, panels, fromStats }` replaces the `view ===` chains.

Behaviour preservation: same requests, same parallelism, same drop-late-replies rule; no visual change.

Tests: the panel renderer tests in `test_site.mjs` (1582, 1676, 1732 and the monitor block from 1361) pass objects
instead of arrays; the test that checks every request against the backend whitelist iterates the named maps; add
one test that each view's panels cover every renderer `gameHtml` / `handbookHtml` / `statsHtml` reads.

#### F5. Handbook chrome derived by regex from hand-copied chrome (P2, M) [owner]

Where: `colour_learn.mjs:30-45` (`sideMenuPage` reads the menu from the page's own `<details class="learn-chapters">`
with a regex and rewrites `<main>`); CLAUDE.md: "Every page repeats the same chrome by hand (no templating) ...
adding or reordering a page means editing the menu and pagers on every page"; `test_site.mjs` pins that the 17
copies agree.

What is wrong. The side menu is a third derived copy of a table of contents that already exists 17 times by hand
(the dropdown) plus once more in the pagers, and it is parsed back out of HTML by regex. The script is called
`colour_learn` but now also builds navigation.

Restructuring. One `TOC` array (slug, number, title) in the script; it writes, between markers as it already does
for the side menu, the Learning chapters dropdown, the pager and the side menu of every page; `sideMenuPage`'s regex
parse goes, and so does most of the "identical chrome" test (replaced by "the generated blocks are fresh", like the
bakery schema's staleness test). Rename the script `learn_pages.mjs` (it colours and lays out the pages) or keep
the name and say so in its header.

Behaviour preservation: byte-identical pages if the generator reproduces today's markup. **[owner]**: this changes
the documented "chrome by hand" workflow.

Tests: a staleness test (run the generator in memory, compare with the files); keep the anchor and pager-label
checks.

### P3. Spaghetti and branching growth

#### F6. A one-off starter query inside `renderChapter` (P3, S)

Where: `site/app.js:175`: `if (ch.n === 1 && !state.queries[1] && !$("sql").value) { $("sql").value = FIRST_QUERY; syncSql(); }`.

What is wrong. A render function that runs on every redraw now writes into the editor under a chapter-specific
condition, and depends on the box being empty at that moment.

Restructuring. The terminal's empty value is a function of the state: `starterSql(state) => !state.queries[1] &&
!state.solved.length ? FIRST_QUERY : ""`, used by `clearTerminal()` (`app.js:136`) and once in `enterGame()`.
`renderChapter` stops touching the editor.

Behaviour preservation: the box is filled on first arrival, on reload before a first query, and after "Current"
from the chapter menu, as today.

Tests: a pure test for `starterSql`; the existing `test_generate` check that `FIRST_QUERY` returns noise rows stays.

#### F7. Feature-specific knobs in generic charts; mixed units in one bar chart (P3, S) [owner]

Where: `site/monitor.js:510` (`r.unit || n` added to the generic `hbarSvg` for one row); `site/monitor.js:688-696`
(`featuresHtml` splices a synthetic "Ad clicks (Google)" row, a click count, into a chart of users, after
`ad_house_click`, with `unit` branches in its raw table).

What is wrong. The generic chart learned about one caller's special row, and one axis now carries two units. The
note under the chart has to explain it.

Restructuring. Draw Google's ad clicks and impressions as their own two-bar `hbarSvg` (or one muted line, as the
countries' totals are) under FEATURE USE, fed by the named `ads` reply of F4; delete `r.unit` from `hbarSvg` and the
splice. **[owner]**: a small look change on the Game and Handbook monitor pages.

Tests: the `featuresHtml` assertion at `test_site.mjs:1743` splits into a features test and an ads test.

#### F8. Action chains on the desk and in the backend (P3, S)

Where: `site/admin.js:61` (`ACTIONS.filter` with three `(a !== "x" || state ...)` clauses, one added today);
`site/admin.js:152-201` (`act`, an eight-branch `if/else` where some branches `return` and fall-through means
"reload the seasons", and `delete` reloads itself then returns); `apps_script.gs:92-131` (`admin_`, five `if (act ===
...)` blocks).

What is wrong. Each new action adds a clause to the visibility filter and a branch with its own exit convention to
`act`; whether the table reloads depends on which branches return.

Restructuring. One table in `admin.js`: `{ id, label, word, glyph, when: s => ..., run: async s => reload? }`;
`seasonsTableHtml` filters on `when`, `act` is `const r = await A.run(s); if (r) { await loadSeasons(); ... }`. In
the backend, `ADMIN_ACTS = { create, open, close, rename, delete }` as small functions of `(s, list, data, now)`;
`admin_` looks the action up after the shared `find_`. Only worth doing in the backend when it is next touched.

Behaviour preservation: same buttons per state, same messages, same reloads.

Tests: "admin seasons table: ... actions by state" (`test_site.mjs:887`) unchanged; `test_backend.mjs` unchanged.

#### F9. A state model held together by fallbacks (P3, S)

Where: `site/app.js:165` (`state.cracked || {}`), `1202` (`state.runs ||= {}`), `1205` (`milestones ||=`), `1208`
(`fails ||=`), `1217` (`state.suspects || (state.suspects = [])`), `1699-1700` (`state.runs || {}`, `if
(state.runs)`), `2234` (`hints ||=`); `site/app.js:1665` (`introduced` created lazily); `site/app.js:11-12` and
`1521`, `1591` (`prologue: "" | "done" | "skip"` plus `tour: boolean`, two predicates that each re-test the mode);
`site/app.js:1200-1203` (`scanRun`'s promise writes into whatever `state` is current when it resolves, then saves a
second time per run).

What is wrong. `loadFrom` (`app.js:39`) spreads `freshState()` under every save, so all those fields always exist;
the guards hide that invariant and invite the next field to be added without a default. `introduced` is the one
field that is genuinely a migration ("a game saved before it starts full") but it is handled inside
`introduceSuspects`. Two onboarding fields encode one three-step sequence.

Restructuring. Delete the guards. Make `loadFrom` the one migration point (`introduced: null` in `freshState`, and
the "older save" rule there). Replace `prologue` + `tour` with `onboarding: "prologue" | "tour" | "done"` (the
done/skip distinction only ever goes to GA at the moment it happens), with the migration "solved or queried before
2026-10-25 -> done". Capture `const st = state` in `runQuery` before chaining the scan, so a replaced state (the
admin jump) never receives a stale run.

Behaviour preservation: identical for every save written since `freshState` gained these fields; the migration
keeps old saves out of the prologue as `prologueOn`'s `!state.totalQueries` does today.

Tests: "prologue: learn mode's first visit only" and "callouts ..." rewritten on the enum; add a `loadFrom`
migration test for an old save without `introduced`/`onboarding`.

### P4. Boundaries and contracts

#### F10. `queryFail` in stats.js classifies terminal outcomes (P4, S)

Where: `site/stats.js:70-76` (`queryFail(fails, key, strict, cart, help)`); `site/learn/exercises.js:63`
(`runOutcome(error, refused)`, the same classification again).

What is wrong. The statistics module knows the strict checker's refusal shape, the cartesian guard and
`sqliteHelp`'s categories, through three positional parameters that only make sense together. The classification
exists twice.

Restructuring. With F1, `runSql` returns `outcome`; `queryFail(fails, key, outcome)` keeps only the cap of
`QUERY_FAILS` and returns `outcome` (or null). `runOutcome` goes.

Behaviour preservation: identical GA payloads (`kind`, `rule`, `type`).

Tests: "GA guards: ... the first three failed runs" (`test_site.mjs:1322`) passes outcomes.

#### F11. One concept, two shapes: schema versus column-name maps (P4, S)

Where: `site/app.js:1225` (`revealedColumns`), `site/app.js:2247` (the same expression again, inline),
`site/app.js:1558` and `1567` (the prologue's column map, twice), `site/learn/exercises.js:173` and `197` (twice
more).

What is wrong. `sqliteHelp` and `suggestSql` take `{ table: [column names] }`, `strictCheck` takes `{ table:
[[name, type, pk]] }`, and six call sites convert one into the other by hand; the game's two copies of "visible
tables to columns" are already written differently.

Restructuring. One `columns(schema, names = Object.keys(schema))` in `terminal.js`; the game keeps a single
`visibleColumns()` (used by the editor and by `runSql`); the prologue and exercises compute theirs once. Signatures
of `sqliteHelp` and `suggestSql` stay, so their tests stay.

Tests: existing suggest and help tests; the "only the revealed tables" test exercises `visibleColumns`.

#### F12. GA feature names built by concatenation and checked against nothing (P4, S)

Where: `site/app.js:1564` (`"prologue_" + how`), `site/app.js:1594` and `site/learn/exercises.js:235`
(`"tour_" + how`); `site/monitor.js:560-566` (`GAME_FEATURES`, `HANDBOOK_FEATURES`, hand-kept labels).

What is wrong. The monitor's lists must name every feature the pages send, but nothing checks it (the one test,
`test_site.mjs:1992`, checks two names), and concatenated names cannot be found by grep.

Restructuring. Pass literal names (`how === "done" ? "tour_done" : "tour_skip"`), and add a test that greps every
`useFeature("...")` literal in `site/app.js` (and its split modules) and `site/learn/*.js` and asserts each is in
`GAME_FEATURES` / `HANDBOOK_FEATURES` respectively.

Tests: that new test.

### P5. File size and decomposition

#### F13. app.js: see F2

The split plan, the module list and the versioning conditions are in F2.

#### F14. monitor.js: split the chart toolkit from the GA model (P5, M)

Where: `site/monitor.js` (957 lines; charts, the request model, three views and the page wiring in one module).

Restructuring. `site/charts.js` takes the presentation toolkit, none of which knows GA: `compact`, `tipAttrs`,
`ticks`, `yAxis`, `lineSvg`, `multiLineSvg`, `hbarSvg`, `chapterBarsSvg`, `chapterLineSvg`, `funnelSvg`,
`solveRateSvg`, `groupSvg`, `fold`, `arcs`, `arcPath`, `donutHtml`, `MAP`, `project`, `countryKey`, `bubbleR`,
`mapHtml`, `tableHtml`, `raw`, `legend`, `legendOf`, `wireTips`, `wireCsv` (about 340 lines). `monitor.js` keeps
`COUNT_METRICS` and the request builders, `PANELS` (F4), the section and view renderers and `main` (about 620
lines). With F3 in place no list needs editing; `charts.js` imports `./shared.js` for `escapeHtml` and F15's CSV
helper.

Tests: the chart tests repoint from `monitor.x` to `charts.x`.

#### F15. test_site.mjs is 2,012 lines, with an import in the middle (P5, S)

Where: `test_site.mjs` (whole file); `test_site.mjs:1935` (`import * as onb from "./site/app.js"`, hoisted from the
middle of the file).

Restructuring. Split by owner: `test_site.mjs` (game, terminal, strict, deploy), `test_desk.mjs` (admin, board,
monitor, charts, explore), `test_handbook.mjs` (learn pages, `colour_learn.mjs`, side menus, pagers, sitemap). The
`pages.yml:36` test line and the CLAUDE.md command block list the three files. This is also what lets the fix
batches below run in parallel.

### P6. Modularity and reuse

#### F16. Three CSV encoders and three download routines (P6, S)

Where: `site/admin.js:13-19` (`csvField`, CRLF, quotes `\r`), `site/monitor.js:26-41` (`csvCell`, CRLF, misses
`\r`), `site/explore.js:58-63` and `206-209` (its own `csvCell`, LF line ends, `text/csv` without charset).

Restructuring. `shared.js`: `csvText(rows)` (RFC 4180, CRLF, null as empty) and `downloadText(name, text, type =
"text/csv;charset=utf-8")`. All three pages use them; `tableCsv`, `pivotCsv` and admin's `csvText` become one-line
callers.

Behaviour preservation: identical files except explore's line ends (LF to CRLF) and a field holding a bare `\r` on
the monitor; neither matters to a spreadsheet.

Tests: one `csvText` test in `shared`; the three existing CSV tests keep their expectations (explore's with CRLF).

#### F17. Literal blanking written four times (P6, S)

Where: `site/app.js:275` (`suggestSql`'s `strip`, position-preserving, comments only when newline-terminated, on
purpose), `site/app.js:373` (`cartesian`), `site/app.js:1089` (`sqliteHelp`), `site/app.js:1127`
(`dateArithmeticNote`); the regex-escape `w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")` twice in `sqliteHelp`
(`1093`, `1116`) and `valueAfter(w)` evaluated twice (`1115`); `dateArithmeticNote` (`1133`) rebuilding the
YYYYMMDD number `ymd` already makes.

Restructuring. One `blankLiterals(sql)` in `terminal.js` (position-preserving; closed strings and comments), used
by all four; `suggestSql` keeps its one extra test for an unterminated trailing `--` comment. One `reEscape`.
`const va = valueAfter(w)` once. `ymd(y + "-" + mo + "-" + d)` in the note.

Tests: the existing suggest, help, cartesian and date tests cover it; run them before and after.

#### F18. Icon buttons and portrait paths, assembled by hand in many places (P6, S)

Where: `site/app.js:2065-2068` (`setErdButton`), `2072-2074` (`applyMood`), `site/learn/exercises.js:145-149`
(`setErd`): the same innerHTML + `title` + `aria-label` triple; `ICON_ATTRS` in `site/app.js:2048` and
`site/admin.js:46`; `"portraits/" + x + ".jpg"` built at `site/app.js:100`, `179`, `1409`, `1437`, `1448`, `1640`.

Restructuring. `ui.js` `setIconButton(btn, { html, label })` and the one `ICON_ATTRS` (admin.js imports it from
`./ui.js` once F3 lands); `suspects.js` `portraitSrc(name)` over one `PORTRAITS` map that already includes the
Comtesse (so `CARD_FACES` is that map).

Tests: `themeButtonHtml` and `erdButtonHtml` tests unchanged; the case-card picture test unchanged.

#### F19. Two more local copies of shared code (P6, S)

Where: `site/app.js:2088-2095` (`askPassphrase`, a hand-rolled version of `shared.js` `askDialog` with the input
cleared); `site/app.js:2105-2113` (`jumpToChapter`) and `2181-2186` (boot): the same "fresh state with chapters
1..n-1 solved, part2 past 8, no persistence, quiet stats" built twice.

Restructuring. `askPassphrase` becomes `askDialog($("passgate"), null, () => prompt(...))` after clearing the
field (the game keeps its once-per-load, never-stored passphrase; do not switch it to `deskPassphrase`, which would
keep it per tab). One `debugState(n)` used by both paths.

Tests: the passgate grep test and the `?chapter=N` test stay.

### P7. Legibility

#### F20. Stale comments and indirect calls (P7, S)

- `site/app.js:1712`: "Task 7 badge hook; define as an empty function here" is a plan-era note; `afterWrong`
  exists. Delete.
- `apps_script.gs:189-190`: the `get_` header still says `?seasons=1` returns every record and no parameter every
  row; both now need the key. Say so.
- `site/app.js:1410` (`$("btn-suspects").click()`) and `1477` (`$("btn-reset").click()`): handlers reached by
  synthetic clicks. Name them (`openSuspects()`, `askReset()`) and call them.
- Two unrelated `tablesIn` (`site/app.js:1270`, regex on FROM/JOIN; `site/learn/exercises.js:52`, word match over
  known names). After F2 the terminal's keeps the name; rename the exercises one `tablesNamed`.

## Fix batches

Each batch touches its own files, so batches 1 to 4 can run in parallel once batch 0 has landed. CLAUDE.md is
edited only by the coordinating main session after each batch merges (each batch reports the lines to change).

| Batch | Findings | Files (exclusive) | Size |
|---|---|---|---|
| 0. Prerequisites (first, alone) | F3, F15 | `.github/workflows/pages.yml`, new `version_site.mjs`, `test_site.mjs` split into `test_site.mjs` / `test_desk.mjs` / `test_handbook.mjs` | S-M |
| 1. Game and terminal | F1, F2, F6, F9, F10, F11, F12, F17, F18 (game side), F19, F20 (app.js items) | `site/app.js`, new `site/strict.js`, `site/terminal.js`, `site/ui.js`, `site/onboarding.js`, `site/badges.js`, `site/endings.js`, `site/suspects.js`, `site/learn/exercises.js`, `site/stats.js`, `test_site.mjs` | L (do in order: strict.js, terminal.js with F1, the rest) |
| 2. Desk front-end | F4, F7, F8 (admin.js), F14, F16 | `site/monitor.js`, new `site/charts.js`, `site/explore.js`, `site/admin.js`, `site/shared.js`, `test_desk.mjs` | M-L |
| 3. Backend | F8 (`admin_`), F20 (`get_` comment) | `apps_script.gs`, `test_backend.mjs` (then `deploy.sh`) | S |
| 4. Handbook build | F5 | `colour_learn.mjs` (or `learn_pages.mjs`), `site/learn/*.html`, `site/learn/handbook.js`, `test_handbook.mjs` | M |

Notes: F18's `admin.js` import of `ICON_ATTRS` from `ui.js` is a one-line follow-up after batches 1 and 2 both
land. Batch 4 waits for the owner (F5). F12's test reads `monitor.js` but does not edit it.

## Needing an owner decision

- F1: unify the three editors' behaviour (exercises gains Enter auto-indent and the game's Ctrl+F caret; the
  prologue gains Ctrl+F, Tab indent, the cartesian guard and the date note), or keep today's differences as options.
- F3: versioning also `learn/theme.js` and `../style.css` on the handbook pages (cache only, nothing visible).
- F5: generate the handbook's dropdown, pagers and side menu from one table of contents, replacing the documented
  "chrome by hand" workflow.
- F7: Google's ad clicks and impressions leave the FEATURE USE users chart for their own small chart or line.

## Not findings

Checked and left alone: `deleteRows_` deleting the rows before the record is the retry-friendly order (a failure
half-way leaves the season listed, so Delete can be pressed again); `REPORT_DIMS` / `DIMENSIONS` living twice is
forced by Apps Script and pinned by a test; the pure-function discipline and the GA privacy rules held throughout
the day's code.
