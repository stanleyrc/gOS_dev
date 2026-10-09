/**
 * View-window math and canvas painting for the driver x cell matrix
 * (columns = cells in tree order). A view is a fractional column window
 * [v0, v1) so wheel / trackpad deltas accumulate smoothly instead of
 * snapping to whole cells every tick. Kept free of d3 so it can be unit tested.
 */
export const MIN_SPAN = 8;

/** Keep a view inside [0, n] and at least `minSpan` columns wide. */
export function clampView([v0, v1], n, minSpan = MIN_SPAN) {
  const span = Math.min(n, Math.max(Math.min(minSpan, n), v1 - v0));
  const a = Math.max(0, Math.min(n - span, v0));
  return [a, a + span];
}

/** True when the view shows every column (null = no zoom). */
export const isFullView = (view, n) => !view || (view[0] <= 1e-6 && view[1] >= n - 1e-6);

/** Zoom by `factor` (> 1 zooms out) about the point at fraction `t` (0..1) across the view. */
export function zoomView([v0, v1], t, factor, n, minSpan = MIN_SPAN) {
  const span = v1 - v0;
  const anchor = v0 + t * span;
  const next = span * factor;
  return clampView([anchor - t * next, anchor - t * next + next], n, minSpan);
}

/** Shift the view by `dCols` columns. */
export const panView = ([v0, v1], dCols, n, minSpan = MIN_SPAN) => clampView([v0 + dCols, v1 + dCols], n, minSpan);

/** Wheel delta in pixels whatever the deltaMode (Firefox reports lines). */
export const wheelPixels = (delta, deltaMode) => delta * (deltaMode === 1 ? 33 : deltaMode === 2 ? 400 : 1);

/** Zoom factor for one wheel event, capped so a single notch never jumps more than 2x. */
export const wheelFactor = (deltaY, deltaMode) => Math.min(2, Math.max(0.5, Math.exp(wheelPixels(deltaY, deltaMode) * 0.002)));

/**
 * The SVG transform that maps content laid out for view `drawn` onto view
 * `live` (both `width` px wide starting at x = `x0`): applied to the tree /
 * clone strip group during a gesture so nothing re-renders until it settles.
 */
export function viewTransform(drawn, live, x0, width) {
  const dSpan = drawn[1] - drawn[0];
  const lSpan = live[1] - live[0];
  const k = dSpan / lSpan;
  const tx = x0 * (1 - k) + ((drawn[0] - live[0]) * width) / lSpan;
  return { k, tx };
}

/** Whole column range [from, to] worth rendering for a view: the view plus one span either side. */
export function bufferedColumns([v0, v1], n) {
  const span = v1 - v0;
  return [Math.max(0, Math.floor(v0 - span)), Math.min(n - 1, Math.ceil(v1 + span))];
}

/** One Uint8Array per row over the columns (1 = the cell carries the row's alteration). */
export function carrierMasks(rows, order) {
  return rows.map((r) => {
    const mask = new Uint8Array(order.length);
    order.forEach((id, i) => {
      if (r.carriers.has(id)) mask[i] = 1;
    });
    return mask;
  });
}

/** Column and row under a point of the matrix canvas (CSS px), or null off the cells. */
export function matrixHit(x, y, [v0, v1], width, rowH, nRows) {
  if (x < 0 || x >= width || y < 0) return null;
  const row = Math.floor(y / rowH);
  if (row >= nRows) return null;
  return { row, col: Math.floor(v0 + (x / width) * (v1 - v0)) };
}

/**
 * Paint the carrier cells of view [v0, v1) onto a 2D context sized `width` x
 * rows * rowH CSS px (the caller sets the device-pixel transform). Wide
 * columns get one inset rect per cell; narrow ones one rect per run of
 * carriers, so the cost is bounded by the visible columns, not the cohort.
 * `selected` is a Uint8Array over columns, or null when nothing is selected;
 * `separators` are column indices where a dashed clone boundary goes.
 */
export function drawMatrix(ctx, { masks, colors, selected = null, view, width, rowH, separators = [], minCellW = 4 }) {
  const [v0, v1] = view;
  const cellW = width / (v1 - v0);
  const n = masks.length ? masks[0].length : 0;
  const from = Math.max(0, Math.floor(v0));
  const to = Math.min(n - 1, Math.ceil(v1) - 1);
  const x = (i) => (i - v0) * cellW;
  const perCell = cellW >= minCellW;
  const inset = perCell ? 0.5 : 0;
  ctx.clearRect(0, 0, width, masks.length * rowH);
  masks.forEach((mask, k) => {
    ctx.fillStyle = colors[k];
    const y = k * rowH + 3;
    const h = rowH - 6;
    for (let i = from; i <= to; i += 1) {
      if (!mask[i]) continue;
      const sel = selected ? selected[i] : 1;
      let last = i;
      if (!perCell) while (last < to && mask[last + 1] && (selected ? selected[last + 1] : 1) === sel) last += 1;
      ctx.globalAlpha = sel ? 0.95 : 0.3;
      const x0 = x(i) + inset;
      ctx.fillRect(x0, y, Math.max(1, x(last + 1) - inset - x0), h);
      i = last;
    }
  });
  ctx.globalAlpha = 1;
  if (separators.length) {
    ctx.strokeStyle = "#bfbfbf";
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    separators.forEach((c) => {
      if (c <= v0 || c >= v1) return;
      const sx = Math.round(x(c)) + 0.5;
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, masks.length * rowH);
    });
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

/** Number of selected columns within [a, b] from prefix counts (prefix[i] = selected among columns < i). */
export const selectedInRange = (prefix, a, b) => prefix[b + 1] - prefix[a];

/** Prefix counts of selected columns, for O(1) "is this whole clade selected" checks. */
export function selectionPrefix(n, selectedCols) {
  const prefix = new Int32Array(n + 1);
  for (let i = 0; i < n; i += 1) prefix[i + 1] = prefix[i] + (selectedCols && selectedCols.has(i) ? 1 : 0);
  return prefix;
}
