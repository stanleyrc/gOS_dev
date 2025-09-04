import actions from "./actions";

const initState = {
  loading: false,
  loadingPercentage: null,
  records: [],
  error: null,
  properties: [],
  filename: "sage.qc",
  selectedVariant: null,
};

export default function appReducer(state = initState, action) {
  switch (action.type) {
    case actions.FETCH_SAGEQC_REQUEST:
      return {
        ...state,
        loadingPercentage: 0,
        pair: action.pair,
        properties: [],
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
        properties: action.properties,
        loading: false,
      };
    case actions.FETCH_SAGEQC_FAILED:
      return {
        ...state,
        loadingPercentage: null,
        properties: [],
        error: action.error,
        loading: false,
      };
    case actions.SELECT_VARIANT:
      return {
        ...state,
        selectedVariant: action.variant,
        loading: false,
      };
    default:
      return state;
  }
}
