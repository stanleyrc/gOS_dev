// Per-cell GBM state and proliferation scores from the RNA matrix: the mean
// log-normalized expression of each program's genes (Neftel MES / AC / OPC /
// NPC via the 3CA glioma metaprograms, G1/S from 3CA, G2/M from Seurat's
// cc.genes.updated.2019), centred on the mean over cells so 0 = average cell.
import { geneValues } from "./staticRna";

export const STATE_PROGRAMS = [
  { name: "score_MES", term: "3CA_16_MES_GLIOMA" },
  { name: "score_AC", term: "3CA_25_ASTROCYTES" },
  { name: "score_OPC", term: "3CA_27_OLIGO_PROGENITOR" },
  { name: "score_NPC", term: "3CA_26_NPC_GLIOMA" },
  { name: "score_G1S", term: "3CA_2_CELL_CYCLE_G1_S" },
  {
    name: "score_G2M",
    // Seurat cc.genes.updated.2019$g2m.genes
    genes: ["HMGB2", "CDK1", "NUSAP1", "UBE2C", "BIRC5", "TPX2", "TOP2A", "NDC80", "CKS2", "NUF2", "CKS1B", "MKI67",
      "TMPO", "CENPF", "TACC3", "PIMREG", "SMC4", "CCNB2", "CKAP2L", "CKAP2", "AURKB", "BUB1", "KIF11", "ANP32E",
      "TUBB4B", "GTSE1", "KIF20B", "HJURP", "CDCA3", "JPT1", "CDC20", "TTK", "CDC25C", "KIF2C", "RANGAP1", "NCAPD2",
      "DLGAP5", "CDCA2", "CDCA8", "ECT2", "KIF23", "HMMR", "AURKA", "PSRC1", "ANLN", "LBR", "CKAP5", "CENPE", "CTCF",
      "NEK2", "G2E3", "GAS2L3", "CBX5", "CENPA"],
  },
];

/** Mean expression of a gene list per cell (Float64Array over summary.cells), or null. */
export function programScore(summary, matrix, genes) {
  const idx = [...new Set(genes.map((g) => summary.geneIndex.get(g) ?? summary.geneIndex.get(`${g}`.toUpperCase())))].filter(
    (g) => g != null
  );
  if (idx.length < 3) return null;
  const n = summary.cells.length;
  const score = new Float64Array(n);
  idx.forEach((g) => {
    const v = geneValues(matrix, n, g);
    for (let i = 0; i < n; i += 1) score[i] += v[i];
  });
  let mean = 0;
  for (let i = 0; i < n; i += 1) {
    score[i] /= idx.length;
    mean += score[i];
  }
  mean /= n;
  for (let i = 0; i < n; i += 1) score[i] -= mean;
  return { score, nGenes: idx.length };
}

/**
 * All state / proliferation scores: { fieldName: { [displayId]: value } }, plus
 * score_cycling = max(G1/S, G2/M). gmtSets maps term -> genes.
 */
export function stateScores(summary, matrix, gmtSets) {
  const out = {};
  STATE_PROGRAMS.forEach((p) => {
    const genes = p.genes || gmtSets.get(p.term) || [];
    const r = programScore(summary, matrix, genes);
    if (!r) return;
    const values = {};
    summary.cells.forEach((c, i) => (values[c.displayId] = Number(r.score[i].toFixed(4))));
    out[p.name] = values;
  });
  if (out.score_G1S && out.score_G2M) {
    const values = {};
    Object.keys(out.score_G1S).forEach((id) => (values[id] = Math.max(out.score_G1S[id], out.score_G2M[id])));
    out.score_cycling = values;
  }
  return out;
}
