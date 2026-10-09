// Molecular timing along the tree from clock-like mutations (SBS1, SBS5):
// mutations that accumulate at a roughly constant rate per division, so their
// count measures time. Per-cell detection is incomplete (PTA dropout, ~10x),
// so each cell's sensitivity is estimated from the truncal sites it detects
// (every tumour cell carries them). d3-free.

export const CLOCK_SIGNATURES = ["SBS1", "SBS5"];

const median = (xs) => {
  const s = xs.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (!s.length) return NaN;
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

/** Indices of SNV sites whose assigned signature is clock-like. */
export function clockSites(signatureOf, clock = CLOCK_SIGNATURES) {
  const set = new Set(clock);
  const out = [];
  (signatureOf || []).forEach((s, c) => s && set.has(s) && out.push(c));
  return out;
}

/**
 * Per tumour cell (matrix row): sensitivity = detected truncal sites / truncal
 * sites; post-trunk clock SNVs detected and corrected (/ sensitivity).
 * status[row][site] === 1 means alt reads in that cell.
 */
export function cellClockBurden(snv, rows, clock) {
  const truncal = [];
  const clockSet = new Set(clock);
  snv.variants.forEach((v, c) => v.category === "truncal" && truncal.push(c));
  return rows.map((r) => {
    if (r < 0) return null;
    const st = snv.status[r];
    const det = truncal.filter((c) => st[c] === 1).length;
    const sens = truncal.length ? det / truncal.length : NaN;
    let post = 0;
    let privateClock = 0;
    clockSet.forEach((c) => {
      const cat = snv.variants[c]?.category;
      if (st[c] === 1 && (cat === "subclonal" || cat === "private")) {
        post += 1;
        if (cat === "private") privateClock += 1;
      }
    });
    return {
      sensitivity: sens,
      postClock: post,
      postClockCorrected: sens > 0.05 ? post / sens : NaN,
      privateClockCorrected: sens > 0.05 ? privateClock / sens : NaN,
    };
  });
}

/**
 * MRCA timing: the tumour's most recent common ancestor sits at a fraction
 * T / (T + P) of the molecular time from the zygote to sampling, where T =
 * truncal clock SNVs (from the tree mapping, complete) and P = median
 * corrected post-trunk clock SNVs per tumour cell.
 */
export function mrcaTiming(snv, clock, burdens) {
  const clockSet = new Set(clock);
  const T = snv.variants.filter((v, c) => clockSet.has(c) && v.category === "truncal").length;
  const P = median(burdens.filter(Boolean).map((b) => b.postClockCorrected));
  return { truncalClock: T, postClockMedian: P, mrcaFraction: Number.isFinite(P) && T + P > 0 ? T / (T + P) : NaN };
}

/**
 * Clock-scaled timing of each clade: clock SNVs gained on the branch above it
 * (branchGains ∩ clock sites), cumulative clock SNVs from the MRCA down to the
 * clade's founding, and that founding as a fraction of molecular time
 * ((T + cumulative) / (T + P)). gains: Map(node -> { gained, cells }).
 */
export function cladeClockTiming(layout, gains, clock, { truncalClock, postClockMedian }) {
  const clockSet = new Set(clock);
  const total = truncalClock + postClockMedian;
  const clockGain = new Map();
  gains.forEach((g, node) => clockGain.set(node, g.gained.filter((c) => clockSet.has(c)).length));
  const cumulative = (node) => {
    let s = 0;
    for (let n = node; n >= 0 && layout.nodes[n]?.parent >= 0; n = layout.nodes[n].parent) s += clockGain.get(n) || 0;
    return s;
  };
  const out = [];
  gains.forEach((g, node) => {
    const cum = cumulative(node);
    out.push({
      node,
      cells: g.cells,
      gained: g.gained.length,
      clockGained: clockGain.get(node) || 0,
      clockFraction: g.gained.length ? (clockGain.get(node) || 0) / g.gained.length : NaN,
      cumulativeClock: cum,
      foundedAt: total > 0 ? (truncalClock + cum) / total : NaN,
    });
  });
  return out.sort((a, b) => a.foundedAt - b.foundedAt);
}
