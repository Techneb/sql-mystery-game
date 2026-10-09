# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Browser SQL game for an SQL course. Spec: `docs/superpowers/specs/2026-09-20-sql-mystery-game-design.md`; plans in `docs/superpowers/plans/`.

## Commands

```bash
python3 generate_db.py                  # rebuild site/ outputs + solution.sql; fails if the plot breaks
python3 generate_db.py --season 3       # compete season: site/season-3.{sqlite,json} (gitignored)
for n in $(seq 1 20); do python3 generate_db.py --season $n || break; done   # what the deploy builds: run before every push
python3 -m unittest -v                  # Python suite (test_generate.py), ~2 min: it rebuilds the database
python3 -m unittest test_generate.Discovery.test_row_count_passes_and_fails   # one test
node --test test_site.mjs               # site pure functions, imports site/app.js directly, < 1 s
node --test --test-name-pattern normalise test_site.mjs                      # one site test
python3 -m http.server 8000 -d site     # play at localhost:8000 (file:// fails); ?selftest checks the fixture
```

Pages deploys `site/` on every push to `main` (`.github/workflows/pages.yml`, which first builds compete seasons 1-20) to <https://mystery.alephb.uk> (custom domain; DNS and the alephb.uk home page are managed from the owner's Compromise project, not here). A push is a live deploy to students: the course owner approves each one.

## Architecture

Python side (build time) -> static files -> browser side (runtime, no server):
- `plot.py` (story + SQL as data) and `generate_db.py` (values per seed, schema, noise, planting, self-checks) write `site/mystery.sqlite`, `site/chapters.json`, `site/schema.svg` (via `erd.py`) and `solution.sql` (it opens with the answer key in play order, the Part II code after chapter 8, then each chapter's discovery queries and solution). Generated files are committed because the site is static.
- `site/app.js` is one ES module: loaded by `index.html` in the browser (with sql.js from cdnjs) and imported by `test_site.mjs` in node, so pure logic is `export`ed and browser globals (`localStorage`, `document`) stay inside functions.
- Learn answers are checked client-side against hash lists (`answer_sha256`: `sha256(normalise(answer))` plus the surname alone for name answers; `part2_code_sha256`: the code with and without its leading STOP) in `chapters.json`, never plaintext. Compete season files ship no hash, only `hashes_sha256`, a fingerprint: the Apps Script checks compete answers against the hashes of `python3 generate_db.py --hashes` (seasons 1-20, deterministic from `plant_values`; Script Properties `HASHES_<season>` and `HASHES_FP_<season>`). The deploy posts them (`--post`, repository secrets `BOARD_URL` and `ADMIN_KEY`; the step says so and skips when they are unset); the admin panel's Settings compares fingerprints (`<board>?hashes=1`) and offers the paste as fallback. Without a `board=` link compete does not start.
- Compete: `apps_script.gs` is the Google Apps Script backend the page posts events to; `site/leaderboard.html` reads it.

## Invariants (the build or a test enforces these)

- Stdlib only, no build step. `python3 generate_db.py` rebuilds `site/` outputs and **is the test of the plot**: every solution must return exactly its answer and every trap must bite (the naive query, and each query in a chapter's optional `traps` list, must not yield the answer). `python3 -m unittest -v` pins the same plus normalisation and ERD layering.
- Any text or data must be pure ASCII: `LC_ALL=C grep -n '[^ -~]' plot.py generate_db.py erd.py solution.sql site/chapters.json` must print nothing.
- Never edit `site/chapters.json`, `site/schema.svg` or `solution.sql` by hand. Adding a chapter = one dict in `plot.CHAPTERS` (text + `solution` + `naive`) and its planting in `plant_part2`.
- Answer normalisation lives twice: `generate_db.normalise` and `site/app.js normalise`; `chapters.json.normalise_fixture` is checked by the page in `?selftest` mode. Change both together. Rules: lowercase `[a-z0-9]+` tokens; a lone letter glues to the digits after it before stop words go ("A-7", "A 7", "A7" -> "a7"); stop words include titles, honorifics and labels (lord, mr, m, monsieur, madame, countess, suite, room, trunk, wire, id, report, account, plate, paris...); a trailing "stop" goes when more than one token remains; all-digit answers are joined and lose leading zeros. The fixture must never contain a planted value or a cast name.
- Every Part I chapter withholds a constant and carries a `discovery` list (`discovery_compete` for the compete objective): `check_discovery` runs each query at build time and asserts the withheld fact is in the result (`must_contain`, case-insensitive) or the row count (`row_count`). A chapter whose clue stops being discoverable fails the build. `solution.sql` prints the discovery queries before the final one.
- Chapter stories never quote an earlier chapter's answer literally (the JSON ships every chapter); they say "the plate you found in chapter 3".
- Never refer to a planted row by a literal id outside `plant_part1` / `plant_part2` (see the id scheme under Plot and data).
- Debug entry points are gated: `?chapter=N` and the `?admin` panel both ask for a passphrase (`#passgate`, a native `<dialog>` with a password field, never `prompt()`) checked against `ADMIN_PASS_SHA256` in `site/app.js` (sha256 of the trimmed, lowercased passphrase, the form `apps_script.gs` compares; never the answer normaliser, whose rules change; the passphrase itself is never in the repo, ask the course owner). Neither writes to localStorage.
- Never commit a deployment URL (the Apps Script `/exec` URL is a live, unauthenticated write endpoint; it travels in links).
- Cache: the deploy step rewrites `app.js` and `style.css` in index.html/privacy.html to `?v=<commit>`, and `app.js` fetches its data files with the same query (`VERSION`), so a page never runs a stale cached script against new markup or data. Fetch any new same-site data file with `+ VERSION`.
- `site/privacy.html` describes exactly what leaves the browser (compete `eventPayload` with `clientAt`/`elapsedMs`, the compete answer check, the start token, the fonts/cdnjs/Pages requests, GA4 behind consent). Change it whenever what the game sends or loads changes.
- Analytics: GA4 `G-QG0K0D1NQZ` (`GA_ID` in `site/app.js`, public), loaded only after a Yes on the `#consent` banner (`ritz.consent`; the footer's Statistics link reopens it; No deletes the `_ga` cookies), Consent Mode v2 with everything denied by default. Events go through `track(name, params)` only: `chapter_open`, `chapter_solve` (seconds, queries, wrong), `game_finish`, `badge`; never the pseudo, answers or queries; off in `?chapter=N` debug mode. `?ga=G-XXXX` overrides the ID on localhost only. The GA property keeps 14 months and granular location (privacy.html says so); its custom definitions are registered.
- Ads: AdSense `pub-9765732642926043` on `alephb.uk` (approval pending; verification tag in `index.html`, `ads.txt` on alephb.uk). The ad box (`#ad-box`, a `<details>` under the schema, open by default, closed state in `ritz.ads`) stays hidden until `ADS_ON`; preview at `localhost:8000/?ads=1`. What is left after approval is in the spec's backlog (Advertising).

### Shortcut check

**Every puzzle is checked for shortcuts before it ships** (course owner, 2026-10-02: "always think of such when crafting problems"). For each chapter, try:
1. what the student already knows (earlier answers, telegrams, suspect cards and notes, stories, landing page) and whether it names the answer directly (an account number, initials, a suite);
2. LIKE on every word the story or landing page offers;
3. the obvious one or two filters, and small results to eyeball (a lone row, an odd weight, a lone ticket);
4. the plausible guess ("a thief wires at night", "the earliest champagne");
5. whether the taught construct is actually needed.

Each shortcut found becomes a decoy in the data and a query in the chapter's `traps`, so the build keeps it closed. Pinned so far:
- ch1 keyword LIKEs (Comtesse, sapphire, Blue Star, balcony, A. L., porter, lift, Duroc, pillow, calling card), each also with Ritz + theft, all answered only by the date;
- ch2 ORDER BY price without the date;
- ch3 pound fares without or on the wrong date;
- ch6 SUM without the count, ownerless accounts, PAYMENT wires;
- ch7 the night guess, the R. letter alone, the busiest box;
- ch8 the wire's suite, the earliest champagne;
- ch9 a trunk alone on its ticket, a holder seen once (his valet and maid, Hobbs and Pringle, hold their own tickets), any holder but Ashcombe;
- ch10 suite 214's guests, price 150, six-night stays;
- ch11 the lift around 02:10, a gap of exactly one hour spanning 02:10 (noise lift rounds are 01:30 / 02:20 / 03:30, so only 214's 65 minutes spans it; the last noise floor-2 suite skips the 03:30 round so the naive lift count still returns two suites; Velmont rings 01:50, 02:30, 05:55);
- ch1 and ch6 `ORDER BY id DESC LIMIT 1` (compete too); ch9 `address_id IS NULL`; ch10 `occupation = 'gentleman'` (Grey is a rentier, the noise has gentlemen); ch12 big transfers after the theft by date (12 noise transfers of 20-40 kF run 21 May-13 June), owned accounts above 60000, MAX(id); compete ch3 `dropoff_address_id IS NULL`.

Known and accepted: ch11's answer is Lupin's suite, already known from ch8.

## Plot and data (`plot.py`, `generate_db.py`)

- `plot.py` is data; `V` (planted values) is drawn in `plant_values(seed)`; seed 1912 pins the learning-mode values quoted in the story and objective text.
- Stories and endings carry `**bold**` (people at first mention) and `*italic*` (atmosphere, documents, institutions), rendered by `richText` in `site/app.js` (escapes first, then only those two marks; a test checks every story's markup is balanced). A blank line (`\n\n`) starts a paragraph and a block of `| cell | cell |` lines becomes a table, first row the header (ch7's four boxes, ch12's road): use them to keep each story short paragraphs, facts in a table.
- Never emphasise clue values (times, amounts, dates, places searched for): objectives are deliberately bare (ch. 1 is only "Mr Duroc knows which night.") and formatting must not hand the clue back.
- Noise names echo the noise lines' references: `GUESTS` (full names, 1912 dress) fill `hotel_register`, `interview`, `luggage` and `telegram`; the census (`person`) mixes `FIRST` x `LAST`. Tests keep planted and cast names out of `GUESTS`, planted surnames out of `LAST`, and no apostrophes or `FILM_LINES` fragments in guest names. Noise report text carries no reporter name: the planted reports have none, so it would single them out.
- Times (`cab_ride`, `telegram`, `room_service`, `lift_log`) are planted as HHMM integers and turned into `'HH:MM'` text by `clock_times` at the end of `build_db`; plot SQL compares them as text (`time < '06:00'`).
- `cab_ride.currency` (mostly franc) carries chapter 3's clue: Ashcombe's valet saw the man tip in English coins, so the night cab is the one 75-2 plate paid in pounds on the 18th (a pound fare from Vendome on the 17th is the decoy).
- Ids: noise ids start at 100 in every table; planted rows are inserted with ids below 100 or in blocks above the noise, and every id pinned in `V` is drawn inside its table's noise range (reports 1000-2999, accounts 1000-3999; learn 2127 / 1200 / 2170 / 3213 / 1540 / 2740). `scatter_planted` then swaps every planted id with a random mid-table noise row (foreign keys follow), except the `V`-pinned ids and telegram 9001 (the Part II code wire stays MAX by design), so neither `SELECT *` nor `ORDER BY id DESC` nor an id range lists the plot (`test_pinned_ids_hide_among_the_noise`).
- Links between tables: `suite` is the hub of the four Ritz ledgers (`hotel_register`, `room_service`, `lift_log`, `telegram`; noise only ever draws real suites). `link_tables` (after `scatter_planted`, before `clock_times`) adds `interview.person_id` (hotel guests join the census, unnamed witnesses stay NULL), `cab_ride.dropoff_address_id` (stations NULL) and `guest_card` (1:1 with `person`, fun only, none for the cast; a test checks). Every planted hotel stay goes through `book`, which clears the suite first: no two stays ever overlap in a suite.
- Missing values are NULL, never a 'none' string (e.g. `person.occupation`). The noise carries the same NULLs as the plot so `IS NULL` singles nothing out: 5% of fares drop at a station (NULL `dropoff_address_id`), unnamed `WITNESSES` give interviews (NULL `person_id`), some census rows lack `born_year` or `address_id`.
- The Comtesse has a stay (suite 210 in learn, 15-22 May, 180 F, `others[4]`): the victim is in the register. Grimaud's three pieces to the shell account are dated 16-18 May, before Lupin's "PAYMENT RECEIVED" wire of the 18th and the arrest of the 20th. The stone leaves on the boat train of the 19th (the Part I ending says so); Lupin walks out of the Depot on the 21st (ch IX story), which is why he can write from London.
- Suspects (`plot.CAST`): each is a decoy somewhere (Ortega: the 06:20 wire signed R. in ch7 and champagne after coffee in ch8; Almagro and Sernine: regulars who crossed Blakeney once in ch10; Velmont: the longer, later silence in ch11). A test keeps `notes` free of the clues and answer of the chapter they appear in.
- Case board cards read `ROMAN label answer`: each chapter's `board` label in `plot.py` (`board_compete` where compete asks for something else) says what the answer is ("Licence plate", "Fence's address"...); shown only once solved, so it may name the answer's role in the story.
- Easter-egg badges match lowercase fragments of noise lines in `generate_db.py` (`FILM_LINES`, "a madeleine missing", "rosebud"): keep those lines verbatim.
- Course folder is `../SQL` (not a git repo). `3-Corrections/8. Correction SQL Mystery Game.sql` there is generated by `write_outputs` when the folder exists.

### Chapter 7

Chapter 7 needs its CASE: Lupin wired "at the desk's quietest", the one of Ganimard's four boxes with the fewest Ritz wires that day, and it is the **afternoon** (15:10; the races at Longchamp), not the night a student would guess. Every Ritz wire of the 18th is planted: night 46 (initialled wires, charged to no suite so ch11 is untouched), morning 48, afternoon 36, evening 44. Four wires are signed R., one per box; three read alike ("PAYMENT RECEIVED STOP <champagne> AS ALWAYS MY FIRST ORDER BEFORE DAWN", to "Poste restante, Paris", no account number, no E. G.), so neither hour nor text gives his away, and Ortega's own R. is in the morning. The letter R. is given only by Ortega's suspect card (met in ch7; a test keeps it out of the chapter's own text). The solution groups by the CASE (CTEs `boxed`, `quietest`); compete does the same at the Bourse (54 wires: evening quietest, the broker's afternoon wire reads alike). The discovery notes name the afternoon; `solution.sql` and the course correction print them.

## Site (`site/app.js`, `site/style.css`, `index.html`)

### Look

- One painted icon per chapter beside its title: `site/icons/chNN.png` (96 px, background cut to transparency so both editions work; made on OpenGen from `docs/mockups/chapter-icon-prompts.md`, never with letters or numbers, which could hand out a clue).
- Part II is a whole-page night edition set once as `data-mood="night"` on `<html>` (`applyMood`), driven purely by `style.css`'s `:root[data-mood="night"]` token overrides (the top-right Day/Night edition button overrides the palette per browser, `ritz.theme`; the masthead date still follows the story), so style new elements off the tokens and they follow for free.
- Portraits are `site/portraits/*.jpg` (generated from `docs/mockups/portrait-prompts.md`, Lavery colour, 450x600: generate square, trim any white margin, then centre-crop 3:4; all seven redone 2026-10-02); `PORTRAIT_FILE` maps `data.cast` names to files for the Suspects panel, and a single `.portrait` rule floats Blakeney (Part I ending) and the Comtesse (Part II ending) into text. Portraits get their own gentler night filter, not the page filter (colour would cool to a flash photo). The portraits came from a public no-login image endpoint; there are no accounts or paid services to maintain.
- The landing card shows, under the headline, the front-page photograph `site/landing-pillow.jpg` (Lupin's card on the Comtesse's pillow, generated, cropped 3:2 to 960x640).
- The landing overlay (`#landing`) scrolls when the card is taller than the window (`overflow: auto`) and centres the card with `margin: auto` only when it fits; never flex-centre it again (the masthead would be clipped off the top, out of reach). The Day/Night button (`.theme-corner`, z-index 21) stays above it.
- Under 900 px the three columns stack story, terminal, schema (CSS `order` on `.col-story`, `.col-terminal`, `.col-erd`; the markup keeps the schema first for the desktop grid).

### Terminal and chapter flow

- The query box is a transparent textarea over a `<pre>` coloured by `highlightSql` (keep both boxes' font, padding and wrapping identical in `style.css`; the textarea grows instead of scrolling).
- Ctrl+F (not Cmd+F, which stays the browser's find) runs `formatSql`: whitespace and keyword case only, strings and comments untouched; a test formats every `solution.sql` query and checks nothing else changed and a second pass is a no-op.
- A correct answer keeps the solved chapter on screen with a Next chapter button; the new chapter's tables are revealed (`renderErd`, fade and glow, never a CSS transform: it would override each table's `translate()`) and the terminal cleared only when it is pressed.
- Chapter VIII solved in learn mode opens the extra edition (`showExtra`: the Part I closing film, the capture with Blakeney's portrait, the Part I badge "Gare du Nord" with rank and query count); its Continue opens the `#part2` pop-up (a native `<dialog>`) announcing Part II and its objective. Once (`state.extraSeen`), or on the next visit if the page was closed first. Chapter XII solved opens the Part II extra edition the same way (`showExtra2`, `state.extraSeen2`): the Part II film, the Comtesse's portrait and `endings.part2` (`part2Ending`, also kept in the story column without the film), the Blue Star photograph, the "Ganimard" badge with the Part II query count, and the badge count with a New investigation button (it clicks `#btn-reset`, which confirms) when any badge is still missing.
- Closing films: `site/video/part1.*` (top of the extra edition, breaking out of the card up to 1100px) and `part2.*` (top of the Part II extra edition), both via `filmHtml`/`wireFilm`: poster, a Play button (sound needs a click), then the browser's own controls. Subtitles are burned in. Built from OpenGen clips by `docs/mockups/assemble-video.sh` and `assemble-video-part2.sh`; how they were made, and the lessons (check each paid generation before the next, transcribe narration, Veo opens any case it is asked to hand over, blur the painted signature), are in `docs/mockups/video-part1.md` Status. Source clips are in the owner's `~/Downloads/ritz-video/`.
- Suspects gallery: shows a suspect once met (`meet`: the chapter whose story names them, or earlier when a result on screen shows their name, `state.suspects`) and adds each `notes` entry once its chapter is reached; the Suspects button carries a dot for anything unseen. The first time suspects are met, a pop-up (`#newsuspects`, `introduceSuspects`) shows their portraits and bios, all of those met together in one; it waits while a solved chapter is on screen (so chapter X's three names are not read early) and while the extra edition or the Part II pop-up is open (`state.introduced`).
- Hints were removed entirely on 2026-09-30. What a stuck student does get: the objective carries a closed Hint toggle (a `<details class="chapter-tools">`) holding the chapter's `construct` ("This chapter's tool") and its newly revealed tables, the current chapter's tables stay outlined in the schema (`.current`) until it is solved, and the last chapter's telegram (the bridge to the objective) is re-shown on review and after a reload (`showTelegram`); taunts type into their own slip (`#taunt`), never over it.
- Terminal safety: the database is opened with `PRAGMA query_only = 1` (a DROP or UPDATE fails loudly instead of corrupting the session), and `cartesian` refuses a comma join with no ON/WHERE/USING before sql.js sees it (sql.js runs on the main thread; a Worker with a timeout is the upgrade if students still hang the tab). Tab indents in the query box, Shift+Tab leaves it. Non-button controls go through `btnLike` (focusable, Enter/Space).

### Badges

- `BADGES` in `site/app.js` (name, text, predicate on an event ctx: query, solve, answer, code, part2, theme, suspects). Every badge and how to earn it: `docs/badges.md` (teacher-facing, spoilers); update it with any badge change.
- Easter-egg badges only read results of `EGG_ROWS` (10) rows or fewer (`eggText`), so a `SELECT *` over the archive hands none out. Tourist counts result columns (7+), not table rows. "Filed Under the 17th" reads `chapters.json.decoys` (the learn ch. 1 decoy report id, asserted never to be the answer).
- The Trespasser badge checks table names against `sqlite_master`, not the FROM/JOIN regex alone, so CTE names never trigger it.

### Schema diagram (`erd.py`, `renderErd`/`fitErd`)

- `fitErd` crops the schema's viewBox to the revealed tables (and to the visible lines) and fits the column.
- `erd.py` puts tables without foreign keys first (reveal order, `PER_ROW = 2` a row), then the linked tables layered by FK depth, so every relationship line runs in the gap between two rows (a test samples each line against every table box). A parent goes last in its layer so most lines stay short; a layer whose tables hang off both columns puts each in its parents' column (suite's ledgers on the right, lift_log between hotel_register and room_service; telegram, the overflow, on the left).
- Keys are icons (gold primary, silver foreign, the `#erd-key` symbol, legend under the schema in `index.html`), never `->` labels; each line is red with a dot and its cardinality at each end (1 / N, read from the data), coloured by `--rel` (a lighter red in the night edition, where the day red vanished).
- Every relationship line is straight legs with smooth rounded turns (radius 8): each leaves its parent from its own point (right half of the bottom edge), enters its child at its own point (left half of the top edge), and crosses each gap between rows, and a gutter, in its own lane. A line that stays in its column runs down that column's outer side (`MARGIN`), one that changes column down the middle (`erd.fk_paths`, which orders exits, entries and lanes and tries every lane order in each gutter for the fewest crossings, `erd.crossings`). Tests check no line crosses a table, no two lines overlap, and no two lines cross.

## Compete

- Entry: `index.html?season=N&board=<Apps Script /exec URL>`; the Pages workflow builds seasons 1-20 on every deploy (season files are gitignored); the `?admin` panel's Seasons section shows which are used (from the backend's rows) and copies the share links.
- Live settings (rank thresholds, `TAUNTS`, `PENALTY`) are applied over the code defaults by `applyConfig` from `<board>?config=1`, saved from the admin panel with the passphrase as key (`ADMIN_KEY` Script Property); both sides bound them (penalty 0-3600 s, 10 taunts of 300 chars, ranks up to 10000).
- Backend (`apps_script.gs`): every POST is validated; `start` returns a token (HMAC of pseudo and season, `TOKEN_SECRET` or `ADMIN_KEY` or `SHEET_ID`) that `progress`, `finish` and `check` must carry (added at send time in `flushOutbox`, kept in `state.token`); a `finish` needs seven `progress` rows first; the sheet also stores `clientAt` and `elapsedMs`, and `leaderboard.html` flags a time whose server interval disagrees with the browser's elapsed time by more than a minute ("?"); `doGet?season=N` filters, so the leaderboard link carries `&season=N`; pseudos compare NFKC-folded (`teamKey`, mirrored in the leaderboard). A backend refusal (`ok:false`) drops the row; only network failures retry. Compete stays honour-based against a student who posts a rival's `start` first: say so in class, keep it off the marks.
- Learn and compete progress are separate localStorage keys (`ritz.learn`, `ritz.compete`). Never push to `main` during a timed session: every deploy rebuilds the live seasons.
- `apps_script.gs` keeps a `hints` column that is now always 0 so the Sheet format is unchanged; `clientAt` and `elapsedMs` are appended as columns 9 and 10.

## Local-only work (cloud sessions cannot do these)

- Visual checks in a real browser (layout, overlaps, phone width, night mode) run through the owner's local Chrome; a cloud session can run both test suites but should say when something is untested visually.
- Images arrive in the owner's `~/Downloads` (the sapphire, the landing photograph and the 2026-10-02 portraits and the 2026-10-03 film clips came that way, kept in `~/Downloads/ritz-video/`): a cloud session needs them committed or attached.
- `../SQL` (course correction file) only exists on the owner's Mac: after plot changes made elsewhere, run `python3 generate_db.py` there once.
- Secrets never enter the repo: the admin passphrase (hash in `ADMIN_PASS_SHA256`, same value as the Apps Script's `ADMIN_KEY`) and the Apps Script `/exec` URL come from the owner in chat.
- Open work: the spec's section 8 backlog (advertising, waiting for AdSense approval; see the spec), a big UI/UX pass once the student-eye review reaches chapter 12, and phase 4 (a class trial, then tune `RANKS` from real query counts, via the admin panel's Settings).
