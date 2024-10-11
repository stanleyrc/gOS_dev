import actions from "./actions";

const initState = {
  loading: false,
  datafiles: [],
  populations: {},
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
        populations: {},
        reportsFilters: {},
        loading: true,
      };
    case actions.FETCH_CASE_REPORTS_SUCCESS:
      return {
        ...state,
        datafiles: action.datafiles,
        populations: action.populations,
        reportsFilters: action.reportsFilters,
        reports: action.reports,
        totalReports: action.totalReports,
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
        searchFilters: action.searchFilters || {
          page: 1,
          per_page: 10,
          texts: "",
        },
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
