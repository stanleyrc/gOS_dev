import actions from "./actions";

const initState = {
  loading: false,
  id: null,
  metadata: {},
  qualityStatus: { level: 0, clauses: [] },
  qualityReportPresent: null,
  qualityReportName: "multiqc_report.html",
  error: null,
};

export default function appReducer(state = initState, action) {
  switch (action.type) {
    case actions.FETCH_CASE_REPORT_REQUEST:
      return {
        ...state,
        id: action.id,
        error: null,
        qualityStatus: { level: 0, clauses: [] },
        metadata: {},
        qualityReportPresent: null,
        loading: true,
      };
    case actions.FETCH_CASE_REPORT_SUCCESS:
      return {
        ...state,
        metadata: action.metadata,
        qualityStatus: action.qualityStatus,
        id: action.id,
        qualityReportPresent: action.qualityReportPresent,
        loading: false,
      };
    case actions.FETCH_CASE_REPORT_FAILED:
      return {
        ...state,
        id: null,
        metadata: {},
        qualityStatus: { level: 0, clauses: [] },
        qualityReportPresent: null,
        error: action.error,
        loading: false,
      };
    default:
      return state;
  }
}
