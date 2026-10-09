import { all, call, put, select, takeEvery, takeLatest } from "redux-saga/effects";
import axios from "axios";
import actions, {
  SC_FETCH_CONCURRENCY,
  SC_FETCHED_TRACKS,
  SC_MAX_TRACK_CELLS,
  SC_LAYOUT_STORAGE_KEY,
  SC_PALETTE_STORAGE_KEY,
} from "./actions";
import { arrowScatter, casePath, loadCellHeatmapFiles, tryGet } from "./loaders";
import { getCancelToken } from "../../helpers/cancelToken";
import { loadConfiguredManifestsWithStatus } from "../../helpers/staticManifests";
import { parseNewick, treeForCells } from "../../helpers/singleCell/newick";
import { cloneColorMap, defaultCellOrder } from "../../helpers/singleCell/matrix";
import {
  allelicRowFromAllelic,
  cellsForPatient,
  cnRowFromGenome,
  entryType,
  junctionsFromGenomes,
  patientKeyOf,
  snvFromMutations,
  snvFromSparse,
} from "../../helpers/singleCell/cellFiles";
import { parseRnaSummary } from "../../helpers/singleCell/staticRna";
import {
  cnDistances,
  hasInformativeSnvs,
  snvDistances,
  upgma,
} from "../../helpers/singleCell/phylogeny";
import { allelicToGenome, dataToGenome } from "../../helpers/utility";

const getState = (state) => state;
// Above this many cells, skip on-the-fly tree inference (O(n^2) distances).
const MAX_INFERRED_TREE_CELLS = 3000;

const ok = (data) => ({ status: "ok", data, error: null });
const missing = () => ({ status: "missing", data: null, error: null });
const failed = (error) => ({ status: "error", data: null, error });
const attempt = (fn) => {
  try {
    return ok(fn());
  } catch (error) {
    return failed(error);
  }
};

function* manifestRecords(dataset) {
  const state = yield select(getState);
  const { recordsByDataset } = yield call(
    loadConfiguredManifestsWithStatus,
    [dataset],
    state.CaseReports.manifestRecordsByDataset || {}
  );
  return recordsByDataset[`${dataset.id}`] || Object.values(recordsByDataset)[0] || [];
}

/** Tree from the patient's tree.nwk, else inferred from SNVs, else from copy number. */
function buildTree(treeFile, cellIds, snv, cn, genomeLength) {
  if (treeFile.status === "ok") {
    try {
      // Keep the parsed tree (source) so views can re-prune it, e.g. to hide clones.
      const source = parseNewick(treeFile.data);
      const built = treeForCells(source, cellIds);
      if (built.layout) return { ...ok({ ...built, source }), method: "file" };
    } catch (error) {
      // fall through to inference, but keep the parse error visible
      const inferred = buildTree(missing(), cellIds, snv, cn, genomeLength);
      return { ...inferred, error, fileError: true };
    }
  }
  if (cellIds.length < 2 || cellIds.length > MAX_INFERRED_TREE_CELLS) {
    return { ...missing(), method: null };
  }
  if (snv.status === "ok" && hasInformativeSnvs(snv.data)) {
    const root = upgma(snvDistances(snv.data), cellIds);
    return { ...ok({ ...treeForCells(root, cellIds), source: root }), method: "snv" };
  }
  if (cn.status === "ok" && cn.data.rows.some(Boolean)) {
    const root = upgma(cnDistances(cn.data.rows, genomeLength), cellIds);
    return { ...ok({ ...treeForCells(root, cellIds), source: root }), method: "cn" };
  }
  return { ...missing(), method: null };
}

function* fetchSingleCellData(action = {}) {
  const state = yield select(getState);
  const { dataset, chromoBins, genomeLength } = state.Settings;
  const id = action.caseReportId ?? state.CaseReport.id;
  const metadata = `${id}` === `${state.CaseReport.id}` ? state.CaseReport.metadata : undefined;
  if (!dataset || !id) return;
  const cancelToken = getCancelToken();

  try {
    const records = yield call(manifestRecords, dataset);
    const own = records.find((r) => `${r.caseReportId ?? r.pair}` === `${id}`) || {};
    const isPatient =
      entryType(metadata) === "patient" || entryType(own) === "patient";
    if (!isPatient) {
      yield put({ type: actions.FETCH_SINGLE_CELL_DATA_MISSING });
      return;
    }
    const patientKey =
      patientKeyOf({ ...own, ...metadata, entry_type: "patient", pair: id }) || `${id}`;
    const cells = cellsForPatient(records, patientKey);
    const cellIds = cells.map((c) => c.cell_id);

    // Per-cell complex.json + mutations.json, a few cells at a time.
    // Patient-level files: tree, optional SNV matrix (reads at every site,
    // pgv sparse format) and the static RNA summary from export_seurat.R.
    const [treeFile, snvMatrixFile, rnaCellsFile, rnaGenesFile, signaturesFile, walksFile] = yield all([
      call(tryGet, casePath(dataset, id, "tree.nwk"), { cancelToken, responseType: "text" }),
      call(tryGet, casePath(dataset, id, "snv_matrix.json"), { cancelToken }),
      call(tryGet, casePath(dataset, id, "rna/cells.json"), { cancelToken }),
      call(tryGet, casePath(dataset, id, "rna/genes.tsv"), { cancelToken, responseType: "text" }),
      // SigProfilerAssignment fits of preset SNV sets (skilift / gos_sc_upload.R)
      call(tryGet, casePath(dataset, id, "signatures.json"), { cancelToken }),
      // ecDNA / amplicon walks with per-cell copy numbers (skilift sc_export_walks)
      call(tryGet, casePath(dataset, id, "walks.json"), { cancelToken }),
    ]);
    const cellFiles = {};
    const genomeErrors = [];
    for (let k = 0; k < cellIds.length; k += SC_FETCH_CONCURRENCY) {
      const batch = cellIds.slice(k, k + SC_FETCH_CONCURRENCY);
      const results = yield all(
        batch.map((cellId) => call(loadCellHeatmapFiles, dataset, cellId, cancelToken))
      );
      results.forEach((r) => {
        cellFiles[r.cellId] = { genome: r.genome, mutations: r.mutations };
        if (r.genomeError) genomeErrors.push(r.cellId);
      });
      yield put({
        type: actions.FETCH_SINGLE_CELL_DATA_PROGRESS,
        loadingPercentage: Math.round((100 * (k + batch.length)) / Math.max(1, cellIds.length)),
      });
    }

    const genomes = {};
    const mutations = {};
    cellIds.forEach((cellId) => {
      if (cellFiles[cellId].genome) genomes[cellId] = cellFiles[cellId].genome;
      if (cellFiles[cellId].mutations) mutations[cellId] = cellFiles[cellId].mutations;
    });

    const anyGenome = Object.keys(genomes).length > 0;
    const anyMutations = Object.keys(mutations).length > 0;
    const cn = anyGenome
      ? attempt(() => ({
          cells: cellIds,
          rows: cellIds.map((cellId) =>
            genomes[cellId] ? cnRowFromGenome(genomes[cellId], chromoBins) : null
          ),
          failedCells: genomeErrors,
        }))
      : missing();
    const junctionsRaw = anyGenome
      ? attempt(() => junctionsFromGenomes(cellIds, genomes, chromoBins))
      : missing();
    const junctions =
      junctionsRaw.status === "ok" && junctionsRaw.data.junctions.length === 0
        ? missing()
        : junctionsRaw;
    const snvRaw =
      snvMatrixFile.status === "ok"
        ? attempt(() => snvFromSparse(snvMatrixFile.data, cellIds, chromoBins))
        : anyMutations
        ? attempt(() => snvFromMutations(cellIds, mutations, chromoBins))
        : missing();
    const rna =
      rnaCellsFile.status === "ok" && rnaGenesFile.status === "ok"
        ? attempt(() => parseRnaSummary(rnaCellsFile.data, rnaGenesFile.data))
        : missing();
    const snv =
      snvRaw.status === "ok" && snvRaw.data.variants.length === 0 ? missing() : snvRaw;

    const tree = buildTree(treeFile, cellIds, snv, cn, genomeLength);
    let order = defaultCellOrder(cells);
    if (tree.status === "ok") {
      const unplaced = new Set(tree.data.unplaced);
      order = [...tree.data.layout.leaves, ...order.filter((c) => unplaced.has(c))];
    }

    yield put({
      type: actions.FETCH_SINGLE_CELL_DATA_SUCCESS,
      patient: { caseReportId: `${id}`, patientKey, datasetId: `${dataset.id}` },
      cells,
      cloneColors: cloneColorMap(cells, metadata?.clones || own.clones || []),
      order,
      tree,
      cn,
      snv,
      junctions,
      rna,
      signatures: signaturesFile.status === "ok" ? signaturesFile : missing(),
      walks: walksFile.status === "ok" ? walksFile : missing(),
      cellFiles,
      selectedCellIds: [],
    });
  } catch (error) {
    if (axios.isCancel(error)) return;
    yield put({ type: actions.FETCH_SINGLE_CELL_DATA_FAILED, error });
  }
}

/** Fetch per-cell files for selected cells and toggled tracks not yet loaded. */
function* ensurePerCellTracks() {
  const { SingleCell } = yield select(getState);
  if (SingleCell.loading || SingleCell.missing) return;
  const cells = SingleCell.selectedCellIds.slice(0, SC_MAX_TRACK_CELLS);
  const tracks = SingleCell.visibleTracks.filter((t) => SC_FETCHED_TRACKS[t]);
  const requests = [];
  cells.forEach((cellId) =>
    tracks.forEach((track) => {
      if (!SingleCell.perCell[cellId]?.[track]) {
        requests.push(put(actions.requestPerCellTrack(cellId, track)));
      }
    })
  );
  if (requests.length) yield all(requests);
}

const cellMetadataCache = new Map();
function* cellMetadata(dataset, cellId, cancelToken) {
  const key = `${dataset.id}/${cellId}`;
  if (!cellMetadataCache.has(key)) {
    const res = yield call(tryGet, casePath(dataset, cellId, "metadata.json"), { cancelToken });
    const record = res.status === "ok" ? (Array.isArray(res.data) ? res.data[0] : res.data) : null;
    if (cellMetadataCache.size > 500) cellMetadataCache.clear();
    cellMetadataCache.set(key, record || {});
  }
  return cellMetadataCache.get(key);
}

function* fetchPerCellTrack(action) {
  const { cellId, track } = action;
  const state = yield select(getState);
  const { dataset, chromoBins } = state.Settings;
  const filename = SC_FETCHED_TRACKS[track];
  if (!dataset || !filename) return;
  const cancelToken = getCancelToken();
  const done = (type, extra = {}) => put({ type, cellId, track, ...extra });

  try {
    const arrow = filename.endsWith(".arrow");
    const res = yield call(tryGet, casePath(dataset, cellId, filename), {
      cancelToken,
      responseType: arrow ? "arraybuffer" : "json",
    });
    if (res.status === "missing") {
      yield done(actions.SC_PER_CELL_TRACK_MISSING);
      return;
    }
    if (res.status === "error") {
      yield done(actions.SC_PER_CELL_TRACK_FAILED, { error: res.error });
      return;
    }
    let data;
    if (arrow) {
      const meta = yield call(cellMetadata, dataset, cellId, cancelToken);
      const [slope, intercept] =
        track === "coverage"
          ? [meta.cov_slope, meta.cov_intercept]
          : [meta.hets_slope, meta.hets_intercept];
      data = arrowScatter(res.data, Number(slope), Number(intercept));
    } else {
      const raw = res.data || { settings: {}, intervals: [], connections: [] };
      data = dataToGenome(allelicToGenome(raw), chromoBins);
    }
    yield done(actions.SC_PER_CELL_TRACK_SUCCESS, { data });
  } catch (error) {
    if (axios.isCancel(error)) return;
    yield done(actions.SC_PER_CELL_TRACK_FAILED, { error });
  }
}

/** Each cell's allelic.json as major/minor rows, fetched the first time a non-total CN mode is shown. */
function* loadAllelic() {
  const state = yield select(getState);
  const { SingleCell } = state;
  const { dataset, chromoBins } = state.Settings;
  if (SingleCell.cnMode === "total" || SingleCell.allelic.status !== "loading" || !dataset) return;
  const cellIds = SingleCell.cells.map((c) => c.cell_id);
  const cancelToken = getCancelToken();
  try {
    const rows = [];
    for (let k = 0; k < cellIds.length; k += SC_FETCH_CONCURRENCY) {
      const batch = cellIds.slice(k, k + SC_FETCH_CONCURRENCY);
      const results = yield all(
        batch.map((cellId) => call(tryGet, casePath(dataset, cellId, "allelic.json"), { cancelToken }))
      );
      results.forEach((r) => {
        rows.push(r.status === "ok" ? allelicRowFromAllelic(r.data, chromoBins) : null);
      });
    }
    const loaded = rows.some(Boolean)
      ? { status: "ok", data: { cells: cellIds, rows }, error: null }
      : { status: "missing", data: null, error: null };
    yield put({ type: actions.SC_ALLELIC_LOADED, allelic: loaded });
  } catch (error) {
    if (axios.isCancel(error)) return;
    yield put({ type: actions.SC_ALLELIC_FAILED, error });
  }
}

function* persistPalette() {
  const { SingleCell } = yield select(getState);
  try {
    window.localStorage.setItem(SC_PALETTE_STORAGE_KEY, JSON.stringify(SingleCell.palette));
  } catch (error) {
    // storage unavailable (private window): keep the in-memory palette only
  }
}

function* persistLayout() {
  const { SingleCell } = yield select(getState);
  try {
    window.localStorage.setItem(SC_LAYOUT_STORAGE_KEY, JSON.stringify(SingleCell.layout));
  } catch (error) {
    // storage unavailable: keep the in-memory layout only
  }
}

function* actionWatcher() {
  yield takeLatest(actions.SC_LAYOUT_UPDATED, persistLayout);
  yield takeLatest(actions.SC_CN_MODE_UPDATED, loadAllelic);
  yield takeLatest(actions.SC_PALETTE_UPDATED, persistPalette);
  yield takeLatest(actions.FETCH_SINGLE_CELL_DATA_REQUEST, fetchSingleCellData);
  yield takeEvery(
    [
      actions.FETCH_SINGLE_CELL_DATA_SUCCESS,
      actions.SC_SELECTION_UPDATED,
      actions.SC_VISIBLE_TRACKS_UPDATED,
    ],
    ensurePerCellTracks
  );
  yield takeEvery(actions.SC_PER_CELL_TRACK_REQUEST, fetchPerCellTrack);
}

export default function* rootSaga() {
  yield all([actionWatcher()]);
}
