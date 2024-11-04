import actions from "./actions";

const initState = {
  loading: false,
  filename: "complex.json",
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
    case actions.FETCH_GENOME_DATA_REQUEST:
      return {
        ...state,
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
    case actions.FETCH_GENOME_DATA_SUCCESS:
      return {
        ...state,
        data: action.data,
        loading: false,
      };
    case actions.FETCH_GENOME_DATA_FAILED:
      return {
        ...state,
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
