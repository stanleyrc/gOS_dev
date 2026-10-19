// Transcript-level gene models (genes/hg38_models/chr<N>.json, written by skilift sc_export_gene_models) and the
// exon / CDS / UTR geometry the gene track draws. Coordinates are 1-based closed genomic positions; `offset` turns
// them into gOS genome "places" (place = chromoBins[chr].startPlace + pos - 1). d3-free so it can be unit tested.

export const MODELS_DIR = "genes/hg38_models";
export const GENE_MODES = ["collapsed", "squished", "expanded"];
export const DEFAULT_GENE_MODE = "collapsed";

/** URL value of `genemode` -> a valid mode (default collapsed). */
export function parseGeneMode(value) {
  const v = `${value || ""}`.toLowerCase();
  return GENE_MODES.includes(v) ? v : DEFAULT_GENE_MODE;
}

/** Path of a chromosome's models file ("chr7" or "7" -> genes/hg38_models/chr7.json). */
export function modelsPath(chromosome, dir = MODELS_DIR) {
  return `${dir}/chr${`${chromosome}`.replace(/^chr/i, "")}.json`;
}

const NON_CODING = new Set(["lncRNA", "miRNA", "misc_RNA", "snRNA", "snoRNA", "rRNA", "scaRNA", "scRNA", "sRNA", "ribozyme", "vault_RNA", "Mt_rRNA", "Mt_tRNA"]);

/** Display class of a GENCODE gene / transcript type: coding, noncoding (lncRNA and small RNAs) or pseudo / other. */
export function geneClass(type) {
  const t = `${type || ""}`;
  if (t === "protein_coding" || /^(IG|TR)_[A-Z]_gene$/.test(t) || t === "nonsense_mediated_decay" || t === "non_stop_decay") return "coding";
  if (NON_CODING.has(t) || t === "retained_intron" || t === "processed_transcript" || t === "TEC") return "noncoding";
  if (/pseudogene/.test(t)) return "pseudo";
  return "noncoding";
}

/**
 * Models file JSON -> genes with place coordinates. Transcripts keep the file order (canonical first, then by
 * coding length) and gain txStart / txEnd; exons are sorted by position.
 * @param json parsed chr<N>.json; @param startPlace chromoBins[chr].startPlace
 */
export function normalizeModels(json, startPlace) {
  const offset = (Number(startPlace) || 1) - 1;
  const chromosome = `${json?.chromosome ?? ""}`;
  return (json?.genes || []).map((g) => {
    const transcripts = (g.transcripts || []).map((t) => {
      const exons = (t.exons || []).map((e) => [Number(e[0]), Number(e[1])]).sort((a, b) => a[0] - b[0]);
      const txStart = exons.length ? exons[0][0] : g.start;
      const txEnd = exons.length ? exons[exons.length - 1][1] : g.end;
      return { id: t.id, name: t.name || t.id, type: t.type || g.type, canonical: !!t.canonical, basis: t.basis || null,
        cds: Array.isArray(t.cds) && t.cds.length === 2 ? [Number(t.cds[0]), Number(t.cds[1])] : null, exons, txStart, txEnd };
    });
    return { id: g.id, name: g.name || g.id, type: g.type, strand: g.strand, chromosome, start: Number(g.start), end: Number(g.end), offset, transcripts };
  });
}

/**
 * CDS and UTR pieces of a transcript's exons: [{ start, end, kind: "cds" | "utr", exon }] (exon = index into the
 * position-sorted exons). Non-coding transcripts are all "utr" (drawn thin, as in UCSC).
 */
export function transcriptSegments(tx) {
  const out = [];
  const cds = tx?.cds;
  (tx?.exons || []).forEach(([s, e], k) => {
    if (!cds || e < cds[0] || s > cds[1]) {
      out.push({ start: s, end: e, kind: "utr", exon: k });
      return;
    }
    if (s < cds[0]) out.push({ start: s, end: cds[0] - 1, kind: "utr", exon: k });
    out.push({ start: Math.max(s, cds[0]), end: Math.min(e, cds[1]), kind: "cds", exon: k });
    if (e > cds[1]) out.push({ start: cds[1] + 1, end: e, kind: "utr", exon: k });
  });
  return out;
}

/** Introns of a transcript: [{ start, end }] between consecutive exons. */
export function transcriptIntrons(tx) {
  const ex = tx?.exons || [];
  const out = [];
  for (let k = 1; k < ex.length; k += 1) if (ex[k][0] > ex[k - 1][1] + 1) out.push({ start: ex[k - 1][1] + 1, end: ex[k][0] - 1 });
  return out;
}

/**
 * Per exon (position order): number in transcription order (1 = 5' exon; minus-strand genes count from the right),
 * size, coding bases and the reading frame at the exon's first coding base in transcription order
 * (0, 1, 2 = coding bases before it mod 3; null for non-coding exons).
 */
export function exonInfo(tx, strand) {
  const ex = tx?.exons || [];
  const n = ex.length;
  const minus = strand === "-";
  const cds = tx?.cds;
  const coding = ex.map(([s, e]) => (cds ? Math.max(0, Math.min(e, cds[1]) - Math.max(s, cds[0]) + 1) : 0));
  const order = ex.map((_, k) => k);
  if (minus) order.reverse();
  const info = new Array(n);
  let before = 0;
  order.forEach((k, rank) => {
    info[k] = { number: rank + 1, of: n, start: ex[k][0], end: ex[k][1], size: ex[k][1] - ex[k][0] + 1, coding: coding[k],
      frame: coding[k] > 0 ? before % 3 : null };
    before += coding[k];
  });
  return info;
}

/** Union of sorted [s, e] intervals (touching intervals merge). */
export function unionIntervals(intervals) {
  const xs = [...(intervals || [])].filter((d) => d && d[1] >= d[0]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const out = [];
  xs.forEach(([s, e]) => {
    const last = out[out.length - 1];
    if (last && s <= last[1] + 1) last[1] = Math.max(last[1], e);
    else out.push([s, e]);
  });
  return out;
}

/**
 * Collapsed (UCSC "dense" / IGV collapsed) model of a gene: the union of all its transcripts' exons, thick where
 * any transcript codes. Returns { segments: [{ start, end, kind }], span: [start, end] }.
 */
export function collapseGene(gene) {
  const txs = gene?.transcripts || [];
  const exons = unionIntervals(txs.flatMap((t) => t.exons));
  const cdsParts = unionIntervals(
    txs.flatMap((t) => transcriptSegments(t).filter((s) => s.kind === "cds").map((s) => [s.start, s.end]))
  );
  const segments = [];
  exons.forEach(([s, e]) => {
    let cur = s;
    cdsParts.filter(([cs, ce]) => ce >= s && cs <= e).forEach(([cs, ce]) => {
      const a = Math.max(cs, s);
      const b = Math.min(ce, e);
      if (a > cur) segments.push({ start: cur, end: a - 1, kind: "utr" });
      segments.push({ start: a, end: b, kind: "cds" });
      cur = b + 1;
    });
    if (cur <= e) segments.push({ start: cur, end: e, kind: "utr" });
  });
  const span = exons.length ? [exons[0][0], exons[exons.length - 1][1]] : [gene?.start, gene?.end];
  return { segments, span };
}

/** Transcripts of a gene ordered for display: canonical first, then coding, then by exon count and span. */
export function orderTranscripts(gene) {
  const cls = (t) => (geneClass(t.type) === "coding" && t.cds ? 0 : 1);
  return [...(gene?.transcripts || [])].sort(
    (a, b) => (b.canonical ? 1 : 0) - (a.canonical ? 1 : 0) || cls(a) - cls(b) || b.exons.length - a.exons.length || (b.txEnd - b.txStart) - (a.txEnd - a.txStart) || `${a.name}`.localeCompare(`${b.name}`)
  );
}

/** Genes of the arrow store (one collapsed model per coding gene) overlapping [lo, hi] places: [{ index, name, start, end, strand }]. */
export function arrowGenesInWindow(store, lo, hi) {
  const out = [];
  if (!store?.geneTypes) return out;
  const { geneTypes, geneTitles, genesStartPoint, genesEndPoint, genesStrand } = store;
  for (let i = 0; i < geneTypes.length; i += 1) {
    if (geneTypes[i] !== "gene") continue;
    if (genesEndPoint[i] < lo || genesStartPoint[i] > hi) continue;
    out.push({ index: i, name: geneTitles[i], start: genesStartPoint[i], end: genesEndPoint[i], strand: genesStrand?.[i] });
  }
  return out;
}

/** Chromosomes whose place range overlaps [lo, hi]: [{ chromosome, startPlace, endPlace }]. */
export function chromosomesInWindow(chromoBins, lo, hi) {
  return Object.entries(chromoBins || {})
    .filter(([, v]) => v && v.endPlace >= lo && v.startPlace <= hi)
    .map(([chromosome, v]) => ({ chromosome, startPlace: v.startPlace, endPlace: v.endPlace }));
}
