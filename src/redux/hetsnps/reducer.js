import actions from "./actions";

const initState = {
  loading: false,
  filename: "hetsnps.arrow",
  dataPointsY1: [],
  dataPointsY2: [],
  dataPointsX: [],
  dataPointsColor: [],
  error: null,
};

export default function appReducer(state = initState, action) {
  switch (action.type) {
    case actions.FETCH_HETSNPS_DATA_REQUEST:
      return {
        ...state,
        dataPointsY1: [],
        dataPointsY2: [],
        dataPointsX: [],
        dataPointsColor: [],
        error: null,
        loading: true,
      };
    case actions.FETCH_HETSNPS_DATA_SUCCESS:
      return {
        ...state,
        dataPointsY1: action.dataPointsY1,
        dataPointsY2: action.dataPointsY2,
        dataPointsX: action.dataPointsX,
        dataPointsColor: action.dataPointsColor,
        loading: false,
      };
    case actions.FETCH_HETSNPS_DATA_FAILED:
      return {
        ...state,
        dataPointsY1: [],
        dataPointsY2: [],
        dataPointsX: [],
        dataPointsColor: [],
        error: action.error,
        loading: false,
      };
    default:
      return state;
  }
}
