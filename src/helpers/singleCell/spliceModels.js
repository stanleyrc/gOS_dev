// Gene models for the splicing views: splice_exons.json (only the genes with a cluster, transcripts matched to the
// cluster junctions) plus the app's genes/hg38_models/<chr>.json (every gene, exons + CDS, canonical flag). d3-free, tested.
import { unionIntervals } from "../genes/geneModels";

const base = (id) => `${id || ""}`.replace(/\.\d+$/, "");
const key = (exons) => (exons || []).map(([s, e]) => `${s}-${e}`).join(",");

/** An hg38 models gene (normalizeModels output) as a splice_exons gene: { chrom, strand, transcripts: [{ id, canonical, exons, cds }], source }. */
export function hg38GeneToSplice(g) {
  return {
    chrom: `${g.chromosome}`.replace(/^chr/, ""),
    strand: g.strand,
    source: "hg38_models",
    transcripts: (g.transcripts || []).map((t) => ({ id: t.id, canonical: Boolean(t.canonical), exons: t.exons, cds: t.cds || null })),
  };
}

/** Do the two models describe the same canonical transcript (same id, or the same exons)? */
function agree(a, b) {
  const ca = (a.transcripts || []).find((t) => t.canonical);
  const cb = (b.transcripts || []).find((t) => t.canonical);
  if (!ca || !cb) return false;
  return base(ca.id) === base(cb.id) || key(ca.exons) === key(cb.exons);
}

/**
 * Splice model for the genes asked for. Prefer the hg38 model where it agrees with splice_exons.json (it adds the CDS
 * and every isoform); use it where splice_exons.json has no gene; keep splice_exons.json where the two disagree or the
 * hg38 chromosome file is not loaded.
 * @returns { format, genes } with the same shape as splice_exons.json
 */
export function mergeSpliceModels(spliceExons, hg38Genes, geneNames = null) {
  const out = { ...(spliceExons || {}), genes: { ...(spliceExons?.genes || {}) } };
  const want = geneNames ? new Set(geneNames) : null;
  (hg38Genes || []).forEach((g) => {
    if (!g?.name || (want && !want.has(g.name))) return;
    const h = hg38GeneToSplice(g);
    const cur = out.genes[g.name];
    if (!cur) out.genes[g.name] = h;
    else if (`${cur.chrom}` === h.chrom && cur.source !== "hg38_models" && agree(cur, h)) out.genes[g.name] = h;
  });
  return out;
}

/** How many of the clusters' genes have a model: { total, withModel, fromHg38 }. */
export function modelCounts(model, clusters) {
  const genes = [...new Set((clusters || []).map((c) => c.gene).filter(Boolean))];
  const has = (g) => (model?.genes?.[g]?.transcripts || []).some((t) => t.exons?.length);
  return { total: genes.length, withModel: genes.filter(has).length, fromHg38: genes.filter((g) => model?.genes?.[g]?.source === "hg38_models").length };
}

/** Coding bases of the canonical transcript between two positions (CDS only); null without a CDS. */
export function cdsBases(tx, from, to) {
  if (!tx?.cds) return null;
  return unionIntervals((tx.exons || []).map(([s, e]) => [Math.max(s, tx.cds[0], from), Math.min(e, tx.cds[1], to)])).reduce((a, [s, e]) => a + (e - s + 1), 0);
}
