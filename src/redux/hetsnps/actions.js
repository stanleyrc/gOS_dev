const actions = {
  FETCH_HETSNPS_DATA_REQUEST: "FETCH_HETSNPS_DATA_REQUEST",
  FETCH_HETSNPS_DATA_SUCCESS: "FETCH_HETSNPS_DATA_SUCCESS",
  FETCH_HETSNPS_DATA_FAILED: "FETCH_HETSNPS_DATA_FAILED",

  fetchHetsnpsData: (reference) => ({
    type: actions.FETCH_HETSNPS_DATA_REQUEST,
    reference,
  }),
};

export default actions;
