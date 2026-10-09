import { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { loadRnaMatrix } from "../../../redux/singleCell/loaders";
import { excludedCellIds } from "../../../helpers/singleCell/precompute";

/** RNA cell kept when "tumor cells only": linked to a non-normal clone, or (RNA-only) typed Malignant. */
export function isTumorRnaCell(cell, cloneOf) {
  if (cell.cell_id && cloneOf.has(cell.cell_id)) return !/^normal$/i.test(`${cloneOf.get(cell.cell_id) || ""}`);
  if (cell.Cell_Type != null && cell.Cell_Type !== "") return /malignant|tumou?r/i.test(`${cell.Cell_Type}`);
  return true;
}

/** Summary + sparse (gene-major CSC) matrix restricted to the given cell rows. */
export function subsetRna(summary, matrix, keepRows) {
  const keep = new Set(keepRows);
  if (keep.size === summary.cells.length) return { summary, matrix };
  const newRow = new Int32Array(summary.cells.length).fill(-1);
  const cells = [];
  summary.cells.forEach((c, k) => {
    if (keep.has(k)) {
      newRow[k] = cells.length;
      cells.push(c);
    }
  });
  const out = { ...summary, cells, nCells: cells.length };
  if (!matrix) return { summary: out, matrix: null };
  const indptr = new (matrix.indptr.constructor || Int32Array)(matrix.indptr.length);
  const indices = [];
  const data = [];
  for (let g = 0; g + 1 < matrix.indptr.length; g += 1) {
    indptr[g] = indices.length;
    for (let i = matrix.indptr[g]; i < matrix.indptr[g + 1]; i += 1) {
      const r = newRow[matrix.indices[i]];
      if (r >= 0) {
        indices.push(r);
        data.push(matrix.data[i]);
      }
    }
  }
  indptr[matrix.indptr.length - 1] = indices.length;
  return {
    summary: out,
    matrix: { ...matrix, indptr, indices: Int32Array.from(indices), data: Float32Array.from(data) },
  };
}

/**
 * The patient's static RNA (summary from the single-cell load, matrix fetched
 * once) plus helpers mapping gOS cell IDs / RNA barcodes to matrix rows.
 * With layout.rnaTumorOnly, normal / non-malignant cells are dropped from
 * both the summary and the matrix so every RNA view sees tumor cells only.
 */
export default function useRnaData() {
  const rna = useSelector((state) => state.SingleCell.rna);
  const patient = useSelector((state) => state.SingleCell.patient);
  const cells = useSelector((state) => state.SingleCell.cells);
  const tumorOnly = useSelector((state) => Boolean(state.SingleCell.layout.rnaTumorOnly));
  const dataset = useSelector((state) => state.Settings.dataset);
  const [fullMatrix, setMatrix] = useState(null);
  const [error, setError] = useState(null);
  const fullSummary = rna.status === "ok" ? rna.data : null;

  useEffect(() => {
    if (!fullSummary || !patient || !dataset) return undefined;
    let cancelled = false;
    loadRnaMatrix(dataset, patient.caseReportId)
      .then((m) => !cancelled && setMatrix(m))
      .catch((e) => !cancelled && setError(e.message || `${e}`));
    return () => {
      cancelled = true;
    };
  }, [fullSummary, patient, dataset]);

  // global cell filter (QC rules + manual exclusions) applies to RNA views too
  const qcRules = useSelector((state) => state.SingleCell.layout.qcExcludeRules);
  const manualExcluded = useSelector((state) => state.SingleCell.layout.excludedCells);
  const qcExcluded = useMemo(() => excludedCellIds(cells, qcRules, manualExcluded), [cells, qcRules, manualExcluded]);
  const { summary, matrix, excluded } = useMemo(() => {
    if (!fullSummary) return { summary: null, matrix: null, excluded: 0 };
    if (!tumorOnly && !qcExcluded.size) return { summary: fullSummary, matrix: fullMatrix, excluded: 0 };
    const cloneOf = new Map(cells.map((c) => [c.cell_id, c.clone_id]));
    const keep = fullSummary.cells
      .map((c, k) => ((!tumorOnly || isTumorRnaCell(c, cloneOf)) && !(c.cell_id && qcExcluded.has(`${c.cell_id}`)) ? k : -1))
      .filter((k) => k >= 0);
    const sub = subsetRna(fullSummary, fullMatrix, keep);
    return { ...sub, excluded: fullSummary.cells.length - keep.length };
  }, [fullSummary, fullMatrix, tumorOnly, cells, qcExcluded]);

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
  return { summary, matrix, error, rowOfId, rowsFor, excluded, tumorOnly };
}
