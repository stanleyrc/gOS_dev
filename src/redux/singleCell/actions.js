// Tracks shown for each selected cell. Coverage and total CN are on by
// default; the others are toggles. All come from the cell's own case folder.
export const SC_TRACKS = ["coverage", "total", "allelic", "hetsnps", "mutations"];
export const SC_DEFAULT_TRACKS = ["coverage", "total"];
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

  SC_PER_CELL_TRACK_REQUEST: "SC_PER_CELL_TRACK_REQUEST",
  SC_PER_CELL_TRACK_SUCCESS: "SC_PER_CELL_TRACK_SUCCESS",
  SC_PER_CELL_TRACK_MISSING: "SC_PER_CELL_TRACK_MISSING",
  SC_PER_CELL_TRACK_FAILED: "SC_PER_CELL_TRACK_FAILED",

  fetchSingleCellData: () => ({ type: actions.FETCH_SINGLE_CELL_DATA_REQUEST }),
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
  requestPerCellTrack: (cellId, track) => ({
    type: actions.SC_PER_CELL_TRACK_REQUEST,
    cellId,
    track,
  }),
};

export default actions;
