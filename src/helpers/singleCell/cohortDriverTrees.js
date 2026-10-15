// "Drivers on each patient's tree" (cohort Drivers view): the Drivers layer of every patient, side by side,
// with ONE shared set of columns so the same gene / event class sits in the same column of every block.
// d3-free so jest can test it. Per-cell states come from driverLayer.entryStates (the patient layer's helper).
//
// - sharedKeyOf / sharedLabel: the cross-patient identity of a driver entry (class + gene)
// - patientColumnMap: one patient's entry for each shared key (strongest when a gene has several)
// - selectSharedColumns: which shared columns are shown (tier, strong, types, preset, gene picker)
// - alignPatient: the shared columns for one patient, with null for columns the patient lacks
// - slimSnv: keep only the SNV columns that driver events map to (cohort memory)
// - cellStatus: hover text of one cell of one column
// - serializeCdt / parseCdt: the settings in the URL (cdt* params)
import { eventClass, EVENT_CLASS_ORDER, isDamagingMissense, passesTier } from "./cohortStats";
import { isStrongEvent } from "./strongEvents";
import { DEFAULT_FILTERS, STATE, complexName, selectDrivers } from "./driverLayer";

export const CDT_PRESETS = ["recommended", "subclonal", "hotspots", "all"];
export const CDT_PRESET_LABELS = { recommended: "Recommended", subclonal: "Subclonal only", hotspots: "Hotspots", all: "All" };
export const CDT_HEIGHTS = { compact: 120, normal: 220, tall: 360 };
export const CDT_DEFAULTS = { preset: "recommended", maxTier: "2d", strongOnly: true, classes: null, genes: null, maxCols: 12, colPx: 14, height: "compact" };
export const CDT_COL_PX = [6, 30];

const geneOf = (entry) => `${entry.event?.gene || entry.genes?.[0] || "?"}`;

/** Cross-patient identity of an entry: class + gene (fusions: the sorted partner pair; complex: kind + gene). */
export function sharedKeyOf(entry) {
  if (entry.cls === "fusion") return `fusion|${[...(entry.genes || [])].sort().join("::") || geneOf(entry)}`;
  if (entry.cls === "complex") return `complex|${complexName(entry.event?.vartype)}|${entry.event?.gene || ""}`;
  return `${entry.cls}|${geneOf(entry)}`;
}

/** Column name shared by all patients ("EGFR SNV / indel", "EGFR amp", "CDKN2A del", "EGFR::SEPT14", "cpxdm EGFR"). */
export function sharedLabel(entry) {
  if (entry.cls === "snv") return `${geneOf(entry)} SNV/indel`;
  if (entry.cls === "amp") return `${geneOf(entry)} amp`;
  if (entry.cls === "homdel") return `${geneOf(entry)} del`;
  if (entry.cls === "fusion") return [...(entry.genes || [])].join("::") || geneOf(entry);
  return `${complexName(entry.event?.vartype)}${entry.event?.gene ? ` ${entry.event.gene}` : ""}`.trim();
}

/** All genes a shared column stands for (both fusion partners). */
const genesOfEntry = (entry) => (entry.cls === "fusion" && entry.genes?.length ? entry.genes : [geneOf(entry)]);

/** One patient's entries by shared key; a gene with several entries of one class keeps the one in most cells. */
export function patientColumnMap(entries = []) {
  const out = new Map();
  entries.forEach((e) => {
    const k = sharedKeyOf(e);
    const prev = out.get(k);
    if (!prev) out.set(k, { entry: e, others: [] });
    else if (e.n > prev.entry.n) out.set(k, { entry: e, others: [prev.entry, ...prev.others] });
    else prev.others.push(e);
  });
  return out;
}

/** Entry kept for the cohort view: tier, strong, Types (event class) and the Drivers-layer preset. */
export function cohortEntryFilter(entries, { preset = "recommended", maxTier = "2d", strongOnly = true, classes = null } = {}) {
  const typed = classes && classes.length < EVENT_CLASS_ORDER.length ? new Set(classes) : null;
  const base = entries.filter((d) => {
    if (!(d.cls === "complex" && d.tier == null) && !passesTier(d.event || { Tier: d.tier ?? 9 }, maxTier)) return false;
    if (strongOnly && !isStrongEvent(d.event)) return false;
    if (typed && !typed.has(eventClass(d.event))) return false;
    return true;
  });
  const chosen = new Set(selectDrivers(base, { preset, add: [], remove: [], filters: { ...DEFAULT_FILTERS, maxTier: preset === "recommended" ? 2 : null } }).map((d) => d.key));
  // Recommended + tier "2d": damaging tier-3 missense join, as in the oncoprint
  if (preset === "recommended" && maxTier === "2d") base.forEach((d) => d.cls === "snv" && isDamagingMissense(d.event) && d.qc?.pass && !d.upstreamOnly && chosen.add(d.key));
  return base.filter((d) => chosen.has(d.key));
}

/**
 * Shared columns. perPatient: { patientId: entries }. Every entry passing the filters in any patient makes its
 * shared key a candidate; candidates are ranked by number of patients, then total cells, then name.
 * genes: picked gene symbols (null = the top `maxCols` columns).
 * @returns { columns: [{ key, label, cls, genes, nPatients, cells }], ranked } (ranked = all candidates, for the picker)
 */
export function selectSharedColumns(perPatient, opts = {}) {
  const o = { ...CDT_DEFAULTS, ...opts };
  const cand = new Map();
  Object.entries(perPatient || {}).forEach(([pid, entries]) => {
    patientColumnMap(cohortEntryFilter(entries || [], o)).forEach(({ entry }, key) => {
      if (!cand.has(key)) cand.set(key, { key, label: sharedLabel(entry), cls: entry.cls, genes: genesOfEntry(entry), patients: new Set(), cells: 0 });
      const c = cand.get(key);
      c.patients.add(pid);
      c.cells += entry.n;
    });
  });
  const ranked = [...cand.values()]
    .map((c) => ({ key: c.key, label: c.label, cls: c.cls, genes: c.genes, nPatients: c.patients.size, cells: c.cells }))
    .sort((a, b) => b.nPatients - a.nPatients || b.cells - a.cells || a.label.localeCompare(b.label));
  const picked = o.genes && o.genes.length ? new Set(o.genes.map((g) => g.toUpperCase())) : null;
  const columns = picked ? ranked.filter((c) => c.genes.some((g) => picked.has(g.toUpperCase()))) : ranked.slice(0, Math.max(1, o.maxCols));
  return { columns, ranked };
}

/** Gene choices of the picker: gene -> patients (count) among the ranked columns, most patients first. */
export function geneChoices(ranked = []) {
  const by = new Map();
  ranked.forEach((c) => c.genes.forEach((g) => {
    if (!by.has(g)) by.set(g, { gene: g, nPatients: 0, cells: 0 });
    const v = by.get(g);
    v.nPatients = Math.max(v.nPatients, c.nPatients);
    v.cells += c.cells;
  }));
  return [...by.values()].sort((a, b) => b.nPatients - a.nPatients || b.cells - a.cells || a.gene.localeCompare(b.gene));
}

/**
 * The shared columns for one patient, same length and order for every patient.
 * @param columns shared columns (selectSharedColumns)
 * @param entries the patient's driver entries (all of them: a column the filters admit may be an entry the preset hides here)
 * @param states Map(entry key -> per-cell states, tree order)
 * @returns [{ column, entry, others, states }] with entry = null and states = null where the patient has no such event
 */
export function alignPatient(columns, entries, states) {
  const map = patientColumnMap(entries || []);
  return columns.map((column) => {
    const hit = map.get(column.key);
    return { column, entry: hit?.entry || null, others: hit?.others || [], states: hit ? states?.get(hit.entry.key) || null : null };
  });
}

/**
 * Before the SNV matrix is loaded an SNV column is still PRESENT (its carriers come from filtered.events cell_ids, via
 * entryStates' carrier fallback); only the per-cell wild-type / no-coverage evidence waits. Marks those columns pending
 * and keeps their states (carrier = 2, otherwise 0).
 */
export const markSnvPending = (aligned, snvPending) => (snvPending ? aligned.map((a) => (a.entry?.cls === "snv" ? { ...a, pending: true } : a)) : aligned);

/** Keep only the SNV columns `cols` (indices of snv.variants) and their statuses; ids are preserved so site lookups still work. */
export function slimSnv(snv, cols) {
  const keep = [...new Set(cols)].sort((a, b) => a - b);
  return { cells: snv.cells, variants: keep.map((c) => snv.variants[c]), status: snv.status.map((row) => Int8Array.from(keep, (c) => row[c])), source: snv.source };
}

/** Variant columns the driver events map to (chrom:pos in snv variants). */
export function eventSnvColumns(entries) {
  return entries.map((e) => e.snvColumn).filter((c) => c != null);
}

/** Hover text of one cell: { status, kind } with kind = mutant | wildtype | none | cn | dna | rna | both | carrier. */
export function cellStatus(entry, value) {
  if (!entry) return { kind: "absent", status: "no such event in this patient" };
  if (entry.cls === "snv") return value === STATE.MUT ? { kind: "mutant", status: "mutant" } : value === STATE.WT ? { kind: "wildtype", status: "wild type" } : { kind: "none", status: "no coverage" };
  if (entry.cls === "amp" || entry.cls === "homdel") return Number.isFinite(value) ? { kind: "cn", status: `total copy number ${value}` } : { kind: "none", status: "no copy-number data" };
  if (entry.cls === "fusion") {
    return value === 3 ? { kind: "both", status: "fusion: DNA carrier and RNA call" } : value === 2 ? { kind: "rna", status: "fusion: RNA call only" } : value === 1 ? { kind: "dna", status: "fusion: DNA carrier" } : { kind: "none", status: "no fusion evidence" };
  }
  return value ? { kind: "carrier", status: "carrier" } : { kind: "none", status: "not a carrier" };
}

/** Number of cells with the event in a column (mutant / CN != 2 for amp+del / carriers). */
export function carrierCount(entry) {
  return entry ? entry.n : 0;
}

/* ---- URL: cdt* params (only what differs from the defaults) ---- */

export const CDT_PARAMS = ["cdtp", "cdtt", "cdts", "cdtc", "cdtg", "cdtn", "cdtw", "cdth"];

export function serializeCdt(s = {}) {
  const o = { ...CDT_DEFAULTS, ...s };
  const out = {};
  if (o.preset !== CDT_DEFAULTS.preset) out.cdtp = o.preset;
  if (o.maxTier !== CDT_DEFAULTS.maxTier) out.cdtt = `${o.maxTier}`;
  if (o.strongOnly === false) out.cdts = "0";
  if (o.classes && o.classes.length && o.classes.length < EVENT_CLASS_ORDER.length) out.cdtc = o.classes.join(",");
  if (o.genes && o.genes.length) out.cdtg = o.genes.join(",");
  if (o.maxCols !== CDT_DEFAULTS.maxCols) out.cdtn = `${o.maxCols}`;
  if (o.colPx !== CDT_DEFAULTS.colPx) out.cdtw = `${o.colPx}`;
  if (o.height !== CDT_DEFAULTS.height) out.cdth = o.height;
  return out;
}

export function parseCdt(search = "") {
  const p = new URLSearchParams(search);
  const out = { ...CDT_DEFAULTS };
  if (CDT_PRESETS.includes(p.get("cdtp"))) out.preset = p.get("cdtp");
  if (p.get("cdtt") === "2d") out.maxTier = "2d";
  else if ([1, 2, 3].includes(Number(p.get("cdtt")))) out.maxTier = Number(p.get("cdtt"));
  if (p.get("cdts") === "0") out.strongOnly = false;
  if (p.get("cdtc")) {
    const list = p.get("cdtc").split(",").filter((c) => EVENT_CLASS_ORDER.includes(c));
    if (list.length) out.classes = list;
  }
  if (p.get("cdtg")) out.genes = p.get("cdtg").split(",").filter(Boolean);
  const n = Number(p.get("cdtn"));
  if (Number.isFinite(n) && n >= 1 && n <= 60) out.maxCols = Math.round(n);
  const w = Number(p.get("cdtw"));
  if (Number.isFinite(w) && w > 0) out.colPx = Math.max(CDT_COL_PX[0], Math.min(CDT_COL_PX[1], Math.round(w)));
  if (CDT_HEIGHTS[p.get("cdth")]) out.height = p.get("cdth");
  return out;
}

/** Row (cell index in tree order) under pixel y of a block `height` px tall showing `n` cells. */
export const rowAtY = (y, height, n) => (n > 0 && height > 0 ? Math.max(0, Math.min(n - 1, Math.floor((y / height) * n))) : -1);
