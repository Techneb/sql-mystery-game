// site/state.js -- the game's saved state and what is read from it (pure: app.js keeps the storage and the page).
// Split out so badges.js, suspects.js and endings.js read the state without importing the game module.

export function freshState() {
  return { mode: "learn", season: "", team: "", startedAt: 0, finishedAt: 0, outbox: [], db: 0, seasonName: "", penalty: 10, over: false, board: "",
           solved: [], part2: false, queries: {}, wrong: {}, wrongStreak: 0, errorStreak: 0,
           badges: [], history: [], notes: "", names: "", lastQueryLines: 0, totalQueries: 0, answers: {},
           film: [], opened: {}, milestones: {}, fails: {}, hints: [], suspects: [], suspectsSeen: 0, introduced: null, runs: {}, cracked: {},
           extraSeen: false, extraSeen2: false, closedSeen: false, token: "", stoppedAt: 0, onboarding: "prologue" };
}
// queries/wrong are keyed by chapter number: { "1": 3, "2": 7 }; runs[n] tracks the open chapter's successful runs
// (scanRun) and cracked[n] keeps the query shown on its case-board card once solved (winningQuery)
// mode is "learn" (the 12-chapter investigation) or "compete" (Part I only, against the clock, season-<db>.*);
// in compete, season is the season record's id, db its database, startedAt its openedAt (the teacher's Open),
// token what "join" returned; outbox holds events not yet accepted by the Apps Script, so a lost connection
// never loses a row; over is set once the backend says the session is closed, and stoppedAt freezes the clock then;
// closedSeen once the #closed pop-up has been shown for it. introduced: the suspects the pop-up has shown, null until
// the first look seeds it with those met so far (a game saved before the pop-up, or a debug jump, shows none).
// onboarding (learn only): "prologue" (the clerk's first morning to come), "tour" (chapter I's callouts), "done".

// A saved game read back: every field of freshState, so nothing downstream needs a fallback. The one migration point:
// a save from before 2026-10-25's onboarding field (prologue "" | "done" | "skip" and tour) maps onto it, and a game
// already played (solved or queried) never gets the prologue.
export function migrateSave(saved) {
  const s = { ...saved };
  if (!("onboarding" in s) && Object.keys(s).length)
    s.onboarding = s.tour ? "done" : s.prologue ? "tour" : (s.solved || []).length || s.totalQueries ? "done" : "prologue";
  delete s.prologue; delete s.tour;
  return { ...freshState(), ...s };
}

export function currentChapter(state, chapters) {
  const next = state.solved.length + 1;
  const cap = state.part2 ? 12 : 8;
  return chapters.find(c => c.n === Math.min(next, cap));
}
export function part1Done(state) { return state.solved.includes(8); }
export function awaitingCode(state) { return state.mode !== "compete" && part1Done(state) && !state.part2; }
export function competeDone(state) { return state.mode === "compete" && part1Done(state); }
// Learning-mode and compete progress are separate localStorage keys (spec section 4).
export function storageKey(mode) { return mode === "compete" ? "ritz.compete" : "ritz.learn"; }
export function partStats(state, from, to) {
  let queries = 0;
  for (let n = from; n <= to; n++) queries += state.queries[n] || 0;
  return { queries };
}
// The tables the schema shows: every chapter's up to the current one.
export function visibleTables(chapters, state) {
  const cur = currentChapter(state, chapters).n;
  const seen = new Set();
  for (const ch of chapters) if (ch.n <= cur) ch.tables.forEach(t => seen.add(t));
  return seen;
}
