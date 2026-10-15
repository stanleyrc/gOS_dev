// Per-site phylogeny-fit metrics from the called genotypes on a tree: how well
// each SNV obeys the phylogeny. Same basis as calledCladeFit (cells with an
// alt or ref call; no-coverage cells never count against a clade).
//   f1        best-clade F1
//   precision carriers inside the best clade / all carriers
//   recall    carriers / called cells in the best clade
//   dropout   1 - recall: called cells of the best clade that are ref
//   outside   carriers outside the best clade (leakage)
//   changes   Fitch parsimony: minimum gains + losses on the tree (no-coverage = wildcard)
//   ci        consistency index = 1 / changes (1 = perfectly compatible; truncal sites 1)
// d3-free so it can be tested on synthetic fixtures.

import { calledCladeFit, callMatrix, rowsOf } from "./treeCompare";
import { yieldToBrowser } from "./rnaStats";

export const MAX_FIT_SITES = 80000;
/** Sites with fewer carriers than this are "unscored" for the clade F1 (too few to say anything). */
export const MIN_FIT_CARRIERS = 3;

/** Fitch parsimony changes of one site. states: Int8Array per leaf row (1 alt, 0 ref, other = missing). */
export function fitchChanges(layout, states, order = null, mask = null) {
  const nodes = layout.nodes;
  const ord = order || nodes.map((_, k) => k).reverse(); // nodes are created parent-first: reverse = children first
  const m = mask || new Uint8Array(nodes.length);
  let changes = 0;
  for (let i = 0; i < ord.length; i += 1) {
    const k = ord[i];
    const n = nodes[k];
    if (n.isLeaf) {
      const st = states[n.firstLeaf];
      m[k] = st === 1 ? 2 : st === 0 ? 1 : 3;
      continue;
    }
    let inter = 3;
    let union = 0;
    for (let j = 0; j < n.children.length; j += 1) {
      const cm = m[n.children[j]];
      inter &= cm;
      union |= cm;
    }
    if (inter) m[k] = inter;
    else {
      m[k] = union;
      changes += 1;
    }
  }
  return changes;
}

/** All metrics of one site given its leaf states. */
export function siteFit(layout, states, scratch = null, minCarriers = MIN_FIT_CARRIERS) {
  const nL = layout.leaves.length;
  const altRows = [];
  const called = new Uint8Array(nL);
  for (let r = 0; r < nL; r += 1) {
    if (states[r] === 1) altRows.push(r);
    if (states[r] === 1 || states[r] === 0) called[r] = 1;
  }
  const k = altRows.length;
  if (!k) return null;
  const best = calledCladeFit(altRows, called, layout);
  const changes = fitchChanges(layout, states, scratch?.order, scratch?.mask);
  const tp = best.inClade;
  return {
    f1: k >= minCarriers ? best.score : NaN,
    precision: best.node == null ? 0 : tp / k,
    recall: best.node == null || !best.called ? 0 : tp / best.called,
    dropout: best.node == null || !best.called ? 1 : 1 - tp / best.called,
    outside: best.node == null ? k : k - tp,
    changes,
    ci: changes > 0 ? 1 / changes : 1,
    carriers: k,
  };
}

const KEYS = ["f1", "precision", "recall", "dropout", "outside", "changes", "ci"];

/**
 * Fit metrics of every site (with >= 1 carrier among the tree's cells) on a
 * tree, in chunks that yield to the browser. More than `maxSites` carrier
 * sites are sampled evenly (`sampled: true`). Sites not scored hold NaN.
 * @param snv { cells, variants, gt|status } store SNV matrix
 * @param layout tree layout (leaves = cell ids)
 * @returns { f1, precision, recall, dropout, outside, changes, ci: Float32Array(nVariants), n, eligible, sampled } | null if cancelled
 */
export async function treeSiteFit(snv, layout, { maxSites = MAX_FIT_SITES, cancelled = null, chunk = 400, minCarriers = MIN_FIT_CARRIERS } = {}) {
  const nV = snv?.variants?.length || 0;
  const out = { n: 0, eligible: 0, sampled: false };
  KEYS.forEach((key) => {
    out[key] = new Float32Array(nV).fill(NaN);
  });
  if (!nV || !layout?.leaves?.length) return out;
  const nL = layout.leaves.length;
  const row = rowsOf(layout);
  const cellRow = Int32Array.from(snv.cells, (id) => row.get(`${id}`) ?? -1);
  const gt = callMatrix(snv);
  const counts = new Int32Array(nV);
  for (let p = 0; p < snv.cells.length; p += 1) {
    if (cellRow[p] < 0) continue;
    const s = gt[p];
    for (let c = 0; c < nV; c += 1) if (s[c] === 1) counts[c] += 1;
  }
  let sites = [];
  for (let c = 0; c < nV; c += 1) if (counts[c] > 0) sites.push(c);
  out.eligible = sites.length;
  if (sites.length > maxSites) {
    const step = sites.length / maxSites;
    sites = Array.from({ length: maxSites }, (_, k) => sites[Math.floor(k * step)]);
    out.sampled = true;
  }
  const scratch = { order: layout.nodes.map((_, k) => k).reverse(), mask: new Uint8Array(layout.nodes.length) };
  for (let i = 0; i < sites.length; i += chunk) {
    const cols = sites.slice(i, i + chunk);
    const states = cols.map(() => new Int8Array(nL).fill(-1));
    for (let p = 0; p < snv.cells.length; p += 1) {
      const r = cellRow[p];
      if (r < 0) continue;
      const s = gt[p];
      for (let k = 0; k < cols.length; k += 1) states[k][r] = s[cols[k]];
    }
    cols.forEach((c, k) => {
      const f = siteFit(layout, states[k], scratch, minCarriers);
      if (!f) return;
      KEYS.forEach((key) => {
        out[key][c] = f[key];
      });
      out.n += 1;
    });
    await yieldToBrowser();
    if (cancelled?.()) return null;
  }
  return out;
}

/** The "Phylogeny-consistent" preset: F1 >= 0.8, at most 2 parsimony changes, at most 2 carriers outside the best clade (single-cell dropout makes CI = 1 too strict). */
export const PHYLO_PRESET = { phylo: { min: 0.8 }, changes: { max: 2 }, outside: { max: 2 } };

/** True when the filter is exactly the preset's keys with its values. */
export const isPhyloPreset = (filter) =>
  Boolean(filter) && filter.phylo?.min === 0.8 && filter.changes?.max === 2 && filter.outside?.max === 2;

/** Fraction of fitted sites passing the preset: { pass, n, fraction }. */
export function presetPassRate(fit) {
  let pass = 0;
  let n = 0;
  if (!fit) return { pass, n, fraction: NaN };
  for (let c = 0; c < fit.f1.length; c += 1) {
    if (!Number.isFinite(fit.f1[c])) continue;
    n += 1;
    if (fit.f1[c] >= 0.8 && fit.changes[c] <= 2 && fit.outside[c] <= 2) pass += 1;
  }
  return { pass, n, fraction: n ? pass / n : NaN };
}
