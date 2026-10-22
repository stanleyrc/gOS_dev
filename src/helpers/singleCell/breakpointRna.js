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

/** Transcripts for any of an event's junction ids (event.junction_ids), duplicates removed. */
export function transcriptsForJunctionIds(transcripts, ids) {
  const want = new Set(list(ids).map((i) => `${i}`));
  return list(transcripts).filter((t) => want.has(t.jid));
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
