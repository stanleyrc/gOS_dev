// Geometry and statistics behind the interactive Paper figures (cohort
// "Paper figures" tab): smooth violins on a log axis, 2-D density contours,
// lasso / brush hit tests and tree pruning for the selected-cells popup.
// d3-free so jest can run it.

const finite = (v) => Number.isFinite(v);

/** Silverman bandwidth of a sample (falls back to `min` for tiny or flat samples). */
export function silverman(xs, min = 0.03) {
  const n = xs.length;
  if (n < 2) return Math.max(min, 0.1);
  let mean = 0;
  for (let i = 0; i < n; i += 1) mean += xs[i];
  mean /= n;
  let s2 = 0;
  for (let i = 0; i < n; i += 1) s2 += (xs[i] - mean) ** 2;
  const sd = Math.sqrt(s2 / (n - 1));
  const sorted = Float64Array.from(xs).sort();
  const iqr = sorted[Math.floor(0.75 * (n - 1))] - sorted[Math.floor(0.25 * (n - 1))];
  const spread = Math.min(sd, iqr > 0 ? iqr / 1.34 : sd) || sd || 0.1;
  return Math.max(min, 0.9 * spread * n ** -0.2);
}

/** A "nice" log10 domain [lo, hi] (powers of 1-2-5) covering positive values. */
export function niceLogDomain(values, { floor = 1, minHi = 10 } = {}) {
  let hi = minHi;
  values.forEach((v) => {
    if (finite(v) && v > hi) hi = v;
  });
  const steps = [1, 2, 5];
  let p = 1;
  while (p * 10 <= hi) p *= 10;
  const top = steps.map((s) => s * p).find((s) => s >= hi) || 10 * p;
  return [floor, top];
}

/**
 * Smooth Gaussian kernel density of positive values on a log10 axis.
 * Returns { x: Float64Array (log10 positions), y: Float64Array (density,
 * max 1) } on `n` points spanning [lo, hi], tails cut where the density
 * falls below `cut` so the outline ends where the data end.
 */
export function logKde(values, { lo = 1, hi = 100, n = 96, cut = 0.004, bandwidth } = {}) {
  const xs = [];
  values.forEach((v) => {
    if (finite(v) && v > 0) xs.push(Math.log10(Math.max(lo, v)));
  });
  const a = Math.log10(lo);
  const b = Math.log10(hi);
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  if (!xs.length) return { x, y, n: 0, bw: 0 };
  const bw = bandwidth || silverman(xs);
  let max = 0;
  for (let k = 0; k < n; k += 1) {
    x[k] = a + ((b - a) * k) / (n - 1);
    let s = 0;
    for (let i = 0; i < xs.length; i += 1) {
      const z = (x[k] - xs[i]) / bw;
      if (z > -5 && z < 5) s += Math.exp(-0.5 * z * z);
    }
    y[k] = s;
    if (s > max) max = s;
  }
  if (max > 0) for (let k = 0; k < n; k += 1) y[k] = y[k] / max < cut ? 0 : y[k] / max;
  return { x, y, n: xs.length, bw };
}

/**
 * 2-D Gaussian KDE of points on a grid: returns { z: Float32Array (gx*gy,
 * row-major, max 1), gx, gy, x0, x1, y0, y1 }. Bandwidths per axis by
 * Silverman's rule (scaled by `adjust`).
 */
export function kde2d(points, { x0, x1, y0, y1, gx = 48, gy = 48, adjust = 1 } = {}) {
  const z = new Float32Array(gx * gy);
  const pts = points.filter((p) => finite(p[0]) && finite(p[1]));
  if (pts.length < 3) return { z, gx, gy, x0, x1, y0, y1 };
  const bx = Math.max((x1 - x0) / 60, silverman(pts.map((p) => p[0]), 0) * adjust);
  const by = Math.max((y1 - y0) / 60, silverman(pts.map((p) => p[1]), 0) * adjust);
  const dx = (x1 - x0) / (gx - 1);
  const dy = (y1 - y0) / (gy - 1);
  let max = 0;
  // separable: accumulate each point's kernel only within 4 bandwidths
  pts.forEach(([px, py]) => {
    const ia = Math.max(0, Math.floor((px - 4 * bx - x0) / dx));
    const ib = Math.min(gx - 1, Math.ceil((px + 4 * bx - x0) / dx));
    const ja = Math.max(0, Math.floor((py - 4 * by - y0) / dy));
    const jb = Math.min(gy - 1, Math.ceil((py + 4 * by - y0) / dy));
    for (let j = ja; j <= jb; j += 1) {
      const zy = (y0 + j * dy - py) / by;
      const ky = Math.exp(-0.5 * zy * zy);
      for (let i = ia; i <= ib; i += 1) {
        const zx = (x0 + i * dx - px) / bx;
        z[j * gx + i] += ky * Math.exp(-0.5 * zx * zx);
      }
    }
  });
  for (let k = 0; k < z.length; k += 1) if (z[k] > max) max = z[k];
  if (max > 0) for (let k = 0; k < z.length; k += 1) z[k] /= max;
  return { z, gx, gy, x0, x1, y0, y1 };
}

/**
 * Iso-line segments of a grid at `level` (marching squares, linear
 * interpolation), in data coordinates: [[xa, ya, xb, yb], ...].
 */
export function contourSegments({ z, gx, gy, x0, x1, y0, y1 }, level) {
  const out = [];
  const dx = (x1 - x0) / (gx - 1);
  const dy = (y1 - y0) / (gy - 1);
  const at = (i, j) => z[j * gx + i];
  const lerp = (a, b) => (level - a) / (b - a || 1e-12);
  for (let j = 0; j < gy - 1; j += 1) {
    for (let i = 0; i < gx - 1; i += 1) {
      const v0 = at(i, j);
      const v1 = at(i + 1, j);
      const v2 = at(i + 1, j + 1);
      const v3 = at(i, j + 1);
      const code = (v0 >= level ? 1 : 0) | (v1 >= level ? 2 : 0) | (v2 >= level ? 4 : 0) | (v3 >= level ? 8 : 0);
      if (code === 0 || code === 15) continue;
      const X = x0 + i * dx;
      const Y = y0 + j * dy;
      // edge points: bottom (0-1), right (1-2), top (3-2), left (0-3)
      const e = {
        b: [X + lerp(v0, v1) * dx, Y],
        r: [X + dx, Y + lerp(v1, v2) * dy],
        t: [X + lerp(v3, v2) * dx, Y + dy],
        l: [X, Y + lerp(v0, v3) * dy],
      };
      const seg = (p, q) => out.push([e[p][0], e[p][1], e[q][0], e[q][1]]);
      switch (code) {
        case 1: case 14: seg("l", "b"); break;
        case 2: case 13: seg("b", "r"); break;
        case 3: case 12: seg("l", "r"); break;
        case 4: case 11: seg("r", "t"); break;
        case 6: case 9: seg("b", "t"); break;
        case 7: case 8: seg("l", "t"); break;
        case 5: seg("l", "t"); seg("b", "r"); break;
        case 10: seg("l", "b"); seg("r", "t"); break;
        default: break;
      }
    }
  }
  return out;
}

/** Ray-casting point-in-polygon; polygon [[x, y], ...]. */
export function pointInPolygon(x, y, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-12) + xi) inside = !inside;
  }
  return inside;
}

/** Least-squares fit y = a + b x with R²; NaNs when fewer than 3 points. */
export function fitLine(xs, ys) {
  let n = 0;
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < xs.length; i += 1) {
    if (finite(xs[i]) && finite(ys[i])) {
      n += 1;
      sx += xs[i];
      sy += ys[i];
    }
  }
  if (n < 3) return { slope: NaN, intercept: NaN, r2: NaN, n };
  const mx = sx / n;
  const my = sy / n;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (let i = 0; i < xs.length; i += 1) {
    if (!(finite(xs[i]) && finite(ys[i]))) continue;
    sxx += (xs[i] - mx) ** 2;
    sxy += (xs[i] - mx) * (ys[i] - my);
    syy += (ys[i] - my) ** 2;
  }
  const slope = sxx > 0 ? sxy / sxx : NaN;
  return { slope, intercept: my - slope * mx, r2: sxx > 0 && syy > 0 ? (sxy * sxy) / (sxx * syy) : NaN, n };
}

/** Nice linear ticks over [a, b] (about `count`). */
export function niceTicks(a, b, count = 5) {
  if (!(b > a)) return [a];
  const raw = (b - a) / Math.max(1, count);
  const p = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= raw) || 10 * p;
  const out = [];
  for (let v = Math.ceil(a / step) * step; v <= b + step * 1e-9; v += step) out.push(Number(v.toFixed(10)));
  return out;
}

/**
 * The layout (helpers/singleCell/newick layoutTree shape) restricted to the
 * leaves in `keep`: unary internal nodes are collapsed, leaf order kept.
 * Returns { nodes, leaves, maxX } or null when no leaf is kept.
 */
export function pruneLayout(layout, keep) {
  if (!layout?.nodes?.length) return null;
  const { nodes } = layout;
  const root = nodes.findIndex((n) => n.parent < 0);
  const out = [];
  const leaves = [];
  // post-order over old nodes to know which subtrees keep leaves
  const has = new Uint8Array(nodes.length);
  for (let k = nodes.length - 1; k >= 0; k -= 1) {
    const n = nodes[k];
    if (n.isLeaf) has[k] = keep.has(n.name) ? 1 : 0;
    else has[k] = n.children.some((c) => has[c]) ? 1 : 0;
  }
  if (!has[root]) return null;
  // walk down from the root, skipping nodes with a single kept child
  const build = (id, parent) => {
    let cur = id;
    for (;;) {
      const n = nodes[cur];
      if (n.isLeaf) break;
      const kids = n.children.filter((c) => has[c]);
      if (kids.length !== 1 || cur === root) break;
      cur = kids[0];
    }
    const n = nodes[cur];
    const node = { id: out.length, name: n.name, x: n.x, y: 0, parent, children: [], firstLeaf: -1, lastLeaf: -1, isLeaf: n.isLeaf, orig: cur };
    out.push(node);
    if (parent >= 0) out[parent].children.push(node.id);
    if (!n.isLeaf) n.children.filter((c) => has[c]).forEach((c) => build(c, node.id));
    return node;
  };
  build(root, -1); // recursion depth = tree depth (a few hundred at most)
  out.forEach((n) => {
    if (n.isLeaf) {
      n.firstLeaf = leaves.length;
      n.lastLeaf = leaves.length;
      n.y = leaves.length;
      leaves.push(n.name);
    }
  });
  for (let k = out.length - 1; k >= 0; k -= 1) {
    const n = out[k];
    if (n.isLeaf) continue;
    const first = out[n.children[0]];
    const last = out[n.children[n.children.length - 1]];
    n.firstLeaf = first.firstLeaf;
    n.lastLeaf = last.lastLeaf;
    n.y = (first.y + last.y) / 2;
  }
  const minX = out[0].x;
  out.forEach((n) => (n.x -= minX));
  return { nodes: out, leaves, maxX: out.reduce((m, n) => Math.max(m, n.x), 0) };
}

/** Leaf names under a layout node. */
export function leavesUnder(layout, nodeId) {
  const n = layout.nodes[nodeId];
  return n ? layout.leaves.slice(n.firstLeaf, n.lastLeaf + 1) : [];
}

/**
 * Row order of a patient's cells for the clone figure: tree leaves first
 * (those present in `cellIds`), then the cells the tree does not place.
 */
export function figureRows(layout, cellIds) {
  const present = new Set(cellIds);
  const rows = layout ? layout.leaves.filter((id) => present.has(id)) : [];
  const placed = new Set(rows);
  const unplaced = cellIds.filter((id) => !placed.has(id));
  return { rows: [...rows, ...unplaced], nTree: rows.length };
}

/** Counts of a categorical field over cells: [[level, n]] by n. */
export function countBy(cells, field) {
  const m = new Map();
  cells.forEach((c) => {
    const v = c?.[field] == null || c[field] === "" ? "NA" : `${c[field]}`;
    m.set(v, (m.get(v) || 0) + 1);
  });
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], undefined, { numeric: true }));
}
