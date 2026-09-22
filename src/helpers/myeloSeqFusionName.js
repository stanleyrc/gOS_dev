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
    part.trim().match(/^([^\s():]+)\s*\(\s*(?:([^\s():]+)\s*:\s*)?(?:exon\s*)?([^\s():]+)\s*\)$/i),
  );
  if (parsed.some((match) => !match)) return undefined;

  return parsed.map((match) => ({ gene: match[1], transcript: match[2], exon: match[3] }));
}

function parseFusionTranscripts(finding) {
  const value = firstValue(finding?.transcript, finding?.Transcript, finding?.transcript_id);
  const parts = Array.isArray(value) ? value : typeof value === "string" ? value.split("::") : [];
  // A single ID has no safe partner assignment. Preserve empty slots in an explicit pair.
  if (parts.length !== 2) return [];
  return parts.map((part) => typeof part === "string" && /^[^\s():]+$/.test(part.trim())
    ? part.trim() : undefined);
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
  const formattedGene = parseFormattedFusionGeneExons(gene);
  const formattedIdentity = parseFormattedFusionGeneExons(variant) || formattedGene;
  const genes = formattedGene ? formattedGene.map((partner) => partner.gene)
    : hasValue(gene) ? String(gene).split("::").map((value) => value.trim()) : [];
  const exons = parseFusionExons(variant);
  const partners = formattedIdentity || (genes.length === 2 && genes.every(Boolean) && exons
    ? genes.map((name, index) => ({ gene: name, exon: exons[index] })) : undefined);
  if (!partners) return getMyeloSeqFusionName(finding);

  const transcripts = parseFusionTranscripts(finding);
  const sourceGenes = genes.length ? genes : partners.map((partner) => partner.gene);
  const paired = partners.map((partner) => {
    const index = sourceGenes.indexOf(partner.gene);
    const unambiguous = sourceGenes.length === 2 && new Set(sourceGenes).size === 2 && index >= 0;
    const namedTranscript = formattedGene?.find((source) => source.gene === partner.gene)?.transcript;
    return { ...partner, transcript: partner.transcript || namedTranscript || (unambiguous ? transcripts[index] : undefined) };
  });
  return paired.map(({ gene: name, exon, transcript }) => transcript
    ? `${name}(${transcript}:exon ${exon})` : `${name}(${exon})`)
    .join(paired.some((partner) => partner.transcript) ? " :: " : "::");
}
