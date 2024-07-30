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
  getSignatureMetrics,
  sequencesToGenome,
  reportFilters,
  nucleotideMutationText,
  deletionInsertionMutationVariant,
} from "../../helpers/utility";
import { getCurrentState } from "./selectors";
import { loadArrowTable, allelicToGenome } from "../../helpers/utility";
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
  const populationMetrics = getPopulationMetrics(populations);

  let signatures = {};

  let signaturesList = [];
  responseSettings.data.signaturesList.types.forEach((type) => {
    signatures[type] = {};
    responseSettings.data.signaturesList.modes.forEach((mode) => {
      signatures[type][mode] = {};
      responseSettings.data.signaturesList.datafiles[type].forEach((d) => {
        signaturesList.push({
          type: type,
          mode: mode,
          name: d,
          path: `common/signatures/${responseSettings.data.signaturesList.folder}_${type}_${mode}/${d}.json`,
        });
      });
    });
  });
  yield axios
    .all(signaturesList.map((e) => axios.get(e.path)))
    .then(
      axios.spread((...responses) => {
        responses.forEach(
          (d, i) =>
            (signatures[signaturesList[i].type][signaturesList[i].mode][
              signaturesList[i].name
            ] = d.data)
        );
      })
    )
    .catch((errors) => {
      console.log("got errors on loading signatures", errors);
    });

  let signatureMetrics = {};
  responseSettings.data.signaturesList.types.forEach((type) => {
    signatureMetrics[type] = {};
    responseSettings.data.signaturesList.modes.forEach((mode) => {
      signatureMetrics[type][mode] = getSignatureMetrics(
        signatures[type][mode]
      );
    });
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
    signatures,
    signatureMetrics,
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
    type: report ? actions.SELECT_REPORT : actions.RESET_REPORT,
    report,
  });
}

function* selectReport(action) {
  const currentState = yield select(getCurrentState);
  let { report } = action;
  let properties = {
    metadata: {},
    filteredEvents: [],
    signatureMetrics: [],
    tumorSignatureMetrics: [],
  };
  Object.keys(reportAttributesMap()).forEach((key) => {
    properties.metadata[reportAttributesMap()[key]] = null;
  });
  if (report) {
    let responseReportMetadata = yield call(
      axios.get,
      `data/${action.report}/metadata.json`
    );

    let metadata = responseReportMetadata.data[0];

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

    Object.keys(currentState.App.signatures).forEach((type) => {
      properties.signatureMetrics[type] = {};
      Object.keys(currentState.App.signatures[type]).forEach((mode) => {
        properties.signatureMetrics[type][mode] = getSignatureMetrics(
          currentState.App.signatures[type][mode],
          {
            markData: properties.metadata[`sigprofiler_${type}_${mode}`],
            format: mode === "fraction" ? ".4f" : ",",
            range: mode === "fraction" ? [0, 1] : null,
            scaleX: "linear",
            type: "histogram",
          }
        );
      });
    });

    Object.keys(currentState.App.signatures).forEach((type) => {
      properties.tumorSignatureMetrics[type] = {};
      Object.keys(currentState.App.signatures[type]).forEach((mode) => {
        properties.tumorSignatureMetrics[type][mode] = getSignatureMetrics(
          currentState.App.signatures[type][mode],
          {
            markData: properties.metadata[`sigprofiler_${type}_${mode}`],
            tumorType: properties.metadata.tumor,
            format: mode === "fraction" ? ".4f" : ",",
            range: mode === "fraction" ? [0, 1] : null,
          }
        );
      });
    });
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

  let genesPlotData = genesData;
  let geneTypesIndexes = genesPlotData
    .getChild("type")
    .toArray()
    .map((d, i) => (d === "gene" ? i : undefined))
    .filter((x) => x);
  let geneTitlesList = genesPlotData.getChild("title").toArray();
  let genesOptionsList = geneTypesIndexes
    .map((d, i) => {
      return {
        label: geneTitlesList[d],
        value: d,
      };
    })
    .sort((a, b) => d3.ascending(a.label.toLowerCase(), b.label.toLowerCase()));

  let properties = {
    genesData,
    genesOptionsList,
  };

  yield put({
    type: actions.GENES_LOADED,
    properties,
  });
}

function* loadFilteredEventsData(action) {
  const currentState = yield select(getCurrentState);
  const { report } = currentState.App;

  let properties = {};

  try {
    let responseReportFilteredEvents = yield call(
      axios.get,
      `data/${report}/filtered.events.json`
    );

    properties.filteredEvents = transformFilteredEventAttributes(
      responseReportFilteredEvents.data || []
    );

    properties.selectedFilteredEvent = properties.filteredEvents.find(
      (e) =>
        e.gene ===
        new URL(decodeURI(document.location)).searchParams.get("gene")
    );
  } catch (err) {
    console.log(err);
  }

  yield put({
    type: actions.REPORT_DATA_LOADED,
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

function* loadCoverageData(action) {
  const currentState = yield select(getCurrentState);
  const { report } = currentState.App;

  let properties = { coverageData: null };
  try {
    let coveragePlot = {
      path: `data/${report}/coverage.arrow`,
      data: null,
    };
    yield call(fetchArrowData, coveragePlot);
    properties = { coverageData: coveragePlot.data };
  } catch (err) {
    console.log(err);
  }

  yield put({
    type: actions.REPORT_DATA_LOADED,
    properties,
  });
}

function* loadHetSnpsData(action) {
  const currentState = yield select(getCurrentState);
  const { report } = currentState.App;

  let properties = { hetsnpsData: null };

  try {
    let hetsnpsPlot = {
      path: `data/${report}/hetsnps.arrow`,
      data: null,
    };
    yield call(fetchArrowData, hetsnpsPlot);

    properties = { hetsnpsData: hetsnpsPlot.data };
  } catch (err) {
    console.log(err);
  }

  yield put({
    type: actions.REPORT_DATA_LOADED,
    properties,
  });
}

function* loadPPFitData(action) {
  const currentState = yield select(getCurrentState);
  const { report } = currentState.App;

  let properties = {
    ppfit: {
      settings: {},
      intervals: [],
      connections: [],
    },
  };

  try {
    let responsePPfitData = yield call(axios.get, `data/${report}/ppfit.json`);

    properties = {
      ppfit: responsePPfitData.data
        ? sequencesToGenome(responsePPfitData.data)
        : {
            settings: {},
            intervals: [],
            connections: [],
          },
    };
  } catch (err) {
    console.log(err);
  }

  yield put({
    type: actions.REPORT_DATA_LOADED,
    properties,
  });
}

function* loadPPFitImageData(action) {
  const currentState = yield select(getCurrentState);
  const { report } = currentState.App;

  let properties = {
    ppFitImage: null,
  };

  try {
    let responsePPFit = yield call(axios.get, `data/${report}/ppfit.png`, {
      responseType: "blob",
    });

    properties = {
      ppFitImage: responsePPFit.data,
    };
  } catch (err) {
    console.log(err);
  }

  yield put({
    type: actions.REPORT_DATA_LOADED,
    properties,
  });
}

function* loadAllelicData(action) {
  const currentState = yield select(getCurrentState);
  const { report } = currentState.App;

  let properties = {
    allelic: {
      intervals: [],
      connections: [],
    },
  };
  try {
    let responseAllelicData = yield call(
      axios.get,
      `data/${report}/allelic.json`
    );
    properties.allelic = allelicToGenome(
      responseAllelicData.data || {
        intervals: [],
        connections: [],
      }
    );
  } catch (err) {
    console.log(err);
  }

  yield put({
    type: actions.REPORT_DATA_LOADED,
    properties,
  });
}

function* loadMutationsData(action) {
  const currentState = yield select(getCurrentState);
  const { report } = currentState.App;

  let properties = {
    mutations: {
      intervals: [],
      connections: [],
    },
  };
  try {
    let responseMutationsData = yield call(
      axios.get,
      `data/${report}/mutations.json`
    );

    properties.mutations = responseMutationsData.data || {
      intervals: [],
      connections: [],
    };
  } catch (err) {
    console.log(err);
  }

  yield put({
    type: actions.REPORT_DATA_LOADED,
    properties,
  });
}

function* loadGenomeData(action) {
  const currentState = yield select(getCurrentState);
  const { report } = currentState.App;

  let properties = {
    genome: {
      intervals: [],
      connections: [],
    },
  };

  try {
    let responseGenomeData = yield call(
      axios.get,
      `data/${report}/complex.json`
    );

    properties.genome = responseGenomeData.data || {
      intervals: [],
      connections: [],
    };
  } catch (err) {
    console.log(err);
  }

  yield put({
    type: actions.REPORT_DATA_LOADED,
    properties,
  });
}

function* loadSageQcData(action) {
  const currentState = yield select(getCurrentState);
  const { report } = currentState.App;

  let properties = {
    sageQC: [],
  };

  try {
    let responseSageQC = yield call(axios.get, `data/${report}/sage.qc.json`);

    properties.sageQC = responseSageQC.data || [];

    properties.sageQC.forEach((d, i) => {
      d.id = i + 1;
      return d;
    });
  } catch (err) {
    console.log(err);
  }

  yield put({
    type: actions.REPORT_DATA_LOADED,
    properties,
  });
}

function* loadSignatureDecomposedCatalogData(action) {
  const currentState = yield select(getCurrentState);
  const { report, metadata } = currentState.App;
  const { sigprofiler_sbs_count, sigprofiler_indel_count } = metadata;

  let properties = {
    decomposedCatalog: [],
  };

  try {
    yield axios
      .all(
        ["sbs", "id"].map((e) =>
          axios.get(`data/${report}/${e}_decomposed_prob.json`)
        )
      )
      .then(
        axios.spread((...responses) => {
          responses.forEach((d, i) => {
            let data = d.data || [];
            if (i < 1) {
              Object.entries(sigprofiler_sbs_count).forEach(
                ([signature, value]) => {
                  if (value > 0) {
                    properties.decomposedCatalog.push({
                      id: signature,
                      variantType: "sbs",
                      catalog: data
                        .filter((e) => e.signature === signature)
                        .map((d, i) => {
                          let entry = {
                            id: i,
                            signature: d.signature,
                            probability: d.p,
                            mutations: Math.round(d.p * value),
                            type: d.tnc,
                            mutationType: (d.tnc.match(/\[(.*?)\]/) || [])[1],
                            variantType: "sbs",
                            label: nucleotideMutationText(d.tnc),
                          };
                          return entry;
                        })
                        .sort((a, b) =>
                          d3.ascending(a.mutationType, b.mutationType)
                        ),
                    });
                  }
                }
              );
            } else {
              Object.entries(sigprofiler_indel_count).forEach(
                ([signature, value]) => {
                  if (value > 0) {
                    properties.decomposedCatalog.push({
                      id: signature,
                      variantType: "indel",
                      catalog: data
                        .filter((e) => e.signature === signature)
                        .map((d, i) => {
                          let { variant, label } =
                            deletionInsertionMutationVariant(d.insdel);
                          let entry = {
                            id: i,
                            variant,
                            label,
                            signature: d.signature,
                            probability: d.p,
                            mutations: Math.round(d.p * value),
                            type: d.insdel,
                            mutationType: variant,
                            variantType: "indel",
                          };
                          return entry;
                        })
                        .sort((a, b) =>
                          d3.ascending(a.mutationType, b.mutationType)
                        ),
                    });
                  }
                }
              );
            }
          });
        })
      )
      .catch((errors) => {
        console.log("got errors on loading mutation catalogs", errors);
      });
  } catch (err) {
    console.log(err);
  }

  yield put({
    type: actions.REPORT_DATA_LOADED,
    properties,
  });
}

function* loadMutationCatalogData(action) {
  const currentState = yield select(getCurrentState);
  const { report } = currentState.App;

  let properties = {
    mutationCatalog: [],
  };

  try {
    yield axios
      .all(
        ["", "id_"].map((e) =>
          axios.get(`data/${report}/${e}mutation_catalog.json`)
        )
      )
      .then(
        axios.spread((...responses) => {
          responses.forEach((d, i) => {
            if (i < 1) {
              let data = d.data.data || [];
              data.forEach((d, i) => {
                d.type = d.tnc;
                d.mutationType = (d.tnc.match(/\[(.*?)\]/) || [])[1];
                d.variantType = "sbs";
                d.label = nucleotideMutationText(d.tnc);
                properties.mutationCatalog.push(d);
              });
            } else {
              let data = d.data.data || [];
              data.forEach((d, i) => {
                let { variant, label } = deletionInsertionMutationVariant(
                  d.insdel
                );
                d.type = d.insdel;
                d.mutationType = variant;
                d.variantType = "indel";
                d.label = label;
                properties.mutationCatalog.push(d);
              });
            }
          });
          properties.mutationCatalog = properties.mutationCatalog.sort((a, b) =>
            d3.ascending(a.mutationType, b.mutationType)
          );
        })
      )
      .catch((errors) => {
        console.log("got errors on loading mutation catalogs", errors);
      });
  } catch (err) {
    console.log(err);
  }

  yield put({
    type: actions.REPORT_DATA_LOADED,
    properties,
  });
}

function* actionWatcher() {
  yield takeEvery(actions.BOOT_APP, bootApplication);
  yield takeEvery(actions.LOAD_GENES, loadGenes);
  yield takeEvery(actions.BOOT_APP_SUCCESS, followUpBootApplication);
  yield takeEvery(actions.SELECT_REPORT, selectReport);
  yield takeEvery(actions.REPORT_SELECTED, loadFilteredEventsData);
  yield takeEvery(actions.REPORT_SELECTED, loadFilteredEvent);
  yield takeEvery(actions.REPORT_SELECTED, loadCoverageData);
  yield takeEvery(actions.REPORT_SELECTED, loadHetSnpsData);
  yield takeEvery(actions.REPORT_SELECTED, loadPPFitData);
  yield takeEvery(actions.REPORT_SELECTED, loadPPFitImageData);
  yield takeEvery(actions.REPORT_SELECTED, loadAllelicData);
  yield takeEvery(actions.REPORT_SELECTED, loadMutationsData);
  yield takeEvery(actions.REPORT_SELECTED, loadGenomeData);
  yield takeEvery(actions.REPORT_SELECTED, loadSageQcData);
  yield takeEvery(actions.REPORT_SELECTED, loadMutationCatalogData);
  yield takeEvery(actions.REPORT_SELECTED, loadSignatureDecomposedCatalogData);
  yield takeEvery(actions.SEARCH_REPORTS, searchReports);
  yield takeEvery(actions.RESET_REPORT, searchReports);
  yield takeEvery(actions.BOOT_APP_SUCCESS, searchReports);
}
export default function* rootSaga() {
  yield all([actionWatcher()]);
}
