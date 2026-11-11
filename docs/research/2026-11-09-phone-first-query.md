# Phones: the leak before the first query (2026-11-09)

GA4, 4-7 Nov (after the 2026-11-03 phone fixes), users, game pages:

| Step | Desktop | Mobile |
|---|---|---|
| Pressed Investigate or Join | 188 | 66 |
| Prologue finished / skipped | 92 / 76 | 20 / 25 |
| Neither (left inside the prologue, approx.) | ~20 (11%) | ~21 (32%) |
| Tour finished | 175 | 43 |
| Ran a query in chapter I | 147 | 23 |
| Found the date (step 1) / solved chapter I | 99 / 81 | 13 / 10 |
| Took the landing's warm-up link | 78 | 35 |

Two phone leaks: a third of the phone players who press Investigate leave inside the prologue, and about 20 who finish
the tour never run a query.

## What a 390x844 phone player meets

Walked in headless Chrome with device emulation (390x844, touch, iPhone user agent; no window resized). The keyboard,
iOS zoom and smart punctuation cannot be observed there and come from the code.

| Moment | What is on screen | Problem |
|---|---|---|
| Prologue opens | 540 px dialog, query pre-filled, Run focused (not the box, since 11-03) | none: step 1 is one tap |
| Step 2 | Asks to add `WHERE found_in = 'Garden'` to the box; dialog grows to 703 px with the 6-row result | the only step that needs the phone keyboard: tap the end of the box, then capitals, an underscore, `=` and two quotes |
| Step 2, keyboard up | the iOS keyboard takes about 330 px; Run (y 517-558) sits under it | the player must close the keyboard to find Run |
| Step 2, quotes | iOS smart punctuation types `'` as a curly quote; `autocorrect="off"` is not known to stop it | the run fails with the curly-quote line, which tells a beginner to find the plain ' key (a long press on iOS) or change a system setting: a dead end inside a modal, before the game starts |
| Step 3 | answer box focused, keyboard opens, Enter submits | fine (one word) |
| Tour | four callouts, objective, schema, board, Run; the schema callout covers the SQL box while it shows | the last callout says "(or Ctrl+Enter)" |
| After the tour | scrolled so the objective, schema, `SELECT * FROM interview LIMIT 5` and Run (y 406) are all on screen; one tap runs it and the results appear under Run | nothing blocks the first query; the consent banner covers the bottom 200 px (notepad area) |

## Ranked candidate fixes

| # | Fix | Worth | Risk | Done |
|---|---|---|---|---|
| 1 | Prologue step 2 on phones: a "Type it for me" button that writes the WHERE into the box; the player still reads it and presses Run | high: removes the only keyboard step before the game, and with it the hidden Run and the curly quotes | low, phones only | yes |
| 2 | Straighten curly quotes as they are typed in every SQL box on phones (game, prologue, exercises) | high where smart punctuation is on (chapter I's own queries need quotes too) | low: the data is ASCII, so a curly quote never matched anything | yes |
| 3 | The tour's Run callout without "(or Ctrl+Enter)" on phones | small | none | yes |
| 4 | Last callout on phones: its button reads "Run it" and runs the pre-filled query | could reach the ~20 who finish the tour and never run | changes what tour_done means; a design call | owner |
| 5 | Shorter prologue chrome on phones (22 px title, no intro paragraph) so Run and the results stay in one screen | medium | low, but it changes the owner's copy | owner |
| 6 | The consent banner on phones: smaller, or after the first query | unknown | touches the consent rules | owner |

Not a bug: half of the phone visitors take the warm-up link to the handbook. The exercises page links back to the game
from its masthead nav, so it is no dead end; it may be where phone players prefer to start.

## Shipped (branch, not pushed)

1, 2 and 3, under 900 px or on a coarse pointer (`ui.js` `PHONE`); desktop unchanged. Untested on a real iPhone, in
particular whether iOS still types curly quotes with `autocorrect="off"`. GA's `query_fail` type `curly_quote` by
device answers that. After a push, compare this table for the following two weeks: prologue "neither" on mobile (32%)
and ran / opened (35%).

## Early re-read, 2026-11-11

The same GA exploration, event x device category, active users, on 10-11 Nov (the 9 Nov fixes went live that evening; the 11th is still partial). The numbers count every chapter, but chapter I dominates opens and first queries.

| Window | Mobile opened / ran / step 1 | Ran / opened | Desktop opened / ran / step 1 | Ran / opened |
|---|---|---|---|---|
| 4-7 Nov (before) | 68 / 24 / 13 | 35% | 215 / 171 / 99 | 80% |
| 10-11 Nov (after) | 22 / 13 / 5 | 59% | 49 / 34 / 17 | 69% |

On phones, prologue done / skipped went from 20 / 25 to 8 / 8. Reading: the share of phone openers who run a query rose from 35% to 59%, the change the fixes aimed at, but it rests on 22 people over a day and a half. Desktop fell at the same time, which suggests noise. `try_here` (live 11 Nov evening) has no data yet. Read again with a full week, about 2026-11-15.
