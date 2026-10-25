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
export const ADMIN_PASS_SHA256 = "5f10cf9194d132ca0cc919ee34004def01e814cfa9ea6d4856846f987a122720";

// mm:ss (past an hour the minutes keep counting: 75:00), never negative.
export function fmtTime(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
}

// Backend values (pseudos are untrusted text) go through this before any innerHTML, attribute values included.
// The public board of one season (leaderboard.html), from the game's close dialog and finish screen and the admin page.
// The Clerk's Desk pages (admin.html, the monitor pages, explore.html): the board URL saved under this key, and the #passgate dialog
// asked again until the passphrase matches; resolves the passphrase, or "" on Cancel. An accepted passphrase is kept for the
// tab's session in sessionStorage DESK_KEY (never localStorage: it must die with the tab), so moving between desk pages asks once;
// a stored one that no longer matches the hash (the passphrase changed) is dropped and the gate asks again.
export const BOARD_KEY = "ritz.admin.board";
export const DESK_KEY = "ritz.desk.key";
// The pages' own question boxes instead of confirm()/prompt(): opens the native <dialog> d (its .ask-msg reads text
// when given) and resolves with the value of the button that closed it, "" on Cancel or Escape. Where <dialog> cannot
// open it resolves with fallback(), the browser's own box.
export function askDialog(d, text, fallback) {
  if (!d.showModal) return Promise.resolve(fallback());
  const p = d.querySelector(".ask-msg");
  if (p && text != null) p.textContent = text;
  d.returnValue = "";   // Escape keeps the last returnValue: clear it so Escape cancels
  return new Promise(resolve => { d.onclose = () => resolve(d.returnValue); d.showModal(); });
}

export async function deskPassphrase(d, store = globalThis.sessionStorage) {
  let kept = "";
  try { kept = store.getItem(DESK_KEY) || ""; } catch {}
  if (kept && (await sha256(kept)) === ADMIN_PASS_SHA256) return kept;
  try { store.removeItem(DESK_KEY); } catch {}
  const input = d.querySelector("input"), msg = d.querySelector(".gate-msg");
  return new Promise(resolve => {
    d.onclose = async () => {
      if (d.returnValue !== "ok") return resolve("");
      const pass = input.value.trim().toLowerCase();
      if (pass && (await sha256(pass)) === ADMIN_PASS_SHA256) {
        try { store.setItem(DESK_KEY, pass); } catch {}
        return resolve(pass);
      }
      msg.textContent = "Wrong passphrase. Try again.";
      d.classList.remove("shake"); void d.offsetWidth; d.classList.add("shake");
      input.value = ""; d.returnValue = ""; d.showModal();
    };
    input.value = ""; d.returnValue = ""; d.showModal();
  });
}

// The desk's board URL: ?board= wins over localStorage BOARD_KEY; a link's board is saved there and taken out of the address
// bar (other params and the hash kept), so desk URLs stay short. stored is false when storage is blocked; deskLinks then
// carries the board as ?board= instead.
export function deskBoard(loc = globalThis.location, store = globalThis.localStorage, hist = globalThis.history) {
  const u = new URL(loc.href), fromLink = u.searchParams.get("board") || "";
  let board = fromLink, stored = false;
  try {
    if (fromLink) store.setItem(BOARD_KEY, fromLink); else board = store.getItem(BOARD_KEY) || "";
    stored = true;
  } catch {}
  if (fromLink && stored) { u.searchParams.delete("board"); hist.replaceState(hist.state, "", u.pathname + u.search + u.hash); }
  return { board, stored };
}
// The desk's menu row (admin.html, monitor.html, monitor-game.html, monitor-handbook.html, explore.html): bare links, or
// ?board= on each when the board could not be stored.
export function deskLinks(board, stored = true, links = document.querySelectorAll(".learn-menu a")) {
  for (const a of links)
    a.href = a.getAttribute("href").split("?")[0] + (board && !stored ? "?board=" + encodeURIComponent(board) : "");
}

export const resultsLink = (board, season) => "leaderboard.html?data=" + encodeURIComponent(board) + "&season=" + encodeURIComponent(season);
// A GA value as text: a missing one (null, undefined, empty) reads "(empty)", never "null".
export const gaText = v => (v == null || v === "" ? "(empty)" : String(v));
export const escapeHtml = s => String(s ?? "").replace(/[&<>"']/g, c => "&#" + c.charCodeAt(0) + ";");

// CSV for the desk's three exports (seasons rows, raw data, pivot table): RFC 4180, a field with a comma, a quote or
// a line break in quotes, its quotes doubled, null as empty, lines ending CRLF.
const csvField = v => { const s = v == null ? "" : String(v); return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
export const csvText = rows => rows.map(r => r.map(csvField).join(",")).join("\r\n") + "\r\n";
// The browser saves text as a file (browser only).
export function downloadText(name, text, type = "text/csv;charset=utf-8") {
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([text], { type })), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

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
    // A negative interval (an old row written as a Date, read back shifted by a time zone): flagged, and the
    // browser's elapsedMs stands in for it when the row has one.
    const el = fin && fin.elapsedMs != null && fin.elapsedMs !== "" ? Number(fin.elapsedMs) : null;
    const time = raw < 0 && el !== null ? el : raw;
    return { team: p.team, finished: !!fin, solved, chapter: Math.min(solved + 1, 8),
             wrong: Number((fin || last).wrong) || 0, queries: Number((fin || last).queries) || 0,
             ms: fin ? time + (Number(fin.wrong) || 0) * pen : null,
             flagged: !!fin && (raw < 0 || (el !== null && Math.abs(raw - el) > 60000)),
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
  const per = Array.from({ length: 8 }, () => ({ solvers: 0, minutes: [], queries: [], wrong: [] }));
  for (const p of players(rows)) {
    const s = solves(p);
    let q = 0, w = 0;
    for (let n = 1; n <= 8; n++) {
      const r = s[n];
      if (!r) continue;
      const raw = Number(r.timestamp) - opened;   // negative: an old Date row (see officialTime), elapsedMs instead
      if (raw >= 0) per[n - 1].minutes.push(raw / 60000);
      else if (r.elapsedMs != null && r.elapsedMs !== "") per[n - 1].minutes.push(Number(r.elapsedMs) / 60000);
      per[n - 1].solvers++;
      per[n - 1].queries.push((Number(r.queries) || 0) - q);
      per[n - 1].wrong.push((Number(r.wrong) || 0) - w);
      q = Number(r.queries) || 0; w = Number(r.wrong) || 0;
    }
  }
  return per.map((c, i) => ({ chapter: i + 1, solvers: c.solvers,
    minutes: median(c.minutes), queries: median(c.queries), wrong: median(c.wrong) }));
}

// The GA dimensions the desk may ask for (apps_script.gs REPORT_DIMS, a test compares), with readable names, in the
// pivot table's order (explore.js), and the ?report=<json>&key= URL that explore.js and monitor.js fetch.
export const DIMENSIONS = {
  date: "Date", eventName: "Event", "customEvent:chapter": "Chapter", "customEvent:count": "Query milestone",
  "customEvent:mode": "Mode", "customEvent:part": "Part finished", "customEvent:name": "Badge", deviceCategory: "Device",
  operatingSystem: "Operating system", browser: "Browser", country: "Country", city: "City", language: "Language",
  sessionDefaultChannelGroup: "Channel", sessionSource: "Source", newVsReturning: "New or returning", pagePath: "Page path",
  pageTitle: "Page title", "customEvent:kind": "Failure kind", "customEvent:rule": "Grammar rule", "customEvent:n": "Wrong answer #",
  "customEvent:feature": "Feature", "customEvent:exercise": "Exercise", "customEvent:level": "Level", "customEvent:outcome": "Run outcome",
  "customEvent:type": "Error type", "customEvent:route": "Solve route", "customEvent:network": "Share network",
};
export function reportUrl(board, req, key) {
  const u = new URL(board);
  u.searchParams.set("report", JSON.stringify(req)); u.searchParams.set("key", key);
  return u.toString();
}
