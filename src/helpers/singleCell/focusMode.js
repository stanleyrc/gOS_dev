// Focus (full-viewport) mode of the Phylogeny & heatmap card. d3-free helpers.

export const FOCUS_STORAGE_KEY = "scHeatmapFocus"; // sessionStorage: focus stays on for the browser session
export const MIN_FOCUS_HEIGHT = 160;
export const MAX_FOCUS_HEIGHT = 6000;
export const MAX_FOCUS_ROW_PX = 30; // a few cells never stretch into very tall rows

/** `?focus=1` (or true / yes) opens the card in focus mode; `?focus=0` forces it off. Returns true / false / null (not given). */
export function focusFromSearch(search = "") {
  const value = new URLSearchParams(search).get("focus");
  if (value == null) return null;
  return /^(1|true|yes|on)$/i.test(value.trim());
}

/** Initial focus state: the link wins, then the session memory; false when neither is set. */
export function initialFocus(search = "", stored = null) {
  const linked = focusFromSearch(search);
  if (linked != null) return linked;
  return stored === "1" || stored === true;
}

/** `search` string with focus=1 added, or the parameter removed when off. Keeps other parameters. */
export function searchWithFocus(search = "", on = false) {
  const params = new URLSearchParams(search);
  if (on) params.set("focus", "1");
  else params.delete("focus");
  const text = params.toString();
  return text ? `?${text}` : "";
}

/** True for a plain `f` key press that is not typing into a field and not a browser / app shortcut. */
export function isFocusToggleKey(event) {
  if (!event || event.defaultPrevented) return false;
  if (event.key !== "f" && event.key !== "F") return false;
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  const el = event.target;
  const tag = el && el.tagName ? `${el.tagName}`.toUpperCase() : "";
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return false;
  if (el && (el.isContentEditable || (el.getAttribute && el.getAttribute("contenteditable") === "true"))) return false;
  return true;
}

/**
 * Heatmap height that fills the focus body. `bodyClient` is the visible height
 * of the scroll area, `contentHeight` the height of everything inside it (header
 * strips, axis, legend ...) at the current `rowAreaHeight`; the difference is
 * the fixed chrome the heatmap rows must leave room for.
 */
export function focusHeatmapHeight({ bodyClient, contentHeight, rowAreaHeight, nRows = 0, slack = 4 }) {
  if (![bodyClient, contentHeight, rowAreaHeight].every((v) => Number.isFinite(v) && v >= 0)) return null;
  const chrome = contentHeight - rowAreaHeight;
  let h = bodyClient - chrome - slack;
  if (nRows > 0) h = Math.min(h, nRows * MAX_FOCUS_ROW_PX);
  return Math.round(Math.max(MIN_FOCUS_HEIGHT, Math.min(MAX_FOCUS_HEIGHT, h)));
}

/** Row pixel height implied by a heatmap height (for the "Fit" label in the header). */
export function rowPixels(height, nRows) {
  return nRows > 0 ? Math.round((height / nRows) * 10) / 10 : null;
}
