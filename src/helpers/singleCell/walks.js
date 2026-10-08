// ecDNA / amplicon walks (walks.json from skilift sc_export_walks): per-walk
// statistics over the cells of the patient, filters for the many spurious
// walks, co-occurrence of walks in cells and gene overlaps of walk nodes.

/** Per-walk numbers over `cellIds` (the cells shown): carriers, fraction, median / max copies. */
export function walkStats(walk, cellIds, minCn = 1) {
  const copies = cellIds.map((id) => Number(walk.cells?.[id]) || 0).filter((v) => v >= minCn);
  const s = copies.slice().sort((a, b) => a - b);
  const median = s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0;
  return { ncells: copies.length, fraction: cellIds.length ? copies.length / cellIds.length : 0, medianCn: median, maxCn: s.length ? s[s.length - 1] : 0, totalCn: copies.reduce((a, b) => a + b, 0) };
}

/**
 * Walks worth looking at: enough carrier cells, enough copies in them,
 * optionally only curated (pipeline cn_filter), circular or driver-bearing.
 */
export function filterWalks(walks, cellIds, { minCells = 3, minMedianCn = 4, curatedOnly = false, circularOnly = false, driverOnly = false, minCn = 1 } = {}) {
  return walks
    .map((w) => ({ ...w, stats: walkStats(w, cellIds, minCn) }))
    .filter((w) => w.stats.ncells >= minCells && w.stats.medianCn >= minMedianCn)
    .filter((w) => !curatedOnly || w.curated === true)
    .filter((w) => !circularOnly || w.circular)
    .filter((w) => !driverOnly || (w.driver_genes || []).length > 0)
    .sort((a, b) => b.stats.ncells - a.stats.ncells || b.stats.medianCn - a.stats.medianCn);
}

/** Combinations of walks (ids) present at >= minCn copies per cell: [{ walks: [ids], n, cells }] sorted by n. */
export function walkCombinations(walks, cellIds, minCn = 1) {
  const combos = new Map();
  cellIds.forEach((id) => {
    const present = walks.filter((w) => (Number(w.cells?.[id]) || 0) >= minCn).map((w) => w.id);
    const key = present.join("|");
    if (!combos.has(key)) combos.set(key, { walks: present, n: 0, cells: [] });
    const c = combos.get(key);
    c.n += 1;
    c.cells.push(id);
  });
  return [...combos.values()].sort((a, b) => b.n - a.n);
}

/** Global coordinate of a chromosome position (NaN when the chromosome is unknown). */
export const toGlobal = (chromoBins, chromosome, pos) => {
  const bin = chromoBins?.[`${chromosome}`.replace(/^chr/, "")];
  return bin ? bin.startPlace + (pos - bin.startPoint) : NaN;
};

/** Genes (global start/end) overlapping any node of a walk, with the node index they first hit. */
export function walkGenes(walk, genes, chromoBins) {
  const out = [];
  const seen = new Set();
  (walk.nodes || []).forEach((n, i) => {
    const g0 = toGlobal(chromoBins, n.chromosome, n.start);
    const g1 = toGlobal(chromoBins, n.chromosome, n.end);
    if (!Number.isFinite(g0)) return;
    genes.forEach((g) => {
      if (seen.has(g.name) || g.end < g0 || g.start > g1) return;
      seen.add(g.name);
      out.push({ ...g, node: i, offset: Math.max(0, g.start - g0), span: Math.min(g1, g.end) - Math.max(g0, g.start) });
    });
  });
  return out;
}

/** Spearman rank correlation of two equal-length arrays (NaN below 3 pairs). */
export function spearman(x, y) {
  const n = Math.min(x.length, y.length);
  if (n < 3) return NaN;
  const rank = (v) => {
    const idx = v.map((_, i) => i).sort((a, b) => v[a] - v[b]);
    const r = new Array(n);
    let i = 0;
    while (i < n) {
      let j = i;
      while (j + 1 < n && v[idx[j + 1]] === v[idx[i]]) j += 1;
      const avg = (i + j) / 2 + 1;
      for (let k = i; k <= j; k += 1) r[idx[k]] = avg;
      i = j + 1;
    }
    return r;
  };
  const rx = rank(x.slice(0, n));
  const ry = rank(y.slice(0, n));
  const mx = rx.reduce((a, b) => a + b, 0) / n;
  const my = ry.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i += 1) {
    sxy += (rx[i] - mx) * (ry[i] - my);
    sxx += (rx[i] - mx) ** 2;
    syy += (ry[i] - my) ** 2;
  }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : NaN;
}

/** Merged genomic footprint of a walk: [{ chromosome, start, end }] sorted, overlapping nodes merged. */
export function walkFootprint(walk) {
  const byChr = new Map();
  (walk.nodes || []).forEach((n) => {
    if (!byChr.has(n.chromosome)) byChr.set(n.chromosome, []);
    byChr.get(n.chromosome).push([Math.min(n.start, n.end), Math.max(n.start, n.end)]);
  });
  const out = [];
  [...byChr.entries()].forEach(([chromosome, list]) => {
    list.sort((a, b) => a[0] - b[0]);
    let cur = null;
    list.forEach(([s, e]) => {
      if (cur && s <= cur[1] + 1) cur[1] = Math.max(cur[1], e);
      else {
        cur = [s, e];
        out.push({ chromosome, range: cur });
      }
    });
  });
  return out.map((o) => ({ chromosome: o.chromosome, start: o.range[0], end: o.range[1] })).sort((a, b) => `${a.chromosome}`.localeCompare(`${b.chromosome}`, undefined, { numeric: true }) || a.start - b.start);
}

const footprintLength = (fp) => fp.reduce((s, r) => s + (r.end - r.start + 1), 0);

/** Shared bases of two footprints. */
export function sharedBases(fa, fb) {
  let shared = 0;
  fa.forEach((a) =>
    fb.forEach((b) => {
      if (a.chromosome !== b.chromosome) return;
      const s = Math.max(a.start, b.start);
      const e = Math.min(a.end, b.end);
      if (e >= s) shared += e - s + 1;
    })
  );
  return shared;
}

/**
 * Pairwise containment of walks: matrix[i][j] = fraction of walk i's bases
 * that lie inside walk j (1 = i is contained in j). Also each walk's footprint length.
 */
export function walkContainment(walks) {
  const fps = walks.map(walkFootprint);
  const lens = fps.map(footprintLength);
  const matrix = walks.map((_, i) => walks.map((__, j) => (i === j ? 1 : lens[i] ? sharedBases(fps[i], fps[j]) / lens[i] : 0)));
  return { matrix, lengths: lens, footprints: fps };
}
