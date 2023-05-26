import actions from "./actions";
import { domainsToLocation } from "../../helpers/utility";

const initState = {
  datafiles: [],
  selectedTags: [],
  filteredTags: [],
  filteredFiles: [],
  selectedFiles: [],
  selectedFile: null,
  files: [],
  plots: [],
  loading: false,
  genomeLength: 0,
  maxGenomeLength: 4294967296,
  zoomedByCmd: false,
  domains: [],
  chromoBins: {},
  hoveredLocation: null,
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
    case actions.DOMAINS_UPDATED:
      let doms = action.domains;
      // eliminate domains that are smaller than 10 bases wide
      if (doms.length > 1) {
        doms = doms.filter((d) => d[1] - d[0] > 10);
      }
      let url0 = new URL(decodeURI(document.location));
      url0.searchParams.set(
        "location",
        domainsToLocation(state.chromoBins, doms)
      );
      window.history.replaceState(
        unescape(url0.toString()),
        "Pan Genome Viewer",
        unescape(url0.toString())
      );
      return { ...state, domains: doms };
    case actions.HOVERED_LOCATION_UPDATED:
      return {
        ...state,
        hoveredLocation: action.hoveredLocation,
        hoveredLocationPanelIndex: action.hoveredLocationPanelIndex,
        loading: false,
      };
    default:
      return state;
  }
}
