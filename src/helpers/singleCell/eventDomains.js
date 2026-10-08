/** Genome-coordinate domains widened by `pad` bp on each side, clamped to [1, genomeLength]. */
export function padDomains(domains, pad, genomeLength) {
  if (!domains?.length) return null;
  const max = genomeLength || Infinity;
  return domains.map(([a, b]) => [Math.max(1, Math.floor(a - pad)), Math.min(max, Math.ceil(b + pad))]);
}

/** Genome-wide coordinate of an event's midpoint from Settings.chromoBins (NaN when unknown). */
export function eventGlobalPosition(event, chromoBins) {
  const chr = `${event.seqnames || `${event.Genome_Location || ""}`.split(":")[0]}`.replace(/^chr/, "");
  const bin = chromoBins?.[chr];
  const start = Number(event.start);
  const end = Number(event.end) || start;
  if (!bin || !Number.isFinite(start)) return NaN;
  return bin.startPlace + ((start + end) / 2 - bin.startPoint);
}
