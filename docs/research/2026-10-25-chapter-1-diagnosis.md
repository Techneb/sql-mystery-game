# Chapter I drop-off: diagnosis (2026-10-25)

Read-only. Sources: `ch1-ga.txt` (GA, 30 days to 2026-10-25), `plot.py` ch1, `site/chapters.json`, `site/mystery.sqlite`, `site/index.html`, `site/app.js`. I put the commonest newcomer queries through `strictCheck` (node, importing `site/app.js`) and through SQLite (python). I did not play it in a browser, so nothing here was checked visually, and the phone points are reasoned from the CSS and markup.

## 1. What the data shows

**Windows.** `chapter_open`/`chapter_solve` cover 30 days. `chapter_queries` went live on 2026-10-23 at 21:28 and every other new event on 2026-10-24 at 02:05 (git log), so they cover about 1.5 days. Compare them only with the opens and solves of 10-24 and 10-25: **~257 opener-days, 71 solvers, 28%**. That is the same rate as the 30-day figure, so the short window looks representative, but every number below is small.

**Funnel in the short window** (opens are summed daily users, so a slight overcount; the runner counts also include the 10-23 evening):

| Step | Users | Share of openers |
|---|---|---|
| Opened chapter I | ~257 | 100% |
| Ran 1+ query | ≤146 | ~55% |
| Ran 5+ | 101 | ~39% |
| Ran 20+ | 34 | ~13% |
| Solved | 71 | ~28% |

- **The biggest single leak is before the first query: about 45% of openers never press Run on anything.** Among those who run at least one query, about half solve.
- **Failures:** 100 users had at least one failed query, about 2/3 of the runners. A raw SQLite error hit 77 users (158 events, capped at 3 per user per chapter, so the real volume is higher). Strict refusals: double-quotes 31 users, types 26, boolean 8, coalesce (`IS <value>`) 7. Overlap is unknown, but roughly a third of runners met a strict refusal. GA cannot tell which raw errors they were: the event sends `rule = ''` for all of them.
- **Hint:** 113 users opened the Hint in ch1 (~44% of openers), against 36 in ch2. All it holds is "SELECT / WHERE" and the two table names.
- **Wrong answers:** 70 users submitted at least one, 38 submitted three or more. Ch1 solvers average 2.84 wrong answers, the highest of all 12 chapters, and 19 queries. The 17th decoys (1001 the balcony ham, 1093 the A. L. card case, 1839) work as designed. We cannot tell how many wrong answers were not ids at all (for example "18 May").
- **Segments (30 d):**
  - Device: mobile 53/317 = **17%**, desktop 228/704 = 32%.
  - New 225/951 = **24%**, returning 59/80 = 74%.
  - Country: France 14/15 (the course), UK 39%, US 29%, Canada 26%, Australia 21%, India 20%, Philippines 19%.
  - Channel: Direct 27%, Organic 21%. Compete has 1 user, so ignore it.
  - Outsiders sit around 20-30%, and phones are about half the desktop rate.
- **Not usable:** `chapter_leave` (191 users, 2.7 queries on average). It fires on any tab hide, so it includes people who switched tabs and solved later, and its seconds are skewed.

## 2. Friction points, in the order a newcomer meets them

1. **Landing to Investigate:** no problem visible (236 Begin presses in the window).
2. **The first screen does not say where Duroc's words are.** The story points at the police reports and at Duroc. The objective is bare (as it must be). The placeholder reads `SELECT * FROM police_report WHERE ...` and points at police_report, not interview. **On a phone** (under 900 px: story, terminal, schema) the schema with its table and column names sits below the terminal and the answer row, out of view while you type.
3. **Run on an empty box does nothing.** `runQuery` returns at once when the box is empty: no message, no rows. A newcomer who presses Run to see what happens (the placeholder looks like a query) gets silence. This is the likeliest cause of the "opened, never ran" half.
4. **Values must be exact and the only feedback is "No rows.":**
   - `person_name = 'Duroc'` (the column holds 'Marcel Duroc');
   - `place = 'Ritz'` (it holds 'Hotel Ritz');
   - `type = 'Theft'` (it is lowercase);
   - `LIKE '%sapphire%'` (case-sensitive: it misses 2127's "Sapphire").

   These teach browsing with `SELECT *` first, but none of them gives a signal.
5. **Double quotes** (`= "Marcel Duroc"`): refused, and the message is already clear ("a text value takes single quotes, 'Marcel Duroc'"). Fine as is.
6. **Dates are INTEGER YYYYMMDD: a dead-end loop.**
   - `date = '1912-05-18'` is refused with "date holds numbers and '1912-05-18' is quoted text: compare it with a number." It does not say which number or which format.
   - The natural next try, `date = 1912-05-18`, passes the checker and silently returns No rows: it is the subtraction 1889. The same happens with `date = 18`.
   - Only the digits-only case `'19120518'` already gets "drop the quotes, as in date = 19120518".
7. **Raw SQLite errors, unexplained.** These all pass `strictCheck` and reach SQLite:

   | Query | SQLite says |
   |---|---|
   | `place = Hotel Ritz` | `near "Ritz": syntax error` |
   | `FROM interviews` | `no such table: interviews` |
   | `FROM police report` | `no such table: police` |
   | `WHERE name = ...` | `no such column: name` |
   | `= Ritz` | `no such column: Ritz` |

   **Curly quotes**, typed by iOS Smart Punctuation (on by default), give `near "Ritz’": syntax error` for every string literal. The textarea sets only `spellcheck="false"`, with no `autocorrect`/`autocapitalize="off"`. This is a hypothesis for part of the phone gap, to check on a real iPhone.
8. **Duroc's transcript says it outright** ("write the 18th of May"). After that the answer query is a three-condition WHERE. The 17th decoys catch people who go by the title. This is intended and is why solvers make 2.8 wrong answers.
9. **Answer shape.** A non-id answer ("18 May", "the 18th") gets the same "No." as a wrong id, even though the answer label says "the report id".

## 3. Candidate fixes

### A. Clearer messages for first-chapter mistakes (messages only, no rule changes)

**What changes**, in `site/app.js`, mostly pure functions plus tests in `test_site.mjs`. The exercises page gets the same benefit through `strictHtml`.

- **Types refusal on a quoted date-like literal** (`'1912-05-18'`, `'18/05/1912'`): the why line says "date holds numbers written YYYYMMDD: drop the quotes and the dashes, as in date = 19120518", built from the student's own literal. A literal that does not parse gets "a number written YYYYMMDD, like the dates in your results".
- **A short plain-English line under the commonest raw SQLite errors**, kept as they are:
  - `no such table X`: name the tables visible in the schema;
  - `no such column X`: name the columns of the FROM table(s), or, when X is a word that follows `=`, say "a text value takes single quotes: 'X ...'" using the student's words;
  - `near "W": syntax error` after `= word word`: the same quoting line.
- **Curly quotes** (‘ ’ “ ”): a refusal line, "your keyboard typed curly quotes; SQL needs the straight ' ". Also add `autocorrect="off" autocapitalize="off"` on `#sql` to cut them at the source.
- **Unquoted `1912-05-18` on a date column:** no refusal, because it is valid SQL and a false refusal is the worst bug. Instead, a muted note under "No rows.": "1912-05-18 without quotes is a subtraction (= 1889)".
- **Measurement:** send the error's class as `query_fail.rule` (`no-such-table`, `no-such-column`, `syntax`, `curly-quote`; a category, never the text). Check that `privacy.html` still describes it.

**Expected effect:** it targets the ~2/3 of runners who fail. My guess is +3 to 6 points on ch1. It also helps ch2-VIII, where the same mistakes recur.

**Cost:** about half a day with tests.

**Shortcut check:**
- Every message is built from the student's own tokens and the schema already on screen, never from a data row. The date example echoes what they typed: a student who typed the 17th gets 19120517.
- Nothing names the night, the 18th, Duroc or interview. The objective is untouched.
- No rule is weakened: the types and double-quotes refusals still refuse. The curly-quote line refuses too.

### B. A first query that runs

**What changes:**

- On chapter I's first visit, the box holds a real, runnable query (`SELECT * FROM police_report LIMIT 5;`) instead of a non-runnable placeholder. It stays as long as the student does not clear it.
- Run on an empty box shows a muted line ("Type a query in the box, then Run") instead of nothing.
- Optionally, on phones, a "Schema" jump link in the terminal's label row, so the column names are one tap away. This needs a visual check at 390 px in an iframe.

**Expected effect:**

- It targets the ~45% who never run anything. If one in five of them becomes a runner, at the runners' ~49% solve rate, that adds about 4-5 points.
- The first result also shows the date format (19120620), the place values ('Gare du Nord') and the lowercase types, which defuses friction points 4 and 6 before they bite.

**Cost:** about an hour, plus a test.

**Shortcut check:**
- The first 5 rows by rowid are noise (ids 4, 5, 6...; `scatter_planted` keeps planted rows mid-table). Add a test that pins that `LIMIT 5` holds no planted row and no Ritz row of 17-18 May.
- It shows only what any `SELECT *` already shows. It does not name interview or Duroc, the objective stays bare, and it is a typing aid, not a hint.

### C. Answer-shape feedback (smaller, evidence first)

**What changes:**

- When a chapter's `answer_form` promises a number ("the report id", and only shapes the label already states), a submission with no digits (for example "18 May") gets "Ganimard wants the report's id: a number." It does not count as wrong in learn mode.
- Before building it, add a flag `shape: number|text` to `answer_wrong` and read it for a week.

**Expected effect:** unknown. It only matters if many of the 70 wrong-answer users typed dates. It is cheap.

**Shortcut check:**
- It must never apply a pattern that reveals more than the label does. A plate mask "75-2..." would hand out ch3's prefix, so ch3 and similar chapters are excluded.
- It responds to each answer and does not open after N wrong answers, so it is not the help route the owner declined.

**Rejected:**

- Making `date` TEXT ISO: it touches every chapter, the seasons and the handbook, and it removes the types lesson.
- Accepting quoted integers: the owner kept that rule (2026-10-16).
- Putting more in the Hint: hints were removed on purpose.
- Pointing the placeholder at `interview`: it would steer to Duroc. That is arguable, but closer to a hint than B is.

## 4. Recommendation

1. **Ship B first.** It is the cheapest and it targets the biggest leak: half of the openers never run a query.
2. **Ship A next**, with the error-class instrumentation, so the 77 "plain SQL error" users stop being a black box.
3. **Hold C** until the `shape` flag shows that non-id answers are common.

**Before A's curly-quote part:** check on a real iPhone whether the box receives ’, since that may explain part of the 17% versus 32% phone gap.

**Re-read GA a week after each push.** Compare open → 1 query (baseline ~55%) and 1 query → solved (~49%) with the 10-24/25 window, split by device.

**Expect a ceiling:** influencer traffic is largely window-shopping, so a ch1 solve rate around 35-40% would already be a good result. Returning players already solve at 74%.
