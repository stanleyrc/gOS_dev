const actions = {
  LAUNCH_APP: "LAUNCH_APP",
  LAUNCH_APP_SUCCESS: "LAUNCH_APP_SUCCESS",
  LAUNCH_APP_FAILED: "LAUNCH_APP_FAILED",
  DOMAINS_UPDATED: "DOMAINS_UPDATED",
  FILTERED_EVENT_UPDATED: "FILTERED_EVENT_UPDATED",
  HOVERED_LOCATION_UPDATED: "HOVERED_LOCATION_UPDATED",
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
