import actions from "./actions";

const initState = {
  loading: false,
  filename: "tumor.bam",
  filenameIndex: "tumor.bam.ui",
  format: "bam",
  name: null,
  filenamePresent: null,
  filenameIndexPresent: null,
  missingFiles: [],
  error: null,
};

export default function appReducer(state = initState, action) {
  switch (action.type) {
    case actions.FETCH_IGV_DATA_REQUEST:
      return {
        ...state,
        error: null,
        loading: true,
      };
    case actions.FETCH_IGV_DATA_SUCCESS:
      return {
        ...state,
        name: action.name,
        filenamePresent: action.filenamePresent,
        filenameIndexPresent: action.filenameIndexPresent,
        missingFiles: [],
        loading: false,
      };
    case actions.FETCH_IGV_DATA_FAILED:
      return {
        ...state,
        name: action.name,
        filenamePresent: action.filenamePresent,
        filenameIndexPresent: action.filenameIndexPresent,
        missingFiles: action.missingFiles,
        error: action.error,
        loading: false,
      };
    default:
      return state;
  }
}
