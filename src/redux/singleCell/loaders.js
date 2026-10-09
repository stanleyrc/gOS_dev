// File loading for single-cell patients. Patients and cells are ordinary
// case folders under the dataset's dataPath; these helpers distinguish
// "missing" (404 or the dev server's HTML fallback) from real errors.
import axios from "axios";
import { tableFromIPC } from "apache-arrow";
import {
  isMissingDataError,
  isMissingDataResponse,
} from "../../helpers/dataAvailability";
import { allelicToGenome, dataToGenome, splitFloat64 } from "../../helpers/utility";
import { SC_FETCHED_TRACKS } from "./actions";
import { parseRnaSummary, readMatrixBuffers } from "../../helpers/singleCell/staticRna";

export const casePath = (dataset, caseReportId, filename) =>
  `${dataset.dataPath}${caseReportId}/${filename}`;

/** GET a file: resolves to { status: "ok", data } | { status: "missing" } | { status: "error", error }. */
export async function tryGet(path, { cancelToken, responseType = "json" } = {}) {
  try {
    const response = await axios.get(path, {
      cancelToken,
      responseType,
      ...(responseType === "text" ? { transformResponse: [(d) => d] } : {}),
    });
    if (isMissingDataResponse(response)) return { status: "missing" };
    if (responseType === "text" && `${response.data}`.trim().startsWith("<")) {
      return { status: "missing" };
    }
    return { status: "ok", data: response.data };
  } catch (error) {
    if (axios.isCancel(error)) throw error;
    if (isMissingDataError(error)) return { status: "missing" };
    return { status: "error", error };
  }
}

/** The two files every cell contributes to the patient heatmaps. */
export async function loadCellHeatmapFiles(dataset, cellId, cancelToken) {
  const [genome, mutations] = await Promise.all([
    tryGet(casePath(dataset, cellId, "complex.json"), { cancelToken }),
    tryGet(casePath(dataset, cellId, "mutations.json"), { cancelToken }),
  ]);
  return {
    cellId,
    genome: genome.status === "ok" ? genome.data : null,
    mutations: mutations.status === "ok" ? mutations.data : null,
    genomeError: genome.status === "error" ? genome.error : null,
  };
}

/**
 * Coverage-style Arrow file (columns x, y, color) as ScatterPlotPanel inputs.
 * y is converted to copy number with slope/intercept when both are given,
 * exactly as the bulk coverage and het-SNP tracks do.
 */
export function arrowScatter(buffer, slope, intercept) {
  const table = tableFromIPC(buffer);
  const counts = Array.from(table.getChild("y").toArray());
  const hasFit = Number.isFinite(slope) && Number.isFinite(intercept);
  const dataPointsX = Array.from(table.getChild("x").toArray());
  const dataPointsXHigh = [];
  const dataPointsXLow = [];
  dataPointsX.forEach((v) => {
    const [hi, lo] = splitFloat64(v);
    dataPointsXHigh.push(hi);
    dataPointsXLow.push(lo);
  });
  return {
    dataPointsX,
    dataPointsXHigh,
    dataPointsXLow,
    dataPointsY1: hasFit ? counts.map((d) => d * slope + intercept) : counts,
    dataPointsY2: counts,
    dataPointsColor: Array.from(table.getChild("color").toArray()),
    hasFit,
  };
}

const rnaSummaryCache = new Map();
/** A patient's rna/cells.json + genes.tsv parsed (null when the patient has no RNA), fetched once. */
export async function loadRnaSummary(dataset, patientId) {
  const key = `${dataset.dataPath}${patientId}`;
  if (!rnaSummaryCache.has(key)) {
    const promise = Promise.all([
      tryGet(casePath(dataset, patientId, "rna/cells.json")),
      tryGet(casePath(dataset, patientId, "rna/genes.tsv"), { responseType: "text" }),
    ]).then(([cells, genes]) => (cells.status === "ok" && genes.status === "ok" ? parseRnaSummary(cells.data, genes.data) : null));
    promise.catch(() => rnaSummaryCache.delete(key));
    rnaSummaryCache.set(key, promise);
  }
  return rnaSummaryCache.get(key);
}

const rnaMatrixCache = new Map();
/** A patient's rna/ expression matrix (about 6 MB for hundreds of cells), fetched once. */
export async function loadRnaMatrix(dataset, patientId) {
  const key = `${dataset.dataPath}${patientId}`;
  if (!rnaMatrixCache.has(key)) {
    const get = (name) =>
      axios
        .get(casePath(dataset, patientId, `rna/${name}`), { responseType: "arraybuffer" })
        .then((r) => r.data);
    const promise = Promise.all([
      get("matrix.indptr.i32"),
      get("matrix.indices.i32"),
      get("matrix.data.f32"),
    ]).then(([indptr, indices, data]) => readMatrixBuffers(indptr, indices, data));
    promise.catch(() => rnaMatrixCache.delete(key));
    rnaMatrixCache.set(key, promise);
  }
  return rnaMatrixCache.get(key);
}

const trackCache = new Map();
/**
 * One track of one cell, converted for the plots, outside the saga (cohort
 * views where the patient is not the open case). track: total | coverage |
 * allelic | hetsnps | mutations. Resolves { status: "ok" | "missing" | "error", data?, error? }.
 */
export async function loadCellTrack(dataset, cellId, track, chromoBins) {
  const key = `${dataset.id}/${cellId}/${track}`;
  if (!trackCache.has(key)) {
    const promise = (async () => {
      const filename = track === "total" ? "complex.json" : track === "mutations" ? "mutations.json" : SC_FETCHED_TRACKS[track];
      if (!filename) return { status: "missing" };
      const arrow = filename.endsWith(".arrow");
      const res = await tryGet(casePath(dataset, cellId, filename), { responseType: arrow ? "arraybuffer" : "json" });
      if (res.status !== "ok") return res;
      if (track === "total" || track === "mutations") return { status: "ok", data: res.data || { settings: {}, intervals: [], connections: [] } };
      if (arrow) {
        const meta = await tryGet(casePath(dataset, cellId, "metadata.json"));
        const record = meta.status === "ok" ? (Array.isArray(meta.data) ? meta.data[0] : meta.data) || {} : {};
        const [slope, intercept] = track === "coverage" ? [record.cov_slope, record.cov_intercept] : [record.hets_slope, record.hets_intercept];
        return { status: "ok", data: arrowScatter(res.data, Number(slope), Number(intercept)) };
      }
      return { status: "ok", data: dataToGenome(allelicToGenome(res.data || { settings: {}, intervals: [], connections: [] }), chromoBins) };
    })().catch((error) => ({ status: "error", error }));
    if (trackCache.size > 400) trackCache.clear();
    trackCache.set(key, promise);
  }
  return trackCache.get(key);
}
