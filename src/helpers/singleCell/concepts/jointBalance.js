// Joint junction balance across cells (Guide > Concepts), on toy cells only.
// Each cell segmented alone puts its breakpoints a few bins off the true breakend, so no junction lands exactly on
// them: every breakpoint is a loose end, and the union of all cells' breakpoints (the disjoint segmentation of
// Dewhurst et al., Cancer Discov 2021) is fragmented into slivers. Junctions are shared by all cells, so a joint fit
// uses one segmentation whose breakpoints are the junction breakends: per-cell breakpoints within a tolerance snap to
// the shared breakend, the rest (no junction, no coverage support) are dropped. Synthetic and seeded. d3-free.

import { gaussian, makeRng } from "./rng";

/** Sorted unique union of breakpoint lists (a breakpoint b is the boundary before bin b). */
export function disjoin(lists) {
  return Array.from(new Set(lists.flat())).sort((a, b) => a - b);
}

/** Segments [start, end) of nBins bins cut at the given breakpoints. */
export function segmentsFrom(breaks, nBins) {
  const cuts = [0, ...breaks.filter((b) => b > 0 && b < nBins), nBins];
  const out = [];
  for (let i = 0; i < cuts.length - 1; i += 1) if (cuts[i + 1] > cuts[i]) out.push({ start: cuts[i], end: cuts[i + 1] });
  return out;
}

/** Map each breakpoint to the nearest breakend within tol (ties to the lower one); null if none. */
export function snapToBreakends(breaks, breakends, tol) {
  return breaks.map((b) => {
    let best = null;
    breakends.forEach((e) => {
      const d = Math.abs(e - b);
      if (d <= tol && (best == null || d < Math.abs(best - b))) best = e;
    });
    return best;
  });
}

/** Rounded mean coverage of each segment: per-bin integer CN array of length nBins. */
export function cnBySegments(cov, segments) {
  const out = new Array(cov.length).fill(0);
  segments.forEach((s) => {
    let sum = 0;
    for (let i = s.start; i < s.end; i += 1) sum += cov[i];
    const cn = Math.max(0, Math.round(sum / (s.end - s.start)));
    for (let i = s.start; i < s.end; i += 1) out[i] = cn;
  });
  return out;
}

/** Breakpoints of a per-bin CN profile (bins where the value changes). */
export function changePoints(profile) {
  const out = [];
  for (let i = 1; i < profile.length; i += 1) if (profile[i] !== profile[i - 1]) out.push(i);
  return out;
}

export const TOY_BREAKENDS = [14, 28, 44];

/**
 * Four toy cells over 60 bins sharing three junction breakends (14, 28, 44): a tandem duplication 14-28 (one copy in
 * cells 1-2, two in cell 3), a duplication 28-44 (cell 3) and a terminal loss from 44 (cells 1 and 4). Each cell's own
 * segmentation is the true breakpoints moved by up to `jitter` bins, plus one spurious breakpoint in cell 2.
 */
export function toyCells({ seed = 11, nBins = 60, jitter = 2, noise = 0.25 } = {}) {
  const rng = makeRng(seed);
  const base = () => new Array(nBins).fill(2);
  const add = (p, a, b, d) => { for (let i = a; i < b; i += 1) p[i] += d; return p; };
  const truths = [
    add(add(base(), 14, 28, 1), 44, nBins, -1),
    add(base(), 14, 28, 1),
    add(add(base(), 14, 28, 2), 28, 44, 1),
    add(base(), 44, nBins, -1),
  ];
  return truths.map((truth, k) => {
    const cov = truth.map((c) => c + noise * gaussian(rng));
    const own = changePoints(truth).map((b) => {
      const shift = Math.round((rng() * 2 - 1) * jitter);
      return Math.min(nBins - 1, Math.max(1, b + shift));
    });
    if (k === 1) own.push(36);
    const breaks = Array.from(new Set(own)).sort((a, b) => a - b);
    return { id: `cell ${k + 1}`, truth, cov, breaks, cn: cnBySegments(cov, segmentsFrom(breaks, nBins)) };
  });
}

/**
 * The three views of the toy: per cell (own breakpoints), disjoint (union of all breakpoints, each cell's own CN) and
 * joint (breakpoints snapped to the shared breakends; unmatched ones dropped; CN refit per shared segment).
 * Loose ends = breakpoints not on a junction breakend, counted per cell.
 */
export function jointViews(cells, breakends = TOY_BREAKENDS, tol = 3) {
  const nBins = cells[0]?.cov.length || 0;
  const onBreakend = (b) => breakends.includes(b);
  const perCell = cells.map((c) => ({ id: c.id, breaks: c.breaks, cn: c.cn, loose: c.breaks.filter((b) => !onBreakend(b)) }));
  const union = disjoin(cells.map((c) => c.breaks));
  const disjoint = cells.map((c) => ({ id: c.id, breaks: union, cn: c.cn, loose: c.breaks.filter((b) => !onBreakend(b)) }));
  const snapped = cells.map((c) => snapToBreakends(c.breaks, breakends, tol));
  const shared = disjoin(snapped.map((s) => s.filter((b) => b != null)));
  const segs = segmentsFrom(shared, nBins);
  const joint = cells.map((c, k) => ({ id: c.id, breaks: shared, cn: cnBySegments(c.cov, segs), loose: [], dropped: c.breaks.filter((_, i) => snapped[k][i] == null) }));
  const count = (rows) => rows.reduce((a, r) => a + r.loose.length, 0);
  return {
    nBins,
    perCell: { rows: perCell, nSegments: perCell.reduce((a, r) => a + r.breaks.length + 1, 0), loose: count(perCell) },
    disjoint: { rows: disjoint, nSegments: union.length + 1, loose: count(disjoint) },
    joint: { rows: joint, nSegments: shared.length + 1, loose: 0, dropped: joint.reduce((a, r) => a + r.dropped.length, 0) },
  };
}
