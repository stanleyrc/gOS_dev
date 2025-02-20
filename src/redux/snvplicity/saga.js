import { all, takeEvery, put, call, select } from "redux-saga/effects";
import axios from "axios";
import actions from "./actions";
import { snvplicityGroups, binDataByCopyNumber } from "../../helpers/utility";
import { getCurrentState } from "./selectors";
import { getCancelToken } from "../../helpers/cancelToken";

export function* fetchSnvplicityData(action) {
  // 1) Get necessary info from Redux state
  const currentState = yield select(getCurrentState);
  const { dataset } = currentState.Settings;
  const { id } = currentState.CaseReport;

  try {
    // 2) Prepare parallel requests
    //    - Each .get is wrapped in a .catch to return an object with data: [] if it fails
    const requests = snvplicityGroups().map(({ type, mode }) =>
      axios
        .get(`${dataset.dataPath}${id}/${type}_${mode}_hist.json`, {
          cancelToken: getCancelToken(),
        })
        // If the request fails (e.g. file not found), return a dummy response
        .catch((error) => {
          // You can log the error if desired:
          // console.log(`Missing file for ${type}_${mode}`, error);
          return { data: [] };
        })
    );

    // 3) Run all requests in parallel; does NOT reject if one fails,
    //    because each request has its own .catch() that returns { data: [] }.
    const responses = yield call(axios.all, requests);

    // 4) Build the data object from the successful (or dummy) responses.
    //    Using the same index in snvplicityGroups for the response.
    let data = {};
    snvplicityGroups().forEach(({ type, mode }, i) => {
      const response = responses[i];
      data[`${type}_${mode}`] = (response.data || []).filter(
        (e) => e.jabba_cn != null && e.mult_cn != null && +e.count > 0
      ); // either the real data or []
    });

    // 5) For each of the keys, bin the data
    let binnedData = {};
    Object.keys(data).forEach((key) => {
      // data[key] might be an empty array if the file was missing
      if (Array.isArray(data[key]) && data[key].length > 0) {
        binnedData[key] = binDataByCopyNumber(data[key], 0.05);
      } else {
        // If no data or missing file, store empty array
        binnedData[key] = [];
      }
    });

    // 5) Dispatch success with the assembled data object
    yield put({
      type: actions.FETCH_SNVPLICITY_DATA_SUCCESS,
      data: binnedData,
    });
  } catch (error) {
    // This catch block typically only runs if there was a fatal error
    // or request cancellation outside the per-request .catch blocks.
    console.error(error);
    if (axios.isCancel(error)) {
      console.log(
        `fetch ${dataset.dataPath}${id}/snvplicity request canceled`,
        error.message
      );
    } else {
      yield put({
        type: actions.FETCH_SNVPLICITY_DATA_FAILED,
        error,
      });
    }
  }
}

function* actionWatcher() {
  yield takeEvery(actions.FETCH_SNVPLICITY_DATA_REQUEST, fetchSnvplicityData);
}
export default function* rootSaga() {
  yield all([actionWatcher()]);
}
