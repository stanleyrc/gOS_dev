import actions from "./actions";

const initState = {
  loading: false,
  signatures: {
    indel: { count: [], fraction: [] },
    sbs: { count: [], fraction: [] },
  },
  signatureMetrics: {
    indel: { count: [], fraction: [] },
    sbs: { count: [], fraction: [] },
  },
  signaturesReference: { indel: {}, sbs: {} },
  error: null,
};

export default function appReducer(state = initState, action) {
  switch (action.type) {
    case actions.FETCH_SIGNATURE_PROFILES_REQUEST:
      return {
        ...state,
        error: null,
        loading: true,
      };
    case actions.FETCH_SIGNATURE_PROFILES_SUCCESS:
      return {
        ...state,
        signatures: action.signatures,
        signatureMetrics: action.signatureMetrics,
        signaturesReference: action.signaturesReference,
        loading: false,
      };
    case actions.FETCH_SIGNATURE_PROFILES_FAILED:
      return {
        ...state,
        error: action.error,
        loading: false,
      };
    default:
      return state;
  }
}
