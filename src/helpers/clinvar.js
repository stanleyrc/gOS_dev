const CLINVAR_URL = "https://www.ncbi.nlm.nih.gov/clinvar/";
const ALLELE_ID_FIELDS = ["alleleId", "alleleid", "ALLELEID", "AlleleID"];
const NOT_IN_CLINVAR_DESC = "not in clinvar";
const HGVS_PATTERN = /\b[cp]\.[^\s/]+/gi;
const GENOMIC_VARIANT_PATTERN =
  /^(?:chr)?([1-9]|1\d|2[0-2]|X|Y|M|MT):(\d+)(?:-\d+)?\s+([ACGTN]+)>([ACGTN]+)$/i;
const CLINVAR_GENOME_ASSEMBLY = "GRCh37";

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

/** Parse Variant_g into the VCF-like fields accepted by ClinVar search. */
export function getClinvarGenomicVariant(record) {
  if (!record || typeof record.Variant_g !== "string") {
    return null;
  }

  const variant = record.Variant_g.trim().match(GENOMIC_VARIANT_PATTERN);
  if (!variant) {
    return null;
  }

  const chromosome = variant[1].toUpperCase();
  return {
    chromosome: chromosome === "M" ? "MT" : chromosome,
    start: variant[2],
    reference: variant[3].toUpperCase(),
    alternate: variant[4].toUpperCase(),
  };
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

/** Build ClinVar's documented chromosome:position:ref:alt search term. */
export function getClinvarSearchTerm(record) {
  if (!record || typeof record !== "object") {
    return null;
  }

  const genomicVariant = getClinvarGenomicVariant(record);
  if (genomicVariant) {
    const { chromosome, start, reference, alternate } = genomicVariant;
    // Variant_g deletion ranges begin at the first deleted base, while their
    // reference allele includes the preceding VCF anchor base.
    const position =
      Number(start) - (reference.length > alternate.length ? 1 : 0);

    if (position > 0) {
      return `${chromosome}:${position}:${reference}:${alternate}(${CLINVAR_GENOME_ASSEMBLY})`;
    }
  }

  const gene = typeof record.gene === "string" ? record.gene.trim() : "";
  const hgvsTerms =
    typeof record.Variant === "string"
      ? record.Variant.match(HGVS_PATTERN) || []
      : [];
  const codingVariant = hgvsTerms.find((term) => /^c\./i.test(term));
  const hgvsVariant = codingVariant || hgvsTerms[0];

  if (gene && hgvsVariant) {
    return `${gene} ${hgvsVariant}`;
  }

  return gene || hgvsVariant || null;
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
