const actions = {
  FETCH_FILTERED_EVENTS_REQUEST: "FETCH_FILTERED_EVENTS_REQUEST",
  FETCH_FILTERED_EVENTS_SUCCESS: "FETCH_FILTERED_EVENTS_SUCCESS",
  FETCH_FILTERED_EVENTS_FAILED: "FETCH_FILTERED_EVENTS_FAILED",

  SELECT_FILTERED_EVENT: "SELECT_FILTERED_EVENT",
  FILTERED_EVENT_SELECTED: "FILTERED_EVENT_SELECTED",
  APPLY_TIER_OVERRIDE: "APPLY_TIER_OVERRIDE",

  fetchFilteredEvents: () => ({
    type: actions.FETCH_FILTERED_EVENTS_REQUEST,
  }),
  selectFilteredEvent: (filteredEvent, viewMode = "tracks") => ({
    type: actions.SELECT_FILTERED_EVENT,
    filteredEvent,
    viewMode,
  }),
  applyTierOverride: (uid, tier) => ({
    type: actions.APPLY_TIER_OVERRIDE,
    uid,
    tier,
  }),
};

export default actions;
