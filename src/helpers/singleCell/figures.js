// Computations behind the cohort "Figures" tab (paper figures 3-5 made
// interactive): amplicon gene-set groups per patient, copy-number densities,
// per-cell co-occurrence, phylogenetic signal (Moran's I on the tree),
// per-clone carrier fractions, gene-vs-gene fits and subclonal findings.
// d3-free so jest can run it.

import { cladeFitScore } from "./cladeFit";

const asList = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]).map(String).filter(Boolean);
export const isNormalClone = (clone) => /normal/i.test(`${clone ?? ""}`);

/** Gene-set key of a walk: its driver genes (sorted), else "Other". */
export function walkGeneSet(walk) {
  const genes = [...new Set(asList(walk.driver_genes))].sort();
  return genes.length ? genes.join("+") : "Other";
}

/**
 * Walks of one patient grouped by driver-gene set (Fig 3A rows).
 * Each group: { key, genes, walks, cn: Float32Array over cellIds (sum of
 * the group's walks), nCells (cn >= minCn), fraction }.
 */
export function walkGroups(walks = [], cellIds = [], { curatedOnly = true, includeOther = false, minCells = 3, minCn = 1 } = {}) {
  const anyCurated = walks.some((w) => w.curated === true);
  const keep = walks.filter((w) => {
    if (curatedOnly && anyCurated && w.curated === false) return false;
    if (!includeOther && walkGeneSet(w) === "Other") return false;
    const n = cellIds.reduce((s, id) => s + ((Number(w.cells?.[id]) || 0) >= minCn ? 1 : 0), 0);
    return n >= minCells;
  });
  const byKey = new Map();
  keep.forEach((w) => {
    const key = walkGeneSet(w);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(w);
  });
  const groups = [...byKey.entries()].map(([key, list]) => {
    const cn = new Float32Array(cellIds.length);
    cellIds.forEach((id, i) => {
      let s = 0;
      list.forEach((w) => (s += Number(w.cells?.[id]) || 0));
      cn[i] = s;
    });
    let nCells = 0;
    cn.forEach((v) => (nCells += v >= minCn ? 1 : 0));
    return { key, genes: key === "Other" ? [] : key.split("+"), walks: list, cellIds, cn, nCells, fraction: cellIds.length ? nCells / cellIds.length : 0 };
  });
  // single genes first, then combinations; within those by carriers
  return groups.sort((a, b) => (a.key === "Other") - (b.key === "Other") || a.genes.length - b.genes.length || b.nCells - a.nCells);
}

/** Per-cell combinations of groups present (cn >= minCn): [{ keys, n, cells }] by n (Fig 3B upset). */
export function groupCombinations(groups, cellIds, minCn = 1) {
  const combos = new Map();
  cellIds.forEach((id, i) => {
    const keys = groups.filter((g) => g.cn[i] >= minCn).map((g) => g.key);
    if (!keys.length) return;
    const key = keys.join("|");
    if (!combos.has(key)) combos.set(key, { keys, n: 0, cells: [] });
    const c = combos.get(key);
    c.n += 1;
    c.cells.push(id);
  });
  return [...combos.values()].sort((a, b) => b.n - a.n);
}

/**
 * Gaussian kernel density of positive values on a log10 axis between lo and
 * hi, at `n` points; normalised to a maximum of 1 (violin outline).
 */
export function logDensity(values, lo = 1, hi = 200, n = 48) {
  const xs = values.filter((v) => v > 0).map((v) => Math.log10(Math.min(hi, Math.max(lo, v))));
  const out = new Float32Array(n);
  if (!xs.length) return out;
  const a = Math.log10(lo);
  const b = Math.log10(hi);
  const mean = xs.reduce((s, v) => s + v, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(1, xs.length - 1)) || 0.1;
  const bw = Math.max(0.04, 1.06 * sd * xs.length ** -0.2); // Silverman
  let max = 0;
  for (let k = 0; k < n; k += 1) {
    const x = a + ((b - a) * k) / (n - 1);
    let s = 0;
    for (let i = 0; i < xs.length; i += 1) {
      const z = (x - xs[i]) / bw;
      s += Math.exp(-0.5 * z * z);
    }
    out[k] = s;
    if (s > max) max = s;
  }
  if (max > 0) for (let k = 0; k < n; k += 1) out[k] /= max;
  return out;
}

export function quantiles(values, ps = [0.25, 0.5, 0.75]) {
  const s = Float64Array.from(values.filter(Number.isFinite)).sort();
  if (!s.length) return ps.map(() => NaN);
  return ps.map((p) => {
    const h = (s.length - 1) * p;
    const lo = Math.floor(h);
    return s[lo] + (h - lo) * ((s[Math.min(s.length - 1, lo + 1)] ?? s[lo]) - s[lo]);
  });
}

/* ----------------------------------------------------------------------- */
/* Phylogenetic signal                                                      */
/* ----------------------------------------------------------------------- */

/**
 * Patristic distances between the leaves of a layout (node.x = depth), as a
 * Float32Array n x n. Each pair is set once, at its lowest common ancestor.
 */
export function leafDistances(layout) {
  const n = layout.leaves.length;
  const depth = new Float64Array(n);
  layout.nodes.forEach((node) => {
    if (node.isLeaf) depth[node.firstLeaf] = node.x;
  });
  const D = new Float32Array(n * n);
  layout.nodes.forEach((node) => {
    if (node.isLeaf || node.children.length < 2) return;
    const kids = node.children.map((c) => layout.nodes[c]);
    for (let a = 0; a < kids.length; a += 1) {
      for (let b = a + 1; b < kids.length; b += 1) {
        for (let i = kids[a].firstLeaf; i <= kids[a].lastLeaf; i += 1) {
          for (let j = kids[b].firstLeaf; j <= kids[b].lastLeaf; j += 1) {
            const d = depth[i] + depth[j] - 2 * node.x;
            D[i * n + j] = d;
            D[j * n + i] = d;
          }
        }
      }
    }
  });
  return D;
}

/** Moran's I of values (aligned with rows) under weights W (n x n, zero diagonal). */
export function moransI(values, W, n) {
  let mean = 0;
  for (let i = 0; i < n; i += 1) mean += values[i];
  mean /= n;
  let num = 0;
  let den = 0;
  let wsum = 0;
  for (let i = 0; i < n; i += 1) {
    const di = values[i] - mean;
    den += di * di;
    const row = i * n;
    for (let j = 0; j < n; j += 1) {
      const w = W[row + j];
      if (!w) continue;
      num += w * di * (values[j] - mean);
      wsum += w;
    }
  }
  return den > 0 && wsum > 0 ? (n / wsum) * (num / den) : NaN;
}

/** Deterministic PRNG (mulberry32) so permutation z-scores are stable between renders. */
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

/**
 * Phylogenetic autocorrelation of per-cell variables on the tree (Fig 3E):
 * Moran's I with inverse patristic distance weights, z-scored against
 * `nPerm` permutations of the values over the leaves.
 * cellIds: leaf ids to use (subset of layout.leaves); variables: [{ key, value: id -> number }].
 * Returns [{ key, I, z, p, n }].
 */
export function phyloSignal(layout, cellIds, variables, { nPerm = 199, seed = 7 } = {}) {
  if (!layout?.leaves?.length) return [];
  const rowOf = new Map(layout.leaves.map((id, i) => [id, i]));
  const rows = cellIds.map((id) => rowOf.get(id)).filter((r) => r != null);
  const n = rows.length;
  if (n < 6) return [];
  const full = leafDistances(layout);
  const N = layout.leaves.length;
  const W = new Float32Array(n * n);
  for (let a = 0; a < n; a += 1) {
    for (let b = 0; b < n; b += 1) {
      if (a === b) continue;
      const d = full[rows[a] * N + rows[b]];
      W[a * n + b] = d > 0 ? 1 / d : 0;
    }
  }
  const ids = rows.map((r) => layout.leaves[r]);
  return variables.map((v) => {
    const vals = Float64Array.from(ids, (id) => Number(v.value(id)));
    const ok = vals.every(Number.isFinite);
    if (!ok) {
      // missing values: impute the mean so they carry no signal
      const fin = [...vals].filter(Number.isFinite);
      const m = fin.length ? fin.reduce((s, x) => s + x, 0) / fin.length : 0;
      for (let i = 0; i < n; i += 1) if (!Number.isFinite(vals[i])) vals[i] = m;
    }
    const I = moransI(vals, W, n);
    if (!Number.isFinite(I)) return { key: v.key, I, z: NaN, p: NaN, n };
    const rand = rng(seed);
    const perm = Float64Array.from(vals);
    let s = 0;
    let s2 = 0;
    let ge = 0;
    for (let k = 0; k < nPerm; k += 1) {
      for (let i = n - 1; i > 0; i -= 1) {
        const j = Math.floor(rand() * (i + 1));
        const t = perm[i];
        perm[i] = perm[j];
        perm[j] = t;
      }
      const Ik = moransI(perm, W, n);
      s += Ik;
      s2 += Ik * Ik;
      if (Ik >= I) ge += 1;
    }
    const mean = s / nPerm;
    const sd = Math.sqrt(Math.max(0, s2 / nPerm - mean * mean));
    return { key: v.key, I, z: sd > 0 ? (I - mean) / sd : NaN, p: (ge + 1) / (nPerm + 1), n };
  });
}

/* ----------------------------------------------------------------------- */
/* Clones, fits and findings                                                */
/* ----------------------------------------------------------------------- */

/** Fraction of each clone's cells in `carriers` (Set of ids): [{ clone, n, carriers, fraction }]. */
export function cloneFractions(cells, carriers) {
  const by = new Map();
  cells.forEach((c) => {
    const k = c.clone_id ?? "NA";
    if (!by.has(k)) by.set(k, { clone: k, n: 0, carriers: 0 });
    const e = by.get(k);
    e.n += 1;
    if (carriers.has(c.cell_id)) e.carriers += 1;
  });
  return [...by.values()].map((e) => ({ ...e, fraction: e.n ? e.carriers / e.n : 0 }));
}

/** Least squares y = a + b x with R²; plus the median ratio y / x. */
export function linearFit(xs, ys) {
  const pts = xs.map((x, i) => [x, ys[i]]).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  const n = pts.length;
  if (n < 3) return { n, slope: NaN, intercept: NaN, r2: NaN, ratio: NaN };
  const mx = pts.reduce((s, p) => s + p[0], 0) / n;
  const my = pts.reduce((s, p) => s + p[1], 0) / n;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  pts.forEach(([x, y]) => {
    sxx += (x - mx) ** 2;
    sxy += (x - mx) * (y - my);
    syy += (y - my) ** 2;
  });
  const slope = sxx > 0 ? sxy / sxx : NaN;
  const ratios = pts.filter(([x]) => x > 0).map(([x, y]) => y / x);
  return {
    n,
    slope,
    intercept: my - slope * mx,
    r2: sxx > 0 && syy > 0 ? (sxy * sxy) / (sxx * syy) : NaN,
    ratio: ratios.length ? quantiles(ratios, [0.5])[0] : NaN,
  };
}

/**
 * Subclonal findings of one patient: driver events and amplicon groups
 * carried by part of the tumour (minFraction..maxFraction of tumour cells)
 * whose carriers follow the tree (clade F1 >= minF1).
 * Returns [{ kind, label, type, carriers: Set, n, fraction, f1, clones, event?, group? }].
 */
export function subclonalFindings({ events = [], groups = [], cells = [], tree = null, minFraction = 0.05, maxFraction = 0.85, minF1 = 0.5, minCells = 3, maxTier = 2 }) {
  const tumour = cells.filter((c) => !isNormalClone(c.clone_id));
  const tumourIds = new Set(tumour.map((c) => c.cell_id));
  const nT = tumour.length || 1;
  const out = [];
  const add = (kind, label, type, ids, extra) => {
    const carriers = new Set(ids.filter((id) => tumourIds.has(id)));
    const n = carriers.size;
    const fraction = n / nT;
    if (n < minCells || fraction < minFraction || fraction > maxFraction) return;
    const fit = tree ? cladeFitScore([...carriers], tree) : { score: NaN };
    if (Number.isFinite(fit.score) && fit.score < minF1) return;
    out.push({ kind, label, type, carriers, n, fraction, f1: fit.score, clones: cloneFractions(tumour, carriers), ...extra });
  };
  const seen = new Set();
  events.forEach((e) => {
    const tier = Number(e.Tier);
    if (Number.isFinite(tier) && tier > maxTier) return;
    if (!["Fusion", "SCNA", "Missense", "Trunc", "Splice"].includes(e.type)) return;
    const ids = `${e.cell_ids || ""}`.split(",").filter(Boolean);
    // fusions are listed once per partner pair; keep one per carrier set
    const label = e.type === "Fusion" ? e.fusion_genes || e.gene : `${e.gene} ${e.vartype || ""}`.trim();
    const sig = `${e.type}|${ids.length}|${ids.slice(0, 5).join(",")}|${(e.fusion_genes || "").split("::")[0]}`;
    if (seen.has(sig)) return;
    seen.add(sig);
    add("event", label, e.vartype || e.type, ids, { event: e });
  });
  groups.forEach((g) => {
    const ids = [];
    g.cn.forEach((v, i) => v >= 1 && ids.push(g.cellIds?.[i]));
    add("amplicon", `ec${g.key}`, `${g.walks.length} walk${g.walks.length === 1 ? "" : "s"}`, ids.filter(Boolean), { group: g });
  });
  return out.sort((a, b) => (b.f1 || 0) * Math.min(b.fraction, 1 - b.fraction) - (a.f1 || 0) * Math.min(a.fraction, 1 - a.fraction));
}

/* ----------------------------------------------------------------------- */
/* Colours and SNV packing                                                  */
/* ----------------------------------------------------------------------- */

// Amplicon copy-number ramp of the figures: blue (loss) - peach (2) - orange - red - black (100+).
const AMP_STOPS = [
  [0, [59, 84, 163]],
  [1, [158, 202, 225]],
  [2, [253, 232, 205]],
  [5, [249, 164, 27]],
  [20, [227, 26, 28]],
  [50, [153, 0, 13]],
  [100, [20, 0, 0]],
];
const lerp = (a, b, t) => Math.round(a + (b - a) * t);

/** [r, g, b] for a copy number on the amplicon ramp (log spacing above 2). */
export function ampliconRGB(cn) {
  if (!Number.isFinite(cn)) return [230, 230, 230];
  const v = Math.max(0, cn);
  for (let k = 1; k < AMP_STOPS.length; k += 1) {
    const [x1, c1] = AMP_STOPS[k];
    if (v <= x1) {
      const [x0, c0] = AMP_STOPS[k - 1];
      const t = x0 >= 2 ? Math.log(v / x0) / Math.log(x1 / x0) : (v - x0) / (x1 - x0);
      return [lerp(c0[0], c1[0], t), lerp(c0[1], c1[1], t), lerp(c0[2], c1[2], t)];
    }
  }
  return AMP_STOPS[AMP_STOPS.length - 1][1];
}

export const ampliconCss = (cn) => `rgb(${ampliconRGB(cn).join(",")})`;
export const AMP_LEGEND = [0, 1, 2, 5, 20, 50, 100];

/** Packed little-endian RGBA (ImageData Uint32 view) for a copy number; 256-entry cache. */
const AMP_CACHE = new Uint32Array(257);
let ampCacheReady = false;
export function ampliconRGBA(cn) {
  if (!ampCacheReady) {
    for (let k = 0; k <= 256; k += 1) {
      const [r, g, b] = ampliconRGB(k === 256 ? NaN : k * 0.5);
      AMP_CACHE[k] = ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
    }
    ampCacheReady = true;
  }
  if (!Number.isFinite(cn)) return AMP_CACHE[256];
  if (cn >= 127.5) return AMP_CACHE[255];
  return AMP_CACHE[Math.max(0, Math.round(cn * 2))];
}

/**
 * Compact SNV matrix (snv_matrix.json "compact": cells -> [[variant, ref, alt, gt]])
 * as per-cell typed arrays: { idx: Int32Array, vaf: Uint8Array (0-250) } for
 * sites with reads. Drops the raw nested arrays (MBs per patient).
 */
export function packSnvCells(cells = {}) {
  const out = {};
  Object.entries(cells).forEach(([id, list]) => {
    const keep = (list || []).filter((e) => (Number(e[1]) || 0) + (Number(e[2]) || 0) > 0);
    const idx = new Int32Array(keep.length);
    const vaf = new Uint8Array(keep.length);
    keep.forEach((e, k) => {
      const ref = Number(e[1]) || 0;
      const alt = Number(e[2]) || 0;
      idx[k] = e[0];
      vaf[k] = Math.round((250 * alt) / (ref + alt));
    });
    out[id] = { idx, vaf };
  });
  return out;
}

/**
 * Column order of variants for a tree-ordered SNV panel: by the mean tree
 * row of their alt-carrying cells (clonal ones, carried widely, land in the
 * middle of the staircase); variants with no carriers in `rowOf` are dropped.
 */
export function snvTreeOrder(packed, rowOf, nVariants) {
  const sum = new Float64Array(nVariants);
  const cnt = new Int32Array(nVariants);
  Object.entries(packed).forEach(([id, p]) => {
    const r = rowOf.get(id);
    if (r == null) return;
    for (let k = 0; k < p.idx.length; k += 1) {
      if (p.vaf[k] >= 25) {
        sum[p.idx[k]] += r;
        cnt[p.idx[k]] += 1;
      }
    }
  });
  const cols = [];
  for (let v = 0; v < nVariants; v += 1) if (cnt[v] > 0) cols.push(v);
  // widely shared variants first, then by where their carriers sit
  return cols.sort((a, b) => (cnt[b] > 0.6 * rowOf.size) - (cnt[a] > 0.6 * rowOf.size) || sum[a] / cnt[a] - sum[b] / cnt[b]);
}

/**
 * Per-row max VAF in `nBins` column bins over `order` (variant columns):
 * Int16Array rows x nBins, -1 = no reads in the bin.
 */
export function binSnvMatrix(packed, rowIds, order, nBins) {
  const colOf = new Int32Array(Math.max(1, (order.length ? Math.max(...order) : 0) + 1)).fill(-1);
  order.forEach((v, i) => (colOf[v] = Math.min(nBins - 1, Math.floor((i * nBins) / Math.max(1, order.length)))));
  const out = new Int16Array(rowIds.length * nBins).fill(-1);
  rowIds.forEach((id, r) => {
    const p = packed[id];
    if (!p) return;
    const base = r * nBins;
    for (let k = 0; k < p.idx.length; k += 1) {
      const v = p.idx[k];
      const c = v < colOf.length ? colOf[v] : -1;
      if (c >= 0 && p.vaf[k] > out[base + c]) out[base + c] = p.vaf[k];
    }
  });
  return out;
}

/** Pearson correlation matrix of columns of a rows x m matrix (Float32Array), NaN-safe. */
export function columnCorrelations(M, rows, m) {
  const mean = new Float64Array(m);
  const sd = new Float64Array(m);
  for (let j = 0; j < m; j += 1) {
    let s = 0;
    for (let i = 0; i < rows; i += 1) s += M[i * m + j];
    mean[j] = s / Math.max(1, rows);
    let s2 = 0;
    for (let i = 0; i < rows; i += 1) s2 += (M[i * m + j] - mean[j]) ** 2;
    sd[j] = Math.sqrt(s2);
  }
  const C = new Float32Array(m * m).fill(NaN);
  for (let a = 0; a < m; a += 1) {
    for (let b = a; b < m; b += 1) {
      if (!(sd[a] > 0 && sd[b] > 0)) continue;
      let s = 0;
      for (let i = 0; i < rows; i += 1) s += (M[i * m + a] - mean[a]) * (M[i * m + b] - mean[b]);
      const r = s / (sd[a] * sd[b]);
      C[a * m + b] = r;
      C[b * m + a] = r;
    }
  }
  return C;
}

// Gene-set colours of the paper figures (Fig 3A); combinations share a muted purple.
const GENE_SET_COLORS = {
  MYCN: "#F2A81D",
  EGFR: "#1BA39C",
  CDK4: "#D7312A",
  MAP3K1: "#6E8B3D",
  PDGFRA: "#5B8BD0",
  RRAS2: "#B0874A",
  MDM2: "#C2185B",
  MYC: "#E67E22",
  CDK6: "#7B1FA2",
  MET: "#00838F",
  Other: "#BFBFBF",
};
const EXTRA_COLORS = ["#4E79A7", "#59A14F", "#9C755F", "#FF9DA7", "#76B7B2", "#EDC948"];
export function geneSetColor(key) {
  if (GENE_SET_COLORS[key]) return GENE_SET_COLORS[key];
  if (`${key}`.includes("+")) return "#9B8AAE";
  let h = 0;
  for (let i = 0; i < `${key}`.length; i += 1) h = (h * 31 + `${key}`.charCodeAt(i)) >>> 0;
  return EXTRA_COLORS[h % EXTRA_COLORS.length];
}
