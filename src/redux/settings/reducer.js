import actions from "./actions";
import { domainsToLocation } from "../../helpers/utility";

const initState = {
  loading: false,
  data: {},
  selectedCoordinate: "hg19",
  report: null,
  dataset: {
    id: "demo",
    title: "Demo Dataset",
    datafilesPath: "datafiles.json",
    commonPath: "common/",
    dataPath: "data/",
  },
  tab: 1,
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
      url.searchParams.set(
        "location",
        domainsToLocation(action.chromoBins, action.domains)
      );
      window.history.replaceState(
        unescape(url.toString()),
        "Case Report",
        unescape(url.toString())
      );
      return {
        ...state,
        data: action.data,
        selectedCoordinate: action.selectedCoordinate,
        chromoBins: action.chromoBins,
        defaultDomain: action.defaultDomain,
        domains: action.domains,
        genomeLength: action.genomeLength,
        loading: false,
      };
    case actions.FETCH_SETTINGS_DATA_FAILED:
      return {
        ...state,
        error: action.error,
        loading: false,
      };
    case actions.UPDATE_DOMAINS:
      let doms = action.domains;
      // eliminate domains that are smaller than 10 bases wide
      if (doms.length > 1) {
        doms = doms.filter((d) => d[1] - d[0] > 10);
      }
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
      }
      window.history.replaceState(
        unescape(url0.toString()),
        "Case Report",
        unescape(url0.toString())
      );
      return { ...state, report: action.report };
    case actions.UPDATE_DATASET:
      let dataset = action.dataset;
      let rep = action.report;
      url0 = new URL(decodeURI(document.location));
      if (dataset) {
        url0.searchParams.set("dataset", dataset.id);
      } else {
        url0.searchParams.delete("dataset");
      }
      if (rep) {
        url0.searchParams.set("report", rep);
      } else {
        url0.searchParams.delete("report");
      }
      // if all selected files are have the same reference
      url0.searchParams.delete("gene");
      window.history.replaceState(
        unescape(url0.toString()),
        "Case Report",
        unescape(url0.toString())
      );
      return {
        ...state,
        dataset: action.dataset,
        report: rep,
      };
    default:
      return state;
  }
}
