import { isDarkLike } from "./plotTheme";
// Cohort "evolutionary oncoplot" (#19) and cross-patient associations (#21):
// geometry and table helpers for _cohort/aligned_trees.json and
// _cohort/associations.json (srctools gos_sc_cohort_evolution.py). d3-free
// so it can be unit tested.
//
// Tree export: { nodes: [[parent, firstLeaf, lastLeaf], ...] in pre-order
// (node 0 = tumour root), leaves: [cell ids], time: [relative time per node] }
// where time = 1 - log(clade size) / log(tumour cells): 0 at the trunk, 1 at
// single cells.

/** Length of the drawn trunk, in time units, left of the root (x < 0). */
export const TRUNK = 0.12;

export const EVENT_CLASSES = ["gain", "loss", "amp", "homdel", "ecdna", "snv"];
export const EVENT_CLASS_LABEL = {
  gain: "Arm / chromosome gain",
  loss: "Arm / chromosome loss",
  amp: "Focal amplification",
  homdel: "Homozygous deletion",
  ecdna: "ecDNA",
  snv: "Driver SNV",
};

/** Event class colours: copy-number red / blue (focal darker), SNV green, ecDNA purple. */
export function eventClassColor(cls, mode = "light") {
  const dark = isDarkLike(mode);
  return (
    {
      gain: dark ? "#f4a5a0" : "#e8837c",
      loss: dark ? "#9ecae1" : "#74add1",
      amp: dark ? "#ff4d4f" : "#c51b1b",
      homdel: dark ? "#4096ff" : "#1f5fa8",
      ecdna: dark ? "#c38be0" : "#7b3294",
      snv: dark ? "#3fc79b" : "#1b9e77",
    }[cls] || (dark ? "#a8a8a8" : "#666666")
  );
}

/** Parsed tree: nodes with parent, first, last, size, time, children; plus leaf count. */
export function parseTree(tree) {
  if (!tree?.nodes?.length) return null;
  const nodes = tree.nodes.map(([parent, first, last], i) => ({
    id: i,
    parent,
    first,
    last,
    size: last - first + 1,
    time: tree.time?.[i] ?? 0,
    children: [],
  }));
  nodes.forEach((n) => {
    if (n.parent >= 0) nodes[n.parent].children.push(n.id);
  });
  return { nodes, n: tree.leaves?.length ?? nodes[0].size, leaves: tree.leaves || [] };
}

/** y of a node: centre of its leaf rows (leaf i spans [i, i + 1]). */
export const nodeY = (node) => (node.first + node.last + 1) / 2;

/** strict ancestry on the parsed tree */
export function isAncestor(t, a, b) {
  if (a === b) return false;
  const A = t.nodes[a];
  const B = t.nodes[b];
  return Boolean(A && B && A.first <= B.first && B.last <= A.last);
}

/**
 * Drawing primitives in tree units (x = relative time, trunk at x < 0; y =
 * leaf rows). Clades smaller than minSize are drawn as wedges from their
 * branch point to the tips.
 * -> { edges: [{ node, x0, x1, y }], connectors: [{ x, y0, y1 }], wedges: [{ node, x, y, y0, y1 }], n }
 */
export function treeGeometry(t, { minSize = 1 } = {}) {
  if (!t) return { edges: [], connectors: [], wedges: [], n: 0 };
  const edges = [{ node: 0, x0: -TRUNK, x1: 0, y: nodeY(t.nodes[0]) }];
  const connectors = [];
  const wedges = [];
  const shown = (v) => v === 0 || t.nodes[v].size >= minSize;
  t.nodes.forEach((n) => {
    if (!shown(n.id)) return;
    if (n.id !== 0) edges.push({ node: n.id, x0: t.nodes[n.parent].time, x1: n.time, y: nodeY(n) });
    if (n.children.length) {
      const ys = n.children.map((c) => nodeY(t.nodes[c]));
      connectors.push({ x: n.time, y0: Math.min(...ys), y1: Math.max(...ys) });
      n.children.forEach((c) => {
        const k = t.nodes[c];
        if (!shown(c)) wedges.push({ node: c, x: n.time, y: nodeY(k), y0: k.first, y1: k.last + 1 });
      });
    }
  });
  return { edges, connectors, wedges, n: t.n };
}

/**
 * Where each placed event sits on the drawn tree: on the branch into its
 * clade (between the parent's and the clade's time), or on the trunk when
 * truncal. Events sharing a branch are spread along it.
 * -> [{ id, x, y, node, truncal, cls, label }]
 */
export function eventMarks(t, events) {
  if (!t) return [];
  const byNode = new Map();
  (events || []).forEach((e) => {
    if (!e.placed) return;
    const node = e.truncal ? 0 : e.node;
    if (!t.nodes[node]) return;
    if (!byNode.has(node)) byNode.set(node, []);
    byNode.get(node).push(e);
  });
  const out = [];
  byNode.forEach((evs, node) => {
    const n = t.nodes[node];
    const x0 = node === 0 ? -TRUNK : t.nodes[n.parent].time;
    const x1 = node === 0 ? 0 : n.time;
    evs.forEach((e, k) => {
      const f = (k + 1) / (evs.length + 1);
      out.push({ id: e.id, x: x0 + (x1 - x0) * f, y: nodeY(n), node, truncal: Boolean(e.truncal), cls: e.class, label: e.short || e.label });
    });
  });
  return out;
}

/**
 * Rows of the evolutionary oncoplot: recurrent events (placed in >= minPlaced
 * patients), earliest median time first, with each patient's placement.
 */
export function oncoplotRows(aligned, patients, { minPlaced = 2, classes = null } = {}) {
  if (!aligned) return [];
  return (aligned.events || [])
    .filter((r) => r.n_placed >= minPlaced && (!classes || classes.includes(r.class)))
    .map((r) => ({
      ...r,
      cells: patients.map((P) => (aligned.patients?.[P]?.events || []).find((e) => e.id === r.id) || null),
    }))
    .sort((a, b) => (a.median_time ?? 9) - (b.median_time ?? 9) || b.n_truncal - a.n_truncal || b.n_placed - a.n_placed);
}

/** Pairs of one scope ("all" | "current"), most consistently ordered first. */
export function scopedPairs(aligned, scope = "all") {
  return (aligned?.pairs || [])
    .filter((p) => p.scope === scope)
    .slice()
    .sort((a, b) => b.a_first - b.b_first - (a.a_first - a.b_first) || (a.p ?? 1) - (b.p ?? 1) || b.both_placed - a.both_placed);
}

/** The pair record for two events in either order (oriented as stored). */
export function findPair(pairs, a, b) {
  return (pairs || []).find((p) => (p.a === a && p.b === b) || (p.a === b && p.b === a)) || null;
}

/** How two events relate in one patient: a_first | b_first | same | parallel | unplaced | absent. */
export function relationInPatient(patient, a, b) {
  const t = parseTree(patient?.tree);
  const ea = (patient?.events || []).find((e) => e.id === a);
  const eb = (patient?.events || []).find((e) => e.id === b);
  if (!t || !ea || !eb) return "absent";
  if (!ea.placed || !eb.placed) return "unplaced";
  const na = ea.truncal ? 0 : ea.node;
  const nb = eb.truncal ? 0 : eb.node;
  if (na === nb) return "same";
  if (isAncestor(t, na, nb)) return "a_first";
  if (isAncestor(t, nb, na)) return "b_first";
  return "parallel";
}

export const RELATION_LABEL = {
  a_first: "first",
  b_first: "second",
  same: "same branch",
  parallel: "parallel lineages",
  unplaced: "not tree-coherent",
  absent: "absent",
};

/** Plain-language line for a pair: "chr7 gain precedes EGFR amplification in 3/4 patients where the two are ordered". */
export function pairSentence(pair, labelOf = (x) => x) {
  if (!pair) return "";
  const n = pair.a_first + pair.b_first;
  const extra = [];
  if (pair.same) extra.push(`${pair.same} same branch`);
  if (pair.parallel) extra.push(`${pair.parallel} parallel`);
  const tail = extra.length ? ` (${extra.join(", ")})` : "";
  if (!n) return `${labelOf(pair.a)} and ${labelOf(pair.b)} are never nested in one lineage${tail}`;
  return `${labelOf(pair.a)} precedes ${labelOf(pair.b)} in ${pair.a_first}/${n} patients where the two are ordered${tail}`;
}

/** Per-leaf strip values from leaf rows: rows -> value (else null), length n. */
export function leafStrip(n, rows, value = true) {
  const out = new Array(Math.max(0, n)).fill(null);
  (rows || []).forEach((r) => {
    if (Number.isInteger(r) && r >= 0 && r < n) out[r] = value;
  });
  return out;
}

/** Leaf strip of [row, state, lineage] association cells, picking field k (1 = state, 2 = lineage). */
export function cellsStrip(n, cells, k = 1) {
  const out = new Array(Math.max(0, n)).fill(null);
  (cells || []).forEach((c) => {
    if (c[0] >= 0 && c[0] < n) out[c[0]] = c[k];
  });
  return out;
}

/* ---------------- associations ---------------- */

/**
 * Concordance matrix rows: phenotype x patient cells ({ z, p, observed,
 * expected, within_p }) with the cross-patient summary.
 */
export function concordanceRows(assoc, patients, { kinds = null } = {}) {
  return (assoc?.concordance || [])
    .filter((c) => !kinds || kinds.includes(c.kind))
    .map((c) => ({ ...c, cells: patients.map((P) => c.per_patient?.[P] || null) }));
}

/**
 * Fill for a phylogenetic-signal cell: neutral unless p < alpha, then a
 * ramp of the accent colour by z (z = 2 light .. z >= 6 full).
 */
export function signalFill(cell, theme, alpha = 0.05) {
  if (!cell || !Number.isFinite(cell.z)) return theme.empty;
  if (!(cell.p < alpha) || cell.z <= 0) return theme.panelAlt;
  const f = Math.min(1, Math.max(0.25, (cell.z - 1) / 5));
  const a = isDarkLike(theme.mode) ? 0.25 + 0.6 * f : 0.18 + 0.7 * f;
  return isDarkLike(theme.mode) ? `rgba(64,150,255,${a.toFixed(2)})` : `rgba(22,119,255,${a.toFixed(2)})`;
}

/** Forest-plot rows of event x state associations (log OR with 95% CI), most significant first. */
export function forestRows(assoc, { maxRows = 15, minPatients = 2 } = {}) {
  return (assoc?.event_state || [])
    .filter((r) => r.n_patients >= minPatients && Number.isFinite(r.or) && r.or > 0)
    .slice(0, maxRows)
    .map((r) => ({
      ...r,
      key: `${r.event}|${r.state}`,
      lor: Math.log(r.or),
      llo: Number.isFinite(r.lo) && r.lo > 0 ? Math.log(r.lo) : null,
      lhi: Number.isFinite(r.hi) && r.hi > 0 ? Math.log(r.hi) : null,
      patientLors: Object.entries(r.per_patient || {}).map(([P, v]) => ({ patient: P, lor: Math.log(v.or), p: v.p })),
    }));
}

/** Symmetric log-OR domain covering CIs and per-patient points, at least +-1. */
export function forestDomain(rows) {
  let m = 1;
  rows.forEach((r) => {
    [r.lor, r.llo, r.lhi, ...r.patientLors.map((x) => x.lor)].forEach((v) => {
      if (Number.isFinite(v)) m = Math.max(m, Math.abs(v));
    });
  });
  return [-Math.min(m, 4), Math.min(m, 4)];
}

/** "p = 0.012" / "p < 0.001" / "" */
export function fmtP(p, name = "p") {
  if (!Number.isFinite(p)) return "";
  if (p < 0.001) return `${name} < 0.001`;
  return `${name} = ${p < 0.01 ? p.toPrecision(1) : p.toFixed(p < 0.1 ? 3 : 2).replace(/0+$/, "").replace(/\.$/, "")}`;
}
