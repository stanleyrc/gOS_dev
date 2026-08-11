function hasValue(value) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function firstValue(...values) {
  return values.find(hasValue);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function variantNamesFusionGenes(gene, variant) {
  const variantText = String(variant);
  const genes = String(gene)
    .split("::")
    .map((value) => value.trim())
    .filter(Boolean);

  return genes.length > 0 && genes.every((value) => {
    const escapedGene = escapeRegExp(value);
    return new RegExp(`(^|[^A-Za-z0-9])${escapedGene}($|[^A-Za-z0-9])`, "i")
      .test(variantText);
  });
}

function getFusionIdentityValues(finding) {
  return {
    gene: firstValue(
      finding?.gene,
      finding?.Gene,
      finding?.fusionGenes,
      finding?.fusion_genes,
    ),
    variant: firstValue(finding?.variant, finding?.Variant),
  };
}

function parseFormattedFusionGeneExons(value) {
  if (!hasValue(value)) return undefined;
  const parts = String(value).split("::");
  if (parts.length !== 2) return undefined;

  const parsed = parts.map((part) =>
    part.trim().match(/^([^\s():]+)\s*\(\s*(?:exon\s*)?([^\s():]+)\s*\)$/i),
  );
  if (parsed.some((match) => !match)) return undefined;

  return parsed
    .map((match) => `${match[1]}(${match[2]})`)
    .join("::");
}

function parseFusionExons(value) {
  if (!hasValue(value)) return undefined;
  const match = String(value).match(
    /\bexon\s+([^\s():]+)(?:\s*\([^)]*\))?\s*::\s*exon\s+([^\s():]+)/i,
  );
  return match ? [match[1], match[2]] : undefined;
}

export function getMyeloSeqFusionName(finding) {
  const { gene, variant } = getFusionIdentityValues(finding);

  if (!hasValue(gene)) return variant;
  if (!hasValue(variant)) return gene;
  if (variantNamesFusionGenes(gene, variant)) return variant;
  return `${String(gene).trim()} ${String(variant).trim()}`;
}

export function getMyeloSeqFusionGeneExons(finding) {
  const { gene, variant } = getFusionIdentityValues(finding);
  const formattedIdentity =
    parseFormattedFusionGeneExons(variant) ||
    parseFormattedFusionGeneExons(gene);
  if (formattedIdentity) return formattedIdentity;

  const genes = hasValue(gene)
    ? String(gene).split("::").map((value) => value.trim())
    : [];
  const exons = parseFusionExons(variant);
  if (genes.length === 2 && genes.every(Boolean) && exons) {
    return `${genes[0]}(${exons[0]})::${genes[1]}(${exons[1]})`;
  }

  return getMyeloSeqFusionName(finding);
}
