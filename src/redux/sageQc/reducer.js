import actions from "./actions";

const initState = {
  loading: false,
  records: [],
  error: null,
};

export default function appReducer(state = initState, action) {
  switch (action.type) {
    case actions.FETCH_SAGEQC_REQUEST:
      return {
        ...state,
        pair: action.pair,
        error: null,
        loading: true,
      };
    case actions.FETCH_SAGEQC_SUCCESS:
      return {
        ...state,
        records: action.records,
        loading: false,
      };
    case actions.FETCH_SAGEQC_FAILED:
      return {
        ...state,
        error: action.error,
        loading: false,
      };
    default:
      return state;
  }
}
