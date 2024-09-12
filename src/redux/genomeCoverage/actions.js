const actions = {
  FETCH_COVERAGE_DATA_REQUEST: "FETCH_COVERAGE_DATA_REQUEST",
  FETCH_COVERAGE_DATA_SUCCESS: "FETCH_COVERAGE_DATA_SUCCESS",
  FETCH_COVERAGE_DATA_FAILED: "FETCH_COVERAGE_DATA_FAILED",

  fetchCoverageData: (reference) => ({
    type: actions.FETCH_COVERAGE_DATA_REQUEST,
    reference,
  }),
};

export default actions;
