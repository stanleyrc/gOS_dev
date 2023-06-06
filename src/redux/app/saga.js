import { all, takeEvery, put } from "redux-saga/effects";
import axios from "axios";
import * as d3 from "d3";
import {
  legendColors,
  updateChromoBins,
  domainsToLocation,
  locationToDomains,
} from "../../helpers/utility";
import actions from "./actions";

const PLOT_TYPES = {
  coverageVariance: "histogram",
  snvCount: "histogram",
  svCount: "histogram",
  lohFraction: "histogram",
  purity: "histogram",
  ploidy: "histogram",
};

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
        let plots = Object.keys(PLOT_TYPES).map((e) => {
          return {
            id: e,
            title: e,
            markValue: d.metadata[e],
            type: PLOT_TYPES[e],
            path: `common/${e}.json`,
          };
        });
        plots.push({
          id: "jabba",
          title: `${key} Genome Graph`,
          type: "genome",
          path: `data/${key}/jabba.json`,
        });
        return {
          file: key,
          tags: d.description,
          profile: d.profile,
          metadata: d.metadata,
          summary: d.summary,
          filteredEvents: d.filteredEvents,
          reference: `${d.profile.firstName} ${d.profile.lastName}`,
          plots: plots,
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

    let selectedFilteredEvent = selectedFiles[0]?.filteredEvents[0];

    // if all selected files are have the same reference
    let selectedCoordinate = "hg19";

    let { genomeLength, chromoBins } = updateChromoBins(
      settings.coordinates.sets[selectedCoordinate]
    );

    let defaultDomain = [1, genomeLength];
    let defaultChromosome = chromoBins[Object.keys(chromoBins)[0]];

    let domains = [];
    try {
      domains = locationToDomains(chromoBins, searchParams.get("location"));
    } catch (error) {
      domains = [[+defaultChromosome.startPlace, +defaultChromosome.endPlace]];
    }

    let url = new URL(decodeURI(document.location));
    url.searchParams.set("location", domainsToLocation(chromoBins, domains));
    url.searchParams.set("file", selectedFiles.map((d) => d.file).join(","));
    window.history.replaceState(
      unescape(url.toString()),
      "Case Report",
      unescape(url.toString())
    );

    let plots = [...selectedFiles.map((d) => d.plots).flat()];
    yield axios
      .all(
        plots
          .filter((e) => e.type === "histogram")
          .map((d) => axios.get(d.path))
      )
      .then(
        axios.spread((...responses) => {
          responses.forEach((d, i) => {
            let cutoff = Infinity;
            plots[i].data = d.data
              .map((d) => +d.value)
              .filter((d) => d < cutoff)
              .sort((a, b) => d3.ascending(a, b));
            plots[i].q1 = d3.quantile(plots[i].data, 0.25);
            plots[i].q3 = d3.quantile(plots[i].data, 0.75);
            plots[i].q99 = d3.quantile(plots[i].data, 0.99);
            plots[i].colorMarker =
              plots[i].markValue < plots[i].q1
                ? legendColors()[0]
                : plots[i].markValue > plots[i].q3
                ? legendColors()[2]
                : legendColors()[1];
          });
        })
      )
      .catch((errors) => {
        console.log("got errors on loading dependencies", errors);
      });

    yield axios
      .all(
        plots
          .filter((d, i) => ["genome"].includes(d.type))
          .map((d) => axios.get(d.path))
      )
      .then(
        axios.spread((...responses) => {
          responses.forEach(
            (d, i) =>
              (plots.filter((d, i) => ["genome"].includes(d.type))[i].data =
                d.data)
          );
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
      genomeLength,
      selectedCoordinate,
      domains,
      chromoBins,
      defaultDomain,
      selectedFilteredEvent,
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
