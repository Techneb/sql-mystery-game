# SQL Mystery Game — design

*The Ritz Affair*: a browser game that replaces SQL Murder Mystery for the Albert School MSc SQL course.
Students play Inspector Ganimard's clerk in Paris, May 1912, and unmask Arsene Lupin with SQL, one
course construct per chapter.

Decided 2026-09-20 with the course owner. Supersedes `SQL/BACKLOG - SQL Mystery Game.md`.

## 1. Fixed decisions

| Topic | Decision |
|---|---|
| Universe | Arsene Lupin (Maurice Leblanc, public domain in the EU since 2012). No Netflix material. |
| Language | English only. French jokes allowed. All data pure ASCII (students type it). |
| Hosting | Public GitHub repo `Techneb/sql-mystery-game`, GitHub Pages serving `site/` from `main`. Static site, no build step. |
| Database | SQLite in the browser via `sql.js` (pinned cdnjs URL, SQLite >= 3.39 asserted at load). Built by `generate_db.py`, stdlib only, fixed seed. |
| Cheating | Answers are SHA-256 hashes in `chapters.json`; the generator source on GitHub reveals the plot and that is accepted. |
| Play setting | In class, in pairs, chapter N the week construct N is taught; 10-15 min per chapter. No completion tracking in learning mode. |
| Modes | **Investigate** (learning, chapters 1-12, no clock) and **Compete** (season database, Part I only, server-timed leaderboard via Google Sheet). |
| Not built | accounts, per-student culprit, French version, CodeMirror, frameworks, backend beyond the Apps Script. |

## 2. Story

### Cast

Paris, May 1912. The Comtesse de Cagliostro's sapphire, the *Blue Star*, vanishes from her second-floor
suite at the Ritz, Place Vendome, in the night of 17-18 May. Lupin's calling card is on the pillow.
The player is Inspector Ganimard's clerk. Six second-floor guests are the suspects:

| Guest | Role |
|---|---|
| Lord Ashcombe (GB) | innocent neighbour, Suite Imperiale; his balcony was used; his trunk carries the sapphire (ch. 9) |
| Paul Sernine (FR) | bait: Lupin's canonical anagram alias |
| Horace Velmont (FR) | bait: another canonical alias |
| Senor Raul Ortega (AR) | bait: signs "R.", orders Clicquot 1904 at 05:30, but coffee at 05:00 first |
| Senora Ines de Almagro (ES) | noise |
| **Rupert Blakeney, Esq. (GB)** | **Lupin**: English coat, English coins, signs "R." |

Supporting: Ernest Grimaud (jeweller and fence, 27 rue des Martyrs), Marcel Duroc (night porter),
Ashcombe's valet, "Mr. Grey" (Lupin's double, ch. 10), the Comtesse (the twist, ch. 12).

### Chapters

Every answer is the key to the next chapter. Each chapter has one trap that makes the taught construct
necessary. "Tables revealed" lists what appears in the ERD when the chapter opens.

**Part I — The Ritz Affair** (strictly within the course material)

| # | Construct | Beat and what the query finds | Answer | Tables revealed | Trap |
|---|---|---|---|---|---|
| 1 | SELECT / WHERE | The police report: Ritz, 18 May 1912, theft. Text: "porter heard the lift at 02:10; thief came over the balcony of the neighbouring suite" | report id | `police_report` | 3,000 reports, several at the Ritz on other dates |
| 2 | ORDER BY / LIMIT | Neighbouring suite = the priciest on floor 2 that night | `Lord Ashcombe` | `hotel_register` | prices are close; floor 2 only; six months of registers |
| 3 | LIKE | Ashcombe's interview: valet saw a man in an English coat take a cab, "plate 75-2 something". Then the cab from Place Vendome after 02:00 | `75-2041` | `interview`, `cab_ride` | 40 plates start with 75-2; one from Vendome that night |
| 4 | GROUP BY / HAVING | That cab's week: the drop-off address visited 3+ times | `27 rue des Martyrs` | none | 60 rides that week; two addresses twice, one three times |
| 5 | JOIN (2 tables) | Who lives there: a boarding house; the tenant whose occupation is jeweller, Ernest Grimaud, known fence | `Ernest Grimaud` | `person`, `address` | 5 tenants; `occupation` is on `person`, the address on `address` |
| 6 | JOIN (3 tables) + SUM | Grimaud's bank: person -> account -> transactions in May; the counterparty account he paid the most to in total | `88213` | `bank_account`, `bank_transaction` | many small payments elsewhere; the largest single payment goes to another account, so `SUM` not `MAX` |
| 7 | CASE WHEN | Telegrams from the Ritz desk on 18 May classified night/morning/afternoon/evening; the single night one reads "PAYMENT TO 88213 RECEIVED STOP CLICQUOT 1904 AS ALWAYS MY FIRST ORDER BEFORE DAWN STOP - R." | telegram id | `telegram` | times are `HHMM` integers; needs buckets; 80 telegrams that day |
| 8 | WINDOW `RANK()` + subquery | `room_service` on 18 May: rank each suite's orders by time; the suite whose rank-1 order is Clicquot 1904 before 06:00; its guest | `Rupert Blakeney` | `room_service` | Ortega's suite: coffee 05:00 then Clicquot 05:30. Without `PARTITION BY suite` two suites match |

Ending of Part I: the unmasking at the Gare du Nord. Blakeney bows and hands Ganimard an empty case.
Last telegram: "The Blue Star sends regards from London, my dear Ganimard. Chapter IX, if you dare."

**Part II — The Clerk's Own Investigation** (beyond the course; unlocked by a code hidden in a noise
telegram; grows past 12 the same way)

| # | Construct | Beat | Answer | Tables revealed | Trap |
|---|---|---|---|---|---|
| 9 | CTE + self-join / `NOT IN` | The Trunk: the sapphire left in Lord Ashcombe's own luggage on the boat train to London | trunk number | `train_ticket`, `luggage` | Ashcombe has several trunks; one was checked by someone else's ticket |
| 10 | `NOT EXISTS` / self-join | Never Seen Together: Blakeney and "Mr. Grey" stayed at the Ritz in alternating weeks since January and never overlapped by one night | `Mr. Grey` | none | other pairs overlap by exactly one night |
| 11 | `LAG()` / gaps-and-islands | The Silence: per suite, the longest gap between any two events (room service, telegram, lift log) in the night; one suite is silent exactly 02:05-03:10 | suite number | `lift_log` | a noise suite has a longer gap, but outside the theft window |
| 12 | `WITH RECURSIVE` | Follow the Money: 88213 forwards the 40,000 F minus 2% per hop through seven shell accounts at four banks; the last account belongs to the Comtesse de Cagliostro, who staged her own theft for the insurance (as in Leblanc) | `Comtesse de Cagliostro` | none | one hop is split into two transfers (sum per hop); one shell account also receives unrelated money the same day (filter by amount within 1 F of 98%); the chain crosses into June |

Final telegram: "Insurance pays 300,000 for a stone worth 40,000, my dear Ganimard. Arithmetic is the
greatest of crimes. - A.L."

### Schema (13 tables)

`police_report`, `hotel_register` (carries `guest_name` directly, as 1912 registers did, so chapter 2
needs no JOIN), `interview`, `cab_ride`, `person`, `address`, `bank_account`, `bank_transaction`,
`telegram`, `room_service`, `train_ticket`, `luggage`, `lift_log`. Foreign keys declared in the DDL:
the ERD is drawn from them.

Conventions: dates `INTEGER YYYYMMDD`, times `INTEGER HHMM`, money `INTEGER` francs, ids `INTEGER`
primary keys, names in `TEXT`. No solution query needs `||`, `CONCAT`, `DATE_FORMAT` or `YEAR()`
(SQLite/MySQL portability, see the backlog's trap list).

Noise volume: `person` ~5,000, `cab_ride` ~20,000, `bank_transaction` ~30,000, `telegram` ~3,000,
`room_service` ~5,000, `hotel_register` ~10,000 (Jan-Jun 1912, needed by ch. 10), `lift_log` ~10,000. Enough that `SELECT *` without
`WHERE` is not a strategy.

Easter eggs in the data: a guest named after the teacher, Ganimard's cat in `person`, a noise telegram
"STOP READING THE NOISE AND JOIN STOP", the Part II code in a telegram addressed "TO THE CURIOUS CLERK".

## 3. Game rules

- **Answers** are normalised before hashing: trim, lowercase, collapse whitespace, strip punctuation,
  strip a leading "the", "suite", "no", "trunk". The objective always states the expected form
  ("Answer: the plate").
- **Witnesses (hints)**: three per chapter, revealed in order, written in character: the concierge
  names the table, the chambermaid the clause, Ganimard's notebook gives the query with blanks. No free
  hints, ever.
- **Wrong answers**: a one-line in-character reply. Each suspect's name has its own line (Sernine: "An
  anagram, Ganimard? Lupin is vain, not stupid."). Three wrong in a row: a Lupin telegram, nothing else.
- **Lupin's telegrams**: one after each solved chapter, typed in at ~40 chars/s, click to skip.
- **Case board**: one pinned index card per solved chapter with the answer.
- **Evidence arrives**: the ERD only draws tables revealed so far; a new table slides in with a "NEW
  EVIDENCE" stamp when a chapter opens. The database is complete from load (a student who reads
  `sqlite_master` sees everything; accepted, since every chapter needs the previous answer).
- **Badges**: detected once, from the query text, the result, or a counter; toast + end screen.

| Badge | Trigger |
|---|---|
| Tourist | `SELECT *` on a table over 1,000 rows |
| Needle | first query returning exactly 1 row |
| Haystack | a result hits the 200-row cap |
| First JOIN | first `JOIN` |
| Three's a Crowd | first query joining 3+ tables |
| Early HAVING | `HAVING` before chapter 4 |
| Aliased | first `AS` |
| Novelist | query over 15 lines |
| Haiku | a solving query of 3 lines or fewer |
| Typo | 5 SQLite errors in a row |
| Persistent | 20 queries in one chapter |
| Sniper | chapter solved on the first query |
| Insomniac | query run between 00:00 and 05:00 local time |
| Trespasser | queried a table not yet revealed |
| Archivist | queried `sqlite_master` |
| Anagram | answered Paul Sernine |
| Wrong Frenchman | answered Horace Velmont |
| Gentleman | answered Arsene Lupin |
| Window Shopper | `OVER (` before chapter 8 |
| Recursive | `WITH RECURSIVE` |
| Egg Hunter | entered the Part II code |
| Clean Sweep | Part I with zero hints |
| Ganimard | all 12 chapters |

- **Rank** (learning mode, end of Part I, from queries + hints; thresholds are one constant, to tune
  after the first class): <= 25 queries and 0 hints: *Ganimard himself*; <= 40 and <= 3: *Chief
  Inspector*; <= 60 and <= 6: *Inspector*; else *Constable*. Part II ranked separately.
- **Certificate**: `@media print` stylesheet, one page: pair names (typed at the end), rank, badges,
  chapters solved, date, in the newspaper style.
- **Notepad**: a `textarea` in the right column, autosaved to `localStorage`, printed on the certificate.
- **Reset**: "New investigation" wipes `localStorage` after a confirm. The database is reloaded from
  the file on every page load, so it cannot be broken.

## 4. Compete mode

- **Content**: a *season* database built by `python3 generate_db.py --season N`: same plot, cast and
  constructs, but every planted value (plates, addresses, accounts, names of non-suspects, amounts,
  ids) is re-drawn from the season seed, and each chapter uses its **compete objective**, a different
  question on the same tables with the same construct (ch. 3 learning: the cab from Place Vendome;
  compete: the cab that dropped at Gare Saint-Lazare). Story text is templated from the planted
  values. Learning-mode queries and answers solve nothing.
- **Flow**: landing page offers Investigate / Compete. Compete asks for a team name, POSTs `start`
  (team, season) to the Apps Script, which stamps the server time; the game runs Part I only with
  `season-N.sqlite` and `season-N.json`; solving chapter 8 POSTs `finish` (team, season, hints, wrong
  answers, queries). Adjusted time = server finish - server start + 2 min per hint + 10 s per wrong
  answer. Queries are free.
- **Leaderboard**: `leaderboard.html` reads the Apps Script `doGet` (JSON of the sheet) and sorts by
  adjusted time per season. Refreshes every 30 s. Also shows unfinished teams with chapters solved.
- **Backend**: `apps_script.gs` in the repo, a ~40-line Google Apps Script web app the teacher pastes
  into a Sheet: `doPost` appends a row (`timestamp, event, team, season, hints, wrong, queries`),
  `doGet` returns rows as JSON. The deployment URL is one constant in `app.js`. Moderation = delete rows
  in the Sheet. Anti-cheat is the server timestamp and the re-seeded content, nothing more.
- Learning-mode progress and compete progress are separate `localStorage` keys.

## 5. Layout and look

Chosen from browser mockups (`.superpowers/brainstorm/`, gitignored):

- **Look**: 1912 newspaper, cream paper (`#f3ead7`), black serif (Playfair Display for mastheads,
  Cormorant Garamond for body), red ink accents (`#8a2b2b`), typewriter font (Special Elite) for
  telegrams and the terminal. The query box is a black terminal (`#0f0d0a`, gold text). Google Fonts
  only, no artwork. Animations: telegram typing, index card drop onto the board, evidence slide-in,
  CASE CLOSED stamp, all CSS.
- **Layout**: masthead "LE PETIT JOURNAL - PARIS - <story date> - THE RITZ AFFAIR - CHAPTER n OF 12",
  then three columns. Left: the full ERD with every column, scrolling, only revealed tables drawn.
  Centre: terminal (textarea, Run, Ctrl/Cmd+Enter), results table (200-row cap, "N more rows"), raw
  SQLite error, answer box + Submit, query history (last 20). Right: chapter title, story, objective,
  witnesses, case board, latest telegram, notepad. Under ~900 px the columns stack ERD / terminal /
  story. Usable at phone width with 16 px gutters.
- **ERD**: inline SVG generated by the generator, auto-laid out: tables layered by FK depth (no FK ->
  layer 0; a table sits one layer below the deepest table it references), ordered within a layer by
  the barycentre of their parents, boxes sized by column count, FK edges as red paths from FK column
  to PK. Each table `<g data-table="...">` so the page can hide unrevealed ones. Optional manual
  position override per table for when auto-layout looks wrong.

## 6. Repository

```
SQL-Mystery-Game/
  generate_db.py        the whole plot as data + builder + self-checks (stdlib only)
  solution.sql          reference path, one query per chapter and variant (public repo; accepted)
  apps_script.gs        leaderboard backend, pasted into a Google Sheet
  site/
    index.html          landing + game (one page, mode chosen at start)
    leaderboard.html
    app.js  style.css
    mystery.sqlite  chapters.json  schema.svg
    season-N.sqlite  season-N.json           (one pair per season)
  docs/superpowers/specs/  this file
  README.md  CLAUDE.md  .gitignore (.superpowers/)
```

### `generate_db.py` — one source of truth

Holds, as data: the cast; for each chapter, title, story, objective (learn and compete), answer form,
three witness hints, wrong-answer lines, tables revealed, taunt telegram, **solution SQL (learn and
compete)**; the badge list; the noise sizes; the seed. It then:

1. builds the schema (DDL with PRIMARY KEY / FOREIGN KEY) and the noise from `random.Random(seed)`;
2. plants the clues, templating story text from the planted values;
3. **self-checks**: runs every solution query, asserts exactly one row with the expected answer;
   asserts every trap bites (the naive query for each chapter returns the wrong count, e.g. chapter 8's
   without `PARTITION BY` returns 2 suites); asserts no chapter answer is reachable from the tables
   revealed before its chapter without the previous answer (spot checks written per chapter);
   asserts all text and data are ASCII;
4. writes `mystery.sqlite` (or `season-N.sqlite`), `chapters.json` (all text + SHA-256 of each
   normalised answer, never the query), `schema.svg`, `solution.sql`, and
   `../SQL/3-Corrections/8. Correction SQL Mystery Game.sql` when that folder exists.

`python3 generate_db.py` is the test suite: it fails loudly if the plot breaks. The answer
normalisation function lives in Python and is mirrored in JS; a fixture of 10 inputs/outputs is
written into `chapters.json` and checked by the page at load in a debug mode (`?selftest`).

### Site

Vanilla HTML/CSS/JS. `sql.js` loaded from cdnjs (pinned). Progress, notes, history, badges, counters
and compete state in `localStorage`, wrapped in try/catch. SHA-256 via `crypto.subtle`. No
framework, no bundler.

### Course folder ties

`SQL/3-Corrections/8. Correction SQL Mystery Game.sql` (generated), `SQL/0-SQL.md` link replaced,
`SQL/BACKLOG - SQL Mystery Game.md` marked superseded by this spec.

## 7. Phases

1. **Plot + generator**: schema, noise, 12 chapters (learn variant), self-checks, `chapters.json`,
   `schema.svg`. Done when `python3 generate_db.py` passes and `solution.sql` reads as a coherent story.
   **Done** (PR #1). Amended 2026-09-22 (`2026-09-22-part1-multi-query-chapters-design.md`): every
   Part I chapter now needs a discovery query first, hints removed for now.
2. **Site MVP**: layout, terminal, answer flow, ERD reveal, case board, telegrams, notepad, hints,
   badges, rank, certificate. Done when Part I is playable end to end in Chrome, Safari, Firefox, and at
   phone width. **Done** (PR #2), played end to end via a real Chrome instance 2026-09-22.
3. **Compete**: compete objectives + solutions, season build, Apps Script, leaderboard page.
   **Done.** Content and backend PR #5 (2026-09-22; compete objectives given the same multi-query
   treatment as learn mode); the in-game button, clock and event posting 2026-09-22
   (`2026-09-22-plan-4-compete-button.md`, played end to end in Chromium against a stand-in Apps
   Script). A season is opened by listing it in `seasons.txt` and shared as `?season=N&board=<url>`;
   without a link, Compete asks for the season number.
4. **Publish**: GitHub Pages, course-folder ties, README, one class trial, tune rank thresholds and
   hints from where students got stuck. **GitHub Pages live** since 2026-09-22 at
   <https://techneb.github.io/sql-mystery-game/> (Actions build, `.github/workflows/pages.yml`, since
   classic deploy-from-branch cannot serve `/site` as a subfolder). **Course-folder ties done**: 
   `../SQL/0-SQL.md` links the game, `../SQL/BACKLOG - SQL Mystery Game.md` is marked superseded, and
   `../SQL/3-Corrections/8. Correction SQL Mystery Game.sql` regenerates automatically whenever
   `generate_db.py` runs on a machine with that folder present (it is not a git repo, so this is
   local-only, not tracked here). Still open: a class trial and tuning `RANKS`/badges from it.

## 8. Backlog (not scheduled)

- **Translate the site into multiple languages.** Note the tension with section 1's fixed decision
  ("Language: English only... Dropped: French version") - revisit that decision explicitly before
  scoping this, rather than treating it as already superseded.
- ~~Visual identity per chapter.~~ Implemented 2026-09-22, course owner's call ("do what you think
  is best"): a mockup pass first (`docs/mockups/illustrations.html`), then built into the live site
  from it. Decisions made:
  - **Style C** (engraved line + one accent-colour wash) from the mockup's three options, hand-drawn
    inline SVG, no asset files -- twelve chapter props (`PROPS` in `site/app.js`), one per chapter,
    shown next to the chapter title (`#chapter-icon` in `index.html`, `.chapter-icon` in `style.css`).
  - **Night mode: whole page**, not story-column-only. `site/style.css`'s `:root[data-mood="night"]`
    overrides the existing colour tokens (`--paper`, `--ink`, `--card`, `--rule`, `--shade`, `--term`,
    `--term-text`, `--accent`), so everything already styled off those tokens shifts for free; `body`
    gets an 0.8s transition so the switch reads as a crossfade. Set once, in `applyMood()`, the moment
    the Part II code is accepted, and re-applied on every boot/resume so a reload keeps the mood.
  - **Masthead date** advances to 19 May for Part II (also in `applyMood()`).
  - **Case board: kept the existing cards**, did not build the pinboard. The board's entries are not
    uniformly people (an account number, an address, a telegram id have no portrait), so a
    photo-per-suspect pinboard would need an answer-type-to-icon system the data doesn't support
    without new complexity; reskinned the existing dynamic cards instead (cork-textured board
    background, a pin dot per card) for most of the visual gain at a fraction of the code.
  - **Portraits and the red thread: not built**, as a consequence of keeping the plain cards -- no
    photos, so no thread between them. Revisit only if the pinboard itself gets built later.
  - 2026-09-22, course owner, later the same day: suspects get **painted portraits with a high level
    of detail**, photorealistic (photograph-level detail, painted surface), not silhouettes and not a
    stylised vector face. Candidate painting styles are in the mockup's section 7 and rendered, one
    sitter six ways in day and night editions, in `docs/mockups/portrait-styles.html` (the vector
    stand-in there is rejected as a look). The style, the asset source and the day/night treatment are
    still to pick; the first real generated or commissioned Ashcombe is the next step.
  - 2026-09-22, later still: a first real Ashcombe generated (Style A, grisaille oil) and shown to
    the course owner, day and night, per the mockup's own request for a judgement call before
    producing the rest of the cast. The course owner asked for a colour sample instead, named Sir
    John Lavery (already adjacent to the mockup's Style C, "society bravura", reference list); a
    second sample confirmed the mockup's own prediction about colour -- the shared night-mode filter
    (`hue-rotate` + `sepia`) cools it into a flash-photo look the monochrome style never had this
    problem with. **Decided: Lavery colour for the day edition; a separate, gentler filter for
    night** (`brightness(.85) saturate(.9) contrast(1.15) drop-shadow(...sapphire...)`, no hue
    rotation, so the warm paint tones survive and the glow ties into the existing sapphire night
    accent) rather than either reusing the page-wide night filter or generating a second image per
    sitter (doubling the asset count and risking the two not reading as the same sitter).
  - ~~Portrait implementation.~~ Done 2026-09-22/23: all six suspects generated in the confirmed
    style (`site/portraits/*.jpg`, ~35-55 KB each, a public no-login image endpoint, no accounts or
    paid services touched), plus Ganimard and the Comtesse (generated but not yet used anywhere).
    Two of the eight (Blakeney, Ganimard) came back as a painting-in-a-frame despite the prompt
    saying otherwise -- a model quirk, not fixed by more negative prompting, so both were cropped to
    match the other six instead of regenerated again. Shipped as a new **Suspects panel**
    (`#btn-suspects` next to the case board, reusing the ERD's existing enlarge/overlay pattern):
    `data.cast` (name, nationality, bio -- already sent to the client, never rendered until now) now
    renders as an oval-vignetted, lightly halftoned portrait grid, closable, with the night filter
    above applied under `[data-mood="night"]`. Blakeney ships from chapter I like every other
    suspect, per the "no face reads guiltier" principle the mockup's own asset section states.
    The other two found their slots the same day: Ganimard on the landing card (the text there
    already introduces him as the inspector who hired the clerk), Blakeney at the Part I ending (the
    Gare du Nord unmasking -- his face shown only once chapter VIII has named him) and the Comtesse at
    the Part II ending ("case closed, twice"), all via one `.portrait` rule floated into the running
    text. The generator's corner watermark was cropped off all eight files (a uniform 5% tighter
    frame, 3:4 kept), so the committed assets are clean, not just hidden by the oval mask.

- ~~Compete mode's in-game button.~~ Done 2026-09-22, see phase 3 and
  `docs/superpowers/plans/2026-09-22-plan-4-compete-button.md`. The season comes from the teacher's
  link (`?season=N&board=<url>`), or is typed when there is no link; there is no picker listing which
  seasons exist, since one class plays one season and the teacher already knows which.
