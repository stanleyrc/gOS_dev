import { all, takeEvery, put } from "redux-saga/effects";
import axios from "axios";
import * as d3 from "d3";
import { legendColors } from "../../helpers/utility";
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
          profile: d.profile,
          metadata: d.metadata,
          summary: d.summary,
          reference: `${d.profile.firstName} ${d.profile.lastName}`,
          plots: [
            "coverageVariance",
            "snvCount",
            "svCount",
            "lohFraction",
            "purity",
            "ploidy",
          ].map((e) => {
            return {
              id: e,
              title: e,
              markValue: d.metadata[e],
              type: "histogram",
              path: `common/${e}.json`,
            };
          }),
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

    let url = new URL(decodeURI(document.location));

    url.searchParams.set("file", selectedFiles.map((d) => d.file).join(","));
    window.history.replaceState(
      unescape(url.toString()),
      "Case Report",
      unescape(url.toString())
    );

    let plots = [...selectedFiles.map((d) => d.plots).flat()];
    yield axios
      .all(plots.map((d) => axios.get(d.path)))
      .then(
        axios.spread((...responses) => {
          responses.forEach((d, i) => {
            plots[i].data = d.data.map((d) => +d.value);
            plots[i].mean = d3.mean(plots[i].data);
            plots[i].sigma = d3.deviation(plots[i].data);
            plots[i].colorMarker =
              plots[i].markValue < plots[i].mean - 2 * plots[i].sigma
                ? legendColors()[0]
                : plots[i].markValue > plots[i].mean + 2 * plots[i].sigma
                ? legendColors()[2]
                : legendColors()[1];
          });
        })
      )
      .catch((errors) => {
        console.log("got errors on loading dependencies", errors);
      });

    let properties = {
      datafiles: files,
      filteredFiles,
      filteredTags,
      tags,
      selectedFiles,
      selectedFile: selectedFiles[0],
      plots,
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
