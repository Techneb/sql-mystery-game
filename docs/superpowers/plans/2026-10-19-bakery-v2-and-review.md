# Plan -- The Clerk's Handbook: review of the correction queries, then bakery v2

**Goal:** (1) prove that every correction query the handbook prints is right: each exercise solution and each
example's pasted result, mechanically (they run and print what the page says) and semantically (they answer the
question as worded); make the mechanical part a permanent test so pasted results can never drift. (2) Then grow
the bakery database (more rows, a few more tables and columns) from a seeded stdlib generator, and carry every
page, exercise and test over to it, the permanent test guarding the move.

**Owner request:** 2026-10-19. **Status:** done and live 2026-10-20. Part 1 (Task 1.1's `HandbookResults`, the review:
0 wrong solutions, 30 findings fixed, 5 data-dependent ones moved to Part 2's "Planted cases from the review") and
Part 2 (owner accepted every default below on 2026-10-20: `bakery.py`, four weeks, six tables, `--paste`, twenty
exercises; the block count is now 112). Left: drop `bakery.py`'s v1 and `LIVE` scaffolding (spec section 8). The
inventory and steps below are the plan as written on 2026-10-19.

**Did not start while** the concurrent session editing `site/learn/*.html`, `site/app.js`, `CLAUDE.md` and
`test_site.mjs` is unmerged: both parts touch the same files. Rebase on `main` once it lands.

## What exists today (inventory, 2026-10-19)

| Item | Count | Where |
|---|---|---|
| Handbook examples with a pasted result (`<pre><code>` followed by `<table class="result">`) | **91** | 15 pages, below |
| Exercise solutions with a pasted result | **15** | `exercises.html` |
| Refused examples (`<pre class="wrong">`, refusal written by `colour_learn.mjs`) | **10** | `grammar.html` |
| Code blocks that are not a query (the CASE template, the database script) | 2 | `case-when.html`, `database.html` |
| Total runnable queries with a pasted result | **106** | |

Examples per page: database 4, schema 4, select-where 5, order-by-limit 4, like 5, dates-times 8,
group-by-having 5, joins 5, nulls 11, case-when 4, subqueries 7, set-operations 6, window-functions 4, ctes 4,
grammar 15 (plus its 10 refused). Some `table.result` blocks are prose tables (syntax summaries), not results;
the pairing rule above ignores them.

The database: 8 customers, 10 products, 14 orders, 23 order lines, one week (Mon 2 to Sun 8 March 2026), no orders
on Friday 6 March.

What is already guarded:
- `test_site.mjs` "exercises: each solution's result marks its own question solved, and no other one": runs the
  15 solutions in Python sqlite3 with the terminal's semantics (`generate_db.strict_conn`, `sqlite_sql`), checks
  the `Expected: N rows`, the pasted table (through `sameResult`, so unordered and tolerant), that no solution
  answers another question, row order counts only with `data-ordered`, extra columns pass, a missing row fails.
- `test_site.mjs` "every example passes the strict terminal": every block passes `strictCheck`, every wrong one is
  refused; every block is coloured.
- **Not guarded:** the 91 construct-page results. A probe run today (the script in Task 1.1, scratch copy) found
  **0 differences on all 106**, exact cell for cell, and 0 again with `PRAGMA reverse_unordered_selects = ON`
  (so no example's printed order depends on scan order). Today's content is mechanically clean; the test keeps it so.
- Not guarded and not mechanical: numbers quoted in prose ("both evaluate to the same 2.84", "eight customers,
  ten products..."), and whether each query answers its heading.

---

## Part 1 -- Review of today's content

### Task 1.1: the permanent mechanical test (Python, `test_generate.py`)

Python, not `test_site.mjs`: the queries already run through Python's sqlite3 with `strict_conn` (the exercise
test shells out to it), the other session owns `test_site.mjs` today, and the unittest suite is where
`test_bakery_schema_follows_the_same_rules_and_is_current` already lives. One class, `HandbookResults`:

```python
class HandbookResults(unittest.TestCase):
    """Every handbook query with a pasted result prints exactly what it returns (CLAUDE.md, Handbook)."""
    PAIR = re.compile(r'<pre><code>([\s\S]*?)</code></pre>\n<table class="result">([\s\S]*?)</table>')

    def blocks(self):
        for f in sorted(glob.glob("site/learn/*.html")):
            for m in self.PAIR.finditer(open(f).read()):
                rows = [[html.unescape(c) for c in re.findall(r"<t[hd]>([^<]*)</t[hd]>", tr)]
                        for tr in re.findall(r"<tr>([\s\S]*?)</tr>", m.group(2))]
                yield f, html.unescape(re.sub(r"</?span[^>]*>", "", m.group(1))), rows

    def run_all(self, reverse):
        conn = generate_db.strict_conn(erd.bakery_conn(open("site/learn/database.html").read()))
        conn.execute("PRAGMA reverse_unordered_selects = %d" % reverse)
        for f, sql, rows in self.blocks():
            cur = conn.execute(generate_db.sqlite_sql(sql))
            got = [[d[0] for d in cur.description]] + [["NULL" if v is None else str(v) for v in r] for r in cur.fetchall()]
            yield f, sql, rows, got

    def test_every_pasted_result_is_the_real_one(self):
        n = 0
        for f, sql, rows, got in self.run_all(0):
            n += 1
            self.assertEqual(got, rows, f + ": " + sql)
        self.assertEqual(n, 106)   # bump when an example is added: a block the regex misses is a block unchecked

    def test_printed_order_does_not_depend_on_scan_order(self):
        for f, sql, rows, got in self.run_all(1):
            self.assertEqual(got, rows, f + " (reversed scans): add a tie-breaker to ORDER BY: " + sql)

    def test_multi_row_examples_say_their_order(self):
        for f, sql, rows in self.blocks():
            if len(rows) > 2:
                self.assertRegex(sql, r"(?i)\bORDER BY\b", f + ": " + sql)
```

Exact comparison (column names, row order, `str()` of each value, `NULL`) is stricter than `sameResult`, on
purpose: the page shows exactly this. Run it once on the current pages (expected: green, as the probe was) before
any review edit, so every later edit is checked.

Also in this task, two small guards the review needs:
- **Prose numbers.** A list (in the test, `QUOTED`) of `(page, phrase)` pairs for each number the prose takes from a
  result ("the same 2.84", the database counts on `database.html`), each paired with the query that yields it,
  asserted. Built during Task 1.2 (reviewers flag every number in prose they meet).
- **Row cap.** `assertLessEqual(len(rows) - 1, 12)` per example (exercises excepted if the owner decides so): a
  no-op today, it is what keeps Part 2's examples short.

Update CLAUDE.md's Handbook bullet in the same commit ("a test reruns every example and compares the pasted
table cell for cell").

### Task 1.2: the semantic review (subagents)

Each item gets a verdict from someone who has not seen its official query first.

**Exercises (15), blind solvers.** A coordinator extracts, into the reviewer's prompt, the database script and the
15 question texts only (title, wording, construct tag, expected row count stripped: the count is a hint, and
whether it reveals too much is itself checked). Two independent Opus subagents each write their own query per
question. The coordinator runs both against the database and compares each with the official result using the
page's own rule (`sameResult` with the item's `data-ordered`, `data-need`, `data-tolerance`). Any mismatch, from
either solver, is a finding to triage.

**Construct pages (91), heading-first reviewers.** For each example the reviewer reads the heading and the
sentence that introduces it, writes down what the query should return, then reads the query and the pasted
table. Batches of about 20-29 items, one Opus subagent each, all read-only:

| Batch | Pages | Items |
|---|---|---|
| A | exercises (blind, two solvers) | 15 |
| B | database, schema, select-where, order-by-limit, like | 22 |
| C | dates-times, group-by-having, joins, nulls | 29 |
| D | case-when, subqueries, set-operations, window-functions, ctes | 25 |
| E | grammar (15 examples and the 10 refusals: does each refusal sentence describe what PostgreSQL really does?) | 25 |

Five agents (six with A's second solver), run in parallel, cloud or fork, each read-only on a clean checkout.

**Checks every reviewer applies (per item):**
- (b) semantic: the query answers the heading or question as worded (the right table, every row asked for, none
  extra); prose around it describes the result truthfully, numbers included.
- (c) edge cases: ties (ORDER BY breaks them; RANK vs ROW_NUMBER where a question says "keep ties"), NULLs
  (`COUNT(col)` vs `COUNT(*)`, `NOT IN` with a NULL, NULL in a CASE, NULL sorting), duplicates (DISTINCT needed or
  not; UNION vs UNION ALL), LEFT vs INNER join (does "each customer" include those who never ordered?), rounding
  (ROUND only where asked; `data-tolerance` where the question does not ask to round), dates as text (a bound that
  only works because the week ends on the 8th, e.g. `not-on-the-weekend-menu`'s `day >= '2026-03-07'`), and for
  exercises whether `data-need` and `data-ordered` match the wording (an answer showing only what was asked passes;
  a wrong answer cannot pass by showing one lucky column: `back-again`'s `data-need="2"` accepts any column whose
  multiset equals the previous days, check that this is not too loose).
- (d) pedagogy: the exercise really needs its construct (could a plain filter answer the EXCEPT question? a JOIN
  answer the window one?), and the `Expected: N rows` count does not give the answer away (a count of 1 when only
  one candidate is plausible, a count that equals an obvious filter's).
- For the grammar page: each refused example is refused for the reason the page states, and each accepted rewrite
  runs in PostgreSQL as written.

**Report format** (one screen max per agent, no pasted query output; details in a file the report names, e.g.
`<scratchpad>/review-<batch>.md`): one line per item that is not a plain pass:

```
page | heading or exercise slug | verdict | one-line reason | proposed fix
```

verdicts: `wrong-solution` (the official query or table is wrong), `ambiguous` (the wording admits two answers),
`both-acceptable` (two readings, both fine for a construct page), `edge` (right today only by luck of the data: a
tie absent, a NULL absent, a date bound), `pedagogy` (construct not needed, count too telling), `prose` (a number
or claim in the text is off). Plus a final count line: `N items, P pass, F findings`.

**Triage** (the main session with the owner): `wrong-solution` and `prose` are fixed. `ambiguous` on an exercise is
fixed by rewording, never by accepting two answers (the auto-check accepts exactly one result); on a construct page
by rewording or a sentence naming the reading. `edge` items are fixed where cheap and otherwise listed as Part 2
requirements (the v2 data must contain the tie, the NULL, the out-of-range date). `pedagogy` goes to the owner.

**Pass** means: the Task 1.1 tests green; both blind solvers match every exercise, or every mismatch is triaged and
fixed or recorded as the solver's error with the reason; every construct item is pass or has a closed finding;
every number in prose is in `QUOTED`. Push gates as usual (both suites, colour idempotence, owner approval).

---

## Part 2 -- Bakery v2

### The shape (recommended)

**More rows: four weeks of trade instead of one.** Monday 2 March to Sunday 29 March 2026. The shop closes one day
a week (Tuesday, say), so "each day" questions keep the missing-day lesson that Friday 6 March gives today.

| Table | v1 | v2 |
|---|---|---|
| customer | 8 | about 40 (the eight v1 names kept as ids 1-8; some never order; NULL `email` for a third) |
| product | 10 | about 20 (v1's ten kept as ids 1-10; one launched mid-month; one never sold) |
| orders | 14 | about 300 (6 open days x 4 weeks x 10-15 visits) |
| order_item | 23 | about 700 |
| staff (new) | -- | 6 |
| refund (new) | -- | about 8 |

Small enough for sql.js (microseconds) and for the script on `database.html` (about 20 KB plain).

**More complexity, recommended set:**
1. `staff (id, name, role, manager_id)` and `orders.staff_id`: who served at the counter. A second self-reference,
   three levels deep (owner, head baker, counter staff), so WITH RECURSIVE has a hierarchy as well as referrals.
2. Referral chains deeper: depth 4 (v1 is depth 2), with one walk-in who brought nobody, so word-of-mouth tests the
   zero row.
3. `order_item.unit_price`: the price paid on the line. Three products rise on Monday 16 March; `product.price` stays
   the current price. Teaches "the line's price, not today's" (takings change if you use the wrong one) without a
   history table.
4. `refund (id, order_id, day, amount, reason)`: a few orders partly refunded. Teaches LEFT JOIN with
   `COALESCE(SUM(...), 0)` and the fan-out trap (joining lines and refunds in one query double counts), which is
   exactly what CTEs and subqueries in FROM fix.
5. `customer.email`: NULL for some, mixed case and a stray space for a few. The one messy-text column: LIKE/ILIKE,
   `lower`, `trim`, `IS NULL`, `COALESCE`. Towns stay clean, since every GROUP BY town example depends on them.
6. Planted cases each page needs, written by hand into the generator (not left to chance): a tie for the best
   seller of one category, two customers with the same name in different towns, an order at exactly 09:00, a
   NULL in a column that `NOT IN` meets, a product with no sales, a customer with no orders, and the v1 rows the
   prose names.

**Planted cases from the review** (Part 1, 2026-10-20: edge findings that need data v1 does not have; each page
or exercise named must then use the case, and its prose say what happens):
- **Weekend by weekday, not by date bound.** `set-operations.html` (UNION, UNION ALL, duplicates, INTERSECT,
  EXCEPT, whose "Grace Lee alone" depends on it) and the exercise `not-on-the-weekend-menu` test
  `day >= '2026-03-07'` / `< '2026-03-07'`, true only because v1 ends on Sunday 8 March. With four weeks, bound both
  ends of the weekend asked for (`day IN ('2026-03-07', '2026-03-08')`) or name the weekend, and keep an order on a
  later weekend so a one-sided bound gives a different answer.
- **An order at exactly 12:00** (and one at 09:00, already listed): `case-when.html` "Buckets and GROUP BY" warns
  about boundaries with no row on one; say which bucket the 12:00 row lands in.
- **A tie at a LIMIT cut** for the GROUP BY primary-key example (`group-by-having.html`): v1's four-way tie at 2
  orders was resolved by dropping the LIMIT (7 rows); v2 can bring LIMIT back with no tie at the cut, or keep one
  and say so.
- **No average ending in 5 at the third decimal** (`subqueries.html`, `group-by-having.html`, exercise
  `above-their-category`: bread averages 3.325, which SQLite's REAL rounds to 3.32 and exact decimals to 3.33; the
  pages now say so). Choose v2 prices so no shown average sits on a rounding edge, then drop the sentence.
- **Best seller ties** (`best-seller-of-each-category`): plant the tie the question's "keep ties" announces.

**Rejected as overkill:** a `price_history` table (`unit_price` gives the same lesson in one column); suppliers and
ingredients (a many-to-many no page teaches); shifts and opening hours tables; a `category` table (category stays
text, GROUP BY on it is the point); promotions and discount codes (refunds already carry the NULL-and-outer-join
lesson); more than four weeks (results grow, nothing new is taught); real timestamps (`day` and `time` stay ISO
text, the dates page is built on that, and `strictCheck` refuses strftime).

### The generator

`bakery.py` at the repo root, stdlib only, `random.Random(2026)`: planted rows (above) plus seeded noise
(customers drawn from short first and last name lists, visits per day, basket sizes by time of day). It writes
the script into `database.html` between markers (`<!-- bakery script: bakery.py -->`, the way `erd.write_bakery`
fills the schema), together with the four sample-row tables and the counts sentence. `generate_db.py` calls it
before `erd.write_bakery`, so `python3 generate_db.py` rebuilds script, schema and samples in one go. Self-checks
at build time, failing the build like the plot's: every foreign key resolves, the planted cases exist (the tie,
the unsold product, the never-ordering customer, the missing day), ids are dense, pure ASCII, and no game table,
cast or place name (the handbook's no-game-content rule).

**Pasting becomes a tool, not a chore.** `python3 bakery.py --paste` reruns every `<pre><code>` + `table.result`
pair (Task 1.1's regex) and rewrites the table from the real result; then `node colour_learn.mjs`. Task 1.1's
test then says "run bakery.py --paste" instead of "paste the real result". Prose numbers are still hand-written,
and `QUOTED` checks them.

**Keeping results short on the pages:** every example returns at most 12 rows (the test's cap): filter to one
day, one customer, one town or one category; aggregate (GROUP BY category is 3 rows); or `ORDER BY` with a full
tie-breaker then `LIMIT 5`. Window and recursive examples filter to one customer or one chain. Exercises aim at 10
rows or fewer (decision below).

### Impacts

- Every pasted result (106) changes: regenerated by `--paste`, then each one reread by a human or agent (a result
  can be right and no longer illustrate the sentence above it).
- Every example needs rewriting for size, not just repasting: about half run over a whole table today.
- Exercises: every `Expected: N rows`; `data-need`, `data-ordered`, `data-tolerance` rechecked; questions with
  dates ("the weekend of 7 and 8 March", "over the whole week") reworded; the `test_site.mjs` exercise test pins
  `exercises.length` (15, or 20 with new ones) and the row counts; the "Try it" links keep their slugs (rename one
  and the link test fails).
- `database.html` prose (the week, the counts, the table of tables), its schema svg (`erd.py` lays out six tables:
  `PER_ROW = 2`, the no-crossing tests in `test_generate.py` must still pass; `staff.manager_id` is a second loop),
  the `bakery-erd` on `exercises.html` too.
- `colour_learn.mjs`: unchanged code; the script block grows about fivefold once coloured (every token a span).
  Decide whether the script block is exempt from colouring (one exception in the colour test) or kept.
- `strictCheck` test: `bakerySchema` parses the new CREATE TABLEs (keep them one line each, `REFERENCES t(id)` only,
  no CHECK or NOT NULL, which its split would trip on); new examples must pass strict, as now.
- `exercises.js`: no change (it reads the script from `database.html` and runs each solution); load time stays well
  under a second.
- `learn/dates-times.html` and every page quoting a date of the first week.
- Privacy unaffected (nothing new leaves the browser). Sitemap unaffected (no new page). Game unaffected.

### Migration order

1. Part 1 merged (Task 1.1 test green, findings fixed). This is what makes the move safe: from now on a page whose
   pasted table or prose number disagrees with the database fails the suite.
2. `bakery.py` with v1's data reproduced exactly from planted rows (the generator emits today's script byte for
   byte; the suite stays green). One commit.
3. Switch the generator to v2 data. Run `--paste`: the test goes green again mechanically, meaning nothing yet.
4. Rewrite examples page by page, in the batch split of Task 1.2 (B, C, D, E as four worktrees, one agent each;
   each page is its own file, so no conflicts), each batch rerunning `--paste`, `colour_learn.mjs` and both
   suites, and applying the Task 1.2 checklist to its own rewrites.
5. Exercises (batch A), with the new ones if the owner wants them; then the blind-solver review of Task 1.2 rerun
   on all exercises against v2.
6. `database.html` prose, CLAUDE.md's Handbook bullet (v2 shape, `bakery.py`, `--paste`), owner's browser check of
   `database.html` and `exercises.html` at desktop and phone width, night mode.
7. One push (a deploy) once everything is green and the owner approves.

---

## Decisions for the owner (recommended default first)

1. **How much trade:** four weeks of March 2026 (default) / one week as now / two weeks.
2. **Row counts:** about 40 customers, 20 products, 300 orders, 700 lines (default) / smaller (25, 15, 150, 350).
3. **New tables and columns:** staff + `orders.staff_id`, refund, `order_item.unit_price`, `customer.email` (default
   all four) / pick fewer. Rejected list above stays rejected unless you want one.
4. **Messy text:** only in `customer.email` (default) / also in towns (would break every GROUP BY town example).
5. **More exercises:** add five after Part 2 (refund fan-out, staff hierarchy, line price vs catalogue price, unsold
   new product with LEFT JOIN, COALESCE on emails), 15 -> 20 (default) / keep 15.
6. **Row cap:** 12 rows per example, test-enforced, exercises held to 10 by review not by test (default) / cap
   exercises too.
7. **Pasted results:** generated by `bakery.py --paste`, reviewed by eye (default) / hand-pasted as now.
8. **Keep v1's names** (Alice Turner, the ten products) as the first rows, so prose and continuity survive (default
   yes).
9. **Script block colouring:** exempt the database script from colouring, plain text (default) / colour it anyway.
10. **Ambiguous exercises:** reword to one answer (default) / let the checker accept two results (needs code in
    `exercises.js`; rejected by default).

## Effort and how to run it

- Part 1: Task 1.1 about an hour (one agent; the probe already passes). Task 1.2: five or six parallel read-only
  Opus agents, an afternoon including triage; fixes are small edits plus `colour_learn.mjs`.
- Part 2: generator with planted cases, one agent, a day; rewriting the 106 queries for v2, four page batches in
  parallel worktrees plus the exercises batch, one to two days; review rerun and owner checks, half a day.
- Every agent prompt: Opus, its own worktree, report of one screen at most, never paste raw output, long results
  to a file it names.
- **Gates for a push:** `python3 generate_db.py` and `--seasons` (the game is untouched, but the build writes the
  bakery files), `python3 -m unittest -v` (including `HandbookResults`), `node --test test_site.mjs` and
  `test_backend.mjs`, `node colour_learn.mjs` prints nothing (idempotent), the ASCII check, owner's browser check of
  the handbook pages, owner approval (a push is a live deploy). Never during a timed compete session.
