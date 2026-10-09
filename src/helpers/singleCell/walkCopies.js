// Data shaping for the "walk copies along the phylogeny" panel (d3-free so
// jest can run it): amplicon families as column blocks, rare walks folded
// into one narrow column per family, column widths by information, the
// per-clone summary and per-cell tooltips.

const num = (v) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

export const copiesOf = (walk, id) => num(walk?.cells?.[id]);

/** Number of `ids` carrying the walk (copies > 0). */
export function carrierCount(walk, ids) {
  let n = 0;
  ids.forEach((id) => {
    if (copiesOf(walk, id) > 0) n += 1;
  });
  return n;
}

function median(values) {
  if (!values.length) return 0;
  const s = values.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Short name for a family of nested walks: the gene carried most widely
 * across its walks (driver genes count double, weighted by carriers), else
 * the label of its most prevalent walk not named "Other".
 */
export function familyLabel(fam, carriers) {
  const score = new Map();
  fam.forEach((w) => {
    const c = Math.max(1, carriers(w));
    (w.driver_genes || []).filter(Boolean).forEach((g) => score.set(g, (score.get(g) || 0) + 2 * c));
    (w.genes || []).filter(Boolean).forEach((g) => score.set(g, (score.get(g) || 0) + c));
  });
  if (score.size) return [...score.entries()].sort((a, b) => b[1] - a[1] || `${a[0]}`.localeCompare(`${b[0]}`))[0][0];
  const ranked = fam.slice().sort((a, b) => carriers(b) - carriers(a));
  const named = ranked.find((w) => !/^other\b/i.test(`${w.label}`));
  return (named || ranked[0])?.label ?? "";
}

/**
 * Column blocks: one per walk family (families as given, e.g. walkFamilies()).
 * Each block: a family-total column (when the family has more than one
 * walk), one column per common walk (most carriers first) and, if any walk
 * has <= rareMax carriers among `ids`, one "rare" column holding them all.
 */
export function walkColumnBlocks(families, ids, { rareMax = 3 } = {}) {
  const cache = new Map();
  const carriers = (w) => {
    if (!cache.has(w.id)) cache.set(w.id, carrierCount(w, ids));
    return cache.get(w.id);
  };
  return families
    .filter((fam) => fam.length)
    .map((fam, f) => {
      const sorted = fam.slice().sort((a, b) => carriers(b) - carriers(a) || `${a.label}`.localeCompare(`${b.label}`));
      let common = sorted.filter((w) => carriers(w) > rareMax);
      let rare = sorted.filter((w) => carriers(w) <= rareMax);
      // a family made only of rare walks: keep its best one as a column
      if (!common.length && rare.length) {
        common = rare.slice(0, 1);
        rare = rare.slice(1);
      }
      const columns = [];
      if (fam.length > 1) columns.push({ key: `total:${f}`, type: "total", walks: sorted, carriers: ids.filter((id) => sorted.some((w) => copiesOf(w, id) > 0)).length });
      common.forEach((w) => columns.push({ key: `walk:${w.id}`, type: "walk", walks: [w], carriers: carriers(w) }));
      if (rare.length) columns.push({ key: `rare:${f}`, type: "rare", walks: rare, carriers: rare.reduce((a, w) => a + carriers(w), 0) });
      return { key: `fam:${f}`, label: familyLabel(fam, carriers), walks: sorted, columns };
    });
}

/** Value of a column for one cell: total = summed copies, walk = its copies, rare = number of rare walks present. */
export function columnValue(col, id) {
  if (col.type === "rare") return col.walks.filter((w) => copiesOf(w, id) > 0).length;
  return col.walks.reduce((a, w) => a + copiesOf(w, id), 0);
}

/** Mean of columnValue over a group of cells (per-clone / per-clade rows); per walk for stacking. */
export function groupValues(col, ids) {
  const n = Math.max(1, ids.length);
  const per = col.walks.map((w) => ids.reduce((a, id) => a + copiesOf(w, id), 0) / n);
  return { per, total: col.type === "rare" ? ids.filter((id) => columnValue(col, id) > 0).length / n : per.reduce((a, b) => a + b, 0) };
}

/** Largest value a column reaches over the rows (cells, or group means). */
export function columnMax(col, rows) {
  let m = 0;
  rows.forEach((r) => {
    const v = r.ids.length === 1 ? columnValue(col, r.ids[0]) : groupValues(col, r.ids).total;
    if (v > m) m = v;
  });
  return m;
}

/**
 * Pixel widths for the columns of all blocks: walk / total columns share
 * `width` in proportion to prevalence (carriers / nCells, square-rooted so
 * rare-ish walks stay visible) with a minimum; rare columns get a fixed
 * narrow width (rareWidth per walk, capped). `gap` between columns,
 * `blockGap` between families. Returns widths in block/column order.
 */
export function columnWidths(blocks, width, nCells, { min = 44, rareWidth = 9, rareMin = 26, rareMaxWidth = 64, gap = 3, blockGap = 10 } = {}) {
  const cols = blocks.flatMap((b) => b.columns);
  if (!cols.length) return [];
  const gaps = gap * (cols.length - blocks.length) + blockGap * Math.max(0, blocks.length - 1);
  const rareW = (c) => Math.max(rareMin, Math.min(rareMaxWidth, c.walks.length * rareWidth));
  const fixed = cols.reduce((a, c) => a + (c.type === "rare" ? rareW(c) : 0), 0);
  const flex = cols.filter((c) => c.type !== "rare");
  const weight = (c) => Math.sqrt(Math.max(0.02, c.carriers / Math.max(1, nCells)));
  const room = Math.max(flex.length * min, width - gaps - fixed);
  // water-filling: columns below the minimum get it, the rest share what is left
  let pinned = new Set();
  for (let it = 0; it < flex.length; it += 1) {
    const free = flex.filter((c) => !pinned.has(c.key));
    const left = room - pinned.size * min;
    const wsum = free.reduce((a, c) => a + weight(c), 0) || 1;
    const below = free.filter((c) => (weight(c) / wsum) * left < min);
    if (!below.length) break;
    below.forEach((c) => pinned.add(c.key));
  }
  const free = flex.filter((c) => !pinned.has(c.key));
  const left = room - pinned.size * min;
  const wsum = free.reduce((a, c) => a + weight(c), 0) || 1;
  return cols.map((c) => (c.type === "rare" ? rareW(c) : pinned.has(c.key) ? min : Math.floor((weight(c) / wsum) * left)));
}

/**
 * Per clone: cells, cells with walk data, and per column the fraction of
 * measured cells carrying it and the median copies among carriers.
 */
export function cloneSummary(blocks, order, cloneOf, hasData = () => true) {
  const byClone = new Map();
  order.forEach((id) => {
    const c = cloneOf(id) ?? "NA";
    if (!byClone.has(c)) byClone.set(c, []);
    byClone.get(c).push(id);
  });
  const cols = blocks.flatMap((b) => b.columns);
  return [...byClone.entries()].map(([clone, ids]) => {
    const measured = ids.filter(hasData);
    const stats = cols.map((col) => {
      const vals = measured.map((id) => columnValue(col, id)).filter((v) => v > 0);
      return { key: col.key, fraction: measured.length ? vals.length / measured.length : 0, median: col.type === "rare" ? vals.length : median(vals) };
    });
    return { clone, n: ids.length, measured: measured.length, stats };
  });
}

/** Tooltip lines for one cell: every walk with copies, largest first. */
export function cellWalkLines(walks, id) {
  return walks
    .map((w) => ({ id: w.id, label: w.label, copies: copiesOf(w, id) }))
    .filter((r) => r.copies > 0)
    .sort((a, b) => b.copies - a.copies);
}
