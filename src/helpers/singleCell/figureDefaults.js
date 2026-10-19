// Defaults and display mappings for the cohort "Paper figures": which ecDNA
// walk a patient's figure opens on, and the paper's names / groups for a
// patient's ecDNA variants (display only: walks.json is never changed).
// d3-free so jest can run it.

const driverList = (w) => {
  const d = w?.driver_genes;
  if (Array.isArray(d)) return d.filter(Boolean).map(String);
  return d ? [`${d}`] : [];
};

/** Copies of `w` per carrier cell (cn >= minCn) among `cellIds` (all cells of the walk when omitted). */
function carrierCopies(w, cellIds, minCn = 1) {
  const cells = w?.cells || {};
  const ids = cellIds && cellIds.length ? cellIds : Object.keys(cells);
  const out = [];
  ids.forEach((id) => {
    const v = Number(cells[id]);
    if (v >= minCn) out.push(v);
  });
  return out;
}

/**
 * The patient's dominant driver amplicon: among walks with driver genes (all
 * walks when none has one), the one with the most ecDNA copies summed over
 * its carrier cells; ties go to more carriers, then to curated walks.
 * BWH69 -> MYCN 1 (chr2), BWH70 -> wEGFR, MGH303 -> the CDK4 walk,
 * MGH304 -> MYCN,CDK4 1.
 */
export function dominantWalk(walks = [], cellIds = null, minCn = 1) {
  if (!walks.length) return null;
  const drivers = walks.filter((w) => driverList(w).length);
  const pool = drivers.length ? drivers : walks;
  let best = null;
  pool.forEach((w) => {
    const v = carrierCopies(w, cellIds, minCn);
    const score = [v.reduce((s, x) => s + x, 0), v.length, w.curated ? 1 : 0];
    if (!best || score[0] > best.score[0] || (score[0] === best.score[0] && (score[1] > best.score[1] || (score[1] === best.score[1] && score[2] > best.score[2])))) best = { w, score };
  });
  return best?.w || null;
}

/** Index of the walk group (helpers/singleCell/figures walkGroups) with the most summed copies. */
export function dominantGroupIndex(groups = [], minCn = 1) {
  let best = -1;
  let bestScore = -1;
  groups.forEach((g, i) => {
    const s = (g.cn || []).reduce((acc, v) => acc + (v >= minCn ? v : 0), 0);
    if (s > bestScore) {
      best = i;
      bestScore = s;
    }
  });
  return best;
}

/**
 * The paper's names and groups for ecDNA variants, per patient. Each group
 * has an anchor walk (by label); every other walk on the anchor's
 * chromosome(s) joins the tightest anchor whose span contains it, else the
 * anchor it overlaps most. Walks off those chromosomes stay ungrouped.
 */
export const PAPER_VARIANT_GROUPS = {
  BWH70: [
    { label: "long EGFR", anchor: "wEGFR" },
    { label: "short EGFR", anchor: "sEGFR" },
  ],
};

// Fig 5B: per-walk amplicon CN heatmap columns (display label, walk label in walks.json); BWH69 ecCombined = MYCN 3 (user, 2026-10-10)
export const PAPER_WALK_HEATMAP = {
  BWH69: [
    { label: "ecMYCN", walk: "MYCN 1" },
    { label: "ecEGFR v3", walk: "EGFR 1" },
    { label: "ecCDK4-1", walk: "GLI1,DDIT3,CDK4 1" },
    { label: "ecCDK4-2", walk: "CDK4 1" },
    { label: "ecCombined", walk: "MYCN 3" },
  ],
};

const chrOf = (c) => `${c}`.replace(/^chr/, "");

/** [start, end] of a walk's nodes on chromosome `chr` (null when it has none there). */
function extentOn(w, chr) {
  let lo = Infinity;
  let hi = -Infinity;
  (w.nodes || []).forEach((n) => {
    if (chrOf(n.chromosome) !== chr) return;
    lo = Math.min(lo, Number(n.start), Number(n.end));
    hi = Math.max(hi, Number(n.start), Number(n.end));
  });
  return lo <= hi ? [lo, hi] : null;
}

/**
 * Display mapping for one patient: `nameOf(walk)` (paper name, else the
 * walk's own label), `groupOf` Map walkId -> group label, and `groups`
 * [{ label, anchorId, walks }] in config order. Empty mapping when the
 * patient has no configured groups or the anchors are missing.
 */
export function variantGrouping(patient, walks = [], config = PAPER_VARIANT_GROUPS) {
  const spec = config[`${patient}`] || [];
  const anchors = spec
    .map((g) => {
      const w = walks.find((x) => `${x.label}` === g.anchor || `${x.name}` === g.anchor);
      if (!w) return null;
      const chr = chrOf((w.nodes || [])[0]?.chromosome ?? "");
      const ext = extentOn(w, chr);
      return ext ? { ...g, w, chr, ext } : null;
    })
    .filter(Boolean);
  const rename = new Map(anchors.map((a) => [a.w.id, a.label]));
  const groupOf = new Map();
  if (anchors.length) {
    const tight = [...anchors].sort((a, b) => a.ext[1] - a.ext[0] - (b.ext[1] - b.ext[0]));
    walks.forEach((w) => {
      const own = anchors.find((a) => a.w.id === w.id);
      if (own) {
        groupOf.set(w.id, own.label);
        return;
      }
      const exts = tight.map((a) => ({ a, e: extentOn(w, a.chr) })).filter((x) => x.e);
      if (!exts.length) return;
      const inside = exts.find(({ a, e }) => e[0] >= a.ext[0] && e[1] <= a.ext[1]);
      if (inside) {
        groupOf.set(w.id, inside.a.label);
        return;
      }
      const ov = exts
        .map(({ a, e }) => ({ a, o: Math.min(e[1], a.ext[1]) - Math.max(e[0], a.ext[0]) }))
        .sort((x, y) => y.o - x.o)[0];
      if (ov && ov.o > 0) groupOf.set(w.id, ov.a.label);
    });
  }
  const nameOf = (w) => (w ? rename.get(w.id) || w.label || w.name || `walk ${w.id}` : "");
  const groups = anchors.map((a) => ({ label: a.label, anchorId: a.w.id, walks: walks.filter((w) => groupOf.get(w.id) === a.label) }));
  return { nameOf, groupOf, groups };
}

/** Main-amplicon thresholds: carried (>= 1 copy) by at least 15 % of tumor cells, at a median of >= 8 copies in its carriers. */
export const MAIN_AMPLICON = { minFrac: 0.15, minMedianCn: 8, pad: 0.15, minPad: 3e5 };

const median = (v) => {
  if (!v.length) return NaN;
  const s = [...v].sort((a, b) => a - b);
  const h = (s.length - 1) / 2;
  return (s[Math.floor(h)] + s[Math.ceil(h)]) / 2;
};

/** Merged [chr, start, end] spans of a walk's nodes, one per chromosome. */
function walkSpans(w) {
  const by = new Map();
  (w.nodes || []).forEach((n) => {
    const chr = chrOf(n.chromosome);
    const a = Math.min(Number(n.start), Number(n.end));
    const b = Math.max(Number(n.start), Number(n.end));
    if (!Number.isFinite(a) || !Number.isFinite(b)) return;
    const cur = by.get(chr);
    by.set(chr, cur ? [Math.min(cur[0], a), Math.max(cur[1], b)] : [a, b]);
  });
  return [...by.entries()].map(([chr, [a, b]]) => [chr, a, b]);
}

/**
 * The patient's amplicons: walks grouped by their driver-gene set (walks
 * without driver genes are left out); `main` when the group (copies summed
 * over its walks per cell) is carried by >= minFrac of the tumor cells at a
 * median of >= minMedianCn copies. Main ones first, each block sorted by
 * summed copies (dominant first). Each: { key, label, walks, dominant, windows:
 * [[chr, start, end]] (the dominant walk's span per chromosome, padded),
 * carriers, frac, medianCn, total }.
 */
export function mainAmplicons(walks = [], tumorIds = [], opts = {}) {
  const { minFrac, minMedianCn, pad, minPad } = { ...MAIN_AMPLICON, ...opts };
  const ids = tumorIds.length ? tumorIds : [...new Set(walks.flatMap((w) => Object.keys(w.cells || {})))];
  const groups = new Map();
  walks.forEach((w) => {
    const d = driverList(w);
    if (!d.length) return;
    const key = [...new Set(d)].sort().join("+");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(w);
  });
  const out = [];
  groups.forEach((ws, key) => {
    const per = ids.map((id) => ws.reduce((s, w) => s + (Number(w.cells?.[id]) || 0), 0));
    const carried = per.filter((v) => v >= 1);
    const frac = ids.length ? carried.length / ids.length : 0;
    const med = median(carried);
    if (!carried.length) return;
    const main = frac >= minFrac && med >= minMedianCn;
    const dominant = dominantWalk(ws, ids);
    const windows = walkSpans(dominant).map(([chr, a, b]) => {
      const p = Math.max(minPad, pad * (b - a));
      return [chr, Math.max(1, Math.round(a - p)), Math.round(b + p)];
    });
    out.push({ key, label: key.split("+").join(" · "), walks: ws, dominant, windows, carriers: carried.length, frac, medianCn: med, total: carried.reduce((s, v) => s + v, 0), main });
  });
  return out.sort((a, b) => b.main - a.main || b.total - a.total);
}

/**
 * Genome windows for the shown amplicons, in their order: [[chr, start, end,
 * keys[]]], windows on one chromosome that overlap merged (and kept at the
 * position of the first amplicon that has them).
 */
export function ampliconWindows(amplicons = []) {
  const out = [];
  amplicons.forEach((amp) => amp.windows.forEach(([chr, a, b]) => out.push([chr, a, b, [amp.key]])));
  // merge overlapping windows on one chromosome until none overlap (kept at the first one's place)
  let merged = true;
  while (merged) {
    merged = false;
    for (let i = 0; i < out.length && !merged; i += 1) {
      for (let j = i + 1; j < out.length; j += 1) {
        const [x, y] = [out[i], out[j]];
        if (x[0] === y[0] && y[1] <= x[2] && y[2] >= x[1]) {
          x[1] = Math.min(x[1], y[1]);
          x[2] = Math.max(x[2], y[2]);
          y[3].forEach((k) => !x[3].includes(k) && x[3].push(k));
          out.splice(j, 1);
          merged = true;
          break;
        }
      }
    }
  }
  return out;
}
