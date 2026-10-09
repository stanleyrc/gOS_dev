// What changed on one branch of the tree, judged against its sister clade(s):
// the leaves under the clicked node vs the leaves under the parent's other
// children. Comparing with the sister rather than with "all other cells" holds
// the shared upstream history constant. d3-free so it can be unit tested.
import { binAt } from "./matrix";

/** Leaf ids of the clade under `nodeIdx` and of its sister clades (null at the root). */
export function cladeAndSister(layout, nodeIdx) {
  const node = layout?.nodes?.[nodeIdx];
  if (!node) return null;
  const leavesOf = (n) => layout.leaves.slice(n.firstLeaf, n.lastLeaf + 1).map(String);
  const parentIdx = layout.nodes.findIndex((p) => (p.children || []).includes(nodeIdx));
  const clade = leavesOf(node);
  if (parentIdx < 0) return { clade, sister: [], parent: null };
  const sister = layout.nodes[parentIdx].children.filter((c) => c !== nodeIdx).flatMap((c) => leavesOf(layout.nodes[c]));
  return { clade, sister, parent: parentIdx };
}

const median = (v) => {
  if (!v.length) return NaN;
  const s = [...v].sort((a, b) => a - b);
  const k = s.length >> 1;
  return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2;
};

/**
 * Copy-number differences between clade and sister on a grid of `step` bp:
 * at each point, the median CN of each group and the fraction of clade cells
 * departing from the sister median by >= minDiff in the same direction.
 * Points passing (|median diff| >= minDiff and fraction >= minFrac) merge into
 * segments per chromosome: [{ chromosome, start, end, gStart, gEnd, type
 * ("gain" | "loss"), cladeCn, sisterCn, frac }].
 * cn = { cells, rows: [{ binIndex, values } | null] } (the CN heatmap payload).
 * With no sister profiles and a referenceCn (e.g. 2), the clade is compared with that constant.
 */
export function cnaDiff(
  cn,
  clade,
  sister,
  chromoBins,
  { step = 1e6, minDiff = 0.75, minFrac = 0.6, chromosomes = null, referenceCn = null } = {}
) {
  if (!cn?.cells || !clade.length) return [];
  const rowOf = new Map(cn.cells.map((id, k) => [`${id}`, cn.rows[k]]));
  const A = clade.map((id) => rowOf.get(`${id}`)).filter(Boolean);
  const B = sister.map((id) => rowOf.get(`${id}`)).filter(Boolean);
  // no sister profiles (e.g. the tumour's root against normal cells without CN): compare with a constant reference
  const useRef = !B.length && Number.isFinite(referenceCn);
  if (!A.length || (!B.length && !useRef)) return [];
  const at = (row, g) => {
    const b = binAt(row.binIndex, g);
    return b >= 0 ? row.values[b] : NaN;
  };
  const chroms = (chromosomes || Object.keys(chromoBins)).filter((c) => /^(chr)?([0-9]{1,2}|X)$/.test(c));
  const out = [];
  chroms.forEach((c) => {
    const { startPlace, endPlace } = chromoBins[c];
    let open = null;
    const close = () => {
      if (open) {
        out.push({
          chromosome: c,
          start: open.gStart - startPlace,
          end: open.gEnd - startPlace,
          gStart: open.gStart,
          gEnd: open.gEnd,
          type: open.type,
          cladeCn: median(open.a),
          sisterCn: median(open.b),
          frac: open.f.reduce((s, x) => s + x, 0) / open.f.length,
        });
      }
      open = null;
    };
    for (let g = startPlace + step / 2; g < endPlace; g += step) {
      const a = A.map((r) => at(r, g)).filter(Number.isFinite);
      const b = useRef ? [referenceCn] : B.map((r) => at(r, g)).filter(Number.isFinite);
      if (a.length < Math.max(2, A.length / 2) || !b.length) {
        close();
        continue;
      }
      const ma = median(a);
      const mb = median(b);
      const d = ma - mb;
      const type = d >= minDiff ? "gain" : d <= -minDiff ? "loss" : null;
      const frac = type ? a.filter((x) => (type === "gain" ? x - mb >= minDiff : mb - x >= minDiff)).length / a.length : 0;
      if (!type || frac < minFrac) {
        close();
        continue;
      }
      if (open && open.type !== type) close();
      if (!open) open = { type, gStart: g - step / 2, gEnd: g + step / 2, a: [], b: [], f: [] };
      open.gEnd = Math.min(endPlace, g + step / 2);
      open.a.push(ma);
      open.b.push(mb);
      open.f.push(frac);
    }
    close();
  });
  return out;
}

/**
 * Junctions present in >= minClade of the clade's cells and <= maxSister of the
 * sister's (gained on this branch), or the reverse (lost). junctions = the
 * heatmap payload { cells, junctions, cn: [Float32Array per cell] }.
 */
export function junctionDiff(junctions, clade, sister, { minClade = 0.5, maxSister = 0.1, absentWithoutSister = false } = {}) {
  if (!junctions?.junctions?.length || !clade.length) return [];
  const rowOf = new Map(junctions.cells.map((id, k) => [`${id}`, junctions.cn[k]]));
  const A = clade.map((id) => rowOf.get(`${id}`)).filter(Boolean);
  const B = sister.map((id) => rowOf.get(`${id}`)).filter((r) => r && [...r].some(Number.isFinite));
  // no sister profiles: optionally treat the junctions as absent there (germline reference)
  if (!B.length && !absentWithoutSister) return [];
  const frac = (rows, k) => {
    if (!rows.length) return 0;
    const v = rows.map((r) => r[k]).filter(Number.isFinite);
    return v.length ? v.filter((x) => x > 0).length / v.length : NaN;
  };
  const out = [];
  junctions.junctions.forEach((j, k) => {
    const fa = frac(A, k);
    const fb = frac(B, k);
    if (!Number.isFinite(fa) || !Number.isFinite(fb)) return;
    if (fa >= minClade && fb <= maxSister) out.push({ ...j, cladeFrac: fa, sisterFrac: fb, change: "gained" });
    else if (fb >= minClade && fa <= maxSister) out.push({ ...j, cladeFrac: fa, sisterFrac: fb, change: "lost" });
  });
  return out.sort((x, y) => y.cladeFrac - y.sisterFrac - (x.cladeFrac - x.sisterFrac));
}

/**
 * cis / trans for DE genes: a gene is cis when its locus (global midpoint)
 * lies in one of the branch's CN segments; its expected direction follows the
 * segment (gain -> up, loss -> down). genePos: gene -> global midpoint.
 */
export function cisTrans(deGenes, segments, genePos) {
  return deGenes.map((g) => {
    const pos = genePos.get(g.gene);
    const seg = Number.isFinite(pos) ? segments.find((s) => pos >= s.gStart && pos <= s.gEnd) : null;
    const concordant = seg ? (seg.type === "gain") === (g.avg_log2FC > 0) : null;
    return { ...g, effect: seg ? "cis" : "trans", segment: seg || null, concordant };
  });
}
