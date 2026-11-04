// d3-free: per-cell annotation fields for the CN heatmap strips.
//  * "Clade": the named clade (clades.json named_groups: CI1, CI2, EC2, EC3, ...) a cell belongs to.
//  * "ecDNA: <amplicon>": the ecDNA classifier call (ecdna_status.json) of the smallest tree clade holding the cell:
//    "ecDNA-like" (unstable), "stable", "indeterminate" or "not enough" (too few carriers / low CN).
// Cells absent from the source get no value (strip shows blank), never a made-up call.

export const CLADE_FIELD = "Clade";
export const ECDNA_PREFIX = "ecDNA: ";
const CALL_TEXT = { unstable: "ecDNA-like", "unstable (sister untested)": "ecDNA-like", stable: "stable", indeterminate: "indeterminate", "not enough": "not enough" };

/** Map cell_id -> named clade (smallest group wins on overlap). */
export function namedCladeByCell(namedGroups) {
  const m = new Map();
  [...(namedGroups || [])]
    .sort((a, b) => (b.cells?.length || 0) - (a.cells?.length || 0))
    .forEach((g) => (g.cells || []).forEach((c) => m.set(c, g.name)));
  return m;
}

/** Amplicons with a decisive verdict, as { field, amplicon }. */
export function ecdnaFieldsOf(doc) {
  if (!doc || !Array.isArray(doc.amplicons)) return [];
  return doc.amplicons
    .filter((a) => a.kind === "amplicon" && a.verdict && a.verdict !== "not enough")
    .map((a) => ({ field: `${ECDNA_PREFIX}${a.label || a.amplicon}`, amplicon: a }));
}

/** Map cell_id -> call text for one amplicon, from the smallest non-ALL clade group containing the cell. */
export function ecdnaCallByCell(doc, amplicon) {
  const out = new Map();
  if (!doc?.cells || !doc?.clade_cells || !amplicon?.groups) return out;
  const groups = amplicon.groups.filter((g) => g.group !== "ALL" && g.call && doc.clade_cells[g.group]).sort((a, b) => b.n_group - a.n_group);
  groups.forEach((g) => doc.clade_cells[g.group].forEach((i) => out.set(doc.cells[i], CALL_TEXT[g.call] || g.call)));
  return out;
}

/** cells + the Clade and ecDNA fields (cells array returned unchanged when neither source is available). */
export function withCladeEcdnaFields(cells, clades, ecdna) {
  const named = namedCladeByCell(clades?.named_groups);
  const fields = ecdnaFieldsOf(ecdna).map((f) => ({ ...f, calls: ecdnaCallByCell(ecdna, f.amplicon) }));
  if (!named.size && !fields.length) return cells;
  return cells.map((c) => {
    const extra = {};
    if (named.has(c.cell_id)) extra[CLADE_FIELD] = named.get(c.cell_id);
    fields.forEach((f) => {
      if (f.calls.has(c.cell_id)) extra[f.field] = f.calls.get(c.cell_id);
    });
    return Object.keys(extra).length ? { ...c, ...extra } : c;
  });
}

/** Default strips: Clade plus the first ecDNA field, appended to the chosen fields once. */
export function defaultCladeEcdnaFields(options) {
  return [CLADE_FIELD, ...options.filter((o) => o.startsWith(ECDNA_PREFIX)).slice(0, 1)].filter((f) => options.includes(f));
}
