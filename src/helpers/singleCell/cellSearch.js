// d3-free: quick cell search / QC selection on the single-cell page. Produces the list of cell ids that
// match a pasted name list and QC filters; the component dispatches them to the shared selection
// (state.SingleCell.selectedCellIds), so every view that highlights the selection follows it.

export const TN_OPTIONS = [
  { value: "tumor", label: "Tumor" },
  { value: "normal", label: "Normal" },
];
export const QC_OPTIONS = [
  { value: "flagged", label: "Flagged by QC" },
  { value: "low_coverage", label: "Low coverage (lowest 10%)" },
  { value: "pass", label: "Passing QC" },
];
export const LOW_COVERAGE_FRACTION = 0.1;

/** "a, b  c\nd" -> ["a","b","c","d"] (lower case, no empties, no duplicates). */
export function parseCellTerms(text) {
  return [...new Set(`${text ?? ""}`.split(/[\s,;]+/).map((t) => t.trim().toLowerCase()).filter(Boolean))];
}

const num = (v) => (v == null || v === "" || Number.isNaN(+v) ? null : +v);

/** Ids whose depth is in the lowest `fraction` of the cells that have one (ties at the cut included). */
export function lowCoverageIds(depthById, fraction = LOW_COVERAGE_FRACTION) {
  const entries = [...depthById.entries()].filter(([, v]) => num(v) != null);
  if (entries.length < 5) return new Set();
  const sorted = entries.map(([, v]) => +v).sort((a, b) => a - b);
  const cut = sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
  return new Set(entries.filter(([, v]) => +v <= cut).map(([id]) => id));
}

const NORMAL_CLONE = /^normal/i;

/**
 * One fact row per cell.
 * cells: manifest records (clone_id, merged "QC flag" / "QC" fields); qcRows: precompute/qc.json cells
 * (normal, het_depth_med); cladeByCell / stateByCell: Map(cell_id -> text).
 */
export function buildCellFacts({ cells = [], qcRows = [], cladeByCell = new Map(), stateByCell = new Map() } = {}) {
  const qc = new Map((qcRows || []).map((r) => [`${r.cell_id}`, r]));
  const depth = new Map();
  cells.forEach((c) => {
    const r = qc.get(`${c.cell_id}`);
    const d = num(r?.het_depth_med);
    const normal = typeof r?.normal === "boolean" ? r.normal : NORMAL_CLONE.test(`${c.clone_id ?? ""}`);
    // coverage ranks tumor cells among tumor cells only (normals are sequenced differently)
    if (d != null && !normal) depth.set(`${c.cell_id}`, d);
  });
  const low = lowCoverageIds(depth);
  return cells.map((c) => {
    const id = `${c.cell_id}`;
    const r = qc.get(id);
    const normal = typeof r?.normal === "boolean" ? r.normal : NORMAL_CLONE.test(`${c.clone_id ?? ""}`);
    const flag = c["QC flag"];
    const flagged = (flag != null && flag !== "pass") || c.QC === "fail";
    const hasQc = flag != null || c.QC != null;
    return {
      id,
      clone: c.clone_id ?? null,
      tn: normal ? "normal" : "tumor",
      flagged,
      hasQc,
      lowCoverage: low.has(id),
      clade: cladeByCell.get(id) ?? null,
      state: stateByCell.get(id) ?? null,
    };
  });
}

/** Option lists for the pickers: { clades, states, clones } (sorted, only values that occur). */
export function filterOptions(facts) {
  const uniq = (k) => [...new Set(facts.map((f) => f[k]).filter((v) => v != null && v !== ""))].sort((a, b) => `${a}`.localeCompare(`${b}`, undefined, { numeric: true }));
  return { clades: uniq("clade"), states: uniq("state"), clones: uniq("clone") };
}

export const emptyCriteria = () => ({ text: "", tn: [], qc: [], clades: [], states: [], clones: [] });

export const hasCriteria = (c) => Boolean(parseCellTerms(c?.text).length || ["tn", "qc", "clades", "states", "clones"].some((k) => (c?.[k] || []).length));

function qcMatches(f, wanted) {
  // any of the chosen QC conditions
  return wanted.some((w) => (w === "flagged" ? f.flagged : w === "low_coverage" ? f.lowCoverage : w === "pass" ? f.hasQc && !f.flagged : false));
}

/**
 * Cell ids matching the criteria: names (any term, substring of the id or the well label) AND each filter
 * group (any value within a group). No criteria -> [] (nothing to select).
 */
export function matchingCellIds(facts, criteria, labelMap = {}) {
  if (!hasCriteria(criteria)) return [];
  const terms = parseCellTerms(criteria.text);
  return facts
    .filter((f) => {
      if (terms.length) {
        const id = f.id.toLowerCase();
        const well = `${labelMap?.[f.id] ?? ""}`.toLowerCase();
        if (!terms.some((t) => id.includes(t) || (well && well.includes(t)))) return false;
      }
      if (criteria.tn?.length && !criteria.tn.includes(f.tn)) return false;
      if (criteria.qc?.length && !qcMatches(f, criteria.qc)) return false;
      if (criteria.clades?.length && !criteria.clades.includes(f.clade)) return false;
      if (criteria.states?.length && !criteria.states.includes(f.state)) return false;
      if (criteria.clones?.length && !criteria.clones.includes(f.clone)) return false;
      return true;
    })
    .map((f) => f.id);
}

/** Search terms that match no cell (to tell the user which pasted names were not found). */
export function unmatchedTerms(facts, text, labelMap = {}) {
  return parseCellTerms(text).filter(
    (t) => !facts.some((f) => f.id.toLowerCase().includes(t) || `${labelMap?.[f.id] ?? ""}`.toLowerCase().includes(t))
  );
}
