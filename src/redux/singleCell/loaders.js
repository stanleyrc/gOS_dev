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
import { hetBlocksToGraph } from "../../helpers/singleCell/hetTracks";
import { parseRnaSummary, readMatrixBuffers } from "../../helpers/singleCell/staticRna";
import { GZ_INDEX_FILE, dataRootOf, gunzipText, gzEntry, parseGzIndex, sourceIsFresh } from "../../helpers/singleCell/gzIndex";

export const casePath = (dataset, caseReportId, filename) =>
  `${dataset.dataPath}${caseReportId}/${filename}`;

/** signature_versions.json of a patient; the URL parameter sigdata=<prefix> redirects it to <prefix><patient>/ (preview of staged files). */
export function signatureVersionsPath(dataset, caseReportId) {
  let prefix = null;
  try {
    prefix = new URLSearchParams(window.location.search).get("sigdata");
  } catch (e) {
    prefix = null;
  }
  return prefix ? `${prefix}${caseReportId}/signature_versions.json` : casePath(dataset, caseReportId, "signature_versions.json");
}

// gz_index.json of each data root, fetched once (empty set when absent): which files have a .gz sibling
const gzIndexCache = new Map();
function gzIndexFor(path) {
  const root = dataRootOf(path);
  if (!root) return Promise.resolve(null);
  if (!gzIndexCache.has(root)) {
    gzIndexCache.set(
      root,
      axios
        .get(`${root}${GZ_INDEX_FILE}`, { responseType: "json" })
        .then((r) => (isMissingDataResponse(r) ? new Map() : parseGzIndex(r.data)))
        .catch(() => new Map())
    );
  }
  return gzIndexCache.get(root);
}

const sourceFreshCache = new Map();
/** HEAD of the source file: still the size / mtime the .gz was built from? (once per source) */
function sourceFresh(path, entry) {
  const root = dataRootOf(path);
  const url = `${root}${entry.source}`;
  if (!sourceFreshCache.has(url)) {
    sourceFreshCache.set(
      url,
      axios
        .head(url)
        .then((r) => sourceIsFresh(entry, r.headers))
        .catch(() => false)
    );
  }
  return sourceFreshCache.get(url);
}

/**
 * The text of path.gz gunzipped in the browser, or null. Only used when gz_index.json lists the file AND its
 * source file is unchanged since the .gz was built (HEAD size + mtime): a stale .gz is never read.
 * Returns { skip: true } for a derived file (snv_variants.json) whose source changed: it must not be read at all.
 */
async function getGzText(path, cancelToken) {
  const index = await gzIndexFor(path);
  const entry = gzEntry(index, path);
  if (!entry) return null;
  if (!(await sourceFresh(path, entry))) return entry.derived ? { skip: true } : null;
  try {
    const response = await axios.get(`${path}.gz`, { cancelToken, responseType: "arraybuffer" });
    return await gunzipText(response.data);
  } catch (error) {
    if (axios.isCancel(error)) throw error;
    return entry.derived ? { skip: true } : null;
  }
}

/** GET a file: resolves to { status: "ok", data } | { status: "missing" } | { status: "error", error }. */
export async function tryGet(path, { cancelToken, responseType = "json" } = {}) {
  try {
    if (responseType === "json" || responseType === "text") {
      const text = await getGzText(path, cancelToken);
      if (text && text.skip) return { status: "missing" }; // derived file out of date: callers fall back to the source
      if (text !== null) {
        if (responseType === "text") return { status: "ok", data: text };
        try {
          return { status: "ok", data: JSON.parse(text) };
        } catch (parseError) {
          // unreadable .gz: use the plain file
        }
      }
    }
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
 * exactly as the bulk coverage and het-SNP tracks do. inCn: the column is already copy number
 * (coverage.arrow's y is the exporter's foregroundabs), so slope / intercept are not applied again.
 */
export function arrowScatter(buffer, slope, intercept, inCn = false) {
  const table = tableFromIPC(buffer);
  const counts = Array.from(table.getChild("y").toArray());
  const hasFit = inCn || (Number.isFinite(slope) && Number.isFinite(intercept));
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
    dataPointsY1: hasFit && !inCn ? counts.map((d) => d * slope + intercept) : counts,
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

const umap3dCache = new Map();
/** A patient's rna/umap3d.json: { status: "ok", data } | { status: "missing" } | { status: "error" }, fetched once. */
export function loadUmap3d(dataset, patientId) {
  const key = `${dataset.dataPath}${patientId}`;
  if (!umap3dCache.has(key)) {
    const promise = tryGet(casePath(dataset, patientId, "rna/umap3d.json"));
    promise.then((r) => r.status === "error" && umap3dCache.delete(key), () => umap3dCache.delete(key));
    umap3dCache.set(key, promise);
  }
  return umap3dCache.get(key);
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
        return { status: "ok", data: arrowScatter(res.data, Number(slope), Number(intercept), track === "coverage") };
      }
      if (track === "hetblocks") return { status: "ok", data: dataToGenome(hetBlocksToGraph(res.data), chromoBins) };
      return { status: "ok", data: dataToGenome(allelicToGenome(res.data || { settings: {}, intervals: [], connections: [] }), chromoBins) };
    })().catch((error) => ({ status: "error", error }));
    if (trackCache.size > 400) trackCache.clear();
    trackCache.set(key, promise);
  }
  return trackCache.get(key);
}
