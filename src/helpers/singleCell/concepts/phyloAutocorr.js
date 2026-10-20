// Phylogenetic autocorrelation of cell states on a toy tree (Guide > Concepts; PATH, Schiffman et al., Landau lab).
// Weights are the inverse node distance between tips (diagonal 0), normalised to sum 1, as in PATH's
// inv_tree_dist(norm = TRUE). Moran's I of a state indicator x: I = (n / S0) sum_ij w_ij z_i z_j / sum_i z_i^2, z = x - mean.
// Toy trees and states are synthetic and seeded, never patient values. d3-free.

import { makeRng, shuffled } from "./rng";

export const TOY_STATES = ["AC", "MES", "NPC", "OPC"];

/**
 * Toy tree: tips joined by a Yule process (repeatedly split a random lineage), seeded. Each node carries a fixed
 * uniform draw u and a fixed state draw, so the heritability slider changes states smoothly.
 * nodes[i] = { id, parent, children, depth (edges from the root), tip, u, draw }; tips in drawing order.
 */
export function yuleTree(nTips = 30, seed = 3) {
  const rng = makeRng(seed);
  const nodes = [{ id: 0, parent: null, children: [], depth: 0 }];
  let open = [0];
  while (open.length < nTips) {
    const k = Math.floor(rng() * open.length);
    const p = open[k];
    const a = { id: nodes.length, parent: p, children: [], depth: nodes[p].depth + 1 };
    nodes.push(a);
    const b = { id: nodes.length, parent: p, children: [], depth: nodes[p].depth + 1 };
    nodes.push(b);
    nodes[p].children.push(a.id, b.id);
    open = [...open.slice(0, k), a.id, b.id, ...open.slice(k + 1)];
  }
  nodes.forEach((n) => { n.u = rng(); n.draw = Math.floor(rng() * TOY_STATES.length); n.tip = n.children.length === 0; });
  const tips = [];
  const walk = (i) => { if (nodes[i].tip) tips.push(i); else nodes[i].children.forEach(walk); };
  walk(0);
  return { nodes, tips };
}

/** Tree from a nested-array spec, e.g. [["A","B"],["C","D"]] (unit branches); for tests and hand checks. */
export function treeFromNested(spec) {
  const nodes = [];
  const tips = [];
  const make = (x, parent, depth) => {
    const id = nodes.length;
    const n = { id, parent, children: [], depth, tip: !Array.isArray(x), label: Array.isArray(x) ? null : x, u: 0, draw: 0 };
    nodes.push(n);
    if (Array.isArray(x)) x.forEach((c) => n.children.push(make(c, id, depth + 1)));
    else tips.push(id);
    return id;
  };
  make(spec, null, 0);
  return { nodes, tips };
}

/** Node (edge-count) distance between every pair of tips, in tip order. */
export function tipDistances(tree) {
  const { nodes, tips } = tree;
  const ancestors = (i) => { const out = []; for (let x = i; x != null; x = nodes[x].parent) out.push(x); return out; };
  const anc = tips.map(ancestors);
  return tips.map((a, i) => tips.map((b, j) => {
    if (i === j) return 0;
    const set = new Set(anc[i]);
    const lca = anc[j].find((x) => set.has(x));
    return nodes[a].depth + nodes[b].depth - 2 * nodes[lca].depth;
  }));
}

/** Inverse-distance weights, diagonal 0, normalised to sum 1. */
export function inverseDistanceWeights(dist) {
  const w = dist.map((row, i) => row.map((d, j) => (i === j || d <= 0 ? 0 : 1 / d)));
  const s = w.reduce((a, r) => a + r.reduce((b, v) => b + v, 0), 0) || 1;
  return w.map((r) => r.map((v) => v / s));
}

/** Moran's I of numeric x under weights w; null if x has no variance. */
export function moransI(x, w) {
  const n = x.length;
  const mean = x.reduce((a, v) => a + v, 0) / n;
  const z = x.map((v) => v - mean);
  const ss = z.reduce((a, v) => a + v * v, 0);
  if (ss < 1e-12) return null;
  let s0 = 0;
  let num = 0;
  for (let i = 0; i < n; i += 1) for (let j = 0; j < n; j += 1) { s0 += w[i][j]; num += w[i][j] * z[i] * z[j]; }
  return (n / s0) * (num / ss);
}

/** Indicator vector of one state. */
export const indicator = (states, s) => states.map((v) => (v === s ? 1 : 0));

/** Permutation null of Moran's I (states shuffled over the tips): { values, mean, sd, z, p } for the observed I. */
export function permutationNull(x, w, nPerm = 200, seed = 1) {
  const obs = moransI(x, w);
  const rng = makeRng(seed);
  const values = [];
  for (let k = 0; k < nPerm; k += 1) { const v = moransI(shuffled(x, rng), w); if (v != null) values.push(v); }
  const mean = values.reduce((a, v) => a + v, 0) / (values.length || 1);
  const sd = Math.sqrt(values.reduce((a, v) => a + (v - mean) ** 2, 0) / Math.max(1, values.length - 1));
  const z = obs == null || !(sd > 0) ? null : (obs - mean) / sd;
  const p = obs == null ? null : (1 + values.filter((v) => v >= obs).length) / (values.length + 1);
  return { obs, values, mean, sd, z, p };
}

/**
 * Tip states for heritability h in [0, 1]: the root and the first two levels of branches take their own draws (so the
 * toy starts with several founder states); each deeper branch switches to its child's own draw when
 * the child's fixed u is below p = 1 - 0.96 h (h = 0: every branch redraws, tips independent; h = 1: rare switches,
 * whole clades share a state).
 */
export function simulateStates(tree, h) {
  const { nodes, tips } = tree;
  const p = 1 - 0.96 * Math.min(1, Math.max(0, h));
  const st = new Array(nodes.length);
  const walk = (i) => {
    const n = nodes[i];
    st[i] = n.parent == null ? n.draw : (n.depth <= 2 || n.u < p ? n.draw : st[n.parent]);
    n.children.forEach(walk);
  };
  walk(0);
  return tips.map((t) => TOY_STATES[st[t]]);
}

/**
 * PATH-style transition estimate, simplified for teaching: weighted frequencies of state pairs among close relatives
 * (tip pairs at node distance <= maxDist, weight 1 / d), row-normalised, so P[a][b] ~ chance that a close relative of an
 * a-cell is in state b. Strong diagonal = heritable; off-diagonal mass = transitions (or plasticity).
 * PATH itself fits a Markov transition model to these phylogenetic pair statistics.
 */
export function pairTransitions(states, dist, stateList = TOY_STATES, maxDist = 3) {
  const k = stateList.length;
  const idx = Object.fromEntries(stateList.map((s, i) => [s, i]));
  const f = Array.from({ length: k }, () => new Array(k).fill(0));
  for (let i = 0; i < states.length; i += 1) {
    for (let j = 0; j < states.length; j += 1) {
      const d = dist[i][j];
      if (i !== j && d > 0 && d <= maxDist) f[idx[states[i]]][idx[states[j]]] += 1 / d;
    }
  }
  return f.map((row) => { const s = row.reduce((a, v) => a + v, 0); return row.map((v) => (s > 0 ? v / s : null)); });
}

/** Histogram bins of values: [{ x0, x1, n }]. */
export function histogram(values, nBins = 20, lo = null, hi = null) {
  if (!values.length) return [];
  const a = lo ?? Math.min(...values);
  const b = hi ?? Math.max(...values);
  const width = (b - a) / nBins || 1;
  const out = Array.from({ length: nBins }, (_, i) => ({ x0: a + i * width, x1: a + (i + 1) * width, n: 0 }));
  values.forEach((v) => { const i = Math.min(nBins - 1, Math.max(0, Math.floor((v - a) / width))); out[i].n += 1; });
  return out;
}
