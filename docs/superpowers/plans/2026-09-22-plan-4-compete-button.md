# Plan 4 -- Compete Mode: the in-game button

**Goal:** wire the landing page's `#btn-compete` (hardcoded disabled since Plan 2) to the content and backend
Plan 3 delivered: team-name entry, a client-side clock, `start`/`progress`/`finish` events POSTed to
`apps_script.gs`, a way to pick the season a class plays, and a way to get season files onto GitHub Pages
without copying them by hand. Spec: `2026-09-20-sql-mystery-game-design.md` section 4 (Flow) and phase 3.

**Status:** implemented 2026-09-22, in the same change as this document. Verified end to end in a real
Chromium against a local stand-in for the Apps Script (start, 7 progress rows, finish with the right totals,
reload-resume, leaderboard row, missing season, no-board mode, abandon, phone width).

## Decisions

1. **Season selection is the URL.** `index.html?season=N` puts the page in "season N is offered" mode: the
   landing page always shows (a learn game in progress is not auto-resumed on a season link), and Compete is
   enabled iff `season-N.json` fetches. No manifest file, no dropdown: the teacher shares one link.
2. **The Apps Script URL travels in the link too**, `&board=<exec URL>`, mirroring `leaderboard.html?data=`.
   `APPS_SCRIPT_URL` in `app.js` stays empty in git (public repo, unauthenticated write endpoint). Without a
   board the game still runs with a local clock and says NOT RECORDED.
3. **Seasons reach Pages through `seasons.txt`.** The Pages workflow runs `generate_db.py --season N` for each
   listed number before uploading `site/`; the files themselves stay gitignored. Opening a season is one
   line and a push; closing it is deleting the line.
4. **Separate storage key** `ritz.compete` (spec section 4); `ritz.learn` is untouched by a season game.
   Reloading resumes the season game (same season, team set); "New investigation" abandons it.
5. **Events carry no client time.** Payload is `{event, team, season, chapter, hints, wrong, queries}`; the
   server stamps rows. Undelivered events sit in `state.outbox` and retry every 30 s, oldest first. Because a
   retry can duplicate a row the server did record, `leaderboard.html` now scores the **first** `start` and
   the **first** `finish` per team and season (chronological sheet order), so retries and reloads can never
   shorten a time. The client clock in the masthead is for the players; the finish screen says so.
6. **POST body is `text/plain`**, so the browser sends no CORS preflight (Apps Script cannot answer one).
7. **Part I only:** `awaitingCode` is false in compete mode; solving chapter VIII shows a finish screen
   with the local time, a link to `leaderboard.html?data=<board>`, and the certificate button.

## Files

| File | Change |
|---|---|
| `site/app.js` | `mode`/`season`/`team`/`startedAt`/`finishedAt`/`outbox` in state; `storageKey`, `loadFrom`; `competeDone`, `fmtTime`, `competeStats`, `eventPayload` (exported, tested); `loadDb(stem)`; `offerCompete`, `startCompete`, `loadSeason`, clock, `queueEvent`/`flushOutbox`; finish screen; boot reads `season`/`board` |
| `site/index.html` | team form under the landing buttons; `#compete-info` clock line in the masthead |
| `site/style.css` | the two above |
| `site/leaderboard.html` | first start / first finish win |
| `.github/workflows/pages.yml`, `seasons.txt` | build listed seasons at deploy |
| `test_site.mjs` | compete gating, storage keys, totals, payload, `fmtTime` |
| `README.md`, `CLAUDE.md`, spec phase 3 and backlog | documentation |

## Manual test (what the Chromium run did)

```bash
python3 generate_db.py --season 7
python3 -m http.server 8000 -d site &
# any local server that logs POSTs and answers GET with the rows works as a stand-in for the Apps Script
```

Open `http://localhost:8000/?season=7&board=http://localhost:8010/`: Compete enabled; team "Alpha"; masthead
reads `SEASON 7 -- ALPHA -- 00:00` and counts; chapter I objective is the Meurice burglary (compete text);
answers from `python3 -c "import generate_db, plot; c, V = generate_db.build_db(7); print([V[ch['answer_key_compete']] for ch in plot.CHAPTERS[:8]])"`;
after chapter VIII the story says Case closed with a leaderboard link; the stand-in has one `start`, seven
`progress`, one `finish` with `wrong`/`queries` totals; reload lands back in the finished game;
`leaderboard.html?data=http://localhost:8010/` ranks Alpha; `?season=99` leaves Compete disabled with a
reason; `?season=7` without `board` says NOT RECORDED.
