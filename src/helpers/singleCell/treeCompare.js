import { isDarkLike } from "./plotTheme";
// Compare two phylogenies of the same cells (tab "Compare Trees"): tanglegram
// geometry, clade picking, mutation painting and per-tree concordance of SNVs
// with the tree. d3-free so it can be unit tested.
//
// The alternative trees come from data/<P>/trees/<name>.nwk (srctools
// gos_sc_alt_trees.R), tips already renamed to the gOS cell IDs; the current
// pipeline tree is the one of the single-cell store.
import { layoutTree, leafNames, parseNewick, pruneTree, rotateByLeafRank } from "./newick";
import { yieldToBrowser } from "./rnaStats";
import { driverKey, driverLabel, splitIds } from "./driverContrast";

export const CURRENT_TREE = "gos";
/** SNVs need this many carriers (in the tree) to be scored for concordance. */
export const MIN_CARRIERS = 10;
/** At most this many SNVs are scored per tree; more are sampled evenly. */
export const MAX_SCORED_SITES = 20000;
export const MAX_PAINTED = 8;

/** Entries of trees/index.json that can be drawn: the current tree and files with enough matched tips. */
export function usableTrees(index) {
  return (Array.isArray(index) ? index : []).filter((t) => t && t.name && (t.name === CURRENT_TREE || t.n_matched >= 3));
}

/** Jake's 26 Oct 2026 TBE tree (all cells): default tree B. */
export const JAKE_TBE_TREE = "jake_tbe_261026";

/**
 * Default tree B: Jake's 26 Oct TBE tree when this patient has it, else his older trees
 * (jake_latest, else jake_old), else the first other tree.
 */
export function defaultTreeB(trees, a = CURRENT_TREE) {
  const names = (trees || []).map((t) => t.name);
  const pick = [JAKE_TBE_TREE, "jake_latest", "jake_old"].find((n) => names.includes(n) && n !== a);
  return pick || names.find((n) => n !== a) || null;
}

/** Default pair: the pipeline tree (as drawn in the Single-Cell tab) against defaultTreeB. */
export function defaultPair(trees) {
  const names = (trees || []).map((t) => t.name);
  const a = names.includes(CURRENT_TREE) ? CURRENT_TREE : names[0] || null;
  return [a, defaultTreeB(trees, a)];
}

/** Tip-name key tolerant to the case / separator differences between trees (10A vs 10a, pool-Q vs pool_Q). */
export const tipKey = (s) => `${s ?? ""}`.toLowerCase().replace(/-/g, "_");

/**
 * Rename a parsed tree's tips to the ids in `ids` where they match
 * case-insensitively, and prune the unknown ones.
 * @returns { root, matched, total }; root is null when fewer than 2 tips remain
 */
export function alignTipNames(root, ids) {
  const byKey = new Map();
  ids.forEach((id) => {
    if (!byKey.has(tipKey(id))) byKey.set(tipKey(id), `${id}`);
  });
  const names = leafNames(root);
  const rename = (n) => {
    if (!n.children || !n.children.length) return { ...n, name: byKey.get(tipKey(n.name)) ?? n.name, children: [] };
    return { ...n, children: n.children.map(rename) };
  };
  const renamed = rename(root);
  const keep = new Set([...byKey.values()]);
  const pruned = pruneTree(renamed, keep);
  const matched = pruned ? leafNames(pruned).length : 0;
  return { root: matched >= 2 ? pruned : null, matched, total: names.length };
}

/** Parse a Newick string and align its tips to the cell ids. */
export function treeFromNewick(text, ids) {
  return alignTipNames(parseNewick(text), ids);
}

/** leaf name -> row, for a layout. */
export const rowsOf = (layout) => new Map((layout?.leaves || []).map((id, i) => [id, i]));

/**
 * Rotate `root` (children order only) so its leaves follow the row order of a
 * reference layout: each node's children are sorted by the mean reference row
 * of their leaves (the barycentre heuristic; leaves the reference lacks go last).
 */
export function orientToReference(root, refLayout) {
  const rank = rowsOf(refLayout);
  return rotateByLeafRank(root, (name) => rank.get(name));
}

/** Prune a tree to a cell set (null set = keep all) and lay it out. */
export function layoutFor(root, keep = null) {
  const pruned = keep ? pruneTree(root, keep) : root;
  return pruned ? layoutTree(pruned) : null;
}

/** Cells present in both layouts. */
export function sharedCells(layoutA, layoutB) {
  if (!layoutA || !layoutB) return new Set();
  const inB = new Set(layoutB.leaves);
  return new Set(layoutA.leaves.filter((id) => inB.has(id)));
}

/** Tanglegram links of the cells both trees have: [{ id, a, b }] with the leaf rows of each tree. */
export function tanglegramLinks(layoutA, layoutB) {
  if (!layoutA || !layoutB) return [];
  const rb = rowsOf(layoutB);
  const out = [];
  layoutA.leaves.forEach((id, a) => {
    const b = rb.get(id);
    if (b != null) out.push({ id, a, b });
  });
  return out;
}

/** Number of crossing link pairs (inversions of the B rows in A order), O(n log n). */
export function countCrossings(links) {
  const sorted = [...links].sort((p, q) => p.a - q.a);
  const bs = sorted.map((l) => l.b);
  const max = bs.reduce((m, v) => Math.max(m, v), 0) + 2;
  const tree = new Int32Array(max + 1); // Fenwick tree over B rows
  let crossings = 0;
  for (let i = bs.length - 1; i >= 0; i -= 1) {
    for (let k = bs[i]; k > 0; k -= k & -k) crossings += tree[k]; // seen later with a smaller B row
    for (let k = bs[i] + 1; k <= max; k += k & -k) tree[k] += 1;
  }
  return crossings;
}

/**
 * Deepest node of a leaf's lineage whose branch spans x (data units): the
 * clade a click at x on that leaf's row picks. Right of the tip it is the leaf.
 */
export function cladeAt(layout, row, x) {
  if (!layout || row == null || row < 0 || row >= layout.leaves.length) return null;
  const leaf = layout.nodes.find((n) => n.isLeaf && n.firstLeaf === row);
  if (!leaf) return null;
  let n = leaf;
  while (n.parent >= 0 && x < layout.nodes[n.parent].x) n = layout.nodes[n.parent];
  return n.id;
}

/** Cell ids of the clade under a node. */
export function cladeCells(layout, nodeId) {
  const n = layout?.nodes?.[nodeId];
  return n ? layout.leaves.slice(n.firstLeaf, n.lastLeaf + 1) : [];
}

/**
 * Per-cell x site calls: the PL genotype calls (1 alt, 0 ref, -1 none) when the
 * matrix has them, else the read-based status. The genotype calls are what the
 * QC analysis (consistency_tree.py) scores; read-based status calls any single
 * alt read an alt, which makes far more (noisier) carriers.
 */
export const callMatrix = (snv) => snv?.gt || snv?.status;

/** Lookup of cell id -> row of the SNV matrix. */
export const snvCellIndex = (snv) => new Map((snv?.cells || []).map((id, i) => [`${id}`, i]));

/**
 * Best-clade F1 of carriers against internal clades, counting only cells with a
 * call (alt or ref) as clade members: F1 = 2 tp / (carriers + called cells in the
 * clade). No-coverage cells do not count against a clade; clades holding under
 * half the carriers are skipped. This is the metric of
 * analysis/qc_bwh69/consistency_tree.py (cladeFit.js divides by the whole clade
 * size, so no-coverage cells lower it).
 * @param altRows ascending leaf rows of the carriers; calledRows Uint8Array(nLeaves), 1 = alt or ref call
 */
export function calledCladeFit(altRows, calledRows, layout) {
  const k = altRows.length;
  const nL = layout?.leaves?.length || 0;
  if (!k || !nL) return { score: NaN, node: null, clade: 0, inClade: 0, carriers: 0 };
  const A = new Int32Array(nL + 1);
  const C = new Int32Array(nL + 1);
  let j = 0;
  for (let i = 0; i < nL; i += 1) {
    if (j < k && altRows[j] === i) j += 1;
    A[i + 1] = j;
    C[i + 1] = C[i] + (calledRows[i] ? 1 : 0);
  }
  let best = { score: 0, node: null, clade: 0, inClade: 0, called: 0 };
  layout.nodes.forEach((n, id) => {
    if (n.isLeaf) return;
    const tp = A[n.lastLeaf + 1] - A[n.firstLeaf];
    if (tp < k * 0.5) return;
    const f1 = (2 * tp) / (k + C[n.lastLeaf + 1] - C[n.firstLeaf]);
    if (f1 > best.score) best = { score: f1, node: id, clade: n.lastLeaf - n.firstLeaf + 1, inClade: tp, called: C[n.lastLeaf + 1] - C[n.firstLeaf] };
  });
  return { ...best, carriers: k };
}

/**
 * Per-leaf status of one SNV: 1 alt, 0 ref, -1 no coverage (the heatmap's
 * convention); cells the matrix does not have are -1.
 */
export function snvLeafStates(snv, leaves, variantIndex, cellIndex = snvCellIndex(snv)) {
  return Int8Array.from(leaves, (id) => {
    const p = cellIndex.get(`${id}`);
    return p == null ? -1 : callMatrix(snv)[p][variantIndex];
  });
}

/** Per-leaf status of a filtered event: 1 carrier, 0 other cell (events have no coverage notion). */
export function eventLeafStates(event, leaves) {
  const carriers = new Set(splitIds(event?.cell_ids));
  return Int8Array.from(leaves, (id) => (carriers.has(`${id}`) ? 1 : 0));
}

/** Short display name of an SNV: "EGFR A289V chr7:55,181,378 G>A" (gene / protein only when annotated). */
export function snvLabel(v) {
  const gene = v.gene && !/^ENSG/.test(v.gene) ? v.gene : "";
  const where = v.chromosome != null && v.position != null ? `${v.chromosome}:${Number(v.position).toLocaleString("en-US")}` : v.id;
  const change = v.ref && v.alt ? `${v.ref}>${v.alt}` : "";
  return [gene, v.protein, where, change].filter(Boolean).join(" ");
}

/**
 * SNVs matching a search text (gene, protein, id, consequence), driver SNVs
 * first, then the most prevalent. Empty text lists the drivers.
 */
export function searchSnvs(variants, text, limit = 60) {
  const q = `${text || ""}`.trim().toLowerCase();
  const terms = q.split(/\s+/).filter(Boolean);
  const hay = (v) => `${v.gene || ""} ${v.protein || ""} ${v.id || ""} ${v.chromosome}:${v.position} ${v.consequence || ""}`.toLowerCase();
  const rank = (v) => (v.driver ? 0 : 1);
  const hits = (variants || []).filter((v) => {
    if (!terms.length) return v.driver;
    const h = hay(v);
    return terms.every((t) => h.includes(t));
  });
  return hits
    .sort((a, b) => rank(a) - rank(b) || (b.altCells ?? 0) - (a.altCells ?? 0) || a.index - b.index)
    .slice(0, limit);
}

/** Filtered events that mark cells, as { key, label, event }, lowest tier first. */
export function eventChoices(events) {
  const seen = new Set();
  const out = [];
  (events || []).forEach((e) => {
    if (!splitIds(e.cell_ids).length) return;
    const key = driverKey(e);
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ key, label: driverLabel(e), tier: Number(e.Tier) || 9, event: e });
  });
  return out.sort((a, b) => a.tier - b.tier || a.label.localeCompare(b.label));
}

/** Median of the finite values (NaN when none). */
export function median(values) {
  const v = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return NaN;
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/**
 * Concordance of a tree with the SNVs: the best-clade F1 of every SNV with at
 * least `minCarriers` carriers among the tree's cells, and their median.
 * Yields to the browser between chunks. More than `maxSites` qualifying SNVs
 * are sampled evenly (`sampled: true`).
 * @param snv { cells, variants, status } store SNV matrix
 * @param layout tree layout (leaves = cell ids)
 * @param cancelled optional () => bool; true stops early (returns null)
 * @returns { scores: Map(variantIndex -> F1), median, n, eligible, sampled } | null
 */
export async function treeConcordance(snv, layout, { minCarriers = MIN_CARRIERS, maxSites = MAX_SCORED_SITES, cancelled = null } = {}) {
  if (!snv?.variants?.length || !layout?.leaves?.length) return { scores: new Map(), median: NaN, n: 0, eligible: 0, sampled: false };
  const nV = snv.variants.length;
  const row = rowsOf(layout);
  const cellRow = Int32Array.from(snv.cells, (id) => row.get(`${id}`) ?? -1);
  // carriers per site among this tree's cells (cell-major: contiguous status rows)
  const counts = new Int32Array(nV);
  for (let p = 0; p < snv.cells.length; p += 1) {
    if (cellRow[p] >= 0) {
      const s = callMatrix(snv)[p];
      for (let c = 0; c < nV; c += 1) if (s[c] === 1) counts[c] += 1;
    }
    if (p % 200 === 199) {
      await yieldToBrowser();
      if (cancelled?.()) return null;
    }
  }
  let sites = [];
  for (let c = 0; c < nV; c += 1) if (counts[c] >= minCarriers) sites.push(c);
  const eligible = sites.length;
  const sampled = eligible > maxSites;
  if (sampled) {
    const step = eligible / maxSites;
    sites = Array.from({ length: maxSites }, (_, k) => sites[Math.floor(k * step)]);
  }
  const scores = new Map();
  const CHUNK = 1000;
  for (let i = 0; i < sites.length; i += CHUNK) {
    const chunk = sites.slice(i, i + CHUNK);
    const lists = chunk.map(() => []);
    const called = chunk.map(() => new Uint8Array(layout.leaves.length));
    for (let p = 0; p < snv.cells.length; p += 1) {
      if (cellRow[p] < 0) continue;
      const s = callMatrix(snv)[p];
      for (let k = 0; k < chunk.length; k += 1) {
        const st = s[chunk[k]];
        if (st === 1) lists[k].push(cellRow[p]);
        if (st === 1 || st === 0) called[k][cellRow[p]] = 1;
      }
    }
    chunk.forEach((c, k) => {
      lists[k].sort((a, b) => a - b);
      scores.set(c, calledCladeFit(lists[k], called[k], layout).score);
    });
    await yieldToBrowser();
    if (cancelled?.()) return null;
  }
  return { scores, median: median([...scores.values()]), n: scores.size, eligible, sampled };
}

/** Best-clade F1 of one SNV on a tree layout (same metric as treeConcordance): { score, carriers, clade, node }. */
export function snvConcordance(snv, layout, variantIndex) {
  const row = rowsOf(layout);
  const rows = [];
  const called = new Uint8Array(layout.leaves.length);
  snv.cells.forEach((id, p) => {
    const r = row.get(`${id}`);
    if (r == null) return;
    const st = callMatrix(snv)[p][variantIndex];
    if (st === 1) rows.push(r);
    if (st === 1 || st === 0) called[r] = 1;
  });
  rows.sort((a, b) => a - b);
  return calledCladeFit(rows, called, layout);
}

/** "0.84" / "n/a" */
export const fmtF1 = (x) => (Number.isFinite(x) ? x.toFixed(2) : "n/a");

/** Colours of the painted mutation columns (alt / ref / no coverage), as the SNV heatmap's present / absent / missing. */
export function paintColors(mode = "light") {
  return isDarkLike(mode)
    ? { alt: "#ff7875", ref: "#2f4b6e", none: "#191919" }
    : { alt: "#B2182B", ref: "#C6DBEF", none: "#F5F5F5" };
}

/** Consecutive runs of rows: [3, 4, 5, 9] -> [[3, 5], [9, 9]]. */
export function rowRuns(rows) {
  const sorted = [...new Set(rows)].sort((a, b) => a - b);
  const out = [];
  sorted.forEach((r) => {
    const last = out[out.length - 1];
    if (last && r === last[1] + 1) last[1] = r;
    else out.push([r, r]);
  });
  return out;
}

/** Per node: the clone shared by all its leaves, or null when mixed / unknown. */
export function nodeCloneKeys(layout, cloneOf) {
  const out = new Array(layout.nodes.length).fill(null);
  for (let k = layout.nodes.length - 1; k >= 0; k -= 1) {
    const n = layout.nodes[k];
    if (n.isLeaf) {
      out[k] = cloneOf(n.name) ?? null;
    } else {
      const first = out[n.children[0]];
      out[k] = first != null && n.children.every((c) => out[c] === first) ? first : null;
    }
  }
  return out;
}

/**
 * Branch drawing of a rectangular tree as SVG path data grouped by colour.
 * @param px data x -> pixel x; py leaf row (may be fractional) -> pixel y
 * @param colorOf node id -> colour string
 * @returns Map(colour -> "M x y H x M ..." path)
 */
export function branchPaths(layout, px, py, colorOf) {
  const parts = new Map();
  const add = (color, d) => parts.set(color, `${parts.get(color) || ""}${d}`);
  const f = (v) => Math.round(v * 10) / 10;
  layout.nodes.forEach((n) => {
    const y = py(n.y + 0.5);
    const color = colorOf(n.id);
    if (n.parent >= 0) {
      const x0 = px(layout.nodes[n.parent].x);
      add(color, `M${f(x0)} ${f(y)}H${f(px(n.x))}`);
    }
    if (n.children.length) {
      const ys = n.children.map((c) => py(layout.nodes[c].y + 0.5));
      add(color, `M${f(px(n.x))} ${f(Math.min(...ys))}V${f(Math.max(...ys))}`);
    }
  });
  return parts;
}

/** Copy of a tree without branch lengths (a cladogram: tips align at the right). */
export function stripLengths(root) {
  const copy = (n) => ({ ...n, length: null, children: (n.children || []).map(copy) });
  return copy(root);
}

/**
 * Rotate both trees to minimise tanglegram crossings: alternately order B by
 * the barycentre of A's rows and A by B's, several sweeps, keeping the best
 * pair seen (the original orientation included). With `fixA` tree A keeps its
 * own order (the Single-Cell tab's drawing of the pipeline tree) and only B is rotated.
 * @returns { rootA, rootB, before, after } crossings of the original / best orientation
 */
export function optimizeRotation(rootA, rootB, sweeps = 8, fixA = false) {
  const cross = (la, lb) => countCrossings(tanglegramLinks(la, lb));
  let la = layoutTree(rootA);
  let lb = layoutTree(rootB);
  const before = cross(la, lb);
  let best = { rootA, rootB, c: before };
  let a = rootA;
  let b = rootB;
  for (let i = 0; i < sweeps && best.c > 0; i += 1) {
    b = orientToReference(b, la);
    lb = layoutTree(b);
    let c = cross(la, lb);
    if (c < best.c) best = { rootA: a, rootB: b, c };
    if (fixA) break; // B is oriented to A's fixed order; nothing more to gain
    a = orientToReference(a, lb);
    la = layoutTree(a);
    c = cross(la, lb);
    if (c < best.c) best = { rootA: a, rootB: b, c };
  }
  return { rootA: best.rootA, rootB: best.rootB, before, after: best.c };
}
