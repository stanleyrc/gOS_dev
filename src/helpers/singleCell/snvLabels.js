// Readable identifiers for SNV matrix columns: gene + protein change
// ("TP53 p.R273H"), gene + consequence for non-coding sites, else
// "chr7:55,181,378 G>A"; plus the de-overlapped placement of rotated labels
// beside zoomed columns. d3-free so it can be tested on synthetic fixtures.

export const LABEL_MODES = ["gene", "protein", "position", "none"];
export const DEFAULT_LABEL_MODE = "protein";
/** Columns narrower than this (px) get labels only when they are drivers. */
export const MIN_LABEL_COLUMN_PX = 10;

const geneOf = (v) => (v.gene && !/^ENSG/.test(v.gene) ? v.gene : "");
const cleanProtein = (p) => `${p || ""}`.replace(/^p\./, "");
const shortConsequence = (c) => `${c || ""}`.split("&")[0].replace(/_variant$/, "").replace(/_/g, " ");

export function positionLabel(v) {
  const where = v.chromosome != null && v.position != null ? `${v.chromosome}:${Number(v.position).toLocaleString("en-US")}` : v.id || "";
  return [where, v.ref && v.alt ? `${v.ref}>${v.alt}` : ""].filter(Boolean).join(" ");
}

/** Label of one site in a mode: gene | protein | position | none (null). */
export function siteLabel(v, mode = DEFAULT_LABEL_MODE) {
  if (!v || mode === "none") return null;
  const gene = geneOf(v);
  if (mode === "position") return positionLabel(v);
  if (mode === "gene") return gene || positionLabel(v);
  // protein: gene + protein change; non-coding: gene + consequence; else position
  if (gene && v.protein) return `${gene} p.${cleanProtein(v.protein)}`;
  if (gene && v.consequence) return `${gene} ${shortConsequence(v.consequence)}`;
  return gene || positionLabel(v);
}

/** Label used for a driver column even when the label mode is "none" or the columns are narrow. */
export const driverLabel = (v) => siteLabel(v, "protein");

/**
 * Which columns to label, with a pixel x and no two labels closer than
 * `minGap` px (rotated text needs about the font height). Drivers are always
 * labelled and win collisions; other columns only when each column is at
 * least MIN_LABEL_COLUMN_PX wide.
 * @param columnOrder variant indices of the displayed columns
 * @param bins { binStart, binEnd } per device pixel (columnBins), pixelRatio
 * @returns [{ x, c, text, driver }] x in css px (centre of the column)
 */
export function placeLabels(variants, columnOrder, bins, { mode = DEFAULT_LABEL_MODE, pixelRatio = 1, minGap = 11, columnPx = null } = {}) {
  const w = bins.binStart.length;
  const cands = [];
  const seen = new Set();
  for (let x = 0; x < w; x += 1) {
    const a = bins.binStart[x];
    const b = bins.binEnd[x];
    if (a < 0) continue;
    // a bin of several sites is labelled only through its driver site
    for (let i = a; i < b; i += 1) {
      if (seen.has(i)) continue;
      const v = variants[columnOrder[i]];
      if (!v) continue;
      const wide = b - a === 1 && columnPx != null && columnPx >= MIN_LABEL_COLUMN_PX;
      if (!v.driver && !(wide && mode !== "none")) continue;
      seen.add(i);
      const text = v.driver ? siteLabel(v, mode === "none" ? "protein" : mode) : siteLabel(v, mode);
      if (text) cands.push({ x: (x + 0.5) / pixelRatio, c: columnOrder[i], text, driver: Boolean(v.driver) });
    }
  }
  // drivers first, then left to right
  cands.sort((p, q) => Number(q.driver) - Number(p.driver) || p.x - q.x);
  const placed = [];
  cands.forEach((cand) => {
    if (placed.every((o) => Math.abs(o.x - cand.x) >= minGap)) placed.push(cand);
  });
  return placed.sort((p, q) => p.x - q.x);
}
