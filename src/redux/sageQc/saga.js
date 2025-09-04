import { all, takeEvery, put, call, select, take } from "redux-saga/effects";
import axios from "axios";
import actions from "./actions";
import { createProgressChannel } from "../../helpers/progressChannel";
import {
  densityPlotFields,
  sageQcArrowTableToJson,
} from "../../helpers/sageQc";
import { locationToDomains } from "../../helpers/utility";
import { getCurrentState } from "./selectors";
import { getCancelToken } from "../../helpers/cancelToken";
import { tableFromIPC } from "apache-arrow";
import settingsActions from "../settings/actions";

function* fetchSageQc(action) {
  const currentState = yield select(getCurrentState);
  const { filename } = currentState.SageQc;
  const { dataset } = currentState.Settings;
  const { id } = currentState.CaseReport;

  const fileBase = `${dataset.dataPath}${id}/${filename}`;
  const arrowUrl = `${fileBase}.arrow`;
  const jsonUrl = `${fileBase}.json`;
  let url;
  try {
    yield call(axios.head, arrowUrl);
    url = arrowUrl;
  } catch (error) {
    url = jsonUrl;
  }

  // Set up the channel configuration

  const channelConfig = {
    url,
    cancelToken: getCancelToken(),
    responseType: url.endsWith(".arrow")
      ? "arraybuffer" // Ensure the response is in binary format
      : "json",
  };

  // Create the progress channel
  const progressChannel = yield call(createProgressChannel, channelConfig);

  try {
    while (true) {
      const result = yield take(progressChannel);
      if (result.response) {
        // The request completed successfully
        let records;
        if (url.endsWith(".arrow")) {
          // Parse Arrow data to JSON array
          try {
            const arrowBuffer = new Uint8Array(result.response.data);
            const table = yield call(tableFromIPC, arrowBuffer);
            records = sageQcArrowTableToJson(table);
          } catch (err) {
            console.error("Failed to parse Arrow data:", err);
            yield put({
              type: actions.FETCH_CASE_REPORTS_FAILED,
              error: err,
            });
            return;
          }
        } else {
          records = result.response.data;
        }

        records.forEach((d, i) => {
          d.id = i + 1;
          d.oncogenicity =
            (typeof d.oncogenic === "boolean" && d.oncogenic) ||
            (typeof d.oncogenic === "string" &&
              d.oncogenic.toLowerCase() === "true");
          d.actualLocation = d.end
            ? `${d.chromosome}:${Math.floor(0.999 * +d.position)}-${
                d.chromosome
              }:${Math.floor(1.001 * +d.end)}`
            : `${d.chromosome}:${Math.floor(0.999 * +d.position)}-${
                d.chromosome
              }:${Math.floor(1.001 * +d.position)}`;
          return d;
        });

        // Find properties that exist in at least one record
        let sageQcProperties = [
          ...new Set(records.map((d) => Object.keys(d)).flat()),
        ];

        // Filter out properties that are undefined or null in all records
        sageQcProperties = sageQcProperties.filter((prop) =>
          records.some(
            (record) => record[prop] !== undefined && record[prop] !== null
          )
        );

        let properties = densityPlotFields.filter((d) =>
          sageQcProperties.includes(d.name)
        );

        if (dataset.variant_qc_dropdown_schema) {
          // First filter the schema keys to only include properties that exist in records
          const existingProperties = Object.keys(
            dataset.variant_qc_dropdown_schema
          ).filter((prop) =>
            records.some(
              (record) => record[prop] !== undefined && record[prop] !== null
            )
          );

          properties = existingProperties.map((d) => {
            return {
              name: d,
              type: dataset.variant_qc_dropdown_schema[d],
              format:
                dataset.variant_qc_dropdown_schema[d] === "float"
                  ? "0.3f"
                  : "0.1f",
            };
          });
        }

        yield put({
          type: actions.FETCH_SAGEQC_SUCCESS,
          records,
          properties,
        });
      } else if (result.error) {
        // The request failed
        console.error(result.error);
        yield put({
          type: actions.FETCH_SAGEQC_FAILED,
          error: result.error,
        });
      } else {
        // Intermediate progress updates
        yield put({
          type: actions.FETCH_SAGEQC_REQUEST_LOADING,
          loadingPercentage: result,
        });
      }
    }
  } catch (error) {
    if (axios.isCancel(error)) {
      console.log(
        `fetch ${dataset.dataPath}${id}/${filename} request canceled`,
        error.message
      );
    } else {
      yield put({
        type: actions.FETCH_SAGEQC_FAILED,
        error,
      });
    }
  }
}

function* selectVariant(action) {
  const currentState = yield select(getCurrentState);
  let { chromoBins, defaultDomain } = currentState.Settings;
  let { variant } = action;
  let selectedVariant = variant;
  let urlVariant = new URL(decodeURI(document.location));
  if (selectedVariant) {
    let loc = selectedVariant.actualLocation;
    console.log(loc);
    let domsVariant = locationToDomains(chromoBins, loc);
    // eliminate domains that are smaller than 10 bases wide
    if (domsVariant.length > 1) {
      domsVariant = domsVariant.filter((d) => d[1] - d[0] > 10);
    }
    urlVariant.searchParams.set("variant", selectedVariant.id);
    window.history.replaceState(
      unescape(urlVariant.toString()),
      "Case Report",
      unescape(urlVariant.toString())
    );
    yield put({
      type: settingsActions.UPDATE_DOMAINS,
      domains: domsVariant,
    });
  } else {
    // Remove the query parameter
    urlVariant.searchParams.delete("variant");
    // Update the URL in the browser's history
    window.history.replaceState(
      null,
      "Case Report",
      unescape(urlVariant.toString())
    );
    yield put({
      type: settingsActions.UPDATE_DOMAINS,
      domains: [defaultDomain],
    });
  }
}

function* actionWatcher() {
  yield takeEvery(actions.FETCH_SAGEQC_REQUEST, fetchSageQc);
  yield takeEvery(actions.SELECT_VARIANT, selectVariant);
}
export default function* rootSaga() {
  yield all([actionWatcher()]);
}
