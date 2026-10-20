// Cell selection of a figure tab across panels and patients: { byPatient: Map(patient -> Set(cell)), label }. d3-free.

const PATIENT_RX = /^((?:BWH|MGH)\d{2,3})_/;
/** Patient of a cell id from its prefix (BWH70_MR_1_pl1_6d -> BWH70), else null. */
export const patientOfCell = (id) => PATIENT_RX.exec(`${id ?? ""}`)?.[1] || null;

/**
 * Select cells of one patient: replace the selection, or add to it (add = true); toggle = remove cells already
 * selected. patient null: each cell goes to the patient named by its id prefix.
 */
export function selectCells(sel, ids, patient, opts = {}) {
  if (patient == null && ids.some((id) => patientOfCell(id))) {
    const by = new Map();
    ids.forEach((id) => by.set(patientOfCell(id), [...(by.get(patientOfCell(id)) || []), id]));
    let s = opts.add || opts.toggle ? sel : null;
    let first = true;
    by.forEach((cells, p) => {
      s = selectOne(s, cells, p, { ...opts, add: opts.add || !first });
      first = false;
    });
    return s;
  }
  return selectOne(sel, ids, patient, opts);
}

function selectOne(sel, ids, patient, { add = false, toggle = false, label = null } = {}) {
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
