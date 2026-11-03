# Chapter I on phones: why phone players fall behind (2026-11-03)

Study only, nothing changed. Two parts: GA4 (6 Oct - 2 Nov, desktop vs mobile; tablets about 30 users, left out) and
a walk through chapter I as a phone player (headless Chrome, iPhone user agent, 390x844, touch; the keyboard, iOS zoom
and smart quotes were not observable and come from the code). The 22 screenshots stayed in the session scratchpad.

## 1. What GA shows

| Users | Desktop | Mobile |
|---|---|---|
| First visits | 2,233 | 2,302 |
| Pressed Investigate or Join (`landing_begin`) | 417 (19%) | 223 (10%) |
| Opened chapter I | 1,002 | 433 |
| Solved chapter I (of openers) | 372 (37%) | 71 (16%) |
| Left chapter I unsolved (of openers) | 347 (35%), 4.3 queries | 178 (41%), 3.4 queries |
| Opened the Hint (of openers) | 224 (22%) | 98 (23%) |
| Prologue finished / skipped | 149 / 133 | 40 / 42 |
| Tour finished / skipped | 186 / 59 | 42 / 14 |
| Step 1 found (since 31 Oct), queries per find | 19, about 6 | 7, about 20 |

Half of the visitors are on phones. They press Investigate half as often, and an opener solves chapter I less than
half as often. The prologue and the Hint are used alike on both, so neither explains the gap. Step 1 (the date in
Duroc's statement) costs a phone player about three times the queries, on a small sample.

## 2. What a phone player sees (ranked)

1. **The clue text is off-screen to the right (high).** `.results td { white-space: nowrap }` (`site/style.css`) keeps
   every cell on one line. Duroc's transcript is a 1,716 px cell in a 356 px box: the date words start about 1,100 px
   to the right, with no scrollbar on iOS. In step 2, `police_report.type` is a sliver and `description` is 2,000 px
   away. The two facts chapter I asks the player to read are exactly what the phone hides. Fix: under 900 px, let text
   cells wrap (`white-space: normal`, a max width).
2. **The schema comes last on phones (high).** Under 900 px the columns stack story, terminal, schema: the schema sits
   under the answer box, History and about 500 px below the SQL box, so the player scrolls down for a column name and
   back up to type. Fix: put the schema before the terminal under 900 px, or show the revealed columns above the box.
3. **The first screen has no terminal and the tour ends far from it (medium-high).** The SQL box starts at y=879 on an
   844 px screen; the tour ends on the case board near the top; an empty 120 px notepad sits between the objective
   and the terminal. Fix: end the tour on Run on narrow screens, move the notepad under the terminal.
4. **iOS zooms into the 14 px SQL box (medium).** `#sql` and `#prologue-sql` are 14 px (the answer box 16 px); iOS
   Safari zooms on a focused field under 16 px and stays zoomed. The prologue focuses its box on open. Fix: 16 px under
   900 px for both boxes and their highlight layer; no auto-focus on touch screens.
5. **Nothing scrolls to what changed (medium).** After a run, nothing scrolls to the results (the keyboard may cover
   them); after step 1, the step 2 objective is 508 px above and the reply only says to find the report. Fix: scroll to
   the results after a run on phones; name the step 2 question in the reply.

Smaller: keyboard hints a phone cannot use (Ctrl+Enter, Tab), curly quotes from the iOS keyboard still refused, 18 px
tap targets on the Hint, two-way scrolling inside the results box, badge toasts covering about 260 px.

## 3. Open

- The landing loss (10% vs 19% press Investigate) is the largest in absolute numbers and was not studied here.
- Phone visitors may simply be less committed (many came from Instagram videos): the gap will not close entirely.
- After a fix, compare the same table for the following two weeks.

## Shipped

2026-11-03 (owner: all five, phones only): 9a1d182 and c84e0ae. Under 900 px the page reads story and objective, telegram, schema, terminal, case board, notepad; long result cells wrap; SQL boxes 16 px (also on coarse pointers); no prologue autofocus on touch; the tour ends on Run; results and the step 2 objective scroll into view when off screen. Not checked on a real iPhone. Compare GA from 2026-11-04.
