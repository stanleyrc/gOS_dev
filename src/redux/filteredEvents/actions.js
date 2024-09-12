const actions = {
  FETCH_FILTERED_EVENTS_REQUEST: "FETCH_FILTERED_EVENTS_REQUEST",
  FETCH_FILTERED_EVENTS_SUCCESS: "FETCH_FILTERED_EVENTS_SUCCESS",
  FETCH_FILTERED_EVENTS_FAILED: "FETCH_FILTERED_EVENTS_FAILED",

  SELECT_FILTERED_EVENT: "SELECT_FILTERED_EVENT",

  fetchFilteredEvents: (pair) => ({
    type: actions.FETCH_FILTERED_EVENTS_REQUEST,
    pair,
  }),
  selectFilteredEvent: (filteredEvent) => ({
    type: actions.SELECT_FILTERED_EVENT,
    filteredEvent,
  }),
};

export default actions;
