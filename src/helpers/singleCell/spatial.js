// Spatial phylogeography of slide-tag patients: cells placed on the tissue
// (data/<patient>/spatial.json, written by srctools gos_sc_slidetag.R) and
// the statistics that relate space to clones and to the tree.
//
//   - k-nearest-neighbour spatial weights (symmetric, binary), in the same
//     { ids, n, W, S0, S1, S2 } form as heritability.treeWeights so Moran's I
//     and its permutation test are shared with the tree-heritability views;
//   - per-clone spatial clustering: Moran's I of the clone indicator;
//   - neighbourhood enrichment: how often two labels are kNN neighbours,
//     against label permutations (z-score per pair);
//   - niche enrichment: mean of a per-cell niche score over each cell's
//     neighbours, per clone, against label permutations;
//   - Mantel test between tree (patristic) and physical distance.
// d3-free so it runs under jest.

import { leafDistances, moranI, moranPermutation } from "./heritability";

/** Deterministic PRNG (mulberry32), as in heritability.js. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleInPlace(arr, rand) {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
  return arr;
}

const num = (v) => (v == null || v === "" ? NaN : +v);

/**
 * Normalise spatial.json. Accepts { cells: [{ cell_id|cell|pair, x, y, ...fields }] }
 * or columnar { cell_id: [], x: [], y: [], ... }. Returns
 * { points: [{ id, x, y, fields }], fields: [{ name, numeric, levels }], units, source, notes, meta }.
 * Cells without finite coordinates are dropped.
 */
export function normalizeSpatial(raw) {
  if (!raw || typeof raw !== "object") return { points: [], fields: [], units: null, source: null, notes: [], meta: {} };
  let rows = raw.cells;
  if (!Array.isArray(rows) && rows && typeof rows === "object" && Array.isArray(rows.x)) {
    const keys = Object.keys(rows);
    rows = rows.x.map((_, i) => Object.fromEntries(keys.map((k) => [k, rows[k][i]])));
  }
  rows = Array.isArray(rows) ? rows : [];
  const RESERVED = new Set(["cell_id", "cell", "pair", "x", "y"]);
  const points = [];
  const fieldValues = new Map();
  rows.forEach((r) => {
    const id = r.cell_id ?? r.cell ?? r.pair;
    const x = num(r.x);
    const y = num(r.y);
    if (id == null || !Number.isFinite(x) || !Number.isFinite(y)) return;
    const fields = {};
    Object.entries(r).forEach(([k, v]) => {
      if (RESERVED.has(k) || v == null || v === "" || typeof v === "object") return;
      fields[k] = v;
      if (!fieldValues.has(k)) fieldValues.set(k, []);
      fieldValues.get(k).push(v);
    });
    points.push({ id: `${id}`, x, y, fields });
  });
  const fields = [...fieldValues.entries()].map(([name, values]) => {
    const numeric = values.every((v) => typeof v === "number" || (typeof v === "string" && v.trim() !== "" && Number.isFinite(+v) && !/^0\d/.test(v)));
    return {
      name,
      numeric,
      levels: numeric ? null : [...new Set(values.map((v) => `${v}`))].sort(),
    };
  });
  return {
    points,
    fields,
    units: raw.units || null,
    source: raw.source || null,
    notes: Array.isArray(raw.notes) ? raw.notes : raw.notes ? [raw.notes] : [],
    meta: { patient: raw.patient || null, generated: raw.generated || null, method: raw.clone_method || null, genes: raw.cn_genes || [] },
  };
}

/** Pairwise Euclidean distances (n x n, row-major). */
export function euclidDistances(points) {
  const n = points.length;
  const D = new Float64Array(n * n);
  for (let i = 0; i < n; i += 1)
    for (let j = i + 1; j < n; j += 1) {
      const d = Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y);
      D[i * n + j] = d;
      D[j * n + i] = d;
    }
  return D;
}

/** Indices of the k nearest neighbours of each point (ties broken by index). */
export function knn(points, k = 6) {
  const n = points.length;
  const kk = Math.max(1, Math.min(k, n - 1));
  const D = euclidDistances(points);
  return points.map((_, i) => {
    const order = [];
    for (let j = 0; j < n; j += 1) if (j !== i) order.push(j);
    order.sort((a, b) => D[i * n + a] - D[i * n + b] || a - b);
    return order.slice(0, kk);
  });
}

/**
 * Symmetric binary kNN weights (i~j when either is among the other's k
 * nearest), with Moran constants; same shape as heritability.treeWeights.
 */
export function spatialWeights(points, k = 6) {
  const n = points.length;
  if (n < 4) return null;
  const nb = knn(points, k);
  const W = new Float64Array(n * n);
  nb.forEach((list, i) =>
    list.forEach((j) => {
      W[i * n + j] = 1;
      W[j * n + i] = 1;
    })
  );
  let S0 = 0;
  let S1 = 0;
  const rowSum = new Float64Array(n);
  for (let a = 0; a < n; a += 1)
    for (let b = 0; b < n; b += 1) {
      const w = W[a * n + b];
      S0 += w;
      rowSum[a] += w;
    }
  for (let a = 0; a < n; a += 1) for (let b = 0; b < n; b += 1) if (a !== b) S1 += 0.5 * (W[a * n + b] + W[b * n + a]) ** 2;
  let S2 = 0;
  for (let a = 0; a < n; a += 1) S2 += (2 * rowSum[a]) ** 2;
  const neighbours = Array.from({ length: n }, () => []);
  for (let a = 0; a < n; a += 1) for (let b = 0; b < n; b += 1) if (W[a * n + b] > 0) neighbours[a].push(b);
  return { ids: points.map((p) => p.id), n, W, S0, S1, S2, neighbours, k };
}

/**
 * Spatial clustering of each label (Moran's I of its 0/1 indicator over the
 * kNN graph): rows [{ label, n, I, z, p, pPerm }] for labels with >= minCells
 * cells, most clustered first. labels: array aligned with w.ids (null = skip as
 * its own label but kept as background).
 */
export function labelClustering(w, labels, { minCells = 3, nPerm = 999, seed = 11 } = {}) {
  if (!w) return [];
  const counts = new Map();
  labels.forEach((l) => l != null && counts.set(l, (counts.get(l) || 0) + 1));
  const rows = [];
  counts.forEach((n, label) => {
    if (n < minCells || n > w.n - 2) return;
    const v = labels.map((l) => (l === label ? 1 : 0));
    const a = moranI(v, w);
    const perm = moranPermutation(v, w, { nPerm, seed });
    rows.push({ label, n, I: a.I, EI: a.EI, z: a.z, p: a.p, pPerm: perm.p });
  });
  return rows.sort((a, b) => a.pPerm - b.pPerm || b.I - a.I);
}

/** Moran's I + permutation p of a numeric per-cell value (NaN = missing). */
export function valueClustering(w, values, { nPerm = 999, seed = 11 } = {}) {
  if (!w) return null;
  const finite = values.filter(Number.isFinite);
  if (finite.length < 4 || Math.min(...finite) === Math.max(...finite)) return null;
  const a = moranI(values, w);
  const perm = moranPermutation(values, w, { nPerm, seed });
  return { I: a.I, z: a.z, p: a.p, pPerm: perm.p, n: finite.length };
}

/**
 * Neighbourhood enrichment: for every pair of labels, the number of kNN edges
 * joining them against nPerm label permutations. Returns
 * { labels, observed, mean, sd, z } with matrices indexed [a][b] (symmetric).
 */
export function neighbourhoodEnrichment(w, labels, { nPerm = 499, seed = 7, minCells = 2 } = {}) {
  if (!w) return null;
  const counts = new Map();
  labels.forEach((l) => l != null && counts.set(l, (counts.get(l) || 0) + 1));
  const keep = [...counts.entries()].filter(([, c]) => c >= minCells).map(([l]) => l).sort((a, b) => `${a}`.localeCompare(`${b}`, undefined, { numeric: true }));
  const L = keep.length;
  if (L < 2) return null;
  const idx = new Map(keep.map((l, i) => [l, i]));
  const code = Int32Array.from(labels, (l) => (idx.has(l) ? idx.get(l) : -1));
  const edges = [];
  w.neighbours.forEach((list, i) => list.forEach((j) => j > i && edges.push([i, j])));
  const countEdges = (c) => {
    const m = new Float64Array(L * L);
    edges.forEach(([i, j]) => {
      const a = c[i];
      const b = c[j];
      if (a < 0 || b < 0) return;
      m[a * L + b] += 1;
      if (a !== b) m[b * L + a] += 1;
    });
    return m;
  };
  const observed = countEdges(code);
  const sum = new Float64Array(L * L);
  const sum2 = new Float64Array(L * L);
  const rand = rng(seed);
  const perm = Int32Array.from(code);
  for (let k = 0; k < nPerm; k += 1) {
    shuffleInPlace(perm, rand);
    const m = countEdges(perm);
    for (let q = 0; q < L * L; q += 1) {
      sum[q] += m[q];
      sum2[q] += m[q] * m[q];
    }
  }
  const mat = (f) => Array.from({ length: L }, (_, a) => Array.from({ length: L }, (__, b) => f(a * L + b)));
  const mean = (q) => sum[q] / nPerm;
  const sd = (q) => Math.sqrt(Math.max(0, sum2[q] / nPerm - mean(q) ** 2));
  return {
    labels: keep,
    observed: mat((q) => observed[q]),
    mean: mat(mean),
    sd: mat(sd),
    z: mat((q) => (sd(q) > 0 ? (observed[q] - mean(q)) / sd(q) : 0)),
    edges: edges.length,
  };
}

/**
 * Niche enrichment of each label: the mean over its cells of the average niche
 * score of their spatial neighbours, against label permutations (two-sided p).
 * scores: numbers aligned with w.ids (NaN = unknown). Returns rows
 * [{ label, n, mean, background, diff, p }].
 */
export function nicheEnrichment(w, labels, scores, { nPerm = 499, seed = 5, minCells = 3 } = {}) {
  if (!w) return [];
  const nbMean = w.neighbours.map((list) => {
    let s = 0;
    let c = 0;
    list.forEach((j) => {
      if (Number.isFinite(scores[j])) {
        s += scores[j];
        c += 1;
      }
    });
    return c ? s / c : NaN;
  });
  const valid = nbMean.map(Number.isFinite);
  const counts = new Map();
  labels.forEach((l, i) => l != null && valid[i] && counts.set(l, (counts.get(l) || 0) + 1));
  const total = nbMean.reduce((s, v) => (Number.isFinite(v) ? s + v : s), 0);
  const nValid = valid.filter(Boolean).length;
  const meanFor = (lab, label) => {
    let s = 0;
    let c = 0;
    lab.forEach((l, i) => {
      if (l === label && valid[i]) {
        s += nbMean[i];
        c += 1;
      }
    });
    return c ? s / c : NaN;
  };
  const rows = [];
  const rand = rng(seed);
  counts.forEach((n, label) => {
    if (n < minCells || n > nValid - 2) return;
    const m = meanFor(labels, label);
    const background = (total - m * n) / (nValid - n);
    const diff = m - background;
    let ge = 0;
    const perm = [...labels];
    for (let k = 0; k < nPerm; k += 1) {
      shuffleInPlace(perm, rand);
      const pm = meanFor(perm, label);
      const pc = perm.reduce((c, l, i) => (l === label && valid[i] ? c + 1 : c), 0);
      const pb = pc && nValid - pc ? (total - pm * pc) / (nValid - pc) : NaN;
      if (Math.abs(pm - pb) >= Math.abs(diff) - 1e-12) ge += 1;
    }
    rows.push({ label, n, mean: m, background, diff, p: (ge + 1) / (nPerm + 1) });
  });
  return rows.sort((a, b) => a.p - b.p);
}

/** Pearson correlation of the upper triangles of two n x n distance matrices. */
function upperCorrelation(A, B, n, perm = null) {
  let sa = 0;
  let sb = 0;
  let saa = 0;
  let sbb = 0;
  let sab = 0;
  let m = 0;
  for (let i = 0; i < n; i += 1)
    for (let j = i + 1; j < n; j += 1) {
      const a = A[i * n + j];
      const pi = perm ? perm[i] : i;
      const pj = perm ? perm[j] : j;
      const b = B[pi * n + pj];
      if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
      sa += a;
      sb += b;
      saa += a * a;
      sbb += b * b;
      sab += a * b;
      m += 1;
    }
  if (m < 3) return NaN;
  const cov = sab - (sa * sb) / m;
  const va = saa - (sa * sa) / m;
  const vb = sbb - (sb * sb) / m;
  return va > 0 && vb > 0 ? cov / Math.sqrt(va * vb) : NaN;
}

/** Mantel test (Pearson, one-sided for positive r): { r, p, n, nPerm }. */
export function mantel(A, B, n, { nPerm = 999, seed = 3 } = {}) {
  const r = upperCorrelation(A, B, n);
  if (!Number.isFinite(r)) return { r, p: NaN, n, nPerm };
  const rand = rng(seed);
  const perm = Int32Array.from({ length: n }, (_, i) => i);
  let ge = 0;
  for (let k = 0; k < nPerm; k += 1) {
    shuffleInPlace(perm, rand);
    if (upperCorrelation(A, B, n, perm) >= r) ge += 1;
  }
  return { r, p: (ge + 1) / (nPerm + 1), n, nPerm };
}

/**
 * Tree vs space: patristic distances of the tree leaves that have a position,
 * against their physical distances. layout = tree.data.layout (newick.layoutTree).
 */
export function treeSpaceMantel(layout, points, opts = {}) {
  if (!layout?.leaves?.length) return null;
  const rowOf = new Map(layout.leaves.map((id, i) => [`${id}`, i]));
  const placed = points.filter((p) => rowOf.has(p.id));
  const n = placed.length;
  if (n < 5) return null;
  const full = leafDistances(layout);
  const N = layout.leaves.length;
  const T = new Float64Array(n * n);
  placed.forEach((p, a) =>
    placed.forEach((q, b) => {
      T[a * n + b] = full[rowOf.get(p.id) * N + rowOf.get(q.id)];
    })
  );
  const S = euclidDistances(placed);
  return { ...mantel(T, S, n, opts), cells: n };
}

/** Distance-class profile: mean tree distance of cell pairs in each physical-distance quantile bin. */
export function distanceProfile(layout, points, nBins = 6) {
  if (!layout?.leaves?.length) return [];
  const rowOf = new Map(layout.leaves.map((id, i) => [`${id}`, i]));
  const placed = points.filter((p) => rowOf.has(p.id));
  const n = placed.length;
  if (n < 5) return [];
  const full = leafDistances(layout);
  const N = layout.leaves.length;
  const pairs = [];
  for (let a = 0; a < n; a += 1)
    for (let b = a + 1; b < n; b += 1)
      pairs.push([
        Math.hypot(placed[a].x - placed[b].x, placed[a].y - placed[b].y),
        full[rowOf.get(placed[a].id) * N + rowOf.get(placed[b].id)],
      ]);
  pairs.sort((p, q) => p[0] - q[0]);
  const out = [];
  for (let k = 0; k < nBins; k += 1) {
    const lo = Math.floor((k * pairs.length) / nBins);
    const hi = Math.floor(((k + 1) * pairs.length) / nBins);
    const chunk = pairs.slice(lo, hi);
    if (!chunk.length) continue;
    out.push({
      from: chunk[0][0],
      to: chunk[chunk.length - 1][0],
      tree: chunk.reduce((s, p) => s + p[1], 0) / chunk.length,
      pairs: chunk.length,
    });
  }
  return out;
}

export const fmtP = (p) => (!Number.isFinite(p) ? "n/a" : p < 0.001 ? "< 0.001" : p < 0.01 ? p.toFixed(3) : p.toFixed(2));
const fmt2 = (v) => (Number.isFinite(v) ? (Math.round(v * 100) / 100).toFixed(2) : "n/a");

/**
 * Plain-language headline sentences from the computed statistics:
 * { clustering: labelClustering rows, mantel, enrichment, niche: [{ score, rows }] }.
 * Returns [{ key, text, strong }] with the significant findings first.
 */
export function spatialHeadlines({ clustering = [], mantel: mt = null, enrichment = null, niche = [], alpha = 0.05 } = {}) {
  const out = [];
  const sig = clustering.filter((r) => r.pPerm < alpha && r.I > r.EI);
  if (sig.length) {
    sig.slice(0, 3).forEach((r) =>
      out.push({ key: `clu-${r.label}`, strong: true, text: `${r.label} is spatially clustered (Moran's I = ${fmt2(r.I)}, p = ${fmtP(r.pPerm)}, ${r.n} cells).` })
    );
  } else if (clustering.length) {
    const best = clustering[0];
    out.push({
      key: "clu-none",
      strong: false,
      text: `No clone is spatially clustered; the strongest is ${best.label} (Moran's I = ${fmt2(best.I)}, p = ${fmtP(best.pPerm)}).`,
    });
  }
  if (mt && Number.isFinite(mt.r)) {
    out.push(
      mt.p < alpha && mt.r > 0
        ? { key: "mantel", strong: true, text: `Cells that are close in the tree sit close in the tissue (Mantel r = ${fmt2(mt.r)}, p = ${fmtP(mt.p)}, ${mt.cells} cells).` }
        : { key: "mantel", strong: false, text: `Tree distance does not track physical distance (Mantel r = ${fmt2(mt.r)}, p = ${fmtP(mt.p)}, ${mt.cells} cells).` }
    );
  }
  if (enrichment) {
    const pairs = [];
    enrichment.labels.forEach((a, i) =>
      enrichment.labels.forEach((b, j) => {
        if (j < i) return;
        pairs.push({ a, b, z: enrichment.z[i][j], obs: enrichment.observed[i][j] });
      })
    );
    const mixed = pairs.filter((p) => p.a !== p.b && p.z >= 2).sort((x, y) => y.z - x.z);
    const apart = pairs.filter((p) => p.a !== p.b && p.z <= -2).sort((x, y) => x.z - y.z);
    if (mixed.length) out.push({ key: "enr-mix", strong: true, text: `${mixed[0].a} and ${mixed[0].b} are neighbours more often than chance (z = ${fmt2(mixed[0].z)}).` });
    if (apart.length) out.push({ key: "enr-apart", strong: true, text: `${apart[0].a} and ${apart[0].b} avoid each other (z = ${fmt2(apart[0].z)}).` });
  }
  niche.forEach(({ score, rows }) => {
    const r = rows.find((x) => x.p < alpha);
    if (r) {
      out.push({
        key: `niche-${score}-${r.label}`,
        strong: true,
        text: `${r.label} cells sit in ${r.diff > 0 ? "higher" : "lower"}-${score} neighbourhoods than other cells (${fmt2(r.mean)} vs ${fmt2(r.background)}, p = ${fmtP(r.p)}).`,
      });
    }
  });
  return out.sort((a, b) => Number(b.strong) - Number(a.strong));
}

/**
 * Aspect-preserving placement of tissue coordinates in a width x height box
 * (y grows downwards, as in image coordinates). Returns { px, py } per point.
 */
export function placeTissue(points, width, height, margin = 14) {
  if (!points.length) return [];
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  points.forEach((p) => {
    x0 = Math.min(x0, p.x);
    x1 = Math.max(x1, p.x);
    y0 = Math.min(y0, p.y);
    y1 = Math.max(y1, p.y);
  });
  const sx = (width - 2 * margin) / Math.max(x1 - x0, 1e-9);
  const sy = (height - 2 * margin) / Math.max(y1 - y0, 1e-9);
  const s = Math.min(sx, sy);
  const ox = margin + (width - 2 * margin - s * (x1 - x0)) / 2;
  const oy = margin + (height - 2 * margin - s * (y1 - y0)) / 2;
  return points.map((p) => ({ px: ox + s * (p.x - x0), py: oy + s * (p.y - y0) }));
}
