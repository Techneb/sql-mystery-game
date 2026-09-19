"""The Ritz Affair: plot as data. Templates are str.format over V (planted values). ASCII only."""

STOP_WORDS = {"the", "a", "suite", "no", "trunk", "mr", "mrs", "esq", "lord", "senor",
              "senora", "comtesse", "de", "rue", "report", "telegram", "account", "plate"}

# Each chapter: n, part, construct, tables revealed when it opens, answer_key (a key of V), solution SQL,
# the naive SQL a student writes without the construct, and naive_rows (its row count, None = any).
CHAPTERS = [
 dict(n=1, part=1, construct="SELECT / WHERE", tables=["police_report"], answer_key="report_id",
  solution="SELECT id FROM police_report WHERE place = 'Hotel Ritz' AND date = {theft_date} AND type = 'theft'",
  naive="SELECT id FROM police_report WHERE place = 'Hotel Ritz'", naive_rows=None),
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
  naive="SELECT t.counterparty_id FROM person AS p JOIN bank_account AS b ON b.person_id = p.id JOIN bank_transaction AS t ON t.account_id = b.id WHERE p.name = '{fence}' AND t.date BETWEEN 19120501 AND 19120531 ORDER BY t.amount DESC LIMIT 1", naive_rows=1),
 dict(n=7, part=1, construct="CASE WHEN", tables=["telegram"], answer_key="night_telegram_id",
  solution="SELECT id FROM (SELECT id, CASE WHEN time < 600 THEN 'night' WHEN time < 1200 THEN 'morning' WHEN time < 1800 THEN 'afternoon' ELSE 'evening' END AS period FROM telegram WHERE office = 'Ritz' AND date = {theft_date}) AS t WHERE period = 'night'",
  naive="SELECT id FROM telegram WHERE office = 'Ritz' AND date = {theft_date}", naive_rows=None),
 dict(n=8, part=1, construct="RANK() OVER + subquery", tables=["room_service"], answer_key="lupin_alias",
  solution="SELECT guest_name FROM hotel_register WHERE floor = 2 AND checkin <= {theft_date} AND checkout > {theft_date} AND suite = (SELECT suite FROM (SELECT suite, item, time, RANK() OVER (PARTITION BY suite ORDER BY time) AS rk FROM room_service WHERE date = {theft_date}) AS ranked WHERE rk = 1 AND item = '{champagne}' AND time < 600)",
  naive="SELECT DISTINCT suite FROM room_service WHERE date = {theft_date} AND item = '{champagne}' AND time < 600", naive_rows=2),
]
