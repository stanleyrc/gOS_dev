import actions from "./actions";

const initState = {
  loading: false,
  filename: "highlights.json",
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
        loading: true,
      };
    case actions.FETCH_HIGHLIGHTS_DATA_SUCCESS:
      return {
        ...state,
        data: action.data,
        loading: false,
      };
    case actions.FETCH_HIGHLIGHTS_DATA_FAILED:
      return {
        ...state,
        error: action.error,
        data: null,
        loading: false,
      };
    default:
      return state;
  }
}
