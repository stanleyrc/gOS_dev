import actions from "./actions";

const initState = {
  loading: false,
  records: [],
  error: null,
  selectionError: null,
};

export default function appReducer(state = initState, action) {
  switch (action.type) {
    case actions.FETCH_DATASETS_REQUEST:
      return {
        ...state,
        error: null,
        selectionError: null,
        records: [],
        loading: true,
      };
    case actions.FETCH_DATASETS_SUCCESS:
      return {
        ...state,
        records: action.records,
        selectionError: null,
        loading: false,
      };
    case actions.FETCH_DATASETS_FAILED:
      return {
        ...state,
        records: [],
        error: action.error,
        loading: false,
      };
    case actions.SELECT_DATASET_FAILED:
      return {
        ...state,
        selectionError: action.error,
        loading: false,
      };
    default:
      return state;
  }
}
