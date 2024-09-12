const actions = {
  FETCH_PPFIT_DATA_REQUEST: "FETCH_PPFIT_DATA_REQUEST",
  FETCH_PPFIT_DATA_SUCCESS: "FETCH_PPFIT_DATA_SUCCESS",
  FETCH_PPFIT_DATA_FAILED: "FETCH_PPFIT_DATA_FAILED",

  fetchPpfitData: (pair) => ({
    type: actions.FETCH_PPFIT_DATA_REQUEST,
    pair,
  }),
};

export default actions;
