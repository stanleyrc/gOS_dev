// RNA across DNA breakpoints (skilift breakpoint-RNA exporter): rna/breakpoint_transcripts.json (SVs whose breakpoint is crossed
// by RNA reads, carrier vs non-carrier cells) and the sidecar rna/fusions_dna_support.json (RNA-only fusions that match a DNA SV).
// Tiers are those of findingConfidence.js (consistent / suggestive / low), computed by the exporter and passed through here.
// d3-free.
import { filterByConfidence, confidenceCounts, tierOf } from "./findingConfidence";

export const TRANSCRIPTS_FORMAT = "breakpoint_transcripts_v1";
export const DNA_SUPPORT_FORMAT = "fusions_dna_support_v1";
export const NOT_EXPORTED = "not available (file not exported)";
export const NONE_FOUND = "none found";

const num = (v) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const list = (v) => (Array.isArray(v) ? v : []);
const strip = (c) => `${c ?? ""}`.replace(/^chr/i, "");

/** Normalised breakpoint_transcripts.json: { patient, rule, nSv, transcripts }. Throws on a different format. */
export function normalizeBreakpointTranscripts(json) {
  if (!json || !Array.isArray(json.transcripts)) throw new Error("breakpoint_transcripts.json: no transcripts array");
  if (json.format && json.format !== TRANSCRIPTS_FORMAT) throw new Error(`breakpoint_transcripts.json: unknown format ${json.format}`);
  const transcripts = json.transcripts.map((t, k) => ({
    ...t,
    jid: `${t.jid ?? ""}`,
    key: `${t.jid ?? ""}|${k}`,
    stratum: t.stratum || null,
    cls: t.cls || null,
    label: t.label || [list(t.genes_a).join("/"), list(t.genes_b).join("/")].filter(Boolean).join("::") || `${t.jid}`,
    genes_a: list(t.genes_a),
    genes_b: list(t.genes_b),
    n_car_rna: num(t.n_car_rna),
    n_non_rna: num(t.n_non_rna),
    cross_car: num(t.cross_car) ?? 0,
    cross_non: num(t.cross_non) ?? 0,
    cross_other: num(t.cross_other) ?? 0,
    car_rate: num(t.car_rate),
    non_rate: num(t.non_rate),
    fold: num(t.fold),
    fisher_p: num(t.fisher_p),
    reads_car: num(t.reads_car),
    reads_non: num(t.reads_non),
    rna_junctions: list(t.rna_junctions),
    confidence: tierOf(t.confidence),
    confidence_reasons: list(t.confidence_reasons),
  }));
  return { patient: json.patient || null, rule: json.rule || null, source: json.source || null, nSv: num(json.n_sv) ?? transcripts.length, transcripts };
}

/** Normalised fusions_dna_support.json: { patient, rule, entries, byFusionId }. Throws on a different format. */
export function normalizeDnaSupport(json) {
  if (!json || !Array.isArray(json.entries)) throw new Error("fusions_dna_support.json: no entries array");
  if (json.format && json.format !== DNA_SUPPORT_FORMAT) throw new Error(`fusions_dna_support.json: unknown format ${json.format}`);
  const entries = json.entries.map((e) => ({
    ...e,
    fusion_id: e.fusion_id == null || e.fusion_id === "" ? null : `${e.fusion_id}`,
    sv_jid: e.sv_jid == null ? null : `${e.sv_jid}`,
    distance_bp: num(e.distance_bp),
    carrier_cells: num(e.carrier_cells),
    noncarrier_cells: num(e.noncarrier_cells),
    other_cells: num(e.other_cells),
    confidence: tierOf(e.confidence),
    confidence_reasons: list(e.confidence_reasons),
  }));
  const byFusionId = new Map();
  entries.forEach((e) => {
    if (e.fusion_id && !byFusionId.has(e.fusion_id)) byFusionId.set(e.fusion_id, e);
  });
  return { patient: json.patient || null, rule: json.rule || null, entries, byFusionId };
}

/** Transcripts shown at a confidence level (untiered rows always shown). */
export const visibleTranscripts = (transcripts, level) => filterByConfidence(transcripts, level);

/** Tier counts of a transcript or support list. */
export const tierCounts = (items) => confidenceCounts(items);

/** Transcripts of one SV by junction id (several strata rows are possible, all returned). */
export function transcriptsByJid(transcripts, jid) {
  const j = `${jid ?? ""}`;
  return j ? list(transcripts).filter((t) => t.jid === j) : [];
}

/** "6:32491325-|8:102096422+" -> { a: [chr, pos], b: [chr, pos] } or null (event junction ids of filtered.events.json). */
export function parseJunctionCoords(id) {
  const m = `${id ?? ""}`.match(/^(?:chr)?([^:|\s]+):(\d+)[+-]?\|(?:chr)?([^:|\s]+):(\d+)[+-]?$/i);
  return m ? { a: [m[1], Number(m[2])], b: [m[3], Number(m[4])] } : null;
}

export const COORD_TOLERANCE_BP = 10;

/** Whether a transcript's breakpoints equal a parsed junction's (either orientation, each end within `tol` bp). */
export function sameBreakpoints(t, c, tol = COORD_TOLERANCE_BP) {
  if (!c || t?.posA == null || t?.posB == null) return false;
  const near = (chr, pos, [c2, p2]) => strip(chr) === strip(c2) && Math.abs(pos - p2) <= tol;
  return (near(t.chrA, t.posA, c.a) && near(t.chrB, t.posB, c.b)) || (near(t.chrA, t.posA, c.b) && near(t.chrB, t.posB, c.a));
}

/**
 * Transcripts for an event's junction ids (event.junction_ids), duplicates removed. An id matches by SV id (jid) or, because the
 * event ids are "chrA:posA+|chrB:posB-" strings, by both breakpoint coordinates within COORD_TOLERANCE_BP.
 */
export function transcriptsForJunctionIds(transcripts, ids) {
  const want = new Set(list(ids).map((i) => `${i}`));
  const coords = list(ids).map(parseJunctionCoords).filter(Boolean);
  return list(transcripts).filter((t) => want.has(t.jid) || coords.some((c) => sameBreakpoints(t, c)));
}

/** The DNA-support entry of a fusion (by fusions.json id), or null. */
export function dnaSupportOfFusion(support, fusionOrId) {
  const id = typeof fusionOrId === "object" ? fusionOrId?.id : fusionOrId;
  return (id != null && support?.byFusionId?.get(`${id}`)) || null;
}

/** "chr7:47602297-47602497" | "7:47602297-47602497" -> "chr7:47602297-47602497" (null if unreadable). */
export function igvLocus(locus) {
  const m = `${locus ?? ""}`.match(/^(?:chr)?([^:\s]+):(\d+)(?:-(\d+))?$/i);
  return m ? `chr${m[1]}:${m[2]}-${m[3] || m[2]}` : null;
}

/** Locus around a breakpoint when the exporter gave none. */
export function breakpointLocus(chr, pos, pad = 100) {
  const p = num(pos);
  return p == null || chr == null ? null : `chr${strip(chr)}:${Math.max(1, p - pad)}-${p + pad}`;
}

/** { a, b } IGV loci of a transcript (exporter fields first, else derived from chr/pos). */
export function transcriptLoci(t) {
  return { a: igvLocus(t?.igv_locus_a) || breakpointLocus(t?.chrA, t?.posA), b: igvLocus(t?.igv_locus_b) || breakpointLocus(t?.chrB, t?.posB) };
}

/** igv.js web-app URL for a locus (genome build as in the cohort, hg19 by default). */
export const igvUrl = (locus, genome = "hg19") => (igvLocus(locus) ? `https://igv.org/app/?genome=${genome}&locus=${igvLocus(locus)}` : null);

/** "x/y" text of cells with RNA across the breakpoint out of cells with RNA. */
export const crossText = (cross, total) => (total == null ? `${cross}/n.a.` : `${cross}/${total}`);

/** One-line plain-text summary of a transcript's carrier / non-carrier contrast. */
export function contrastText(t) {
  const fold = t.fold != null ? `${t.fold.toFixed(1)}x` : t.non_rate === 0 ? "non-carrier rate 0" : "n.a.";
  const p = t.fisher_p != null ? `, Fisher p ${t.fisher_p < 0.001 ? t.fisher_p.toExponential(1) : t.fisher_p.toFixed(3)}` : "";
  return `carriers ${crossText(t.cross_car, t.n_car_rna)}, non-carriers ${crossText(t.cross_non, t.n_non_rna)} (${fold}${p})`;
}

/** Reads text; null reads give the reason. */
export const readsText = (t) => (t.reads_car == null && t.reads_non == null ? "reads not available" : `${t.reads_car ?? "n.a."} / ${t.reads_non ?? "n.a."}`);

/** Headline counts for a level: { n, total, hidden, counts, nGenes }. */
export function headlineCounts(transcripts, level) {
  const all = list(transcripts);
  const shown = visibleTranscripts(all, level);
  return { n: shown.length, total: all.length, hidden: all.length - shown.length, counts: tierCounts(all) };
}

/** Load state to text: "not available (file not exported)" | "none found" | null when there are rows. */
export function emptyMessage(source, nShown, nTotal) {
  if (!source || source.status !== "ok") return source?.status === "error" ? `not available (${source.error?.message || source.error})` : NOT_EXPORTED;
  if (!nTotal) return NONE_FOUND;
  if (!nShown) return `none at this confidence level (${nTotal} hidden: use "Show less confident findings")`;
  return null;
}

// ---- fusion isoforms (rna/fusion_isoforms.json) ----
export const ISOFORMS_FORMAT = "fusion_isoforms_v1";

const truthy = (v) => v === true || v === 1 || /^(true|t|yes|1)$/i.test(`${v ?? ""}`);

/** Normalised fusion_isoforms.json: { patient, pairs, byFusionId }. Throws on a different format. */
export function normalizeFusionIsoforms(json) {
  if (!json || !Array.isArray(json.pairs)) throw new Error("fusion_isoforms.json: no pairs array");
  if (json.format && json.format !== ISOFORMS_FORMAT) throw new Error(`fusion_isoforms.json: unknown format ${json.format}`);
  const pairs = json.pairs.map((p) => ({
    ...p,
    fusion_ids: list(p.fusion_ids).map((i) => `${i}`),
    n_isoforms: num(p.n_isoforms) ?? list(p.isoforms).length,
    n_isoforms_2cells: num(p.n_isoforms_2cells),
    total_cells: num(p.total_cells),
    any_inframe: truthy(p.any_inframe),
    readthrough: truthy(p.readthrough),
    isoforms: list(p.isoforms)
      .map((i) => ({ ...i, n_cells: num(i.n_cells) ?? 0, n_cells_dnalinked: num(i.n_cells_dnalinked), total_reads: num(i.total_reads), reading_frame: i.reading_frame || null }))
      .sort((a, b) => b.n_cells - a.n_cells),
  }));
  const byFusionId = new Map();
  pairs.forEach((p) => p.fusion_ids.forEach((id) => !byFusionId.has(id) && byFusionId.set(id, p)));
  return { patient: json.patient || null, pairs, byFusionId };
}

/** The isoform pair of a fusion row (its id, or any grouped variant's id), or null. */
export function isoformsOfFusion(iso, fusion) {
  if (!iso?.byFusionId || !fusion) return null;
  const ids = [fusion.id, ...list(fusion.variants).map((v) => v?.id)].filter((i) => i != null);
  for (const id of ids) {
    const p = iso.byFusionId.get(`${id}`);
    if (p) return p;
  }
  return null;
}

/** Badge texts of a pair: [{ text, color, tip }]; "in-frame isoform", "N isoforms" (>= 2 supported in 2+ cells), "read-through (adjacent genes)". */
export function isoformBadges(pair) {
  if (!pair) return [];
  const out = [];
  if (pair.any_inframe) out.push({ key: "inframe", text: "in-frame isoform", color: "green", tip: "At least one isoform of this gene pair keeps the reading frame across the fusion junction." });
  const n = pair.n_isoforms_2cells ?? pair.n_isoforms;
  if (n >= 2) out.push({ key: "n", text: `${n} isoforms`, color: "geekblue", tip: `${n} distinct exon-to-exon junctions supported by at least 2 cells (${pair.n_isoforms} in total).` });
  if (pair.readthrough) out.push({ key: "rt", text: "read-through (adjacent genes)", color: "orange", tip: "The two genes are adjacent: transcription can read through from one into the next without a DNA rearrangement." });
  return out;
}

/** Text of the nearby genomic SVs of a breakpoint transcript (field nearby_genomic_sv, list of objects or strings). */
export function nearbySvText(t) {
  return list(t?.nearby_genomic_sv).map((s) => (typeof s === "string" ? s : [s.cls, s.label || (s.chrA != null ? `${s.chrA}:${s.posA}-${s.chrB}:${s.posB}` : s.jid), s.n_cells != null ? `${s.n_cells} cells` : null].filter(Boolean).join(" ")));
}
