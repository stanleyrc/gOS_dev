import { all, takeEvery, put, call, select } from "redux-saga/effects";
import axios from "axios";
import { getCurrentState } from "./selectors";
import {
  transformFilteredEventAttributes,
  locationToDomains,
  getEventType,
} from "../../helpers/utility";
import actions from "./actions";
import settingsActions from "../settings/actions";
import { getCancelToken } from "../../helpers/cancelToken";

function* fetchFilteredEvents(action) {
  const currentState = yield select(getCurrentState);
  const { dataset } = currentState.Settings;
  const { id } = currentState.CaseReport;
  try {
    let responseReportFilteredEvents = yield call(
      axios.get,
      `${dataset.dataPath}${id}/filtered.events.json`,
      { cancelToken: getCancelToken() }
    );

    let filteredEvents = transformFilteredEventAttributes(
      responseReportFilteredEvents.data || []
    ).map((d) => {
      d.eventType = getEventType(d);
      return d;
    });

    let selectedFilteredEvent = filteredEvents.find(
      (e) =>
        e.gene ===
        new URL(decodeURI(document.location)).searchParams.get("gene")
    );

    const reportUrl = `${dataset.dataPath}${id}/report.html`;
    let reportSrc = null;
    try {
      yield call(axios.head, reportUrl, { cancelToken: getCancelToken() });
      reportSrc = reportUrl;
    } catch (e) {
      try {
        yield call(axios.get, reportUrl, { cancelToken: getCancelToken() });
        reportSrc = reportUrl;
      } catch (_) {
        reportSrc = null;
      }
    }

    yield put({
      type: actions.FETCH_FILTERED_EVENTS_SUCCESS,
      filteredEvents,
      selectedFilteredEvent,
      reportSrc,
    });
  } catch (error) {
    console.log(error);
    if (axios.isCancel(error)) {
      console.log(
        `fetch ${dataset.dataPath}${id}/filtered.events.json request canceled`,
        error.message
      );
    } else {
      yield put({
        type: actions.FETCH_FILTERED_EVENTS_FAILED,
        error,
      });
    }
  }
}

function* selectFilteredEvent(action) {
  const currentState = yield select(getCurrentState);
  let { chromoBins, defaultDomain } = currentState.Settings;
  let { filteredEvent } = action;
  let selectedFilteredEvent = filteredEvent;
  let urlGene = new URL(decodeURI(document.location));
  if (selectedFilteredEvent) {
    let loc = selectedFilteredEvent.actualLocation;
    let domsGene = locationToDomains(chromoBins, loc);
    // eliminate domains that are smaller than 10 bases wide
    if (domsGene.length > 1) {
      domsGene = domsGene.filter((d) => d[1] - d[0] > 10);
    }
    urlGene.searchParams.set("gene", selectedFilteredEvent.gene);
    window.history.replaceState(
      unescape(urlGene.toString()),
      "Case Report",
      unescape(urlGene.toString())
    );
    yield put({
      type: settingsActions.UPDATE_DOMAINS,
      domains: domsGene,
    });
  } else {
    // Remove the query parameter
    urlGene.searchParams.delete("gene");
    // Update the URL in the browser's history
    window.history.replaceState(
      null,
      "Case Report",
      unescape(urlGene.toString())
    );
    yield put({
      type: settingsActions.UPDATE_DOMAINS,
      domains: [defaultDomain],
    });
  }
}

function* actionWatcher() {
  yield takeEvery(actions.FETCH_FILTERED_EVENTS_REQUEST, fetchFilteredEvents);
  yield takeEvery(actions.SELECT_FILTERED_EVENT, selectFilteredEvent);
}
export default function* rootSaga() {
  yield all([actionWatcher()]);
}
