import { all, takeEvery, put, call, select } from "redux-saga/effects";
import axios from "axios";
import { reportAttributesMap } from "../../helpers/utility";
import actions from "./actions";
import { getCurrentState } from "./selectors";
import allelicActions from "../allelic/actions";
import filteredEventsActions from "../filteredEvents/actions";
import genomeActions from "../genome/actions";
import genomeCoverageActions from "../genomeCoverage/actions";
import methylationBetaActions from "../methylationBetaCoverage/actions";
import methylationIntensityActions from "../methylationIntensityCoverage/actions";
import hetsnpsActions from "../hetsnps/actions";
import mutationsActions from "../mutations/actions";
import populationStatisticsActions from "../populationStatistics/actions";
import ppfitActions from "../ppfit/actions";
import sageQcActions from "../sageQc/actions";
import signatureStatisticsActions from "../signatureStatistics/actions";
import igvActions from "../igv/actions";
import highlightsActions from "../highlights/actions";
import snvplicityActions from "../snvplicity/actions";
import { cancelAllRequests, getCancelToken } from "../../helpers/cancelToken";
import { qcEvaluator } from "../../helpers/metadata";

function* fetchCaseReport(action) {
  cancelAllRequests();

  const currentState = yield select(getCurrentState);
  let { report, dataset } = currentState.Settings;

  // Abort if no report is selected in state
  if (!report) {
    return;
  }

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

    metadata.tags =
      metadata.summary
        ?.split("\n")
        .map((e) => e.trim())
        .filter((e) => e.length > 0) || [];

    metadata.hrdScore = metadata.hrd?.hrd_score;
    metadata.hrdB12Score = metadata.hrd?.b1_2_score;
    metadata.hrdB1Score = metadata.hrd?.b1_score;
    metadata.hrdB2Score = metadata.hrd?.b2_score;
    metadata.msiLabel = metadata.msisensor?.label;
    metadata.msiScore = metadata.msisensor?.score;

    metadata.qcMetrics = metadata.qcMetrics || [];
    metadata.qcEvaluation = qcEvaluator(metadata.qcMetrics);

    yield put({
      type: actions.FETCH_CASE_REPORT_SUCCESS,
      metadata,
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
  const { id } = action;
  
  const actionTypes = [
    allelicActions.FETCH_ALLELIC_DATA_REQUEST,
    filteredEventsActions.FETCH_FILTERED_EVENTS_REQUEST,
    genomeActions.FETCH_GENOME_DATA_REQUEST,
    genomeCoverageActions.FETCH_COVERAGE_DATA_REQUEST,
    methylationBetaActions.FETCH_METHYLATION_BETA_DATA_REQUEST,
    methylationIntensityActions.FETCH_METHYLATION_INTENSITY_DATA_REQUEST,
    hetsnpsActions.FETCH_HETSNPS_DATA_REQUEST,
    mutationsActions.FETCH_MUTATIONS_DATA_REQUEST,
    populationStatisticsActions.FETCH_POPULATION_STATISTICS_REQUEST,
    ppfitActions.FETCH_PPFIT_DATA_REQUEST,
    sageQcActions.FETCH_SAGEQC_REQUEST,
    signatureStatisticsActions.FETCH_SIGNATURE_STATISTICS_REQUEST,
    igvActions.FETCH_IGV_DATA_REQUEST,
    highlightsActions.FETCH_HIGHLIGHTS_DATA_REQUEST,
    snvplicityActions.FETCH_SNVPLICITY_DATA_REQUEST,
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
