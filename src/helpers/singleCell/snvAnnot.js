// Annotation tracks over the SNV matrix columns: per-site classes and metrics
// (tree mapping, SBS signature, region class, mean depth, alt fraction, driver,
// phylogeny consistency, CellPhy input, site QC), their legends, per-bin
// summaries for tooltips and the site filter a click on a track value sets.
// d3-free so it can be tested on synthetic fixtures.

const ARRAY_CACHE = new WeakMap();

/** Region classes, in legend order. */
export const REGION_CLASSES = [
  { key: "coding", label: "protein-coding exon", color: "#d62728" },
  { key: "utr", label: "UTR", color: "#ff7f0e" },
  { key: "ncrna", label: "non-coding RNA exon", color: "#9467bd" },
  { key: "intron", label: "intron (gene body)", color: "#4c78a8" },
  { key: "flank", label: "up/downstream of gene", color: "#9ecae9" },
  { key: "intergenic", label: "intergenic", color: "#bdbdbd" },
  { key: "other", label: "other", color: "#e0e0e0" },
];

/** Where a SnpEff/VEP consequence puts a site: coding / utr / ncrna / intron / flank / intergenic. */
export function regionClass(consequence) {
  const c = `${consequence || ""}`;
  if (!c) return null;
  if (/5_prime_UTR|3_prime_UTR/.test(c)) return "utr";
  if (/missense|synonymous|stop_gained|stop_lost|start_lost|frameshift|inframe|protein_altering|coding_sequence|start_retained|stop_retained/.test(c)) return "coding";
  if (/non_coding_transcript_exon/.test(c)) return "ncrna";
  if (/intron|splice_donor|splice_acceptor|splice_region/.test(c)) return "intron";
  if (/upstream_gene|downstream_gene/.test(c)) return "flank";
  if (/intergenic/.test(c)) return "intergenic";
  return "other";
}

/** True for classes inside a gene body (exon, UTR, ncRNA, intron). */
export const inGeneBody = (cls) => cls === "coding" || cls === "utr" || cls === "ncrna" || cls === "intron";

const SIGNATURE_COLORS = ["#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd", "#8c564b", "#e377c2", "#17becf", "#bcbd22", "#7f7f7f"];

const TREE_CATEGORIES = [
  { key: "truncal", label: "truncal", color: "#6a3d9a" },
  { key: "subclonal", label: "subclonal", color: "#ff7f00" },
  { key: "private", label: "private", color: "#33a02c" },
  { key: "outside_tumor", label: "outside tumour", color: "#8c8c8c" },
  { key: "unmapped", label: "unmapped", color: "#d9d9d9" },
  { key: "cn_mapped", label: "CN-mapped", color: "#1b9e9e" },
];

/** Track definitions: kind "cat" (classes) or "num" (continuous, with a [lo, hi] colour range). */
export const SNV_TRACKS = [
  { key: "category", kind: "cat", label: "Tree site", help: "Where the SNV maps on the tree" },
  { key: "driver", kind: "cat", label: "Driver", any: "driver", help: "OncoKB driver site" },
  { key: "signature", kind: "cat", label: "Signature", help: "Most probable SBS signature of the site's trinucleotide context, from the fit of the site's tree-site set (truncal / subclonal / private) when available, else the joint fit" },
  { key: "region", kind: "cat", label: "Region", help: "Region class from the consequence annotation" },
  { key: "depth", kind: "num", label: "Mean depth", help: "Mean read depth over cells with reads" },
  { key: "vaf", kind: "num", label: "Alt cells", help: "Fraction of called cells that carry the alt allele", range: [0, 1] },
  { key: "phylo", kind: "num", label: "Tree fit", help: "Best-clade F1 of the site on the current tree", range: [0, 1] },
  { key: "cellphy", kind: "cat", label: "CellPhy input", any: "yes", help: "Site was used by CellPhy to build the tree" },
  { key: "qc", kind: "num", label: "Site QC", help: "Site QC score (sum of log-odds)" },
  // per-site phylogeny fit on the current tree (helpers/singleCell/snvPhyloFit.js)
  { key: "prec", kind: "num", label: "Clade precision", help: "Carriers inside the best clade / all carriers (low = leaks outside the clade)", range: [0, 1], fit: "precision" },
  { key: "recall", kind: "num", label: "Clade recall", help: "Carriers / called cells in the best clade (low = ref calls inside the clade)", range: [0, 1], fit: "recall" },
  { key: "dropout", kind: "num", label: "Dropout in clade", help: "Fraction of called cells in the best clade that are ref", range: [0, 1], fit: "dropout" },
  { key: "outside", kind: "num", label: "Outside-clade carriers", help: "Carriers outside the best clade (leakage count)", fit: "outside" },
  { key: "changes", kind: "num", label: "Parsimony changes", help: "Fitch parsimony: minimum gains + losses on the tree (1 = perfectly compatible)", fit: "changes" },
  { key: "ci", kind: "num", label: "Consistency index", help: "1 / parsimony changes: 1 = compatible with the tree", range: [0, 1], fit: "ci" },
  // site QC fields (snv_qc.json), filter-only
  { key: "qnalt", kind: "num", label: "QC n_alt", help: "Site QC: cells with alt evidence", filterOnly: true, qcField: "qcNAlt" },
  { key: "qncov", kind: "num", label: "QC n_cov", help: "Site QC: cells with coverage", filterOnly: true, qcField: "qcNCov" },
  { key: "qfrac", kind: "num", label: "QC frac_informative", help: "Site QC: fraction of covered cells that are informative (0 to 1)", filterOnly: true, qcField: "qcFracInformative", range: [0, 1] },
  { key: "qvaf", kind: "num", label: "QC pooled alt VAF", help: "Site QC: pooled alt allele fraction (0 to 1)", filterOnly: true, qcField: "qcPooledVaf", range: [0, 1] },
  { key: "qcohq", kind: "num", label: "QC coh_q", help: "Site QC: cohort q-value (low = distinctive site)", filterOnly: true, qcField: "qcCohQ", range: [0, 1] },
  // filter-only keys (not drawn as tracks): set from the filter bar
  { key: "gene", kind: "cat", label: "Gene", help: "Gene symbol", filterOnly: true },
  { key: "carriers", kind: "num", label: "Alt cells (count)", help: "Number of cells carrying the alt allele", filterOnly: true },
];
export const DEFAULT_SNV_TRACKS = ["category", "driver"];
export const trackDef = (key) => SNV_TRACKS.find((t) => t.key === key) || null;

/** Per-site values that do not depend on the model or tree: region, depth, alt fraction. Cached per matrix. */
function baseArrays(snv) {
  const key = snv.depth || snv.status || snv.variants;
  const hit = key && ARRAY_CACHE.get(key);
  if (hit && hit.n === snv.variants.length) return hit;
  const n = snv.variants.length;
  const depthSum = new Float64Array(n);
  const depthN = new Int32Array(n);
  const called = new Int32Array(n);
  const alt = new Int32Array(n);
  const nCells = snv.status?.length || 0;
  for (let p = 0; p < nCells; p += 1) {
    const st = snv.status[p];
    const dp = snv.depth?.[p];
    for (let c = 0; c < n; c += 1) {
      const s = st[c];
      if (s < 0) continue;
      called[c] += 1;
      if (s === 1) alt[c] += 1;
      const d = dp ? dp[c] : NaN;
      if (Number.isFinite(d)) {
        depthSum[c] += d;
        depthN[c] += 1;
      }
    }
  }
  const depth = new Float32Array(n);
  const vaf = new Float32Array(n);
  for (let c = 0; c < n; c += 1) {
    depth[c] = depthN[c] ? depthSum[c] / depthN[c] : NaN;
    vaf[c] = called[c] ? alt[c] / called[c] : NaN;
  }
  const out = { n, depth, vaf, alt: Float32Array.from(alt), region: snv.variants.map((v) => regionClass(v.consequence)) };
  if (key && typeof key === "object") ARRAY_CACHE.set(key, out);
  return out;
}

/**
 * Annotations of every site.
 * @param snv { variants, status, depth }
 * @param opts.signatures { signature: string|null per variant, prob } from assignSignatures
 * @param opts.phylo Map(variant index -> F1) on the current tree; falls back to the exported clade score
 * @param opts.sigText (variant index) -> "SBS13 (APOBEC) 0.72 · SBS2 0.20 …, set: subclonal, fit: joint" for the tooltip
 */
export function siteAnnotations(snv, { signatures = null, phylo = null, fit = null, sigText = null } = {}) {
  if (!snv?.variants?.length) return null;
  const base = baseArrays(snv);
  const n = base.n;
  const phyloArr = new Float32Array(n).fill(NaN);
  const qc = new Float32Array(n).fill(NaN);
  let hasPhylo = false;
  let hasQc = false;
  snv.variants.forEach((v, c) => {
    const f = phylo ? phylo.get(c) : v.cladeScore;
    if (Number.isFinite(f)) {
      phyloArr[c] = f;
      hasPhylo = true;
    }
    if (Number.isFinite(v.sumLogodds)) {
      qc[c] = v.sumLogodds;
      hasQc = true;
    }
  });
  if (fit?.f1) {
    // computed on the same tree and called genotypes as the other fit metrics; sites with too few carriers stay unscored
    phyloArr.fill(NaN);
    hasPhylo = false;
    for (let c = 0; c < n; c += 1) if (Number.isFinite(fit.f1[c])) {
      phyloArr[c] = fit.f1[c];
      hasPhylo = true;
    }
  }
  const hasSig = Boolean(signatures?.signature?.some(Boolean));
  const cat = {
    category: snv.variants.map((v) => v.category || "unmapped"),
    driver: snv.variants.map((v) => (v.driver ? "driver" : "other")),
    region: base.region,
    signature: hasSig ? signatures.signature : null,
    cellphy: snv.variants.map((v) => (v.cellphyInput === true ? "yes" : v.cellphyInput === false ? "no" : null)),
    gene: snv.variants.map((v) => (v.gene && !/^ENSG/.test(v.gene) ? v.gene : null)),
  };
  const num = { depth: base.depth, vaf: base.vaf, phylo: hasPhylo ? phyloArr : null, qc: hasQc ? qc : null, carriers: base.alt };
  SNV_TRACKS.filter((t) => t.qcField).forEach((t) => {
    const arr = Float32Array.from(snv.variants, (v) => (Number.isFinite(v[t.qcField]) ? v[t.qcField] : NaN));
    num[t.key] = arr.some((x) => Number.isFinite(x)) ? arr : null;
  });
  SNV_TRACKS.filter((t) => t.fit).forEach((t) => {
    num[t.key] = fit?.[t.fit] && fit.n ? fit[t.fit] : null;
  });
  const hasCat = snv.variants.some((v) => v.category);
  const hasCellphy = cat.cellphy.some(Boolean);
  const available = SNV_TRACKS.filter((t) => !t.filterOnly).filter((t) => {
    if (t.key === "category") return hasCat;
    if (t.key === "cellphy") return hasCellphy;
    if (t.key === "region") return cat.region.some(Boolean);
    if (t.key === "driver") return snv.variants.some((v) => v.driver);
    return t.kind === "cat" ? Boolean(cat[t.key]) : Boolean(num[t.key]);
  }).map((t) => t.key);
  const sigProb = signatures?.prob || null;
  // signature classes ordered by prevalence so the commonest keep the first colours
  const sigCounts = {};
  if (cat.signature) cat.signature.forEach((s) => s && (sigCounts[s] = (sigCounts[s] || 0) + 1));
  const sigOrder = Object.keys(sigCounts).sort((a, b) => sigCounts[b] - sigCounts[a]);
  const ranges = {};
  Object.entries(num).forEach(([k, arr]) => {
    if (!arr) return;
    const def = trackDef(k);
    if (def.range) {
      ranges[k] = def.range;
      return;
    }
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < arr.length; i += 1) {
      if (!Number.isFinite(arr[i])) continue;
      if (arr[i] < lo) lo = arr[i];
      if (arr[i] > hi) hi = arr[i];
    }
    ranges[k] = Number.isFinite(lo) ? [lo, hi] : [0, 1];
  });
  return { n, cat, num, available, sigProb, sigOrder, ranges, variants: snv.variants, sigText };
}

/** Legend entries of a categorical track: [{ value, label, color, count }], commonest first for signatures. */
const LEGEND_CACHE = new WeakMap(); // annot.cat[key] array -> legend (colour lookups call this once per value)

export function catLegend(annot, key) {
  if (!annot || !annot.cat[key]) return [];
  const hit = LEGEND_CACHE.get(annot.cat[key]);
  if (hit && hit.sigOrder === annot.sigOrder) return hit.entries;
  const entries = catLegendUncached(annot, key);
  LEGEND_CACHE.set(annot.cat[key], { sigOrder: annot.sigOrder, entries });
  return entries;
}

function catLegendUncached(annot, key) {
  const counts = {};
  annot.cat[key].forEach((v) => v != null && (counts[v] = (counts[v] || 0) + 1));
  let entries;
  if (key === "category") entries = TREE_CATEGORIES.map((e) => ({ value: e.key, label: e.label, color: e.color }));
  else if (key === "region") entries = REGION_CLASSES.map((e) => ({ value: e.key, label: e.label, color: e.color }));
  else if (key === "driver") entries = [{ value: "driver", label: "driver", color: "#cf1322" }];
  else if (key === "cellphy")
    entries = [
      { value: "yes", label: "used by CellPhy", color: "#08519c" },
      { value: "no", label: "not used", color: "#d9d9d9" },
    ];
  else if (key === "signature")
    entries = annot.sigOrder.map((s, k) => ({ value: s, label: s, color: SIGNATURE_COLORS[k % SIGNATURE_COLORS.length] }));
  else entries = [];
  return entries.filter((e) => counts[e.value]).map((e) => ({ ...e, count: counts[e.value] }));
}

/** Colour of a categorical value ("#rrggbb" or css var). */
export function catColor(annot, key, value) {
  if (value == null) return null;
  const hit = catLegend(annot, key).find((e) => e.value === value);
  return hit ? hit.color : "#e0e0e0";
}

/** Colour ramp for numeric tracks: light to dark blue-green. t in [0, 1]. */
export function rampColor(t) {
  const x = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0));
  const a = [237, 248, 177];
  const b = [65, 182, 196];
  const c = [12, 44, 132];
  const mix = (p, q, f) => Math.round(p + (q - p) * f);
  const [lo, hi, f] = x < 0.5 ? [a, b, x * 2] : [b, c, (x - 0.5) * 2];
  return `rgb(${mix(lo[0], hi[0], f)},${mix(lo[1], hi[1], f)},${mix(lo[2], hi[2], f)})`;
}

export const numFraction = (annot, key, value) => {
  const [lo, hi] = annot.ranges[key] || [0, 1];
  return hi > lo ? (value - lo) / (hi - lo) : 0;
};

/**
 * Summary of a track over columnOrder[a..b): categorical -> { top, counts, n };
 * numeric -> { mean, min, max, n }. `any` tracks (driver, CellPhy) report the
 * flagged value when any site in the bin has it.
 */
export function binSummary(annot, key, columnOrder, a, b) {
  const def = trackDef(key);
  if (!annot || !def || a < 0) return null;
  if (def.kind === "cat") {
    const arr = annot.cat[key];
    if (!arr) return null;
    const counts = {};
    for (let i = a; i < b; i += 1) {
      const v = arr[columnOrder[i]];
      if (v != null) counts[v] = (counts[v] || 0) + 1;
    }
    const entries = Object.entries(counts).sort((p, q) => q[1] - p[1]);
    if (!entries.length) return { top: null, counts, n: b - a };
    const flagged = def.any && counts[def.any] ? def.any : entries[0][0];
    return { top: flagged, counts, n: b - a };
  }
  const arr = annot.num[key];
  if (!arr) return null;
  let sum = 0;
  let k = 0;
  let min = Infinity;
  let max = -Infinity;
  for (let i = a; i < b; i += 1) {
    const v = arr[columnOrder[i]];
    if (!Number.isFinite(v)) continue;
    sum += v;
    k += 1;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return k ? { mean: sum / k, min, max, n: b - a, valued: k } : { mean: NaN, n: b - a, valued: 0 };
}

const fmtNum = (x, digits = 2) => (Number.isFinite(x) ? (Math.abs(x) >= 100 ? x.toFixed(0) : x.toFixed(digits)) : "n/a");

/** Column (index into variants) of the first driver site in columnOrder[a, b), or -1. */
export function firstDriverColumn(annot, columnOrder, a, b) {
  if (!annot?.cat?.driver) return -1;
  for (let i = a; i < b; i += 1) if (annot.cat.driver[columnOrder[i]] === "driver") return columnOrder[i];
  return -1;
}

/** All annotations of one site as [label, text] rows (tooltip). */
export function siteDetail(annot, c) {
  if (!annot) return [];
  const v = annot.variants[c];
  const rows = [["Site", v.id]];
  if (v.gene) rows.push(["Gene", [v.gene, v.protein || v.consequence].filter(Boolean).join(" ")]);
  const lab = (key, value) => catLegend(annot, key).find((e) => e.value === value)?.label || value;
  if (annot.cat.category) rows.push(["Tree site", `${lab("category", annot.cat.category[c])}${v.cladeCells != null ? ` (${v.cladeCells} cells)` : ""}`]);
  if (annot.cat.signature) {
    const s = annot.cat.signature[c];
    const full = annot.sigText ? annot.sigText(c) : null;
    rows.push(["Signature", full ? `${full}${v.context ? `; ${v.context}` : ""}` : s ? `${s}${annot.sigProb ? ` (p=${fmtNum(annot.sigProb[c])})` : ""}${v.context ? `, ${v.context}` : ""}` : "no context"]);
  }
  if (annot.cat.region[c]) {
    const cls = annot.cat.region[c];
    rows.push(["Region", `${lab("region", cls)} (${inGeneBody(cls) ? "gene body" : "outside genes"})${v.consequence ? `; ${v.consequence}` : ""}`]);
  }
  if (annot.num.depth) rows.push(["Mean depth", fmtNum(annot.num.depth[c], 1)]);
  if (annot.num.carriers) rows.push(["Carriers", `${annot.num.carriers[c]} cells with the alt allele`]);
  if (annot.num.vaf) rows.push(["Alt fraction", fmtNum(annot.num.vaf[c] * 100, 1) + "% of called cells"]);
  if (annot.num.phylo) rows.push(["Tree fit (F1)", fmtNum(annot.num.phylo[c])]);
  if (annot.num.ci && Number.isFinite(annot.num.ci[c])) {
    rows.push(["Parsimony", `${annot.num.changes ? fmtNum(annot.num.changes[c], 0) : "?"} change(s), consistency index ${fmtNum(annot.num.ci[c])}`]);
    rows.push(["Clade precision / recall", `${fmtNum(annot.num.prec?.[c])} / ${fmtNum(annot.num.recall?.[c])} (${annot.num.outside ? fmtNum(annot.num.outside[c], 0) : "?"} carriers outside the clade, dropout ${fmtNum(annot.num.dropout?.[c])})`]);
  }
  if (v.driver || v.oncogenic) rows.push(["OncoKB", [v.oncogenic, v.oncokbLevel].filter(Boolean).join(" · ") || "driver"]);
  if (annot.cat.cellphy[c]) rows.push(["CellPhy input", annot.cat.cellphy[c] === "yes" ? "yes" : "no"]);
  if (annot.num.qc) rows.push(["Site QC", fmtNum(annot.num.qc[c])]);
  return rows;
}

/** Tooltip rows for a bin of columns: one site -> siteDetail; several -> count plus each selected track's summary. */
export function binDetail(annot, columnOrder, a, b, trackKeys) {
  if (!annot || a < 0) return [];
  if (b - a === 1) return siteDetail(annot, columnOrder[a]);
  const rows = [["Sites", `${b - a}`]];
  trackKeys.forEach((key) => {
    const def = trackDef(key);
    const s = binSummary(annot, key, columnOrder, a, b);
    if (!def || !s) return;
    if (def.kind === "cat") {
      const legend = catLegend(annot, key);
      // count of sites with the share of the bin's annotated sites (signature track: burden and percentage)
      const tot = Object.values(s.counts).reduce((acc, k) => acc + k, 0);
      const parts = Object.entries(s.counts)
        .sort((p, q) => q[1] - p[1])
        .slice(0, 4)
        .map(([value, k]) => `${legend.find((e) => e.value === value)?.label || value}: ${k}${tot > 0 ? ` (${Math.round((100 * k) / tot)}%)` : ""}`);
      rows.push([def.label, parts.join(" · ") || "n/a"]);
    } else rows.push([def.label, s.valued ? `mean ${fmtNum(s.mean)} (${fmtNum(s.min)} to ${fmtNum(s.max)})` : "n/a"]);
  });
  return rows;
}

/**
 * Site filter set by clicking track values:
 * { region: { values: ["intergenic"] }, depth: { min: 12 } } (categorical: values; numeric: min / max).
 * `category` filters go through the existing snvCategories.
 */
export function matchesAnnotFilter(annot, filter, c) {
  if (!filter || !annot) return true;
  return Object.entries(filter).every(([key, f]) => {
    if (!f) return true;
    if (annot.cat[key] !== undefined && trackDef(key)?.kind === "cat") {
      if (!f.values?.length) return true;
      const v = annot.cat[key] ? annot.cat[key][c] : null;
      return v != null && f.values.includes(v);
    }
    const arr = annot.num[key];
    if (!arr) return true;
    const x = arr[c];
    if (!Number.isFinite(x)) return key === "phylo" && !f.exclude; // unscored sites are kept by default (set exclude to drop them)
    return (f.min == null || x >= f.min) && (f.max == null || x <= f.max);
  });
}

export const hasAnnotFilter = (filter) => Boolean(filter && Object.values(filter).some((f) => f && (f.values?.length || f.min != null || f.max != null)));

/** Toggle a categorical value in the filter (returns a new filter, or null when empty). */
export function toggleValue(filter, key, value) {
  const cur = filter?.[key]?.values || [];
  const values = cur.includes(value) ? cur.filter((x) => x !== value) : [...cur, value];
  const next = { ...(filter || {}) };
  if (values.length) next[key] = { values };
  else delete next[key];
  return Object.keys(next).length ? next : null;
}

/** Set (or clear when the same) a numeric lower bound: click a value to keep sites at or above it. */
export function toggleMin(filter, key, min) {
  const cur = filter?.[key]?.min;
  const next = { ...(filter || {}) };
  if (cur != null && Math.abs(cur - min) < 1e-9) delete next[key];
  else next[key] = { min };
  return Object.keys(next).length ? next : null;
}

export function removeFilterKey(filter, key) {
  const next = { ...(filter || {}) };
  delete next[key];
  return Object.keys(next).length ? next : null;
}

/** Human text of one filter entry. */
export function describeFilter(annot, key, f) {
  const def = trackDef(key);
  if (!def || !f) return "";
  if (def.kind === "cat") {
    const legend = annot ? catLegend(annot, key) : [];
    return `${def.label}: ${(f.values || []).map((v) => legend.find((e) => e.value === v)?.label || v).join(", ")}`;
  }
  const parts = [];
  if (f.min != null && f.max != null) return `${def.label} ${fmtNum(f.min)} to ${fmtNum(f.max)}`;
  if (f.min != null) parts.push(`>= ${fmtNum(f.min)}${f.exclude ? " (unscored excluded)" : ""}`);
  if (f.max != null) parts.push(`<= ${fmtNum(f.max)}`);
  return `${def.label} ${parts.join(" and ")}`;
}

// ---- URL: sntracks=signature,region&snfilter=region:intron|flank;depth:>=12.5

export function serializeTracks(tracks, filter) {
  const params = {};
  if (tracks && tracks.length && tracks.join() !== DEFAULT_SNV_TRACKS.join()) params.sntracks = tracks.join(",");
  const parts = [];
  Object.entries(filter || {}).forEach(([key, f]) => {
    if (!f) return;
    if (f.values?.length) parts.push(`${key}:${f.values.join("|")}`);
    else if (f.min != null && f.max != null) parts.push(`${key}:${f.min}..${f.max}`);
    else if (f.min != null) parts.push(`${key}:>=${f.min}${f.exclude ? "x" : ""}`);
    else if (f.max != null) parts.push(`${key}:<=${f.max}`);
  });
  if (parts.length) params.snfilter = parts.join(";");
  return params;
}

export function parseTracks(search) {
  const params = new URLSearchParams(search);
  const tracks = (params.get("sntracks") || "").split(",").map((s) => s.trim()).filter((k) => trackDef(k));
  const filter = {};
  (params.get("snfilter") || "")
    .split(";")
    .filter(Boolean)
    .forEach((part) => {
      const at = part.indexOf(":");
      const key = part.slice(0, at);
      const def = trackDef(key);
      if (!def || at < 0) return;
      const rest = part.slice(at + 1);
      if (def.kind === "cat") filter[key] = { values: rest.split("|").filter(Boolean) };
      else if (/^-?[\d.]+\.\.-?[\d.]+$/.test(rest)) {
        const [lo, hi] = rest.split("..").map(Number);
        filter[key] = { min: lo, max: hi };
      } else if (rest.startsWith(">=") && Number.isFinite(Number(rest.replace(/x$/, "").slice(2)))) {
        filter[key] = { min: Number(rest.replace(/x$/, "").slice(2)), ...(rest.endsWith("x") ? { exclude: true } : {}) };
      }
      else if (rest.startsWith("<=") && Number.isFinite(Number(rest.slice(2)))) filter[key] = { max: Number(rest.slice(2)) };
    });
  return { tracks: tracks.length ? tracks : null, filter: Object.keys(filter).length ? filter : null };
}

/** The numeric value a click on a numeric bin filters at (its mean, rounded for the label). */
export const clickThreshold = (mean) => (Number.isFinite(mean) ? Number(mean.toPrecision(3)) : null);

/** Set (or clear when both bounds are null) a numeric range filter. */
export function setRange(filter, key, min, max) {
  const next = { ...(filter || {}) };
  if (min == null && max == null) delete next[key];
  else next[key] = { ...(min != null ? { min } : {}), ...(max != null ? { max } : {}) };
  return Object.keys(next).length ? next : null;
}

/** Replace the values of a categorical filter (empty clears it). */
export function setValues(filter, key, values) {
  const next = { ...(filter || {}) };
  if (!values || !values.length) delete next[key];
  else next[key] = { values };
  return Object.keys(next).length ? next : null;
}

// ---- the whole site-filter state in the URL (tracks, track filters, tree-site,
// drivers, CellPhy, clade score, label mode, missing colour, isolate)

export const SITE_URL_PARAMS = ["sntracks", "snfilter", "sncat", "sndrv", "sncp", "snf1", "snlabel", "snna", "snisolate", "snhide", "snleg", "sigfit", "sigcand"];
const LABEL_VALUES = ["gene", "protein", "position", "none"];

export function serializeSiteState(layout) {
  const l = layout || {};
  const params = serializeTracks(l.snvTracks, l.snvAnnotFilter);
  if (l.snvCategories?.length) params.sncat = l.snvCategories.join(",");
  if (l.snvDriversOnly) params.sndrv = "1";
  if (l.snvCellphyOnly) params.sncp = "1";
  if (l.snvMinCladeScore > 0) params.snf1 = `${l.snvMinCladeScore}`;
  if (l.snvLabel && l.snvLabel !== "protein") params.snlabel = l.snvLabel;
  if (l.snvNaColor === "grey") params.snna = "grey"; // white is the default
  if (l.snvIsolate) params.snisolate = "1";
  if (l.snvFiltersHidden) params.snhide = "1";
  if (l.snvLegendHidden) params.snleg = "0";
  if (l.sigFit === "legacy" || l.sigFit === "joint") params.sigfit = l.sigFit; // the Signatures-tab fit switch, shared with the Signature track
  if (l.sigCandidates) params.sigcand = "1";
  return params;
}

/** Layout patch from a link's query string (only keys present). */
export function parseSiteState(search) {
  const params = new URLSearchParams(search);
  const patch = {};
  const link = parseTracks(search);
  if (link.tracks) patch.snvTracks = link.tracks;
  if (link.filter) patch.snvAnnotFilter = link.filter;
  const cats = (params.get("sncat") || "").split(",").filter(Boolean);
  if (cats.length) patch.snvCategories = cats;
  if (params.get("sndrv") === "1") patch.snvDriversOnly = true;
  if (params.get("sncp") === "1") patch.snvCellphyOnly = true;
  const f1 = Number(params.get("snf1"));
  if (f1 > 0) patch.snvMinCladeScore = f1;
  if (LABEL_VALUES.includes(params.get("snlabel"))) patch.snvLabel = params.get("snlabel");
  if (params.get("snna") === "grey") patch.snvNaColor = "grey";
  else if (params.get("snna") === "white") patch.snvNaColor = null; // older links: white, now the default
  if (params.get("snisolate") === "1") patch.snvIsolate = true;
  if (params.get("snhide") === "1") patch.snvFiltersHidden = true;
  if (params.get("snleg") === "0") patch.snvLegendHidden = true;
  if (["joint", "legacy"].includes(params.get("sigfit"))) patch.sigFit = params.get("sigfit");
  if (params.get("sigcand") === "1") patch.sigCandidates = true;
  return patch;
}

/** Threshold a click at fraction f (0..1) along a ramp over [lo, hi] selects: the value rounded to 3 significant digits. */
export function valueAtFraction(range, f) {
  const [lo, hi] = range || [0, 1];
  const x = lo + Math.max(0, Math.min(1, f)) * (hi - lo);
  return Number(x.toPrecision(3));
}

/** Fraction along a ramp over [lo, hi] of a threshold (for the marker). */
export const fractionOfValue = (range, x) => {
  const [lo, hi] = range || [0, 1];
  return hi > lo ? Math.max(0, Math.min(1, (x - lo) / (hi - lo))) : 0;
};

/** Finite [min, max] of a numeric array (null when none). */
export function finiteRange(arr) {
  if (!arr) return null;
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < arr.length; i += 1) {
    const x = arr[i];
    if (!Number.isFinite(x)) continue;
    if (x < lo) lo = x;
    if (x > hi) hi = x;
  }
  return Number.isFinite(lo) ? [lo, hi] : null;
}
