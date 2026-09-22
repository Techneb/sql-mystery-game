-- The Ritz Affair: reference path (seed 1912). Each chapter's discovery queries find the filter; the final query finds the answer.

-- 01. The Night of the 17th (SELECT / WHERE) -> the report id (a number): 4127
SELECT transcript FROM interview WHERE person_name = 'Marcel Duroc';
SELECT id FROM police_report WHERE place = 'Hotel Ritz' AND date = 19120518 AND type = 'theft';

-- 02. The Neighbouring Suite (ORDER BY / LIMIT) -> the guest's name: Lord Ashcombe
SELECT description FROM police_report WHERE id = 4127;
SELECT guest_name FROM hotel_register WHERE floor = 2 AND checkin <= 19120517 AND checkout > 19120517 ORDER BY price DESC LIMIT 1;

-- 03. A Plate in the Dark (LIKE) -> the plate (75-2 and three digits): 75-2041
SELECT transcript FROM interview WHERE person_name = 'Lord Ashcombe';
SELECT plate FROM cab_ride WHERE plate LIKE '75-2%' AND pickup = 'Place Vendome' AND date = 19120518 AND time >= 200;

-- 04. The Cab's Week (GROUP BY / HAVING) -> the address (number and street): 27 rue des Martyrs
SELECT dropoff, COUNT(*) AS n FROM cab_ride WHERE plate = '75-2041' AND date BETWEEN 19120513 AND 19120519 GROUP BY dropoff ORDER BY n DESC;
SELECT dropoff FROM cab_ride WHERE plate = '75-2041' AND date BETWEEN 19120513 AND 19120519 GROUP BY dropoff HAVING COUNT(*) >= 3;

-- 05. The Boarding House (JOIN) -> the person's name: Ernest Grimaud
SELECT id FROM address WHERE number = 27 AND street = 'rue des Martyrs';
SELECT name, occupation FROM person WHERE address_id = (SELECT id FROM address WHERE number = 27 AND street = 'rue des Martyrs');
SELECT p.name FROM person AS p JOIN address AS a ON p.address_id = a.id WHERE a.number = 27 AND a.street = 'rue des Martyrs' AND p.occupation = 'jeweller';

-- 06. Follow the Francs (JOIN x3 + SUM) -> the account number (five digits): 88213
SELECT id FROM bank_account WHERE person_id = (SELECT id FROM person WHERE name = 'Ernest Grimaud');
SELECT counterparty_id, SUM(amount) AS total FROM bank_transaction WHERE account_id = (SELECT id FROM bank_account WHERE person_id = (SELECT id FROM person WHERE name = 'Ernest Grimaud')) AND date BETWEEN 19120501 AND 19120531 GROUP BY counterparty_id;
SELECT t.counterparty_id FROM person AS p JOIN bank_account AS b ON b.person_id = p.id JOIN bank_transaction AS t ON t.account_id = b.id WHERE p.name = 'Ernest Grimaud' AND t.date BETWEEN 19120501 AND 19120531 GROUP BY t.counterparty_id ORDER BY SUM(t.amount) DESC LIMIT 1;

-- 07. A Wire Before Dawn (CASE WHEN) -> the telegram id (a number): 2718
SELECT time FROM telegram WHERE office = 'Ritz' AND date = 19120518 ORDER BY time;
SELECT id FROM (SELECT id, CASE WHEN time < 600 THEN 'night' WHEN time < 1200 THEN 'morning' WHEN time < 1800 THEN 'afternoon' ELSE 'evening' END AS period FROM telegram WHERE office = 'Ritz' AND date = 19120518) AS t WHERE period = 'night';

-- 08. The First Order Before Dawn (RANK() OVER + subquery) -> the guest's name: Rupert Blakeney
SELECT text FROM telegram WHERE id = 2718;
SELECT guest_name FROM hotel_register WHERE floor = 2 AND checkin <= 19120518 AND checkout > 19120518 AND suite = (SELECT suite FROM (SELECT suite, item, time, RANK() OVER (PARTITION BY suite ORDER BY time) AS rk FROM room_service WHERE date = 19120518) AS ranked WHERE rk = 1 AND item = 'Clicquot 1904' AND time < 600);

-- 09. The Trunk (CTE + JOIN) -> the trunk number (a letter, a dash, a digit): A-7
WITH ashcombe_trunks AS (SELECT l.trunk_no, t.person_id FROM luggage AS l JOIN train_ticket AS t ON l.ticket_id = t.id WHERE l.owner_name = 'Lord Ashcombe') SELECT trunk_no FROM ashcombe_trunks AS a JOIN person AS p ON a.person_id = p.id WHERE p.name <> 'Lord Ashcombe';

-- 10. Never Seen Together (NOT EXISTS / self-join) -> the guest's name: Mr. Grey
SELECT g.guest_name FROM (SELECT guest_name FROM hotel_register GROUP BY guest_name HAVING COUNT(*) >= 6) AS g WHERE g.guest_name <> 'Rupert Blakeney' AND NOT EXISTS (SELECT 1 FROM hotel_register AS x JOIN hotel_register AS y ON x.guest_name = 'Rupert Blakeney' AND y.guest_name = g.guest_name WHERE x.checkin < y.checkout AND y.checkin < x.checkout);

-- 11. The Silence (LAG() OVER) -> the suite number: 214
WITH ev AS (SELECT suite, time FROM lift_log WHERE date = 19120518 AND time < 600 UNION ALL SELECT suite, time FROM room_service WHERE date = 19120518 AND time < 600 UNION ALL SELECT suite, time FROM telegram WHERE date = 19120518 AND time < 600 AND suite IS NOT NULL), gaps AS (SELECT suite, time, LAG(time) OVER (PARTITION BY suite ORDER BY time) AS prev FROM ev) SELECT suite FROM gaps WHERE prev <= 205 AND time >= 310;

-- 12. Follow the Money (WITH RECURSIVE) -> the person's name: Comtesse de Cagliostro
WITH RECURSIVE flows AS (SELECT account_id, counterparty_id, SUM(amount) AS amount FROM bank_transaction WHERE date >= 19120518 AND type = 'transfer' GROUP BY account_id, counterparty_id), chain(account_id, amount, hop) AS (SELECT 88213, 40000, 0 UNION ALL SELECT f.counterparty_id, f.amount, c.hop + 1 FROM chain AS c JOIN flows AS f ON f.account_id = c.account_id WHERE ABS(f.amount - c.amount * 0.98) <= 1) SELECT p.name FROM chain AS c JOIN bank_account AS b ON b.id = c.account_id JOIN person AS p ON p.id = b.person_id WHERE c.hop = 7;
