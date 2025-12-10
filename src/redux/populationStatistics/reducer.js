import actions from "./actions";

const initState = {
  loading: false,
  cohortsLoading: false,
  general: [],
  tumor: [],
  cohort: [],
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
        cohort: [],
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
    case actions.FETCH_COHORT_STATISTICS_REQUEST:
      return {
        ...state,
        error: null,
        cohort: [],
        cohortsLoading: true,
      };
    case actions.FETCH_COHORT_STATISTICS_SUCCESS:
      return {
        ...state,
        cohort: action.cohort,
        cohortsLoading: false,
      };
    case actions.FETCH_COHORT_STATISTICS_FAILED:
      return {
        ...state,
        cohort: [],
        error: action.error,
        cohortsLoading: false,
      };
    default:
      return state;
  }
}
