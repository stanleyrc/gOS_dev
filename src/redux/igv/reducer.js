import actions from "./actions";

const initState = {
  loading: false,
  filenameTumor: "tumor.bam",
  filenameTumorIndex: "tumor.bam.bai",
  filenameNormal: "normal.bam",
  filenameNormalIndex: "normal.bam.bai",
  filenameTumorRna: "tumor_rna.bam",
  filenameTumorRnaIndex: "tumor_rna.bam.bai",
  filenameNormalRna: "normal_rna.bam",
  filenameNormalRnaIndex: "normal_rna.bam.bai",
  format: "bam",
  filenameTumorPresent: null,
  filenameNormalPresent: null,
  filenameTumorRnaPresent: null,
  filenameNormalRnaPresent: null,
  missingFiles: [],
  error: null,
  missing: false,
};

export default function appReducer(state = initState, action) {
  switch (action.type) {
    case actions.FETCH_IGV_DATA_REQUEST:
      return {
        ...state,
        error: null,
        loading: true,
        missing: false,
      };
    case actions.FETCH_IGV_DATA_SUCCESS:
      return {
        ...state,
        filenameTumorPresent: action.filenameTumorPresent,
        filenameNormalPresent: action.filenameNormalPresent,
        filenameTumorRnaPresent: action.filenameTumorRnaPresent,
        filenameNormalRnaPresent: action.filenameNormalRnaPresent,
        missingFiles: action.missingFiles,
        loading: false,
        missing: false,
      };
    case actions.FETCH_IGV_DATA_FAILED:
      return {
        ...state,
        error: action.error,
        loading: false,
        missing: false,
      };
    case actions.FETCH_IGV_DATA_MISSING:
      return {
        ...state,
        filenameTumorPresent: false,
        filenameNormalPresent: false,
        filenameTumorRnaPresent: false,
        filenameNormalRnaPresent: false,
        missingFiles: [],
        loading: false,
        error: null,
        missing: true,
      };
    default:
      return state;
  }
}
