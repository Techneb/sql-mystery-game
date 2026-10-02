"""Builds the Ritz Affair database, chapters.json, schema.svg and solution.sql. Stdlib only."""
import argparse
import datetime
import hashlib
import json
import os
import random
import re
import sqlite3

import erd

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
CREATE TABLE suite (
  id INTEGER PRIMARY KEY, floor INTEGER, view TEXT);
CREATE TABLE hotel_register (
  id INTEGER PRIMARY KEY, guest_name TEXT, suite INTEGER REFERENCES suite(id), floor INTEGER, price INTEGER,
  checkin INTEGER, checkout INTEGER);
CREATE TABLE interview (
  id INTEGER PRIMARY KEY, person_name TEXT, date INTEGER, transcript TEXT);
CREATE TABLE cab_ride (
  id INTEGER PRIMARY KEY, plate TEXT, date INTEGER, time INTEGER, pickup TEXT, dropoff TEXT,
  fare INTEGER, currency TEXT);
CREATE TABLE bank_account (
  id INTEGER PRIMARY KEY, person_id INTEGER REFERENCES person(id), bank TEXT);
CREATE TABLE bank_transaction (
  id INTEGER PRIMARY KEY, account_id INTEGER REFERENCES bank_account(id),
  counterparty_id INTEGER REFERENCES bank_account(id), date INTEGER, amount INTEGER, type TEXT);
CREATE TABLE telegram (
  id INTEGER PRIMARY KEY, office TEXT, date INTEGER, time INTEGER, sender TEXT, recipient TEXT,
  suite INTEGER REFERENCES suite(id), text TEXT);
CREATE TABLE room_service (
  id INTEGER PRIMARY KEY, suite INTEGER REFERENCES suite(id), date INTEGER, time INTEGER, item TEXT, amount INTEGER);
CREATE TABLE train_ticket (
  id INTEGER PRIMARY KEY, person_id INTEGER REFERENCES person(id), date INTEGER, train TEXT,
  destination TEXT);
CREATE TABLE luggage (
  id INTEGER PRIMARY KEY, ticket_id INTEGER REFERENCES train_ticket(id), trunk_no TEXT,
  owner_name TEXT, weight_kg INTEGER);
CREATE TABLE lift_log (
  id INTEGER PRIMARY KEY, date INTEGER, time INTEGER, floor INTEGER, suite INTEGER REFERENCES suite(id), direction TEXT);
"""


def empty_db():
    conn = sqlite3.connect(":memory:")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.executescript(DDL)
    return conn


STREETS = ["rue des Martyrs", "rue de Rivoli", "boulevard Haussmann", "rue Saint-Honore",
           "rue de la Paix", "avenue Montaigne", "rue Cambon", "boulevard des Capucines",
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
        compete_report_id=3200 if learn else r.randint(3200, 3499),
        compete_plate="75-9777" if learn else "75-9%03d" % r.randint(100, 999),
        compete_fence_number=45 if learn else r.randint(3, 60),
        compete_fence_street="rue de Clichy" if learn else r.choice(STREETS),
        compete_fence_name="Isidore Vasseur" if learn else r.choice(plot.COMPETE_FENCE_NAMES),
        compete_fence_account=54000 if learn else r.randint(50000, 59999),
        compete_shell_account=74000 if learn else r.randint(70000, 79999),
        compete_telegram_id=1800 if learn else r.randint(1500, 2900),
    )
    while V["ortega_suite"] in (0, V["lupin_suite"], V["neighbour_suite"]):
        V["ortega_suite"] = r.choice([202, 204, 206, 208, 210, 212, 216, 218, 220, 222, 224])
    while V["compete_telegram_id"] == V["night_telegram_id"]:
        V["compete_telegram_id"] = r.randint(1500, 2900)
    while (V["compete_fence_number"], V["compete_fence_street"]) == (V["fence_number"], V["fence_street"]):
        V["compete_fence_number"] = r.randint(3, 60)
        V["compete_fence_street"] = r.choice(STREETS)
    V["fence_address"] = "%d %s" % (V["fence_number"], V["fence_street"])
    V["plate_prefix"] = V["plate"][:4]          # "75-2"
    V["compete_plate_prefix"] = V["compete_plate"][:4]
    V["compete_fence_address"] = "%d %s" % (V["compete_fence_number"], V["compete_fence_street"])
    V["chain"] = []                              # filled by plant_part2: [(account_id, amount), ...]
    return V


# Census names mix the archive's references ("Luigi Baggins"); planted surnames (Grimaud, Duroc, the cast,
# plot.COMPETE_FENCE_NAMES) are never in LAST, so a person.name filter on one stays unambiguous.
FIRST = ["Vito", "Rhett", "Dorothy", "Travis", "Forrest", "Bilbo", "Frodo", "Samwise", "Ilsa", "Rick", "Norman",
         "Marty", "Emmett", "Sarah", "Kyle", "Leia", "Han", "Luke", "Jon", "Arya", "Eddard", "Mario", "Luigi",
         "Peach", "Zelda", "Link", "Gordon", "Lara", "Leeroy", "Perceval", "Karadoc", "Arthur", "Lancelot",
         "Bohort", "Gauvain", "Yvain", "Guenievre", "Seli", "Leodagan", "Phileas", "Gustave", "Gabrielle",
         "Pablo", "Gaston", "Camille", "Auguste", "Edmond", "Cosette", "Cyrano", "Keyser", "Quint", "Oscar"]
LAST = ["Kane", "Corleone", "Dawson", "Brody", "Gale", "Diggs", "Anderson", "Butler", "Bickle", "Montana",
        "Gump", "Baggins", "Gamgee", "Blaine", "Lund", "Bates", "Bond", "McFly", "Sear", "Connor", "Reese",
        "Solo", "Organa", "Kenobi", "Skywalker", "Stark", "Snow", "Soze", "Chaplin", "Toadstool", "Freeman",
        "Robotnik", "Masters", "McCloud", "Croft", "Jenkins", "Pajitnov", "Pendragon", "du Lac", "de Galles",
        "de Vannes", "de Gaunes", "Proust", "Fogg", "Eiffel", "Curie", "Chanel", "Picasso", "Magritte",
        "Houdini", "Leroux", "Flammarion", "Lumiere", "Melies", "Bernhardt", "Monet", "Valjean", "Javert",
        "Dantes", "de Bergerac", "Mustard", "Peacock", "Plum"]
NATION = ["French"] * 8 + ["English", "German", "Italian", "Spanish", "American", "Argentine"]
OCCUP = ["clerk", "seamstress", "cab driver", "waiter", "banker", "jeweller", "actress", "student",
         "engineer", "lawyer", "shopkeeper", "concierge", "journalist", "painter", None]
PLACES = ["Place Vendome", "Gare du Nord", "Gare Saint-Lazare", "Opera", "Place de la Concorde",
          "Les Halles", "Montmartre", "Jardin des Tuileries", "Pont Neuf", "Place de la Bastille",
          "Bois de Boulogne", "Champs-Elysees", "Boulevard Saint-Germain", "Gare de Lyon"]
ITEMS = [("coffee", 2), ("tea", 2), ("croissants", 3), ("omelette", 5), ("consomme", 6),
         ("sole meuniere", 14), ("Clicquot 1904", 40), ("Pommery 1906", 35), ("cognac", 8),
         ("oysters", 18), ("chateaubriand", 22), ("ice", 1)]
TYPES = ["theft", "burglary", "assault", "fraud", "lost property", "disturbance", "vandalism"]
# Hotel guests reuse the noise's references (films, games, Kaamelott, the Belle Epoque, Cluedo) in 1912 dress.
# Keep it noise: no cast name, no apostrophe (students type these), no FILM_LINES fragment.
GUESTS = [
    # films
    "Mr. C. F. Kane", "Don Vito Corleone", "Mr. Michael Corleone", "Mlle Cendrillon", "Mr. Jack Dawson",
    "Miss Rose DeWitt Bukater", "Chief Martin Brody", "Captain Quint", "Miss Dorothy Gale", "Mr. Oscar Diggs",
    "Mr. Thomas Anderson", "Mlle Trinity", "Mr. Rhett Butler", "Mr. Travis Bickle", "Mr. Tony Montana",
    "Mr. Forrest Gump", "Mr. Bilbo Baggins", "Mr. Samwise Gamgee", "Mr. Rick Blaine", "Miss Ilsa Lund",
    "Mr. Norman Bates", "Mr. J. Bond", "Dr. Emmett Brown", "Mr. Marty McFly", "Master Cole Sear",
    "Dr. Malcolm Crowe", "Mrs. Sarah Connor", "Mr. Kyle Reese", "Mr. Han Solo", "Princess Leia Organa",
    "Mr. Obi-Wan Kenobi", "Captain Jim Lovell", "Lord Eddard Stark", "Mr. Jon Snow", "Mr. Waldo",
    "Mr. Keyser Soze", "Mr. Charles Chaplin",
    # games
    "Signor Mario Mario", "Signor Luigi Mario", "Princess Peach Toadstool", "Mr. Link", "Princess Zelda",
    "Mr. Gordon Freeman", "Miss Chell", "Dr. Ivo Robotnik", "Mr. Ryu", "Mr. Ken Masters", "Miss Chun-Li",
    "Mr. Fox McCloud", "Mr. Solid Snake", "Mr. Leeroy Jenkins", "M. Pac-Man", "Mr. Alexey Pajitnov",
    "Lady Lara Croft",
    # Kaamelott
    "Perceval de Galles", "Karadoc de Vannes", "Arthur Pendragon", "Lancelot du Lac", "Leodagan de Carmelide",
    "M. Merlin", "Bohort de Gaunes", "Dame Guenievre", "Dame Seli", "Pere Blaise", "M. Kadoc", "M. Venec",
    "Yvain de Carmelide", "Gauvain des Orcades",
    # the Belle Epoque, books and paintings
    "M. Marcel Proust", "M. Phileas Fogg", "M. Gustave Eiffel", "Mme Marie Curie", "Mlle Gabrielle Chanel",
    "Senor Pablo Picasso", "M. Rene Magritte", "Mr. Harry Houdini", "M. Gaston Leroux", "M. Camille Flammarion",
    "M. Auguste Lumiere", "M. Louis Lumiere", "M. Athos", "M. Porthos", "M. Aramis", "Mme Lisa Gherardini",
    "M. Obelix", "M. Georges Melies", "Mme Sarah Bernhardt", "M. Claude Monet", "Captain Nemo",
    "M. Jean Valjean", "Inspector Javert", "Mlle Cosette", "M. Cyrano de Bergerac", "M. Edmond Dantes",
    # Cluedo
    "Colonel Mustard", "Mrs. Peacock", "Professor Plum", "Miss Scarlett", "Reverend Green", "Mrs. White",
]
TEL_WORDS = ["ARRIVE", "TOMORROW", "STOP", "SEND", "MONEY", "LOVE", "MOTHER", "ILL", "TRAIN",
             "DELAYED", "CONTRACT", "SIGNED", "REGARDS", "WEATHER", "FINE", "BUY", "SELL", "SHARES"]
# Noise reads like a real, tired Prefecture: famous lines, famous people, anachronisms on purpose.
# Keep it noise: no cast name, no sapphire, no balcony, no plate prefix, no suite price rank.
REPORT_TEXT = [
    "A tall stranger in dark glasses took the hat stand and promised he would be back.",
    "A man in a cape asked the doorman for Rosebud, then left without his sledge.",
    "Monsieur Proust reports a madeleine missing from his tea. He is writing seven volumes about it.",
    "A black cat crossed the street twice, exactly the same way. Nothing else seemed wrong.",
    "A gentleman with a very small moustache stole a bread roll and did a little dance with it.",
    "A child claims a man offered him an offer he could not refuse: a sou for a pear.",
    "Monsieur Eiffel reports that someone has again tried to buy his tower. It is not for sale.",
    "A young woman in glass slippers left one on the stairs at midnight. Kept at the desk.",
    "An inventor reports his flying machine flew. The complaint is from the neighbour whose roof it met.",
    "A man shouted that he was the king of the world from the bow of a barge on the Seine.",
    "Three musketeers refused to pay for four meals. One for all, they said.",
    "Madame Curie reports that her notebook glows in the dark. No crime, but the constable was nervous.",
    "A gentleman in a bowler hat insists this is not a pipe. The pipe was stolen.",
    "A sailor asked for a bigger boat after seeing a fish in the Tuileries pond.",
    "A tourist from Kansas lost her dog and her way. She keeps repeating there is no place like home.",
    "A man knocked on every door in the street asking whether anyone had seen Waldo.",
    "A wig was taken off the head of a judge in broad daylight. The judge saw nothing.",
    "A painter from Malaga complains the police have made his portrait look too much like a person.",
    "An umbrella went missing. The owner is certain it will rain as soon as he says so.",
    "A tenant has been playing the same four notes on the piano since Tuesday.",
    "Winter is coming, says the coal merchant, who wants his unpaid bill settled first.",
    "A clown was reported for frightening the pigeons. The pigeons have declined to press charges.",
    "A man tried to pay for his soup with a banknote from the year 2000.",
    "A gentleman with a lightsabre, he said, cut a baguette in half. It was a cane.",
    "Mademoiselle Chanel reports a black dress stolen. She says a simple one will do, and has already cut another.",
    "A bicycle vanished outside a cafe. The owner keeps asking: where is my mind.",
    "Somebody painted a moustache on a portrait of a lady in the Louvre. Again.",
    "A man insists he saw a train arrive at the station and that the audience ran away screaming.",
    "A goose escaped from Les Halles and has taken over the Pont Neuf. It is winning.",
    "Two gentlemen settled a duel with scissors and paper. Nobody chose rock.",
    "Monsieur Verne reports he has been around the world in eighty days and would like his deposit back.",
    "A man keeps asking the time and replying himself: it is later than you think.",
    "A trunk of left boots was found. The right boots are being sought separately.",
    "A lady reports her parrot now says only one thing, which the constable declined to write down.",
    "A street singer was told this was fine by a dog sitting in a burning cafe.",
    "A delivery of snails escaped. The owner reports they were last seen very near.",
    "A mime was arrested for disturbance. He has refused to say a word in his defence.",
    "Someone swapped all the numbers on the doors of a staircase. Postmen in despair.",
    "A man in a tin suit asked for oil and a heart. Sent to the Prefecture of Kansas.",
    "A houseboat was lost at sea. It was moored in the Canal Saint-Martin.",
    "No witness. The reporting party asks us to keep calm and carry on.",
    "A pickpocket returned a wallet, apologised, and took the umbrella instead.",
    # video games
    "A plumber in red overalls jumped on every mushroom at Les Halles. He says the princess is in another castle.",
    "An old man in a cave gave a boy a sword, saying it is dangerous to go alone. Sword confiscated.",
    "A baker reports that the cake in his window is a lie. It is plaster. The customer wants his sou back.",
    "A blue hedgehog ran through the Tuileries in a great hurry, collecting gold coins.",
    "Crates fell from a cart in odd shapes and fitted perfectly into a gap. The whole row vanished.",
    "A man in a white jacket shouted Hadouken at a street lamp. The lamp is unharmed.",
    "An aviator was told to do a barrel roll over the Champ de Mars. He did two.",
    "A round yellow gentleman ate every cherry at the market and fled from four ghosts.",
    "A soldier shouted Leeroy Jenkins and charged a pastry shop alone. The pastry shop won.",
    "A man with a cardboard box over his head crept past the guard. The guard saw a box.",
    # Kaamelott
    "A knight named Perceval counted the missing forks: one, two, three, fourteen. C'est pas faux, he says.",
    "A gentleman named Karadoc refused to make a statement before he had eaten. Le gras, c'est la vie.",
    "Six knights held a round table at a brasserie for six hours and ordered one soup between them.",
    "A man in armour asked every passer-by for the Graal. He was sent to the Bon Marche, second counter on the left.",
    "A Welshman painted Pays de Galles independant on the Pont Alexandre III. Twice.",
    "A cook swears someone breathed on his compote. Faut pas respirer la compote, ca fait tousser.",
    "Two knights argued for an hour about the word cuillere. Nobody was hurt, but a fork was bent.",
    "A king complains that his knights say Sire, Sire, and then nothing at all. Filed out of pity.",
    "A lady rose out of the Seine and asked the way to Brittany. The bargeman has taken the pledge.",
    "A druid brewed something that turned the concierge's cat green. The cat is proud of it.",
]
INTERVIEW_TEXT = [
    "I saw nothing, monsieur. I was asleep, and dreaming of a much better hotel.",
    "Frankly, my dear inspector, I do not give a damn. I was playing cards.",
    "I see dead people, monsieur. Mostly the guests at breakfast.",
    "Houston? Who is Houston? I have a problem, yes: my soup is cold.",
    "Here is looking at you, monsieur. And no, I did not look at anything else.",
    "I was at the Moulin Rouge until the can-can ended. Then I was at the Moulin Rouge until it started again.",
    "Elementary, inspector. It was the butler. We do not have a butler.",
    "Show me the money and I will show you my memory. No? Then I remember nothing.",
    "I heard a dog barking. Then a second dog. Then they were both barking at me.",
    "Monsieur Houdini stayed in my room last week. I have not found the door since.",
    "To the Opera and beyond, monsieur. I sleep through the second act, always.",
    "May the force of the law be with you. It was not with me: somebody drank my cognac.",
    "I only saw a man eating a very large sandwich. It is not a crime, I hope?",
    "One does not simply walk into the Ritz after midnight, monsieur. I tried.",
    "I was reading Monsieur Leroux's new mystery. The yellow room was locked. So was mine.",
    "Say hello to my little friend, monsieur. He is a poodle. He saw nothing either.",
    "I was counting the stars from the roof with Monsieur Flammarion. We got to eleven.",
    "The butler did it, the gardener did it, my mother-in-law did it. Pick one.",
    "I was on the telephone all night. Nobody answered. It is a new invention.",
    "You talking to me? You talking to me? Then I was in bed, monsieur.",
    "Keep your friends close and your umbrellas closer. Mine was stolen in May.",
    "It is not a bug, monsieur, it is a feature of the building. The pipes sing at night.",
    "I asked the cat. The cat looked at me as if I were the suspect.",
    "Life is like a box of bonbons, monsieur. Mine was empty before I arrived.",
    "I was dancing the tango with a Brazilian aviator. He says he flew first. The Americans disagree.",
    "I heard someone humming. Very badly. It may have been me.",
    "There is no spoon, monsieur. The Ritz has three hundred of them and I counted.",
    "Nobody expects a witness to see anything. I did not disappoint.",
    "I woke up, I checked my watch, I went back to sleep. A perfect night.",
    "I was writing postcards to my aunt in Lyon. Eleven. She never replies.",
    "Monsieur Picasso was drawing on the tablecloth again. The waiter wants it framed.",
    "I had a ticket for the Titanic last month and missed the boat. Best mistake of my life, monsieur.",
    "The only thing I saw was a very tall hat. The man under it was very short.",
    "I was at the cinematograph. A train came straight at us. I have not recovered.",
    "Winter is not coming, monsieur, it is May. I was on the terrace.",
    "I told the constable everything and the constable told me to go home. So I went home.",
    "I was trying to teach my parrot to say Vive la Republique. It prefers something shorter.",
    "Nothing to report. I have not been this bored since the Exposition of 1900.",
    "I saw a man with a moustache. Then a woman with a moustache. It was a very strange party.",
    "Ask my lawyer. My lawyer says ask my wife. My wife says ask my lawyer.",
    "I had one job, monsieur: to wake the gentleman in the morning. I overslept.",
    "Bond, Jean Bond. I was stirring, not shaking, a very quiet drink at the bar.",
    # video games
    "I used to be a night porter like you, monsieur. Then I took an arrow to the knee.",
    "Hey, listen! Hey! That is all my neighbour's canary says, monsieur, all night long.",
    "Stay a while and listen, inspector. No? Nobody ever stays.",
    "All your base are belong to us, the telegram said. My cousin cannot spell.",
    "Up, up, down, down, left, right, left, right. That is how I climb the stairs after champagne.",
    "War never changes, monsieur. Neither does the soup here.",
    "Would you kindly stop asking me questions? Ah. That one I cannot refuse.",
    "Finish him, the crowd shouted at the boxing. I finished my drink instead.",
    "Snake? Snake?! No, monsieur, it was a garden hose. I screamed anyway.",
    "Press F to pay respects, the waiter said. I do not know where F is. I paid in francs.",
    # Kaamelott
    "C'est pas faux, monsieur. I did not understand the question, but c'est pas faux.",
    "On en a gros, inspector. That is the whole of my statement.",
    "I do not talk before I eat, monsieur. Come back after the cheese.",
    "C'est pas moi qui explique mal, monsieur. It is the others who listen badly.",
    "Sire, Sire! Oh, pardon, you are an inspector. It is the hat.",
    "I was looking for the Graal all night. I found a very nice cheese instead.",
    "Le gras, c'est la vie. I was in the kitchen, monsieur, the whole night.",
    "My friend Perceval says it happened at three o'clock or at fourteen. He counts in his own way.",
    "At our round table nobody listens, monsieur, so I came here to be ignored professionally.",
    "Pays de Galles independant! Pardon, monsieur, it slips out when I am tired.",
]


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
    """Noise ids start at 100 in every table and skip the reserved planted ids (scatter_planted mixes them later)."""
    c = conn.cursor()
    c.executemany("INSERT INTO suite VALUES (?,?,?)",   # x01-x10 face the Place, x11-x25 the garden, the rest the courtyard
        [(s, s // 100, "Place Vendome" if s % 100 <= 10 else "garden" if s % 100 <= 25 else "courtyard") for s in SUITES])
    c.executemany("INSERT INTO address VALUES (?,?,?,?)",
        [(100 + i, r.randint(1, 120), r.choice(STREETS), r.randint(1, 20)) for i in range(1200)])
    c.executemany("INSERT INTO person VALUES (?,?,?,?,?,?)",
        [(100 + i, _name(r), r.choice(NATION), r.randint(1840, 1894), r.choice(OCCUP),
          r.randint(100, 1299)) for i in range(5000)])
    reserved = {V["report_id"]}
    hotels = ["Hotel Ritz", "Hotel Meurice", "Grand Hotel"]
    c.executemany("INSERT INTO police_report VALUES (?,?,?,?,?,?)",
        [(i, _date(r, 5, 5) if r.random() < 0.35 else _date(r), "Paris",
          r.choice(hotels) if r.random() < 0.2 else r.choice(PLACES + hotels),
          r.choice(TYPES), r.choice(REPORT_TEXT))
         for i in range(100, 3100) if i not in reserved])
    # hotel: 200 suites (x01-x40 on 5 floors), back-to-back stays through Jan-Jun; floor = suite // 100
    rows, rid = [], 100
    for suite in SUITES:
        day = _add_days(19120101, r.randint(0, 9))   # each suite opens on its own day
        while day < 19120630:
            # mostly short stays, now and then a fortnight; six nights (Blakeney's and Grey's weeks) is common too
            nights = r.choices(range(1, 15), [14, 16, 14, 10, 8, 9, 6, 3, 2, 2, 1, 1, 1, 2])[0]
            out = _add_days(day, nights)
            price = {1: 30, 2: 120, 3: 80, 4: 60, 5: 45}[suite // 100] + r.randint(0, 25)
            if suite // 100 == 2 and r.random() < 0.15:   # a gala week on the second floor: dearer than Ashcombe's 190,
                price = r.randint(195, 260)               # so ch2's ORDER BY price needs the date filter too
            rows.append((rid, r.choice(GUESTS), suite, suite // 100, price, day, out))
            rid += 1
            day = _add_days(out, r.choices([0, 1, 2, 3, 5, 8, 12], [40, 20, 12, 10, 8, 6, 4])[0])   # empty nights between guests
    c.executemany("INSERT INTO hotel_register VALUES (?,?,?,?,?,?,?)", rows)
    c.executemany("INSERT INTO interview VALUES (?,?,?,?)",
        [(100 + i, r.choice(GUESTS), _date(r, 5, 5), r.choice(INTERVIEW_TEXT)) for i in range(600)])
    plates = ["75-%04d" % r.randint(1000, 9999) for _ in range(400)] + \
             ["%s%03d" % (V["plate_prefix"], r.randint(100, 999)) for _ in range(40)]
    plates = [p for p in plates if p != V["plate"]]
    # fares are mostly in francs; tourists pay a coin or two of their own (the ch3 cab is paid in pounds)
    cur = lambda: r.choices(["franc", "pound", "dollar", "mark"], [94, 3, 2, 1])[0]
    c.executemany("INSERT INTO cab_ride VALUES (?,?,?,?,?,?,?,?)",
        [(100 + i, r.choice(plates), _date(r, 5, 5), _time(r), r.choice(PLACES),
          "%d %s" % (r.randint(1, 120), r.choice(STREETS)), *((r.randint(2, 15), "franc") if k == "franc" else (r.randint(1, 3), k)))
         for i, k in ((i, cur()) for i in range(20000))])
    acct_ids = [i for i in range(100, 4100) if i not in (V["fence_account"], V["shell_account"])]
    c.executemany("INSERT INTO bank_account VALUES (?,?,?)",
        [(i, None if r.random() < 0.05 else r.randint(100, 5099),   # ~5% bearer accounts: no owner, like the shells
          r.choice(["Credit Lyonnais", "Societe Generale", "Banque de Paris", "Comptoir National"]))
         for i in acct_ids])
    c.executemany("INSERT INTO bank_transaction VALUES (?,?,?,?,?,?)",
        [(100 + i, r.choice(acct_ids), r.choice(acct_ids), _date(r), r.randint(5, 900),
          r.choice(["transfer", "cheque", "deposit"])) for i in range(30000)])
    c.executemany("INSERT INTO telegram VALUES (?,?,?,?,?,?,?,?)",
        [(i, r.choice(["Ritz", "Bourse", "Gare du Nord", "Opera", "Central"]), _date(r, 5, 5), _time(r),
          r.choice(GUESTS), r.choice(GUESTS), None, " ".join(r.choice(TEL_WORDS) for _ in range(r.randint(4, 9))))
         for i in range(100, 3100) if i not in (V["night_telegram_id"], V["compete_telegram_id"])])
    c.executemany("INSERT INTO room_service VALUES (?,?,?,?,?,?)",
        [(100 + i, r.choice(SUITES), _date(r, 5, 5), _time(r), *r.choice(ITEMS)) for i in range(5000)])
    c.executemany("INSERT INTO train_ticket VALUES (?,?,?,?,?)",
        [(100 + i, r.randint(100, 5099), _date(r, 5, 6), r.choice(["Boat Train 9:15", "Nord Express", "Sud Express", "Orient Express"]),
          r.choice(["London", "Berlin", "Madrid", "Vienna", "Calais", "Lille"])) for i in range(2000)])
    c.executemany("INSERT INTO luggage VALUES (?,?,?,?,?)",
        [(100 + i, r.randint(100, 2099), "%s-%d" % (r.choice("ABCD"), r.randint(1, 9)), r.choice(GUESTS), r.randint(8, 60))
         for i in range(3000)])
    c.executemany("INSERT INTO lift_log VALUES (?,?,?,?,?,?)",
        [(100 + i, _date(r, 5, 5), _time(r), s // 100, s, r.choice(["up", "down"]))
         for i, s in ((i, r.choice(SUITES)) for i in range(10000))])
    conn.commit()


CAST_PERSONS = [  # id, name, nationality, born, occupation  (address_id set in plant_part1)
    (1, "Lord Ashcombe", "English", 1861, "peer"),
    (2, "Paul Sernine", "French", 1874, "rentier"),
    (3, "Horace Velmont", "French", 1870, "painter"),
    (4, "Raul Ortega", "Argentine", 1868, "cattle baron"),
    (5, "Ines de Almagro", "Spanish", 1879, None),
    (6, "Rupert Blakeney", "English", 1872, "gentleman"),
    (7, "Ernest Grimaud", "French", 1858, "jeweller"),
    (8, "Marcel Duroc", "French", 1880, "night porter"),
    (9, "Comtesse de Cagliostro", "Italian", 1875, None),
    (10, "Mr. Grey", "English", 1872, "gentleman"),
    (11, "Ganimard", "French", 1855, "inspector"),
    (12, "Minou Ganimard", "French", 1908, "cat"),
]
SUITES = [f * 100 + n for f in range(1, 6) for n in range(1, 41)]   # the hotel: 200 suites, floor = suite // 100
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
    # --- compete ch5: a second address, a second jeweller (name is noise-safe, see COMPETE_FENCE_NAMES)
    c.execute("UPDATE address SET number = number + 200 WHERE number=? AND street=?",
              (V["compete_fence_number"], V["compete_fence_street"]))
    c.execute("INSERT INTO address VALUES (2,?,?,9)", (V["compete_fence_number"], V["compete_fence_street"]))
    c.execute("INSERT INTO person VALUES (18,?,?,?, 'jeweller', 2)",
              (V["compete_fence_name"], r.choice(NATION), r.randint(1850, 1890)))
    for i in range(4):
        c.execute("INSERT INTO person VALUES (?,?,?,?,?,2)",
                  (19 + i, _name(r), "French", r.randint(1850, 1890), r.choice(["clerk", "seamstress", "waiter", "student"])))
    # --- ch1: the report (no noise theft at the Ritz that day)
    c.execute("DELETE FROM police_report WHERE place='Hotel Ritz' AND date=? AND type='theft'", (T,))
    c.execute("INSERT INTO police_report VALUES (?,?,?,?,?,?)",
        (V["report_id"], T, "Paris", "Hotel Ritz", "theft",
         "Sapphire known as the Blue Star taken from the second-floor suite of the Comtesse de Cagliostro. "
         "Night porter {porter} heard the lift at 02:10. The thief came over the balcony of the "
         "neighbouring suite, the most expensive one on the floor. A calling card signed A. L. on the pillow.".format(**V)))
    c.execute("INSERT INTO interview VALUES (2,?,?,?)", ("Marcel Duroc", T,
        "I was in the lobby the whole night of the 17th, monsieur, and I heard the lift at ten past two. "
        "Past midnight, so write the 18th of May, as the inspector likes things exact."))
    # decoy Ritz reports: the eve (a student who files the night under the 17th), the same day, the same week
    c.execute("INSERT INTO police_report VALUES (4,?,?,?,?,?)", (E, "Paris", "Hotel Ritz", "theft",
        "A bottle of Pommery 1906 taken from a room-service trolley on the first floor. Drunk on the spot, by the smell."))
    c.execute("INSERT INTO police_report VALUES (5,?,?,?,?,?)", (T, "Paris", "Hotel Ritz", "disturbance",
        "A guest sang in the bath until the small hours. The guest is a tenor. The complaint is from a baritone."))
    c.execute("INSERT INTO police_report VALUES (6,19120516,'Paris','Hotel Ritz','fraud',?)",
        ("A gentleman paid his bar bill with a cheque drawn on the Bank of Monte Carlo. There is no such bank.",))
    c.execute("INSERT INTO police_report VALUES (?,?,?,?,?,?)", (3500, 19120503, "Paris", "Hotel Ritz", "lost property", "Umbrella, black, with a duck's head. Reported by a Senora."))
    c.execute("INSERT INTO police_report VALUES (?,?,?,?,?,?)", (3600, 19120611, "Paris", "Hotel Ritz", "theft", "Silver spoon. The guest denies everything and keeps the spoon."))
    # the Comtesse, sapphires and a Blue Star appear elsewhere too, so a LIKE search on them is no shortcut to the report
    for rid, d, place, typ, text in [
            (3700, 19120503, "Hotel Ritz", "lost property", "A pair of gloves left by the Comtesse de Cagliostro in the Salon d'Ete. Returned with thanks."),
            (3710, 19120519, "Hotel Ritz", "theft", "A paste copy of the Blue Star, the Cagliostro sapphire, taken from a jeweller's case in the lobby."),
            (3720, 19120522, "Opera", "theft", "A sapphire ring taken from a box at the Opera. The owner suspects her husband."),
            (3730, 19120601, "Hotel Meurice", "fraud", "A man sells the Blue Star at a tenth of its price. He has sold it three times this week."),
            (3740, 19120509, "Grand Hotel", "disturbance", "A racehorse named Blue Star was led through the lobby. The owner insists it had a reservation."),
            (3750, 19120527, "Hotel Ritz", "lost property", "The Comtesse de Cagliostro reports a lost fan. Found in her own suite, under a calling card."),
            # and so do the report's own words (balcony, porter, lift, A. L., Duroc), so LIKE on them is no shortcut either
            (3760, 19120517, "Hotel Ritz", "theft", "The night porter reports a ham taken from a second-floor balcony. A cat is suspected."),
            (3770, 19120516, "Hotel Ritz", "theft", "A silk glove taken from the lift at ten past two. Marked A. L. in red thread."),
            (3780, 19120519, "Hotel Ritz", "theft", "Mme Duroc, laundress, reports a pillowcase taken from her cart. A calling card was left in its place."),
            (3790, 19120517, "Hotel Ritz", "theft", "A card case taken from the cloakroom. The calling cards inside were signed A. L. and are worthless."),
            (3800, 19120602, "Hotel Ritz", "disturbance", "A guest rang for the lift forty times in one night. The night porter wishes to be transferred.")]:
        c.execute("INSERT INTO police_report VALUES (?,?,?,?,?,?)", (rid, d, "Paris", place, typ, text))
    # --- compete ch1: a second, fixed decoy report at a different hotel/date/type, random id per season
    c.execute("DELETE FROM police_report WHERE place='Hotel Meurice' AND date=19120611 AND type='burglary'")
    c.execute("INSERT INTO police_report VALUES (?,19120611,'Paris','Hotel Meurice','burglary',?)",
        (V["compete_report_id"],
         "The night manager reports a window forced on the cheapest room on the second floor; nothing else taken."))
    c.execute("INSERT INTO interview VALUES (3,?,?,?)", ("the Meurice night manager", 19120611,
        "I was on duty the whole night, monsieur, and found the window forced myself, "
        "at four in the morning on the 11th of June."))
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
    c.execute("DELETE FROM cab_ride WHERE date=? AND currency='pound' AND plate LIKE ?", (T, V["plate_prefix"] + "%"))
    # decoys: same prefix that night elsewhere in francs, and paid in pounds from Vendome the evening before
    c.execute("INSERT INTO cab_ride VALUES (2,?,?,140,'Opera',?,5,'franc')", (V["plate_prefix"] + "107", T, "3 rue Blanche"))
    c.execute("INSERT INTO cab_ride VALUES (3,?,?,2310,'Place Vendome',?,1,'pound')", (V["plate_prefix"] + "290", E, "9 rue Royale"))
    # --- compete ch3: same construct (LIKE), a different cab, identified by where it dropped, not where it was hailed
    c.execute("INSERT INTO interview VALUES (4,?,?,?)", ("the rival despatcher", T,
        "One of our drivers dropped a fare at Gare Saint-Lazare that night. He swears the plate "
        "began with {compete_plate_prefix}, the rest he never wrote down.".format(**V)))
    c.execute("INSERT INTO cab_ride VALUES (4,?,?,320,'Opera','Gare Saint-Lazare',6,'franc')", (V["compete_plate"], T))
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
        fare = (1, "pound") if d == T else (r.randint(2, 12), "franc")   # the night ride: the English coins
        c.execute("INSERT INTO cab_ride VALUES (?,?,?,?,?,?,?,?)", (10 + i, V["plate"], d, t, pick or r.choice(PLACES), drop, *fare))
    # --- compete ch4: a second cab's week, three drops at a second fence's address, two at Gare de Lyon
    #     (a PLACES name, never produced by fill_noise's dropoff generator, so it cannot collide)
    rides_c = [(V["compete_fence_address"], T, 300), (V["compete_fence_address"], 19120514, 1100),
               (V["compete_fence_address"], 19120516, 900),
               ("Gare de Lyon", 19120515, 1000), ("Gare de Lyon", 19120517, 1600)]
    for i, (drop, d, t) in enumerate(rides_c):
        c.execute("INSERT INTO cab_ride VALUES (?,?,?,?,?,?,?,?)", (5 + i, V["compete_plate"], d, t, r.choice(PLACES), drop, r.randint(2, 12), "franc"))
    # --- ch6: the fence pays his thief in three pieces, and the most of anyone paid in three. Decoys: the biggest
    #     single cheque (one payment), the biggest total (a weekly supplier, four payments), and another account paid
    #     in three small pieces. Decoy accounts are above 4000: the fence's noise payments never reach them.
    def fence_payments(account, shell, first_id, split, bank, decoys):
        c.execute("INSERT INTO bank_account VALUES (?,NULL,?)", (shell, bank))
        cheque, supplier, craftsman = decoys
        tx = [(shell, 19120519, split[0]), (shell, 19120520, split[1]), (shell, 19120521, split[2]),
              (cheque, 19120510, round(sum(split) * 0.625, -3))]
        tx += [(supplier, d, round(sum(split) * 0.3, -3)) for d in (19120504, 19120511, 19120518, 19120525)]
        tx += [(craftsman, d, a) for d, a in ((19120503, 2000), (19120514, 3000), (19120527, 2500))]
        for i, (cp, d, amt) in enumerate(tx):
            c.execute("INSERT INTO bank_transaction VALUES (?,?,?,?,?,'transfer')", (first_id + i, account, cp, d, amt))
        return first_id + len(tx)
    c.execute("INSERT INTO bank_account VALUES (?,7,'Credit Lyonnais')", (V["fence_account"],))
    decoys = [i for (i,) in c.execute("SELECT id FROM bank_account WHERE id > 4000 ORDER BY id LIMIT 6")]
    nxt = fence_payments(V["fence_account"], V["shell_account"], 1, (15000, 15000, 10000), "Credit Lyonnais", decoys[:3])
    for i in range(20):
        c.execute("INSERT INTO bank_transaction VALUES (?,?,?,?,?,'transfer')",
                  (nxt + i, V["fence_account"], r.randint(100, 4000), _date(r, 5, 5), r.randint(50, 900)))
    # --- compete ch6: a second fence, a second shell account, the same three decoys
    c.execute("INSERT INTO bank_account VALUES (?,18,'Societe Generale')", (V["compete_fence_account"],))
    fence_payments(V["compete_fence_account"], V["compete_shell_account"], 60, (12000, 12000, 9000), "Societe Generale", decoys[3:])
    # --- ch7: telegrams from the Ritz desk on the 18th.
    # Every Ritz wire of the 18th is planted, so the box counts are exact. Lupin's wire is in the AFTERNOON (15:10;
    # Saturday, the races at Longchamp: the quietest box, 36 wires), not at night, so guessing "a thief wires at night"
    # fails. Night 46 (45 initialled wires paid at the desk, no suite, so ch11 is untouched, and an R. lookalike at
    # 03:30), morning 48 (Ortega's own R. at 06:20), evening 44 (another R. lookalike at 21:05). The lookalikes read like
    # Lupin's (payment received, a drink, "first order before dawn"), so neither the hour nor the text gives his away:
    # only counting the boxes does.
    c.execute("DELETE FROM telegram WHERE office='Ritz' AND date=?", (T,))
    c.execute("INSERT INTO telegram VALUES (?,?,?,?,?,?,?,?)",
        (V["night_telegram_id"], "Ritz", T, 1510, "R.", "Poste restante, Paris",   # no account, no E. G.: chapters 5-6
         None, "PAYMENT RECEIVED STOP {champagne} AS ALWAYS MY FIRST ORDER BEFORE DAWN STOP R".format(**V).upper()))   # would name it
    def clock(h0, h1):
        return r.randint(h0, h1 - 1) * 100 + r.randint(0, 59)
    places = ["Ritz, London", "Charvet, Place Vendome", "Halles, Pavillon 9", "Mme Duroc, Pantin", "Hotel de Paris, Monte Carlo",
              "Savoy, London", "Credit Lyonnais, Lyon", "Gare de Lyon, Paris", "Negresco, Nice", "Adlon, Berlin",
              "Waldorf-Astoria, New York", "Le Figaro, Paris", "Maxim's, Paris", "Opera, Vienna"]
    initials = [ch + "." for ch in "BCDEFGHJKLMNPSTVW"]
    for i in range(45):
        who = r.choice(initials)
        c.execute("INSERT INTO telegram VALUES (?,?,?,?,?,?,?,?)", (20 + i, "Ritz", T, clock(0, 6), who, r.choice(places), None,
                  " ".join(r.choice(TEL_WORDS) for _ in range(r.randint(3, 6))) + " STOP " + who[0]))
    for i, (t, drink) in enumerate(((330, "POMMERY 1906"), (2105, "KRUG 1904"))):   # R. lookalikes in other boxes
        c.execute("INSERT INTO telegram VALUES (?,?,?,?,?,?,?,?)", (66 + i, "Ritz", T, t, "R.", "Poste restante, Paris", None,
                  "PAYMENT RECEIVED STOP %s AS ALWAYS MY FIRST ORDER BEFORE DAWN STOP R" % drink))
    k = 0
    for h0, h1, n in ((6, 12, 47), (12, 18, 35), (18, 24, 43)):
        for _ in range(n):
            t = clock(h0, h1)
            while t in (620, 1510, 2105):
                t = clock(h0, h1)
            c.execute("INSERT INTO telegram VALUES (?,?,?,?,?,?,?,?)",
                (5000 + k, "Ritz", T, t, r.choice(GUESTS), r.choice(GUESTS), r.choice(SUITES),
                 " ".join(r.choice(TEL_WORDS) for _ in range(6))))
            k += 1
    for i in range(8):
        c.execute("INSERT INTO telegram VALUES (?,?,?,?,?,?,?,?)",
                  (80 + i, r.choice(["Bourse", "Gare du Nord", "Opera", "Central"]), _date(r, 5, 5), clock(8, 20),
                   r.choice(GUESTS), r.choice(GUESTS), None,
                   "PAYMENT TO %d RECEIVED STOP %s STOP" % (r.randint(10000, 99999), " ".join(r.choice(TEL_WORDS) for _ in range(3)))))
    # Ortega signs with an R too: his wire leaves the same desk at 06:20, morning by Ganimard's clock (ch7 decoy)
    c.execute("INSERT INTO telegram VALUES (7,'Ritz',?,620,'R.','Estancia Ortega, Buenos Aires',?,'SELL THE HERD STOP BUY WHEAT STOP R')",
              (T, V["ortega_suite"]))
    # --- compete ch7: a second office. Its quietest box is the evening (one wire, the broker's at 19:30); the
    #     broker also wired at 17:45, in the afternoon. Every Bourse wire of the day is planted, so the counts are exact.
    c.execute("DELETE FROM telegram WHERE office='Bourse' AND date=?", (T,))
    c.execute("INSERT INTO telegram VALUES (?,?,?,?,?,?,?,?)",
        (V["compete_telegram_id"], "Bourse", T, 1930, "A Broker", "A Client", None,
         "SHARES SOLD STOP PROCEEDS TO FOLLOW STOP COFFEE BEFORE THE OPENING BELL AS ALWAYS STOP"))
    bourse = [(210, "A Clerk"), (330, "A Clerk"), (520, "A Porter"), (905, "A Jobber"), (930, "A Jobber"), (1010, "A Clerk"),
              (1045, "A Jobber"), (1130, "A Clerk"), (1215, "A Jobber"), (1400, "A Clerk"), (1530, "A Jobber"), (1745, "A Broker")]
    for i, (t, who) in enumerate(bourse):
        c.execute("INSERT INTO telegram VALUES (?,?,?,?,?,?,?,?)",
                  (88 + i, "Bourse", T, t, who, "A Client", None,
                   "SHARES BOUGHT STOP PAYMENT TO FOLLOW STOP TEA BEFORE THE OPENING BELL AS ALWAYS STOP" if who == "A Broker"
                   else " ".join(r.choice(TEL_WORDS) for _ in range(5))))   # the broker's decoy reads like his real wire
    # --- ch8: room service on the 18th; Ortega's suite orders coffee first
    c.execute("DELETE FROM room_service WHERE date=? AND time<600", (T,))
    rs = [(V["lupin_suite"], 320, V["champagne"], 40), (V["lupin_suite"], 900, "coffee", 2),
          (V["ortega_suite"], 240, "coffee", 2), (V["ortega_suite"], 300, V["champagne"], 40),   # earliest champagne, not his first
          (V["neighbour_suite"], 730, V["champagne"], 40), (305, 1300, V["champagne"], 40)]
    for i, (s, t, item, amt) in enumerate(rs):
        c.execute("INSERT INTO room_service VALUES (?,?,?,?,?,?)", (1 + i, s, T, t, item, amt))
    # --- compete ch8: same RANK() construct, rank 2 instead of rank 1, a suite with no other room_service that day
    c.execute("DELETE FROM room_service WHERE suite=? AND date=?", (others[0], T))
    c.execute("INSERT INTO room_service VALUES (7,?,?,150,'tea',2)", (others[0], T))
    c.execute("INSERT INTO room_service VALUES (8,?,?,220,'coffee',2)", (others[0], T))
    V["compete_suite8"] = others[0]
    V["velmont_suite"] = others[1]
    conn.commit()


def plant_part2(conn, V, r):
    c = conn.cursor()
    T = V["theft_date"]
    # --- the Part II code, hidden in a noise telegram (Egg Hunter)
    c.execute("INSERT INTO telegram VALUES (9001,'Central',19120519,1512,'A. L.','TO THE CURIOUS CLERK',NULL,?)",
              ("%s STOP THE CODE IS THE FIRST FOUR WORDS STOP" % V["part2_code"],))
    # --- ch9: Ashcombe's trunks. Seven under his three tickets; one under a ticket bought for cash by an
    #     unnamed regular (so chapter 10 has to deduce Mr. Grey from the register, not read him here).
    c.execute("INSERT INTO train_ticket VALUES (1,1,19120519,'Boat Train 9:15','London')")
    c.execute("INSERT INTO person VALUES (17,'Unknown gentleman (paid cash)','English',NULL,NULL,NULL)")
    c.execute("INSERT INTO train_ticket VALUES (2,17,19120519,'Boat Train 9:15','London')")
    c.execute("INSERT INTO train_ticket VALUES (3,1,19120519,'Boat Train 9:15','London')")   # his valet's, bought in his name
    c.execute("INSERT INTO train_ticket VALUES (4,1,19120519,'Boat Train 9:15','London')")   # his maid's, the same
    labels = ["A-%d" % k for k in range(1, 9) if "A-%d" % k != V["trunk_no"]][:7]   # no gap in the numbering, no odd weight
    for i, trunk in enumerate(labels):   # split 3 / 3 / 1 over his three tickets: a trunk alone on its ticket is no tell
        c.execute("INSERT INTO luggage VALUES (?,?,?,'Lord Ashcombe',?)", (1 + i, (1, 1, 1, 3, 3, 3, 4)[i], trunk, r.randint(24, 38)))
    c.execute("INSERT INTO luggage VALUES (9,2,?,'Lord Ashcombe',?)", (V["trunk_no"], r.randint(24, 38)))
    # --- ch10: Blakeney and Mr. Grey alternate weeks Jan-Apr in the same suite, never overlapping.
    #     Two suspects, Almagro and Sernine, are regulars too: they stay only in Grey's weeks, plus one single
    #     night inside a Blakeney week (11 January), so they crossed him once.
    c.execute("DELETE FROM hotel_register WHERE suite=? AND checkin<19120515", (V["lupin_suite"],))
    day, rid, who = 19120106, 20000, 0
    names = ["Rupert Blakeney", "Mr. Grey"]
    grey_suites = [s for s in (216, 220, 222, 224) if s not in (V["lupin_suite"], V["neighbour_suite"], V["ortega_suite"])]
    while day < 19120501:
        out = _add_days(day, 6)
        if who == 0:   # Blakeney, always in his suite
            c.execute("INSERT INTO hotel_register VALUES (?,?,?,2,150,?,?)", (rid, "Rupert Blakeney", V["lupin_suite"], day, out))
        else:          # Grey, a different suite each time (so the suite is no shortcut); a noise guest takes 214
            s2 = grey_suites[(rid // 2) % len(grey_suites)]
            c.execute("DELETE FROM hotel_register WHERE suite=? AND checkin<? AND checkout>?", (s2, out, day))
            c.execute("INSERT INTO hotel_register VALUES (?,?,?,2,?,?,?)", (rid, "Mr. Grey", s2, r.randint(121, 145), day, out))
            rid += 1
            c.execute("INSERT INTO hotel_register VALUES (?,?,?,2,145,?,?)", (rid, r.choice(GUESTS), V["lupin_suite"], day, out))
        rid += 1; who ^= 1; day = _add_days(day, 7)
    def book(rid, name, suite, price, day, out):   # a planted stay: whoever the noise had put in that suite then leaves
        c.execute("DELETE FROM hotel_register WHERE suite=? AND checkin<? AND checkout>?", (suite, out, day))
        c.execute("INSERT INTO hotel_register VALUES (?,?,?,?,?,?,?)", (rid, name, suite, suite // 100, price, day, out))
    for i, name in enumerate(["Ines de Almagro", "Paul Sernine"]):
        d = 19120113 + i     # Grey's weeks start on the 13th
        for k in range(7):
            book(rid, name, 301 + i, 80, d, _add_days(d, 4)); rid += 1
            d = _add_days(d, 14)
        book(rid, name, 301 + i, 80, 19120111, 19120112); rid += 1
    # noise guests are frequent too (few names, many stays): give every one that never met Blakeney one night that does
    ch10 = [ch for ch in plot.CHAPTERS if ch["n"] == 10][0]
    for k, (name,) in enumerate(c.execute(ch10["solution"].format(**V)).fetchall()):
        if name != V["double_alias"]:
            book(rid, name, 310 + k % 30, 80, 19120111, 19120112); rid += 1   # one suite each, never two guests at once
    # --- ch11: the night of the theft. Lupin's suite is silent 02:05-03:10 (lift down, lift up), then
    #     champagne at 03:20. Every other second-floor suite has a lift event
    #     inside the window, except Velmont's: he goes down at 02:30 to paint and comes back at 05:55, a longer
    #     silence than Lupin's but after the lift the porter heard.
    c.execute("DELETE FROM lift_log WHERE date=? AND time<600", (T,))
    c.execute("DELETE FROM telegram WHERE date=? AND time<600 AND suite IS NOT NULL AND id<>?", (T, V["night_telegram_id"]))
    c.execute("INSERT INTO lift_log VALUES (1,?,205,2,?,'down')", (T, V["lupin_suite"]))
    c.execute("INSERT INTO lift_log VALUES (2,?,310,2,?,'up')", (T, V["lupin_suite"]))
    lid = 10
    for t in (130, 230, 330):
        for s in FLOOR2:
            if s not in (V["lupin_suite"], V["velmont_suite"]):
                c.execute("INSERT INTO lift_log VALUES (?,?,?,2,?,?)", (lid, T, t, s, r.choice(["up", "down"]))); lid += 1
    near = [s for s in FLOOR2 if s not in (V["lupin_suite"], V["velmont_suite"])][:2]
    c.execute("INSERT INTO lift_log VALUES (92,?,208,2,?,'up')", (T, near[0]))
    c.execute("INSERT INTO lift_log VALUES (93,?,213,2,?,'down')", (T, near[1]))
    c.execute("INSERT INTO lift_log VALUES (90,?,230,2,?,'down')", (T, V["velmont_suite"]))
    c.execute("INSERT INTO lift_log VALUES (91,?,555,2,?,'up')", (T, V["velmont_suite"]))
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


def scatter_planted(conn, noise, r):
    """Planted rows go in with small ids (below 100), so SELECT * without WHERE would list the plot first.
    Swap each one with a random noise row from the middle of its table; foreign keys follow the swap.
    Ids pinned in V (above 100) are never touched, and nothing may name a planted row by a literal small id."""
    tables = [t for (t,) in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")]
    refs = {t: [] for t in tables}
    for t in tables:
        for fk in conn.execute("PRAGMA foreign_key_list(%s)" % t):
            refs[fk[2]].append((t, fk[3]))
    conn.commit()
    conn.execute("PRAGMA foreign_keys = OFF")   # the swap moves parent and children in three steps
    for t in tables:
        ids = {i for (i,) in conn.execute("SELECT id FROM %s" % t)}
        pool = sorted(ids & noise[t])
        pool = pool[len(pool) // 4: 3 * len(pool) // 4]
        for a in sorted(i for i in ids - noise[t] if i < 100):
            b = pool.pop(r.randrange(len(pool)))
            for x, y in ((a, -1), (b, a), (-1, b)):
                conn.execute("UPDATE %s SET id=? WHERE id=?" % t, (y, x))
                for rt, col in refs[t]:
                    conn.execute("UPDATE %s SET %s=? WHERE %s=?" % (rt, col, col), (y, x))
    conn.commit()
    conn.execute("PRAGMA foreign_keys = ON")
    assert not conn.execute("PRAGMA foreign_key_check").fetchall(), "scatter_planted broke a foreign key"


GUEST_DRINKS = ["absinthe, louched", "tea with three lumps", "hot chocolate", "Vichy water", "a Kir", "lemonade on ice",
                "green Chartreuse", "Calvados", "Byrrh", "cafe au lait", "any Bordeaux", "beer from Strasbourg", "barley water"]
GUEST_PETS = ["a parrot that swears in Latin", "a tortoise named Achille", "a greyhound afraid of pigeons", "two Siamese cats",
              "a goldfish in a travelling bowl", "none, but asks after yours", "a ferret, undeclared", "a canary that sings Offenbach",
              "a dachshund in a knitted jumper", "a hedgehog, for the garden", None]
GUEST_HABITS = ["counts the stairs out loud", "sleeps with the window open in January", "complains about the soup, then orders more",
                "writes to the newspapers", "whistles in the corridors", "reads the menu like a novel", "rearranges the furniture",
                "asks the time and argues with the answer", "keeps a diary in code", "brings his own teaspoon", "naps in the reading room"]
GUEST_REMARKS = ["Always settles. Eventually.", "Charming. Sings in the bath.", "Do not seat near the Baroness.",
                 "Tips the cat, not the staff.", "Has asked for the moon. Twice.", "No complaints. Suspicious.",
                 "Prefers the garden side.", "Never before noon.", "A delight, by all accounts but his own.", None]


def link_tables(conn, V, r):
    """The links between tables, added once every row is planted and the ids are final (after scatter_planted).
    Each is read from the data itself, so no puzzle changes: an interview's speaker, a cab's dropoff address, and a
    guest card (1:1 with a person; fun only, never a clue, and none for the cast)."""
    c = conn.cursor()
    # the hotel guests who talk to the police join the census (ids above the noise range)
    guest_id = {name: 6000 + i for i, name in enumerate(GUESTS)}
    homes = [a for (a,) in c.execute(   # any address but the two boarding houses, whose tenants ch5 counts (5)
        "SELECT id FROM address WHERE NOT (number=? AND street=?) AND NOT (number=? AND street=?) ORDER BY id",
        (V["fence_number"], V["fence_street"], V["compete_fence_number"], V["compete_fence_street"])).fetchall()]
    c.executemany("INSERT INTO person VALUES (?,?,?,?,?,?)",
        [(guest_id[n], n, r.choice(NATION), r.randint(1840, 1894), r.choice(OCCUP), r.choice(homes)) for n in GUESTS])
    c.execute("ALTER TABLE interview ADD COLUMN person_id INTEGER REFERENCES person(id)")
    for (iid, name) in c.execute("SELECT id, person_name FROM interview").fetchall():
        pid = guest_id.get(name) or c.execute("SELECT MIN(id) FROM person WHERE name=?", (name,)).fetchone()[0]
        c.execute("UPDATE interview SET person_id=? WHERE id=?", (pid, iid))   # unnamed witnesses stay NULL
    # every street dropoff points to an address row (created when the cab book names one the census does not have)
    c.execute("ALTER TABLE cab_ride ADD COLUMN dropoff_address_id INTEGER REFERENCES address(id)")
    known = {}
    for (aid, num, street) in c.execute("SELECT id, number, street FROM address ORDER BY id").fetchall():
        known.setdefault("%d %s" % (num, street), aid)
    nxt = c.execute("SELECT MAX(id) FROM address").fetchone()[0] + 1
    for (drop,) in c.execute("SELECT DISTINCT dropoff FROM cab_ride").fetchall():
        num, _, street = drop.partition(" ")
        if not num.isdigit():
            continue   # a station or a square: no address
        if drop not in known:
            c.execute("INSERT INTO address VALUES (?,?,?,?)", (nxt, int(num), street, r.randint(1, 20)))
            known[drop] = nxt; nxt += 1
        c.execute("UPDATE cab_ride SET dropoff_address_id=? WHERE dropoff=?", (known[drop], drop))
    # guest cards: one per hotel guest, 1:1 with the person (UNIQUE), fun only
    c.execute("CREATE TABLE guest_card (id INTEGER PRIMARY KEY, person_id INTEGER UNIQUE REFERENCES person(id), "
              "favourite_drink TEXT, pet TEXT, habit TEXT, desk_remark TEXT)")
    c.executemany("INSERT INTO guest_card VALUES (?,?,?,?,?,?)",
        [(100 + i, guest_id[n], r.choice(GUEST_DRINKS), r.choice(GUEST_PETS), r.choice(GUEST_HABITS), r.choice(GUEST_REMARKS))
         for i, n in enumerate(GUESTS)])
    conn.commit()


def clock_times(conn):
    """Planting works on HHMM integers (205 = 02:05); students read 'HH:MM' text, which still sorts and compares."""
    for (t, ddl) in conn.execute("SELECT name, sql FROM sqlite_master WHERE type='table' AND sql LIKE '% time INTEGER%'").fetchall():
        cols = [c[1] for c in conn.execute("PRAGMA table_info(%s)" % t)]
        conn.execute("ALTER TABLE %s RENAME TO %s_old" % (t, t))
        conn.execute(ddl.replace(" time INTEGER", " time TEXT"))
        conn.execute("INSERT INTO %s SELECT %s FROM %s_old" % (t, ", ".join(
            "printf('%02d:%02d', time / 100, time % 100)" if c == "time" else c for c in cols), t))
        conn.execute("DROP TABLE %s_old" % t)
    conn.commit()   # an open transaction would leave write_outputs' backup retrying forever


def build_db(seed):
    V = plant_values(seed)
    r = random.Random(seed)
    conn = empty_db()
    fill_noise(conn, V, r)
    noise = {t: {i for (i,) in conn.execute("SELECT id FROM %s" % t)}
             for (t,) in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
    plant_part1(conn, V, r)
    plant_part2(conn, V, r)
    scatter_planted(conn, noise, r)
    link_tables(conn, V, r)
    clock_times(conn)
    # The ch.1 decoy (the eve's Ritz theft): a wrong answer the site's "Filed Under the 17th" badge recognises,
    # looked up after scatter_planted moved it. Shipped in chapters.json, so it must never be the answer.
    (V["decoy_report_id"],) = conn.execute(
        "SELECT id FROM police_report WHERE description LIKE 'A bottle of Pommery 1906%'").fetchone()
    assert V["decoy_report_id"] not in (V["report_id"], V["compete_report_id"])
    return conn, V


def check_discovery(conn, V, ch, compete=False):
    """Each chapter's discovery queries must actually surface the fact the story withholds."""
    for d in ch.get("discovery_compete" if compete else "discovery", []):
        rows = conn.execute(d["query"].format(**V)).fetchall()
        if "row_count" in d:
            assert len(rows) == d["row_count"], \
                "chapter %s discovery: got %d rows, expected %d (%s)" % (ch["n"], len(rows), d["row_count"], d["query"])
        needles = d.get("must_contain", [])   # one string, or several facts the same query must show
        for needle in [needles] if isinstance(needles, str) else needles:
            needle = needle.format(**V)   # case-insensitive: telegrams are upper-cased
            assert needle.lower() in str(rows).lower(), \
                "chapter %s discovery: %r not found in %r (%s)" % (ch["n"], needle, rows, d["query"])
            for k in ["story", "objective", "answer_form"]:   # the chapter's own text must not hand it back
                text = ch.get(k + ("_compete" if compete else ""), ch.get(k, "")).format(**V)
                assert needle.lower() not in text.lower(), "chapter %s %s gives away %r" % (ch["n"], k, needle)


def check_chapter(conn, V, ch, compete=False):
    """The solution returns exactly the answer; the naive query does not (wrong count, or a wrong value)."""
    check_discovery(conn, V, ch, compete)
    suf = "_compete" if compete else ""
    want = normalise(str(V[ch["answer_key" + suf]]))
    rows = conn.execute(ch["solution" + suf].format(**V)).fetchall()
    assert len(rows) == 1 and normalise(str(rows[0][0])) == want, \
        "chapter %d%s: solution returned %r" % (ch["n"], suf, rows[:3])
    for trap in ch.get("traps" + suf, []):   # other plausible shortcuts that must not reach the answer
        rows = conn.execute(trap.format(**V)).fetchall()
        assert not (len(rows) == 1 and normalise(str(rows[0][0])) == want), "chapter %d%s: trap %r does not bite" % (ch["n"], suf, trap)
    rows = conn.execute(ch["naive" + suf].format(**V)).fetchall()
    naive_rows = ch["naive_rows" + suf]
    assert naive_rows is None or len(rows) == naive_rows, \
        "chapter %d%s: naive returned %d rows, expected %d" % (ch["n"], suf, len(rows), naive_rows)
    assert not (len(rows) == 1 and normalise(str(rows[0][0])) == want), "chapter %d%s: trap does not bite" % (ch["n"], suf)
    return len(rows)


def sha(s):
    return hashlib.sha256(normalise(str(s)).encode()).hexdigest()


# shipped in chapters.json for the page's ?selftest: uses no planted value
FIXTURE = [("  Rupert Blakeney, Esq. ", "rupert blakeney"), ("rupert   blakeney", "rupert blakeney"),
           ("Lord Ashcombe", "ashcombe"), ("ASHCOMBE", "ashcombe"), ("75-9999", "759999"), ("75 9999", "759999"),
           ("12 rue de la Paix", "12 la paix"), ("Suite 305", "305"), ("Mr. Grey", "grey"),
           ("Comtesse de Cagliostro", "cagliostro"), ("Cagliostro", "cagliostro"), ("Trunk no B-3", "b 3")]

TEXT_KEYS = ["title", "story", "objective", "answer_form", "telegram"]


def chapters_json(V, mode="learn"):
    chapters = []
    src = plot.CHAPTERS if mode == "learn" else plot.CHAPTERS[:8]
    suf = "" if mode == "learn" else "_compete"
    for ch in src:
        d = {k: ch[k].format(**V) for k in ["title", "story"]}
        d["objective"] = ch["objective" + suf].format(**V)
        d["answer_form"] = ch["answer_form" + suf].format(**V)
        d["telegram"] = ch["telegram"].format(**V)
        d["board"] = ch.get("board" + suf, ch["board"])   # what the answer is, on its case-board card
        d.update(answer_sha256=sha(V[ch["answer_key" + suf]]), n=ch["n"], tables=ch["tables"])
        chapters.append(d)
    out = dict(mode=mode, normalise_fixture=FIXTURE,
               cast=plot.CAST, wrong_suspects=plot.WRONG_SUSPECTS, wrong_default=plot.WRONG_DEFAULT,
               chapters=chapters, decoys={"1": V["decoy_report_id"]} if mode == "learn" else {})
    if mode == "learn":
        out["endings"] = {k: v.format(**V) for k, v in plot.ENDINGS.items()}
        out["part2_code_sha256"] = sha(V["part2_code"])
    return out


# A port of site/app.js formatSql (Ctrl+F in the terminal), so solution.sql reads like a formatted query.
# The site test runs the JS formatter over solution.sql and requires it to change nothing: the two must agree.
SQL_KEYWORDS = set(("select from where and or not in is null like glob between join inner left right full outer "
    "cross natural on using as group by order having limit offset distinct all union intersect except with recursive case "
    "when then else end asc desc over partition rows range exists cast collate escape values insert into update set delete "
    "create table view drop filter window").split(" "))
SQL_FUNCS = set("count sum avg min max abs round length lower upper substr trim replace coalesce ifnull nullif date time "
    "strftime rank dense_rank row_number lag lead ntile first_value last_value printf cast".split(" "))
JOIN_LEAD = {"left", "right", "inner", "full", "cross", "natural", "outer"}
CLAUSES = {"from", "where", "group", "having", "order", "limit", "union", "intersect", "except", "window"}
SQL_TOKEN = re.compile(r"""(\s+)|(--[^\n]*)|(/\*[\s\S]*?(?:\*/|$))|('(?:[^']|'')*'?|"(?:[^"]|"")*"?)|([A-Za-z_][A-Za-z0-9_]*)|([\s\S])""")


def format_sql(src):
    parens, out, space, prev, start, between = [], "", False, "", True, False

    def br(extra):
        nonlocal out, space
        out = out.rstrip() + "\n" + "  " * (sum(parens) + extra)
        space = False

    for m in SQL_TOKEN.finditer(src):
        t, ws, line, block, string, word = m.group(0), m.group(1), m.group(2), m.group(3), m.group(4), m.group(5)
        if ws:
            space = out != ""
            continue
        w = word.lower() if word else ""
        rest = src[m.end():]
        if word and (not parens or parens[-1]) and not start:
            if w in CLAUSES or (w == "select" and prev != "(") or ((w in JOIN_LEAD or w == "join") and prev not in JOIN_LEAD):
                br(0)
            elif w in ("and", "or") and not between:
                br(1)
        if w == "and" and between:
            between = False
        if w == "between":
            between = True
        text = word.upper() if word and (w in SQL_KEYWORDS or (w in SQL_FUNCS and re.match(r"\s*\(", rest))) else t
        if t == ")" and parens and parens.pop():
            br(0)
        if space and out and not out[-1].isspace():
            out += " "
        out += text
        space = False
        if t == "(":
            parens.append(bool(re.match(r"\s*(select|with)\b", rest, re.I)))
            if parens[-1]:
                br(0)
        if line:
            br(0)
        if t == ";":
            out += "\n"
            start, prev, parens = True, "", []
            continue
        if not string and not line and not block:
            prev = w or t
        start = False
    return re.sub(r"[ \t]+$", "", out, flags=re.M).strip()


def solution_sql(V):
    out = ["-- The Ritz Affair: reference path (seed %d). Each chapter first finds the facts the story withholds, then answers." % V["seed"]]
    for ch in plot.CHAPTERS:
        lines = ["-- %02d. %s (%s) -> %s: %s" % (ch["n"], ch["title"].format(**V), ch["construct"],
                 ch["answer_form"].format(**V), V[ch["answer_key"]])]
        for d in ch.get("discovery", []):
            if "note" in d:
                lines.append("-- " + d["note"].format(**V))
            lines.append(format_sql(d["query"].format(**V) + ";"))
        if "explain" in ch:
            lines.append("-- " + ch["explain"].format(**V))
        lines.append("-- The answer:")
        lines.append(format_sql(ch["solution"].format(**V) + ";"))
        lines.append("-- Answer: %s" % V[ch["answer_key"]])
        out.append("\n".join(lines))
        if ch["n"] == 8:   # between the parts: the telegram whose code, typed in the answer box, opens Part II
            out.append("\n".join([
                "-- Part II: the code. Lupin mentioned a Chapter IX; a telegram is addressed to a curious clerk.",
                format_sql("SELECT * FROM telegram WHERE recipient LIKE '%CURIOUS%';"),
                "-- Type the first four words of its text in the answer box.",
                "-- Answer: %s" % V["part2_code"]]))
    return "\n\n".join(out) + "\n"


def write_outputs(conn, V, site_dir="site", mode="learn"):
    stem = "mystery" if mode == "learn" else "season-%d" % V["seed"]
    path = os.path.join(site_dir, stem + ".sqlite")
    if os.path.exists(path):
        os.remove(path)
    disk = sqlite3.connect(path)
    conn.backup(disk)
    disk.close()
    with open(os.path.join(site_dir, ("chapters" if mode == "learn" else stem) + ".json"), "w") as f:
        json.dump(chapters_json(V, mode), f, indent=1, ensure_ascii=True)
    if mode == "learn":
        with open("solution.sql", "w") as f:
            f.write(solution_sql(V))
        with open(os.path.join(site_dir, "schema.svg"), "w") as f:
            f.write(erd.svg(conn, order=[t for ch in plot.CHAPTERS for t in ch["tables"]]))
        corr = os.path.join("..", "SQL", "3-Corrections", "8. Correction SQL Mystery Game.sql")
        if os.path.isdir(os.path.dirname(corr)):
            with open(corr, "w") as f:
                f.write(solution_sql(V))


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


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--seed", type=int, default=1912)
    ap.add_argument("--season", type=int, help="build season-N.* for compete mode (re-draws the planted values)")
    a = ap.parse_args(argv)
    seed, mode = (a.season, "compete") if a.season else (a.seed, "learn")
    conn, V = build_db(seed)
    self_check(conn, V, mode)
    write_outputs(conn, V, mode=mode)
    print("ok: seed %d, %d chapters" % (seed, len(plot.CHAPTERS) if mode == "learn" else 8))


if __name__ == "__main__":
    main()
