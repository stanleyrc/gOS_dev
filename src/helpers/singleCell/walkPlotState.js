// Interaction state of the ecDNA walk plot (d3-free so jest can run it):
// how a lane is emphasised given the hovered and the focused walk, what a
// wheel event over the plot means, and label shortening.

/**
 * Emphasis of one lane. Focus (click) is the persistent highlight: when a
 * walk is focused every other lane fades, whatever the pointer does. Hover
 * is transient: it marks the lane under the pointer (band) and lifts it to
 * full opacity, but never moves the focus highlight elsewhere.
 * Returns { opacity, focused, hovered }.
 */
export function laneEmphasis(id, { hover = null, focus = null } = {}) {
  const focused = focus != null && id === focus;
  const hovered = hover != null && id === hover;
  const opacity = focus == null || focused || hovered ? 1 : 0.3;
  return { opacity, focused, hovered };
}

/**
 * What a wheel event over the plot does: "zoom" with Ctrl / Cmd (also a
 * trackpad pinch, which browsers report as ctrl + wheel), "pan" for a
 * mostly horizontal swipe or Shift + wheel, otherwise "scroll" (left to
 * the page, so scrolling down the tab is never captured by the plot).
 */
export function wheelIntent(e) {
  if (!e) return "scroll";
  if (e.ctrlKey || e.metaKey) return "zoom";
  const dx = Math.abs(e.deltaX || 0);
  const dy = Math.abs(e.deltaY || 0);
  if (e.shiftKey && dy > 0) return "pan";
  if (dx > 0 && dx > dy) return "pan";
  return "scroll";
}

/** Horizontal wheel distance in pixels (Shift + vertical wheel counts as horizontal). */
export function wheelDx(e) {
  if (!e) return 0;
  const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
  const dx = Math.abs(e.deltaX || 0) > 0 ? e.deltaX : e.shiftKey ? e.deltaY : 0;
  return (dx || 0) * unit;
}

/** Zoom factor for a wheel step (> 1 zooms out), clamped so one notch never jumps far. */
export function wheelZoomFactor(e) {
  const unit = e?.deltaMode === 1 ? 16 : e?.deltaMode === 2 ? 400 : 1;
  const d = (e?.deltaY || 0) * unit;
  return Math.exp(Math.max(-0.5, Math.min(0.5, d / 300)));
}

/**
 * Zoom a domain [a, b] around `anchor` by `factor` (> 1 = out), keeping it
 * within [lo, hi] and at least `minSpan` wide. Returns the new [a, b].
 */
export function zoomDomain([a, b], anchor, factor, { lo = 1, hi = Infinity, minSpan = 1000 } = {}) {
  let na = anchor - (anchor - a) * factor;
  let nb = anchor + (b - anchor) * factor;
  if (nb - na < minSpan) {
    const mid = (na + nb) / 2;
    na = mid - minSpan / 2;
    nb = mid + minSpan / 2;
  }
  return clampDomain([na, nb], { lo, hi });
}

/** Shift [a, b] by `delta`, sliding (not shrinking) against the genome ends. */
export function panDomain([a, b], delta, { lo = 1, hi = Infinity } = {}) {
  return clampDomain([a + delta, b + delta], { lo, hi });
}

function clampDomain([a, b], { lo, hi }) {
  const span = b - a;
  let na = a;
  let nb = b;
  if (na < lo) {
    na = lo;
    nb = Math.min(hi, lo + span);
  }
  if (nb > hi) {
    nb = hi;
    na = Math.max(lo, hi - span);
  }
  return [Math.round(na), Math.round(nb)];
}

/** Shorten a label to at most `max` characters, keeping its end (walk labels end in a variant number). */
export function shortLabel(label, max = 22) {
  const s = `${label ?? ""}`;
  if (s.length <= max) return s;
  const tail = Math.max(3, Math.floor((max - 1) / 3));
  return `${s.slice(0, max - 1 - tail)}…${s.slice(s.length - tail)}`;
}

/** Compact size: 1.5Mb / 480kb / 900bp. */
export function fmtSpan(bp) {
  const v = Number(bp) || 0;
  if (v >= 1e6) return `${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1)}Mb`;
  if (v >= 1e3) return `${Math.round(v / 1e3)}kb`;
  return `${Math.round(v)}bp`;
}
