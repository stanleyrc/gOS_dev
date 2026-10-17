import { GT_COLORS, snvMissingColor } from "../../../helpers/singleCell/matrix";

/** Cell colours of the Drivers layer (SNV colours follow the SNV heatmap's genotype view). */
export const driverColors = () => ({
  mutant: GT_COLORS.alt,
  wildtype: GT_COLORS.ref,
  noCoverage: snvMissingColor(),
  dna: "#1F78B4",
  rna: "#E08A00",
  both: "#6A3D9A",
  complex: "#0B7285",
  // tumour-suppressor two-hit columns (twoHit.js): second hit only / SNV + second hit
  loss: "#E6A100",
  bothHit: "#3F007D",
});

/** Header label colour of a driver class. */
export const CLASS_TEXT = { snv: "#B2182B", amp: "#D95F02", homdel: "#2166AC", fusion: "#6A3D9A", complex: "#0B7285" };

/** Colours of clinical-assay columns: germline-like findings, and the highlight behind ClinVar P/LP or loss-of-function ones. */
export const GERMLINE_TEXT = "#5B6B7F";
export const HIGHLIGHT_BG = "#FFE58F";
