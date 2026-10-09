// Splicing from the back end (junction counts per cell with regtools,
// LeafCutter-style intron clusters): data/<patient>/rna/splicing.json
// ("gos-sc-splicing/1": known splice variants + variable clusters) and
// data/_cohort/rna/splicing.json ("gos-sc-splicing-cohort/1": clusters that
// differ between patients). Group-level PSI is computed here, in the front
// end, by pooling the counts of the cells in each group. d3-free.

export const RNA_ONLY_GROUP = "RNA only (no DNA)";
export const NA_GROUP = "NA";

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const sum = (a) => a.reduce((s, v) => s + num(v), 0);

/** Junction usage fractions (PSI) of a count vector; NaN everywhere when there are no reads. */
export function psi(counts) {
  const total = sum(counts || []);
  return (counts || []).map((c) => (total > 0 ? num(c) / total : NaN));
}

/** Validated splicing.json with ids as strings and missing parts emptied. */
export function normalizeSplicing(json) {
  if (!json || (!Array.isArray(json.variants) && !Array.isArray(json.clusters))) throw new Error("splicing.json: no variants or clusters");
  return {
    patient: json.patient || null,
    variants: (json.variants || []).map((v) => ({ ...v, cells: v.cells || {} })),
    clusters: (json.clusters || []).map((c) => ({ ...c, junctions: c.junctions || [], cells: c.cells || {} })),
    cellMap: json.cell_map || {},
  };
}

/**
 * The function giving each RNA cell's group: "clone" (the DNA clone of the
 * linked cell; RNA-only cells get their own group) or any rna/cells.json
 * field (state, Region, ...).
 */
export function rnaGrouping(field, rnaCells = [], cloneOfCell = new Map(), cellOfRna = new Map()) {
  const byRna = new Map((rnaCells || []).map((c) => [`${c.rna_id}`, c]));
  return (rnaId) => {
    const id = `${rnaId}`;
    if (field === "clone") {
      const cellId = cellOfRna.get(id) ?? byRna.get(id)?.cell_id;
      if (!cellId) return RNA_ONLY_GROUP;
      const clone = cloneOfCell.get(cellId);
      return clone == null || clone === "" ? NA_GROUP : `${clone}`;
    }
    const v = byRna.get(id)?.[field];
    return v == null || v === "" ? NA_GROUP : `${v}`;
  };
}

const naturalSort = (a, b) => `${a}`.localeCompare(`${b}`, undefined, { numeric: true, sensitivity: "base" });

/**
 * A cluster's junction counts pooled per group: [{ group, counts, total,
 * nCells (cells in the group with any read in the cluster), psi }], groups
 * in natural order with NA / RNA-only last.
 */
export function clusterByGroup(cluster, groupOf) {
  const nJ = (cluster?.junctions || []).length;
  const groups = new Map();
  Object.entries(cluster?.cells || {}).forEach(([rnaId, counts]) => {
    const g = groupOf(rnaId);
    if (g == null) return;
    if (!groups.has(g)) groups.set(g, { group: g, counts: new Array(nJ).fill(0), nCells: 0 });
    const entry = groups.get(g);
    let any = 0;
    for (let j = 0; j < nJ; j += 1) {
      entry.counts[j] += num(counts?.[j]);
      any += num(counts?.[j]);
    }
    if (any > 0) entry.nCells += 1;
  });
  return sortGroups([...groups.values()]).map((g) => ({ ...g, total: sum(g.counts), psi: psi(g.counts) }));
}

function sortGroups(list) {
  const last = (g) => (g === NA_GROUP || g === RNA_ONLY_GROUP ? 1 : 0);
  return list.sort((a, b) => last(a.group) - last(b.group) || naturalSort(a.group, b.group));
}

/**
 * A known splice variant per group: alt / ref reads pooled over cells, the
 * alt fraction, and how many cells have any alt read.
 */
export function variantByGroup(variant, groupOf) {
  const groups = new Map();
  Object.entries(variant?.cells || {}).forEach(([rnaId, pair]) => {
    const g = groupOf(rnaId);
    if (g == null) return;
    if (!groups.has(g)) groups.set(g, { group: g, alt: 0, ref: 0, nCells: 0, nAlt: 0 });
    const e = groups.get(g);
    const alt = num(pair?.[0]);
    const ref = num(pair?.[1]);
    e.alt += alt;
    e.ref += ref;
    if (alt + ref > 0) e.nCells += 1;
    if (alt > 0) e.nAlt += 1;
  });
  return sortGroups([...groups.values()]).map((e) => ({ ...e, total: e.alt + e.ref, frac: e.alt + e.ref > 0 ? e.alt / (e.alt + e.ref) : NaN }));
}

/** Variant totals over all cells (for the summary line). */
export function variantSummary(variant) {
  let alt = 0;
  let ref = 0;
  let nAlt = 0;
  let nCells = 0;
  Object.values(variant?.cells || {}).forEach((p) => {
    alt += num(p?.[0]);
    ref += num(p?.[1]);
    if (num(p?.[0]) + num(p?.[1]) > 0) nCells += 1;
    if (num(p?.[0]) > 0) nAlt += 1;
  });
  return { alt, ref, nAlt, nCells, frac: alt + ref > 0 ? alt / (alt + ref) : NaN };
}

/**
 * RNA cells in phylogeny tip order: the RNA of each DNA cell in `order`
 * (cells without RNA skipped), then RNA-only cells. Returns [{ rna_id,
 * cell_id }] and how many sit on the tree.
 */
export function rnaRowsInTreeOrder(order, rnaIds, cellOfRna) {
  const rnaOfCell = new Map();
  const rnaOnly = [];
  (rnaIds || []).forEach((r) => {
    const c = cellOfRna.get(`${r}`);
    if (c) {
      if (!rnaOfCell.has(c)) rnaOfCell.set(c, `${r}`);
    } else rnaOnly.push(`${r}`);
  });
  const rows = [];
  (order || []).forEach((cellId) => {
    if (rnaOfCell.has(cellId)) rows.push({ rna_id: rnaOfCell.get(cellId), cell_id: cellId });
  });
  const nTree = rows.length;
  // RNA cells linked to DNA cells not in the shown order (e.g. hidden clones) are left out
  rnaOnly.sort(naturalSort).forEach((r) => rows.push({ rna_id: r, cell_id: null }));
  return { rows, nTree };
}

/**
 * Per-cell junction usage for a canvas: psi[k * nJ + j] (NaN without reads)
 * and totals[k] for the given rows.
 */
export function cellUsageMatrix(cluster, rows) {
  const nJ = (cluster?.junctions || []).length;
  const out = new Float32Array(rows.length * nJ).fill(NaN);
  const totals = new Float32Array(rows.length);
  rows.forEach((r, k) => {
    const counts = cluster?.cells?.[r.rna_id];
    if (!counts) return;
    const total = sum(counts);
    totals[k] = total;
    if (total > 0) for (let j = 0; j < nJ; j += 1) out[k * nJ + j] = num(counts[j]) / total;
  });
  return { psi: out, totals, nJ };
}

/** Clusters whose gene or id matches the query (case-insensitive), in file order. */
export function filterClusters(clusters, query = "", { minPatients = 0 } = {}) {
  const q = `${query || ""}`.trim().toUpperCase();
  return (clusters || []).filter((c) => {
    if (q && !`${c.gene || ""}`.toUpperCase().includes(q) && !`${c.id || ""}`.toUpperCase().includes(q)) return false;
    if (minPatients > 0 && c.usage && patientsWithReads(c) < minPatients) return false;
    return true;
  });
}

/** Patients with any read in a cohort cluster. */
export const patientsWithReads = (cluster) => Object.values(cluster?.usage || {}).filter((u) => num(u?.total) > 0 || sum(u?.counts || []) > 0).length;

/** Cohort table rows (one per cluster), most significant first. */
export function cohortClusterRows(cohort) {
  return (cohort?.clusters || [])
    .map((c) => ({
      key: c.id,
      id: c.id,
      gene: c.gene || "",
      locus: `${c.chromosome}:${c.start}-${c.end}`,
      p: Number(c.p),
      q: Number(c.q),
      max_dpsi: Number(c.max_dpsi),
      nJunctions: (c.junctions || []).length,
      nPatients: patientsWithReads(c),
      cluster: c,
    }))
    .sort((a, b) => (Number.isFinite(a.q) ? a.q : 1) - (Number.isFinite(b.q) ? b.q : 1) || (b.max_dpsi || 0) - (a.max_dpsi || 0));
}

/** Junction x patient PSI of a cohort cluster: { patients, psi: [junction][patient], totals: [patient] }. */
export function cohortPsiMatrix(cluster, patients) {
  const nJ = (cluster?.junctions || []).length;
  const ps = (patients || Object.keys(cluster?.usage || {})).filter((p) => cluster?.usage?.[p]);
  const totals = ps.map((p) => sum(cluster.usage[p].counts || []));
  const perPatient = ps.map((p) => psi(cluster.usage[p].counts || new Array(nJ).fill(0)));
  const matrix = [];
  for (let j = 0; j < nJ; j += 1) matrix.push(perPatient.map((v) => v[j]));
  return { patients: ps, psi: matrix, totals, nCells: ps.map((p) => num(cluster.usage[p].n_cells)) };
}

/** Largest PSI range across groups of any junction (front-end ΔPSI). */
export function maxDeltaPsi(groupRows) {
  if (!groupRows?.length) return NaN;
  const nJ = groupRows[0].psi.length;
  let best = 0;
  for (let j = 0; j < nJ; j += 1) {
    const v = groupRows.map((g) => g.psi[j]).filter(Number.isFinite);
    if (v.length > 1) best = Math.max(best, Math.max(...v) - Math.min(...v));
  }
  return best;
}

/**
 * Sashimi-lite geometry: junction ends placed on an ordinal (not genomic)
 * axis so short exons and long introns both stay readable. Returns the
 * sorted unique coordinates, x(coordinate) in [x0, x1] and one arc per
 * junction ({ j, xa, xb, span (ordinal distance) }).
 */
export function arcLayout(junctions, x0, x1) {
  const coords = [...new Set((junctions || []).flatMap((j) => [Number(j.start), Number(j.end)]))].filter(Number.isFinite).sort((a, b) => a - b);
  const step = coords.length > 1 ? (x1 - x0) / (coords.length - 1) : 0;
  const index = new Map(coords.map((c, k) => [c, k]));
  const x = (c) => x0 + (coords.length > 1 ? index.get(Number(c)) * step : (x1 - x0) / 2);
  const arcs = (junctions || []).map((jn, j) => ({
    j,
    xa: x(jn.start),
    xb: x(jn.end),
    span: Math.abs((index.get(Number(jn.end)) ?? 0) - (index.get(Number(jn.start)) ?? 0)),
    annotated: jn.annotated !== false,
  }));
  return { coords, x, arcs };
}

/** "chr7:55,019,366-55,155,829" of a junction (with the cluster's chromosome). */
export const junctionLabel = (chrom, j) => `${chrom ? `${chrom}:` : ""}${Number(j.start).toLocaleString("en-US")}-${Number(j.end).toLocaleString("en-US")}`;
