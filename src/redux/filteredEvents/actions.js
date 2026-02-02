const actions = {
  FETCH_FILTERED_EVENTS_REQUEST: "FETCH_FILTERED_EVENTS_REQUEST",
  FETCH_FILTERED_EVENTS_SUCCESS: "FETCH_FILTERED_EVENTS_SUCCESS",
  FETCH_FILTERED_EVENTS_FAILED: "FETCH_FILTERED_EVENTS_FAILED",

  SELECT_FILTERED_EVENT: "SELECT_FILTERED_EVENT",
  FILTERED_EVENT_SELECTED: "FILTERED_EVENT_SELECTED",
  RESET_TIER_OVERRIDES: "RESET_TIER_OVERRIDES",
  REVERT_FILTERED_EVENT: "REVERT_FILTERED_EVENT",

  SET_SELECTED_EVENT_UIDS: "SET_SELECTED_EVENT_UIDS",
  TOGGLE_EVENT_UID_SELECTION: "TOGGLE_EVENT_UID_SELECTION",

  SET_COLUMN_FILTERS: "SET_COLUMN_FILTERS",
  RESET_COLUMN_FILTERS: "RESET_COLUMN_FILTERS",

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
  setSelectedEventUids: (uids) => ({
    type: actions.SET_SELECTED_EVENT_UIDS,
    uids,
  }),
  toggleEventUidSelection: (uid, selected) => ({
    type: actions.TOGGLE_EVENT_UID_SELECTION,
    uid,
    selected,
  }),
  setColumnFilters: (columnFilters) => ({
    type: actions.SET_COLUMN_FILTERS,
    columnFilters,
  }),
  resetColumnFilters: () => ({
    type: actions.RESET_COLUMN_FILTERS,
  }),
};

export default actions;
