// Interactive-paper sidecars (gos-paper-sidecar/1, written by the figure scripts' figlib.R write_sidecars): the plot
// areas of a figure page in pt (origin top-left) and what they show (rows = cell ids top to bottom, per-row values,
// a genome axis), so the exact SVG can carry hover, click and brushing. d3-free; reusable for any paper.

const arr = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);

/** Sidecar JSON -> { page: { w, h }, regions: [{ id, panel, kind, x, y, w, h, rows, rowset, values, valueLabel, axis, patient, label }] } | null. */
export function parseSidecar(json) {
  if (!json || !Array.isArray(json.regions)) return null;
  const regions = json.regions
    .map((r) => ({
      id: `${r.id}`,
      panel: r.panel == null ? null : `${r.panel}`,
      kind: r.kind || "rows",
      x: Number(r.x),
      y: Number(r.y),
      w: Number(r.w),
      h: Number(r.h),
      rows: arr(r.rows).map((x) => (x == null ? null : `${x}`)),
      rowset: r.rowset == null ? null : `${r.rowset}`,
      values: r.values == null ? null : arr(r.values),
      valueLabel: r.value_label || null,
      axis: r.axis && typeof r.axis === "object" ? r.axis : null,
      patient: r.patient == null ? null : `${r.patient}`,
      label: r.label || "",
    }))
    .filter((r) => [r.x, r.y, r.w, r.h].every(Number.isFinite) && r.w > 0 && r.h > 0);
  return { page: { w: Number(json.page?.w) || null, h: Number(json.page?.h) || null }, regions };
}

/** Row index of a page y inside a rows region, or -1. */
export function rowIndexAt(region, y) {
  const n = region.rows.length;
  if (!n || y < region.y || y >= region.y + region.h) return -1;
  return Math.min(n - 1, Math.floor(((y - region.y) / region.h) * n));
}

/** Band (page y0, y1) of row i of a region. */
export const rowBand = (region, i) => ({ y0: region.y + (i * region.h) / region.rows.length, y1: region.y + ((i + 1) * region.h) / region.rows.length });

/** Genome position (bp) of a page x in a region with a genome axis, else null. */
export function axisPosition(region, x) {
  const a = region.axis;
  if (!a || a.type !== "genome" || !Number.isFinite(Number(a.from)) || !Number.isFinite(Number(a.to))) return null;
  const t = (x - region.x) / region.w;
  if (t < 0 || t > 1) return null;
  return { chr: `${a.chr}`, pos: Math.round(Number(a.from) + t * (Number(a.to) - Number(a.from))) };
}

/**
 * What is under a page point: { region, index, id, value, extras: [{ label, value }], position } with the values of
 * every region in the same rowset for that row (clade, state, copies ...); null outside every rows region.
 */
export function hitAt(sidecar, x, y) {
  if (!sidecar) return null;
  const region = sidecar.regions.find((r) => r.kind === "rows" && r.rows.length && x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
  if (!region) return null;
  const index = rowIndexAt(region, y);
  if (index < 0) return null;
  const id = region.rows[index];
  const extras = sidecar.regions
    .filter((r) => r.values && (r.rowset ? r.rowset === region.rowset : r.id === region.id))
    .map((r) => {
      const k = r.rows.indexOf(id);
      return { label: r.valueLabel || r.label, value: k >= 0 ? r.values[k] : null };
    })
    .filter((e) => e.value != null && e.value !== "");
  return { region, index, id, value: region.values ? region.values[index] : null, extras, position: axisPosition(region, x) };
}

/** Row ids of a region between two page ys (inclusive, any order). */
export function rowsBetween(region, ya, yb) {
  const n = region.rows.length;
  const i0 = Math.max(0, rowIndexAt(region, Math.max(region.y, Math.min(ya, yb))));
  const i1 = Math.min(n - 1, rowIndexAt(region, Math.min(region.y + region.h - 1e-6, Math.max(ya, yb))));
  return i0 <= i1 && i1 >= 0 ? region.rows.slice(i0, i1 + 1).filter(Boolean) : [];
}

/**
 * Highlight rectangles (page pt) for a set of row ids: in every region of the rowset (or the region itself), one
 * rectangle per contiguous run of selected rows. [{ x, y, w, h }]
 */
export function highlightRects(sidecar, rowset, regionId, ids) {
  if (!sidecar || !ids?.size) return [];
  const out = [];
  sidecar.regions
    .filter((r) => r.kind === "rows" && (rowset ? r.rowset === rowset : r.id === regionId))
    .forEach((r) => {
      let start = -1;
      r.rows.forEach((id, i) => {
        const on = ids.has(id);
        if (on && start < 0) start = i;
        if ((!on || i === r.rows.length - 1) && start >= 0) {
          const end = on ? i : i - 1;
          const a = rowBand(r, start);
          const b = rowBand(r, end);
          out.push({ x: r.x, y: a.y0, w: r.w, h: b.y1 - a.y0 });
          start = -1;
        }
      });
    });
  return out;
}
