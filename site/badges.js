// site/badges.js -- the badges (BADGES: name, text, predicate on an event context that app.js ctx() builds), the
// easter eggs read from narrow results, and the ranks. Pure, side-effect free; docs/badges.md lists every badge.
import { ROW_CAP, tablesIn } from "./terminal.js";

export const BADGES = [
  ["Tourist", "SELECT * over seven columns or more. Ganimard sighs.", c => c.event === "query" && /select\s+\*/i.test(c.sql) && c.cols >= 7],
  ["Needle", "A query that returned exactly one row.", c => c.event === "query" && c.rows === 1],
  ["Haystack", "A result too long to show. Two hundred rows is the clerk's limit.", c => c.event === "query" && c.rows > ROW_CAP],
  ["First JOIN", "Two ledgers, one question.", c => c.event === "query" && /\bjoin\b/i.test(c.sql)],
  ["Three's a Crowd", "Three tables in one query.", c => c.event === "query" && (c.sql.match(/\bjoin\b/gi) || []).length >= 2],
  ["Early HAVING", "HAVING before chapter 4. Somebody has been reading ahead.", c => c.event === "query" && /\bhaving\b/i.test(c.sql) && c.chapter < 4],
  ["Aliased", "AS. Ganimard approves of short names.", c => c.event === "query" && /\bas\b/i.test(c.sql)],
  ["Novelist", "A query of more than fifteen lines.", c => c.event === "query" && c.sql.split("\n").length > 15],
  ["Haiku", "A chapter solved in three lines or fewer.", c => c.event === "solve" && c.lines <= 3 && (c.state.queries[c.chapter] || 0) > 0],
  ["Typo", "Five errors in a row. The typewriter is not to blame.", c => c.event === "query" && c.error && c.state.errorStreak >= 5],
  ["Persistent", "Twenty queries in one chapter.", c => c.event === "query" && (c.state.queries[c.chapter] || 0) >= 20],
  ["Sniper", "A chapter solved on the first query.", c => c.event === "solve" && c.state.queries[c.chapter] === 1],
  ["Insomniac", "A query run between midnight and five.", c => c.event === "query" && c.hour < 5],
  ["Trespasser", "Queried a table the evidence has not reached yet.", c => c.event === "query" && tablesIn(c.sql).some(t => c.allTables.includes(t) && !c.revealed.has(t))],
  ["Archivist", "Read sqlite_master. The card catalogue, in other words.", c => c.event === "query" && /sqlite_master/i.test(c.sql)],
  ["Anagram", "Accused Paul Sernine. Lupin is vain, not stupid.", c => c.event === "answer" && c.norm === "paul sernine"],
  ["Wrong Frenchman", "Accused Horace Velmont. The Prefect's wife is unamused.", c => c.event === "answer" && c.norm === "horace velmont"],
  ["Gentleman", "Answered 'Arsene Lupin'. Yes. Under which name?", c => c.event === "answer" && c.norm === "arsene lupin"],
  ["Window Shopper", "OVER ( before chapter 8.", c => c.event === "query" && /\bover\s*\(/i.test(c.sql) && c.chapter < 8],
  ["Recursive", "WITH RECURSIVE. Ganimard has never seen one and never will.", c => c.event === "query" && /with\s+recursive/i.test(c.sql)],
  ["Egg Hunter", "Found the telegram to the curious clerk.", c => c.event === "code"],
  ["Bouncer", "DISTINCT. Nobody gets in twice.", c => c.event === "query" && /\bdistinct\b/i.test(c.sql)],
  ["Subpoena", "A query inside a query. A question within a question.", c => c.event === "query" && /\(\s*select\b/i.test(c.sql)],
  ["Null and Void", "IS NULL. The absence of evidence is evidence.", c => c.event === "query" && /\bis\s+null\b/i.test(c.sql)],
  ["Wildcard", "LIKE with a %. Half a name is still a name.", c => c.event === "query" && /\blike\s+'[^']*%/i.test(c.sql)],
  ["Commentator", "A comment in a query. Notes in the margin.", c => c.event === "query" && /--|\/\*/.test(c.sql)],
  ["Top of the Class", "ORDER BY ... DESC LIMIT 1. Only the best, or the worst.", c => c.event === "query" && /\border\s+by\b[\s\S]*\bdesc\b[\s\S]*\blimit\s+1\b/i.test(c.sql)],
  ["Ghost Hunter", "A query that found nothing. Lupin was here; the data says otherwise.", c => c.event === "query" && !c.error && c.rows === 0],
  ["Madeleine", "Found Monsieur Proust's report. Seven volumes to follow.", c => c.event === "query" && c.text.includes("a madeleine missing")],
  ["Rosebud", "Found the man in the cape. The sledge was never recovered either.", c => c.event === "query" && c.text.includes("rosebud")],
  ["Film Buff", "Five films quoted in the archives. Cinema was invented in Paris, after all.", c => c.event === "query" && c.state.film.length >= 5],
  ["Time Traveller", "Searched for a date after 1912. The banknote from 2000 was a hint.", c => c.event === "query" && /\b(19(1[3-9]|[2-9]\d)|20\d\d)\d{4}\b/.test(c.sql)],
  ["Paparazzo", "Opened the Suspects gallery. Faces, at last.", c => c.event === "suspects" && c.faces > 0],   // an empty gallery shows no face
  ["Speed Reader", "A chapter solved within two minutes of opening it.", c => c.event === "solve" && c.elapsed < 120000 && (c.state.queries[c.chapter] || 0) > 0],
  ["Filed Under the 17th", "Filed the case under the wrong night. Duroc never sleeps, but he does count.",
    c => c.event === "answer" && c.chapter === 1 && c.decoy != null && c.norm === String(c.decoy)],
  ["Lamplighter", "Switched between the day and night editions. Paris has lit its lamps by hand since 1667.", c => c.event === "theme"],
  ["Gare du Nord", "Part I closed: Lupin has a name, if not a cell.", c => c.event === "part1"],
  ["Ganimard", "All twelve chapters. The inspector retires; you take his desk.", c => c.event === "part2"],
];

// Film Buff: lowercase fragments of the movie lines in generate_db.py's noise pools (keep them verbatim there).
export const FILM_LINES = ["would be back", "rosebud", "offer he could not refuse", "no place like home", "tin suit",
  "do not give a damn", "i see dead people", "houston", "elementary, inspector", "may the force", "simply walk into",
  "little friend", "you talking to me", "there is no spoon", "bond, jean bond"];
// Easter eggs count only in a narrow result: a SELECT * over the archive must not hand them all out.
export const EGG_ROWS = 10;
export function eggText(res) {
  return res && res.values.length <= EGG_ROWS ? res.values.map(r => r.join(" ")).join(" ").toLowerCase() : "";
}
export function seenFilms(text, have) { return have.concat(FILM_LINES.filter(m => text.includes(m) && !have.includes(m))); }

export function detectBadges(ctx, have) {
  return BADGES.filter(([name, , pred]) => !have.includes(name) && pred(ctx)).map(([name, text]) => ({ name, text }));
}

const RANKS = [[30, "Ganimard himself"], [80, "Chief Inspector"], [130, "Inspector"], [Infinity, "Constable"]];  // owner 2026-10-25: 21 is the shortest path (spec, Rank)
export function rank(queries) { return RANKS.find(([q]) => queries <= q)[1]; }
