import actions from "./actions";

const initState = {
  loading: false,
  filename: "coverage.arrow",
  dataPointsCount: [],
  dataPointsCopyNumber: [],
  dataPointsX: [],
  dataPointsXHigh: [],
  dataPointsXLow: [],
  dataPointsColor: [],
  error: null,
};

export default function appReducer(state = initState, action) {
  switch (action.type) {
    case actions.FETCH_COVERAGE_DATA_REQUEST:
      return {
        ...state,
        dataPointsCount: [],
        dataPointsCopyNumber: [],
        dataPointsX: [],
        dataPointsXHigh: [],
        dataPointsXLow: [],
        dataPointsColor: [],
        error: null,
        loading: true,
      };
    case actions.FETCH_COVERAGE_DATA_SUCCESS:
      return {
        ...state,
        dataPointsCount: action.dataPointsCount,
        dataPointsCopyNumber: action.dataPointsCopyNumber,
        dataPointsX: action.dataPointsX,
        dataPointsXHigh: action.dataPointsXHigh,
        dataPointsXLow: action.dataPointsXLow,
        dataPointsColor: action.dataPointsColor,
        loading: false,
      };
    case actions.FETCH_COVERAGE_DATA_FAILED:
      return {
        ...state,
        dataPointsCount: [],
        dataPointsCopyNumber: [],
        dataPointsX: [],
        dataPointsXHigh: [],
        dataPointsXLow: [],
        dataPointsColor: [],
        error: action.error,
        loading: false,
      };
    default:
      return state;
  }
}
