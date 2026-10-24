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
