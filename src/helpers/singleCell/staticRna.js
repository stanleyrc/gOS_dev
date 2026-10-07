// Read a patient's pre-analysed RNA (the rna/ folder written by
// services/sc-analysis/r/export_seurat.R) straight from the static data
// folder, so the UMAP and expression views work without the analysis service.
//
// Layout (see gos_sc/store.py): cells.json { cells: [{ rna_id, cell_id, ... }] },
// genes.tsv (one gene per line), and a cells x genes matrix compressed by gene:
// matrix.indptr.i32 (n_genes + 1), matrix.indices.i32 (cell rows),
// matrix.data.f32 (values), all little-endian.

const NON_FIELDS = new Set(["rna_id", "cell_id", "umap_1", "umap_2", "umap_dna_1", "umap_dna_2"]);

/** Parse cells.json + genes.tsv into the shape the views use. */
export function parseRnaSummary(cellsJson, genesTsv) {
  const cells = (cellsJson?.cells || []).map((c) => ({
    ...c,
    rna_id: `${c.rna_id}`,
    cell_id: c.cell_id == null || c.cell_id === "" ? null : `${c.cell_id}`,
    displayId: c.cell_id == null || c.cell_id === "" ? `${c.rna_id}` : `${c.cell_id}`,
  }));
  const genes = `${genesTsv || ""}`
    .split(/\r?\n/)
    .map((g) => g.trim())
    .filter(Boolean);
  // Metadata fields for colouring: numeric when every non-null value is a number.
  const fields = [];
  const names = new Set();
  cells.forEach((c) => Object.keys(c).forEach((k) => names.add(k)));
  names.forEach((name) => {
    if (NON_FIELDS.has(name) || name === "displayId") return;
    const values = cells.map((c) => c[name]).filter((v) => v != null && v !== "");
    if (!values.length) return;
    const numeric = values.every((v) => typeof v === "number");
    const levels = numeric ? null : [...new Set(values.map((v) => `${v}`))];
    if (!numeric && levels.length > 40) return;
    fields.push({ name, numeric, levels });
  });
  const hasUmap = cells.some((c) => Number.isFinite(c.umap_1) && Number.isFinite(c.umap_2));
  // A second UMAP recomputed on just the RNA cells that also have DNA (optional).
  const hasDnaUmap = cells.some((c) => Number.isFinite(c.umap_dna_1) && Number.isFinite(c.umap_dna_2));
  const geneIndex = new Map();
  genes.forEach((g, k) => {
    if (!geneIndex.has(g)) geneIndex.set(g, k);
    const upper = g.toUpperCase();
    if (!geneIndex.has(upper)) geneIndex.set(upper, k);
  });
  return { cells, genes, geneIndex, fields, hasUmap, hasDnaUmap };
}

/** Case-insensitive prefix matches first, then substring matches. */
export function searchGeneNames(genes, query, limit = 20) {
  const q = `${query || ""}`.trim().toUpperCase();
  if (!q) return [];
  const prefix = [];
  const inner = [];
  for (const g of genes) {
    const u = g.toUpperCase();
    if (u.startsWith(q)) prefix.push(g);
    else if (u.includes(q)) inner.push(g);
    if (prefix.length >= limit) break;
  }
  return [...prefix, ...inner].slice(0, limit);
}

/** One gene's values for every RNA cell (dense, zeros filled in). */
export function geneValues(matrix, nCells, g) {
  const out = new Float32Array(nCells);
  const a = matrix.indptr[g];
  const b = matrix.indptr[g + 1];
  for (let k = a; k < b; k += 1) out[matrix.indices[k]] = matrix.data[k];
  return out;
}

export function readMatrixBuffers(indptr, indices, data) {
  const view = (buffer, Type) => {
    const dv = new DataView(buffer);
    const n = buffer.byteLength / 4;
    const out = new Type(n);
    const get = Type === Float32Array ? (k) => dv.getFloat32(4 * k, true) : (k) => dv.getInt32(4 * k, true);
    for (let k = 0; k < n; k += 1) out[k] = get(k);
    return out;
  };
  return {
    indptr: view(indptr, Int32Array),
    indices: view(indices, Int32Array),
    data: view(data, Float32Array),
  };
}

/**
 * Expression of `gene` keyed by display cell ID (the gOS cell, or the RNA
 * barcode for RNA-only cells), as the heatmap strip and UMAP expect.
 */
export function expressionByCell(summary, matrix, gene) {
  const g = summary.geneIndex.get(gene) ?? summary.geneIndex.get(`${gene}`.toUpperCase());
  if (g == null) return null;
  const dense = geneValues(matrix, summary.cells.length, g);
  const values = {};
  let max = 0;
  summary.cells.forEach((c, k) => {
    const v = Math.round(dense[k] * 1e4) / 1e4;
    values[c.displayId] = v;
    if (v > max) max = v;
  });
  return { gene: summary.genes[g], values, max };
}

/**
 * Most variable genes: dispersion (variance / mean) of log-normalized values
 * among genes with mean >= minMean, highest first.
 */
export function topVariableGenes(summary, matrix, n = 20, minMean = 0.1) {
  const nCells = summary.cells.length;
  const scored = [];
  for (let g = 0; g < summary.genes.length; g += 1) {
    let sum = 0;
    let sumSq = 0;
    for (let k = matrix.indptr[g]; k < matrix.indptr[g + 1]; k += 1) {
      const v = matrix.data[k];
      sum += v;
      sumSq += v * v;
    }
    const mean = sum / nCells;
    if (mean < minMean) continue;
    const variance = sumSq / nCells - mean * mean;
    scored.push([summary.genes[g], variance / mean]);
  }
  return scored.sort((a, b) => b[1] - a[1]).slice(0, n).map((x) => x[0]);
}
