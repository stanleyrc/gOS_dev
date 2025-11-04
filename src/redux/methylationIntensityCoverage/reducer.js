import actions from "./actions";

const initState = {
  loading: false,
  filename: "methylation_intensity.arrow",
  dataPointsCount: [],
  dataPointsCopyNumber: [],
  dataPointsX: [],
  dataPointsXHigh: [],
  dataPointsXLow: [],
  dataPointsColor: [],
  error: null,
  missing: false,
};

export default function appReducer(state = initState, action) {
  switch (action.type) {
    case actions.FETCH_METHYLATION_INTENSITY_DATA_REQUEST:
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
        missing: false,
      };
    case actions.FETCH_METHYLATION_INTENSITY_DATA_SUCCESS:
      return {
        ...state,
        dataPointsCount: action.dataPointsCount,
        dataPointsCopyNumber: action.dataPointsCopyNumber,
        dataPointsX: action.dataPointsX,
        dataPointsXHigh: action.dataPointsXHigh,
        dataPointsXLow: action.dataPointsXLow,
        dataPointsColor: action.dataPointsColor,
        loading: false,
        missing: false,
      };
    case actions.FETCH_METHYLATION_INTENSITY_DATA_FAILED:
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
        missing: false,
      };
    case actions.FETCH_METHYLATION_INTENSITY_DATA_MISSING:
      return {
        ...state,
        dataPointsCount: [],
        dataPointsCopyNumber: [],
        dataPointsX: [],
        dataPointsXHigh: [],
        dataPointsXLow: [],
        dataPointsColor: [],
        error: null,
        loading: false,
        missing: true,
      };
    default:
      return state;
  }
}
