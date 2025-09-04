const actions = {
  FETCH_SAGEQC_REQUEST: "FETCH_SAGEQC_REQUEST",
  FETCH_SAGEQC_REQUEST_LOADING: "FETCH_SAGEQC_REQUEST_LOADING",
  FETCH_SAGEQC_SUCCESS: "FETCH_SAGEQC_SUCCESS",
  FETCH_SAGEQC_FAILED: "FETCH_SAGEQC_FAILED",

  SELECT_VARIANT: "SELECT_VARIANT",

  fetchSageQc: () => ({
    type: actions.FETCH_SAGEQC_REQUEST,
  }),
  selectVariant: (variant) => ({
    type: actions.SELECT_VARIANT,
    variant,
  }),
};

export default actions;
