import { useCallback, useMemo, useSyncExternalStore } from "react";
import { useSelector } from "react-redux";
import {
  buildCellLabelMap,
  cellDisplayLabel,
  cellLabelWithId,
  getCellLabelMode,
  setCellLabelMode,
  subscribeCellLabelMode,
  resolveCellQuery,
  matchCells,
} from "../../helpers/singleCell/cellLabels";

const cache = new WeakMap();
const EMPTY = {};

/** Redux selector: { pairId: well } built from the dataset manifest (all patients). Memoized per records array. */
export function selectCellLabelMap(state) {
  const datasetId = state.Settings?.dataset?.id;
  const records = state.CaseReports?.manifestRecordsByDataset?.[datasetId] || state.CaseReports?.datafiles;
  if (!Array.isArray(records)) return EMPTY;
  if (!cache.has(records)) cache.set(records, buildCellLabelMap(records));
  return cache.get(records);
}

/** { label(id), full(id), match(q, ids), resolve(q, ids), mode, setMode, map } for any component. */
export default function useCellLabels() {
  const map = useSelector(selectCellLabelMap);
  const mode = useSyncExternalStore(subscribeCellLabelMode, getCellLabelMode);
  const label = useCallback((id) => cellDisplayLabel(id, map, mode), [map, mode]);
  const full = useCallback((id) => cellLabelWithId(id, map, mode), [map, mode]);
  const match = useCallback((q, ids) => matchCells(q, ids, map), [map]);
  const resolve = useCallback((q, ids) => resolveCellQuery(q, ids, map), [map]);
  return useMemo(() => ({ label, full, match, resolve, mode, setMode: setCellLabelMode, map }), [label, full, match, resolve, mode, map]);
}
