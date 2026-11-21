// Hi-C units of a report (public droplet Hi-C dataset): which reports have Hi-C (gating), the unit list from
// data/<report>/hic/units.json (gos-hic-units/1) or the cell records, unit order (grouped by sample, optional
// interleave by match_group), per-cell copy number (gos-hic-cellcn/1) and the unit behind a selected row.
// d3-free (jest).

export const UNITS_FORMAT = "gos-hic-units/1";
export const CELLCN_FORMAT = "gos-hic-cellcn/1";
export const HIC_DATASET_LABEL = "public droplet Hi-C (GBM39, GBM39-ER)";

const truthy = (v) => v === true || v === "TRUE" || v === "true";

/** The folder of a unit's files: source_unit (combined reports reuse the source unit's files) or its own id. */
export const unitFolderOf = (rec) => (rec ? `${rec.source_unit || rec.pair || rec.cell_id || ""}` : "");

/** True when any cell record of the report has a Hi-C contact map: the Hi-C panel renders only then. */
export const reportHasHic = (cells) => (cells || []).some((c) => truthy(c.has_hic));

/** Problems with a units.json ([] when usable). */
export function validateUnits(d) {
  if (!d || typeof d !== "object") return ["not a JSON object"];
  const e = [];
  if (d.format !== UNITS_FORMAT) e.push(`format must be ${UNITS_FORMAT}`);
  if (!Array.isArray(d.units)) e.push("units must be an array");
  return e;
}

/**
 * Units as [{ id, folder, sample, cluster, nCells, hasHic, hasGraph, hasEaglec, matchGroup, notAvailable }].
 * From units.json when given (ids = the report's cell ids: for a combined report the records whose source_unit is
 * the listed unit), else from the cell records.
 */
export function hicUnitList(cells, unitsJson = null) {
  const recs = (cells || []).filter((c) => truthy(c.has_hic) || c.source_unit);
  const fromRec = (c) => ({
    id: c.cell_id,
    folder: unitFolderOf(c),
    sample: c.sample ?? null,
    cluster: c.cluster ?? c.clone_id ?? null,
    nCells: Number(c.n_cells) || null,
    hasHic: truthy(c.has_hic),
    hasGraph: c.has_graph == null ? true : truthy(c.has_graph),
    hasEaglec: c.has_eaglec == null ? null : truthy(c.has_eaglec),
    matchGroup: c.match_group ?? null,
    notAvailable: c.not_available || {},
  });
  if (!unitsJson || validateUnits(unitsJson).length) return recs.map(fromRec);
  const byKey = new Map();
  recs.forEach((c) => {
    byKey.set(c.cell_id, c);
    if (c.source_unit && !byKey.has(`src:${c.source_unit}`)) byKey.set(`src:${c.source_unit}`, c);
  });
  return unitsJson.units
    .map((u) => {
      const rec = byKey.get(u.unit) || byKey.get(`src:${u.source_unit || u.unit}`);
      if (!rec) return null;
      const base = fromRec(rec);
      return {
        ...base,
        sample: u.sample ?? base.sample,
        cluster: u.cluster ?? base.cluster,
        nCells: Number(u.n_cells) || base.nCells,
        hasHic: u.has_hic == null ? base.hasHic : truthy(u.has_hic),
        hasGraph: u.has_graph == null ? base.hasGraph : truthy(u.has_graph),
        hasEaglec: u.has_eaglec == null ? base.hasEaglec : truthy(u.has_eaglec),
        matchGroup: u.match_group ?? base.matchGroup,
        notAvailable: { ...base.notAvailable, ...(u.not_available || {}) },
      };
    })
    .filter(Boolean);
}

/** Distinct samples in unit order. */
export const samplesOf = (units) => [...new Set((units || []).map((u) => u.sample).filter((s) => s != null))];

/** True when units.json defines match groups (the interleave option is offered only then). */
export const hasMatchGroups = (units) => (units || []).some((u) => u.matchGroup != null && u.matchGroup !== "");

const clusterNum = (u) => {
  const m = `${u.cluster ?? u.id}`.match(/(\d+)\s*$/);
  return m ? Number(m[1]) : Infinity;
};

/**
 * Unit ids in display order: grouped by sample (in first-appearance order) then cluster number (groupBy "sample"),
 * or as given ("none"). interleave: by match_group, then sample within a group (units without a group last).
 */
export function orderUnits(units, { groupBy = "sample", interleave = false } = {}) {
  const list = [...(units || [])];
  const sOrder = samplesOf(list);
  const sIdx = (u) => (u.sample == null ? sOrder.length : sOrder.indexOf(u.sample));
  if (interleave && hasMatchGroups(list)) {
    const gOrder = [...new Set(list.map((u) => u.matchGroup).filter((g) => g != null && g !== ""))];
    const gIdx = (u) => (u.matchGroup == null || u.matchGroup === "" ? gOrder.length : gOrder.indexOf(u.matchGroup));
    return list.sort((a, b) => gIdx(a) - gIdx(b) || sIdx(a) - sIdx(b) || clusterNum(a) - clusterNum(b)).map((u) => u.id);
  }
  if (groupBy !== "sample") return list.map((u) => u.id);
  return list.sort((a, b) => sIdx(a) - sIdx(b) || clusterNum(a) - clusterNum(b)).map((u) => u.id);
}

/** Sample colors from units.json (`samples: [{ sample, color }]`), else a fixed palette in sample order. */
export function sampleColors(units, unitsJson = null) {
  const pal = ["#1b9e77", "#d95f02", "#7570b3", "#e7298a", "#66a61e"];
  const out = {};
  (unitsJson?.samples || []).forEach((s) => {
    if (s?.sample && s.color) out[s.sample] = s.color;
  });
  samplesOf(units).forEach((s, i) => {
    if (!out[s]) out[s] = pal[i % pal.length];
  });
  return out;
}

// ----- per-cell copy number (gos-hic-cellcn/1)

/** Problems with a cells_cn.json ([] when usable). */
export function validateCellsCn(d) {
  if (!d || typeof d !== "object") return ["not a JSON object"];
  const e = [];
  if (d.format !== CELLCN_FORMAT) e.push(`format must be ${CELLCN_FORMAT}`);
  if (!Array.isArray(d.chroms) || !d.chroms.length) e.push("no chroms");
  if (!Array.isArray(d.cells) || !d.cells.length) e.push("no cells");
  if (typeof d.values !== "string") e.push("values must be base64");
  return e;
}

function base64ToBytes(b64) {
  if (typeof atob === "function") {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
    return out;
  }
  // eslint-disable-next-line no-undef
  return new Uint8Array(Buffer.from(b64, "base64"));
}

/**
 * Decoded per-cell CN: { nCells, nBins, binSize, chroms, cells, values: Float32Array (cells x bins, NaN = NA) }.
 * The file stores uint16 little-endian CN * scale (65535 = NA).
 */
export function decodeCellsCn(d) {
  const nBins = (d.chroms || []).reduce((s, c) => Math.max(s, (Number(c.start_bin) || 0) + (Number(c.nbins) || 0)), 0);
  const nCells = (d.cells || []).length;
  const bytes = base64ToBytes(d.values || "");
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const scale = Number(d.scale) > 0 ? Number(d.scale) : 1;
  const values = new Float32Array(nCells * nBins).fill(NaN);
  const n = Math.min(values.length, Math.floor(bytes.byteLength / 2));
  for (let i = 0; i < n; i += 1) {
    const v = dv.getUint16(2 * i, true);
    values[i] = v === 65535 ? NaN : v / scale;
  }
  return { nCells, nBins, binSize: Number(d.bin_size) || 1e6, chroms: d.chroms.map((c) => ({ name: `${c.name}`.replace(/^chr/i, ""), startBin: Number(c.start_bin) || 0, nbins: Number(c.nbins) || 0 })), cells: d.cells, values };
}

/** Bin range [b0, b1] (inclusive, global) of a window { chrom, start, end } in a decoded cells_cn, or null. */
export function cnBinsOf(cn, w) {
  const c = cn.chroms.find((x) => x.name === `${w.chrom}`.replace(/^chr/i, ""));
  if (!c || !c.nbins) return null;
  const lo = Math.max(0, Math.floor((w.start - 1) / cn.binSize));
  const hi = Math.min(c.nbins - 1, Math.floor((w.end - 1) / cn.binSize));
  return hi < lo ? null : [c.startBin + lo, c.startBin + hi];
}

/**
 * Row order of the per-cell heat map: cells grouped by the unit order (unitOrder: ids or source units) and then by
 * file order. Returns indices into cn.cells.
 */
export function cellRowOrder(cn, unitOrder = []) {
  const rank = new Map(unitOrder.map((u, i) => [u, i]));
  return cn.cells
    .map((c, i) => ({ i, r: rank.has(c.unit) ? rank.get(c.unit) : unitOrder.length }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.i);
}

/**
 * The unit ids to draw for a selection on the Single-Cell page: selected unit rows directly, selected per-cell rows
 * through their unit (cells_cn cells[].unit, matched to unit ids or folders), in unit order, at most `max`.
 */
export function unitsForSelection(selectedIds, units, cnCells = null, max = 6) {
  const ids = new Set(units.map((u) => u.id));
  const byFolder = new Map(units.map((u) => [u.folder, u.id]));
  const cellUnit = new Map((cnCells || []).map((c) => [c.id, c.unit]));
  const picked = new Set();
  (selectedIds || []).forEach((s) => {
    if (ids.has(s)) picked.add(s);
    else if (cellUnit.has(s)) {
      const u = cellUnit.get(s);
      const id = ids.has(u) ? u : byFolder.get(u);
      if (id) picked.add(id);
    }
  });
  return units.map((u) => u.id).filter((id) => picked.has(id)).slice(0, max);
}

/** Label of a unit's map on the Single-Cell page; a per-cell selection shows its cluster pseudobulk. */
export function mapLabel(unit, viaCell = false) {
  const n = unit?.nCells ? `${unit.nCells} cells` : "cells: not available";
  const base = `${unit?.sample ? `${unit.sample} · ` : ""}${unit?.cluster ?? unit?.id}`;
  return viaCell ? `${base}: cluster pseudobulk (${n}); per-cell contact maps are not exported` : `${base}: cluster pseudobulk (${n})`;
}

export const MAX_HIC_VIEW_SPAN = 60e6; // bp per window: wider views (e.g. the whole genome) fall back to a preset locus
export const DEFAULT_HIC_LOCUS = "chr7:54,400,000-56,400,000"; // EGFR amplicon (the dataset's main ecDNA)

/**
 * Windows of the Single-Cell page Hi-C panel from the shared genome view: the view's windows when there are at most
 * `maxWindows` and each spans at most MAX_HIC_VIEW_SPAN, else null (the caller uses a preset and says why).
 * windows: [{ chrom, start, end }] already converted from the gOS domains.
 */
export function hicWindowsFromView(windows, maxWindows = 4) {
  const w = (windows || []).filter(Boolean);
  if (!w.length) return { windows: null, reason: "no region in view" };
  if (w.length > maxWindows) return { windows: null, reason: `${w.length} regions in view (at most ${maxWindows})` };
  const wide = w.find((x) => x.end - x.start > MAX_HIC_VIEW_SPAN);
  if (wide) return { windows: null, reason: `the view spans ${Math.round((wide.end - wide.start) / 1e6)} Mb; brush a region of at most ${MAX_HIC_VIEW_SPAN / 1e6} Mb` };
  return { windows: w, reason: null };
}
