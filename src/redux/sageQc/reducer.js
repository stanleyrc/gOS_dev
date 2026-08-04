import actions from "./actions";

const initState = {
  loading: false,
  loadingPercentage: null,
  records: [],
  error: null,
  missing: false,
  properties: [],
  filename: "sage.qc",
  coverageOriginalPresent: false,
  coverageOriginalError: null,
  coverageDenoisedPresent: false,
  coverageDenoisedError: null,
  selectedVariant: null,
};

const assetState = (action) => ({
  coverageOriginalPresent: action.coverageOriginalPresent || false,
  coverageOriginalError: action.coverageOriginalError || null,
  coverageDenoisedPresent: action.coverageDenoisedPresent || false,
  coverageDenoisedError: action.coverageDenoisedError || null,
});

export default function appReducer(state = initState, action) {
  switch (action.type) {
    case actions.FETCH_SAGEQC_REQUEST:
      return {
        ...state,
        loadingPercentage: 0,
        pair: action.pair,
        records: [],
        properties: [],
        selectedVariant: null,
        error: null,
        missing: false,
        ...assetState({}),
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
        error: null,
        missing: false,
        ...assetState(action),
        loading: false,
      };
    case actions.FETCH_SAGEQC_MISSING:
      return {
        ...state,
        loadingPercentage: null,
        records: [],
        properties: [],
        error: null,
        missing: true,
        ...assetState(action),
        loading: false,
      };
    case actions.FETCH_SAGEQC_FAILED:
      return {
        ...state,
        loadingPercentage: null,
        records: [],
        properties: [],
        error: action.error,
        missing: false,
        ...assetState(action),
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
