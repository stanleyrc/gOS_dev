// Width of the home page's left filter panel: resizable, remembered in this browser. d3-free.
export const SIDEBAR_WIDTH_KEY = "gos-home-filters-width";
export const SIDEBAR_DEFAULT_WIDTH = 280;
export const SIDEBAR_MIN_WIDTH = 200;
export const SIDEBAR_MAX_WIDTH = 520;

export const clampSidebarWidth = (w) => {
  const n = Number(w);
  if (!Number.isFinite(n)) return SIDEBAR_DEFAULT_WIDTH;
  return Math.round(Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, n)));
};

const storage = () => {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch (e) {
    return null;
  }
};

export function readSidebarWidth(store = storage()) {
  try {
    const v = store?.getItem(SIDEBAR_WIDTH_KEY);
    return v == null ? SIDEBAR_DEFAULT_WIDTH : clampSidebarWidth(v);
  } catch (e) {
    return SIDEBAR_DEFAULT_WIDTH;
  }
}

/** Store a width (null resets to the default); returns the width applied. */
export function writeSidebarWidth(width, store = storage()) {
  const next = width == null ? SIDEBAR_DEFAULT_WIDTH : clampSidebarWidth(width);
  try {
    if (width == null) store?.removeItem(SIDEBAR_WIDTH_KEY);
    else store?.setItem(SIDEBAR_WIDTH_KEY, `${next}`);
  } catch (e) {
    // storage unavailable
  }
  return next;
}
