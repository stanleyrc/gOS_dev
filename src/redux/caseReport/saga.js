import { all, takeEvery, put, call, select } from "redux-saga/effects";
import axios from "axios";
import { reportAttributesMap, assessQuality } from "../../helpers/utility";
import actions from "./actions";
import { getCurrentState } from "./selectors";
import allelicActions from "../allelic/actions";
import filteredEventsActions from "../filteredEvents/actions";
import genomeActions from "../genome/actions";
import genomeCoverageActions from "../genomeCoverage/actions";
import hetsnpsActions from "../hetsnps/actions";
import mutationsActions from "../mutations/actions";
import populationStatisticsActions from "../populationStatistics/actions";
import ppfitActions from "../ppfit/actions";
import sageQcActions from "../sageQc/actions";
import signatureStatisticsActions from "../signatureStatistics/actions";
import { getCancelToken } from "../../helpers/cancelToken";

function* fetchCaseReport(action) {
  const currentState = yield select(getCurrentState);
  let { report, dataset } = currentState.Settings;
  try {
    let responseReportMetadata = yield call(
      axios.get,
      `${dataset.dataPath}${report}/metadata.json`,
      { cancelToken: getCancelToken() }
    );

    let metadata = {};
    let reportMetadata = responseReportMetadata.data[0];

    Object.keys(responseReportMetadata.data[0]).forEach((key) => {
      metadata[reportAttributesMap()[key]] = reportMetadata[key];
    });

    let qualityStatus = assessQuality(metadata);

    yield put({
      type: actions.FETCH_CASE_REPORT_SUCCESS,
      metadata,
      qualityStatus,
      id: metadata.pair,
    });
  } catch (error) {
    if (axios.isCancel(error)) {
      console.log(
        `fetch ${dataset.dataPath}${report}/metadata.json request canceled`,
        error.message
      );
    } else {
      yield put({
        type: actions.FETCH_CASE_REPORT_FAILED,
        error,
      });
    }
  }
}

function* followUpFetchCaseReportSuccess(action) {
  const actionTypes = [
    allelicActions.FETCH_ALLELIC_DATA_REQUEST,
    filteredEventsActions.FETCH_FILTERED_EVENTS_REQUEST,
    genomeActions.FETCH_GENOME_DATA_REQUEST,
    genomeCoverageActions.FETCH_COVERAGE_DATA_REQUEST,
    hetsnpsActions.FETCH_HETSNPS_DATA_REQUEST,
    mutationsActions.FETCH_MUTATIONS_DATA_REQUEST,
    populationStatisticsActions.FETCH_POPULATION_STATISTICS_REQUEST,
    ppfitActions.FETCH_PPFIT_DATA_REQUEST,
    sageQcActions.FETCH_SAGEQC_REQUEST,
    signatureStatisticsActions.FETCH_SIGNATURE_STATISTICS_REQUEST,
  ];

  yield all(actionTypes.map((type) => put({ type })));
}

function* actionWatcher() {
  yield takeEvery(actions.FETCH_CASE_REPORT_REQUEST, fetchCaseReport);
  yield takeEvery(
    actions.FETCH_CASE_REPORT_SUCCESS,
    followUpFetchCaseReportSuccess
  );
}
export default function* rootSaga() {
  yield all([actionWatcher()]);
}
