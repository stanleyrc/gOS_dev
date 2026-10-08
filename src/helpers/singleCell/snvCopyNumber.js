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
