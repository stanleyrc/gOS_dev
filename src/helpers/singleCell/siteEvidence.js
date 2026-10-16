// Single-site mutation evidence for the Single-Cell Evidence tab: "is this mutation real, and in which cells?"
//
// Inputs (precompute outputs, read-only):
//   region_calls.json  sites (pooled caller counts, normal-cell error), per-cell alt / depth / call
//   site_evidence.json per-site pooled counts by strand under three read filters (all / caller / strict),
//                      base quality and read-end distance of alt vs ref reads, per-read rows for the main
//                      sites, and the same site in the other patients (cohort panel of normals).
// Everything here is d3-free so it can be unit tested.

/** Known sites: one-line significance shown above the evidence. Keyed by "chrom:pos:REF>ALT" (hg38, + strand). */
export const SITE_ANNOTATIONS = {
  "chr5:1295113:G>A": {
    name: "TERT C228T",
    gene: "TERT",
    where: "TERT promoter, −124 bp from the ATG (C>T on the minus strand)",
    note:
      "The commonest TERT promoter hotspot: creates an ETS/GABP binding site that re-activates TERT; present in ~70–80% of IDH-wild-type glioblastomas and mutually exclusive with C250T.",
  },
  "chr5:1295135:G>A": {
    name: "TERT C250T",
    gene: "TERT",
    where: "TERT promoter, −146 bp from the ATG (C>T on the minus strand)",
    note: "Second TERT promoter hotspot (creates an ETS site); mutually exclusive with C228T in glioblastoma.",
  },
  "chr2:208248388:C>G": { name: "IDH1 R132H", gene: "IDH1", where: "IDH1 exon 4", note: "Defines IDH-mutant glioma; not expected in IDH-wild-type glioblastoma." },
  "chr2:208248389:G>A": { name: "IDH1 R132C", gene: "IDH1", where: "IDH1 exon 4", note: "IDH1 R132 non-canonical hotspot; defines IDH-mutant glioma." },
  "chr1:226064434:A>G": { name: "H3-3A K27M", gene: "H3-3A", where: "H3F3A", note: "Diffuse midline glioma, H3 K27-altered; rare in adult hemispheric GBM." },
  "chr1:226064454:G>A": { name: "H3-3A G34R", gene: "H3-3A", where: "H3F3A", note: "Diffuse hemispheric glioma, H3 G34-mutant." },
  "chr1:226064455:G>T": { name: "H3-3A G34V", gene: "H3-3A", where: "H3F3A", note: "Diffuse hemispheric glioma, H3 G34-mutant." },
  "chr7:140753336:A>T": { name: "BRAF V600E", gene: "BRAF", where: "BRAF exon 15", note: "MAPK activating; epithelioid GBM / PXA; targetable." },
  "chr10:87933147:C>T": { name: "PTEN R130*", gene: "PTEN", where: "PTEN exon 5 (phosphatase domain)", note: "Recurrent truncating PTEN hotspot; loss of PTEN activates PI3K signalling in ~30–40% of GBM." },
  "chr10:87933148:G>A": { name: "PTEN R130Q", gene: "PTEN", where: "PTEN exon 5 (phosphatase domain)", note: "Recurrent phosphatase-dead PTEN hotspot." },
  "chr3:179218303:G>A": { name: "PIK3CA E545K", gene: "PIK3CA", where: "PIK3CA helical domain", note: "Activating PI3K hotspot." },
  "chr3:179234297:A>G": { name: "PIK3CA H1047R", gene: "PIK3CA", where: "PIK3CA kinase domain", note: "Activating PI3K hotspot." },
};

// Genes whose point mutations are notable in glioblastoma (ranking boost for discovered sites).
const GBM_GENES = new Set(["TERT", "PTEN", "TP53", "NF1", "EGFR", "PIK3CA", "PIK3R1", "RB1", "ATRX", "IDH1", "IDH2", "H3-3A", "BRAF", "PDGFRA", "CDKN2A", "MDM2", "CDK4", "SETD2", "LZTR1", "STAG2"]);

export const PRESET_LABELS = {
  caller: "caller filter (MAPQ ≥ 20, BQ ≥ 13, no duplicates)",
  strict: "strict (MAPQ ≥ 50, BQ ≥ 20, ≥ 10 bp from read ends)",
  all: "all reads (incl. duplicates, MAPQ 0)",
};

export const VERDICTS = {
  supported: { label: "Supported", color: "green", rank: 0 },
  weak: { label: "Weak", color: "gold", rank: 1 },
  artefact: { label: "Artefact-like", color: "volcano", rank: 3 },
  germline: { label: "Germline-like", color: "purple", rank: 4 },
  absent: { label: "Not detected", color: "default", rank: 5 },
  uninformative: { label: "Too few reads", color: "default", rank: 6 },
};

const isNormalClone = (c) => /^normal$/i.test(`${c ?? ""}`);

// ---- statistics -------------------------------------------------------------------------------------------

function logChoose(n, k) {
  return lgamma(n + 1) - lgamma(k + 1) - lgamma(n - k + 1);
}
// Lanczos log-gamma
function lgamma(x) {
  const g = 7;
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
  x -= 1;
  let a = c[0];
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i += 1) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}
const LN10 = Math.log(10);
const logSumExp = (arr) => {
  const m = Math.max(...arr);
  if (!Number.isFinite(m)) return m;
  return m + Math.log(arr.reduce((s, v) => s + Math.exp(v - m), 0));
};

/** log10 P(X >= k), X ~ Binomial(n, p). 0 when k <= 0. */
export function log10BinomUpper(k, n, p) {
  if (k <= 0) return 0;
  if (k > n) return -Infinity;
  if (p <= 0) return -Infinity;
  if (p >= 1) return 0;
  // sum upward from k; terms past the mode shrink geometrically, so stop once they are negligible
  const terms = [];
  let best = -Infinity;
  for (let i = k; i <= n; i += 1) {
    const t = logChoose(n, i) + i * Math.log(p) + (n - i) * Math.log1p(-p);
    terms.push(t);
    if (t > best) best = t;
    else if (t < best - 40) break;
  }
  return Math.min(0, logSumExp(terms) / LN10);
}

/**
 * One-sided Fisher exact test that group A has a higher alt fraction than group B:
 * log10 P(alt in A >= aAlt | margins). a = [alt, ref], b = [alt, ref].
 */
export function log10FisherGreater(a, b) {
  const [a1, a0] = a;
  const [b1, b0] = b;
  const nA = a1 + a0;
  const nAlt = a1 + b1;
  const N = nA + b1 + b0;
  if (!nA || !nAlt || nA === N) return 0;
  const hi = Math.min(nA, nAlt);
  const terms = [];
  let best = -Infinity;
  for (let x = a1; x <= hi; x += 1) {
    const t = logChoose(nAlt, x) + logChoose(N - nAlt, nA - x) - logChoose(N, nA);
    terms.push(t);
    if (t > best) best = t;
    else if (t < best - 40) break;
  }
  return Math.min(0, logSumExp(terms) / LN10);
}

/** Two-sided-ish strand balance of alt reads: log10 P(min strand <= observed | Binomial(n, 0.5)), doubled. */
export function log10StrandImbalance(f, r) {
  const n = f + r;
  if (!n) return 0;
  const k = Math.min(f, r);
  const terms = [];
  for (let i = 0; i <= k; i += 1) terms.push(logChoose(n, i) + n * Math.log(0.5));
  return Math.min(0, (logSumExp(terms) + Math.log(2)) / LN10);
}

/** "1e-12" style string for a log10 p. */
export function fmtLog10P(l) {
  if (l == null || Number.isNaN(l)) return "–";
  if (l === -Infinity || l < -300) return "< 1e-300";
  if (l > -2) return (10 ** l).toFixed(l > -1 ? 2 : 3);
  const e = Math.floor(l);
  const m = 10 ** (l - e);
  return `${m.toFixed(1)}e${e}`;
}

// ---- site assembly ----------------------------------------------------------------------------------------

/** Site record from region_calls + site_evidence + annotation table. */
export function annotateSite(site, ev) {
  const ann = SITE_ANNOTATIONS[site?.id] || null;
  const gene = ann?.gene || site?.gene || ev?.gene || null;
  const name = ann?.name || site?.name || (gene ? `${gene} ${site.ref}>${site.alt}` : `${site.ref}>${site.alt}`);
  return {
    id: site.id,
    chrom: site.chrom,
    pos: site.pos,
    ref: site.ref,
    alt: site.alt,
    name,
    gene,
    // curated hotspot (region-set config or the annotation table) vs an SNV carried over from the filtered events
    hotspot: !!((site.hotspot && (!site.source || site.source === "config")) || ann),
    configured: !!site.hotspot && (!site.source || site.source === "config"),
    eventTier: /tier\s*(\d)/i.test(`${site.source || ""}`) ? +`${site.source}`.match(/tier\s*(\d)/i)[1] : null,
    where: ann?.where || null,
    note: ann?.note || null,
    gbmGene: gene ? GBM_GENES.has(gene) : false,
  };
}

const emptyGroup = () => ({ alt: 0, ref: 0, dp: 0, altF: null, altR: null, refF: null, refR: null, cellsAlt: 0, cellsCov: 0 });

/** Pooled tumour / normal counts for a site under a read filter preset; falls back to the caller's totals. */
export function pooledCounts(site, ev, preset = "caller") {
  const p = ev?.presets?.[preset];
  if (p) {
    const g = (x) => ({
      alt: x.alt_f + x.alt_r,
      ref: x.ref_f + x.ref_r,
      dp: x.alt_f + x.alt_r + x.ref_f + x.ref_r,
      altF: x.alt_f,
      altR: x.alt_r,
      refF: x.ref_f,
      refR: x.ref_r,
      other: x.other,
      del: x.del,
      cellsAlt: x.cells_alt,
      cellsCov: x.cells_cov,
    });
    return { source: preset, tumor: g(p.tumor), normal: g(p.normal), bqAlt: p.bq_alt, bqRef: p.bq_ref, endAlt: p.end_alt, endRef: p.end_ref };
  }
  const t = emptyGroup();
  const n = emptyGroup();
  if (site) {
    Object.assign(t, { alt: site.alt_tumor || 0, dp: site.dp_tumor || 0, ref: (site.dp_tumor || 0) - (site.alt_tumor || 0), cellsAlt: site.cells_alt || 0, cellsCov: site.cells_cov || 0 });
    Object.assign(n, { alt: site.alt_normal || 0, dp: site.dp_normal || 0, ref: (site.dp_normal || 0) - (site.alt_normal || 0) });
  }
  return { source: "calls", tumor: t, normal: n, bqAlt: null, bqRef: null, endAlt: null, endRef: null };
}

/**
 * The same site in other patients: carriers (>= 2 mutant cells and VAF >= 10%) and non-carriers, whose pooled
 * alt / depth is the cross-patient background (systematic artefacts recur in every patient; somatic hotspots don't).
 */
export function cohortBackground(ev) {
  const rows = (ev?.cohort || []).map((r) => {
    const dp = (r.dp_tumor || 0) + (r.dp_normal || 0);
    const alt = (r.alt_tumor || 0) + (r.alt_normal || 0);
    const vaf = r.dp_tumor ? (r.alt_tumor || 0) / r.dp_tumor : null;
    return { patient: r.patient, alt, dp, vaf, nMut: r.n_mut || 0, carrier: (r.n_mut || 0) >= 2 && vaf != null && vaf >= 0.1 };
  });
  const non = rows.filter((r) => !r.carrier);
  return {
    rows,
    carriers: rows.filter((r) => r.carrier).map((r) => r.patient),
    alt: non.reduce((s, r) => s + r.alt, 0),
    dp: non.reduce((s, r) => s + r.dp, 0),
    nPatients: non.length,
  };
}

/** Per-cell rows for a site from region_calls (caller-filtered reads): { id, clone, alt, dp, call, p, miss }. */
export function siteCells(calls, siteId, cloneOf = new Map()) {
  const v = calls?.dna?.[siteId];
  if (!v) return [];
  return (calls.cells || []).map((id, k) => ({
    id: `${id}`,
    clone: cloneOf.get(`${id}`) ?? calls.clone?.[k] ?? "unassigned",
    alt: v.alt?.[k] ?? 0,
    dp: v.dp?.[k] ?? 0,
    call: v.call?.[k] ?? "nc",
    p: v.p?.[k] ?? null,
    miss: v.miss?.[k] ?? null,
  }));
}

/**
 * Cells laid out by clone in tree (display) order: [{ clone, normal, cells: [...], n, covered, carriers, alt, dp }].
 * Clones in order of first appearance in `order`; cells missing from `order` go last.
 */
export function cloneLanes(cellRows, order = []) {
  const rank = new Map(order.map((id, i) => [`${id}`, i]));
  const sorted = [...cellRows].sort((a, b) => (rank.get(a.id) ?? 1e9) - (rank.get(b.id) ?? 1e9) || a.id.localeCompare(b.id));
  const lanes = new Map();
  sorted.forEach((c) => {
    if (!lanes.has(c.clone)) lanes.set(c.clone, { clone: c.clone, normal: isNormalClone(c.clone), cells: [], n: 0, covered: 0, carriers: 0, alt: 0, dp: 0 });
    const l = lanes.get(c.clone);
    l.cells.push(c);
    l.n += 1;
    if (c.dp > 0) l.covered += 1;
    if (c.alt > 0) l.carriers += 1;
    l.alt += c.alt;
    l.dp += c.dp;
  });
  // normals last, so the tumour clones read top-down in tree order
  return [...lanes.values()].sort((a, b) => Number(a.normal) - Number(b.normal));
}

/**
 * Statistics behind the verdict. `opts.preset` picks the read filter for pooled counts (strand / BQ need
 * site_evidence.json). Error model: the larger of the caller's normal-cell error and the cross-patient
 * background (non-carrier patients, + 0.5 pseudocount).
 */
export function siteStats(site, ev, cellRows = [], { preset = "caller" } = {}) {
  const pooled = pooledCounts(site, ev, preset);
  const { tumor, normal } = pooled;
  const cohort = cohortBackground(ev);
  const callerError = site?.error ?? 1e-3;
  const bgRate = cohort.dp >= 10 ? (cohort.alt + 0.5) / (cohort.dp + 1) : null;
  const errorRate = Math.max(callerError, bgRate ?? 0, 1e-4);
  const tumourCells = cellRows.filter((c) => !isNormalClone(c.clone));
  const normalCells = cellRows.filter((c) => isNormalClone(c.clone));
  const carriers = tumourCells.filter((c) => c.alt > 0);
  const clones = new Map();
  tumourCells.forEach((c) => {
    if (!clones.has(c.clone)) clones.set(c.clone, { n: 0, covered: 0, carriers: 0 });
    const e = clones.get(c.clone);
    e.n += 1;
    if (c.dp > 0) e.covered += 1;
    if (c.alt > 0) e.carriers += 1;
  });
  // carrier cells only: a subclone's alt reads are diluted by the non-carrier tumour cells in the pooled VAF,
  // so the normal-cell check compares normals against the cells that actually show the alt allele
  const carrier = carriers.reduce((a, c) => ({ alt: a.alt + c.alt, dp: a.dp + c.dp }), { alt: 0, dp: 0 });
  carrier.ref = Math.max(0, carrier.dp - carrier.alt);
  const tVaf = tumor.dp ? tumor.alt / tumor.dp : null;
  const nVaf = normal.dp ? normal.alt / normal.dp : null;
  return {
    preset: pooled.source,
    tumor,
    normal,
    tVaf,
    nVaf,
    callerError,
    bgRate,
    errorRate,
    cohort,
    log10pError: log10BinomUpper(tumor.alt, tumor.dp, errorRate),
    log10pNormal: log10FisherGreater([tumor.alt, tumor.ref], [normal.alt, normal.ref]),
    carrier: { ...carrier, vaf: carrier.dp ? carrier.alt / carrier.dp : null },
    // carrier cells vs normal cells (null without per-cell calls)
    log10pCarrierNormal: carrier.dp ? log10FisherGreater([carrier.alt, carrier.ref], [normal.alt, normal.ref]) : null,
    // chance the normals would show this few alt reads if they carried the tumour's VAF
    log10pNormalsClean: tVaf != null && normal.dp ? log10BinomLower(normal.alt, normal.dp, tVaf) : null,
    strand: tumor.altF == null ? null : { f: tumor.altF, r: tumor.altR, refF: tumor.refF, refR: tumor.refR, log10p: log10StrandImbalance(tumor.altF, tumor.altR) },
    bqAlt: pooled.bqAlt,
    bqRef: pooled.bqRef,
    endAlt: pooled.endAlt,
    endRef: pooled.endRef,
    nTumourCells: tumourCells.length,
    nNormalCells: normalCells.length,
    coveredTumour: tumourCells.filter((c) => c.dp > 0).length,
    coveredNormal: normalCells.filter((c) => c.dp > 0).length,
    carrierCells: carriers.length,
    normalCarriers: normalCells.filter((c) => c.alt > 0).length,
    clonality: clonality(tumourCells, tVaf),
    clonesWithCarriers: [...clones.entries()].filter(([, e]) => e.carriers > 0).map(([k]) => k),
    clonesCovered: [...clones.entries()].filter(([, e]) => e.covered > 0).map(([k]) => k),
    // power: chance of zero alt reads in the tumour if the site were a clonal het (VAF 0.5) or a 25% subclone
    log10pMissClonal: tumor.dp ? tumor.dp * Math.log10(0.5) : null,
    log10pMissSubclonal: tumor.dp ? tumor.dp * Math.log10(1 - 0.125) : null,
    reads: ev ? { total: ev.n_reads, dup: ev.n_dup, lowMq: ev.n_lowmq, unassigned: ev.n_unassigned, sampleEvery: ev.sample_every || 1 } : null,
  };
}

/**
 * Carrier cells expected if every covered tumour cell carried the mutation at the pooled VAF v: a cell with d reads
 * shows an alt read with probability 1 - (1 - v)^d. observed / expected estimates the fraction of tumour cells that
 * carry it (dropout-aware: a covered cell without alt reads is not counted as wild type).
 */
export function clonality(tumourCells = [], v) {
  if (v == null || v <= 0) return null;
  const covered = tumourCells.filter((c) => c.dp > 0);
  const expected = covered.reduce((sum, c) => sum + 1 - (1 - Math.min(v, 0.999)) ** c.dp, 0);
  const observed = covered.filter((c) => c.alt > 0).length;
  if (!expected) return null;
  return { observed, expected, fraction: Math.min(1, observed / expected) };
}

/** log10 P(X <= k), X ~ Binomial(n, p). */
export function log10BinomLower(k, n, p) {
  if (k >= n) return 0;
  if (p <= 0) return 0;
  if (p >= 1) return -Infinity;
  const terms = [];
  for (let i = 0; i <= k; i += 1) terms.push(logChoose(n, i) + i * Math.log(p) + (n - i) * Math.log1p(-p));
  return Math.min(0, logSumExp(terms) / LN10);
}

// short reasons for the findings list
const CONCERN = {
  signal: "weak signal over the error rate",
  cells: "fewer than 3 carrier cells",
  normal: "normal cells carry it at a similar rate or carry stray alt reads",
  cohort: "recurs in patients without the mutation",
  strand: "alt reads on one strand",
  bq: "alt bases have low base quality",
  end: "alt bases sit at read ends",
  vaf: "low VAF spread over many cells (error pattern of amplified regions)",
};

const pct = (x) => (x == null ? "–" : `${Math.round(100 * x)}%`);

/**
 * Verdict and the checks behind it. Each check: { key, status: "pass" | "fail" | "warn" | "na", text }.
 *   supported      tumour alt reads far above the error model (p < 1e-6), >= 3 carrier cells, no failed check
 *   weak           above background but few reads / cells, or a warning
 *   artefact-like  a failed artefact check (normal cells or other patients carry it at a similar rate,
 *                  single-strand, low base quality, read ends)
 *   germline-like  normal cells carry it at a germline-like VAF
 *   not detected   no alt reads with enough depth to have seen a clonal het
 *   too few reads  no / almost no coverage
 */
export function siteVerdict(stats) {
  const s = stats;
  const checks = [];
  const t = s.tumor;
  const n = s.normal;
  const sig = s.log10pError <= -6;
  const nominal = s.log10pError <= -2;

  // 1. tumour signal vs error
  checks.push({
    key: "signal",
    status: t.alt === 0 ? "na" : sig ? "pass" : nominal ? "warn" : "fail",
    text:
      t.alt === 0
        ? `No alt reads among ${t.dp} tumour reads`
        : `Tumour cells: ${t.alt} alt of ${t.dp} reads (VAF ${pct(s.tVaf)}) vs error ${(100 * s.errorRate).toFixed(2)}% — binomial p = ${fmtLog10P(s.log10pError)}`,
  });
  // 2. carrier cells
  checks.push({
    key: "cells",
    status: t.alt === 0 ? "na" : s.carrierCells >= 3 ? "pass" : "warn",
    text: `${s.carrierCells} carrier cells of ${s.coveredTumour} covered tumour cells (${s.nTumourCells - s.coveredTumour} of ${s.nTumourCells} have no reads: dropout)${
      s.clonesWithCarriers.length ? `; in ${s.clonesWithCarriers.length} of ${s.clonesCovered.length} covered clones` : ""
    }`,
  });
  if (s.clonality && t.alt > 0 && s.carrierCells >= 3 && s.tVaf >= 0.05) {
    const c = s.clonality;
    const clonal = c.fraction >= 0.8;
    checks.push({
      key: "clonality",
      status: "info",
      text: `Clonality: ${c.observed} carriers vs ${c.expected.toFixed(0)} expected if every covered tumour cell carried it at VAF ${pct(s.tVaf)} → in ~${Math.round(
        100 * c.fraction
      )}% of tumour cells (${clonal ? "clonal / truncal" : "subclonal"}); covered cells without alt reads are what sampling one or two reads of a heterozygous site gives`,
    });
  }
  // 3. normal cells
  let normalStatus = "na";
  let normalText = `Normal cells: no reads (${s.nNormalCells} normal cells)`;
  if (n.dp > 0) {
    const germ = s.nVaf >= 0.2 && n.alt >= 2;
    const similar = n.alt > 0 && s.log10pNormal > -1.3;
    // A subclone's pooled VAF is diluted by the non-carrier tumour cells, so stray normal reads look "similar". Where the pooled
    // test would fail, compare the normals with the carrier cells instead: a significant difference downgrades fail to warn. Only for sites
    // already above the error model (p < 0.01) with >= 3 carrier cells (carriers are picked for having alt reads, which flatters weak sites).
    const carrierSep = similar && !germ && nominal && s.carrierCells >= 3 && s.log10pCarrierNormal != null && s.log10pCarrierNormal < -1.3;
    normalStatus = germ ? "germline" : carrierSep ? "warn" : similar ? "fail" : t.alt > 0 && s.log10pNormal > -1.3 ? "na" : "pass";
    normalText = `Normal cells: ${n.alt} alt of ${n.dp} reads${n.alt ? ` (VAF ${pct(s.nVaf)})` : ""} in ${s.coveredNormal} covered cells${
      t.alt ? ` — tumour > normal, Fisher p = ${fmtLog10P(s.log10pNormal)}` : ""
    }${normalStatus === "na" ? " (too few normal reads to separate)" : ""}`;
    if (carrierSep)
      normalText += `; carrier cells ${s.carrier.alt}/${s.carrier.dp} reads (VAF ${pct(s.carrier.vaf)}) > normals, Fisher p = ${fmtLog10P(s.log10pCarrierNormal)} — ${
        n.alt === 1 ? "1 alt read in normal cells (possible misassigned tumour cell / index hopping)" : `${n.alt} alt reads in normal cells (possible misassigned tumour cells / index hopping)`
      }`;
    else if (similar && s.carrier?.dp) normalText += `; carrier cells ${s.carrier.alt}/${s.carrier.dp} reads (VAF ${pct(s.carrier.vaf)}), Fisher p = ${fmtLog10P(s.log10pCarrierNormal)}: not separable from normals`;
  }
  checks.push({ key: "normal", status: normalStatus === "germline" ? "fail" : normalStatus, text: normalText, germline: normalStatus === "germline" });
  // 4. other patients
  const c = s.cohort;
  if (c.rows.length) {
    const bgVaf = c.dp ? c.alt / c.dp : null;
    const recurrent = c.dp >= 10 && bgVaf != null && s.tVaf != null && t.alt > 0 && bgVaf >= 0.25 * s.tVaf && c.alt >= 2;
    checks.push({
      key: "cohort",
      status: t.alt === 0 ? "na" : recurrent ? "fail" : c.dp < 10 ? "warn" : "pass",
      text: `Other patients without it: ${c.alt} alt of ${c.dp} reads in ${c.nPatients} patient${c.nPatients === 1 ? "" : "s"}${
        c.carriers.length ? `; also mutant in ${c.carriers.join(", ")}` : ""
      }`,
    });
  }
  // 5. strand
  if (s.strand && t.alt > 0) {
    const { f, r } = s.strand;
    const oneStrand = t.alt >= 6 && Math.min(f, r) === 0;
    // with tens of thousands of reads a 46/54 split is statistically "significant" but harmless: also require a real skew (minor strand < 20% of alt reads)
    const biased = t.alt >= 6 && s.strand.log10p < -3 && Math.min(f, r) / (f + r) < 0.2;
    checks.push({
      key: "strand",
      status: oneStrand ? "fail" : biased ? "warn" : "pass",
      text: `Alt reads on both strands: ${f} forward / ${r} reverse${biased || oneStrand ? ` (imbalance p = ${fmtLog10P(s.strand.log10p)})` : ""}`,
    });
  }
  // 6. base quality and read position
  if (s.bqAlt != null && s.bqRef != null && t.alt > 0) {
    const low = s.bqAlt < s.bqRef - 8;
    const refLow = s.bqRef < s.bqAlt - 8;
    checks.push({
      key: "bq",
      status: low ? "warn" : refLow ? "info" : "pass",
      text: refLow
        ? `Base quality: alt ${s.bqAlt} vs ref ${s.bqRef} — the reference reads are the low-quality ones (homopolymer context), so base-quality filters drop ref reads first and inflate the VAF; compare the "all reads" row`
        : `Base quality: alt ${s.bqAlt} vs ref ${s.bqRef}`,
    });
  }
  // low VAF spread thinly over many cells: sequencing error on amplified copies looks like this
  if (t.alt > 0 && s.tVaf != null && s.tVaf < 0.05 && t.dp >= 200) {
    const fold = s.nVaf ? s.tVaf / s.nVaf : null;
    checks.push({
      key: "vaf",
      status: "warn",
      text: `Low VAF (${(100 * s.tVaf).toFixed(1)}%)${fold ? `, only ${fold.toFixed(1)}× the normal cells' alt rate` : ""}: at this depth, errors on many (amplified) copies give the same picture as a rare subclone`,
    });
  }
  if (t.del > 0 && t.dp) {
    checks.push({ key: "del", status: "info", text: `${t.del} tumour reads have a deletion at the site (not counted; indel errors are common in homopolymers)` });
  }
  if (s.endAlt != null && t.alt > 0) {
    const ends = s.endAlt < 5 && (s.endRef ?? 99) >= 15;
    checks.push({ key: "end", status: ends ? "warn" : "pass", text: `Median distance from read end: alt ${s.endAlt} bp, ref ${s.endRef ?? "–"} bp` });
  }

  let level;
  const failed = checks.filter((x) => x.status === "fail");
  const warned = checks.filter((x) => x.status === "warn");
  if (t.dp < 5 && n.dp < 5) level = "uninformative";
  else if (checks.find((x) => x.germline)) level = "germline";
  else if (t.alt === 0 || (t.alt <= 1 && !nominal)) level = t.dp >= 8 ? "absent" : "uninformative";
  else if (failed.length) level = "artefact";
  else if (sig && s.carrierCells >= 3 && !warned.some((w) => ["normal", "strand", "cohort", "vaf"].includes(w.key))) level = "supported";
  else level = nominal ? "weak" : "artefact";

  let summary;
  if (level === "supported")
    summary = `${s.carrierCells} tumour cells carry it (${t.alt}/${t.dp} reads, p ${fmtLog10P(s.log10pError)}); normals ${n.alt}/${n.dp}; no artefact signal.`;
  else if (level === "absent")
    summary = `No alt reads in ${t.dp} tumour reads from ${s.coveredTumour} cells; a clonal het would have shown alt reads (P(miss) = ${fmtLog10P(s.log10pMissClonal)}).`;
  else if (level === "uninformative") summary = `Only ${t.dp} tumour reads: coverage too low to say.`;
  else if (level === "germline") summary = `Normal cells carry it at VAF ${pct(s.nVaf)}: germline or a shared artefact, not somatic.`;
  else if (level === "artefact") summary = `Artefact-like: ${(failed.length ? failed : warned).map((x) => CONCERN[x.key] || x.key).join("; ") || "no signal above error"}.`;
  else summary = `Above error, but ${warned.map((w) => CONCERN[w.key] || w.key).join("; ") || "few reads"}.`;
  return { level, ...VERDICTS[level], summary, checks };
}

/**
 * Ranked findings: every genotyped site with its verdict and a score. Ordering: verdict, then known hotspot /
 * GBM gene, then signal strength. Sites that are not detected or uninformative are returned separately
 * (hotspots only), so the list shows what was looked for.
 */
export function rankFindings(calls, evidenceDoc, cloneOf = new Map()) {
  const out = [];
  (calls?.sites || []).forEach((site) => {
    const ev = evidenceDoc?.sites?.[site.id] || null;
    const ann = annotateSite(site, ev);
    const cellRows = siteCells(calls, site.id, cloneOf);
    const stats = siteStats(site, ev, cellRows);
    const verdict = siteVerdict(stats);
    const signal = Math.min(60, -stats.log10pError || 0);
    // configured hotspots (genotyped in every cell) lead, then other known hotspots, then GBM genes
    const score = (6 - verdict.rank) * 100 + (ann.configured ? 70 : ann.hotspot ? 50 : ann.eventTier ? 45 - 5 * ann.eventTier : 0) + (ann.gbmGene ? 20 : 0) + signal;
    out.push({ ...ann, site, stats, verdict, score });
  });
  out.sort((a, b) => b.score - a.score);
  const isCall = (f) => ["supported", "weak", "artefact", "germline"].includes(f.verdict.level);
  return {
    findings: out.filter(isCall),
    negativeHotspots: out.filter((f) => !isCall(f) && (f.configured || f.eventTier)),
    all: out,
  };
}

/** Per-read rows of site_evidence.json decoded: { cell, clone, allele, bq, mq, strand, dup, flags, end, nm }. */
export function decodeReads(ev, cells = [], cloneOf = new Map()) {
  const r = ev?.reads;
  if (!r?.rows) return [];
  const idx = Object.fromEntries((r.cols || []).map((c, i) => [c, i]));
  const ALLELE = { A: "alt", R: "ref", O: "other", D: "del" };
  return r.rows.map((row, i) => {
    const ci = row[idx.cell];
    const cell = ci == null ? null : `${cells[ci] ?? ci}`;
    return {
      key: i,
      cell,
      clone: cell == null ? "unassigned" : cloneOf.get(cell) ?? "unassigned",
      allele: ALLELE[row[idx.allele]] || row[idx.allele],
      bq: row[idx.bq],
      mq: row[idx.mq],
      strand: row[idx.rev] ? "−" : "+",
      dup: !!row[idx.dup],
      flags: row[idx.flags] || "",
      end: row[idx.end],
      nm: row[idx.nm],
    };
  });
}

/** Read passes the igv / table filter: { hideDup, minMq }. */
export function readPasses(read, { hideDup = true, minMq = 0 } = {}) {
  if (hideDup && read.dup) return false;
  if (read.mq < minMq) return false;
  return true;
}

/** Deep link into the evidence view: ?tab=15&evsite=<chrom:pos:REF>ALT>&evview=<view>. */
export function readEvidenceLink(search = typeof window !== "undefined" ? window.location.search : "") {
  const params = new URLSearchParams(search);
  return { report: params.get("report"), site: params.get("evsite"), view: params.get("evview") };
}

/** URL query for a deep link to a site (relative to the current page). */
export function evidenceLinkQuery({ dataset, report, site }) {
  const p = new URLSearchParams();
  if (dataset) p.set("dataset", dataset);
  if (report) p.set("report", report);
  p.set("tab", "15");
  if (site) p.set("evsite", site);
  return `?${p.toString()}`;
}

/** Best-evidenced site per gene (supported / weak findings only): Map gene -> finding. */
export function findingsByGene(ranked) {
  const out = new Map();
  (ranked?.findings || []).forEach((f) => {
    if (!f.gene || !["supported", "weak"].includes(f.verdict.level)) return;
    if (!out.has(f.gene)) out.set(f.gene, f);
  });
  return out;
}

/** Genes named by a filtered-event record (fusions "A::B" give both). */
export const recordGenes = (record) =>
  `${record?.gene || ""}`
    .split(/::|,|;/)
    .map((g) => g.trim())
    .filter(Boolean);

export const EVIDENCE_SITE_EVENT = "gos-evidence-site";

/** Open the Evidence tab on a site: put ?evsite= in the URL (read on mount) and tell a mounted tab. */
export function announceEvidenceSite(siteId) {
  if (typeof window === "undefined") return;
  try {
    const url = new URL(window.location.href);
    url.searchParams.set("evsite", siteId);
    window.history.replaceState(window.history.state, "", url.toString());
  } catch (e) {
    // URL API unavailable: the event below still reaches a mounted tab
  }
  window.dispatchEvent(new CustomEvent(EVIDENCE_SITE_EVENT, { detail: { site: siteId } }));
}
