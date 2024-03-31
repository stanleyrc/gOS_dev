import actions from "./actions";
import {
  domainsToLocation,
  locationToDomains,
  reportAttributesMap,
} from "../../helpers/utility";

const initState = {
  loading: false,
  tab: 1,
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
  mutations: null,
  hoveredLocation: null,
  selectedFilteredEvent: null,
  datafiles: [],
  reports: [],
  totalReports: 0,
  report: null,
  reportsFilters: [],
  searchFilters: { page: 1, per_page: 10 },
  populations: [],
  populationMetrics: [],
  variantQC: [],
  ppFitImage: null,
  genesData: null,
  ppfit: { settings: {}, intervals: [], connections: [] },
  allelic: null,
  metadata: {
    pair: null,
    tumor_type: null,
    disease: null,
    primary_site: null,
    inferred_sex: null,
    dlrs: 0,
    snv_count: 0,
    sv_count: 0,
    loh_fraction: 0,
    loh_seglen: 0,
    loh_total_genome: 0,
    purity: 0,
    ploidy: 0,
    beta: 1,
    gamma: 0,
    total_genome_length: 0,
    tmb: 0,
  },
  coverageData: null,
  hetsnpsData: null,
  renderOutsideViewPort: true,
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
    case actions.LOAD_GENES:
      return {
        ...state,
      };
    case actions.GENES_LOADED:
      return {
        ...state,
        ...action.properties,
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
        searchFilters: { texts: null },
        filteredEvent: [],
        loading: true,
      };
    case actions.RESET_REPORT:
      url = new URL(decodeURI(document.location));

      // Remove the query parameter
      url.searchParams.delete("report");
      url.searchParams.delete("tab");
      url.searchParams.delete("gene");
      // Update the URL in the browser's history
      window.history.replaceState(
        null,
        "Case Report",
        unescape(url.toString())
      );

      return {
        ...state,
        metadata: {},
        tab: 1,
        report: null,
        reports: [],
        totalReports: 0,
        searchFilters: {},
        filteredEvent: [],
        loading: false,
      };
    case actions.REPORT_SELECTED:
      return {
        ...state,
        ...action.properties,
        loading: false,
      };
    case actions.REPORT_DATA_LOADED:
      return {
        ...state,
        ...action.properties,
        loading: false,
      };
    case actions.SEARCH_REPORTS:
      return {
        ...state,
        searchFilters: action.searchFilters,
        report: null,
        loading: false,
      };
    case actions.REPORTS_FETCHED:
      return {
        ...state,
        reports: action.reports,
        totalReports: action.totalReports,
        loading: false,
      };
    case actions.TAB_SELECTED:
      let tab = action.tab;
      let urlTab = new URL(decodeURI(document.location));
      urlTab.searchParams.set("tab", tab);
      window.history.replaceState(
        unescape(urlTab.toString()),
        "Case Report",
        unescape(urlTab.toString())
      );
      return { ...state, tab: tab };
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
      let urlGene = new URL(decodeURI(document.location));
      let selectedFilteredEvent = action.filteredEvent;
      if (selectedFilteredEvent) {
        let loc = `${selectedFilteredEvent.chromosome}:${selectedFilteredEvent.startPoint}-${selectedFilteredEvent.chromosome}:${selectedFilteredEvent.endPoint}`;
        let domsGene = locationToDomains(state.chromoBins, loc);
        // eliminate domains that are smaller than 10 bases wide
        if (domsGene.length > 1) {
          domsGene = domsGene.filter((d) => d[1] - d[0] > 10);
        }
        urlGene.searchParams.set("gene", selectedFilteredEvent.gene);
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
          selectedFilteredEvent,
          domains: domsGene,
          loading: false,
        };
      } else {
        // Remove the query parameter
        urlGene.searchParams.delete("gene");
        // Update the URL in the browser's history
        window.history.replaceState(
          null,
          "Case Report",
          unescape(urlGene.toString())
        );
        return {
          ...state,
          ...action.properties,
          selectedFilteredEvent: null,
          loading: false,
        };
      }
    default:
      return state;
  }
}
