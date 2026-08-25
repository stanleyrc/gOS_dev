import { parseVariantG } from "./genomicLocation";

const GNOMAD_VARIANT_URL = "https://gnomad.broadinstitute.org/variant/";
const GNOMAD_DATASET = "gnomad_r2_1";
const GNOMAD_CHROMOSOME_PATTERN = /^(?:[0-9]+|X|Y|M|MT)$/i;
const GNOMAD_ALLELE_PATTERN = /^[A-Z*.-]+$/i;
const GNOMAD_RANGE_PATTERN = /:\d+-\d+\s/;

/** Parse the chromosome, start position, reference, and alternate allele. */
export function getGnomadVariant(record) {
  if (!record || typeof record.Variant_g !== "string") {
    return null;
  }

  const variantG = record.Variant_g.trim();
  const variant = parseVariantG(variantG);
  if (
    !variant ||
    !GNOMAD_RANGE_PATTERN.test(variantG) ||
    !GNOMAD_CHROMOSOME_PATTERN.test(variant.chromosome) ||
    !GNOMAD_ALLELE_PATTERN.test(variant.reference) ||
    !GNOMAD_ALLELE_PATTERN.test(variant.alternate)
  ) {
    return null;
  }

  return {
    chromosome: variant.chromosome.toUpperCase(),
    position: variant.start,
    referenceAllele: variant.reference.toUpperCase(),
    alternateAllele: variant.alternate.toUpperCase(),
  };
}

/** Build a gnomAD 2.1 variant URL from a Filtered Events record. */
export function getGnomadVariantUrl(record) {
  const variant = getGnomadVariant(record);
  if (!variant) {
    return null;
  }

  const {
    chromosome,
    position,
    referenceAllele,
    alternateAllele,
  } = variant;

  return `${GNOMAD_VARIANT_URL}${chromosome}-${position}-${referenceAllele}-${alternateAllele}?dataset=${GNOMAD_DATASET}`;
}
