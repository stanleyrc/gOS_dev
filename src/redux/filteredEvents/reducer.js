import actions from "./actions";

const initState = {
  loading: false,
  filteredEvents: [],
  selectedFilteredEvent: null,
  error: null,
};

export default function appReducer(state = initState, action) {
  switch (action.type) {
    case actions.FETCH_FILTERED_EVENTS_REQUEST:
      return {
        ...state,
        error: null,
        filteredEvents: [],
        loading: true,
      };
    case actions.FETCH_FILTERED_EVENTS_SUCCESS:
      return {
        ...state,
        filteredEvents: action.filteredEvents,
        selectedFilteredEvent: action.selectedFilteredEvent,
        loading: false,
      };
    case actions.FETCH_FILTERED_EVENTS_FAILED:
      return {
        ...state,
        filteredEvents: [],
        selectedFilteredEvent: null,
        error: action.error,
        loading: false,
      };
    case actions.SELECT_FILTERED_EVENT:
      return {
        ...state,
        selectedFilteredEvent: action.filteredEvent,
        loading: false,
      };
    default:
      return state;
  }
}
