// DNA / RNA / both support of a fusion, for the Filtered Events table and the
// RNA > Fusions table (d3-free). DNA: a fusion event of filtered.events.json
// (n_cells carriers; upstream_only = only the upstream flank of a partner is
// joined, no intact gene). RNA: a call of rna/fusions.json (n_cells, reads).
import { dnaFusionGenes, geneList } from "./rnaFusions";

const pairKey = (a, b) => [a, b].sort().join("::");
const truthy = (v) => v === true || `${v}` === "true";
const finite = (v) => (Number.isFinite(Number(v)) && v !== "" && v != null ? Number(v) : null);

/** Gene-pair keys an RNA fusion can match a DNA event on: every gene1 x gene2 pair plus dna_match.event_gene. */
export function fusionPairKeys(f) {
  const keys = new Set();
  const g1 = geneList(f?.gene1);
  const g2 = geneList(f?.gene2);
  g1.forEach((a) => g2.forEach((b) => keys.add(pairKey(a, b))));
  const ev = dnaFusionGenes({ gene: f?.dna_match?.event_gene });
  if (ev) keys.add(pairKey(ev[0], ev[1]));
  return [...keys];
}

/** Map pairKey -> RNA fusions (best first: cells, then reads), to look up an event's RNA calls in O(1). */
export function indexRnaFusions(fusions = []) {
  const index = new Map();
  (fusions || []).forEach((f) => fusionPairKeys(f).forEach((k) => index.set(k, [...(index.get(k) || []), f])));
  index.forEach((list) => list.sort((a, b) => (b.n_cells || 0) - (a.n_cells || 0) || (b.reads || 0) - (a.reads || 0)));
  return index;
}

/** Map pairKey -> the DNA fusion event with the most carrier cells. */
export function indexDnaEvents(events = []) {
  const index = new Map();
  (events || []).forEach((e) => {
    const g = dnaFusionGenes(e);
    if (!g) return;
    const k = pairKey(g[0], g[1]);
    const prev = index.get(k);
    if (!prev || (finite(e.n_cells) || 0) > (finite(prev.n_cells) || 0)) index.set(k, e);
  });
  return index;
}

/**
 * Support summary. `dna`: the DNA event (or null), `rna`: the best RNA fusion
 * (or null), `rnaKnown`: false when the RNA file is not loaded (RNA absent is
 * then unknown, not zero).
 * kind: "both" | "dna" | "dna-upstream" (DNA only, upstream-only) | "rna" | "none".
 */
export function fusionSupport({ dna = null, rna = null, rnaKnown = true } = {}) {
  const upstreamOnly = Boolean(dna && truthy(dna.upstream_only));
  const dnaCells = dna ? finite(dna.n_cells) : null;
  // an RNA fusion naming a DNA match with no event record still counts as DNA support
  const hasDna = Boolean(dna || rna?.dna_match);
  const rnaCells = rna ? rna.n_cells ?? null : rnaKnown ? 0 : null;
  const rnaReads = rna ? rna.reads ?? null : rnaKnown ? 0 : null;
  let kind = "none";
  if (hasDna && rna) kind = "both";
  else if (hasDna) kind = upstreamOnly ? "dna-upstream" : "dna";
  else if (rna) kind = "rna";
  return { kind, upstreamOnly, dnaCells, rnaCells, rnaReads, hasDna, hasRna: Boolean(rna), rnaKnown };
}

const ORDER = { both: 4, rna: 3, dna: 2, "dna-upstream": 1, none: 0 };
/** Numeric sort key: kind first (both > RNA-only > DNA-only > upstream-only DNA), then total supporting cells. */
export function supportSortValue(s) {
  return ORDER[s.kind] * 1e7 + (s.dnaCells || 0) + (s.rnaCells || 0);
}
export const compareSupport = (a, b) => supportSortValue(a) - supportSortValue(b);

const n = (v) => (v == null ? "?" : v.toLocaleString("en-US"));
/** Compact text, e.g. "both · DNA 129 · RNA 334 (73,639 reads)"; used for export and tooltips. */
export function supportText(s) {
  const dna = `DNA${s.upstreamOnly ? " (upstream-only)" : ""}${s.dnaCells != null ? ` ${n(s.dnaCells)} cells` : ""}`;
  const rna = s.hasRna ? `RNA ${n(s.rnaCells)} cells${s.rnaReads ? `, ${n(s.rnaReads)} reads` : ""}` : s.rnaKnown ? "no RNA" : "";
  if (s.kind === "both") return `both · ${dna} · ${rna}`;
  if (s.kind === "dna" || s.kind === "dna-upstream") return [s.kind === "dna-upstream" ? "upstream-only DNA" : "DNA", s.dnaCells != null ? `${n(s.dnaCells)} cells` : "", rna].filter(Boolean).join(" · ");
  if (s.kind === "rna") return `RNA · ${n(s.rnaCells)} cells${s.rnaReads ? `, ${n(s.rnaReads)} reads` : ""}`;
  return "";
}
