const actions = {
  FETCH_IGV_DATA_REQUEST: "FETCH_IGV_DATA_REQUEST",
  FETCH_IGV_DATA_SUCCESS: "FETCH_IGV_DATA_SUCCESS",
  FETCH_IGV_DATA_FAILED: "FETCH_IGV_DATA_FAILED",

  fetchIGVData: () => ({
    type: actions.FETCH_IGV_DATA_REQUEST,
  }),
};

export default actions;
