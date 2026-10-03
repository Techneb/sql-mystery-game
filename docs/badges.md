# Badges: the full list (spoilers, for the teacher)

38 badges, defined in `BADGES` in `site/app.js` (name, the text the student sees, the rule). Students see
every badge's slot in the Badges panel, but a locked one shows no name and no text, so this page is the only
place they are all spelled out. The Part II pop-up tells a student how many are still missing and invites a
new investigation to hunt for them. Keep this page in step with `BADGES` when a badge is added or changed.

"A query" means one the student runs in the terminal; "result" means the rows on screen.

## Progress

| Badge | How to get it |
|---|---|
| Gare du Nord | Solve chapter VIII (Part I closed). |
| Ganimard | Solve all twelve chapters. |
| Egg Hunter | Type the Part II code from the telegram to the curious clerk. |
| Sniper | Solve a chapter with the first query run in it. |
| Speed Reader | Solve a chapter within two minutes of opening it (at least one query). |
| Haiku | Solve a chapter whose last query is three lines or fewer (at least one query). |
| Persistent | Run twenty queries in one chapter. |

## SQL techniques

| Badge | How to get it |
|---|---|
| Tourist | `SELECT *` on something with seven columns or more. |
| First JOIN | Any query with `JOIN`. |
| Three's a Crowd | Two `JOIN`s in one query (three tables). |
| Aliased | Any query with `AS`. |
| Bouncer | Any query with `DISTINCT`. |
| Subpoena | A subquery: `(SELECT ...` inside a query. |
| Null and Void | Any query with `IS NULL`. |
| Wildcard | `LIKE` with a `%` in the pattern. |
| Top of the Class | `ORDER BY ... DESC ... LIMIT 1`. |
| Commentator | A comment (`--` or `/* */`) in a query. |
| Early HAVING | `HAVING` before chapter 4. |
| Window Shopper | A window function, `OVER (`, before chapter 8. |
| Recursive | Any query with `WITH RECURSIVE` (chapter 12 needs one). |
| Novelist | A query of more than fifteen lines. |
| Archivist | Query `sqlite_master` (the list of tables). |
| Trespasser | Query a table the schema has not revealed yet (CTE names do not count). |

## Results

| Badge | How to get it |
|---|---|
| Needle | A query that returns exactly one row. |
| Haystack | A query that returns more than 200 rows (more than the screen shows). |
| Ghost Hunter | A query that runs without error and returns no rows. |
| Typo | Five queries in a row that end in an error. |

## Wrong answers on purpose

| Badge | How to get it |
|---|---|
| Filed Under the 17th | Chapter 1: answer the decoy report of the 17th instead of the 18th. |
| Anagram | Answer "Paul Sernine" (an anagram of Arsene Lupin). |
| Wrong Frenchman | Answer "Horace Velmont". |
| Gentleman | Answer "Arsene Lupin". |

## Hidden in the archives (easter eggs)

These only count when the result on screen has ten rows or fewer, so a `SELECT *` over a whole table hands
none of them out: the student has to search.

| Badge | How to get it |
|---|---|
| Madeleine | Show Monsieur Proust's police report ("a madeleine missing"): e.g. `SELECT * FROM police_report WHERE description LIKE '%madeleine%'`. |
| Rosebud | Show the report of the man in the cape asking for Rosebud (`LIKE '%rosebud%'`). |
| Film Buff | Bring up five different film quotes hidden in the noise text (police reports, interviews, telegrams...): "would be back", "rosebud", "offer he could not refuse", "no place like home", "tin suit", "do not give a damn", "I see dead people", "Houston", "elementary, inspector", "may the force", "simply walk into", "little friend", "you talking to me", "there is no spoon", "Bond, Jean Bond". |
| Time Traveller | Search for a date after 1912 (a `YYYYMMDD` number from 1913 on, e.g. `WHERE date > 19130101`). |

## Around the page

| Badge | How to get it |
|---|---|
| Paparazzo | Open the Suspects gallery. |
| Lamplighter | Switch between the Day and Night editions (top-right button). |
| Insomniac | Run a query between midnight and five in the morning (the student's own clock). |
