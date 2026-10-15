// Column geometry of the Drivers heatmap layer, shared by the canvas (pixel -> column
// lookup) and the column header (names, class bars) so a label is always centred on
// its column, at any width, zoom or devicePixelRatio. d3-free.
//
// - columnEdge / columnSpan: where driver column i of `count` starts and ends, in the
//   same device pixels the canvas lookup (matrix.js discreteColumnLookup) uses.
// - driverView: which columns are visible and how wide the block is (auto fit, a fixed
//   px per column, and the zoom range).
// - zoomRange / panRange: the zoom state, a [start, end) column range (null = all).
// - driverLayoutFromSearch / driverLayoutToSearch: the width + "show on CN" URL params.

export const DRIVER_COL_PX_MIN = 4;
export const DRIVER_COL_PX_MAX = 40;
export const DRIVER_AUTO_COL = 28; // px per column of the auto-fit standalone layer (few drivers stay compact)
export const DRIVER_AUTO_COL_BESIDE = 10; // same, beside the copy-number heatmap
export const DRIVER_MIN_VISIBLE = 3;

export const clampColPx = (v) => {
  const x = Number(v);
  return Number.isFinite(x) && x > 0 ? Math.max(DRIVER_COL_PX_MIN, Math.min(DRIVER_COL_PX_MAX, Math.round(x))) : null;
};

/** Device pixel at which column i starts, exactly where discreteColumnLookup(count, devWidth) switches to i. */
export function columnEdge(i, count, devWidth) {
  if (!count || devWidth <= 0) return 0;
  if (i <= 0) return 0;
  if (i >= count) return devWidth;
  return Math.max(0, Math.min(devWidth, Math.ceil((i * devWidth) / count - 0.5)));
}

/** CSS-pixel span { left, right, centre, width } of column i for a canvas of `width` CSS px at `pixelRatio`. */
export function columnSpan(i, count, width, pixelRatio = 1) {
  const pr = pixelRatio > 0 ? pixelRatio : 1;
  const dev = Math.floor(width * pr);
  const left = columnEdge(i, count, dev) / pr;
  const right = columnEdge(i + 1, count, dev) / pr;
  return { left, right, centre: (left + right) / 2, width: right - left };
}

const clampRange = (start, count, n) => {
  const size = Math.max(Math.min(DRIVER_MIN_VISIBLE, n), Math.min(n, Math.round(count)));
  const s = Math.max(0, Math.min(n - size, Math.round(start)));
  return s === 0 && size === n ? null : [s, s + size];
};

/** Zoom the visible column range about `frac` (0-1 across the block); factor < 1 zooms in. Null = all columns. */
export function zoomRange(range, n, frac, factor) {
  if (!n) return null;
  const [s, e] = range || [0, n];
  const span = e - s;
  const f = Math.max(0, Math.min(1, frac));
  const next = span * factor;
  return clampRange(s + f * span - f * next, next, n);
}

/** Pan the visible range by dx px of a block `width` px wide. */
export function panRange(range, n, dx, width) {
  if (!n || !range || width <= 0) return range || null;
  const [s, e] = range;
  return clampRange(s - (dx * (e - s)) / width, e - s, n);
}

/**
 * Visible columns and block width.
 * n: columns; range: zoom range or null; colPx: fixed px per column or null (auto fit);
 * maxWidth: room for the block; autoCol: px per column when auto and not zoomed.
 * Zoomed + auto fills maxWidth; a fixed colPx never shows more columns than fit.
 */
export function driverView({ n, range = null, colPx = null, maxWidth, autoCol = DRIVER_AUTO_COL }) {
  if (!n || !(maxWidth > 0)) return { start: 0, end: 0, count: 0, width: 0, colWidth: 0, zoomed: false, clipped: false };
  let [start, end] = range && range[1] > range[0] ? [Math.max(0, range[0]), Math.min(n, range[1])] : [0, n];
  const zoomed = Boolean(range);
  const fixed = clampColPx(colPx);
  let clipped = false;
  if (fixed) {
    const fit = Math.max(1, Math.floor(maxWidth / fixed));
    if (end - start > fit) {
      end = start + fit;
      clipped = true;
    }
  }
  const count = end - start;
  const width = Math.max(1, Math.round(fixed ? Math.min(maxWidth, count * fixed) : zoomed ? maxWidth : Math.min(maxWidth, count * autoCol)));
  return { start, end, count, width, colWidth: width / count, zoomed, clipped };
}

/** Width (px) and zoom range after "auto fit" is chosen or the slider moves; keeps URL values sane. */
export const colWidthLabel = (colPx, view) => (clampColPx(colPx) ? `${clampColPx(colPx)} px` : `auto (${Math.round(view?.colWidth || 0)} px)`);

/** URL params: drvw=<px per column> (absent = auto fit), cndrv=1 (drivers beside the copy-number heatmap). */
export function driverLayoutFromSearch(search = "") {
  const p = new URLSearchParams(search);
  const out = {};
  if (p.has("drvw")) out.driverColPx = clampColPx(p.get("drvw"));
  if (p.has("cndrv")) out.cnDrivers = ["1", "true"].includes(p.get("cndrv"));
  return Object.keys(out).length ? out : null;
}

export const DRIVER_LAYOUT_PARAMS = ["drvw", "cndrv"];

/** Params to write for the layout in force: heatmapType "drivers" or "cn" (+ cnDrivers); {} otherwise. */
export function driverLayoutToSearch({ heatmapType, driverColPx, cnDrivers } = {}) {
  const shown = heatmapType === "drivers" || (heatmapType === "cn" && cnDrivers);
  if (!shown) return {};
  const out = {};
  if (clampColPx(driverColPx)) out.drvw = `${clampColPx(driverColPx)}`;
  if (heatmapType === "cn") out.cndrv = "1";
  return out;
}
