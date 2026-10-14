// Cross-patient oncoprint (Single-Cell Cohort > Oncoprint). d3-free so jest can test it.
//
// Rows are genes (fusion partners, or a "DM chr7"-style label for complex events without a gene),
// columns are patients. A cell holds every driver entry of that gene in that patient, reusing the
// patient Drivers layer (driverLayer.js) for classes, QC, "Recommended" and the gene lists.
//
// - cohortEntries: filtered events -> driver entries with the tumour-cell fraction
// - ONCOPRINT_PRESETS / selectCohortEntries: which events are drawn
// - oncoprintGrid: rows x patients matrix
// - sortRowsByFrequency / sortColumnsMemo: standard oncoprint ordering (rows by frequency, columns by mutual exclusivity)
// - drvOpenParams: URL parameters that open a patient on the Drivers layer at one event
import { CLONAL_FRACTION, DEFAULT_FILTERS, buildDriverEntries, passesFilters, presetEntries } from "./driverLayer";
import { splitIds } from "./driverContrast";

export const ONCOPRINT_PRESETS = ["recommended", "gbm", "oncokb", "all"];
export const ONCOPRINT_CLASSES = ["snv", "amp", "homdel", "fusion", "complex"];

export const DEFAULT_ONCOPRINT = {
  preset: "recommended",
  classes: null, // subset of ONCOPRINT_CLASSES; null = all
  tiers: null, // allowed tiers; null = any
  minFraction: 0, // fraction of the tumour cells that carry it
  addGenes: [], // rows forced in (all their entries pass the class / fraction filters)
  removeGenes: [], // rows forced out
};

/** Tumour-cell fraction of an event (cell_fraction, else n_cells over the "n/total" cells text). */
export function eventFraction(e = {}) {
  const f = Number(e.cell_fraction);
  if (e.cell_fraction != null && e.cell_fraction !== "" && Number.isFinite(f)) return f;
  const m = /^(\d+)\s*\/\s*(\d+)$/.exec(`${e.cells || ""}`);
  if (m && Number(m[2]) > 0) return Number(m[1]) / Number(m[2]);
  return null;
}

/**
 * Driver entries of one patient with the carrier fraction taken from the event itself
 * (the cohort view does not load every cell list). `subclonal` follows that fraction.
 */
export function cohortEntries(events = [], opts = {}) {
  return buildDriverEntries(events, { ...opts, tumorIds: [] }).map((d) => {
    const fraction = eventFraction(d.event) ?? (Number.isFinite(Number(d.event.n_cells)) ? null : 0);
    const n = Number.isFinite(Number(d.event.n_cells)) ? Number(d.event.n_cells) : splitIds(d.event.cell_ids).length;
    const fr = fraction == null ? 0 : fraction;
    const entry = { ...d, n, fraction: fr, subclonal: fr <= CLONAL_FRACTION };
    // re-run the QC on the real cell count
    const reasons = [];
    if (n < 3) reasons.push("fewer than 3 cells");
    if (d.upstreamOnly) reasons.push("fusion only upstream of the gene");
    if (d.verdict === "artefact" || d.verdict === "germline") reasons.push(`site evidence: ${d.verdict}-like`);
    entry.qc = { pass: reasons.length === 0, reasons };
    return entry;
  });
}

/** Row id of an entry: its first gene, else the complex-event label ("DM chr2"). */
export function rowOf(entry) {
  return entry.genes[0] || entry.label || "?";
}

const upper = (s) => `${s}`.toUpperCase();

/**
 * Entries drawn for a patient under an oncoprint selection.
 *   recommended  the patient Drivers layer rule (tier 1-2 cancer gene, QC pass, no upstream-only fusion; DM / BFB / TIC with enough cells)
 *   gbm          every entry in a GBM gene
 *   oncokb       every entry in an OncoKB / CGC gene
 *   all          everything, including upstream-only fusions
 * then the class / tier / min fraction filters, plus added genes minus removed genes.
 */
export function selectCohortEntries(entries = [], selection = DEFAULT_ONCOPRINT) {
  const sel = { ...DEFAULT_ONCOPRINT, ...(selection || {}) };
  const filters = { ...DEFAULT_FILTERS, tiers: sel.tiers && sel.tiers.length ? sel.tiers : null, classes: sel.classes && sel.classes.length ? sel.classes : null };
  const classTier = (d) => passesFilters(d, filters) && d.fraction >= sel.minFraction;
  const classOnly = (d) => passesFilters(d, { ...DEFAULT_FILTERS, classes: filters.classes }) && d.fraction >= sel.minFraction && !d.upstreamOnly;
  let base;
  if (sel.preset === "gbm") base = entries.filter((d) => d.inGbm && !d.upstreamOnly && classTier(d));
  else if (sel.preset === "oncokb") base = entries.filter((d) => (d.inOncoKB || d.inCgc === true) && !d.upstreamOnly && classTier(d));
  else if (sel.preset === "all") base = entries.filter(classTier);
  else base = presetEntries(entries, { preset: "recommended", filters }).filter((d) => d.fraction >= sel.minFraction);
  const add = new Set((sel.addGenes || []).map(upper));
  const remove = new Set((sel.removeGenes || []).map(upper));
  const chosen = new Map(base.map((d) => [d.key, d]));
  entries.forEach((d) => {
    if (add.has(upper(rowOf(d))) || d.genes.some((g) => add.has(upper(g)))) {
      if (classOnly(d)) chosen.set(d.key, d);
    }
  });
  return [...chosen.values()].filter((d) => !remove.has(upper(rowOf(d))));
}

/**
 * Rows x patients grid.
 * @param entriesByPatient { patient: driver entries }
 * @returns { patients, rows: [{ gene, cells: { patient: cell }, nPatients, maxFraction }] };
 *   a cell is { entries, best, fraction, clonal, classes }, best = the entry with the largest fraction
 */
export function oncoprintGrid(entriesByPatient = {}, selection = DEFAULT_ONCOPRINT) {
  const patients = Object.keys(entriesByPatient);
  const byGene = new Map();
  patients.forEach((p) => {
    selectCohortEntries(entriesByPatient[p] || [], selection).forEach((d) => {
      const g = rowOf(d);
      if (!byGene.has(g)) byGene.set(g, {});
      const cells = byGene.get(g);
      (cells[p] ||= []).push(d);
    });
  });
  const rows = [...byGene.entries()].map(([gene, cellEntries]) => {
    const cells = {};
    Object.entries(cellEntries).forEach(([p, list]) => {
      const sorted = [...list].sort((a, b) => b.fraction - a.fraction);
      cells[p] = {
        entries: sorted,
        best: sorted[0],
        fraction: sorted[0].fraction,
        clonal: sorted.some((d) => !d.subclonal),
        classes: [...new Set(sorted.map((d) => d.cls))],
      };
    });
    return { gene, cells, nPatients: Object.keys(cells).length, maxFraction: Math.max(...Object.values(cells).map((c) => c.fraction)) };
  });
  return { patients, rows: sortRowsByFrequency(rows) };
}

/** Most patients first, then the largest fraction, then name. */
export function sortRowsByFrequency(rows = []) {
  return [...rows].sort((a, b) => b.nPatients - a.nPatients || b.maxFraction - a.maxFraction || a.gene.localeCompare(b.gene));
}

/**
 * Standard oncoprint column order (mutual exclusivity): walk the rows in order and put
 * patients altered in the first row first, then within them those altered in the second row, ...
 * Ties inside a row go to the larger fraction. Patients with no alteration keep their input order, last.
 */
export function sortColumnsMemo(rows = [], patients = []) {
  const idx = new Map(patients.map((p, i) => [p, i]));
  return [...patients].sort((a, b) => {
    for (const r of rows) {
      const ca = r.cells[a];
      const cb = r.cells[b];
      if (!ca && !cb) continue;
      if (!ca) return 1;
      if (!cb) return -1;
      if (ca.fraction !== cb.fraction) return cb.fraction - ca.fraction;
    }
    return idx.get(a) - idx.get(b);
  });
}

/** Column order for a sort mode: "exclusivity" (memo sort), "name", or "burden" (events drawn, most first). */
export function sortColumns(grid, mode = "exclusivity") {
  if (mode === "name") return [...grid.patients].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  if (mode === "burden") {
    const n = (p) => grid.rows.filter((r) => r.cells[p]).length;
    return [...grid.patients].sort((a, b) => n(b) - n(a) || a.localeCompare(b, undefined, { numeric: true }));
  }
  return sortColumnsMemo(grid.rows, grid.patients);
}

/** Gene choices for the picker: every row id in the data with its patient count, most recurrent first. */
export function geneChoices(entriesByPatient = {}) {
  const count = new Map();
  Object.values(entriesByPatient).forEach((entries) => {
    const seen = new Set();
    entries.forEach((d) => {
      const g = rowOf(d);
      if (!seen.has(g)) {
        seen.add(g);
        count.set(g, (count.get(g) || 0) + 1);
      }
    });
  });
  return [...count.entries()].map(([gene, nPatients]) => ({ gene, nPatients })).sort((a, b) => b.nPatients - a.nPatients || a.gene.localeCompare(b.gene));
}

/** URL parameters that open a patient's Single-Cell tab on the Drivers layer with one event's drawer open. */
export function drvOpenParams(patient, entry) {
  return { report: `${patient}`, tab: "7", heatmap: "drivers", drvopen: entry.key, drvpreset: "all" };
}

/** Class glyph key for drawing: shape names used by the panel. */
export const GLYPH = { snv: "square", amp: "up", homdel: "down", fusion: "diamond", complex: "circle" };
