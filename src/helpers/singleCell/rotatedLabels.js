// Which of a row of rotated text labels (CSS rotate(angle) about each label's
// top-left corner, label k anchored at x = (k + 0.5) * colPx, y = top) a point
// falls on. Neighbouring labels' boxes overlap once their spacing perpendicular
// to the text (colPx * sin(angle)) is below the line height, so DOM hit-testing
// picks the label drawn last; this picks the label whose text line is nearest.

/**
 * @returns index of the label under (x, y) in the labels' container, or -1 when
 *   the point is before the first / after the last label's text line.
 */
export function rotatedLabelAt(x, y, colPx, n, { angleDeg = 60, top = 4, lineHeight = 14 } = {}) {
  if (!(colPx > 0) || n <= 0) return -1;
  const a = (angleDeg * Math.PI) / 180;
  const s = Math.sin(a);
  const c = Math.cos(a);
  // a point on label k's text: offset (x - x_k, y - top) has normal component in [0, lineHeight]
  // (normal = (-sin, cos)), i.e. x_k = x - ((y - top) * c - lineHeight / 2) / s for its mid-line
  const xk = x - ((y - top) * c - lineHeight / 2) / s;
  const k = Math.round(xk / colPx - 0.5) + 0;   // + 0: no -0
  if (k < 0 || k >= n) return -1;
  // must lie past the label's origin along the text direction (not above / left of it)
  const along = (x - (k + 0.5) * colPx) * c + (y - top) * s;
  return along >= -2 ? k : -1;
}
