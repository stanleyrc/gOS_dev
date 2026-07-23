import actions from "./actions";
import {
  updateChromoBins,
  domainsToLocation,
  locationToDomains,
} from "../../helpers/utility";
import {
  ALL_DATASETS_ROUTE_VALUE,
  datasetBrowseScope,
  hasBrowseScope,
  isAllDatasetsBrowseScope,
} from "../../helpers/browseScope";

const isLocationWithinChromosomes = (location, chromoBins) =>
  `${location}`.split("|").every((range) => {
    const endpoints = range.split("-");
    return (
      endpoints.length === 2 &&
      endpoints.every((endpoint) => {
        const parts = endpoint.split(":");
        const chromosome = parts[0];
        const position = Number(parts[1]);
        const chromosomeBin = chromoBins[chromosome];
        return (
          parts.length === 2 &&
          chromosomeBin &&
          Number.isFinite(position) &&
          position >= chromosomeBin.startPoint &&
          position <= chromosomeBin.endPoint
        );
      })
    );
  });

const areValidDomains = (domains, genomeLength) =>
  Array.isArray(domains) &&
  domains.length > 0 &&
  domains.every(
    (domain) =>
      Array.isArray(domain) &&
      domain.length === 2 &&
      Number.isFinite(domain[0]) &&
      Number.isFinite(domain[1]) &&
      domain[0] >= 1 &&
      domain[1] >= domain[0] &&
      domain[1] <= genomeLength,
  );

const initState = {
  loading: false,
  data: {},
  report: null,
  datasetInitialized: false,
  dataset: {
    id: "demo",
    title: "Demo Dataset",
    datafilesPath: "datafiles.json",
    commonPath: "common/",
    dataPath: "data/",
    reference: "hg19",
  },
  browseScope: null,
  tab: 1,
  hoveredLocation: null,
  hoveredLocationPanelIndex: null,
  zoomedByCmd: false,
  chromoBins: {},
  domains: [],
  defaultDomain: null,
  genomeLength: 0,
  error: null,
};

export default function appReducer(state = initState, action) {
  let url0 = new URL(decodeURI(document.location));
  switch (action.type) {
    case actions.LAUNCH_APPLICATION:
      url0 = new URL(decodeURI(document.location));
      let tab0 =
        new URL(decodeURI(document.location)).searchParams.get("tab") || 1;
      url0.searchParams.set("tab", tab0);
      window.history.replaceState(
        unescape(url0.toString()),
        "Case Report",
        unescape(url0.toString())
      );
      return {
        ...state,
        error: null,
        report: new URL(decodeURI(document.location)).searchParams.get(
          "report"
        ),
        tab: tab0,
        loading: true,
      };
    case actions.FETCH_SETTINGS_DATA_REQUEST:
      return {
        ...state,
        error: null,
        data: {},
        loading: true,
      };
    case actions.FETCH_SETTINGS_DATA_SUCCESS:
      let url = new URL(decodeURI(document.location));
      if (!url.searchParams.get("location")) {
        url.searchParams.set(
          "location",
          domainsToLocation(action.chromoBins, action.domains)
        );
      }
      window.history.replaceState(
        unescape(url.toString()),
        "Case Report",
        unescape(url.toString())
      );
      return {
        ...state,
        data: action.data,
        chromoBins: action.chromoBins,
        defaultDomain: action.defaultDomain,
        domains: action.domains,
        genomeLength: action.genomeLength,
        signatureTitles: action.signatureTitles,
        loading: false,
      };
    case actions.FETCH_SETTINGS_DATA_FAILED:
      return {
        ...state,
        error: action.error,
        loading: false,
      };
    case actions.HOVERED_LOCATION_UPDATED:
      return {
        ...state,
        hoveredLocation: action.hoveredLocation,
        hoveredLocationPanelIndex: action.hoveredLocationPanelIndex,
        loading: false,
      };
    case actions.UPDATE_DOMAINS:
      let doms = action.domains;
      // eliminate domains that are smaller than 10 bases wide
      if (doms.length > 1) {
        doms = doms.filter((d) => d[1] - d[0] > 10);
      }
      doms = [...new Set(doms)]; // remove duplicates
      url0 = new URL(decodeURI(document.location));
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
    case actions.UPDATE_TAB:
      let tab = action.tab;
      let urlTab = new URL(decodeURI(document.location));
      urlTab.searchParams.set("tab", tab);
      window.history.replaceState(
        unescape(urlTab.toString()),
        "Case Report",
        unescape(urlTab.toString())
      );
      return { ...state, tab: tab };
    case actions.UPDATE_CASE_REPORT:
      let report = action.report;
      url0 = new URL(decodeURI(document.location));
      if (report) {
        url0.searchParams.set("report", report);
      } else {
        url0.searchParams.delete("report");
        url0.searchParams.delete("gene");
        url0.searchParams.delete("tab");
        if (isAllDatasetsBrowseScope(state.browseScope)) {
          url0.searchParams.delete("dataset");
        }
      }
      window.history.replaceState(
        unescape(url0.toString()),
        "Case Report",
        unescape(url0.toString())
      );
      return { ...state, report: action.report };
    case actions.UPDATE_BROWSE_SCOPE:
      const browseReport = action.report || null;
      url0 = new URL(decodeURI(document.location));
      if (isAllDatasetsBrowseScope(action.browseScope)) {
        url0.searchParams.set("scope", ALL_DATASETS_ROUTE_VALUE);
        if (!browseReport) {
          url0.searchParams.delete("dataset");
          url0.searchParams.delete("report");
          url0.searchParams.delete("gene");
          url0.searchParams.delete("tab");
        }
      }
      window.history.replaceState(
        unescape(url0.toString()),
        "Case Report",
        unescape(url0.toString())
      );
      return {
        ...state,
        browseScope: action.browseScope,
        report: browseReport,
      };
    case actions.UPDATE_DATASET:
      let dataset = action.dataset;
      let rep = action.report;
      if (!dataset) {
        return { ...state, dataset: null, report: rep };
      }

      const nextBrowseScope =
        action.preserveBrowseScope && hasBrowseScope(state.browseScope)
          ? state.browseScope
          : datasetBrowseScope(dataset.id);
      let selectedCoordinate = dataset.reference;
      url0 = new URL(decodeURI(document.location));
      if (isAllDatasetsBrowseScope(nextBrowseScope)) {
        url0.searchParams.set("scope", ALL_DATASETS_ROUTE_VALUE);
        if (rep) {
          url0.searchParams.set("dataset", dataset.id);
        } else {
          url0.searchParams.delete("dataset");
        }
      } else {
        url0.searchParams.delete("scope");
        url0.searchParams.set("dataset", dataset.id);
      }
      if (rep) {
        url0.searchParams.set("report", rep);
      } else {
        url0.searchParams.delete("report");
      }
      url0.searchParams.delete("gene");
      let { genomeLength, chromoBins } = updateChromoBins(
        state.data.coordinates.sets[selectedCoordinate]
      );
      const defaultDomains = [[1, genomeLength]];
      const referenceChanged =
        state.dataset?.reference &&
        state.dataset.reference !== selectedCoordinate;
      let nextDomains = state.domains;
      let replaceLocation = false;
      if (!state.datasetInitialized && url0.searchParams.get("location")) {
        try {
          const bookmarkedLocation = url0.searchParams.get("location");
          if (!isLocationWithinChromosomes(bookmarkedLocation, chromoBins)) {
            throw new Error("Invalid genomic location");
          }
          nextDomains = locationToDomains(
            chromoBins,
            bookmarkedLocation,
          );
          if (!areValidDomains(nextDomains, genomeLength)) {
            throw new Error("Invalid genomic location");
          }
        } catch (error) {
          nextDomains = defaultDomains;
          replaceLocation = true;
        }
      } else if (referenceChanged || !state.domains?.length) {
        nextDomains = defaultDomains;
        replaceLocation = true;
      }
      if (replaceLocation) {
        url0.searchParams.set(
          "location",
          domainsToLocation(chromoBins, nextDomains),
        );
      }
      window.history.replaceState(
        unescape(url0.toString()),
        "Case Report",
        unescape(url0.toString())
      );
      return {
        ...state,
        dataset: action.dataset,
        datasetInitialized: true,
        browseScope: nextBrowseScope,
        report: rep,
        genomeLength,
        chromoBins,
        domains: nextDomains,
        defaultDomain: [1, genomeLength],
      };
    default:
      return state;
  }
}
