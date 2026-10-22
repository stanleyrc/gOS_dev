import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";

/**
 * The gene annotation (genes/<ref>.arrow, ~40 MB) is skipped on the cohort page and only fetched when a report opens.
 * Views that place genes on the genome (CN vs expression, dosage) call this so a deep link does not leave them
 * waiting on a list nobody requested. Returns { ready, loading }.
 */
export default function useEnsureGeneList() {
  const dispatch = useDispatch();
  const genes = useSelector((s) => s.Genes);
  const dataset = useSelector((s) => s.Settings?.dataset);
  const ready = (genes?.optionsList || []).length > 0;
  const loading = !!(genes?.loadingGenesData || genes?.loading);
  useEffect(() => {
    if (!dataset || ready || loading) return;
    dispatch({ type: "FETCH_GENES_DATA_REQUEST" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataset?.reference, ready]);
  return { ready, loading };
}
