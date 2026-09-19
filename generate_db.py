"""Builds the Ritz Affair database, chapters.json, schema.svg and solution.sql. Stdlib only."""
import datetime
import random
import re
import sqlite3

import plot
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
FLOOR2 = [202, 204, 206, 208, 210, 212, 216, 218, 220, 222, 224]


def plant_part1(conn, V, r):
    c = conn.cursor()
    T, E = V["theft_date"], V["eve_date"]
    # --- people and addresses of the cast; noise must not share the fence's address
    c.execute("UPDATE address SET number = number + 200 WHERE number=? AND street=?", (V["fence_number"], V["fence_street"]))
    c.execute("INSERT INTO address VALUES (1,?,?,9)", (V["fence_number"], V["fence_street"]))
    for pid, name, nat, born, occ in CAST_PERSONS:
        c.execute("INSERT INTO person VALUES (?,?,?,?,?,?)", (pid, name, nat, born, occ, r.randint(100, 1299)))
    # boarding house at the fence's address: 5 tenants, one jeweller
    c.execute("UPDATE person SET address_id=1 WHERE id=7")
    for i in range(4):
        c.execute("INSERT INTO person VALUES (?,?,?,?,?,1)",
                  (13 + i, _name(r), "French", r.randint(1850, 1890), r.choice(["clerk", "seamstress", "waiter", "student"])))
    # --- ch1: the report (no noise theft at the Ritz that day)
    c.execute("DELETE FROM police_report WHERE place='Hotel Ritz' AND date=? AND type='theft'", (T,))
    c.execute("INSERT INTO police_report VALUES (?,?,?,?,?,?)",
        (V["report_id"], T, "Paris", "Hotel Ritz", "theft",
         "Sapphire known as the Blue Star taken from the second-floor suite of the Comtesse de Cagliostro. "
         "Night porter {porter} heard the lift at 02:10. The thief came over the balcony of the "
         "neighbouring suite, the most expensive one on the floor. A calling card signed A. L. on the pillow.".format(**V)))
    # two decoy Ritz reports on other dates
    c.execute("INSERT INTO police_report VALUES (?,?,?,?,?,?)", (V["report_id"] - 400, 19120503, "Paris", "Hotel Ritz", "lost property", "Umbrella, black, with a duck's head. Reported by a Senora."))
    c.execute("INSERT INTO police_report VALUES (?,?,?,?,?,?)", (V["report_id"] - 200, 19120611, "Paris", "Hotel Ritz", "theft", "Silver spoon. The guest denies everything and keeps the spoon."))
    # --- ch2: the six suspects on floor 2, 15-22 May; the neighbour pays the most
    c.execute("DELETE FROM hotel_register WHERE floor=2 AND checkin<19120522 AND checkout>19120515")
    others = [s for s in FLOOR2 if s not in (V["neighbour_suite"], V["lupin_suite"], V["ortega_suite"])]
    stays = [("Lord Ashcombe", V["neighbour_suite"], 190), ("Rupert Blakeney", V["lupin_suite"], 150),
             ("Raul Ortega", V["ortega_suite"], 140), ("Paul Sernine", others[0], 160),
             ("Horace Velmont", others[1], 175), ("Ines de Almagro", others[2], 155)]
    for i, (name, suite, price) in enumerate(stays):
        c.execute("INSERT INTO hotel_register VALUES (?,?,?,2,?,?,?)", (1 + i, name, suite, price, 19120515, 19120522))
    # --- ch3: the interview and the cab; the solution's WHERE must match this DELETE
    c.execute("INSERT INTO interview VALUES (1,?,?,?)", ("Lord Ashcombe", T,
        "I was at the Opera until one. My valet saw a man in an English coat leave by the service door "
        "and take a motor-cab on the Place. He says the plate began with {plate_prefix}, the rest he could not read. "
        "The fellow tipped in English coins.".format(**V)))
    c.execute("DELETE FROM cab_ride WHERE date=? AND pickup='Place Vendome' AND time>=200 AND plate LIKE ?", (T, V["plate_prefix"] + "%"))
    # decoys: same prefix that night elsewhere, and from Vendome earlier in the evening
    c.execute("INSERT INTO cab_ride VALUES (2,?,?,140,'Opera',?,5)", (V["plate_prefix"] + "107", T, "3 rue Blanche"))
    c.execute("INSERT INTO cab_ride VALUES (3,?,?,2310,'Place Vendome',?,7)", (V["plate_prefix"] + "290", E, "9 rue Royale"))
    # --- ch4: that cab's week: fence address 3 times (incl. the night ride), two other addresses twice, 54 once
    week = [19120513, 19120514, 19120515, 19120516, 19120517, 19120519]
    rides = [(V["fence_address"], T, 215, "Place Vendome"), (V["fence_address"], 19120514, 1030, None),
             (V["fence_address"], 19120516, 1715, None),
             ("12 rue de la Paix", 19120513, 900, None), ("12 rue de la Paix", 19120515, 1800, None),
             ("40 boulevard Haussmann", 19120517, 1100, None), ("40 boulevard Haussmann", 19120519, 1500, None)]
    seen = {x[0] for x in rides}
    while len(rides) < 61:
        drop = "%d %s" % (r.randint(50, 120), r.choice(STREETS))
        if drop not in seen:
            seen.add(drop)
            rides.append((drop, r.choice(week), _time(r), None))
    for i, (drop, d, t, pick) in enumerate(rides):
        c.execute("INSERT INTO cab_ride VALUES (?,?,?,?,?,?,?)", (10 + i, V["plate"], d, t, pick or r.choice(PLACES), drop, r.randint(2, 12)))
    # --- ch6: the fence's account and payments in May; largest single payment goes to a decoy
    c.execute("INSERT INTO bank_account VALUES (?,7,'Credit Lyonnais')", (V["fence_account"],))
    c.execute("INSERT INTO bank_account VALUES (?,NULL,'Credit Lyonnais')", (V["shell_account"],))
    decoy = c.execute("SELECT id FROM bank_account WHERE id>=100 LIMIT 1").fetchone()[0]
    tx = [(V["shell_account"], 19120519, 15000), (V["shell_account"], 19120520, 15000), (V["shell_account"], 19120521, 10000),
          (decoy, 19120510, 25000)]
    for i in range(20):
        tx.append((r.randint(100, 4000), _date(r, 5, 5), r.randint(50, 900)))
    for i, (cp, d, amt) in enumerate(tx):
        c.execute("INSERT INTO bank_transaction VALUES (?,?,?,?,?,'transfer')", (1 + i, V["fence_account"], cp, d, amt))
    # --- ch7: telegrams from the Ritz desk on the 18th; exactly one at night (03:30, after the suite falls silent, ch11)
    c.execute("DELETE FROM telegram WHERE office='Ritz' AND date=? AND time<600", (T,))
    c.execute("INSERT INTO telegram VALUES (?,?,?,?,?,?,?,?)",
        (V["night_telegram_id"], "Ritz", T, 330, "R.", "E. G., Paris",
         V["lupin_suite"], "PAYMENT TO {shell_account} RECEIVED STOP {champagne} AS ALWAYS MY FIRST ORDER BEFORE DAWN STOP R".format(**V).upper()))
    for i in range(79):   # daytime Ritz telegrams that day
        c.execute("INSERT INTO telegram VALUES (?,?,?,?,?,?,?,?)",
            (5000 + i, "Ritz", T, r.randint(6, 23) * 100 + r.randint(0, 59), _name(r), _name(r),
             r.choice(range(101, 525)), " ".join(r.choice(TEL_WORDS) for _ in range(6))))
    # --- ch8: room service on the 18th; Ortega's suite orders coffee first
    c.execute("DELETE FROM room_service WHERE date=? AND time<600", (T,))
    rs = [(V["lupin_suite"], 320, V["champagne"], 40), (V["lupin_suite"], 900, "coffee", 2),
          (V["ortega_suite"], 500, "coffee", 2), (V["ortega_suite"], 530, V["champagne"], 40),
          (V["neighbour_suite"], 730, V["champagne"], 40), (305, 1300, V["champagne"], 40)]
    for i, (s, t, item, amt) in enumerate(rs):
        c.execute("INSERT INTO room_service VALUES (?,?,?,?,?,?)", (1 + i, s, T, t, item, amt))
    conn.commit()


def plant_part2(conn, V, r):
    c = conn.cursor()
    T = V["theft_date"]
    # --- the Part II code, hidden in a noise telegram (Egg Hunter)
    c.execute("INSERT INTO telegram VALUES (9001,'Central',19120519,1512,'A. L.','TO THE CURIOUS CLERK',NULL,?)",
              ("%s STOP THE CODE IS THE FIRST FOUR WORDS STOP" % V["part2_code"],))
    # --- ch9: Ashcombe's trunks. Three under his own ticket; one under a ticket bought by Mr. Grey.
    c.execute("INSERT INTO train_ticket VALUES (1,1,19120519,'Boat Train 9:15','London')")
    c.execute("INSERT INTO train_ticket VALUES (2,10,19120519,'Boat Train 9:15','London')")   # Mr. Grey, person 10
    for i, trunk in enumerate(["A-1", "A-2", "A-3"]):
        c.execute("INSERT INTO luggage VALUES (?,1,?,'Lord Ashcombe',?)", (1 + i, trunk, 30 + i))
    c.execute("INSERT INTO luggage VALUES (4,2,?,'Lord Ashcombe',12)", (V["trunk_no"],))
    # --- ch10: Blakeney and Mr. Grey alternate weeks Jan-Apr in the same suite, never overlapping.
    #     Two other frequent guests stay only in Grey's weeks, plus one single night inside a Blakeney week.
    c.execute("DELETE FROM hotel_register WHERE suite=? AND checkin<19120515", (V["lupin_suite"],))
    day, rid, who = 19120106, 20000, 0
    names = ["Rupert Blakeney", "Mr. Grey"]
    while day < 19120501:
        c.execute("INSERT INTO hotel_register VALUES (?,?,?,2,150,?,?)", (rid, names[who], V["lupin_suite"], day, _add_days(day, 6)))
        rid += 1; who ^= 1; day = _add_days(day, 7)
    for i, name in enumerate(["Baron von Stroheim", "Cornelius Bell"]):
        d = 19120113 + i     # Grey's weeks start on the 13th
        for k in range(7):
            c.execute("INSERT INTO hotel_register VALUES (?,?,?,3,80,?,?)", (rid, name, 301 + i, d, _add_days(d, 4))); rid += 1
            d = _add_days(d, 14)
        c.execute("INSERT INTO hotel_register VALUES (?,?,?,3,80,19120111,19120112)", (rid, name, 301 + i)); rid += 1
    # noise guests are frequent too (few names, many stays): give every one that never met Blakeney one night that does
    ch10 = [ch for ch in plot.CHAPTERS if ch["n"] == 10][0]
    for (name,) in c.execute(ch10["solution"].format(**V)).fetchall():
        if name != V["double_alias"]:
            c.execute("INSERT INTO hotel_register VALUES (?,?,303,3,80,19120111,19120112)", (rid, name)); rid += 1
    # --- ch11: the night of the theft. Lupin's suite is silent 02:05-03:10 (lift down, lift up), then
    #     champagne at 03:20 and the telegram at 03:30. Every other second-floor suite has a lift event
    #     inside the window; suite 407 has a longer silence, 03:10-05:55, after the window.
    c.execute("DELETE FROM lift_log WHERE date=? AND time<600", (T,))
    c.execute("DELETE FROM telegram WHERE date=? AND time<600 AND suite IS NOT NULL AND id<>?", (T, V["night_telegram_id"]))
    c.execute("INSERT INTO lift_log VALUES (1,?,205,2,?,'down')", (T, V["lupin_suite"]))
    c.execute("INSERT INTO lift_log VALUES (2,?,310,2,?,'up')", (T, V["lupin_suite"]))
    lid = 10
    for t in (130, 230, 330):
        for s in FLOOR2:
            if s != V["lupin_suite"]:
                c.execute("INSERT INTO lift_log VALUES (?,?,?,2,?,?)", (lid, T, t, s, r.choice(["up", "down"]))); lid += 1
    c.execute("INSERT INTO lift_log VALUES (90,?,310,4,407,'up')", (T,))
    c.execute("INSERT INTO lift_log VALUES (91,?,555,4,407,'down')", (T,))
    # --- ch12: the money chain, seven hops of 98%, one hop split in two, one shell with unrelated
    #     traffic the same day, crossing into June. The last account belongs to the Comtesse (person 9).
    amt, acct, chain, day = V["chain_amount"], V["shell_account"], [], 19120520
    hops = r.sample(range(60000, 69999), 7)
    for h, nxt in enumerate(hops):
        c.execute("INSERT INTO bank_account VALUES (?,?,?)", (nxt, 9 if h == 6 else None, r.choice(["Societe Generale", "Banque de Paris", "Comptoir National"])))
        amt = round(amt * 0.98)
        if h == 3:   # split hop
            c.execute("INSERT INTO bank_transaction VALUES (?,?,?,?,?,'transfer')", (90000 + h, acct, nxt, day, amt // 2))
            c.execute("INSERT INTO bank_transaction VALUES (?,?,?,?,?,'transfer')", (90100 + h, acct, nxt, day, amt - amt // 2))
        else:
            c.execute("INSERT INTO bank_transaction VALUES (?,?,?,?,?,'transfer')", (90000 + h, acct, nxt, day, amt))
        if h == 4:   # unrelated money in and out of the same shell account, same day
            c.execute("INSERT INTO bank_transaction VALUES (?,?,?,?,?,'deposit')", (90200, r.randint(100, 4000), nxt, day, 900))
            c.execute("INSERT INTO bank_transaction VALUES (?,?,?,?,?,'transfer')", (90201, nxt, r.randint(100, 4000), day, 850))
        chain.append((nxt, amt)); acct = nxt; day = _add_days(day, 3)   # 20 May + 3*6 = 7 June
    V["chain"] = chain
    conn.commit()


def build_db(seed):
    V = plant_values(seed)
    r = random.Random(seed)
    conn = empty_db()
    fill_noise(conn, V, r)
    plant_part1(conn, V, r)
    plant_part2(conn, V, r)
    return conn, V


def check_chapter(conn, V, ch):
    """The solution returns exactly the answer; the naive query does not (wrong count, or a wrong value)."""
    want = normalise(str(V[ch["answer_key"]]))
    rows = conn.execute(ch["solution"].format(**V)).fetchall()
    assert len(rows) == 1 and normalise(str(rows[0][0])) == want, \
        "chapter %d: solution returned %r" % (ch["n"], rows[:3])
    rows = conn.execute(ch["naive"].format(**V)).fetchall()
    assert ch["naive_rows"] is None or len(rows) == ch["naive_rows"], \
        "chapter %d: naive returned %d rows, expected %d" % (ch["n"], len(rows), ch["naive_rows"])
    assert not (len(rows) == 1 and normalise(str(rows[0][0])) == want), "chapter %d: trap does not bite" % ch["n"]
    return len(rows)
