const actions = {
  FETCH_GENOME_DATA_REQUEST: "FETCH_GENOME_DATA_REQUEST",
  FETCH_GENOME_DATA_SUCCESS: "FETCH_GENOME_DATA_SUCCESS",
  FETCH_GENOME_DATA_FAILED: "FETCH_GENOME_DATA_FAILED",

  fetchGenomeData: (pair) => ({
    type: actions.FETCH_GENOME_DATA_REQUEST,
    pair,
  }),
};

export default actions;
