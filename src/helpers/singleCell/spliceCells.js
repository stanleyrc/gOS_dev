// Cells using / not using an aberrant splice junction, for the cohort splicing view (d3-free, tested).
// A patient's rna/splicing.json cluster holds cells: { rnaId: [reads per junction] }; the cohort cells.json holds the
// state / clone / UMAP of every cell (keyed patient::rna_id, as in cohortGroups).
import { cellKey } from "./cohortGroups";

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const isAberrant = (j) => j && (j.annotated === false || (j.type && j.type !== "annotated"));

/**
 * Which side of an event the "using" cells are on: the side holding a non-annotated junction (inclusion junctions of an
 * alt 3'/5' site, the skip junction of an exon skip), else the side with fewer pooled reads (the rare isoform).
 * @returns { side: "incl"|"skip", ks: [junction index], otherKs: [...] , label }
 */
export function focusJunctions(cluster, event, pooled = null) {
  const js = cluster?.junctions || [];
  if (event?.focus) return { side: "incl", ks: event.focus, otherKs: event.junctions.skip, label: event.variant ? `${event.variant} (the skip junction)` : "the pinned junction" };
  const incl = event?.junctions?.incl || [];
  const skip = event?.junctions?.skip || [];
  if (!incl.length && !skip.length) {
    const ab = js.map((j, k) => (isAberrant(j) ? k : -1)).filter((k) => k >= 0);
    const ks = ab.length ? ab : js.length ? [js.length - 1] : [];
    return { side: "incl", ks, otherKs: js.map((_, k) => k).filter((k) => !ks.includes(k)), label: "the aberrant junction" };
  }
  const abIn = incl.some((k) => isAberrant(js[k]));
  const abSk = skip.some((k) => isAberrant(js[k]));
  let side;
  if (abIn !== abSk) side = abIn ? "incl" : "skip";
  else {
    const sum = (ks) => ks.reduce((a, k) => a + num(pooled?.[k]), 0);
    side = pooled && sum(skip) < sum(incl) / Math.max(1, incl.length) ? "skip" : "incl";
  }
  const ks = side === "incl" ? incl : skip;
  const otherKs = side === "incl" ? skip : incl;
  const what = event.type === "cassette" ? (side === "incl" ? "exon inclusion" : "exon skipping") : side === "incl" ? "the shorter-intron junction" : "the other junction(s)";
  return { side, ks, otherKs, label: what };
}

/** Pooled reads per junction of a cluster over the patients that have it. */
export function pooledCounts(cluster) {
  const n = (cluster?.junctions || []).length;
  const out = Array(n).fill(0);
  Object.values(cluster?.usage || {}).forEach((u) => (u.counts || []).forEach((v, k) => (out[k] += num(v))));
  return out;
}

/**
 * Cells of one patient's cluster: [{ id, focus, other, total, frac, using, covered }].
 * using = at least one read on the focus junctions; covered = >= cover reads on the event's junctions.
 * Only using cells and covered cells are returned.
 */
export function classifyCells(cells, focus, cover = 3) {
  return Object.entries(cells || {})
    .map(([id, counts]) => {
      const f = focus.ks.reduce((a, k) => a + num(counts?.[k]), 0);
      const o = focus.otherKs.reduce((a, k) => a + num(counts?.[k]), 0);
      const total = f + o;
      return { id, focus: f, other: o, total, frac: total > 0 ? f / total : NaN, using: f >= 1, covered: total >= cover };
    })
    .filter((c) => c.using || c.covered);
}

const cmp = (a, b) => `${a ?? "~"}`.localeCompare(`${b ?? "~"}`, undefined, { numeric: true });

/** Order cells by state, then clone, then by decreasing junction use; meta = { state, clone } per cell id or null. */
export function orderCells(rows, metaOf = () => null) {
  return [...rows].sort((a, b) => {
    const ma = metaOf(a.id) || {};
    const mb = metaOf(b.id) || {};
    return cmp(ma.state, mb.state) || cmp(ma.clone, mb.clone) || (num(b.frac) - num(a.frac)) || cmp(a.id, b.id);
  });
}

/**
 * Per-patient cell tables of a cluster. patientClusters: { patient: normalised-cluster-or-null } where a null means the
 * patient's cluster is not exported; unavailable patients get rows null.
 * @returns [{ patient, rows: [...]|null, using, covered }]
 */
export function patientCellTables(patients, clusterOf, focus, metaOf, cover = 3) {
  return patients.map((patient) => {
    const cl = clusterOf(patient);
    if (!cl || !cl.cells) return { patient, rows: null, using: 0, covered: 0 };
    const rows = orderCells(classifyCells(cl.cells, focus, cover), (id) => metaOf(patient, id)).map((r) => ({ ...r, patient, key: cellKey(patient, r.id) }));
    return { patient, rows, using: rows.filter((r) => r.using).length, covered: rows.filter((r) => r.covered).length };
  });
}

/** Cohort-table numbers of a cluster: cells using (sum), patients with >= minCells using cells, patients without export. */
export function clusterCellSummary(patients, clusterOf, focus, minCells = 3) {
  let cellsUsing = 0;
  let patientsWith = 0;
  let missing = 0;
  patients.forEach((p) => {
    const cl = clusterOf(p);
    if (!cl || !cl.cells) {
      missing += 1;
      return;
    }
    const n = classifyCells(cl.cells, focus, Infinity).length; // using cells only (nothing is "covered" at Infinity)
    cellsUsing += n;
    if (n >= minCells) patientsWith += 1;
  });
  return { cellsUsing, patientsWith, missing };
}

/** Default sort: patients with cells, then cells (descending); rows without a summary last. */
export function bySummary(a, b) {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return b.patientsWith - a.patientsWith || b.cellsUsing - a.cellsUsing;
}

/**
 * Grid layout of cell squares: one block per patient (label column on the left), cells wrap at `width`.
 * @returns { blocks: [{ patient, y, h, cells: [{ key, x, y }] }], height }
 */
export function stripLayout(tables, width, { cell = 8, gap = 1.5, labelW = 150, rowGap = 14, top = 4 } = {}) {
  const per = Math.max(1, Math.floor((width - labelW) / (cell + gap)));
  let y = top;
  const blocks = tables.map((t) => {
    const n = t.rows ? t.rows.length : 0;
    const lines = Math.max(1, Math.ceil(n / per));
    const h = lines * (cell + gap);
    const cells = (t.rows || []).map((r, i) => ({ key: r.key, x: labelW + (i % per) * (cell + gap), y: y + Math.floor(i / per) * (cell + gap) }));
    const block = { patient: t.patient, y, h, cells };
    y += h + rowGap;
    return block;
  });
  return { blocks, height: y, cell, per, labelW };
}

/** Keys of the cells whose square intersects a rectangle {x0,y0,x1,y1} (any corner order). */
export function cellsInRect(layout, rect) {
  const x0 = Math.min(rect.x0, rect.x1);
  const x1 = Math.max(rect.x0, rect.x1);
  const y0 = Math.min(rect.y0, rect.y1);
  const y1 = Math.max(rect.y0, rect.y1);
  const c = layout.cell;
  return layout.blocks.flatMap((b) => b.cells.filter((q) => q.x < x1 && q.x + c > x0 && q.y < y1 && q.y + c > y0).map((q) => q.key));
}

/** Keys grouped by patient: { patient: [rnaId] } (keys are patient::rna_id). */
export function keysByPatient(keys) {
  const out = {};
  [...keys].forEach((k) => {
    const i = `${k}`.indexOf("::");
    if (i < 0) return;
    (out[k.slice(0, i)] = out[k.slice(0, i)] || []).push(k.slice(i + 2));
  });
  return out;
}

/** Display name for a saved cohort group made from a splice event. */
export const spliceGroupName = (gene, label, side) => `${gene} ${label || "splice"} ${side === "skip" ? "skip" : "using"}`.replace(/\s+/g, " ").trim();
