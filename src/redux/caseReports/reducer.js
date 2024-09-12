import actions from "./actions";

const initState = {
  loading: false,
  datafiles: [],
  reportsFilters: [],
  searchFilters: { page: 1, per_page: 10, texts: "" },
  reports: [],
  totalReports: [],
  error: null,
};

export default function appReducer(state = initState, action) {
  switch (action.type) {
    case actions.FETCH_CASE_REPORTS_REQUEST:
      return {
        ...state,
        error: null,
        datafiles: [],
        reportsFilters: {},
        loading: true,
      };
    case actions.FETCH_CASE_REPORTS_SUCCESS:
      return {
        ...state,
        datafiles: action.datafiles,
        reportsFilters: action.reportsFilters,
        populations: action.populations,
        allPopulationMetrics: action.allPopulationMetrics,
        loading: false,
      };
    case actions.FETCH_CASE_REPORTS_FAILED:
      return {
        ...state,
        error: action.error,
        loading: false,
      };
    case actions.SEARCH_CASE_REPORTS:
      return {
        ...state,
        searchFilters: action.searchFilters,
        loading: true,
      };
    case actions.CASE_REPORTS_MATCHED:
      return {
        ...state,
        reports: action.reports,
        totalReports: action.totalReports,
        loading: false,
      };
    default:
      return state;
  }
}
