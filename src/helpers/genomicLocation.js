const ALLELE_CHANGE_SUFFIX = /\s+[A-Z*.-]+\s*>\s*[A-Z*.-]+\s*$/i;

/**
 * Return only the genomic coordinate portion of a displayed location.
 * Non-SNV locations are preserved after trimming surrounding whitespace.
 */
export function getCoordinateCopyValue(value) {
  if (value == null) return "";
  return String(value).trim().replace(ALLELE_CHANGE_SUFFIX, "");
}
