// Tracks shown for each selected cell. Coverage and total CN are on by
// default; the others are toggles. All come from the cell's own case folder.
export const SC_TRACKS = ["total", "coverage", "allelic", "hetsnps", "mutations"];
// Only total CN by default: coverage files are large (~30 MB per cell).
export const SC_DEFAULT_TRACKS = ["total"];
// Tracks fetched on demand when a cell is selected (total CN and SNVs are
// already loaded for the heatmaps).
export const SC_FETCHED_TRACKS = {
  coverage: "coverage.arrow",
  allelic: "allelic.json",
  hetsnps: "hetsnps.arrow",
};
// Each coverage/het-SNP plot is its own WebGL canvas; browsers cap live contexts.
export const SC_MAX_TRACK_CELLS = 6;
// Cells fetched in parallel while building the patient view.
export const SC_FETCH_CONCURRENCY = 8;
// Browser-local copy-number colour choices.
export const SC_PALETTE_STORAGE_KEY = "gos.singleCell.cnPalette";
export const SC_LAYOUT_STORAGE_KEY = "gos.singleCell.layout";
// Layout preferences: tree width (px), heatmap row height ("auto" or px per
// row), and whether the UMAP and cell table show in the Single-Cell tab.
// clipBranches shortens outlier branches (e.g. a normal outgroup) so tumour
// structure stays visible; hiddenClones drops those clones from the tree and
// heatmap; igvSync zooms every genome view to the site IGV shows.
export const SC_DEFAULT_LAYOUT = {
  treeWidth: 220,
  rowHeight: "auto",
  showUmap: false,
  showCellTable: false,
  clipBranches: true,
  hiddenClones: [],
  igvSync: true,
  heatmapHeight: null, // px; null = from rowHeight
  navHeight: 240, // px of the gene + cytoband tracks above the heatmap
  showGenePanel: true, // expression of the RNA tab's picked genes beside the heatmap
  pinnedGenes: [], // genes marked across the heatmap and cell tracks
  annotationFields: ["state", "Region_Annotation"], // cell metadata strips beside the clone strip
  keepGeneTrack: false, // keep the gene track in the pinned navigation while scrolling
  sideWidth: null, // px of the mutation panel beside the CN heatmap (null = auto)
  geneWidth: null, // px of the gene expression panel (null = auto)
  snvCategories: null, // SNV sites shown, by where they map on the tree (null = all)
  snvCellphyOnly: false, // only the sites CellPhy built the tree from
  snvDriversOnly: false, // only OncoKB driver sites
  stripWidth: 14, // px per annotation strip beside the heatmaps (clone, state, region, ...)
  snvSiteIds: null, // only these SNV sites (e.g. picked in Filtered Events); null = no restriction
  showSignatures: true, // SBS signature panel below the heatmap
  theme: "tableau", // categorical colour theme (helpers/singleCell/themes.js)
  branchSnvs: false, // SNV counts on the tree branches
};

const actions = {
  FETCH_SINGLE_CELL_DATA_REQUEST: "FETCH_SINGLE_CELL_DATA_REQUEST",
  FETCH_SINGLE_CELL_DATA_PROGRESS: "FETCH_SINGLE_CELL_DATA_PROGRESS",
  FETCH_SINGLE_CELL_DATA_SUCCESS: "FETCH_SINGLE_CELL_DATA_SUCCESS",
  FETCH_SINGLE_CELL_DATA_FAILED: "FETCH_SINGLE_CELL_DATA_FAILED",
  FETCH_SINGLE_CELL_DATA_MISSING: "FETCH_SINGLE_CELL_DATA_MISSING",

  SC_SELECTION_UPDATED: "SC_SELECTION_UPDATED",
  SC_VISIBLE_TRACKS_UPDATED: "SC_VISIBLE_TRACKS_UPDATED",
  SC_HEATMAP_TYPE_UPDATED: "SC_HEATMAP_TYPE_UPDATED",
  SC_SNV_ORDER_UPDATED: "SC_SNV_ORDER_UPDATED",
  SC_SNV_METRIC_UPDATED: "SC_SNV_METRIC_UPDATED",
  SC_CN_MODE_UPDATED: "SC_CN_MODE_UPDATED",
  SC_ALLELIC_LOADED: "SC_ALLELIC_LOADED",
  SC_ALLELIC_FAILED: "SC_ALLELIC_FAILED",
  SC_PALETTE_UPDATED: "SC_PALETTE_UPDATED",
  SC_SIDE_PANEL_UPDATED: "SC_SIDE_PANEL_UPDATED",
  SC_HOVER_UPDATED: "SC_HOVER_UPDATED",
  SC_LAYOUT_UPDATED: "SC_LAYOUT_UPDATED",
  SC_RNA_FIELD_ADDED: "SC_RNA_FIELD_ADDED",
  SC_CELL_FIELD_ADDED: "SC_CELL_FIELD_ADDED",
  SC_PLOT_INSETS_UPDATED: "SC_PLOT_INSETS_UPDATED",
  SC_IGV_OPENED: "SC_IGV_OPENED",
  SC_IGV_CLOSED: "SC_IGV_CLOSED",

  SC_PER_CELL_TRACK_REQUEST: "SC_PER_CELL_TRACK_REQUEST",
  SC_PER_CELL_TRACK_SUCCESS: "SC_PER_CELL_TRACK_SUCCESS",
  SC_PER_CELL_TRACK_MISSING: "SC_PER_CELL_TRACK_MISSING",
  SC_PER_CELL_TRACK_FAILED: "SC_PER_CELL_TRACK_FAILED",

  // caseReportId: load another patient than the open case report (cohort figures)
  fetchSingleCellData: (caseReportId) => ({ type: actions.FETCH_SINGLE_CELL_DATA_REQUEST, caseReportId }),
  updateSelection: (cellIds) => ({
    type: actions.SC_SELECTION_UPDATED,
    cellIds,
  }),
  updateVisibleTracks: (tracks) => ({
    type: actions.SC_VISIBLE_TRACKS_UPDATED,
    tracks,
  }),
  updateHeatmapType: (heatmapType) => ({
    type: actions.SC_HEATMAP_TYPE_UPDATED,
    heatmapType,
  }),
  updateSnvOrder: (snvOrder) => ({
    type: actions.SC_SNV_ORDER_UPDATED,
    snvOrder,
  }),
  updateSnvMetric: (snvMetric) => ({ type: actions.SC_SNV_METRIC_UPDATED, snvMetric }),
  /** "total" | "major" | "minor"; major/minor load each cell's allelic.json on first use. */
  updateCnMode: (cnMode) => ({ type: actions.SC_CN_MODE_UPDATED, cnMode }),
  /** palette: { preset, total: [hex], allelic: [hex], missing: hex } */
  updatePalette: (palette) => ({ type: actions.SC_PALETTE_UPDATED, palette }),
  updateSidePanel: (visible) => ({ type: actions.SC_SIDE_PANEL_UPDATED, visible }),
  /** Cell under the pointer in any linked view (heatmap, tree, UMAP), or null. */
  updateHover: (cellId) => ({ type: actions.SC_HOVER_UPDATED, cellId }),
  /** patch of SC_DEFAULT_LAYOUT keys; saved in this browser */
  updateLayout: (patch) => ({ type: actions.SC_LAYOUT_UPDATED, patch }),
  /** Add (or replace) a computed RNA metadata field, e.g. k-means clusters: values keyed by RNA displayId. */
  addRnaField: (name, values, numeric = false) => ({ type: actions.SC_RNA_FIELD_ADDED, name, values, numeric }),
  /** Add a categorical field to the DNA cells (values keyed by cell id), e.g. carriers of an event. */
  addCellField: (name, values) => ({ type: actions.SC_CELL_FIELD_ADDED, name, values }),
  /** Pixels between the heatmap card's content edges and its genomic columns, minus genome-plot margins. */
  updatePlotInsets: (insets) => ({ type: actions.SC_PLOT_INSETS_UPDATED, insets }),
  /** Show reads for cells at a locus: { cellIds, chromosome, position, label } */
  openIgv: (view) => ({ type: actions.SC_IGV_OPENED, view }),
  closeIgv: () => ({ type: actions.SC_IGV_CLOSED }),
  requestPerCellTrack: (cellId, track) => ({
    type: actions.SC_PER_CELL_TRACK_REQUEST,
    cellId,
    track,
  }),
};

export default actions;
