const actions = {
  FETCH_FILTERED_EVENTS_REQUEST: "FETCH_FILTERED_EVENTS_REQUEST",
  FETCH_FILTERED_EVENTS_SUCCESS: "FETCH_FILTERED_EVENTS_SUCCESS",
  FETCH_FILTERED_EVENTS_FAILED: "FETCH_FILTERED_EVENTS_FAILED",

  SELECT_FILTERED_EVENT: "SELECT_FILTERED_EVENT",
  FILTERED_EVENT_SELECTED: "FILTERED_EVENT_SELECTED",
  APPLY_TIER_OVERRIDE: "APPLY_TIER_OVERRIDE",
  RESET_TIER_OVERRIDES: "RESET_TIER_OVERRIDES",
  UPDATE_ALTERATION_FIELDS: "UPDATE_ALTERATION_FIELDS",
  SET_GLOBAL_NOTES: "SET_GLOBAL_NOTES",

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
  resetTierOverrides: () => ({
    type: actions.RESET_TIER_OVERRIDES,
  }),
  updateAlterationFields: (uid, changes) => ({
    type: actions.UPDATE_ALTERATION_FIELDS,
    uid,
    changes,
  }),
  setGlobalNotes: (notes) => ({
    type: actions.SET_GLOBAL_NOTES,
    notes,
  }),
};

export default actions;
