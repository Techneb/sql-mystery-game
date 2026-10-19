// The Day/Night edition button of the handbook, the Clerk's Desk and the board (the game's own is in app.js).
// Same key as the game, ritz.theme ("day"/"night"), so one choice holds site-wide; with none, learn.css follows
// prefers-color-scheme. Loaded in <head> without defer, so a stored choice is on <html> before the first paint.
(function () {
  var KEY = "ritz.theme", root = document.documentElement, dark = matchMedia("(prefers-color-scheme: dark)");
  var A = 'width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
  // the markup of app.js themeButtonHtml (a test checks): a sun offers the day edition, a moon the night one
  var ICON = {
    night: '<svg class="icon sun" ' + A + '><circle cx="8" cy="8" r="3"/><path d="M8 1.5V3M8 13V14.5M1.5 8H3M13 8H14.5M3.4 3.4L4.5 4.5M11.5 11.5L12.6 12.6M3.4 12.6L4.5 11.5M11.5 4.5L12.6 3.4"/></svg>',
    day: '<svg class="icon moon" ' + A + '><path d="M14 8.53A6 6 0 1 1 7.47 2A4.67 4.67 0 0 0 14 8.53Z"/></svg>'
  };
  var chosen = null;
  try { chosen = localStorage.getItem(KEY); } catch (e) {}
  if (chosen === "day" || chosen === "night") root.dataset.mood = chosen;
  function mood() { return root.dataset.mood || (dark.matches ? "night" : "day"); }
  function paint(btn) {
    var m = mood(), label = m === "night" ? "Day edition" : "Night edition";
    btn.innerHTML = ICON[m] + '<span class="btn-text">' + label + "</span>";
    btn.title = label; btn.setAttribute("aria-label", label);
  }
  document.addEventListener("DOMContentLoaded", function () {
    var btn = document.getElementById("btn-theme");
    if (!btn) return;
    paint(btn);
    btn.onclick = function () {
      var next = mood() === "night" ? "day" : "night";
      root.dataset.mood = next;
      try { localStorage.setItem(KEY, next); } catch (e) {}
      paint(btn);
    };
    dark.addEventListener("change", function () { paint(btn); });   // no choice yet: the button follows the system
  });
})();
