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

Every step ends with a **Check:** line. A step is done only when its check passes; a failing check stops the
plan at that step and is reported to the owner with the output. Section 0 runs first, section F last.

## 0. Preflight

0.1 Both repos clean and current: `git -C . status --short` and `git -C ../alephb-site status --short` print
    nothing (or only known gitignored files); `git pull origin main` in both.
    **Check:** `git log -1 --oneline` in the game repo is at or after 11554fc; in alephb-site at or after cf83cf7.
0.2 The live state matches what the cloud session left (run `F.1` below once now as a baseline).
    **Check:** every line of `F.1` prints `OK`; any `FAIL` is fixed or reported before going on.
0.3 No timed compete session running (ask the owner, or the desk's Setup page shows no open season).
    **Check:** no season in state `open`.

## A. Google accounts [browser]

A1. Search Console: the property was created with techneb.jr@gmail.com. Add the AlephB account (the one owning
    GA4 and AdSense) as **Owner**: Settings > Users and permissions > Add user > AlephB address > Owner.
    Check the property type: a **Domain** property `alephb.uk` (DNS TXT in Cloudflare) covers the root and every
    subdomain; a URL-prefix property covers only its prefix. If it is URL-prefix `https://mystery.alephb.uk/`,
    also add the Domain property (or at least URL-prefix `https://alephb.uk/`).
    **Check:** signed in as AlephB, Search Console lists the property and Settings > Users and permissions shows
    both accounts, each "Owner"; the property selector shows `alephb.uk` (Domain) or `https://alephb.uk/`.
A2. Sitemaps: submit `https://alephb.uk/sitemap.xml` and `https://alephb.uk/learn/sitemap.xml`; keep
    `https://mystery.alephb.uk/sitemap.xml` (it now lists only the landing page and privacy.html).
    **Check:** Sitemaps shows each with status "Success" and "Discovered pages" 7 for `sitemap.xml`, 17 for
    `learn/sitemap.xml` (a "Couldn't fetch" right after submitting is normal; recheck the next day).
A3. URL Inspection > Request indexing (about 10 a day), in this order:
    day 1: `/learn/`, `/learn/exercises.html`, `/learn/select-where.html`, `/learn/joins.html`,
    `/learn/group-by-having.html`, `https://alephb.uk/`;
    day 2: `/learn/order-by-limit.html`, `like.html`, `dates-times.html`, `nulls.html`, `case-when.html`,
    `subqueries.html`, `set-operations.html`, `window-functions.html`, `ctes.html`;
    day 3: `database.html`, `schema.html`, `grammar.html`, `ritz-affair.html`, `articles.html`, the three articles.
    Expected: the old `mystery.alephb.uk/learn/*` read "Page with redirect" (correct; do not use Change of address,
    which is for a whole domain).
    **Check:** per URL, "Test live URL" reads "URL is available to Google", the user-declared canonical is the
    alephb.uk URL itself and "Page fetch" is "Successful"; after the request, "Indexing requested". Within about
    a week, Pages > Indexed counts the /learn/ pages (keep a dated tally in this file, below).
A4. Optional: link Search Console to GA4 (GA4 Admin > Product links > Search Console), once AlephB owns both.
    **Check:** GA4 Admin > Search Console links lists the property and web stream; after 1-2 days GA4 Reports >
    Search Console shows queries.
A5. AdSense: Sites > alephb.uk > confirm the issues are fixed > **Request review**, never remove and re-add the
    site. Owner's call on timing: as soon as A3's day-1 pages read "URL is on Google" (a few days), or at once.
    Record the date in both CLAUDE.md files (D1).
    **Check:** AdSense > Sites shows alephb.uk "Getting ready" / "Under review" with today's request; `ads.txt`
    still answers: `curl -s https://alephb.uk/ads.txt` contains `pub-9765732642926043`.

Indexing tally (fill in): date / indexed /learn/ pages / impressions last 7 days.

## B. alephb-site (one approval for the batch)

B1. Footer nav on every page: Home . Articles . Handbook (`learn/`) . Privacy. The pages are `index.html`,
    `privacy.html`, `ritz-affair.html`, `articles.html`, `article-*.html` (grep `<nav><a href="./">Home</a>`).
    Never touch `learn/` by hand (generated).
    **Check:** `grep -L 'href="learn/">Handbook' index.html privacy.html ritz-affair.html articles.html article-*.html`
    prints nothing; `git diff --stat` touches no file under `learn/`.
B2. Home page, Ritz Affair section: check the handbook bullet and the "Open the handbook" button point at
    `learn/` (done 2026-10-30) and that the copy says the handbook lives here ("on this site"), humanizer rules.
    **Check:** `grep -c 'mystery.alephb.uk/learn' *.html` prints 0 for every file; the copy reread aloud has no
    clue, answer or bar name.
B3. `ritz-affair.html` and the articles: one sentence each where the handbook is named, linking a specific
    lesson (e.g. joins, GROUP BY) with a relative `learn/...` URL. Original wording only (no text copied from
    the handbook or the game: duplicate content).
    **Check:** each new sentence searched (exact phrase) in `site/learn/*.html` and `site/index.html` of the game
    repo finds nothing; each new `learn/<page>.html#<anchor>` exists (`grep -c 'id="<anchor>"' learn/<page>.html`
    is 1).
B4. Links and deploy: every new or changed link returns 200, then push and watch the build.
    **Check:** `for u in $(grep -ohE 'href="[^"#]+' index.html privacy.html ritz-affair.html articles.html article-*.html | cut -c7- | sort -u); do case $u in http*) url=$u;; mailto:*) continue;; *) url=https://alephb.uk/$u;; esac; printf '%s %s\n' "$(curl -s -o /dev/null -w '%{http_code}' -L "$url")" "$url"; done | grep -v '^200'`
    prints nothing after the deploy; `gh run list --limit 1` (alephb-site) reads "completed success"; F.1 passes.

## C. Game repo

C1. Grammar links built in JavaScript go through the redirects: `site/terminal.js` `strictHtml(r, base = "learn/")`.
    In the game, pass the absolute base `https://alephb.uk/learn/` instead (keep `""` on the exercises page, which
    is served from alephb.uk itself). Decide in one place: an exported `HANDBOOK` constant in `shared.js`
    (`https://alephb.uk/learn/`), used by `strictHtml`'s game callers. Localhost still works (it opens the live
    handbook). Grep the other modules for built `learn/` links: `site/*.js` (`whereHtml`, `howto.js`,
    `onboarding.js`, `endings.js`, `app.js`), and the game-label links. Update the tests that pin `learn/` hrefs
    (`test_site.mjs`, `test_handbook.mjs`: grep `learn/`).
    **Check:** `grep -nE '"learn/|`learn/|\x27learn/' site/*.js` lists only `monitor.js`'s `/learn/` path filters;
    a new test asserts `strictHtml(r)` in the game links `https://alephb.uk/learn/<page>.html#<anchor>` and
    `strictHtml(r, "")` stays relative; in the browser (C8) a refused query's Grammar link opens alephb.uk directly
    (the address bar never shows mystery.alephb.uk/learn/).
C2. `colour_learn.mjs` line ~113 writes the game's sitemap with `https://mystery.alephb.uk/learn/`. The deploy
    prunes them (`pruneSitemap`), and the export rewrites them, so it works; cleaner: keep the game's
    `site/sitemap.xml` without the learn entries and have `colour_learn.mjs` write `learnSitemap` straight to the
    alephb URLs. Optional; if done, update `test_handbook.mjs` "sitemap lists ... every learn page" and the
    canonical test (canonical = sitemap URL) together, and `move_handbook.mjs` (`exportText` would no longer need
    the URL rewrite for canonicals: keep it as a no-op guard).
    **Check:** `node colour_learn.mjs` then `git diff --exit-code site/` is clean on a second run; the exported
    `learn/sitemap.xml` is byte-identical before and after the change apart from lastmod
    (`diff <(sed 's/<lastmod>[^<]*//' old) <(sed 's/<lastmod>[^<]*//' new)` prints nothing).
C3. Canonicals and JSON-LD in the repo's learn pages still read `mystery.alephb.uk/learn/` (rewritten at export).
    If C2 is done, write `https://alephb.uk/learn/` at the source instead, and set JSON-LD `isPartOf` to
    `{"@type":"WebSite","name":"AlephB","url":"https://alephb.uk/"}` (the handbook is now part of that site).
    **Check:** `grep -c 'mystery.alephb.uk/learn' site/learn/*.html` is 0 everywhere; the "search and previews"
    test passes (JSON-LD parses, canonical = sitemap URL); Google's Rich Results Test on
    `https://alephb.uk/learn/joins.html` after the export reads "Page is eligible" or lists no errors [browser].
C4. `feedback_script.gs` `SYSTEM_PROMPT` names the handbook at `https://mystery.alephb.uk/learn/`: change it to
    `https://alephb.uk/learn/`, run `node --test test_backend.mjs`, then redeploy the feedback script
    (`assets-source/clasp-feedback/deploy.sh`, same /exec URL) and check it answers.
    **Check:** `grep -c 'mystery.alephb.uk/learn' feedback_script.gs` is 0; test_backend passes; after the
    deploy, `clasp deployments` (in the clasp-feedback folder) shows the same deployment id at a new version; one
    test message sent from `https://alephb.uk/learn/like.html` (Feedback button, owner's own email) lands in the
    Sheet with page `/learn/like.html`, its subject names "Clerk's Handbook, LIKE and text patterns", and its
    reply draft links alephb.uk/learn/, not the subdomain. Mark that row `discarded` afterwards.
C5. `README.md` and the spec (`docs/superpowers/specs/2026-09-20-sql-mystery-game-design.md`, section 8
    Advertising): the handbook's address, the second refusal and the move.
    **Check:** `grep -n 'alephb.uk/learn' README.md docs/superpowers/specs/2026-09-20-sql-mystery-game-design.md`
    finds the new lines; `grep -n 'mystery.alephb.uk/learn' README.md` finds none.
C6. Monitor (desk, Handbook view): `SCOPES` filters `pagePath` beginning `/learn/`; GA also needs the host now
    that both hosts serve `/learn/` (redirect stubs carry no GA, so only alephb.uk counts). Check on the live desk
    that the Handbook view shows visits after 2026-10-30; if the Global PAGES donut should tell hosts apart, add
    `hostName` to `REPORT_DIMS` / `DIMENSIONS` (apps_script.gs and shared.js together, a test compares) and
    redeploy the backend (`assets-source/clasp/deploy.sh`).
    **Check:** GA4 Realtime, while the owner opens `https://alephb.uk/learn/like.html` in a non-European time zone
    or after a Yes on the banner, shows a page_view with page path `/learn/like.html` and host `alephb.uk`
    [browser]; the next day the desk's Handbook view, 7 days, shows that visit; if `hostName` was added, the Pivot
    table with dimensions hostName + pagePath lists `alephb.uk` rows for /learn/ and `mystery.alephb.uk` for `/`.
C7. Privacy: `site/privacy.html` (done 2026-10-30) says the handbook is at alephb.uk/learn/; reread the
    "Saved in your browser" section and add that the handbook's keys (`ritz.theme`, `ritz.consent`,
    `ritz.exercises*`) are kept by alephb.uk, separately from the game's.
    **Check:** `grep -n 'alephb.uk' site/privacy.html` shows both mentions; the "last updated" date is the day of
    the edit; `LC_ALL=C grep -n '[^ -~]' site/privacy.html` prints nothing; alephb.uk's own `privacy.html` still
    links the game's notice for the handbook (`grep -c 'mystery.alephb.uk/privacy.html' ../alephb-site/privacy.html` >= 1).
C8. After any of C1-C3, C7: run every suite, push the game, export, push alephb-site, check in Chrome.
    `python3 generate_db.py --seasons`, `python3 -m unittest`,
    `node --test test_site.mjs test_desk.mjs test_handbook.mjs test_backend.mjs`, push the game, then
    `node move_handbook.mjs export $(git rev-parse --short=7 HEAD) ../alephb-site`, commit and push alephb-site.
    **Check:** every suite passes with 0 failures and 0 skipped (paste the summary lines in the report);
    `git status --short` shows no `site/mystery.sqlite` change committed by accident (restore it if the rebuild
    touched it); both deploys "completed success" (`gh run list --limit 1` in each repo); F.1 and F.2 pass;
    in Chrome: a refused query's Grammar link (C1), `https://mystery.alephb.uk/learn/like.html#like-ilike` landing
    on `https://alephb.uk/learn/like.html#like-ilike` scrolled to that section, `alephb.uk/learn/exercises.html`
    solving exercise 1 (green "Solved"), day/night on the game and the handbook, the handbook at 390 px wide
    (no horizontal scroll), the ad box on exercises.html only.
C9. Run `python3 generate_db.py` once on the Mac (the `../SQL` correction file), as after any change elsewhere.
    **Check:** `ls -l "../SQL/3-Corrections/8. Correction SQL Mystery Game.sql"` shows today's time; `git status`
    in the game repo shows no change from it.

## D. Records

D1. Both CLAUDE.md files, AdSense sections: second refusal 2026-10-30, the move, the review request date (A5).
    **Check:** `grep -n '2026-10-30' CLAUDE.md ../alephb-site/CLAUDE.md` finds the refusal in both; the game's
    Ads bullet no longer says only "re-review verdict pending"; alephb-site's AdSense section no longer ends at
    "still under review on 10-23".
D2. Supermain memory (`~/.claude/projects/-Users-techneb-Projets/memory/`): the handbook's new address and that
    alephb-site's `learn/` is generated by the game repo.
    **Check:** `grep -rn 'alephb.uk/learn' ~/.claude/projects/-Users-techneb-Projets/memory/` finds the entry.

## E. Traffic ("genuine user interest")

E1. The course: point the course page, slides and the `../SQL` material at `https://alephb.uk/learn/`.
    **Check:** `grep -rln 'mystery.alephb.uk/learn' ../SQL` prints nothing (text files; slides are listed for the
    owner to fix by hand).
E2. One public post (LinkedIn, r/SQL or Show HN) presenting the game and the handbook together; draft it for the
    owner to post, original wording, no clue (Shortcut check).
    **Check:** the draft names no answer, planted value, suspect detail or chapter-specific shortcut; every link in
    it returns 200; the owner has approved the text before anything is posted.
E3. One external article (dev.to) on teaching SQL with a mystery, linking two or three lessons; draft only.
    **Check:** as E2, plus no paragraph matches a sentence of alephb.uk's articles or the handbook (exact phrase
    search), so it is not duplicate content.
E4. If AdSense refuses a third time: Mediavine Journey (about 1,000 sessions a month since January 2026; check
    its current terms and whether it takes a static site), with the Global view's sessions for the last 30 days.
    **Check:** the terms are read on Mediavine's own site (not a blog), dated, and quoted to the owner with the
    desk's 30-day sessions figure before any application.

## F. Acceptance checks (run at 0.2 and after every deploy)

F.1 Live URLs. Run from the game repo:

```bash
ok() { printf '%s %s\n' "$1" "$2"; }
for p in "" exercises.html like.html joins.html sitemap.xml lib/terminal.js lib/style.css; do
  c=$(curl -s -o /dev/null -w '%{http_code}' "https://alephb.uk/learn/$p"); [ "$c" = 200 ] && ok OK "learn/$p" || ok FAIL "learn/$p $c"
done
for p in "" sitemap.xml robots.txt ads.txt privacy.html; do
  c=$(curl -s -o /dev/null -w '%{http_code}' "https://alephb.uk/$p"); [ "$c" = 200 ] && ok OK "/$p" || ok FAIL "/$p $c"
done
curl -s https://alephb.uk/learn/like.html | grep -q '<link rel="canonical" href="https://alephb.uk/learn/like.html">' && ok OK canonical || ok FAIL canonical
curl -s https://alephb.uk/learn/like.html | grep -q 'google-adsense-account' && ok OK adsense-meta || ok FAIL adsense-meta
curl -s https://alephb.uk/learn/like.html | grep -q '\.\./' && ok FAIL "../ left" || ok OK "no ../"
curl -s https://alephb.uk/robots.txt | grep -q 'learn/sitemap.xml' && ok OK robots || ok FAIL robots
[ "$(curl -s https://alephb.uk/learn/sitemap.xml | grep -c '<loc>https://alephb.uk/learn/')" = 17 ] && ok OK "17 in sitemap" || ok FAIL "learn sitemap count"
curl -s https://mystery.alephb.uk/learn/like.html | grep -q 'location.replace("https://alephb.uk/learn/like.html"' && ok OK stub || ok FAIL stub
curl -s https://mystery.alephb.uk/sitemap.xml | grep -q '/learn/' && ok FAIL "game sitemap lists learn" || ok OK "game sitemap"
curl -s https://mystery.alephb.uk/ | grep -q 'href="https://alephb.uk/learn/' && ok OK "game links" || ok FAIL "game links"
curl -s https://mystery.alephb.uk/ | grep -q 'href="learn/' && ok FAIL "relative learn/ left" || ok OK "no relative learn/"
curl -s https://alephb.uk/learn/exercises.html | grep -q "?v=" && ok OK versioned || ok FAIL versioned
```

    **Pass:** every line reads OK. (The handbook's `?v=` is the commit of its last export, which may be older than
    the game's HEAD; that is expected.)
F.2 The handbook export is current: in a temp folder, `node move_handbook.mjs export <hash of the last export>
    <tmp>` and `diff -r <tmp>/learn ../alephb-site/learn` print nothing; if the game's `site/learn/` changed
    since, export again (C8).
    **Pass:** no diff, or a fresh export pushed.
F.3 Browser, once per plan run [browser]: the C8 Chrome list, plus one phone (or 390 px) look at
    `https://alephb.uk/` showing the footer's Handbook link.
    **Pass:** owner's OK.
