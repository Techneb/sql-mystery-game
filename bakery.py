"""The Clerk's Handbook's bakery database (site/learn/database.html's script). Stdlib only.

v1 is the week every page uses today (Mon 2 to Sun 8 March 2026), written out row by row. v2 is four weeks of
trade (2-29 March 2026, closed on Fridays as v1 is), drawn from random.Random(2026) around v1's rows and the
planted cases of docs/superpowers/plans/2026-10-19-bakery-v2-and-review.md (Part 2); check() fails the build when
one goes missing. python3 generate_db.py writes LIVE's script and counts into database.html (erd.write_bakery then
draws its schema); python3 bakery.py --paste [page.html ...] reruns every example on the pages named (all learn
pages by default) and rewrites its result table from the real result; then node colour_learn.mjs.
"""
import datetime
import glob
import html
import os
import random
import re
import sqlite3
import sys

LIVE = 2   # the version database.html carries; 2 once the pages are rewritten for it (the plan's migration order)

SCHEMA = {
    1: ["CREATE TABLE customer (id INTEGER PRIMARY KEY, name TEXT, town TEXT, joined TEXT, referred_by INTEGER REFERENCES customer(id));",
        "CREATE TABLE product (id INTEGER PRIMARY KEY, name TEXT, category TEXT, price REAL);",
        "CREATE TABLE orders (id INTEGER PRIMARY KEY, customer_id INTEGER REFERENCES customer(id), day TEXT, time TEXT);",
        "CREATE TABLE order_item (order_id INTEGER REFERENCES orders(id), product_id INTEGER REFERENCES product(id), quantity INTEGER);"],
    2: ["CREATE TABLE customer (id INTEGER PRIMARY KEY, name TEXT, town TEXT, joined TEXT, referred_by INTEGER REFERENCES customer(id), email TEXT);",
        "CREATE TABLE product (id INTEGER PRIMARY KEY, name TEXT, category TEXT, price REAL);",
        "CREATE TABLE staff (id INTEGER PRIMARY KEY, name TEXT, role TEXT, manager_id INTEGER REFERENCES staff(id));",
        "CREATE TABLE orders (id INTEGER PRIMARY KEY, customer_id INTEGER REFERENCES customer(id), day TEXT, time TEXT, staff_id INTEGER REFERENCES staff(id));",
        "CREATE TABLE order_item (order_id INTEGER REFERENCES orders(id), product_id INTEGER REFERENCES product(id), quantity INTEGER, unit_price REAL);",
        "CREATE TABLE refund (id INTEGER PRIMARY KEY, order_id INTEGER REFERENCES orders(id), day TEXT, amount REAL, reason TEXT);"],
}
PER_LINE = {"orders": 3, "order_item": 10}   # rows per script line (v1's layout)

V1 = {
    "customer": [(1, 'Alice Turner', 'Riverside', '2024-01-15', None), (2, 'Ben Okafor', 'Hillcrest', '2024-02-03', 1),
                 (3, 'Chloe Martin', 'Riverside', '2024-02-20', 1), (4, 'David Chen', 'Old Town', '2024-03-11', None),
                 (5, 'Emma Novak', 'Hillcrest', '2024-04-02', 3), (6, 'Farid Haddad', 'Old Town', '2024-05-19', 5),
                 (7, 'Grace Lee', 'Riverside', '2024-06-07', 2), (8, 'Hugo Silva', 'Hillcrest', '2024-07-23', None)],
    "product": [(1, 'Baguette', 'bread', 1.20), (2, 'Sourdough loaf', 'bread', 4.50), (3, 'Rye loaf', 'bread', 3.80),
                (4, 'Croissant', 'pastry', 1.40), (5, 'Pain au chocolat', 'pastry', 1.60),
                (6, 'Almond croissant', 'pastry', 2.20), (7, 'Lemon tart', 'cake', 3.90),
                (8, 'Chocolate eclair', 'cake', 2.80), (9, 'Carrot cake slice', 'cake', 3.20),
                (10, 'Seeded rolls', 'bread', 3.80)],
    "orders": [(1, 1, '2026-03-02', '07:15'), (2, 2, '2026-03-02', '08:40'), (3, 4, '2026-03-02', '12:30'),
               (4, 3, '2026-03-03', '07:50'), (5, 1, '2026-03-04', '07:20'), (6, 5, '2026-03-04', '16:10'),
               (7, 6, '2026-03-05', '09:05'), (8, 2, '2026-03-05', '17:45'), (9, 1, '2026-03-07', '07:10'),
               (10, 7, '2026-03-07', '10:30'), (11, 4, '2026-03-07', '13:15'), (12, 3, '2026-03-08', '08:05'),
               (13, 5, '2026-03-08', '11:40'), (14, 1, '2026-03-08', '18:20')],
    "order_item": [(1, 1, 2), (1, 4, 1), (2, 2, 1), (2, 5, 2), (3, 7, 1), (3, 8, 2), (4, 4, 3), (5, 1, 1), (6, 6, 2),
                   (6, 7, 1), (7, 3, 1), (7, 10, 1), (8, 2, 1), (9, 1, 2), (9, 5, 1), (10, 8, 3), (11, 2, 1),
                   (11, 6, 1), (12, 4, 2), (12, 5, 2), (13, 7, 2), (14, 1, 1), (14, 10, 1)],
}

# --- v2: planted rows -------------------------------------------------------------------------------------------
NEW_PRODUCTS = [(11, 'Brioche', 'pastry', 2.10), (12, 'Focaccia', 'bread', 3.60), (13, 'Cinnamon roll', 'pastry', 2.60),
                (14, 'Apple turnover', 'pastry', 1.90), (15, 'Cheesecake slice', 'cake', 3.80),
                (16, 'Walnut bread', 'bread', 4.20), (17, 'Raspberry tart', 'cake', 4.10),
                (18, 'Coffee eclair', 'cake', 2.80), (19, 'Pistachio financier', 'cake', 2.40),
                (20, 'Hot cross bun', 'pastry', 1.50)]
RISE_DAY, RISE = '2026-03-16', {12: 3.40, 13: 2.40, 15: 3.50}   # the price on lines before Monday 16 March
UNSOLD, LAUNCHED = 19, 20          # never sold; first sold on RISE_DAY or later
STAFF = [(1, 'Margaret Hale', 'owner', None), (2, 'Tom Becker', 'head baker', 1), (3, 'Nina Patel', 'counter', 2),
         (4, 'Omar Reyes', 'counter', 2), (5, 'Lucy Brandt', 'counter', 2), (6, 'Sam Ito', 'baker', 2)]
NEVER_SERVES = 6
V1_EMAIL = {1: 'alice.turner@mail.com', 2: 'Ben.Okafor@Mail.com', 3: 'chloe.martin@post.net', 4: None,
            5: 'emma.novak@post.net ', 6: 'FARID.HADDAD@MAIL.COM', 7: 'grace.lee@mail.com', 8: None}
MESSY = {16: lambda e: e.title(), 23: lambda e: e + ' ', 29: lambda e: ' ' + e}   # noise customers' messy emails
NEVER_ORDERS = {8, 19, 31, 35}       # Hugo Silva (v1: never ordered, brought nobody) and three noise customers
TWINS = (14, 27)                   # the same name, in two towns
DEEP = (12, 6)                     # customer 12 referred by Farid Haddad: Alice -> Chloe -> Emma -> Farid -> 12
MARCH_JOINERS = (38, 39, 40)       # joined during March 2026
PLANTED_TIMES = [('2026-03-04', '09:00'), ('2026-03-09', '12:00')]   # the CASE boundaries, a row on each
TIE_CATEGORY = 'pastry'            # two products share the most pieces sold (best-seller-of-each-category)
FIRST = ['Amira', 'Bruno', 'Clara', 'Daniel', 'Elena', 'Felix', 'Greta', 'Hassan', 'Iris', 'Jonas', 'Kofi', 'Lena',
         'Marco', 'Nadia', 'Oscar', 'Priya', 'Quentin', 'Rosa', 'Stefan', 'Tara', 'Ugo', 'Vera', 'Wen', 'Yusuf', 'Zoe']
LAST = ['Andersen', 'Bianchi', 'Costa', 'Dubois', 'Eriksen', 'Fischer', 'Garcia', 'Hughes', 'Ivanova', 'Jensen',
        'Kowalski', 'Lambert', 'Moreno', 'Nakamura', 'Olsen', 'Petrov', 'Rossi', 'Schmidt', 'Tanaka', 'Weber']
TOWNS = ['Riverside', 'Hillcrest', 'Old Town']
DOMAINS = ['mail.com', 'post.net', 'webmail.org']
REASONS = ['stale', 'wrong item', 'dropped', 'overcharged', None, 'stale', 'wrong item']   # one NULL reason
HOUR_WEIGHT = {7: 4, 8: 5, 9: 3, 10: 2, 11: 2, 12: 3, 13: 2, 14: 1, 15: 1, 16: 2, 17: 2, 18: 1}


def days():
    d, out = datetime.date(2026, 3, 2), []
    while d <= datetime.date(2026, 3, 29):
        if d.weekday() != 4:   # closed on Fridays
            out.append(d)
        d += datetime.timedelta(days=1)
    return out


def v2():
    rng = random.Random(2026)
    # customers: v1's eight (with an email), then noise in joining order
    deal = lambda xs: rng.sample(xs, len(xs)) + rng.sample(xs, len(xs))   # each name used at most twice
    names = [f + ' ' + l for f, l in zip(deal(FIRST), deal(LAST))]
    joined = sorted(str(datetime.date(2024, 8, 1) + datetime.timedelta(days=rng.randrange(570))) for _ in range(29))
    joined += ['2026-03-0%d' % rng.randint(2, 9), '2026-03-1%d' % rng.randint(0, 4), '2026-03-%d' % rng.randint(15, 20)]
    level = {1: 0, 2: 1, 3: 1, 4: 0, 5: 2, 6: 3, 7: 2, 8: 0}
    customers = [r + (V1_EMAIL[r[0]],) for r in V1["customer"]]
    for i, cid in enumerate(range(9, 41)):
        ref = DEEP[1] if cid == DEEP[0] else None
        if ref is None and rng.random() < 0.85:   # most were referred, so walk-ins stay few
            ref = rng.choice([c for c in level if level[c] < 3 and c != 8])
        level[cid] = level[ref] + 1 if ref else 0
        name = names[i]
        email = None if rng.random() < 1 / 3 else name.lower().replace(' ', '.') + '@' + rng.choice(DOMAINS)
        if cid in MESSY:
            email = MESSY[cid](name.lower().replace(' ', '.') + '@' + rng.choice(DOMAINS))
        customers.append((cid, name, rng.choice(TOWNS), joined[i], ref, email))
    a, b = customers[TWINS[0] - 1], customers[TWINS[1] - 1]
    town = next(t for t in TOWNS if t != a[2])
    customers[TWINS[1] - 1] = (b[0], a[1], town) + b[3:5] + (a[1].lower().replace(' ', '_') + '@' + DOMAINS[0],)
    products = V1["product"] + NEW_PRODUCTS
    price = {p[0]: p[3] for p in products}
    by_cat = {}
    for p in products:
        if p[0] != UNSOLD:
            by_cat.setdefault(p[2], []).append(p[0])
    weight = {c[0]: 6 if c[0] == 1 else 3 if c[0] <= 8 else rng.randint(1, 4) for c in customers}

    # orders: v1's fourteen kept as they are, the rest drawn per day
    v1_lines = {}
    for o, p, q in V1["order_item"]:
        v1_lines.setdefault(o, []).append((p, q))
    orders = [(day, time, cust, v1_lines[oid]) for oid, cust, day, time in V1["orders"]]
    for d in days():
        day = str(d)
        n = rng.randint(13, 16) if d.weekday() >= 5 else rng.randint(10, 13)
        taken = {o[1] for o in orders if o[0] == day}
        want = [t for dd, t in PLANTED_TIMES if dd == day]
        while len(taken) + len(want) < n:
            h = rng.choices(list(HOUR_WEIGHT), list(HOUR_WEIGHT.values()))[0]
            t = '%02d:%02d' % (h, 5 * rng.randrange(12))
            if t not in taken and t not in want:
                want.append(t)
        for t in want:
            taken.add(t)
            who = [c[0] for c in customers if c[3] <= day and c[0] not in NEVER_ORDERS]
            cust = rng.choices(who, [weight[c] for c in who])[0]
            h = int(t[:2])
            cat_w = [5, 5, 1] if h < 11 else [4, 1, 3] if h < 14 else [2, 2, 5]
            lines, seen = [], set()
            for _ in range(rng.choices([1, 2, 3, 4], [2, 3, 4, 1])[0]):
                cat = rng.choices(['bread', 'pastry', 'cake'], cat_w)[0]
                p = rng.choice([p for p in by_cat[cat] if p != LAUNCHED or day >= RISE_DAY])
                if p not in seen:
                    seen.add(p)
                    lines.append((p, rng.choices([1, 2, 3], [6, 3, 1])[0]))
            orders.append((day, t, cust, lines))
    v1_keys = {(day, time) for _, _, day, time in V1["orders"]}
    for c in customers:   # chance may leave a customer out: they take a noise order from the busiest one
        if c[0] not in NEVER_ORDERS and all(o[2] != c[0] for o in orders):
            busiest = max(weight, key=lambda k: sum(o[2] == k for o in orders))
            k = max(i for i, o in enumerate(orders) if o[2] == busiest and o[0] >= c[3] and o[:2] not in v1_keys)
            orders[k] = orders[k][:2] + (c[0],) + orders[k][3:]
    orders.sort()

    def server(day, t):
        if rng.random() < 0.08:
            return 1   # the owner takes the counter now and then
        weekend = datetime.date.fromisoformat(day).weekday() >= 5
        if weekend:
            return 5
        return 2 if t < '07:30' else 3 if t < '12:00' else 4   # the head baker opens on weekdays

    rows, items = [], []
    for oid, (day, t, cust, lines) in enumerate(orders, 1):
        rows.append((oid, cust, day, t, server(day, t)))
        for p, q in lines:
            items.append([oid, p, q, RISE[p] if p in RISE and day < RISE_DAY else price[p]])

    # plant the tie: the second best seller of TIE_CATEGORY catches up with the first (noise lines only),
    # and the other categories keep a single best seller
    noise = lambda it: (rows[it[0] - 1][2], rows[it[0] - 1][3]) not in v1_keys
    for cat in by_cat:
        total = {p: sum(it[2] for it in items if it[1] == p) for p in by_cat[cat]}
        top = sorted(total, key=lambda p: -total[p])
        if cat == TIE_CATEGORY:
            gap = total[top[0]] - total[top[1]]
            for it in [it for it in items if it[1] == top[1] and noise(it)][-gap:] if gap else []:
                it[2] += 1
        elif total[top[0]] == total[top[1]]:
            next(it for it in reversed(items) if it[1] == top[0] and noise(it))[2] += 1

    # refunds: one piece of a line, on seven orders of two or more noise lines, one of them refunded twice
    lines_of = {}
    for it in items:
        lines_of.setdefault(it[0], []).append(it)
    open_days = [str(d) for d in days()]
    picks = sorted(rng.sample([o for o in lines_of if len(lines_of[o]) >= 2 and noise(lines_of[o][0])], 7))
    refunds = []
    for k, oid in enumerate(picks):
        day = rows[oid - 1][2]
        for it in rng.sample(lines_of[oid], 2 if k == 3 else 1):
            later = open_days[min(open_days.index(day) + rng.randint(0, 2), len(open_days) - 1)]
            refunds.append((later, oid, it[3], REASONS[len(refunds) % len(REASONS)]))
    refunds = [(i, oid, day, amount, reason) for i, (day, oid, amount, reason) in enumerate(sorted(refunds), 1)]
    return {"customer": customers, "product": products, "staff": STAFF, "orders": rows,
            "order_item": [tuple(it) for it in items], "refund": refunds}


def tables(version):
    return V1 if version == 1 else v2()


def value(v):
    if v is None:
        return 'NULL'
    if isinstance(v, float):
        return '%.2f' % v
    if isinstance(v, str):
        assert "'" not in v, v
        return "'%s'" % v
    return str(v)


def script(version):
    out = list(SCHEMA[version])
    data = tables(version)
    for create in SCHEMA[version]:
        t = create.split()[2]
        rows = ['(' + ','.join(value(v) for v in r) + ')' for r in data[t]]
        k = PER_LINE.get(t, 1)
        chunks = [','.join(rows[i:i + k]) for i in range(0, len(rows), k)]
        out.append('INSERT INTO %s VALUES' % t)
        out += [' ' + c + (',' if i < len(chunks) - 1 else ';') for i, c in enumerate(chunks)]
    return '\n'.join(out)


def conn(version):
    c = sqlite3.connect(':memory:')
    c.executescript(script(version))
    return c


WORDS = ('zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen '
         'seventeen eighteen nineteen').split()
TENS = 'twenty thirty forty fifty sixty seventy eighty ninety'.split()


def words(n):
    """Numbers under 100 in words, the rest in digits (the pages' style)."""
    if n < 20:
        return WORDS[n]
    if n < 100:
        return TENS[n // 10 - 2] + ('-' + WORDS[n % 10] if n % 10 else '')
    return str(n)


def counts(version):
    c = conn(version)
    n = lambda t: c.execute('SELECT COUNT(*) FROM ' + t).fetchone()[0]
    parts = ['%s customers' % words(n('customer')), '%s products' % words(n('product'))]
    if version > 1:
        parts.append('%s staff' % words(n('staff')))
    parts += ['%s orders' % words(n('orders')), '%s order lines' % words(n('order_item'))]
    if version > 1:
        parts.append('%s refunds' % words(n('refund')))
    return 'The full database is ' + ', '.join(parts[:-1]) + ' and ' + parts[-1] + '.'


def check(version=2):
    """The build's test of the bakery: keys resolve, ids are dense, the text is ASCII and free of the game, and
    (v2) every planted case the pages and exercises rely on is in the data."""
    import plot
    s = script(version)
    s.encode('ascii')
    for w in [t for ch in plot.CHAPTERS for t in ch['tables']] + [c['name'].split()[-1] for c in plot.CAST]:
        assert not re.search(r'\b%s\b' % re.escape(w), s, re.I), w
    c = conn(version)
    one = lambda q: c.execute(q).fetchone()[0]
    col = lambda q: [r[0] for r in c.execute(q)]
    assert not c.execute('PRAGMA foreign_key_check').fetchall()
    for t in col("SELECT name FROM sqlite_master WHERE type = 'table'"):
        if t != 'order_item':
            assert one('SELECT COUNT(*) = MAX(id) AND MIN(id) = 1 FROM ' + t), t + ' ids are dense'
    if version == 1:
        return
    # the shape the plan asked for
    assert 35 <= one('SELECT COUNT(*) FROM customer') <= 45 and one('SELECT COUNT(*) FROM product') == 20
    assert 280 <= one('SELECT COUNT(*) FROM orders') <= 320 and 650 <= one('SELECT COUNT(*) FROM order_item') <= 750
    for oid, cust, day, time in V1['orders']:   # v1's orders, whole, under new ids
        got = c.execute('SELECT id FROM orders WHERE customer_id = ? AND day = ? AND time = ?', (cust, day, time)).fetchall()
        assert len(got) == 1, (cust, day, time)
        assert sorted(c.execute('SELECT product_id, quantity FROM order_item WHERE order_id = ?', got[0])) == \
            sorted((p, q) for o, p, q in V1['order_item'] if o == oid)
    assert col('SELECT name FROM customer WHERE id <= 8 ORDER BY id') == [r[1] for r in V1['customer']]
    assert col('SELECT name FROM product WHERE id <= 10 ORDER BY id') == [r[1] for r in V1['product']]
    # days: four weeks, closed on Fridays only, an order on every weekend day
    open_days = col('SELECT DISTINCT day FROM orders ORDER BY day')
    assert open_days == [str(d) for d in days()], 'one closed day a week (Friday), every other day trades'
    for t in ('09:00', '12:00'):
        assert one("SELECT COUNT(*) FROM orders WHERE time = '%s'" % t) >= 1, 'an order at exactly ' + t
    assert one('SELECT COUNT(*) FROM (SELECT day, time FROM orders GROUP BY day, time HAVING COUNT(*) > 1)') == 0
    # customers
    assert set(col('SELECT id FROM customer WHERE id NOT IN (SELECT customer_id FROM orders)')) == NEVER_ORDERS
    assert one('SELECT COUNT(*) FROM orders AS o JOIN customer AS c ON c.id = o.customer_id WHERE o.day < c.joined') == 0
    assert one('SELECT COUNT(*) FROM customer WHERE referred_by = 8') == 0 and one('SELECT referred_by IS NULL FROM customer WHERE id = 8')
    depth = one('WITH RECURSIVE t(id, d) AS (SELECT id, 0 FROM customer WHERE referred_by IS NULL UNION ALL '
                'SELECT c.id, t.d + 1 FROM customer AS c JOIN t ON c.referred_by = t.id) SELECT MAX(d) FROM t')
    assert depth == 4, depth
    assert one('SELECT COUNT(*) FROM customer WHERE referred_by IS NULL') <= 10, 'walk-ins stay few'
    assert one('SELECT COUNT(DISTINCT town) FROM customer WHERE name = (SELECT name FROM customer WHERE id = %d)' % TWINS[0]) == 2
    assert one('SELECT COUNT(*) FROM (SELECT name FROM customer GROUP BY name HAVING COUNT(*) > 1)') == 1
    assert col('SELECT DISTINCT town FROM customer ORDER BY town') == sorted(TOWNS), 'towns stay clean'
    nulls = one('SELECT COUNT(*) FROM customer WHERE email IS NULL')
    assert 10 <= nulls <= 16, nulls   # about a third
    assert one('SELECT COUNT(*) FROM customer WHERE email <> lower(trim(email))') >= 5
    assert one('SELECT COUNT(*) FROM customer WHERE email <> trim(email)') >= 2
    assert col("SELECT id FROM customer WHERE joined >= '2026-03-01' ORDER BY id") == list(MARCH_JOINERS)
    # NOT IN meets a NULL: both self-references have one
    assert one('SELECT COUNT(*) FROM customer WHERE id NOT IN (SELECT referred_by FROM customer)') == 0
    assert one('SELECT COUNT(*) FROM staff WHERE id NOT IN (SELECT manager_id FROM staff)') == 0
    # staff: three levels, one never at the counter
    assert one('WITH RECURSIVE t(id, d) AS (SELECT id, 1 FROM staff WHERE manager_id IS NULL UNION ALL '
               'SELECT s.id, t.d + 1 FROM staff AS s JOIN t ON s.manager_id = t.id) SELECT MAX(d) FROM t') == 3
    assert col('SELECT id FROM staff WHERE id NOT IN (SELECT staff_id FROM orders)') == [NEVER_SERVES]
    # products: one unsold, one launched mid-month, three dearer from Monday 16 March
    assert col('SELECT id FROM product WHERE id NOT IN (SELECT product_id FROM order_item)') == [UNSOLD]
    assert one('SELECT MIN(o.day) FROM order_item AS i JOIN orders AS o ON o.id = i.order_id WHERE i.product_id = %d' % LAUNCHED) >= RISE_DAY
    assert one('SELECT COUNT(*) FROM order_item AS i JOIN product AS p ON p.id = i.product_id WHERE i.unit_price <> p.price') > 0
    for p, old in RISE.items():
        assert col('SELECT DISTINCT i.unit_price FROM order_item AS i JOIN orders AS o ON o.id = i.order_id WHERE i.product_id = %d '
                   'ORDER BY o.day < \'%s\'' % (p, RISE_DAY)) == [one('SELECT price FROM product WHERE id = %d' % p), old], p
    assert one('SELECT COUNT(*) FROM order_item AS i JOIN product AS p ON p.id = i.product_id '
               'WHERE i.unit_price <> p.price AND i.product_id NOT IN %s' % (tuple(RISE),)) == 0
    # best sellers: a tie in TIE_CATEGORY only
    tops = c.execute('SELECT category, COUNT(*) FROM (SELECT p.category, SUM(i.quantity) AS n, MAX(SUM(i.quantity)) OVER '
                     '(PARTITION BY p.category) AS m FROM order_item AS i JOIN product AS p ON p.id = i.product_id '
                     'GROUP BY p.id) WHERE n = m GROUP BY category ORDER BY category').fetchall()
    assert tops == sorted((cat, 2 if cat == TIE_CATEGORY else 1) for cat in ('bread', 'cake', 'pastry')), tops
    # refunds: a few, one order twice (the fan-out), each within its order's total, never before it
    assert 6 <= one('SELECT COUNT(*) FROM refund') <= 10
    assert one('SELECT COUNT(*) FROM (SELECT order_id FROM refund GROUP BY order_id HAVING COUNT(*) > 1)') == 1
    assert one('SELECT COUNT(*) FROM refund AS r JOIN orders AS o ON o.id = r.order_id WHERE r.day < o.day') == 0
    assert one('SELECT COUNT(*) FROM refund WHERE reason IS NULL') == 1
    assert one('SELECT COUNT(*) FROM (SELECT r.order_id, SUM(r.amount) AS back, (SELECT SUM(quantity * unit_price) FROM order_item '
               'WHERE order_id = r.order_id) AS paid FROM refund AS r GROUP BY r.order_id) WHERE back >= paid') == 0
    assert one('SELECT MIN((SELECT COUNT(*) FROM order_item WHERE order_id = r.order_id)) FROM refund AS r') >= 2
    # a GROUP BY ... LIMIT 5 on orders per customer has no tie at the cut
    n = col('SELECT COUNT(*) AS n FROM orders GROUP BY customer_id ORDER BY n DESC')
    assert n[4] != n[5], n[:6]
    # no average a page shows sits on a rounding edge (x.xx5: REAL and exact decimals round it apart)
    for q in ('SELECT AVG(price) FROM product GROUP BY category', 'SELECT AVG(price) FROM product',
              'SELECT AVG(i.unit_price) FROM order_item AS i JOIN product AS p ON p.id = i.product_id GROUP BY p.category',
              'SELECT AVG(quantity) FROM order_item', 'SELECT AVG(t) FROM (SELECT SUM(quantity * unit_price) AS t FROM order_item GROUP BY order_id)',
              'SELECT AVG(t) FROM (SELECT o.day, SUM(i.quantity * i.unit_price) AS t FROM orders AS o JOIN order_item AS i ON i.order_id = o.id GROUP BY o.day)',
              'SELECT AVG(t) FROM (SELECT c.town, SUM(i.quantity * i.unit_price) AS t FROM customer AS c JOIN orders AS o ON o.customer_id = c.id '
              'JOIN order_item AS i ON i.order_id = o.id GROUP BY c.town, o.id) GROUP BY town'):
        for x in col(q):
            m = round(x * 1000, 6)
            assert not (m == int(m) and int(m) % 10 == 5), (q, x)


SCRIPT_MARK = re.compile(r'(<!-- bakery script: bakery.py -->\n<pre class="script"><code>)[\s\S]*?(</code></pre>\n<!-- /bakery script -->)')
COUNTS_MARK = re.compile(r'(<!-- bakery counts: bakery.py -->)[\s\S]*?(<!-- /bakery counts -->)')


def write(learn_dir, version=None):
    """database.html: the script (plain, not coloured: the page is long enough) and the counts sentence."""
    version = version or LIVE
    check(version)
    path = os.path.join(learn_dir, 'database.html')
    with open(path) as f:
        text = f.read()
    new = SCRIPT_MARK.sub(lambda m: m.group(1) + html.escape(script(version), quote=False) + m.group(2), text)
    new = COUNTS_MARK.sub(lambda m: m.group(1) + counts(version) + m.group(2), new)
    assert SCRIPT_MARK.search(new) and COUNTS_MARK.search(new), path + ': the bakery markers are missing'
    if new != text:
        with open(path, 'w') as f:
            f.write(new)


# --- --paste: every example's printed result, from the real one -------------------------------------------------
PAIR = re.compile(r'<pre><code>((?:(?!</code>)[\s\S])*)</code></pre>\n<table class="result">([\s\S]*?)</table>')


def result_html(cur):
    cell = lambda tag, v: '<%s>%s</%s>' % (tag, html.escape('NULL' if v is None else str(v), quote=False), tag)
    rows = ['<tr>' + ''.join(cell('th', d[0]) for d in cur.description) + '</tr>']
    rows += ['<tr>' + ''.join(cell('td', v) for v in r) + '</tr>' for r in cur.fetchall()]
    return '\n' + '\n'.join(rows) + '\n'


def paste(pages, learn_dir='site/learn'):
    import erd
    import generate_db
    with open(os.path.join(learn_dir, 'database.html')) as f:
        db = generate_db.strict_conn(erd.bakery_conn(f.read()))
    changed = []
    for path in pages:
        with open(path) as f:
            text = f.read()
        run = lambda m: m.group(0)[:m.start(2) - m.start(0)] + result_html(db.execute(generate_db.sqlite_sql(
            html.unescape(re.sub(r'</?span[^>]*>', '', m.group(1)))))) + '</table>'
        new = PAIR.sub(run, text)
        if new != text:
            with open(path, 'w') as f:
                f.write(new)
            changed.append(path)
    return changed


if __name__ == '__main__':
    if sys.argv[1:2] == ['--paste']:
        names = sys.argv[2:]
        pages = [os.path.join('site/learn', os.path.basename(p)) for p in names] or sorted(glob.glob('site/learn/*.html'))
        for p in paste(pages):
            print('pasted ' + p)
    else:
        sys.exit('usage: python3 bakery.py --paste [page.html ...]   (python3 generate_db.py writes the script)')
