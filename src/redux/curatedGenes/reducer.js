import actions from "./actions";

const initState = {
  loading: false,
  data: [],
  error: null,
};

export default function appReducer(state = initState, action) {
  switch (action.type) {
    case actions.FETCH_CURATED_GENES_REQUEST:
      return {
        ...state,
        data: [],
        error: null,
        loading: true,
      };
    case actions.FETCH_CURATED_GENES_SUCCESS:
      return {
        ...state,
        data: action.data,
        loading: false,
      };
    case actions.FETCH_CURATED_GENES_FAILED:
      return {
        ...state,
        error: action.error,
        loading: false,
      };
    default:
      return state;
  }
}
