# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Browser SQL game for the Albert School SQL course. Spec: `docs/superpowers/specs/2026-09-20-sql-mystery-game-design.md`; plans in `docs/superpowers/plans/`.

## Commands

```bash
python3 generate_db.py                  # rebuild site/ outputs + solution.sql; fails if the plot breaks
python3 generate_db.py --season 3       # compete season: site/season-3.{sqlite,json} (gitignored)
python3 -m unittest -v                  # Python suite (test_generate.py)
python3 -m unittest test_generate.Discovery.test_row_count_passes_and_fails   # one test
node --test test_site.mjs               # site pure functions, imports site/app.js directly
node --test --test-name-pattern normalise test_site.mjs                      # one site test
python3 -m http.server 8000 -d site     # play at localhost:8000 (file:// fails); ?selftest checks the fixture
```

Pages deploys `site/` on every push to `main` (`.github/workflows/pages.yml`, which first builds compete seasons 1-20).

## Architecture

Python side (build time) -> static files -> browser side (runtime, no server):
- `plot.py` (story + SQL as data) and `generate_db.py` (values per seed, schema, noise, planting, self-checks) write `site/mystery.sqlite`, `site/chapters.json`, `site/schema.svg` (via `erd.py`) and `solution.sql`. Generated files are committed because the site is static.
- `site/app.js` is one ES module: loaded by `index.html` in the browser (with sql.js from cdnjs) and imported by `test_site.mjs` in node, so pure logic is `export`ed and browser globals (`localStorage`, `document`) stay inside functions.
- Answers are checked client-side against hashes (`sha256(normalise(answer))`) in `chapters.json`, never plaintext.
- Compete: `apps_script.gs` is the Google Apps Script backend the page posts events to; `site/leaderboard.html` reads it.

## Rules

- Stdlib only, no build step. `python3 generate_db.py` rebuilds `site/` outputs and **is the test of the plot**: every solution must return exactly its answer and every trap must bite (the naive query must not yield the answer). `python3 -m unittest -v` pins the same plus normalisation and ERD layering.
- `plot.py` is data; `V` (planted values) is drawn in `plant_values(seed)`; seed 1912 pins the learning-mode values quoted in the story and objective text (every chapter ships `hints: []` for now; the witness button renders only when a chapter has hints). Any text or data must be pure ASCII: `LC_ALL=C grep -n '[^ -~]' plot.py generate_db.py erd.py solution.sql site/chapters.json` must print nothing.
- Answer normalisation lives twice: `generate_db.normalise` and `site/app.js normalise`; `chapters.json.normalise_fixture` is checked by the page in `?selftest` mode. Change both together. The fixture must never contain a planted value.
- Chapter stories never quote an earlier chapter's answer literally (the JSON ships every chapter); they say "the plate you found in chapter 3".
- Adding a chapter = one dict in `plot.CHAPTERS` (text + `solution` + `naive`) and its planting in `plant_part2`. Never edit `site/chapters.json`, `site/schema.svg` or `solution.sql` by hand.
- Noise ids start at 100 in every table; planted rows are inserted with ids below 100 (or ids pinned in `V`, above the noise range). `scatter_planted` then swaps every planted id below 100 with a random mid-table noise row (foreign keys follow), so `SELECT *` never lists the plot first. Never refer to a planted row by a literal small id outside `plant_part1` / `plant_part2`.
- Compete mode: `index.html?season=N&board=<Apps Script /exec URL>`; the Pages workflow builds seasons 1-20 on every deploy (season files are gitignored); the `?admin` panel's Seasons section shows which are used (from the backend's rows) and copies the share links. Live settings (rank thresholds, `TAUNTS`, `PENALTY`) are applied over the code defaults by `applyConfig` from `<board>?config=1`, saved from the admin panel with the passphrase as key (`ADMIN_KEY` Script Property); the game validates, the script only authenticates. Never commit a deployment URL. Learn and compete progress are separate localStorage keys (`ritz.learn`, `ritz.compete`).
- Every Part I chapter withholds a constant and carries a `discovery` list (`discovery_compete` for the compete objective): `check_discovery` runs each query at build time and asserts the withheld fact is in the result (`must_contain`, case-insensitive) or the row count (`row_count`). A chapter whose clue stops being discoverable fails the build. `solution.sql` prints the discovery queries before the final one.
- Debug entry points are gated: `?chapter=N` and the `?admin` panel both prompt for a passphrase checked against `ADMIN_PASS_SHA256` in `site/app.js` (hash only; the passphrase is never in the repo, ask the course owner). Neither writes to localStorage.
- Look: one inline-SVG prop per chapter in `PROPS` (`site/app.js`, inner markup only, `class="accent"` picks up `--accent`); Part II is a whole-page night edition set once as `data-mood="night"` on `<html>` (`applyMood`), driven purely by `style.css`'s `:root[data-mood="night"]` token overrides, so style new elements off the tokens and they follow for free. Portraits are `site/portraits/*.jpg` (generated, Lavery colour, generator watermark cropped off); `PORTRAIT_FILE` maps `data.cast` names to files for the Suspects panel, and a single `.portrait` rule floats Blakeney (Part I ending) and the Comtesse (Part II ending) into text. Portraits get their own gentler night filter, not the page filter (colour would cool to a flash photo). The landing card shows the sapphire from `favicon.svg`, inline. The portraits came from a public no-login image endpoint; there are no accounts or paid services to maintain.
- `site/privacy.html` describes exactly what leaves the browser (compete `eventPayload`, the fonts/cdnjs/Pages requests). Change it whenever what the game sends or loads changes.
- The Trespasser badge checks table names against `sqlite_master`, not the FROM/JOIN regex alone, so CTE names never trigger it.
- Course folder is `../SQL` (not a git repo). `8. Correction SQL Mystery Game.sql` there is generated by `write_outputs` when the folder exists.
