// Data shaping for the ecDNA panels that share the rare-walk threshold
// (containment hierarchy, co-occurrence, copy scatter, single-walk card).
// d3-free so jest can run it.
import { copiesOf, familyLabel } from "./walkCopies";

/** Walks carried by <= this many cells are "rare" in every ecDNA panel unless the user changes it. */
export const DEFAULT_RARE_MAX = 3;
export const rareMaxOf = (layout) => (Number.isFinite(layout?.walkRareMax) ? layout.walkRareMax : DEFAULT_RARE_MAX);
/** Fewer co-carrying cells than this: no correlation is reported. */
export const MIN_PAIR_N = 5;

/** Number of `ids` with at least `minCn` copies of the walk (minCn <= 0 counts any copies > 0). */
export function carriersOf(walk, ids, minCn = 1) {
  let n = 0;
  ids.forEach((id) => {
    const v = copiesOf(walk, id);
    if (v > 0 && v >= minCn) n += 1;
  });
  return n;
}

/** Split walks into common (> rareMax carriers) and rare, each sorted by carriers (most first). */
export function splitRare(walks, ids, rareMax = DEFAULT_RARE_MAX, minCn = 1) {
  const scored = walks.map((w) => ({ w, n: carriersOf(w, ids, minCn) })).sort((a, b) => b.n - a.n || `${a.w.label}`.localeCompare(`${b.w.label}`));
  return {
    common: scored.filter((s) => s.n > rareMax).map((s) => s.w),
    rare: scored.filter((s) => s.n <= rareMax).map((s) => s.w),
    carriers: new Map(scored.map((s) => [s.w.id, s.n])),
  };
}

/**
 * Common walks plus, per family, one pseudo-walk standing for its rare
 * walks (copies = the largest rare-walk copy number in that cell), so
 * set-based views keep one row per family instead of one per rare walk.
 */
export function foldRareWalks(families, ids, rareMax = DEFAULT_RARE_MAX, minCn = 1) {
  const out = [];
  families.forEach((fam, f) => {
    const split = splitRare(fam, ids, rareMax, minCn);
    const { carriers } = split;
    let { common, rare } = split;
    // a family made only of rare walks keeps its best one visible
    if (!common.length && rare.length) {
      common = rare.slice(0, 1);
      rare = rare.slice(1);
    }
    common.forEach((w) => out.push(w));
    if (!rare.length) return;
    const cells = {};
    ids.forEach((id) => {
      const m = Math.max(0, ...rare.map((w) => copiesOf(w, id)));
      if (m > 0) cells[id] = m;
    });
    out.push({
      id: `rare:${f}`,
      label: `rare · ${familyLabel(fam, (w) => carriers.get(w.id) || 0)} (${rare.length})`,
      cells,
      rare: true,
      members: rare,
    });
  });
  return out;
}

/** The pair with the most co-carrying cells (ties: more carriers overall); null when fewer than two walks. */
export function bestPair(walks, ids, minCn = 1) {
  if (walks.length < 2) return null;
  const has = walks.map((w) => new Set(ids.filter((id) => {
    const v = copiesOf(w, id);
    return v > 0 && v >= minCn;
  })));
  let best = null;
  for (let i = 0; i < walks.length; i += 1) {
    for (let j = i + 1; j < walks.length; j += 1) {
      let both = 0;
      has[i].forEach((id) => {
        if (has[j].has(id)) both += 1;
      });
      const score = [both, has[i].size + has[j].size];
      if (!best || score[0] > best.score[0] || (score[0] === best.score[0] && score[1] > best.score[1])) {
        // the more prevalent walk on x
        const [a, b] = has[i].size >= has[j].size ? [i, j] : [j, i];
        best = { a: walks[a].id, b: walks[b].id, both, score };
      }
    }
  }
  return best;
}

/**
 * Containment hierarchy: each walk hangs under the shortest walk that holds
 * >= minShared of it (strictly longer, or equal length and listed earlier,
 * so there are no cycles). Returns rows in depth-first order (longest
 * roots first, children by length): { index, depth, parent, share, children }.
 */
export function containmentTree(matrix, lengths, { minShared = 0.9 } = {}) {
  const n = lengths.length;
  const parent = new Array(n).fill(-1);
  const share = new Array(n).fill(null);
  for (let i = 0; i < n; i += 1) {
    let best = -1;
    for (let j = 0; j < n; j += 1) {
      if (i === j || !(matrix[i][j] >= minShared)) continue;
      const bigger = lengths[j] > lengths[i] || (lengths[j] === lengths[i] && j < i);
      if (!bigger) continue;
      if (best < 0 || lengths[j] < lengths[best] || (lengths[j] === lengths[best] && j < best)) best = j;
    }
    parent[i] = best;
    share[i] = best >= 0 ? matrix[i][best] : null;
  }
  const kids = Array.from({ length: n }, () => []);
  parent.forEach((p, i) => p >= 0 && kids[p].push(i));
  const byLen = (a, b) => lengths[b] - lengths[a] || a - b;
  const rows = [];
  const visit = (i, depth) => {
    rows.push({ index: i, depth, parent: parent[i], share: share[i], children: kids[i].length });
    kids[i].sort(byLen).forEach((c) => visit(c, depth + 1));
  };
  parent.map((p, i) => (p < 0 ? i : -1)).filter((i) => i >= 0).sort(byLen).forEach((i) => visit(i, 0));
  return rows;
}

function median(values) {
  if (!values.length) return 0;
  const s = values.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Per clone: cells, carriers and median copies in carriers (clones with no carriers last). */
export function carriersByClone(walk, ids, cloneOf) {
  const by = new Map();
  ids.forEach((id) => {
    const c = cloneOf(id) ?? "NA";
    if (!by.has(c)) by.set(c, []);
    by.get(c).push(id);
  });
  return [...by.entries()]
    .map(([clone, cs]) => {
      const vals = cs.map((id) => copiesOf(walk, id)).filter((v) => v > 0);
      return { clone, n: cs.length, carriers: vals.length, median: median(vals) };
    })
    .sort((a, b) => b.carriers - a.carriers || `${a.clone}`.localeCompare(`${b.clone}`));
}

/** The walk's ALT junctions as readable rows: "chr7:55,019,021+ → chr7:55,211,628-". */
export function junctionRows(walk) {
  const nodes = walk?.nodes || [];
  return (walk?.junctions || [])
    .filter((j) => j.type === "ALT")
    .map((j, k) => {
      const A = nodes[j.from];
      const B = nodes[j.to];
      if (!A || !B) return null;
      const a = A.strand === "-" ? A.start : A.end;
      const b = B.strand === "-" ? B.end : B.start;
      const span = A.chromosome === B.chromosome ? Math.abs(b - a) : null;
      return { key: k, from: `${A.chromosome}:${Number(a).toLocaleString("en-US")}${A.strand || ""}`, to: `${B.chromosome}:${Number(b).toLocaleString("en-US")}${B.strand || ""}`, span, via: j.via || null };
    })
    .filter(Boolean);
}

/** Default walk for the single-walk card: the one with the most carriers (ties: more nodes). */
export function defaultFocusWalk(walks, ids) {
  let best = null;
  let bestN = -1;
  walks.forEach((w) => {
    const n = carriersOf(w, ids);
    if (n > bestN || (n === bestN && best && (w.nodes?.length || 0) > (best.nodes?.length || 0))) {
      best = w;
      bestN = n;
    }
  });
  return best;
}

/**
 * Hidden (rare) walks attached to the visible walk they overlap most
 * (either direction, >= minShared), for "+n rare" rows in the nesting tree.
 * Returns Map(visible index | -1 for unattached -> [rare indices]).
 */
export function attachRare(matrix, rareIdx, visibleIdx, { minShared = 0.5 } = {}) {
  const out = new Map();
  rareIdx.forEach((r) => {
    let host = -1;
    let best = 0;
    visibleIdx.forEach((v) => {
      const s = Math.max(matrix[r][v] || 0, matrix[v][r] || 0);
      if (s >= minShared && s > best) {
        best = s;
        host = v;
      }
    });
    if (!out.has(host)) out.set(host, []);
    out.get(host).push(r);
  });
  return out;
}

/** Sub-matrix of `matrix` over `idx` (rows and columns in that order). */
export function subMatrix(matrix, idx) {
  return idx.map((i) => idx.map((j) => matrix[i][j]));
}
