const VARIANT_G_PATTERN =
  /^([^:\s]+):(\d+)(?:-(\d+))?\s+([^>\s]+)\s*>\s*([^>\s]+)$/;
const ALLELE_CHANGE_SUFFIX = /\s+[A-Z*.-]+\s*>\s*[A-Z*.-]+\s*$/i;

/**
 * Parse the small-variant Variant_g display representation.
 * Provider-specific allele and chromosome rules belong to each adapter.
 */
export function parseVariantG(value) {
  if (typeof value !== "string") {
    return null;
  }

  const match = VARIANT_G_PATTERN.exec(value.trim());
  if (!match) {
    return null;
  }

  const chromosome = match[1].replace(/^chr/i, "");
  if (!chromosome) {
    return null;
  }

  return {
    chromosome,
    start: match[2],
    end: match[3] || match[2],
    reference: match[4],
    alternate: match[5],
  };
}

/** Collapse repeated endpoints only for distinct canonical single-base alleles. */
export function formatLocationDisplay(value) {
  const variant = parseVariantG(value);
  if (
    !variant ||
    variant.start !== variant.end ||
    !/^[ACGT]$/i.test(variant.reference) ||
    !/^[ACGT]$/i.test(variant.alternate) ||
    variant.reference.toUpperCase() === variant.alternate.toUpperCase()
  ) {
    return value;
  }

  // Edit only the duplicate endpoint, retaining chromosome spelling and allele text.
  return value.replace(/(:\d+)-\d+(?=\s)/, "$1");
}

/**
 * Return only the genomic coordinate portion of a displayed location.
 * Non-SNV locations are preserved after trimming surrounding whitespace.
 */
export function getCoordinateCopyValue(value) {
  if (value == null) return "";
  return String(value).trim().replace(ALLELE_CHANGE_SUFFIX, "");
}
