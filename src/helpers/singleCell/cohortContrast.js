// Cohort contrasts of a cell selection (e.g. a lasso on the integrated UMAP)
// against the other cells, d3-free so jest can test it.
import { benjaminiHochberg, twoSidedP, wilcoxonFromNonzero, yieldToBrowser } from "./rnaStats";
import { fisherExact } from "./tests";

/**
 * Share of each level among selected vs all cells, with Fisher's exact test of
 * selected vs not selected.
 * @param cells [{ key, level }] every cell considered; selected: Set of keys
 * @returns [{ level, sel, nSel, all, nAll, fracSel, fracAll, ratio, p }] sorted by p
 */
export function selectionComposition(cells, selected) {
  const by = new Map();
  let nSel = 0;
  cells.forEach((c) => {
    if (c.level == null || c.level === "") return;
    const l = `${c.level}`;
    if (!by.has(l)) by.set(l, { level: l, sel: 0, all: 0 });
    const r = by.get(l);
    r.all += 1;
    if (selected.has(c.key)) {
      r.sel += 1;
      nSel += 1;
    }
  });
  const nAll = [...by.values()].reduce((a, r) => a + r.all, 0);
  return [...by.values()]
    .map((r) => {
      const fracSel = nSel ? r.sel / nSel : NaN;
      const fracAll = nAll ? r.all / nAll : NaN;
      // selected in level / selected elsewhere vs unselected in level / unselected elsewhere
      const { p } = fisherExact(r.sel, nSel - r.sel, r.all - r.sel, nAll - nSel - (r.all - r.sel));
      return { ...r, nSel, nAll, fracSel, fracAll, ratio: fracAll > 0 ? fracSel / fracAll : NaN, p };
    })
    .sort((a, b) => a.p - b.p);
}

/**
 * Differential expression of A vs B within strata that each have their own
 * matrix and gene list (one patient each), combined by gene name with a
 * weighted Stouffer z (weights sqrt(nA nB / (nA + nB))). Genes are tested
 * where >= minPct of the pooled cells of either group express them.
 * @param strata [{ key, matrix (gene-major CSC), genes, rowsA, rowsB }]; strata without
 *   >= minPerStratum cells in each group are skipped
 * @returns { rows: [{ gene, z, p_val, q_val, avg_log2FC, pct_1, pct_2, nStrata }], strata: [{ key, nA, nB }] }
 */
export async function crossStratumDE(strata, { minPct = 0.05, minPerStratum = 3, onProgress = null } = {}) {
  const used = strata.filter((s) => s.rowsA.length >= minPerStratum && s.rowsB.length >= minPerStratum);
  const acc = new Map(); // gene -> { zw, w2, sumA, sumB, detA, detB, n }
  let nA = 0;
  let nB = 0;
  for (let si = 0; si < used.length; si += 1) {
    const s = used[si];
    nA += s.rowsA.length;
    nB += s.rowsB.length;
    const group = new Int8Array(Math.max(0, ...s.rowsA, ...s.rowsB) + 1);
    s.rowsA.forEach((r) => (group[r] = 1));
    s.rowsB.forEach((r) => (group[r] = 2));
    const w = Math.sqrt((s.rowsA.length * s.rowsB.length) / (s.rowsA.length + s.rowsB.length));
    for (let g = 0; g < s.genes.length; g += 1) {
      const a = [];
      const b = [];
      let sumA = 0;
      let sumB = 0;
      for (let k = s.matrix.indptr[g]; k < s.matrix.indptr[g + 1]; k += 1) {
        const r = s.matrix.indices[k];
        if (r >= group.length) continue;
        const v = s.matrix.data[k];
        if (group[r] === 1) {
          a.push(v);
          sumA += Math.expm1(v);
        } else if (group[r] === 2) {
          b.push(v);
          sumB += Math.expm1(v);
        }
      }
      if (!a.length && !b.length) continue;
      const { z } = wilcoxonFromNonzero(a, b, s.rowsA.length, s.rowsB.length);
      const name = s.genes[g];
      if (!acc.has(name)) acc.set(name, { zw: 0, w2: 0, sumA: 0, sumB: 0, detA: 0, detB: 0, n: 0 });
      const e = acc.get(name);
      e.zw += w * z;
      e.w2 += w * w;
      e.sumA += sumA;
      e.sumB += sumB;
      e.detA += a.length;
      e.detB += b.length;
      e.n += 1;
      if (g % 2000 === 1999) {
        if (onProgress) onProgress((si + g / s.genes.length) / used.length);
        // eslint-disable-next-line no-await-in-loop
        await yieldToBrowser();
      }
    }
  }
  const rows = [];
  acc.forEach((e, gene) => {
    const pct1 = e.detA / (nA || 1);
    const pct2 = e.detB / (nB || 1);
    if (Math.max(pct1, pct2) < minPct) return;
    const z = e.w2 > 0 ? e.zw / Math.sqrt(e.w2) : 0;
    rows.push({ gene, z, p_val: twoSidedP(z), avg_log2FC: Math.log2((e.sumA + 1) / (nA || 1)) - Math.log2((e.sumB + 1) / (nB || 1)), pct_1: pct1, pct_2: pct2, nStrata: e.n });
  });
  const q = benjaminiHochberg(rows.map((r) => r.p_val));
  rows.forEach((r, i) => (r.q_val = q[i]));
  rows.sort((a, b) => a.p_val - b.p_val);
  if (onProgress) onProgress(1);
  return { rows, strata: used.map((s) => ({ key: s.key, nA: s.rowsA.length, nB: s.rowsB.length })) };
}
