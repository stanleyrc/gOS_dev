import { all, takeEvery, put, call, select } from "redux-saga/effects";
import axios from "axios";
import actions from "./actions";
import { snvplicityGroups, binDataByCopyNumber } from "../../helpers/utility";
import { getCurrentState } from "./selectors";
import { getCancelToken } from "../../helpers/cancelToken";
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

function* fetchOptionalHistogram(url) {
  try {
    const response = yield call(axios.get, url, {
      cancelToken: getCancelToken(),
    });
    return isMissingDataResponse(response) ? [] : response.data || [];
  } catch (error) {
    if (axios.isCancel(error) || !isMissingDataError(error)) throw error;
    return [];
  }
}

export function* fetchSnvplicityData(action) {
  const currentState = yield select(getCurrentState);
  const { dataset } = currentState.Settings;
  const { id } = currentState.CaseReport;
  const { imageFile } = currentState.Snvplicity;
  const baseUrl = `${dataset.dataPath}${id}/`;

  let assetAction = {};
  try {
    const [multiplicity, purpleSunrise, hetsnpsImage] = yield all([
      call(checkOptionalAsset, `${baseUrl}${imageFile}`),
      call(checkOptionalAsset, `${baseUrl}purple_sunrise_pp.png`),
      call(checkOptionalAsset, `${baseUrl}hetsnps_major_minor.png`),
    ]);
    assetAction = {
      imagePresent: multiplicity.present,
      imageError: multiplicity.error,
      purpleSunrisePresent: purpleSunrise.present,
      purpleSunriseError: purpleSunrise.error,
      hetsnpsImagePresent: hetsnpsImage.present,
      hetsnpsImageError: hetsnpsImage.error,
    };

    if (multiplicity.present) {
      yield put({
        type: actions.FETCH_SNVPLICITY_DATA_SUCCESS,
        data: null,
        ...assetAction,
      });
      return;
    }

    const groups = snvplicityGroups();
    const responses = yield all(
      groups.map(({ type, mode }) =>
        call(fetchOptionalHistogram, `${baseUrl}${type}_${mode}_hist.json`)
      )
    );
    const binnedData = {};

    groups.forEach(({ type, mode }, index) => {
      const key = `${type}_${mode}`;
      const records = (responses[index] || []).filter(
        (record) =>
          record.jabba_cn != null &&
          record.mult_cn != null &&
          +record.count > 0
      );
      binnedData[key] =
        records.length > 0 ? binDataByCopyNumber(records, 0.05) : [];
    });

    const hasData = Object.values(binnedData).some(
      (records) => records.length > 0
    );
    yield put({
      type: hasData
        ? actions.FETCH_SNVPLICITY_DATA_SUCCESS
        : actions.FETCH_SNVPLICITY_DATA_MISSING,
      data: hasData ? binnedData : null,
      ...assetAction,
    });
  } catch (error) {
    if (axios.isCancel(error)) {
      console.log(
        `fetch ${dataset.dataPath}${id}/snvplicity request canceled`,
        error.message
      );
    } else {
      yield put({
        type: actions.FETCH_SNVPLICITY_DATA_FAILED,
        error,
        ...assetAction,
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
