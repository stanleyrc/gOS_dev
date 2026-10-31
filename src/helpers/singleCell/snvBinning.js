// Colour and legend text for zoomed-out SNV bins (several sites under one pixel column). d3-free.
//
// A single site with alt reads is drawn at least pale grey (SNV_ALT_TOP) so a low-VAF call stays visible. A bin must not
// reuse that floor: with ~10 sites per pixel, 1 carrier site out of 10 would paint the whole pixel "alt-positive" and a
// neighbouring cell's private SNV would look shared. The bin colour is the plain fraction of its sites with alt reads
// (white 0 to black 1, no floor), so 1/10 is nearly white and a pixel is dark only when most of its sites are present.
import { GT_MATRIX, hexToRgb, isDarkPlots, packRGBA, snvMissingColor, vafRGB } from "./matrix";

/** [r, g, b] of a bin with `positive` of `sites` sites carrying alt reads, or the no-reads colour when `missing` === `sites`. */
export function snvBinRGB(positive, sites, missing = 0) {
  if (!sites || missing >= sites) return hexToRgb(snvMissingColor());
  const f = Math.max(0, Math.min(1, positive / sites));
  if (isDarkPlots()) return vafRGB(f);
  const v = Math.round(255 * (1 - f));
  return [v, v, v];
}

export const snvBinRGBA = (positive, sites, missing = 0) => packRGBA(snvBinRGB(positive, sites, missing));

/** Mean and maximum number of sites under one pixel for `bins` (columnBins / groupedColumnBins output); null when nothing is binned. */
export function binDensity(bins) {
  if (!bins?.binned) return null;
  let n = 0;
  let sum = 0;
  let max = 0;
  for (let x = 0; x < bins.binStart.length; x += 1) {
    if (bins.binStart[x] < 0) continue;
    const k = bins.binEnd[x] - bins.binStart[x];
    n += 1;
    sum += k;
    if (k > max) max = k;
  }
  return n ? { mean: sum / n, max } : null;
}

/** Legend caption for the matrix axis: states the bin size, or that every site is drawn exactly. */
export function binLegendText(bins) {
  const d = binDensity(bins);
  if (!d) return "one site per column";
  const mean = d.mean >= 10 ? Math.round(d.mean) : Math.round(d.mean * 10) / 10;
  return `binned: ~${mean} sites per pixel (up to ${d.max}); grey = fraction of the pixel's sites with alt reads; zoom in for single sites`;
}

/** The metric to draw: GT (the default) needs PL calls in the matrix, else VAF. */
export const effectiveSnvMetric = (choice, snv) => (choice === "gt" && snv && !snv.gt ? "vaf" : choice || "gt");

const mixHex = (hex, f) => {
  const [r, g, b] = hexToRgb(hex);
  return [Math.round(255 + (r - 255) * f), Math.round(255 + (g - 255) * f), Math.round(255 + (b - 255) * f)];
};

/**
 * Genotype bin: white (all called sites REF) to the ALT colour (all ALT), the same ramp as a single site (0 white, 1 ALT).
 * No-call sites are left out of the fraction; a bin with no calls is the no-call grey.
 */
export function gtBinRGB(positive, zero) {
  const called = positive + zero;
  if (!called) return hexToRgb(isDarkPlots() ? "#555555" : GT_MATRIX.nocall);
  return mixHex(GT_MATRIX.alt, positive / called);
}
export const gtBinRGBA = (positive, zero) => packRGBA(gtBinRGB(positive, zero));
