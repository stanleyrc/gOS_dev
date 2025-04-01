import actions from "./actions";

const initState = {
  loading: false,
  filenameTumor: "tumor.bam",
  filenameTumorIndex: "tumor.bam.bai",
  filenameNormal: "normal.bam",
  filenameNormalIndex: "normal.bam.bai",
  format: "bam",
  filenameTumorPresent: null,
  filenameNormalPresent: null,
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
        filenameTumorPresent: action.filenameTumorPresent,
        filenameNormalPresent: action.filenameNormalPresent,
        missingFiles: action.missingFiles,
        loading: false,
      };
    default:
      return state;
  }
}
