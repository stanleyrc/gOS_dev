// d3-free: gene spans from _cohort/gene_spans.json (skilift sc_export_gene_spans, schema "gos-gene-spans/1": GENCODE hg38 genes
// { gene, chrom, start, end, strand?, type?, coding }) and "genes inside a footprint" lists for the Notable SVs card / table
// and the complex-SV family drawer. The hook that fetches the file is components/singleCell/cohort/useGeneSpans.js.
import { GBM_GENES } from "./geneInfo";
import { parseFootprint } from "./complexZoom";

export const GENE_SPANS_FILE = "gene_spans.json";
export const GENE_SPANS_MISSING = "gene spans not exported";
const chrOf = (c) => `${c ?? ""}`.replace(/^chr/i, "");

/** Validated spans from the parsed json: [{ gene, chromosome (no "chr"), start, end, coding }] or null when missing / wrong schema. */
export function parseGeneSpans(doc) {
  if (!doc || doc.format !== "gos-gene-spans/1" || !Array.isArray(doc.genes)) return null;
  const out = [];
  doc.genes.forEach((g) => {
    const start = Number(g?.start);
    const end = Number(g?.end);
    if (!g?.gene || !Number.isFinite(start) || !Number.isFinite(end)) return;
    out.push({ gene: g.gene, chromosome: chrOf(g.chrom), start, end, coding: g.coding === true || g.type === "protein_coding" });
  });
  return out;
}

const intervalsOf = (fp) => (Array.isArray(fp) ? fp.map((f) => ({ chromosome: chrOf(f.chromosome ?? f.chrom), start: Number(f.start), end: Number(f.end) })) : parseFootprint(fp));

/**
 * Genes overlapping any footprint interval. footprintIntervals: a location string ("7:1-10,1:5-9") or [{ chromosome, start, end }].
 * Order: driver genes (driverSet) first when driverFirst, then genomic order. Returns { genes: names (max), total, drivers }.
 */
export function genesInside(spans, footprintIntervals, { codingOnly = true, driverFirst = true, driverSet = GBM_GENES, max = 8 } = {}) {
  const fp = intervalsOf(footprintIntervals).filter((f) => f.chromosome && Number.isFinite(f.start) && Number.isFinite(f.end));
  if (!spans?.length || !fp.length) return { genes: [], total: 0, drivers: 0 };
  const seen = new Set();
  const hits = [];
  spans.forEach((g) => {
    if (codingOnly && !g.coding) return;
    if (seen.has(g.gene) || !fp.some((f) => g.chromosome === f.chromosome && g.start <= f.end && g.end >= f.start)) return;
    seen.add(g.gene);
    hits.push(g);
  });
  const isDriver = (g) => Boolean(driverSet?.[g.gene]);
  const chrRank = (c) => (/^\d+$/.test(c) ? Number(c) : 100 + c.charCodeAt(0));
  hits.sort((a, b) => (driverFirst ? Number(isDriver(b)) - Number(isDriver(a)) : 0) || chrRank(a.chromosome) - chrRank(b.chromosome) || a.start - b.start || a.gene.localeCompare(b.gene));
  return { genes: hits.slice(0, max).map((g) => g.gene), total: hits.length, drivers: hits.filter(isDriver).length };
}

/** "EGFR, SEC61G (+12 more)" or "none"; null input -> null. */
export function genesInsideText(res) {
  if (!res) return null;
  if (!res.genes.length) return "none";
  return `${res.genes.join(", ")}${res.total > res.genes.length ? ` (+${res.total - res.genes.length} more)` : ""}`;
}
