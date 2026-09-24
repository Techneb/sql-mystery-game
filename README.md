# The Ritz Affair - SQL Mystery Game

A browser game for the Albert School MSc SQL course: Paris, May 1912, the Comtesse de Cagliostro's
sapphire vanishes from the Ritz, and the student, Inspector Ganimard's clerk, unmasks Arsene Lupin with
SQL, one course construct per chapter (12 chapters, Part I strictly within the course material).
The database is SQLite in the browser; nothing runs on a server.

## Regenerate

```bash
python3 generate_db.py        # rebuilds site/mystery.sqlite, site/chapters.json, site/schema.svg, solution.sql
python3 -m unittest -v        # normalisation, schema, planting, traps, text, outputs, ERD
python3 generate_db.py --season 3   # compete mode: site/season-3.sqlite + site/season-3.json, values re-drawn
```

Stdlib only, no build step, no dependencies. `generate_db.py` is itself the test of the plot: it fails
if any solution does not return exactly its answer, if any trap does not bite, or if any text is not ASCII.

## Playing locally

```bash
python3 -m http.server 8000 -d site
```

Then open `http://localhost:8000/`. `file://` does not work: the page fetches `mystery.sqlite`,
`chapters.json` and `schema.svg`, which browsers block over the `file://` scheme.

Self-test (checks the normalisation fixture and that the database loaded): `http://localhost:8000/?selftest`.

Jump straight to a chapter without solving the earlier ones: `?chapter=N` (1-12). Add `?admin` for a
small panel to switch chapters live, in either mode, plus a link to the leaderboard. Both are gated
behind a passphrase (`ADMIN_PASS_SHA256` in `site/app.js`, hash only -- ask the course owner for the
passphrase itself), asked once per page load. Neither touches `localStorage`, so it never disturbs
real progress.

Tests for the site's pure functions (no browser needed): `node --test test_site.mjs`.

## Deploying

GitHub Pages via `.github/workflows/pages.yml` on every push to `main`: the workflow builds the compete
seasons listed in `seasons.txt`, then publishes `site/`. Live at <https://techneb.github.io/sql-mystery-game/>.
The page is fully static: no server, no environment variables.

## Tuning

- `RANKS` in `site/app.js` sets the query thresholds for each rank; tune after the first class. Hints are
  off for now (every chapter ships `hints: []`), so the rank counts queries only.
- `BADGES` in `site/app.js` is the full badge list (name, text, predicate).
- `TAUNTS` in `site/app.js` are the three telegrams sent after three wrong answers in a row.

## Look

- Twelve chapter props (engraved-line inline SVG, one accent colour) sit next to the chapter title:
  `PROPS` in `site/app.js`. Pure ASCII, no asset files.
- Part II is a night edition: the whole page switches once the Part II code is accepted
  (`data-mood="night"` on `<html>`, colour tokens overridden in `site/style.css`), the masthead moves
  to 19 May, and a reload keeps the mood.
- Portraits: `site/portraits/*.jpg`, six suspects plus Ganimard and the Comtesse, painted in colour
  after Sir John Lavery. A **Suspects** button next to the case board opens the gallery; Ganimard sits
  on the landing card, Blakeney appears only at the Part I unmasking, the Comtesse at the Part II
  ending. All generated from one prompt template (only the sitter changes, so no face reads guiltier
  than another), from a public, no-login image endpoint; the generator's corner mark was cropped off.
- The case board is a cork board with a pin per solved chapter. Badge toasts clear a beat apart.

## Files

| File | Role |
|---|---|
| `plot.py` | the plot as data: cast, chapters (text, hints, taunts, solution and naive SQL) |
| `generate_db.py` | planted values per seed, schema, noise, planting, self-checks, outputs |
| `erd.py` | ERD auto-layout (FK depth layers, barycentre ordering) to inline SVG |
| `test_generate.py` | `unittest` suite |
| `solution.sql` | generated: the reference path, each chapter's discovery queries then its final query |
| `site/mystery.sqlite`, `site/chapters.json`, `site/schema.svg` | generated, committed (the site is static) |
| `site/index.html`, `site/app.js`, `site/style.css` | the game; `site/leaderboard.html` the standalone compete leaderboard |
| `site/portraits/*.jpg` | suspect portraits (Style A/Lavery colour, generated), shown in the Suspects panel |
| `apps_script.gs`, `seasons.txt` | compete backend (Google Apps Script) and the seasons Pages builds |
| `test_site.mjs` | `node --test` suite for the site's pure functions |
| `docs/superpowers/specs/` | the design spec; `docs/superpowers/plans/` the implementation plans |
| `docs/mockups/` | design boards: chapter props, case board and night palette (`illustrations.html`), portrait styles (`portrait-styles.html`) |

The plot is public in `plot.py` and `solution.sql`; the site only ships SHA-256 hashes of the
normalised answers in `chapters.json`.

## Compete mode

`python3 generate_db.py --season N` builds `site/season-N.sqlite` and `site/season-N.json`: the same
plot and cast, but every piece of evidence (plates, addresses, account numbers, telegram ids, suite
numbers, non-suspect names) is re-drawn from seed N, and each of the 8 Part I chapters asks a
**different question on the same tables with the same construct** than learning mode, so a season can
be reused by a new class without last term's answers helping. Generated `season-*` files are not
committed. GitHub Pages builds the seasons listed in `seasons.txt` (one number per line) at deploy time,
so opening a season for a class is: add its number to `seasons.txt`, push, share the link below. Remove
the line after the class. Locally, run the command above and the files land in `site/` directly.

Backend: paste `apps_script.gs` into a Google Sheet's Apps Script editor, set the `SHEET_ID` script
property to that sheet's id (Project Settings > Script Properties -- never edit the id into the file
itself), and deploy as a web app (see the comment at the top of the file, or Task 3 Step 2 of
`docs/superpowers/plans/2026-09-22-plan-3-compete.md` for the exact click-path). The deployment's
`/exec` URL is never committed: this repo is public and the URL is a live, unauthenticated write
endpoint. It travels in links instead.

Playing a season: share one link with the class,

```
https://techneb.github.io/sql-mystery-game/?season=N&board=<your deployment's /exec URL>
```

With `season=N` in the URL the landing page's **Compete** button offers that season (if `season-N.json`
is on the server; otherwise its tooltip says so); without a link, Compete asks for the season number
instead. Compete then asks for a team name, POSTs `start` to the Apps
Script (which stamps the server time), loads the season database, and runs Part I only with a clock in
the masthead. Every solved chapter POSTs `progress`; chapter VIII POSTs `finish` with the team's hints,
wrong answers and queries, and the finish screen links to the leaderboard. Events that cannot be
delivered (a dropped connection) wait in the saved state and are retried every 30 s; the leaderboard
scores the first `start` and the first `finish` it sees, so a retry can never shorten a time. Without
`board=` the clock still runs but nothing is recorded, and the masthead says NOT RECORDED. Reloading
the page lands a team back in its running game. Compete progress lives under the `ritz.compete`
localStorage key, learning-mode progress under `ritz.learn`; "New investigation" in a season game
abandons the season (rows already on the sheet stay).

To watch teams as they play, open `site/leaderboard.html?data=<the same /exec URL>`. Bookmark that
link, or set `APPS_SCRIPT_URL` in your own local, uncommitted copy of `leaderboard.html` (and of
`app.js`, whose constant of the same name replaces the `board=` parameter) if you want fixed links.
