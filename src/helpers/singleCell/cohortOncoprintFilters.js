// Filters of the cohort oncoprint (Single-Cell Cohort > Oncoprint). d3-free so jest can test it.
//
// All filters are AND-combined. Entry filters (gene role / lists / search, consequence, tier, clonality,
// carrier cells, tumour-cell fraction range, Clade F1 range, site-QC verdict, fusion support, upstream-only
// fusions) drop single events before the preset / class selection of cohortOncoprint.js; row and patient
// filters (min patients per row, max rows, patient subset, hide empty patients) act on the finished grid.
import { cladeFitScore } from "./cladeFit";
import { eventClass, isDamagingMissense, passesTier } from "./cohortStats";
import { matchRnaFusions } from "./rnaFusions";
import { oncoprintGrid, rowOf, selectCohortEntries, sortRowsByFrequency } from "./cohortOncoprint";

export const ROLE_CHOICES = [
  { value: "oncogene", label: "Oncogene" },
  { value: "tsg", label: "Tumour suppressor" },
  { value: "both", label: "Oncogene and TSG" },
  { value: "unannotated", label: "Unannotated" },
  { value: "fusion", label: "Fusion" },
  { value: "structural", label: "Structural (DM / TIC / BFB ...)" },
];
export const CONSEQUENCE_CHOICES = [
  { value: "amp", label: "Amplification" },
  { value: "homdel", label: "Homozygous deletion" },
  { value: "fusion", label: "Fusion" },
  { value: "trunc", label: "Truncating (nonsense / frameshift)" },
  { value: "splice", label: "Splice" },
  { value: "missense", label: "Missense" },
  { value: "damaging", label: "Damaging missense (SIFT + PolyPhen)" },
  { value: "complex", label: "Complex SV" },
];
export const VERDICT_CHOICES = [
  { value: "supported", label: "Supported" },
  { value: "weak", label: "Weak" },
  { value: "artefact", label: "Artefact-like" },
  { value: "germline", label: "Germline-like" },
  { value: "none", label: "No evidence" },
];

/** DNA-repair gene sets (a gene list choice each, plus "dnarepair" = their union). */
export const DNA_REPAIR_SETS = {
  nhej: "PRKDC XRCC4 XRCC5 XRCC6 LIG4 DCLRE1C NHEJ1 PAXX".split(" "),
  hr: "BRCA1 BRCA2 PALB2 RAD51 RAD51B RAD51C RAD51D RAD52 RAD54L RAD50 MRE11 NBN ATM ATR CHEK1 CHEK2 BARD1 BRIP1 XRCC2 XRCC3".split(" "),
  mmr: "MSH2 MSH3 MSH6 MLH1 MLH3 PMS1 PMS2 EXO1".split(" "),
  fa: "FANCA FANCB FANCC FANCD2 FANCE FANCF FANCG FANCI FANCL FANCM SLX4 UBE2T".split(" "),
};
export const GENE_LIST_CHOICES = [
  { value: "gbm", label: "GBM genes" },
  { value: "oncokb", label: "OncoKB" },
  { value: "cgc", label: "COSMIC CGC" },
  { value: "dnarepair", label: "DNA repair (all below)" },
  { value: "nhej", label: "NHEJ (PRKDC, XRCC4/5/6, LIG4, DCLRE1C, NHEJ1, PAXX)" },
  { value: "hr", label: "Homologous recombination" },
  { value: "mmr", label: "Mismatch repair" },
  { value: "fa", label: "Fanconi anaemia" },
];

export const DEFAULT_OC_FILTERS = {
  roles: [], // ROLE_CHOICES values; [] = any
  lists: [], // GENE_LIST_CHOICES values (any of); [] = no restriction
  custom: [], // pasted gene symbols (any of, joined with the lists)
  search: "", // substring of the row label or a gene
  consequences: [], // CONSEQUENCE_CHOICES values; [] = any
  maxTier: null, // 1 | 2 | "2d" | 3 (TIER_OPTIONS); null = no limit
  clonality: "any", // "any" | "clonal" | "subclonal"
  minCells: 3, // carrier cells; single-cell events at 1-2 cells flood the TSG block
  minFrac: 0, // tumour-cell fraction range (0-1)
  maxFrac: 1,
  minF1: 0, // Clade F1 range (0-1); entries with no score always stay
  maxF1: 1,
  verdicts: [], // VERDICT_CHOICES values; [] = any (only entries that have site evidence are filtered)
  fusionSupport: "any", // "any" | "dna" | "rna" | "both"
  noUpstream: false, // drop fusions only upstream of the gene
  minPatients: 1, // rows with at least this many patients
  maxRows: 0, // 0 = all
  patients: [], // patient subset; [] = all
  hideEmpty: false, // hide patients with no shown event
};

const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
const upper = (s) => `${s}`.toUpperCase();

/** Genes of a named list (not the data-driven ones: gbm / oncokb / cgc). */
export function listGenes(name) {
  if (name === "dnarepair") return [...new Set(Object.values(DNA_REPAIR_SETS).flat())];
  return DNA_REPAIR_SETS[name] || null;
}

/** Split a pasted gene list on whitespace, commas and semicolons; upper-cased, unique. */
export function parseGeneList(text = "") {
  return [...new Set(`${text}`.split(/[\s,;]+/).map((g) => g.trim().toUpperCase()).filter(Boolean))];
}

/** Gene role of an entry: fusion / structural by class, else the OncoKB role in the event. */
export function entryRole(d) {
  if (d.cls === "fusion") return "fusion";
  if (d.cls === "complex") return "structural";
  const r = `${d.event?.role || ""}`;
  const og = /oncogene/i.test(r);
  const tsg = /suppressor/i.test(r);
  if (og && tsg) return "both";
  if (og) return "oncogene";
  if (tsg) return "tsg";
  return "unannotated";
}

/** Consequence keys of an entry (damaging missense is also a missense). */
export function entryConsequences(d) {
  const c = eventClass(d.event);
  const out = [c];
  if (c === "missense" && isDamagingMissense(d.event)) out.push("damaging");
  return out;
}

/**
 * Add what the filters need to a patient's cohort entries: Clade F1 (`fit`, NaN without a tree) and the RNA
 * support of fusions (`rnaCells`, a non-empty array when the RNA fusion list matches), plus CGC membership.
 */
export function annotateEntries(entries = [], { tree = null, rnaFusions = null, cgc = null } = {}) {
  return entries.map((d) => ({
    ...d,
    fit: tree ? cladeFitScore(d.carriers || [], tree).score : NaN,
    rnaCells: d.cls === "fusion" && rnaFusions ? (matchRnaFusions(d.event, rnaFusions).length ? [1] : null) : d.rnaCells || null,
    rnaKnown: Boolean(rnaFusions),
    inCgc: cgc ? d.genes.some((g) => cgc.has(g)) : d.inCgc,
  }));
}

/** Gene sets of the active lists/custom filter: { data: [gbm/oncokb/cgc], genes: Set } */
function listSpec(f) {
  const genes = new Set((f.custom || []).map(upper));
  const data = [];
  (f.lists || []).forEach((l) => {
    const g = listGenes(l);
    if (g) g.forEach((x) => genes.add(x));
    else data.push(l);
  });
  return { data, genes };
}

/** Names of the entry filters this entry fails (empty = passes all). */
export function failedFilters(d, filters = DEFAULT_OC_FILTERS) {
  const f = { ...DEFAULT_OC_FILTERS, ...(filters || {}) };
  const fails = [];
  if (f.roles.length && !f.roles.includes(entryRole(d))) fails.push("role");
  const spec = listSpec(f);
  if (spec.data.length || spec.genes.size) {
    const hit =
      d.genes.some((g) => spec.genes.has(upper(g))) ||
      (spec.data.includes("gbm") && d.inGbm) ||
      (spec.data.includes("oncokb") && d.inOncoKB) ||
      (spec.data.includes("cgc") && d.inCgc === true);
    if (!hit) fails.push("list");
  }
  const q = upper(f.search || "").trim();
  if (q && !upper(rowOf(d)).includes(q) && !d.genes.some((g) => upper(g).includes(q))) fails.push("search");
  if (f.consequences.length && !entryConsequences(d).some((c) => f.consequences.includes(c))) fails.push("consequence");
  if (f.maxTier != null && !(d.cls === "complex" && d.tier == null) && !passesTier(d.event || { Tier: d.tier ?? 9 }, f.maxTier)) fails.push("tier");
  if (f.clonality === "clonal" && d.subclonal) fails.push("clonality");
  if (f.clonality === "subclonal" && !d.subclonal) fails.push("clonality");
  if (d.n < num(f.minCells, 0)) fails.push("cells");
  if (d.fraction < num(f.minFrac, 0) || d.fraction > num(f.maxFrac, 1)) fails.push("fraction");
  if (Number.isFinite(d.fit) && (d.fit < num(f.minF1, 0) || d.fit > num(f.maxF1, 1))) fails.push("f1");
  if (f.verdicts.length && d.verdict != null && !f.verdicts.includes(d.verdict === "absent" || d.verdict === "uninformative" ? "none" : d.verdict)) fails.push("verdict");
  if (d.cls === "fusion" && f.fusionSupport !== "any") {
    const dna = d.n > 0;
    const rna = Boolean(d.rnaCells);
    if (f.fusionSupport === "dna" && !dna) fails.push("fusion");
    if (f.fusionSupport === "rna" && !rna) fails.push("fusion");
    if (f.fusionSupport === "both" && !(dna && rna)) fails.push("fusion");
  }
  if (f.noUpstream && d.upstreamOnly) fails.push("upstream");
  return fails;
}

export const FILTER_NAMES = {
  role: "gene role", list: "gene list", search: "search", consequence: "consequence", tier: "tier", clonality: "clonality", cells: "min carrier cells",
  fraction: "tumour-cell fraction", f1: "Clade F1", verdict: "site-QC verdict", fusion: "fusion support", upstream: "upstream-only fusions",
  patientsPerRow: "min patients per row", maxRows: "max rows", subset: "patient subset",
};

/**
 * Apply every filter. Returns { entriesByPatient, grid, rows, patients, hidden }.
 * hidden = { events: events the entry filters drop from what the selection would draw, byFilter: {name: n},
 *   rows: rows dropped by min patients / max rows, patients: patients dropped } for the counts line and chip tooltips.
 */
export function filterOncoprint(entriesByPatient = {}, selection, filters = DEFAULT_OC_FILTERS) {
  const f = { ...DEFAULT_OC_FILTERS, ...(filters || {}) };
  const subset = f.patients.length ? new Set(f.patients) : null;
  const kept = {};
  const hidden = { events: 0, byFilter: {}, rows: 0, patients: 0 };
  const dropped = {};
  Object.keys(entriesByPatient).forEach((p) => {
    if (subset && !subset.has(p)) return;
    kept[p] = [];
    dropped[p] = [];
    entriesByPatient[p].forEach((d) => {
      const fails = failedFilters(d, f);
      (fails.length ? dropped[p] : kept[p]).push(fails.length ? { d, fails } : d);
    });
  });
  // events the selection would have drawn, among those the filters drop (per filter: it was one of the failing ones)
  Object.keys(dropped).forEach((p) => {
    const lost = dropped[p];
    if (!lost.length) return;
    const drawn = new Set(selectCohortEntries(lost.map((x) => x.d), selection).map((d) => d.key));
    lost.forEach(({ d, fails }) => {
      if (!drawn.has(d.key)) return;
      hidden.events += 1;
      fails.forEach((k) => {
        hidden.byFilter[k] = (hidden.byFilter[k] || 0) + 1;
      });
    });
    dropped[p] = lost.map((x) => x.d);
  });
  const grid = oncoprintGrid(kept, selection);
  let rows = grid.rows;
  const before = rows.length;
  const minP = num(f.minPatients, 1);
  if (minP > 1) {
    rows = rows.filter((r) => r.nPatients >= minP);
    if (before - rows.length) hidden.byFilter.patientsPerRow = before - rows.length;
  }
  const maxRows = num(f.maxRows, 0);
  if (maxRows > 0 && rows.length > maxRows) {
    hidden.byFilter.maxRows = rows.length - maxRows;
    rows = sortRowsByFrequency(rows).slice(0, maxRows);
  }
  hidden.rows = before - rows.length;
  let patients = grid.patients;
  if (f.hideEmpty) {
    const shown = patients.filter((p) => rows.some((r) => r.cells[p]));
    hidden.patients = patients.length - shown.length;
    patients = shown;
  }
  if (subset) hidden.byFilter.subset = Object.keys(entriesByPatient).length - patients.length - hidden.patients;
  return { entriesByPatient: kept, grid: { patients, rows }, hidden };
}

/** Active filters as chips: [{ key, label, tip }] with the per-filter hidden counts in the tooltips. */
export function filterChips(filters = DEFAULT_OC_FILTERS, hidden = { byFilter: {} }) {
  const f = { ...DEFAULT_OC_FILTERS, ...(filters || {}) };
  const D = DEFAULT_OC_FILTERS;
  const by = hidden?.byFilter || {};
  const out = [];
  const add = (key, fail, label) => out.push({ key, label, tip: `${label}: hides ${by[fail] || 0} ${["patientsPerRow", "maxRows"].includes(fail) ? "rows" : fail === "subset" ? "patients" : "events"} that the selection would draw` });
  const names = (list, choices) => list.map((v) => choices.find((c) => c.value === v)?.label || v).join(" / ");
  if (f.roles.length) add("roles", "role", `Role: ${names(f.roles, ROLE_CHOICES)}`);
  if (f.lists.length || f.custom.length) add("lists", "list", `Genes: ${[names(f.lists, GENE_LIST_CHOICES), f.custom.length ? `${f.custom.length} pasted` : ""].filter(Boolean).join(" + ")}`);
  if (f.search) add("search", "search", `Search: ${f.search}`);
  if (f.consequences.length) add("consequences", "consequence", `Consequence: ${names(f.consequences, CONSEQUENCE_CHOICES)}`);
  if (f.maxTier != null) add("maxTier", "tier", `Tier ${f.maxTier === "2d" ? "≤ 2 + damaging missense" : `≤ ${f.maxTier}`}`);
  if (f.clonality !== D.clonality) add("clonality", "clonality", `Clonality: ${f.clonality}`);
  if (f.minCells !== D.minCells) add("minCells", "cells", `Carrier cells ≥ ${f.minCells}`);
  if (f.minFrac > D.minFrac || f.maxFrac < D.maxFrac) add("frac", "fraction", `Tumour-cell fraction ${Math.round(f.minFrac * 100)}-${Math.round(f.maxFrac * 100)}%`);
  if (f.minF1 > D.minF1 || f.maxF1 < D.maxF1) add("f1", "f1", `Clade F1 ${f.minF1}-${f.maxF1}`);
  if (f.verdicts.length) add("verdicts", "verdict", `Site QC: ${names(f.verdicts, VERDICT_CHOICES)}`);
  if (f.fusionSupport !== "any") add("fusionSupport", "fusion", `Fusion support: ${f.fusionSupport}`);
  if (f.noUpstream) add("noUpstream", "upstream", "No upstream-only fusions");
  if (f.minPatients > 1) add("minPatients", "patientsPerRow", `Rows in ≥ ${f.minPatients} patients`);
  if (f.maxRows > 0) add("maxRows", "maxRows", `Top ${f.maxRows} rows`);
  if (f.patients.length) add("patients", "subset", `${f.patients.length} patients`);
  if (f.hideEmpty) out.push({ key: "hideEmpty", label: "Hide empty patients", tip: `Hides ${hidden?.patients || 0} patients with no shown event` });
  return out;
}

/** Reset one chip (its filter keys back to the default). */
export function clearFilter(filters, key) {
  const D = DEFAULT_OC_FILTERS;
  const keys = { frac: ["minFrac", "maxFrac"], f1: ["minF1", "maxF1"], lists: ["lists", "custom"] }[key] || [key];
  const next = { ...filters };
  keys.forEach((k) => {
    next[k] = D[k];
  });
  return next;
}

/** The counts line: "N rows x M patients (K events hidden by filters)". */
export function countsLine(grid, hidden) {
  const k = hidden?.events || 0;
  return `${grid.rows.length} rows × ${grid.patients.length} patients${k ? ` (${k} events hidden by filters)` : ""}`;
}

/** Added genes hidden by the filters instead of the preset: [{ gene, reason }] for genes that have events but all fail the filters. */
export function filteredAddedGenes(entriesByPatient = {}, addGenes = [], filters = DEFAULT_OC_FILTERS) {
  const all = Object.values(entriesByPatient).flat();
  return (addGenes || []).map((g) => {
    const G = upper(g);
    const hits = all.filter((d) => upper(rowOf(d)) === G || d.genes.some((x) => upper(x) === G));
    if (!hits.length || hits.some((d) => !failedFilters(d, filters).length)) return null;
    const names = [...new Set(hits.flatMap((d) => failedFilters(d, filters)))].map((k) => FILTER_NAMES[k] || k);
    return { gene: g, reason: `hidden by the Filters (${names.join(", ")})` };
  }).filter(Boolean);
}

// URL state: only the fields that differ from the default, as JSON in one parameter.
export const OC_URL_PARAMS = ["ocf", "ocs"];
export function serializeOcState(obj, defaults) {
  const diff = {};
  Object.keys(defaults).forEach((k) => {
    if (JSON.stringify(obj?.[k]) !== JSON.stringify(defaults[k]) && obj?.[k] !== undefined) diff[k] = obj[k];
  });
  return Object.keys(diff).length ? JSON.stringify(diff) : null;
}
export function parseOcState(text, defaults) {
  if (!text) return { ...defaults };
  try {
    const o = JSON.parse(text);
    const out = { ...defaults };
    Object.keys(defaults).forEach((k) => {
      if (o[k] !== undefined && typeof o[k] === typeof defaults[k] && Array.isArray(o[k]) === Array.isArray(defaults[k])) out[k] = o[k];
      else if (o[k] !== undefined && defaults[k] === null) out[k] = o[k];
    });
    return out;
  } catch (e) {
    return { ...defaults };
  }
}
