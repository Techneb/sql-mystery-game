# Handbook on alephb.uk: follow-ups and the third AdSense review

Written 2026-10-30 by a cloud session, to be run from a CLI session on the owner's Mac.
Context: AdSense refused alephb.uk a second time ("Contenu a faible valeur informative", 2026-10-30).
The same day the handbook moved to <https://alephb.uk/learn/> (game 873f5e0, alephb-site cf83cf7):
`move_handbook.mjs export` writes it into alephb-site, and the deploy turns `site/learn/` into redirects.
The owner checked both sites in a browser: OK.

Steps marked **[browser]** need the owner's signed-in Chrome (Google accounts); a CLI session that drives the
owner's Chrome may do them with the owner watching, otherwise list them for the owner. Every other step is code.
Push rules: game repo, standing permission once tested (never during a timed session); alephb-site, the owner
approves each push (ask once for B1-B4 together).

## A. Google accounts [browser]

A1. Search Console: the property was created with techneb.jr@gmail.com. Add the AlephB account (the one owning
    GA4 and AdSense) as **Owner**: Settings > Users and permissions > Add user > AlephB address > Owner.
    Check the property type: a **Domain** property `alephb.uk` (DNS TXT in Cloudflare) covers the root and every
    subdomain; a URL-prefix property covers only its prefix. If it is URL-prefix `https://mystery.alephb.uk/`,
    also add the Domain property (or at least URL-prefix `https://alephb.uk/`).
A2. Sitemaps: submit `https://alephb.uk/sitemap.xml` and `https://alephb.uk/learn/sitemap.xml`; keep
    `https://mystery.alephb.uk/sitemap.xml` (it now lists only the landing page and privacy.html).
A3. URL Inspection > Request indexing (about 10 a day), in this order:
    day 1: `/learn/`, `/learn/exercises.html`, `/learn/select-where.html`, `/learn/joins.html`,
    `/learn/group-by-having.html`, `https://alephb.uk/`;
    day 2: `/learn/order-by-limit.html`, `like.html`, `dates-times.html`, `nulls.html`, `case-when.html`,
    `subqueries.html`, `set-operations.html`, `window-functions.html`, `ctes.html`;
    day 3: `database.html`, `schema.html`, `grammar.html`, `ritz-affair.html`, `articles.html`, the three articles.
    Expected: the old `mystery.alephb.uk/learn/*` read "Page with redirect" (correct; do not use Change of address,
    which is for a whole domain).
A4. Optional: link Search Console to GA4 (GA4 Admin > Product links > Search Console), once AlephB owns both.
A5. AdSense: Sites > alephb.uk > confirm the issues are fixed > **Request review**, never remove and re-add the
    site. Owner's call on timing: as soon as A3's day-1 pages read "URL is on Google" (a few days), or at once.
    Record the date in both CLAUDE.md files (D1).

## B. alephb-site (one approval for the batch)

B1. Footer nav on every page: Home . Articles . Handbook (`learn/`) . Privacy. The pages are `index.html`,
    `privacy.html`, `ritz-affair.html`, `articles.html`, `article-*.html` (grep `<nav><a href="./">Home</a>`).
    Never touch `learn/` by hand (generated).
B2. Home page, Ritz Affair section: check the handbook bullet and the "Open the handbook" button point at
    `learn/` (done 2026-10-30) and that the copy says the handbook lives here ("on this site"), humanizer rules.
B3. `ritz-affair.html` and the articles: one sentence each where the handbook is named, linking a specific
    lesson (e.g. joins, GROUP BY) with a relative `learn/...` URL. Original wording only (no text copied from
    the handbook or the game: duplicate content).
B4. Check: every new or changed link returns 200 (`curl -sI`), `LC_ALL=C grep` not required here (the site
    has UTF-8 copy), then push and check `pages-build-deployment` and `curl -s https://alephb.uk/learn/` serve it.

## C. Game repo

C1. Grammar links built in JavaScript go through the redirects: `site/terminal.js` `strictHtml(r, base = "learn/")`.
    In the game, pass the absolute base `https://alephb.uk/learn/` instead (keep `""` on the exercises page, which
    is served from alephb.uk itself). Decide in one place: an exported `HANDBOOK` constant in `shared.js`
    (`https://alephb.uk/learn/`), used by `strictHtml`'s game callers. Localhost still works (it opens the live
    handbook). Grep the other modules for built `learn/` links: `site/*.js` (`whereHtml`, `howto.js`,
    `onboarding.js`, `endings.js`, `app.js`), and the game-label links. Update the tests that pin `learn/` hrefs
    (`test_site.mjs`, `test_handbook.mjs`: grep `learn/`).
C2. `colour_learn.mjs` line ~113 writes the game's sitemap with `https://mystery.alephb.uk/learn/`. The deploy
    prunes them (`pruneSitemap`), and the export rewrites them, so it works; cleaner: keep the game's
    `site/sitemap.xml` without the learn entries and have `colour_learn.mjs` write `learnSitemap` straight to the
    alephb URLs. Optional; if done, update `test_handbook.mjs` "sitemap lists ... every learn page" and the
    canonical test (canonical = sitemap URL) together, and `move_handbook.mjs` (`exportText` would no longer need
    the URL rewrite for canonicals: keep it as a no-op guard).
C3. Canonicals and JSON-LD in the repo's learn pages still read `mystery.alephb.uk/learn/` (rewritten at export).
    If C2 is done, write `https://alephb.uk/learn/` at the source instead, and set JSON-LD `isPartOf` to
    `{"@type":"WebSite","name":"AlephB","url":"https://alephb.uk/"}` (the handbook is now part of that site).
C4. `feedback_script.gs` `SYSTEM_PROMPT` names the handbook at `https://mystery.alephb.uk/learn/`: change it to
    `https://alephb.uk/learn/`, run `node --test test_backend.mjs`, then redeploy the feedback script
    (`assets-source/clasp-feedback/deploy.sh`, same /exec URL) and check it answers.
C5. `README.md` and the spec (`docs/superpowers/specs/2026-09-20-sql-mystery-game-design.md`, section 8
    Advertising): the handbook's address, the second refusal and the move.
C6. Monitor (desk, Handbook view): `SCOPES` filters `pagePath` beginning `/learn/`; GA also needs the host now
    that both hosts serve `/learn/` (redirect stubs carry no GA, so only alephb.uk counts). Check on the live desk
    that the Handbook view shows visits after 2026-10-30; if the Global PAGES donut should tell hosts apart, add
    `hostName` to `REPORT_DIMS` / `DIMENSIONS` (apps_script.gs and shared.js together, a test compares) and
    redeploy the backend (`assets-source/clasp/deploy.sh`).
C7. Privacy: `site/privacy.html` (done 2026-10-30) says the handbook is at alephb.uk/learn/; reread the
    "Saved in your browser" section and add that the handbook's keys (`ritz.theme`, `ritz.consent`,
    `ritz.exercises*`) are kept by alephb.uk, separately from the game's.
C8. After any of C1-C3, C7: run every suite (`python3 generate_db.py --seasons`, `python3 -m unittest`,
    `node --test test_site.mjs test_desk.mjs test_handbook.mjs test_backend.mjs`), push the game, then
    `node move_handbook.mjs export $(git rev-parse --short=7 HEAD) ../alephb-site`, commit and push alephb-site,
    then check in Chrome: a refusal's Grammar link, mystery.alephb.uk/learn/like.html#like-ilike redirecting with
    its hash, alephb.uk/learn/exercises.html solving exercise 1, day/night on both.
C9. Run `python3 generate_db.py` once on the Mac (the `../SQL` correction file), as after any change elsewhere.

## D. Records

D1. Both CLAUDE.md files, AdSense sections: second refusal 2026-10-30, the move, the review request date (A5).
D2. Supermain memory (`~/.claude/projects/-Users-techneb-Projets/memory/`): the handbook's new address and that
    alephb-site's `learn/` is generated by the game repo.

## E. Traffic ("genuine user interest")

E1. The course: point the course page, slides and the `../SQL` material at `https://alephb.uk/learn/`.
E2. One public post (LinkedIn, r/SQL or Show HN) presenting the game and the handbook together; draft it for the
    owner to post, original wording, no clue (Shortcut check).
E3. One external article (dev.to) on teaching SQL with a mystery, linking two or three lessons; draft only.
E4. If AdSense refuses a third time: Mediavine Journey (about 1,000 sessions a month since January 2026; check
    its current terms and whether it takes a static site), with the Global view's sessions for the last 30 days.
