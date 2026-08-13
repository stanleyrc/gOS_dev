const CLINVAR_URL = "https://www.ncbi.nlm.nih.gov/clinvar/";
const ALLELE_ID_FIELDS = ["alleleId", "alleleid", "ALLELEID", "AlleleID"];
const NOT_IN_CLINVAR_DESC = "not in clinvar";
const HGVS_C_PATTERN = /\bc\.[^\s/]+/i;

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

/** Return whether a populated badge represents an entry in ClinVar. */
export function isClinvarAnnotation(annotation) {
  if (!annotation || typeof annotation !== "object") {
    return false;
  }

  const desc =
    typeof annotation.desc === "string"
      ? annotation.desc.trim().toLowerCase()
      : "";
  const hasBadge = Boolean(annotation.class || desc);

  return hasBadge && desc !== NOT_IN_CLINVAR_DESC;
}

function getClinvarSearchTerm(record) {
  if (!record || typeof record !== "object") {
    return null;
  }

  if (typeof record.Variant_g === "string" && record.Variant_g.trim()) {
    return record.Variant_g.trim();
  }

  const codingVariant =
    typeof record.Variant === "string"
      ? record.Variant.match(HGVS_C_PATTERN)
      : null;
  const gene = typeof record.gene === "string" ? record.gene.trim() : "";

  if (codingVariant && gene) {
    return `${gene} ${codingVariant[0]}`;
  }

  return gene || null;
}

/**
 * Build a link for every represented ClinVar annotation. Prefer the stable
 * allele ID and fall back to the record's genomic or coding variant because
 * older event files omit allele IDs from otherwise populated annotations.
 */
export function getClinvarUrl(annotation, record) {
  if (!isClinvarAnnotation(annotation)) {
    return null;
  }

  const alleleId =
    getClinvarAlleleId(annotation) || getClinvarAlleleId(record);
  if (alleleId) {
    return `${CLINVAR_URL}?term=${alleleId}[alleleid]`;
  }

  const searchTerm = getClinvarSearchTerm(record);
  return searchTerm
    ? `${CLINVAR_URL}?term=${encodeURIComponent(searchTerm)}`
    : null;
}
