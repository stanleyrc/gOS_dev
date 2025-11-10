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
  signaturesWeightsFiles: {
    indel: "COSMIC_v3.4_ID_GRCh37.txt",
    sbs: "COSMIC_v3.4_SBS_GRCh37.txt",
  },
  error: null,
};

export default function appReducer(state = initState, action) {
  switch (action.type) {
    case actions.FETCH_SIGNATURE_PROFILES_REQUEST:
      return {
        ...state,
        error: null,
        signatures: {
          indel: { count: [], fraction: [] },
          sbs: { count: [], fraction: [] },
        },
        signatureMetrics: {
          indel: { count: [], fraction: [] },
          sbs: { count: [], fraction: [] },
        },
        signaturesReference: { indel: {}, sbs: {} },
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
        signatures: {
          indel: { count: [], fraction: [] },
          sbs: { count: [], fraction: [] },
        },
        signatureMetrics: {
          indel: { count: [], fraction: [] },
          sbs: { count: [], fraction: [] },
        },
        signaturesReference: { indel: {}, sbs: {} },
        loading: false,
      };
    default:
      return state;
  }
}
