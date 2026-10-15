// Compare two sets of cells (clades on the tree, saved groups, clones, the tree selection) on cell cycle and
// state, from the patient's own RNA metadata (Phase, S/G2M scores) and DNA replication timing (rt_cor). d3-free.
import { chiSquareTable, fisherExact, mannWhitney } from "./tests";
import { comparatorCells } from "./driverContrast";
import { cladeAndSister } from "./branchDiff";

export const PHASES = ["G1", "S", "G2M"];
export const CMP_PARAMS = { a: "cmpA", b: "cmpB" };

/*
 * Group specs (strings, so a link can carry them):
 *   clade:<id>       a called clade of clades.json
 *   node:<k>         tree node k of the displayed tree
 *   sister:<spec>    the sister clade of a node/clade spec (the parent's other children)
 *   rest:<spec>      every tumour cell not in <spec>
 *   clone:<name>     a clone
 *   group:<name>     a saved group
 *   sel              the current tree selection (not linkable)
 */
export const isLinkable = (spec) => Boolean(spec) && !/(^|:)sel$/.test(`${spec}`);

const numberOrNull = (v) => (v == null || v === "" || !Number.isFinite(+v) ? null : +v);

/** Tree node index for a spec of the node/clade kind, else null. */
export function nodeOfSpec(spec, { layout, cladeNodes } = {}) {
  const s = `${spec || ""}`;
  if (s.startsWith("node:")) {
    const k = Number(s.slice(5));
    return Number.isInteger(k) && layout?.nodes?.[k] ? k : null;
  }
  if (s.startsWith("clade:")) {
    const id = s.slice(6);
    for (const [k, v] of cladeNodes || []) if (`${v.clade?.id}` === id) return k;
  }
  return null;
}

/** Spec naming a tree node: its called clade when it is one (stable across tree edits), else the node index. */
export function specForNode(k, cladeNodes) {
  const hit = cladeNodes?.get(k);
  return hit?.clade?.id ? `clade:${hit.clade.id}` : `node:${k}`;
}

/**
 * Cell ids of a spec, in tree order.
 * ctx: { layout, order, tumorIds, cells, savedGroups, selection, cladeNodes (Map node -> {clade}) }
 * @returns { ids, label } or { error }
 */
export function resolveSpec(spec, ctx) {
  const { layout, order = [], tumorIds = order, cells = [], savedGroups = [], selection = [], cladeNodes } = ctx || {};
  const s = `${spec || ""}`;
  const inOrder = (ids) => {
    const set = new Set(ids.map(String));
    return order.filter((id) => set.has(`${id}`));
  };
  if (s === "sel") return selection.length ? { ids: inOrder(selection), label: `Selection (${selection.length})` } : { error: "nothing is selected" };
  if (s.startsWith("clone:")) {
    const name = s.slice(6);
    const ids = cells.filter((c) => `${c.clone_id}` === name).map((c) => `${c.cell_id}`);
    return ids.length ? { ids: inOrder(ids), label: name } : { error: `no cells in clone ${name}` };
  }
  if (s.startsWith("group:")) {
    const name = s.slice(6);
    const g = savedGroups.find((x) => x.name === name);
    return g && g.cells.length ? { ids: inOrder(g.cells), label: name } : { error: `no saved group named ${name}` };
  }
  if (s.startsWith("sister:")) {
    const inner = s.slice(7);
    const k = nodeOfSpec(inner, ctx);
    if (k == null) return { error: "sister clade needs a clade or tree node" };
    const g = cladeAndSister(layout, k);
    return g && g.sister.length ? { ids: inOrder(g.sister), label: `sister of ${labelOfNode(inner, k, cladeNodes)}` } : { error: "this node has no sister (it is the root)" };
  }
  if (s.startsWith("rest:")) {
    const inner = resolveSpec(s.slice(5), ctx);
    if (inner.error) return inner;
    const inA = new Set(inner.ids.map(String));
    const ids = tumorIds.filter((id) => !inA.has(`${id}`));
    return ids.length ? { ids: inOrder(ids), label: "rest of tumour" } : { error: "no other tumour cells" };
  }
  const k = nodeOfSpec(s, ctx);
  if (k != null) {
    const g = cladeAndSister(layout, k);
    return { ids: inOrder(g.clade), label: labelOfNode(s, k, cladeNodes), node: k };
  }
  return { error: s ? `cannot read "${s}"` : "not set" };
}

function labelOfNode(spec, k, cladeNodes) {
  const id = cladeNodes?.get(k)?.clade?.id;
  if (id) return `clade ${`${id}`.replace(/^.*_n/, "n")}`;
  return `node ${k}`;
}

const rnaOf = (rnaRows) => {
  const m = new Map();
  (rnaRows || []).forEach((r) => r?.cell_id && m.set(`${r.cell_id}`, r));
  return m;
};
const scoreOf = (r, a, b) => numberOrNull(r?.[a] ?? r?.[b]);

/** Cliff's delta (A vs B) from the Mann-Whitney U: P(a>b) - P(a<b); null when a side is empty. */
export function cliffsDelta(U, nA, nB) {
  return nA && nB && Number.isFinite(U) ? (2 * U) / (nA * nB) - 1 : null;
}

function median(v) {
  const s = v.filter(Number.isFinite).sort((x, y) => x - y);
  if (!s.length) return null;
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
}

/** A vs B on one numeric readout: n, medians, Wilcoxon (Mann-Whitney) p and Cliff's delta. */
export function compareValues(a, b) {
  const va = a.filter(Number.isFinite);
  const vb = b.filter(Number.isFinite);
  const base = { valuesA: va, valuesB: vb, nA: va.length, nB: vb.length, medianA: median(va), medianB: median(vb) };
  if (va.length < 2 || vb.length < 2) return { ...base, p: null, delta: null, reason: `needs at least 2 cells per side (A ${va.length}, B ${vb.length})` };
  const r = mannWhitney(va, vb);
  return { ...base, p: Number.isFinite(r.p) ? r.p : null, delta: cliffsDelta(r.U, va.length, vb.length), reason: null };
}

/** Level counts of a categorical field in two id sets with a chi-square test (Fisher for 2x2). */
export function compareLevels(idsA, idsB, valueOf, levels) {
  const count = (ids) => {
    const c = Object.fromEntries(levels.map((l) => [l, 0]));
    let n = 0;
    ids.forEach((id) => {
      const v = valueOf(id);
      if (v == null || v === "" || !(`${v}` in c)) return;
      c[`${v}`] += 1;
      n += 1;
    });
    return { counts: c, n };
  };
  const A = count(idsA);
  const B = count(idsB);
  const used = levels.filter((l) => A.counts[l] + B.counts[l] > 0);
  let p = null;
  let test = null;
  if (A.n && B.n && used.length >= 2) {
    if (used.length === 2) {
      const f = fisherExact(A.counts[used[0]], A.counts[used[1]], B.counts[used[0]], B.counts[used[1]]);
      p = Number.isFinite(f.p) ? f.p : null;
      test = "Fisher exact";
    } else {
      const x = chiSquareTable([used.map((l) => A.counts[l]), used.map((l) => B.counts[l])]);
      p = Number.isFinite(x) ? x : null;
      test = "chi-square";
    }
  }
  return { levels: used, a: A, b: B, p, test };
}

/** Fisher exact on a binary readout: positives among A and B (pos/total per side). */
export function compareFraction(posA, nA, posB, nB) {
  if (!nA || !nB) return { fracA: nA ? posA / nA : null, fracB: nB ? posB / nB : null, p: null, oddsRatio: null };
  const f = fisherExact(posA, nA - posA, posB, nB - posB);
  return { fracA: posA / nA, fracB: posB / nB, p: Number.isFinite(f.p) ? f.p : null, oddsRatio: f.oddsRatio };
}

const CATEGORICAL_FIELDS = ["state", "Cell_Type", "Region_Annotation"];

/**
 * The full comparison of two id sets.
 *   rnaRows   rna/cells.json rows (cell_id links to DNA; Phase, S_Score, G2M_Score, state, ...)
 *   dnaCells  gOS cells carrying the sphase precompute (pc_rt_cor, "DNA cycle") and ploidy
 *   clades    Map(ids -> clade) not needed here; privateSnv is passed per side
 * Every section says why it is missing (reason) instead of inventing a value.
 */
export function compareCladeCells({ idsA, idsB, rnaRows = [], dnaCells = [], extraFields = [] }) {
  const rna = rnaOf(rnaRows);
  const dna = new Map(dnaCells.map((c) => [`${c.cell_id}`, c]));
  const withRna = (ids) => ids.filter((id) => rna.has(`${id}`));
  const rA = withRna(idsA);
  const rB = withRna(idsB);
  const hasRna = rna.size > 0;
  const hasPhase = rnaRows.some((r) => r?.Phase != null && r.Phase !== "");
  const out = {
    counts: {
      nA: idsA.length,
      nB: idsB.length,
      rnaA: rA.length,
      rnaB: rB.length,
      overlap: idsA.filter((id) => idsB.includes(id)).length,
    },
  };
  // (a) phase
  if (!hasRna) out.phase = { reason: "no RNA for this patient" };
  else if (!hasPhase) out.phase = { reason: "rna/cells.json has no Phase column" };
  else {
    const phaseLevels = [...new Set([...PHASES, ...rnaRows.map((r) => r?.Phase).filter((v) => v != null && v !== "")])];
    const lv = compareLevels(rA, rB, (id) => rna.get(`${id}`).Phase, phaseLevels);
    const cyc = (ids) => ids.filter((id) => ["S", "G2M"].includes(`${rna.get(`${id}`).Phase}`)).length;
    const phased = (ids) => ids.filter((id) => rna.get(`${id}`).Phase != null && rna.get(`${id}`).Phase !== "");
    const pA = phased(rA);
    const pB = phased(rB);
    out.phase = {
      ...lv,
      cycling: compareFraction(cyc(pA), pA.length, cyc(pB), pB.length),
      sPhase: compareFraction(
        pA.filter((id) => rna.get(`${id}`).Phase === "S").length,
        pA.length,
        pB.filter((id) => rna.get(`${id}`).Phase === "S").length,
        pB.length
      ),
      reason: lv.a.n && lv.b.n ? null : `needs RNA phase calls on both sides (A ${lv.a.n}, B ${lv.b.n})`,
    };
  }
  // (b) RNA scores
  const scoreOfIds = (ids, a, b) => ids.map((id) => scoreOf(rna.get(`${id}`), a, b)).filter((v) => v != null);
  out.scores = ["S_Score", "G2M_Score"].map((key) => {
    const label = key === "S_Score" ? "S.Score" : "G2M.Score";
    const sa = scoreOfIds(rA, key, label);
    const sb = scoreOfIds(rB, key, label);
    if (!hasRna) return { key, label, reason: "no RNA for this patient" };
    if (!sa.length && !sb.length) return { key, label, reason: `rna/cells.json has no ${label} values for these cells` };
    return { key, label, ...compareValues(sa, sb) };
  });
  // (c) DNA replication timing: all cells with DNA, whether or not they have RNA
  const rtOf = (ids) => ids.map((id) => numberOrNull(dna.get(`${id}`)?.pc_rt_cor)).filter((v) => v != null);
  const anyRt = dnaCells.some((c) => numberOrNull(c.pc_rt_cor) != null);
  if (!anyRt) out.dna = { reason: "no precompute/sphase.json for this patient (replication-timing S-phase not computed)" };
  else {
    const ra = rtOf(idsA);
    const rb = rtOf(idsB);
    const sCall = (ids) => ids.filter((id) => dna.get(`${id}`)?.pc_rt_cor != null);
    const sa = sCall(idsA);
    const sb = sCall(idsB);
    const isS = (id) => dna.get(`${id}`)?.["DNA cycle"] === "S-phase";
    out.dna = {
      rt: compareValues(ra, rb),
      sCall: compareFraction(sa.filter(isS).length, sa.length, sb.filter(isS).length, sb.length),
      nSA: sa.filter(isS).length,
      nSB: sb.filter(isS).length,
      nDnaA: sa.length,
      nDnaB: sb.length,
      noRnaA: sa.filter((id) => !rna.has(`${id}`)).length,
      noRnaB: sb.filter((id) => !rna.has(`${id}`)).length,
      reason: null,
    };
  }
  // (d) state and other categorical fields
  const fields = [...CATEGORICAL_FIELDS, ...extraFields].filter((f, i, arr) => arr.indexOf(f) === i);
  out.fields = fields
    .filter((f) => rnaRows.some((r) => r?.[f] != null && r[f] !== ""))
    .map((f) => {
      const levels = [...new Set(rnaRows.map((r) => r?.[f]).filter((v) => v != null && v !== "").map(String))].sort();
      if (levels.length > 12) return { field: f, reason: `${levels.length} levels (too many to tabulate)` };
      return { field: f, ...compareLevels(rA, rB, (id) => rna.get(`${id}`)[f], levels), reason: null };
    });
  if (!out.fields.length) out.fields = [{ field: "state", reason: hasRna ? "rna/cells.json has no state column" : "no RNA for this patient" }];
  // (e) counts: ploidy
  const ploidyOf = (ids) => ids.map((id) => numberOrNull(dna.get(`${id}`)?.ploidy)).filter((v) => v != null);
  const pa = ploidyOf(idsA);
  const pb = ploidyOf(idsB);
  out.counts.ploidyA = median(pa);
  out.counts.ploidyB = median(pb);
  return out;
}

/** Private SNVs of the called clade whose cells are the node's cells, else null (clades.json absent or no clade at that node). */
export function privateSnvOf(spec, ctx) {
  const k = nodeOfSpec(spec, ctx);
  const hit = k == null ? null : ctx.cladeNodes?.get(k);
  return hit?.clade?.n_private_snv ?? null;
}

export const TREE_SELECTION = "Tree selection";
export const TREE_REST = "Rest";
export const TREE_SISTER = "Sister clade";

/**
 * Group names for the tree selection: Map(cellId -> group name).
 * mode "rest": selected cells vs every other cell; "sister": selected vs the closest relatives
 * (comparatorCells "sister", widened until it holds enough tumour cells); cells in neither are left out.
 */
export function selectionGroupMap(mode, selection, { allIds = [], tumorIds = allIds, layout = null } = {}) {
  const out = new Map();
  const sel = new Set(selection.map(String));
  if (!sel.size) return out;
  selection.forEach((id) => out.set(`${id}`, TREE_SELECTION));
  if (mode === "sister") {
    comparatorCells("sister", [...sel], tumorIds, layout).cells.forEach((id) => !sel.has(`${id}`) && out.set(`${id}`, TREE_SISTER));
  } else {
    allIds.forEach((id) => !sel.has(`${id}`) && out.set(`${id}`, TREE_REST));
  }
  return out;
}
