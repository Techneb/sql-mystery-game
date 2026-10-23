# SQL Mystery Game — design

*The Ritz Affair*: a browser game that replaces SQL Murder Mystery for an MSc SQL course.
Students play Inspector Ganimard's clerk in Paris, May 1912, and unmask Arsene Lupin with SQL, one
course construct per chapter.

Decided 2026-09-20 with the course owner. Supersedes `SQL/BACKLOG - SQL Mystery Game.md`.

**Amended since, body left as decided; the current state is in section 7 (phases) and section 8
(backlog), with the reasoning:**

- Part I chapters require a discovery query before the taught construct, and **hints are removed**
  (`2026-09-22-part1-multi-query-chapters-design.md`). Section 3's "Witnesses (hints)" describes the
  original design, not the shipped one; the `Clean Sweep` badge went with them and **rank counts
  queries only**. 2026-09-30: the dormant hint code (witness button, hint counts and penalty) was deleted
  outright; git history has it. The Apps Script keeps its `hints` column, now always 0, so the Sheet's
  format is unchanged.
- Section 5's "Google Fonts only, no artwork" no longer holds: twelve chapter props (inline SVG), a
  Part II night edition, a cork case board and painted portraits of the cast shipped 2026-09-22/23.
- Section 4's compete flow is link-driven: the teacher shares `?season=N&board=<url>`; the season
  number is typed only when there is no link. Events queue offline and retry.
- The `?chapter=N` debug jump and an `?admin` panel exist, both behind a passphrase.
- 2026-09-30, course owner: compete is played **individually**, not in pairs. The prompt asks for a
  player name and refuses one already used in that season (the leaderboard keys on name + season).
  Every deploy builds seasons 1-20; the `?admin` panel's Seasons section replaces `seasons.txt`.

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
| 6 | JOIN (3 tables) + SUM | Grimaud's bank: person -> account -> transactions in May; the counterparty account he paid the most to in total | `3213` | `bank_account`, `bank_transaction` | many small payments elsewhere; the largest single payment goes to another account, so `SUM` not `MAX` |
| 7 | CASE WHEN | Telegrams from the Ritz desk on 18 May classified night/morning/afternoon/evening; the single night one reads "PAYMENT TO 88213 RECEIVED STOP CLICQUOT 1904 AS ALWAYS MY FIRST ORDER BEFORE DAWN STOP - R." | telegram id | `telegram` | times are `HHMM` integers; needs buckets; 80 telegrams that day |
| 8 | WINDOW `RANK()` + subquery | `room_service` on 18 May: rank each suite's orders by time; the suite whose rank-1 order is Clicquot 1904 before 06:00; its guest | `Rupert Blakeney` | `room_service` | Ortega's suite: coffee 05:00 then Clicquot 05:30. Without `PARTITION BY suite` two suites match |

Ending of Part I: the unmasking at the Gare du Nord. Blakeney bows and hands Ganimard an empty case.
Last telegram: "The Blue Star sends regards from London, my dear Ganimard. Chapter IX, if you dare."

**Part II — The Clerk's Own Investigation** (LEFT JOIN and LAG are taught; only chapter 12, `WITH RECURSIVE`, is beyond
the course; unlocked by a code hidden in a noise telegram; grows past 12 the same way)

| # | Construct | Beat | Answer | Tables revealed | Trap |
|---|---|---|---|---|---|
| 9 | CTE + self-join / `NOT IN` | The Trunk: the sapphire left in Lord Ashcombe's own luggage on the boat train to London | trunk number | `train_ticket`, `luggage` | Ashcombe has several trunks; one was checked by someone else's ticket |
| 10 | `NOT EXISTS` / self-join | Never Seen Together: Blakeney and "Mr. Grey" stayed at the Ritz in alternating weeks since January and never overlapped by one night | `Mr. Grey` | none | other pairs overlap by exactly one night |
| 11 | `LAG()` / gaps-and-islands | The Silence: per suite, the longest gap between any two events (room service, telegram, lift log) in the night; one suite is silent exactly 02:05-03:10 | suite number | `lift_log` | a noise suite has a longer gap, but outside the theft window |
| 12 | `WITH RECURSIVE` | Follow the Money: the shell account (3213) forwards the 40,000 F minus 2% per hop through seven shell accounts at four banks; the last account belongs to the Comtesse de Cagliostro, who staged her own theft for the insurance (as in Leblanc) | `Comtesse de Cagliostro` | none | one hop is split into two transfers (sum per hop); one shell account also receives unrelated money the same day (filter by amount within 1 F of 98%); the chain crosses into June |

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
| Tourist | `SELECT *` returning 7 or more columns |
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

- **Rank** (learning mode, end of Part I, from queries; thresholds are one constant, `RANKS`): <= 45
  queries: *Ganimard himself*; <= 70: *Chief Inspector*; <= 110: *Inspector*; else *Constable*. Tuned
  2026-10-19 from the trial (GA4 `chapter_solve`, consenting players only: mean queries per solve, ch1-8,
  9.5 / 22.4 / 15.7 / 7.6 / 6.5 / 4.9 / 7.9 / 7.3, about 82 for Part I, 14 players solving ch1 and 6 ch8;
  played before errors counted as queries, so set generously). Was 25 / 40 / 60. Part II ranked separately.
- **Certificate**: `@media print` stylesheet, one page: pair names (typed at the end), rank, badges,
  chapters solved, date, in the newspaper style.
- **Notepad**: a `textarea` in the right column, autosaved to `localStorage`, printed on the certificate.
- **Reset**: "New investigation" wipes `localStorage` after a confirm. The database is reloaded from
  the file on every page load, so it cannot be broken.

## 4. Compete mode

*2026-10-10: superseded where they differ by `2026-10-10-compete-admin-design.md` (seasons as named records opened
and closed by the teacher, answers checked in the browser, a public projector board, an admin page).*

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
   Script). Since 2026-10-10 (compete v2, `2026-10-10-compete-admin-design.md`, merged and live): every deploy
   builds five databases, seasons are records the teacher creates, opens and closes on `site/admin.html`, and
   `site/leaderboard.html` is the projector board; the 1-20 seasons and the `?admin` Seasons section are gone.
4. **Publish**: GitHub Pages, course-folder ties, README, one class trial, tune rank thresholds and
   hints from where students got stuck. **GitHub Pages live** since 2026-09-22 at
   <https://techneb.github.io/sql-mystery-game/>, at <https://mystery.alephb.uk/> since 2026-09-29 (custom domain;
   the old address redirects) (Actions build, `.github/workflows/pages.yml`, since
   classic deploy-from-branch cannot serve `/site` as a subfolder). **Course-folder ties done**: 
   `../SQL/0-SQL.md` links the game, `../SQL/BACKLOG - SQL Mystery Game.md` is marked superseded, and
   `../SQL/3-Corrections/8. Correction SQL Mystery Game.sql` regenerates automatically whenever
   `generate_db.py` runs on a machine with that folder present (it is not a git repo, so this is
   local-only, not tracked here). The class trial took place (see below); what is left is at the end of this phase.
   2026-09-30: the course owner played chapters 1-2 as a student; the review was applied (bare objectives,
   English dates in statements, planted rows scattered, funnier noise, fitted schema, SQL colouring, Next
   chapter button, Badges panel, Day/Night edition button, formatted stories), then a ponytail audit
   removed the dormant hints code. 2026-09-30 to 10-02: the student-eye playtest went on through chapter 8
   (noise names, HH:MM times, cab currency, ch6 three-payment decoys, ch7 GROUP BY CASE with the letter in
   Ortega's suspect card, suspects met progressively, a guessing audit pinned as `traps`, schema redrawn).
   Chapters 9-12 were played as a student by the owner on 2026-10-09 (no interface complaint); known and accepted:
   ch11's answer is Lupin's own suite, already known from ch8.
   2026-10-03: a pre-class audit of the whole game (report kept out of the public repo, `docs/audits/`) and its
   fixes the same day: compete answers checked by the backend from hashes the deploy posts, validated rows and a
   start token, client timestamps on every event, planted ids scattered among the noise and the noise given the
   plot's NULLs, the chapter's construct under a Hint toggle, a Part II extra edition with the film and the
   ending; also the two closing films and the painted chapter icons (section 8). Declined by the owner:
   a help route after N wrong answers (would undo the 2026-09-30 hint removal) and sql.js in a Worker (the
   comma-join guard is enough). Compete stays honour-based against a student who posts a rival's start first.
   2026-10-09: the OpenGen source clips and uncropped originals moved from `~/Downloads` to the gitignored
   `assets-source/` in the repo (Mac only). 2026-10-10: a regression playthrough of chapters 1-12 on the live site
  (laptop width, both editions, the Part I and Part II endings) found nothing. Class trial (planned for 2026-10-14): students played the game, their reports came in 2026-10-15;
  the compete and admin design for it is `2026-10-10-compete-admin-design.md`.
  2026-10-16: the strict terminal (owner's decision: PostgreSQL is the yardstick, always on in learn and compete).
  `strictCheck` in `site/app.js` refuses, before sql.js runs it, what PostgreSQL would reject (ungrouped columns,
  HAVING and ORDER BY after grouping, DISTINCT with an unselected sort, double-quoted text, `==`, type clashes,
  aliases in WHERE/HAVING, non-boolean conditions, SQLite-only syntax), with PostgreSQL's error line, a plain-English
  fix and a link to the new handbook page `learn/grammar.html`; LIKE is case-sensitive and ILIKE is added, in the
  browser and in the build. A query that errors still counts but is no longer kept in History. Every plot query and
  `solution.sql` pass the checker (two rewritten: ch10's `SUM(condition)` trap, ch12's recursive seed cast to BIGINT).
  Checked in Chrome (refusals, ILIKE with ESCAPE, both editions). Kept on purpose although PostgreSQL accepts it: an
  INTEGER column against a quoted number is refused (a teaching rule, owner). The handbook page presents the rules as
  how SQL is written, never as a strict mode ("The Grammar of SQL", owner). A Fable review found no false refusal in
  1,100+ queries; its fixes (suggestions that run in sql.js, `::` and left/right refusals, the full schema in the
  plot-query test, a cached test build) shipped the same day, and the unused `admin: "update"` action was removed from
  `apps_script.gs` (redeployed by the owner).
  2026-10-15/16, from the class trial's student reports: the meaningless `police_report.id = interview.person_id`
  join no longer lists only the planted witnesses (guests trade census ids with the noise; a test covers every
  table), ch3's interview no longer reads as if the valet were at the Opera (a second 75-2 cab leaves Vendome that
  night), the schema shows each column's type, and an outside editor's English and coherence pass was applied
  (compete ch2 now has Ganimard's "Lupin has no friends, clerk, only names").
  `RANKS` tuned 2026-10-19 from the trial's GA4 query counts (the trial ran in learn mode, so the compete
  backend holds none; see section 3, Rank). Phase 4 is done.

Since phase 4 (2026-10-19/20, details in section 8): ads live with the house-ad fallback (verdict pending), the
handbook restructured (header, chapter dropdown, grammar in the chapters), the interactive exercises page, the
handbook review (Part 1) and bakery v2 with twenty exercises (Part 2) of `2026-10-19-bakery-v2-and-review.md`.
Everything is deployed (2026-10-20, 9f4e671).

## 8. Backlog (not scheduled)

- ~~Translate the site into multiple languages.~~ Dropped 2026-09-29, course owner: English only,
  section 1's fixed decision stands.
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
  - **Masthead date** advances for Part II (also in `applyMood()`; 21 May 1912 in the code today).
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

- ~~Redo three portraits: Ashcombe, Sernine, Ortega~~ Done 2026-10-02: the course owner generated all seven
  (the six suspects and the Comtesse) from `docs/mockups/portrait-prompts.md`, 1024x1024; white margins trimmed
  (Velmont's sides and corners, Almagro's bottom corners), centre-cropped 3:4, 450x600. Original note: (course owner, 2026-09-30: they read as the same
  lean, dark, moustached man, and Ashcombe should look about 55-60). Blocked: the free no-login endpoint
  (image.pollinations.ai, model flux) now answers 402 after one image. Generate elsewhere, square, same
  Lavery template (prompts: `docs/mockups/portrait-prompts.md`), distinct sitters (Ashcombe: elderly, white mutton-chops, monocle, ruddy; Sernine: ~30,
  fair, clean-shaven, boyish, grey suit and carnation; Ortega: stout, tanned, grey-streaked black beard,
  bald crown, cream linen). The endpoint renders square and stretches other sizes, which is why all
  seven files were squeezed back to square and centre-cropped to 3:4 (450x600) on 2026-09-30; crop new
  ones the same way, clear of the generator's corner mark.
- ~~Compete mode's in-game button.~~ Done 2026-09-22, see phase 3 and
  `docs/superpowers/plans/2026-09-22-plan-4-compete-button.md`. The season comes from the teacher's
  link (`?season=N&board=<url>`), or is typed when there is no link; there is no picker listing which
  seasons exist, since one class plays one season and the teacher already knows which.

- ~~Usage analytics~~ (course owner, 2026-09-30: how much the site is used, which chapters, how long a
  chapter takes). **Built and live 2026-10-03** (property `G-QG0K0D1NQZ`; banner, Consent Mode v2, the four
  events below, privacy.html rewritten; the owner chose 14-month retention and granular location, and
  registered the custom definitions; the school agreed). **Chosen route: Google Analytics 4** (course owner, same day). Notes for
  when it is built:
  - **What to measure.** Per chapter: how many players open it and solve it (the funnel, where
    students drop out), time from opening to solving (`state.opened[n]` is already recorded), queries
    and wrong answers before solving, badges earned. Per day: players, learn vs compete. Phase 4 needs
    the same numbers to tune `RANKS`.
  - **How, with GA4.** The `gtag.js` snippet in `index.html` (and `leaderboard.html` if wanted) with
    the course owner's measurement ID (`G-...`, public by nature, so it may be committed, unlike the
    Apps Script URL). Page views come for free; the chapter data needs custom events sent from
    `site/app.js`: `chapter_open` {chapter, mode}, `chapter_solve` {chapter, mode, seconds, queries,
    wrong}, `game_finish` {part, mode}, `badge` {name}. Register `chapter`, `seconds`, `queries` and
    `wrong` as custom dimensions/metrics in the GA admin, then a GA "Funnel exploration" over
    chapter_solve by chapter gives the drop-out curve, and "Free form" gives median seconds and
    queries per chapter. Keep every `gtag` call behind one small `track(name, params)` helper that
    does nothing when `gtag` is absent, so `node --test` and blocked-tracker browsers are unaffected.
    Never send the pseudo, answers or query text. cdnjs is the only script host today: add
    `www.googletagmanager.com` (and `google-analytics.com` for the beacons) to whatever the page allows.
  - **Consent: required.** GA4 sets cookies (`_ga`) and sends data to Google in the US, so in France
    the CNIL requires opt-in consent before it runs (EU-US Data Privacy Framework covers the transfer
    itself since 2023, not the consent). Use Google Consent Mode v2 with everything `denied` by
    default, and a one-line banner on the landing card ("Help improve the course: allow anonymous
    usage statistics? Yes / No"), remembered in localStorage; only a Yes loads full measurement. GA4
    already drops IP addresses; turn off Google signals and ad personalisation in the property,
    and set data retention in the GA admin (owner's choice 2026-10-03: 14 months, granular location and device data kept; privacy.html says so).
  - **Privacy page.** `site/privacy.html` currently says "no analytics, sets no cookies"; rewrite it in
    the same change: Google Analytics, the events and their fields, the cookie, consent and how to
    withdraw it, retention, Google as processor. Ask the school whether its policy allows GA for
    students at all before shipping.
  - **Not chosen, for the record.** Anonymous events to a second sheet of the existing Apps Script
    backend (no cookie, no consent banner, no third party, but the stats view has to be built);
    cookie-free hosted counters (GoatCounter, Plausible, Cloudflare), which count visits well but not
    chapter funnels without custom events.
- **Advertising** (course owner, 2026-10-03; refused 2026-10-11 as low-value content, re-review requested 2026-10-19, see below): ads live since 2026-10-19 (bdd594a: `AD_SLOT` set, house-ad fallback until Google fills the slot), verdict pending. GA4 is live with Google signals and ads
  personalisation off and Consent Mode v2 keeping `ad_storage`, `ad_user_data` and `ad_personalization`
  denied. Turning ads on needs, in one change: (1) a separate consent question in the banner ("Allow
  personalised ads?"), since the CNIL wants advertising consent asked apart from statistics, whose Yes alone
  grants the three ad fields; (2) the banner's "anonymous usage statistics" wording revised, as Google
  signals ties visits to Google accounts; (3) an advertising section in `site/privacy.html` (what Google uses,
  for what, how to withdraw); (4) in GA: Google signals and ads personalisation on, Google Ads linked under
  Administration > Associations de produits. Also decide where ads would show (never inside the game panes)
  and check the school is fine with ads shown to students.
  **Status 2026-10-03:** chosen product is **Google AdSense** (showing ads), not Google Ads (buying them),
  so step (4)'s Google Ads link is not needed. Done: AdSense account `pub-9765732642926043` for the root
  domain `alephb.uk` (subdomains included); verification meta tag on both `alephb.uk` (alephb-site repo) and
  the game; `https://alephb.uk/ads.txt` live; review requested; Google's certified consent message (GDPR,
  Accept and Refuse buttons, privacy URL the game's privacy.html) created in AdSense > Confidentialite et
  messages. The ad box exists: a `<details id="press-box">` under the schema, open on every visit (closing
  it is not remembered, owner 2026-10-19; it once was, in `ritz.ads`); hidden until 2026-10-19, it now shows a house ad
  for the handbook, and keeps it whenever no ad fills the box (owner): `site/handbook-ad.jpg`, a 1912 engraved advertisement with Ganimard (night
  print `handbook-ad-night.jpg`, swapped in by `data-mood`), the whole picture a link to `learn/` (OpenGen originals
  in `assets-source/ad/`). It is titled ADVERTISEMENTS in the typewriter face over a dotted rule (option D of a design
  canvas; AdSense permits only "Advertisements" or "Sponsored Links" as the label), and its names are neutral
  (`#press-box`, `.press-slot`, `.press-notice`) since ad blockers hid the old `.ad-box`/`.ad-slot`/`.house-ad`.
  **2026-10-09, while the review is pending:** a read-only readiness check (`docs/audits/2026-10-09-adsense-readiness.md`,
  local) found the reviewed URL alephb.uk showing a crawler 48 words and the game about 70 words of prose. Shipped the same
  day: the game's `<meta name="description">`, a closed "About this game" `<details>` on the landing card (347 words:
  chapter titles and constructs, how to play, Part II, compete, fiction notice; no clue values) taking the landing page
  to 583 crawler words, and privacy.html's Advertising section with Google's required wording (ads not loaded yet, said
  so). The supermain rewrote alephb.uk (about 200 words at the owner's request, bullets per project, no link to the
  unreleased project) and added alephb.uk/privacy.html with the advertising and consent wording and a footer nav.
  The owner pointed the AdSense consent message at https://alephb.uk/privacy.html the same day. Do not remove or
  re-add the site in AdSense while the review runs. **2026-10-10:** the medium lever shipped too: "The Clerk's
  Handbook" (`site/learn/`, rules in CLAUDE.md), a short index, the bakery example database and one page per
  construct (ten numbered chapters, a numbered menu band under the masthead, previous/next links, each page naming
  the game chapters it serves by numeral), linked from the landing footer and privacy.html, with `robots.txt` and
  `sitemap.xml`. Owner decisions on the way (2026-10-10): no How-to-play or For-teachers pages; chapter X's construct
  is "Self-join" everywhere (Hint, About table, handbook). The alephb.uk home page links it from the game's "Twelve
  chapters" bullet (supermain, alephb-site e7fe159, 2026-10-10). A quality pass the same day (44c4d32) re-ran all 43 examples
  against the bakery script (all matched; multi-row queries gained an ORDER BY), proofread the pages, and added four
  node tests pinning the page chrome, the pagers, the sitemap and the absence of game table and cast names.
  The code blocks are coloured at build time with the game's highlighter (`node colour_learn.mjs`, 72da87c, owner's
  request 2026-10-10), a test keeps them coloured, and the pages stay free of JavaScript.
  **2026-10-11: refused** for "Contenu a faible valeur informative" (low-value content) on alephb.uk (ads.txt
  authorised), seen in AdSense > Sites on 2026-10-16 (account signed in as the AlephB address, not the owner's
  personal one). Google's criteria: substantial unique value, a consistent web presence, and real user interest.
  A re-review can be requested from that page once fixed (requested 2026-10-19, below).
  2026-10-16: Search Console set up under the owner's personal Google account: URL-prefix properties
  https://mystery.alephb.uk/ and https://alephb.uk/, both verified by the same `google-site-verification` meta tag
  (keep it on both home pages); the game's sitemap.xml read, 14 pages. alephb.uk's home page links Play, About the game
  and the Handbook (owner: the page stays short, links not prose). Four new handbook pages (NULL, subqueries, dates
  and times, exercises; 15 pages in all) shipped 2026-10-17 after a browser check (phone width, night mode,
  closed solutions) and the sitemap resubmitted. A content review of all the new pages followed the same day
  (results checked cell by cell, no spoilers) and its fixes shipped: no promise that the examples run in
  PostgreSQL (plain SQLite needs `lower() LIKE` for ILIKE), the quoted-number refusal named as the terminal's own
  rule, no CTE on the dates page, exercises reordered by difficulty with each one's expected row count, a "By AlephB"
  byline on the handbook index (no date, owner), and alephb.uk's Ritz page privacy line completed. The owner brought the re-review forward
  (an influencer, Nick, will post about the site the week of 2026-10-19): requested 2026-10-19 after that day's
  fixes, site now "in preparation". Same day in AdSense: Auto ads confirmed off; the European regulations message
  (published 2026-10-09 for alephb.uk, privacy link alephb.uk/privacy.html, which links the game's page) kept;
  Consent Mode turned on for advertising and for analytics. The school agreed to ads (2026-10-19). Decided (owner,
  2026-10-19, before Nick's post): Consent Mode region defaults, everything denied in the EEA, UK and Switzerland
  until a Yes, analytics granted elsewhere by default (`consentDefaults()` in `app.js`); with ads off, the gtag
  script loads only after a Yes or when the browser's time zone is outside Europe (`europeanZone`), so nothing
  leaves a European browser before a Yes (the owner chose this over cookieless pings from Europe: same ads, no
  CNIL grey zone for the Paris students); once ads are live, the ad fields are granted by default outside Europe
  too, Google's message updating the European default.
  **Decided (owner, 2026-10-19): ads go live before approval, with the house ad as fallback.** Whenever Google
  does not fill the slot, the box shows the engraved handbook ad again: `initAds` adds the `<ins>` beside the
  house ad (hidden while the ad is tried, the slot keeping its 250 px min-height) and `adOutcome` (pure, tested)
  decides: Google's ad shows only once the `<ins>` reads `data-ad-status="filled"` with a height; `unfilled`
  (watched by a MutationObserver), an `adsbygoogle.js` that fails to load (ad blockers) or nothing filled after
  `AD_WAIT_MS` (4 s) removes the `<ins>` and brings the house ad back.
  **2026-10-10, the switch-on was prepared** on branch `claude/ads-switch-on`, merged into main 2026-10-19 (bdd594a; the school agreed that day to ads being shown to students, owner): `ADS_CLIENT`, `AD_SLOT`
  and `ADS_ON` in one block of `site/app.js`; with `ADS_ON` the page loads `adsbygoogle.js`, tries a
  responsive unit in `.press-slot` (house-ad fallback above), sets the region defaults (Europe all denied, waiting 500 ms for Google's message; everything granted
  elsewhere, where no message shows, 2026-10-19) and hands European consent to Google's message; the footer link becomes "Privacy and cookie settings" and reopens the message.
  **Decided (owner, 2026-10-19): nothing leaves a European browser before a Yes with ads on too.** Google's CMP
  loads but stays inactive before approval (seen that day from the UK: no message, consent status UNKNOWN), so the
  page uses Google's message only once its CMP is live within 3 s of the ads script and falls back to the game's own
  banner otherwise, and GA4 never loads in a European time zone before a Yes from whichever asks (the rule and its
  signals: CLAUDE.md, Ads);
  privacy.html is written for that state. Switch-on checklist (2026-10-10): ~~(1)~~ (done 2026-10-19, `AD_SLOT` 1774964634) AdSense > Ads > By ad unit: create
  a display unit (responsive) and copy its `data-ad-slot` into `AD_SLOT`; (2) ~~set `ADS_ON = true`~~ (2026-10-19: `ADS_ON` is `AD_SLOT !== ""`, step 1 does it; keep Auto ads off for the site, so ads appear only in the box); (3) ~~AdSense >
  Privacy & messaging > European regulations > Settings: the consent mode flags (ads and analytics storage),
  without which European visitors' choices never reach GA or the ads~~ (done: the owner turned Consent Mode on for
  advertising and analytics in AdSense on 2026-10-19); ~~(4) merge the branch into main~~ (done 2026-10-19, bdd594a); ~~(5) check day, night
  and phone width in Chrome, and that the house ad comes back with an ad blocker on~~ (done 2026-10-19/20 in the owner's
  Chrome: day and night prints, phone width, and the house ad with the blocker on, live); (6) confirm Google's consent message appears on the live site (from an EEA connection,
  in a private window) and that the footer link reopens it (blocked: Google's CMP stays inactive until approval); ~~(7) in AdSense > Privacy & messaging, point the consent
  message's privacy URL at https://mystery.alephb.uk/privacy.html instead of alephb.uk/privacy.html (owner,
  2026-10-10)~~ (done 2026-10-19, republished; ad unit "Ritz Affair - under the schema" = `AD_SLOT` 1774964634); (8) under Google's live message the landing footer reads "Privacy notice . Privacy and cookie settings" (owner, 2026-10-10:
  rename rather than drop the game's own link, Google requires the second title verbatim): ~~rename the handbook's
  nav and footer "Privacy" links to "Privacy notice" too~~ (done on the branch 2026-10-10, with admin.html, after main's
  compete v2 was merged into it).
- ~~House ad when no ad fills the box~~ (offered 2026-10-19; decided the same day, built on the ads branch: see
  above).
- ~~US state privacy message (CCPA)~~ Done 2026-10-19 (owner: set it up): "US states message - alephb.uk" published
  in AdSense > Privacy & messaging > US state regulations (opt-out, "Do Not Sell or Share My Personal Information";
  the AlephB mark uploaded as its 5:1 logo); privacy.html names its opt-out link (f4df8a2).
- ~~SQL branding on the landing page~~ Done 2026-10-19 (owner chose option A of four on a design canvas: a red
  band "A FREE GAME TO LEARN SQL" above the masthead, `.landing-band`; options B subtitle, C stamp and query, D band
  and subtitle were not taken) (Nick, the influencer, 2026-10-19: "your landing page should have a more
  obvious 'SQL' type branding so people can immediately see this is a tool to learn SQL"): the landing card leads
  with the 1912 story; make "learn SQL" obvious at first glance (headline or kicker), keeping the story. The owner
  replied that it would be done, ideally before his post. Show options as a design canvas first.
- **Design canvases** (2026-10-19): the ad box title (options A-D, D chosen) and the landing SQL band (A-D, A chosen)
  are kept as private artifacts (links in the session's memory, not here); delete them only when the owner asks.
- ~~Big UI/UX pass~~ (course owner, 2026-10-02): once the in-the-shoes-of-a-student review has covered
  chapters 9-12, do a whole-interface pass (layout, type scale, spacing, the terminal and answer flow,
  case board, Suspects and Badges panels, phone width, both editions), checked in a real browser. Small
  fixes keep landing during the review (section labels 11px -> 13px on 2026-10-02). Include the schema's gutter, where up to four
  relationship lines run close together since the 2026-10-02 links (suite hub, interview, cab dropoff, guest_card).
  **Done 2026-10-09** (the owner had played chapters 9-12 as a student the same day; audit in Chrome at 1440x723,
  student laptops being the target): the landing overlay scrolls when the card is taller than the window (the
  masthead was clipped and unreachable at 723 px); the schema rows follow reveal order (`erd.py`: each chapter
  appends its tables, lines may run upward, zero crossings), so chapter 1 shows two adjacent tables instead of a
  900 px frame; the legend adapts to the visible schema and gained one-to-one; the schema box scrolls itself to
  the chapter's new tables; results capped at 36vh so the reply and Next button stay on screen; chapter icons
  56 px; phone column order story, terminal, schema; the Hint toggle reads two labelled rows; case board cards
  from saves older than the answers field no longer print NULL. Checked and left as is: night tokens, story
  tables, telegram slip, Suspects and Badges panels. The phone order was then checked on the owner's phone (2026-10-09): story first. The same screenshot showed the
  Day/Night button overlapping the title on a 430 px screen, so both masthead buttons gained inline SVG icons
  (moon/sun swapping with the label, a magnifying glass with a plus for New investigation) and are icon-only
  32 px squares in the corners under 900 px.
  Later the same day the owner asked for less aggressive edges: four radius scales were mocked up on a design
  canvas (A square, B 3 px, C 6/8/10 px, D 10-14 px with pill buttons) over the real components in both editions,
  and the owner chose **C**: 6 px boxes, buttons and inputs, 8 px terminal, results, panels and slips, 10 px cards,
  badges, dialogs and the landing card, softer card shadows, rounded ERD table boxes; the masthead rule, portraits,
  drop caps and the stamp stay as they are. Also decided then: section labels (OBJECTIVE, SCHEMA...) in bold
  Playfair; the Enlarge button icon-only; Badges and Suspects buttons with icons beside their text. Decided (owner, 2026-10-09): chapters 4, 10 and 12 reveal no new table, so nothing is
  outlined or scrolled to there, and it stays that way: the schema never points at the tables a solution uses,
  finding the right table is part of the work.
- ~~Closing videos for Part I and Part II~~ (course owner, 2026-10-02): write the generation prompts for a short
  video (or a sequence of still images, cross-faded) in the portraits' Lavery style, one to close each part.
  Part I: the boat train at the Gare du Nord, 20 May 1912, Ganimard's hand on Blakeney's shoulder, the empty
  velvet case, the train pulling out (it would sit at the top of the Chapter VIII extra edition, `showExtra`).
  Part II: the Comtesse receiving Ganimard in her suite, the insurance papers, Lupin's telegram from London and
  the Blue Star re-set as a ring (after chapter XII). Keep each to a handful of shots, silent, with captions in
  the paper's voice; plan for a still-image fallback so the page stays light. Prompts written 2026-10-02 for OpenGen: `docs/mockups/video-part1.md` and `video-part2.md`
  (seven shots each, keyframe then image-to-video, captions added afterwards, stills fallback).
  **Done 2026-10-03:** both films are live (`site/video/part1.*`, 29 s; `part2.*`, 41 s), narrated, with
  dialogue and burned-in subtitles; the arrests are shown (Blakeney handcuffed, the Comtesse led away). See
  `docs/mockups/video-part1.md` and `video-part2.md`.
- ~~Chapter icons as images~~ (course owner, 2026-10-02): replace the twelve single-line SVG props (`PROPS` in
  `site/app.js`, e.g. chapter 8's bottle and glass) with small images generated the same way as the portraits
  (OpenGen, Nano Banana Pro, the Lavery style frame as reference), one per chapter, transparent or on the
  paper colour, legible at the chapter header's size and in the night edition. **Done 2026-10-03:** made by
  the owner from `docs/mockups/chapter-icon-prompts.md`, background cut to transparency, `site/icons/chNN.png`;
  `PROPS` removed.
- ~~Compete mode simplification~~ (course owner, 2026-10-10): brainstorm before the class trial how to simplify
  compete mode (today: a teacher's `?season=N&board=<Apps Script URL>` link, the Apps Script backend with its
  Script Properties and posted hashes, the admin panel's Seasons and Settings, the leaderboard page, the start
  token and the honour-based start). Designed 2026-10-10 with the owner: `2026-10-10-compete-admin-design.md`
  (that document supersedes section 4 where they differ). **Done 2026-10-10** (merged into main and live
  before the trial).
- ~~Admin space~~ (course owner, 2026-10-10): one teacher-facing place to manage seasons (create, share, close),
  read the compete data from the Google Sheet behind the Apps Script, and show a live leaderboard on the classroom
  screen during a session. Today these are spread over the `?admin` panel (Seasons, Settings, passphrase-gated),
  the standalone `leaderboard.html` (one season, polled) and the Sheet itself. Designed 2026-10-10 with the owner:
  `2026-10-10-compete-admin-design.md`. **Done 2026-10-10**: `site/admin.html` ("The Clerk's Desk") and
  `site/leaderboard.html`, live before the trial.
- **Outreach** (course owner, 2026-10-18): the owner drafted an email to Nick (softwarewithnick, a software content creator
  whose video promoted SQLBolt; the owner named the site "sqlbot.com", which did not load) to share the game for
  free, no sponsorship asked; sent 2026-10-19. Agreed: a GA4 review after his post. He replied the same day that he will probably post about it that
  week, then asked for more obvious SQL branding on the landing page (done the same evening, the owner's reply sent); the owner wants ads live by then (the ads branch is up to date, AdSense approval is the blocker). The site may show ads later (AdSense pending): if asked whether it
  earns money, say so.
  Nick's video went out Wed 2026-10-21. GA4 on 2026-10-23: about 1,300 users in 7 days (about 220 on the 20th, 680 on
  the 21st, 540 on the 22nd), 83% Direct, US 38% and India 12%, about 4 min average engaged time. Funnel: 474 opened
  chapter 1, 127 solved it (27%), 72 solved chapter 2, 19 finished Part I, 2 finished Part II. Queries per solve run
  far above the class trial (Part I about 120), so `RANKS` (45/70/110) now makes most players Constable. Offered, not
  decided: retune `RANKS` from this data, and look into the chapter 1 drop-off. AdSense still showed the site as under
  review that day, so the visit brought no ad revenue (the house ad showed).
  Next wave (owner, 2026-10-23): 15 contact emails drafted for similar creators and newsletters, to send **only once
  real ads are live**. They are in `assets-source/outreach/` (gitignored, owner's Mac only; they hold creators'
  addresses: never commit them). Before sending, refresh the visitor figure and each creator's recent post. The owner
  sends them.
- ~~Handbook ideas from SQLBolt~~ Done 2026-10-18 (owner asked to implement them): sqlbolt.com, a free 18-lesson SQL tutorial, is a
  complement, not a rival. Ideas worth taking, never its text or exercises: (a) a page on `UNION` / `INTERSECT` /
  `EXCEPT`, which the handbook does not cover; (b) a findable "order of execution" page or anchor (only mentioned
  in passing on the GROUP BY, CTE and grammar pages today); (c) a "try it" line at the end of each construct page
  linking its exercise on `exercises.html`. Not worth taking: its INSERT/UPDATE/DELETE/CREATE lessons (the game's
  database is read-only on purpose). Built 2026-10-18 (all three, in our own words and bakery examples):
  (a) `learn/set-operations.html` ("UNION, INTERSECT and EXCEPT", menu 12, between Subqueries and Windows; game
  label XII only: naming XI would say its puzzle stacks ledgers, which its Hint does not) and a fifteenth exercise, "Not on the weekend menu" (EXCEPT, Practice); (b) an "Order of
  execution" section at the top of `grammar.html` (`#order-of-execution`), linked from the GROUP BY, ORDER BY,
  window and CTE pages; (c) a "Try it" line on each construct page, linking exercises by their new slug ids.
  Deployed 2026-10-18 (5b51d31; 16 handbook pages), checked in Chrome on desktop in the night palette and at 390 px
  (2026-10-19, no overflow); Search Console had re-read the sitemap (19 pages) and indexing of the new page was
  requested 2026-10-19. Built 2026-10-19: strictCheck refuses a UNION, INTERSECT or
  EXCEPT that puts a text column against a number in one position (PostgreSQL's "UNION types text and
  integer cannot be matched"; SQLite runs it); NULL, quoted literals and unknown types pass.
- ~~Bakery schema and interactive exercises~~ Done 2026-10-19 (owner's request the same day; live, current rules in
  CLAUDE.md, Handbook; the counts and question numbers below are those of the fifteen v1 exercises): `erd.py` draws the bakery database too (`bakery_conn` reads `learn/database.html`'s
  script; a table that refers to itself, `customer.referred_by`, gets a loop beside it), and `python3
  generate_db.py` inlines the svg between `<!-- bakery schema: erd.py -->` markers in `database.html` and
  `exercises.html` (a unittest checks the lines, the widths and that the pages carry the current drawing).
  `exercises.html` keeps its fifteen static questions and solutions; `learn/exercises.js` (the handbook's only
  script) adds a workbench above them: schema, terminal (sql.js, the game's `strictCheck`, `cartesian`,
  `terminalDb`'s query_only and LIKE settings, `highlightSql`, Ctrl+Enter, Ctrl+F, refusals linking
  `grammar.html#<anchor>`) and a question picker that checks every result against every solution run in the
  browser: same rows (count and values as a multiset; in order only for `data-ordered` questions, 1, 2, 5 and 7),
  column names and order ignored, extra columns allowed, `data-need` naming the solution columns a question
  really asks for (2, 3, 10, 13, 14), numbers within 1e-6 (`data-tolerance="0.01"` on 10, whose average the
  question does not ask to round). Solved questions get a tick, kept in `ritz.exercises`; `#<slug>` selects a
  question. The deploy versions `exercises.html`'s scripts and `exercises.js`'s `../app.js` import.
- ~~Handbook chrome, grammar and exercises pass~~ Done 2026-10-19/20 (course owner, 2026-10-19; merged b028951, live):
  the masthead nav keeps Game, The Clerk's Handbook and The Clerk's Desk, the footer keeps all six links
  (learn pages and `admin.html`); the numbered menu becomes "Index . Learning chapters . Exercises . Grammar",
  Learning chapters a `<details>` dropdown that works without JavaScript. The grammar rules move to their
  construct pages with their anchors and wrong examples (`colour_learn.mjs` writes refusals on any page);
  `grammar.html` is a hub (order of execution, the list of rules, other shorthands) and `STRICT_SECTIONS`
  links each refusal to its section. `exercises.html`: How to use folded away, Warm-up / Practice /
  Challenge buttons over the picker, a green Solved mark, a HISTORY under the terminal
  (`ritz.exercises.history`), the game's ad box under the schema (the only ad in the handbook; privacy.html
  says so), and the static questions hidden once the workbench is up, so a `#slug` link lands on it. Later
  owner requests on the live page (2026-10-20): subtitle and intro removed, How to use as five steps in the
  question column, a wider schema column, the workbench centred so the enlarged schema fills the window.
- ~~Handbook review (plan `2026-10-19-bakery-v2-and-review.md`, Part 1)~~ Done 2026-10-20: 0 wrong solutions, 30
  findings fixed, 5 moved to Part 2 (wrong prose and edge cases on the construct pages, the grammar sentences, ten exercise wordings
  tightened to one reading, `back-again` checks the order id too); the edge cases that need data the bakery does
  not have yet are the plan's "Planted cases from the review" (Part 2). The strict terminal now accepts
  PostgreSQL's `LEFT`, `RIGHT` and `x::type` (rewritten for SQLite by `toSqlite` and `generate_db.sqlite_sql`)
  and refuses `date()`/`time()` with a modifier. Owner requests of the same day on `exercises.html`: How to use
  under History (moved by the script, above the workbench without it), no idle or solved text in the status box
  (hidden when empty), the game's Enlarge button on the schema, no In the game line; the handbook index groups
  its pages as Exercises (a card), Grammar, then the learning chapters (reading order unchanged). A permanent test,
  `test_generate.HandbookResults`, reruns every example and solution and compares the pasted table cell for cell.
- ~~Bakery v2 (plan `2026-10-19-bakery-v2-and-review.md`, Part 2)~~ Done 2026-10-20 (owner accepted every default of
  the plan): `bakery.py` generates six tables over four weeks of March 2026 with the planted cases, `--paste`
  rewrites the result tables; every handbook page rewritten for it; twenty exercises (new: untidy-emails,
  the-price-rise, the-staff-room, money-back, shutters-down, which asks for Hillcrest so the Fridays alone are
  wrong). The same day: a Day/Night edition button on the handbook, desk and board (`learn/theme.js`, sharing
  `ritz.theme`), the landing card in the handbook's split header and footer, and the engraved house ad's line
  repainted to "Twenty graded exercises" in both prints (9f4e671; sources in `assets-source/ad/`).
- ~~`bakery.py` scaffolding~~ Done 2026-10-20: v1's schema, `LIVE` and `check(1)` dropped, the generator emits
  v2 only (its first-week rows renamed `FIRST_WEEK`); the script, every pasted result and the schemas unchanged.
- ~~Blind check of the five new exercises~~ Done 2026-10-20: two independent solvers, 10 of 10 answers match the official
  results under the page's own check; The price rise now says one row per product and price paid.
- Query funnel and monitoring page (2026-10-23; GA showed 474 players opening chapter 1 and 127 solving it, with no way
  to tell the idle from the stuck). Built: the GA event `chapter_queries` {chapter, mode, count}, sent once each when a
  student's runs in the current, unsolved chapter reach 1, 5 and 20 (`queryMilestone`, `state.milestones`; privacy.html
  lists it); `apps_script.gs` answers `?stats=<days>&key=<passphrase>` (1-90 days, default 7, cached 10 minutes) from the
  GA4 Data API on property 557203749: users per day, the per-chapter funnel, devices, top countries, channels; and
  `site/monitor.html` (linked from the desk's seasons row) shows them. Owner steps before it reads anything: in the
  Apps Script editor add the Google Analytics Data API service (identifier `AnalyticsData`); if the script runs under
  another Google account, give it Viewer on GA property 557203749; register `count` as an event-scoped custom
  dimension in GA (the stats call fails until it exists); redeploy the script as a new version of the same
  deployment, keeping the /exec URL. The live GA call is untested (stubbed in `test_backend.mjs`).
- Monitoring charts and a pivot table (owner, 2026-10-23: "Create line chart for USERS PER DAY", "Convert chapter
  funnel into a nice chart as well", "a sub page with pivot table: several dimensions and several metrics in the same
  table, with filters on the side"). Built: users per day is an inline SVG line (hover strip per day, the table under
  a closed "The numbers"); the funnel is grouped horizontal bars per chapter, the five stages an ordinal ramp of
  `--rel` (validated light and night with the dataviz skill's script), Opened and the solve rate labelled, the table
  kept under it; both drawn at the box's width (no library). New desk page `site/explore.html` + `explore.js`
  ("Pivot table"; the desk menu row is now Setup . Monitoring . Pivot table): period (7/30/90 days or a custom
  range), dimension and metric pickers (order picked = column order), filters per whitelisted dimension (its values
  load when opened), a sortable table with GA's own totals (`metricAggregates` TOTAL, so users are not summed across
  rows), CSV in the browser. Backend `?report=<json>&key=` (`report_`): whitelisted names (`REPORT_DIMS`,
  `REPORT_METRICS`, the same lists as `explore.js`, a test compares), at most 9 dimensions and 10 metrics, filters as
  an andGroup of inListFilters, 10,000 rows, cached 10 minutes per normalised request (not cached above
  CacheService's 100 KB); GA's refusals come back as `{ok:false, error}`. Needs the script redeployed; the live GA
  calls are untested (stubbed), and whether GA accepts `customEvent:mode`, `part` and `name` depends on their being
  registered as custom dimensions.
- Monitoring status (2026-10-24). Done: the backend moved to the AlephB account (the one owning GA; the owner's
  personal-account project could not read GA), `count` registered in GA (2026-10-23; mode, part and the badge `name`
  were already registered), backend deploys scripted with clasp (`assets-source/clasp/deploy.sh`, see CLAUDE.md
  Status sources), the desk menu row Setup . Monitoring . Pivot table. The charts were reworked twice the same night
  (owner): users per day a line with an HTML tooltip (the first version relied on SVG `<title>`, which Chrome shows
  only after a still second); the chapter funnel vertical grouped bars (chapters I..XII, five categorical colours)
  with the retention line on a right axis (chapter N's openers / chapter I's; a dual axis against the dataviz
  guidance, kept because the owner asked); the solve rate its own line chart aligned under it; top countries as
  bubbles on a world map (`site/world.json`, 79 KB, Natural Earth 110m plus centroids under GA's English names);
  devices and channels as donuts; every chart with a closed Raw data table. `chapter_queries` reaches GA (Realtime,
  2026-10-23) but the Data API shows a new event only after up to a day; the funnel notes it while ran-N is empty.
  Open: the owner's look at the live pages with real data; archive the old backend project once no old link uses it.
