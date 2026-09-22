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
small panel to switch chapters live, in either mode, plus a link to the leaderboard -- neither
touches `localStorage`, so it never disturbs real progress.

Tests for the site's pure functions (no browser needed): `node --test test_site.mjs`.

## Deploying

GitHub Pages, source `main` branch, folder `/site` (see Plan 4). The page is fully static: no
server, no build step, no environment variables.

## Tuning

- `RANKS` in `site/app.js` sets the query thresholds for each rank; tune after the first class. Hints are
  off for now (every chapter ships `hints: []`), so the rank counts queries only.
- `BADGES` in `site/app.js` is the full badge list (name, text, predicate).
- `TAUNTS` in `site/app.js` are the three telegrams sent after three wrong answers in a row.

## Files

| File | Role |
|---|---|
| `plot.py` | the plot as data: cast, chapters (text, hints, taunts, solution and naive SQL) |
| `generate_db.py` | planted values per seed, schema, noise, planting, self-checks, outputs |
| `erd.py` | ERD auto-layout (FK depth layers, barycentre ordering) to inline SVG |
| `test_generate.py` | `unittest` suite |
| `solution.sql` | generated: the reference path, one query per chapter |
| `site/mystery.sqlite`, `site/chapters.json`, `site/schema.svg` | generated, committed (the site is static) |
| `docs/superpowers/specs/` | the design spec; `docs/superpowers/plans/` the implementation plans |

The plot is public in `plot.py` and `solution.sql`; the site only ships SHA-256 hashes of the
normalised answers in `chapters.json`.

## Compete mode (season content)

`python3 generate_db.py --season N` builds `site/season-N.sqlite` and `site/season-N.json`: the same
plot and cast, but every piece of evidence (plates, addresses, account numbers, telegram ids, suite
numbers, non-suspect names) is re-drawn from seed N, and each of the 8 Part I chapters asks a
**different question on the same tables with the same construct** than learning mode, so a season can
be reused by a new class without last term's answers helping. Generated `season-*` files are not
committed; build the one season you need before class and drop it in `site/`.

Backend: paste `apps_script.gs` into a Google Sheet's Apps Script editor, set the `SHEET_ID` script
property to that sheet's id (Project Settings > Script Properties -- never edit the id into the file
itself), and deploy as a web app (see the comment at the top of the file, or Task 3 Step 2 of
`docs/superpowers/plans/2026-09-22-plan-3-compete.md` for the exact click-path). To see teams as they
play, open `site/leaderboard.html?data=<your deployment's /exec URL>` -- the URL is never committed,
since this repo is public and the URL is a live, unauthenticated write endpoint. Bookmark that link, or
set `APPS_SCRIPT_URL` in your own local, uncommitted copy of `leaderboard.html` if you want a fixed link.

The in-game "Compete" button is wired: it prompts for a season number and team name, loads
`season-N.sqlite`/`season-N.json`, and POSTs `start` once, `progress` after each chapter, and `finish`
at chapter 8, to whatever `APPS_SCRIPT_URL` is set to (empty by default, same reasoning as
`leaderboard.html` above -- set it in your own local, uncommitted copy of `site/app.js`). Compete
progress lives under its own `localStorage` key and resumes automatically on reload.
