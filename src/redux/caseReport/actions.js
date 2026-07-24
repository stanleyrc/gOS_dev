const actions = {
  FETCH_CASE_REPORT_REQUEST: "FETCH_CASE_REPORT_REQUEST",
  FETCH_CASE_REPORT_SUCCESS: "FETCH_CASE_REPORT_SUCCESS",
  FETCH_CASE_REPORT_FAILED: "FETCH_CASE_REPORT_FAILED",
  CLEAR_CASE_REPORT: "CLEAR_CASE_REPORT",

  fetchCaseReport: () => ({
    type: actions.FETCH_CASE_REPORT_REQUEST,
  }),

  clearCaseReport: () => ({
    type: actions.CLEAR_CASE_REPORT,
  }),
};

export default actions;
