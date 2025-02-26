import { all, takeEvery, put, select, call } from "redux-saga/effects";
import * as d3 from "d3";
import { setCytobandProperties } from "../../helpers/cytobandsUtil";
import { getCurrentState } from "./selectors";
import actions from "./actions";

function* fetchCytobandsData(action) {
  try {
    const currentState = yield select(getCurrentState);
    let { filename } = currentState.Cytobands;
    let { chromoBins } = currentState.Settings;

    // 2. Wait for the TSV file to load (Promise-based)
    const rawData = yield call(d3.tsv, filename);

    // 3. Transform each record
    const data = rawData.map((cytoband, id) => {
      cytoband.id = id;
      cytoband = setCytobandProperties(cytoband, chromoBins);
      return cytoband;
    });

    yield put({
      type: actions.FETCH_CYTOBANDS_SUCCESS,
      data,
    });
  } catch (error) {
    yield put({
      type: actions.FETCH_CYTOBANDS_FAILED,
      error,
    });
  }
}

function* actionWatcher() {
  yield takeEvery(actions.FETCH_CYTOBANDS_REQUEST, fetchCytobandsData);
}
export default function* rootSaga() {
  yield all([actionWatcher()]);
}
