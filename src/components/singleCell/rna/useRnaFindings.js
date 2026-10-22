import { useEffect, useMemo, useState } from "react";
import { casePath, loadRnaMatrix, loadRnaSummary, tryGet } from "../../../redux/singleCell/loaders";
import { buildPatientReport } from "../../../helpers/singleCell/patientReport";
import { cellsForPatient } from "../../../helpers/singleCell/cellFiles";
import { rnaExpressionFindings, rnaHeadlines, rnaMetaFindings } from "../../../helpers/singleCell/rnaFindings";
import { normalizeSpliceFindings, rnaFindingCounts, rnaHeadlineItems } from "../../../helpers/singleCell/rnaHeadlineFindings";
import { normalizeFusions } from "../../../helpers/singleCell/rnaFusions";
import { CONFIDENCE_TIERS, DEFAULT_CONFIDENCE_LEVEL } from "../../../helpers/singleCell/findingConfidence";
import { useFindingConfidence } from "../confidenceToggle";

// RNA key findings of a patient ({ meta, expr, headlines, top, counts }),
// computed once per dataset / patient / driver set and shared by the report,
// the overview card and the cohort cards. meta needs only rna/cells.json;
// expr loads the matrix; top / counts are the splicing findings and tier 1–2
// fusions (rna/splicing.json, rna/fusions.json; empty when missing).
const cache = new Map();

/**
 * Splicing findings and tier 1–2 fusions of a patient: { top, counts } at the default confidence level, plus byLevel
 * ({ consistent | suggestive | low: { top, counts } }) so the views can follow the "show less confident findings" toggle.
 */
export async function loadRnaExtraFindings(dataset, patientId) {
  const [spl, fus] = await Promise.all([
    tryGet(casePath(dataset, patientId, "rna/splicing.json")).catch(() => ({ status: "error" })),
    tryGet(casePath(dataset, patientId, "rna/fusions.json")).catch(() => ({ status: "error" })),
  ]);
  const splicing = spl.status === "ok" ? normalizeSpliceFindings(spl.data?.findings) : [];
  let fusions = [];
  let nCellsRna = null;
  if (fus.status === "ok") {
    try {
      ({ fusions, nCellsRna } = normalizeFusions(fus.data));
    } catch (error) {
      fusions = [];
    }
  }
  const byLevel = Object.fromEntries(
    CONFIDENCE_TIERS.map((level) => [level, { top: rnaHeadlineItems({ splicing, fusions, nCellsRna, max: 6, level }), counts: rnaFindingCounts({ splicing, fusions, level }) }])
  );
  return { ...byLevel[DEFAULT_CONFIDENCE_LEVEL], byLevel };
}

/** RNA findings data with top / counts of the confidence level shown (data without byLevel is returned as is). */
export function atConfidence(data, level) {
  const at = data?.byLevel?.[level];
  return at ? { ...data, top: at.top, counts: at.counts } : data;
}

const driversOf = (report) => (report ? [...report.clonal, ...report.subclonal, ...report.rare] : []);

export function computeRnaFindings(dataset, patientId, cells, report) {
  const drivers = driversOf(report);
  const key = `${dataset.dataPath}${patientId}|${cells.length}|${drivers.map((d) => d.label).join(",")}`;
  if (!cache.has(key)) {
    const promise = loadRnaSummary(dataset, patientId).then(async (summary) => {
      if (!summary) return null;
      const extras = loadRnaExtraFindings(dataset, patientId).catch(() => ({ top: [], counts: { splicing: 0, fusions: 0, total: 0 } }));
      const meta = rnaMetaFindings({ rnaCells: summary.cells, cells });
      let expr = null;
      try {
        const matrix = await loadRnaMatrix(dataset, patientId);
        expr = await rnaExpressionFindings({ summary, matrix, cells, drivers });
      } catch (error) {
        expr = null; // metadata findings still stand without the matrix
      }
      const { top, counts, byLevel } = await extras;
      return { meta, expr, headlines: rnaHeadlines(meta, expr), top, counts, byLevel };
    });
    promise.catch(() => cache.delete(key));
    cache.set(key, promise);
  }
  return cache.get(key);
}

/** { status: "loading" | "ok" | "none", data } for one patient. */
export default function useRnaFindings({ dataset, patientId, cells, report }) {
  const [state, setState] = useState({ status: "loading", data: null });
  const [level] = useFindingConfidence();
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
  return useMemo(() => (state.data ? { ...state, data: atConfidence(state.data, level) } : state), [state, level]);
}

/** RNA findings of every cohort patient, one at a time: { byPatient: { id: findings }, done, total }. */
export function useCohortRnaFindings({ summaries, files, datafiles, datasets, enabled = true }) {
  const [byPatient, setByPatient] = useState({});
  const [done, setDone] = useState(0);
  const [level] = useFindingConfidence();
  const inputs = useMemo(
    () =>
      summaries.map((s) => {
        const cells = cellsForPatient(datafiles, s.patientKey);
        return {
          id: s.caseReportId,
          dataset: datasets.find((d) => `${d.id}` === `${s.record.datasetId}`) || null,
          cells,
          // drivers need the events: wait for the patient's files (a patient without events still gets its RNA findings)
          report: s.caseReportId in files ? buildPatientReport({ patient: s.caseReportId, events: files[s.caseReportId]?.events || [], cells }) : null,
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
  const of = (id) => (byPatient[id] ? { status: "ok", data: atConfidence(byPatient[id], level) } : { status: enabled && done < inputs.length ? "loading" : "none", data: null });
  return { byPatient, done, total: inputs.length, of };
}
