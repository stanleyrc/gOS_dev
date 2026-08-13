const GNOMAD_VARIANT_URL = "https://gnomad.broadinstitute.org/variant/";
const GNOMAD_DATASET = "gnomad_r2_1";
const VARIANT_G_PATTERN =
  /^(?:chr)?([0-9]+|X|Y|M|MT):(\d+)-\d+\s+([A-Z*.-]+)\s*>\s*([A-Z*.-]+)$/i;

/** Parse the chromosome, start position, reference, and alternate allele. */
export function getGnomadVariant(record) {
  if (!record || typeof record.Variant_g !== "string") {
    return null;
  }

  const match = VARIANT_G_PATTERN.exec(record.Variant_g.trim());
  if (!match) {
    return null;
  }

  return {
    chromosome: match[1].toUpperCase(),
    position: match[2],
    referenceAllele: match[3].toUpperCase(),
    alternateAllele: match[4].toUpperCase(),
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
