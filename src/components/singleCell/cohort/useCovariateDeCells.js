import { useEffect, useState } from "react";
import useCohortExport from "./useCohortExport";
import { loadRna } from "./cohortRnaPanel";
import { loadRnaMatrix } from "../../../redux/singleCell/loaders";
import { geneValues } from "../../../helpers/singleCell/staticRna";

/**
 * Expression of several genes in the cells a covariate test used, per patient (indices from _cohort/rna_covariate_de_cells.json;
 * matrices loaded as in CovariateDeViolins). Returns { loading, perPatient: [{ patient, a, b, genes: { G: values } }],
 * unavailable: [{ patient, reason }], missing: [{ patient, genes }] } (genes not in a patient's matrix are listed, not guessed).
 */
export default function useCovariateDeCells({ dataset, test, genes, summaries = [], datasets = [] }) {
  const { status, data: cellsDoc } = useCohortExport(dataset, "rna_covariate_de_cells.json");
  const [state, setState] = useState({ loading: true, perPatient: [], unavailable: [], missing: [] });
  const key = (genes || []).join(",");
  useEffect(() => {
    let active = true;
    if (!test || !genes?.length) {
      setState({ loading: false, perPatient: [], unavailable: [], missing: [] });
      return undefined;
    }
    if (status === "loading") return undefined;
    setState((s) => ({ ...s, loading: true }));
    (async () => {
      const perPatient = [];
      const unavailable = [];
      const missing = [];
      for (const p of test.patients) {
        const idx = cellsDoc?.tests?.[test.id]?.[p.patient];
        const summary = summaries.find((s) => `${s.caseReportId}` === `${p.patient}`);
        const ds = summary && datasets.find((d) => `${d.id}` === `${summary.record.datasetId}`);
        if (!idx) {
          unavailable.push({ patient: p.patient, reason: cellsDoc ? "cells of this test are not in rna_covariate_de_cells.json" : "rna_covariate_de_cells.json not found" });
          continue;
        }
        if (!ds) {
          unavailable.push({ patient: p.patient, reason: "patient dataset not loaded in this session" });
          continue;
        }
        try {
          // eslint-disable-next-line no-await-in-loop
          const rna = await loadRna(ds, p.patient);
          const sm = rna?.summary;
          if (!sm) {
            unavailable.push({ patient: p.patient, reason: "rna/cells.json missing" });
            continue;
          }
          const found = [];
          const lost = [];
          genes.forEach((g) => {
            const gi = sm.geneIndex.get(g) ?? sm.geneIndex.get(g.toUpperCase());
            if (gi == null) lost.push(g);
            else found.push([g, gi]);
          });
          if (lost.length) missing.push({ patient: p.patient, genes: lost });
          if (!found.length) {
            unavailable.push({ patient: p.patient, reason: "none of the selected genes is in this patient's expression matrix" });
            continue;
          }
          // eslint-disable-next-line no-await-in-loop
          const matrix = await loadRnaMatrix(ds, p.patient);
          const vals = {};
          found.forEach(([g, gi]) => (vals[g] = geneValues(matrix, sm.cells.length, gi)));
          perPatient.push({ patient: p.patient, a: idx.a, b: idx.b, genes: vals });
        } catch (error) {
          unavailable.push({ patient: p.patient, reason: `matrix could not be loaded (${error?.message || "error"})` });
        }
      }
      if (active) setState({ loading: false, perPatient, unavailable, missing });
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [test?.id, key, status, cellsDoc, summaries.length, datasets.length]);
  return state;
}
