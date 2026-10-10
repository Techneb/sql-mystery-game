// site/leaderboard.js -- the public board (leaderboard.html?data=<Apps Script /exec URL>&season=<id>): read-only,
// projector-sized, polls the season record and its rows every 10 s. Pure renderers are exported for test_site.mjs;
// the page wiring runs only in a browser. The deployment URL travels in the link, never in this public repo.
import { officialTime, fmtTime, escapeHtml as esc } from "./shared.js";

export const POLL_MS = 10000;
const FLAG_TITLE = "The browser's own clock disagrees with the server by more than a minute: a late or lost post.";

// Eight cells, the first `solved` filled (chapters are solved in order).
export const stripHtml = solved => '<span class="strip" aria-label="' + solved + ' of 8 chapters">' +
  Array.from({ length: 8 }, (_, i) => '<i class="' + (i < solved ? "on" : "") + '"></i>').join("") + "</span>";

export const timeHtml = p => p.finished
  ? fmtTime(p.ms) + (p.flagged ? ' <abbr title="' + esc(FLAG_TITLE) + '">?</abbr>' : "")
  : "chapter " + p.chapter;

export const rankingHtml = ranking => '<table class="ranking"><tbody>' + ranking.map(p =>
  '<tr class="' + (p.finished ? "done" : "playing") + '"><td class="rank">' + p.rank + '</td><td class="team">' + esc(p.team) +
  "</td><td>" + stripHtml(p.solved) + '</td><td class="time">' + timeHtml(p) + "</td></tr>").join("") + "</tbody></table>";

export const waitingHtml = ranking => '<p class="waiting">Waiting for the teacher</p><p class="count">' + ranking.length +
  (ranking.length === 1 ? " detective" : " detectives") + ' joined</p><ul class="joined">' +
  ranking.map(p => "<li>" + esc(p.team) + "</li>").join("") + "</ul>";

// Top three finishers (finished players rank first), second place on the left, the winner in the middle, as on a podium.
export const podiumHtml = ranking => {
  const f = ranking.filter(p => p.finished);
  return f.length ? '<ol class="podium">' + [f[1], f[0], f[2]].filter(Boolean).map(p =>
    '<li class="place-' + p.rank + '"><span class="place">' + p.rank + '</span><span class="team">' + esc(p.team) +
    '</span><span class="time">' + timeHtml(p) + "</span></li>").join("") + "</ol>" : "";
};

// The page body for a season record and its rows: { head, dateline, body } as HTML strings.
export function boardHtml(meta, rows) {
  const ranking = officialTime(rows, meta);
  const head = esc(meta.name), date = esc(meta.date);
  if (meta.state === "created") return { head, dateline: date, body: waitingHtml(ranking) };
  const empty = ranking.length ? "" : '<p class="waiting">No detective yet.</p>';
  if (meta.state === "closed") return { head, dateline: date + " &middot; Session closed",
    body: (ranking.length ? podiumHtml(ranking) + rankingHtml(ranking) : empty) };
  return { head, dateline: date, body: ranking.length ? rankingHtml(ranking) : empty };
}

async function getJson(base, params) {
  const u = new URL(base);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return (await fetch(u, { signal: AbortSignal.timeout(15000) })).json();
}

async function main() {
  const p = new URLSearchParams(location.search), data = p.get("data") || "", id = p.get("season") || "";
  const $ = el => document.getElementById(el);
  const say = msg => { $("board").innerHTML = '<p class="waiting">' + esc(msg) + "</p>"; };
  try { new URL(data); } catch { return say("No board here: open it from the teacher's page."); }
  if (!id) return say("No season in this link: open it from the teacher's page.");
  // One chain of timeouts: the next poll is scheduled only once this one has answered, so polls never overlap.
  async function tick() {
    let meta, rows;
    try { [meta, rows] = await Promise.all([getJson(data, { meta: id }), getJson(data, { season: id })]); }
    catch { $("updated").textContent = "Could not reach the board; trying again."; setTimeout(tick, POLL_MS); return; }
    if (!meta || meta.id !== id) return say("This season does not exist.");
    const b = boardHtml(meta, Array.isArray(rows) ? rows : []);
    document.title = meta.name + " -- The Ritz Affair";
    $("headline").innerHTML = b.head; $("dateline").innerHTML = b.dateline; $("board").innerHTML = b.body;
    $("updated").textContent = "Updated " + new Date().toLocaleTimeString();
    if (meta.state !== "closed") setTimeout(tick, POLL_MS);   // nothing changes once closed
  }
  tick();

}

if (typeof document !== "undefined") main();
