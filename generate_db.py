"""Builds the Ritz Affair database, chapters.json, schema.svg and solution.sql. Stdlib only."""
import datetime
import random
import re
import sqlite3

from plot import STOP_WORDS


def normalise(s):
    """Same rules as normalise() in site/app.js. Keep both in sync (fixture in chapters.json)."""
    tokens = [t for t in re.findall(r"[a-z0-9]+", s.lower()) if t not in STOP_WORDS]
    if tokens and all(t.isdigit() for t in tokens):
        return "".join(tokens)
    return " ".join(tokens)


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


STREETS = ["rue des Martyrs", "rue de Rivoli", "boulevard Haussmann", "rue Saint-Honore",
           "rue de la Paix", "avenue de l'Opera", "rue Cambon", "boulevard des Capucines",
           "rue Royale", "rue du Faubourg Saint-Honore", "rue Lafayette", "rue de Clichy",
           "rue Blanche", "rue Pigalle", "boulevard de Clichy", "rue de Douai"]


def plant_values(seed):
    """Every value the plot plants. Seed 1912 pins the spec's literal values; any other seed re-draws them."""
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
    m = r.randint(m0, m1)
    d = r.randint(1, [31, 29, 31, 30, 31, 30][m - 1])
    return 19120000 + m * 100 + d


def _time(r):
    return r.randint(0, 23) * 100 + r.randint(0, 59)


def _name(r):
    return "%s %s" % (r.choice(FIRST), r.choice(LAST))


def _add_days(d, n):
    dt = datetime.date(d // 10000, d // 100 % 100, d % 100) + datetime.timedelta(days=n)
    return dt.year * 10000 + dt.month * 100 + dt.day


def fill_noise(conn, V, r):
    """Noise ids start at 100 in every table and skip the reserved planted ids."""
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
    # hotel: 200 suites (x01-x40 on 5 floors), back-to-back stays through Jan-Jun; floor = suite // 100
    rows, rid = [], 100
    for suite in [f * 100 + n for f in range(1, 6) for n in range(1, 41)]:
        day = 19120101
        while day < 19120630:
            nights = r.randint(1, 5)
            out = _add_days(day, nights)
            price = {1: 30, 2: 120, 3: 80, 4: 60, 5: 45}[suite // 100] + r.randint(0, 25)
            rows.append((rid, _name(r), suite, suite // 100, price, day, out))
            rid += 1
            day = _add_days(out, r.randint(0, 1))
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
