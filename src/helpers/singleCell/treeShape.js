// Tree-shape and chromosomal-instability statistics per patient, for the
// cohort view: trunk fraction of SNVs, private (one-cell) SNV share, Sackin
// imbalance normalised to its Yule expectation, spread of the local branching
// index, and subclonal / private copy-number events. d3-free.
import { localBranchingIndex } from "./treeFitness";

/** Sackin index over the tumour leaves (sum over leaves of the number of internal nodes above them, within the tumour MRCA's subtree). */
export function sackin(layout, keep) {
  if (!layout?.nodes?.length) return { sackin: NaN, n: 0 };
  const parent = new Int32Array(layout.nodes.length).fill(-1);
  layout.nodes.forEach((node, i) => (node.children || []).forEach((c) => (parent[c] = i)));
  const leafNode = new Map();
  layout.nodes.forEach((node, i) => node.isLeaf && leafNode.set(`${layout.leaves[node.firstLeaf]}`, i));
  const ids = [...keep].filter((id) => leafNode.has(id));
  const n = ids.length;
  if (n < 3) return { sackin: NaN, n };
  // MRCA of the kept leaves
  const anc = (i) => {
    const a = [];
    for (let p = parent[i]; p >= 0; p = parent[p]) a.push(p);
    return a;
  };
  let common = new Set(anc(leafNode.get(ids[0])));
  ids.slice(1).forEach((id) => {
    const a = new Set(anc(leafNode.get(id)));
    common = new Set([...common].filter((x) => a.has(x)));
  });
  const mrca = anc(leafNode.get(ids[0])).find((x) => common.has(x));
  let s = 0;
  ids.forEach((id) => {
    for (let p = parent[leafNode.get(id)]; p >= 0; p = parent[p]) {
      s += 1;
      if (p === mrca) break;
    }
  });
  return { sackin: s, n };
}

/** Expected Sackin index of a Yule tree with n leaves: 2 n sum_{k=2..n} 1/k. */
export function yuleSackin(n) {
  let h = 0;
  for (let k = 2; k <= n; k += 1) h += 1 / k;
  return 2 * n * h;
}

/** Per-patient statistics. variants: snv_matrix variants (category: truncal / subclonal / private / outside_tumor); events: patient filtered events (n_cells, cell_fraction, type). */
export function patientTreeStats({ layout, variants, events, tumourIds }) {
  const out = { nCells: tumourIds?.size ?? 0 };
  if (variants?.length) {
    const cat = (v) => v.category || v.tree_category || null;
    const tum = variants.filter((v) => ["truncal", "subclonal", "private"].includes(cat(v)));
    out.nSnv = tum.length;
    out.trunkFrac = tum.length ? tum.filter((v) => cat(v) === "truncal").length / tum.length : NaN;
    out.privateFrac = tum.length ? tum.filter((v) => cat(v) === "private").length / tum.length : NaN;
  }
  if (layout && tumourIds?.size) {
    const { sackin: s, n } = sackin(layout, tumourIds);
    out.sackinNorm = n >= 3 ? s / yuleSackin(n) : NaN;
    const lbi = localBranchingIndex(layout);
    const vals = [];
    layout.nodes.forEach((node, i) => node.isLeaf && tumourIds.has(`${layout.leaves[node.firstLeaf]}`) && vals.push(lbi[i]));
    const m = vals.reduce((a, b) => a + b, 0) / Math.max(1, vals.length);
    const sd = Math.sqrt(vals.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, vals.length - 1));
    out.lbiCv = m > 0 ? sd / m : NaN;
  }
  if (events?.length) {
    const scna = events.filter((e) => `${e.type || ""}`.toUpperCase() === "SCNA");
    const frac = (e) => Number(e.cell_fraction);
    out.nScna = scna.length;
    // most single-cell SCNA calls sit in one cell; count clonal / subclonal / one-cell tiers rather than a fraction
    out.scnaClonal = scna.filter((e) => frac(e) >= 0.9).length;
    out.scnaSubclonal = scna.filter((e) => frac(e) < 0.9 && Number(e.n_cells) >= 2).length;
    out.scnaPrivate = scna.filter((e) => Number(e.n_cells) === 1).length;
  }
  return out;
}
