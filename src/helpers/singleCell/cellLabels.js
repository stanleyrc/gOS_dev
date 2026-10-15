/* Display labels for single cells (d3-free).
 * The numeric pair id (e.g. BWH75_432) stays the internal key for URLs, file paths and joins;
 * the manifest's `well` (e.g. BWH75_MR_3_pl3_10a) is the readable label shown to the user. */

export const CELL_LABEL_MODES = ["well", "id"];
export const DEFAULT_CELL_LABEL_MODE = "well";
const STORAGE_KEY = "gos.sc.cellLabelMode";

/** { pairId: well } for the cells whose well differs from the pair id. */
export function buildCellLabelMap(records = []) {
  const map = {};
  (Array.isArray(records) ? records : []).forEach((r) => {
    if (!r) return;
    const id = r.cell_id ?? r.caseReportId ?? r.pair;
    const well = r.well;
    if (id == null || well == null || well === "") return;
    if (`${well}` !== `${id}`) map[`${id}`] = `${well}`;
  });
  return map;
}

export function normalizeMode(mode) {
  return CELL_LABEL_MODES.includes(mode) ? mode : DEFAULT_CELL_LABEL_MODE;
}

/** The text to show for a cell id. Unknown ids and mode "id" return the id unchanged. */
export function cellDisplayLabel(id, labelMap, mode = DEFAULT_CELL_LABEL_MODE) {
  if (id == null) return id;
  if (normalizeMode(mode) === "id") return `${id}`;
  return labelMap?.[`${id}`] ?? `${id}`;
}

/** "well (pair id)" for tooltips so the id stays discoverable; just the id when there is no well. */
export function cellLabelWithId(id, labelMap, mode = DEFAULT_CELL_LABEL_MODE) {
  if (id == null) return id;
  const label = cellDisplayLabel(id, labelMap, mode);
  return label === `${id}` ? `${id}` : `${label} (${id})`;
}

/** The other name of the cell, for exports: { id, well }. */
export function cellExportNames(id, labelMap) {
  return { id: `${id}`, well: labelMap?.[`${id}`] ?? "" };
}

/** Resolve a typed query (well label or pair id, case-insensitive) to a cell id, or null. Exact matches only. */
export function resolveCellQuery(query, ids = [], labelMap = {}) {
  const q = `${query ?? ""}`.trim().toLowerCase();
  if (!q) return null;
  for (const id of ids) if (`${id}`.toLowerCase() === q) return `${id}`;
  for (const id of ids) if (`${labelMap?.[`${id}`] ?? ""}`.toLowerCase() === q) return `${id}`;
  return null;
}

/** Ids whose pair id or well label contains the query (case-insensitive), exact matches first. */
export function matchCells(query, ids = [], labelMap = {}) {
  const q = `${query ?? ""}`.trim().toLowerCase();
  if (!q) return [];
  const exact = resolveCellQuery(query, ids, labelMap);
  const hits = ids.filter((id) => {
    const a = `${id}`.toLowerCase();
    const b = `${labelMap?.[`${id}`] ?? ""}`.toLowerCase();
    return a.includes(q) || b.includes(q);
  });
  return exact ? [exact, ...hits.filter((id) => `${id}` !== exact)] : hits;
}

/* ---- the user's choice, persisted per browser ---- */
const listeners = new Set();
let currentMode = null;

export function getCellLabelMode() {
  if (currentMode == null) {
    let stored = null;
    try {
      stored = window.localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      stored = null;
    }
    currentMode = normalizeMode(stored);
  }
  return currentMode;
}

export function setCellLabelMode(mode) {
  currentMode = normalizeMode(mode);
  try {
    window.localStorage.setItem(STORAGE_KEY, currentMode);
  } catch (e) {
    /* storage unavailable: the choice lasts for this page view */
  }
  listeners.forEach((fn) => fn());
}

export function subscribeCellLabelMode(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function resetCellLabelModeForTests() {
  currentMode = null;
  listeners.clear();
}

/** TSV of cells for download: the pair id column stays first, a well column follows. extra: [[key, header]]. */
export function cellsTsv(cells = [], labelMap = {}, extra = [["clone_id", "clone"]]) {
  const clean = (v) => (v == null ? "" : `${v}`.replace(/[\t\r\n]+/g, " "));
  const head = ["cell_id", "well", ...extra.map(([, h]) => h)];
  const lines = cells.map((c) => [clean(c.cell_id), clean(labelMap?.[`${c.cell_id}`] ?? ""), ...extra.map(([k]) => clean(c[k]))].join("\t"));
  return `${[head.join("\t"), ...lines].join("\n")}\n`;
}
