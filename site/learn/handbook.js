// Usage statistics on every handbook page: the game's consent banner and GA4 (../stats.js, the same ritz.consent
// answer site-wide) and the reading events, each once per page load. The exercises page adds its own (exercises.js).
// The ad path (Google's message) applies only where the ad box is, exercises.html; elsewhere the banner asks.
import { initConsent, useFeature } from "../stats.js";

if (typeof document !== "undefined") {
  initConsent(!!document.getElementById("press-box"));
  document.addEventListener("click", e => {
    const a = e.target.closest && e.target.closest("a, button");
    if (!a) return;
    if (a.id === "btn-theme") useFeature("theme_toggle");
    else if (a.closest(".press-notice")) useFeature("ad_house_click");
    else if (a.closest(".strict")) useFeature("grammar_link");
    else {
      const m = (a.getAttribute("href") || "").match(/^exercises\.html#([\w-]+)$/);
      if (m) useFeature("try_it", { exercise: m[1] }, "try_it:" + m[1]);
    }
  });
  document.addEventListener("toggle", e => {   // toggle does not bubble: caught on the way down
    const d = e.target;
    if (!d.open || !d.matches) return;
    if (d.matches("details.howto")) useFeature("howto_open");
    else if (d.matches("details.solution")) useFeature("solution_open");
  }, true);
}

// A learning chapter's side menu (colour_learn.mjs writes it): the section being read gets aria-current. The section
// read is the last whose heading has passed the line 30% down the window, or the last one once the page end shows.
if (typeof document !== "undefined" && typeof IntersectionObserver !== "undefined") {
  const links = [...document.querySelectorAll(".side-menu .here a[href^='#']")];
  const heads = links.map(a => document.getElementById(a.getAttribute("href").slice(1)));
  if (links.length && heads.every(Boolean)) {
    const mark = () => {
      let i = heads.findLastIndex(h => h.getBoundingClientRect().top <= innerHeight * 0.3);
      if (innerHeight + scrollY >= document.documentElement.scrollHeight - 2) i = heads.length - 1;
      links.forEach((a, j) => j === Math.max(i, 0) ? a.setAttribute("aria-current", "location") : a.removeAttribute("aria-current"));
    };
    const io = new IntersectionObserver(mark, { rootMargin: "0px 0px -70% 0px" });
    heads.forEach(h => io.observe(h));
    const end = new IntersectionObserver(mark, { threshold: [0, 1] });   // the last short sections may never reach the line
    document.querySelectorAll(".learn-pager, .learn-foot").forEach(e => end.observe(e));
    mark();
  }
}
