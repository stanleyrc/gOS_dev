import { all, takeEvery, put, call } from "redux-saga/effects";
import axios from "axios";
import {
  plotTypes,
  getPopulationMetrics,
  flip,
  reportAttributesMap,
} from "../../helpers/utility";
import actions from "./actions";
import caseReportActions from "../caseReport/actions";

function* fetchPopulationStatistics(action) {
  try {
    const { pair } = action;
    // get the list of all cases from the public/datafiles.json
    let responseReports = yield call(axios.get, "datafiles.json");

    let datafiles = responseReports.data;

    let populations = {};
    let flippedMap = flip(reportAttributesMap());
    Object.keys(plotTypes()).forEach((d, i) => {
      populations[d] = datafiles.map((e) => {
        return {
          pair: e.pair,
          value: e[flippedMap[d]],
          tumor_type: e.tumor_type,
        };
      });
    });

    const report = datafiles.find((e) => e.pair === pair);
    let metadata = {};
    Object.keys(report).forEach((key) => {
      metadata[reportAttributesMap()[key]] = report[key];
    });

    yield put({
      type: actions.FETCH_POPULATION_STATISTICS_SUCCESS,
      general: getPopulationMetrics(populations, metadata),
      tumor: getPopulationMetrics(populations, metadata, metadata.tumor),
    });
  } catch (error) {
    yield put({
      type: actions.FETCH_POPULATION_STATISTICS_FAILED,
      error,
    });
  }
}

function* actionWatcher() {
  yield takeEvery(
    actions.FETCH_POPULATION_STATISTICS_REQUEST,
    fetchPopulationStatistics
  );
  yield takeEvery(
    caseReportActions.SELECT_CASE_REPORT_SUCCESS,
    fetchPopulationStatistics
  );
}
export default function* rootSaga() {
  yield all([actionWatcher()]);
}
