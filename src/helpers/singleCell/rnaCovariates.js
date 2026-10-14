// Extra per-cell covariates for the cross-patient RNA differential (rna/covariates.json, srctools
// gos_sc_rna_covariates.py): clade, DNA clone, ploidy, plate, driver carrier status, gene copy number,
// ecDNA copies. d3-free so jest can test it.

const MAX_LEVELS = 60;

/**
 * Add the covariates of `cov` ({ fields: [{ name, group, numeric }], cells: { rna_id: { field: value } } })
 * to a parsed RNA summary (staticRna.parseRnaSummary). Cells and fields of the summary are not mutated.
 * The result has `fieldGroups` ({ field name: group }) with "RNA metadata" for the Seurat columns.
 */
export function mergeCovariates(summary, cov) {
  if (!summary) return summary;
  const fieldGroups = Object.fromEntries(summary.fields.map((f) => [f.name, "RNA metadata"]));
  if (!cov || !cov.cells || !Array.isArray(cov.fields) || !cov.fields.length) return { ...summary, fieldGroups };
  const taken = new Set(summary.fields.map((f) => f.name));
  const metaOf = new Map(cov.fields.filter((f) => !taken.has(f.name)).map((f) => [f.name, f]));
  const cells = summary.cells.map((c) => {
    const extra = cov.cells[c.rna_id];
    if (!extra) return c;
    const out = { ...c };
    Object.entries(extra).forEach(([k, v]) => {
      if (metaOf.has(k)) out[k] = v;
    });
    return out;
  });
  const fields = [...summary.fields];
  metaOf.forEach((meta, name) => {
    const values = cells.map((c) => c[name]).filter((v) => v != null && v !== "");
    if (!values.length) return;
    const numeric = Boolean(meta.numeric) && values.every((v) => typeof v === "number");
    const levels = numeric ? null : [...new Set(values.map((v) => `${v}`))].sort();
    if (!numeric && levels.length > MAX_LEVELS) return;
    fields.push({ name, numeric, levels });
    fieldGroups[name] = meta.group || "Covariates";
  });
  return { ...summary, cells, fields, fieldGroups };
}

/** Options for a grouped Select: [{ label: group, options: [{ value, label }] }], RNA metadata first. */
export function groupedFieldOptions(names, groupOf, labelOf = (n) => n) {
  const groups = new Map();
  names.forEach((n) => {
    const g = groupOf[n] || "RNA metadata";
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push({ value: n, label: labelOf(n) });
  });
  return [...groups.entries()]
    .sort((a, b) => (a[0] === "RNA metadata" ? -1 : b[0] === "RNA metadata" ? 1 : a[0].localeCompare(b[0])))
    .map(([label, options]) => ({ label, options }));
}

/**
 * Split one patient's comparison by the levels of a covariate (stratified test: compare inside each level,
 * then combine across strata). Only strata with at least `minCells` cells in both groups are kept.
 * @param m { patient, idxA, idxB } row indices into `cells`
 * @param cells the patient's summary cells
 * @returns [{ patient, label, level, idxA, idxB }]
 */
export function strataUnits(m, cells, field, minCells = 3) {
  if (!field) return [{ patient: m.patient, label: m.patient, level: null, idxA: m.idxA, idxB: m.idxB }];
  const split = (idx) => {
    const by = new Map();
    idx.forEach((i) => {
      const v = cells[i]?.[field];
      if (v == null || v === "") return;
      const key = `${v}`;
      if (!by.has(key)) by.set(key, []);
      by.get(key).push(i);
    });
    return by;
  };
  const a = split(m.idxA);
  const b = split(m.idxB);
  return [...a.keys()]
    .filter((level) => b.has(level) && a.get(level).length >= minCells && b.get(level).length >= minCells)
    .sort()
    .map((level) => ({ patient: m.patient, label: `${m.patient} · ${level}`, level, idxA: a.get(level), idxB: b.get(level) }));
}
