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

Backend: paste `apps_script.gs` into a Google Sheet's Apps Script editor and deploy it as a web app
(see the comment at the top of the file, or Task 3 Step 2 of
`docs/superpowers/plans/2026-09-22-plan-3-compete.md` for the exact click-path). Put the deployment URL
into `site/leaderboard.html`'s `APPS_SCRIPT_URL` constant to see teams as they play.

The in-game "Compete" button (team name entry, timer, POSTing `start`/`progress`/`finish` events to the
Apps Script) is not wired yet — it lands in a short follow-up plan once PR #2 (the Investigate-mode
site) is merged, since it needs `site/app.js` to exist. Until then, `leaderboard.html` can be exercised
with a hand-crafted fixture (see Task 4 Step 2 of the same plan) or with `curl` directly against the
Apps Script (Task 3 Step 2).
