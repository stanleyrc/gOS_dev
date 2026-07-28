const actions = {
  LAUNCH_APPLICATION: "LAUNCH_APPLICATION",

  FETCH_SETTINGS_DATA_REQUEST: "FETCH_SETTINGS_DATA_REQUEST",
  FETCH_SETTINGS_DATA_SUCCESS: "FETCH_SETTINGS_DATA_SUCCESS",
  FETCH_SETTINGS_DATA_FAILED: "FETCH_SETTINGS_DATA_FAILED",

  UPDATE_DATASET: "UPDATE_DATASET",
  UPDATE_BROWSE_SCOPE: "UPDATE_BROWSE_SCOPE",

  UPDATE_DOMAINS: "UPDATE_DOMAINS",

  UPDATE_TAB: "UPDATE_TAB",

  UPDATE_CASE_REPORT: "UPDATE_CASE_REPORT",

  HOVERED_LOCATION_UPDATED: "HOVERED_LOCATION_UPDATED",

  launchApplication: () => ({
    type: actions.LAUNCH_APPLICATION,
  }),

  fetchSettingsData: () => ({
    type: actions.FETCH_SETTINGS_DATA_REQUEST,
  }),

  updateDomains: (domains) => ({
    type: actions.UPDATE_DOMAINS,
    domains,
  }),

  updateTab: (tab) => ({
    type: actions.UPDATE_TAB,
    tab,
  }),

  updateCaseReport: (report) => ({
    type: actions.UPDATE_CASE_REPORT,
    report,
  }),

  updateDataset: (dataset, report, options = {}) => ({
    type: actions.UPDATE_DATASET,
    dataset,
    report,
    preserveBrowseScope: options.preserveBrowseScope === true,
    refreshBrowseResults: options.refreshBrowseResults,
    cancelBrowseWork: options.cancelBrowseWork !== false,
    searchFilters: options.searchFilters,
  }),

  updateBrowseScope: (browseScope, options = {}) => ({
    type: actions.UPDATE_BROWSE_SCOPE,
    browseScope,
    report: options.report || null,
    refreshBrowseResults: options.refreshBrowseResults,
    cancelBrowseWork: options.cancelBrowseWork !== false,
    searchFilters: options.searchFilters,
    listViewTarget: options.listViewTarget || null,
  }),
  updateHoveredLocation: (hoveredLocation, hoveredLocationPanelIndex) => ({
    type: actions.HOVERED_LOCATION_UPDATED,
    hoveredLocation,
    hoveredLocationPanelIndex,
  }),
};

export default actions;
