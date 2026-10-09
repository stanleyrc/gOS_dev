// Headline RNA findings: the splicing findings ranked by the back end
// (rna/splicing.json and _cohort/rna/splicing.json `findings`: known
// variants with carriers, patient-specific junctions, clone-differential
// clusters; skilift sc_export_rna_splicing) and tier 1–2 fusions
// (rna/fusions.json). Used by the RNA tab's findings strip, the splicing
// cards, the patient overview / report cards and the cohort cards. d3-free.

export const SPLICE_FINDING_KINDS = ["known_variant", "patient_specific", "clone_differential"];
export const SEVERITIES = ["high", "moderate", "low", "artefact"];
export const SEVERITY_COLOR = { high: "red", moderate: "orange", low: "default", artefact: "default" };
export const KIND_COLOR = { known_variant: "volcano", patient_specific: "magenta", clone_differential: "purple", fusion: "geekblue" };

const num = (v, d = NaN) => (v == null || v === "" || !Number.isFinite(Number(v)) ? d : Number(v));
const arr = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);

/** Severity of a score when the file has none (same cut-offs as the back end). */
export function severityOf(score, artefact = false) {
  if (artefact) return "artefact";
  if (score >= 6) return "high";
  if (score >= 3) return "moderate";
  return "low";
}

/** Findings of a splicing.json, validated, strongest first: [{ id, kind, patient, gene, clusterId, variantId, clone, score, severity, flags, text, junction, numbers, cells, loci }]. */
export function normalizeSpliceFindings(list) {
  return arr(list)
    .filter((f) => f && typeof f.text === "string" && f.text && SPLICE_FINDING_KINDS.includes(f.kind))
    .map((f) => {
      const flags = arr(f.flags).map(String);
      const score = num(f.score, 0);
      const artefact = flags.some((x) => /paralog|repeat|artefact/i.test(x));
      return {
        id: `${f.id || `${f.kind}:${f.cluster_id || f.variant_id}:${f.patient}`}`,
        kind: f.kind,
        patient: f.patient == null ? null : `${f.patient}`,
        gene: f.gene || "",
        clusterId: f.cluster_id || null,
        variantId: f.variant_id || null,
        clone: f.clone == null ? null : `${f.clone}`,
        score,
        severity: SEVERITIES.includes(f.severity) ? f.severity : severityOf(score, artefact),
        flags,
        text: f.text,
        junction: f.junction || null,
        note: f.note || null,
        numbers: f.numbers || {},
        cells: arr(f.cells).map(String),
        loci: arr(f.loci)
          .map((l) => ({ chromosome: `${l?.chromosome ?? ""}`.replace(/^chr/, ""), position: num(l?.position) }))
          .filter((l) => l.chromosome && Number.isFinite(l.position)),
      };
    })
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

/** Findings worth a headline: high / moderate, not flagged as a likely artefact. */
export const isNotable = (f) => f && (f.severity === "high" || f.severity === "moderate");

/**
 * Tier 1–2 fusions grouped by gene pair (one line per pair; several
 * breakpoints of a pair are folded): [{ kind: "fusion", label, gene1,
 * gene2, tier, nCells, nBreakpoints, reasons, frame, fusion }], best tier
 * first, then most cells.
 */
export function fusionHeadlines(fusions, { maxTier = 2 } = {}) {
  const byPair = new Map();
  arr(fusions).forEach((f) => {
    const tier = num(f?.tier, 3);
    if (!(tier <= maxTier)) return;
    const label = f.label || `${f.gene1}::${f.gene2}`;
    const nCells = num(f.n_cells, 0);
    const cur = byPair.get(label);
    if (!cur) {
      byPair.set(label, { kind: "fusion", id: `fusion:${label}`, label, gene1: f.gene1, gene2: f.gene2, tier, nCells, nBreakpoints: 1, reasons: arr(f.tier_reasons), frame: f.reading_frame || null, fusion: f });
      return;
    }
    cur.nBreakpoints += 1;
    if (tier < cur.tier || (tier === cur.tier && nCells > cur.nCells)) Object.assign(cur, { tier, nCells, reasons: arr(f.tier_reasons), frame: f.reading_frame || null, fusion: f });
  });
  return [...byPair.values()].sort((a, b) => a.tier - b.tier || b.nCells - a.nCells || a.label.localeCompare(b.label));
}

/** Plain sentence of a fusion headline. */
export function fusionText(h, nCellsRna = null) {
  const share = Number.isFinite(nCellsRna) && nCellsRna > 0 ? ` (${Math.round((100 * h.nCells) / nCellsRna)}% of RNA cells)` : "";
  const bps = h.nBreakpoints > 1 ? `, ${h.nBreakpoints} breakpoints` : "";
  const why = h.reasons.filter((r) => !/^in \d+% of RNA cells$/.test(r)).slice(0, 2).join("; ");
  return `${h.label}: tier ${h.tier} fusion in ${h.nCells} cell${h.nCells === 1 ? "" : "s"}${share}${bps}${why ? ` — ${why}` : ""}`;
}

/** Counts for the sub-tab label: notable splicing findings + tier 1–2 fusion pairs. */
export function rnaFindingCounts({ splicing = [], fusions = [] } = {}) {
  const s = arr(splicing).filter(isNotable).length;
  const f = fusionHeadlines(fusions).length;
  return { splicing: s, fusions: f, total: s + f };
}

/**
 * Headline items of one patient for the overview / report / cohort cards:
 * the notable splicing findings (strongest first) then tier 1–2 fusions,
 * at most `max`. Items: { kind: "splice-finding" | "fusion", severity, text, ... }.
 */
export function rnaHeadlineItems({ splicing = [], fusions = [], nCellsRna = null, max = 4 } = {}) {
  const s = arr(splicing)
    .filter(isNotable)
    .map((f) => ({ kind: "splice-finding", id: f.id, findingKind: f.kind, gene: f.gene, severity: f.severity, score: f.score, text: f.text, finding: f }));
  const fu = fusionHeadlines(fusions).map((h) => ({ kind: "fusion", id: h.id, gene: h.label, severity: h.tier === 1 ? "high" : "moderate", tier: h.tier, text: fusionText(h, nCellsRna), fusion: h.fusion }));
  // strongest splicing finding, then the best fusion, then the rest by severity
  const rank = { high: 0, moderate: 1, low: 2, artefact: 3 };
  const out = [];
  if (s.length) out.push(s.shift());
  if (fu.length) out.push(fu.shift());
  [...s, ...fu].sort((a, b) => rank[a.severity] - rank[b.severity] || (b.score || 0) - (a.score || 0)).forEach((x) => out.push(x));
  return out.slice(0, max);
}

/**
 * IGV view of a finding's reads: the finding's cells that have an RNA slice
 * (rna/splice_reads), at most `limit`, at its junction ends. null without
 * slices.
 */
export function findingIgvView(finding, spliceReads = {}, patientId = null, limit = 6) {
  if (!finding || !finding.loci?.length) return null;
  const tracks = finding.cells
    .filter((id) => spliceReads?.[id])
    .slice(0, limit)
    .map((id) => ({ rna_id: id, bam: spliceReads[id], patientId: finding.patient || patientId, label: id }));
  if (!tracks.length) return null;
  return { cellIds: [], rnaTracks: tracks, chromosome: finding.loci[0].chromosome, position: finding.loci[0].position, loci: finding.loci, window: 150, label: `${finding.gene} ${finding.kind}` };
}

/** Cells of a finding with an IGV slice. */
export const findingSliceCount = (finding, spliceReads = {}) => (finding?.cells || []).filter((id) => spliceReads?.[id]).length;

/**
 * Notability of a cluster-table row (rankClustersByGroup): clusters with a
 * back-end finding carry its score; the others get a stand-in from the
 * group ΔPSI, the group test and unannotated junctions (paralog families
 * demoted). Returns { hasFinding, score }.
 */
export function clusterNotability(row) {
  const c = row?.cluster || {};
  const fs = num(c.finding_score);
  if (Number.isFinite(fs)) return { hasFinding: true, score: fs };
  const dpsi = Number.isFinite(row?.dpsi) ? row.dpsi : 0;
  const q = row?.q;
  const qf = Number.isFinite(q) ? Math.min(1, -Math.log10(Math.max(q, 1e-12)) / 2) : 0.3;
  const novel = (row?.types || []).some((x) => x && x !== "annotated") ? 1.5 : 1;
  return { hasFinding: false, score: 3 * dpsi * qf * novel * (c.artefact ? 0.2 : 1) };
}

/** Cluster table order: clusters with findings first (by score), then by the stand-in score. */
export function byNotability(a, b) {
  const na = clusterNotability(a);
  const nb = clusterNotability(b);
  if (na.hasFinding !== nb.hasFinding) return na.hasFinding ? -1 : 1;
  return nb.score - na.score || `${a.id}`.localeCompare(`${b.id}`);
}

/** Page (1-based) of the table holding row `id`, for jumping to a picked cluster. */
export function pageOf(rows, id, pageSize) {
  const i = (rows || []).findIndex((r) => r.id === id);
  return i < 0 ? 1 : Math.floor(i / pageSize) + 1;
}
