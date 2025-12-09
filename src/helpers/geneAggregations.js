/**
 * Parse driver gene entries from summary field
 * Input format: "Type: Gene\nType: Gene"
 * Example: "Trunc: ARHGAP35\nSplice: ATM\nMissense: KRAS"
 *
 * Pattern matches existing parseGenomicFindings() in HtmlRenderer.js
 *
 * @param {string} summary - Raw summary field from record
 * @returns {Array} Array of {gene, type} objects
 */
export const parseDriverGenes = (summary) => {
  if (!summary || typeof summary !== "string") {
    return [];
  }

  const genes = [];
  const lines = summary
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l);

  lines.forEach((line) => {
    const colonIdx = line.indexOf(":");
    if (colonIdx > 0) {
      const type = line
        .slice(0, colonIdx)
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_");
      const gene = line.slice(colonIdx + 1).trim().toUpperCase();
      if (gene) {
        genes.push({ gene, type });
      }
    }
  });

  return genes;
};

/**
 * Compute gene statistics from a set of records
 * Pre-compute frequencies and type breakdowns for caching
 *
 * @param {Array} records - Array of case records
 * @returns {Object} Stats object with geneFrequency, geneByType, topGenes
 */
export const computeGeneStats = (records) => {
  const geneFrequency = {};
  const geneByType = {};

  records.forEach((record) => {
    const genes = parseDriverGenes(record.summary);
    const seenGenes = new Set();

    genes.forEach(({ gene, type }) => {
      if (!seenGenes.has(gene)) {
        geneFrequency[gene] = (geneFrequency[gene] || 0) + 1;
        seenGenes.add(gene);
      }

      if (!geneByType[gene]) {
        geneByType[gene] = {};
      }
      geneByType[gene][type] = (geneByType[gene][type] || 0) + 1;
    });
  });

  const topGenes = Object.entries(geneFrequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 50)
    .map(([gene]) => gene);

  return {
    geneFrequency,
    geneByType,
    topGenes,
  };
};

/**
 * Get count of driver mutations for a record
 * Used for sizing scatter plot points
 *
 * @param {Object} record - Case record
 * @returns {number} Count of unique genes with mutations
 */
export const getDriverMutationCount = (record) => {
  const genes = parseDriverGenes(record.summary);
  const uniqueGenes = new Set(genes.map((g) => g.gene));
  return uniqueGenes.size;
};

/**
 * Check if record has mutation in specific gene
 *
 * @param {Object} record - Case record
 * @param {string} gene - Gene name (e.g., "KRAS")
 * @returns {boolean} True if gene is mutated
 */
export const hasGene = (record, gene) => {
  const genes = parseDriverGenes(record.summary);
  return genes.some((g) => g.gene === gene.toUpperCase());
};
