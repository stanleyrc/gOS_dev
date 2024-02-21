const actions = {
  BOOT_APP: "BOOT_APP",
  BOOT_APP_SUCCESS: "BOOT_APP_SUCCESS",

  LOAD_GENES: "LOAD_GENES",
  GENES_LOADED: "GENES_LOADED",

  SEARCH_REPORTS: "SEARCH_REPORTS",
  REPORTS_FETCHED: "REPORTS_FETCHED",

  SELECT_REPORT: "SELECT_REPORT",
  REPORT_SELECTED: "REPORT_SELECTED",

  RESET_REPORT: "RESET_REPORT",

  LAUNCH_APP: "LAUNCH_APP",
  LAUNCH_APP_SUCCESS: "LAUNCH_APP_SUCCESS",
  LAUNCH_APP_FAILED: "LAUNCH_APP_FAILED",
  DOMAINS_UPDATED: "DOMAINS_UPDATED",
  FILTERED_EVENT_UPDATED: "FILTERED_EVENT_UPDATED",
  HOVERED_LOCATION_UPDATED: "HOVERED_LOCATION_UPDATED",
  bootApp: () => ({
    type: actions.BOOT_APP,
  }),
  searchReports: (searchFilters) => ({
    type: actions.SEARCH_REPORTS,
    searchFilters,
  }),
  selectReport: (report) => ({
    type: actions.SELECT_REPORT,
    report,
  }),
  resetReport: () => ({
    type: actions.RESET_REPORT,
  }),
  loadGenes: () => ({
    type: actions.LOAD_GENES,
  }),
  updateSelectedFilteredEvent: (filteredEvent) => ({
    type: actions.FILTERED_EVENT_UPDATED,
    filteredEvent,
  }),
  updateDomains: (domains) => ({
    type: actions.DOMAINS_UPDATED,
    domains,
  }),
  updateHoveredLocation: (hoveredLocation, hoveredLocationPanelIndex) => ({
    type: actions.HOVERED_LOCATION_UPDATED,
    hoveredLocation,
    hoveredLocationPanelIndex,
  }),
};

export default actions;
