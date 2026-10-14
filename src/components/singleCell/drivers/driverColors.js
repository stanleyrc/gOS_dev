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
});

/** Header label colour of a driver class. */
export const CLASS_TEXT = { snv: "#B2182B", amp: "#D95F02", homdel: "#2166AC", fusion: "#6A3D9A", complex: "#0B7285" };
