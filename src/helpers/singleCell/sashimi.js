// Sashimi plot geometry and splicing statistics for the single-cell RNA
// splicing views (rna/splicing.json, _cohort/rna/splicing.json). Exons are
// drawn near scale and introns compressed (log length) so short exons and
// 100 kb introns fit one panel. d3-free so it can be unit tested.
import { benjaminiHochberg, chiSquareTable, kruskalWallis, mannWhitney } from "./tests";
import { clusterByGroup, maxDeltaPsi, psi, NA_GROUP, RNA_ONLY_GROUP } from "./splicing";

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Junction classes written by the back end (sc_junction_types), in legend order. */
export const JUNCTION_TYPES = ["annotated", "exon_skip", "novel_combination", "novel_donor", "novel_acceptor", "novel"];

/** Junction class, also for files without `type` (annotated flag only). */
export const junctionType = (jn) => jn?.type || (jn?.annotated === false ? "novel" : "annotated");

/** Pixel width of an exonic / intronic stretch before scaling to the panel. */
const exonPx = (len) => 4 + Math.sqrt(Math.max(0, len)) * 1.2;
const intronPx = (len) => 8 + 11 * Math.log10(1 + Math.max(0, len));

/**
 * Collapsed-intron x axis of a cluster: the region spans its exons and
 * junction ends; exonic stretches are near scale, gaps log-compressed.
 * Returns { lo, hi, x(coordinate), segments: [{ start, end, x0, x1, exonic }],
 * exons: [{ start, end, x0, x1 }] } with x in [x0, x1].
 */
export function sashimiAxis({ exons = [], junctions = [] }, x0, x1) {
  const ex = (exons || [])
    .map((e) => (Array.isArray(e) ? { start: Number(e[0]), end: Number(e[1]) } : { start: Number(e.start), end: Number(e.end) }))
    .filter((e) => Number.isFinite(e.start) && Number.isFinite(e.end) && e.end >= e.start)
    .sort((a, b) => a.start - b.start);
  // anchors: the last exonic base before and the first after each intron
  const anchors = (junctions || []).flatMap((j) => [Number(j.start) - 1, Number(j.end) + 1]).filter(Number.isFinite);
  const pts = [...anchors, ...ex.flatMap((e) => [e.start, e.end + 1])];
  if (!pts.length) return { lo: 0, hi: 1, x: () => (x0 + x1) / 2, segments: [], exons: [] };
  let lo = Math.min(...pts);
  let hi = Math.max(...pts);
  if (hi <= lo) hi = lo + 1;
  // anchors outside every exon get a short pseudo-exon so the arc has a foot
  const isExonic = (p) => ex.some((e) => p >= e.start && p <= e.end);
  const feet = anchors.filter((a) => !isExonic(a)).map((a) => ({ start: a - 5, end: a + 5, pseudo: true }));
  const blocks = [...ex, ...feet].sort((a, b) => a.start - b.start);
  lo = Math.min(lo, ...blocks.map((b) => b.start));
  hi = Math.max(hi, ...blocks.map((b) => b.end + 1));
  const cuts = [...new Set([lo, hi, ...blocks.flatMap((b) => [Math.max(lo, b.start), Math.min(hi, b.end + 1)])])].sort((a, b) => a - b);
  const raw = [];
  for (let i = 0; i + 1 < cuts.length; i += 1) {
    const s = cuts[i];
    const e = cuts[i + 1];
    const exonic = blocks.some((b) => s >= b.start && e <= b.end + 1);
    raw.push({ start: s, end: e, exonic, w: exonic ? exonPx(e - s) : intronPx(e - s) });
  }
  const total = raw.reduce((a, r) => a + r.w, 0) || 1;
  const k = (x1 - x0) / total;
  let cur = x0;
  const segments = raw.map((r) => {
    const seg = { start: r.start, end: r.end, exonic: r.exonic, x0: cur, x1: cur + r.w * k };
    cur = seg.x1;
    return seg;
  });
  const x = (c) => {
    const v = Number(c);
    if (!(v > lo)) return x0;
    if (!(v < hi)) return x1;
    let a = 0;
    let b = segments.length - 1;
    while (a < b) {
      const m = (a + b) >> 1;
      if (segments[m].end <= v) a = m + 1;
      else b = m;
    }
    const s = segments[a];
    return s.x0 + ((v - s.start) / Math.max(1, s.end - s.start)) * (s.x1 - s.x0);
  };
  return { lo, hi, x, segments, exons: blocks.map((b) => ({ start: b.start, end: b.end, pseudo: Boolean(b.pseudo), x0: x(b.start), x1: x(b.end + 1) })) };
}

/**
 * Arc geometry of a cluster's junctions on an axis: { j, xa, xb, above } with
 * alternating sides (longest arcs above) so overlapping arcs stay apart.
 */
export function sashimiArcs(junctions, x) {
  const arcs = (junctions || []).map((jn, j) => ({ j, xa: x(Number(jn.start) - 1), xb: x(Number(jn.end) + 1), type: junctionType(jn) }));
  const bySpan = [...arcs].sort((a, b) => b.xb - b.xa - (a.xb - a.xa));
  bySpan.forEach((a, i) => {
    a.above = i % 2 === 0;
  });
  return arcs;
}

/** Junction index whose PSI varies most across columns (patients / groups) with reads; 0 when none. */
export function mostVariableJunction(psiByColumn) {
  const nJ = psiByColumn[0]?.length || 0;
  let best = 0;
  let bestRange = -1;
  for (let j = 0; j < nJ; j += 1) {
    const v = psiByColumn.map((p) => p[j]).filter(Number.isFinite);
    const r = v.length > 1 ? Math.max(...v) - Math.min(...v) : -1;
    if (r > bestRange) {
      bestRange = r;
      best = j;
    }
  }
  return best;
}

/**
 * Cohort overview: per cluster the PSI of its most between-patient-variable
 * junction in every patient ({ id, gene, j, psi: [patient], totals, dpsi,
 * q, max_dpsi }). Patients with fewer than `minReads` reads or `minCells`
 * covered cells get NaN (so a handful of cells cannot drive a row); rows need
 * `minPatients` such patients and are sorted by the range of those PSIs.
 */
export function cohortOverview(cohort, { n = 40, minReads = 50, minCells = 5, minPatients = 3 } = {}) {
  const patients = cohort?.patients || [];
  const rows = (cohort?.clusters || []).map((c) => {
    const totals = patients.map((p) => (c.usage?.[p]?.counts || []).reduce((a, v) => a + num(v), 0));
    const ok = patients.map((p, i) => totals[i] >= minReads && (c.usage?.[p]?.n_cells == null || num(c.usage[p].n_cells) >= minCells));
    const ps = patients.map((p, i) => (ok[i] ? psi(c.usage?.[p]?.counts || []) : (c.junctions || []).map(() => NaN)));
    const j = mostVariableJunction(ps);
    const v = ps.map((x) => x[j]);
    const f = v.filter(Number.isFinite);
    return {
      id: c.id,
      gene: c.gene || "?",
      j,
      junction: c.junctions?.[j],
      type: junctionType(c.junctions?.[j]),
      psi: v,
      totals,
      nOk: f.length,
      dpsi: f.length > 1 ? Math.max(...f) - Math.min(...f) : NaN,
      q: Number(c.q),
      max_dpsi: Number(c.max_dpsi),
      cluster: c,
    };
  });
  return rows
    .filter((r) => r.nOk >= Math.min(minPatients, patients.length))
    .sort((a, b) => b.dpsi - a.dpsi || (a.q || 1) - (b.q || 1))
    .slice(0, n);
}

/** Known variants across patients: [{ id, gene, description, rows: [{ patient, alt, ref, nAlt, nCells, frac }] }]. */
export function cohortVariantRows(cohort) {
  const patients = cohort?.patients || [];
  return (cohort?.variants || []).map((v) => ({
    id: v.id,
    gene: v.gene,
    description: v.description,
    rows: patients.map((p) => {
      const u = v.usage?.[p] || {};
      const alt = num(u.alt);
      const ref = num(u.ref);
      return { patient: p, alt, ref, nAlt: num(u.n_cells_alt), nCells: num(u.n_cells), frac: alt + ref > 0 ? alt / (alt + ref) : NaN };
    }),
  }));
}

/**
 * Per-cell PSI of junction j for the cells of each group (cells with at
 * least `minReads` reads in the cluster): Map group -> number[].
 */
export function cellPsiByGroup(cluster, groupOf, j, minReads = 3) {
  const out = new Map();
  Object.entries(cluster?.cells || {}).forEach(([rnaId, counts]) => {
    const total = (counts || []).reduce((a, v) => a + num(v), 0);
    if (total < minReads) return;
    const g = groupOf(rnaId);
    if (g == null || g === NA_GROUP || g === RNA_ONLY_GROUP) return;
    if (!out.has(g)) out.set(g, []);
    out.get(g).push(num(counts[j]) / total);
  });
  return out;
}

/**
 * Clusters ranked by how differently the groups (clones, states, ...) use
 * them. Cells are the replicates: per junction a Kruskal-Wallis test on
 * per-cell PSI across groups (>= `minCells` covered cells each), the
 * cluster p is the smallest junction p times the number of junctions
 * (Bonferroni), q = BH over clusters. dPSI is the pooled-read range across
 * those groups. Without two testable groups p is NaN.
 */
export function rankClustersByGroup(clusters, groupOf, { minReads = 3, minCells = 5 } = {}) {
  const rows = (clusters || []).map((c) => {
    const nJ = (c.junctions || []).length;
    let pMin = NaN;
    let nGroups = 0;
    for (let j = 0; j < nJ; j += 1) {
      const groups = [...cellPsiByGroup(c, groupOf, j, minReads).values()].filter((v) => v.length >= minCells);
      nGroups = Math.max(nGroups, groups.length);
      if (groups.length < 2) continue;
      const { p } = kruskalWallis(groups);
      if (Number.isFinite(p) && !(p >= pMin)) pMin = p;
    }
    const p = Number.isFinite(pMin) ? Math.min(1, pMin * nJ) : NaN;
    const pooled = clusterByGroup(c, groupOf).filter((g) => g.group !== NA_GROUP && g.group !== RNA_ONLY_GROUP && g.nCells >= minCells);
    const types = [...new Set((c.junctions || []).map(junctionType))];
    return { id: c.id, gene: c.gene || "", p, dpsi: pooled.length > 1 ? maxDeltaPsi(pooled) : NaN, nGroups, nCells: Object.keys(c.cells || {}).length, types, cluster: c };
  });
  const tested = rows.filter((r) => Number.isFinite(r.p));
  const q = benjaminiHochberg(tested.map((r) => r.p));
  tested.forEach((r, i) => {
    r.q = q[i];
  });
  rows.forEach((r) => {
    if (r.q == null) r.q = NaN;
  });
  return rows;
}

/** Pooled-read chi-square of a cluster across groups (descriptive; reads are not independent). */
export function pooledChiSquare(groupRows) {
  const table = (groupRows || []).filter((g) => g.total > 0).map((g) => g.counts.map(num));
  return table.length > 1 ? chiSquareTable(table) : NaN;
}

/**
 * Known variant vs copy number of its gene in the same cells: covered cells
 * (alt + ref > 0) with a CN split into carriers (alt > 0) and the rest;
 * medians and a Mann-Whitney p.
 */
export function variantVsCopyNumber(variant, cellOfRna, cnOfCell) {
  const carriers = [];
  const others = [];
  Object.entries(variant?.cells || {}).forEach(([rnaId, pair]) => {
    const alt = num(pair?.[0]);
    const ref = num(pair?.[1]);
    if (alt + ref <= 0) return;
    const cellId = cellOfRna.get(`${rnaId}`);
    const cn = cellId != null ? cnOfCell.get(cellId) ?? cnOfCell.get(`${cellId}`) : undefined;
    if (!Number.isFinite(cn)) return;
    (alt > 0 ? carriers : others).push(cn);
  });
  const med = (v) => {
    const s = [...v].sort((a, b) => a - b);
    return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN;
  };
  const test = carriers.length && others.length ? mannWhitney(carriers, others) : { p: NaN };
  return { carriers, others, medianCarriers: med(carriers), medianOthers: med(others), p: test.p };
}

/** IGV loci of a known variant: donor and acceptor exon ends of the alt junction. */
export function variantLoci(variant) {
  const a = variant?.alt_junction;
  if (!a || !Number.isFinite(Number(a.start))) return [];
  return [
    { chromosome: `${a.chromosome}`, position: Number(a.start) - 1 },
    { chromosome: `${a.chromosome}`, position: Number(a.end) + 1 },
  ];
}

/** Cells with an IGV slice for a variant, carriers first (most alt reads), then reference cells. */
export function variantSliceCells(variant, spliceReads, limit = 6) {
  const reads = spliceReads || {};
  const rows = Object.entries(variant?.cells || {})
    .filter(([id]) => reads[id])
    .map(([id, pair]) => ({ rna_id: id, alt: num(pair?.[0]), ref: num(pair?.[1]), bam: reads[id] }));
  const carriers = rows.filter((r) => r.alt > 0).sort((a, b) => b.alt - a.alt || b.ref - a.ref);
  const refs = rows.filter((r) => r.alt === 0 && r.ref > 0).sort((a, b) => b.ref - a.ref);
  return { carriers, refs, default: [...carriers.slice(0, Math.max(1, limit - 2)), ...refs.slice(0, 2)].slice(0, limit) };
}

/**
 * Cluster table order: clusters that differ between groups both
 * significantly (q < 0.05) and substantially (dPSI >= 0.1) first, by q;
 * then the rest by dPSI.
 */
export function byGroupEvidence(a, b) {
  const strong = (r) => Number.isFinite(r.q) && r.q < 0.05 && r.dpsi >= 0.1;
  if (strong(a) !== strong(b)) return strong(a) ? -1 : 1;
  if (strong(a)) return a.q - b.q || b.dpsi - a.dpsi;
  return (Number.isFinite(b.dpsi) ? b.dpsi : -1) - (Number.isFinite(a.dpsi) ? a.dpsi : -1);
}

/**
 * Groups shown as sashimi tracks: the `max` groups with most covered cells
 * (in their original order), the others pooled into one `otherLabel` track.
 */
export function sashimiGroups(groups, max = 8, otherLabel = "other groups") {
  if ((groups || []).length <= max) return groups || [];
  const keep = new Set([...groups].sort((a, b) => b.nCells - a.nCells || b.total - a.total).slice(0, max - 1).map((g) => g.group));
  const rest = groups.filter((g) => !keep.has(g.group));
  const counts = rest.reduce((acc, g) => acc.map((v, j) => v + (Number(g.counts[j]) || 0)), new Array(groups[0].counts.length).fill(0));
  const other = { group: `${otherLabel} (${rest.length})`, counts, nCells: rest.reduce((a, g) => a + g.nCells, 0), total: counts.reduce((a, v) => a + v, 0) };
  return [...groups.filter((g) => keep.has(g.group)), other];
}
