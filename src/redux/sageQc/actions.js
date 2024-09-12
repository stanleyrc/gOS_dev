const actions = {
  FETCH_SAGEQC_REQUEST: "FETCH_SAGEQC_REQUEST",
  FETCH_SAGEQC_SUCCESS: "FETCH_SAGEQC_SUCCESS",
  FETCH_SAGEQC_FAILED: "FETCH_SAGEQC_FAILED",

  fetchSageQc: (pair) => ({
    type: actions.FETCH_SAGEQC_REQUEST,
    pair,
  }),
};

export default actions;
