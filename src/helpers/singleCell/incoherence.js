// Phylogenetic incoherence of copy number: amplified segments whose per-cell
// copy number does not follow the DNA tree. Chromosomal amplifications are
// inherited, so tree neighbours share their copy number; ecDNA segregates
// randomly at each division, so neighbours differ about as much as random
// pairs and the copy distribution is wide and heavy-tailed. d3-free.
import { binAt } from "./matrix";
import { leafDistances, moranI, treeWeights } from "./heritability";

const median = (v) => {
  const s = v.filter(Number.isFinite).sort((a, b) => a - b);
  if (!s.length) return NaN;
  const k = s.length >> 1;
  return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2;
};

/**
 * Amplified segments on a grid: consecutive grid points (step bp) where >= minCellFrac
 * of the cells have CN >= ampCn merge into one segment. Returns [{ chromosome,
 * gStart, gEnd, start, end, values: Map cellId -> median CN over the segment }].
 */
export function amplifiedSegments(cn, chromoBins, { step = 250e3, ampCn = 6, minCellFrac = 0.1, cellIds = null } = {}) {
  if (!cn?.cells) return [];
  const rows = cn.cells.map((id, k) => [`${id}`, cn.rows[k]]).filter(([id, r]) => r && (!cellIds || cellIds.has(id)));
  if (!rows.length) return [];
  const out = [];
  Object.keys(chromoBins)
    .filter((c) => /^(chr)?([0-9]{1,2}|X)$/.test(c))
    .forEach((c) => {
      const { startPlace, endPlace } = chromoBins[c];
      let open = null;
      const close = () => {
        if (open) {
          const values = new Map(rows.map(([id], i) => [id, median(open.v.map((col) => col[i]))]));
          out.push({ chromosome: c, gStart: open.g0, gEnd: open.g1, start: open.g0 - startPlace, end: open.g1 - startPlace, values });
        }
        open = null;
      };
      for (let g = startPlace + step / 2; g < endPlace; g += step) {
        const col = rows.map(([, r]) => {
          const b = binAt(r.binIndex, g);
          return b >= 0 ? r.values[b] : NaN;
        });
        const amp = col.filter((x) => x >= ampCn).length / rows.length;
        if (amp < minCellFrac) {
          close();
          continue;
        }
        if (!open) open = { g0: g - step / 2, g1: g + step / 2, v: [] };
        open.g1 = g + step / 2;
        open.v.push(col);
      }
      close();
    });
  return out;
}

/**
 * Incoherence of one segment's per-cell values on the tree: nearest-neighbour
 * discordance ratio (mean |x_i - x_nn(i)| over mean |x_i - x_j| for all pairs;
 * ~1 = the tree explains nothing, << 1 = inherited), Moran's I, coefficient of
 * variation and excess kurtosis of the copies.
 */
export function segmentIncoherence(layout, values, ids) {
  const leaves = layout.leaves.map(String);
  const rowOf = new Map(leaves.map((id, i) => [id, i]));
  const use = ids.filter((id) => rowOf.has(id) && Number.isFinite(values.get(id)));
  const n = use.length;
  if (n < 6) return null;
  const D = leafDistances(layout);
  const N = leaves.length;
  const x = use.map((id) => values.get(id));
  let nnSum = 0;
  for (let a = 0; a < n; a += 1) {
    // nearest neighbours on the tree; ties (equidistant sisters) are averaged
    let best = Infinity;
    for (let b = 0; b < n; b += 1) if (a !== b) best = Math.min(best, D[rowOf.get(use[a]) * N + rowOf.get(use[b])]);
    let s = 0;
    let k = 0;
    for (let b = 0; b < n; b += 1) {
      if (a !== b && D[rowOf.get(use[a]) * N + rowOf.get(use[b])] <= best + 1e-12) {
        s += Math.abs(x[a] - x[b]);
        k += 1;
      }
    }
    nnSum += k ? s / k : 0;
  }
  let allSum = 0;
  for (let a = 0; a < n; a += 1) for (let b = a + 1; b < n; b += 1) allSum += Math.abs(x[a] - x[b]);
  const nnMean = nnSum / n;
  const allMean = allSum / ((n * (n - 1)) / 2);
  const mean = x.reduce((s, v) => s + v, 0) / n;
  const sd = Math.sqrt(x.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(1, n - 1));
  const m4 = x.reduce((s, v) => s + (v - mean) ** 4, 0) / n;
  const kurt = sd > 0 ? m4 / sd ** 4 - 3 : NaN;
  const w = treeWeights(layout, use);
  const I = w ? moranI(use.map((id) => values.get(id)), w).I : NaN;
  return {
    n,
    mean,
    median: median(x),
    max: Math.max(...x),
    cv: mean > 0 ? sd / mean : NaN,
    kurtosis: kurt,
    nnRatio: allMean > 0 ? nnMean / allMean : NaN,
    moranI: I,
  };
}

/** ecDNA-like when copies vary widely (CV >= 0.5) and the tree explains little of it (nnRatio >= 0.7). */
export function ecdnaLike(s) {
  return Boolean(s && s.cv >= 0.5 && s.nnRatio >= 0.7);
}
