// Gene filters of the splicing views (patient events table, cohort splicing view): gene lists and the exon context of a call.
// d3-free so it can be tested without a DOM. exon fields come from srctools gos_sc_splice_exon_annot.py:
// n_exons (canonical transcript) and intron_overlap (the junction overlaps an annotated intron of the gene).

/** GBM splice genes of the exporter (skilift SC_SPLICE_GENES). */
export const GBM_SPLICE_GENES = [
  "EGFR", "PDGFRA", "MET", "PTPRZ1", "CD44", "PKM", "MKNK2", "BCL2L1", "MDM4", "TP53", "PTEN", "NF1", "CDK4", "MDM2", "SOX2", "OLIG2", "NCAM1", "BIN1", "FN1", "TNC", "VEGFA", "KLHDC4", "SRSF3", "PTBP1",
];

export const DEFAULT_GENE_FILTER = { multiExon: true, list: "all", custom: [] };

/** Gene symbols of a pasted list (whitespace, comma, semicolon separated), upper case, unique. */
export const parseGeneList = (text) => [...new Set(`${text ?? ""}`.split(/[\s,;]+/).map((g) => g.trim().toUpperCase()).filter(Boolean))];

/**
 * Exon context of a call: "unknown" (file without exon annotation), "single_exon" (canonical transcript with < 2 exons),
 * "no_gene" (no gene model), "no_intron" (multi-exon gene but the junction overlaps none of its annotated introns:
 * intergenic / antisense / exonic only) or "multi_exon".
 */
export function exonContext({ exonKnown = false, nExons = null, intronOverlap = null } = {}) {
  if (!exonKnown) return "unknown";
  if (nExons == null) return "no_gene";
  if (nExons < 2) return "single_exon";
  return intronOverlap === false ? "no_intron" : "multi_exon";
}

/** Likely artefact by gene context: single-exon gene, no gene model, or a junction outside the annotated introns. */
export const exonSuspect = (item) => ["single_exon", "no_gene", "no_intron"].includes(exonContext(item));

export const EXON_CONTEXT_LABEL = {
  single_exon: "single-exon gene",
  no_gene: "no gene model (intergenic)",
  no_intron: "junction outside the annotated introns",
};

/** Whether `item` ({ gene, cancerGene, gbmGene, + exon fields }) passes the filter { multiExon, list, custom }. Unannotated files are never hidden by the exon switch. */
export function passesGeneFilter(item, filter = DEFAULT_GENE_FILTER) {
  const f = { ...DEFAULT_GENE_FILTER, ...(filter || {}) };
  if (f.multiExon && exonSuspect(item)) return false;
  const g = `${item.gene || ""}`.toUpperCase();
  if (f.list === "gbm") return GBM_SPLICE_GENES.includes(g) || !!item.gbmGene;
  if (f.list === "cancer") return !!item.cancerGene || GBM_SPLICE_GENES.includes(g);
  if (f.list === "custom") return f.custom.length === 0 || f.custom.includes(g);
  return true;
}

export const geneFilterActive = (filter) => {
  const f = { ...DEFAULT_GENE_FILTER, ...(filter || {}) };
  return f.multiExon !== DEFAULT_GENE_FILTER.multiExon || f.list !== "all";
};

/** URL form: spx=0 (show single-exon / intergenic calls too; default is hidden), spg=gbm | cancer | GENE1,GENE2. */
export function geneFilterFromSearch(search) {
  const p = new URLSearchParams(`${search ?? ""}`);
  const f = { ...DEFAULT_GENE_FILTER };
  if (p.get("spx") === "0") f.multiExon = false;
  const spg = p.get("spg");
  if (spg === "gbm" || spg === "cancer") f.list = spg;
  else if (spg) {
    const custom = parseGeneList(spg);
    if (custom.length) Object.assign(f, { list: "custom", custom });
  }
  return f;
}

export function withGeneFilter(search, filter) {
  const p = new URLSearchParams(`${search ?? ""}`);
  const f = { ...DEFAULT_GENE_FILTER, ...(filter || {}) };
  if (f.multiExon) p.delete("spx");
  else p.set("spx", "0");
  if (f.list === "gbm" || f.list === "cancer") p.set("spg", f.list);
  else if (f.list === "custom" && f.custom.length) p.set("spg", f.custom.join(","));
  else p.delete("spg");
  const s = p.toString();
  return s ? `?${s}` : "";
}
