import actions, {
  SC_DEFAULT_LAYOUT,
  SC_DEFAULT_TRACKS,
  SC_TRACKS,
  SC_LAYOUT_STORAGE_KEY,
  SC_PALETTE_STORAGE_KEY,
} from "./actions";
import { parseHetMode } from "../../helpers/singleCell/hetTracks";
import caseReportActions from "../caseReport/actions";
import { CN_PALETTE_PRESETS, DEFAULT_CN_PALETTE, normalizePalette } from "../../helpers/singleCell/matrix";
import { groupsFromUrl, mergeGroups } from "../../helpers/singleCell/savedGroups";
import { cellsOfGroups, linkAppliesTo, readDeepLink, readViewLink, withCloneOverrides } from "../../helpers/singleCell/deepLink";
import { DEFAULT_THEME, cloneColorsForTheme } from "../../helpers/singleCell/themes";
import { parseSelection } from "../../helpers/singleCell/driverLayer";
import { splitFromSearch } from "../../helpers/singleCell/panelSplit";
import { driverLayoutFromSearch } from "../../helpers/singleCell/driverColumns";
import { junctionFocusFromSearch } from "../../helpers/singleCell/junctionFocus";
import { hideLowQcFromSearch, thresholdsFromSearch } from "../../helpers/singleCell/cellQc";
import { effectiveSignatures, sigFitMode } from "../../helpers/singleCell/signatureJoint";
import { annotationFromSearch } from "../../helpers/singleCell/cellSignatures";
import { readLayout, readPref } from "../../helpers/singleCell/viewSettingsStore";
import { withCnSource } from "../../helpers/singleCell/cnSource";

// Saved cell groups shared through the URL join the stored ones.
const withUrlGroups = (layout) => {
  const incoming = groupsFromUrl();
  const withGroups = incoming ? { ...layout, savedGroups: mergeGroups(layout.savedGroups || {}, incoming) } : layout;
  // ?drvpreset= / drvadd= / drvrm= / drvf= open the Drivers layer on that selection
  try {
    const drivers = parseSelection(window.location.search);
    const drvLayout = driverLayoutFromSearch(window.location.search);
    const withDrivers = { ...withGroups, ...(drivers ? { drivers } : {}), ...(drvLayout || {}), ...(junctionFocusFromSearch(window.location.search) || {}), ...(splitFromSearch(window.location.search) || {}) };
    // ?hidelowqc=1 / ?qcthr=mapd:0.2 open with the low-QC cells hidden (coverage QC)
    const hide = hideLowQcFromSearch(window.location.search);
    const thr = thresholdsFromSearch(window.location.search);
    return {
      ...withDrivers,
      ...annotationFromSearch(window.location.search),
      ...(hide != null ? { hideLowQc: hide } : {}),
      ...(thr ? { covQcThresholds: { ...(withDrivers.covQcThresholds || {}), ...thr } } : {}),
    };
  } catch (error) {
    return withGroups;
  }
};

const storedLayout = () => {
  try {
    // opt-in: null (the shipped defaults) unless the signed-in user turned saving on
    return withUrlGroups({ ...SC_DEFAULT_LAYOUT, ...(readLayout(SC_LAYOUT_STORAGE_KEY) || {}) });
  } catch (error) {
    return withUrlGroups({ ...SC_DEFAULT_LAYOUT });
  }
};

const storedPalette = () => {
  // ?cnpal=<preset> opens on that CN palette (not saved unless edited)
  try {
    const linked = readViewLink().cnPalette;
    if (linked && CN_PALETTE_PRESETS[linked]) return { preset: linked, ...normalizePalette(CN_PALETTE_PRESETS[linked], linked) };
  } catch (error) {
    // no window: fall through to the stored palette
  }
  try {
    const raw = readPref(SC_PALETTE_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    const preset = parsed?.preset || DEFAULT_CN_PALETTE;
    return { preset, ...normalizePalette(parsed, preset) };
  } catch (error) {
    return { preset: DEFAULT_CN_PALETTE, ...normalizePalette(null) };
  }
};

// ?tracks=total,coverage opens the cell tracks with those layers
function linkedTracks() {
  try {
    const tracks = readViewLink().tracks.filter((t) => SC_TRACKS.includes(t));
    return tracks.length ? tracks : null;
  } catch (error) {
    return null;
  }
}

function linkedHetMode() {
  try {
    return parseHetMode(readViewLink().hets);
  } catch (error) {
    return "snps";
  }
}

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
  // CN-mapped SNVs (cn_mapped_snvs.sites.json): snvFromColumnar shape + meta (method, validation), loaded on demand (layout.snvCnMapped)
  cnMapped: emptySource,
  // copy-number source (helpers/singleCell/cnSource.js): regular per-cell JaBbA or the joint junction balance (sc_cn_joint/)
  cnSource: "regular", // shown
  cnSourceRequested: "regular", // asked for (joint shows once loaded)
  cnRegular: null, // { cn, junctions, cellFiles } of the regular graphs, saved at load
  cnJoint: { status: "idle", manifest: null, data: null, error: null }, // manifest: parseJointManifest; data: { cn, junctions, genomes }
  junctions: emptySource,
  allelic: emptySource, // { cells, rows: [{ binIndex, major, minor } | null] }, loaded on demand
  rna: emptySource, // static rna/ summary: { cells, genes, fields, hasUmap }
  signatures: emptySource, // the fit the tabs read: signatures.json (legacy) or signatures_joint.json, per layout.sigFit
  signaturesLegacy: emptySource, // signatures.json: { cosmic_version, genome, sets: [{ name, n, activities }] }
  signaturesJoint: emptySource, // signatures_joint.json: patient signature set, bootstrap CIs, contrasts
  rnaFusions: emptySource, // rna/fusions.json, normalised: { patient, nCellsRna, fusions }
  rnaSplicing: emptySource, // rna/splicing.json, normalised: { variants, clusters, cellMap }
  walks: emptySource, // walks.json: { cells, walks: [{ id, label, circular, nodes, junctions, cells: { id: cn } }] }
  altTrees: emptySource, // trees/index.json: [{ name, label, source_path, n_tips, n_matched }] (the files are fetched by the Compare Trees tab)
  precompute: {}, // { manifest, qc, sphase, telomeres, calls, slices }: each { status, data } (helpers/singleCell/precompute.js)
  // Raw per-cell files already loaded for the heatmaps, reused by the tracks.
  cellFiles: {}, // { [cellId]: { genome, mutations } }
  selectedCellIds: [],
  visibleTracks: linkedTracks() || SC_DEFAULT_TRACKS,
  hetMode: linkedHetMode(), // ?hets=blocks
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
  driverFocus: null, // driverKey of the driver the driver drawer shows
  driverDrawer: null, // driverKey of the open driver drawer (Drivers heatmap layer), null = closed
  perCell: {}, // { [cellId]: { [track]: { status, data, error } } }
};

// View preferences that survive switching patients.
const preferences = (state) => ({
  visibleTracks: state.visibleTracks,
  hetMode: state.hetMode,
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
    case actions.SC_CN_MAPPED_REQUEST:
      return state.cnMapped.status === "idle" ? { ...state, cnMapped: { ...emptySource, status: "loading" } } : state;
    case actions.SC_CN_JOINT_MANIFEST_LOADED:
      return action.patient === state.patient?.caseReportId
        ? { ...state, cnJoint: { ...state.cnJoint, status: action.manifest ? "available" : "missing", manifest: action.manifest || null } }
        : state;
    case actions.SC_CN_SOURCE_UPDATED: {
      if (action.source !== "joint") return withCnSource(state, "regular");
      if (!state.cnJoint.manifest) return state;
      const next = state.cnJoint.status === "ok" ? state : { ...state, cnJoint: { ...state.cnJoint, status: state.cnJoint.status === "error" ? "error" : "loading" } };
      return withCnSource(next, "joint");
    }
    case actions.SC_CN_JOINT_LOADED: {
      if (action.patient !== state.patient?.caseReportId) return state;
      const next = { ...state, cnJoint: { ...state.cnJoint, status: action.status, data: action.data || null, error: action.error || null } };
      return next.cnSourceRequested === "joint" && action.status === "ok" ? withCnSource(next, "joint") : next;
    }
    case actions.SC_CN_MAPPED_LOADED:
      return action.patient === state.patient?.caseReportId ? { ...state, cnMapped: action.cnMapped } : state;
    case actions.FETCH_SINGLE_CELL_DATA_PROGRESS:
      return { ...state, loadingPercentage: action.loadingPercentage };
    case actions.FETCH_SINGLE_CELL_DATA_SUCCESS: {
      // a deep link (?scsel=, ?heatmap=) opens the patient on that selection / heatmap
      const link = readDeepLink();
      const linked = linkAppliesTo(link, action.patient?.caseReportId);
      const linkedCells = linked
        ? cellsOfGroups(state.layout.savedGroups?.[action.patient?.caseReportId] || [], link.groups, action.order || [])
        : [];
      const defaultHeatmap = action.cn.status === "ok" ? "cn" : action.snv.status === "ok" ? "snv" : "junctions";
      return {
        ...state,
        loading: false,
        loadingPercentage: 100,
        missing: false,
        error: null,
        patient: action.patient,
        cells: action.cells,
        // dataset colours are kept as `cloneColorsFixed`; the shown ones follow the theme
        cloneColorsFixed: action.cloneColors,
        cloneColors: withCloneOverrides(
          cloneColorsForTheme(Object.keys(action.cloneColors || {}), state.layout.theme || DEFAULT_THEME, action.cloneColors),
          linked ? readViewLink().cloneColors : {}
        ),
        order: action.order,
        tree: action.tree,
        cn: action.cn,
        snv: action.snv,
        junctions: action.junctions,
        rna: action.rna || emptySource,
        signatures: effectiveSignatures(
          action.signatures || emptySource,
          action.signaturesJoint || emptySource,
          sigFitMode(state.layout, action.signaturesJoint?.status === "ok"),
          Boolean(state.layout.sigCandidates)
        ),
        signaturesLegacy: action.signatures || emptySource,
        signaturesJoint: action.signaturesJoint || emptySource,
        walks: action.walks || emptySource,
        rnaFusions: action.rnaFusions || emptySource,
        rnaSplicing: action.rnaSplicing || emptySource,
        altTrees: action.altTrees || emptySource,
        precompute: action.precompute || {},
        cellFiles: action.cellFiles,
        cnSource: "regular",
        cnSourceRequested: "regular",
        cnRegular: { cn: action.cn, junctions: action.junctions, cellFiles: action.cellFiles },
        cnJoint: { status: "idle", manifest: null, data: null, error: null },
        selectedCellIds: linkedCells.length ? linkedCells : action.selectedCellIds,
        heatmapType: linked && link.heatmap && (link.heatmap === "drivers" || action[link.heatmap]?.status === "ok") ? link.heatmap : defaultHeatmap,
        driverDrawer: linked && link.driverOpen ? link.driverOpen : null,
        perCell: {},
      };
    }
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
    case actions.SC_HET_MODE_UPDATED:
      return { ...state, hetMode: parseHetMode(action.hetMode) };
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
    case actions.SC_CELL_FIELD_ADDED:
      return { ...state, cells: state.cells.map((c) => ({ ...c, [action.name]: action.values[c.cell_id] ?? null })) };
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
    case actions.SC_LAYOUT_UPDATED: {
      const layout = { ...state.layout, ...action.patch };
      const cloneColors =
        action.patch.theme && action.patch.theme !== state.layout.theme
          ? cloneColorsForTheme(Object.keys(state.cloneColors || {}), action.patch.theme, state.cloneColorsFixed || {})
          : state.cloneColors;
      // the Signatures fit switch (layout.sigFit) decides which file the tabs read as `signatures`
      if (("sigFit" in action.patch || "sigCandidates" in action.patch) && state.signaturesLegacy) {
        const signatures = effectiveSignatures(state.signaturesLegacy, state.signaturesJoint, sigFitMode(layout, state.signaturesJoint?.status === "ok"), Boolean(layout.sigCandidates));
        return { ...state, layout, cloneColors, signatures };
      }
      return { ...state, layout, cloneColors };
    }
    case actions.SC_PLOT_INSETS_UPDATED:
      return state.plotInsets.left === action.insets.left && state.plotInsets.right === action.insets.right
        ? state
        : { ...state, plotInsets: action.insets };
    case actions.SC_IGV_OPENED:
      return { ...state, igv: action.view };
    case actions.SC_DRIVER_FOCUS_UPDATED:
      return { ...state, driverFocus: action.key ?? null };
    case actions.SC_DRIVER_DRAWER_UPDATED:
      return { ...state, driverDrawer: action.key ?? null, driverFocus: action.key ?? state.driverFocus };
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
