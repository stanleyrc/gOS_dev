import actions from "./actions";

const initState = {
  loading: false,
  loadingPercentage: null,
  filename: "mutations.json",
  data: {
    settings: {},
    intervals: [],
    connections: [],
    intervalBins: {},
    frameConnections: [],
  },
  error: null,
};

export default function appReducer(state = initState, action) {
  switch (action.type) {
    case actions.FETCH_MUTATIONS_DATA_REQUEST:
      return {
        ...state,
        loadingPercentage: 0,
        error: null,
        data: {
          settings: {},
          intervals: [],
          connections: [],
          intervalBins: {},
          frameConnections: [],
        },
        loading: true,
      };
    case actions.FETCH_MUTATIONS_DATA_REQUEST_LOADING:
      return {
        ...state,
        loadingPercentage: action.loadingPercentage,
        loading: true,
      };
    case actions.FETCH_MUTATIONS_DATA_SUCCESS:
      return {
        ...state,
        loadingPercentage: 100,
        data: action.data,
        loading: false,
      };
    case actions.FETCH_MUTATIONS_DATA_FAILED:
      return {
        ...state,
        loadingPercentage: null,
        data: {
          settings: {},
          intervals: [],
          connections: [],
          intervalBins: {},
          frameConnections: [],
        },
        error: action.error,
        loading: false,
      };
    default:
      return state;
  }
}
