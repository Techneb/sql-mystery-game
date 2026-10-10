// site/shared.js -- code shared by app.js, admin.js, leaderboard.html and the node tests. No side effect at import:
// no DOM, no storage, no fetch.

export const STOP_WORDS = new Set(["the", "a", "suite", "no", "trunk", "mr", "mrs", "esq", "lord", "senor",
  "senora", "comtesse", "de", "rue", "report", "telegram", "account", "plate",
  "m", "monsieur", "madame", "mme", "miss", "sir", "lady", "countess", "room", "id", "wire", "paris"]);

export function normalise(s) {
  // Same rules as normalise() in generate_db.py. Keep both in sync (fixture in chapters.json).
  // A lone letter glues to the digits after it ("A-7", "A 7", "A7" -> "a7") before stop words go, so "a" is not eaten;
  // a trailing STOP is telegram punctuation; an all-digit answer drops leading zeros ("0214" -> "214").
  const raw = String(s).toLowerCase().match(/[a-z0-9]+/g) || [];
  const glued = [];
  for (let i = 0; i < raw.length; i++) {
    if (/^[a-z]$/.test(raw[i]) && i + 1 < raw.length && /^[0-9]+$/.test(raw[i + 1])) glued.push(raw[i] + raw[++i]);
    else glued.push(raw[i]);
  }
  const tokens = glued.filter(t => !STOP_WORDS.has(t));
  if (tokens.length > 1 && tokens[tokens.length - 1] === "stop") tokens.pop();
  if (tokens.length && tokens.every(t => /^[0-9]+$/.test(t))) return tokens.join("").replace(/^0+(?=.)/, "");
  return tokens.join(" ");
}

export async function sha256(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

// One player per pseudo and season: pseudos compare NFKC-folded, trimmed, lowercased (apps_script.gs teamKey_).
export const teamKey = name => String(name).normalize("NFKC").trim().toLowerCase();

// sha256 of the trimmed, lowercased admin passphrase (the form apps_script.gs compares with ADMIN_KEY); the passphrase
// itself is never in the repo. New hash: printf '%s' 'phrase' | tr 'A-Z' 'a-z' | shasum -a 256
export const ADMIN_PASS_SHA256 = "9f955a0544ad84b27900a9818179cf4e53a5a362f911f69217afbe530d3c5c81";

// mm:ss (past an hour the minutes keep counting: 75:00), never negative.
export function fmtTime(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
}

// Backend values (pseudos are untrusted text) go through this before any innerHTML, attribute values included.
export const escapeHtml = s => String(s ?? "").replace(/[&<>"']/g, c => "&#" + c.charCodeAt(0) + ";");

// Rows are a season's backend rows (doGet ?season=<id>: timestamp, event, team, chapter, wrong, queries, elapsedMs...);
// meta is its season record (openedAt, penalty). Players group by teamKey, named as they typed it first.
function players(rows) {
  const by = new Map();
  for (const r of [...rows].sort((a, b) => Number(a.timestamp) - Number(b.timestamp))) {
    const k = teamKey(r.team);
    if (!by.has(k)) by.set(k, { team: String(r.team).trim(), rows: [] });
    by.get(k).rows.push(r);
  }
  return [...by.values()];
}
// The row that solved each chapter: "progress" 1-7, "finish" 8; the first one counts.
function solves(p) {
  const s = {};
  for (const r of p.rows) {
    const n = Number(r.chapter);
    if (((r.event === "progress" && n >= 1 && n <= 7) || (r.event === "finish" && n === 8)) && !s[n]) s[n] = r;
  }
  return s;
}

// The ranking: finished players by official time (server finish - openedAt + wrong x penalty), then the others by
// chapters solved, first there first (the row that solved the highest chapter, else the join row, so a retried
// duplicate row changes nothing). flagged ("?"): the server's interval and the browser's elapsedMs differ by
// more than a minute.
export function officialTime(rows, meta) {
  const opened = Number(meta.openedAt) || 0, pen = (Number(meta.penalty) || 0) * 1000;
  const out = players(rows).map(p => {
    const s = solves(p), fin = s[8], last = p.rows[p.rows.length - 1];
    const solved = Object.keys(s).length;
    const reached = s[Math.max(0, ...Object.keys(s).map(Number))] || p.rows.find(r => r.event === "join") || p.rows[0];
    const raw = fin ? Number(fin.timestamp) - opened : null;
    return { team: p.team, finished: !!fin, solved, chapter: Math.min(solved + 1, 8),
             wrong: Number((fin || last).wrong) || 0, queries: Number((fin || last).queries) || 0,
             ms: fin ? raw + (Number(fin.wrong) || 0) * pen : null,
             flagged: !!fin && fin.elapsedMs != null && Math.abs(raw - Number(fin.elapsedMs)) > 60000,
             last: Number(reached.timestamp) };

  });
  out.sort((a, b) => (b.finished - a.finished) || (a.finished ? a.ms - b.ms : b.solved - a.solved || a.last - b.last));
  return out.map((p, i) => ({ rank: i + 1, ...p }));
}

const median = xs => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// Per chapter 1-8: how many solved it, and the medians of the minutes from openedAt to the solve and of the queries
// and wrong answers spent on that chapter (the rows carry Part I running totals, so each is the gap to the
// player's previous solve).
export function chapterSummary(rows, meta) {
  const opened = Number(meta.openedAt) || 0;
  const per = Array.from({ length: 8 }, () => ({ minutes: [], queries: [], wrong: [] }));
  for (const p of players(rows)) {
    const s = solves(p);
    let q = 0, w = 0;
    for (let n = 1; n <= 8; n++) {
      const r = s[n];
      if (!r) continue;
      per[n - 1].minutes.push((Number(r.timestamp) - opened) / 60000);
      per[n - 1].queries.push((Number(r.queries) || 0) - q);
      per[n - 1].wrong.push((Number(r.wrong) || 0) - w);
      q = Number(r.queries) || 0; w = Number(r.wrong) || 0;
    }
  }
  return per.map((c, i) => ({ chapter: i + 1, solvers: c.minutes.length,
    minutes: median(c.minutes), queries: median(c.queries), wrong: median(c.wrong) }));
}
