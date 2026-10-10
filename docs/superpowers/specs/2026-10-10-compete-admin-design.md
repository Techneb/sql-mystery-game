# Compete simplification and the admin space

Status (2026-10-10): branch `claude/compete-v2` implements work plan steps 1, 2 and 3 (sections 2 to 6: backend,
build, game, `site/admin.html` and `site/leaderboard.html`), tested against a local stub of the backend in headless
Chrome; next is the owner's look on his Chrome and the projector, then the rehearsal on the real backend. The admin
page has no edit form for a created season yet (the backend's `update` is unused).
Choices the spec left open: when all five databases have a season not yet closed, a new season takes the one
whose newest season is oldest; pseudos and season ids are written to the Sheet as text (a leading apostrophe),
so "007" stays "007" and no pseudo is read as a formula; `ritz.compete` also keeps
the board URL, so a reload without the link still resumes.

Design agreed with the course owner on 2026-10-10 (grilling in the SQL Game main session). Amends section 4
(Compete mode) and the "Compete mode simplification" and "Admin space" backlog items of
`2026-09-20-sql-mystery-game-design.md`. Dates: backend redeploy by the owner 2026-10-11, rehearsal on the live
site 2026-10-12, main frozen from the evening of 2026-10-13, class trial 2026-10-14 (about 25 students, each
playing alone, one class at a time).

## 1. Owner decisions (2026-10-10)

- One teacher for now; nothing in the design assumes it (no owner name in the code, seasons are records).
- The admin space is a separate static page, `site/admin.html`, on the same Apps Script; the in-game `?admin`
  panel keeps only the chapter jumps and the board URL field, plus a link to the admin page.
- The shared passphrase stays the gate (sha256 check in the page, `ADMIN_KEY` on the backend).
- A season is a named, dated record with a state: created, open, closed. The teacher creates it, shares its
  link and QR code, watches who joined, opens it (every clock starts together), closes it (the backend refuses
  every later post). Closed seasons stay listed forever with their board.
- Five pre-built re-seeded databases (was 20); the database number is an internal detail.
- Compete answers are checked in the browser against hashes shipped in the season file, like learning mode.
  The deploy no longer posts hashes; the GitHub secrets, the `HASHES_*` properties, the stale state and the
  manual paste go. The game stays honour-based and off the marks (owner, 2026-10-03).
- The backend refuses a second join with a pseudo already in the season. The start token (now a join token),
  the seven-progress rule before a finish and the "?" flag stay.
- Ranks and taunts are frozen in the code; the penalty per wrong answer is set per season.
- The game shows the season's name next to the clock.
- The board (`site/leaderboard.html`) is public and read-only, projector-sized, polled every 10 s, in the
  newspaper chrome: the joined list before opening, then the ranking with a per-chapter progress strip, names
  as typed, "?" flags, a podium once closed.
- The admin page also shows a per-chapter summary table per season and exports the season's raw rows as CSV.
- Everything above ships before the trial; the rehearsal is the go or no-go, the current flow is the fallback.

## 2. Backend (`apps_script.gs`)

Script Properties: `SHEET_ID`, `ADMIN_KEY`, optional `TOKEN_SECRET` (unchanged); new `SEASONS`, a JSON array of
season records written by the script. `CONFIG` and `HASHES_*` become unused (the owner may delete them).

Season record: `{id, name, date, db, penalty, state, createdAt, openedAt, closedAt}`.
- `id`: `s` + createdAt in ms + a short random suffix, matching `/^[a-z0-9-]{1,40}$/`; it is what links, events
  and the Sheet's `season` column carry (the column keeps its name; its values become ids).
- `db`: 1..5, the database the season plays; on create, the lowest number with no season in state created or
  open, else the least recently closed one (so a sixth season reuses a database, which a student from an
  earlier class could have seen; the admin page says which number is reused).
- `penalty`: integer seconds per wrong answer, 0-3600, default 10.
- `state`: `created` -> `open` -> `closed`, or `created` -> `closed` (a season created by mistake; its database
  is freed), never back.

doGet (public reads): `?seasons=1` all records; `?meta=<id>` one record plus the server's clock `now` (also in the join reply's meta: the game starts its clock
at `openedAt - now + its own now`, so a wrong browser clock cancels out); `?season=<id>` that season's rows
(`timestamp, event, team, season, chapter, hints, wrong, queries, clientAt, elapsedMs`, as today); no parameter:
all rows (kept for the admin page's export of everything, not for the game).

doPost, admin (`key` must equal `ADMIN_KEY`, compared trimmed and lowercased as today):
- `{admin:"create", name, date, penalty, key}` -> `{ok, season}`; name 1-60 chars, date `YYYY-MM-DD`.
- `{admin:"update", season, name, date, penalty, key}` while state is created.
- `{admin:"open", season, key}` sets `openedAt` to the server's now; `{admin:"close", season, key}` sets
  `closedAt`. Both idempotent on repeat, refused on a state that cannot move there.

doPost, players (`team` 1-40 chars trimmed, `season` an existing id):
- `{event:"join", team, season, clientAt}`: refused when the season is closed, or when a `join` row for the same
  `teamKey` (NFKC-folded, trimmed, lowercased) already exists in that season; returns `{ok, token, meta}`.
- `{event:"progress"|"finish", team, season, chapter, wrong, queries, clientAt, elapsedMs, token}`: refused
  unless the season is open and the token matches; a finish needs seven progress rows for that team and
  season; `elapsedMs` is the browser's `now - openedAt`.
- The token is HMAC(`teamKey|season id`), stateless, as today. The `check` action and `hashes`/`config` posts are
  removed.

Row timestamps are written as `Date.now()`, a plain number of ms (2026-10-10, after the live test): a `Date` cell
read back with `getValues()` came back shifted by the gap between the spreadsheet's time zone and the script's
(about 7 hours), which made every interval negative. Old Date rows still read through `getTime()`; a negative
interval is flagged "?" and the browser's `elapsedMs` stands in for it. The script lock waits 30 s: 25
simultaneous joins took about 22 s on the real backend.

Official time of a finish = `finish.timestamp - openedAt` (server clocks only) + `wrong x penalty`. The "?" flag
is set when `|official before penalty - elapsedMs| > 60 s`.

## 3. Build (`generate_db.py`, `pages.yml`)

- `SEASONS = 5`: the deploy builds `site/season-1..5.{sqlite,json}`; `--season N` is unchanged.
- Season json ships `answer_sha256` per chapter like `chapters.json` (same normaliser, the surname rule for
  names); `hashes_sha256`, `--hashes` and `--post` go, with the deploy's post step and the `BOARD_URL` and
  `ADMIN_KEY` repository secrets (the owner deletes the secrets). A test checks the season files carry hashes
  and that `?selftest` still passes.

## 4. Game (`site/app.js`, `index.html`)

- Link: `index.html?season=<id>&board=<exec url>` (the board URL still travels in the link; the admin page shows
  it as a QR and a short typed line). Boot fetches `?meta=<id>`; a missing or unknown id shows "This season does
  not exist" on the landing card.
- Join: the Compete button opens the pseudo form; `join` posts, a refusal ("pseudo taken", "session closed"; "busy, try again" when the script lock is held, retried once
  after 2 s, then "The archives are busy, press Join again") is

  shown under the form. On `ok`, the page shows a waiting card with the season name and "Waiting for the
  teacher to open the session", polling `?meta` every 5 s. When `state` is open, it loads `season-<db>`, keeps
  `openedAt`, starts the clock from it (a late joiner's clock already runs) and plays as today. A reload resumes
  from `ritz.compete` (season id, team, token, db, openedAt) and re-reads `?meta` once.
- Stories (2026-10-10 rehearsal): the season file's `story` is the chapter's `story_compete` (the Meurice case and its own named witnesses), not the learn story.
- Answers checked with `answer_sha256` from the season file, as learn mode does (`checkRemote` removed).
- `RANKS` and `TAUNTS` are constants; `PENALTY.wrong` comes from the season record. `applyConfig`, `?config=1`,
  the Settings section, the hashes status and paste, `seasonUsage`, `nextFreeSeason` and the "Investigate link
  with settings" go. The in-game panel keeps the chapter jumps, the board URL field and an `admin.html` link.
- Compete info shows "Season: <name>" beside the clock. Closed season mid-play: the next refused post shows
  "The session is over" in the status line; the game stays playable without posting.
- `privacy.html`: the compete paragraph describes `join` (pseudo, season id, clientAt), progress and finish, and
  no longer an answer check request.

## 5. Admin page (`site/admin.html`, `site/admin.js`, `site/admin.css`)

Static, no build step, newspaper chrome like the handbook (masthead "LE PETIT JOURNAL" / "THE CLERK'S DESK",
nav line of the site family, night palette by `prefers-color-scheme`). Shared code (sha256, `teamKey`,
`ADMIN_PASS_SHA256`, ranking and summary functions) lives in a side-effect-free module `site/shared.js`
imported by `app.js`, `admin.js`, `leaderboard.html` and the node tests; `app.js` keeps exporting what tests
already import.

- Gate: the passphrase dialog on load (never stored); the board URL remembered in `localStorage` `ritz.admin.board`.
- Seasons: a table of every record, newest first: name, date, state, joined, finished, database number; actions
  per row: Open, Close (confirm), Copy link, QR, Board, Export CSV, as icon-only 28 px buttons in the game's icon
  style (play triangle, stop square, chain links, 2x2 squares, podium, arrow into a tray; 16 px SVG stroked in
  `currentColor`), each named by `title` (the tooltip) and `aria-label` (owner, 2026-10-10). Create form: name, date (default today),
  penalty (default 10).
- Season detail (click a row): the joined list live (10 s poll, which also refreshes that row's Joined and
  Finished cells) with each player's chapter; the per-chapter
  summary (players who solved it, median minutes from `openedAt`, median queries, median wrong) computed from
  the rows in the browser; the CSV export of the raw rows (client-generated, columns as the Sheet).
- QR: an in-repo byte-mode QR encoder (`site/qr.js`, error correction M, versions up to 10, no dependency),
  rendered as inline SVG; a node test checks a fixed input against a known module matrix.
- Both pages escape every value from the backend before rendering (pseudos are untrusted text).

## 6. Board (`site/leaderboard.html`)

Rewritten in the newspaper chrome, type sized for a projector (rows 28 px or more, the season name as the
headline), `?data=<exec url>&season=<id>`, polling rows and meta every 10 s:
- created: "Waiting for the teacher" and the joined list;
- open: rank, pseudo, a strip of eight cells filled per solved chapter, time (`mm:ss` official with penalty, "?"
  when flagged) or the current chapter for unfinished players, unfinished players after finished ones;
- closed: a podium of the top three above the full ranking.

## 7. Work plan

1. Backend branch: `apps_script.gs`, `generate_db.py` season hashes, `pages.yml`, `shared.js`, tests. Owner
   redeploys the script and deletes the two repository secrets (2026-10-11).
2. Game branch: join/wait/open flow, local answer check, panel cleanup, privacy.
3. Admin page and board.
4. Rehearsal on the live site (2026-10-12): the owner as two or three students, the main session on the admin
   page and the board. Fixes 2026-10-13; freeze.
5. After the trial: tune `RANKS` from the summary table (phase 4), delete the unused Script Properties.
