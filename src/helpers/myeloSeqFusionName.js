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

export function getMyeloSeqFusionName(finding) {
  const gene = firstValue(
    finding?.gene,
    finding?.Gene,
    finding?.fusionGenes,
    finding?.fusion_genes,
  );
  const variant = firstValue(finding?.variant, finding?.Variant);

  if (!hasValue(gene)) return variant;
  if (!hasValue(variant)) return gene;
  if (variantNamesFusionGenes(gene, variant)) return variant;
  return `${String(gene).trim()} ${String(variant).trim()}`;
}
