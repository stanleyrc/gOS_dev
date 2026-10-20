// d3-free helpers for the gene search box on the gene track (popups and drawers). The index is the one the genome
// browser already loads (state.Genes: optionsList [{ label, value }], genesStartPoint / genesEndPoint in genome places).

/** Case-insensitive type-ahead: exact match first, then prefix, then substring; alphabetical within a rank; at most `limit`. */
export function searchGeneOptions(options, query, limit = 30) {
  const q = `${query ?? ""}`.trim().toLowerCase();
  if (!q || !Array.isArray(options)) return [];
  const exact = [];
  const prefix = [];
  const inner = [];
  for (let i = 0; i < options.length; i += 1) {
    const l = `${options[i]?.label ?? ""}`.toLowerCase();
    if (l === q) exact.push(options[i]);
    else if (l.startsWith(q)) prefix.push(options[i]);
    else if (l.includes(q)) inner.push(options[i]);
  }
  const byLabel = (a, b) => `${a.label}`.toLowerCase().localeCompare(`${b.label}`.toLowerCase());
  return [...exact, ...prefix.sort(byLabel), ...inner.sort(byLabel)].slice(0, limit);
}

/** Genome-place span of each picked gene index: [{ name, start, end }] (genes without finite places are dropped). */
export function pickedSpans(values, options, starts, ends) {
  const nameOf = new Map((options || []).map((o) => [o.value, o.label]));
  return (values || [])
    .map((v) => ({ name: nameOf.get(v) ?? `${v}`, start: Number(starts?.[v]), end: Number(ends?.[v]) }))
    .filter((s) => Number.isFinite(s.start) && Number.isFinite(s.end) && s.end >= s.start);
}

/**
 * Domains that show the picked genes: each gene padded by `padFrac` of its length (at least `minPad` bp), clamped to
 * [1, genomeLength], overlapping or touching windows merged. Returns null when nothing can be shown.
 */
export function domainsForSpans(spans, genomeLength, { padFrac = 0.25, minPad = 5000 } = {}) {
  if (!spans?.length || !(genomeLength > 0)) return null;
  const wins = spans
    .map((s) => {
      const pad = Math.max(minPad, Math.round((s.end - s.start) * padFrac));
      return [Math.max(1, Math.floor(s.start - pad)), Math.min(genomeLength, Math.ceil(s.end + pad))];
    })
    .sort((a, b) => a[0] - b[0]);
  const out = [];
  wins.forEach((w) => {
    const last = out[out.length - 1];
    if (last && w[0] <= last[1]) last[1] = Math.max(last[1], w[1]);
    else out.push([...w]);
  });
  return out;
}

/** True when the current domains already equal the event's own domains (hides the "back to event" button). */
export function sameDomains(a, b) {
  return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((d, i) => d[0] === b[i][0] && d[1] === b[i][1]);
}
