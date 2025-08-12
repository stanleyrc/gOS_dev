import { all, takeEvery, put, call, select, take } from "redux-saga/effects";
import axios from "axios";
import actions from "./actions";
import { createProgressChannel } from "../../helpers/progressChannel";
import {
  densityPlotFields,
  sageQcArrowTableToJson,
} from "../../helpers/sageQc";
import { getCurrentState } from "./selectors";
import { getCancelToken } from "../../helpers/cancelToken";
import { tableFromIPC } from "apache-arrow";

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
          return d;
        });

        let sageQcProperties = [
          ...new Set(records.map((d) => Object.keys(d)).flat()),
        ];

        let properties = densityPlotFields.filter((d) =>
          sageQcProperties.includes(d.name)
        );

        if (dataset.variant_qc_dropdown_schema) {
          properties = Object.keys(dataset.variant_qc_dropdown_schema).map(
            (d) => {
              return {
                name: d,
                type: dataset.variant_qc_dropdown_schema[d],
                format:
                  dataset.variant_qc_dropdown_schema[d] === "float"
                    ? "0.3f"
                    : "0.1f",
              };
            }
          );
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

function* actionWatcher() {
  yield takeEvery(actions.FETCH_SAGEQC_REQUEST, fetchSageQc);
}
export default function* rootSaga() {
  yield all([actionWatcher()]);
}
