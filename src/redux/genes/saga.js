import { all, takeEvery, put, call } from "redux-saga/effects";
import * as d3 from "d3";
import { loadArrowTable } from "../../helpers/utility";
import actions from "./actions";

function* fetchArrowData(plot) {
  yield loadArrowTable(plot.path)
    .then((results) => (plot.data = results))
    .catch((error) => {
      console.log(plot.path, error);
      plot.data = null;
    });
}

function* fetchGenesData(action) {
  try {
    let reference = "hg19";
    let genesPlot = {
      path: `genes/${reference}.arrow`,
      data: null,
    };
    yield call(fetchArrowData, genesPlot);
    let genesData = genesPlot.data;

    let genesPlotData = genesData;
    let geneTypes = genesData.getChild("type").toArray();
    let geneTypesIndexes = geneTypes
      .map((d, i) => (d === "gene" ? i : undefined))
      .filter((x) => x);
    let geneTitles = genesPlotData.getChild("title").toArray();
    let genesOptionsList = geneTypesIndexes
      .map((d, i) => {
        return {
          label: geneTitles[d],
          value: d,
        };
      })
      .sort((a, b) =>
        d3.ascending(a.label.toLowerCase(), b.label.toLowerCase())
      );

    yield put({
      type: actions.FETCH_GENES_DATA_SUCCESS,
      data: genesData,
      optionsList: genesOptionsList,
      geneTypes,
      geneTitles,
      genesStartPoint: genesData.getChild("startPlace").toArray(),
      genesEndPoint: genesData.getChild("endPlace").toArray(),
      genesY: genesData.getChild("y").toArray(),
      genesColor: genesData.getChild("color").toArray(),
      genesStrand: genesData.getChild("strand").toArray(),
      genesWeight: genesData.getChild("weight").toArray(),
    });
  } catch (error) {
    yield put({
      type: actions.FETCH_GENES_DATA_FAILED,
      error,
    });
  }
}

function* actionWatcher() {
  yield takeEvery(actions.FETCH_GENES_DATA_REQUEST, fetchGenesData);
}
export default function* rootSaga() {
  yield all([actionWatcher()]);
}
