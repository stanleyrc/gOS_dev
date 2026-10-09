// Geometry and statistics behind the interactive Paper figures (cohort
// "Paper figures" tab): smooth violins on a log axis, 2-D density contours,
// lasso / brush hit tests and tree pruning for the selected-cells popup.
// d3-free so jest can run it.

import { walkContainment } from "./walks";

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

/**
 * Display depths for a tree layout with over-long branches shortened (the
 * paper's "//" breaks): a branch longer than `factor` x the median branch
 * length (and longer than `minFrac` of the tree depth) is drawn at that cap. Returns { x: Float64Array per node, broken: Uint8Array per node
 * (1 = the branch above the node was cut), maxX }.
 */
export function compressLongBranches(layout, { factor = 8, minFrac = 0.06 } = {}) {
  const nodes = layout?.nodes || [];
  const x = new Float64Array(nodes.length);
  const broken = new Uint8Array(nodes.length);
  if (!nodes.length) return { x, broken, maxX: 0 };
  const lens = nodes.filter((n) => n.parent >= 0).map((n) => Math.max(0, n.x - nodes[n.parent].x)).sort((a, b) => a - b);
  const med = lens.length ? lens[Math.floor(0.5 * (lens.length - 1))] : 0;
  const cap = Math.max(med * factor, (layout.maxX || 0) * minFrac);
  let maxX = 0;
  // node ids are assigned in pre-order, so a parent always precedes its children
  nodes.forEach((n, i) => {
    if (n.parent < 0) {
      x[i] = 0;
      return;
    }
    const len = Math.max(0, n.x - nodes[n.parent].x);
    const use = cap > 0 && len > cap ? cap : len;
    broken[i] = cap > 0 && len > cap ? 1 : 0;
    x[i] = x[n.parent] + use;
    if (x[i] > maxX) maxX = x[i];
  });
  return { x, broken, maxX };
}

/**
 * Marginal ancestral states of a binary trait (e.g. carries an ecDNA walk)
 * on a tree layout, under a symmetric two-state Markov model with the rate
 * chosen by maximum likelihood over a grid. `present(name)` returns true /
 * false for measured leaves and null for unknown ones. Branch lengths are
 * the layout depths (node.x). Returns { p: Float64Array (P(present) per
 * node), rate, logLik }.
 */
export function ancestralBinary(layout, present) {
  const nodes = layout?.nodes || [];
  const N = nodes.length;
  const p = new Float64Array(N).fill(NaN);
  if (!N) return { p, rate: NaN, logLik: NaN };
  const depth = Math.max(1e-9, layout.maxX || nodes.reduce((m, n) => Math.max(m, n.x), 0));
  const tOf = (i) => (nodes[i].parent < 0 ? 0 : Math.max(depth * 1e-4, nodes[i].x - nodes[nodes[i].parent].x));
  const leafL = nodes.map((n) => {
    if (!n.isLeaf) return null;
    const v = present(n.name);
    return v == null ? [1, 1] : v ? [0, 1] : [1, 0];
  });
  const trans = (q, t) => {
    const e = Math.exp(-2 * q * t);
    return [0.5 + 0.5 * e, 0.5 - 0.5 * e]; // [same, change]
  };
  // up pass: per-node partial likelihoods (normalised, log scale kept separately)
  const upPass = (q) => {
    const L = new Array(N);
    let logScale = 0;
    for (let i = N - 1; i >= 0; i -= 1) {
      const n = nodes[i];
      if (n.isLeaf) {
        L[i] = leafL[i];
        continue;
      }
      let a = 1;
      let b = 1;
      n.children.forEach((c) => {
        const [s, d] = trans(q, tOf(c));
        a *= s * L[c][0] + d * L[c][1];
        b *= d * L[c][0] + s * L[c][1];
      });
      const m = Math.max(a, b) || 1e-300;
      logScale += Math.log(m);
      L[i] = [a / m, b / m];
    }
    const root = nodes.findIndex((n) => n.parent < 0);
    return { L, root, logLik: logScale + Math.log(0.5 * L[root][0] + 0.5 * L[root][1] || 1e-300) };
  };
  let best = null;
  [0.03, 0.1, 0.3, 1, 3, 10, 30].forEach((k) => {
    const q = k / depth;
    const r = upPass(q);
    if (!best || r.logLik > best.logLik) best = { ...r, q };
  });
  const { L, root, q } = best;
  // down pass: U[i] = likelihood of everything outside the subtree of i, given i's state
  const U = new Array(N);
  U[root] = [0.5, 0.5];
  for (let i = 0; i < N; i += 1) {
    const n = nodes[i];
    if (n.isLeaf || !U[i]) continue;
    const msgs = n.children.map((c) => {
      const [s, d] = trans(q, tOf(c));
      return [s * L[c][0] + d * L[c][1], d * L[c][0] + s * L[c][1]];
    });
    n.children.forEach((c, k) => {
      let a = U[i][0];
      let b = U[i][1];
      msgs.forEach((m, j) => {
        if (j === k) return;
        a *= m[0];
        b *= m[1];
      });
      const [s, d] = trans(q, tOf(c));
      const u0 = a * s + b * d;
      const u1 = a * d + b * s;
      const sum = u0 + u1 || 1e-300;
      U[c] = [u0 / sum, u1 / sum];
    });
  }
  for (let i = 0; i < N; i += 1) {
    const a = U[i][0] * L[i][0];
    const b = U[i][1] * L[i][1];
    p[i] = a + b > 0 ? b / (a + b) : NaN;
  }
  return { p, rate: q, logLik: best.logLik };
}

/**
 * Nesting of ecDNA variants (Fig 4C): each walk's parent is the smallest
 * other walk holding >= `minShared` of its bases. Returns { parent: Int32Array
 * (-1 = root), depth: Int32Array, order: walk indices in tree pre-order }.
 */
export function variantNesting(walks, { minShared = 0.9 } = {}) {
  const n = walks.length;
  const parent = new Int32Array(n).fill(-1);
  const depth = new Int32Array(n);
  if (!n) return { parent, depth, order: [] };
  const { matrix, lengths } = walkContainment(walks);
  for (let i = 0; i < n; i += 1) {
    let best = -1;
    for (let j = 0; j < n; j += 1) {
      if (i === j || matrix[i][j] < minShared) continue;
      // a parent must be larger (ties: the lower index, so two identical walks do not point at each other)
      if (lengths[j] < lengths[i] || (lengths[j] === lengths[i] && j > i)) continue;
      if (best < 0 || lengths[j] < lengths[best]) best = j;
    }
    parent[i] = best;
  }
  const kids = Array.from({ length: n }, () => []);
  parent.forEach((p, i) => p >= 0 && kids[p].push(i));
  const order = [];
  const visit = (i, d) => {
    depth[i] = d;
    order.push(i);
    kids[i].sort((a, b) => lengths[b] - lengths[a]).forEach((k) => visit(k, d + 1));
  };
  [...Array(n).keys()].filter((i) => parent[i] < 0).sort((a, b) => lengths[b] - lengths[a]).forEach((r) => visit(r, 0));
  return { parent, depth, order };
}

/** Padded global windows ([a, b]) around walk nodes, one per chromosome. chromoBins: { chr: { startPlace, startPoint, endPoint } }. */
export function walkDomains(walks, chromoBins, { pad = 1.5e6, frac = 0.25 } = {}) {
  const by = new Map();
  walks.forEach((w) =>
    (w.nodes || []).forEach((nd) => {
      const chr = `${nd.chromosome}`.replace(/^chr/, "");
      if (!chromoBins?.[chr]) return;
      const s = Math.min(Number(nd.start), Number(nd.end));
      const e = Math.max(Number(nd.start), Number(nd.end));
      const cur = by.get(chr);
      by.set(chr, cur ? [Math.min(cur[0], s), Math.max(cur[1], e)] : [s, e]);
    })
  );
  return [...by.entries()]
    .map(([chr, [s, e]]) => {
      const bin = chromoBins[chr];
      const p = Math.max(pad, frac * (e - s));
      const a = bin.startPlace + Math.max(bin.startPoint ?? 1, s - p);
      const b = bin.startPlace + Math.min(bin.endPoint ?? e + p, e + p);
      return [a, b];
    })
    .filter((d) => d[1] > d[0])
    .sort((x, y) => x[0] - y[0]);
}

/**
 * The store's SNV matrix (helpers/singleCell/cellFiles snvFromSparse: per-cell
 * alt / depth arrays) as packed per-cell reads { cellId: { idx, vaf (0-250) } },
 * the layout figures.js snvTreeOrder / binSnvMatrix take.
 */
export function packStoreSnv(data) {
  const out = {};
  if (!data?.cells) return out;
  data.cells.forEach((id, r) => {
    const a = data.alt[r];
    const d = data.depth[r];
    let k = 0;
    for (let j = 0; j < d.length; j += 1) if (d[j] > 0) k += 1;
    const idx = new Int32Array(k);
    const vaf = new Uint8Array(k);
    k = 0;
    for (let j = 0; j < d.length; j += 1) {
      if (!(d[j] > 0)) continue;
      idx[k] = j;
      vaf[k] = Math.round((250 * (a[j] || 0)) / d[j]);
      k += 1;
    }
    out[id] = { idx, vaf };
  });
  return out;
}
