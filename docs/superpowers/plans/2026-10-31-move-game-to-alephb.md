# Move the game to alephb.uk/ritz-affair/: go-live runbook

Written 2026-10-31 for the main session (CLI on the owner's Mac). Owner's decision the same day: the game moves from
<https://mystery.alephb.uk/> to <https://alephb.uk/ritz-affair/>, next to the handbook at <https://alephb.uk/learn/>;
mystery.alephb.uk stays only as a bridge. What was built (CLAUDE.md, "Site address"): `publish.mjs`,
`.github/workflows/publish-alephb.yml` (replaces export-handbook.yml), `pages.yml` switched by the repository
variable `BRIDGE`, the save import in `app.js` (`state.js` `readImport` / `importWrites`).

Run the steps in order. Each ends with a **Check:**; a failing check stops the runbook there and goes to the owner.
Never during a timed compete session (no season `open` on the desk's Setup page): every push rebuilds the season
databases, and the bridge moves players mid-game.

1. **Preflight.** No open season; the branch merged into main locally; the suites pass.
   **Check:** `python3 generate_db.py --seasons && python3 -m unittest && node --test test_site.mjs test_desk.mjs
   test_handbook.mjs test_backend.mjs` ends with 0 failures; the desk shows no season in state `open`.
2. **Secret present.** `ALEPHB_SITE_DEPLOY_KEY` is a repository secret (write deploy key on Techneb/alephb-site).
   **Check:** `gh secret list` lists it; `gh variable list` does **not** list `BRIDGE` yet (mystery.alephb.uk keeps
   the old game until step 6).
3. **Publish first: push main.** Both workflows run; pages.yml redeploys the old game (BRIDGE unset), publish-alephb.yml
   writes `ritz-affair/` and `learn/` into alephb-site (the old `learn/lib/` goes) and pushes.
   **Check:** `gh run list --workflow publish-alephb.yml --limit 1` reads `completed success`; in alephb-site
   `git pull && git log -1 --stat | tail -1` shows the "Game and handbook from game <sha>" commit; after its Pages
   build (`gh run list -R Techneb/alephb-site --limit 1` success):
   `for u in ritz-affair/ ritz-affair/privacy.html ritz-affair/admin.html ritz-affair/mystery.sqlite ritz-affair/season-1.sqlite ritz-affair/sitemap.xml learn/ learn/exercises.html; do printf '%s %s\n' "$(curl -s -o /dev/null -w '%{http_code}' https://alephb.uk/$u)" $u; done`
   prints 200 eight times; `curl -s https://alephb.uk/ritz-affair/ | grep -c 'canonical" href="https://alephb.uk/ritz-affair/"'` is 1;
   `curl -s https://alephb.uk/learn/exercises.js | grep -c '../ritz-affair/terminal.js?v='` is 1;
   `curl -sI https://alephb.uk/ritz-affair` answers (200, or 301 to `/ritz-affair/`; alephb-site also has
   `ritz-affair.html`: note which one GitHub serves for the slash-less path and tell the owner).
4. **Check the new game in Chrome** [browser, owner's Chrome, no resize]: <https://alephb.uk/ritz-affair/>: the landing,
   Investigate, a first query runs, the Hint's Grammar link opens alephb.uk/learn/; the handbook's exercises page runs
   a query; the desk (`/ritz-affair/admin.html`, the passphrase) lists the seasons. Compete: with the owner's OK create
   a test season, Copy link (it must read `https://alephb.uk/ritz-affair/?season=...&board=...`), open it in a private
   window, Join, open the season, solve nothing, close it, delete it.
   **Check:** no console error on the three pages; the student link and the QR name alephb.uk/ritz-affair/; the board
   (`/ritz-affair/leaderboard.html?data=...`) showed the test team; the season is deleted.
5. **alephb-site edits** (the owner approves the push): add to `robots.txt` the lines below; in `index.html`,
   `ritz-affair.html`, `privacy.html`, the articles and every footer, replace `https://mystery.alephb.uk/` links by
   `ritz-affair/` (`https://mystery.alephb.uk/privacy.html` by `ritz-affair/privacy.html`); decide with the owner
   whether `ritz-affair.html` (the article about the game) keeps its name beside the `ritz-affair/` folder.
   ```
   Disallow: /ritz-affair/admin.html
   Disallow: /ritz-affair/monitor.html
   Disallow: /ritz-affair/monitor-game.html
   Disallow: /ritz-affair/monitor-handbook.html
   Disallow: /ritz-affair/explore.html
   Disallow: /ritz-affair/inbox.html
   Sitemap: https://alephb.uk/ritz-affair/sitemap.xml
   ```
   **Check:** `grep -c mystery.alephb.uk *.html` prints 0 for every file in alephb-site; `git diff --stat` touches
   nothing under `ritz-affair/` or `learn/`; after the deploy `curl -s https://alephb.uk/robots.txt` has the seven lines.
6. **Switch mystery.alephb.uk to the bridge.** `gh variable set BRIDGE --body on`, then `gh workflow run pages.yml`.
   **Check:** the run succeeds; `curl -s https://mystery.alephb.uk/ | grep -c 'function bridgeTarget'` is 1;
   `curl -s https://mystery.alephb.uk/privacy.html | grep -o 'location.replace("[^"]*"'` reads
   `https://alephb.uk/ritz-affair/privacy.html`; `curl -s https://mystery.alephb.uk/learn/like.html` replaces to
   `https://alephb.uk/learn/like.html`; `curl -s -o /dev/null -w '%{http_code}' https://mystery.alephb.uk/app.js` is 404.
7. **Save import, live** [browser]: in the owner's Chrome, which has a game saved on mystery.alephb.uk, open
   <https://mystery.alephb.uk/>. **Check:** it lands on `https://alephb.uk/ritz-affair/` with no `#import=` left in the
   address, at the same chapter with the same badges, notes and day/night choice; the handbook's exercises page shows
   the same solved ticks if they were made on mystery.alephb.uk; a second visit to mystery.alephb.uk changes nothing.
8. **Cloudflare redirect for every old path but `/`** (the bridge page must keep serving `/` and `/index.html`: only it
   can read the old origin's storage). Needs the `mystery` record proxied (orange cloud) with SSL mode Full; if the
   owner prefers to keep it DNS only, skip this step: the stubs already redirect (JavaScript, meta refresh, canonical).
   Rules > Redirect Rules, two Single Redirects, 301, preserve query string:
   - `http.host eq "mystery.alephb.uk" and starts_with(http.request.uri.path, "/learn/")` ->
     dynamic `concat("https://alephb.uk", http.request.uri.path)`;
   - `http.host eq "mystery.alephb.uk" and not http.request.uri.path in {"/" "/index.html"} and not
     starts_with(http.request.uri.path, "/learn/")` -> dynamic `concat("https://alephb.uk/ritz-affair", http.request.uri.path)`.
   **Check:** `curl -sI https://mystery.alephb.uk/privacy.html?x=1` is 301 to `https://alephb.uk/ritz-affair/privacy.html?x=1`;
   `curl -sI https://mystery.alephb.uk/learn/like.html` is 301 to `https://alephb.uk/learn/like.html`;
   `curl -s -o /dev/null -w '%{http_code}' https://mystery.alephb.uk/` is 200 (the bridge); step 7 still passes.
9. **Search Console** [browser, AlephB account]: submit `https://alephb.uk/ritz-affair/sitemap.xml`; URL Inspection >
   Request indexing for `https://alephb.uk/ritz-affair/` and `/ritz-affair/privacy.html`; on the mystery.alephb.uk
   property (if URL-prefix) remove its sitemap (the bridge has none). Do not use Change of address (alephb.uk is not a
   new domain for the whole property).
   **Check:** Sitemaps lists the new one ("Success" within a day, 2 discovered pages); Test live URL on
   `https://alephb.uk/ritz-affair/` reads "URL is available to Google" with itself as canonical.
10. **Feedback script redeploy** (`feedback_script.gs` names the new address in its prompt, signature and email links;
    `subject_` reads `/ritz-affair/` paths): `assets-source/clasp-feedback/deploy.sh "game on alephb.uk"`.
    **Check:** `clasp deployments` (in that folder) shows the same deployment id at a new version; a test message sent
    from `https://alephb.uk/ritz-affair/` (Feedback, the owner's own email) arrives with the subject "The Ritz Affair
    feedback: landing page", the line `Page: https://alephb.uk/ritz-affair/`, and a reply draft signed
    `https://alephb.uk/ritz-affair/`; mark the row `discarded`. The compete backend (`apps_script.gs`) needs no redeploy.
11. **Ads and statistics.** **Check:** AdSense > Sites lists alephb.uk (ads now serve on `/ritz-affair/` under the same
    site; `curl -s https://alephb.uk/ads.txt` contains `pub-9765732642926043`); a day later the desk's Game view
    (`/ritz-affair/monitor-game.html`) shows visitors on `/ritz-affair/` (GAME_PATHS counts both the old and new paths).
12. **Docs and memory.** Record the go-live date in CLAUDE.md ("Site address"), the spec's backlog entry (mark it done),
    README if anything changed, and the project memory (the resume note; the Apps Script URL is unchanged).
    **Check:** `git grep -n "waiting for go-live"` prints nothing.

Rollback: `gh variable delete BRIDGE` then `gh workflow run pages.yml` puts the old game back on mystery.alephb.uk
(its canonicals already name alephb.uk); remove the Cloudflare rules first if step 8 was done.
