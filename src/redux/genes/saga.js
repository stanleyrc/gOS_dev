import { all, put, call, select, takeLatest } from "redux-saga/effects";
import * as d3 from "d3";
import axios from "axios";
import {
  loadArrowTable,
  higlassGenesFieldsArrayToObject,
} from "../../helpers/utility";
import { getCurrentState } from "./selectors";
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

function* fetchHiglassGenesInfo(action) {
  const currentState = yield select(getCurrentState);
  const { reference, higlassServerPath } = currentState.Genes;
  try {
    let responseGeneAnnotationTilesets = yield call(
      axios.get,
      `${higlassServerPath}/api/v1/tilesets`,
      { params: { limit: 1000, dt: "gene-annotation" } }
    );
    const tilesetId = responseGeneAnnotationTilesets.data.results.find(
      (d) => d.coordSystem === reference
    ).uuid;

    let responseGeneAnnotationInfo = yield call(
      axios.get,
      `${higlassServerPath}/api/v1/tileset_info`,
      { params: { d: tilesetId } }
    );
    const maxGenomeLength =
      responseGeneAnnotationInfo.data[tilesetId].max_width;

    yield put({
      type: actions.FETCH_HIGLASS_GENES_INFO_SUCCESS,
      tilesetId,
      maxGenomeLength,
    });
  } catch (error) {
    console.log(error);
    yield put({
      type: actions.FETCH_HIGLASS_GENES_INFO_FAILED,
      error,
    });
  }
}

function* fetchHiglassGenesData(action) {
  const currentState = yield select(getCurrentState);
  const { tilesetId, maxGenomeLength, higlassServerPath } = currentState.Genes;
  const { domains, chromoBins } = currentState.Settings;

  let list = [];
  try {
    let newGeneTilesets = domains.map((d, i) => {
      let zoom = 0 + Math.floor(Math.log2(maxGenomeLength / (d[1] - d[0])));
      let tile1 = Math.floor((Math.pow(2, zoom) * d[0]) / maxGenomeLength);
      let tile2 = Math.floor((Math.pow(2, zoom) * d[1]) / maxGenomeLength);
      return { domain: d, zoom: zoom, tiles: d3.range(tile1, tile2 + 1) };
    });
    yield axios
      .get(
        `${higlassServerPath}/api/v1/tiles/?${newGeneTilesets
          .map((d, i) => d.tiles.map((e, j) => `d=${tilesetId}.${d.zoom}.${e}`))
          .flat()
          .join("&")}`
      )
      .then((results) => {
        Object.values(results.data)
          .flat()
          .forEach((gene, i) => {
            list.push({
              ...gene,
              ...higlassGenesFieldsArrayToObject(gene.fields, chromoBins),
            });
          });
      })
      .catch((error) => {
        console.log(higlassServerPath, error);
        list = [];
      });

    yield put({
      type: actions.FETCH_HIGLASS_GENES_DATA_SUCCESS,
      list,
    });
  } catch (error) {
    console.log(error);
    yield put({
      type: actions.FETCH_HIGLASS_GENES_DATA_FAILED,
      error,
    });
  }
}

function* higlassGenesFetchedSuccessFollowUp(action) {
  yield put({
    type: actions.FETCH_HIGLASS_GENES_DATA_REQUEST,
  });
}

function* actionWatcher() {
  yield takeLatest(actions.FETCH_GENES_DATA_REQUEST, fetchGenesData);
  yield takeLatest(
    actions.FETCH_HIGLASS_GENES_INFO_REQUEST,
    fetchHiglassGenesInfo
  );
  yield takeLatest(
    actions.FETCH_HIGLASS_GENES_INFO_SUCCESS,
    higlassGenesFetchedSuccessFollowUp
  );
  yield takeLatest(
    actions.FETCH_HIGLASS_GENES_DATA_REQUEST,
    fetchHiglassGenesData
  );
}
export default function* rootSaga() {
  yield all([actionWatcher()]);
}
