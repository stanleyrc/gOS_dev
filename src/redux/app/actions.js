const actions = {
  BOOT_APP: "BOOT_APP",
  BOOT_APP_SUCCESS: "BOOT_APP_SUCCESS",

  SELECT_REPORT: "SELECT_REPORT",
  REPORT_SELECTED: "REPORT_SELECTED",

  LAUNCH_APP: "LAUNCH_APP",
  LAUNCH_APP_SUCCESS: "LAUNCH_APP_SUCCESS",
  LAUNCH_APP_FAILED: "LAUNCH_APP_FAILED",
  DOMAINS_UPDATED: "DOMAINS_UPDATED",
  FILTERED_EVENT_UPDATED: "FILTERED_EVENT_UPDATED",
  HOVERED_LOCATION_UPDATED: "HOVERED_LOCATION_UPDATED",
  bootApp: () => ({
    type: actions.BOOT_APP,
  }),
  selectReport: (report) => ({
    type: actions.SELECT_REPORT,
    report,
  }),
  launchApp: (files, selectedTags) => ({
    type: actions.LAUNCH_APP,
    files,
    selectedTags,
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
  updateSelectedFilteredEvent: (filteredEvent) => ({
    type: actions.FILTERED_EVENT_UPDATED,
    filteredEvent,
  }),
};

export default actions;
