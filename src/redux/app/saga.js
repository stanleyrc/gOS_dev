import { all, takeEvery, put, call, select } from "redux-saga/effects";
import axios from "axios";
import * as d3 from "d3";
import {
  updateChromoBins,
  domainsToLocation,
  locationToDomains,
  reportAttributesMap,
  transformFilteredEventAttributes,
  plotTypes,
  getPopulationMetrics,
  sequencesToGenome,
  reportFilters,
} from "../../helpers/utility";
import { getCurrentState } from "./selectors";
import { loadArrowTable } from "../../helpers/utility";
import actions from "./actions";

const PLOT_TYPES = {
  coverageVariance: "histogram",
  snvCount: "histogram",
  svCount: "histogram",
  tmb: "histogram",
  lohFraction: "histogram",
  purity: "histogram",
  ploidy: "histogram",
};

function* fetchArrowData(plot) {
  yield loadArrowTable(plot.path)
    .then((results) => (plot.data = results))
    .catch((error) => {
      console.log(plot.path, error);
      plot.data = null;
    });
}

function* bootApplication(action) {
  // get the list of all cases from the public/datafiles.json
  let responseReports = yield call(axios.get, "datafiles.json");

  let datafiles = responseReports.data;

  let reportsFilters = [];

  // yield axios
  //   .all(
  //     reportFilters().map((filter) =>
  //       axios.get(`/api/case_reports_filters`, { params: { filter } })
  //     )
  //   )
  //   .then(
  //     axios.spread((...responses) => {
  //       responses.forEach((d, i) => {
  //         reportsFilters.push(d.data);
  //       });
  //     })
  //   )
  //   .catch((errors) => {
  //     console.log("got errors on loading dependencies", errors);
  //   });

  // Iterate through each filter
  reportFilters().forEach((filter) => {
    // Extract distinct values for the current filter
    var distinctValues = [
      ...new Set(datafiles.map((record) => record[filter])),
    ].sort((a, b) => d3.ascending(a, b));

    // Add the filter information to the reportsFilters array
    reportsFilters.push({
      filter: filter,
      records: [...distinctValues],
    });
  });

  // get the settings within the public folder
  let responseSettings = yield call(axios.get, "settings.json");

  const responses = yield all(
    Object.keys(PLOT_TYPES).map((e) => call(axios.get, `common/${e}.json`))
  );

  let populations = {};
  Object.keys(plotTypes()).forEach((d, i) => {
    populations[d] = responses[i].data;
  });

  // Extract the data from the responses and store it in an object
  const populationMetrics = Object.keys(plotTypes()).map((d, i) => {
    let plot = {};
    let cutoff = Infinity;
    plot.id = d;
    plot.type = plotTypes()[d];
    plot.scaleX = plotTypes()[d].scaleX;
    plot.data = responses[i].data
      .map((d) => +d.value)
      .filter((d) => d < cutoff)
      .sort((a, b) => d3.ascending(a, b));
    plot.q1 = d3.quantile(plot.data, 0.25);
    plot.q3 = d3.quantile(plot.data, 0.75);
    plot.q99 = d3.quantile(plot.data, 0.99);
    return plot;
  });

  // if all selected files are have the same reference
  let selectedCoordinate = "hg19";
  let searchParams = new URL(decodeURI(document.location)).searchParams;

  let { genomeLength, chromoBins } = updateChromoBins(
    responseSettings.data.coordinates.sets[selectedCoordinate]
  );

  let defaultDomain = [1, genomeLength];

  let domains = [];
  try {
    domains = locationToDomains(chromoBins, searchParams.get("location"));
  } catch (error) {
    domains = [[1, genomeLength]];
  }

  let url = new URL(decodeURI(document.location));
  url.searchParams.set("location", domainsToLocation(chromoBins, domains));
  window.history.replaceState(
    unescape(url.toString()),
    "Case Report",
    unescape(url.toString())
  );
  let tab = searchParams.get("tab") || 1;

  let properties = {
    datafiles,
    reportsFilters,
    populationMetrics,
    populations,
    settings: responseSettings.data,
    domains,
    chromoBins,
    defaultDomain,
    genomeLength,
    tab,
  };

  yield put({
    type: actions.BOOT_APP_SUCCESS,
    properties,
  });
}

function* searchReports({ searchFilters }) {
  const currentState = yield select(getCurrentState);
  let { datafiles } = currentState.App;

  let records = datafiles.sort((a, b) => d3.ascending(a.pair, b.pair));
  let page = searchFilters?.page || 1;
  let perPage = searchFilters?.per_page || 10;
  let actualSearchFilters = Object.fromEntries(
    Object.entries(searchFilters || {}).filter(
      ([key, value]) =>
        key !== "page" &&
        key !== "per_page" &&
        value !== null &&
        value !== undefined &&
        !(Array.isArray(value) && value.length === 0)
    )
  );

  Object.keys(actualSearchFilters).forEach((key) => {
    if (key === "texts") {
      records = records.filter((record) =>
        reportFilters()
          .map((attr) => record[attr] || "")
          .join(",")
          .toLowerCase()
          .includes(actualSearchFilters[key].toLowerCase())
      );
    } else {
      records = records.filter((d) =>
        actualSearchFilters[key].includes(d[key])
      );
    }
  });

  yield put({
    type: actions.REPORTS_FETCHED,
    reports: records.slice((page - 1) * perPage, page * perPage),
    totalReports: records.length,
  });

  // const json = yield axios
  //   .get(`/api/case_reports`, { params: { ...searchFilters } })
  //   .then((response) => response);
  // yield put({
  //   type: actions.REPORTS_FETCHED,
  //   reports: json.data.records,
  //   totalReports: json.data.total,
  // });
}

function* followUpBootApplication(action) {
  let searchParams = new URL(decodeURI(document.location)).searchParams;
  let report = searchParams.get("report");

  yield put({
    type: actions.SELECT_REPORT,
    report,
  });
}

function* selectReport(action) {
  const currentState = yield select(getCurrentState);
  let { report } = action;
  let properties = { metadata: {}, filteredEvents: [] };
  Object.keys(reportAttributesMap()).forEach((key) => {
    properties.metadata[reportAttributesMap()[key]] = null;
  });
  if (report) {
    let responseReportMetadata = yield call(
      axios.get,
      `data/${action.report}/metadata.json`
    );

    let metadata = responseReportMetadata.data[0];

    let responseReportFilteredEvents = yield call(
      axios.get,
      `data/${action.report}/filtered.events.json`
    );

    properties.filteredEvents = transformFilteredEventAttributes(
      responseReportFilteredEvents.data || []
    );

    properties.selectedFilteredEvent = properties.filteredEvents.find(
      (e) =>
        e.gene ===
        new URL(decodeURI(document.location)).searchParams.get("gene")
    );

    Object.keys(responseReportMetadata.data[0]).forEach((key) => {
      properties.metadata[reportAttributesMap()[key]] = metadata[key];
    });

    properties.populationMetrics = getPopulationMetrics(
      currentState.App.populations,
      properties.metadata
    );

    properties.tumorPopulationMetrics = getPopulationMetrics(
      currentState.App.populations,
      properties.metadata,
      properties.metadata.tumor
    );

    let responseVartiantQC = yield call(
      axios.get,
      `data/${action.report}/strelka.qc.json`
    );

    properties.variantQC = responseVartiantQC.data || [];

    let responseGenomeData = yield call(
      axios.get,
      `data/${action.report}/complex.json`
    );

    properties.genome = responseGenomeData.data || {
      intervals: [],
      connections: [],
    };

    try {
      let responseMutationsData = yield call(
        axios.get,
        `data/${action.report}/mutations.json`
      );

      properties.mutations = responseMutationsData.data || {
        intervals: [],
        connections: [],
      };
    } catch (err) {
      console.log(err);
    }

    try {
      let responseAllelicData = yield call(
        axios.get,
        `data/${action.report}/allelic.json`
      );

      properties.allelic = responseAllelicData.data || {
        intervals: [],
        connections: [],
      };
    } catch (err) {
      console.log(err);
    }

    let responsePPFit = yield call(
      axios.get,
      `data/${action.report}/ppfit.png`,
      {
        responseType: "blob",
      }
    );

    // Extract the blob data into the ppFit image attribute
    properties.ppFitImage = responsePPFit.data;

    let responsePPfitData = yield call(
      axios.get,
      `data/${action.report}/ppfit.json`
    );

    properties.ppfit = responsePPfitData.data
      ? sequencesToGenome(responsePPfitData.data)
      : {
          settings: {},
          intervals: [],
          connections: [],
        };

    let coveragePlot = {
      path: `data/${action.report}/coverage.arrow`,
      data: null,
    };
    yield call(fetchArrowData, coveragePlot);
    properties.coverageData = coveragePlot.data;

    let hetsnpsPlot = {
      path: `data/${action.report}/hetsnps.arrow`,
      data: null,
    };
    yield call(fetchArrowData, hetsnpsPlot);
    properties.hetsnpsData = hetsnpsPlot.data;
  }
  yield put({
    type: actions.REPORT_SELECTED,
    properties,
  });
}

function* loadGenes(action) {
  let selectedCoordinate = "hg19";
  let genesPlot = {
    path: `genes/${selectedCoordinate}.arrow`,
    data: null,
  };
  yield call(fetchArrowData, genesPlot);
  let genesData = genesPlot.data;

  let properties = {
    genesData,
  };

  yield put({
    type: actions.GENES_LOADED,
    properties,
  });
}

function* loadFilteredEvent(action) {
  const currentState = yield select(getCurrentState);
  const { selectedFilteredEvent } = currentState.App;

  yield put({
    type: actions.FILTERED_EVENT_UPDATED,
    filteredEvent: selectedFilteredEvent,
  });
}

function* actionWatcher() {
  yield takeEvery(actions.BOOT_APP, bootApplication);
  yield takeEvery(actions.LOAD_GENES, loadGenes);
  yield takeEvery(actions.BOOT_APP_SUCCESS, followUpBootApplication);
  yield takeEvery(actions.SELECT_REPORT, selectReport);
  yield takeEvery(actions.REPORT_SELECTED, loadFilteredEvent);
  yield takeEvery(actions.SEARCH_REPORTS, searchReports);
  yield takeEvery(actions.RESET_REPORT, searchReports);
  yield takeEvery(actions.BOOT_APP_SUCCESS, searchReports);
}
export default function* rootSaga() {
  yield all([actionWatcher()]);
}
