// d3-free helpers for the per-cell genome-graph zoom of complex SV events
// (rDelDup, rDel, rDup, DM, TIC, BFB, chromoplexy ...).

export const COMPLEX_PADS = [0, 5e4, 2.5e5, 1e6, 5e6];
export const COMPLEX_PAD_FRACTION = 0.2;
export const MAX_SCANNED_CARRIERS = 40;

/** True for a "Complex SV" filtered-event row. */
export const isComplexEvent = (e) => Boolean(e && (e.type === "Complex SV" || (e.vartype && /^(rdeldup|rdel|rdup|dm|cpxdm|tic|bfb|chromoplexy|chromothripsis|rigma|tyfonas|pyrgo|cpxdm)$/i.test(`${e.vartype}`) && e.Genome_Location)));

/**
 * Intervals of an event footprint. `Genome_Location` may hold several
 * intervals separated by comma, semicolon or pipe ("20:1-5,20:3-9"); a bare
 * "chr:pos" becomes a 1 bp interval. Malformed pieces are dropped.
 */
export function parseFootprint(location) {
  return `${location || ""}`
    .split(/[,;|]/)
    .map((s) => s.trim().match(/^(?:chr)?([^:\s]+):(\d+)(?:-(?:(?:chr)?([^:\s]+):)?(\d+))?$/i))
    .filter(Boolean)
    .map((m) => {
      const a = Number(m[2]);
      const b = m[4] === undefined ? a : Number(m[4]);
      return { chromosome: m[3] && m[3] !== m[1] ? null : m[1], start: Math.min(a, b), end: Math.max(a, b) };
    })
    .filter((iv) => iv.chromosome);
}

/** Intervals padded by `pad` bp and merged where they overlap on the same chromosome. */
export function mergeIntervals(intervals, pad = 0) {
  const sorted = intervals.map((iv) => ({ ...iv, start: Math.max(1, iv.start - pad), end: iv.end + pad })).sort((x, y) => (x.chromosome === y.chromosome ? x.start - y.start : `${x.chromosome}`.localeCompare(`${y.chromosome}`, undefined, { numeric: true })));
  const out = [];
  sorted.forEach((iv) => {
    const last = out[out.length - 1];
    if (last && last.chromosome === iv.chromosome && iv.start <= last.end) last.end = Math.max(last.end, iv.end);
    else out.push({ ...iv });
  });
  return out;
}

/** Pipe-separated location string (the one locationToDomains reads) of the footprint, "" when none. */
export function footprintLocation(location) {
  return parseFootprint(location).map((iv) => `${iv.chromosome}:${iv.start}-${iv.end}`).join("|");
}

/** The pad option closest to 20% of the largest footprint interval. */
export function defaultFootprintPad(location, pads = COMPLEX_PADS) {
  const span = Math.max(0, ...parseFootprint(location).map((iv) => iv.end - iv.start));
  const want = span * COMPLEX_PAD_FRACTION;
  return pads.reduce((best, p) => (Math.abs(p - want) < Math.abs(best - want) ? p : best), pads[0]);
}

const idOf = (v) => Math.abs(Number(v));

/**
 * ALT junctions of one cell's complex.json that touch the footprint: at least
 * one end on an interval overlapping a footprint interval. Returns
 * { count, weight } (weight = summed junction CN/support).
 */
export function junctionSupport(complex, location) {
  const fp = parseFootprint(location);
  if (!complex?.connections?.length || !fp.length) return { count: 0, weight: 0 };
  const inside = new Set(
    (complex.intervals || [])
      .filter((iv) => fp.some((f) => `${iv.chromosome}` === `${f.chromosome}` && iv.startPoint <= f.end && iv.endPoint >= f.start))
      .map((iv) => idOf(iv.iid))
  );
  let count = 0;
  let weight = 0;
  complex.connections.forEach((c) => {
    if (c.type !== "ALT") return;
    if (inside.has(idOf(c.source)) || inside.has(idOf(c.sink))) {
      count += 1;
      weight += Number(c.weight) || 0;
    }
  });
  return { count, weight };
}

/**
 * Default carrier cell: the cell the event was called in if it carries the
 * event, else the carrier with the most ALT junction weight (then count),
 * else the first carrier. `support` is a Map cell -> { count, weight }.
 */
export function chooseCarrierCell(event, carriers, support = new Map()) {
  if (!carriers?.length) return null;
  if (event?.sample && carriers.includes(event.sample)) return event.sample;
  const score = (id) => support.get(id) || { count: 0, weight: 0 };
  return [...carriers].sort((a, b) => score(b).weight - score(a).weight || score(b).count - score(a).count)[0];
}

/** Carrier cell ids of an event row. */
export const carrierCells = (event) => `${event?.cell_ids || ""}`.split(",").map((s) => s.trim()).filter(Boolean);
