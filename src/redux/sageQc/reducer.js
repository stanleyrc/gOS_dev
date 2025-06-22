import actions from "./actions";

const initState = {
  loading: false,
  loadingPercentage: null,
  records: [],
  error: null,
  filename: "sage.qc.json",
};

export default function appReducer(state = initState, action) {
  switch (action.type) {
    case actions.FETCH_SAGEQC_REQUEST:
      return {
        ...state,
        loadingPercentage: 0,
        pair: action.pair,
        error: null,
        loading: true,
      };
    case actions.FETCH_SAGEQC_REQUEST_LOADING:
      return {
        ...state,
        loadingPercentage: action.loadingPercentage,
        loading: true,
      };
    case actions.FETCH_SAGEQC_SUCCESS:
      return {
        ...state,
        loadingPercentage: 100,
        records: action.records,
        loading: false,
      };
    case actions.FETCH_SAGEQC_FAILED:
      return {
        ...state,
        loadingPercentage: null,
        error: action.error,
        loading: false,
      };
    default:
      return state;
  }
}
