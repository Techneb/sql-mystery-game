import json
import random
import unittest

import generate_db as g
import plot

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
        for raw, want in FIXTURE + g.FIXTURE:
            self.assertEqual(g.normalise(raw), want, raw)


class Schema(unittest.TestCase):
    def test_tables_and_fks(self):
        conn = g.empty_db()
        tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        self.assertEqual(tables, {"address", "person", "police_report", "hotel_register", "interview",
                                  "cab_ride", "bank_account", "bank_transaction", "telegram",
                                  "room_service", "train_ticket", "luggage", "lift_log", "suite"})
        fks = {(t, r[3], r[2]) for t in tables
               for r in conn.execute(f"PRAGMA foreign_key_list({t})")}
        self.assertIn(("bank_transaction", "counterparty_id", "bank_account"), fks)
        self.assertIn(("luggage", "ticket_id", "train_ticket"), fks)
        self.assertIn(("room_service", "suite", "suite"), fks)
        self.assertEqual(len(fks), 10)   # + the suite hub; interview, cab_ride and guest_card links come in link_tables
        conn.close()

    def test_links_after_the_build(self):
        conn, V = g.build_db(1912)
        self.assertEqual(conn.execute("PRAGMA foreign_key_check").fetchall(), [])
        fks = {(t, r[3], r[2]) for (t,) in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
               for r in conn.execute(f"PRAGMA foreign_key_list({t})")}
        for link in [("interview", "person_id", "person"), ("cab_ride", "dropoff_address_id", "address"),
                     ("guest_card", "person_id", "person"), ("hotel_register", "suite", "suite")]:
            self.assertIn(link, fks)
        n, d = conn.execute("SELECT COUNT(*), COUNT(DISTINCT person_id) FROM guest_card").fetchone()
        self.assertEqual(n, d)   # one card per person: drawn 1:1
        cast = [c["name"] for c in plot.CAST]
        self.assertEqual(conn.execute("SELECT COUNT(*) FROM guest_card g JOIN person p ON p.id = g.person_id WHERE p.name IN (%s)"
                                      % ",".join("?" * len(cast)), cast).fetchone()[0], 0)   # fun only: no card for a suspect
        conn.close()


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


class Noise(unittest.TestCase):
    def test_volumes_and_ascii(self):
        conn = g.empty_db()
        V = g.plant_values(1912)
        g.fill_noise(conn, V, random.Random(1))
        counts = {t: conn.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
                  for t in ["person", "cab_ride", "bank_transaction", "telegram", "hotel_register"]}
        self.assertGreaterEqual(counts["person"], 5000)
        self.assertGreaterEqual(counts["cab_ride"], 20000)
        self.assertGreaterEqual(counts["hotel_register"], 5000)   # stays of 1-14 nights with gaps: about 5,500
        for t in ["person", "telegram", "interview", "police_report", "cab_ride"]:
            for row in conn.execute(f"SELECT * FROM {t}"):
                for v in row:
                    if isinstance(v, str):
                        v.encode("ascii")   # raises on non-ASCII
        self.assertIsNone(conn.execute("SELECT id FROM police_report WHERE id=?", (V["report_id"],)).fetchone())
        conn.close()

    def test_guests_stay_noise(self):
        import re
        films = re.search(r"FILM_LINES = \[([^\]]*)\]", open("site/app.js").read()).group(1)
        films = re.findall(r'"([^"]+)"', films)
        planted = {c["name"] for c in plot.CAST} | {"Mr. Grey"}
        self.assertEqual(len(set(g.GUESTS)), len(g.GUESTS))
        for name in g.GUESTS:
            self.assertNotIn(name, planted)
            self.assertNotIn("'", name)
            self.assertFalse([f for f in films if f in name.lower()], name)

    def test_census_surnames_stay_unambiguous(self):
        planted = [c["name"] for c in plot.CAST] + plot.COMPETE_FENCE_NAMES + ["Ernest Grimaud", "Marcel Duroc", "Bertram Hobbs", "Ada Pringle"]
        for name in planted:
            self.assertFalse([l for l in g.LAST if name.endswith(" " + l)], name)


class Discovery(unittest.TestCase):
    def test_must_contain_passes_and_fails(self):
        conn = g.empty_db()
        conn.execute("INSERT INTO interview VALUES (1,'Marcel Duroc',19120518,'the code is 42')")
        ok = dict(n=1, discovery=[dict(query="SELECT transcript FROM interview WHERE person_name='Marcel Duroc'", must_contain="42")])
        g.check_discovery(conn, {}, ok)   # must not raise
        ok_case = dict(n=1, discovery=[dict(query="SELECT transcript FROM interview WHERE person_name='Marcel Duroc'", must_contain="THE CODE")])
        g.check_discovery(conn, {}, ok_case)   # telegram text is upper-cased; the student reads it either way
        bad = dict(n=1, discovery=[dict(query="SELECT transcript FROM interview WHERE person_name='Marcel Duroc'", must_contain="99")])
        with self.assertRaises(AssertionError):
            g.check_discovery(conn, {}, bad)
        conn.close()

    def test_row_count_passes_and_fails(self):
        conn = g.empty_db()
        conn.execute("INSERT INTO interview VALUES (1,'A',19120518,'x')")
        conn.execute("INSERT INTO interview VALUES (2,'B',19120518,'y')")
        ok = dict(n=1, discovery=[dict(query="SELECT * FROM interview", row_count=2)])
        g.check_discovery(conn, {}, ok)
        bad = dict(n=1, discovery=[dict(query="SELECT * FROM interview", row_count=1)])
        with self.assertRaises(AssertionError):
            g.check_discovery(conn, {}, bad)
        conn.close()

    def test_missing_discovery_key_is_a_noop(self):
        conn = g.empty_db()
        g.check_discovery(conn, {}, dict(n=1))   # no "discovery" key at all -- must not raise
        conn.close()


class PartI(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.conn, cls.V = g.build_db(1912)

    @classmethod
    def tearDownClass(cls):
        cls.conn.close()

    def test_each_chapter_solution_returns_exactly_the_answer(self):
        for ch in plot.CHAPTERS[:8]:
            rows = self.conn.execute(ch["solution"].format(**self.V)).fetchall()
            self.assertEqual(len(rows), 1, ch["n"])
            self.assertEqual(g.normalise(str(rows[0][0])), g.normalise(str(self.V[ch["answer_key"]])), ch["n"])

    def test_each_trap_bites(self):
        for ch in plot.CHAPTERS[:8]:
            g.check_chapter(self.conn, self.V, ch)   # asserts naive_rows and that the naive query misses

    def test_plot_is_not_on_the_first_screen(self):
        # SELECT * without WHERE must show noise first (scatter_planted), May 1912 alone must not surface the report
        first = lambda sql: [r[0] for r in self.conn.execute(sql + " LIMIT 50")]
        self.assertNotIn("Marcel Duroc", first("SELECT person_name FROM interview"))
        self.assertNotIn(self.V["report_id"], first("SELECT id FROM police_report"))
        self.assertNotIn(self.V["report_id"], first("SELECT id FROM police_report WHERE date BETWEEN 19120501 AND 19120531"))
        self.assertNotIn(self.V["neighbour"], first("SELECT guest_name FROM hotel_register"))

    def test_transcripts_write_dates_in_english(self):
        for (t,) in self.conn.execute("SELECT transcript FROM interview"):
            self.assertNotRegex(t, r"1912\d{4}")


class PartII(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.conn, cls.V = g.build_db(1912)

    @classmethod
    def tearDownClass(cls):
        cls.conn.close()

    def test_solutions(self):
        for ch in plot.CHAPTERS[8:]:
            rows = self.conn.execute(ch["solution"].format(**self.V)).fetchall()
            self.assertEqual(len(rows), 1, ch["n"])
            self.assertEqual(g.normalise(str(rows[0][0])), g.normalise(str(self.V[ch["answer_key"]])), ch["n"])

    def test_traps(self):
        for ch in plot.CHAPTERS[8:]:
            g.check_chapter(self.conn, self.V, ch)

    def test_part2_code_is_in_a_telegram(self):
        n = self.conn.execute("SELECT COUNT(*) FROM telegram WHERE text LIKE ?", ("%" + self.V["part2_code"] + "%",)).fetchone()[0]
        self.assertEqual(n, 1)


class Text(unittest.TestCase):
    def test_every_chapter_has_all_text_and_formats(self):
        V = g.plant_values(1912)
        for ch in plot.CHAPTERS:
            for k in ["title", "story", "objective", "answer_form", "telegram"]:
                self.assertIn(k, ch, ch["n"])
            for s in [ch["title"], ch["story"], ch["objective"], ch["answer_form"], ch["telegram"]]:
                s.format(**V).encode("ascii")
        self.assertEqual(len(plot.CAST), 6)
        for k, s in plot.WRONG_SUSPECTS.items():
            s.encode("ascii")
            self.assertEqual(k, g.normalise(k))


class Outputs(unittest.TestCase):
    def test_chapters_json_has_hashes_and_no_answers(self):
        conn, V = g.build_db(1912)
        j = g.chapters_json(V)
        self.assertEqual(len(j["chapters"]), 12)
        for ch in j["chapters"]:
            self.assertEqual(len(ch["answer_sha256"]), 64)
            self.assertNotIn("solution", ch)
            self.assertNotIn("naive", ch)
        dump = json.dumps(j)
        for secret in [V["plate"], str(V["shell_account"]), V["trunk_no"]]:
            self.assertNotIn(secret, dump)
        self.assertEqual(j["chapters"][7]["answer_sha256"], g.sha(V["lupin_alias"]))
        self.assertEqual(g.normalise(json.loads(dump)["normalise_fixture"][0][0]), "rupert blakeney")
        conn.close()

    def test_solution_sql_runs_per_chapter(self):
        conn, V = g.build_db(1912)
        blocks = [b for b in g.solution_sql(V).split("\n\n") if any(not l.startswith("--") for l in b.strip().splitlines())]
        self.assertEqual(len(blocks), 13)   # twelve chapters and the Part II code
        for b in blocks:
            code = "\n".join(l for l in b.splitlines() if not l.startswith("--"))
            stmts = [q.strip() for q in code.split(";") if q.strip()]   # formatted: one statement spans several lines
            self.assertGreaterEqual(len(stmts), 1)
            for s in stmts[:-1]:
                conn.execute(s)   # discovery queries must not error
            self.assertEqual(len(conn.execute(stmts[-1]).fetchall()), 1)
        conn.close()


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

    def test_compete_telegram_id_never_collides_with_night_telegram_id(self):
        # seed 232462 drew the same value for both before Task 2 Step 1's redraw loop was added
        for seed in (232462, 7, 8, 1912):
            V = g.plant_values(seed)
            self.assertNotEqual(V["compete_telegram_id"], V["night_telegram_id"], seed)
        g.build_db(232462)   # must not raise sqlite3.IntegrityError

    def test_compete_fence_address_never_collides_with_learn_fence_address(self):
        # seed 775892 drew (45, "rue des Martyrs") for both before Task 1 Step 4's guard was added --
        # without the guard, chapter 5/6 learn solutions silently resolved to the compete fence's name
        for seed in (775892, 7, 8, 1912):
            V = g.plant_values(seed)
            self.assertNotEqual((V["compete_fence_number"], V["compete_fence_street"]),
                                 (V["fence_number"], V["fence_street"]), seed)
        conn, V = g.build_db(775892)
        self.assertEqual(g.check_chapter(conn, V, plot.CHAPTERS[4]), 5)   # ch5 naive_rows, i.e. the real check still passes


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
        self.assertEqual(s.count('class="table"'), 14)   # 13 + suite; guest_card is added later, by link_tables
        self.assertEqual(s.count('class="fk"'), 10)
        self.assertIn('data-table="lift_log"', s)
        self.assertNotIn("-&gt;", s)
        self.assertNotIn("->", s)
        self.assertEqual(s.count('class="key pk"'), 14)
        self.assertEqual(s.count('class="key fk"'), 10)
        s.encode("ascii")
        conn.close()

    def test_lines_clear_every_table(self):
        import erd
        conn, V = g.build_db(1912)
        tables, fks = erd.read_schema(conn)
        pos = erd.layout(tables, fks, [t for ch in plot.CHAPTERS for t in ch["tables"]])
        for e in erd.fk_paths(tables, fks, pos):
            for name, (_, x, y, w, h) in pos.items():
                for px, py in e["points"]:
                    self.assertFalse(x < px < x + w and y + 1 < py < y + h - 1, "%s.%s line crosses %s" % (e["t"], e["col"], name))
        # no two lines share a leg: legs on the same line (same x, or same y) never overlap
        legs = [(e["t"] + "." + e["col"], (min(ax, bx), min(ay, by), max(ax, bx), max(ay, by)))
                for e in erd.fk_paths(tables, fks, pos) for (ax, ay), (bx, by) in e["segments"] if (ax, ay) != (bx, by)]
        for n1, (x1, y1, X1, Y1) in legs:
            for n2, (x2, y2, X2, Y2) in legs:
                if n1 >= n2:
                    continue
                if x1 == X1 == x2 == X2:    # two vertical legs on the same x
                    self.assertFalse(min(Y1, Y2) - max(y1, y2) > 0.5, "%s and %s overlap" % (n1, n2))
                if y1 == Y1 == y2 == Y2:    # two horizontal legs on the same y
                    self.assertFalse(min(X1, X2) - max(x1, x2) > 0.5, "%s and %s overlap" % (n1, n2))
        # no two relationship lines cross
        paths = erd.fk_paths(tables, fks, pos)
        self.assertEqual(erd.crossings([(e, [e["end"]] + [b for _, b in e["segments"]]) for e in paths]), 0)
        self.assertIn(erd.cardinality(conn, "person", "address_id"), "N")
        conn.close()


class Suspects(unittest.TestCase):
    def test_notes_never_give_away_the_chapter_being_played(self):
        V = g.plant_values(1912)
        chapters = {ch["n"]: ch for ch in plot.CHAPTERS}
        for s in plot.CAST:
            self.assertIn(s["meet"], chapters)
            surname = s["name"].split()[-1]
            self.assertIn(surname, chapters[s["meet"]]["story"].format(**V) + s["name"] * (s["meet"] == 3),
                          "%s is met in chapter %d, whose story names them" % (s["name"], s["meet"]))
            for n, text in s["notes"]:
                for d in chapters[n].get("discovery", []):
                    needles = d.get("must_contain", [])
                    for needle in [needles] if isinstance(needles, str) else needles:
                        self.assertNotIn(needle.format(**V).lower(), text.lower(), "%s note %d" % (s["name"], n))
                self.assertNotIn(str(V[chapters[n]["answer_key"]]).lower(), text.lower(), "%s note %d" % (s["name"], n))
                text.encode("ascii")


class ChapterSeven(unittest.TestCase):
    def test_the_letter_is_only_in_the_suspects(self):
        ch = [c for c in plot.CHAPTERS if c["n"] == 7][0]
        for k in ("story", "objective", "title"):
            for leak in (" R.", " an R", "'R.'", "signs R"):
                self.assertNotIn(leak, ch[k], k)
        ortega = [c for c in plot.CAST if c["name"] == "Raul Ortega"][0]
        self.assertLessEqual(ortega["meet"], 7)   # always in the gallery by chapter 7
        card = ortega["bio"] + " ".join(t for n, t in ortega["notes"] if n <= 7)
        self.assertIn("an R", card)
        self.assertIn("also signs R", card)


class Board(unittest.TestCase):
    def test_every_card_says_what_its_answer_is(self):
        for mode, seed in (("learn", 1912), ("compete", 7)):
            conn, V = g.build_db(seed)
            for ch in g.chapters_json(V, mode)["chapters"]:
                self.assertTrue(ch["board"], (mode, ch["n"]))
            conn.close()


class SolutionSql(unittest.TestCase):
    def test_formatter_matches_the_site(self):
        import re
        with open("site/app.js") as f:
            js = f.read()
        words = lambda name: set(" ".join(re.findall(r'"([a-z_ ]+)"', re.search(r"const %s = new Set\(([\s\S]*?)\);" % name, js).group(1))).split())
        self.assertEqual(words("SQL_KEYWORDS"), g.SQL_KEYWORDS)
        self.assertEqual(words("SQL_FUNCS"), g.SQL_FUNCS)
        for ch in plot.CHAPTERS:
            q = ch["solution"].format(**g.plant_values(1912)) + ";"
            f = g.format_sql(q)
            self.assertEqual(re.sub(r"\s+", "", f).lower(), re.sub(r"\s+", "", q).lower())
            self.assertEqual(g.format_sql(f), f)

    def test_no_chapter_repeats_a_query(self):
        for ch in plot.CHAPTERS:
            for key in ("discovery", "discovery_compete"):
                queries = [d["query"] for d in ch.get(key, [])]
                self.assertEqual(len(queries), len(set(queries)), "chapter %d %s" % (ch["n"], key))


if __name__ == "__main__":
    unittest.main()
