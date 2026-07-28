const actions = {
  FETCH_DATASETS_REQUEST: "FETCH_DATASETS_REQUEST",
  FETCH_DATASETS_SUCCESS: "FETCH_DATASETS_SUCCESS",
  FETCH_DATASETS_FAILED: "FETCH_DATASETS_FAILED",
  SELECT_DATASET_REQUEST: "SELECT_DATASET_REQUEST",
  SELECT_DATASET_FAILED: "SELECT_DATASET_FAILED",
  SELECT_ALL_DATASETS_REQUEST: "SELECT_ALL_DATASETS_REQUEST",
  OPEN_CASE_REPORT_REQUEST: "OPEN_CASE_REPORT_REQUEST",

  fetchDatasets: () => ({
    type: actions.FETCH_DATASETS_REQUEST,
  }),

  selectDataset: (datasetId, report = null, options = {}) => ({
    type: actions.SELECT_DATASET_REQUEST,
    datasetId,
    report,
    searchFilters: options.searchFilters,
  }),

  selectAllDatasets: (options = {}) => ({
    type: actions.SELECT_ALL_DATASETS_REQUEST,
    searchFilters: options.searchFilters,
    listViewTarget: options.listViewTarget || null,
  }),

  openCaseReport: (datasetId, caseReportId, options = {}) => ({
    type: actions.OPEN_CASE_REPORT_REQUEST,
    datasetId,
    caseReportId,
    keepBrowseFetch: options.keepBrowseFetch === true,
  }),
};

export default actions;
