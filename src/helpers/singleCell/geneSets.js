// Built-in gene sets for program scoring (first 20 genes of each Neftel et
// al. 2019 GBM meta-module, plus small cell-cycle, hypoxia and interferon sets).
export const GENE_SETS = {
  "MES-like (Neftel)": ["CHI3L1", "ANXA2", "ANXA1", "CD44", "VIM", "MT2A", "C1S", "NAMPT", "EFEMP1", "C1R", "SOD2", "IFITM3", "TIMP1", "SPP1", "A2M", "S100A11", "MT1X", "S100A10", "FN1", "LGALS1"],
  "AC-like (Neftel)": ["CST3", "S100B", "SLC1A3", "HEPN1", "HOPX", "MT3", "SPARCL1", "MLC1", "GFAP", "FABP7", "BCAN", "PON2", "METTL7B", "SPARC", "GATM", "RAMP1", "PMP2", "AQP4", "DBI", "EDNRB"],
  "OPC-like (Neftel)": ["BCAN", "PLP1", "GPR17", "FIBIN", "LHFPL3", "OLIG1", "PSAT1", "SCRG1", "OMG", "APOD", "SIRT2", "TNR", "THY1", "PHYHIPL", "SOX2-OT", "NKAIN4", "LPPR1", "PTPRZ1", "VCAN", "DBI"],
  "NPC-like (Neftel)": ["DLL3", "DLL1", "SOX4", "TUBB3", "HES6", "TAGLN3", "NEU4", "MARCKSL1", "CD24", "STMN1", "TCF12", "BEX1", "OLIG1", "MAP2", "FXYD6", "PTPRS", "MLLT11", "NPPA", "BCAN", "MEST"],
  "G2/M": ["MKI67", "TOP2A", "CENPF", "CCNB1", "CDK1", "NUSAP1", "UBE2C", "BIRC5", "TPX2", "AURKB", "CDC20", "PTTG1", "HMGB2", "CCNB2", "KIF2C"],
  "S phase": ["PCNA", "MCM2", "MCM3", "MCM4", "MCM5", "MCM6", "MCM7", "RRM1", "RRM2", "TYMS", "FEN1", "GINS2", "HELLS", "UNG", "CDC6"],
  Hypoxia: ["VEGFA", "CA9", "ADM", "NDRG1", "SLC2A1", "PGK1", "LDHA", "BNIP3", "ANKRD37", "P4HA1", "ENO1", "HILPDA", "EGLN3", "PDK1", "ALDOA"],
  Interferon: ["ISG15", "IFI6", "IFIT1", "IFIT3", "IFI27", "MX1", "OAS1", "STAT1", "IRF7", "BST2", "IFITM1", "XAF1", "RSAD2", "IFI44L", "ISG20"],
};

/** Parse a free-text gene list (commas, whitespace or newlines). */
export const parseGeneList = (text) => [...new Set(`${text || ""}`.split(/[\s,;]+/).map((g) => g.trim()).filter(Boolean))];

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

/**
 * Program score per cell: the mean over the set's genes of each gene's
 * z-score across the given cells (genes with zero variance are skipped).
 * `valuesOf(gene)` returns a Float32Array over cells or null when absent.
 * Returns { scores: Float32Array, used: string[], missing: string[] }.
 */
export function geneSetScores(genes, nCells, valuesOf) {
  const scores = new Float32Array(nCells);
  const used = [];
  const missing = [];
  genes.forEach((g) => {
    const v = valuesOf(g);
    if (!v) {
      missing.push(g);
      return;
    }
    const m = mean([...v]);
    const sd = Math.sqrt(mean([...v].map((x) => (x - m) ** 2)));
    if (!(sd > 0)) return;
    for (let i = 0; i < nCells; i += 1) scores[i] += (v[i] - m) / sd;
    used.push(g);
  });
  if (used.length) for (let i = 0; i < nCells; i += 1) scores[i] /= used.length;
  return { scores, used, missing };
}

/**
 * Dot-plot statistics for one gene over groups of cell indices:
 * fraction of cells with expression > 0 and mean expression per group.
 */
export function dotStats(values, groups) {
  return groups.map((idx) => {
    let n = 0;
    let sum = 0;
    idx.forEach((i) => {
      if (values[i] > 0) n += 1;
      sum += values[i];
    });
    return { fraction: idx.length ? n / idx.length : NaN, mean: idx.length ? sum / idx.length : NaN, n: idx.length };
  });
}
