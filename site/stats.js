// site/stats.js -- usage statistics (GA4) and advertising (AdSense) under Consent Mode v2, shared by the game
// (app.js), the exercises page (learn/exercises.js) and every handbook page (learn/handbook.js): one consent answer
// site-wide. Kept apart from the game so a handbook page loads this (about 6 KB gzipped) and nothing else of it.
const $ = id => document.getElementById(id);
let quiet = false;   // the game's ?chapter=N and admin jumps: no statistics
export function quietStats() { quiet = true; }

// --- usage statistics (Google Analytics 4) and advertising (AdSense), Consent Mode v2 (spec section 8) ---
// The course owner's GA4 measurement ID ("G-...", public by nature, may be committed). Empty: no banner,
// no Statistics link, no request to Google. Owner, 2026-10-19: visitors outside the EEA, UK and Switzerland
// are counted by default (and, with ads on, see ads under the granted default). Inside, with ads off, nothing is
// sent before a Yes (GA is not loaded: the browser's time zone stands in for the region): the banner's Yes, or with
// ads on, the Yes of Google's certified message once its CMP is live (else the banner asks, see initGoogleConsent).
export const GA_ID = "G-QG0K0D1NQZ";
// AdSense. Approval day is one edit: paste the display ad unit's data-ad-slot (AdSense > Ads > By ad unit, digits
// only) into AD_SLOT; ADS_ON follows it.
// ADS_ON switches the consent path below: off, the home-made banner (#consent) asks about statistics; on, Google's
// certified consent message (AdSense > Privacy & messaging, served by adsbygoogle.js) asks about both, in Europe only,
// when its CMP is live, and the banner stands in while it is not.
// ?ads=1 previews the ads-on path on localhost (Google serves no ad and no message there: the banner asks after 3 s).
export const ADS_CLIENT = "ca-pub-9765732642926043";
export const AD_SLOT = "1774964634";   // "Ritz Affair - under the schema", responsive display unit (2026-10-19)
export const ADS_ON = AD_SLOT !== "";
const CONSENT_KEY = "ritz.consent";   // "yes" | "no"; absent = not answered, the banner shows (unless Google's message governs)
let statsRefused = false;             // ads on: Google's message reports analytics_storage DENIED
function consent() { try { return localStorage.getItem(CONSENT_KEY); } catch { return null; } }
function adsOn() {
  return ADS_ON || (["localhost", "127.0.0.1"].includes(location.hostname) && !!new URLSearchParams(location.search).get("ads"));
}
// ?ga=G-... tries the banner before an ID is committed, on localhost only (a link elsewhere cannot redirect the stats).
function gaId() {
  return GA_ID || (["localhost", "127.0.0.1"].includes(location.hostname) && new URLSearchParams(location.search).get("ga")) || "";
}
// Google's EEA (the 27 EU states plus IS, LI, NO), with the UK and Switzerland: where Google's message shows.
export const CONSENT_REGIONS = ["AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT",
  "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE", "IS", "LI", "NO", "GB", "CH"];
// The two `consent default` commands, region-scoped first (Google: the more specific region wins; the unscoped
// one covers everyone else). Ads off: the ad fields stay denied everywhere (no ads run; Google signals and ad
// personalisation are off in the GA property). Ads on: outside Europe nobody is asked, so the granted default
// stands for ads too (owner, 2026-10-19); in Europe tags wait up to 500 ms for Google's message to update it.
export function consentDefaults(ads) {
  const denied = { ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied", analytics_storage: "denied" };
  const g = ads ? "granted" : "denied";
  return [{ ...denied, region: CONSENT_REGIONS, ...(ads ? { wait_for_update: 500 } : {}) },
    { ad_storage: g, ad_user_data: g, ad_personalization: g, analytics_storage: "granted" }];
}
// A European time zone (or an unknown one) waits for the banner's Yes. Europe/ also covers non-EEA countries
// (Russia, Turkey, Ukraine): a wrong guess only leaves a visitor uncounted, never counted without being asked.
export function europeanZone(tz) {
  return !tz || /^(Europe|Arctic)\//.test(tz) || /^Atlantic\/(Reykjavik|Canary|Madeira|Azores|Faroe|Faeroe)$/.test(tz);
}
function timeZone() { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return ""; } }
// Every analytics call goes through here. Never pass the pseudo, answers, query text or the board URL.
// GA is loaded only after a Yes or outside Europe's time zones, and Consent Mode decides what a hit carries.
export function track(name, params) {
  if (quiet || typeof window === "undefined" || typeof window.gtag !== "function") return false;
  if (cmpPath === "google" ? statsRefused : consent() === "no") return false;
  window.gtag("event", name, params);
  return true;
}
// Once per key per page load (a Set the caller keeps): feature_use, chapter_leave, the exercises' first runs.
export function firstTime(seen, key) {
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
}
const seenOnce = new Set();
export function trackOnce(key, name, params) { return firstTime(seenOnce, key) && track(name, params); }
// query_fail's { kind, rule, type } (a failed run's outcome, terminal.js runSql) for the first QUERY_FAILS failed runs
// per key (a chapter, an exercise; `fails` counts them, the game keeps it in its state), else null.
export const QUERY_FAILS = 3;
export function queryFail(fails, key, outcome) {
  if (outcome.kind === "ok" || (fails[key] || 0) >= QUERY_FAILS) return null;
  fails[key] = (fails[key] || 0) + 1;
  return { kind: outcome.kind, rule: outcome.rule, type: outcome.type };
}
// feature_use, once per feature (per extra key, such as try_it's slug) per page load.
export function useFeature(feature, params = {}, key = feature) { return trackOnce("feature:" + key, "feature_use", { feature, ...params }); }
// Must run before gtag.js or adsbygoogle.js loads.
function gtagDefaults() {
  if (window.gtag) return;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  for (const d of consentDefaults(adsOn())) window.gtag("consent", "default", d);
}
let gaLoaded = false;
function gaLoad(id) {
  if (gaLoaded) return;
  gaLoaded = true;
  gtagDefaults();
  if (cmpPath !== "google" && consent() === "yes") window.gtag("consent", "update", { analytics_storage: "granted" });   // Google's message updates its own
  window.gtag("js", new Date());
  window.gtag("config", id, { allow_google_signals: false, allow_ad_personalization_signals: false });
  const s = document.createElement("script");
  s.async = true; s.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(id);
  document.head.appendChild(s);
}
// GA's cookie may sit on any parent domain (auto cookie_domain): expire _ga* on each of them.
function dropGaCookies() {
  const parts = location.hostname.split(".");
  for (const c of document.cookie.split(";")) {
    const name = c.split("=")[0].trim();
    if (!name.startsWith("_ga")) continue;
    for (let i = 0; i < parts.length; i++)
      document.cookie = name + "=; Max-Age=0; path=/; domain=" + parts.slice(i).join(".");
    document.cookie = name + "=; Max-Age=0; path=/";
  }
}
function setConsent(v) {
  const id = gaId();
  try { localStorage.setItem(CONSENT_KEY, v); } catch {}
  $("consent").hidden = true;
  window["ga-disable-" + id] = v !== "yes";   // honoured by gtag.js: no more hits, cookieless pings included
  if (v === "yes") { if (gaLoaded) window.gtag("consent", "update", { analytics_storage: "granted" }); else gaLoad(id); }   // gaLoad reads the stored yes
  else { if (window.gtag) window.gtag("consent", "update", { analytics_storage: "denied" }); dropGaCookies(); }
}
function openBanner() { $("consent").hidden = false; $("consent-yes").focus(); }
// The game's own question (#consent): the only one with ads off, the fallback with ads on.
function ownConsent(id) {
  $("consent-yes").onclick = () => setConsent("yes");
  $("consent-no").onclick = () => setConsent("no");
  const c = consent();
  if (c === "yes" || (!c && !europeanZone(timeZone()))) gaLoad(id);   // Europe waits for the Yes
  if (!c) $("consent").hidden = false;   // shown everywhere: the region is unknown client side
}
// withAds false: a page without the ad box (adsbygoogle.js and Google's message never load there), so the
// banner asks as with ads off, under the same ritz.consent answer.
export function initConsent(withAds = true) {
  const id = gaId();
  if (withAds && adsOn()) return initGoogleConsent(id);
  if (!id) return;
  $("stats-link").hidden = false;
  $("btn-stats").onclick = e => { e.preventDefault(); openBanner(); };
  ownConsent(id);
}
// Ads on: which question governs (owner, 2026-10-19). Google's message (AdSense > Privacy & messaging, served by
// adsbygoogle.js) governs once its CMP is live. Until AdSense approves the site it loads but stays inactive
// (getConsentStatus() UNKNOWN, TCF cmpStatus null, no message), and a blocked script never answers. So the CMP
// gets CMP_WAIT_MS after the ads script loads (none after it fails); not live by then, the game's own banner
// asks, as with ads off. If Google's message turns up later it takes over and the banner is hidden.
export const CMP_WAIT_MS = 3000;
// A TCF v2.2 callback from a live CMP: it is showing or has used its message, or GDPR does not apply. A CMP that
// is merely "loaded" with GDPR applying is not live: before AdSense approves the site Google loads it and shows
// nothing (seen on the live site from the UK, 2026-10-19), and our banner must ask instead.
export function cmpLive(tc) {
  if (!tc) return false;
  if (["cmpuishown", "tcloaded", "useractioncomplete"].includes(tc.eventStatus)) return true;
  return tc.cmpStatus === "loaded" && tc.gdprApplies === false;
}
// "google" | "own" | "wait" (not decided yet).
export function consentPath({ live, failed, waited }) {
  if (live) return "google";
  return failed || waited ? "own" : "wait";
}
// Google's answer on statistics: Consent Mode's analytics status (ConsentModePurposeStatusEnum, 1 GRANTED,
// 2 DENIED) or the TC data's purpose 1 (storage) once the reader has a TC string; else "unknown".
export function googleStats({ modeStatus, tc }) {
  if (modeStatus === 1) return "granted";
  if (modeStatus === 2) return "denied";
  if (tc && tc.gdprApplies === true && ["tcloaded", "useractioncomplete"].includes(tc.eventStatus))
    return tc.purpose && tc.purpose.consents && tc.purpose.consents[1] ? "granted" : "denied";
  return "unknown";
}
let cmpPath = "";         // ads on: "" until decided, then "google" or "own"; ads off: stays ""
let cmpDone = () => {};   // initAds reports the ads script's load or error here
// Sources: https://developers.google.com/funding-choices/fc-api-docs (googlefc: CONSENT_API_READY,
// CONSENT_MODE_DATA_READY, getGoogleConsentModeValues, showRevocationMessage), https://support.google.com/adsense/answer/16088460
// (Google's CMP and consent mode), https://support.google.com/adsense/answer/10959060 (revocation link),
// https://developers.google.com/tag-platform/security/guides/consent (defaults), IAB TCF v2.2 CMP API (__tcfapi).
function initGoogleConsent(id) {
  gtagDefaults();
  window.googlefc = window.googlefc || {};
  window.googlefc.callbackQueue = window.googlefc.callbackQueue || [];
  // Google asks for a revocation link titled "Privacy and cookie settings" at the bottom of the site.
  $("btn-stats").textContent = "Privacy and cookie settings";
  $("btn-stats").onclick = e => {
    e.preventDefault();
    if (cmpPath === "google") window.googlefc.callbackQueue.push(() => window.googlefc.showRevocationMessage());
    else openBanner();
  };
  $("stats-link").hidden = false;
  if (!id) return;
  if (!europeanZone(timeZone()) && consent() !== "no") gaLoad(id);   // the granted default outside Europe; Europe waits for a Yes
  const decide = (o) => {
    const v = consentPath(o);
    if (v === "wait" || v === cmpPath || (v === "own" && cmpPath)) return;   // google may follow own, never the reverse
    cmpPath = v;
    if (v === "own") return ownConsent(id);
    $("consent").hidden = true;   // never both questions at once
  };
  const apply = (stats) => {
    if (cmpPath !== "google" || stats === "unknown") return;
    statsRefused = stats === "denied";
    window["ga-disable-" + id] = statsRefused;
    if (statsRefused) { window.gtag("consent", "update", { analytics_storage: "denied" }); dropGaCookies(); }
    else { gaLoad(id); window.gtag("consent", "update", { analytics_storage: "granted" }); }
  };
  let hooked = false;
  const hookTcf = () => {
    if (hooked || typeof window.__tcfapi !== "function") return;
    hooked = true;
    window.__tcfapi("addEventListener", 2, (tc, ok) => {
      if (!ok || !cmpLive(tc)) return;
      decide({ live: true });
      apply(googleStats({ tc }));
    });
  };
  // ponytail: assumes CONSENT_MODE_DATA_READY fires again after a revocation; the TCF listener covers it otherwise.
  window.googlefc.callbackQueue.push({ CONSENT_API_READY: hookTcf, CONSENT_MODE_DATA_READY: () => {
    const values = window.googlefc.getGoogleConsentModeValues && window.googlefc.getGoogleConsentModeValues();
    const stats = googleStats({ modeStatus: values && values.analyticsStoragePurposeConsentStatus });
    if (stats === "unknown") return;   // no answer from Google's message yet: not a sign that it is showing
    decide({ live: true });
    apply(stats);
  } });
  cmpDone = (failed) => {
    if (failed) return decide({ failed: true });
    hookTcf();
    setTimeout(() => decide({ waited: true }), CMP_WAIT_MS);
  };
}

// The ad box under the schema (a native <details>: its summary is the toggle), here and on learn/exercises.html only.
// Open on every visit; closing it lasts until the next page load (owner, 2026-10-19). Hidden unless adsOn().
export function adSlotHtml(client, slot) {
  return '<ins class="adsbygoogle" style="display:block" data-ad-client="' + client + '" data-ad-slot="' + slot +
    '" data-ad-format="auto" data-full-width-responsive="true"></ins>';
}
// Ads go live before approval with the house ad as fallback (owner, 2026-10-19): Google's ad shows only once its
// <ins> reads data-ad-status="filled"; "unfilled", a script that fails to load (ad blockers) or nothing filled
// with a height after AD_WAIT_MS brings the house ad back. "wait" keeps trying.
export const AD_WAIT_MS = 4000;
export function adOutcome({ status, height, elapsed, failed }) {
  if (failed || status === "unfilled") return "house";
  if (status === "filled" && height > 0) return "ad";
  return elapsed >= AD_WAIT_MS ? "house" : "wait";
}
// Also run by learn/exercises.js, the one handbook page with the ad box (owner, 2026-10-19): the page needs a #press-box.
export function initAds() {
  const box = $("press-box");
  if (!adsOn()) return;
  gtagDefaults();   // Consent Mode defaults before adsbygoogle.js (the game also sets them for GA; set once)
  box.hidden = false;
  // adsbygoogle.js also serves Google's consent message, so it loads even without a slot (the ?ads=1 preview).
  const s = document.createElement("script");
  s.async = true; s.crossOrigin = "anonymous";
  s.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" + ADS_CLIENT;
  let failed = false, check = () => {};
  s.onerror = () => { failed = true; check(); cmpDone(true); };
  s.onload = () => cmpDone(false);
  if (AD_SLOT) {
    // The house ad stays in the DOM, hidden while Google's ad is tried beside it (the slot keeps its min-height).
    const slot = box.querySelector(".press-slot"), house = slot.querySelector(".press-notice");
    slot.insertAdjacentHTML("beforeend", adSlotHtml(ADS_CLIENT, AD_SLOT));
    const ins = slot.querySelector("ins.adsbygoogle"), t0 = Date.now();
    house.hidden = true;
    const obs = new MutationObserver(() => check());
    const timer = setTimeout(() => check(), AD_WAIT_MS);
    check = () => {
      const v = adOutcome({ status: ins.dataset.adStatus, height: ins.offsetHeight, elapsed: Date.now() - t0, failed });
      if (v === "wait") return;
      obs.disconnect(); clearTimeout(timer);
      if (v === "house") { ins.remove(); house.hidden = false; }
    };
    obs.observe(ins, { attributes: true, attributeFilter: ["data-ad-status"] });
    try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch { failed = true; check(); }
  }
  document.head.appendChild(s);
}

