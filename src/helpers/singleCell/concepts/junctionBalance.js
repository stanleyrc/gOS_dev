// Junction balance on a toy genome graph (Guide > Concepts; JaBbA, Hadi et al. Cell 2020).
// A linear chromosome of segments; each segment has a left (L) and a right (R) side. Junctions join two
// sides: REF junctions join neighbouring segments (s_k.R - s_k+1.L), ALT junctions join any two sides.
// Balance: the copy number of a segment equals the summed copy number of the junctions on its left side,
// and equally on its right side. Any shortfall or excess is a loose end. The chromosome's two outer sides
// (telomeres) need no junction. Toy data only: synthetic, seeded, never patient values. d3-free.

import { gaussian, makeRng } from "./rng";

export const sideKey = (seg, side) => `${seg}.${side}`;

/** Sides at the two ends of the chromosome, which need no junction. */
export function telomereSides(segments) {
  if (!segments.length) return new Set();
  return new Set([sideKey(segments[0].id, "L"), sideKey(segments[segments.length - 1].id, "R")]);
}

/** Summed copy number of the switched-on junctions touching each side: { "s1.R": 2, ... }. */
export function sideLoads(segments, junctions, cnOf = (j) => j.cn) {
  const load = {};
  segments.forEach((s) => { load[sideKey(s.id, "L")] = 0; load[sideKey(s.id, "R")] = 0; });
  junctions.forEach((j) => {
    if (j.on === false) return;
    const c = cnOf(j) || 0;
    [j.a, j.b].forEach((e) => { const k = sideKey(e.seg, e.side); load[k] = (load[k] || 0) + c; });
  });
  return load;
}

/**
 * Loose ends: every non-telomeric side whose segment CN differs from its junction load.
 * diff > 0: copies leave the segment with no junction (missing junction); diff < 0: junctions carry more copies than the segment.
 */
export function looseEnds(segments, junctions, segCn = (s) => s.cn, cnOf = (j) => j.cn) {
  const load = sideLoads(segments, junctions, cnOf);
  const telo = telomereSides(segments);
  const out = [];
  segments.forEach((s) => {
    ["L", "R"].forEach((side) => {
      const k = sideKey(s.id, side);
      if (telo.has(k)) return;
      const diff = segCn(s) - load[k];
      if (diff !== 0) out.push({ seg: s.id, side, key: k, diff });
    });
  });
  return out;
}

export const totalLoose = (loose) => loose.reduce((a, l) => a + Math.abs(l.diff), 0);

/**
 * The toy genome: 6 segments, 5 REF junctions, a one-copy deletion of s2 (ALT s1.R-s3.L), a tandem duplication of
 * s4-s5 (ALT s5.R-s4.L) and one spurious candidate junction (s2.R-s5.L) that the coverage does not support.
 * Bins carry coverage in copy-number units (purity 1) plus Gaussian noise of sd `noise`.
 */
export function toyGenome({ seed = 7, noise = 0.35, binsPerSegment = 8 } = {}) {
  const truth = [2, 1, 2, 3, 3, 2];
  const segments = truth.map((cn, i) => ({ id: `s${i + 1}`, label: `s${i + 1}`, cn, trueCn: cn, nBins: binsPerSegment }));
  const ref = (i, cn) => ({ id: `r${i}${i + 1}`, type: "REF", a: { seg: `s${i}`, side: "R" }, b: { seg: `s${i + 1}`, side: "L" }, cn, trueCn: cn, on: true });
  const junctions = [
    ref(1, 1), ref(2, 1), ref(3, 2), ref(4, 3), ref(5, 2),
    { id: "del", label: "deletion", type: "ALT", a: { seg: "s1", side: "R" }, b: { seg: "s3", side: "L" }, cn: 1, trueCn: 1, on: true },
    { id: "dup", label: "tandem dup", type: "ALT", a: { seg: "s5", side: "R" }, b: { seg: "s4", side: "L" }, cn: 1, trueCn: 1, on: true },
    { id: "spur", label: "spurious", type: "ALT", a: { seg: "s2", side: "R" }, b: { seg: "s5", side: "L" }, cn: 0, trueCn: 0, on: true },
  ];
  const rng = makeRng(seed);
  const bins = [];
  segments.forEach((s) => {
    for (let i = 0; i < s.nBins; i += 1) bins.push({ seg: s.id, i, cov: s.trueCn + noise * gaussian(rng) });
  });
  return { segments, junctions, bins, noise };
}

/** Per-segment coverage cost of each CN 0..maxCn: sum over bins of (cov - c)^2 / (2 sd^2). */
export function coverageCost(segments, bins, sd, maxCn) {
  const out = {};
  const s2 = 2 * Math.max(sd, 1e-6) ** 2;
  segments.forEach((s) => {
    const cov = bins.filter((b) => b.seg === s.id).map((b) => b.cov);
    out[s.id] = Array.from({ length: maxCn + 1 }, (_, c) => cov.reduce((a, v) => a + (v - c) ** 2, 0) / s2);
  });
  return out;
}

/**
 * Brute-force integer fit: every CN assignment of the switched-on junctions (REF 0..maxRef, ALT 0..maxAlt; switched-off
 * ones are 0), and for each the best segment CNs (0..maxCn, independent per segment given the junction loads).
 * Cost = coverage misfit + lambda x (total loose-end copies). Ties keep the first (lowest) assignment.
 * Returns { segCn: {id: cn}, juncCn: {id: cn}, cost, coverage, loose, n } (n = junction assignments tried).
 */
export function fitBalance({ segments, junctions, bins, sd, lambda = 1, maxCn = 5, maxRef = 4, maxAlt = 3 }) {
  const cc = coverageCost(segments, bins, sd, maxCn);
  const telo = telomereSides(segments);
  const on = junctions.filter((j) => j.on !== false);
  const ranges = on.map((j) => (j.type === "REF" ? maxRef : maxAlt));
  // which junction indices touch each side
  const touch = {};
  segments.forEach((s) => { touch[sideKey(s.id, "L")] = []; touch[sideKey(s.id, "R")] = []; });
  on.forEach((j, idx) => [j.a, j.b].forEach((e) => touch[sideKey(e.seg, e.side)].push(idx)));
  const cur = new Array(on.length).fill(0);
  let best = null;
  let n = 0;
  const evaluate = () => {
    n += 1;
    let total = 0;
    let coverage = 0;
    const segCn = {};
    for (const s of segments) {
      const kl = sideKey(s.id, "L");
      const kr = sideKey(s.id, "R");
      const l = telo.has(kl) ? null : touch[kl].reduce((a, i) => a + cur[i], 0);
      const r = telo.has(kr) ? null : touch[kr].reduce((a, i) => a + cur[i], 0);
      let bc = 0;
      let bv = Infinity;
      for (let c = 0; c <= maxCn; c += 1) {
        const v = cc[s.id][c] + lambda * ((l == null ? 0 : Math.abs(c - l)) + (r == null ? 0 : Math.abs(c - r)));
        if (v < bv - 1e-12) { bv = v; bc = c; }
      }
      segCn[s.id] = bc;
      total += bv;
      coverage += cc[s.id][bc];
      if (best && total >= best.cost - 1e-12) return; // cannot beat the best any more
    }
    best = { cost: total, coverage, segCn, juncCn: Object.fromEntries(on.map((j, i) => [j.id, cur[i]])) };
  };
  const rec = (k) => {
    if (k === on.length) { evaluate(); return; }
    for (let v = 0; v <= ranges[k]; v += 1) { cur[k] = v; rec(k + 1); }
  };
  rec(0);
  junctions.forEach((j) => { if (j.on === false) best.juncCn[j.id] = 0; });
  const loose = looseEnds(segments, junctions, (s) => best.segCn[s.id], (j) => best.juncCn[j.id]);
  return { ...best, loose, n };
}
