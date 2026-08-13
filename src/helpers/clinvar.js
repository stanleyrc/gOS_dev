const CLINVAR_URL = "https://www.ncbi.nlm.nih.gov/clinvar/";
const ALLELE_ID_FIELDS = ["alleleId", "alleleid", "ALLELEID", "AlleleID"];

/**
 * Return the normalized numeric allele ID carried by a ClinVar annotation.
 * Annotation sources have used several capitalization styles, so all known
 * representations are accepted at this boundary.
 */
export function getClinvarAlleleId(annotation) {
  if (!annotation || typeof annotation !== "object") {
    return null;
  }

  const rawAlleleId = ALLELE_ID_FIELDS.map((field) => annotation[field]).find(
    (value) => value !== undefined && value !== null,
  );
  const alleleId = rawAlleleId == null ? "" : String(rawAlleleId).trim();

  return /^\d+$/.test(alleleId) ? alleleId : null;
}

/** Build the NCBI ClinVar allele search URL for an annotation when possible. */
export function getClinvarAlleleUrl(annotation) {
  const alleleId = getClinvarAlleleId(annotation);

  return alleleId
    ? `${CLINVAR_URL}?term=${alleleId}[alleleid]`
    : null;
}
