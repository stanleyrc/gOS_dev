// "Drivers" layer of the Single-Cell heatmap: one column per driver event,
// cells in tree order. d3-free so jest can test it.
//
// - buildDriverEntries: filtered events -> driver entries (class, carriers, flags)
// - selectDrivers / presets / filters / setSelectedKeys: which entries are shown
// - serializeSelection / parseSelection: the selection in the URL
// - driverCellStates: per-cell state of each entry (SNV genotype, copy number, fusion support, carrier)
// - driverBranchMarks: the tree branch where each driver arises
import { eventClass } from "./cohortStats";
import { driverKey, driverLabel, splitIds } from "./driverContrast";
import { driverGenes, roleOf } from "./driverSummary";
import { GBM_GENES } from "./geneInfo";
import { cladeFitScore } from "./cladeFit";
import { binAt } from "./matrix";
import { eventGlobalPosition } from "./eventDomains";

export const DRIVER_PRESETS = ["recommended", "subclonal", "hotspots", "all"];
export const DRIVER_CLASSES = ["snv", "amp", "homdel", "fusion", "complex"];
export const DRIVER_GENE_LISTS = ["oncokb", "cgc", "gbm"];
export const FUSION_SUPPORT = ["any", "dna", "rna", "both"];

/** Full help text of the double-minute label (no question mark). */
export const DM_HELP = "DM (double minute / ecDNA, gGnome event classifier)";

/** Carried by more than this fraction of the tumor cells = clonal. */
export const CLONAL_FRACTION = 0.95;
/** Fewest carrier cells for a call to pass the Recommended QC. */
export const MIN_QC_CELLS = 3;

export const DEFAULT_FILTERS = {
  tiers: null, // [1, 2, 3] allowed tiers; null = any
  lists: null, // any of "oncokb" | "cgc" | "gbm"; null = no restriction
  genes: [], // custom gene list (any of); [] = none
  classes: null, // subset of DRIVER_CLASSES; null = all
  clonality: "any", // "any" | "clonal" | "subclonal"
  minCells: 1,
  fusionSupport: "any", // "any" | "dna" | "rna" | "both" (fusion rows only)
};

export const DEFAULT_SELECTION = { preset: "recommended", add: [], remove: [], filters: DEFAULT_FILTERS };

/** snv | amp | homdel | fusion | complex, or null for events the layer does not draw. */
export function driverClassOf(event) {
  const c = eventClass(event);
  if (c === "trunc" || c === "splice" || c === "missense") return "snv";
  return DRIVER_CLASSES.includes(c) ? c : null;
}

const posOfSnv = (event) => {
  const chrom = `${event.seqnames || `${event.Genome_Location || ""}`.split(":")[0]}`.replace(/^chr/i, "");
  const pos = Number(event.start);
  return chrom && Number.isFinite(pos) ? `${chrom}:${pos}` : null;
};

/** Map "chrom:pos" -> column of snv_matrix variants (ids look like chr5_112843290_A_T). */
export function snvSiteIndex(snv) {
  const out = new Map();
  (snv?.variants || []).forEach((v, c) => {
    const m = /^(?:chr)?([^_]+)_(\d+)_/.exec(`${v.id || ""}`);
    if (m) out.set(`${m[1]}:${Number(m[2])}`, c);
  });
  return out;
}

/** Plain-language class label. */
export function classLabel(entry) {
  const v = `${entry.event?.vartype || ""}`;
  if (entry.cls === "complex") return /^dm$/i.test(v) ? DM_HELP : `${v || "Complex event"} (gGnome event classifier)`;
  return { snv: "SNV / indel", amp: "Amplification", homdel: "Homozygous deletion", fusion: "SV fusion" }[entry.cls] || entry.cls;
}

/** Short column label. */
export function entryLabel(entry) {
  const e = entry.event;
  if (entry.cls === "snv") {
    const prot = `${e.Variant || ""}`;
    return `${e.gene || "?"}${prot && prot !== "None" ? ` ${prot}` : ""}`;
  }
  if (entry.cls === "amp") return `${e.gene || "?"} amp`;
  if (entry.cls === "homdel") return `${e.gene || "?"} del`;
  if (entry.cls === "complex") return `${e.vartype || "complex"}${e.gene ? ` ${e.gene}` : ""} ${e.Genome_Location ? `chr${`${e.Genome_Location}`.split(":")[0]}` : ""}`.trim();
  return driverLabel(e);
}

/**
 * Driver entries from a patient's filtered events.
 * @param opts.tumorIds tumor cell ids (carrier denominator)
 * @param opts.hotspots Set of "chrom:pos" of known hotspot sites (site evidence), optional
 * @param opts.verdicts Map "chrom:pos" -> site-evidence verdict level, optional
 * @param opts.cgc Set of COSMIC CGC gene symbols, optional (null = list not loaded)
 * @param opts.rnaFusionCells (event) -> Set of cell ids with an RNA fusion call matching this DNA fusion, optional
 * @param opts.snv snv_matrix data, to mark SNV hotspots flagged driver and find columns
 */
export function buildDriverEntries(events, { tumorIds = [], hotspots = null, verdicts = null, cgc = null, rnaFusionCells = null, snv = null } = {}) {
  const tumor = new Set(tumorIds.map(String));
  const total = tumor.size || 1;
  const siteIndex = snv ? snvSiteIndex(snv) : null;
  const byKey = new Map();
  (events || []).forEach((e) => {
    const cls = driverClassOf(e);
    if (!cls) return;
    const carriers = splitIds(e.cell_ids).filter((id) => !tumor.size || tumor.has(id));
    const key = driverKey(e);
    const prev = byKey.get(key);
    if (prev && prev.carriers.length >= carriers.length) return;
    const genes = driverGenes(e);
    const tier = Number(e.Tier);
    const site = cls === "snv" ? posOfSnv(e) : null;
    const col = site && siteIndex ? siteIndex.get(site) ?? null : null;
    const variant = col != null ? snv.variants[col] : null;
    const verdict = site && verdicts ? verdicts.get(site) || null : null;
    const upstreamOnly = e.upstream_only === true || `${e.upstream_only}` === "true";
    const fraction = carriers.length / total;
    const rnaCells = cls === "fusion" && rnaFusionCells ? rnaFusionCells(e) : null;
    const hotspot = cls === "snv" && Boolean((site && hotspots && hotspots.has(site)) || variant?.driver);
    const entry = {
      key,
      cls,
      event: e,
      genes,
      tier: Number.isFinite(tier) ? tier : null,
      carriers,
      n: carriers.length,
      fraction,
      subclonal: fraction <= CLONAL_FRACTION,
      inOncoKB: Boolean(roleOf(e.role)) || (Number.isFinite(tier) && tier <= 2) || Boolean(variant?.driver),
      inGbm: genes.some((g) => GBM_GENES[g]),
      inCgc: cgc ? genes.some((g) => cgc.has(g)) : null,
      upstreamOnly,
      hotspot,
      verdict,
      snvColumn: col,
      siteId: site,
      rnaCells: rnaCells && rnaCells.size ? rnaCells : null,
    };
    entry.label = entryLabel(entry);
    entry.qc = driverQc(entry);
    byKey.set(key, entry);
  });
  return [...byKey.values()].sort(compareEntries);
}

/** QC of a driver call: enough cells, not an "upstream of GENE" fusion, site evidence not artefact / germline. */
export function driverQc(entry) {
  const reasons = [];
  if (entry.n < MIN_QC_CELLS) reasons.push(`fewer than ${MIN_QC_CELLS} cells`);
  if (entry.upstreamOnly) reasons.push("fusion only upstream of the gene");
  if (entry.verdict === "artefact" || entry.verdict === "germline") reasons.push(`site evidence: ${entry.verdict}-like`);
  return { pass: reasons.length === 0, reasons };
}

/** Tier (1 first, untiered last), then cells. */
export function compareEntries(a, b) {
  return (a.tier ?? 9) - (b.tier ?? 9) || b.n - a.n || `${a.label}`.localeCompare(`${b.label}`);
}

export const isCancerGene = (entry) => entry.inOncoKB || entry.inGbm || entry.inCgc === true;

/** DM / BFB / TIC calls have no OncoKB tier: they count as tier 2 for the presets when they have enough cells. */
const complexOk = (entry) => entry.cls === "complex" && entry.tier == null && entry.n >= MIN_QC_CELLS;

const PRESET_TEST = {
  recommended: (d) => (complexOk(d) || (d.tier != null && d.tier <= 2 && isCancerGene(d))) && d.qc.pass && !d.upstreamOnly,
  subclonal: (d) => d.subclonal && (complexOk(d) || (d.tier != null && d.tier <= 2)) && d.qc.pass && !d.upstreamOnly,
  hotspots: (d) => d.cls === "snv" && d.hotspot && d.qc.pass,
  all: () => true,
};

/** Entries that pass the user's filters. */
export function passesFilters(d, f = DEFAULT_FILTERS) {
  const filters = { ...DEFAULT_FILTERS, ...(f || {}) };
  if (filters.tiers && filters.tiers.length && !filters.tiers.includes(d.tier ?? 9)) return false;
  if (filters.classes && filters.classes.length && !filters.classes.includes(d.cls)) return false;
  if (filters.clonality === "clonal" && d.subclonal) return false;
  if (filters.clonality === "subclonal" && !d.subclonal) return false;
  if (d.n < (filters.minCells || 0)) return false;
  const custom = (filters.genes || []).map((g) => g.toUpperCase());
  const lists = filters.lists || [];
  if (custom.length || lists.length) {
    const hit =
      (custom.length && d.genes.some((g) => custom.includes(g.toUpperCase()))) ||
      (lists.includes("oncokb") && d.inOncoKB) ||
      (lists.includes("gbm") && d.inGbm) ||
      (lists.includes("cgc") && d.inCgc === true);
    if (!hit) return false;
  }
  if (d.cls === "fusion" && filters.fusionSupport !== "any") {
    const dna = d.n > 0;
    const rna = Boolean(d.rnaCells);
    if (filters.fusionSupport === "dna" && !dna) return false;
    if (filters.fusionSupport === "rna" && !rna) return false;
    if (filters.fusionSupport === "both" && !(dna && rna)) return false;
  }
  return true;
}

/** The preset's entries that pass the filters (before add / remove). */
export function presetEntries(entries, selection = DEFAULT_SELECTION) {
  const test = PRESET_TEST[selection.preset] || PRESET_TEST.recommended;
  return entries.filter((d) => test(d) && passesFilters(d, selection.filters));
}

/** Entries shown: preset + filters, plus the added ones, minus the removed ones. */
export function selectDrivers(entries, selection = DEFAULT_SELECTION) {
  const add = new Set(selection.add || []);
  const remove = new Set(selection.remove || []);
  const base = new Set(presetEntries(entries, selection).map((d) => d.key));
  return entries.filter((d) => (base.has(d.key) || add.has(d.key)) && !remove.has(d.key));
}

/** A selection that shows exactly `keys` (picker change): the difference to the preset becomes add / remove. */
export function selectionForKeys(entries, selection, keys) {
  const want = new Set(keys);
  const known = new Set(entries.map((d) => d.key));
  const base = new Set(presetEntries(entries, selection).map((d) => d.key));
  return {
    ...selection,
    add: [...want].filter((k) => known.has(k) && !base.has(k)),
    remove: [...base].filter((k) => !want.has(k)),
  };
}

/** Toggle one entry (column header / drawer button). */
export function toggleKey(entries, selection, key) {
  const shown = new Set(selectDrivers(entries, selection).map((d) => d.key));
  if (shown.has(key)) shown.delete(key);
  else shown.add(key);
  return selectionForKeys(entries, selection, [...shown]);
}

/* ---- URL ---- */

const SEP = "~";
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Query parameters for a selection (only what differs from the default):
 * drvpreset, drvadd, drvrm (keys joined by ~), drvf (filters as k:v;k:v).
 */
export function serializeSelection(selection = DEFAULT_SELECTION) {
  const out = {};
  if (selection.preset && selection.preset !== DEFAULT_SELECTION.preset) out.drvpreset = selection.preset;
  if (selection.add?.length) out.drvadd = selection.add.join(SEP);
  if (selection.remove?.length) out.drvrm = selection.remove.join(SEP);
  const f = { ...DEFAULT_FILTERS, ...(selection.filters || {}) };
  const parts = [];
  if (f.tiers?.length) parts.push(`tier:${f.tiers.join(",")}`);
  if (f.lists?.length) parts.push(`lists:${f.lists.join(",")}`);
  if (f.genes?.length) parts.push(`genes:${f.genes.join(",")}`);
  if (f.classes?.length) parts.push(`class:${f.classes.join(",")}`);
  if (f.clonality !== "any") parts.push(`clonal:${f.clonality}`);
  if (f.minCells > 1) parts.push(`min:${f.minCells}`);
  if (f.fusionSupport !== "any") parts.push(`fusion:${f.fusionSupport}`);
  if (parts.length) out.drvf = parts.join(";");
  return out;
}

export const SELECTION_PARAMS = ["drvpreset", "drvadd", "drvrm", "drvf"];

/** Selection from URL search params; null when the link carries none. */
export function parseSelection(search = "") {
  const p = new URLSearchParams(search);
  if (!SELECTION_PARAMS.some((k) => p.has(k))) return null;
  const preset = p.get("drvpreset");
  const filters = { ...DEFAULT_FILTERS };
  `${p.get("drvf") || ""}`.split(";").filter(Boolean).forEach((part) => {
    const at = part.indexOf(":");
    const k = part.slice(0, at);
    const v = part.slice(at + 1);
    const list = v.split(",").filter(Boolean);
    if (k === "tier") filters.tiers = list.map(Number).filter(Number.isFinite);
    else if (k === "lists") filters.lists = list.filter((x) => DRIVER_GENE_LISTS.includes(x));
    else if (k === "genes") filters.genes = list;
    else if (k === "class") filters.classes = list.filter((x) => DRIVER_CLASSES.includes(x));
    else if (k === "clonal" && ["clonal", "subclonal"].includes(v)) filters.clonality = v;
    else if (k === "min" && Number(v) > 0) filters.minCells = Number(v);
    else if (k === "fusion" && FUSION_SUPPORT.includes(v)) filters.fusionSupport = v;
  });
  return {
    preset: DRIVER_PRESETS.includes(preset) ? preset : DEFAULT_SELECTION.preset,
    add: `${p.get("drvadd") || ""}`.split(SEP).filter(Boolean),
    remove: `${p.get("drvrm") || ""}`.split(SEP).filter(Boolean),
    filters,
  };
}

/** True when two selections are equal (ignoring key order of the filters). */
export const sameSelection = (a, b) => same(serializeSelection(a), serializeSelection(b));

/* ---- per-cell states ---- */

export const STATE = { NONE: 0, WT: 1, MUT: 2 };

/**
 * Per-cell state of one entry, aligned to `order`.
 *   snv: 0 no coverage, 1 WT, 2 mutant (carrier fallback when the site is not in snv_matrix)
 *   amp / homdel: total copy number at the event (NaN = no CN)
 *   fusion: bit 1 = DNA (carrier), bit 2 = RNA call
 *   complex: 1 carrier
 * @param ctx { order, snv, snvRows (Int32Array aligned to order), cn, cnRows (Int32Array), chromoBins }
 */
export function entryStates(entry, ctx) {
  const { order } = ctx;
  const out = new Float32Array(order.length);
  const carriers = new Set(entry.carriers);
  if (entry.cls === "snv") {
    const snv = ctx.snv;
    const c = entry.snvColumn;
    order.forEach((id, i) => {
      const p = ctx.snvRows ? ctx.snvRows[i] : -1;
      if (snv && c != null && p >= 0) {
        const s = snv.status[p][c];
        out[i] = s === 1 ? STATE.MUT : s === 0 ? STATE.WT : STATE.NONE;
      } else out[i] = carriers.has(id) ? STATE.MUT : STATE.NONE;
    });
  } else if (entry.cls === "amp" || entry.cls === "homdel") {
    const g = eventGlobalPosition(entry.event, ctx.chromoBins);
    order.forEach((id, i) => {
      const p = ctx.cnRows ? ctx.cnRows[i] : -1;
      const row = ctx.cn && p >= 0 ? ctx.cn.rows[p] : null;
      let v = NaN;
      if (row && Number.isFinite(g)) {
        const b = binAt(row.binIndex, g);
        if (b >= 0 && Number.isFinite(row.values[b])) v = row.values[b];
      }
      out[i] = v;
    });
  } else if (entry.cls === "fusion") {
    order.forEach((id, i) => {
      out[i] = (carriers.has(id) ? 1 : 0) + (entry.rnaCells?.has(id) ? 2 : 0);
    });
  } else {
    order.forEach((id, i) => {
      out[i] = carriers.has(id) ? 1 : 0;
    });
  }
  return out;
}

/** Cells a click on a column should select: the entry's carriers (CN calls: the cells with the event). */
export const carriersInOrder = (entry, order) => {
  const set = new Set(entry.carriers);
  return order.filter((id) => set.has(id));
};

/* ---- tree ---- */

/**
 * Branch where each entry arises: the node of the clade its carriers fit best
 * (F1 >= minFit). Returns Map(node -> [{ key, label }]); clonal events (root
 * stem) and scattered ones are left out.
 */
export function driverBranchMarks(entries, layout, { minFit = 0.5 } = {}) {
  const out = new Map();
  if (!layout?.nodes?.length) return out;
  entries.forEach((d) => {
    const fit = cladeFitScore(d.carriers, layout);
    if (!Number.isFinite(fit.score) || fit.score < minFit || fit.node == null) return;
    const node = layout.nodes[fit.node];
    if (!node || node.parent < 0) return;
    if (!out.has(fit.node)) out.set(fit.node, []);
    out.get(fit.node).push({ key: d.key, label: d.label, fit: fit.score });
  });
  return out;
}

/** Label drawn on the tree for the entries of one branch ("EGFR amp", "EGFR amp +2"). */
export const branchMarkText = (marks) => (marks.length > 1 ? `${marks[0].label} +${marks.length - 1}` : marks[0].label);
