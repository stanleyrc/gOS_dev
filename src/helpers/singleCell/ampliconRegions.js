// "Zoom to amplicons": the patient's amplicon intervals (walks.json, the same walks as the ecDNA tab) as genome-view domains.
// d3-free. Domains are [startPlace, endPlace] in the shared genome coordinates (chromoBins), one per merged locus, side by side.

/** "12:57331144-57654888;12:66585816-66612827" -> [{ chr, start, end }] */
export function parseCoordinates(text) {
  const out = [];
  String(text || "")
    .split(";")
    .forEach((part) => {
      const m = /^(?:chr)?([^:]+):(\d+)-(\d+)$/.exec(part.trim());
      if (m) out.push({ chr: m[1], start: Math.min(+m[2], +m[3]), end: Math.max(+m[2], +m[3]) });
    });
  return out;
}

const GAPS = [100e3, 250e3, 500e3, 1e6, 2e6, 5e6, 10e6, 25e6];

function mergeSegments(segs, gap) {
  const sorted = [...segs].sort((a, b) => a.start - b.start);
  const out = [];
  sorted.forEach((s) => {
    const last = out[out.length - 1];
    if (last && s.start - last.end <= gap) {
      last.end = Math.max(last.end, s.end);
      s.genes.forEach((g) => last.genes.add(g));
      s.driverGenes.forEach((g) => last.driverGenes.add(g));
    } else out.push({ start: s.start, end: s.end, genes: new Set(s.genes), driverGenes: new Set(s.driverGenes) });
  });
  return out;
}

const geneList = (w, key) => {
  const v = w?.[key];
  if (Array.isArray(v)) return v.filter(Boolean);
  return typeof v === "string" && v ? v.split(/[,;\s]+/).filter(Boolean) : [];
};

/**
 * walks: walks.json `walks` ({ coordinates, genes, driver_genes }); chromoBins: { chr: { startPlace, endPlace } }.
 * Overlapping / nearby intervals of the same chromosome are merged (the gap grows until at most maxRegions loci remain), each
 * locus is padded so its boundary is visible. Returns { domains, regions: [{ chr, start, end, label }], reason }.
 */
export function ampliconRegions(walks, chromoBins, { maxRegions = 12, padFraction = 0.2, minPad = 40e3 } = {}) {
  if (!chromoBins) return { domains: [], regions: [], reason: "genome coordinates not loaded" };
  if (!Array.isArray(walks) || !walks.length) return { domains: [], regions: [], reason: "no amplicon walks for this report" };
  const byChr = new Map();
  walks.forEach((w) => {
    const genes = geneList(w, "genes");
    const driverGenes = geneList(w, "driver_genes");
    parseCoordinates(w.coordinates).forEach((s) => {
      if (!chromoBins[s.chr]) return;
      if (!byChr.has(s.chr)) byChr.set(s.chr, []);
      byChr.get(s.chr).push({ ...s, genes, driverGenes });
    });
  });
  if (!byChr.size) return { domains: [], regions: [], reason: "amplicon walks have no coordinates on this genome" };
  let loci = [];
  for (const gap of GAPS) {
    loci = [];
    byChr.forEach((segs, chr) => mergeSegments(segs, gap).forEach((m) => loci.push({ chr, ...m })));
    if (loci.length <= maxRegions) break;
  }
  const regions = loci.map((l) => {
    const c = chromoBins[l.chr];
    const len = c.endPlace - c.startPlace;
    const pad = Math.max(minPad, padFraction * (l.end - l.start));
    const names = [...(l.driverGenes.size ? l.driverGenes : l.genes)];
    return {
      chr: l.chr,
      start: Math.max(1, l.start - pad),
      end: Math.min(len, l.end + pad),
      label: names.length ? names.slice(0, 3).join(", ") + (names.length > 3 ? ` +${names.length - 3}` : "") : `chr${l.chr}:${(l.start / 1e6).toFixed(1)} Mb`,
    };
  });
  const placed = regions
    .map((r) => ({ ...r, a: chromoBins[r.chr].startPlace + r.start - 1, b: chromoBins[r.chr].startPlace + r.end - 1 }))
    .sort((x, y) => x.a - y.a);
  return { domains: placed.map((r) => [r.a, r.b]), regions: placed.map(({ a, b, ...r }) => r), reason: null };
}
