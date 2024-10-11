import actions from "./actions";

const initState = {
  loading: false,
  data: null,
  error: null,
};

export default function appReducer(state = initState, action) {
  switch (action.type) {
    case actions.FETCH_COVERAGE_DATA_REQUEST:
      return {
        ...state,
        data: null,
        error: null,
        loading: true,
      };
    case actions.FETCH_COVERAGE_DATA_SUCCESS:
      return {
        ...state,
        data: action.data,
        loading: false,
      };
    case actions.FETCH_COVERAGE_DATA_FAILED:
      return {
        ...state,
        data: null,
        error: action.error,
        loading: false,
      };
    default:
      return state;
  }
}
