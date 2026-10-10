# The Ritz Affair - SQL Mystery Game

A browser game for an SQL course: Paris, May 1912, the Comtesse de Cagliostro's
sapphire vanishes from the Ritz, and the student, Inspector Ganimard's clerk, unmasks Arsene Lupin with
SQL, one course construct per chapter (12 chapters, Part I strictly within the course material).
The database is SQLite in the browser; nothing runs on a server.

## Regenerate

```bash
python3 generate_db.py        # rebuilds site/mystery.sqlite, site/chapters.json, site/schema.svg, solution.sql
python3 -m unittest -v        # normalisation, schema, planting, traps, text, outputs, ERD
python3 generate_db.py --season 3   # compete mode: site/season-3.sqlite + site/season-3.json, values re-drawn
python3 generate_db.py --seasons    # every compete database, 1 to generate_db.SEASONS (5)
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
small panel to switch chapters live, in either mode, plus a link to the teacher's page. Both are gated
behind a passphrase (`ADMIN_PASS_SHA256` in `site/shared.js`, hash only -- ask the course owner for the
passphrase itself), asked once per page load. Neither touches `localStorage`, so it never disturbs
real progress.

Tests for the site's pure functions (no browser needed): `node --test test_site.mjs`.

## Deploying

GitHub Pages via `.github/workflows/pages.yml` on every push to `main`: the workflow builds the five compete
databases, then publishes `site/`. Live at <https://mystery.alephb.uk/> (the old techneb.github.io address redirects there).
The page is fully static: no server, no environment variables.

## Tuning

The penalty per wrong answer is set per season by the teacher; the rest is in the code.

- `RANKS` in `site/app.js` sets the query thresholds for each rank; tune after the first class. The rank
  counts queries only.
- `BADGES` in `site/app.js` is the full badge list (name, text, predicate).
- `TAUNTS` in `site/app.js` are the three telegrams sent after three wrong answers in a row.

## Look

- Twelve painted chapter icons (`site/icons/chNN.png`, generated, no letters or numbers so none hands out
  a clue) sit next to the chapter title.
- Part II is a night edition: the whole page switches once the Part II code is accepted
  (`data-mood="night"` on `<html>`, colour tokens overridden in `site/style.css`), the masthead moves
  to 19 May, and a reload keeps the mood. A **Day/Night edition** button (top right) lets any reader pick
  the palette instead; the choice is kept per browser.
- Portraits: `site/portraits/*.jpg`, six suspects plus the Comtesse, painted in colour
  after Sir John Lavery. A **Suspects** button next to the case board opens the gallery; the landing card
  shows the front-page photograph of Lupin's card on the Comtesse's pillow (`site/landing-pillow.jpg`), Blakeney appears only at the Part I unmasking, the Comtesse at the Part II
  ending. All generated from one prompt template (only the sitter changes, so no face reads guiltier
  than another), from a public, no-login image endpoint; the generator's corner mark was cropped off.
- The case board is a cork board with a pin per solved chapter. A **Badges** button opens all 38 badges
  (locked ones show only "???"); toasts clear a beat apart. Part II ends on Lupin's photograph of the Blue
  Star (`site/blue-star.jpg`).
- Chapter stories use `**bold**` / `*italic*` markup in `plot.py`, rendered with a drop cap like the landing page.
- The noise rows are deliberately funny (film, video-game and Kaamelott references); some badges reward
  finding them.

## Files

| File | Role |
|---|---|
| `plot.py` | the plot as data: cast, chapters (text, taunts, solution and naive SQL) |
| `generate_db.py` | planted values per seed, schema, noise, planting, self-checks, outputs |
| `erd.py` | ERD auto-layout (FK depth layers, barycentre ordering) to inline SVG |
| `test_generate.py` | `unittest` suite |
| `solution.sql` | generated: the reference path, each chapter's discovery queries then its final query |
| `site/mystery.sqlite`, `site/chapters.json`, `site/schema.svg` | generated, committed (the site is static) |
| `site/index.html`, `site/app.js`, `site/style.css` | the game; `site/leaderboard.html` the standalone compete leaderboard |
| `site/learn/` | The Clerk's Handbook: static SQL reference pages on a separate example database |
| `site/portraits/*.jpg` | suspect portraits (Style A/Lavery colour, generated), shown in the Suspects panel |
| `apps_script.gs` | compete backend (Google Apps Script) |
| `test_site.mjs` | `node --test` suite for the site's pure functions |
| `docs/superpowers/specs/` | the design spec; `docs/superpowers/plans/` the implementation plans |
| `docs/mockups/` | design boards: chapter props, case board and night palette (`illustrations.html`), portrait styles (`portrait-styles.html`) |

The plot is public in `plot.py` and `solution.sql`; the site only ships SHA-256 hashes of the
normalised answers in `chapters.json` and in each season file.

## Compete mode

`python3 generate_db.py --season N` builds `site/season-N.sqlite` and `site/season-N.json`: the same
plot and cast, with every piece of evidence re-drawn from seed N and a different question per Part I
chapter on the same tables and construct. The deploy builds five of them; they are not committed.

A teacher creates a season on the backend (a Google Apps Script, `apps_script.gs`, pasted into a
standalone script project and deployed as a web app; see the comment at its top) and shares its link,
`?season=<id>&board=<the deployment's /exec URL>`. Players join with a pseudo, wait for the teacher to
open the session, then race through Part I; answers are checked in the browser, so the game is
honour-based. The `/exec` URL is never committed: it travels in links.
