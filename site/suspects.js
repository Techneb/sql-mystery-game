// site/suspects.js -- the suspects (learn only): who is met when, their cards and portraits, the case board's
// pictures. Pure, side-effect free; app.js draws the gallery, the pop-up and the board's strip with these.
import { normalise } from "./shared.js";
import { currentChapter } from "./state.js";
import { ROW_CAP } from "./terminal.js";
import { esc } from "./ui.js";

// Portrait file per face (site/portraits/*.jpg -- Style A/Lavery colour, generated; see docs/superpowers/specs
// section 8's visual-identity entry): the six suspects of data.cast, the same every mode (Lupin himself never gets
// one singled out, so no face reads guiltier than another before chapter VIII), and the Comtesse of Part II's ending.
const PORTRAITS = { "Lord Ashcombe": "ashcombe", "Paul Sernine": "sernine", "Horace Velmont": "velmont",
  "Raul Ortega": "ortega", "Ines de Almagro": "almagro", "Rupert Blakeney": "blakeney", "Comtesse de Cagliostro": "comtesse" };
export const portraitSrc = name => PORTRAITS[name] ? "portraits/" + PORTRAITS[name] + ".jpg" : "";
// One painted object per chapter beside its title: site/icons/chNN.png (96 px, transparent; prompts and
// how they were cut out in docs/mockups/chapter-icon-prompts.md).
export const iconSrc = n => "icons/ch" + String(n).padStart(2, "0") + ".png";
// A case-board card's picture: the portrait when the accepted answer names one of these faces, else the chapter's icon.
export function cardPicture(n, answer) {
  const a = normalise(answer || "");
  const name = a && Object.keys(PORTRAITS).find(k => { const f = normalise(k); return a === f || a === f.split(" ").pop(); });
  return name ? { src: portraitSrc(name), face: true } : { src: iconSrc(n), face: false };
}

// A suspect is met once an unlocked chapter's story names them (cast.meet) or a result the student saw showed
// their name (state.suspects); each note joins the bio once its chapter is reached (plot.py CAST).
// Compete has no Suspects gallery: the cards and notes are learn's (Ashcombe's valet, Ortega's R.).
export function suspectsOn(state) { return state.mode !== "compete"; }
export function metSuspects(cast, state, chapters) {
  const reached = currentChapter(state, chapters).n, found = state.suspects;
  return cast.filter(s => s.meet <= reached || found.includes(s.name))
    .map(s => ({ ...s, notes: (s.notes || []).filter(([n]) => n <= reached).map(([, t]) => t) }));
}
export function foundSuspects(cast, res, have) {
  if (!res) return [];
  const text = res.values.slice(0, ROW_CAP).map(r => r.join(" ")).join(" ").toLowerCase();   // only rows on screen
  return cast.map(s => s.name).filter(n => !have.includes(n) && text.includes(n.toLowerCase()));
}
// The board's suspects strip (learn only, as the gallery): the faces the gallery has introduced, each crossed out
// once the chapter that clears them (plot.CAST `cleared`) is solved; a click opens the gallery.
export function boardSuspects(cast, state, chapters) {
  const shown = state.introduced || [];   // null until the first look (state.js)
  return metSuspects(cast, state, chapters).filter(s => shown.includes(s.name))
    .map(s => ({ name: s.name, cleared: !!s.cleared && state.solved.includes(s.cleared) }));
}
export function suspectCard(s, notes = []) {
  const src = portraitSrc(s.name);
  const img = src ? '<img src="' + src + '" alt="">' : "";
  return '<div class="suspect">' + img + '<b>' + esc(s.name) + '</b><span class="muted">' + esc(s.nationality) + '</span><p>' + esc(s.bio) + '</p>' +
    notes.map(n => '<p class="note">' + esc(n) + '</p>').join("") + '</div>';
}
