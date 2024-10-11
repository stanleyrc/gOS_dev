import actions from "./actions";

const initState = {
  loading: false,
  signatureMetrics: {
    indel: { count: [], fraction: [] },
    sbs: { count: [], fraction: [] },
  },
  tumorSignatureMetrics: {
    indel: { count: [], fraction: [] },
    sbs: { count: [], fraction: [] },
  },
  mutationCatalog: [],
  decomposedCatalog: [],
  referenceCatalog: [],
  error: null,
};

export default function appReducer(state = initState, action) {
  switch (action.type) {
    case actions.FETCH_SIGNATURE_STATISTICS_REQUEST:
      return {
        ...state,
        error: null,
        pair: action.pair,
        loading: true,
      };
    case actions.FETCH_SIGNATURE_STATISTICS_SUCCESS:
      return {
        ...state,
        signatureMetrics: action.signatureMetrics,
        tumorSignatureMetrics: action.tumorSignatureMetrics,
        mutationCatalog: action.mutationCatalog,
        decomposedCatalog: action.decomposedCatalog,
        referenceCatalog: action.referenceCatalog,
        loading: false,
      };
    case actions.FETCH_SIGNATURE_STATISTICS_FAILED:
      return {
        ...state,
        error: action.error,
        loading: false,
      };
    default:
      return state;
  }
}
