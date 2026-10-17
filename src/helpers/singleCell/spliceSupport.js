// Source of splice alterations per patient and gene (srctools gos_sc_splice_support.py -> _cohort/splice_support.json):
// DNA (splice-site SNV in the filtered events), RNA (aberrant splicing in rna/splicing.json) or DNA+RNA (RNA junction
// within the exporter's distance of the DNA site).

/** { support, dna, rna } for a patient and gene, or null (no splice alteration, or no file). */
export function spliceSupportOf(doc, patient, gene) {
  return doc?.patients?.[patient]?.[gene] || null;
}

export const SPLICE_SHORT = { DNA: "DNA", RNA: "RNA", "DNA+RNA": "DNA+RNA" };

const rnaText = (r) => `${r.text || "aberrant junction"}${r.n_cells != null ? ` (${r.n_cells} cells)` : ""}`;

/** One-line source description for tooltips. `doc` null: the file is missing, say so. */
export function spliceSourceText(doc, entry) {
  if (!doc) return "Splice source not available (_cohort/splice_support.json missing)";
  if (!entry) return "Splice-site SNV in DNA; no RNA splicing record for this gene";
  const dna = (entry.dna || []).map((d) => `${d.variant || "splice-site SNV"}${d.n_cells != null ? ` in ${d.n_cells} cells` : ""}`).join("; ");
  const rna = (entry.rna || []).map(rnaText).join("; ");
  if (entry.support === "DNA+RNA") return `DNA splice-site SNV (${dna}), confirmed in RNA: ${rna}`;
  if (entry.support === "DNA") return `DNA splice-site SNV (${dna}); no aberrant splicing seen at this site in RNA`;
  return `RNA only: ${rna}; no splice-site SNV in DNA`;
}
