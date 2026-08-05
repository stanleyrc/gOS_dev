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
import {
  isMissingDataError,
  isMissingDataResponse,
} from "../../helpers/dataAvailability";

export function* checkOptionalAsset(url) {
  try {
    const response = yield call(axios.head, url);
    return {
      present: !isMissingDataResponse(response),
      error: null,
    };
  } catch (error) {
    if (axios.isCancel(error)) throw error;
    if (isMissingDataError(error)) {
      return { present: false, error: null };
    }
    return { present: false, error };
  }
}

export function* fetchSageQc(action) {
  const currentState = yield select(getCurrentState);
  const { filename } = currentState.SageQc;
  const { dataset } = currentState.Settings;
  const { id } = currentState.CaseReport;
  const fileBase = `${dataset.dataPath}${id}/${filename}`;
  const arrowUrl = `${fileBase}.arrow`;
  const jsonUrl = `${fileBase}.json`;
  const caseBase = `${dataset.dataPath}${id}/`;
  let assetAction = {};

  try {
    const [coverageOriginal, coverageDenoised] = yield all([
      call(checkOptionalAsset, `${caseBase}coverage_cn_boxplot_original.png`),
      call(checkOptionalAsset, `${caseBase}coverage_cn_boxplot_denoised.png`),
    ]);
    assetAction = {
      coverageOriginalPresent: coverageOriginal.present,
      coverageOriginalError: coverageOriginal.error,
      coverageDenoisedPresent: coverageDenoised.present,
      coverageDenoisedError: coverageDenoised.error,
    };

    const arrow = yield call(checkOptionalAsset, arrowUrl);
    if (arrow.error) throw arrow.error;

    let url = arrow.present ? arrowUrl : null;
    if (!url) {
      const json = yield call(checkOptionalAsset, jsonUrl);
      if (json.error) throw json.error;
      if (!json.present) {
        yield put({
          type: actions.FETCH_SAGEQC_MISSING,
          ...assetAction,
        });
        return;
      }
      url = jsonUrl;
    }

    const progressChannel = yield call(createProgressChannel, {
      url,
      cancelToken: getCancelToken(),
      responseType: url.endsWith(".arrow") ? "arraybuffer" : "json",
    });

    while (true) {
      const result = yield take(progressChannel);
      if (result.response) {
        if (isMissingDataResponse(result.response)) {
          yield put({
            type: actions.FETCH_SAGEQC_MISSING,
            ...assetAction,
          });
          return;
        }

        let records;
        if (url.endsWith(".arrow")) {
          const arrowBuffer = new Uint8Array(result.response.data);
          const table = yield call(tableFromIPC, arrowBuffer);
          records = sageQcArrowTableToJson(table);
        } else {
          records = result.response.data;
        }
        if (!Array.isArray(records)) {
          throw new Error("Invalid Sage QC response");
        }

        records.forEach((record, index) => {
          record.id = index + 1;
          record.oncogenicity =
            (typeof record.oncogenic === "boolean" && record.oncogenic) ||
            (typeof record.oncogenic === "string" &&
              record.oncogenic.toLowerCase() === "true");
          record.uid = `${record.chromosome}:${record.position}-${record.chromosome}:${record.end}`;
          record.actualLocation = record.end
            ? `${record.chromosome}:${Math.floor(0.999 * +record.position)}-${
                record.chromosome
              }:${Math.floor(1.001 * +record.end)}`
            : `${record.chromosome}:${Math.floor(0.999 * +record.position)}-${
                record.chromosome
              }:${Math.floor(1.001 * +record.position)}`;
        });

        const sageQcProperties = [
          ...new Set(records.map((record) => Object.keys(record)).flat()),
        ].filter((property) =>
          records.some(
            (record) =>
              record[property] !== undefined && record[property] !== null
          )
        );
        let properties = densityPlotFields.filter((field) =>
          sageQcProperties.includes(field.name)
        );

        if (dataset.variant_qc_dropdown_schema) {
          properties = Object.keys(dataset.variant_qc_dropdown_schema)
            .filter((property) =>
              records.some(
                (record) =>
                  record[property] !== undefined && record[property] !== null
              )
            )
            .map((property) => ({
              name: property,
              type: dataset.variant_qc_dropdown_schema[property],
              format:
                dataset.variant_qc_dropdown_schema[property] === "float"
                  ? "0.3f"
                  : "0.1f",
            }));
        }

        yield put({
          type: actions.FETCH_SAGEQC_SUCCESS,
          records,
          properties,
          ...assetAction,
        });
        return;
      }

      if (result.error) {
        const missing = isMissingDataError(result.error);
        yield put({
          type: missing
            ? actions.FETCH_SAGEQC_MISSING
            : actions.FETCH_SAGEQC_FAILED,
          error: missing ? undefined : result.error,
          ...assetAction,
        });
        return;
      }

      yield put({
        type: actions.FETCH_SAGEQC_REQUEST_LOADING,
        loadingPercentage: result,
      });
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
        ...assetAction,
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
