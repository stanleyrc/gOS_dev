// File loading for single-cell patients. Patients and cells are ordinary
// case folders under the dataset's dataPath; these helpers distinguish
// "missing" (404 or the dev server's HTML fallback) from real errors.
import axios from "axios";
import { tableFromIPC } from "apache-arrow";
import {
  isMissingDataError,
  isMissingDataResponse,
} from "../../helpers/dataAvailability";
import { splitFloat64 } from "../../helpers/utility";
import { readMatrixBuffers } from "../../helpers/singleCell/staticRna";

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
