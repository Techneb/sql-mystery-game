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
 dict(n=9, part=2, construct="CTE + JOIN", tables=["train_ticket", "luggage"], answer_key="trunk_no",
  solution="WITH ashcombe_trunks AS (SELECT l.trunk_no, t.person_id FROM luggage AS l JOIN train_ticket AS t ON l.ticket_id = t.id WHERE l.owner_name = '{neighbour}') SELECT trunk_no FROM ashcombe_trunks AS a JOIN person AS p ON a.person_id = p.id WHERE p.name <> '{neighbour}'",
  naive="SELECT trunk_no FROM luggage WHERE owner_name = '{neighbour}'", naive_rows=4),
 dict(n=10, part=2, construct="NOT EXISTS / self-join", tables=[], answer_key="double_alias",
  solution="SELECT g.guest_name FROM (SELECT guest_name FROM hotel_register GROUP BY guest_name HAVING COUNT(*) >= 6) AS g WHERE g.guest_name <> '{lupin_alias}' AND NOT EXISTS (SELECT 1 FROM hotel_register AS x JOIN hotel_register AS y ON x.guest_name = '{lupin_alias}' AND y.guest_name = g.guest_name WHERE x.checkin < y.checkout AND y.checkin < x.checkout)",
  naive="SELECT guest_name FROM hotel_register GROUP BY guest_name HAVING COUNT(*) >= 6", naive_rows=None),
 dict(n=11, part=2, construct="LAG() OVER", tables=["lift_log"], answer_key="lupin_suite",
  solution="WITH ev AS (SELECT suite, time FROM lift_log WHERE date = {theft_date} AND time < 600 UNION ALL SELECT suite, time FROM room_service WHERE date = {theft_date} AND time < 600 UNION ALL SELECT suite, time FROM telegram WHERE date = {theft_date} AND time < 600 AND suite IS NOT NULL), gaps AS (SELECT suite, time, LAG(time) OVER (PARTITION BY suite ORDER BY time) AS prev FROM ev) SELECT suite FROM gaps WHERE prev <= 205 AND time >= 310",
  naive="SELECT suite FROM lift_log WHERE date = {theft_date} AND time < 600 GROUP BY suite HAVING COUNT(*) <= 2", naive_rows=2),
 dict(n=12, part=2, construct="WITH RECURSIVE", tables=[], answer_key="comtesse",
  solution="WITH RECURSIVE flows AS (SELECT account_id, counterparty_id, SUM(amount) AS amount FROM bank_transaction WHERE date >= {theft_date} AND type = 'transfer' GROUP BY account_id, counterparty_id), chain(account_id, amount, hop) AS (SELECT {shell_account}, {chain_amount}, 0 UNION ALL SELECT f.counterparty_id, f.amount, c.hop + 1 FROM chain AS c JOIN flows AS f ON f.account_id = c.account_id WHERE ABS(f.amount - c.amount * 0.98) <= 1) SELECT p.name FROM chain AS c JOIN bank_account AS b ON b.id = c.account_id JOIN person AS p ON p.id = b.person_id WHERE c.hop = 7",
  naive="WITH RECURSIVE chain(account_id, amount, hop) AS (SELECT {shell_account}, {chain_amount}, 0 UNION ALL SELECT t.counterparty_id, t.amount, c.hop + 1 FROM chain AS c JOIN bank_transaction AS t ON t.account_id = c.account_id WHERE ABS(t.amount - c.amount * 0.98) <= 1) SELECT account_id FROM chain WHERE hop = 7", naive_rows=0),
]

CAST = [
  dict(name="Lord Ashcombe", nationality="English", bio="Peer of the realm, Suite Imperiale. Collects clocks and grievances."),
  dict(name="Paul Sernine", nationality="French", bio="Rentier. Nobody has ever seen him pay for anything."),
  dict(name="Horace Velmont", nationality="French", bio="Painter of society portraits. Paints mostly at night."),
  dict(name="Raul Ortega", nationality="Argentine", bio="Cattle baron. Signs everything with a flourish and an R."),
  dict(name="Ines de Almagro", nationality="Spanish", bio="Widow. Travels with eleven trunks and one maid."),
  dict(name="Rupert Blakeney", nationality="English", bio="Gentleman of leisure from Bath. Excellent coat."),
]

# keys are normalised names (see generate_db.normalise), so the page can look a wrong answer up directly
WRONG_SUSPECTS = {
  "paul sernine": "An anagram, Ganimard? Lupin is vain, not stupid. Sernine is released with apologies.",
  "horace velmont": "Velmont was painting the Prefect's wife at the hour of the theft. The Prefect confirms it, twice.",
  "raul ortega": "Senor Ortega produces a receipt for the champagne and a lawyer for everything else.",
  "ines almagro": "The Senora faints. The maid does not. Neither is Lupin.",
  "ashcombe": "You arrest the peer in the neighbouring suite. He is the Prefect's cousin. Awkward.",
  "arsene lupin": "Yes. Under which name? That is rather the question.",
  "grey": "Mr. Grey checked out this morning. The concierge is certain, because Mr. Grey tipped him.",
  "ganimard": "The inspector reads your note, takes off his hat, and puts it back on. 'Out.'",
}
WRONG_DEFAULT = [
  "Ganimard reads your note twice and lights his pipe. 'No.'",
  "The clerk before you was dismissed for less. Try again.",
  "Not that, mon petit. Look at the data again.",
]
ENDINGS = dict(
  part1="Gare du Nord, 20 May, 09:10. Ganimard's hand falls on the shoulder of {lupin_alias}, Esq. The gentleman turns, smiles, and hands the inspector a small velvet case. It is empty. 'You have my name, Inspector. The Blue Star has a train to catch.' Behind him, the boat train pulls out.",
  part2="The Comtesse receives Ganimard in her suite, now insured for three hundred thousand francs. She offers tea. Ganimard declines, which is a first. You are promoted to a desk with a window. Lupin, in London, sends a telegram.",
)

TEXT = {
 1: dict(
  title="The Night of the 17th",
  story="Paris, May 1912. The Comtesse de Cagliostro wakes at the Ritz to find her sapphire, the Blue Star, gone and a calling card on the pillow: A. L. Inspector Ganimard has been called at three in the morning and is in no mood. You are his clerk. He drops a stack of police reports on your desk. 'Find ours.'",
  objective="Find the police report for the theft at the Hotel Ritz on 18 May 1912 (dates are written 19120518).",
  answer_form="the report id (a number)",
  hints=[],
  telegram="MY DEAR GANIMARD STOP YOU FOUND THE REPORT STOP THE BALCONY WAS DELIGHTFUL STOP ASK WHO PAYS THE MOST STOP A L"),
 2: dict(
  title="The Neighbouring Suite",
  story="'The thief came over the balcony of the neighbouring suite, the most expensive one on the floor,' Ganimard reads aloud, as if the report had insulted him. The Ritz keeps a register: every guest, every suite, every price, since January. Six months of it, and the prices on the second floor are all within a few francs of each other. 'The name of whoever slept in the priciest suite on the second floor on the night of the 17th. Not the second priciest. The priciest.'",
  objective="In hotel_register, find the guest on floor 2 whose stay covers the night of 17 May 1912 (checkin <= 19120517 and checkout > 19120517) and who pays the highest price.",
  answer_form="the guest's name",
  hints=[],
  telegram="MY DEAR GANIMARD STOP HIS LORDSHIP SNORES STOP I CROSSED HIS BALCONY TWICE AND HE NEVER STIRRED STOP HIS VALET SLEEPS LESS STOP ASK HIM ABOUT MY COAT STOP A L"),
 3: dict(
  title="A Plate Beginning With {plate_prefix}",
  story="His Lordship, when woken, is displeased but useful. His valet saw a man in an English coat leave by the service door and take a motor-cab on the Place Vendome. The plate began with {plate_prefix}; the rest, he says, was in the dark, and the fellow tipped in English coins. 'Forty cabs in Paris begin with {plate_prefix},' says Ganimard. 'The company keeps a book. Find me the one that left the Place Vendome after two in the morning.'",
  objective="Read the neighbour's statement in interview, then find in cab_ride the ride picked up at Place Vendome on 19120518 after 02:00 (time >= 200) whose plate begins with {plate_prefix}.",
  answer_form="the plate (75-2 and three digits)",
  hints=[],
  telegram="MY DEAR GANIMARD STOP THE CAB SMELLED OF CIGARS STOP THE DRIVER KNOWS THE WAY STOP HE HAS TAKEN ME THERE BEFORE STOP READ HIS WEEK STOP A L"),
 4: dict(
  title="The Cab's Week",
  story="The driver of the cab has a bad memory and a good book. Ganimard reads the week before the theft: sixty fares, the 13th to the 19th. 'A thief with a plan visits his fence before the job. Twice. Three times. Find me the address this cab dropped at three times or more that week. I do not want the list. I want the address.'",
  objective="In cab_ride, for the plate you found in chapter 3, between 19120513 and 19120519, find the dropoff address visited at least three times.",
  answer_form="the address (number and street)",
  hints=[],
  telegram="MY DEAR GANIMARD STOP THREE TIMES TO THE SAME DOOR STOP HABIT IS THE ENEMY OF ART STOP THE HOUSE HAS FIVE TENANTS AND ONE OF THEM OWNS A LOUPE STOP A L"),
 5: dict(
  title="The Boarding House",
  story="The address is a boarding house: five tenants and a landlady who has seen nothing since 1889. Ganimard wants the tenant whose trade is jeweller; every fence in Paris calls himself a jeweller. 'Persons are in one ledger, addresses in another. The Prefecture has never put the two together. You will.'",
  objective="Join person to address (person.address_id = address.id). Find the tenant at the address of chapter 4 (number and street are two columns of address) whose occupation is jeweller.",
  answer_form="the person's name",
  hints=[],
  telegram="MY DEAR GANIMARD STOP GRIMAUD PAID ME WELL AND PROMPTLY STOP HE BANKS AT THE CREDIT LYONNAIS STOP HE PAYS A GREAT MANY PEOPLE STOP ADD IT UP STOP A L"),
 6: dict(
  title="Follow the Francs",
  story="The jeweller keeps an account at the Credit Lyonnais and, since Ganimard has a warrant, the bank keeps nothing from him. Twenty-four payments in May, to a dozen people. 'A fence pays a thief in pieces, so the bank does not blink. Do not show me the biggest cheque, that is what he wants you to see. Show me the account that received the most from him in total this month.'",
  objective="Join person, bank_account (bank_account.person_id = person.id) and bank_transaction (bank_transaction.account_id = bank_account.id). For the jeweller of chapter 5, in May 1912 (date between 19120501 and 19120531), find the counterparty_id that received the largest total amount.",
  answer_form="the account number (five digits)",
  hints=[],
  telegram="MY DEAR GANIMARD STOP THE SUM NOT THE LARGEST STOP YOU ARE LEARNING STOP I CONFIRMED RECEIPT BY WIRE FROM THE RITZ DESK BEFORE DAWN STOP THE CLERK THERE READS NOTHING STOP A L"),
 7: dict(
  title="A Wire Before Dawn",
  story="The Ritz telegraph desk sent eighty wires on the 18th and its clerk is too proud to have read any of them. Ganimard has his own idea of a day: night before six, morning before noon, afternoon before six, evening after that. 'Sort them into my four boxes and bring me the one sent at night. The sender confirms a payment to the account you found in chapter 6. He signs with one letter, which is one more than he needs.'",
  objective="In telegram, for office Ritz on 19120518, classify each wire by time as night (before 0600), morning (before 1200), afternoon (before 1800) or evening, and find the single one sent at night.",
  answer_form="the telegram id (a number)",
  hints=[],
  telegram="MY DEAR GANIMARD STOP YOU READ MY WIRE STOP AS ALWAYS MY FIRST ORDER BEFORE DAWN STOP A MAN OF HABIT IS A MAN WITH A ROOM NUMBER STOP A L"),
 8: dict(
  title="The First Order Before Dawn",
  story="'As always my first order before dawn.' Ganimard underlines it. 'A man of habit. The Ritz keeps a room-service ledger. Find me the suite whose FIRST order of the 18th was {champagne}, before six. Not any order. The first.' Senor Ortega, you recall, also likes champagne.",
  objective="Using room_service for 19120518, rank each suite's orders by time. Find the suite whose rank-1 order is {champagne} before 06:00, then the guest registered in that suite on floor 2 that night.",
  answer_form="the guest's name",
  hints=[],
  telegram="MY DEAR GANIMARD STOP GARE DU NORD NINE FIFTEEN STOP DO NOT BE LATE STOP THE BLUE STAR SENDS REGARDS FROM LONDON STOP CHAPTER IX IF YOU DARE STOP A L"),
 9: dict(
  title="The Trunk",
  story="Ganimard has gone home to his cat. You have not. The Blue Star 'sends regards from London': the boat train left the Gare du Nord on the 19th and {neighbour} was on it, with his trunks. So was somebody else's ticket. Every trunk in the baggage car is entered under an owner's name and a ticket number, and nobody at the Compagnie du Nord checks that the two agree. Find the trunk that says Ashcombe on the label but travelled on a ticket bought by a man who is not Ashcombe.",
  objective="Using a CTE, list the trunks in luggage whose owner_name is {neighbour} together with the person_id of their train_ticket, then keep the one whose ticket holder (in person) is not {neighbour}.",
  answer_form="the trunk number (a letter, a dash, a digit)",
  hints=[],
  telegram="MY DEAR CLERK STOP HIS LORDSHIP CARRIED THE STONE THROUGH CUSTOMS WITH A CLEAR CONSCIENCE STOP THE TICKET WAS BOUGHT BY A REGULAR STOP YOU HAVE NEVER SEEN US TOGETHER STOP A L"),
 10: dict(
  title="Never Seen Together",
  story="The ticket was bought for cash. The clerk remembers only 'a regular, monsieur, English, excellent coat', which describes half the second floor. The Ritz has a handful of regulars who have stayed often since January. So has Mr. Blakeney. You have a suspicion of the theatrical kind: two names, one man, and a man cannot sleep in two suites on the same night. Among the regular guests, six stays or more, find the one who has never once been in the hotel on the same night as Blakeney. Beware: the Baron and Mr. Bell each crossed him for exactly one night, and one night is enough to be two people.",
  objective="In hotel_register, among guests with at least 6 stays, find the one (other than {lupin_alias}) whose stays never overlap a stay of {lupin_alias}. Two stays overlap when x.checkin < y.checkout AND y.checkin < x.checkout.",
  answer_form="the guest's name",
  hints=[],
  telegram="MY DEAR CLERK STOP GREY IN THE ODD WEEKS BLAKENEY IN THE EVEN STOP THE CONCIERGE NEVER NOTICED STOP ON THE NIGHT OF THE 17TH MY SUITE WAS VERY QUIET FOR ONE HOUR STOP A L"),
 11: dict(
  title="The Silence",
  story="Every suite makes noise at night: the lift boy writes down who rings, room service writes down who is thirsty, the telegraph desk writes down who wires, and charges it to the suite. Put the three ledgers together for the night of the 18th, suite by suite, in order of time. Somewhere on the second floor a suite fell silent at 02:05, when the lift went down, and woke at 03:10, when it came back up; the porter heard it at 02:10. Suite 407 slept longer, but later. That is not your suite.",
  objective="Combine lift_log, room_service and telegram (rows with a suite) for 19120518 before 06:00 into one list of (suite, time). With LAG(time) OVER (PARTITION BY suite ORDER BY time), find the suite that has an event at or before 02:05 (205) and its next event at or after 03:10 (310).",
  answer_form="the suite number",
  hints=[],
  telegram="MY DEAR CLERK STOP ONE HOUR AND FIVE MINUTES STOP THE BALCONY THE STONE THE CAB THE JEWELLER AND BACK FOR CHAMPAGNE STOP AND THE FORTY THOUSAND FRANCS STOP WHERE DO YOU THINK THEY WENT STOP A L"),
 12: dict(
  title="Follow the Money",
  story="The last of the forty thousand francs reached the shell account of chapter 6 on the 21st; the first of it had already left on the 20th. From there the money moves every three days, less two percent at every door, through shell accounts at four banks, into June. One hop was paid in two halves. One shell account did other business the same day. Follow the ninety-eight percent, and only the ninety-eight percent, seven doors down, and read the name on the last account. Ganimard will not like it.",
  objective="With a recursive CTE, start from the account of chapter 6 with {chain_amount} F at hop 0 and follow, hop by hop, the transfer (or the sum of the transfers between the same two accounts) whose amount is within 1 F of 98% of the previous hop, using bank_transaction from 19120518 on. Find the person who owns the account at hop 7.",
  answer_form="the person's name",
  hints=[],
  telegram="MY DEAR GANIMARD STOP INSURANCE PAYS THREE HUNDRED THOUSAND FOR A STONE WORTH FORTY THOUSAND STOP ARITHMETIC IS THE GREATEST OF CRIMES STOP A L"),
}
for _ch in CHAPTERS:
    _ch.update(TEXT[_ch["n"]])
