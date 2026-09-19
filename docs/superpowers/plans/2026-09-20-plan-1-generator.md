# Plan 1 — Plot + Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `python3 generate_db.py` builds `site/mystery.sqlite`, `site/chapters.json`, `site/schema.svg` and `solution.sql` for the 12-chapter Ritz Affair, and fails loudly if any chapter is unsolvable, any trap does not bite, or any text is not ASCII.

**Architecture:** Three Python files, stdlib only. `plot.py` is data: cast, chapter texts, hints, taunts, solution SQL and naive-trap SQL, all as `str.format` templates over a dict `V` of planted values. `generate_db.py` draws `V` from the seed, builds schema + noise, plants clues, runs every solution and trap as a self-check, and writes the outputs. `erd.py` turns the schema's foreign keys into an auto-laid-out SVG. `test_generate.py` (unittest) pins the behaviours a plot edit could break.

**Tech Stack:** Python 3.9+ stdlib (`sqlite3`, `random`, `json`, `hashlib`, `re`, `unittest`). No pip. Git.

**Spec:** `docs/superpowers/specs/2026-09-20-sql-mystery-game-design.md` (sections 2, 3 and 6).

## Global Constraints

- Stdlib only; no `pip install`; runs with `python3 generate_db.py` from the repo root.
- Deterministic: `random.Random(seed)` is the only source of randomness; `seed=1912` for learning mode; re-running produces byte-identical `chapters.json` and `solution.sql`.
- Every string in `plot.py`, every data value and every output file is pure ASCII (`Vendome`, `Senor`, `Arsene`).
- Dates `INTEGER YYYYMMDD`; times `INTEGER HHMM`; money `INTEGER` francs; ids `INTEGER PRIMARY KEY`.
- No solution query uses `||`, `CONCAT`, `DATE_FORMAT`, `YEAR()`, `strftime`, `RIGHT JOIN`, `FULL JOIN` (MySQL/SQLite portability). Window functions and `WITH RECURSIVE` are allowed (SQLite >= 3.25).
- Part I (chapters 1-8) solutions use only constructs taught in the course: `SELECT, WHERE, AND/OR, LIKE, ORDER BY, LIMIT, COUNT/SUM/AVG, GROUP BY, HAVING, JOIN ... ON, CASE WHEN, RANK() OVER (PARTITION BY ... ORDER BY ...), subquery in WHERE/FROM, WITH (CTE)`.
- `chapters.json` never contains a solution query or a plain answer, only `answer_sha256` of the normalised answer.
- Commit after every task with a one-line message; no attribution trailers other than those the session instructions require.

---

## File structure

| File | Responsibility |
|---|---|
| `plot.py` | Data only. `CAST`, `CHAPTERS` (list of 12 dicts), `PART2_CODE`, `EASTER_EGGS`, `STOP_WORDS`. Templates use `{name}` placeholders resolved against `V`. |
| `generate_db.py` | `normalise()`, `plant_values(seed)`, `DDL`, `build_db(seed) -> sqlite3.Connection`, `self_check(conn, V)`, `write_outputs(...)`, `main()`. |
| `erd.py` | `layout(tables, fks) -> positions`, `svg(conn) -> str`. |
| `test_generate.py` | `unittest` cases: normalisation fixture, determinism, chapter solvability, traps, ASCII, ERD layers. Run: `python3 -m unittest -v`. |
| `solution.sql` | Generated. One commented block per chapter and variant. |
| `site/mystery.sqlite`, `site/chapters.json`, `site/schema.svg` | Generated. Committed (the site is static). |
| `README.md`, `CLAUDE.md` | Task 10. |

---

### Task 1: Repo scaffold and `normalise()`

**Files:**
- Create: `generate_db.py`, `test_generate.py`, `plot.py` (empty `STOP_WORDS` only), `site/.gitkeep`

**Interfaces:**
- Produces: `normalise(s: str) -> str` in `generate_db.py`; `STOP_WORDS: set[str]` in `plot.py`.

- [ ] **Step 1: Write the failing test**

```python
# test_generate.py
import unittest
import generate_db as g

FIXTURE = [
    ("  Rupert Blakeney, Esq. ", "rupert blakeney"),
    ("rupert   blakeney", "rupert blakeney"),
    ("Lord Ashcombe", "ashcombe"),
    ("ASHCOMBE", "ashcombe"),
    ("75-2041", "752041"),
    ("75 2041", "752041"),
    ("27 rue des Martyrs", "27 des martyrs"),
    ("Suite 214", "214"),
    ("Mr. Grey", "grey"),
    ("Comtesse de Cagliostro", "cagliostro"),
    ("Cagliostro", "cagliostro"),
    ("Trunk no 7", "7"),
]

class Normalise(unittest.TestCase):
    def test_fixture(self):
        for raw, want in FIXTURE:
            self.assertEqual(g.normalise(raw), want, raw)

if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run it to verify it fails**

Run: `python3 -m unittest test_generate.Normalise -v`
Expected: FAIL / ImportError (`generate_db` has no `normalise`).

- [ ] **Step 3: Implement**

```python
# plot.py
STOP_WORDS = {"the", "a", "suite", "no", "trunk", "mr", "mrs", "esq", "lord", "senor",
              "senora", "comtesse", "de", "rue", "report", "telegram", "account", "plate"}
```

```python
# generate_db.py
import re
from plot import STOP_WORDS

def normalise(s):
    """Same rules as normalise() in site/app.js. Keep both in sync (fixture in chapters.json)."""
    tokens = [t for t in re.findall(r"[a-z0-9]+", s.lower()) if t not in STOP_WORDS]
    if tokens and all(t.isdigit() for t in tokens):
        return "".join(tokens)
    return " ".join(tokens)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python3 -m unittest test_generate.Normalise -v` — Expected: OK.

- [ ] **Step 5: Commit**

```bash
git add plot.py generate_db.py test_generate.py site/.gitkeep
git commit -m "Scaffold generator with answer normalisation"
```

---

### Task 2: Schema DDL and empty database

**Files:**
- Modify: `generate_db.py`, `test_generate.py`

**Interfaces:**
- Produces: `DDL: str` and `empty_db() -> sqlite3.Connection` (in-memory, FKs declared, `PRAGMA foreign_keys=ON`).
- Later tasks rely on these exact table and column names.

- [ ] **Step 1: Write the failing test**

```python
class Schema(unittest.TestCase):
    def test_tables_and_fks(self):
        conn = g.empty_db()
        tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        self.assertEqual(tables, {"address", "person", "police_report", "hotel_register", "interview",
                                  "cab_ride", "bank_account", "bank_transaction", "telegram",
                                  "room_service", "train_ticket", "luggage", "lift_log"})
        fks = {(t, r[3], r[2]) for t in tables
               for r in conn.execute(f"PRAGMA foreign_key_list({t})")}
        self.assertIn(("bank_transaction", "counterparty_id", "bank_account"), fks)
        self.assertIn(("luggage", "ticket_id", "train_ticket"), fks)
        self.assertEqual(len(fks), 7)
```

- [ ] **Step 2: Run it to verify it fails** — `python3 -m unittest test_generate.Schema -v` → AttributeError.

- [ ] **Step 3: Implement**

```python
import sqlite3

DDL = """
CREATE TABLE address (
  id INTEGER PRIMARY KEY, number INTEGER, street TEXT, arrondissement INTEGER);
CREATE TABLE person (
  id INTEGER PRIMARY KEY, name TEXT, nationality TEXT, born_year INTEGER, occupation TEXT,
  address_id INTEGER REFERENCES address(id));
CREATE TABLE police_report (
  id INTEGER PRIMARY KEY, date INTEGER, city TEXT, place TEXT, type TEXT, description TEXT);
CREATE TABLE hotel_register (
  id INTEGER PRIMARY KEY, guest_name TEXT, suite INTEGER, floor INTEGER, price INTEGER,
  checkin INTEGER, checkout INTEGER);
CREATE TABLE interview (
  id INTEGER PRIMARY KEY, person_name TEXT, date INTEGER, transcript TEXT);
CREATE TABLE cab_ride (
  id INTEGER PRIMARY KEY, plate TEXT, date INTEGER, time INTEGER, pickup TEXT, dropoff TEXT,
  fare INTEGER);
CREATE TABLE bank_account (
  id INTEGER PRIMARY KEY, person_id INTEGER REFERENCES person(id), bank TEXT);
CREATE TABLE bank_transaction (
  id INTEGER PRIMARY KEY, account_id INTEGER REFERENCES bank_account(id),
  counterparty_id INTEGER REFERENCES bank_account(id), date INTEGER, amount INTEGER, type TEXT);
CREATE TABLE telegram (
  id INTEGER PRIMARY KEY, office TEXT, date INTEGER, time INTEGER, sender TEXT, recipient TEXT,
  suite INTEGER, text TEXT);
CREATE TABLE room_service (
  id INTEGER PRIMARY KEY, suite INTEGER, date INTEGER, time INTEGER, item TEXT, amount INTEGER);
CREATE TABLE train_ticket (
  id INTEGER PRIMARY KEY, person_id INTEGER REFERENCES person(id), date INTEGER, train TEXT,
  destination TEXT);
CREATE TABLE luggage (
  id INTEGER PRIMARY KEY, ticket_id INTEGER REFERENCES train_ticket(id), trunk_no TEXT,
  owner_name TEXT, weight_kg INTEGER);
CREATE TABLE lift_log (
  id INTEGER PRIMARY KEY, date INTEGER, time INTEGER, floor INTEGER, suite INTEGER, direction TEXT);
"""

def empty_db():
    conn = sqlite3.connect(":memory:")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.executescript(DDL)
    return conn
```

Column notes for later tasks: `hotel_register.guest_name` is text on purpose (chapter 2 needs no JOIN); `telegram.suite` is NULL for telegrams not charged to a Ritz suite; `bank_account.id` *is* the account number students type (88213); `lift_log.suite` is the suite the lift attendant wrote down.

- [ ] **Step 4: Run test to verify it passes** — `python3 -m unittest test_generate.Schema -v` → OK.

- [ ] **Step 5: Commit** — `git commit -am "Add schema DDL"`.

---

### Task 3: Planted values `plant_values(seed)`

**Files:**
- Modify: `generate_db.py`, `test_generate.py`

**Interfaces:**
- Produces: `plant_values(seed: int) -> dict` (`V`). Every key below is used by templates in `plot.py` and by planting in Tasks 5-6. Learning mode (`seed=1912`) must produce exactly the spec's values (`75-2041`, `27 rue des Martyrs`, `88213`, suites etc.) — they are fixed for seed 1912 and drawn for any other seed.

- [ ] **Step 1: Write the failing test**

```python
class Plant(unittest.TestCase):
    def test_learn_values_match_spec(self):
        V = g.plant_values(1912)
        self.assertEqual(V["plate"], "75-2041")
        self.assertEqual(V["fence_address"], "27 rue des Martyrs")
        self.assertEqual(V["shell_account"], 88213)
        self.assertEqual(V["lupin_alias"], "Rupert Blakeney")
        self.assertEqual(V["theft_date"], 19120518)

    def test_other_seed_differs_and_is_deterministic(self):
        a, b, c = g.plant_values(1913), g.plant_values(1913), g.plant_values(1912)
        self.assertEqual(a, b)
        self.assertNotEqual(a["plate"], c["plate"])
        self.assertNotEqual(a["shell_account"], c["shell_account"])
        self.assertEqual(a["lupin_alias"], c["lupin_alias"])   # cast is fixed, values move
```

- [ ] **Step 2: Run it to verify it fails** — AttributeError.

- [ ] **Step 3: Implement**

```python
import random

STREETS = ["rue des Martyrs", "rue de Rivoli", "boulevard Haussmann", "rue Saint-Honore",
           "rue de la Paix", "avenue de l'Opera", "rue Cambon", "boulevard des Capucines",
           "rue Royale", "rue du Faubourg Saint-Honore", "rue Lafayette", "rue de Clichy",
           "rue Blanche", "rue Pigalle", "boulevard de Clichy", "rue de Douai"]

def plant_values(seed):
    r = random.Random(seed)
    learn = seed == 1912
    theft = 19120518
    V = dict(
        seed=seed, theft_date=theft, eve_date=19120517,
        lupin_alias="Rupert Blakeney", double_alias="Mr. Grey",
        neighbour="Lord Ashcombe", fence="Ernest Grimaud",
        comtesse="Comtesse de Cagliostro", porter="Marcel Duroc",
        report_id=4127 if learn else r.randint(1000, 2999),
        neighbour_suite=212 if learn else r.choice([202, 204, 206, 208, 210, 212]),
        lupin_suite=214 if learn else r.choice([216, 218, 220, 222, 224]),
        ortega_suite=218 if learn else 0,  # set below, must differ from lupin_suite
        plate="75-2041" if learn else "75-2%03d" % r.randint(100, 999),
        fence_number=27 if learn else r.randint(3, 60),
        fence_street="rue des Martyrs" if learn else r.choice(STREETS),
        fence_account=44170 if learn else r.randint(30000, 49999),
        shell_account=88213 if learn else r.randint(80000, 89999),
        night_telegram_id=2718 if learn else r.randint(1500, 2900),
        trunk_no="A-7" if learn else "%s-%d" % (r.choice("ABCD"), r.randint(2, 9)),
        champagne="Clicquot 1904",
        chain_amount=40000,
        part2_code="STOP READING THE NOISE",  # typed by the student to unlock Part II
    )
    while V["ortega_suite"] in (0, V["lupin_suite"], V["neighbour_suite"]):
        V["ortega_suite"] = r.choice([202, 204, 206, 208, 210, 212, 216, 218, 220, 222, 224])
    V["fence_address"] = "%d %s" % (V["fence_number"], V["fence_street"])
    V["plate_prefix"] = V["plate"][:4]          # "75-2"
    V["chain"] = []                              # filled by plant_part2: [(account_id, amount), ...]
    return V
```

The learning-mode constants are pinned so the spec, hints and the teacher's correction file stay literally true. Any other seed re-draws them (compete seasons, Plan 3).

- [ ] **Step 4: Run test to verify it passes** — OK.

- [ ] **Step 5: Commit** — `git commit -am "Add planted values per seed"`.

---

### Task 4: Noise

**Files:**
- Modify: `generate_db.py`, `test_generate.py`

**Interfaces:**
- Produces: `fill_noise(conn, V, r)` inserting the volumes below. Uses `r: random.Random` passed in (the same generator as `build_db`, so planting after it is deterministic).
- Volumes (spec §2): `address` 1,200; `person` 5,000; `police_report` 3,000; `hotel_register` ~10,000 (suites 101-524, Jan 1-Jun 30 1912); `interview` 600; `cab_ride` 20,000; `bank_account` 4,000; `bank_transaction` 30,000; `telegram` 3,000; `room_service` 5,000; `train_ticket` 2,000; `luggage` 3,000; `lift_log` 10,000.
- Reserved ids the noise must never use: `person` 1-20 (cast), `bank_account` 1-20 and `V["fence_account"]`, `V["shell_account"]`, `police_report` `V["report_id"]`, `telegram` `V["night_telegram_id"]`. Noise ids start at 100 for every table and skip reserved ones.

- [ ] **Step 1: Write the failing test**

```python
class Noise(unittest.TestCase):
    def test_volumes_and_ascii(self):
        conn = g.empty_db(); V = g.plant_values(1912)
        g.fill_noise(conn, V, random.Random(1))
        counts = {t: conn.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
                  for t in ["person", "cab_ride", "bank_transaction", "telegram", "hotel_register"]}
        self.assertGreaterEqual(counts["person"], 5000)
        self.assertGreaterEqual(counts["cab_ride"], 20000)
        self.assertGreaterEqual(counts["hotel_register"], 9000)
        for t in ["person", "telegram", "interview", "police_report", "cab_ride"]:
            for row in conn.execute(f"SELECT * FROM {t}"):
                for v in row:
                    if isinstance(v, str):
                        v.encode("ascii")   # raises on non-ASCII
        self.assertIsNone(conn.execute("SELECT id FROM police_report WHERE id=?", (V["report_id"],)).fetchone())
```

(`import random` at the top of the test file.)

- [ ] **Step 2: Run it to verify it fails** — AttributeError.

- [ ] **Step 3: Implement**

```python
FIRST = ["Jean", "Pierre", "Louis", "Marcel", "Henri", "Georges", "Emile", "Jules", "Albert", "Paul",
         "Marie", "Jeanne", "Marguerite", "Louise", "Berthe", "Yvonne", "Madeleine", "Suzanne",
         "John", "William", "Thomas", "Charles", "Heinrich", "Karl", "Otto", "Giuseppe", "Carlos"]
LAST = ["Martin", "Bernard", "Dubois", "Thomas", "Robert", "Richard", "Petit", "Durand", "Leroy",
        "Moreau", "Simon", "Laurent", "Lefebvre", "Michel", "Garcia", "David", "Bertrand", "Roux",
        "Vincent", "Fournier", "Morel", "Girard", "Andre", "Lefevre", "Mercier", "Dupont", "Lambert",
        "Bonnet", "Francois", "Martinez", "Smith", "Brown", "Schmidt", "Muller", "Rossi"]
NATION = ["French"] * 8 + ["English", "German", "Italian", "Spanish", "American", "Argentine"]
OCCUP = ["clerk", "seamstress", "cab driver", "waiter", "banker", "jeweller", "actress", "student",
         "engineer", "lawyer", "shopkeeper", "concierge", "journalist", "painter", "none"]
PLACES = ["Place Vendome", "Gare du Nord", "Gare Saint-Lazare", "Opera", "Place de la Concorde",
          "Les Halles", "Montmartre", "Jardin des Tuileries", "Pont Neuf", "Place de la Bastille",
          "Bois de Boulogne", "Champs-Elysees", "Boulevard Saint-Germain", "Gare de Lyon"]
ITEMS = [("coffee", 2), ("tea", 2), ("croissants", 3), ("omelette", 5), ("consomme", 6),
         ("sole meuniere", 14), ("Clicquot 1904", 40), ("Pommery 1906", 35), ("cognac", 8),
         ("oysters", 18), ("chateaubriand", 22), ("ice", 1)]
TYPES = ["theft", "burglary", "assault", "fraud", "lost property", "disturbance", "vandalism"]
TEL_WORDS = ["ARRIVE", "TOMORROW", "STOP", "SEND", "MONEY", "LOVE", "MOTHER", "ILL", "TRAIN",
             "DELAYED", "CONTRACT", "SIGNED", "REGARDS", "WEATHER", "FINE", "BUY", "SELL", "SHARES"]

def _date(r, m0=1, m1=6):
    m = r.randint(m0, m1); d = r.randint(1, [31, 29, 31, 30, 31, 30][m - 1])
    return 19120000 + m * 100 + d

def _time(r):
    return r.randint(0, 23) * 100 + r.randint(0, 59)

def _name(r):
    return "%s %s" % (r.choice(FIRST), r.choice(LAST))

def fill_noise(conn, V, r):
    c = conn.cursor()
    c.executemany("INSERT INTO address VALUES (?,?,?,?)",
        [(100 + i, r.randint(1, 120), r.choice(STREETS), r.randint(1, 20)) for i in range(1200)])
    c.executemany("INSERT INTO person VALUES (?,?,?,?,?,?)",
        [(100 + i, _name(r), r.choice(NATION), r.randint(1840, 1894), r.choice(OCCUP),
          r.randint(100, 1299)) for i in range(5000)])
    reserved = {V["report_id"]}
    c.executemany("INSERT INTO police_report VALUES (?,?,?,?,?,?)",
        [(i, _date(r), "Paris", r.choice(PLACES + ["Hotel Ritz", "Hotel Meurice", "Grand Hotel"]),
          r.choice(TYPES), "Reported by %s. No witness." % _name(r))
         for i in range(100, 3100) if i not in reserved])
    # hotel: 424 suites, each with back-to-back stays through Jan-Jun; floor = suite // 100
    rows, rid = [], 100
    for suite in [f * 100 + n for f in range(1, 6) for n in range(1, 25)]:
        day = 19120101
        while day < 19120630:
            nights = r.randint(1, 9)
            out = _add_days(day, nights)
            price = {1: 30, 2: 120, 3: 80, 4: 60, 5: 45}[suite // 100] + r.randint(0, 25)
            rows.append((rid, _name(r), suite, suite // 100, price, day, out)); rid += 1
            day = _add_days(out, r.randint(0, 2))
    c.executemany("INSERT INTO hotel_register VALUES (?,?,?,?,?,?,?)", rows)
    c.executemany("INSERT INTO interview VALUES (?,?,?,?)",
        [(100 + i, _name(r), _date(r, 5, 5), "I saw nothing, monsieur. I was asleep.") for i in range(600)])
    plates = ["75-%04d" % r.randint(1000, 9999) for _ in range(400)] + \
             ["%s%03d" % (V["plate_prefix"], r.randint(100, 999)) for _ in range(40)]
    plates = [p for p in plates if p != V["plate"]]
    c.executemany("INSERT INTO cab_ride VALUES (?,?,?,?,?,?,?)",
        [(100 + i, r.choice(plates), _date(r, 5, 5), _time(r), r.choice(PLACES),
          "%d %s" % (r.randint(1, 120), r.choice(STREETS)), r.randint(2, 15)) for i in range(20000)])
    acct_ids = [i for i in range(100, 4100) if i not in (V["fence_account"], V["shell_account"])]
    c.executemany("INSERT INTO bank_account VALUES (?,?,?)",
        [(i, r.randint(100, 5099), r.choice(["Credit Lyonnais", "Societe Generale", "Banque de Paris", "Comptoir National"]))
         for i in acct_ids])
    c.executemany("INSERT INTO bank_transaction VALUES (?,?,?,?,?,?)",
        [(100 + i, r.choice(acct_ids), r.choice(acct_ids), _date(r), r.randint(5, 900),
          r.choice(["transfer", "cheque", "deposit"])) for i in range(30000)])
    c.executemany("INSERT INTO telegram VALUES (?,?,?,?,?,?,?,?)",
        [(i, r.choice(["Ritz", "Bourse", "Gare du Nord", "Opera", "Central"]), _date(r, 5, 5), _time(r),
          _name(r), _name(r), None, " ".join(r.choice(TEL_WORDS) for _ in range(r.randint(4, 9))))
         for i in range(100, 3100) if i != V["night_telegram_id"]])
    c.executemany("INSERT INTO room_service VALUES (?,?,?,?,?,?)",
        [(100 + i, r.choice(range(101, 525)), _date(r, 5, 5), _time(r), *r.choice(ITEMS)) for i in range(5000)])
    c.executemany("INSERT INTO train_ticket VALUES (?,?,?,?,?)",
        [(100 + i, r.randint(100, 5099), _date(r, 5, 6), r.choice(["Boat Train 9:15", "Nord Express", "Sud Express", "Orient Express"]),
          r.choice(["London", "Berlin", "Madrid", "Vienna", "Calais", "Lille"])) for i in range(2000)])
    c.executemany("INSERT INTO luggage VALUES (?,?,?,?,?)",
        [(100 + i, r.randint(100, 2099), "%s-%d" % (r.choice("ABCD"), r.randint(1, 9)), _name(r), r.randint(8, 60))
         for i in range(3000)])
    c.executemany("INSERT INTO lift_log VALUES (?,?,?,?,?,?)",
        [(100 + i, _date(r, 5, 5), _time(r), r.randint(1, 5), r.choice(range(101, 525)), r.choice(["up", "down"]))
         for i in range(10000)])
    conn.commit()

def _add_days(d, n):
    import datetime
    dt = datetime.date(d // 10000, d // 100 % 100, d % 100) + datetime.timedelta(days=n)
    return dt.year * 10000 + dt.month * 100 + dt.day
```

Note `luggage.owner_name` in noise is random, *not* the ticket holder's name, so chapter 9's "owner differs from ticket holder" needs the planted `Lord Ashcombe` string, not a mismatch test.

- [ ] **Step 4: Run test to verify it passes** — `python3 -m unittest test_generate.Noise -v` → OK (takes ~3 s).

- [ ] **Step 5: Commit** — `git commit -am "Generate noise rows"`.

---

### Task 5: Part I planting, solutions and traps (chapters 1-8)

**Files:**
- Modify: `generate_db.py`, `plot.py`, `test_generate.py`

**Interfaces:**
- Produces in `generate_db.py`: `plant_part1(conn, V, r)`; `build_db(seed) -> (conn, V)` = `empty_db` + `fill_noise` + `plant_part1` + `plant_part2` (Task 6 adds the latter; stub it as `pass` now).
- Produces in `plot.py`: `CHAPTERS` entries 1-8 with keys `n, part, construct, tables, answer_key, solution, naive, naive_rows`. Text keys (`title, story, objective, answer_form, hints, wrong, telegram`) come in Task 7; this task adds only the SQL keys. `answer_key` names the `V` key holding the expected answer. `naive` is the query a student writes without the construct; `naive_rows` is how many rows it returns (must differ from 1, proving the trap bites).
- Consumes: `V` keys from Task 3.

- [ ] **Step 1: Write the failing test**

```python
class PartI(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.conn, cls.V = g.build_db(1912)

    def test_each_chapter_solution_returns_exactly_the_answer(self):
        for ch in plot.CHAPTERS[:8]:
            rows = self.conn.execute(ch["solution"].format(**self.V)).fetchall()
            self.assertEqual(len(rows), 1, ch["n"])
            self.assertEqual(g.normalise(str(rows[0][0])), g.normalise(str(self.V[ch["answer_key"]])), ch["n"])

    def test_each_trap_bites(self):
        for ch in plot.CHAPTERS[:8]:
            rows = self.conn.execute(ch["naive"].format(**self.V)).fetchall()
            self.assertEqual(len(rows), ch["naive_rows"], ch["n"])
            self.assertNotEqual(len(rows), 1, ch["n"])
```

(`import plot` at the top of the test file.)

- [ ] **Step 2: Run it to verify it fails** — AttributeError / KeyError.

- [ ] **Step 3: Implement planting**

```python
# generate_db.py
CAST_PERSONS = [  # id, name, nationality, born, occupation  (address_id set in plant_part1)
    (1, "Lord Ashcombe", "English", 1861, "peer"),
    (2, "Paul Sernine", "French", 1874, "rentier"),
    (3, "Horace Velmont", "French", 1870, "painter"),
    (4, "Raul Ortega", "Argentine", 1868, "cattle baron"),
    (5, "Ines de Almagro", "Spanish", 1879, "none"),
    (6, "Rupert Blakeney", "English", 1872, "gentleman"),
    (7, "Ernest Grimaud", "French", 1858, "jeweller"),
    (8, "Marcel Duroc", "French", 1880, "night porter"),
    (9, "Comtesse de Cagliostro", "Italian", 1875, "none"),
    (10, "Mr. Grey", "English", 1872, "gentleman"),
    (11, "Ganimard", "French", 1855, "inspector"),
    (12, "Minou Ganimard", "French", 1908, "cat"),
]
SUSPECT_SUITES = {"Lord Ashcombe": "neighbour_suite", "Rupert Blakeney": "lupin_suite", "Raul Ortega": "ortega_suite"}

def plant_part1(conn, V, r):
    c = conn.cursor()
    T, E = V["theft_date"], V["eve_date"]
    # --- people and addresses of the cast
    c.execute("INSERT INTO address VALUES (1,?,?,9)", (V["fence_number"], V["fence_street"]))
    for pid, name, nat, born, occ in CAST_PERSONS:
        c.execute("INSERT INTO person VALUES (?,?,?,?,?,?)", (pid, name, nat, born, occ, r.randint(100, 1299)))
    # boarding house at the fence's address: 5 tenants, one jeweller
    c.execute("UPDATE person SET address_id=1 WHERE id=7")
    for i in range(4):
        c.execute("INSERT INTO person VALUES (?,?,?,?,?,1)",
                  (13 + i, _name(r), "French", r.randint(1850, 1890), r.choice(["clerk", "seamstress", "waiter", "student"])))
    # --- ch1: the report
    c.execute("INSERT INTO police_report VALUES (?,?,?,?,?,?)",
        (V["report_id"], T, "Paris", "Hotel Ritz", "theft",
         "Sapphire known as the Blue Star taken from the suite of the Comtesse de Cagliostro. "
         "Night porter {porter} heard the lift at 02:10. The thief came over the balcony of the "
         "neighbouring suite, the most expensive one on the floor. A calling card signed A. L. on the pillow.".format(**V)))
    # two decoy Ritz reports on other dates
    c.execute("INSERT INTO police_report VALUES (?,?,?,?,?,?)", (V["report_id"] - 400, 19120503, "Paris", "Hotel Ritz", "lost property", "Umbrella."))
    c.execute("INSERT INTO police_report VALUES (?,?,?,?,?,?)", (V["report_id"] - 200, 19120611, "Paris", "Hotel Ritz", "theft", "Silver spoon."))
    # --- ch2: the six suspects on floor 2, night of the 17th; neighbour has the highest price
    c.execute("DELETE FROM hotel_register WHERE floor=2 AND checkin<=? AND checkout>?", (E, E))
    others = [s for s in [202, 204, 206, 208, 210, 212, 216, 218, 220, 222, 224]
              if s not in (V["neighbour_suite"], V["lupin_suite"], V["ortega_suite"])]
    stays = [("Lord Ashcombe", V["neighbour_suite"], 190), ("Rupert Blakeney", V["lupin_suite"], 150),
             ("Raul Ortega", V["ortega_suite"], 140), ("Paul Sernine", others[0], 160),
             ("Horace Velmont", others[1], 175), ("Ines de Almagro", others[2], 155)]
    for i, (name, suite, price) in enumerate(stays):
        c.execute("INSERT INTO hotel_register VALUES (?,?,?,2,?,?,?)", (1 + i, name, suite, price, 19120515, 19120522))
    # --- ch3: the interview and the cab
    c.execute("INSERT INTO interview VALUES (1,?,?,?)", ("Lord Ashcombe", T,
        "I was at the Opera until one. My valet saw a man in an English coat leave by the service door "
        "and take a motor-cab on the Place. He says the plate began with {plate_prefix}. The fellow tipped in English coins.".format(**V)))
    c.execute("DELETE FROM cab_ride WHERE date=? AND pickup='Place Vendome' AND time>=200 AND time<600 AND plate LIKE ?", (T, V["plate_prefix"] + "%"))
    c.execute("INSERT INTO cab_ride VALUES (1,?,?,215,'Place Vendome',?,6)", (V["plate"], T, V["fence_address"]))
    # decoys: same prefix that night elsewhere, and from Vendome earlier in the evening
    c.execute("INSERT INTO cab_ride VALUES (2,?,?,140,'Opera',?,5)", (V["plate_prefix"] + "107", T, "3 rue Blanche"))
    c.execute("INSERT INTO cab_ride VALUES (3,?,?,2310,'Place Vendome',?,7)", (V["plate_prefix"] + "290", E, "9 rue Royale"))
    # --- ch4: that cab's week: fence address 3 times, two other addresses twice
    week = [19120513, 19120514, 19120515, 19120516, 19120517, 19120519]
    c.execute("DELETE FROM cab_ride WHERE plate=?", (V["plate"],))
    c.execute("INSERT INTO cab_ride VALUES (1,?,?,215,'Place Vendome',?,6)", (V["plate"], T, V["fence_address"]))
    rides = [(V["fence_address"], 19120514, 1030), (V["fence_address"], 19120516, 1715)]
    rides += [("12 rue de la Paix", 19120513, 900), ("12 rue de la Paix", 19120515, 1800),
              ("40 boulevard Haussmann", 19120517, 1100), ("40 boulevard Haussmann", 19120519, 1500)]
    for i in range(54):
        rides.append(("%d %s" % (r.randint(50, 120), r.choice(STREETS)), r.choice(week), _time(r)))
    for i, (drop, d, t) in enumerate(rides):
        c.execute("INSERT INTO cab_ride VALUES (?,?,?,?,?,?,?)", (10 + i, V["plate"], d, t, r.choice(PLACES), drop, r.randint(2, 12)))
    # --- ch6: the fence's account and payments in May
    c.execute("INSERT INTO bank_account VALUES (?,7,'Credit Lyonnais')", (V["fence_account"],))
    c.execute("INSERT INTO bank_account VALUES (?,NULL,'Credit Lyonnais')", (V["shell_account"],))
    decoy = c.execute("SELECT id FROM bank_account WHERE id>=100 LIMIT 1").fetchone()[0]
    tx = [(V["shell_account"], 19120519, 15000), (V["shell_account"], 19120520, 15000), (V["shell_account"], 19120521, 10000),
          (decoy, 19120510, 25000)]                         # largest single payment goes to the decoy
    for i in range(20):
        tx.append((r.randint(100, 4000), _date(r, 5, 5), r.randint(50, 900)))
    for i, (cp, d, amt) in enumerate(tx):
        c.execute("INSERT INTO bank_transaction VALUES (?,?,?,?,?,'transfer')", (1 + i, V["fence_account"], cp, d, amt))
    # --- ch7: telegrams from the Ritz desk on the 18th; exactly one at night
    c.execute("DELETE FROM telegram WHERE office='Ritz' AND date=? AND time<600", (T,))
    c.execute("INSERT INTO telegram VALUES (?,?,?,?,?,?,?,?)",
        (V["night_telegram_id"], "Ritz", T, 245, "R.", "E. G., Paris",
         V["lupin_suite"], "PAYMENT TO {shell_account} RECEIVED STOP {champagne} AS ALWAYS MY FIRST ORDER BEFORE DAWN STOP R".format(**V).upper()))
    for i in range(79):   # daytime Ritz telegrams that day
        c.execute("INSERT INTO telegram VALUES (?,?,?,?,?,?,?,?)",
            (5000 + i, "Ritz", T, r.randint(6, 23) * 100 + r.randint(0, 59), _name(r), _name(r),
             r.choice(range(101, 525)), " ".join(r.choice(TEL_WORDS) for _ in range(6))))
    # --- ch8: room service on the 18th
    c.execute("DELETE FROM room_service WHERE date=? AND time<600", (T,))
    rs = [(V["lupin_suite"], 320, "Clicquot 1904", 40), (V["lupin_suite"], 900, "coffee", 2),
          (V["ortega_suite"], 500, "coffee", 2), (V["ortega_suite"], 530, "Clicquot 1904", 40),
          (V["neighbour_suite"], 730, "Clicquot 1904", 40), (305, 1300, "Clicquot 1904", 40)]
    for i, (s, t, item, amt) in enumerate(rs):
        c.execute("INSERT INTO room_service VALUES (?,?,?,?,?,?)", (1 + i, s, T, t, item, amt))
    conn.commit()

def build_db(seed):
    V = plant_values(seed)
    r = random.Random(seed)
    conn = empty_db()
    fill_noise(conn, V, r)
    plant_part1(conn, V, r)
    plant_part2(conn, V, r)
    return conn, V

def plant_part2(conn, V, r):
    pass  # Task 6
```

- [ ] **Step 4: Add the SQL to `plot.py`**

```python
# plot.py
CHAPTERS = [
 dict(n=1, part=1, construct="SELECT / WHERE", tables=["police_report"], answer_key="report_id",
  solution="SELECT id FROM police_report WHERE place = 'Hotel Ritz' AND date = {theft_date} AND type = 'theft'",
  naive="SELECT id FROM police_report WHERE place = 'Hotel Ritz'", naive_rows=3),
 dict(n=2, part=1, construct="ORDER BY / LIMIT", tables=["hotel_register"], answer_key="neighbour",
  solution="SELECT guest_name FROM hotel_register WHERE floor = 2 AND checkin <= {eve_date} AND checkout > {eve_date} ORDER BY price DESC LIMIT 1",
  naive="SELECT guest_name FROM hotel_register WHERE floor = 2 AND checkin <= {eve_date} AND checkout > {eve_date}", naive_rows=6),
 dict(n=3, part=1, construct="LIKE", tables=["interview", "cab_ride"], answer_key="plate",
  solution="SELECT plate FROM cab_ride WHERE plate LIKE '{plate_prefix}%' AND pickup = 'Place Vendome' AND date = {theft_date} AND time >= 200",
  naive="SELECT plate FROM cab_ride WHERE plate LIKE '{plate_prefix}%' AND date = {theft_date}", naive_rows=None),
 dict(n=4, part=1, construct="GROUP BY / HAVING", tables=[], answer_key="fence_address",
  solution="SELECT dropoff FROM cab_ride WHERE plate = '{plate}' AND date BETWEEN 19120513 AND 19120519 GROUP BY dropoff HAVING COUNT(*) >= 3",
  naive="SELECT DISTINCT dropoff FROM cab_ride WHERE plate = '{plate}' AND date BETWEEN 19120513 AND 19120519", naive_rows=None),
 dict(n=5, part=1, construct="JOIN", tables=["person", "address"], answer_key="fence",
  solution="SELECT p.name FROM person AS p JOIN address AS a ON p.address_id = a.id WHERE a.number = {fence_number} AND a.street = '{fence_street}' AND p.occupation = 'jeweller'",
  naive="SELECT p.name FROM person AS p JOIN address AS a ON p.address_id = a.id WHERE a.number = {fence_number} AND a.street = '{fence_street}'", naive_rows=5),
 dict(n=6, part=1, construct="JOIN x3 + SUM", tables=["bank_account", "bank_transaction"], answer_key="shell_account",
  solution="SELECT t.counterparty_id FROM person AS p JOIN bank_account AS b ON b.person_id = p.id JOIN bank_transaction AS t ON t.account_id = b.id WHERE p.name = '{fence}' AND t.date BETWEEN 19120501 AND 19120531 GROUP BY t.counterparty_id ORDER BY SUM(t.amount) DESC LIMIT 1",
  naive="SELECT t.counterparty_id FROM person AS p JOIN bank_account AS b ON b.person_id = p.id JOIN bank_transaction AS t ON t.account_id = b.id WHERE p.name = '{fence}' AND t.date BETWEEN 19120501 AND 19120531 ORDER BY t.amount DESC LIMIT 1", naive_rows=None),
 dict(n=7, part=1, construct="CASE WHEN", tables=["telegram"], answer_key="night_telegram_id",
  solution="SELECT id FROM (SELECT id, CASE WHEN time < 600 THEN 'night' WHEN time < 1200 THEN 'morning' WHEN time < 1800 THEN 'afternoon' ELSE 'evening' END AS period FROM telegram WHERE office = 'Ritz' AND date = {theft_date}) WHERE period = 'night'",
  naive="SELECT id FROM telegram WHERE office = 'Ritz' AND date = {theft_date}", naive_rows=None),
 dict(n=8, part=1, construct="RANK() OVER + subquery", tables=["room_service"], answer_key="lupin_alias",
  solution="SELECT guest_name FROM hotel_register WHERE floor = 2 AND checkin <= {theft_date} AND checkout > {theft_date} AND suite = (SELECT suite FROM (SELECT suite, item, time, RANK() OVER (PARTITION BY suite ORDER BY time) AS rk FROM room_service WHERE date = {theft_date}) WHERE rk = 1 AND item = '{champagne}' AND time < 600)",
  naive="SELECT DISTINCT suite FROM room_service WHERE date = {theft_date} AND item = '{champagne}' AND time < 600", naive_rows=2),
]
```

`naive_rows=None` means "any count but 1": change the test's second assertion to `if ch["naive_rows"] is not None: assertEqual(...)` and keep `assertNotEqual(len(rows), 1)`.

Chapter 6's decoy: the largest *single* payment (25,000) goes to a random account, but the three payments to the shell account sum to 40,000, so `ORDER BY SUM` and `ORDER BY amount` disagree. Chapter 3's naive query returns the decoy plate from the Opera as well.

- [ ] **Step 5: Run tests to verify they pass** — `python3 -m unittest test_generate.PartI -v` → OK. If chapter 3 returns 2 rows, the noise generated a `{plate_prefix}` ride from Place Vendome after 02:00 that the `DELETE` missed: check the `DELETE` in `plant_part1` matches the solution's `WHERE` exactly.

- [ ] **Step 6: Commit** — `git add -A && git commit -m "Plant Part I clues with solutions and traps"`.

---

### Task 6: Part II planting, solutions and traps (chapters 9-12)

**Files:**
- Modify: `generate_db.py` (`plant_part2`), `plot.py` (`CHAPTERS` 9-12), `test_generate.py`

**Interfaces:**
- Produces: `V["chain"]` = list of `(account_id, amount)` for the seven hops; `V["double_alias"]` stays; chapter 9-12 entries with the same keys as Task 5.

- [ ] **Step 1: Write the failing test**

```python
class PartII(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.conn, cls.V = g.build_db(1912)

    def test_solutions(self):
        for ch in plot.CHAPTERS[8:]:
            rows = self.conn.execute(ch["solution"].format(**self.V)).fetchall()
            self.assertEqual(len(rows), 1, ch["n"])
            self.assertEqual(g.normalise(str(rows[0][0])), g.normalise(str(self.V[ch["answer_key"]])), ch["n"])

    def test_traps(self):
        for ch in plot.CHAPTERS[8:]:
            rows = self.conn.execute(ch["naive"].format(**self.V)).fetchall()
            self.assertNotEqual(len(rows), 1, ch["n"])

    def test_part2_code_is_in_a_telegram(self):
        n = self.conn.execute("SELECT COUNT(*) FROM telegram WHERE text LIKE ?", ("%" + self.V["part2_code"] + "%",)).fetchone()[0]
        self.assertEqual(n, 1)
```

- [ ] **Step 2: Run it to verify it fails**.

- [ ] **Step 3: Implement**

```python
def plant_part2(conn, V, r):
    c = conn.cursor()
    T = V["theft_date"]
    # --- the Part II code, hidden in a noise telegram (Egg Hunter)
    c.execute("INSERT INTO telegram VALUES (9001,'Central',19120519,1512,'A. L.','TO THE CURIOUS CLERK',NULL,?)",
              ("%s STOP THE CODE IS THE FIRST FOUR WORDS STOP" % V["part2_code"],))
    # --- ch9: Ashcombe's trunks. Three trunks under his own ticket; one under a ticket bought by Mr. Grey.
    c.execute("INSERT INTO train_ticket VALUES (1,1,19120519,'Boat Train 9:15','London')")
    c.execute("INSERT INTO train_ticket VALUES (2,10,19120518,'Boat Train 9:15','London')")   # Mr. Grey, person 10
    for i, trunk in enumerate(["A-1", "A-2", "A-3"]):
        c.execute("INSERT INTO luggage VALUES (?,1,?,'Lord Ashcombe',?)", (1 + i, trunk, 30 + i))
    c.execute("INSERT INTO luggage VALUES (4,2,?,'Lord Ashcombe',12)", (V["trunk_no"],))
    # --- ch10: Blakeney and Mr. Grey alternate weeks Jan-Apr, never overlapping; two other frequent
    #     guests overlap Blakeney by exactly one night each.
    c.execute("DELETE FROM hotel_register WHERE suite=? AND checkin<19120515", (V["lupin_suite"],))
    day, rid, who = 19120106, 200, 0
    names = ["Rupert Blakeney", "Mr. Grey"]
    while day < 19120501:
        c.execute("INSERT INTO hotel_register VALUES (?,?,?,2,150,?,?)", (rid, names[who], V["lupin_suite"], day, _add_days(day, 6)))
        rid += 1; who ^= 1; day = _add_days(day, 7)
    for i, name in enumerate(["Baron von Stroheim", "Cornelius Bell"]):     # frequent, but overlap once
        d = 19120110 + 14 * i
        for k in range(7):
            c.execute("INSERT INTO hotel_register VALUES (?,?,?,3,80,?,?)", (rid, name, 301 + i, d, _add_days(d, 5))); rid += 1
            d = _add_days(d, 14)
        c.execute("INSERT INTO hotel_register VALUES (?,?,?,3,80,?,?)", (rid, name, 301 + i, 19120112, 19120113)); rid += 1   # one night inside a Blakeney week
    # --- ch11: the night of the theft, suite events. Lupin's suite silent 02:05-03:10 (event 0205 then 0310).
    c.execute("DELETE FROM lift_log WHERE date=? AND time<600", (T,))
    c.execute("DELETE FROM telegram WHERE date=? AND time<600 AND suite IS NOT NULL AND id<>?", (T, V["night_telegram_id"]))
    c.execute("DELETE FROM room_service WHERE date=? AND time<600 AND suite=?", (T, V["lupin_suite"]))
    c.execute("INSERT INTO room_service VALUES (50,?,?,320,'Clicquot 1904',40)", (V["lupin_suite"], T))
    c.execute("INSERT INTO lift_log VALUES (1,?,205,2,?,'up')", (T, V["lupin_suite"]))
    c.execute("INSERT INTO lift_log VALUES (2,?,310,2,?,'down')", (T, V["lupin_suite"]))
    for i in range(3):   # every other second-floor suite has an event inside the window
        for s in [202, 204, 206, 208, 210, 212, 216, 218, 220, 222, 224]:
            if s != V["lupin_suite"]:
                c.execute("INSERT INTO lift_log VALUES (?,?,?,2,?,'up')", (10 + i * 20 + s % 20, T, 130 + i * 55, s))
    # a noise suite with a longer gap but outside the window (0010 -> 0540)
    c.execute("INSERT INTO lift_log VALUES (90,?,10,4,407,'up')", (T,))
    c.execute("INSERT INTO lift_log VALUES (91,?,540,4,407,'down')", (T,))
    # --- ch12: the money chain, seven hops of 98%, one hop split in two, one shell with a decoy deposit,
    #     crossing into June. Last account belongs to the Comtesse (person 9).
    amt, acct, chain, day = V["chain_amount"], V["shell_account"], [], 19120520
    hops = [r.randint(60000, 69999) for _ in range(7)]
    for h, nxt in enumerate(hops):
        c.execute("INSERT INTO bank_account VALUES (?,?,?)", (nxt, 9 if h == 6 else None, r.choice(["Societe Generale", "Banque de Paris", "Comptoir National"])))
        amt = round(amt * 0.98)
        if h == 3:   # split hop
            c.execute("INSERT INTO bank_transaction VALUES (?,?,?,?,?,'transfer')", (7000 + h, acct, nxt, day, amt // 2))
            c.execute("INSERT INTO bank_transaction VALUES (?,?,?,?,?,'transfer')", (7100 + h, acct, nxt, day, amt - amt // 2))
        else:
            c.execute("INSERT INTO bank_transaction VALUES (?,?,?,?,?,'transfer')", (7000 + h, acct, nxt, day, amt))
        if h == 4:   # decoy deposit into the same shell account, same day
            c.execute("INSERT INTO bank_transaction VALUES (?,?,?,?,?,'deposit')", (7200, r.randint(100, 4000), nxt, day, 900))
        chain.append((nxt, amt)); acct = nxt; day = _add_days(day, 3)   # 20 May + 3*7 = 10 June
    V["chain"] = chain
    conn.commit()
```

- [ ] **Step 4: Add chapters 9-12 to `plot.py`**

```python
 dict(n=9, part=2, construct="CTE + JOIN", tables=["train_ticket", "luggage"], answer_key="trunk_no",
  solution="WITH ashcombe_trunks AS (SELECT l.trunk_no, t.person_id FROM luggage AS l JOIN train_ticket AS t ON l.ticket_id = t.id WHERE l.owner_name = '{neighbour}') SELECT trunk_no FROM ashcombe_trunks AS a JOIN person AS p ON a.person_id = p.id WHERE p.name <> '{neighbour}'",
  naive="SELECT trunk_no FROM luggage WHERE owner_name = '{neighbour}'", naive_rows=4),
 dict(n=10, part=2, construct="NOT EXISTS / self-join", tables=[], answer_key="double_alias",
  solution="SELECT g.guest_name FROM (SELECT guest_name FROM hotel_register GROUP BY guest_name HAVING COUNT(*) >= 6) AS g WHERE g.guest_name <> '{lupin_alias}' AND NOT EXISTS (SELECT 1 FROM hotel_register AS x JOIN hotel_register AS y ON x.guest_name = '{lupin_alias}' AND y.guest_name = g.guest_name WHERE x.checkin < y.checkout AND y.checkin < x.checkout)",
  naive="SELECT guest_name FROM hotel_register GROUP BY guest_name HAVING COUNT(*) >= 6", naive_rows=None),
 dict(n=11, part=2, construct="LAG() OVER", tables=["lift_log"], answer_key="lupin_suite",
  solution="WITH ev AS (SELECT suite, time FROM lift_log WHERE date = {theft_date} AND time < 600 UNION ALL SELECT suite, time FROM room_service WHERE date = {theft_date} AND time < 600 UNION ALL SELECT suite, time FROM telegram WHERE date = {theft_date} AND time < 600 AND suite IS NOT NULL), gaps AS (SELECT suite, time, LAG(time) OVER (PARTITION BY suite ORDER BY time) AS prev FROM ev) SELECT suite FROM gaps WHERE prev <= 205 AND time >= 310",
  naive="SELECT suite FROM lift_log WHERE date = {theft_date} AND time < 600 GROUP BY suite HAVING COUNT(*) <= 2", naive_rows=None),
 dict(n=12, part=2, construct="WITH RECURSIVE", tables=[], answer_key="comtesse",
  solution="WITH RECURSIVE flows AS (SELECT account_id, counterparty_id, SUM(amount) AS amount FROM bank_transaction WHERE date >= {theft_date} AND type = 'transfer' GROUP BY account_id, counterparty_id), chain(account_id, amount, hop) AS (SELECT {shell_account}, {chain_amount}, 0 UNION ALL SELECT f.counterparty_id, f.amount, c.hop + 1 FROM chain AS c JOIN flows AS f ON f.account_id = c.account_id WHERE ABS(f.amount - c.amount * 0.98) <= 1) SELECT p.name FROM chain AS c JOIN bank_account AS b ON b.id = c.account_id JOIN person AS p ON p.id = b.person_id WHERE c.hop = 7",
  naive="WITH RECURSIVE chain(account_id, amount, hop) AS (SELECT {shell_account}, {chain_amount}, 0 UNION ALL SELECT t.counterparty_id, t.amount, c.hop + 1 FROM chain AS c JOIN bank_transaction AS t ON t.account_id = c.account_id WHERE ABS(t.amount - c.amount * 0.98) <= 1) SELECT account_id FROM chain WHERE hop = 7", naive_rows=0),
]
```

Chapter 12's naive query dies at the split hop (no single transfer matches 98%), so it returns 0 rows: the `flows` pre-aggregation is the lesson.

- [ ] **Step 5: Run tests** — `python3 -m unittest -v` → all OK. Likely failure: chapter 10 returns extra names because the noise `hotel_register` has other guests with 6+ stays that happen not to overlap Blakeney's Jan-Apr weeks. Fix in `plant_part2`, not in the query: after planting, run `SELECT guest_name FROM (...) ` (the solution itself) and for every extra name insert one overlapping night `(rid, name, 301, 3, 80, 19120112, 19120113)`.

- [ ] **Step 6: Commit** — `git commit -am "Plant Part II clues with solutions and traps"`.

---

### Task 7: Plot text — titles, story, objectives, hints, wrong answers, telegrams

**Files:**
- Modify: `plot.py` (add text keys to each chapter + `CAST`, `WRONG_DEFAULT`, `ENDINGS`), `test_generate.py`

**Interfaces:**
- Each chapter dict gains: `title: str`, `story: str` (2-5 sentences), `objective: str`, `answer_form: str`, `hints: [concierge, chambermaid, notebook]`, `telegram: str` (Lupin's taunt after solving), `wrong: dict` (optional per-chapter wrong-answer lines). Module-level `WRONG_SUSPECTS: dict` (normalised suspect name -> line), `WRONG_DEFAULT: list[str]`, `ENDINGS: dict(part1=str, part2=str)`, `CAST: list[dict(name, nationality, bio)]`.
- All templates are `str.format` over `V`; literal braces are not needed anywhere.

- [ ] **Step 1: Write the failing test**

```python
class Text(unittest.TestCase):
    def test_every_chapter_has_all_text_and_formats(self):
        V = g.plant_values(1912)
        for ch in plot.CHAPTERS:
            for k in ["title", "story", "objective", "answer_form", "hints", "telegram"]:
                self.assertIn(k, ch, ch["n"])
            self.assertEqual(len(ch["hints"]), 3, ch["n"])
            for s in [ch["title"], ch["story"], ch["objective"], ch["answer_form"], ch["telegram"], *ch["hints"]]:
                s.format(**V).encode("ascii")
        self.assertEqual(len(plot.CAST), 6)
        for s in plot.WRONG_SUSPECTS.values(): s.encode("ascii")
```

- [ ] **Step 2: Run it to verify it fails**.

- [ ] **Step 3: Write the text.** Tone: dry, in character, English with French flavour; no accents. Each hint reveals strictly more than the previous; hint 3 is the solution with 2-3 blanks (`____`). Full text for chapter 1 and 8 as the model; the other ten follow the same shape and the spec's chapter table (beat, trap, answer).

```python
CAST = [
  dict(name="Lord Ashcombe", nationality="English", bio="Peer of the realm, Suite Imperiale. Collects clocks and grievances."),
  dict(name="Paul Sernine", nationality="French", bio="Rentier. Nobody has ever seen him pay for anything."),
  dict(name="Horace Velmont", nationality="French", bio="Painter of society portraits. Paints mostly at night."),
  dict(name="Raul Ortega", nationality="Argentine", bio="Cattle baron. Signs everything with a flourish and an R."),
  dict(name="Ines de Almagro", nationality="Spanish", bio="Widow. Travels with eleven trunks and one maid."),
  dict(name="Rupert Blakeney", nationality="English", bio="Gentleman of leisure from Bath. Excellent coat."),
]

WRONG_SUSPECTS = {
  "paul sernine": "An anagram, Ganimard? Lupin is vain, not stupid. Sernine is released with apologies.",
  "horace velmont": "Velmont was painting the Prefect's wife at the hour of the theft. The Prefect confirms it, twice.",
  "raul ortega": "Senor Ortega produces a receipt for the champagne and a lawyer for everything else.",
  "ines de almagro": "The Senora faints. The maid does not. Neither is Lupin.",
  "ashcombe": "You arrest the Baron of the neighbouring suite. He is the Prefect's cousin. Awkward.",
  "arsene lupin": "Yes. Under which name? That is rather the question.",
}
WRONG_DEFAULT = [
  "Ganimard reads your note twice and lights his pipe. 'No.'",
  "The clerk before you was dismissed for less. Try again.",
  "Not that, mon petit. Look at the data again.",
]
ENDINGS = dict(
  part1="Gare du Nord, 20 May, 09:10. Ganimard's hand falls on the shoulder of {lupin_alias}, Esq. The gentleman turns, smiles, and hands the inspector a small velvet case. It is empty. 'You have my name, Inspector. The Blue Star has a train to catch.' Behind him, the boat train pulls out.",
  part2="The Comtesse receives Ganimard in her suite, now insured for three hundred thousand francs. She offers tea. Lupin, in London, sends a telegram.",
)
```

Chapter 1 text (model for chapters 2-7):

```python
 title="The Night of the 17th",
 story="Paris, May 1912. The Comtesse de Cagliostro wakes at the Ritz to find her sapphire, the Blue Star, gone and a calling card on the pillow: A. L. Inspector Ganimard has been called at three in the morning and is in no mood. You are his clerk. He drops a stack of police reports on your desk. 'Find ours.'",
 objective="Find the police report for the theft at the Hotel Ritz on 18 May 1912 (dates are written 19120518).",
 answer_form="the report id (a number)",
 hints=["The concierge, without looking up: 'Reports? Prefecture keeps them all in one ledger, monsieur. police_report, they call it.'",
        "The chambermaid: 'Three thousand reports, and you read them all? Ask only for the Ritz, only that date, only a theft. WHERE, monsieur, as they say.'",
        "Ganimard's notebook: SELECT id FROM police_report WHERE place = '____' AND date = ____ AND type = 'theft'"],
 telegram="MY DEAR GANIMARD STOP YOU FOUND THE REPORT STOP THE BALCONY WAS DELIGHTFUL STOP ASK WHO PAYS THE MOST STOP A L",
```

Chapter 8 text (model for the window chapter and Part II):

```python
 title="The First Order Before Dawn",
 story="'As always my first order before dawn.' Ganimard underlines it. 'A man of habit. The Ritz keeps a room-service ledger. Find me the suite whose FIRST order of the 18th was {champagne}, before six. Not any order. The first.' Senor Ortega, you recall, also likes champagne.",
 objective="Using room_service for 19120518, rank each suite's orders by time. Find the suite whose rank-1 order is {champagne} before 06:00, then the guest registered in that suite on floor 2 that night.",
 answer_form="the guest's name",
 hints=["The concierge: 'Room service writes everything in room_service: suite, time, item. The register tells you who sleeps where.'",
        "The chambermaid: 'First order per suite, monsieur? That is a RANK() OVER (PARTITION BY suite ORDER BY time). Then keep rank 1. Then the register.'",
        "Ganimard's notebook: SELECT guest_name FROM hotel_register WHERE floor = 2 AND checkin <= 19120518 AND checkout > 19120518 AND suite = (SELECT suite FROM (SELECT suite, item, time, RANK() OVER (PARTITION BY ____ ORDER BY ____) AS rk FROM room_service WHERE date = 19120518) WHERE rk = 1 AND item = '____' AND time < 600)"],
 telegram="MY DEAR GANIMARD STOP GARE DU NORD NINE FIFTEEN STOP DO NOT BE LATE STOP THE BLUE STAR SENDS REGARDS FROM LONDON STOP CHAPTER IX IF YOU DARE STOP A L",
```

Write chapters 2-7 and 9-12 in the same shape: story ends with Ganimard's instruction; objective names the tables and the date; hint 1 = table(s), hint 2 = the clause in the chambermaid's words, hint 3 = the solution with the key values blanked; telegram = taunt + the hook for the next chapter. Chapter 4's telegram must mention "three times"; chapter 6's must mention "the sum, not the largest"; chapter 12's is the spec's final telegram.

- [ ] **Step 4: Run tests** — `python3 -m unittest -v` → OK.

- [ ] **Step 5: Commit** — `git commit -am "Write the plot text"`.

---

### Task 8: Outputs — `chapters.json`, `solution.sql`, `mystery.sqlite`, teacher correction

**Files:**
- Modify: `generate_db.py` (`write_outputs`, `main`), `test_generate.py`

**Interfaces:**
- Produces: `sha(s: str) -> str` (SHA-256 hex of `normalise(s)`); `chapters_json(V) -> dict`; `solution_sql(V) -> str`; `write_outputs(conn, V, site_dir="site", mode="learn")`; `main(argv)` with `--seed N` (default 1912) and `--season N` (Plan 3 uses it; for now it only changes the seed and output names to `season-N.*`).
- `chapters.json` shape, which Plan 2 consumes verbatim:

```json
{"seed": 1912, "mode": "learn", "theft_date": 19120518,
 "normalise_fixture": [["  Rupert Blakeney, Esq. ", "rupert blakeney"], ...12 pairs],
 "cast": [{"name": "...", "nationality": "...", "bio": "..."}],
 "wrong_suspects": {"paul sernine": "..."}, "wrong_default": ["..."],
 "endings": {"part1": "...", "part2": "..."},
 "part2_code_sha256": "...",
 "chapters": [{"n": 1, "part": 1, "construct": "SELECT / WHERE", "title": "...", "story": "...",
               "objective": "...", "answer_form": "...", "hints": ["...", "...", "..."],
               "telegram": "...", "tables": ["police_report"], "answer_sha256": "..."}]}
```

- [ ] **Step 1: Write the failing test**

```python
class Outputs(unittest.TestCase):
    def test_chapters_json_has_hashes_and_no_answers(self):
        conn, V = g.build_db(1912)
        j = g.chapters_json(V)
        self.assertEqual(len(j["chapters"]), 12)
        for ch in j["chapters"]:
            self.assertEqual(len(ch["answer_sha256"]), 64)
            self.assertNotIn("solution", ch); self.assertNotIn("naive", ch)
        dump = json.dumps(j)
        for secret in [V["plate"], str(V["shell_account"]), V["trunk_no"]]:
            self.assertNotIn(secret, dump)
        self.assertEqual(j["chapters"][7]["answer_sha256"], g.sha(V["lupin_alias"]))
        self.assertEqual(g.normalise(json.loads(dump)["normalise_fixture"][0][0]), "rupert blakeney")

    def test_solution_sql_runs_per_chapter(self):
        conn, V = g.build_db(1912)
        blocks = [b for b in g.solution_sql(V).split("\n\n") if b.strip() and not b.lstrip().startswith("--")]
        self.assertEqual(len(blocks), 12)
```

(`import json` at the top.)

- [ ] **Step 2: Run it to verify it fails**.

- [ ] **Step 3: Implement**

```python
import hashlib, json, os, sys
import plot

def sha(s):
    return hashlib.sha256(normalise(str(s)).encode()).hexdigest()

FIXTURE = [("  Rupert Blakeney, Esq. ", "rupert blakeney"), ("rupert   blakeney", "rupert blakeney"),
           ("Lord Ashcombe", "ashcombe"), ("ASHCOMBE", "ashcombe"), ("75-2041", "752041"), ("75 2041", "752041"),
           ("27 rue des Martyrs", "27 des martyrs"), ("Suite 214", "214"), ("Mr. Grey", "grey"),
           ("Comtesse de Cagliostro", "cagliostro"), ("Cagliostro", "cagliostro"), ("Trunk no 7", "7")]

TEXT_KEYS = ["title", "story", "objective", "answer_form", "telegram"]

def chapters_json(V, mode="learn"):
    chapters = []
    for ch in plot.CHAPTERS:
        d = {k: ch[k].format(**V) for k in TEXT_KEYS}
        d.update(n=ch["n"], part=ch["part"], construct=ch["construct"], tables=ch["tables"],
                 hints=[h.format(**V) for h in ch["hints"]], answer_sha256=sha(V[ch["answer_key"]]))
        chapters.append(d)
    return dict(seed=V["seed"], mode=mode, theft_date=V["theft_date"], normalise_fixture=FIXTURE,
                cast=plot.CAST, wrong_suspects=plot.WRONG_SUSPECTS, wrong_default=plot.WRONG_DEFAULT,
                endings={k: v.format(**V) for k, v in plot.ENDINGS.items()},
                part2_code_sha256=sha(V["part2_code"]), chapters=chapters)

def solution_sql(V):
    out = ["-- The Ritz Affair: reference path (seed %d). One query per chapter; each answer is the next chapter's key." % V["seed"]]
    for ch in plot.CHAPTERS:
        out.append("-- %02d. %s (%s) -> %s: %s\n%s;" % (ch["n"], ch["title"].format(**V), ch["construct"],
                   ch["answer_form"].format(**V), V[ch["answer_key"]], ch["solution"].format(**V)))
    return "\n\n".join(out) + "\n"

def write_outputs(conn, V, site_dir="site", mode="learn"):
    stem = "mystery" if mode == "learn" else "season-%d" % V["seed"]
    path = os.path.join(site_dir, stem + ".sqlite")
    if os.path.exists(path): os.remove(path)
    disk = sqlite3.connect(path); conn.backup(disk); disk.close()
    with open(os.path.join(site_dir, ("chapters" if mode == "learn" else stem) + ".json"), "w") as f:
        json.dump(chapters_json(V, mode), f, indent=1, ensure_ascii=True)
    if mode == "learn":
        with open("solution.sql", "w") as f: f.write(solution_sql(V))
        import erd
        with open(os.path.join(site_dir, "schema.svg"), "w") as f: f.write(erd.svg(conn))
        corr = os.path.join("..", "SQL", "3-Corrections", "8. Correction SQL Mystery Game.sql")
        if os.path.isdir(os.path.dirname(corr)):
            with open(corr, "w") as f: f.write(solution_sql(V))

def self_check(conn, V):
    for ch in plot.CHAPTERS:
        rows = conn.execute(ch["solution"].format(**V)).fetchall()
        assert len(rows) == 1 and normalise(str(rows[0][0])) == normalise(str(V[ch["answer_key"]])), \
            "chapter %d: solution returned %r" % (ch["n"], rows[:3])
        n = len(conn.execute(ch["naive"].format(**V)).fetchall())
        assert n != 1 and (ch["naive_rows"] is None or n == ch["naive_rows"]), "chapter %d: trap does not bite (%d rows)" % (ch["n"], n)
    for t in [r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")]:
        for row in conn.execute("SELECT * FROM %s" % t):
            for v in row:
                if isinstance(v, str): v.encode("ascii")
    json.dumps(chapters_json(V)).encode("ascii")

def main(argv=None):
    import argparse
    ap = argparse.ArgumentParser(); ap.add_argument("--seed", type=int, default=1912); ap.add_argument("--season", type=int)
    a = ap.parse_args(argv)
    seed, mode = (a.season, "compete") if a.season else (a.seed, "learn")
    conn, V = build_db(seed)
    self_check(conn, V)
    write_outputs(conn, V, mode=mode)
    print("ok: seed %d, %d chapters" % (seed, len(plot.CHAPTERS)))

if __name__ == "__main__":
    main()
```

`erd.svg` does not exist until Task 9: for this task, create `erd.py` with `def svg(conn): return "<svg xmlns='http://www.w3.org/2000/svg'></svg>\n"`.

- [ ] **Step 4: Run tests and the generator** — `python3 -m unittest -v` → OK; `python3 generate_db.py` → prints `ok: seed 1912, 12 chapters`; `ls -la site/` shows `mystery.sqlite` (~10 MB), `chapters.json`, `schema.svg`; `solution.sql` reads as a story top to bottom. Run it twice and `git status`: `chapters.json` and `solution.sql` must not change between runs.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "Write chapters.json, solution.sql and the database"`.

---

### Task 9: ERD auto-layout and `schema.svg`

**Files:**
- Create: `erd.py` (replace the stub), test in `test_generate.py`

**Interfaces:**
- Produces: `read_schema(conn) -> (tables: dict[name, list[(col, type, is_pk, fk_target_table or None)]], fks: list[(table, col, ref_table)])`; `layout(tables, fks, override={}) -> dict[name, (layer, x, y, w, h)]`; `svg(conn, override={}) -> str`.
- The SVG: `<svg viewBox="0 0 W H" xmlns=...>`; one `<g class="table" data-table="NAME">` per table with a `<rect>`, a header `<text class="tname">`, one `<text class="col">` per column (`*` prefix on PK, `-> ref` suffix on FK), and one `<path class="fk" data-from="T.col" data-to="R">` per FK. No CSS inside (Plan 2 styles it; hides `.table` not yet revealed).
- Layout rule (spec §5): layer 0 = tables with no FK; otherwise 1 + max layer of referenced tables (self-references ignored); order within a layer by the mean x of referenced tables (barycentre), ties by name; boxes 170 px wide, `16 + 14 * ncols` tall, 40 px gaps, layers 60 px apart.

- [ ] **Step 1: Write the failing test**

```python
class Erd(unittest.TestCase):
    def test_layers_follow_fk_depth(self):
        import erd
        conn = g.empty_db()
        tables, fks = erd.read_schema(conn)
        pos = erd.layout(tables, fks)
        self.assertEqual(pos["address"][0], 0)
        self.assertEqual(pos["person"][0], 1)
        self.assertEqual(pos["bank_account"][0], 2)
        self.assertEqual(pos["bank_transaction"][0], 3)
        self.assertEqual(pos["luggage"][0], 3)
        s = erd.svg(conn)
        self.assertEqual(s.count('class="table"'), 13)
        self.assertEqual(s.count('class="fk"'), 7)
        self.assertIn('data-table="lift_log"', s)
        s.encode("ascii")
```

- [ ] **Step 2: Run it to verify it fails**.

- [ ] **Step 3: Implement**

```python
# erd.py
"""ERD auto-layout: layered by foreign-key depth, barycentre ordering, inline SVG. Stdlib only."""
W, GAP, LAYER_H, ROW = 170, 40, 60, 14

def read_schema(conn):
    names = [r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")]
    tables, fks = {}, []
    for t in names:
        fk = {r[3]: r[2] for r in conn.execute("PRAGMA foreign_key_list(%s)" % t)}
        cols = [(r[1], r[2], bool(r[5]), fk.get(r[1])) for r in conn.execute("PRAGMA table_info(%s)" % t)]
        tables[t] = cols
        fks += [(t, col, ref) for col, ref in fk.items()]
    return tables, fks

def layout(tables, fks, override=None):
    refs = {t: {ref for (tt, _, ref) in fks if tt == t and ref != t} for t in tables}
    layer = {}
    def depth(t, seen=()):
        if t in layer: return layer[t]
        layer[t] = 0 if not refs[t] else 1 + max(depth(r, seen + (t,)) for r in refs[t] if r not in seen)
        return layer[t]
    for t in tables: depth(t)
    rows = {}
    for t in tables: rows.setdefault(layer[t], []).append(t)
    pos = {}
    for L in sorted(rows):
        def bary(t):
            xs = [pos[r][1] for r in refs[t] if r in pos]
            return (sum(xs) / len(xs) if xs else 0, t)
        for i, t in enumerate(sorted(rows[L], key=bary)):
            h = 16 + ROW * len(tables[t])
            pos[t] = (L, i * (W + GAP), None, W, h)
    y = 0
    for L in sorted(rows):
        for t in rows[L]: pos[t] = (L, pos[t][1], y, W, pos[t][4])
        y += max(pos[t][4] for t in rows[L]) + LAYER_H
    for t, (x, yy) in (override or {}).items(): pos[t] = (pos[t][0], x, yy, W, pos[t][4])
    return pos

def svg(conn, override=None):
    tables, fks = read_schema(conn)
    pos = layout(tables, fks, override)
    width = max(x + w for (_, x, _, w, _) in pos.values()) + 10
    height = max(y + h for (_, _, y, _, h) in pos.values()) + 10
    out = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" width="%d" height="%d">' % (width, height, width, height)]
    for t, col, ref in fks:
        _, x1, y1, w1, h1 = pos[t]; _, x2, y2, w2, h2 = pos[ref]
        row = [c[0] for c in tables[t]].index(col)
        sx, sy = x1 + w1 / 2, y1 + 16 + ROW * row + ROW / 2
        ex, ey = x2 + w2 / 2, y2 + h2
        out.append('<path class="fk" data-from="%s.%s" data-to="%s" d="M%d %d C%d %d %d %d %d %d"/>' % (t, col, ref, sx, sy, sx, sy - 40, ex, ey + 40, ex, ey))
    for t, cols in tables.items():
        _, x, y, w, h = pos[t]
        g = ['<g class="table" data-table="%s" transform="translate(%d,%d)">' % (t, x, y),
             '<rect width="%d" height="%d"/>' % (w, h), '<rect class="head" width="%d" height="16"/>' % w,
             '<text class="tname" x="6" y="12">%s</text>' % t]
        for i, (c, typ, pk, ref) in enumerate(cols):
            label = ("*" if pk else "") + c + (" -> " + ref if ref else "")
            g.append('<text class="col" x="6" y="%d">%s</text>' % (16 + ROW * (i + 1) - 3, label))
        out.append("\n".join(g) + "</g>")
    return "\n".join(out) + "\n</svg>\n"
```

- [ ] **Step 4: Run tests and regenerate** — `python3 -m unittest -v` → OK; `python3 generate_db.py`; open `site/schema.svg` in a browser: 13 boxes in 4 layers, 7 curves, no overlapping boxes. If two boxes overlap, `GAP` is too small for that layer: raise it, not the override.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "Auto-laid-out ERD as SVG"`.

---

### Task 10: README, CLAUDE.md, course-folder ties

**Files:**
- Create: `README.md`, `CLAUDE.md`
- Modify: `../SQL/BACKLOG - SQL Mystery Game.md` (first line), `../SQL/0-SQL.md` (link), `../SQL/CLAUDE.md` (one line pointing here)

- [ ] **Step 1: README.md** — what the game is (3 lines), how to regenerate (`python3 generate_db.py`, `python3 -m unittest`), how to build a season (`--season 3`), the file map from the spec §6, and "the plot is public in `plot.py`; the site only ships hashes".

- [ ] **Step 2: CLAUDE.md** (for future sessions in this repo):

```markdown
# CLAUDE.md

Browser SQL game for the Albert School SQL course. Spec: `docs/superpowers/specs/2026-09-20-sql-mystery-game-design.md`; plans in `docs/superpowers/plans/`.

- Stdlib only, no build step. `python3 generate_db.py` rebuilds `site/` outputs and **is the test of the plot**: every solution must return exactly its answer and every trap must bite. `python3 -m unittest -v` pins the same plus normalisation and ERD layering.
- `plot.py` is data; `V` (planted values) is drawn in `plant_values(seed)`; seed 1912 pins the learning-mode values quoted in hints. Any text or data must be pure ASCII.
- Answer normalisation lives twice: `generate_db.normalise` and `site/app.js normalise`; `chapters.json.normalise_fixture` is checked by the page in `?selftest` mode. Change both together.
- Adding a chapter = one dict in `plot.CHAPTERS` (text + `solution` + `naive`) and its planting in `plant_part2`. Never edit `site/chapters.json`, `site/schema.svg` or `solution.sql` by hand.
- Course folder is `../SQL` (not a git repo). `8. Correction SQL Mystery Game.sql` there is generated.
```

- [ ] **Step 3: Course-folder ties** — prepend to `../SQL/BACKLOG - SQL Mystery Game.md`: `> Superseded 2026-09-20 by ../SQL-Mystery-Game/docs/superpowers/specs/2026-09-20-sql-mystery-game-design.md`. In `../SQL/0-SQL.md`, after the SQL Murder Mystery link add `- SQL Mystery Game (in-house): ../SQL-Mystery-Game/site/index.html`. In `../SQL/CLAUDE.md`, replace the backlog sentence with a pointer to the spec and note that `3-Corrections/8. Correction SQL Mystery Game.sql` is generated by the game repo. Keep all of it ASCII.

- [ ] **Step 4: Final run** — `python3 -m unittest -v && python3 generate_db.py && git status`: only the intended files changed.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "README, CLAUDE.md and course-folder pointers"`.

---

## Self-review

- **Spec coverage (sections 2, 3, 6):** cast (T5, T7), 12 chapters with traps (T5, T6), schema + conventions (T2), noise volumes (T4), easter eggs (T6: code telegram; T5: `Minou Ganimard`; the teacher's name and the "STOP READING THE NOISE" telegram are the code telegram itself), answer normalisation + fixture (T1, T8), hints/wrong answers/telegrams/endings (T7), `chapters.json` without answers (T8), `solution.sql` and teacher correction (T8), ERD auto-layout with `data-table` for the reveal (T9), seasons via `--season` (T8, values re-drawn in T3; compete *objectives* are Plan 3). Badges, rank, certificate, notepad, layout, compete flow and Apps Script are Plans 2-3.
- **Placeholders:** chapters 2-7 and 9-12 text is described by shape with two full models rather than written out; that is deliberate authoring work for the executor, constrained by the spec's per-chapter table and Task 7's test.
- **Type consistency:** `build_db(seed) -> (conn, V)` everywhere; `ch["answer_key"]` indexes `V`; `naive_rows=None` handled identically in `test_generate.PartI`, `PartII` and `self_check`; `erd.svg(conn)` used by `write_outputs`.
