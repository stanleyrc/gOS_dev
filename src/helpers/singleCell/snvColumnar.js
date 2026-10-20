// Columnar SNV site sets ("gos-sc-snv-cols/1", skilift gos_sc_snv_columnar.py).
//
// A site table (<name>.sites.json: dictionary-encoded / typed columns, sites
// sorted by branch anchor, byte range of every branch) loads on its own; the
// per-cell reads (<name>.cells.bin: CSR by site, 8-byte entries) are fetched
// separately, whole or one branch at a time (HTTP Range), and decoded off the
// main thread (snvColumnarLoader.js runs fillDense in a Web Worker). The
// result has the same shape as snvFromSparse(snv_matrix.json), so every SNV
// view works on it unchanged; per-cell arrays are views into one buffer per
// field instead of one JSON array per (cell, site).
import { snvVariantRecords } from "./cellFiles";

export const SNV_COLS_FORMAT = "gos-sc-snv-cols/1";
export const MISSING_COUNT = 65535; // ref = alt = 65535: a genotype call without read counts

/** One column of a site table -> plain array (null = missing). */
export function decodeColumn(col) {
  if (!col) return [];
  if (col.type === "dict") return col.codes.map((c) => (c < 0 ? null : col.dict[c]));
  if (col.type === "bool") return col.values.map((v) => (v == null ? null : Boolean(v)));
  return col.values || [];
}

/** Site table -> variant objects with the snv_matrix.json keys. */
export function tableVariants(table) {
  const n = table?.n_sites || 0;
  const out = Array.from({ length: n }, () => ({}));
  Object.entries(table?.columns || {}).forEach(([key, col]) => {
    const vals = decodeColumn(col);
    for (let i = 0; i < n; i += 1) if (vals[i] != null) out[i][key] = vals[i];
  });
  return out;
}

export const isColumnarTable = (t) => Boolean(t?.format === SNV_COLS_FORMAT && Array.isArray(t?.cells) && t?.matrix);

/**
 * Dense cell-major arrays for sites [siteStart, siteEnd) from the CSR matrix.
 * offsets: Uint32Array of entry offsets (n_sites + 1); entries: ArrayBuffer of
 * 8-byte entries starting at entry index `entryBase` (0 for the whole file,
 * offsets[siteStart] for a fetched branch range); tableCells: cell ids of the
 * entry cell indices; cellIds: rows of the output.
 * Self-contained, ES5 only (no imports, closures, destructuring or spread):
 * snvColumnarLoader.js ships its source to a Web Worker via toString().
 */
export function fillDense(offsets, entries, entryBase, siteStart, siteEnd, tableCells, cellIds) {
  var n = siteEnd - siteStart;
  var nCells = cellIds.length;
  var rowOf = {};
  var i;
  for (i = 0; i < nCells; i += 1) rowOf[cellIds[i]] = i;
  var map = new Int32Array(tableCells.length);
  for (i = 0; i < tableCells.length; i += 1) map[i] = rowOf[tableCells[i]] == null ? -1 : rowOf[tableCells[i]];
  var status = new Int8Array(nCells * n).fill(-1);
  var alt = new Float32Array(nCells * n).fill(NaN);
  var depth = new Float32Array(nCells * n).fill(NaN);
  var gt = new Int8Array(nCells * n).fill(-1);
  var hasGt = false;
  var dv = new DataView(entries);
  for (var s = siteStart; s < siteEnd; s += 1) {
    var col = s - siteStart;
    for (var k = offsets[s]; k < offsets[s + 1]; k += 1) {
      var off = (k - entryBase) * 8;
      var row = map[dv.getUint16(off, true)];
      if (row < 0) continue;
      var r = dv.getUint16(off + 2, true);
      var a = dv.getUint16(off + 4, true);
      var g = dv.getInt8(off + 6);
      var idx = row * n + col;
      if (g === 0 || g === 1) {
        gt[idx] = g;
        hasGt = true;
      }
      if (r === 65535 && a === 65535) continue;
      alt[idx] = a;
      depth[idx] = a + r;
      status[idx] = a > 0 ? 1 : a + r > 0 ? 0 : -1;
    }
  }
  return { n: n, nCells: nCells, status: status, alt: alt, depth: depth, gt: gt, hasGt: hasGt };
}

/** The header (site offsets) of a .cells.bin buffer. */
export function matrixOffsets(buffer, table) {
  return new Uint32Array(buffer, 0, (table.n_sites || 0) + 1);
}

/** Byte range and site range of the branches with these group keys (anchors), merged when adjacent. */
export function groupRanges(table, keys) {
  const want = new Set(keys);
  const out = [];
  (table?.matrix?.groups || []).forEach((g) => {
    if (!want.has(g.key)) return;
    const last = out[out.length - 1];
    if (last && last.siteEnd === g.first_site) {
      last.siteEnd += g.n_sites;
      last.byteEnd = g.byte_end;
    } else out.push({ siteStart: g.first_site, siteEnd: g.first_site + g.n_sites, byteStart: g.byte_start, byteEnd: g.byte_end });
  });
  return out;
}

/**
 * SNV matrix object (snvFromSparse shape) from a site table and fillDense
 * output for sites [siteStart, siteStart + dense.n). siteQc: optional
 * snv_qc.json merged into the variants (helpers/singleCell/siteQc.js).
 */
export function snvFromColumnar(table, dense, cellIds, chromoBins, { siteStart = 0, mergeQc = null } = {}) {
  let variantsIn = tableVariants(table).slice(siteStart, siteStart + dense.n);
  if (mergeQc) variantsIn = mergeQc({ variants: variantsIn }).variants;
  const { variants, bySourceIndex } = snvVariantRecords(variantsIn, chromoBins);
  const n = dense.n;
  const keepAll = variants.length === n;
  const cols = keepAll ? null : [...bySourceIndex.entries()].sort((x, y) => x[1] - y[1]).map(([src]) => src);
  const view = (arr, r) => {
    const row = arr.subarray(r * n, (r + 1) * n);
    if (keepAll) return row;
    const out = new arr.constructor(variants.length);
    cols.forEach((src, k) => {
      out[k] = row[src];
    });
    return out;
  };
  const rows = cellIds.map((_, r) => r);
  return {
    cells: [...cellIds],
    variants,
    status: rows.map((r) => view(dense.status, r)),
    alt: rows.map((r) => view(dense.alt, r)),
    depth: rows.map((r) => view(dense.depth, r)),
    gt: dense.hasGt ? rows.map((r) => view(dense.gt, r)) : null,
    source: "columnar",
    set: table?.set || null,
  };
}

/**
 * base + extra as one matrix (same cells, extra's variants appended; sites of
 * extra already in base are dropped). Used for the CN-mapped toggle: the
 * tree-site columns keep their indices.
 */
export function appendSnv(base, extra) {
  if (!base) return extra;
  if (!extra || !extra.variants.length) return base;
  const have = new Set(base.variants.map((v) => v.id));
  const keep = [];
  extra.variants.forEach((v, k) => {
    if (!have.has(v.id)) keep.push(k);
  });
  if (!keep.length) return base;
  const n1 = base.variants.length;
  const n = n1 + keep.length;
  const xRow = new Map(extra.cells.map((c, r) => [c, r]));
  const join = (field, Ctor, fillValue) =>
    base.cells.map((cell, r) => {
      const out = new Ctor(n);
      const b = base[field] ? base[field][r] : null;
      if (b) out.set(b);
      else out.fill(fillValue, 0, n1);
      const xr = xRow.get(cell);
      const x = xr == null || !extra[field] ? null : extra[field][xr];
      for (let k = 0; k < keep.length; k += 1) out[n1 + k] = x ? x[keep[k]] : fillValue;
      return out;
    });
  const variants = base.variants.concat(keep.map((k, j) => ({ ...extra.variants[k], index: n1 + j })));
  return {
    ...base,
    variants,
    status: join("status", Int8Array, -1),
    alt: join("alt", Float32Array, NaN),
    depth: join("depth", Float32Array, NaN),
    gt: base.gt || extra.gt ? join("gt", Int8Array, -1) : null,
    appended: { set: extra.set || null, first: n1, count: keep.length },
  };
}
