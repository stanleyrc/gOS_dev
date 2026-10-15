// Event-level splicing (rna/splicing.json `events`, skilift sc_splice_events): one row per
// spliced junction with a plain-language summary, explicit units and links to nearby SNVs.
// d3-free so it can be tested without a DOM.
import { passesGeneFilter } from "./spliceGeneFilter";

export const EVENT_TYPES = ["exon_skip", "alt_5", "alt_3", "novel_junction", "annotated_alt", "intron_retention"];
export const EVENT_TYPE_LABEL = {
  exon_skip: "Exon skip",
  alt_5: "Alt 5' (donor)",
  alt_3: "Alt 3' (acceptor)",
  novel_junction: "Novel junction",
  annotated_alt: "Annotated alternative",
  intron_retention: "Intron retention",
};
export const FRAME_LABEL = { in_frame: "in frame", frameshift: "frameshift", unknown: "n/a" };
export const REGION_LABEL = {
  canonical: "canonical splice site (±1–2 bp)",
  motif: "extended splice motif",
  near: "near the splice site",
  shifted_segment: "between the new and the annotated site",
};

const arr = (v) => (Array.isArray(v) ? v : []);
const num = (v, d = null) => (v != null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : d);
const pct = (p) => (Number.isFinite(p) ? (p > 0 && p < 0.005 ? "<1%" : `${Math.round(100 * p)}%`) : "–");

/** Formats a p / q value compactly. */
export const fmtP = (p) => (Number.isFinite(p) ? (p < 1e-3 ? p.toExponential(1) : p.toPrecision(2)) : "–");

function normalizeLink(l) {
  return {
    variantId: `${l.variant_id}`,
    variantIndex: num(l.variant_index),
    chromosome: `${l.chromosome ?? ""}`.replace(/^chr/, ""),
    position: num(l.position),
    ref: l.ref || "",
    alt: l.alt || "",
    category: l.category || null,
    gene: l.gene || null,
    consequence: l.consequence || null,
    protein: l.protein || null,
    site: l.site || null,
    offset: num(l.offset),
    distance: num(l.distance),
    region: l.region || "near",
    canonical: !!l.canonical,
    nCarriers: num(l.n_carriers, 0),
    nNoncarriers: num(l.n_noncarriers, 0),
    psiCarriers: num(l.psi_carriers),
    psiNoncarriers: num(l.psi_noncarriers),
    deltaPsi: num(l.delta_psi),
    oddsRatio: num(l.odds_ratio),
    pWilcoxon: num(l.p_wilcoxon),
    pFisher: num(l.p_fisher),
    p: num(l.p),
    q: num(l.q),
    carrierClone: l.carrier_clone || null,
    carrierCloneFrac: num(l.carrier_clone_frac),
    carriers: arr(l.carriers).map(String),
  };
}

/** Events of a splicing.json (validated; [] in older files). */
export function normalizeSpliceEvents(list) {
  return arr(list)
    // an intron retention event may have no sashimi cluster (its intron is below the exporter's junction filters): listed, not clickable
    .filter((e) => e && e.id && (e.cluster_id || e.event_type === "intron_retention"))
    .map((e) => ({
      id: `${e.id}`,
      clusterId: e.cluster_id ? `${e.cluster_id}` : null,
      gene: e.gene || "",
      chromosome: `${e.chromosome ?? ""}`.replace(/^chr/, ""),
      strand: e.strand || "+",
      start: num(e.start),
      end: num(e.end),
      type: e.type || "novel",
      eventType: EVENT_TYPES.includes(e.event_type) ? e.event_type : "novel_junction",
      annotated: !!e.annotated,
      summary: e.summary || "",
      reads: num(e.reads, 0),
      clusterReads: num(e.cluster_reads, 0),
      psi: num(e.psi),
      psiLo: num(e.psi_lo),
      psiHi: num(e.psi_hi),
      cellsUsing: num(e.cells_using, 0),
      cellsCovering: num(e.cells_covering, 0),
      clone: e.clone ? { clone: `${e.clone.clone}`, nCells: num(e.clone.n_cells, 0), psi: num(e.clone.psi), psiRest: num(e.clone.psi_rest), p: num(e.clone.p), q: num(e.clone.q) } : null,
      frame: e.frame || "unknown",
      site: e.site || {},
      cancerGene: !!e.cancer_gene,
      nPatients: num(e.n_patients, 1),
      otherPatients: arr(e.other_patients).map(String),
      maxPsiOther: num(e.max_psi_other),
      dpsiOther: num(e.dpsi_other),
      flags: arr(e.flags).map(String),
      recommended: !!e.recommended,
      reasons: arr(e.reasons).map(String),
      findingId: e.finding_id || null,
      findingScore: num(e.finding_score, 0),
      loci: arr(e.loci)
        .map((l) => ({ chromosome: `${l?.chromosome ?? ""}`.replace(/^chr/, ""), position: num(l?.position) }))
        .filter((l) => l.chromosome && l.position != null),
      cells: arr(e.cells).map(String),
      // cells whose RNA slice covers the event: most-supporting first ("using", k reads on the junction), then controls
      // ("control": cover the cluster, no read on the junction; n = reads in the cluster). Absent before 2026-10-15.
      readCells: arr(e.read_cells)
        .filter((r) => r && r.id)
        .map((r) => ({ id: `${r.id}`, role: r.role === "control" ? "control" : "using", k: num(r.k, 0), n: num(r.n, 0) })),
      snvLinks: arr(e.snv_links).map(normalizeLink),
      // exon context (srctools gos_sc_splice_exon_annot.py); exonKnown false in older files
      exonKnown: "n_exons" in e,
      nExons: num(e.n_exons),
      intronOverlap: e.intron_overlap == null ? null : !!e.intron_overlap,
    }));
}

/** "68 of 112 cells (61%)" — cells using the junction (>= 1 read) of the cells covering the locus. */
export const usageText = (e) => `${e.cellsUsing} of ${e.cellsCovering} cells (${pct(e.cellsCovering ? e.cellsUsing / e.cellsCovering : NaN)})`;

/** "64% (95% CI 58–70%)" — PSI of pooled reads of the covering cells. */
export const psiText = (e) =>
  Number.isFinite(e.psi) ? `${pct(e.psi)}${Number.isFinite(e.psiLo) && Number.isFinite(e.psiHi) ? ` (${Math.round(100 * e.psiLo)}–${Math.round(100 * e.psiHi)}%)` : ""}` : "–";

/** "clone 2: 71% vs 8% elsewhere (q 0.003)" or "–". */
export function cloneText(e) {
  const c = e.clone;
  if (!c || !Number.isFinite(c.p)) return "–";
  return `${/^clone/i.test(c.clone) ? c.clone : `clone ${c.clone}`}: ${pct(c.psi)} vs ${pct(c.psiRest)} elsewhere (q ${fmtP(c.q)})`;
}

/** Clone enrichment passes the display threshold (q < 0.1 and >= 10 points of PSI). */
export const cloneEnriched = (e) => !!e.clone && Number.isFinite(e.clone.q) && e.clone.q < 0.1 && Math.abs((e.clone.psi ?? 0) - (e.clone.psiRest ?? 0)) >= 0.1;

/** "this patient only" / "3 patients (this one + A, B)". */
export function recurrenceText(e) {
  if (e.nPatients <= 1) return "this patient only";
  return `${e.nPatients} patients (+ ${e.otherPatients.join(", ")})`;
}

/** The strongest link: lowest q, then canonical / motif positions, then distance. */
export function bestLink(e) {
  const rank = (l) => [Number.isFinite(l.q) ? l.q : 2, l.canonical ? 0 : l.region === "motif" ? 1 : 2, l.distance ?? 999];
  return [...(e.snvLinks || [])].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    for (let i = 0; i < ra.length; i += 1) if (ra[i] !== rb[i]) return ra[i] - rb[i];
    return 0;
  })[0] || null;
}

/** "chr17:7,673,830 G>A, 3 bp from the acceptor (canonical splice site); carriers 5, 22 PSI 71% vs 4% (p 0.003)". */
export function linkText(l) {
  if (!l) return "";
  const where = l.site ? `${l.distance} bp ${l.offset != null && l.offset <= 0 ? "inside the exon" : "into the intron"} at the ${l.site}` : `${l.distance} bp from a splice site`;
  const test = Number.isFinite(l.p) ? `carriers ${l.nCarriers} vs ${l.nNoncarriers} non-carriers: PSI ${pct(l.psiCarriers)} vs ${pct(l.psiNoncarriers)} (p ${fmtP(l.p)}${Number.isFinite(l.q) ? `, q ${fmtP(l.q)}` : ""})` : `carriers ${l.nCarriers}, non-carriers ${l.nNoncarriers}: too few cells with both DNA and RNA to test`;
  return `chr${l.chromosome}:${(l.position ?? 0).toLocaleString("en-US")} ${l.ref}>${l.alt}, ${where} (${REGION_LABEL[l.region] || l.region}); ${test}`;
}

/**
 * Rows of the table. mode "recommended" keeps recommended events; "all" keeps every event.
 * Optional filters: query (gene), eventType, linkedOnly (has a linked SNV), novelOnly.
 */
export function filterSpliceEvents(events, { mode = "recommended", query = "", eventType = "all", linkedOnly = false, novelOnly = false, geneFilter = null } = {}) {
  const q = `${query}`.trim().toLowerCase();
  return events.filter(
    (e) =>
      (mode === "all" || e.recommended) &&
      (!q || e.gene.toLowerCase().includes(q) || e.summary.toLowerCase().includes(q)) &&
      (eventType === "all" || e.eventType === eventType) &&
      (!linkedOnly || e.snvLinks.length > 0) &&
      (!novelOnly || !e.annotated) &&
      (!geneFilter || passesGeneFilter(e, geneFilter))
  );
}

/** Default order: findings by score, then clone-enriched, then novel in cancer genes, then reads. */
export function sortSpliceEvents(events) {
  const key = (e) => [-(e.findingScore || 0), cloneEnriched(e) ? 0 : 1, e.cancerGene && !e.annotated ? 0 : 1, -e.reads];
  return [...events].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    for (let i = 0; i < ka.length; i += 1) if (ka[i] !== kb[i]) return ka[i] - kb[i];
    return a.id.localeCompare(b.id);
  });
}

/** Counts shown above the table. */
export const eventCounts = (events) => ({
  all: events.length,
  recommended: events.filter((e) => e.recommended).length,
  linked: events.filter((e) => e.snvLinks.length > 0).length,
});

/**
 * IGV view at a linked SNV: the carriers' RNA slices (rna/splice_reads) and, through the
 * RNA -> DNA cell map, the DNA reads of the same cells; null without either.
 */
export function snvLinkIgvView(event, link, { cellMap = {}, spliceReads = {}, patientId = null, limit = 6 } = {}) {
  if (!event || !link || link.position == null) return null;
  const carriers = link.carriers || [];
  const rnaTracks = carriers
    .filter((id) => spliceReads?.[id])
    .slice(0, limit)
    .map((id) => ({ rna_id: id, bam: spliceReads[id], patientId, label: id }));
  const cellIds = carriers.map((id) => cellMap?.[id]).filter(Boolean).slice(0, 4);
  if (!rnaTracks.length && !cellIds.length) return null;
  return {
    cellIds,
    rnaTracks,
    chromosome: link.chromosome,
    position: link.position,
    loci: [{ chromosome: link.chromosome, position: link.position }],
    window: 120,
    label: `${event.gene} ${link.ref}>${link.alt}`,
  };
}

/** DNA cell ids of a link's carriers (for selecting them on the tree). */
export const linkCarrierDnaCells = (link, cellMap = {}) => (link?.carriers || []).map((id) => cellMap?.[id]).filter(Boolean);


export const READS_DEFAULT_USING = 4;
export const READS_DEFAULT_CONTROLS = 2;
export const READS_MAX_USING = 8;
export const READS_MAX_CONTROLS = 3;

/**
 * IGV view of an event's raw reads: the cells using the junction (most reads first) and, for comparison,
 * control cells that cover the cluster but never use it (they show the canonical junction / no event).
 * { available: true, view, shown: [{ id, role, k, n }], nUsing, nControl, totalUsing, totalControl } or
 * { available: false, reason: "no-slice" | "no-locus" } - older files lack `readCells`, and a cell without a slice
 * in `spliceReads` (rna_id -> bam path) is dropped.
 */
export function spliceReadsView(event, { spliceReads = {}, patientId = null, nUsing = READS_DEFAULT_USING, nControl = READS_DEFAULT_CONTROLS, window = 150 } = {}) {
  if (!event || !event.loci?.length) return { available: false, reason: "no-locus" };
  const have = (event.readCells || []).filter((r) => spliceReads?.[r.id]);
  const using = have.filter((r) => r.role === "using").sort((a, b) => b.k - a.k);
  const controls = have.filter((r) => r.role === "control").sort((a, b) => b.n - a.n);
  if (!using.length && !controls.length) return { available: false, reason: "no-slice" };
  const shown = [...using.slice(0, nUsing), ...controls.slice(0, nControl)];
  const rnaTracks = shown.map((r) => ({
    rna_id: r.id,
    bam: spliceReads[r.id],
    patientId,
    label: `${r.role === "control" ? "comparator " : ""}${patientId && r.id.startsWith(`${patientId}_`) ? r.id.slice(patientId.length + 1) : r.id}: ev ${r.k} / can ${Math.max(0, r.n - r.k)}`,
  }));
  return {
    available: true,
    shown,
    nUsing: Math.min(using.length, nUsing),
    nControl: Math.min(controls.length, nControl),
    totalUsing: using.length,
    totalControl: controls.length,
    view: { cellIds: [], rnaTracks, chromosome: event.loci[0].chromosome, position: event.loci[0].position, loci: event.loci, window, label: `${event.gene} ${EVENT_TYPE_LABEL[event.eventType] || event.eventType}` },
  };
}
