-- The Ritz Affair: reference path (seed 1912). Each chapter first finds the facts the story withholds, then answers.

-- 01. The Night of the 17th (SELECT / WHERE) -> the report id: 4127
-- Duroc says the lift went at 02:10, past midnight: the theft is filed under the 18th, not the 17th.
SELECT transcript
FROM interview
WHERE person_name = 'Marcel Duroc';
-- The answer:
SELECT id
FROM police_report
WHERE place = 'Hotel Ritz'
  AND date = 19120518
  AND type = 'theft';

-- 02. The Neighbouring Suite (ORDER BY / LIMIT) -> the guest's name: Lord Ashcombe
-- The report: the thief came from the neighbouring suite, the most expensive one on the floor, the night of the 17th.
SELECT description
FROM police_report
WHERE id = 4127;
-- The answer:
SELECT guest_name
FROM hotel_register
WHERE floor = 2
  AND checkin <= 19120517
  AND checkout > 19120517
ORDER BY price DESC
LIMIT 1;

-- 03. A Plate in the Dark (LIKE) -> the plate: 75-2041
-- Ashcombe: the plate began with 75-2, and the man tipped in English coins.
SELECT transcript
FROM interview
WHERE person_name = 'Lord Ashcombe';
-- The cab book records the currency of each fare: English coins are 'pound'.
SELECT DISTINCT currency
FROM cab_ride;
-- The answer:
SELECT plate
FROM cab_ride
WHERE plate LIKE '75-2%'
  AND date = 19120518
  AND currency = 'pound';

-- 04. The Cab's Week (GROUP BY / HAVING) -> the address: 27 rue des Martyrs
-- The cab's week, 13th to 19th: one address comes back three times.
SELECT dropoff, COUNT(*) AS n
FROM cab_ride
WHERE plate = '75-2041'
  AND date BETWEEN 19120513 AND 19120519
GROUP BY dropoff
ORDER BY n DESC;
-- The answer:
SELECT dropoff
FROM cab_ride
WHERE plate = '75-2041'
  AND date BETWEEN 19120513 AND 19120519
GROUP BY dropoff
HAVING COUNT(*) >= 3;

-- 05. The Boarding House (JOIN) -> the person's name: Ernest Grimaud
-- The address's own id.
SELECT id
FROM address
WHERE number = 27
  AND street = 'rue des Martyrs';
-- Its five tenants, one of them a jeweller.
SELECT name, occupation
FROM person
WHERE address_id = (
  SELECT id
  FROM address
  WHERE number = 27
    AND street = 'rue des Martyrs'
);
-- The answer:
SELECT p.name
FROM person AS p
JOIN address AS a ON p.address_id = a.id
WHERE a.number = 27
  AND a.street = 'rue des Martyrs'
  AND p.occupation = 'jeweller';

-- 06. Follow the Francs (JOIN x3 + SUM) -> the account number: 88213
-- The jeweller's account: 44170.
SELECT id
FROM bank_account
WHERE person_id = (
  SELECT id
  FROM person
  WHERE name = 'Ernest Grimaud'
);
-- What it paid each account in May: the biggest single cheque (a decoy) is not the biggest total (three payments).
SELECT counterparty_id, COUNT(*) AS payments, SUM(amount) AS total, MAX(amount) AS biggest
FROM bank_transaction
WHERE account_id = 44170
  AND date BETWEEN 19120501 AND 19120531
GROUP BY counterparty_id
ORDER BY total DESC;
-- The answer:
SELECT t.counterparty_id
FROM person AS p
JOIN bank_account AS b ON b.person_id = p.id
JOIN bank_transaction AS t ON t.account_id = b.id
WHERE p.name = 'Ernest Grimaud'
  AND t.date BETWEEN 19120501 AND 19120531
GROUP BY t.counterparty_id
ORDER BY SUM(t.amount) DESC
LIMIT 1;

-- 07. A Wire Before Dawn (CASE WHEN) -> the telegram id: 2718
-- The Ritz desk's wires that day: one before six in the morning, at 03:30.
SELECT time
FROM telegram
WHERE office = 'Ritz'
  AND date = 19120518
ORDER BY time;
-- The answer:
SELECT id
FROM (
  SELECT id, CASE WHEN time < '06:00' THEN 'night' WHEN time < '12:00' THEN 'morning' WHEN time < '18:00' THEN 'afternoon' ELSE 'evening' END AS period
  FROM telegram
  WHERE office = 'Ritz'
    AND date = 19120518
) AS t
WHERE period = 'night';

-- 08. The First Order Before Dawn (RANK() OVER + subquery) -> the guest's name: Rupert Blakeney
-- The night wire names his first order before dawn: Clicquot 1904.
SELECT text
FROM telegram
WHERE id = 2718;
-- Rank each suite's orders of the 18th by time: his is the suite whose FIRST order is the champagne, before six (Ortega also drank it that night, but after a coffee). The register names that suite's guest.
-- The answer:
SELECT guest_name
FROM hotel_register
WHERE floor = 2
  AND checkin <= 19120518
  AND checkout > 19120518
  AND suite = (
  SELECT suite
  FROM (
    SELECT suite, item, time, RANK() OVER (PARTITION BY suite ORDER BY time) AS rk
    FROM room_service
    WHERE date = 19120518
  ) AS ranked
  WHERE rk = 1
    AND item = 'Clicquot 1904'
    AND time < '06:00'
);

-- 09. The Trunk (CTE + JOIN) -> the trunk number: A-7
-- Put each of Ashcombe's trunks next to the ticket it travelled on, then keep the one whose ticket belongs to somebody else: the unknown gentleman who paid cash.
-- The answer:
WITH ashcombe_trunks AS (
  SELECT l.trunk_no, t.person_id
  FROM luggage AS l
  JOIN train_ticket AS t ON l.ticket_id = t.id
  WHERE l.owner_name = 'Lord Ashcombe'
)
SELECT trunk_no
FROM ashcombe_trunks AS a
JOIN person AS p ON a.person_id = p.id
WHERE p.name <> 'Lord Ashcombe';

-- 10. Never Seen Together (NOT EXISTS / self-join) -> the guest's name: Mr. Grey
-- Regulars have six stays or more. Two stays share a night when each checks in before the other checks out; keep the regular who never shares one with Blakeney. The Baron and Mr. Bell each share exactly one, so one name is left: the same man, under two names.
-- The answer:
SELECT g.guest_name
FROM (
  SELECT guest_name
  FROM hotel_register
  GROUP BY guest_name
  HAVING COUNT(*) >= 6
) AS g
WHERE g.guest_name <> 'Rupert Blakeney'
  AND NOT EXISTS (
  SELECT 1
  FROM hotel_register AS x
  JOIN hotel_register AS y ON x.guest_name = 'Rupert Blakeney'
    AND y.guest_name = g.guest_name
  WHERE x.checkin < y.checkout
    AND y.checkin < x.checkout
);

-- 11. The Silence (LAG() OVER) -> the suite number: 214
-- The lift that night: one suite rang at 02:05 (down) and 03:10 (up), and nothing in between.
SELECT time, suite, direction
FROM lift_log
WHERE date = 19120518
  AND time < '06:00'
ORDER BY time;
-- Merge the night's three ledgers into one list of (suite, time); LAG gives each event the suite's previous one. The silent suite has an event at or before 02:05 followed by nothing until 03:10 or later. Suite 407's longer silence only starts at 03:10.
-- The answer:
WITH ev AS (
  SELECT suite, time
  FROM lift_log
  WHERE date = 19120518
    AND time < '06:00'
  UNION ALL
  SELECT suite, time
  FROM room_service
  WHERE date = 19120518
    AND time < '06:00'
  UNION ALL
  SELECT suite, time
  FROM telegram
  WHERE date = 19120518
    AND time < '06:00'
    AND suite IS NOT NULL
), gaps AS (
  SELECT suite, time, LAG(time) OVER (PARTITION BY suite ORDER BY time) AS prev
  FROM ev
)
SELECT suite
FROM gaps
WHERE prev <= '02:05'
  AND time >= '03:10';

-- 12. Follow the Money (WITH RECURSIVE) -> the person's name: Comtesse de Cagliostro
-- Add up each account's transfers to each counterparty after the theft (one hop was paid in two halves). From the shell account's 40000 francs, follow only the transfer worth 98 percent of the previous one, to the franc (a shell account's other deal that day falls away), seven hops down, then read the owner.
-- The answer:
WITH RECURSIVE flows AS (
  SELECT account_id, counterparty_id, SUM(amount) AS amount
  FROM bank_transaction
  WHERE date >= 19120518
    AND type = 'transfer'
  GROUP BY account_id, counterparty_id
), chain(account_id, amount, hop) AS (
  SELECT 88213, 40000, 0
  UNION ALL
  SELECT f.counterparty_id, f.amount, c.hop + 1
  FROM chain AS c
  JOIN flows AS f ON f.account_id = c.account_id
  WHERE ABS(f.amount - c.amount * 0.98) <= 1
)
SELECT p.name
FROM chain AS c
JOIN bank_account AS b ON b.id = c.account_id
JOIN person AS p ON p.id = b.person_id
WHERE c.hop = 7;
