// Isolating a subset of mutations (e.g. subclonal SBS13 sites): where the
// sites sit, which cells carry them, and how well they fit the tree (clade F1)
// and the signature (96-channel spectrum against the reference profile).
// d3-free so it can be tested on synthetic fixtures.

import { cosine, sbs96Counts } from "./signatures";
import { positionLabel, siteLabel } from "./snvLabels";

/** Display rows (indices into `rows`) of cells with alt reads at >= minSites of the given sites. */
export function carrierRows(snv, columns, rows, minSites = 1) {
  const out = new Set();
  if (!snv || !columns.length) return out;
  rows.forEach((p, r) => {
    if (p == null || p < 0) return;
    const st = snv.status[p];
    let n = 0;
    for (let k = 0; k < columns.length && n < minSites; k += 1) if (st[columns[k]] === 1) n += 1;
    if (n >= minSites) out.add(r);
  });
  return out;
}

/** Per-leaf state of a subset: 1 carries >= 1 site, 0 covered at some site without alt, -1 no call. */
export function subsetLeafStates(snv, leaves, columns, cellIndex) {
  return Int8Array.from(leaves, (id) => {
    const p = cellIndex.get(`${id}`);
    if (p == null) return -1;
    const st = snv.status[p];
    let covered = false;
    for (let k = 0; k < columns.length; k += 1) {
      const s = st[columns[k]];
      if (s === 1) return 1;
      if (s === 0) covered = true;
    }
    return covered ? 0 : -1;
  });
}

const CAT_LABEL = { truncal: "truncal", subclonal: "subclonal", private: "private", outside_tumor: "outside tumour", unmapped: "unmapped", cn_mapped: "CN-mapped" };

/** One row per site for the table / TSV. */
export function isolateTable(snv, annot, columns) {
  return columns.map((c) => {
    const v = snv.variants[c];
    const category = annot?.cat.category ? annot.cat.category[c] : v.category;
    return {
      c,
      site: v.id,
      gene: v.gene && !/^ENSG/.test(v.gene) ? v.gene : "",
      label: siteLabel(v, "protein"),
      protein: v.protein || "",
      consequence: v.consequence || "",
      position: positionLabel(v),
      carriers: annot?.num.carriers ? annot.num.carriers[c] : v.altCells ?? null,
      tree_site: CAT_LABEL[category] || category || "",
      best_clade: v.cladeCells != null ? `${v.cladeCells} cells` : "",
      clade_f1: annot?.num.phylo ? annot.num.phylo[c] : v.cladeScore ?? null,
      signature: annot?.cat.signature ? annot.cat.signature[c] || "" : "",
      signature_prob: annot?.sigProb ? annot.sigProb[c] : null,
    };
  });
}

const TSV_COLUMNS = [
  ["site", "site"],
  ["gene", "gene"],
  ["protein", "protein"],
  ["consequence", "consequence"],
  ["position", "position"],
  ["carriers", "carriers"],
  ["tree_site", "tree_site"],
  ["best_clade", "best_clade"],
  ["clade_f1", "clade_f1"],
  ["signature", "signature"],
  ["signature_prob", "signature_prob"],
];

const cell = (x) => (x == null ? "" : typeof x === "number" ? (Number.isFinite(x) ? `${Number(x.toFixed(4))}` : "") : `${x}`.replace(/[\t\n]/g, " "));

export const tableTsv = (rows) => [TSV_COLUMNS.map(([, h]) => h).join("\t"), ...rows.map((r) => TSV_COLUMNS.map(([k]) => cell(r[k])).join("\t"))].join("\n") + "\n";

/** Histogram of values in [0, 1] as fractions per bin (for subset vs all sites). */
export function f1Histogram(values, bins = 10) {
  const counts = new Array(bins).fill(0);
  let n = 0;
  values.forEach((x) => {
    if (!Number.isFinite(x)) return;
    counts[Math.min(bins - 1, Math.max(0, Math.floor(x * bins)))] += 1;
    n += 1;
  });
  return { counts, n, fractions: counts.map((k) => (n ? k / n : 0)) };
}

export function median(values) {
  const xs = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!xs.length) return NaN;
  const m = xs.length >> 1;
  return xs.length % 2 ? xs[m] : (xs[m - 1] + xs[m]) / 2;
}

/** Clade-F1 distribution of the subset against every site. */
export function f1Comparison(annot, columns, bins = 10) {
  const arr = annot?.num.phylo;
  if (!arr) return null;
  const subset = columns.map((c) => arr[c]);
  const all = Array.from(arr);
  return { subset: f1Histogram(subset, bins), all: f1Histogram(all, bins), subsetMedian: median(subset), allMedian: median(all) };
}

/**
 * Fit of a subset's SBS96 spectrum to one reference signature: observed
 * counts, the reference profile scaled to the same total, their cosine
 * similarity, and how many sites carry that signature at probability >= 0.5.
 * @param reference { names, columns } (COSMIC)
 */
export function spectrumFit(snv, columns, reference, signature, annot = null) {
  const contexts = columns.map((c) => snv.variants[c].context).filter(Boolean);
  const { counts, used } = sbs96Counts(contexts);
  const j = reference && signature ? reference.names.indexOf(signature) : -1;
  let expected = null;
  let cos = null;
  if (j >= 0) {
    const col = reference.columns[j];
    const sum = col.reduce((s, x) => s + x, 0) || 1;
    expected = Float64Array.from(col, (x) => (x / sum) * used);
    cos = used ? cosine(counts, col) : null;
  }
  let high = 0;
  let low = 0;
  if (annot?.sigProb) {
    columns.forEach((c) => {
      if (annot.cat.signature?.[c] == null) return;
      if (annot.sigProb[c] >= 0.5) high += 1;
      else low += 1;
    });
  }
  return { counts, expected, cosine: cos, used, n: columns.length, high, low };
}
