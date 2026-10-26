// Bootstrap support for the Compare Trees tab. d3-free so it can be unit tested.
//
// data/<P>/trees/support.json is written by srctools inst/gos_single_cell/gos_sc_tree_support.py.
// Per tree: { n_leaves_shared, excluded_leaves, ref_leaf, splits: [{ key, size, fbp, tbe? }] }.
// A split is a bipartition of the shared leaf set S (tree tips present in the bootstrap replicates);
// key = "<size>:<fnv1a32 hex>" of the canonical side's tip names (normalised with tipKey, sorted,
// joined by "|"); the canonical side is the one that does not contain ref_leaf = min(S).

/** Same normalisation as treeCompare.tipKey (lower case, "-" -> "_"); duplicated to keep this file import-free. */
export const supportTipKey = (s) => `${s ?? ""}`.toLowerCase().replace(/-/g, "_");

/** FNV-1a 32-bit over the UTF-8 bytes, as 8 hex digits (matches the exporter). */
export function fnv1a32(text) {
  let h = 0x811c9dc5;
  const bytes = typeof TextEncoder !== "undefined" ? new TextEncoder().encode(text) : Array.from(unescape(encodeURIComponent(text)), (c) => c.charCodeAt(0));
  for (let i = 0; i < bytes.length; i += 1) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** Split key of a list of (already normalised) tip names. */
export function splitKey(names) {
  const nm = [...names].sort();
  return `${nm.length}:${fnv1a32(nm.join("|"))}`;
}

const sortCodePoints = (a) => [...a].sort();

/**
 * Canonical key of the clade `names` within the shared set (sorted array of normalised names, ref = shared[0]);
 * null for trivial splits (side < 2 or > |S| - 2).
 */
export function canonicalKey(names, shared) {
  const n = shared.length;
  const inClade = new Set(names);
  let side = shared.filter((x) => inClade.has(x));
  if (side.length < 2 || side.length > n - 2) return null;
  if (inClade.has(shared[0])) side = shared.filter((x) => !inClade.has(x));
  return splitKey(side);
}

/** Leaf-name lists of every non-root internal node, post-order, as [{ node, names }]. */
function internalNodes(root) {
  const out = [];
  const rec = (node) => {
    if (!node.children || node.children.length === 0) return [node.name];
    const acc = [];
    node.children.forEach((c) => acc.push(...rec(c)));
    out.push({ node, names: acc });
    return acc;
  };
  rec(root);
  out.pop(); // the root
  return out;
}

/**
 * Copy of a parsed tree (tips still carrying the file's names) whose internal nodes carry
 * `support: { fbp, tbe? }` when their clade is a split of `entry`.
 * @returns { root, mapped, internal, ok }; ok is false when the tree does not match the entry
 *   (different shared leaf set or reference leaf), then no node is annotated.
 */
export function annotateSupport(root, entry) {
  const result = { root, mapped: 0, internal: 0, ok: false };
  if (!root || !entry || !Array.isArray(entry.splits)) return result;
  const tips = [];
  const stack = [root];
  while (stack.length) {
    const n = stack.pop();
    if (n.children && n.children.length) n.children.forEach((c) => stack.push(c));
    else tips.push(supportTipKey(n.name));
  }
  const excluded = new Set((entry.excluded_leaves || []).map(supportTipKey));
  const shared = sortCodePoints(tips.filter((t) => !excluded.has(t)));
  if (shared.length < 4 || shared.length !== entry.n_leaves_shared || shared[0] !== supportTipKey(entry.ref_leaf)) return result;
  const byKey = new Map(entry.splits.map((s) => [s.key, s]));
  const supportOf = new Map();
  let internal = 0;
  internalNodes(root).forEach(({ node, names }) => {
    internal += 1;
    const key = canonicalKey(names.map(supportTipKey), shared);
    const hit = key ? byKey.get(key) : null;
    if (hit) supportOf.set(node, { fbp: hit.fbp, tbe: hit.tbe });
  });
  const copy = (n) => {
    if (!n.children || n.children.length === 0) return { ...n, children: [] };
    const c = { ...n, children: n.children.map(copy) };
    if (supportOf.has(n)) c.support = supportOf.get(n);
    return c;
  };
  return { root: copy(root), mapped: supportOf.size, internal, ok: true };
}

/** Support fraction of an annotated node: the bootstrap proportion (fbp), else the transfer bootstrap expectation (tbe; trees whose support comes from TBE only); NaN when neither. */
export const supportValue = (s) => (Number.isFinite(s?.fbp) ? s.fbp : Number.isFinite(s?.tbe) ? s.tbe : NaN);

/** True when the node's support is a TBE value without a Felsenstein bootstrap proportion. */
export const isTbeOnly = (s) => Boolean(s) && !Number.isFinite(s.fbp) && Number.isFinite(s.tbe);

export const SUPPORT_BINS = [
  { key: "lt50", label: "< 50%", max: 0.5 },
  { key: "50-70", label: "50-70%", max: 0.7 },
  { key: "70-90", label: "70-90%", max: 0.9 },
  { key: "ge90", label: ">= 90%", max: Infinity },
];

/** Bin index (0..3) of a support fraction; -1 when there is none. */
export function supportBin(fbp) {
  if (!Number.isFinite(fbp)) return -1;
  return SUPPORT_BINS.findIndex((b) => fbp < b.max);
}

const median = (a) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Per-tree summary over the annotated nodes of a layout: { n, median, nGe70, tbeOnly }. */
export function supportSummary(layout) {
  const vals = [];
  let tbe = 0;
  (layout?.nodes || []).forEach((n) => {
    if (!n.isLeaf && n.parent >= 0 && n.support && Number.isFinite(supportValue(n.support))) {
      vals.push(supportValue(n.support));
      if (isTbeOnly(n.support)) tbe += 1;
    }
  });
  return { n: vals.length, median: median(vals), nGe70: vals.filter((v) => v >= 0.7).length, tbeOnly: vals.length > 0 && tbe === vals.length };
}

/** Canonical keys of the internal non-root nodes of a layout, restricted to the `common` tip set: Map(node id -> key). */
export function layoutCladeKeys(layout, common) {
  const out = new Map();
  if (!layout) return out;
  const shared = sortCodePoints(layout.leaves.filter((l) => common.has(l)).map(supportTipKey));
  if (shared.length < 4) return out;
  layout.nodes.forEach((n) => {
    if (n.isLeaf || n.parent < 0) return;
    const names = layout.leaves.slice(n.firstLeaf, n.lastLeaf + 1).filter((l) => common.has(l)).map(supportTipKey);
    const key = canonicalKey(names, shared);
    if (key) out.set(n.id, key);
  });
  return out;
}

/**
 * Clades of each tree that the other tree lacks (on the cells both contain) and how well supported they are.
 * @returns { a, b } each { total, unique, uniqueLow (support < 50%), uniqueSupported (>= 70%), uniqueNoValue, uniqueIds: Set(node ids) }
 */
export function conflictSummary(layoutA, layoutB, common) {
  const ka = layoutCladeKeys(layoutA, common);
  const kb = layoutCladeKeys(layoutB, common);
  const side = (layout, mine, other) => {
    const keys = new Set(other.values());
    const res = { total: 0, unique: 0, uniqueLow: 0, uniqueSupported: 0, uniqueNoValue: 0, uniqueIds: new Set() };
    const seen = new Set();
    mine.forEach((key, id) => {
      if (seen.has(key)) return;
      seen.add(key);
      res.total += 1;
      if (keys.has(key)) return;
      res.unique += 1;
      res.uniqueIds.add(id);
      const f = supportValue(layout.nodes[id].support);
      if (!Number.isFinite(f)) res.uniqueNoValue += 1;
      else if (f < 0.5) res.uniqueLow += 1;
      else if (f >= 0.7) res.uniqueSupported += 1;
    });
    return res;
  };
  return { a: side(layoutA, ka, kb), b: side(layoutB, kb, ka) };
}

/** Whether the drawn tree is sparse enough to print percentages next to the nodes. */
export const labelSupport = (nInternal) => nInternal > 0 && nInternal <= 60;
