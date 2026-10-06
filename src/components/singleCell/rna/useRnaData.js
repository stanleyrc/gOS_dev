import { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { loadRnaMatrix } from "../../../redux/singleCell/loaders";

/**
 * The patient's static RNA (summary from the single-cell load, matrix fetched
 * once) plus helpers mapping gOS cell IDs / RNA barcodes to matrix rows.
 */
export default function useRnaData() {
  const rna = useSelector((state) => state.SingleCell.rna);
  const patient = useSelector((state) => state.SingleCell.patient);
  const dataset = useSelector((state) => state.Settings.dataset);
  const [matrix, setMatrix] = useState(null);
  const [error, setError] = useState(null);
  const summary = rna.status === "ok" ? rna.data : null;

  useEffect(() => {
    if (!summary || !patient || !dataset) return undefined;
    let cancelled = false;
    loadRnaMatrix(dataset, patient.caseReportId)
      .then((m) => !cancelled && setMatrix(m))
      .catch((e) => !cancelled && setError(e.message || `${e}`));
    return () => {
      cancelled = true;
    };
  }, [summary, patient, dataset]);

  // Every ID a cell may be referred to by -> its matrix row.
  const rowOfId = useMemo(() => {
    const map = new Map();
    (summary?.cells || []).forEach((c, k) => {
      map.set(c.displayId, k);
      map.set(c.rna_id, k);
      if (c.cell_id) map.set(c.cell_id, k);
    });
    return map;
  }, [summary]);

  const rowsFor = (ids) => [...new Set((ids || []).map((id) => rowOfId.get(id)).filter((k) => k != null))];
  return { summary, matrix, error, rowOfId, rowsFor };
}
