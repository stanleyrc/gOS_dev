import actions from "./actions";

const initState = {
  loading: false,
  data: [],
  error: null,
  missing: false,
};

export default function appReducer(state = initState, action) {
  switch (action.type) {
    case actions.FETCH_BIOMARKERS_REQUEST:
      return {
        ...state,
        data: [],
        error: null,
        loading: true,
        missing: false,
      };
    case actions.FETCH_BIOMARKERS_SUCCESS:
      return {
        ...state,
        data: action.data,
        loading: false,
        missing: false,
      };
    case actions.FETCH_BIOMARKERS_FAILED:
      return {
        ...state,
        error: action.error,
        loading: false,
        missing: false,
      };
    case actions.FETCH_BIOMARKERS_MISSING:
      return {
        ...state,
        loading: false,
        missing: true,
      };
    default:
      return state;
  }
}
