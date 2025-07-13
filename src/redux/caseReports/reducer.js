import actions from "./actions";

const initState = {
  loading: false,
  loadingPercentage: null,
  datafiles: [],
  populations: {},
  reportsFilters: [],
  searchFilters: { page: 1, per_page: 10, texts: "", orderId: 1 },
  reports: [],
  totalReports: [],
  error: null,
};

export default function appReducer(state = initState, action) {
  switch (action.type) {
    case actions.FETCH_CASE_REPORTS_REQUEST:
      return {
        ...state,
        loadingPercentage: 0,
        error: null,
        datafiles: [],
        populations: {},
        searchFilters: { page: 1, per_page: 10, texts: "", orderId: 1 },
        reportsFilters: {},
        loading: true,
      };
    case actions.FETCH_CASE_REPORTS_REQUEST_LOADING:
      return {
        ...state,
        loadingPercentage: action.loadingPercentage,
        loading: true,
      };
    case actions.FETCH_CASE_REPORTS_SUCCESS:
      return {
        ...state,
        loadingPercentage: 100,
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
        loadingPercentage: null,
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
          orderId: 1,
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
