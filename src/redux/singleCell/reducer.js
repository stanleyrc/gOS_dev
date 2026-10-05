import actions, { SC_DEFAULT_TRACKS } from "./actions";
import caseReportActions from "../caseReport/actions";

const emptySource = { status: "idle", data: null, error: null };

const initState = {
  loading: false,
  loadingPercentage: 0,
  // true when the open case is not a single-cell patient
  missing: false,
  error: null,
  patient: null, // { caseReportId, patientKey, datasetId }
  cells: [], // manifest records of the patient's cells, with cell_id / clone_id
  cloneColors: {},
  order: [], // display (row) order of cell ids
  tree: { ...emptySource, method: null },
  cn: emptySource, // { cells, rows: [{ binIndex, values } | null] }
  snv: emptySource,
  junctions: emptySource,
  // Raw per-cell files already loaded for the heatmaps, reused by the tracks.
  cellFiles: {}, // { [cellId]: { genome, mutations } }
  selectedCellIds: [],
  visibleTracks: SC_DEFAULT_TRACKS,
  heatmapType: "cn",
  snvOrder: "genomic",
  perCell: {}, // { [cellId]: { [track]: { status, data, error } } }
};

const sameIds = (a, b) => a.length === b.length && a.every((v, k) => v === b[k]);

const trackStatus = {
  [actions.SC_PER_CELL_TRACK_REQUEST]: "loading",
  [actions.SC_PER_CELL_TRACK_SUCCESS]: "ok",
  [actions.SC_PER_CELL_TRACK_MISSING]: "missing",
  [actions.SC_PER_CELL_TRACK_FAILED]: "error",
};

export default function appReducer(state = initState, action) {
  switch (action.type) {
    case caseReportActions.FETCH_CASE_REPORT_REQUEST:
    case actions.FETCH_SINGLE_CELL_DATA_REQUEST:
      return {
        ...initState,
        visibleTracks: state.visibleTracks,
        loading: action.type === actions.FETCH_SINGLE_CELL_DATA_REQUEST,
      };
    case actions.FETCH_SINGLE_CELL_DATA_PROGRESS:
      return { ...state, loadingPercentage: action.loadingPercentage };
    case actions.FETCH_SINGLE_CELL_DATA_SUCCESS:
      return {
        ...state,
        loading: false,
        loadingPercentage: 100,
        missing: false,
        error: null,
        patient: action.patient,
        cells: action.cells,
        cloneColors: action.cloneColors,
        order: action.order,
        tree: action.tree,
        cn: action.cn,
        snv: action.snv,
        junctions: action.junctions,
        cellFiles: action.cellFiles,
        selectedCellIds: action.selectedCellIds,
        heatmapType:
          action.cn.status === "ok"
            ? "cn"
            : action.snv.status === "ok"
            ? "snv"
            : "junctions",
        perCell: {},
      };
    case actions.FETCH_SINGLE_CELL_DATA_MISSING:
      return { ...initState, visibleTracks: state.visibleTracks, missing: true };
    case actions.FETCH_SINGLE_CELL_DATA_FAILED:
      return { ...initState, visibleTracks: state.visibleTracks, error: action.error };
    case actions.SC_SELECTION_UPDATED: {
      const known = new Set(state.order);
      const next = [...new Set(action.cellIds || [])].filter((id) => known.has(id));
      return sameIds(next, state.selectedCellIds) ? state : { ...state, selectedCellIds: next };
    }
    case actions.SC_VISIBLE_TRACKS_UPDATED:
      return { ...state, visibleTracks: [...(action.tracks || [])] };
    case actions.SC_HEATMAP_TYPE_UPDATED:
      return { ...state, heatmapType: action.heatmapType };
    case actions.SC_SNV_ORDER_UPDATED:
      return { ...state, snvOrder: action.snvOrder };
    case actions.SC_PER_CELL_TRACK_REQUEST:
    case actions.SC_PER_CELL_TRACK_SUCCESS:
    case actions.SC_PER_CELL_TRACK_MISSING:
    case actions.SC_PER_CELL_TRACK_FAILED: {
      if (!state.order.includes(action.cellId)) return state;
      const cellTracks = state.perCell[action.cellId] || {};
      return {
        ...state,
        perCell: {
          ...state.perCell,
          [action.cellId]: {
            ...cellTracks,
            [action.track]: {
              status: trackStatus[action.type],
              data: action.data ?? null,
              error: action.error ?? null,
            },
          },
        },
      };
    }
    default:
      return state;
  }
}
