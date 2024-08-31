import actions from "./actions";

const initState = {
  loading: false,
  data: null,
  optionsList: [],
  error: null,
};

export default function appReducer(state = initState, action) {
  switch (action.type) {
    case actions.FETCH_GENES_DATA_REQUEST:
      return {
        ...state,
        data: null,
        error: null,
        loading: true,
      };
    case actions.FETCH_GENES_DATA_SUCCESS:
      return {
        ...state,
        data: action.data,
        optionsList: action.optionsList,
        loading: false,
      };
    case actions.FETCH_GENES_DATA_FAILED:
      return {
        ...state,
        error: action.error,
        loading: false,
      };
    default:
      return state;
  }
}
