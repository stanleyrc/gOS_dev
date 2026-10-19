// Data shaping for the redesigned Clinical Assays page and its "Figure 1 layout" view. d3-free.
// Inputs: _cohort/clinical_recovery.json, clinical_assays.json, tmb.json, rna/cells.json, aligned_trees.json.
// Everything is a real count from those files; missing -> null plus a reason ("not available (...)").
import { GBM_TSG } from "./twoHit";
import { alterationLabel, gridStatus, KINDS } from "./clinicalConcordance";

/** Recovery categories of the oncoprint (fill / outline) in drawing order. */
export const ONCO_STATUS = ["recovered", "partial", "not_recovered", "not_covered", "germline_like"];
export const ONCO_STATUS_LABEL = {
  recovered: "Recovered",
  partial: "Partial / weak",
  not_recovered: "Not recovered",
  not_covered: "Not assessable / not covered",
  germline_like: "Germline-like (also in normal cells)",
};
/** Alteration classes (glyph) of the clinical oncoprint. */
export const ONCO_CLASS = ["snv", "amp", "gain", "homdel", "loss", "sv", "tert"];
export const ONCO_CLASS_LABEL = { snv: "SNV / indel", amp: "Amplification", gain: "Gain", homdel: "Homozygous deletion", loss: "Loss", sv: "Structural / fusion", tert: "TERT promoter" };
export const ONCO_GROUPS = ["Tumour suppressors", "Other genes", "Chromosome / arm level"];

const tsgSet = new Set(GBM_TSG);

/** Class of one clinical alteration. */
export function alterationClass(kind, r = {}) {
  if (kind === "snv") return "snv";
  if (kind === "tert") return "tert";
  if (kind === "sv") return "sv";
  const t = `${r.type || ""}`.toLowerCase();
  if (t.includes("amplification")) return "amp";
  if (t.includes("two copy") || t.includes("homozygous")) return "homdel";
  if (t.includes("gain")) return "gain";
  return "loss";
}

/** Status of an alteration incl. the germline-like override (SNVs also present in normal cells). */
export function oncoStatus(kind, r = {}) {
  if (kind === "snv" && r.germline_like) return "germline_like";
  return gridStatus(r.status);
}

/** Row group: curated GBM tumour suppressors, other named genes, chromosome / arm level events (no gene). */
export function oncoGroup(gene, hasGene) {
  if (!hasGene) return "Chromosome / arm level";
  return tsgSet.has(gene) ? "Tumour suppressors" : "Other genes";
}

const all = (rec) => KINDS.flatMap((k) => (k === "tert" ? rec.tert_promoter || [] : rec[k] || []).map((r) => [k, r]));

/**
 * Concordance oncoprint: genes x patients grouped by tumour suppressor / other / chromosome-level, rows sorted by recurrence.
 * @returns { patients: [{id, clinicalOk, note, assay}], rows: [{ key, gene, group, nPatients, cells: { P: [{ cls, status, kind, row, label }] } }] }
 */
export function clinicalOncoprint(recovery, { patients, hideGermlineLike = false } = {}) {
  const ids = patients || Object.keys(recovery?.patients || {}).sort();
  const cols = ids.map((id) => {
    const rec = recovery?.patients?.[id];
    const st = rec?.clinical_status;
    const notes = { failed: "assay failed", "nothing detected": "nothing detected", none: "no clinical data" };
    return { id, clinicalOk: st === "ok", note: rec ? notes[st] || null : "no clinical data", assay: (rec?.assays || []).map((a) => a.assay).join(" + ") || null };
  });
  const byRow = new Map();
  ids.forEach((id) => {
    const rec = recovery?.patients?.[id];
    if (!rec) return;
    all(rec).forEach(([kind, r]) => {
      if (kind === "snv" && hideGermlineLike && r.germline_like) return;
      const genes = kind === "snv" ? [r.gene] : kind === "tert" ? ["TERT"] : kind === "sv" ? [] : r.genes || [];
      const label = alterationLabel(kind, r);
      let gene;
      let hasGene = true;
      if (kind === "sv") {
        gene = label.replace(/ (fusion|SV)$/, "");
      } else if (kind === "cnv" && (genes.length === 0 || genes.length > 3)) {
        gene = label.replace(/ (amp|gain|loss|homdel)$/, "");
        hasGene = false;
      } else gene = genes[0] || label;
      const group = kind === "sv" ? "Other genes" : oncoGroup(gene, hasGene);
      const key = `${group}|${gene}`;
      if (!byRow.has(key)) byRow.set(key, { key, gene, group, cells: {} });
      (byRow.get(key).cells[id] ||= []).push({ cls: alterationClass(kind, r), status: oncoStatus(kind, r), kind, row: r, label });
    });
  });
  const rows = [...byRow.values()].map((r) => ({ ...r, nPatients: Object.keys(r.cells).length }));
  rows.sort((a, b) => ONCO_GROUPS.indexOf(a.group) - ONCO_GROUPS.indexOf(b.group) || b.nPatients - a.nPatients || a.gene.localeCompare(b.gene));
  return { patients: cols, rows };
}

/** Rows with section headers: [{ header, n } | { row }]. */
export function withHeaders(rows) {
  const out = [];
  ONCO_GROUPS.forEach((g) => {
    const list = rows.filter((r) => r.group === g);
    if (!list.length) return;
    out.push({ header: g, n: list.length });
    list.forEach((row) => out.push({ row }));
  });
  return out;
}

/** Recovery status counts per patient (stacked bar) and per alteration class. */
export function recoveryCounts(recovery, patients) {
  const ids = patients || Object.keys(recovery?.patients || {}).sort();
  const zero = () => Object.fromEntries(ONCO_STATUS.map((s) => [s, 0]));
  const byPatient = ids.map((id) => {
    const c = zero();
    const rec = recovery?.patients?.[id];
    if (rec) all(rec).forEach(([k, r]) => { c[oncoStatus(k, r)] += 1; });
    return { id, counts: c, total: ONCO_STATUS.reduce((s, k) => s + c[k], 0), clinicalStatus: rec?.clinical_status || "none" };
  });
  const byClass = ONCO_CLASS.map((cls) => ({ cls, counts: zero(), total: 0 }));
  ids.forEach((id) => {
    const rec = recovery?.patients?.[id];
    if (!rec) return;
    all(rec).forEach(([k, r]) => {
      const row = byClass.find((x) => x.cls === alterationClass(k, r));
      row.counts[oncoStatus(k, r)] += 1;
      row.total += 1;
    });
  });
  return { byPatient, byClass: byClass.filter((x) => x.total > 0) };
}

/** Clinical header strip rows: one entry per patient with the metaStrip fields and assay summary. */
export function clinicalHeader(assays, recovery, patients, metaStrip, regions = null) {
  return patients.map((id) => {
    const rec = recovery?.patients?.[id];
    return { id, fields: metaStrip(assays, id, regions), assays: (rec?.assays || []).map((a) => ({ assay: a.assay, status: a.status })), status: rec?.clinical_status || "none", tumourCells: rec?.tumour_cells ?? null };
  });
}

/**
 * Fig. 1a: real design counts. RNA cells from the per-patient rna/cells.json files (rnaCells, each cell tagged with its patient),
 * regions from _cohort/regions.json (scripts/singleCell/export_regions.py); a missing source gets a reason.
 */
export function designCounts({ recovery, rnaCells, regions, patients }) {
  const ids = patients || Object.keys(recovery?.patients || {});
  let dnaTumour = 0;
  let dnaNormal = 0;
  ids.forEach((id) => {
    const r = recovery?.patients?.[id];
    dnaTumour += r?.tumour_cells || 0;
    dnaNormal += r?.normal_cells || 0;
  });
  const out = { nPatients: ids.length, dnaTumour, dnaNormal, dnaCells: dnaTumour + dnaNormal, rna: null, regions: null };
  if (Array.isArray(rnaCells) && rnaCells.length) {
    out.rna = { cells: rnaCells.length, malignant: rnaCells.filter((c) => c.Cell_Type === "Malignant").length, patients: new Set(rnaCells.map((c) => c.patient)).size };
  }
  const rp = regions?.patients;
  if (rp && Object.keys(rp).length) {
    const byPatient = Object.fromEntries(ids.filter((p) => rp[p]).map((p) => [p, rp[p].n_regions]));
    out.regions = { total: Object.values(byPatient).reduce((x, y) => x + y, 0), patients: Object.keys(byPatient).length, byPatient };
  }
  out.rnaWhy = out.rna ? null : "not available (per-patient rna/cells.json not loaded)";
  out.regionsWhy = out.regions ? `${out.regions.patients} of ${out.nPatients} patients; from the cell metadata region field` : "not available (_cohort/regions.json not exported)";
  return out;
}

/**
 * Fig. 1d: truncal vs subclonal mutation sites per patient. Subclonal = tmb.json sites; truncal = "truncal mutations (current tree)"
 * of clinical_assays.json clinical_meta where available (source "current tree map"), else the tmb.json truncal sites ("tmb.json").
 * Sorted by subclonal count, ascending.
 */
export function truncalSubclonal(tmb, assays = null) {
  const meta = assays?.clinical_meta?.patients || {};
  const rows = (tmb?.patients || []).map((p) => {
    const s = p.patient_summary || {};
    const m = meta[p.patient]?.truncal_mutations_mapped;
    const fromMeta = m != null;
    return { patient: p.patient, truncal: fromMeta ? m : s.truncal?.n_sites ?? null, truncalSource: fromMeta ? "current tree map" : "tmb.json", subclonal: s.subclonal?.n_sites ?? null, noisy: !!p.noisy, nCells: s.n_tumor_cells ?? null };
  }).filter((r) => r.truncal != null && r.subclonal != null);
  return rows.sort((a, b) => a.subclonal - b.subclonal);
}

export const STATE_ORDER = ["MES", "AC", "NPC", "OPC"];

/** Fig. 1e: malignant cell-state composition per patient (cells with a state call), fractions per state. */
export function stateComposition(rnaCells) {
  const by = {};
  (rnaCells || []).forEach((c) => {
    if (!c.state || c.Cell_Type !== "Malignant") return;
    const p = (by[c.patient] ||= { patient: c.patient, n: 0, counts: Object.fromEntries(STATE_ORDER.map((s) => [s, 0])) });
    if (p.counts[c.state] == null) p.counts[c.state] = 0;
    p.counts[c.state] += 1;
    p.n += 1;
  });
  return Object.values(by).sort((a, b) => a.patient.localeCompare(b.patient)).map((p) => ({ ...p, frac: Object.fromEntries(Object.entries(p.counts).map(([k, v]) => [k, p.n ? v / p.n : 0])) }));
}

const rowGenes = (kind, r = {}) => [r.gene, ...(r.genes || []), r.left?.feature, r.right?.feature, kind === "tert" ? "TERT" : null].filter(Boolean).join(" ").toLowerCase();

/**
 * Filter the recovery export for the Clinical Assays page. filters: { classes: [], patients: [], statuses: [],
 * gene: "", tiers: [] }; an empty list / string = no filter. Tiers apply to rows that carry one (SNV / SV /
 * missed); rows without a tier are kept when no tier filter is set and dropped otherwise. Clonality is not in
 * the export, so it is not a filter. Returns a recovery of the same shape (patients and rows removed).
 */
export function filterRecovery(recovery, { classes = [], patients = [], statuses = [], gene = "", tiers = [] } = {}) {
  if (!recovery?.patients) return recovery;
  const q = `${gene || ""}`.trim().toLowerCase();
  const keep = (kind, r) => {
    if (classes.length && !classes.includes(alterationClass(kind, r))) return false;
    if (statuses.length && !statuses.includes(oncoStatus(kind, r))) return false;
    if (q && !rowGenes(kind, r).includes(q)) return false;
    if (tiers.length && !tiers.includes(Number(r.tier))) return false;
    return true;
  };
  const out = {};
  Object.entries(recovery.patients).forEach(([id, rec]) => {
    if (patients.length && !patients.includes(id)) return;
    const next = { ...rec };
    KINDS.forEach((k) => {
      const key = k === "tert" ? "tert_promoter" : k;
      if (rec[key]) next[key] = rec[key].filter((r) => keep(k, r));
    });
    next.missed = (rec.missed || []).filter((m) => (!q || `${m.gene}`.toLowerCase().includes(q)) && (!tiers.length || tiers.includes(Number(m.tier))) && (!classes.length || classes.includes(m.type === "SCNA" ? (`${m.variant}` === "AMP" ? "amp" : "loss") : m.type === "Fusion" ? "sv" : "snv")));
    out[id] = next;
  });
  return { ...recovery, patients: out };
}
