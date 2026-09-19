"""Builds the Ritz Affair database, chapters.json, schema.svg and solution.sql. Stdlib only."""
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
