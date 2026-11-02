// Colour and legend text for zoomed-out SNV bins (several sites under one pixel column). d3-free.
//
// A single site with alt reads is drawn at least pale grey (SNV_ALT_TOP) so a low-VAF call stays visible. A bin must not
// reuse that floor: with ~10 sites per pixel, 1 carrier site out of 10 would paint the whole pixel "alt-positive" and a
// neighbouring cell's private SNV would look shared. The bin colour is the plain fraction of its sites with alt reads
// (white 0 to black 1, no floor), so 1/10 is nearly white and a pixel is dark only when most of its sites are present.
import { GT_MATRIX, hexToRgb, isDarkPlots, packRGBA, plReadCap, snvMissingColor, vafRGB } from "./matrix";

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

/** The metric to draw: VAF unless GT (the toggle) was chosen; GT needs PL calls in the matrix, else VAF. */
export const effectiveSnvMetric = (choice, snv) => (choice === "gt" && snv && !snv.gt && !snv.pl ? "vaf" : choice || "vaf");

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

/* ----------------------------------------------------------------------- */
/* PL confidence greyscale (snv.pl: Uint8Array per cell, see skilift gos_sc_snv_columnar.pl_byte)   */
/* ----------------------------------------------------------------------- */

export const PL_NONE = 0; // no PL data for this cell/site
export const PL_FLAT = 255; // PL present but flat: no read evidence
/** Very pale blue (not a grey): no-read sites when "Mark no-read sites" is on (default off: they are white like REF). Dark plots use a dark blue. */
export const PL_NO_EVIDENCE = { light: "#D4E6F6", dark: "#27394a" };
let plMarkNoRead = false;
/** Module setting (layout.snvMarkNoRead), read by the colour functions and the legend, like setSnvNaMode. */
export const setPlMarkNoRead = (on) => {
  plMarkNoRead = Boolean(on);
};
export const plMarkNoReadOn = () => plMarkNoRead;

/** P(ALT) of a PL confidence byte (1..250 = 1 + round(249 P)); null when there is no evidence or no PL. */
export const plProb = (b) => (b >= 1 && b <= 250 ? (b - 1) / 249 : null);

/** Greyscale for P(ALT): 0 white (confident REF), 1 black (confident ALT), mid = uncertain. Null = no read evidence: white like REF, or the pale tint when marked. */
export function plRGB(p) {
  const dark = isDarkPlots();
  if (p == null || !Number.isFinite(p)) {
    if (!plMarkNoRead) return plRGB(0);
    return hexToRgb(dark ? PL_NO_EVIDENCE.dark : PL_NO_EVIDENCE.light);
  }
  const f = Math.max(0, Math.min(1, p));
  const v = dark ? Math.round(42 + 213 * f) : Math.round(255 * (1 - f));
  return [v, v, v];
}
export const plRGBA = (p) => packRGBA(plRGB(p));

/** P(ALT) of matrix row p, variant c: a covered cell with zero ALT reads is 0 (never signal); null = no read evidence. */
export function plSiteProb(snv, p, c) {
  if (p < 0 || !snv?.pl) return null;
  if (snv.status?.[p]?.[c] === 0) return 0;
  const q = plProb(snv.pl[p][c]);
  return q == null ? null : Math.min(q, plReadCap(snv.alt?.[p]?.[c], snv.depth?.[p]?.[c])); // display cap by read support, see plReadCap
}

/** P(hom-ALT | ALT) = L11 / (L01 + L11) from the optional het/hom byte (snv.hom, same coding as the PL byte); null when absent or flat. */
export function homProb(snv, p, c) {
  if (p < 0 || !snv?.hom) return null;
  const b = snv.hom[p][c];
  return b >= 1 && b <= 250 ? (b - 1) / 249 : null;
}

/** Sum of P(ALT), number of sites with evidence, and the P(ALT)-weighted sum of P(hom|ALT) in columns[start, end) of matrix row p (p < 0: none). */
export function plBinSummary(snv, p, columns, start, end) {
  let sum = 0;
  let n = 0;
  let hSum = 0;
  let hW = 0;
  for (let k = start; k < end; k += 1) {
    const q = plSiteProb(snv, p, columns[k]);
    if (q != null) {
      sum += q;
      n += 1;
      const h = homProb(snv, p, columns[k]);
      if (h != null && q > 0) {
        hSum += q * h;
        hW += q;
      }
    }
  }
  return { sum, n, sites: end - start, hSum, hW };
}

/** Het vs hom-ALT: two hues, lightness from P(ALT). Colour-blind safe pair (Okabe-Ito orange, deep purple). */
export const HET_HOM_COLORS = { het: "#E69F00", hom: "#5B2A86" };

/** Genotype colour with the het/hom split: white (P = 0) to the hue (P = 1); the hue runs het orange (h = 0) to hom purple (h = 1), a muddy mix where het and hom are not separable. h null = no split available: greyscale. */
export function plHomRGB(p, h) {
  if (h == null || !Number.isFinite(h) || p == null || !Number.isFinite(p)) return plRGB(p);
  const dark = isDarkPlots();
  const a = hexToRgb(HET_HOM_COLORS.het);
  const b = hexToRgb(HET_HOM_COLORS.hom);
  const hh = Math.max(0, Math.min(1, h));
  const f = Math.max(0, Math.min(1, p));
  const base = dark ? 42 : 255;
  return [0, 1, 2].map((i) => Math.round(base + (a[i] + (b[i] - a[i]) * hh - base) * f));
}
export const plHomRGBA = (p, h) => packRGBA(plHomRGB(p, h));

/** Pixel colour of a bin: mean P(ALT) over the sites with evidence; no evidence anywhere = white (or the pale tint when marked). */
export const plBinRGBA = ({ sum, n, hSum = 0, hW = 0 }) => plHomRGBA(n ? sum / n : null, hW > 0 ? hSum / hW : null);

/** True when the matrix has PL confidence bytes (else the genotype view falls back to hard calls). */
export const hasPl = (snv) => Boolean(snv?.pl);
