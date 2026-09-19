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
        for raw, want in FIXTURE:
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
            g.check_chapter(self.conn, self.V, ch)   # asserts naive_rows and that the naive query misses


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
            self.assertEqual(len(ch["hints"]), 3, ch["n"])
            self.assertIn("____", ch["hints"][2], ch["n"])
            for s in [ch["title"], ch["story"], ch["objective"], ch["answer_form"], ch["telegram"], *ch["hints"]]:
                s.format(**V).encode("ascii")
        self.assertEqual(len(plot.CAST), 6)
        for k, s in plot.WRONG_SUSPECTS.items():
            s.encode("ascii")
            self.assertEqual(k, g.normalise(k))


if __name__ == "__main__":
    unittest.main()
