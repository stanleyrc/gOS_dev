// Convergent evolution within a patient: the same arm or gene altered
// independently on different branches of the DNA tree. For each event
// (arm gain / loss, focal amplification / homozygous deletion at a gene),
// carriers are the cells with the state; the maximal clades in which >=
// minFrac of cells carry it are its "hits". Two or more hits whose lowest
// common ancestor clade mostly lacks the event (< maxLcaFrac carriers) are
// independent acquisitions. d3-free for tests.
import { binAt } from "./matrix";

export const DEFAULT_CONVERGENCE_GENES = ["EGFR", "PDGFRA", "MET", "CDK4", "MDM2", "MDM4", "MYC", "MYCN", "CDKN2A", "PTEN", "RB1", "NF1", "TP53"];

/** Chromosome arms from cytobands ({ chromosome, startPoint, endPoint, stain }) in global coordinates. */
export function armsFromCytobands(cytobands, chromoBins) {
  const out = [];
  const byChr = new Map();
  (cytobands || []).forEach((b) => {
    const c = `${b.chromosome}`.replace(/^chr/, "");
    if (!chromoBins[c]) return;
    if (!byChr.has(c)) byChr.set(c, { acen: [], end: 0 });
    const e = byChr.get(c);
    e.end = Math.max(e.end, +b.endPoint);
    if (b.stain === "acen") e.acen.push(+b.startPoint, +b.endPoint);
  });
  byChr.forEach((e, c) => {
    const off = chromoBins[c].startPlace;
    const end = Math.min(e.end, chromoBins[c].endPlace - off);
    if (!/^([0-9]{1,2}|X)$/.test(c)) return;
    if (e.acen.length) {
      const c0 = Math.min(...e.acen);
      const c1 = Math.max(...e.acen);
      // acrocentric p arms (13-15, 21, 22) are mostly unassembled: keep q only
      if (!["13", "14", "15", "21", "22"].includes(c) && c0 > 5e6) out.push({ name: `${c}p`, gStart: off, gEnd: off + c0 });
      out.push({ name: `${c}q`, gStart: off + c1, gEnd: off + end });
    } else out.push({ name: c, gStart: off, gEnd: off + end });
  });
  return out;
}

const median = (v) => {
  const s = v.filter(Number.isFinite).sort((a, b) => a - b);
  if (!s.length) return NaN;
  const k = s.length >> 1;
  return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2;
};

/**
 * Per-cell event calls: Map event -> Set(cell ids). Arms: median CN over a
 * 1 Mb grid vs the cell's baseline (median genome-wide CN), gain >= +0.75,
 * loss <= -0.75. Genes: amp when CN >= max(baseline + 3, 2 x baseline), homdel
 * when CN = 0. genePos: gene -> global midpoint.
 */
export function eventCarriers(cn, arms, genePos = new Map(), genes = DEFAULT_CONVERGENCE_GENES, { step = 1e6 } = {}) {
  const out = new Map();
  const add = (k, id) => {
    if (!out.has(k)) out.set(k, new Set());
    out.get(k).add(id);
  };
  if (!cn?.cells) return out;
  cn.cells.forEach((id, k) => {
    const row = cn.rows[k];
    if (!row) return;
    const at = (g) => {
      const b = binAt(row.binIndex, g);
      return b >= 0 ? row.values[b] : NaN;
    };
    const armMed = arms.map((a) => {
      const v = [];
      for (let g = a.gStart + step / 2; g < a.gEnd; g += step) v.push(at(g));
      return median(v);
    });
    const base = Math.round(median(armMed));
    if (!Number.isFinite(base)) return;
    arms.forEach((a, i) => {
      const d = armMed[i] - base;
      if (d >= 0.75) add(`${a.name} gain`, `${id}`);
      else if (d <= -0.75) add(`${a.name} loss`, `${id}`);
    });
    genes.forEach((g) => {
      const pos = genePos.get(g);
      if (!Number.isFinite(pos)) return;
      const v = at(pos);
      if (!Number.isFinite(v)) return;
      if (v >= Math.max(base + 3, 2 * base)) add(`${g} amp`, `${id}`);
      else if (v === 0) add(`${g} homdel`, `${id}`);
    });
  });
  return out;
}

/**
 * Independent hits of each event on the tree: [{ event, hits: [{ node, n,
 * carriers, frac }], lcaNode, lcaFrac, carriers }] for events with >= 2
 * maximal carrier clades whose LCA has < maxLcaFrac carriers.
 * `exclude` = leaf ids left out (normal cells).
 */
export function convergentEvents(layout, carriersByEvent, { minFrac = 0.8, minCells = 3, maxLcaFrac = 0.6, exclude = new Set() } = {}) {
  if (!layout?.nodes?.length) return [];
  const leafOk = layout.leaves.map((id) => !exclude.has(`${id}`));
  const parent = new Array(layout.nodes.length).fill(-1);
  layout.nodes.forEach((n, i) => (n.children || []).forEach((c) => (parent[c] = i)));
  const rootIdx = parent.indexOf(-1);
  const res = [];
  carriersByEvent.forEach((set, event) => {
    const count = (n) => {
      let k = 0;
      let c = 0;
      for (let i = n.firstLeaf; i <= n.lastLeaf; i += 1)
        if (leafOk[i]) {
          k += 1;
          if (set.has(`${layout.leaves[i]}`)) c += 1;
        }
      return [c, k];
    };
    const hits = [];
    const visit = (idx) => {
      const n = layout.nodes[idx];
      const [c, k] = count(n);
      if (k >= minCells && c / k >= minFrac) {
        hits.push({ node: idx, n: k, carriers: c, frac: c / k });
        return;
      }
      (n.children || []).forEach(visit);
    };
    visit(rootIdx);
    if (hits.length < 2) return;
    // LCA of the hits
    const anc = (i) => {
      const a = [];
      for (let p = i; p >= 0; p = parent[p]) a.push(p);
      return a;
    };
    let common = new Set(anc(hits[0].node));
    hits.slice(1).forEach((h) => {
      const a = new Set(anc(h.node));
      common = new Set([...common].filter((x) => a.has(x)));
    });
    const lca = anc(hits[0].node).find((x) => common.has(x));
    const [lc, lk] = count(layout.nodes[lca]);
    const lcaFrac = lk ? lc / lk : 0;
    if (lcaFrac >= maxLcaFrac) return;
    res.push({ event, hits, lcaNode: lca, lcaFrac, carriers: set.size });
  });
  return res.sort((a, b) => b.hits.length - a.hits.length || b.carriers - a.carriers);
}
