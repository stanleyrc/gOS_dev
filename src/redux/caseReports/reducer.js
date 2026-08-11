import actions from "./actions";
import { cascaderOperators } from "../../helpers/filters";

const defaultFilters = () => ({
  page: 1,
  per_page: 10,
  texts: "",
  orderId: 1,
  operator: cascaderOperators[0],
});

const initState = {
  loading: false,
  searchPending: false,
  loadingPercentage: null,
  currentSearchId: null,
  datafiles: [],
  manifestRecordsByDataset: {},
  populations: {},
  cohortPopulations: {},
  reportsFilters: [],
  reportsFiltersExtents: {},
  casesWithInterpretations: new Set(),
  interpretationsCounts: new Map(),
  searchFilters: defaultFilters(),
  listViewTarget: null,
  reports: [],
  totalReports: [],
  totalReportsCount: 0,
  favoriteSearches: [],
  favoriteSearchesLoading: false,
  favoriteSearchesSaving: false,
  favoriteSearchDeletingId: null,
  favoriteSearchesError: null,
  error: null,
  highlightedCaseReport: null,
};

export default function appReducer(state = initState, action) {
  switch (action.type) {
    case actions.FETCH_CASE_REPORTS_REQUEST:
      return {
        ...state,
        loadingPercentage: 0,
        currentSearchId: null,
        searchPending: true,
        error: null,
        datafiles: [],
        populations: {},
        cohortPopulations: {},
        casesWithInterpretations: new Set(),
        interpretationsCounts: new Map(),
        searchFilters: action.searchFilters || defaultFilters(),
        listViewTarget: action.listViewTarget || null,
        reportsFilters: [],
        reports: [],
        totalReports: [],
        totalReportsCount: 0,
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
    case actions.CANCEL_CASE_REPORTS_FETCH:
      return {
        ...state,
        loadingPercentage: null,
        loading: false,
        searchPending: false,
      };
    case actions.FETCH_CASE_REPORTS_SUCCESS:
      return {
        ...state,
        loadingPercentage: 100,
        currentSearchId: action.searchId || null,
        datafiles: action.datafiles,
        manifestRecordsByDataset: {
          ...state.manifestRecordsByDataset,
          ...(action.manifestRecordsByDataset || {}),
        },
        populations: action.populations,
        cohortPopulations: action.cohortPopulations,
        reportsFilters: action.reportsFilters,
        casesWithInterpretations: action.casesWithInterpretations || new Set(),
        interpretationsCounts: action.interpretationsCounts || new Map(),
        reports: action.reports,
        totalReports: action.totalReports,
        totalReportsCount:
          action.totalReportsCount ?? action.totalReports?.length ?? 0,
        reportsFiltersExtents: action.reportsFiltersExtents,
        searchPending: false,
        loading: false,
        highlightedCaseReport: null,
      };
    case actions.FETCH_CASE_REPORTS_FAILED:
      if (action.preserveBrowseData) {
        return {
          ...state,
          loadingPercentage: null,
          error: action.error,
          searchPending: false,
          loading: false,
        };
      }
      return {
        ...state,
        loadingPercentage: null,
        searchFilters: action.searchFilters || defaultFilters(),
        error: action.error,
        populations: {},
        cohortPopulations: {},
        datafiles: [],
        reports: [],
        totalReports: [],
        totalReportsCount: 0,
        searchPending: false,
        loading: false,
        highlightedCaseReport: null,
      };
    case actions.SEARCH_CASE_REPORTS:
      if (state.loading) return state;
      return {
        ...state,
        searchPending: true,
        searchFilters: action.searchFilters || defaultFilters(),
        listViewTarget: action.listViewTarget || null,
        highlightedCaseReport: null,
      };
    case actions.CASE_REPORTS_MATCHED:
      return {
        ...state,
        currentSearchId: action.searchId || state.currentSearchId,
        reports: action.reports,
        totalReports: action.totalReports,
        totalReportsCount:
          action.totalReportsCount ?? action.totalReports?.length ?? 0,
        reportsFilters: action.reportsFilters,
        cohortPopulations: action.cohortPopulations,
        casesWithInterpretations:
          action.casesWithInterpretations || state.casesWithInterpretations,
        interpretationsCounts:
          action.interpretationsCounts || state.interpretationsCounts,
        searchPending: false,
        loading: false,
        highlightedCaseReport: null,
      };
    case actions.INTERPRETATION_FILTERS_REFRESHED:
      return {
        ...state,
        reportsFilters: action.reportsFilters,
        casesWithInterpretations:
          action.casesWithInterpretations || state.casesWithInterpretations,
        interpretationsCounts:
          action.interpretationsCounts || state.interpretationsCounts,
      };
    case actions.FETCH_FAVORITE_SEARCHES_REQUEST:
      return {
        ...state,
        favoriteSearches: [],
        favoriteSearchesLoading: true,
        favoriteSearchesError: null,
      };
    case actions.FETCH_FAVORITE_SEARCHES_SUCCESS:
      return {
        ...state,
        favoriteSearches: action.favoriteSearches || [],
        favoriteSearchesLoading: false,
        favoriteSearchesError: null,
      };
    case actions.FETCH_FAVORITE_SEARCHES_FAILED:
      return {
        ...state,
        favoriteSearches: [],
        favoriteSearchesLoading: false,
        favoriteSearchesError: action.error,
      };
    case actions.SAVE_FAVORITE_SEARCH_REQUEST:
      return {
        ...state,
        favoriteSearchesSaving: true,
        favoriteSearchesError: null,
      };
    case actions.SAVE_FAVORITE_SEARCH_SUCCESS:
      return {
        ...state,
        favoriteSearches: action.favoriteSearches || state.favoriteSearches,
        favoriteSearchesSaving: false,
        favoriteSearchesError: null,
      };
    case actions.SAVE_FAVORITE_SEARCH_FAILED:
      return {
        ...state,
        favoriteSearchesSaving: false,
        favoriteSearchesError: action.error,
      };
    case actions.DELETE_FAVORITE_SEARCH_REQUEST:
      return {
        ...state,
        favoriteSearchDeletingId: action.favoriteId,
        favoriteSearchesError: null,
      };
    case actions.DELETE_FAVORITE_SEARCH_SUCCESS:
      return {
        ...state,
        favoriteSearches: action.favoriteSearches || [],
        favoriteSearchDeletingId: null,
        favoriteSearchesError: null,
      };
    case actions.DELETE_FAVORITE_SEARCH_FAILED:
      return {
        ...state,
        favoriteSearchDeletingId: null,
        favoriteSearchesError: action.error,
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
