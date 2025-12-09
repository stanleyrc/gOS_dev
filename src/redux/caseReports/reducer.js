import actions from "./actions";
import { cascaderOperators } from "../../helpers/filters";

const initState = {
  loading: false,
  loadingPercentage: null,
  datafiles: [],
  populations: {},
  cohortPopulations: {},
  reportsFilters: [],
  reportsFiltersExtents: {},
  casesWithInterpretations: new Set(),
  interpretationsCounts: new Map(),
  searchFilters: {
    page: 1,
    per_page: 10,
    texts: "",
    orderId: 1,
    operator: cascaderOperators[0],
  },
  reports: [],
  totalReports: [],
  error: null,
  highlightedCaseReport: null,
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
        cohortPopulations: {},
        casesWithInterpretations: new Set(),
        interpretationsCounts: new Map(),
        searchFilters: {
          page: 1,
          per_page: 10,
          texts: "",
          orderId: 1,
          operator: cascaderOperators[0],
        },
        reportsFilters: [],
        reports: [],
        totalReports: [],
        reportsFiltersExtents: {},
        loading: true,
        highlightedCaseReport: null,
      };
    case actions.FETCH_CASE_REPORTS_REQUEST_LOADING:
      return {
        ...state,
        loadingPercentage: action.loadingPercentage,
        loading: true,
        highlightedCaseReport: null,
      };
    case actions.FETCH_CASE_REPORTS_SUCCESS:
      return {
        ...state,
        loadingPercentage: 100,
        datafiles: action.datafiles,
        populations: action.populations,
        cohortPopulations: action.cohortPopulations,
        reportsFilters: action.reportsFilters,
        casesWithInterpretations: action.casesWithInterpretations || new Set(),
        interpretationsCounts: action.interpretationsCounts || new Map(),
        reports: action.reports,
        totalReports: action.totalReports,
        reportsFiltersExtents: action.reportsFiltersExtents,
        loading: false,
        highlightedCaseReport: null,
      };
    case actions.FETCH_CASE_REPORTS_FAILED:
      return {
        ...state,
        loadingPercentage: null,
        searchFilters: action.searchFilters || {
          page: 1,
          per_page: 10,
          texts: "",
          orderId: 1,
          operator: cascaderOperators[0],
        },
        error: action.error,
        populations: {},
        cohortPopulations: {},
        datafiles: [],
        loading: false,
        highlightedCaseReport: null,
      };
    case actions.SEARCH_CASE_REPORTS:
      return {
        ...state,
        searchFilters: action.searchFilters || {
          page: 1,
          per_page: 10,
          texts: "",
          orderId: 1,
          operator: cascaderOperators[0],
        },
        highlightedCaseReport: null,
      };
    case actions.CASE_REPORTS_MATCHED:
      return {
        ...state,
        reports: action.reports,
        totalReports: action.totalReports,
        reportsFilters: action.reportsFilters,
        cohortPopulations: action.cohortPopulations,
        casesWithInterpretations:
          action.casesWithInterpretations || state.casesWithInterpretations,
        interpretationsCounts:
          action.interpretationsCounts || state.interpretationsCounts,
        loading: false,
        highlightedCaseReport: null,
      };
    case actions.HIGHLIGHTED_CASE_REPORT_UPDATED:
      return {
        ...state,
        highlightedCaseReport: action.report,
      };
    default:
      return state;
  }
}
