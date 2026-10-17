// Clinical-assay findings (Oncopanel / Genexus) as Drivers-layer events. d3-free so jest can test it.
//
// The srctools exporter (gos_sc_clinical_events.py) writes data/<P>/clinical_events.json: one row per clinical alteration, in the
// filtered.events field schema, with `source: "clinical assay"`, a `clinical` block (verbatim report line, status, evidence) and
// `matches_event` (driverKey of the filtered event that already holds the alteration, else null).
// mergeClinicalEvents puts them next to the patient's filtered events without duplicating an alteration:
//   - a row with `matches_event` is attached to that event (event.clinical), not added again;
//   - any other row is added as its own event.
export const CLINICAL_SOURCE = "clinical assay";
export const CLINICAL_STATUS_LABEL = {
  recovered: "found in single cells",
  partial: "weak support in single cells",
  not_recovered: "not found in single cells",
  not_covered: "not covered in single cells",
  not_assessable: "not assessable in single cells",
};

export const isClinicalRow = (e) => Boolean(e) && e.source === CLINICAL_SOURCE;
/** True for a filtered event or clinical row that carries clinical-assay information. */
export const hasClinical = (e) => Boolean(e?.clinical);
export const isGermlineLike = (e) => Boolean(e?.germline_like ?? e?.clinical?.germline_like);
/** Clinical status of an event: recovered | partial | not_recovered | not_covered | not_assessable (filtered events matched to a row are recovered). */
export const clinicalStatus = (e) => e?.clinical?.status || null;
/** The row has carrier cells in the single-cell data. */
export const hasCarriers = (e) => Number(e?.n_cells) > 0;

/**
 * Filtered events plus the clinical findings, without duplicates.
 * @param events patient filtered events
 * @param clinical clinical_events.json (null / missing: events unchanged)
 */
export function mergeClinicalEvents(events, clinical) {
  const list = events || [];
  const rows = Array.isArray(clinical?.events) ? clinical.events.filter(isClinicalRow) : [];
  if (!rows.length) return list;
  const byKey = new Map();
  rows.forEach((r) => r.matches_event && byKey.set(r.matches_event, r));
  const used = new Set();
  const key = (e) => clinicalMatchKey(e);
  const merged = list.map((e) => {
    const row = byKey.get(key(e));
    if (!row || used.has(row.clinical_key)) return e;
    used.add(row.clinical_key);
    return { ...e, clinical: { ...row.clinical, key: row.clinical_key, linked: true, status: row.clinical.status || "recovered" }, germline_like: Boolean(row.germline_like) };
  });
  rows.forEach((r) => {
    if (r.matches_event && list.some((e) => key(e) === r.matches_event)) return; // attached above
    merged.push({ ...r, clinical: { ...r.clinical, key: r.clinical_key, linked: false } });
  });
  return merged;
}

/** Same string as driverContrast.driverKey (kept here so this file stays import-free). */
export function clinicalMatchKey(e) {
  const fg = `${e.fusion_genes || ""}`;
  const kind = e.vartype || e.type || "";
  const label = fg.includes("::") ? fg : `${e.gene || "?"}${kind ? ` ${kind}` : ""}`;
  return `${label}|${e.Genome_Location || `${e.seqnames}:${e.start}-${e.end}`}`;
}

const pct = (x) => (Number.isFinite(Number(x)) ? `${Math.round(100 * Number(x))}%` : "n/a");
const vafText = (x) => (Number.isFinite(Number(x)) ? Number(x).toFixed(2) : "n/a");

/** One-line summary of what the single cells show for a clinical finding (tooltips, drawer). */
export function clinicalSummary(e) {
  const c = e?.clinical;
  if (!c) return "";
  const kind = c.kind || "";
  const n = Number(e.n_cells) || 0;
  const covered = Number(e.covered_tumour_cells) || Number(c.sc_covered) || null;
  const of = covered ? `${n}/${covered}` : `${n}`;
  if (c.status === "not_assessable") return `not assessable in the single cells (${c.reason || "reason not available"})`;
  if (kind === "SNV") {
    const vaf = c.sc_vaf ?? e.VAF;
    if (c.status === "not_recovered") {
      const low = Number.isFinite(Number(c.clinical_vaf)) && Number(c.clinical_vaf) <= 0.1;
      return `clinical: present at VAF ${vafText(c.clinical_vaf)}; not found in single cells${low ? " (possible clonal haematopoiesis)" : ""}${c.reason ? `: ${c.reason}` : ""}`;
    }
    if (c.status === "not_covered") return `clinical: VAF ${vafText(c.clinical_vaf)}; not covered in single cells (${c.reason || "no coverage"})`;
    const normal = isGermlineLike(e) ? `; also in normal cells (${c.normal_alt} alt of ${c.normal_dp} reads): germline` : "";
    return `in ${of} cells, VAF ${vafText(vaf)}${c.status === "partial" ? " (weak)" : ""}${normal}`;
  }
  if (c.status === "not_recovered") return `clinical finding not found in single cells${c.reason ? `: ${c.reason}` : ""}`;
  if (c.status === "not_covered") return `not covered in single cells${c.reason ? ` (${c.reason})` : ""}`;
  return `${c.status === "partial" ? "partial: " : ""}in ${of} tumour cells${covered ? ` (${pct(n / covered)})` : ""}${c.reason ? `; ${c.reason}` : ""}`;
}

/** Tooltip lines: [verbatim report line, single-cell status]. */
export function clinicalTooltipLines(e) {
  const c = e?.clinical;
  if (!c) return [];
  const tier = c.tier != null ? `, tier ${c.tier}` : "";
  return [`Clinical ${c.assay || "assay"}${tier}: ${c.raw || "report line not available"}`, `Single cells: ${clinicalSummary(e)}`];
}

/** Badge text of a clinical entry: "clinical", or "clinical · germline-like". */
export const clinicalBadge = (e) => (isGermlineLike(e) ? "clinical · germline-like" : "clinical");

/**
 * Whether an event counts as a somatic driver in tallies, oncoprints and tumour-suppressor hits. Germline-like clinical SNVs and
 * clinical findings that were not recovered (no carrier cells) do not; everything else does.
 */
export function countsAsSomatic(e) {
  if (!hasClinical(e)) return true;
  if (isGermlineLike(e)) return false;
  return e.clinical.linked || hasCarriers(e);
}

/** Per-patient numbers for the check table: findings, rows shown, germline-like, not recovered. */
export function clinicalCounts(clinical) {
  const rows = Array.isArray(clinical?.events) ? clinical.events : [];
  return {
    findings: rows.length,
    germlineLike: rows.filter((r) => r.germline_like).length,
    notRecovered: rows.filter((r) => ["not_recovered", "not_covered", "not_assessable"].includes(r.clinical?.status)).length,
  };
}

/* ---- ClinVar / gnomAD annotation and highlight (exporter: gos_sc_clinical_annot.py, local files only) ---- */

const sci = (x) => (Number.isFinite(Number(x)) ? (Number(x) >= 0.001 ? Number(x).toPrecision(2) : Number(x).toExponential(1)) : "n/a");

/** ClinVar line of a clinical SNV / indel: { text, link }, or null when the row was not annotated. */
export function clinvarLine(e) {
  const c = e?.clinical?.clinvar;
  if (!c) return null;
  if (!c.found) return { text: `ClinVar: ${c.text || `not in ClinVar (release ${c.release || "n/a"})`}`, link: null };
  const stars = Number(c.stars) || 0;
  return {
    text: `ClinVar: ${c.significance || "n/a"} (${"★".repeat(stars) || "no stars"}${c.review_status ? `, ${c.review_status}` : ""}); ${c.condition || "condition not available"}; release ${c.release}${c.matched_by ? `; matched by ${c.matched_by}` : ""}`,
    link: c.link || null,
  };
}

/** gnomAD line: { text, link }, or null when the row was not annotated. */
export function gnomadLine(e) {
  const g = e?.clinical?.gnomad;
  if (!g) return null;
  if (!g.found) return { text: `gnomAD: ${g.text || "not available"}`, link: null };
  return {
    text: `gnomAD r2.1 genomes: AF ${sci(g.af)}, popmax ${sci(g.af_popmax)}${g.popmax ? ` (${g.popmax})` : ""}, AC ${g.ac ?? "n/a"} of ${g.an ?? "n/a"}, homozygotes ${g.nhomalt ?? "n/a"}`,
    link: g.link || null,
  };
}

/** Short highlight tags of a clinical row: "ClinVar P/LP", "LoF" / "LoF, germline" (empty when nothing stands out). */
export const clinicalHighlights = (e) => (Array.isArray(e?.clinical?.highlight) ? e.clinical.highlight : []);
export const isHighlighted = (e) => clinicalHighlights(e).length > 0;
/** Recessive note, only present when ClinVar's condition supports it. */
export const recessiveNote = (e) => e?.clinical?.recessive_note || null;
