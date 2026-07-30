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
  missing: false,
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
        missing: false,
      };
    case actions.FETCH_GENOME_DATA_SUCCESS:
      return {
        ...state,
        data: action.data,
        loading: false,
        missing: false,
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
        missing: false,
      };
    case actions.FETCH_GENOME_DATA_MISSING:
      return {
        ...state,
        data: {
          settings: {},
          intervals: [],
          connections: [],
          intervalBins: {},
          frameConnections: [],
        },
        error: null,
        loading: false,
        missing: true,
      };
    default:
      return state;
  }
}
