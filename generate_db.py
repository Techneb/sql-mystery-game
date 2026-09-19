"""Builds the Ritz Affair database, chapters.json, schema.svg and solution.sql. Stdlib only."""
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
