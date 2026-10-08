// Combine several patients' rna/ matrices (cells x genes, compressed by
// gene, each with its own genes.tsv) into one matrix over the union of
// gene names, cells concatenated in patient order, so the per-patient
// statistics (DE, PCA) run unchanged across the cohort.

/**
 * @param entries [{ matrix: { indptr, indices, data }, genes: string[], nCells }]
 * @returns { matrix, genes, offsets, nCells } where offsets[k] is the first
 *   combined cell index of entry k.
 */
export function mergeRnaMatrices(entries) {
  const geneIndex = new Map();
  const genes = [];
  entries.forEach((e) =>
    e.genes.forEach((g) => {
      if (!geneIndex.has(g)) {
        geneIndex.set(g, genes.length);
        genes.push(g);
      }
    })
  );
  const offsets = [];
  let nCells = 0;
  entries.forEach((e) => {
    offsets.push(nCells);
    nCells += e.nCells;
  });
  // count entries per combined gene, then fill
  const counts = new Int32Array(genes.length + 1);
  entries.forEach((e) =>
    e.genes.forEach((g, j) => {
      counts[geneIndex.get(g) + 1] += e.matrix.indptr[j + 1] - e.matrix.indptr[j];
    })
  );
  const indptr = new Int32Array(genes.length + 1);
  for (let g = 0; g < genes.length; g += 1) indptr[g + 1] = indptr[g] + counts[g + 1];
  const indices = new Int32Array(indptr[genes.length]);
  const data = new Float32Array(indptr[genes.length]);
  const fill = Int32Array.from(indptr);
  entries.forEach((e, k) =>
    e.genes.forEach((g, j) => {
      const G = geneIndex.get(g);
      for (let p = e.matrix.indptr[j]; p < e.matrix.indptr[j + 1]; p += 1) {
        indices[fill[G]] = e.matrix.indices[p] + offsets[k];
        data[fill[G]] = e.matrix.data[p];
        fill[G] += 1;
      }
    })
  );
  return { matrix: { indptr, indices, data }, genes, geneIndex, offsets, nCells };
}

/** Variance of each gene's (log-normalised) values over the given cells; zeros included. */
export function geneVariances(matrix, nGenes, cellIdx) {
  const keep = new Uint8Array(matrix.indices.length ? Math.max(...cellIdx) + 1 : 0);
  cellIdx.forEach((i) => (keep[i] = 1));
  const n = cellIdx.length;
  const out = new Float64Array(nGenes);
  for (let g = 0; g < nGenes; g += 1) {
    let s = 0;
    let s2 = 0;
    for (let k = matrix.indptr[g]; k < matrix.indptr[g + 1]; k += 1) {
      const i = matrix.indices[k];
      if (i < keep.length && keep[i]) {
        const v = matrix.data[k];
        s += v;
        s2 += v * v;
      }
    }
    const mean = s / n;
    out[g] = n > 1 ? Math.max(0, (s2 - n * mean * mean) / (n - 1)) : 0;
  }
  return out;
}

/** Sub-matrix over a subset of cells (rows renumbered 0..k-1), same genes; typed arrays throughout. */
export function subsetCells(matrix, nGenes, cellIdx) {
  const size = matrix.indices.length ? Math.max(...cellIdx, 0) + 1 : 0;
  const map = new Int32Array(size).fill(-1);
  cellIdx.forEach((i, k) => (map[i] = k));
  const indptr = new Int32Array(nGenes + 1);
  // pass 1: count kept entries per gene
  for (let g = 0; g < nGenes; g += 1) {
    let n = 0;
    for (let k = matrix.indptr[g]; k < matrix.indptr[g + 1]; k += 1) {
      const i = matrix.indices[k];
      if (i < size && map[i] >= 0) n += 1;
    }
    indptr[g + 1] = indptr[g] + n;
  }
  const indices = new Int32Array(indptr[nGenes]);
  const data = new Float32Array(indptr[nGenes]);
  // pass 2: fill
  let out = 0;
  for (let g = 0; g < nGenes; g += 1) {
    for (let k = matrix.indptr[g]; k < matrix.indptr[g + 1]; k += 1) {
      const i = matrix.indices[k];
      const m = i < size ? map[i] : -1;
      if (m >= 0) {
        indices[out] = m;
        data[out] = matrix.data[k];
        out += 1;
      }
    }
  }
  return { indptr, indices, data };
}

/** Fisher's method: combined p from independent p-values (chi-square with 2k df). */
export function fisherCombined(ps, chiSquareUpper) {
  const valid = ps.filter((p) => Number.isFinite(p) && p > 0);
  if (!valid.length) return NaN;
  const x = -2 * valid.reduce((s, p) => s + Math.log(Math.min(1, p)), 0);
  return chiSquareUpper(x, 2 * valid.length);
}
