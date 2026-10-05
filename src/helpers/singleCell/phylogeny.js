// Infer a cell phylogeny when the patient folder has no tree.nwk:
// UPGMA (average linkage) on SNV or copy-number distances between cells.
import { binAt } from "./matrix";

/**
 * Jaccard distance between cells' called-variant sets, using only variants
 * called in at least two cells (singletons don't inform shared ancestry).
 * Cells without SNV data get the maximum distance (1) to everything.
 */
export function snvDistances(snv) {
  const n = snv.cells.length;
  const counts = new Int32Array(snv.variants.length);
  snv.status.forEach((row) => row.forEach((v, k) => v === 1 && (counts[k] += 1)));
  const informative = [];
  counts.forEach((c, k) => c >= 2 && informative.push(k));
  const sets = snv.status.map((row) =>
    row.every((v) => v === -1) ? null : informative.filter((k) => row[k] === 1)
  );
  const D = new Float64Array(n * n);
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      let d = 1;
      const a = sets[i];
      const b = sets[j];
      if (a && b) {
        const setB = new Set(b);
        let inter = 0;
        a.forEach((k) => setB.has(k) && (inter += 1));
        const union = a.length + b.length - inter;
        d = union ? 1 - inter / union : 0;
      }
      D[i * n + j] = d;
      D[j * n + i] = d;
    }
  }
  return D;
}

/** True if any variant is called in at least two cells. */
export function hasInformativeSnvs(snv) {
  if (!snv) return false;
  const counts = new Int32Array(snv.variants.length);
  for (const row of snv.status) {
    for (let k = 0; k < row.length; k += 1) {
      if (row[k] === 1 && (counts[k] += 1) >= 2) return true;
    }
  }
  return false;
}

/**
 * Mean absolute copy-number difference between cells, sampled on a regular
 * genome grid. rows: [{ binIndex, values } | null] aligned with cells.
 */
export function cnDistances(rows, genomeLength) {
  const n = rows.length;
  const points = Math.max(200, Math.min(2000, Math.floor(2e7 / Math.max(1, n * n))));
  const step = genomeLength / points;
  const grid = rows.map((row) => {
    const out = new Float32Array(points).fill(NaN);
    if (!row) return out;
    for (let p = 0; p < points; p += 1) {
      const b = binAt(row.binIndex, 1 + (p + 0.5) * step);
      if (b >= 0) out[p] = row.values[b];
    }
    return out;
  });
  const D = new Float64Array(n * n);
  let maxSeen = 0;
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      let sum = 0;
      let count = 0;
      const a = grid[i];
      const b = grid[j];
      for (let p = 0; p < points; p += 1) {
        if (Number.isFinite(a[p]) && Number.isFinite(b[p])) {
          sum += Math.abs(a[p] - b[p]);
          count += 1;
        }
      }
      const d = count ? sum / count : NaN;
      if (d > maxSeen) maxSeen = d;
      D[i * n + j] = d;
      D[j * n + i] = d;
    }
  }
  // Pairs with no overlap get the largest observed distance.
  for (let k = 0; k < D.length; k += 1) if (Number.isNaN(D[k])) D[k] = maxSeen || 1;
  return D;
}

/**
 * UPGMA via the nearest-neighbour-chain algorithm (O(n^2) time and memory).
 * D: Float64Array n*n symmetric distances. Returns a tree of
 * { name, length, children } nodes with leaves named by `labels`.
 */
export function upgma(D, labels) {
  const n = labels.length;
  if (n === 0) return null;
  if (n === 1) return { name: labels[0], length: null, children: [] };
  const dist = Float64Array.from(D);
  const size = new Int32Array(n).fill(1);
  const active = new Uint8Array(n).fill(1);
  const nodes = labels.map((name) => ({ name, length: 0, children: [], height: 0 }));
  let remaining = n;
  const chain = [];

  const nearest = (a, prev) => {
    let best = -1;
    let bestD = Infinity;
    for (let k = 0; k < n; k += 1) {
      if (!active[k] || k === a) continue;
      const d = dist[a * n + k];
      if (d < bestD || (d === bestD && k === prev)) {
        bestD = d;
        best = k;
      }
    }
    return best;
  };

  while (remaining > 1) {
    if (!chain.length) {
      for (let k = 0; k < n; k += 1) {
        if (active[k]) {
          chain.push(k);
          break;
        }
      }
    }
    const a = chain[chain.length - 1];
    const prev = chain.length > 1 ? chain[chain.length - 2] : -1;
    const b = nearest(a, prev);
    if (b !== prev) {
      chain.push(b);
      continue;
    }
    chain.pop();
    chain.pop();
    const d = dist[a * n + b];
    const height = d / 2;
    const merged = {
      name: null,
      height,
      length: 0,
      children: [nodes[a], nodes[b]],
    };
    nodes[a].length = Math.max(0, height - nodes[a].height);
    nodes[b].length = Math.max(0, height - nodes[b].height);
    // Lance-Williams update for average linkage; keep the merge in slot a.
    for (let k = 0; k < n; k += 1) {
      if (!active[k] || k === a || k === b) continue;
      const v = (size[a] * dist[a * n + k] + size[b] * dist[b * n + k]) / (size[a] + size[b]);
      dist[a * n + k] = v;
      dist[k * n + a] = v;
    }
    size[a] += size[b];
    active[b] = 0;
    nodes[a] = merged;
    remaining -= 1;
  }
  const rootIndex = active.findIndex((v) => v === 1);
  const root = nodes[rootIndex];
  const strip = (node) => {
    delete node.height;
    node.children.forEach(strip);
  };
  strip(root);
  root.length = null;
  return root;
}
