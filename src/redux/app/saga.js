import { all, takeEvery, put } from "redux-saga/effects";
import axios from "axios";
import * as d3 from "d3";
import actions from "./actions";

function* launchApplication(action) {
  const { responseSettings, responseDatafiles } = yield axios
    .all([axios.get("settings.json"), axios.get("datafiles.json")])
    .then(
      axios.spread((responseSettings, responseDatafiles) => {
        return { ...{ responseSettings, responseDatafiles } };
      })
    )
    .catch((errors) => {
      console.log("got errors", errors);
    });
  if (responseSettings && responseDatafiles) {
    let settings = responseSettings.data;
    let datafiles = responseDatafiles.data;

    let files = Object.keys(datafiles)
      .map((key, i) => {
        let d = datafiles[key];
        return {
          file: key,
          tags: d.description,
          plots: d.plots.map((e) => {
            return {
              ...e,
              title: `${key} ${e.title}`,
              path: `data/${key}/${e.source}`,
            };
          }),
          reference: d.reference,
        };
      })
      .sort((a, b) => d3.ascending(a.file, b.file));
    let tagsAll = files.map((d) => d.tags).flat();
    let tags = [
      ...d3.rollup(
        tagsAll,
        (g) => g.length,
        (d) => d
      ),
    ].sort((a, b) => d3.descending(a[1], b[1]));

    let filteredFiles = [];
    if (action.selectedTags && action.selectedTags.length > 0) {
      filteredFiles = files
        .filter(
          (d) =>
            d.tags.filter((e) => action.selectedTags.includes(e)).length ===
            action.selectedTags.length
        )
        .sort((a, b) => d3.ascending(a.file, b.file));
    }

    let filteredAllTags = [];
    let searchParams = new URL(decodeURI(document.location)).searchParams;
    let file = searchParams.get("file")
      ? searchParams.get("file").split(",")
      : [];
    if (filteredFiles.length > 0) {
      file = [filteredFiles[0].file];
      filteredAllTags = filteredFiles.map((d) => d.tags).flat();
    } else {
      filteredFiles = [...files];
      filteredAllTags = tagsAll;
    }

    let filteredTags = [
      ...d3.rollup(
        filteredAllTags,
        (g) => g.length,
        (d) => d
      ),
    ].sort((a, b) => d3.descending(a[1], b[1]));

    if (action.files) {
      file = action.files;
    }

    let selectedFiles = files.filter((d) =>
      (action.files || file || []).includes(d.file)
    );

    let properties = {
      datafiles: files,
      filteredFiles,
      filteredTags,
      tags,
      selectedFiles,
    };
    yield put({ type: actions.LAUNCH_APP_SUCCESS, properties });
  } else {
    yield put({ type: actions.LAUNCH_APP_FAILED });
  }
}

function* actionWatcher() {
  yield takeEvery(actions.LAUNCH_APP, launchApplication);
}
export default function* rootSaga() {
  yield all([actionWatcher()]);
}
