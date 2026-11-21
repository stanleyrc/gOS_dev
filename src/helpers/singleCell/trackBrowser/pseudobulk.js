// Clade pseudobulk of per-cell genome graphs inside the windows (interim, until gCells G1 exports pseudobulk
// graphs): CN = median (and quartiles) across member cells per elementary interval; junctions = ALT edges merged
// across cells within `tol` bp, support = number of member cells carrying them. d3-free (jest).
import { graphInWindows, sameJunction } from "./trackData";

function quantileSorted(v, q) {
  if (!v.length) return null;
  const i = (v.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return v[lo] + (v[hi] - v[lo]) * (i - lo);
}

/**
 * graphs: [gGnome.js JSON] of the member cells (missing ones skipped). slots: laid-out windows.
 * Returns { n, steps: [{ slot, start, end, median, q1, q3, n }], junctions: [{ a, b, title, cells, frac, cnMedian }] }.
 */
export function pseudobulkInWindows(graphs, slots, tol = 1000) {
  const members = (graphs || []).filter(Boolean).map((g) => graphInWindows(g, slots));
  const n = members.length;
  const out = { n, steps: [], junctions: [] };
  if (!n) return out;
  slots.forEach((s, k) => {
    const cuts = new Set([s.window.start, s.window.end + 1]);
    members.forEach((m) => m.segments.forEach((sg) => {
      if (sg.slot !== k) return;
      cuts.add(sg.start);
      cuts.add(sg.end + 1);
    }));
    const edges = [...cuts].sort((a, b) => a - b);
    for (let i = 0; i < edges.length - 1; i += 1) {
      const a = edges[i];
      const b = edges[i + 1] - 1;
      if (b < a) continue;
      const mid = (a + b) / 2;
      const vals = [];
      members.forEach((m) => {
        const sg = m.segments.find((x) => x.slot === k && x.start <= mid && x.end >= mid);
        if (sg && Number.isFinite(sg.cn)) vals.push(sg.cn);
      });
      if (!vals.length) continue;
      vals.sort((x, y) => x - y);
      const step = { slot: k, start: a, end: b, median: quantileSorted(vals, 0.5), q1: quantileSorted(vals, 0.25), q3: quantileSorted(vals, 0.75), n: vals.length };
      const prev = out.steps[out.steps.length - 1];
      if (prev && prev.slot === k && prev.median === step.median && prev.q1 === step.q1 && prev.q3 === step.q3 && prev.end + 1 === a) prev.end = b;
      else out.steps.push(step);
    }
  });
  members.forEach((m) => {
    const seen = new Set();
    m.alts.forEach((alt) => {
      let j = out.junctions.findIndex((x) => sameJunction(x, alt, tol));
      if (j < 0) {
        out.junctions.push({ a: alt.a, b: alt.b, title: alt.title, cells: 0, cns: [] });
        j = out.junctions.length - 1;
      }
      if (seen.has(j)) return; // one vote per cell
      seen.add(j);
      out.junctions[j].cells += 1;
      if (Number.isFinite(alt.cn)) out.junctions[j].cns.push(alt.cn);
    });
  });
  out.junctions.forEach((j) => {
    j.frac = j.cells / n;
    const v = j.cns.sort((x, y) => x - y);
    j.cnMedian = quantileSorted(v, 0.5);
    delete j.cns;
  });
  out.junctions.sort((x, y) => x.cells - y.cells); // most supported drawn last (on top)
  return out;
}
