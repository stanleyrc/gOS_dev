import actions from "./actions";

const initState = {
  loading: false,
  cohortsLoading: false,
  general: [],
  tumor: [],
  cohort: [],
  cohortSearchId: null,
  requestedCohortSearchId: null,
  latestCohortSearchId: null,
  comparisonCohorts: {},
  comparisonCohortsLoading: {},
  error: null,
  missing: false,
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
        missing: false,
      };
    case actions.FETCH_POPULATION_STATISTICS_SUCCESS:
      return {
        ...state,
        general: action.general,
        tumor: action.tumor,
        loading: false,
        missing: false,
      };
    case actions.FETCH_POPULATION_STATISTICS_MISSING:
      return {
        ...state,
        general: [],
        tumor: [],
        error: null,
        loading: false,
        missing: true,
      };
    case actions.FETCH_POPULATION_STATISTICS_FAILED:
      return {
        ...state,
        general: [],
        tumor: [],
        error: action.error,
        loading: false,
        missing: false,
      };
    case actions.FETCH_COHORT_STATISTICS_REQUEST:
      return {
        ...state,
        requestedCohortSearchId: action.comparison
          ? state.requestedCohortSearchId
          : action.searchId || null,
        latestCohortSearchId: action.comparison
          ? state.latestCohortSearchId
          : action.searchId || state.latestCohortSearchId,
        error: null,
        comparisonCohortsLoading:
          action.comparison && action.searchId
            ? {
                ...state.comparisonCohortsLoading,
                [action.searchId]: true,
              }
            : state.comparisonCohortsLoading,
        cohortsLoading: action.comparison ? state.cohortsLoading : true,
      };
    case actions.FETCH_COHORT_STATISTICS_SUCCESS:
      if (
        !action.comparison &&
        (state.requestedCohortSearchId ||
          state.latestCohortSearchId ||
          state.cohortSearchId) &&
        action.searchId !==
          (state.requestedCohortSearchId ||
            state.latestCohortSearchId ||
            state.cohortSearchId)
      ) {
        return state;
      }
      return {
        ...state,
        cohort: action.comparison ? state.cohort : action.cohort,
        cohortSearchId: action.comparison
          ? state.cohortSearchId
          : action.searchId || state.cohortSearchId,
        requestedCohortSearchId: action.comparison
          ? state.requestedCohortSearchId
          : null,
        latestCohortSearchId: action.comparison
          ? state.latestCohortSearchId
          : action.searchId || state.latestCohortSearchId,
        comparisonCohorts:
          action.comparison && action.searchId
            ? {
                ...state.comparisonCohorts,
                [action.searchId]: {
                  label: action.label,
                  cohort: action.cohort || [],
                },
              }
            : state.comparisonCohorts,
        comparisonCohortsLoading:
          action.comparison && action.searchId
            ? {
                ...state.comparisonCohortsLoading,
                [action.searchId]: false,
              }
            : state.comparisonCohortsLoading,
        cohortsLoading: action.comparison ? state.cohortsLoading : false,
      };
    case actions.FETCH_COHORT_STATISTICS_FAILED:
      if (
        !action.comparison &&
        (state.requestedCohortSearchId ||
          state.latestCohortSearchId ||
          state.cohortSearchId) &&
        action.searchId !==
          (state.requestedCohortSearchId ||
            state.latestCohortSearchId ||
            state.cohortSearchId)
      ) {
        return state;
      }
      return {
        ...state,
        cohort: action.comparison ? state.cohort : [],
        cohortSearchId: action.comparison ? state.cohortSearchId : null,
        requestedCohortSearchId: action.comparison
          ? state.requestedCohortSearchId
          : null,
        latestCohortSearchId: action.comparison
          ? state.latestCohortSearchId
          : action.searchId || state.latestCohortSearchId,
        error: action.error,
        comparisonCohorts:
          action.comparison && action.searchId
            ? Object.fromEntries(
                Object.entries(state.comparisonCohorts).filter(
                  ([searchId]) => searchId !== action.searchId,
                ),
              )
            : state.comparisonCohorts,
        comparisonCohortsLoading:
          action.comparison && action.searchId
            ? {
                ...state.comparisonCohortsLoading,
                [action.searchId]: false,
              }
            : state.comparisonCohortsLoading,
        cohortsLoading: action.comparison ? state.cohortsLoading : false,
      };
    default:
      return state;
  }
}
