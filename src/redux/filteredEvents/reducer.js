import actions from "./actions";

const initState = {
  loading: false,
  filteredEvents: [],
  originalFilteredEvents: [],
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
        originalFilteredEvents: [],
        loading: true,
        reportSrc: null,
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
    case actions.RESET_TIER_OVERRIDES: {
      const origMap = new Map(
        (state.originalFilteredEvents || []).map((d) => [d.uid, d.tier])
      );
      const restoreTier = (it) =>
        it ? { ...it, tier: origMap.get(it.uid) ?? it.tier } : it;

      return {
        ...state,
        filteredEvents: (state.filteredEvents || []).map(restoreTier),
        selectedFilteredEvent: restoreTier(state.selectedFilteredEvent),
      };
    }
    case actions.UPDATE_ALTERATION_FIELDS: {
      const { uid, changes } = action;
      const normalized = {
        ...changes,
        ...(Array.isArray(changes?.therapeutics)
          ? { therapeutics: [...changes.therapeutics] }
          : {}),
        ...(Array.isArray(changes?.resistances)
          ? { resistances: [...changes.resistances] }
          : {}),
      };
      return {
        ...state,
        filteredEvents: (state.filteredEvents || []).map((it) =>
          it?.uid === uid ? { ...it, ...normalized } : it
        ),
        selectedFilteredEvent:
          state.selectedFilteredEvent?.uid === uid
            ? { ...state.selectedFilteredEvent, ...normalized }
            : state.selectedFilteredEvent,
      };
    }
    default:
      return state;
  }
}
