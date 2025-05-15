import actions from "./actions";

const initState = {
  loading: false,
  filename: "cytobands.tsv",
  data: [],
  chromosomeOutlines: [],
  error: null,
};

export default function appReducer(state = initState, action) {
  switch (action.type) {
    case actions.FETCH_CYTOBANDS_REQUEST:
      return {
        ...state,
        data: [],
        chromosomeOutlines: [],
        error: null,
        loading: true,
      };
    case actions.FETCH_CYTOBANDS_SUCCESS:
      return {
        ...state,
        data: action.data,
        chromosomeOutlines: action.chromosomeOutlines,
        loading: false,
      };
    case actions.FETCH_CYTOBANDS_FAILED:
      return {
        ...state,
        error: action.error,
        loading: false,
      };
    default:
      return state;
  }
}
