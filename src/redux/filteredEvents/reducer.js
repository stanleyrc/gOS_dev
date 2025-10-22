import actions from "./actions";

const initState = {
  loading: false,
  filteredEvents: [],
  originalFilteredEvents: [],
  selectedFilteredEvent: null,
  viewMode: "tracks",
  error: null,
  reportSrc: null,
  globalNotes: "",
};

export default function appReducer(state = initState, action) {
  switch (action.type) {
    case actions.FETCH_FILTERED_EVENTS_REQUEST:
      return {
        ...state,
        error: null,
        filteredEvents: [],
        originalFilteredEvents: [],
        loading: true,
        reportSrc: null,
        globalNotes: "",
      };
    case actions.FETCH_FILTERED_EVENTS_SUCCESS:
      return {
        ...state,
        filteredEvents: action.filteredEvents,
        originalFilteredEvents: (action.filteredEvents || []).map((d) => ({ ...d })),
        selectedFilteredEvent: action.selectedFilteredEvent,
        loading: false,
        reportSrc: action.reportSrc || null,
      };
    case actions.FETCH_FILTERED_EVENTS_FAILED:
      return {
        ...state,
        filteredEvents: [],
        originalFilteredEvents: [],
        selectedFilteredEvent: null,
        error: action.error,
        loading: false,
        reportSrc: null,
        globalNotes: "",
      };
    case actions.SELECT_FILTERED_EVENT:
      return {
        ...state,
        selectedFilteredEvent: action.filteredEvent,
        viewMode: action.viewMode,
        loading: false,
      };
    case actions.RESET_TIER_OVERRIDES: {
      // Restore entire items from the original snapshot (not just tier)
      const origMap = new Map(
        (state.originalFilteredEvents || []).map((d) => [d.uid, d])
      );

      const restoreItem = (it) => {
        if (!it) return it;
        const orig = origMap.get(it.uid);
        return orig ? { ...orig } : it;
      };

      const nextFiltered = (state.filteredEvents || []).map(restoreItem);
      const nextSelected =
        state.selectedFilteredEvent &&
        origMap.has(state.selectedFilteredEvent.uid)
          ? { ...origMap.get(state.selectedFilteredEvent.uid) }
          : state.selectedFilteredEvent;

      return {
        ...state,
        filteredEvents: nextFiltered,
        selectedFilteredEvent: nextSelected,
      };
    }
    case actions.SET_GLOBAL_NOTES:
      return {
        ...state,
        globalNotes: String(action.notes || ""),
      };
    default:
      return state;
  }
}
