// d3-free helpers for the `walks` and `atac` track types (spec v0.6).
// walks: gOS walk exports (gos-sc-walks/1, walks.json = curated; walks_peel_v4.json = proposed peel / covariance
// walks), each walk = ordered nodes (chromosome, start, end, strand) + junctions between them + per-cell copies.
// atac: gos-atac-bins/1 (per unit binned accessibility + peaks). No ATAC data exist on this cluster yet; the reader
// is tested on a synthetic fixture only and the browser says "not available" otherwise.

const bare = (c) => `${c ?? ""}`.replace(/^chr/i, "");
const asBool = (v) => v === true || v === "True" || v === "true" || v === 1;

/** Walk layers offered by the track browser: id, file, label. */
export const WALK_LAYERS = [
  { id: "curated", file: "walks.json", label: "curated walks" },
  { id: "peel", file: "walks_peel_v4.json", label: "peel / covariance walks (proposed)" },
];

/** Normalized walks of one export: [{ id, label, circular, curated, nodes: [{ chrom, start, end, strand, cn }], ncells, medianCn, cells: Map, layer, method }]. */
export function parseWalks(doc, layer = "curated") {
  if (!doc || !Array.isArray(doc.walks)) return [];
  return doc.walks
    .map((w, i) => {
      const nodes = (Array.isArray(w.nodes) ? w.nodes : [])
        .map((n) => ({ chrom: bare(n.chromosome ?? n.chrom), start: Number(n.start), end: Number(n.end), strand: n.strand === "-" ? "-" : "+", cn: Number.isFinite(Number(n.cn)) && n.cn != null ? Number(n.cn) : null }))
        .filter((n) => n.chrom && Number.isFinite(n.start) && Number.isFinite(n.end));
      const cells = new Map(Object.entries(w.cells && typeof w.cells === "object" ? w.cells : {}).map(([k, v]) => [k, Number(v)]));
      return {
        id: `${w.id ?? i}`,
        label: w.label || w.gene_label || `walk ${w.id ?? i}`,
        circular: asBool(w.circular),
        curated: asBool(w.curated),
        nodes,
        ncells: Number(w.ncells) || cells.size,
        medianCn: Number.isFinite(Number(w.median_cn)) ? Number(w.median_cn) : null,
        cells,
        layer,
        method: w.method || doc.method || (layer === "curated" ? "curated" : layer),
      };
    })
    .filter((w) => w.nodes.length);
}

/** Walks with at least one node overlapping a window, most cells first; each gets inWin (node indices drawn). */
export function walksInWindows(walks, windows, { maxWalks = 40, minCells = 0 } = {}) {
  const hits = (n) => (windows || []).some((w) => bare(w.chrom) === n.chrom && n.end >= w.start && n.start <= w.end);
  return (walks || [])
    .filter((w) => w.ncells >= minCells)
    .map((w) => ({ ...w, inWin: w.nodes.map((n, i) => (hits(n) ? i : -1)).filter((i) => i >= 0) }))
    .filter((w) => w.inWin.length)
    .sort((a, b) => b.ncells - a.ncells || a.label.localeCompare(b.label))
    .slice(0, maxWalks);
}

/**
 * Screen geometry of one walk lane: node bars [{ x0, x1, i, strand }] (clipped to the windows) and links between
 * consecutive nodes [{ xa, xb, i, j, closing }] where both ends are drawn (the end of node i joins the start of node
 * i+1 in walk orientation; closing = last -> first of a circular walk). xOf(chrom, pos) -> x or null.
 */
export function walkGeometry(walk, xOf) {
  const clip = (n) => {
    const a = xOf(n.chrom, n.start);
    const b = xOf(n.chrom, n.end);
    if (a == null && b == null) return null;
    return [a ?? b, b ?? a];
  };
  const bars = [];
  walk.nodes.forEach((n, i) => {
    const c = clip(n);
    if (c) bars.push({ x0: Math.min(c[0], c[1]), x1: Math.max(c[0], c[1]), i, strand: n.strand });
  });
  const tail = (n) => xOf(n.chrom, n.strand === "-" ? n.start : n.end);
  const head = (n) => xOf(n.chrom, n.strand === "-" ? n.end : n.start);
  const links = [];
  const k = walk.nodes.length;
  const pairs = [];
  for (let i = 0; i + 1 < k; i += 1) pairs.push([i, i + 1, false]);
  if (walk.circular && k > 1) pairs.push([k - 1, 0, true]);
  if (walk.circular && k === 1) pairs.push([0, 0, true]);
  pairs.forEach(([i, j, closing]) => {
    const xa = tail(walk.nodes[i]);
    const xb = head(walk.nodes[j]);
    if (xa != null && xb != null) links.push({ xa, xb, i, j, closing });
  });
  return { bars, links };
}

/** Copies of a walk in each row unit (cells map), in row order: Float32Array (NaN = not in the export). */
export function walkCopies(walk, rowIds) {
  const out = new Float32Array(rowIds.length).fill(NaN);
  rowIds.forEach((id, r) => {
    if (walk.cells.has(id)) out[r] = walk.cells.get(id);
  });
  return out;
}

// ----- ATAC (gos-atac-bins/1)
export const ATAC_FORMAT = "gos-atac-bins/1";

/** Problems with a gos-atac-bins/1 document ([] when usable). */
export function validateAtac(doc) {
  const e = [];
  if (!doc || typeof doc !== "object") return ["not a JSON object"];
  if (doc.format !== ATAC_FORMAT) e.push(`format must be ${ATAC_FORMAT}`);
  if (!(Number(doc.bin_size) > 0)) e.push("bin_size must be > 0");
  if (!Array.isArray(doc.chroms)) e.push("chroms must be an array");
  if (!Array.isArray(doc.signal)) e.push("signal must be an array");
  const n = (doc.chroms || []).reduce((s, c) => s + (Number(c.n_bins) || 0), 0);
  if (Array.isArray(doc.signal) && doc.signal.length !== n) e.push(`signal has ${doc.signal.length} values, chroms say ${n}`);
  if (doc.cn && (!Array.isArray(doc.cn) || doc.cn.length !== n)) e.push("cn must match signal length");
  return e;
}

/**
 * Bars of the ATAC signal in the windows: [{ k, x0, x1, v }] at the export's bins (signal, or signal / CN with
 * perCopy when the export has a cn column; bins with CN 0 or missing are skipped), and peaks [{ x0, x1 }].
 */
export function atacInWindows(doc, slots, { perCopy = false } = {}) {
  const out = { bars: [], peaks: [], max: 0 };
  if (!doc) return out;
  const bs = Number(doc.bin_size);
  let offset = 0;
  const first = new Map();
  (doc.chroms || []).forEach((c) => {
    first.set(bare(c.name), { first: offset, n: Number(c.n_bins) });
    offset += Number(c.n_bins);
  });
  slots.forEach((s, k) => {
    const c = first.get(bare(s.window.chrom));
    if (!c) return;
    const lo = Math.max(0, Math.floor((s.window.start - 1) / bs));
    const hi = Math.min(c.n - 1, Math.floor((s.window.end - 1) / bs));
    const span = s.window.end - s.window.start;
    const x = (pos) => s.x0 + ((Math.max(s.window.start, Math.min(s.window.end, pos)) - s.window.start) / span) * s.width;
    for (let b = lo; b <= hi; b += 1) {
      let v = Number(doc.signal[c.first + b]);
      if (perCopy) {
        const cn = doc.cn ? Number(doc.cn[c.first + b]) : NaN;
        if (!(cn > 0)) continue;
        v /= cn;
      }
      if (!Number.isFinite(v)) continue;
      out.bars.push({ k, x0: x(b * bs + 1), x1: x((b + 1) * bs), v });
      if (v > out.max) out.max = v;
    }
    (doc.peaks || []).forEach((p) => {
      const [chr, a, b] = Array.isArray(p) ? p : [p.chrom, p.start, p.end];
      if (bare(chr) === s.window.chrom && Number(b) >= s.window.start && Number(a) <= s.window.end) out.peaks.push({ k, x0: x(Number(a)), x1: x(Number(b)) });
    });
  });
  return out;
}
