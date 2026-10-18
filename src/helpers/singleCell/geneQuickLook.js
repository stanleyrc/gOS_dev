// Data joins for the gene quick-look popover (d3-free): OncoKB common files, cohort driver events,
// covariate-DE hits and TMB-association rho for one gene.
import { tierOf } from "./cohortStats";
import { eventClass, eventLabel } from "./cohortStats";
import { isRobust } from "./covariateDe";

const rows = (text) => `${text || ""}`.split(/\r?\n/).filter(Boolean).map((l) => l.split("\t"));
const col = (head, name) => head.findIndex((h) => h.trim().toLowerCase() === name.toLowerCase());

/** common/all_curated_genes.tsv -> Map(symbol -> { oncogene, tsg, sensitivity, resistance, summary }); null when the text is not that file (e.g. an HTML 200 fallback). */
export function parseCuratedGenes(text) {
  const r = rows(text);
  if (!r.length) return null;
  const iSym = col(r[0], "Hugo_Symbol");
  if (iSym < 0) return null;
  const iOnc = col(r[0], "Is_Oncogene");
  const iTsg = col(r[0], "Is_Tumor_Suppressor_Gene");
  const iSens = col(r[0], "Highest_Level_of_Evidence_sensitivity");
  const iRes = col(r[0], "Highest_Level_of_Evidence_resistance");
  const iSum = col(r[0], "Summary_Background");
  const map = new Map();
  r.slice(1).forEach((f) => {
    if (!f[iSym]) return;
    map.set(f[iSym], {
      oncogene: `${f[iOnc]}`.toLowerCase() === "yes",
      tsg: `${f[iTsg]}`.toLowerCase() === "yes",
      sensitivity: f[iSens] || "",
      resistance: f[iRes] || "",
      summary: f[iSum] || "",
    });
  });
  return map;
}

const LEVEL_ORDER = ["1", "2", "3A", "3B", "4", "R1", "R2"];
export const levelRank = (l) => {
  const i = LEVEL_ORDER.indexOf(`${l}`);
  return i < 0 ? 99 : i;
};

/** common/oncokb_biomarker_drug_associations.tsv -> Map(gene -> [{ level, alteration, cancer, drugs[] }]) best level first; null if not that file. */
export function parseBiomarkerDrugs(text) {
  const r = rows(text);
  if (!r.length || col(r[0], "Gene") < 0 || col(r[0], "Level") < 0) return null;
  const iLevel = col(r[0], "Level");
  const iGene = col(r[0], "Gene");
  const byKey = new Map();
  r.slice(1).forEach((f) => {
    const gene = f[iGene];
    if (!gene || !LEVEL_ORDER.includes(f[iLevel])) return; // diagnostic / prognostic levels are not drug evidence
    // columns after Gene: Alterations, Cancer Types (tab separated in the file), Drugs
    const alteration = f[iGene + 1] || "";
    const cancer = f[iGene + 2] || "";
    const drug = f[iGene + 3] || "";
    const key = `${gene}|${f[iLevel]}|${alteration}|${cancer}`;
    if (!byKey.has(key)) byKey.set(key, { gene, level: f[iLevel], alteration, cancer, drugs: [] });
    if (drug && !byKey.get(key).drugs.includes(drug)) byKey.get(key).drugs.push(drug);
  });
  const map = new Map();
  [...byKey.values()].forEach((e) => {
    if (!map.has(e.gene)) map.set(e.gene, []);
    map.get(e.gene).push(e);
  });
  map.forEach((v) => v.sort((a, b) => levelRank(a.level) - levelRank(b.level)));
  return map;
}

const tokens = (label) => `${label}`.split(/[:\s,+/-]+/).filter(Boolean).map((t) => t.toUpperCase());
export const labelHasGene = (label, gene) => tokens(label).includes(`${gene}`.toUpperCase());

/** Filtered events whose label names the gene (fusion partners included): [{ patient, label, cls, tier, variant, fraction, event }], tier then fraction order. */
export function driverEventsForGene(summaries, files, gene) {
  const out = [];
  (summaries || []).forEach((s) => {
    (files?.[s.caseReportId]?.events || []).forEach((e) => {
      const label = eventLabel(e);
      if (!label || !labelHasGene(label, gene)) return;
      out.push({ patient: s.caseReportId, summary: s, label, cls: eventClass(e), tier: tierOf(e), variant: e.Variant && e.Variant !== "None" ? e.Variant : e.Variant_g || "", fraction: Number(e.cell_fraction) || 0, event: e });
    });
  });
  return out.sort((a, b) => (a.tier ?? 9) - (b.tier ?? 9) || b.fraction - a.fraction);
}

/** One patient's filtered events naming the gene: [{ label, cls, tier, variant, fraction }], strongest first. */
export function patientEventsForGene(events, gene) {
  return (events || [])
    .map((e) => ({ e, label: eventLabel(e) }))
    .filter(({ label }) => label && labelHasGene(label, gene))
    .map(({ e, label }) => ({ label, cls: eventClass(e), tier: tierOf(e), variant: e.Variant && e.Variant !== "None" ? e.Variant : e.Variant_g || "", fraction: Number(e.cell_fraction) || 0 }))
    .sort((a, b) => (a.tier ?? 9) - (b.tier ?? 9) || b.fraction - a.fraction);
}

/** Distinct event labels containing the gene, for an exact categorical gene filter in the All events table. */
export const eventLabelsForGene = (summaries, files, gene) => [...new Set(driverEventsForGene(summaries, files, gene).map((e) => e.label))];

/** Covariate-DE tests (rna_covariate_de.json) listing the gene among their top genes: [{ id, label, lfc, q, nConcordant, nPatients, robust }], strongest first. */
export function covariateHits(de, gene, { q = 0.05 } = {}) {
  const out = [];
  (de?.tests || []).forEach((t) => {
    const g = (t.genes || []).find((x) => x.gene === gene);
    if (!g || !(g.q_val < q)) return;
    out.push({ id: t.id, label: t.label, groupA: t.group_a, groupB: t.group_b, lfc: g.avg_log2FC, q: g.q_val, nConcordant: g.n_concordant, nPatients: g.n_patients, robust: isRobust(g) });
  });
  return out.sort((a, b) => Number(b.robust) - Number(a.robust) || a.q - b.q);
}

/** Does any test's gene list contain the gene (any q)? Used to tell "not significant" from "not tested/listed". */
export const covariateTestsWith = (de, gene, q = 0.05) => (de?.tests || []).filter((t) => (t.genes || []).some((g) => g.gene === gene && g.q_val < q)).map((t) => t.id);

/** TMB-association rows for the gene in each exported gene table (measure|adjust): [{ key, measure, adjust, meanR, q, nConcordant, nPatients, per }]. */
export function tmbHits(doc, gene) {
  const out = [];
  Object.entries(doc?.genes || {}).forEach(([key, g]) => {
    const row = [...(g.up || []), ...(g.down || [])].find((r) => r.gene === gene);
    if (row) out.push({ key, measure: g.measure, adjust: g.adjust, meanR: row.mean_r, z: row.z, q: row.q, nConcordant: row.n_concordant, nPatients: row.n_patients, per: row.per || {} });
  });
  return out;
}


export const ONCOKB_URL = (gene) => `https://www.oncokb.org/gene/${encodeURIComponent(gene)}`;
