// d3-free: per-cell support of the junctions of a complex event, from each cell's JaBbA graph (complex.json).
// The measure is the junction copy number (connection weight), NOT a read count: no per-cell split/discordant read
// count is exported. "no graph" (no complex.json) is kept apart from 0 (graph present, junction absent).
import { eventJunctions, parseFootprint } from "./complexZoom";

/** Stable id of a junction across cells: its two breakpoints (chromosome:position), sorted. Needs both ends known. */
export function junctionKeyOf(complex, conn) {
  const byId = new Map((complex?.intervals || []).map((iv) => [Math.abs(Number(iv.iid)), iv]));
  const end = (ref) => {
    const iv = byId.get(Math.abs(Number(ref)));
    if (!iv || !Number(ref)) return null;
    return `${iv.chromosome}:${Number(ref) > 0 ? iv.endPoint : iv.startPoint}${Number(ref) > 0 ? "+" : "-"}`;
  };
  const a = end(conn.source);
  const b = end(conn.sink);
  return a && b ? [a, b].sort().join(" | ") : null;
}

/** Event junction of one cell as { key, weight, type } list (both ends known), ALT only, with a breakpoint in the footprint. */
export function cellEventJunctions(complex, location) {
  const ids = new Set(eventJunctions(complex, location).map((j) => j.cid));
  return (complex?.connections || []).filter((c) => ids.has(c.cid)).map((c) => ({ key: junctionKeyOf(complex, c), weight: Number(c.weight) || 0, title: c.title })).filter((j) => j.key);
}

/** Copy number of the cell's graph bin at a breakpoint "chr:pos±" (null when no interval covers it). */
export function binCnAt(complex, bp) {
  const m = /^([^:]+):(\d+)[+-]$/.exec(bp);
  if (!m || !complex) return null;
  const iv = (complex.intervals || []).find((x) => `${x.chromosome}` === m[1] && x.startPoint <= Number(m[2]) && x.endPoint >= Number(m[2]));
  return iv && Number.isFinite(Number(iv.y)) ? Number(iv.y) : null;
}

/**
 * Evidence matrix. rows: the event's junctions seen in at least `minCarriers` carrier graphs (most carriers first, at
 * most `maxRows`); cells: carriers then non-carriers, each in `cellOrder` (tree leaf order) then unknown ones.
 * graphs: Map cell -> complex.json object, or null / missing for "no graph".
 * value[row][cell] = { state: "cn" | "zero" | "nograph", cn, binCn } (binCn: CN of the breakpoint bins; 0 or null means no copy there).
 */
export function buildJunctionEvidence({ location, carriers = [], cellIds = [], cellOrder = [], graphs = new Map(), maxRows = 8, minCarriers = 2 }) {
  const carrierSet = new Set(carriers);
  const all = [...new Set([...carriers, ...cellIds])];
  const rank = new Map(cellOrder.map((id, i) => [id, i]));
  const ordered = (ids) => [...ids].sort((a, b) => (rank.has(a) ? rank.get(a) : 1e9) - (rank.has(b) ? rank.get(b) : 1e9) || `${a}`.localeCompare(`${b}`));
  const cells = [...ordered(all.filter((c) => carrierSet.has(c))).map((id) => ({ id, carrier: true })), ...ordered(all.filter((c) => !carrierSet.has(c))).map((id) => ({ id, carrier: false }))];
  const perCell = new Map();
  const seen = new Map();
  cells.forEach(({ id, carrier }) => {
    const g = graphs.get(id);
    if (!g) return;
    const js = new Map(cellEventJunctions(g, location).map((j) => [j.key, j]));
    perCell.set(id, js);
    if (carrier) js.forEach((_, k) => seen.set(k, (seen.get(k) || 0) + 1));
  });
  const keys = [...seen.entries()].filter(([, n]) => n >= minCarriers).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, maxRows);
  const rows = keys.map(([key, nCarriers]) => ({ key, nCarriers, breakpoints: key.split(" | ") }));
  const values = rows.map((r) =>
    cells.map(({ id }) => {
      const g = graphs.get(id);
      if (!g) return { state: "nograph" };
      const hit = perCell.get(id)?.get(r.key);
      const bins = r.breakpoints.map((bp) => binCnAt(g, bp));
      const binCn = bins.every((b) => b == null) ? null : Math.min(...bins.map((b) => (b == null ? 0 : b)));
      return hit ? { state: "cn", cn: hit.weight, binCn } : { state: "zero", cn: 0, binCn };
    })
  );
  return { rows, cells, values, footprint: parseFootprint(location) };
}

/** Per-row summary: carriers and non-carriers with the junction (state "cn") among cells with a graph. */
export function evidenceSummary(ev) {
  return ev.rows.map((r, i) => {
    const tally = { carrierHit: 0, carrierGraph: 0, otherHit: 0, otherGraph: 0 };
    ev.cells.forEach((c, j) => {
      const v = ev.values[i][j];
      if (v.state === "nograph") return;
      if (c.carrier) {
        tally.carrierGraph += 1;
        if (v.state === "cn") tally.carrierHit += 1;
      } else {
        tally.otherGraph += 1;
        if (v.state === "cn") tally.otherHit += 1;
      }
    });
    return { key: r.key, ...tally };
  });
}

/** Junction id "a|b" with its two ends in sorted order (ids and graph keys compare after this). */
export const normJunctionId = (id) => `${id}`.replace(/\s/g, "").split("|").sort().join(" | ");

/**
 * Read-support matrix from junction_identity.json: support = { id: { cell: distinct supporting read names } }.
 * Same shape as buildJunctionEvidence (rows, cells, values) with value { state: "cn" | "zero", cn: reads }; a cell
 * missing from support[id] had no read observed (coverage is not separated from absence). Rows: the given junction
 * ids with at least one carrier read, most carriers with reads first, at most maxRows.
 */
export function buildReadEvidence({ junctionIds = [], support = {}, carriers = [], cellIds = [], cellOrder = [], maxRows = 10 }) {
  const carrierSet = new Set(carriers);
  const all = [...new Set([...carriers, ...cellIds])];
  const rank = new Map(cellOrder.map((id, i) => [id, i]));
  const ordered = (ids) => [...ids].sort((a, b) => (rank.has(a) ? rank.get(a) : 1e9) - (rank.has(b) ? rank.get(b) : 1e9) || `${a}`.localeCompare(`${b}`));
  const cells = [...ordered(all.filter((c) => carrierSet.has(c))).map((id) => ({ id, carrier: true })), ...ordered(all.filter((c) => !carrierSet.has(c))).map((id) => ({ id, carrier: false }))];
  const scored = junctionIds
    .map((id) => {
      const s = support[id] || {};
      return { id, hit: carriers.filter((c) => Number(s[c]) > 0).length, reads: carriers.reduce((t, c) => t + (Number(s[c]) || 0), 0) };
    })
    .filter((r) => r.hit > 0)
    .sort((a, b) => b.hit - a.hit || b.reads - a.reads || a.id.localeCompare(b.id))
    .slice(0, maxRows);
  const rows = scored.map((r) => ({ key: r.id, nCarriers: r.hit, breakpoints: r.id.split("|") }));
  const values = rows.map((r) => cells.map(({ id }) => {
    const reads = Number(support[r.key]?.[id]) || 0;
    return reads > 0 ? { state: "cn", cn: reads } : { state: "zero", cn: 0 };
  }));
  return { rows, cells, values };
}
