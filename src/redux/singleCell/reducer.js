import actions, {
  SC_DEFAULT_LAYOUT,
  SC_DEFAULT_TRACKS,
  SC_LAYOUT_STORAGE_KEY,
  SC_PALETTE_STORAGE_KEY,
} from "./actions";
import caseReportActions from "../caseReport/actions";
import { DEFAULT_CN_PALETTE, normalizePalette } from "../../helpers/singleCell/matrix";

const storedLayout = () => {
  try {
    const raw = window.localStorage.getItem(SC_LAYOUT_STORAGE_KEY);
    return { ...SC_DEFAULT_LAYOUT, ...(raw ? JSON.parse(raw) : {}) };
  } catch (error) {
    return { ...SC_DEFAULT_LAYOUT };
  }
};

const storedPalette = () => {
  try {
    const raw = window.localStorage.getItem(SC_PALETTE_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    const preset = parsed?.preset || DEFAULT_CN_PALETTE;
    return { preset, ...normalizePalette(parsed, preset) };
  } catch (error) {
    return { preset: DEFAULT_CN_PALETTE, ...normalizePalette(null) };
  }
};

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
  allelic: emptySource, // { cells, rows: [{ binIndex, major, minor } | null] }, loaded on demand
  rna: emptySource, // static rna/ summary: { cells, genes, fields, hasUmap }
  signatures: emptySource, // signatures.json: { cosmic_version, genome, sets: [{ name, n, activities }] }
  // Raw per-cell files already loaded for the heatmaps, reused by the tracks.
  cellFiles: {}, // { [cellId]: { genome, mutations } }
  selectedCellIds: [],
  visibleTracks: SC_DEFAULT_TRACKS,
  heatmapType: "cn",
  snvOrder: "tree",
  snvMetric: "vaf",
  cnMode: "total",
  palette: storedPalette(),
  sidePanel: true,
  hoveredCellId: null,
  layout: storedLayout(),
  plotInsets: { left: 0, right: 0 },
  igv: null, // { cellIds, chromosome, position, label }
  perCell: {}, // { [cellId]: { [track]: { status, data, error } } }
};

// View preferences that survive switching patients.
const preferences = (state) => ({
  visibleTracks: state.visibleTracks,
  snvMetric: state.snvMetric,
  palette: state.palette,
  sidePanel: state.sidePanel,
  layout: state.layout,
  plotInsets: state.plotInsets,
});

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
        ...preferences(state),
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
        rna: action.rna || emptySource,
        signatures: action.signatures || emptySource,
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
      return { ...initState, ...preferences(state), missing: true };
    case actions.FETCH_SINGLE_CELL_DATA_FAILED:
      return { ...initState, ...preferences(state), error: action.error };
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
    case actions.SC_SNV_METRIC_UPDATED:
      return { ...state, snvMetric: action.snvMetric };
    case actions.SC_CN_MODE_UPDATED:
      return {
        ...state,
        cnMode: action.cnMode,
        allelic:
          action.cnMode !== "total" && state.allelic.status === "idle"
            ? { ...emptySource, status: "loading" }
            : state.allelic,
      };
    case actions.SC_ALLELIC_LOADED:
      return { ...state, allelic: action.allelic };
    case actions.SC_ALLELIC_FAILED:
      return { ...state, allelic: { status: "error", data: null, error: action.error } };
    case actions.SC_PALETTE_UPDATED: {
      const preset = action.palette?.preset || state.palette.preset;
      return { ...state, palette: { preset, ...normalizePalette(action.palette, preset) } };
    }
    case actions.SC_SIDE_PANEL_UPDATED:
      return { ...state, sidePanel: Boolean(action.visible) };
    case actions.SC_RNA_FIELD_ADDED: {
      if (state.rna.status !== "ok") return state;
      const summary = state.rna.data;
      const cells = summary.cells.map((c) => ({ ...c, [action.name]: action.values[c.displayId] ?? null }));
      const levels = action.numeric
        ? null
        : [...new Set(Object.values(action.values).filter((v) => v != null).map(String))].sort((a, b) =>
            a.localeCompare(b, undefined, { numeric: true })
          );
      const fields = [
        ...summary.fields.filter((f) => f.name !== action.name),
        { name: action.name, numeric: Boolean(action.numeric), levels },
      ];
      return { ...state, rna: { ...state.rna, data: { ...summary, cells, fields } } };
    }
    case actions.SC_LAYOUT_UPDATED:
      return { ...state, layout: { ...state.layout, ...action.patch } };
    case actions.SC_PLOT_INSETS_UPDATED:
      return state.plotInsets.left === action.insets.left && state.plotInsets.right === action.insets.right
        ? state
        : { ...state, plotInsets: action.insets };
    case actions.SC_IGV_OPENED:
      return { ...state, igv: action.view };
    case actions.SC_IGV_CLOSED:
      return { ...state, igv: null };
    case actions.SC_HOVER_UPDATED:
      return state.hoveredCellId === (action.cellId ?? null)
        ? state
        : { ...state, hoveredCellId: action.cellId ?? null };
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
