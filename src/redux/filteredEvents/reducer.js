import actions from "./actions";

const initState = {
  loading: false,
  filteredEvents: [],
  selectedFilteredEvent: null,
  viewMode: "tracks",
  error: null,
  reportSrc: null,
};

export default function appReducer(state = initState, action) {
  switch (action.type) {
    case actions.FETCH_FILTERED_EVENTS_REQUEST:
      return {
        ...state,
        error: null,
        filteredEvents: [],
        loading: true,
        reportSrc: null,
      };
    case actions.FETCH_FILTERED_EVENTS_SUCCESS:
      return {
        ...state,
        filteredEvents: action.filteredEvents,
        selectedFilteredEvent: action.selectedFilteredEvent,
        loading: false,
        reportSrc: action.reportSrc || null,
      };
    case actions.FETCH_FILTERED_EVENTS_FAILED:
      return {
        ...state,
        filteredEvents: [],
        selectedFilteredEvent: null,
        error: action.error,
        loading: false,
        reportSrc: null,
      };
    case actions.SELECT_FILTERED_EVENT:
      return {
        ...state,
        selectedFilteredEvent: action.filteredEvent,
        viewMode: action.viewMode,
        loading: false,
      };
    case actions.APPLY_TIER_OVERRIDE: {
      const { uid, tier } = action;
      const tierNum = Number(tier);
      const update = (it) => (it ? { ...it, tier: tierNum } : it);

      return {
        ...state,
        filteredEvents: (state.filteredEvents || []).map((it) =>
          it?.uid === uid ? update(it) : it
        ),
        selectedFilteredEvent:
          state.selectedFilteredEvent?.uid === uid
            ? update(state.selectedFilteredEvent)
            : state.selectedFilteredEvent,
      };
    }
    default:
      return state;
  }
}
