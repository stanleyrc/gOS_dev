import { useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import singleCellActions from "../../redux/singleCell/actions";
import { excludedCellIds } from "../../helpers/singleCell/precompute";
import { covQcCounts, covQcFailedIds, hasCovQc, resolveThresholds, withCovQcFields, withCovQcSearch } from "../../helpers/singleCell/cellQc";

/** Cells with the live QC / QC reason annotation fields (follows the edited thresholds). */
export function useQcCells(cells) {
  const thresholds = useSelector((s) => s.SingleCell.layout.covQcThresholds);
  return useMemo(() => withCovQcFields(cells, thresholds), [cells, thresholds]);
}

function writeUrl(on, thresholds) {
  try {
    const search = withCovQcSearch(window.location.search, on, thresholds);
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${search}${window.location.hash}`);
  } catch (error) {
    // URL not writable: the setting still applies
  }
}

/**
 * "Hide low-QC cells" state: layout.hideLowQc / layout.covQcThresholds (layout redux, persisted) mirrored in
 * ?hidelowqc=1 and ?qcthr=. `failed` is the number of cells failing now, `available` whether any cell has metrics.
 */
export default function useCovQc() {
  const dispatch = useDispatch();
  const cells = useSelector((s) => s.SingleCell.cells);
  const hide = useSelector((s) => Boolean(s.SingleCell.layout.hideLowQc));
  const stored = useSelector((s) => s.SingleCell.layout.covQcThresholds);
  const thresholds = useMemo(() => resolveThresholds(stored), [stored]);
  const available = useMemo(() => cells.some(hasCovQc), [cells]);
  const failedIds = useMemo(() => covQcFailedIds(cells, thresholds), [cells, thresholds]);
  const counts = useMemo(() => covQcCounts(cells, thresholds), [cells, thresholds]);
  const setHide = (on) => {
    dispatch(singleCellActions.updateLayout({ hideLowQc: on }));
    writeUrl(on, stored);
  };
  const setThresholds = (next) => {
    dispatch(singleCellActions.updateLayout({ covQcThresholds: next }));
    writeUrl(hide, next);
  };
  return { hide, setHide, thresholds, setThresholds, available, failed: failedIds.size, failedIds, counts, total: cells.length };
}

const NONE = [];

/** Ids hidden by the global cell filter (QC rules, manual exclusions, and "Hide low-QC cells"). */
export function useHiddenCellIds() {
  const cells = useSelector((s) => s.SingleCell.cells);
  const layout = useSelector((s) => s.SingleCell.layout);
  return useMemo(
    () => excludedCellIds(cells, layout.qcExcludeRules || NONE, layout.excludedCells || NONE, { on: layout.hideLowQc, thresholds: layout.covQcThresholds }),
    [cells, layout.qcExcludeRules, layout.excludedCells, layout.hideLowQc, layout.covQcThresholds]
  );
}
