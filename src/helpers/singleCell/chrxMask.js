import { resolveChromosome } from "./matrix";

// dryclean zeroes chrX in low-depth cells (coverage-normalisation artefact);
// whole-chrX CN 0 is impossible in a living cell, so such chrX bins are masked.
export const CHRX_MASK_NOTE =
  "chrX masked (CN 0 from a coverage-normalisation artefact in low-depth cells)";

function median(a) {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Flag a cell whose chrX is CN 0 over more than `minFraction` of its covered
 * chrX bp while its autosomal median CN is >= 1, and return the row with chrX
 * values set to NaN (the "missing" state). chrY is untouched.
 * row = { binIndex: { n, chromosome, start, end }, values }.
 * Returns { row, masked }; the input row is never mutated.
 */
export function maskChrX(row, chromoBins, minFraction = 0.5) {
  if (!row?.binIndex || !row.values) return { row, masked: false };
  const xKey = resolveChromosome("X", chromoBins);
  if (!xKey) return { row, masked: false };
  const { binIndex, values } = row;
  const auto = [];
  let xBp = 0;
  let xZeroBp = 0;
  const xBins = [];
  for (let k = 0; k < binIndex.n; k += 1) {
    const v = values[k];
    const chr = binIndex.chromosome[k];
    if (chr === xKey) {
      xBins.push(k);
      if (Number.isFinite(v)) {
        const len = Math.max(1, binIndex.end[k] - binIndex.start[k] + 1);
        xBp += len;
        if (v === 0) xZeroBp += len;
      }
    } else if (Number.isFinite(v) && resolveChromosome(chr, chromoBins) && /^(chr)?\d+$/i.test(`${chr}`)) {
      auto.push(v);
    }
  }
  const masked = xBp > 0 && xZeroBp / xBp > minFraction && median(auto) >= 1;
  if (!masked) return { row, masked: false };
  const out = Float32Array.from(values);
  xBins.forEach((k) => {
    out[k] = NaN;
  });
  return { row: { ...row, values: out }, masked: true };
}

/**
 * Mask every row of a cohort CN matrix ({ cells: [...ids], rows: [...] }).
 * Returns { rowOf: Map(cellId -> row), maskedIds: Set }. Inputs are not mutated.
 */
export function maskChrXRows(cells, rows, chromoBins) {
  const rowOf = new Map();
  const maskedIds = new Set();
  (cells || []).forEach((id, k) => {
    const { row, masked } = maskChrX(rows[k], chromoBins);
    rowOf.set(id, row);
    if (masked) maskedIds.add(id);
  });
  return { rowOf, maskedIds };
}
