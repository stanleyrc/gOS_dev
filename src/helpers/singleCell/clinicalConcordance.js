// Clinical assay (Oncopanel / Genexus) concordance with the single-cell calls. d3-free.
// Inputs: _cohort/clinical_assays.json (srctools gos_sc_clinical.py) and _cohort/clinical_recovery.json
// (gos_sc_clinical_recovery.py). Everything shown is a real count from those files; missing -> "not available (reason)".

export const STATUS_ORDER = ["recovered", "partial", "not_recovered", "not_covered", "no_clinical"];
export const STATUS_LABEL = {
  recovered: "Recovered",
  partial: "Partial / weak",
  not_recovered: "Not recovered",
  not_covered: "Not covered / not assessable",
  no_clinical: "No clinical data",
};
export const KINDS = ["snv", "cnv", "sv", "tert"];
export const KIND_LABEL = { snv: "SNV / indel", cnv: "Copy number", sv: "Structural", tert: "TERT promoter" };

/** Grid category of a recovery status (negative findings map onto recovered / not recovered). */
export function gridStatus(status) {
  if (status === "recovered" || status === "concordant_negative") return "recovered";
  if (status === "partial") return "partial";
  if (status === "not_recovered" || status === "discordant_negative") return "not_recovered";
  return "not_covered";
}

const TYPE_SHORT = (t = "") => {
  const s = `${t}`.toLowerCase();
  if (s.includes("amplification")) return "amp";
  if (s.includes("two copy") || s.includes("homozygous")) return "homdel";
  if (s.includes("gain")) return "gain";
  if (s.includes("loss") || s.includes("deletion")) return "loss";
  return s;
};

/** Row label of a clinical alteration. */
export function alterationLabel(kind, r = {}) {
  if (kind === "snv") return `${r.gene} ${r.protein || r.cdna || ""}`.trim();
  if (kind === "tert") return `TERT ${r.site}`;
  if (kind === "sv") {
    const f = (x) => `${(x && x.feature) || "?"}`.split(" ")[0];
    return `${f(r.left)}::${f(r.right)} ${r.kind === "Fusion" ? "fusion" : "SV"}`;
  }
  const genes = r.genes || [];
  if (genes.length > 0 && genes.length <= 3) return `${genes.join("/")} ${TYPE_SHORT(r.type)}`;
  const loc = `${r.location || ""}`.replace(/\s*(Chromosomal level|Arm level|Focal event)/, "").trim();
  return `${loc || genes[0] || "?"} ${TYPE_SHORT(r.type)}`;
}

function entriesOf(rec, kinds) {
  const out = [];
  if (kinds.includes("snv")) (rec.snv || []).forEach((r) => out.push(["snv", r]));
  if (kinds.includes("cnv")) (rec.cnv || []).forEach((r) => out.push(["cnv", r]));
  if (kinds.includes("sv")) (rec.sv || []).forEach((r) => out.push(["sv", r]));
  if (kinds.includes("tert")) (rec.tert_promoter || []).forEach((r) => out.push(["tert", r]));
  return out;
}

const rank = (s) => STATUS_ORDER.indexOf(s);

/**
 * Alteration x patient grid.
 * @param recovery clinical_recovery.json
 * @param opts { patients (order), kinds, hideInvestigational (drop tier 3-4 SNVs), hideGermlineLike }
 * @returns { patients: [{ id, assay, clinicalOk, note }], rows: [{ key, kind, label, gene, cells: { P: { status, raw, row } } }] }
 */
export function buildGrid(recovery, { patients, kinds = KINDS, hideInvestigational = false, hideGermlineLike = false } = {}) {
  const pts = patients || Object.keys(recovery?.patients || {});
  const cols = pts.map((id) => {
    const rec = recovery?.patients?.[id];
    if (!rec) return { id, clinicalOk: false, assay: null, note: "no clinical data" };
    const st = rec.clinical_status;
    const assay = (rec.assays || []).map((a) => a.assay).join(" + ") || null;
    const notes = { failed: "assay failed", "nothing detected": "assay: nothing detected", none: "no clinical data" };
    return { id, clinicalOk: st === "ok", assay, note: notes[st] || null, status: st };
  });
  const byKey = new Map();
  pts.forEach((id) => {
    entriesOf(recovery?.patients?.[id] || {}, kinds).forEach(([kind, r]) => {
      if (kind === "snv" && hideInvestigational && r.tier != null && r.tier >= 3) return;
      if (kind === "snv" && hideGermlineLike && r.germline_like) return;
      const label = alterationLabel(kind, r);
      const key = `${kind}|${label}`;
      if (!byKey.has(key)) byKey.set(key, { key, kind, label, gene: (r.genes && r.genes[0]) || r.gene || (kind === "tert" ? "TERT" : null), cells: {} });
      const row = byKey.get(key);
      const status = gridStatus(r.status);
      const prev = row.cells[id];
      // duplicates of one label in a patient (e.g. chr7 gain listed twice): keep the better-supported entry
      if (!prev || (r.frac_cells ?? -1) > (prev.row.frac_cells ?? -1) || rank(status) < rank(prev.status)) row.cells[id] = { status, raw: r.status, row: r };
    });
  });
  const order = (k) => KINDS.indexOf(k);
  const rows = [...byKey.values()].sort((a, b) => order(a.kind) - order(b.kind) || Object.keys(b.cells).length - Object.keys(a.cells).length || a.label.localeCompare(b.label));
  return { patients: cols, rows };
}

/** Counts per kind and status (raw recovery statuses folded to grid categories) plus recovered share of assessable rows. */
export function summarize(recovery, kinds = KINDS) {
  const out = {};
  kinds.forEach((k) => {
    out[k] = { recovered: 0, partial: 0, not_recovered: 0, not_covered: 0, total: 0 };
  });
  Object.values(recovery?.patients || {}).forEach((rec) => {
    entriesOf(rec, kinds).forEach(([kind, r]) => {
      const g = gridStatus(r.status);
      out[kind][g] += 1;
      out[kind].total += 1;
    });
  });
  kinds.forEach((k) => {
    const o = out[k];
    const assessable = o.recovered + o.partial + o.not_recovered;
    o.assessable = assessable;
    o.recoveredShare = assessable ? o.recovered / assessable : null;
  });
  return out;
}

/** VAF-vs-VAF points: clinical VAF (x) against pooled single-cell VAF (y) for SNV / indel rows with both. */
export function vafPoints(recovery) {
  const pts = [];
  Object.entries(recovery?.patients || {}).forEach(([patient, rec]) => {
    (rec.snv || []).forEach((r) => {
      if (r.clinical_vaf == null || r.sc_vaf == null || r.status === "not_assessable" || r.status === "not_covered") return;
      pts.push({ patient, label: alterationLabel("snv", r), x: r.clinical_vaf, y: r.sc_vaf, status: gridStatus(r.status), tier: r.tier, germlineLike: !!r.germline_like, carriers: r.sc_carriers, covered: r.sc_covered, row: r });
    });
  });
  return pts;
}

/** CN-vs-CN points: clinical estimated copies (x) against single-cell CN (y: median, with max) for amplifications that state copies. */
export function cnPoints(recovery) {
  const pts = [];
  Object.entries(recovery?.patients || {}).forEach(([patient, rec]) => {
    (rec.cnv || []).forEach((r) => {
      const y = r.carrier_median_cn ?? r.median_cn;
      if (r.clinical_copies == null || y == null) return;
      pts.push({ patient, label: alterationLabel("cnv", r), x: r.clinical_copies, y, yAll: r.median_cn, yMean: r.mean_cn, yMax: r.max_cn, frac: r.frac_cells, status: gridStatus(r.status), row: r });
    });
  });
  return pts;
}

/** TMB rows: clinical (Oncopanel) vs single-cell truncal, truncal + subclonal, and per-cell median. */
export function tmbRows(recovery) {
  const rows = [];
  Object.entries(recovery?.patients || {}).forEach(([patient, rec]) => {
    const t = rec.tmb || {};
    if (t.clinical == null) return;
    const hasSc = t.sc_truncal != null;
    rows.push({
      patient,
      clinical: t.clinical,
      truncal: hasSc ? t.sc_truncal : null,
      clonal: hasSc ? t.sc_truncal + (t.sc_subclonal || 0) : null,
      cellMedian: hasSc ? t.sc_cell_median : null,
      note: hasSc ? null : t.note || "not available (no single-cell TMB)",
    });
  });
  return rows;
}

const OBSOLETE = "old_truncal_mutations";
/** Annotation strip (Fig. 1b style) for one patient from clinical_assays.json clinical_meta; every field is real or "not available". */
export function metaStrip(assays, patient, regions = null) {
  const m = assays?.clinical_meta?.patients?.[patient];
  const src = assays?.clinical_meta?.source || "clinical metadata";
  const na = (why) => ({ value: null, why });
  const fields = [
    { key: "sex", label: "Sex", ...(m?.sex ? { value: m.sex } : na(`not in ${src}`)) },
    { key: "age", label: "Age", ...(m?.age != null ? { value: `${m.age}` } : na(`not in ${src}`)) },
    { key: "location", label: "Location", ...(m?.location ? { value: m.location } : na(`not in ${src}`)) },
    { key: "mgmt", label: "MGMT", ...(m?.mgmt ? { value: m.mgmt } : na(m ? `N/A in source (${src})` : `not in ${src}`)) },
    {
      key: "truncal",
      label: "Truncal mutations (current tree)",
      tip: "mutations on the trunk, shared by all tumour cells (sites of the current tree's mutation map placed on the root branch)",
      ...(m?.truncal_mutations_mapped != null ? { value: m.truncal_mutations_mapped.toLocaleString("en-US"), sub: m.truncal_tree_sites != null ? `${m.truncal_tree_sites.toLocaleString("en-US")} tree sites` : null } : na(m?.truncal_mutations_mapped_note || "no mapping for current tree")),
    },
    { key: "recurrence", label: "Primary / recurrent", ...na("not in any data file") },
    {
      key: "regions",
      label: "Regions sampled",
      tip: "tumour regions with sequenced cells (cell metadata region field, _cohort/regions.json)",
      ...(regions?.patients?.[patient] ? { value: `${regions.patients[patient].n_regions}`, sub: regions.patients[patient].regions.join(", ") } : na(regions ? "no regions for this patient in _cohort/regions.json" : "_cohort/regions.json not exported")),
    },
  ];
  // the obsolete count must never be displayed
  return fields.filter((f) => f.key !== OBSOLETE);
}

/** Compact clinical strip for one patient: assays + recovery counts. */
export function patientClinical(assays, recovery, patient) {
  const rec = recovery?.patients?.[patient];
  const rep = assays?.patients?.[patient];
  if (!rep && !rec) return { available: false, why: "no clinical report for this patient" };
  const list = (rep?.assays || []).map((a) => ({ assay: a.assay, status: a.status, tmb: a.tmb_per_mb ?? null }));
  const counts = { recovered: 0, partial: 0, not_recovered: 0, not_covered: 0, total: 0 };
  entriesOf(rec || {}, KINDS).forEach(([, r]) => {
    counts[gridStatus(r.status)] += 1;
    counts.total += 1;
  });
  const assessable = counts.recovered + counts.partial + counts.not_recovered;
  return {
    available: true,
    assays: list,
    clinicalStatus: rec?.clinical_status || null,
    counts,
    assessable,
    missed: (rec?.missed || []).length,
  };
}

/** The patient's filtered event to open for a grid cell (driverHref), or null. */
export function eventForCell(events, row, kind) {
  if (!Array.isArray(events) || !row) return null;
  const genes = kind === "snv" ? [row.gene] : kind === "cnv" ? row.genes || [] : kind === "tert" ? ["TERT"] : [];
  const wantCls = kind === "cnv" ? ["AMP", "HOMDEL"] : null;
  const match = events.filter((e) => genes.includes(e.gene) && (kind !== "cnv" || e.type === "SCNA") && (!wantCls || wantCls.includes(e.vartype)));
  if (kind === "snv" && row.protein) {
    const exact = match.find((e) => e.Variant === row.protein);
    if (exact) return exact;
  }
  if (kind === "cnv") {
    const wantAmp = TYPE_SHORT(row.type) === "amp";
    const hit = match.find((e) => (e.vartype === "AMP") === wantAmp);
    if (hit) return hit;
  }
  if (kind === "sv") {
    const want = [row.left, row.right].map((x) => `${(x && x.feature) || ""}`.split(" ")[0]).filter(Boolean);
    return events.find((e) => e.type === "Fusion" && want.every((g) => `${e.fusion_genes || ""}`.split("::").includes(g))) || null;
  }
  return match[0] || null;
}
