// Junction CN heatmap: which junction columns to show (all / touching the viewport /
// members of an ecDNA walk), their short labels, tooltips stats and sort order. d3-free.
// Junction objects are those of junctionsFromGenomes (cellFiles.js): chromosome1/2,
// position1/2, strand1/2 (strand "+" = lower side fused at that breakend), global1 <= global2.

export const JCF_PARAM = "jcf";
export const JSORT_PARAM = "jsort";
export const JUNCTION_FOCUS_PARAMS = [JCF_PARAM, JSORT_PARAM];
export const WALK_MATCH_TOL = 5000; // bp between a cell junction breakend and a walk node boundary

/** jcf=all | view | walk:<id>  ->  { mode, walkId } (null when absent or unreadable). */
export function parseJcf(value) {
  if (value == null || value === "") return null;
  const s = `${value}`;
  if (s === "all" || s === "view") return { mode: s, walkId: null };
  if (s.startsWith("walk:") && s.length > 5) return { mode: "walk", walkId: s.slice(5) };
  return null;
}

export const formatJcf = ({ mode, walkId } = {}) => (mode === "walk" && walkId != null ? `walk:${walkId}` : mode === "view" ? "view" : mode === "all" ? "all" : null);

/** Layout from the URL: jcf (filter) and jsort ("pos" | "carriers"). */
export function junctionFocusFromSearch(search = "") {
  const p = new URLSearchParams(search);
  const out = {};
  const f = parseJcf(p.get(JCF_PARAM));
  if (f) out.junctionFilter = f;
  if (["pos", "carriers"].includes(p.get(JSORT_PARAM))) out.junctionSort = p.get(JSORT_PARAM);
  return Object.keys(out).length ? out : null;
}

/** Params to write for the heatmap type in force ({} unless junctions). Default sort ("pos") is omitted. */
export function junctionFocusToSearch({ heatmapType, junctionFilter, junctionSort } = {}) {
  if (heatmapType !== "junctions") return {};
  const out = {};
  const f = junctionFilter ? formatJcf(junctionFilter) : null;
  if (f) out[JCF_PARAM] = f;
  if (junctionSort === "carriers") out[JSORT_PARAM] = "carriers";
  return out;
}

/** True when the shared genome domain is narrower than the whole genome. */
export function isZoomed(domains, defaultDomain) {
  if (!domains || !domains.length) return false;
  if (domains.length > 1) return true;
  if (!defaultDomain) return false;
  return domains[0][0] > defaultDomain[0] || domains[0][1] < defaultDomain[1];
}

/** The filter in force: an explicit choice, else "view" when zoomed and "all" otherwise. */
export function effectiveFilter(choice, zoomed) {
  if (choice && choice.mode) return choice;
  return { mode: zoomed ? "view" : "all", walkId: null };
}

const MB = (pos) => {
  const m = pos / 1e6;
  return m >= 100 ? `${Math.round(m)}M` : `${m.toFixed(1)}M`;
};

/** SV class from the breakends (strands as in junctionsFromGenomes). */
export function junctionType(j) {
  if (j.chromosome1 !== j.chromosome2) return "TRA";
  if (j.strand1 === j.strand2) return "INV-like";
  // j1 is the lower breakend: lower side kept ("+") joined to upper side kept ("-") = deletion
  return j.strand1 === "+" ? "DEL-like" : "DUP-like";
}

export const junctionLabel = (j) => `${j.chromosome1}:${MB(j.position1)}→${j.chromosome2}:${MB(j.position2)} ${junctionType(j)}`;

export const junctionBreakends = (j) =>
  `${j.chromosome1}:${Math.round(j.position1).toLocaleString("en-US")}${j.strand1} → ${j.chromosome2}:${Math.round(j.position2).toLocaleString("en-US")}${j.strand2}`;

const median = (a) => {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y);
  const h = s.length >> 1;
  return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
};

/** Per junction: { n: cells carrying it (CN > 0), median: median CN over the carriers }. */
export function junctionStats(m) {
  return m.junctions.map((j, k) => {
    const v = [];
    for (let r = 0; r < m.cn.length; r += 1) {
      const x = m.cn[r][k];
      if (Number.isFinite(x) && x > 0) v.push(x);
    }
    return { n: v.length, median: median(v) };
  });
}

/** Indices of the cells (rows of m.cn) carrying junction k. */
export function carrierRows(m, k) {
  const out = [];
  for (let r = 0; r < m.cn.length; r += 1) if (Number.isFinite(m.cn[r][k]) && m.cn[r][k] > 0) out.push(r);
  return out;
}

/** Either breakend (global position) inside any shared domain [[g0, g1], ...]. */
export const touchesDomains = (j, domains) =>
  Boolean(domains) && domains.some(([a, b]) => (j.global1 >= a && j.global1 <= b) || (j.global2 >= a && j.global2 <= b));

// walk node boundary where the walk leaves (exit) or enters (entry) the node
const exitPos = (n) => (n.strand === "-" ? n.start : n.end);
const entryPos = (n) => (n.strand === "-" ? n.end : n.start);
const near = (chr, pos, bp, tol) => `${chr}` === `${bp.chromosome}` && Math.abs(pos - bp.position) <= tol;

/**
 * Set of junction indices that are junctions of a walk: both breakends match
 * the exit of node a and the entry of node b (either order) of a non-REF walk junction.
 */
export function walkJunctionSet(walk, junctions, tol = WALK_MATCH_TOL) {
  const out = new Set();
  if (!walk || !walk.nodes || !walk.junctions) return out;
  walk.junctions.forEach((wj) => {
    if (`${wj.type || ""}`.toUpperCase() === "REF") return;
    const a = walk.nodes[wj.from];
    const b = walk.nodes[wj.to];
    if (!a || !b) return;
    const pa = { chr: a.chromosome, pos: exitPos(a) };
    const pb = { chr: b.chromosome, pos: entryPos(b) };
    junctions.forEach((j) => {
      const b1 = { chromosome: j.chromosome1, position: j.position1 };
      const b2 = { chromosome: j.chromosome2, position: j.position2 };
      if ((near(pa.chr, pa.pos, b1, tol) && near(pb.chr, pb.pos, b2, tol)) || (near(pa.chr, pa.pos, b2, tol) && near(pb.chr, pb.pos, b1, tol))) out.add(j.index);
    });
  });
  return out;
}

/** Walk picker entries: label with its genes and chromosomes, most carried first; walks with no junction omitted. */
export function walkOptions(walks) {
  return (walks || [])
    .filter((w) => (w.junctions || []).some((j) => `${j.type || ""}`.toUpperCase() !== "REF") && (w.ncells ?? 1) > 0)
    .map((w) => {
      const chrs = [...new Set((w.nodes || []).map((n) => `${n.chromosome}`))];
      const genes = w.driver_genes && w.driver_genes.length ? [].concat(w.driver_genes).join(",") : null;
      return { id: `${w.id}`, label: `${w.label || w.name || w.id}${genes ? ` [${genes}]` : ""} (chr${chrs.join(",")}; ${w.ncells ?? "?"} cells)`, ncells: w.ncells ?? 0 };
    })
    .sort((a, b) => b.ncells - a.ncells);
}

/**
 * Visible junction columns, in display order.
 * filter: { mode, walkId }; domains: shared genome domains; walks: walks.json walks.
 * sort: "pos" (global position of the first breakend) or "carriers" (most cells first).
 */
export function junctionColumns(m, { filter, domains, walks, sort = "pos", stats = null }) {
  const st = stats || junctionStats(m);
  let keep = m.junctions.map((j) => j.index);
  if (filter?.mode === "view") keep = keep.filter((k) => touchesDomains(m.junctions[k], domains));
  else if (filter?.mode === "walk") {
    const w = (walks || []).find((x) => `${x.id}` === `${filter.walkId}`);
    const set = walkJunctionSet(w, m.junctions);
    keep = keep.filter((k) => set.has(k));
  }
  const g = (k) => m.junctions[k].global1;
  keep.sort((a, b) => {
    if (sort === "carriers" && st[b].n !== st[a].n) return st[b].n - st[a].n;
    const ga = g(a);
    const gb = g(b);
    if (Number.isFinite(ga) && Number.isFinite(gb) && ga !== gb) return ga - gb;
    return a - b;
  });
  return keep;
}
