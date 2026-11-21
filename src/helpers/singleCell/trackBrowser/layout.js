// Row layout of the track browser: pseudobulk-first rows, row heights (slider, presets, per-track overrides,
// auto-fit) and per-window y scales. d3-free (jest).

export const HEIGHT_MIN = 12;
export const HEIGHT_MAX = 200;
export const PRESETS = { compact: 24, readable: 56, large: 120 };
export const AUTO_FIT_MIN = 40; // auto-fit never shrinks rows below this before scrolling starts
export const PSEUDOBULK_FACTOR = 1.6; // clade rows are taller than cell rows

export const clampHeight = (h) => Math.max(HEIGHT_MIN, Math.min(HEIGHT_MAX, Math.round(Number(h) || PRESETS.readable)));

/**
 * Rows in display order. mode "pseudobulk": one row per group (in order of first appearance in `units`, which are
 * in tree order), each followed by its cells when expanded. mode "cells": one row per unit.
 * Returns [{ key, kind: "clade" | "cell", group, id?, members?, depth }].
 */
export function buildRows(units, mode = "pseudobulk", expanded = {}) {
  if (mode !== "pseudobulk") return units.map((u) => ({ key: `cell:${u.id}`, kind: "cell", id: u.id, group: u.group, depth: 0 }));
  const order = [];
  const members = new Map();
  units.forEach((u) => {
    const g = u.group ?? "no clone";
    if (!members.has(g)) {
      members.set(g, []);
      order.push(g);
    }
    members.get(g).push(u.id);
  });
  const rows = [];
  order.forEach((g) => {
    rows.push({ key: `clade:${g}`, kind: "clade", group: g, members: members.get(g), depth: 0 });
    if (expanded[g]) members.get(g).forEach((id) => rows.push({ key: `cell:${id}`, kind: "cell", id, group: g, depth: 1 }));
  });
  return rows;
}

/**
 * Height (px) of each sub-row of a row. base: the slider value; overrides: { graph, coverage } (null = base);
 * tracks: { graph: bool, coverage: bool }. Clade rows show the graph only (pseudobulk coverage needs the gCells export).
 */
export function subRowHeights(row, base, overrides = {}, tracks = { graph: true, coverage: true }) {
  const g = clampHeight(overrides.graph ?? base);
  const c = clampHeight(overrides.coverage ?? base);
  if (row.kind === "clade") return tracks.graph || tracks.coverage ? { graph: clampHeight(Math.max(g, AUTO_FIT_MIN) * PSEUDOBULK_FACTOR), coverage: 0 } : { graph: 0, coverage: 0 };
  return { graph: tracks.graph ? g : 0, coverage: tracks.coverage ? c : 0 };
}

/**
 * Auto-fit: when the rows at `base` height leave the viewport partly empty, scale base up (at most HEIGHT_MAX) so
 * the stack fills it; never below max(base, AUTO_FIT_MIN). Returns the effective base height.
 */
export function autoFitBase(rows, base, overrides, tracks, viewH, gap = 3) {
  const total = (b) => rows.reduce((s, r) => {
    const h = subRowHeights(r, b, overrides, tracks);
    return s + h.graph + h.coverage + gap;
  }, 0);
  let b = Math.max(base, AUTO_FIT_MIN);
  if (total(b) >= viewH) return clampHeight(b);
  let lo = b;
  let hi = HEIGHT_MAX;
  if (total(hi) <= viewH) return HEIGHT_MAX;
  for (let k = 0; k < 20; k += 1) {
    const mid = (lo + hi) / 2;
    if (total(mid) <= viewH) lo = mid;
    else hi = mid;
  }
  b = Math.floor(lo);
  return clampHeight(b);
}

/** Cumulative row offsets: [{ row, top, height, graph, coverage }] and the total height. */
export function rowOffsets(rows, base, overrides, tracks, gap = 3) {
  let top = 0;
  const out = rows.map((row) => {
    const h = subRowHeights(row, base, overrides, tracks);
    const item = { row, top, height: h.graph + h.coverage, graph: h.graph, coverage: h.coverage };
    top += item.height + gap;
    return item;
  });
  return { items: out, total: top };
}

/** Index of the row item at y (binary search on tops), or -1. */
export function rowAt(items, y) {
  let lo = 0;
  let hi = items.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const it = items[mid];
    if (y < it.top) hi = mid - 1;
    else if (y > it.top + it.height) lo = mid + 1;
    else return mid;
  }
  return -1;
}

// ----- per-window y scales (brief dc addendum): windows[i].y = { mode: auto | shared | manual, min, max, log, robust }

export const DEFAULT_Y = { mode: "auto", min: 0, max: null, log: null, robust: false };

const niceUp = (v) => {
  if (!(v > 0)) return 4;
  const pow = 10 ** Math.floor(Math.log10(v));
  return [1, 1.5, 2, 3, 4, 5, 6, 8, 10].map((m) => m * pow).find((s) => s >= v - 1e-9) || 10 * pow;
};

/** Quantile of the values (or max when q >= 1). */
export function valueQuantile(values, q) {
  const v = (values || []).filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return null;
  if (q >= 1) return v[v.length - 1];
  return v[Math.min(v.length - 1, Math.floor(q * (v.length - 1)))];
}

/**
 * Resolve each window's scale. stats[i] = { max, p99 } of the CN values visible in window i.
 * shareY: one scale for all windows (the widest auto scale unless a window is manual). Returns
 * [{ min, max, log, mode, robust }] with max rounded to a readable number.
 */
export function resolveWindowScales(ys, stats, shareY = false) {
  const autoMax = (i) => {
    const y = ys[i] || DEFAULT_Y;
    const s = stats[i] || {};
    const v = y.robust ? s.p99 ?? s.max : s.max;
    return Math.max(4, niceUp(v || 0));
  };
  const autoLog = (max) => max > 12;
  const out = (stats.length ? stats : ys).map((_, i) => {
    const y = { ...DEFAULT_Y, ...(ys[i] || {}) };
    if (y.mode === "manual" && Number.isFinite(y.max) && y.max > (y.min || 0)) return { min: y.min || 0, max: y.max, log: y.log ?? autoLog(y.max), mode: "manual", robust: false };
    const max = autoMax(i);
    return { min: 0, max, log: y.log ?? autoLog(max), mode: y.mode, robust: y.robust };
  });
  const shared = out.filter((s, i) => shareY || (ys[i] || {}).mode === "shared");
  if (shared.length) {
    const max = Math.max(...shared.map((s) => s.max));
    const log = shared.some((s) => s.log);
    out.forEach((s, i) => {
      if (shareY || (ys[i] || {}).mode === "shared") Object.assign(s, { max, min: 0, log, shared: true });
    });
  }
  return out;
}

/** True when the windows are drawn on different y scales (the "y scale differs" marker). */
export const scalesDiffer = (scales) => scales.length > 1 && scales.some((s) => s.max !== scales[0].max || s.min !== scales[0].min || s.log !== scales[0].log);

/** Fraction (0 bottom .. 1 top) of a CN on a window scale; clipped reports values beyond the max. */
export function scaleFrac(v, sc) {
  if (!Number.isFinite(v) || !sc) return { f: 0, clipped: false };
  const lo = sc.min || 0;
  const t = (x) => (sc.log ? Math.log1p(Math.max(0, x)) : x);
  const f = (t(Math.max(lo, v)) - t(lo)) / (t(sc.max) - t(lo) || 1);
  return { f: Math.max(0, Math.min(1, f)), clipped: v > sc.max };
}

/** Ticks only at 0 (or min), 2 and max (brief dc 3); 2 is dropped when outside the range. */
export const scaleTicks = (sc) => [...new Set([sc.min || 0, ...(sc.min < 2 && sc.max > 2 ? [2] : []), sc.max])];

// ----- persistence (per browser) of the height settings

const KEY = "gos.trackbrowser.layout.v1";
export function loadLayoutPrefs(storage = typeof window !== "undefined" ? window.localStorage : null) {
  try {
    const v = storage && JSON.parse(storage.getItem(KEY) || "null");
    return v && typeof v === "object" ? v : null;
  } catch (e) {
    return null;
  }
}
export function saveLayoutPrefs(prefs, storage = typeof window !== "undefined" ? window.localStorage : null) {
  try {
    if (storage) storage.setItem(KEY, JSON.stringify(prefs));
    return true;
  } catch (e) {
    return false;
  }
}
