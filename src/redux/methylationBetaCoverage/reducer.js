import actions from "./actions";

const initState = {
  loading: false,
  filename: "methylation_beta.arrow",
  dataPointsCount: [],
  dataPointsCopyNumber: [],
  dataPointsX: [],
  dataPointsColor: [],
  error: null,
  missing: false,
};

export default function appReducer(state = initState, action) {
  switch (action.type) {
    case actions.FETCH_METHYLATION_BETA_DATA_REQUEST:
      return {
        ...state,
        dataPointsCount: [],
        dataPointsCopyNumber: [],
        dataPointsX: [],
        dataPointsColor: [],
        error: null,
        loading: true,
        missing: false,
      };
    case actions.FETCH_METHYLATION_BETA_DATA_SUCCESS:
      return {
        ...state,
        dataPointsCount: action.dataPointsCount,
        dataPointsCopyNumber: action.dataPointsCopyNumber,
        dataPointsX: action.dataPointsX,
        dataPointsColor: action.dataPointsColor,
        loading: false,
        missing: false,
      };
    case actions.FETCH_METHYLATION_BETA_DATA_FAILED:
      return {
        ...state,
        dataPointsCount: [],
        dataPointsCopyNumber: [],
        dataPointsX: [],
        dataPointsColor: [],
        error: action.error,
        loading: false,
        missing: false,
      };
    case actions.FETCH_METHYLATION_BETA_DATA_MISSING:
      return {
        ...state,
        dataPointsCount: [],
        dataPointsCopyNumber: [],
        dataPointsX: [],
        dataPointsColor: [],
        error: null,
        loading: false,
        missing: true,
      };
    default:
      return state;
  }
}
