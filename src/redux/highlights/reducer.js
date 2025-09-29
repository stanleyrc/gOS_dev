import actions from "./actions";

const initState = {
  loading: false,
  filename: "highlights.json",
  highlightsMissing: true,
  data: null,
  error: null,
};

export default function appReducer(state = initState, action) {
  switch (action.type) {
    case actions.FETCH_HIGHLIGHTS_DATA_REQUEST:
      return {
        ...state,
        error: null,
        data: null,
        highlightsMissing: true,
        loading: true,
      };
    case actions.FETCH_HIGHLIGHTS_DATA_SUCCESS:
      return {
        ...state,
        data: action.data,
        highlightsMissing: action.highlightsMissing,
        loading: false,
      };
    case actions.FETCH_HIGHLIGHTS_DATA_FAILED:
      return {
        ...state,
        error: action.error,
        highlightsMissing: true,
        data: null,
        loading: false,
      };
    default:
      return state;
  }
}
