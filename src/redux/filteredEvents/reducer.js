import actions from "./actions";

const initState = {
  loading: false,
  filteredEvents: [],
  originalFilteredEvents: [],
  selectedFilteredEvent: null,
  viewMode: "tracks",
  error: null,
  selectedEventUids: [],
  columnFilters: {
    tier: [1, 2],
  },
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
        columnFilters: {
          tier: [1, 2],
        },
      };
    case actions.FETCH_FILTERED_EVENTS_SUCCESS:
      return {
        ...state,
        filteredEvents: action.filteredEvents,
        originalFilteredEvents: (action.filteredEvents || []).map((d) => ({ ...d })),
        selectedFilteredEvent: action.selectedFilteredEvent,
        loading: false,
      };
    case actions.FETCH_FILTERED_EVENTS_FAILED:
      return {
        ...state,
        filteredEvents: [],
        originalFilteredEvents: [],
        selectedFilteredEvent: null,
        error: action.error,
        loading: false,
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
    case actions.REVERT_FILTERED_EVENT: {
      const { alterationId, originalEvent } = action;
      
      if (!alterationId || !originalEvent) {
        return state;
      }
      
      const nextFiltered = state.filteredEvents.map(event => 
        event.uid === alterationId ? { ...originalEvent } : event
      );
      
      const nextSelected = state.selectedFilteredEvent?.uid === alterationId
        ? { ...originalEvent }
        : state.selectedFilteredEvent;
      
      return {
        ...state,
        filteredEvents: nextFiltered,
        selectedFilteredEvent: nextSelected,
      };
    }
    case actions.SET_SELECTED_EVENT_UIDS: {
      return {
        ...state,
        selectedEventUids: action.uids || [],
      };
    }
    case actions.TOGGLE_EVENT_UID_SELECTION: {
      const { uid, selected } = action;
      const currentUids = state.selectedEventUids || [];
      
      if (selected) {
        if (!currentUids.includes(uid)) {
          return {
            ...state,
            selectedEventUids: [...currentUids, uid],
          };
        }
      } else {
        return {
          ...state,
          selectedEventUids: currentUids.filter((u) => u !== uid),
        };
      }
      return state;
    }
    case actions.SET_COLUMN_FILTERS: {
      return {
        ...state,
        columnFilters: action.columnFilters,
      };
    }
    case actions.RESET_COLUMN_FILTERS: {
      return {
        ...state,
        columnFilters: {
          tier: [1, 2],
        },
      };
    }
    default:
      return state;
  }
}
