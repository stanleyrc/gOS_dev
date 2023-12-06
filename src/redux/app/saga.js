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
} from "../../helpers/utility";
import { getCurrentState } from "./selectors";
import actions from "./actions";

const PLOT_TYPES = {
  coverageVariance: "histogram",
  snvCount: "histogram",
  svCount: "histogram",
  lohFraction: "histogram",
  purity: "histogram",
  ploidy: "histogram",
};

function* bootApplication(action) {
  // get the list of all cases from the public/datafiles.json
  let responseReports = yield call(axios.get, "datafiles.json");

  let datafiles = responseReports.data;

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

  let properties = {
    reports: datafiles,
    settings: responseSettings.data,
    populationMetrics,
    populations,
    domains,
    chromoBins,
    defaultDomain,
    genomeLength,
  };

  yield put({
    type: actions.BOOT_APP_SUCCESS,
    properties,
  });
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

    properties.genome = responseGenomeData.data || [];

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
  }
  yield put({
    type: actions.REPORT_SELECTED,
    properties,
  });
}

function* actionWatcher() {
  yield takeEvery(actions.BOOT_APP, bootApplication);
  yield takeEvery(actions.BOOT_APP_SUCCESS, followUpBootApplication);
  yield takeEvery(actions.SELECT_REPORT, selectReport);
}
export default function* rootSaga() {
  yield all([actionWatcher()]);
}
