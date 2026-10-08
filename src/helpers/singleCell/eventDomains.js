/** Genome-coordinate domains widened by `pad` bp on each side, clamped to [1, genomeLength]. */
export function padDomains(domains, pad, genomeLength) {
  if (!domains?.length) return null;
  const max = genomeLength || Infinity;
  return domains.map(([a, b]) => [Math.max(1, Math.floor(a - pad)), Math.min(max, Math.ceil(b + pad))]);
}
