import { all, takeEvery, put, call } from "redux-saga/effects";
import axios from "axios";
import { transformFilteredEventAttributes } from "../../helpers/utility";
import actions from "./actions";
import caseReportActions from "../caseReport/actions";

function* fetchFilteredEvents(action) {
  let { pair } = action;

  try {
    let responseReportFilteredEvents = yield call(
      axios.get,
      `data/${pair}/filtered.events.json`
    );

    let filteredEvents = transformFilteredEventAttributes(
      responseReportFilteredEvents.data || []
    );
    yield put({
      type: actions.FETCH_FILTERED_EVENTS_SUCCESS,
      filteredEvents,
    });
  } catch (error) {
    yield put({
      type: actions.FETCH_FILTERED_EVENTS_FAILED,
      error,
    });
  }
}

function* actionWatcher() {
  yield takeEvery(actions.FETCH_FILTERED_EVENTS_REQUEST, fetchFilteredEvents);
  yield takeEvery(
    caseReportActions.SELECT_CASE_REPORT_SUCCESS,
    fetchFilteredEvents
  );
}
export default function* rootSaga() {
  yield all([actionWatcher()]);
}
