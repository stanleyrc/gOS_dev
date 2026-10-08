// Copy number at each SNV site in the cells carrying it, and the estimated
// number of mutant copies (VAF x total CN). SNVs on amplicons with several
// mutant copies were present before the amplification.

import { binAt, snvMetricValue } from "./matrix";

const median = (v) => {
  const s = v.filter(Number.isFinite).sort((a, b) => a - b);
  if (!s.length) return NaN;
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

/**
 * @param snv matrix payload ({ cells, variants, status, alt, depth })
 * @param cn CN payload ({ cells, rows })
 * @param minDepth reads needed in a cell to use its VAF
 * @returns per variant: { medianCn, maxCn, altCopies, nCarriers, nAmplified, amplified }
 */
export function snvCopyNumber(snv, cn, { minDepth = 4, ampCn = 4, ampCopies = 1.5 } = {}) {
  const out = new Array(snv.variants.length).fill(null);
  if (!cn?.rows?.length) return out;
  const cnRowOf = new Map(cn.cells.map((id, k) => [id, cn.rows[k]]));
  const rows = snv.cells.map((id) => cnRowOf.get(id) || null);
  snv.variants.forEach((v, c) => {
    if (!Number.isFinite(v.global)) return;
    const cns = [];
    const copies = [];
    let nAmplified = 0;
    for (let p = 0; p < snv.cells.length; p += 1) {
      if (snv.status[p][c] !== 1) continue;
      const row = rows[p];
      if (!row) continue;
      const b = binAt(row.binIndex, v.global);
      const total = b >= 0 ? row.values[b] : NaN;
      if (!Number.isFinite(total)) continue;
      cns.push(total);
      if (total >= ampCn) nAmplified += 1;
      const depth = snvMetricValue(snv, p, c, "depth");
      const alt = snvMetricValue(snv, p, c, "alt");
      if (depth >= minDepth && Number.isFinite(alt)) copies.push((alt / depth) * total);
    }
    if (!cns.length) return;
    const medianCn = median(cns);
    const altCopies = median(copies);
    out[c] = { medianCn, maxCn: Math.max(...cns), altCopies, nCarriers: cns.length, nAmplified, amplified: medianCn >= ampCn && (Number.isNaN(altCopies) || altCopies >= ampCopies) };
  });
  return out;
}

/**
 * Timing of an amplification from the SNVs on it: in each carrier cell, the
 * SNVs inside the amplified segment at the gene are classified by estimated
 * mutant copies (VAF x CN): >= 1.5 copies -> present before the amplification
 * (duplicated with it), < 1.5 -> after (or on the other allele). Returns the
 * per-SNV observations and the pre-amplification fraction.
 */
export function amplificationTiming(snv, cn, { globalPosition, carriers, minDepth = 6, ampCn = 4 }) {
  if (!snv || !cn?.rows?.length || !Number.isFinite(globalPosition)) return null;
  const cnRowOf = new Map(cn.cells.map((id, k) => [id, cn.rows[k]]));
  const rowOfCell = new Map(snv.cells.map((id, p) => [id, p]));
  const obs = [];
  const perSite = new Map();
  carriers.forEach((id) => {
    const row = cnRowOf.get(id);
    const p = rowOfCell.get(id);
    if (!row || p == null) return;
    const b = binAt(row.binIndex, globalPosition);
    if (b < 0 || !(row.values[b] >= ampCn)) return;
    const [g0, g1] = [row.binIndex.gStart[b], row.binIndex.gEnd[b]];
    snv.variants.forEach((v, c) => {
      if (!(v.global >= g0 && v.global <= g1) || snv.status[p][c] !== 1) return;
      const depth = snvMetricValue(snv, p, c, "depth");
      const alt = snvMetricValue(snv, p, c, "alt");
      if (!(depth >= minDepth) || !Number.isFinite(alt)) return;
      const copies = (alt / depth) * row.values[b];
      obs.push({ cell: id, variant: c, copies, cn: row.values[b] });
      if (!perSite.has(c)) perSite.set(c, []);
      perSite.get(c).push(copies);
    });
  });
  if (!obs.length) return { nObs: 0, nSites: 0, preFraction: NaN, sites: [] };
  const sites = [...perSite.entries()].map(([c, copies]) => {
    const s = copies.slice().sort((a, b) => a - b);
    const med = s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
    return { variant: c, id: snv.variants[c].id, gene: snv.variants[c].gene, n: copies.length, medianCopies: med, pre: med >= 1.5 };
  });
  const pre = sites.filter((s) => s.pre).length;
  return { nObs: obs.length, nSites: sites.length, preFraction: pre / sites.length, sites: sites.sort((a, b) => b.medianCopies - a.medianCopies) };
}
