// "Clear site settings" (Settings menu): resets this browser's display settings for gOS
// without touching the user's own work.
//   cleared: layout / palette / theme / column layouts / help state, sessionStorage,
//            Cache Storage and service workers, and view parameters in the URL
//   kept:    event notes and scratchpads, saved searches, case interpretations (IndexedDB)

/** localStorage keys that hold user work and must survive a reset. */
export const KEEP_KEY_PATTERNS = [/^event_notes_/, /^event_scratchpad_/, /^gos\.savedSearches\./];

/** localStorage keys that are display settings. */
export const SETTINGS_KEY_PATTERNS = [/^gos[.-]/];

/** The keys to remove, given every localStorage key. */
export function settingsKeysToClear(keys) {
  return (keys || []).filter(
    (k) => SETTINGS_KEY_PATTERNS.some((re) => re.test(k)) && !KEEP_KEY_PATTERNS.some((re) => re.test(k))
  );
}

/** URL query parameters kept after a reset: which dataset / case / tab is open. */
export const KEEP_URL_PARAMS = ["dataset", "report", "tab"];

/** The same URL without view parameters (heatmap, filters, tracks, layout ...). */
export function resetUrl(href) {
  const url = new URL(href);
  [...url.searchParams.keys()].forEach((k) => {
    if (!KEEP_URL_PARAMS.includes(k)) url.searchParams.delete(k);
  });
  return url.toString();
}

/** Clear the settings, caches and view parameters, then reload. Returns the keys removed. */
export async function clearSiteSettings(win = window) {
  let removed = [];
  try {
    const keys = Array.from({ length: win.localStorage.length }, (_, i) => win.localStorage.key(i));
    removed = settingsKeysToClear(keys);
    removed.forEach((k) => win.localStorage.removeItem(k));
  } catch (error) {
    // storage unavailable (private mode): nothing to clear
  }
  try {
    win.sessionStorage.clear();
  } catch (error) {
    // ignore
  }
  try {
    if (win.caches?.keys) await Promise.all((await win.caches.keys()).map((k) => win.caches.delete(k)));
  } catch (error) {
    // ignore
  }
  try {
    if (win.navigator?.serviceWorker?.getRegistrations) {
      const regs = await win.navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch (error) {
    // ignore
  }
  win.location.replace(resetUrl(win.location.href));
  return removed;
}
