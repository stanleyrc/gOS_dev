// Cell selection of a figure tab across panels and patients: { byPatient: Map(patient -> Set(cell)), label }. d3-free.

/** Select cells of one patient: replace the selection, or add to it (add = true); toggle = remove cells already selected. */
export function selectCells(sel, ids, patient, { add = false, toggle = false, label = null } = {}) {
  const key = patient == null ? "" : `${patient}`;
  const by = new Map(add || toggle ? [...(sel?.byPatient || new Map()).entries()].map(([p, s]) => [p, new Set(s)]) : []);
  const set = by.get(key) || new Set();
  ids.forEach((id) => {
    const s = `${id}`;
    if (toggle && set.has(s)) set.delete(s);
    else set.add(s);
  });
  if (set.size) by.set(key, set);
  else by.delete(key);
  const n = [...by.values()].reduce((t, s) => t + s.size, 0);
  return n ? { byPatient: by, label: label ?? sel?.label ?? null } : null;
}

/** All selected cell ids. */
export const selectedIds = (sel) => new Set(sel ? [...sel.byPatient.values()].flatMap((s) => [...s]) : []);

/** [{ patient, ids: [cell] }] largest first. */
export const selectionGroups = (sel) => (sel ? [...sel.byPatient.entries()].map(([patient, s]) => ({ patient: patient || null, ids: [...s] })).sort((a, b) => b.ids.length - a.ids.length) : []);

/** "12 cells (BWH70) + 3 (MGH303)" */
export function selectionText(sel) {
  const g = selectionGroups(sel);
  if (!g.length) return "";
  const n = g.reduce((t, x) => t + x.ids.length, 0);
  return `${n} cell${n === 1 ? "" : "s"} selected${g.length === 1 ? (g[0].patient ? ` (${g[0].patient})` : "") : ` (${g.map((x) => `${x.ids.length} ${x.patient || "?"}`).join(", ")})`}`;
}
