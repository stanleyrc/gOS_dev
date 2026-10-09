// DNA-anchored clone assignment for RNA-only cells, and an inferCNV-style
// benchmark of RNA-inferred copy number against the DNA copy number of the
// same cells. d3-free so it can be unit tested.
import { binAt } from "./matrix";

const dist2 = (P, a, b) => {
  let s = 0;
  for (let d = 0; d < P.length; d += 1) s += (P[d][a] - P[d][b]) ** 2;
  return s;
};

/**
 * k-nearest-neighbour clone calls. P = [dims][nCells] (e.g. PC scores);
 * train = indices with known labels (labels[i]); query = indices to call.
 * Returns [{ idx, label, conf }] with conf = vote share of the winning label.
 */
export function knnAssign(P, train, labels, query, k = 7) {
  return query.map((q) => {
    const near = train
      .filter((t) => t !== q)
      .map((t) => [dist2(P, q, t), t])
      .sort((a, b) => a[0] - b[0])
      .slice(0, k);
    const votes = new Map();
    near.forEach(([, t]) => votes.set(labels[t], (votes.get(labels[t]) || 0) + 1));
    const best = [...votes.entries()].sort((a, b) => b[1] - a[1] || `${a[0]}`.localeCompare(`${b[0]}`))[0];
    return { idx: q, label: best ? best[0] : null, conf: best ? best[1] / near.length : 0 };
  });
}

/** Leave-one-out accuracy of knnAssign on the training cells, overall and per clone, with a confusion map "true -> predicted". */
export function looAccuracy(P, train, labels, k = 7) {
  const calls = knnAssign(P, train, labels, train, k);
  const perClone = {};
  const confusion = {};
  let correct = 0;
  calls.forEach((c) => {
    const truth = labels[c.idx];
    perClone[truth] = perClone[truth] || { n: 0, correct: 0 };
    perClone[truth].n += 1;
    confusion[truth] = confusion[truth] || {};
    confusion[truth][c.label] = (confusion[truth][c.label] || 0) + 1;
    if (c.label === truth) {
      correct += 1;
      perClone[truth].correct += 1;
    }
  });
  return { accuracy: calls.length ? correct / calls.length : NaN, perClone, confusion };
}

/** Majority-class rate: the accuracy a classifier must beat. */
export function baselineAccuracy(train, labels) {
  const m = new Map();
  train.forEach((t) => m.set(labels[t], (m.get(labels[t]) || 0) + 1));
  return train.length ? Math.max(...m.values()) / train.length : NaN;
}

/**
 * RNA arm scores per cell (inferCNV-style, without smoothing windows): mean
 * over the arm's expressed genes (mean >= minMean) of the gene's log
 * expression minus its mean over all cells. Returns { arms: [names], scores:
 * [Float64Array(nCells)] per arm, nGenes: [per arm] }. genePos: gene -> global
 * position; arms: [{ name, gStart, gEnd }].
 */
export function rnaArmScores(summary, matrix, genePos, arms, { minMean = 0.1, minGenes = 20 } = {}) {
  const n = summary.cells.length;
  const armGenes = arms.map(() => []);
  summary.genes.forEach((gene, g) => {
    const pos = genePos.get(gene);
    if (!Number.isFinite(pos)) return;
    const a = arms.findIndex((x) => pos >= x.gStart && pos <= x.gEnd);
    if (a >= 0) armGenes[a].push(g);
  });
  const out = { arms: [], scores: [], nGenes: [] };
  arms.forEach((arm, a) => {
    const sum = new Float64Array(n);
    let used = 0;
    armGenes[a].forEach((g) => {
      const col = new Float64Array(n);
      for (let k = matrix.indptr[g]; k < matrix.indptr[g + 1]; k += 1) col[matrix.indices[k]] = matrix.data[k];
      let mean = 0;
      for (let i = 0; i < n; i += 1) mean += col[i];
      mean /= n;
      if (mean < minMean) return;
      for (let i = 0; i < n; i += 1) sum[i] += col[i] - mean;
      used += 1;
    });
    if (used < minGenes) return;
    for (let i = 0; i < n; i += 1) sum[i] /= used;
    out.arms.push(arm.name);
    out.scores.push(sum);
    out.nGenes.push(used);
  });
  return out;
}

/** DNA arm copy number per cell relative to its baseline (median arm CN): Map cellId -> Float64Array over arms. */
export function dnaArmCn(cn, arms, { step = 1e6 } = {}) {
  const out = new Map();
  if (!cn?.cells) return out;
  const median = (v) => {
    const s = v.filter(Number.isFinite).sort((x, y) => x - y);
    if (!s.length) return NaN;
    const k = s.length >> 1;
    return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2;
  };
  cn.cells.forEach((id, k) => {
    const row = cn.rows[k];
    if (!row) return;
    const med = arms.map((a) => {
      const v = [];
      for (let g = a.gStart + step / 2; g < a.gEnd; g += step) {
        const b = binAt(row.binIndex, g);
        v.push(b >= 0 ? row.values[b] : NaN);
      }
      return median(v);
    });
    const base = median(med);
    out.set(`${id}`, Float64Array.from(med, (x) => x - base));
  });
  return out;
}
