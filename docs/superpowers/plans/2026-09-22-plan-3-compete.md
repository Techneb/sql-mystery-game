# Plan 3 — Compete Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A re-seeded "season" database (`python3 generate_db.py --season N`) where each of the Part I chapters (1-8) asks a **different question on the same tables with the same construct** than the learning-mode chapter, so a season can be replayed by a new class without answers leaking from a previous term; plus the Google Apps Script backend and a standalone leaderboard page that the (separately built) Compete UI will POST to and read from.

**Architecture:** `generate_db.py`/`plot.py` already build the whole plot as data (Plan 1). This plan adds a **second, parallel objective per Part-I chapter** ("compete" fields alongside the existing "learn" fields on each chapter dict), a handful of new planted rows/values that make each compete objective have exactly one answer, and wires `--season N` all the way through `chapters_json`/`self_check`/`main` so it emits an 8-chapter `season-N.json` + `season-N.sqlite`. Two new small standalone files, `apps_script.gs` and `site/leaderboard.html`, are the scoring backend and its read-only display; neither depends on `site/app.js`.

**Tech Stack:** Python stdlib only for the generator (unchanged). `apps_script.gs` is Google Apps Script (V8 runtime), pasted into a Sheet's script editor, deployed as a web app. `site/leaderboard.html` is a single self-contained vanilla HTML/CSS/JS file (no build step, no dependency on `site/style.css` or `site/app.js`).

**Spec:** `docs/superpowers/specs/2026-09-20-sql-mystery-game-design.md` section 4 (Compete mode) and section 7 phase 3. Inputs from Plan 1: the `plot.CHAPTERS` list and `generate_db.py`'s `plant_values`/`plant_part1`/`build_db`/`write_outputs`/`main`, already scaffolded for `--season` (see "What already exists" below).

## What already exists (read before starting)

`generate_db.py` on `main` already has:
- `main()` with `--season N` wired to `build_db(seed=N)` and `write_outputs(conn, V, mode="compete")`, which writes `site/season-N.sqlite` and `site/season-N.json` (stem `"season-%d" % V["seed"]`).
- `plant_values(seed)` already draws season-specific values for everything the *learning* chapters need (`plate`, `fence_number`/`fence_street`, `shell_account`, `night_telegram_id`, `trunk_no`, suite numbers) via `r.randint(...) if not learn else <pinned literal>`, and leaves cast *names* (`neighbour`, `fence`, `lupin_alias`, ...) fixed — the cast is canonical, only evidence is re-seeded.
- `chapters_json(V, mode)` and `self_check(conn, V)` do **not yet** know about a compete variant: `chapters_json` always emits all 12 chapters using the *learn* text/solution fields regardless of `mode`, and `self_check` only ever checks the learn `solution`/`naive` fields.

This plan's Tasks 1-2 close that gap: give each of chapters 1-8 a second ("compete") objective/solution/naive/hints, plant the handful of new rows those need, and make `chapters_json`/`self_check`/`main` mode-aware.

## Scope decision: the Compete *button* is not in this plan

`site/app.js`, `site/index.html`, `site/style.css` and `test_site.mjs` do not exist on `main` — they only exist on the still-unmerged `plan-2-site` branch (PR #2). Wiring an actual "Compete" flow (team-name prompt, season picker, timer, POST hooks) into the site means editing those files, which would either fail outright (files not found, if this plan branches from `main` before PR #2 lands) or duplicate/conflict with Plan 2's implementation. This plan therefore delivers everything **upstream of the UI**: the re-seeded content generator and the scoring backend + its display. A short follow-up plan (a handful of tasks, not sketched here) wires `#btn-compete` in `site/app.js` once PR #2 is merged — see the Self-review section for exactly what that follow-up needs from this plan (it is a small, mechanical integration once both pieces exist).

## Global Constraints

- Stdlib only for `generate_db.py`/`plot.py`; no new Python dependency. `apps_script.gs` and `site/leaderboard.html` need none either.
- Pure ASCII everywhere: `LC_ALL=C grep -n '[^ -~]' plot.py generate_db.py apps_script.gs site/leaderboard.html` must print nothing (extend the existing CLAUDE.md check).
- **Id-range convention** (already established by Plan 1, keep following it): noise rows in each table start at id 100 (or higher, e.g. cab_ride/telegram noise runs into the thousands); every new planted/reserved row in this plan uses an id **below 100** (mirroring `plate`'s decoys at ids 2-3, `bank_transaction`'s planted rows at ids 1-24, etc.), so it can never collide with a noise-generated id. Where a new value could coincidentally equal a noise *value* (not id) in a way that would break a chapter's "exactly one row" guarantee, this plan either picks a value shape noise never produces (e.g. a `PLACES` name in a `dropoff` column, which `fill_noise` never writes there) or explicitly `DELETE`s any pre-existing row with that exact content before inserting the reserved one (mirroring the existing ch1/ch3/ch7 pattern at generate_db.py's `plant_part1`).
- Every compete chapter's `answer_key_compete` must resolve to a **season-varying** V value wherever the underlying evidence is season-varying (per spec: "names of non-suspects, plates, addresses, accounts, amounts, ids" are re-drawn); it is fine for a compete objective to reuse a V key already re-seeded for the learn chapters (e.g. chapter 2 and 8 compete both key off `ortega_suite`, which already varies by season) rather than invent a new one where that would only add risk for no benefit (YAGNI — see Task 1/2 step notes).
- `self_check(conn, V, mode)` must remain the single source of truth: it fails loudly (uncaught `AssertionError`) if any solution query returns anything but exactly one row equal to the answer, or if any naive/trap query fails to miss. Never weaken an assertion to make a season "pass" — fix the planted data instead.
- Compete objectives are Part I only (chapters 1-8); `chapters_json(V, "compete")` must emit exactly 8 chapters and no `endings`/`part2_code_sha256`.
- Commit after every task; end commit messages with the trailer lines given in the launch instructions.

---

## File structure

| File | Responsibility |
|---|---|
| `plot.py` | Add `objective_compete`, `answer_form_compete`, `hints_compete` (3, same "____" convention as learn hints), `solution_compete`, `naive_compete`, `naive_rows_compete`, `answer_key_compete` to each of `CHAPTERS[0:8]` (n=1..8). Add a small `COMPETE_FENCE_NAMES` list of full names that cannot collide with the generic `FIRST`/`LAST` noise pool (see Task 1 Step 5). |
| `generate_db.py` | `plant_values`: 8 new V keys for compete-only evidence. `plant_part1`: the new planted rows/decoys those objectives need. `fill_noise`: exclude the one new reserved telegram id. `check_chapter`: accept a `compete=False` flag. `self_check`/`chapters_json`/`main`: mode-aware (compete = 8 chapters, compete fields, no endings). |
| `test_generate.py` | New `Compete` test class: each compete solution returns exactly its answer, each compete trap bites, `chapters_json(V, "compete")` has 8 chapters and no endings, compete values vary across seasons. |
| `apps_script.gs` | `doPost` appends one row per event (`start` / `progress` / `finish`) to a "log" sheet, stamped with the server's own `new Date()` — never a client-supplied time. `doGet` returns all rows as JSON. |
| `site/leaderboard.html` | Standalone page (own inline `<style>`, no dependency on `site/style.css`/`app.js`): fetches the Apps Script `doGet` JSON, pairs each team's `start`/`finish` rows per season, computes adjusted time (spec formula), sorts ascending, lists unfinished teams (have a `start`, no `finish` yet) with their latest `progress` chapter. Refreshes every 30 s. |
| `README.md` | New "Compete mode (season content)" section: how to build a season, how to deploy `apps_script.gs`, how to point `leaderboard.html` at it, and a note that the in-game Compete button lands in a follow-up plan once PR #2 merges. |

---

### Task 1: Compete objectives — chapters 1-4 (SELECT/WHERE, ORDER BY/LIMIT, LIKE, GROUP BY/HAVING)

**Files:**
- Modify: `generate_db.py` (`plant_values`, `plant_part1`, `fill_noise`)
- Modify: `plot.py` (`CHAPTERS[0:4]`)

**Interfaces:**
- Produces (new V keys, all set in `plant_values`): `compete_report_id` (int), `compete_plate` (str `"75-9NNN"` -- a different prefix digit than `plate`'s `"75-2NNN"`, see Step 1's note), `compete_plate_prefix` (`compete_plate[:4]`), `ortega_suite` (already exists — chapter 2 compete reuses it, no new key).
- Produces (new chapter dict fields, `plot.CHAPTERS[n-1]` for n in 1..4): `objective_compete`, `answer_form_compete`, `hints_compete` (list of 3), `solution_compete`, `naive_compete`, `naive_rows_compete`, `answer_key_compete`.

- [ ] **Step 0: Fix a pre-existing SQL-injection-shaped bug in `STREETS` before adding a second street draw**

`generate_db.py`'s `STREETS` list (used by `fence_street` and, from Step 4 below, `compete_fence_street`) contains `"avenue de l'Opera"`. Every place a street name is spliced into a chapter's solution/naive SQL uses plain `'{fence_street}'`-style string formatting, not a parameterized query — so whenever a non-learn seed happens to draw that entry, the embedded apostrophe breaks the generated SQL (`sqlite3.OperationalError: near "Opera": syntax error`). This already affects the shipped, merged learn chapter 5 solution for roughly 1 in 16 seasons (confirmed by testing: `seed=2` reproduces it on current `main`) — it is not new in this plan, but Step 4 below adds a *second* independent draw from the same list (`compete_fence_street`), which roughly doubles the chance any given `--season N` hits it. Fix the data, not the formatting (changing every f-string call site to escape quotes is a much bigger, riskier diff for the same result): in `generate_db.py`, change

```python
STREETS = ["rue des Martyrs", "rue de Rivoli", "boulevard Haussmann", "rue Saint-Honore",
           "rue de la Paix", "avenue de l'Opera", "rue Cambon", "boulevard des Capucines",
```

to

```python
STREETS = ["rue des Martyrs", "rue de Rivoli", "boulevard Haussmann", "rue Saint-Honore",
           "rue de la Paix", "avenue Montaigne", "rue Cambon", "boulevard des Capucines",
```

Verify with `python3 -c "import generate_db as g; assert \"'\" not in ''.join(g.STREETS)"`, then `python3 -m unittest -v` (must still be all-green — nothing in the existing suite pins the old street name) and `python3 generate_db.py --season 2` (this specific seed reproduced the crash before the fix; it must now succeed).

- [ ] **Step 1: Add the four new compete-only V keys to `plant_values`**

In `generate_db.py`, inside the `V = dict(...)` call in `plant_values`, add (next to the existing `plate=...` line):

```python
        compete_report_id=3200 if learn else r.randint(3200, 3499),
        compete_plate="75-9777" if learn else "75-9%03d" % r.randint(100, 999),
```

`compete_plate` uses prefix digit `9`, not `2`, deliberately: it must never satisfy `plate LIKE '{plate_prefix}%'` (the **learn** chapter 3 filter, prefix `"75-2"`), or a compete-only row that happens to land on `pickup = 'Place Vendome'` (Step 4's `rides_c` draws `pickup` randomly) would add a second matching row to the *learn* chapter's answer and break its "exactly one row" guarantee. Confirmed by testing: with a shared `"75-2"` prefix, seed 42 fails learn chapter 3's `self_check` with two rows returned; with prefix `"75-9"` it does not, across 150+ random seeds.

After the `V = dict(...)` call (next to the existing `V["plate_prefix"] = ...` line), add:

```python
    V["compete_plate_prefix"] = V["compete_plate"][:4]
```

- [ ] **Step 2: Chapter 1 compete — a decoy report, fixed content, season-random id**

`compete_report_id` sits at 3200-3499, outside `fill_noise`'s police_report noise loop range (`range(100, 3100)`), so no id collision is possible there. But the noise loop could still coincidentally *content*-collide (some random report already matching place/date/type). In `plant_part1`, right after the existing ch1 block (after the two `-- two decoy Ritz reports` inserts), add:

```python
    # --- compete ch1: a second, fixed decoy report at a different hotel/date/type, random id per season
    c.execute("DELETE FROM police_report WHERE place='Hotel Meurice' AND date=19120611 AND type='burglary'")
    c.execute("INSERT INTO police_report VALUES (?,19120611,'Paris','Hotel Meurice','burglary',?)",
        (V["compete_report_id"],
         "Reported by the night manager. A window forced on the second floor; nothing else taken."))
```

- [ ] **Step 3: Chapter 3 compete — a cab that dropped at Gare Saint-Lazare**

`fill_noise`'s `dropoff` column is always generated as `"%d %s" % (number, street)` (see the `cab_ride` insert in `fill_noise`) — it never writes a `PLACES` name there, so filtering on `dropoff = 'Gare Saint-Lazare'` can never match noise. In `plant_part1`, right after the existing ch3 block (after the two decoy `cab_ride` inserts at ids 2 and 3), add:

```python
    # --- compete ch3: same construct (LIKE), a different cab, identified by where it dropped, not where it was hailed
    c.execute("INSERT INTO cab_ride VALUES (4,?,?,320,'Opera','Gare Saint-Lazare',6)", (V["compete_plate"], T))
```

- [ ] **Step 4: Chapter 1-3 compete text and SQL in `plot.py`**

In `plot.py`, add these fields to `CHAPTERS[0]` (n=1), `CHAPTERS[1]` (n=2) and `CHAPTERS[2]` (n=3):

```python
 dict(n=1, part=1, construct="SELECT / WHERE", tables=["police_report"], answer_key="report_id",
  solution="SELECT id FROM police_report WHERE place = 'Hotel Ritz' AND date = {theft_date} AND type = 'theft'",
  naive="SELECT id FROM police_report WHERE place = 'Hotel Ritz'", naive_rows=None,
  objective_compete="Find the police report for the burglary at the Hotel Meurice on 11 June 1912 (dates are written 19120611).",
  answer_form_compete="the report id (a number)",
  hints_compete=["The concierge: 'Reports? police_report, monsieur, same ledger as always.'",
                 "The chambermaid: 'The Meurice this time, not the Ritz, and a burglary, not a theft. WHERE, three conditions.'",
                 "Ganimard's notebook: SELECT id FROM police_report WHERE place = '____' AND date = ____ AND type = '____'"],
  solution_compete="SELECT id FROM police_report WHERE place = 'Hotel Meurice' AND date = 19120611 AND type = 'burglary'",
  naive_compete="SELECT id FROM police_report WHERE place = 'Hotel Meurice'", naive_rows_compete=None,
  answer_key_compete="compete_report_id"),
 dict(n=2, part=1, construct="ORDER BY / LIMIT", tables=["hotel_register"], answer_key="neighbour",
  solution="SELECT guest_name FROM hotel_register WHERE floor = 2 AND checkin <= {eve_date} AND checkout > {eve_date} ORDER BY price DESC LIMIT 1",
  naive="SELECT guest_name FROM hotel_register WHERE floor = 2 AND checkin <= {eve_date} AND checkout > {eve_date}", naive_rows=6,
  objective_compete="In hotel_register, find the SUITE NUMBER on floor 2 whose stay covers the night of 17 May 1912 (checkin <= 19120517 and checkout > 19120517) and who pays the LOWEST price.",
  answer_form_compete="the suite number",
  hints_compete=["The concierge: 'Same register, monsieur. This time the cheapest, not the dearest.'",
                 "The chambermaid: 'ORDER BY price, ascending this time: no DESC. Then LIMIT 1.'",
                 "Ganimard's notebook: SELECT suite FROM hotel_register WHERE floor = ____ AND checkin <= 19120517 AND checkout > 19120517 ORDER BY price ____ LIMIT ____"],
  solution_compete="SELECT suite FROM hotel_register WHERE floor = 2 AND checkin <= {eve_date} AND checkout > {eve_date} ORDER BY price ASC LIMIT 1",
  naive_compete="SELECT suite FROM hotel_register WHERE floor = 2 AND checkin <= {eve_date} AND checkout > {eve_date} ORDER BY price DESC LIMIT 1", naive_rows_compete=1,
  answer_key_compete="ortega_suite"),
 dict(n=3, part=1, construct="LIKE", tables=["interview", "cab_ride"], answer_key="plate",
  solution="SELECT plate FROM cab_ride WHERE plate LIKE '{plate_prefix}%' AND pickup = 'Place Vendome' AND date = {theft_date} AND time >= 200",
  naive="SELECT plate FROM cab_ride WHERE plate LIKE '{plate_prefix}%' AND date = {theft_date}", naive_rows=None,
  objective_compete="A rival cab company's driver says a plate beginning with {compete_plate_prefix} dropped a fare at Gare Saint-Lazare that night. Find that plate.",
  answer_form_compete="the plate (75-9 and three digits)",
  hints_compete=["The concierge: 'cab_ride again, monsieur: plate, date, time, pickup, dropoff.'",
                 "The chambermaid: 'You know the prefix, not the whole plate: LIKE. And say where it dropped this time, not where it was hailed.'",
                 "Ganimard's notebook: SELECT plate FROM cab_ride WHERE plate LIKE '____%' AND dropoff = '____' AND date = 19120518"],
  solution_compete="SELECT plate FROM cab_ride WHERE plate LIKE '{compete_plate_prefix}%' AND dropoff = 'Gare Saint-Lazare' AND date = {theft_date}",
  naive_compete="SELECT plate FROM cab_ride WHERE plate LIKE '{compete_plate_prefix}%' AND date = {theft_date}", naive_rows_compete=None,
  answer_key_compete="compete_plate"),
```

Note `naive_rows=None`/`naive_rows_compete=None` means "any row count" (see `check_chapter`): the trap assertion still fires because a naive result of >1 row (or the wrong single row) can never equal the single-value answer.

- [ ] **Step 5: `COMPETE_FENCE_NAMES` (needed by Task 2, add now while touching `plot.py`)**

Chapter 5/6 compete need a jeweller name that is guaranteed to never collide with a noise-generated `"<FIRST> <LAST>"` combination in `generate_db.py` (unlike a fixed literal such as "Ernest Grimaud", a name drawn via `_name(r)` from the *same* `FIRST`/`LAST` pools used for 5,000 noise `person` rows has a very real chance of colliding with a noise-generated name — the birthday paradox at n=5000 over ~918 combinations makes at least one collision with a specific drawn name close to certain). At the top of `plot.py`, after `STOP_WORDS`, add:

```python
# Season-varying but noise-safe: these full names cannot be produced by generate_db.py's FIRST x LAST pool
# (none of these surnames appear in LAST), so a person.name filter on one is always unambiguous.
COMPETE_FENCE_NAMES = ["Isidore Vasseur", "Anselme Rocher", "Casimir Lenoir", "Ambroise Fontaine", "Theodule Vasseur"]
```

- [ ] **Step 4: Chapter 4 compete — the second cab's week**

In `generate_db.py`'s `plant_values`, add two more V keys (next to `compete_plate`):

```python
        compete_fence_number=45 if learn else r.randint(3, 60),
        compete_fence_street="rue de Clichy" if learn else r.choice(STREETS),
```

After the `V["compete_plate_prefix"] = ...` line, add:

```python
    V["compete_fence_address"] = "%d %s" % (V["compete_fence_number"], V["compete_fence_street"])
```

In `plant_part1`, right after the ch4 `rides`/loop block (after `c.executemany` — actually after the `for i, (drop, d, t, pick) in enumerate(rides): ...` loop), add:

```python
    # --- compete ch4: a second cab's week, three drops at a second fence's address, two at Gare de Lyon
    #     (a PLACES name, never produced by fill_noise's dropoff generator, so it cannot collide)
    rides_c = [(V["compete_fence_address"], T, 300), (V["compete_fence_address"], 19120514, 1100),
               (V["compete_fence_address"], 19120516, 900),
               ("Gare de Lyon", 19120515, 1000), ("Gare de Lyon", 19120517, 1600)]
    for i, (drop, d, t) in enumerate(rides_c):
        c.execute("INSERT INTO cab_ride VALUES (?,?,?,?,?,?,?)", (5 + i, V["compete_plate"], d, t, r.choice(PLACES), drop, r.randint(2, 12)))
```

(ids 5-9: below the noise floor and below ch4's own `rides` block, which starts at id 10.)

Add to `plot.py`'s `CHAPTERS[3]` (n=4):

```python
 dict(n=4, part=1, construct="GROUP BY / HAVING", tables=[], answer_key="fence_address",
  solution="SELECT dropoff FROM cab_ride WHERE plate = '{plate}' AND date BETWEEN 19120513 AND 19120519 GROUP BY dropoff HAVING COUNT(*) >= 3",
  naive="SELECT DISTINCT dropoff FROM cab_ride WHERE plate = '{plate}' AND date BETWEEN 19120513 AND 19120519", naive_rows=None,
  objective_compete="In cab_ride, for the plate you found in chapter 3, between 19120513 and 19120519, find the dropoff address visited at least three times.",
  answer_form_compete="the address (number and street)",
  hints_compete=["The concierge: 'cab_ride, monsieur, that plate, that week.'",
                 "The chambermaid: 'GROUP BY dropoff, HAVING COUNT(*) >= 3, same as before.'",
                 "Ganimard's notebook: SELECT dropoff FROM cab_ride WHERE plate = '____' AND date BETWEEN 19120513 AND 19120519 GROUP BY ____ HAVING COUNT(*) >= ____"],
  solution_compete="SELECT dropoff FROM cab_ride WHERE plate = '{compete_plate}' AND date BETWEEN 19120513 AND 19120519 GROUP BY dropoff HAVING COUNT(*) >= 3",
  naive_compete="SELECT DISTINCT dropoff FROM cab_ride WHERE plate = '{compete_plate}' AND date BETWEEN 19120513 AND 19120519", naive_rows_compete=None,
  answer_key_compete="compete_fence_address"),
```

- [ ] **Step 6: Verify chapters 1-4**

```bash
python3 -c "
import generate_db as g, plot
conn, V = g.build_db(7)
for ch in plot.CHAPTERS[:4]:
    print(ch['n'], g.check_chapter(conn, V, ch, compete=True))
"
```

This will fail with `TypeError: check_chapter() got an unexpected keyword argument 'compete'` until Task 2 Step 1 adds that parameter — for now, verify by hand instead:

```bash
python3 -c "
import generate_db as g, plot
conn, V = g.build_db(7)
for ch in plot.CHAPTERS[:4]:
    rows = conn.execute(ch['solution_compete'].format(**V)).fetchall()
    assert len(rows) == 1, (ch['n'], rows[:3])
    assert g.normalise(str(rows[0][0])) == g.normalise(str(V[ch['answer_key_compete']])), ch['n']
    naive = conn.execute(ch['naive_compete'].format(**V)).fetchall()
    want = g.normalise(str(V[ch['answer_key_compete']]))
    assert not (len(naive) == 1 and g.normalise(str(naive[0][0])) == want), ('trap does not bite', ch['n'])
    print('ch', ch['n'], 'ok')
"
```

Run it for at least a handful of seeds (e.g. `g.build_db(7)`, `g.build_db(42)` and `g.build_db(1912)`, editing the seed above) to catch anything that only breaks for one draw — seed 42 specifically is what caught the prefix-collision bug fixed in Step 1's note, so keep it in the rotation.

- [ ] **Step 7: Commit**

```bash
git add generate_db.py plot.py
git commit -m "Compete objectives for chapters 1-4: a decoy report, a second cab and its week"
```

---

### Task 2: Compete objectives — chapters 5-8, mode-aware generator, tests

**Files:**
- Modify: `generate_db.py` (`plant_values`, `plant_part1`, `fill_noise`, `check_chapter`, `self_check`, `chapters_json`, `main`)
- Modify: `plot.py` (`CHAPTERS[4:8]`)
- Modify: `test_generate.py`

**Interfaces:**
- Consumes: `COMPETE_FENCE_NAMES` (Task 1 Step 5), `compete_plate`/`compete_fence_address` (Task 1).
- Produces (new V keys): `compete_fence_name`, `compete_fence_account`, `compete_shell_account`, `compete_telegram_id`, `compete_suite8`.
- Produces (generate_db.py signature changes): `check_chapter(conn, V, ch, compete=False)`, `self_check(conn, V, mode="learn")`, `chapters_json(V, mode="learn")` (already existed, behaviour changes for `mode="compete"`).

- [ ] **Step 1: Four more compete-only V keys**

In `plant_values`, add (next to `compete_fence_street`):

```python
        compete_fence_name="Isidore Vasseur" if learn else r.choice(plot.COMPETE_FENCE_NAMES),
        compete_fence_account=54000 if learn else r.randint(50000, 59999),
        compete_shell_account=74000 if learn else r.randint(70000, 79999),
        compete_telegram_id=1800 if learn else r.randint(1500, 2900),
```

`compete_fence_account`/`compete_shell_account` sit at 50000-59999/70000-79999, both well outside `fill_noise`'s `bank_account` id pool (`range(100, 4100)`), so no exclusion needed there. `compete_telegram_id` sits inside the noise telegram id range (100-3099, same range as the existing `night_telegram_id`) — Step 2 below excludes it from `fill_noise`, exactly like `night_telegram_id` already is.

- [ ] **Step 2: Exclude `compete_telegram_id` from telegram noise**

In `fill_noise`, find:

```python
    c.executemany("INSERT INTO telegram VALUES (?,?,?,?,?,?,?,?)",
        [(i, r.choice(["Ritz", "Bourse", "Gare du Nord", "Opera", "Central"]), _date(r, 5, 5), _time(r),
          _name(r), _name(r), None, " ".join(r.choice(TEL_WORDS) for _ in range(r.randint(4, 9))))
         for i in range(100, 3100) if i != V["night_telegram_id"]])
```

Change the last line's condition to:

```python
         for i in range(100, 3100) if i not in (V["night_telegram_id"], V["compete_telegram_id"])])
```

(Without this, `fill_noise` would plant a random noise telegram at id `V["compete_telegram_id"]` on every run, and Step 4's `INSERT` for that same id would fail with a `UNIQUE constraint failed` — a guaranteed crash, not a rare one, since the noise loop iterates every id in range.)

- [ ] **Step 3: Chapter 5 compete — the second boarding house**

In `plant_part1`, right after the existing fence/boarding-house block (after the `for i in range(4): c.execute("INSERT INTO person VALUES (13+i, ...")` loop), add:

```python
    # --- compete ch5: a second address, a second jeweller (name is noise-safe, see COMPETE_FENCE_NAMES)
    c.execute("UPDATE address SET number = number + 200 WHERE number=? AND street=?",
              (V["compete_fence_number"], V["compete_fence_street"]))
    c.execute("INSERT INTO address VALUES (2,?,?,9)", (V["compete_fence_number"], V["compete_fence_street"]))
    c.execute("INSERT INTO person VALUES (18,?,?,?, 'jeweller', 2)",
              (V["compete_fence_name"], r.choice(NATION), r.randint(1850, 1890)))
    for i in range(4):
        c.execute("INSERT INTO person VALUES (?,?,?,?,?,2)",
                  (19 + i, _name(r), "French", r.randint(1850, 1890), r.choice(["clerk", "seamstress", "waiter", "student"])))
```

- [ ] **Step 4: Chapter 6 compete — the second money trail**

In `plant_part1`, right after the existing ch6 bank block (after the `for i, (cp, d, amt) in enumerate(tx): c.execute(...)` loop), add:

```python
    # --- compete ch6: a second fence, a second shell account, a decoy larger single payment
    c.execute("INSERT INTO bank_account VALUES (?,18,'Societe Generale')", (V["compete_fence_account"],))
    c.execute("INSERT INTO bank_account VALUES (?,NULL,'Societe Generale')", (V["compete_shell_account"],))
    decoy2 = c.execute("SELECT id FROM bank_account WHERE id>=100 LIMIT 1 OFFSET 1").fetchone()[0]
    tx2 = [(V["compete_shell_account"], 19120519, 12000), (V["compete_shell_account"], 19120520, 12000),
           (V["compete_shell_account"], 19120521, 9000), (decoy2, 19120510, 20000)]
    for i, (cp, d, amt) in enumerate(tx2):
        c.execute("INSERT INTO bank_transaction VALUES (?,?,?,?,?,'transfer')", (25 + i, V["compete_fence_account"], cp, d, amt))
```

(ids 25-28: `tx`'s own loop above already uses ids 1 through `1 + len(tx) - 1` = up to 24, since `tx` has 4 explicit rows plus 20 appended in a `for i in range(20)` loop — 25 is the next free id below the noise floor.)

- [ ] **Step 5: Chapter 7 compete — an evening wire from the Bourse**

In `plant_part1`, right after the existing ch7 telegram block (after the `for i in range(79): c.execute(...)` daytime-telegrams loop), add:

```python
    # --- compete ch7: a second office, a different time bucket (evening, not night)
    c.execute("DELETE FROM telegram WHERE office='Bourse' AND date=? AND time>=1800", (T,))
    c.execute("INSERT INTO telegram VALUES (?,?,?,?,?,?,?,?)",
        (V["compete_telegram_id"], "Bourse", T, 1930, "A Broker", "A Client", None,
         "SHARES SOLD STOP PROCEEDS TO FOLLOW STOP"))
```

- [ ] **Step 6: Chapter 8 compete — a second suite's second order**

In `plant_part1`, the ch2 block already computes `others = [s for s in FLOOR2 if s not in (V["neighbour_suite"], V["lupin_suite"], V["ortega_suite"])]` — `others[0]` (Paul Sernine's suite) has no room_service rows planted for it. Right after the existing ch8 room-service block (after the `for i, (s, t, item, amt) in enumerate(rs): c.execute(...)` loop), add:

```python
    # --- compete ch8: same RANK() construct, rank 2 instead of rank 1, a suite with no other room_service that day
    c.execute("DELETE FROM room_service WHERE suite=? AND date=?", (others[0], T))
    c.execute("INSERT INTO room_service VALUES (7,?,?,150,'tea',2)", (others[0], T))
    c.execute("INSERT INTO room_service VALUES (8,?,?,220,'coffee',2)", (others[0], T))
    V["compete_suite8"] = others[0]
```

(`others[0]`'s two rows rank 1 tea@150 / rank 2 coffee@220, both before 06:00 — the only suite where rank 2 is coffee before 06:00: `lupin_suite`'s rank-2 order is coffee but at 09:00 (fails the time filter), `ortega_suite`'s rank-2 order is champagne not coffee.)

`V["compete_suite8"]` is set inside `plant_part1`, not `plant_values` — that is fine, `V` is the same dict passed through `build_db`, just note it only exists **after** `plant_part1` has run, so nothing before that point in `build_db` may read it.

- [ ] **Step 7: Chapters 5-8 compete text and SQL in `plot.py`**

Add to `CHAPTERS[4]` (n=5), `CHAPTERS[5]` (n=6), `CHAPTERS[6]` (n=7), `CHAPTERS[7]` (n=8):

```python
 dict(n=5, part=1, construct="JOIN", tables=["person", "address"], answer_key="fence",
  solution="SELECT p.name FROM person AS p JOIN address AS a ON p.address_id = a.id WHERE a.number = {fence_number} AND a.street = '{fence_street}' AND p.occupation = 'jeweller'",
  naive="SELECT p.name FROM person AS p JOIN address AS a ON p.address_id = a.id WHERE a.number = {fence_number} AND a.street = '{fence_street}'", naive_rows=5,
  objective_compete="Join person to address. At the address of chapter 4, find the tenant whose occupation is jeweller.",
  answer_form_compete="the person's name",
  hints_compete=["The concierge: 'person and address again, monsieur, joined on address_id.'",
                 "The chambermaid: 'Same JOIN as before, same three WHERE conditions: number, street, occupation.'",
                 "Ganimard's notebook: SELECT p.name FROM person AS p JOIN address AS a ON p.address_id = a.id WHERE a.number = ____ AND a.street = '____' AND p.occupation = '____'"],
  solution_compete="SELECT p.name FROM person AS p JOIN address AS a ON p.address_id = a.id WHERE a.number = {compete_fence_number} AND a.street = '{compete_fence_street}' AND p.occupation = 'jeweller'",
  naive_compete="SELECT p.name FROM person AS p JOIN address AS a ON p.address_id = a.id WHERE a.number = {compete_fence_number} AND a.street = '{compete_fence_street}'", naive_rows_compete=5,
  answer_key_compete="compete_fence_name"),
 dict(n=6, part=1, construct="JOIN x3 + SUM", tables=["bank_account", "bank_transaction"], answer_key="shell_account",
  solution="SELECT t.counterparty_id FROM person AS p JOIN bank_account AS b ON b.person_id = p.id JOIN bank_transaction AS t ON t.account_id = b.id WHERE p.name = '{fence}' AND t.date BETWEEN 19120501 AND 19120531 GROUP BY t.counterparty_id ORDER BY SUM(t.amount) DESC LIMIT 1",
  naive="SELECT t.counterparty_id FROM person AS p JOIN bank_account AS b ON b.person_id = p.id JOIN bank_transaction AS t ON t.account_id = b.id WHERE p.name = '{fence}' AND t.date BETWEEN 19120501 AND 19120531 ORDER BY t.amount DESC LIMIT 1", naive_rows=1,
  objective_compete="Join person, bank_account and bank_transaction. For the jeweller of chapter 5, in May 1912, find the counterparty_id that received the largest TOTAL amount.",
  answer_form_compete="the account number (five digits)",
  hints_compete=["The concierge: 'Three ledgers again: person, bank_account, bank_transaction.'",
                 "The chambermaid: 'GROUP BY counterparty_id, SUM(amount), ORDER BY that sum DESC. Not the single largest cheque.'",
                 "Ganimard's notebook: SELECT t.counterparty_id FROM person AS p JOIN bank_account AS b ON b.person_id = p.id JOIN bank_transaction AS t ON t.account_id = b.id WHERE p.name = '____' AND t.date BETWEEN 19120501 AND 19120531 GROUP BY t.counterparty_id ORDER BY ____(t.amount) DESC LIMIT ____"],
  solution_compete="SELECT t.counterparty_id FROM person AS p JOIN bank_account AS b ON b.person_id = p.id JOIN bank_transaction AS t ON t.account_id = b.id WHERE p.name = '{compete_fence_name}' AND t.date BETWEEN 19120501 AND 19120531 GROUP BY t.counterparty_id ORDER BY SUM(t.amount) DESC LIMIT 1",
  naive_compete="SELECT t.counterparty_id FROM person AS p JOIN bank_account AS b ON b.person_id = p.id JOIN bank_transaction AS t ON t.account_id = b.id WHERE p.name = '{compete_fence_name}' AND t.date BETWEEN 19120501 AND 19120531 ORDER BY t.amount DESC LIMIT 1", naive_rows_compete=1,
  answer_key_compete="compete_shell_account"),
 dict(n=7, part=1, construct="CASE WHEN", tables=["telegram"], answer_key="night_telegram_id",
  solution="SELECT id FROM (SELECT id, CASE WHEN time < 600 THEN 'night' WHEN time < 1200 THEN 'morning' WHEN time < 1800 THEN 'afternoon' ELSE 'evening' END AS period FROM telegram WHERE office = 'Ritz' AND date = {theft_date}) AS t WHERE period = 'night'",
  naive="SELECT id FROM telegram WHERE office = 'Ritz' AND date = {theft_date}", naive_rows=None,
  objective_compete="The Bourse office also sent wires that day. Classify them the same way and find the single one sent in the evening (18:00 or later).",
  answer_form_compete="the telegram id (a number)",
  hints_compete=["The concierge: 'Telegrams again, monsieur, a different office this time: Bourse, not Ritz.'",
                 "The chambermaid: 'Same four boxes, same CASE WHEN. This time keep evening, not night.'",
                 "Ganimard's notebook: SELECT id FROM (SELECT id, CASE WHEN time < 600 THEN 'night' WHEN time < 1200 THEN 'morning' WHEN time < 1800 THEN 'afternoon' ELSE 'evening' END AS period FROM telegram WHERE office = '____' AND date = 19120518) AS t WHERE period = '____'"],
  solution_compete="SELECT id FROM (SELECT id, CASE WHEN time < 600 THEN 'night' WHEN time < 1200 THEN 'morning' WHEN time < 1800 THEN 'afternoon' ELSE 'evening' END AS period FROM telegram WHERE office = 'Bourse' AND date = {theft_date}) AS t WHERE period = 'evening'",
  naive_compete="SELECT id FROM telegram WHERE office = 'Bourse' AND date = {theft_date}", naive_rows_compete=None,
  answer_key_compete="compete_telegram_id"),
 dict(n=8, part=1, construct="RANK() OVER + subquery", tables=["room_service"], answer_key="lupin_alias",
  solution="SELECT guest_name FROM hotel_register WHERE floor = 2 AND checkin <= {theft_date} AND checkout > {theft_date} AND suite = (SELECT suite FROM (SELECT suite, item, time, RANK() OVER (PARTITION BY suite ORDER BY time) AS rk FROM room_service WHERE date = {theft_date}) AS ranked WHERE rk = 1 AND item = '{champagne}' AND time < 600)",
  naive="SELECT DISTINCT suite FROM room_service WHERE date = {theft_date} AND item = '{champagne}' AND time < 600", naive_rows=2,
  objective_compete="Using room_service for 18 May, rank each suite's orders by time. Find the suite whose SECOND order (rank 2) was coffee, before 06:00.",
  answer_form_compete="the suite number",
  hints_compete=["The concierge: 'room_service again, monsieur: suite, time, item.'",
                 "The chambermaid: 'RANK() OVER (PARTITION BY suite ORDER BY time), same as before. This time keep rank 2, not rank 1.'",
                 "Ganimard's notebook: SELECT suite FROM (SELECT suite, item, time, RANK() OVER (PARTITION BY ____ ORDER BY ____) AS rk FROM room_service WHERE date = 19120518) AS ranked WHERE rk = ____ AND item = '____' AND time < 600"],
  solution_compete="SELECT suite FROM (SELECT suite, item, time, RANK() OVER (PARTITION BY suite ORDER BY time) AS rk FROM room_service WHERE date = {theft_date}) AS ranked WHERE rk = 2 AND item = 'coffee' AND time < 600",
  naive_compete="SELECT DISTINCT suite FROM room_service WHERE date = {theft_date} AND item = 'coffee' AND time < 600", naive_rows_compete=2,
  answer_key_compete="compete_suite8"),
```

- [ ] **Step 8: `check_chapter(conn, V, ch, compete=False)`**

Replace `check_chapter` in `generate_db.py`:

```python
def check_chapter(conn, V, ch, compete=False):
    """The solution returns exactly the answer; the naive query does not (wrong count, or a wrong value)."""
    suf = "_compete" if compete else ""
    want = normalise(str(V[ch["answer_key" + suf]]))
    rows = conn.execute(ch["solution" + suf].format(**V)).fetchall()
    assert len(rows) == 1 and normalise(str(rows[0][0])) == want, \
        "chapter %d%s: solution returned %r" % (ch["n"], suf, rows[:3])
    rows = conn.execute(ch["naive" + suf].format(**V)).fetchall()
    naive_rows = ch["naive_rows" + suf]
    assert naive_rows is None or len(rows) == naive_rows, \
        "chapter %d%s: naive returned %d rows, expected %d" % (ch["n"], suf, len(rows), naive_rows)
    assert not (len(rows) == 1 and normalise(str(rows[0][0])) == want), "chapter %d%s: trap does not bite" % (ch["n"], suf)
    return len(rows)
```

- [ ] **Step 9: `chapters_json(V, mode)` mode-aware**

Replace `chapters_json` in `generate_db.py`:

```python
def chapters_json(V, mode="learn"):
    chapters = []
    src = plot.CHAPTERS if mode == "learn" else [c for c in plot.CHAPTERS if c["n"] <= 8]
    for ch in src:
        if mode == "learn":
            d = {k: ch[k].format(**V) for k in TEXT_KEYS}
            d.update(hints=[h.format(**V) for h in ch["hints"]], answer_sha256=sha(V[ch["answer_key"]]))
        else:
            d = dict(title=ch["title"].format(**V), story=ch["story"].format(**V),
                      objective=ch["objective_compete"].format(**V), answer_form=ch["answer_form_compete"],
                      telegram=ch["telegram"].format(**V))
            d.update(hints=[h.format(**V) for h in ch["hints_compete"]], answer_sha256=sha(V[ch["answer_key_compete"]]))
        d.update(n=ch["n"], part=ch["part"], construct=ch["construct"], tables=ch["tables"])
        chapters.append(d)
    out = dict(seed=V["seed"], mode=mode, theft_date=V["theft_date"], normalise_fixture=FIXTURE,
               cast=plot.CAST, wrong_suspects=plot.WRONG_SUSPECTS, wrong_default=plot.WRONG_DEFAULT,
               chapters=chapters)
    if mode == "learn":
        out["endings"] = {k: v.format(**V) for k, v in plot.ENDINGS.items()}
        out["part2_code_sha256"] = sha(V["part2_code"])
    return out
```

(`out["endings"]`/`out["part2_code_sha256"]` are simply absent from the compete JSON, rather than present-but-null — the follow-up UI plan can test for the key's presence to decide whether Part II applies.)

- [ ] **Step 10: `self_check(conn, V, mode)` and `main()`**

Replace `self_check`:

```python
def self_check(conn, V, mode="learn"):
    """The plot's test: every solution yields its answer, every trap bites, everything is ASCII."""
    for ch in plot.CHAPTERS:
        check_chapter(conn, V, ch)
    if mode == "compete":
        for ch in plot.CHAPTERS[:8]:
            check_chapter(conn, V, ch, compete=True)
    for t in [r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")]:
        for row in conn.execute("SELECT * FROM %s" % t):
            for v in row:
                if isinstance(v, str):
                    v.encode("ascii")
    json.dumps(chapters_json(V, mode)).encode("ascii")
```

In `main()`, change `self_check(conn, V)` to `self_check(conn, V, mode)`, and the final `print`:

```python
    print("ok: seed %d, %d chapters" % (seed, len(plot.CHAPTERS) if mode == "learn" else 8))
```

- [ ] **Step 11: `test_generate.py` — `Compete` test class**

Add:

```python
class Compete(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.conn, cls.V = g.build_db(7)   # any non-1912 seed exercises the re-seeded path

    @classmethod
    def tearDownClass(cls):
        cls.conn.close()

    def test_each_compete_solution_returns_exactly_the_answer(self):
        for ch in plot.CHAPTERS[:8]:
            rows = self.conn.execute(ch["solution_compete"].format(**self.V)).fetchall()
            self.assertEqual(len(rows), 1, ch["n"])
            self.assertEqual(g.normalise(str(rows[0][0])), g.normalise(str(self.V[ch["answer_key_compete"]])), ch["n"])

    def test_each_compete_trap_bites(self):
        for ch in plot.CHAPTERS[:8]:
            g.check_chapter(self.conn, self.V, ch, compete=True)

    def test_compete_chapters_json_is_part1_only(self):
        j = g.chapters_json(self.V, mode="compete")
        self.assertEqual(len(j["chapters"]), 8)
        self.assertNotIn("endings", j)
        self.assertNotIn("part2_code_sha256", j)

    def test_compete_values_vary_by_season(self):
        v7, v8 = g.plant_values(7), g.plant_values(8)
        self.assertNotEqual(v7["compete_plate"], v8["compete_plate"])
        self.assertNotEqual(v7["compete_shell_account"], v8["compete_shell_account"])
        self.assertNotEqual(v7["compete_fence_name"], v8["compete_fence_name"])
```

- [ ] **Step 12: Run everything**

```bash
python3 -m unittest -v
python3 generate_db.py --season 7
python3 generate_db.py --season 8
python3 generate_db.py         # learn build still passes and is unchanged
LC_ALL=C grep -n '[^ -~]' plot.py generate_db.py site/season-7.json site/season-8.json
```

All must pass/print nothing. If a specific `--season N` fails self-check (a rare content collision noted in Global Constraints — e.g. chapter 4's `compete_plate` string coincidentally reused by noise inside the target week), that season number is simply unusable; try an adjacent one. Do not weaken an assertion to force a season to pass.

`site/season-7.sqlite`, `site/season-7.json`, `site/season-8.sqlite`, `site/season-8.json` are generator outputs — do not commit them (they are exactly the kind of generated file CLAUDE.md says never to hand-edit or commit ad hoc; a teacher generates the one season they need before a class).

- [ ] **Step 13: Commit**

```bash
git add generate_db.py plot.py test_generate.py
git commit -m "Compete objectives for chapters 5-8; mode-aware self_check/chapters_json/main"
```

---

### Task 3: `apps_script.gs` — leaderboard backend

**Files:**
- Create: `apps_script.gs`

**Interfaces:**
- Produces: `doPost(e)`, `doGet(e)` — the two entry points Google Apps Script web apps require.
- Event shape from the (future) client: `{event: "start"|"progress"|"finish", team, season, chapter, hints, wrong, queries}` (all fields optional except `event`/`team`/`season` — `doPost` must not throw on missing optional fields).

- [ ] **Step 1: Write `apps_script.gs`**

```javascript
// apps_script.gs -- paste into Extensions > Apps Script of a Google Sheet, then Deploy > New deployment >
// Web app (Execute as: Me, Who has access: Anyone). Copy the deployment URL into leaderboard.html's
// APPS_SCRIPT_URL and, once the follow-up UI plan wires the Compete button, into site/app.js's.
// The sheet needs no manual setup: doPost creates a "log" tab and header row on first call.

function doPost(e) {
  var sheet = getLogSheet_();
  var data = JSON.parse(e.postData.contents);
  sheet.appendRow([new Date(), data.event || "", data.team || "", data.season || "",
                    data.chapter || "", data.hints || 0, data.wrong || 0, data.queries || 0]);
  return ContentService.createTextOutput(JSON.stringify({ok: true})).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  var sheet = getLogSheet_();
  var rows = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 8).getValues() : [];
  var out = rows.map(function (r) {
    return {timestamp: r[0].getTime ? r[0].getTime() : r[0], event: r[1], team: r[2], season: r[3],
            chapter: r[4], hints: r[5], wrong: r[6], queries: r[7]};
  });
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function getLogSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("log");
  if (!sheet) {
    sheet = ss.insertSheet("log");
    sheet.appendRow(["timestamp", "event", "team", "season", "chapter", "hints", "wrong", "queries"]);
  }
  return sheet;
}
```

The server stamps `new Date()` itself on every `doPost` — the client never sends a timestamp, so a team cannot claim a faster time than actually elapsed (spec: "Anti-cheat is the server timestamp"). `chapter` is written by `progress` events (one per chapter solved, so an in-progress team's latest chapter is visible before they `finish`) and left blank by `start`/`finish`.

- [ ] **Step 2: Manual verification (requires a Google account; do this by hand, it cannot be scripted from this repo)**

1. Create a new Google Sheet, open Extensions > Apps Script, paste the file above, save.
2. Deploy > New deployment > type "Web app" > Execute as "Me" > Who has access "Anyone" > Deploy. Authorize when prompted. Copy the `/exec` URL.
3. `curl -X POST -d '{"event":"start","team":"Test","season":7}' <url>` — expect `{"ok":true}` and a new "log" tab with a header row plus one data row in the Sheet.
4. `curl -X POST -d '{"event":"progress","team":"Test","season":7,"chapter":3}' <url>` then `curl -X POST -d '{"event":"finish","team":"Test","season":7,"hints":1,"wrong":2,"queries":15}' <url>` — three rows total in the Sheet now.
5. `curl <url>` (a plain GET) — expect a JSON array of the three rows, each with a numeric `timestamp`.

Record the deployment URL somewhere you can find it again (Task 4 and the README need it); it does not go in this commit (it is set up per teacher/term, not baked into the repo — see Task 4 Step 1's `APPS_SCRIPT_URL` placeholder).

- [ ] **Step 3: Commit**

```bash
git add apps_script.gs
git commit -m "Apps Script leaderboard backend: doPost logs events, doGet reads them back"
```

---

### Task 4: `site/leaderboard.html` — standalone leaderboard page

**Files:**
- Create: `site/leaderboard.html`

**Interfaces:**
- Consumes: the JSON array shape from `apps_script.gs`'s `doGet` (Task 3): `{timestamp, event, team, season, chapter, hints, wrong, queries}[]`.
- No dependency on `site/app.js`/`site/style.css`/`site/index.html` — this file is fully self-contained (own `<style>`, own `<script>`), so it works regardless of whether PR #2 has merged.

- [ ] **Step 1: Write `site/leaderboard.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>The Ritz Affair -- Leaderboard</title>
<style>
  :root { --paper: #f3ead7; --ink: #1c1a17; --red: #8a2b2b; --rule: #c9b98f; --card: #fffdf5; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 16px; background: var(--paper); color: var(--ink); font: 16px/1.4 Georgia, serif; }
  h1 { font-size: 22px; text-align: center; margin: 0 0 4px; }
  .sub { text-align: center; font-size: 12px; letter-spacing: 1px; opacity: .7; margin-bottom: 16px; }
  select { font: inherit; margin: 0 auto 16px; display: block; padding: 4px 8px; }
  table { border-collapse: collapse; width: 100%; max-width: 720px; margin: 0 auto 24px; background: var(--card); }
  th, td { border-bottom: 1px solid var(--rule); padding: 6px 10px; text-align: left; font-size: 14px; }
  th { font-size: 11px; letter-spacing: 1px; text-transform: uppercase; }
  tr.done td.time { font-weight: 700; }
  tr.progress td.time { color: var(--red); font-style: italic; }
  .empty { text-align: center; opacity: .6; margin: 24px; }
</style>
</head>
<body>
<h1>THE RITZ AFFAIR -- LEADERBOARD</h1>
<div class="sub" id="status">Loading...</div>
<select id="season"></select>
<table id="board">
  <thead><tr><th>#</th><th>Team</th><th>Time</th><th>Hints</th><th>Wrong</th></tr></thead>
  <tbody id="rows"></tbody>
</table>
<div class="empty" id="empty" hidden>No teams yet for this season.</div>
<script>
// Set this to the /exec URL from apps_script.gs's deployment (Task 3). Empty = nothing to show.
const APPS_SCRIPT_URL = "";
const SOURCE = new URLSearchParams(location.search).get("data") || APPS_SCRIPT_URL;

function fmt(ms) {
  const s = Math.round(ms / 1000);
  return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
}

// One row per team+season: pairs its "start" row with its "finish" row (adjusted time, spec formula:
// finish - start + 2 min/hint + 10 s/wrong) or, absent a finish, its latest "progress" chapter.
function summarize(rows) {
  const teams = new Map(); // key "team|season" -> {team, season, start, finish, chapter}
  for (const r of rows) {
    const key = r.team + "|" + r.season;
    const t = teams.get(key) || { team: r.team, season: r.season, start: null, finish: null, chapter: 0 };
    if (r.event === "start") t.start = r.timestamp;
    if (r.event === "progress") t.chapter = Math.max(t.chapter, Number(r.chapter) || 0);
    if (r.event === "finish") t.finish = r;
    teams.set(key, t);
  }
  return [...teams.values()].map(t => {
    if (t.finish && t.start != null) {
      const adjusted = (t.finish.timestamp - t.start) + (t.finish.hints || 0) * 120000 + (t.finish.wrong || 0) * 10000;
      return { ...t, done: true, adjusted, hints: t.finish.hints, wrong: t.finish.wrong };
    }
    return { ...t, done: false, adjusted: Infinity };
  });
}

async function load() {
  if (!SOURCE) { document.getElementById("status").textContent = "No leaderboard configured yet."; return; }
  let rows;
  try { rows = await (await fetch(SOURCE)).json(); }
  catch (e) { document.getElementById("status").textContent = "Could not reach the leaderboard."; return; }
  const teams = summarize(rows);
  const seasons = [...new Set(teams.map(t => t.season))].sort((a, b) => a - b);
  const sel = document.getElementById("season");
  const prev = sel.value;
  sel.innerHTML = seasons.map(s => `<option value="${s}">Season ${s}</option>`).join("");
  if (seasons.includes(Number(prev))) sel.value = prev;
  const season = Number(sel.value || seasons[0]);
  const here = teams.filter(t => t.season === season).sort((a, b) => a.adjusted - b.adjusted);
  document.getElementById("rows").innerHTML = here.map((t, i) => `
    <tr class="${t.done ? "done" : "progress"}">
      <td>${t.done ? i + 1 : "-"}</td>
      <td>${t.team}</td>
      <td class="time">${t.done ? fmt(t.adjusted) : "chapter " + t.chapter + " of 8"}</td>
      <td>${t.done ? t.hints : "-"}</td>
      <td>${t.done ? t.wrong : "-"}</td>
    </tr>`).join("");
  document.getElementById("empty").hidden = here.length > 0;
  document.getElementById("status").textContent = "Updated " + new Date().toLocaleTimeString();
}

load();
setInterval(load, 30000);
document.getElementById("season").addEventListener("change", load);
</script>
</body>
</html>
```

- [ ] **Step 2: Manual verification without a live deployment**

```bash
cat > /tmp/fixture.json <<'EOF'
[
 {"timestamp": 1000, "event": "start", "team": "Alpha", "season": 7},
 {"timestamp": 5000, "event": "finish", "team": "Alpha", "season": 7, "hints": 1, "wrong": 0, "queries": 10},
 {"timestamp": 2000, "event": "start", "team": "Beta", "season": 7},
 {"timestamp": 2000, "event": "progress", "team": "Beta", "season": 7, "chapter": 4}
]
EOF
python3 -m http.server 8010 -d /tmp &
python3 -m http.server 8000 -d site &
```

Open `http://localhost:8000/leaderboard.html?data=http://localhost:8010/fixture.json`: expect "Season 7" in the dropdown, "Alpha" ranked #1 with time `00:04` + 2 minutes (hints=1: `4000ms + 120000ms` = `02:04`), "Beta" shown as "chapter 4 of 8" in the progress style (italic, red), refreshing automatically after 30 s. Kill both servers when done (`kill %1 %2` or find/kill by port).

- [ ] **Step 3: Commit**

```bash
git add site/leaderboard.html
git commit -m "Standalone leaderboard page: pairs start/finish events, shows in-progress teams"
```

---

### Task 5: README and final verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add a "Compete mode (season content)" section to `README.md`**

```markdown
## Compete mode (season content)

`python3 generate_db.py --season N` builds `site/season-N.sqlite` and `site/season-N.json`: the same
plot and cast, but every piece of evidence (plates, addresses, account numbers, telegram ids, suite
numbers, non-suspect names) is re-drawn from seed N, and each of the 8 Part I chapters asks a
**different question on the same tables with the same construct** than learning mode, so a season can
be reused by a new class without last term's answers helping. Generated `season-*` files are not
committed; build the one season you need before class and drop it in `site/`.

Backend: paste `apps_script.gs` into a Google Sheet's Apps Script editor and deploy it as a web app
(see the comment at the top of the file, or Task 3 Step 2 of
`docs/superpowers/plans/2026-09-22-plan-3-compete.md` for the exact click-path). Put the deployment URL
into `site/leaderboard.html`'s `APPS_SCRIPT_URL` constant to see teams as they play.

The in-game "Compete" button (team name entry, timer, POSTing `start`/`progress`/`finish` events to the
Apps Script) is not wired yet — it lands in a short follow-up plan once PR #2 (the Investigate-mode
site) is merged, since it needs `site/app.js` to exist. Until then, `leaderboard.html` can be exercised
with a hand-crafted fixture (see Task 4 Step 2 of the same plan) or with `curl` directly against the
Apps Script (Task 3 Step 2).
```

- [ ] **Step 2: Final verification**

```bash
python3 -m unittest -v
python3 generate_db.py
python3 generate_db.py --season 3
LC_ALL=C grep -n '[^ -~]' plot.py generate_db.py erd.py solution.sql site/chapters.json apps_script.gs site/leaderboard.html
git status --short site   # season-3.* must show as untracked/ignored, not staged
```

All tests pass, both builds succeed, the ASCII check prints nothing, and no generated `season-*` files are staged.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "README: document season generation and Apps Script deployment"
```

---

## Self-review

- **Spec coverage:** section 4's "same plot, cast and constructs... different objective, a different question on the same tables with the same construct" is Tasks 1-2 (all 8 Part-I chapters, one new objective each, verified by `self_check`). "Story text is templated from the planted values" — compete chapters reuse the existing per-season-templated `story`/`title`/`telegram` text and add only a new `objective`/`hints`; duplicating full narrative prose per compete chapter was cut as a deliberate scope reduction (see the note below `chapters_json`'s Step 9) since it does not change what is graded. "Backend: `apps_script.gs`... `doPost` appends a row... `doGet` returns rows as JSON" is Task 3. "Leaderboard... sorts by adjusted time per season... shows unfinished teams with chapters solved" is Task 4. "Adjusted time = server finish - server start + 2 min per hint + 10 s per wrong answer" is `leaderboard.html`'s `summarize()`. "Anti-cheat is the server timestamp" — `apps_script.gs` stamps `new Date()` itself, never a client-supplied time. Explicitly **not** covered here: the `start`/`finish` POSTs from the game itself, the team-name/season prompt, and the timer UI — these need `site/app.js`, which does not exist on `main` (see "Scope decision" above); flagged as a named follow-up rather than silently dropped.
- **Placeholders:** none — every step has runnable code or an exact manual command; the one deliberate content simplification (reusing `story`/`title` text for compete) is called out explicitly, not left as a TODO.
- **Type consistency:** `check_chapter(conn, V, ch, compete=False)` (Task 2 Step 8) is used with `compete=True` identically in Task 1 Step 6's manual check, Task 2 Step 11's `Compete` test class, and Task 2 Step 8's own docstring. `chapters_json(V, mode="learn")` keeps its existing default so every pre-existing call site (`self_check`'s own `json.dumps(chapters_json(V, mode))`, `write_outputs`) keeps working unchanged for `mode="learn"`. Every `answer_key_compete` value used in a chapter dict (Task 1/2) is a real V key set no later than the point `self_check` runs: `compete_report_id`/`compete_plate`/`compete_fence_*`/`compete_shell_account`/`compete_telegram_id` come from `plant_values` (before `plant_part1` runs); `compete_suite8` is set inside `plant_part1` itself (Task 2 Step 6), before `build_db` returns — `self_check` and `chapters_json` are only ever called after `build_db` completes, so `compete_suite8` is always present by the time anything reads it.
- **Verified, not just reviewed:** every code block in Tasks 1-2 was applied to a scratch copy of the actual `main` files and run for real before this plan was finalized — `python3 -m unittest -v` (18 tests, including the new `Compete` class), `python3 generate_db.py`, `python3 generate_db.py --season <N>` for several N, and a 150-seed randomized sweep of `self_check(conn, V, "learn")` + `self_check(conn, V, "compete")`, all green after the two fixes folded into Task 1 Step 0 (the pre-existing `STREETS` apostrophe) and Step 1 (the `compete_plate` prefix collision with learn chapter 3). Both were real bugs the naive design hit on the first few random seeds tried, not theoretical concerns — an executor following this plan verbatim should not need to rediscover them.
