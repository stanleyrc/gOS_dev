// Order of complex SV events on the patient tree: which events' carriers nest inside which (d3-free).
// Nesting of carrier sets is consistent with an order (the inner event arose in a cell that already had the outer one),
// it is not proof: allele/junction dropout hides carriers, and independent events can sit in the same clade.
import { cladeFitScore } from "./cladeFit";

export const MIN_CELLS = 5;
export const CONTAIN = 0.9;
export const CLONAL = 0.95;

const ids = (e) => `${e?.cell_ids || ""}`.split(",").filter(Boolean);

/** Truncal when the carriers are (nearly) all tumour cells, private when the best clade is one cell, subclonal otherwise. */
export function placementOf(n, nTumor, fit) {
  if (nTumor && n / nTumor >= CLONAL) return "truncal";
  if (fit && fit.clade <= 1) return "private";
  return "subclonal";
}

/**
 * One node per event, twins (rows sharing `twin_group`: same cells, same junctions, two classifier names) collapsed into one
 * node that lists every name.
 * @returns [{ id, names, events, cells:Set, n, fit, clade, f1, cladeSize, placement, fraction }]
 */
export function eventNodes(events, { tree = null, tumorIds = null, minCells = MIN_CELLS } = {}) {
  const tumor = tumorIds && tumorIds.length ? new Set(tumorIds.map(String)) : null;
  const groups = new Map();
  (events || []).forEach((e, i) => {
    if (e?.type !== "Complex SV") return;
    const key = e.twin_group || `solo:${i}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  });
  const nodes = [];
  groups.forEach((rows, key) => {
    const lists = rows.map((r) => ids(r).filter((c) => !tumor || tumor.has(c)));
    const best = lists.reduce((a, b) => (b.length > a.length ? b : a), []); // twins carry the same cells; take the largest
    if (best.length < minCells) return;
    const names = [];
    rows.forEach((r) => (Array.isArray(r.twin_names) && r.twin_names.length ? r.twin_names : [r.Variant || r.vartype || "complex"]).forEach((n) => !names.includes(n) && names.push(n)));
    const fit = tree ? cladeFitScore(best, tree) : null;
    const fraction = tumor ? best.length / tumor.size : null;
    nodes.push({
      id: key,
      names,
      events: rows,
      cells: new Set(best),
      n: best.length,
      f1: fit && Number.isFinite(fit.score) ? fit.score : null,
      cladeSize: fit && Number.isFinite(fit.score) ? fit.clade : null,
      fraction,
      placement: placementOf(best.length, tumor ? tumor.size : 0, fit && Number.isFinite(fit.score) ? fit : null),
      location: rows[0].Genome_Location || "",
    });
  });
  return nodes.sort((a, b) => b.n - a.n || a.names[0].localeCompare(b.names[0]));
}

/** Containment edges outer -> inner: inner inside outer when |A and B| >= frac * |B| and |A| > |B|. */
export function containmentEdges(nodes, frac = CONTAIN) {
  const edges = [];
  nodes.forEach((a) =>
    nodes.forEach((b) => {
      if (a === b || a.n <= b.n) return;
      let inter = 0;
      b.cells.forEach((c) => a.cells.has(c) && (inter += 1));
      if (inter >= frac * b.n) edges.push({ from: a.id, to: b.id, overlap: inter, inner: b.n, outer: a.n, outside: b.n - inter });
    })
  );
  return edges;
}

/** Transitive reduction: drop A -> C when some A -> B -> C exists (Hasse diagram). */
export function transitiveReduction(edges) {
  const out = new Map();
  edges.forEach((e) => {
    if (!out.has(e.from)) out.set(e.from, new Set());
    out.get(e.from).add(e.to);
  });
  return edges.filter((e) => ![...(out.get(e.from) || [])].some((m) => m !== e.to && out.get(m)?.has(e.to)));
}

/** Depth of each node = longest path from a root of the reduced graph (0 = outermost). */
export function layers(nodes, edges) {
  const depth = new Map(nodes.map((n) => [n.id, 0]));
  // edges always go from larger to smaller carrier sets, so relaxing in node order (n descending) is a topological pass
  const order = [...nodes].sort((a, b) => b.n - a.n);
  order.forEach((n) => edges.filter((e) => e.from === n.id).forEach((e) => depth.set(e.to, Math.max(depth.get(e.to), depth.get(n.id) + 1))));
  return depth;
}

/**
 * Full event order of one patient.
 * @param events filtered events of the patient
 * @param opts { tree, tumorIds, minCells, frac }
 * @returns { nodes (with depth, parents, children), edges (reduced), allEdges, depth }
 */
export function eventOrder(events, opts = {}) {
  const nodes = eventNodes(events, opts);
  const allEdges = containmentEdges(nodes, opts.frac ?? CONTAIN);
  const edges = transitiveReduction(allEdges);
  const depth = layers(nodes, edges);
  nodes.forEach((n) => {
    n.depth = depth.get(n.id);
    n.parents = edges.filter((e) => e.to === n.id).map((e) => e.from);
    n.children = edges.filter((e) => e.from === n.id).map((e) => e.to);
  });
  return { nodes, edges, allEdges, depth: Math.max(0, ...depth.values()) };
}

/** Plain-language reading of one edge. */
export function edgeText(edge, byId) {
  const a = byId.get(edge.from);
  const b = byId.get(edge.to);
  if (!a || !b) return "";
  const tail = edge.outside ? ` (${edge.outside} carrier${edge.outside === 1 ? "" : "s"} of the inner event lie outside)` : "";
  return `${b.names.join(" = ")} (${b.n} cells): ${edge.overlap} of ${edge.inner} carriers are also carriers of ${a.names.join(" = ")} (${a.n} cells)${tail}. Consistent with ${b.names[0]} arising after ${a.names[0]}; dropout or independent events in the same clade give the same pattern.`;
}

/** Layered positions for an SVG: x by depth, y by row inside the layer. */
export function layoutOrder(order, { colW = 340, rowH = 58, padX = 10, padY = 10, nodeW = 250, nodeH = 46 } = {}) {
  const rows = new Map();
  const pos = new Map();
  [...order.nodes].sort((a, b) => a.depth - b.depth || b.n - a.n).forEach((n) => {
    const r = rows.get(n.depth) || 0;
    rows.set(n.depth, r + 1);
    pos.set(n.id, { x: padX + n.depth * colW, y: padY + r * rowH, w: nodeW, h: nodeH });
  });
  const width = padX * 2 + (order.depth) * colW + nodeW;
  const height = padY * 2 + Math.max(1, ...rows.values()) * rowH;
  return { pos, width, height };
}
