// Layout of the gOS gene track: which data a window draws from, row packing, label placement without overlaps,
// gene density bins and track heights per mode. Pure functions over pixel extents; d3-free for jest.
import { collapseGene, orderTranscripts } from "./geneModels";

export const MODELS_MAX_BP = 20e6; // at or below: per-chromosome transcript models; above: the arrow gene table
export const DENSITY_FRACTION = 0.15; // above this share of the genome: density strip with only priority genes labelled

export const GEOMETRY = {
  collapsed: { rowH: 30, labelH: 13, cds: 10, utr: 5, maxRows: 3, cap: null },
  squished: { rowH: 6, labelH: 16, cds: 4, utr: 2, maxRows: 120, cap: 240 },
  expanded: { rowH: 18, labelH: 0, cds: 9, utr: 4.5, maxRows: 200, cap: 420 },
  density: { rowH: 30, labelH: 13, strip: 22 },
};

/**
 * Data source of a window [lo, hi] (places): "models" (<= 20 Mb, transcript files), "arrow" (larger: gene bodies
 * from the arrow table with a density strip) or "density" (> 15% of the genome: density strip, priority labels only).
 */
export function trackView(lo, hi, genomeSpan) {
  const w = Math.abs(hi - lo);
  if (genomeSpan && w > DENSITY_FRACTION * genomeSpan) return "density";
  if (w > MODELS_MAX_BP) return "arrow";
  return "models";
}

/** Genes per bin: a gene counts in the bin of its midpoint. Returns { counts, binSize, lo, hi, max }. */
export function densityBins(genes, lo, hi, nBins) {
  const n = Math.max(1, Math.floor(nBins) || 1);
  const counts = new Array(n).fill(0);
  const binSize = (hi - lo) / n;
  (genes || []).forEach((g) => {
    const mid = (g.start + g.end) / 2;
    if (mid < lo || mid > hi || !(binSize > 0)) return;
    counts[Math.min(n - 1, Math.floor((mid - lo) / binSize))] += 1;
  });
  return { counts, binSize, lo, hi, max: counts.reduce((m, c) => Math.max(m, c), 0) };
}

const overlaps = (row, x0, x1, gap) => row.some(([a, b]) => x0 < b + gap && x1 > a - gap);

/**
 * Greedy packing of items [{ x0, x1 }] (pixels) into rows: each goes into the first row where it does not touch
 * another item (gap px). Items are placed in the given order. Returns row indices (-1 when maxRows are full).
 */
export function packRows(items, { gap = 4, maxRows = Infinity } = {}) {
  const rows = [];
  return (items || []).map(({ x0, x1 }) => {
    for (let r = 0; r < rows.length; r += 1) {
      if (!overlaps(rows[r], x0, x1, gap)) {
        rows[r].push([x0, x1]);
        return r;
      }
    }
    if (rows.length < maxRows) {
      rows.push([[x0, x1]]);
      return rows.length - 1;
    }
    return -1;
  });
}

/**
 * Labels without overlaps: candidates [{ key, x, w, band, priority }] (x = centre px). Higher priority, then wider
 * genes (`size`), claim space first; a label is kept only if it fits inside [0, width] (clamped) and touches no
 * kept label of the same band. Returns Map key -> { x0, x1, x } of the kept labels.
 */
export function placeLabels(candidates, width, { pad = 4 } = {}) {
  const bands = new Map();
  const kept = new Map();
  [...(candidates || [])]
    .sort((a, b) => (b.priority || 0) - (a.priority || 0) || (b.size || 0) - (a.size || 0) || a.x - b.x)
    .forEach((c) => {
      if (!(c.w > 0) || c.w > width) return;
      let x0 = c.x - c.w / 2;
      x0 = Math.max(0, Math.min(width - c.w, x0));
      const x1 = x0 + c.w;
      const band = bands.get(c.band || 0) || [];
      if (overlaps(band, x0, x1, pad)) return;
      band.push([x0, x1]);
      bands.set(c.band || 0, band);
      kept.set(c.key, { x0, x1, x: x0 + c.w / 2 });
    });
  return kept;
}

/** Visible pixel span of [start, end] places under scale x, clipped to [0, width] (null when outside). */
export function visibleSpan(x, start, end, width) {
  const a = Math.max(0, x(start));
  const b = Math.min(width, x(end));
  return b >= a ? [a, b] : null;
}

/**
 * Collapsed mode: one row slot per gene. Priority genes, then the rest by start, take the first row where their
 * body touches no other body and their label (centred above it, in the row's label band) touches no other label;
 * failing that the first row with room for the body alone (label dropped); failing that row 0 unlabeled. A last
 * pass labels any unlabeled gene whose label still fits its row's band. Labels never overlap.
 * genes: normalized model genes (offset + positions); x: place -> px; measure: text -> px.
 * Returns { items: [{ gene, row, label: { x0, x1, x } | null, model, priority }], rows }.
 */
export function layoutCollapsed(genes, x, width, measure, { priority = null, maxRows = GEOMETRY.collapsed.maxRows } = {}) {
  const isP = (g) => (priority && priority.has(g.name) ? 1 : 0);
  const order = [...(genes || [])].sort((a, b) => isP(b) - isP(a) || a.offset + a.start - (b.offset + b.start));
  const bodies = [];
  const labels = [];
  const free = (list, r, x0, x1, gap) => !overlaps(list[r] || [], x0, x1, gap);
  const take = (list, r, ext) => {
    if (!list[r]) list[r] = [];
    list[r].push(ext);
  };
  const items = [];
  order.forEach((gene) => {
    const span = visibleSpan(x, gene.offset + gene.start, gene.offset + gene.end, width);
    if (!span) return;
    const w = measure(gene.name);
    const cx = (span[0] + span[1]) / 2;
    const l0 = Math.max(0, Math.min(width - w, cx - w / 2));
    const lab = w <= width ? { x0: l0, x1: l0 + w, x: l0 + w / 2 } : null;
    let row = -1;
    let label = null;
    for (let r = 0; r < maxRows && row < 0 && lab; r += 1) {
      if (free(bodies, r, span[0], span[1], 3) && free(labels, r, lab.x0, lab.x1, 8)) {
        row = r;
        label = lab;
      }
    }
    for (let r = 0; r < maxRows && row < 0; r += 1) if (free(bodies, r, span[0], span[1], 3)) row = r;
    if (row < 0) row = 0;
    take(bodies, row, span);
    if (label) take(labels, row, [label.x0, label.x1]);
    items.push({ gene, row, label, lab, model: collapseGene(gene), priority: isP(gene) === 1 });
  });
  items.forEach((it) => {
    if (it.label || !it.lab) return;
    if (free(labels, it.row, it.lab.x0, it.lab.x1, 8)) {
      it.label = it.lab;
      take(labels, it.row, [it.lab.x0, it.lab.x1]);
    }
  });
  items.forEach((it) => delete it.lab);
  return { items, rows: Math.max(1, bodies.length) };
}

/**
 * Squished / expanded modes: every transcript its own row slot, packed. Expanded rows carry the transcript name
 * left of the model (inside the panel when it would fall off the left edge). Genes in start order, each gene's
 * transcripts canonical first, so canonical isoforms take the upper rows.
 * Returns { items: [{ gene, tx, row, label }], rows, hidden, geneLabels: Map name -> { x0, x1, x } (squished) }.
 */
export function layoutIsoforms(genes, x, width, measure, { mode = "expanded", priority = null } = {}) {
  const geo = GEOMETRY[mode] || GEOMETRY.expanded;
  const sorted = [...(genes || [])].sort((a, b) => a.offset + a.start - (b.offset + b.start));
  const cand = [];
  sorted.forEach((gene) => {
    orderTranscripts(gene).forEach((tx) => {
      const span = visibleSpan(x, gene.offset + tx.txStart, gene.offset + tx.txEnd, width);
      if (!span) return;
      let label = null;
      let ext = span;
      if (mode === "expanded") {
        const w = measure(tx.name);
        let l0 = span[0] - w - 4;
        if (l0 < 0) l0 = 0;
        label = { x0: l0, x1: l0 + w, x: l0 + w / 2, inside: l0 + w + 4 > span[0] };
        ext = [Math.min(l0, span[0]), label.inside ? Math.max(span[1], l0 + w) : span[1]];
      }
      cand.push({ gene, tx, span, label, x0: ext[0], x1: ext[1] });
    });
  });
  const rowsOf = packRows(cand, { gap: mode === "expanded" ? 6 : 2, maxRows: geo.maxRows });
  const items = [];
  let hidden = 0;
  let rows = 0;
  cand.forEach((c, k) => {
    if (rowsOf[k] < 0) {
      hidden += 1;
      return;
    }
    rows = Math.max(rows, rowsOf[k] + 1);
    items.push({ gene: c.gene, tx: c.tx, row: rowsOf[k], label: c.label, span: c.span });
  });
  let geneLabels = new Map();
  if (mode === "squished") {
    const isP = (g) => (priority && priority.has(g.name) ? 1 : 0);
    geneLabels = placeLabels(
      sorted
        .map((g) => {
          const s = visibleSpan(x, g.offset + g.start, g.offset + g.end, width);
          return s && { key: g.id, x: (s[0] + s[1]) / 2, w: measure(g.name), priority: isP(g), size: s[1] - s[0] };
        })
        .filter(Boolean),
      width
    );
  }
  return { items, rows: Math.max(1, rows), hidden, geneLabels };
}

/** Content height (px) of a mode for a number of rows, and the visible height (capped; the rest scrolls). */
export function trackHeight(mode, rows) {
  const geo = GEOMETRY[mode] || GEOMETRY.collapsed;
  if (mode === "density") return { content: geo.strip + geo.rowH + 8, visible: geo.strip + geo.rowH + 8 };
  const content = geo.labelH + Math.max(1, rows) * geo.rowH + 8;
  return { content, visible: geo.cap ? Math.min(content, geo.cap) : content };
}

/** Chevron x positions (px) along an intron line [a, b], every `step` px, keeping `margin` from the ends. */
export function chevronPositions(a, b, step = 18, margin = 5) {
  const out = [];
  const len = b - a - 2 * margin;
  if (len < 6) return out;
  const n = Math.max(1, Math.floor(len / step));
  const first = a + margin + (len - (n - 1) * step) / 2;
  for (let k = 0; k < n; k += 1) out.push(first + k * step);
  return out.filter((p) => p >= a + margin && p <= b - margin);
}
