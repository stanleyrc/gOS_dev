import actions from "./actions";

const initState = {
  datafiles: [],
  selectedTags: [],
  filteredTags: [],
  filteredFiles: [],
  selectedFiles: [],
  selectedFile: null,
  files: [],
  plots: [],
};

export default function appReducer(state = initState, action) {
  switch (action.type) {
    case actions.LAUNCH_APP:
      return {
        ...state,
        loading: true,
        files: action.files,
        selectedTags: action.selectedTags,
      };
    case actions.LAUNCH_APP_SUCCESS:
      return { ...state, ...action.properties, loading: false };
    case actions.LAUNCH_APP_FAILED:
      return { ...state, missingDataFiles: true, loading: false };
    default:
      return state;
  }
}
