/**
 * Pure logic of the paper-figure zoom popup (d3-free): fitting the popup to the browser window and stepping
 * to the previous / next panel across the figures (Figures order).
 */

// vertical space the popup uses besides the image: antd modal margins, header, body padding, footer, status / notes line
const BASE_RESERVE = 24 + 56 + 48 + 40 + 72 + 64; // margins, header, body padding, zoom toolbar, notes (max 64 + gap), footer
const TABS_RESERVE = 40;

/**
 * Size of the image viewport so the whole popup fits the window with no page scroll.
 * innerW / innerH: window.innerWidth / innerHeight. Returns { modalWidth (px), viewHeight (px) }.
 */
export function popupFit(innerW, innerH, { hasTabs = false, maxWidth = 1800 } = {}) {
  const w = innerW > 0 ? innerW : 1280;
  const h = innerH > 0 ? innerH : 720;
  const modalWidth = Math.max(320, Math.min(maxWidth, Math.floor(w * 0.96)));
  const viewHeight = Math.max(160, Math.floor(h - BASE_RESERVE - (hasTabs ? TABS_RESERVE : 0)));
  return { modalWidth, viewHeight };
}

/** Flat list of the panels that have an image, in the figures' order: [{ figIdx, panelIdx, figId, letter }]. */
export function panelSequence(figures, hasImage = (p) => !!(p && (p.svg || p.png || p.img || p.image))) {
  const out = [];
  (figures || []).forEach((f, figIdx) => (f.panels || []).forEach((p, panelIdx) => {
    if (hasImage(p)) out.push({ figIdx, panelIdx, figId: f.id, letter: p.letter });
  }));
  return out;
}

/**
 * Index of the neighbouring entry of seq (delta -1 / +1). Wraps at the ends (last -> first, first -> last).
 * cur is the { figId, letter } of the open panel; returns -1 when there is nothing to move to.
 */
export function neighbourPanelIndex(seq, cur, delta, wrap = true) {
  const n = seq?.length || 0;
  if (n < 2 || !cur) return -1;
  const i = seq.findIndex((s) => s.figId === cur.figId && s.letter === cur.letter);
  if (i < 0) return -1;
  const j = i + (delta < 0 ? -1 : 1);
  if (j < 0 || j >= n) return wrap ? (j + n) % n : -1;
  return j;
}

/** Arrow-key action for the open popup: "prev" | "next" | null (ignored while typing or with a modifier key). */
export function popupKeyAction(e) {
  if (!e || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return null;
  const t = e.target;
  const tag = t && t.tagName ? `${t.tagName}`.toLowerCase() : "";
  if (tag === "input" || tag === "textarea" || tag === "select" || (t && t.isContentEditable)) return null;
  if (e.key === "ArrowLeft") return "prev";
  if (e.key === "ArrowRight") return "next";
  return null;
}
