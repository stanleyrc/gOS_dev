import actions from "./actions";

const initState = {
  loading: false,
  id: null,
  metadata: {},
  error: null,
};

export default function appReducer(state = initState, action) {
  switch (action.type) {
    case actions.SELECT_CASE_REPORT_REQUEST:
      return {
        ...state,
        id: action.id,
        error: null,
        metadata: {},
        loading: true,
      };
    case actions.SELECT_CASE_REPORT_SUCCESS:
      return {
        ...state,
        metadata: action.metadata,
        loading: false,
      };
    case actions.SELECT_CASE_REPORT_FAILED:
      return {
        ...state,
        error: action.error,
        loading: false,
      };
    default:
      return state;
  }
}
