const actions = {
  FETCH_GENES_DATA_REQUEST: "FETCH_GENES_DATA_REQUEST",
  FETCH_GENES_DATA_SUCCESS: "FETCH_GENES_DATA_SUCCESS",
  FETCH_GENES_DATA_FAILED: "FETCH_GENES_DATA_FAILED",

  fetchGenesData: (reference) => ({
    type: actions.FETCH_GENES_DATA_REQUEST,
    reference,
  }),
};

export default actions;
