import actions from "./actions";
import {
  domainsToLocation,
  locationToDomains,
  reportAttributesMap,
} from "../../helpers/utility";

const initState = {
  loading: false,
  genomeLength: 0,
  maxGenomeLength: 4294967296,
  zoomedByCmd: false,
  domains: [],
  chromoBins: {},
  genome: {
    connections: [],
    intervals: [],
    settings: {
      description: "",
      y_axis: { title: "copy number", visible: true },
    },
  },
  hoveredLocation: null,
  selectedFilteredEvent: null,
  reports: [],
  report: null,
  populations: [],
  populationMetrics: [],
  variantQC: [],
  ppFitImage: null,
  ppfit: { settings: {}, intervals: [], connections: [] },
};

export default function appReducer(state = initState, action) {
  let url = null;
  switch (action.type) {
    case actions.BOOT_APP:
      return {
        ...state,
        loading: true,
      };
    case actions.BOOT_APP_SUCCESS:
      return {
        ...state,
        ...action.properties,
        loading: false,
      };
    case actions.SELECT_REPORT:
      url = new URL(decodeURI(document.location));
      if (action.report) {
        url.searchParams.set("report", action.report);
        window.history.replaceState(
          unescape(url.toString()),
          "Case Report",
          unescape(url.toString())
        );
      }
      let reportMetadata = {};
      Object.values(reportAttributesMap()).forEach((key) => {
        reportMetadata[key] = null;
      });
      return {
        ...state,
        report: action.report,
        metadata: reportMetadata,
        filteredEvent: [],
        loading: true,
      };
    case actions.RESET_REPORT:
      url = new URL(decodeURI(document.location));

      // Remove the query parameter
      url.searchParams.delete("report");

      // Update the URL in the browser's history
      window.history.replaceState(
        null,
        "Case Report",
        unescape(url.toString())
      );
      return {
        ...state,
        metadata: {},
        report: null,
        filteredEvent: [],
        loading: false,
      };
    case actions.REPORT_SELECTED:
      return {
        ...state,
        ...action.properties,
        loading: false,
      };
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
        "Case Report",
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
    case actions.FILTERED_EVENT_UPDATED:
      let loc = `${action.filteredEvent.chromosome}:${action.filteredEvent.startPoint}-${action.filteredEvent.chromosome}:${action.filteredEvent.endPoint}`;
      let domsGene = locationToDomains(state.chromoBins, loc);
      // eliminate domains that are smaller than 10 bases wide
      if (domsGene.length > 1) {
        domsGene = domsGene.filter((d) => d[1] - d[0] > 10);
      }
      let urlGene = new URL(decodeURI(document.location));
      urlGene.searchParams.set(
        "location",
        domainsToLocation(state.chromoBins, domsGene)
      );
      window.history.replaceState(
        unescape(urlGene.toString()),
        "Case Report",
        unescape(urlGene.toString())
      );
      return {
        ...state,
        selectedFilteredEvent: action.filteredEvent,
        domains: domsGene,
        loading: false,
      };
    default:
      return state;
  }
}
