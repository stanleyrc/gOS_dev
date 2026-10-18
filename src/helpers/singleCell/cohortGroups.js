// Named cell groups for the cohort Transcriptome > RNA view. A group spans
// patients and is defined by a rule (patients x metadata field levels, all
// ANDed), by explicit cells boxed on the cohort UMAP, or both (the cells must
// satisfy both). Groups are stored per dataset (layout.cohortGroups =
// { [datasetId]: [def] }) and shared through the "cgroups" URL parameter, with
// "cmpa" / "cmpb" naming the compared pair. No d3 here, so jest can import it.
import { toBase64, fromBase64 } from "./savedGroups";

export const COHORT_GROUPS_PARAM = "cgroups";
export const COMPARE_A_PARAM = "cmpa";
export const COMPARE_B_PARAM = "cmpb";
export const REST = "__rest__";
export const DOMINANT_FRACTION = 0.8; // one patient holding >= 80% of a group's cells
export const MIN_CELLS = 3;

export const cellKey = (patient, rnaId) => `${patient}::${rnaId}`;

/** A clean group definition: { name, patients, filters: { field: [level] }, keys } */
export function makeDef({ name, patients = [], filters = {}, keys = null } = {}) {
  const cleanFilters = {};
  Object.entries(filters || {}).forEach(([field, levels]) => {
    const l = (levels || []).map(String);
    if (field && l.length) cleanFilters[field] = [...new Set(l)];
  });
  return {
    name: `${name ?? ""}`.trim(),
    patients: [...new Set((patients || []).map(String))],
    filters: cleanFilters,
    keys: keys && keys.length ? [...new Set(keys.map(String))] : [],
  };
}

export const isEmptyDef = (def) => !def.patients.length && !Object.keys(def.filters).length && !def.keys.length;

/** Does this cell of this patient belong to the group? An empty definition matches nothing. */
export function matchesDef(def, patient, cell, keySet = null) {
  if (!def || isEmptyDef(def)) return false;
  if (def.patients.length && !def.patients.includes(patient)) return false;
  for (const [field, levels] of Object.entries(def.filters)) {
    if (!levels.includes(`${cell[field]}`)) return false;
  }
  if (def.keys.length) {
    const set = keySet || new Set(def.keys);
    if (!set.has(cellKey(patient, cell.rna_id))) return false;
  }
  return true;
}

/** Keys (patient::rna_id) of the cells in a group; cellsByPatient is { patient: [cell] }. */
export function resolveKeys(def, cellsByPatient) {
  const keySet = def.keys.length ? new Set(def.keys) : null;
  const out = [];
  Object.entries(cellsByPatient || {}).forEach(([patient, cells]) => {
    (cells || []).forEach((c) => {
      if (matchesDef(def, patient, c, keySet)) out.push(cellKey(patient, c.rna_id));
    });
  });
  return out;
}

export const patientOfKey = (key) => `${key}`.split("::")[0];

/** [{ patient, n }] largest first, for the keys of one group. */
export function composition(keys) {
  const counts = new Map();
  (keys || []).forEach((k) => counts.set(patientOfKey(k), (counts.get(patientOfKey(k)) || 0) + 1));
  return [...counts.entries()].map(([patient, n]) => ({ patient, n })).sort((a, b) => b.n - a.n || a.patient.localeCompare(b.patient));
}

/**
 * Patient confounding of one group: { total, dominant, fraction, single, warn }.
 * warn when one patient holds at least `threshold` of the cells and the group
 * has more than one patient or a single one (then every difference is also a
 * patient difference).
 */
export function dominance(keys, threshold = DOMINANT_FRACTION) {
  const comp = composition(keys);
  const total = comp.reduce((s, c) => s + c.n, 0);
  if (!total) return { total: 0, dominant: null, fraction: 0, single: false, warn: false, comp };
  const top = comp[0];
  const fraction = top.n / total;
  return { total, dominant: top.patient, fraction, single: comp.length === 1, warn: fraction >= threshold, comp };
}

/**
 * Confounding for a contrast A vs B: each group dominated by one patient, and
 * whether the two groups share any patient (without a shared patient the
 * comparison cannot separate the groups from the patients).
 */
export function contrastWarnings(keysA, keysB, threshold = DOMINANT_FRACTION) {
  const a = dominance(keysA, threshold);
  const b = dominance(keysB, threshold);
  const pa = new Set(a.comp.map((c) => c.patient));
  const shared = b.comp.filter((c) => pa.has(c.patient)).map((c) => c.patient);
  const warnings = [];
  if (a.warn) warnings.push({ kind: "dominated", side: "A", patient: a.dominant, fraction: a.fraction, single: a.single });
  if (b.warn) warnings.push({ kind: "dominated", side: "B", patient: b.dominant, fraction: b.fraction, single: b.single });
  if (a.total && b.total && !shared.length) warnings.push({ kind: "disjoint", patientsA: [...pa], patientsB: b.comp.map((c) => c.patient) });
  return { a, b, shared, warnings };
}

// ---- persistence (layout.cohortGroups = { [datasetId]: [def] }) ----

export const groupsOf = (all, datasetId) => ((all || {})[`${datasetId}`] || []).filter((g) => g && g.name);

export function withGroups(all, datasetId, next) {
  return { ...(all || {}), [`${datasetId}`]: next };
}

/** Add or replace (same name) a group; the list order is kept for replacements. */
export function upsertGroup(list, def) {
  const name = `${def.name}`.trim();
  if (!name) return list;
  const clean = { ...def, name };
  return list.some((g) => g.name === name) ? list.map((g) => (g.name === name ? clean : g)) : [...list, clean];
}

export function deleteGroup(list, name) {
  return list.filter((g) => g.name !== name);
}

/** Rename; refuses empty names and names already taken by another group. */
export function renameGroup(list, from, to) {
  const next = `${to}`.trim();
  if (!next || next === from) return list;
  if (list.some((g) => g.name === next)) return list;
  return list.map((g) => (g.name === from ? { ...g, name: next } : g));
}

/** A name not used yet: "Group 1", "Group 2", ... */
export function nextName(list, base = "Group") {
  const used = new Set(list.map((g) => g.name));
  let n = list.length + 1;
  while (used.has(`${base} ${n}`)) n += 1;
  return `${base} ${n}`;
}

// ---- URL ----

const urlSafe = (b64) => b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromUrlSafe = (s) => {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  return b64 + "=".repeat((4 - (b64.length % 4)) % 4);
};

/** Explicit keys grouped by patient, with the "<patient>_" prefix of the cell id dropped when present. */
const packKeys = (keys) => {
  const out = {};
  keys.forEach((k) => {
    const p = patientOfKey(k);
    const id = `${k}`.slice(p.length + 2);
    (out[p] = out[p] || []).push(id.startsWith(`${p}_`) ? id.slice(p.length + 1) : `~${id}`);
  });
  return out;
};
const unpackKeys = (packed) =>
  Object.entries(packed || {}).flatMap(([p, ids]) => (ids || []).map((id) => cellKey(p, `${id}`.startsWith("~") ? `${id}`.slice(1) : `${p}_${id}`)));

export function encodeGroups(defs) {
  const slim = defs.map((d) => ({ n: d.name, p: d.patients, f: d.filters, k: packKeys(d.keys) }));
  return urlSafe(toBase64(JSON.stringify(slim)));
}

export function decodeGroups(param) {
  if (!param) return null;
  try {
    const parsed = JSON.parse(fromBase64(fromUrlSafe(param)));
    if (!Array.isArray(parsed)) return null;
    return parsed
      .filter((d) => d && typeof d.n === "string" && d.n.trim())
      .map((d) => makeDef({ name: d.n, patients: Array.isArray(d.p) ? d.p : [], filters: d.f && typeof d.f === "object" ? d.f : {}, keys: unpackKeys(d.k) }));
  } catch (error) {
    return null;
  }
}

/** Groups to carry in a link: the compared ones only, so the URL stays short. */
export function compareLink(href, defs, a, b) {
  const url = new URL(href);
  const used = defs.filter((d) => d.name === a || d.name === b);
  [COHORT_GROUPS_PARAM, COMPARE_A_PARAM, COMPARE_B_PARAM].forEach((p) => url.searchParams.delete(p));
  url.searchParams.set("scview", "rna"); // the cohort RNA view, where the groups live
  if (used.length) url.searchParams.set(COHORT_GROUPS_PARAM, encodeGroups(used));
  if (a) url.searchParams.set(COMPARE_A_PARAM, a);
  if (b) url.searchParams.set(COMPARE_B_PARAM, b);
  return url.toString();
}

/** { groups, a, b } from a query string; null when no cohort group parameters are present. */
export function compareFromSearch(search) {
  const q = new URLSearchParams(search);
  const groups = decodeGroups(q.get(COHORT_GROUPS_PARAM));
  const a = q.get(COMPARE_A_PARAM);
  const b = q.get(COMPARE_B_PARAM);
  if (!groups && !a && !b) return null;
  return { groups: groups || [], a: a || null, b: b || null };
}

/** Stored groups with the URL's merged in (same name: URL wins). */
export function mergeIncoming(stored, incoming) {
  const names = new Set((incoming || []).map((g) => g.name));
  return [...stored.filter((g) => !names.has(g.name)), ...(incoming || [])];
}
