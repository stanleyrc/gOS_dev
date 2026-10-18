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

export const EVENT_JUNCTION_COLOR = "#7B4FA8";

/**
 * The event's own junctions in one cell's complex.json: ALT connections with at
 * least one breakpoint inside a footprint interval. A connection end with a
 * positive sign sits at the interval's end, a negative one at its start.
 * Returns [{ cid, weight, breakpoints: [{ chromosome, position }] }] (only the
 * breakpoints inside the footprint), in file order.
 */
export function eventJunctions(complex, location) {
  const fp = parseFootprint(location);
  if (!complex?.connections?.length || !fp.length) return [];
  const byId = new Map((complex.intervals || []).map((iv) => [Math.abs(Number(iv.iid)), iv]));
  const endOf = (ref) => {
    const iv = byId.get(Math.abs(Number(ref)));
    if (!iv || !Number.isFinite(Number(ref)) || Number(ref) === 0) return null;
    return { chromosome: `${iv.chromosome}`, position: Number(ref) > 0 ? Number(iv.endPoint) : Number(iv.startPoint) };
  };
  const out = [];
  complex.connections.forEach((c) => {
    if (c.type !== "ALT") return;
    const inside = [endOf(c.source), endOf(c.sink)].filter((e) => e && fp.some((f) => f.chromosome === e.chromosome && e.position >= f.start && e.position <= f.end));
    if (inside.length) out.push({ cid: c.cid, weight: Number(c.weight) || 0, breakpoints: inside });
  });
  return out;
}

/** { count, weight } of the event's junctions in one cell. */
export function junctionSupport(complex, location) {
  const js = eventJunctions(complex, location);
  return { count: js.length, weight: js.reduce((t, j) => t + j.weight, 0) };
}

/** First (largest weight) event junction's breakpoint { chromosome, position }, or null. */
export function firstJunctionBreakpoint(complex, location) {
  const js = eventJunctions(complex, location);
  if (!js.length) return null;
  return [...js].sort((a, b) => b.weight - a.weight)[0].breakpoints[0];
}

/** complex.json with the event's junctions coloured (connection.color); the input is not modified. */
export function highlightEventJunctions(complex, location, color = EVENT_JUNCTION_COLOR) {
  const ids = new Set(eventJunctions(complex, location).map((j) => j.cid));
  if (!ids.size) return complex;
  return { ...complex, connections: complex.connections.map((c) => (c.type === "ALT" && ids.has(c.cid) ? { ...c, color } : c)) };
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
