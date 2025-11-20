const actions = {
  FETCH_FILTERED_EVENTS_REQUEST: "FETCH_FILTERED_EVENTS_REQUEST",
  FETCH_FILTERED_EVENTS_SUCCESS: "FETCH_FILTERED_EVENTS_SUCCESS",
  FETCH_FILTERED_EVENTS_FAILED: "FETCH_FILTERED_EVENTS_FAILED",

  SELECT_FILTERED_EVENT: "SELECT_FILTERED_EVENT",
  FILTERED_EVENT_SELECTED: "FILTERED_EVENT_SELECTED",
  RESET_TIER_OVERRIDES: "RESET_TIER_OVERRIDES",
  REVERT_FILTERED_EVENT: "REVERT_FILTERED_EVENT",

  fetchFilteredEvents: () => ({
    type: actions.FETCH_FILTERED_EVENTS_REQUEST,
  }),
  selectFilteredEvent: (filteredEvent, viewMode = "tracks") => ({
    type: actions.SELECT_FILTERED_EVENT,
    filteredEvent,
    viewMode,
  }),
  resetTierOverrides: () => ({
    type: actions.RESET_TIER_OVERRIDES,
  }),
  revertFilteredEvent: (alterationId, originalEvent) => ({
    type: actions.REVERT_FILTERED_EVENT,
    alterationId,
    originalEvent,
  }),
};

export default actions;
