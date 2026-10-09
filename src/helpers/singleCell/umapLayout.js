// Screen layout of 2-D embeddings (UMAP): fill the plot box, and keep a few
// far-away cells from squashing the rest. Pure helpers (no d3) so jest can run them.

/** Linear-interpolated quantile of a sorted numeric array. */
export function quantileSorted(sorted, q) {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * Math.min(1, Math.max(0, q));
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/**
 * Axis domain of `values`: the full extent, or (robust) the [lo, hi]
 * quantiles widened by `pad` of the span, so the bulk of the cells fills
 * the plot. The full extent is kept when it is no wider than the padded
 * robust one (nothing would be clipped).
 */
export function embeddingDomain(values, { robust = true, lo = 0.02, hi = 0.98, pad = 0.12 } = {}) {
  const v = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return [0, 1];
  const full = [v[0], v[v.length - 1]];
  if (!robust || v.length < 20) return full;
  // small islands far off the bulk (a few % of cells beyond an empty gap of
  // >= 25% of the extent) are pinned too, so they do not squash the rest
  const n = v.length;
  const gapMin = 0.25 * (full[1] - full[0]);
  const maxIsland = Math.max(1, Math.floor(0.1 * n));
  let first = 0;
  let last = n - 1;
  for (let i = 0; i < maxIsland; i += 1) if (v[i + 1] - v[i] >= gapMin) first = i + 1;
  for (let i = n - 1; i > n - 1 - maxIsland; i -= 1) if (v[i] - v[i - 1] >= gapMin) last = i - 1;
  const core = v.slice(first, last + 1);
  const a = quantileSorted(core, lo);
  const b = quantileSorted(core, hi);
  const span = Math.max(1e-9, b - a);
  const d = [Math.max(core[0], a - pad * span), Math.min(core[core.length - 1], b + pad * span)];
  return d;
}

/**
 * Pixel positions for points [{ x, y }] (data units) inside a width x height
 * box with `margin` px: each axis fills the box; points outside the domain are
 * pinned to the edge and flagged `clipped`.
 */
export function layoutEmbedding(points, { width, height, margin = 14, robust = true } = {}) {
  const dx = embeddingDomain(points.map((p) => p.x), { robust });
  const dy = embeddingDomain(points.map((p) => p.y), { robust });
  const sx = (width - 2 * margin) / Math.max(1e-9, dx[1] - dx[0]);
  const sy = (height - 2 * margin) / Math.max(1e-9, dy[1] - dy[0]);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  return points.map((p) => {
    const clipped = p.x < dx[0] || p.x > dx[1] || p.y < dy[0] || p.y > dy[1];
    return {
      px: margin + (clamp(p.x, dx[0], dx[1]) - dx[0]) * sx,
      py: height - margin - (clamp(p.y, dy[0], dy[1]) - dy[0]) * sy,
      clipped,
    };
  });
}
