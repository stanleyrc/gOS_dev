import { all, put, call, select, takeLatest, take } from "redux-saga/effects";
import * as d3 from "d3";
import axios from "axios";
import {
  loadArrowTable,
  higlassGenesFieldsArrayToObject,
  merge,
  cluster,
  color2RGB,
} from "../../helpers/utility";
import { getCurrentState } from "./selectors";
import actions from "./actions";
import settingsActions from "../settings/actions";

function* fetchArrowData(plot) {
  yield loadArrowTable(plot.path)
    .then((results) => (plot.data = results))
    .catch((error) => {
      console.log(plot.path, error);
      plot.data = null;
    });
}

function* fetchGenesData(action) {
  const currentState = yield select(getCurrentState);
  const { dataset } = currentState.Settings;
  try {
    let reference = dataset.reference;
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

    let titlesColorMap = {};
    geneTitles.forEach((d, i) => {
      titlesColorMap[d] = color2RGB(genesData.get(i).toJSON().color);
    });

    yield put({
      type: actions.FETCH_GENES_DATA_SUCCESS,
      reference,
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
      titlesColorMap,
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
  const { dataset } = currentState.Settings;
  const { higlassServerPath } = currentState.Genes;
  let reference = dataset.higlassReference;

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
  const { tilesetId, maxGenomeLength, higlassServerPath, titlesColorMap } =
    currentState.Genes;
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
              color: titlesColorMap[gene.fields[3]],
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

function* locateGenes(action) {
  const currentState = yield select(getCurrentState);
  const { data } = currentState.Genes;
  const { genomeLength, chromoBins } = currentState.Settings;

  const { geneIndexes } = action;
  let selectedGenes = geneIndexes.map((d, i) => data.get(d).toJSON());
  console.log(selectedGenes);
  let newDomains = selectedGenes.map((d, i) => [
    d3.max([Math.floor(0.99999 * d.startPlace), 1]),
    d3.min([Math.floor(1.00001 * d.endPlace), genomeLength]),
  ]);
  if (geneIndexes.length < 1) {
    let firstChromosome = Object.values(chromoBins)[0];
    newDomains = [[firstChromosome.startPlace, firstChromosome.endPlace]];
  } else {
    let merged = merge(
      newDomains
        .map((d) => {
          return { startPlace: d[0], endPlace: d[1] };
        })
        .sort((a, b) => d3.ascending(a.startPlace, b.startPlace))
    );
    newDomains = cluster(merged, genomeLength);
  }
  yield put({
    type: settingsActions.UPDATE_DOMAINS,
    domains: newDomains,
  });
}

function* actionWatcher() {
  yield takeLatest(actions.FETCH_GENES_DATA_REQUEST, fetchGenesData);
  yield takeLatest(
    actions.FETCH_HIGLASS_GENES_INFO_REQUEST,
    fetchHiglassGenesInfo
  );
  yield takeLatest(
    actions.FETCH_HIGLASS_GENES_DATA_REQUEST,
    fetchHiglassGenesData
  );
  yield takeLatest(actions.LOCATE_GENES, locateGenes);
  yield takeLatest(actions.FETCH_GENES_DATA_SUCCESS, fetchHiglassGenesData);
  yield takeLatest(
    actions.FETCH_HIGLASS_GENES_INFO_SUCCESS,
    fetchHiglassGenesData
  );
}
export default function* rootSaga() {
  yield all([actionWatcher()]);
}
