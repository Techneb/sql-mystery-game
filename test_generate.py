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
                                  "room_service", "train_ticket", "luggage", "lift_log"})
        fks = {(t, r[3], r[2]) for t in tables
               for r in conn.execute(f"PRAGMA foreign_key_list({t})")}
        self.assertIn(("bank_transaction", "counterparty_id", "bank_account"), fks)
        self.assertIn(("luggage", "ticket_id", "train_ticket"), fks)
        self.assertEqual(len(fks), 6)
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
        self.assertGreaterEqual(counts["hotel_register"], 9000)
        for t in ["person", "telegram", "interview", "police_report", "cab_ride"]:
            for row in conn.execute(f"SELECT * FROM {t}"):
                for v in row:
                    if isinstance(v, str):
                        v.encode("ascii")   # raises on non-ASCII
        self.assertIsNone(conn.execute("SELECT id FROM police_report WHERE id=?", (V["report_id"],)).fetchone())
        conn.close()


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
            for k in ["title", "story", "objective", "answer_form", "hints", "telegram"]:
                self.assertIn(k, ch, ch["n"])
            self.assertEqual(len(ch["hints"]), 0, ch["n"])
            for s in [ch["title"], ch["story"], ch["objective"], ch["answer_form"], ch["telegram"], *ch["hints"]]:
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
        self.assertEqual(len(blocks), 12)
        for b in blocks:
            sql = "\n".join(l for l in b.splitlines() if not l.startswith("--")).rstrip(";\n")
            self.assertEqual(len(conn.execute(sql).fetchall()), 1)
        conn.close()


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
        self.assertEqual(s.count('class="fk"'), 6)
        self.assertIn('data-table="lift_log"', s)
        s.encode("ascii")
        conn.close()


if __name__ == "__main__":
    unittest.main()
