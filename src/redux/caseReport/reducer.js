import actions from "./actions";

const initState = {
  loading: false,
  id: null,
  metadata: {},
  error: null,
};

export default function appReducer(state = initState, action) {
  switch (action.type) {
    case actions.FETCH_CASE_REPORT_REQUEST:
      return {
        ...state,
        id: action.id,
        error: null,
        metadata: {},
        loading: true,
      };
    case actions.FETCH_CASE_REPORT_SUCCESS:
      return {
        ...state,
        metadata: action.metadata,
        id: action.id,
        loading: false,
      };
    case actions.FETCH_CASE_REPORT_FAILED:
      return {
        ...state,
        id: null,
        metadata: {},
        error: action.error,
        loading: false,
      };
    default:
      return state;
  }
}
