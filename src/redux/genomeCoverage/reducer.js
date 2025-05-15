import actions from "./actions";

const initState = {
  loading: false,
  filename: "coverage.arrow",
  dataPointsCount: [],
  dataPointsCopyNumber: [],
  dataPointsX: [],
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
        dataPointsColor: action.dataPointsColor,
        loading: false,
      };
    case actions.FETCH_COVERAGE_DATA_FAILED:
      return {
        ...state,
        dataPointsCount: [],
        dataPointsCopyNumber: [],
        dataPointsX: [],
        dataPointsColor: [],
        error: action.error,
        loading: false,
      };
    default:
      return state;
  }
}
