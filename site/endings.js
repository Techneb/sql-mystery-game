// site/endings.js -- the ends of the two parts (learn mode): the extra editions with their films, the Part II ending,
// the certificate, the share line. Each takes the state and data it shows plus hooks into the game
// ({ save, chapter, reset }) instead of reading the game's globals. Side-effect free at import.
import { BADGES, rank } from "./badges.js";
import { part1Done, partStats } from "./state.js";
import { portraitSrc } from "./suspects.js";
import { esc, richText, ICON_ATTRS } from "./ui.js";
import { useFeature } from "./stats.js";
import { GAME_URL } from "./shared.js";

const $ = id => document.getElementById(id);

// A closing film (site/video/<name>.*) waits on its poster: browsers only allow sound after a click, so the student
// starts it with Play; then the browser's own controls (play/pause, timeline, sound, full screen) take over.
function filmHtml(name) {
  return '<div class="film-wrap"><video class="film" playsinline preload="metadata" poster="video/' + name + '.jpg">' +
    '<source src="video/' + name + '.webm" type="video/webm"><source src="video/' + name + '.mp4" type="video/mp4"></video>' +
    '<button class="film-play">&#9654; Play</button></div>';
}
function wireFilm(root, part, chapter) {
  const film = root.querySelector(".film"), btn = root.querySelector(".film-play");
  btn.onclick = () => { btn.hidden = true; film.controls = true; film.currentTime = 0; film.play(); useFeature("film_play", { chapter: chapter(), part }, "film_play" + part); };
  film.addEventListener("ended", () => useFeature("film_end", { chapter: chapter(), part }, "film_end" + part));
  return film;
}

// Chapter VIII solved (learn mode): a one-off extra edition, the capture, the badge and rank; Continue then opens
// the Part II pop-up with the new objective.
// Shown once (state.extraSeen), on the solve or, if the page was closed first, on the next visit.
export function showExtra(state, data, { save, chapter }) {
  const el = $("extra"), p1 = partStats(state, 1, 8);
  const badge = BADGES.find(([name]) => name === "Gare du Nord");
  el.innerHTML = '<div class="extra-card">' +
    '<div class="mast-title">LE PETIT JOURNAL</div><div class="mast-sub">EXTRA EDITION &mdash; PARIS &mdash; 20 MAY 1912</div>' +
    filmHtml("part1") +
    "<h1>LUPIN TAKEN AT THE GARE DU NORD</h1>" +
    '<img class="portrait" src="' + portraitSrc("Rupert Blakeney") + '" alt="">' + '<div class="story">' + richText(data.endings.part1) + "</div>" +
    '<div class="extra-badge"><div class="label">BADGE</div><b>' + esc(badge[0]) + "</b> " + esc(badge[1]) +
    '<div class="muted">Part I in ' + p1.queries + " queries. Rank: " + esc(rank(p1.queries)) + "</div></div>" +
    '<button id="btn-extra">Continue</button></div>';
  el.hidden = false;
  const film = wireFilm(el, 1, chapter);
  // Continue closes the edition and announces Part II in a modal (#part2, a native <dialog>: Escape closes it too).
  $("btn-extra").onclick = () => { film.pause(); el.hidden = true; state.extraSeen = true; save(); $("part2").showModal(); };
}

// The Blue Star is never recovered: Lupin's telegram from London comes with a photograph of it, re-set as a ring.
export const part2Ending = data => '<img class="portrait" src="' + portraitSrc("Comtesse de Cagliostro") + '" alt="">' + richText(data.endings.part2) +
  '<figure class="ending-photo"><img src="blue-star.jpg" alt="The Blue Star, re-set as a ring, on dark velvet by a window over London">' +
  "<figcaption>Enclosed with the telegram, a photograph. No message. The jeweller has been busy.</figcaption></figure>";

// Chapter XII solved (learn mode): the Part II extra edition, Part I's in the night palette: the film, the arrest,
// the Ganimard badge, then an invitation to replay while badges are missing (reset: New investigation's question).
// Shown once (state.extraSeen2), on the solve or, if the page was closed first, on the next visit.
export function showExtra2(state, data, { save, chapter, reset }) {
  const el = $("extra"), p2 = partStats(state, 9, 12);
  const badge = BADGES.find(([name]) => name === "Ganimard");
  const got = BADGES.filter(([name]) => state.badges.includes(name)).length, left = BADGES.length - got;
  el.innerHTML = '<div class="extra-card">' +
    '<div class="mast-title">LE PETIT JOURNAL</div><div class="mast-sub">EXTRA EDITION &mdash; PARIS &mdash; JUNE 1912</div>' +
    filmHtml("part2") +
    "<h1>THE COMTESSE ARRESTED AT THE RITZ</h1>" +
    '<div class="story">' + part2Ending(data) + "</div>" +
    '<div class="extra-badge"><div class="label">BADGE</div><b>' + esc(badge[0]) + "</b> " + esc(badge[1]) +
    '<div class="muted">Part II in ' + p2.queries + " queries.</div></div>" +
    '<div class="extra-badge"><div class="label">BADGES</div>' + (left
      ? "You found " + got + " of " + BADGES.length + " badges. " + left + (left > 1 ? " are" : " is") +
        " still hidden in the archives: start a new investigation to hunt for the rest."
      : "You found all " + BADGES.length + " badges. Ganimard has nothing left to teach you.") + "</div>" +
    shareHtml(shareText(rank(partStats(state, 1, 8).queries), partStats(state, 1, 12).queries)) +
    (left ? '<button id="btn-replay">New investigation</button> ' : "") + '<button id="btn-extra2">Close</button></div>';
  el.hidden = false;
  const film = wireFilm(el, 2, chapter);
  wireShare(el, chapter);
  const close = () => { film.pause(); el.hidden = true; state.extraSeen2 = true; save(); };
  $("btn-extra2").onclick = close;
  if (left) $("btn-replay").onclick = () => { close(); reset(); };   // the same question, then the reset
}

// The printed certificate (#certificate, Print).
export function certificateHtml(state) {
  const p1 = partStats(state, 1, 8), p2 = partStats(state, 9, 12);
  const r1 = part1Done(state) ? rank(p1.queries) : "";
  return '<div class="mast-title">LE PETIT JOURNAL</div><div class="mast-sub">PARIS &mdash; ' + new Date().toLocaleDateString("en-GB") + "</div>" +
    "<h1>CASE CLOSED" + (state.solved.includes(12) ? ", TWICE" : "") + "</h1>" +
    "<p>The Prefecture of Police certifies that <b>" + esc(state.names || "the clerk") + "</b> unmasked Arsene Lupin in " + state.solved.filter(n => n <= 8).length + " chapters, " +
    p1.queries + " queries, and is hereby ranked <b>" + esc(r1) + "</b>." +
    (state.part2 ? " Part II: " + state.solved.filter(n => n > 8).length + " of 4 chapters, " + p2.queries + " queries.</p>" : "</p>") +
    '<p class="label">BADGES</p><ul class="badges">' + state.badges.map(b => "<li>" + esc(b) + "</li>").join("") + "</ul>" +
    (state.notes ? '<p class="label">NOTES</p><pre>' + esc(state.notes) + "</pre>" : "") +
    "<p class=\"muted\">Ganimard's signature is illegible, as always.</p>";
}

// --- Share, at the end of the game only (owner, 2026-10-25): never a clue or an answer, only the rank and the count.
// The rank is Part I's (RANKS are tuned on it, as on the certificate); the count is the whole game's.
export const SHARE_URL = GAME_URL;
export const shareText = (rankName, queries) => "I solved The Ritz Affair, a free SQL detective game, as " + rankName + " in " + queries + " queries.";
export function shareLinks(text, url = SHARE_URL) {
  return { x: "https://x.com/intent/post?text=" + encodeURIComponent(text) + "&url=" + encodeURIComponent(url),
           linkedin: "https://www.linkedin.com/sharing/share-offsite/?url=" + encodeURIComponent(url) };
}
// Logos from Simple Icons (CC0); X in the ink colour, LinkedIn in its own blue. Copy and the device's Share keep the
// game's stroked 16 px icons with their words.
const LOGO = 'width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"';
const X_LOGO = `<svg class="logo" ${LOGO} fill="currentColor"><path d="M18.24 2.25h3.31l-7.23 8.26 8.5 11.24h-6.65l-5.21-6.82-5.97 6.82H1.68l7.73-8.84L1.25 2.25h6.83l4.71 6.23zm-1.16 17.52h1.83L7.08 4.13H5.12z"/></svg>`;
const LINKEDIN_LOGO = `<svg class="logo" ${LOGO} fill="#0A66C2"><path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.83 3.37-1.83 3.6 0 4.27 2.37 4.27 5.46v6.26zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0z"/></svg>`;
const LINK_ICON = `<svg class="icon" ${ICON_ATTRS}><path d="M6.5 9.5a3 3 0 0 0 4.2 0l2.3-2.3a3 3 0 0 0-4.2-4.2l-.8.8M9.5 6.5a3 3 0 0 0-4.2 0L3 8.8a3 3 0 0 0 4.2 4.2l.8-.8"/></svg>`;
const SHARE_ICON = `<svg class="icon" ${ICON_ATTRS}><path d="M8 10V2M5 5l3-3 3 3M3 9v4h10V9"/></svg>`;
export function shareHtml(text) {
  const l = shareLinks(text);
  return '<div class="extra-badge share"><div class="label">SHARE</div><p class="share-text">' + esc(text) + "</p>" +
    '<div class="share-row"><button class="quiet" data-net="native" hidden>' + SHARE_ICON + ' Share</button>' +
    '<a class="btn quiet logo-btn" data-net="x" href="' + l.x.replace(/&/g, "&amp;") + '" target="_blank" rel="noopener" title="Share on X" aria-label="Share on X">' + X_LOGO + "</a>" +
    '<a class="btn quiet logo-btn" data-net="linkedin" href="' + l.linkedin + '" target="_blank" rel="noopener" title="Share on LinkedIn" aria-label="Share on LinkedIn">' + LINKEDIN_LOGO + "</a>" +
    '<button class="quiet" data-net="copy">' + LINK_ICON + ' Copy link</button> <span class="muted share-done" aria-live="polite"></span></div></div>';
}
function wireShare(root, chapter) {
  const box = root.querySelector(".share"); if (!box) return;
  const text = box.querySelector(".share-text").textContent, done = box.querySelector(".share-done");
  if (navigator.share) box.querySelector('[data-net="native"]').hidden = false;
  box.querySelectorAll("[data-net]").forEach(b => b.addEventListener("click", () => {
    const net = b.dataset.net;
    useFeature("share", { chapter: chapter(), network: net }, "share_" + net);
    if (net === "native") navigator.share({ title: "The Ritz Affair", text, url: SHARE_URL }).catch(() => {});
    if (net === "copy") (navigator.clipboard ? navigator.clipboard.writeText(SHARE_URL) : Promise.reject())
      .then(() => { done.textContent = "Link copied."; }, () => { done.textContent = SHARE_URL; });
  }));
}
