// Shared "hide NA cells" flag for scatterplots (d3-free). One flag, layout.hideNa
// in the single-cell layout (persisted) and ?hidena=1 in the URL.
export const HIDE_NA_PARAM = "hidena";

/** Missing value: null, undefined, NaN, empty or the strings NA / NaN / null. */
export function isNaValue(v) {
  if (v == null) return true;
  if (typeof v === "number") return !Number.isFinite(v);
  const s = `${v}`.trim().toLowerCase();
  return s === "" || s === "na" || s === "nan" || s === "null" || s === "none";
}

/** Flag from a URL search string: "1"/"true" -> true, "0"/"false" -> false, otherwise null. */
export function hideNaFromSearch(search = "") {
  const v = new URLSearchParams(search).get(HIDE_NA_PARAM);
  if (v == null) return null;
  return /^(1|true|yes)$/i.test(v) ? true : /^(0|false|no)$/i.test(v) ? false : null;
}

/** Search string with the flag set (removed when off). */
export function withHideNa(search = "", on = false) {
  const params = new URLSearchParams(search);
  if (on) params.set(HIDE_NA_PARAM, "1");
  else params.delete(HIDE_NA_PARAM);
  const s = params.toString();
  return s ? `?${s}` : "";
}

/**
 * Split items by a missing-value test. `isNa(item)` true means the plotted or
 * colour value is missing. Returns { shown, hidden } (hidden is the count);
 * everything is shown when `hide` is off.
 */
export function partitionNa(items = [], isNa, hide = false) {
  if (!hide) return { shown: items, hidden: 0 };
  const shown = items.filter((x) => !isNa(x));
  return { shown, hidden: items.length - shown.length };
}
