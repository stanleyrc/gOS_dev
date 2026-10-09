import { useEffect, useMemo, useState } from "react";
import { loadRnaMatrix, loadRnaSummary } from "../../../redux/singleCell/loaders";
import { buildPatientReport } from "../../../helpers/singleCell/patientReport";
import { cellsForPatient } from "../../../helpers/singleCell/cellFiles";
import { rnaExpressionFindings, rnaHeadlines, rnaMetaFindings } from "../../../helpers/singleCell/rnaFindings";

// RNA key findings of a patient ({ meta, expr, headlines }), computed once per
// dataset / patient / driver set and shared by the report, the overview card
// and the cohort cards. meta needs only rna/cells.json; expr loads the matrix.
const cache = new Map();

const driversOf = (report) => (report ? [...report.clonal, ...report.subclonal, ...report.rare] : []);

export function computeRnaFindings(dataset, patientId, cells, report) {
  const drivers = driversOf(report);
  const key = `${dataset.dataPath}${patientId}|${cells.length}|${drivers.map((d) => d.label).join(",")}`;
  if (!cache.has(key)) {
    const promise = loadRnaSummary(dataset, patientId).then(async (summary) => {
      if (!summary) return null;
      const meta = rnaMetaFindings({ rnaCells: summary.cells, cells });
      let expr = null;
      try {
        const matrix = await loadRnaMatrix(dataset, patientId);
        expr = await rnaExpressionFindings({ summary, matrix, cells, drivers });
      } catch (error) {
        expr = null; // metadata findings still stand without the matrix
      }
      return { meta, expr, headlines: rnaHeadlines(meta, expr) };
    });
    promise.catch(() => cache.delete(key));
    cache.set(key, promise);
  }
  return cache.get(key);
}

/** { status: "loading" | "ok" | "none", data } for one patient. */
export default function useRnaFindings({ dataset, patientId, cells, report }) {
  const [state, setState] = useState({ status: "loading", data: null });
  const driverKey = driversOf(report).map((d) => d.label).join(",");
  useEffect(() => {
    if (!dataset || !patientId || !cells?.length) {
      setState({ status: "none", data: null });
      return undefined;
    }
    let active = true;
    setState((s) => ({ status: "loading", data: s.data }));
    computeRnaFindings(dataset, patientId, cells, report)
      .then((data) => active && setState({ status: data ? "ok" : "none", data }))
      .catch(() => active && setState({ status: "none", data: null }));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataset, patientId, cells, driverKey]);
  return state;
}

/** RNA findings of every cohort patient, one at a time: { byPatient: { id: findings }, done, total }. */
export function useCohortRnaFindings({ summaries, files, datafiles, datasets, enabled = true }) {
  const [byPatient, setByPatient] = useState({});
  const [done, setDone] = useState(0);
  const inputs = useMemo(
    () =>
      summaries.map((s) => {
        const cells = cellsForPatient(datafiles, s.patientKey);
        return {
          id: s.caseReportId,
          dataset: datasets.find((d) => `${d.id}` === `${s.record.datasetId}`) || null,
          cells,
          // drivers need the events; wait for them so the dosage tests run once
          report: files[s.caseReportId]?.events ? buildPatientReport({ patient: s.caseReportId, events: files[s.caseReportId].events, cells }) : null,
        };
      }),
    [summaries, files, datafiles, datasets]
  );
  const key = inputs.map((x) => `${x.id}:${x.report ? driversOf(x.report).length : "-"}`).join("|");
  useEffect(() => {
    if (!enabled) return undefined;
    let active = true;
    (async () => {
      const out = {};
      let n = 0;
      for (const x of inputs) {
        if (x.dataset && x.cells.length && x.report) {
          // eslint-disable-next-line no-await-in-loop
          out[x.id] = await computeRnaFindings(x.dataset, x.id, x.cells, x.report).catch(() => null);
        }
        n += 1;
        if (!active) return;
        setByPatient({ ...out });
        setDone(n);
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);
  /** { status, data } of one patient, as PatientReportCard / PatientCardBody take it. */
  const of = (id) => (byPatient[id] ? { status: "ok", data: byPatient[id] } : { status: enabled && done < inputs.length ? "loading" : "none", data: null });
  return { byPatient, done, total: inputs.length, of };
}
