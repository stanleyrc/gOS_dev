// Compare two phylogenies of the same cells (tab "Compare Trees"): tanglegram
// geometry, clade picking, mutation painting and per-tree concordance of SNVs
// with the tree. d3-free so it can be unit tested.
//
// The alternative trees come from data/<P>/trees/<name>.nwk (srctools
// gos_sc_alt_trees.R), tips already renamed to the gOS cell IDs; the current
// pipeline tree is the one of the single-cell store.
import { layoutTree, leafNames, parseNewick, pruneTree, rotateByLeafRank } from "./newick";
import { cladeFitFromRows } from "./cladeFit";
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

/** Default pair: the pipeline tree against Jake's latest (else the first other tree). */
export function defaultPair(trees) {
  const names = (trees || []).map((t) => t.name);
  const a = names.includes(CURRENT_TREE) ? CURRENT_TREE : names[0] || null;
  const b = names.includes("jake_latest") && a !== "jake_latest" ? "jake_latest" : names.find((n) => n !== a) || null;
  return [a, b];
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

/** Lookup of cell id -> row of the SNV matrix. */
export const snvCellIndex = (snv) => new Map((snv?.cells || []).map((id, i) => [`${id}`, i]));

/**
 * Per-leaf status of one SNV: 1 alt, 0 ref, -1 no coverage (the heatmap's
 * convention); cells the matrix does not have are -1.
 */
export function snvLeafStates(snv, leaves, variantIndex, cellIndex = snvCellIndex(snv)) {
  return Int8Array.from(leaves, (id) => {
    const p = cellIndex.get(`${id}`);
    return p == null ? -1 : snv.status[p][variantIndex];
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
      const s = snv.status[p];
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
    for (let p = 0; p < snv.cells.length; p += 1) {
      if (cellRow[p] < 0) continue;
      const s = snv.status[p];
      for (let k = 0; k < chunk.length; k += 1) if (s[chunk[k]] === 1) lists[k].push(cellRow[p]);
    }
    chunk.forEach((c, k) => {
      lists[k].sort((a, b) => a - b);
      scores.set(c, cladeFitFromRows(lists[k], layout).score);
    });
    await yieldToBrowser();
    if (cancelled?.()) return null;
  }
  return { scores, median: median([...scores.values()]), n: scores.size, eligible, sampled };
}

/** Best-clade F1 of one SNV on a tree layout: { score, carriers, clade, node } (carriers = alt cells in the tree). */
export function snvConcordance(snv, layout, variantIndex) {
  const row = rowsOf(layout);
  const rows = [];
  snv.cells.forEach((id, p) => {
    const r = row.get(`${id}`);
    if (r != null && snv.status[p][variantIndex] === 1) rows.push(r);
  });
  rows.sort((a, b) => a - b);
  return cladeFitFromRows(rows, layout);
}

/** "0.84" / "n/a" */
export const fmtF1 = (x) => (Number.isFinite(x) ? x.toFixed(2) : "n/a");

/** Colours of the painted mutation columns (alt / ref / no coverage), as the SNV heatmap's present / absent / missing. */
export function paintColors(mode = "light") {
  return mode === "dark"
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
