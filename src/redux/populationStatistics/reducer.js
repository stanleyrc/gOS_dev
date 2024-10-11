import actions from "./actions";

const initState = {
  loading: false,
  general: [],
  tumor: [],
  error: null,
};

export default function appReducer(state = initState, action) {
  switch (action.type) {
    case actions.FETCH_POPULATION_STATISTICS_REQUEST:
      return {
        ...state,
        error: null,
        general: [],
        tumor: [],
        loading: true,
      };
    case actions.FETCH_POPULATION_STATISTICS_SUCCESS:
      return {
        ...state,
        general: action.general,
        tumor: action.tumor,
        loading: false,
      };
    case actions.FETCH_POPULATION_STATISTICS_FAILED:
      return {
        ...state,
        general: [],
        tumor: [],
        error: action.error,
        loading: false,
      };
    default:
      return state;
  }
}
