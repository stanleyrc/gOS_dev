/** @jest-environment node */
/* eslint-disable import/first */

jest.mock("../../helpers/utility", () => ({
  locationToDomains: jest.fn(),
  updateChromoBins: jest.fn(),
}));

jest.mock("../../helpers/cancelToken", () => ({
  cancelAllRequests: jest.fn(),
}));

import { runSaga } from "redux-saga";
import caseReportActions from "../caseReport/actions";
import caseReportsActions from "../caseReports/actions";
import { updateBrowseScopeFollowUp } from "./saga";

describe("Settings saga browse transitions", () => {
  it("keeps a matching initial manifest load alive for a detail deep link", async () => {
    const dispatched = [];

    await runSaga(
      { dispatch: (action) => dispatched.push(action) },
      updateBrowseScopeFollowUp,
      { refreshBrowseResults: false, cancelBrowseWork: false },
    ).toPromise();

    expect(dispatched).toEqual([caseReportActions.clearCaseReport()]);
  });

  it("cancels an in-flight manifest load when browse results are retained", async () => {
    const dispatched = [];

    await runSaga(
      { dispatch: (action) => dispatched.push(action) },
      updateBrowseScopeFollowUp,
      { refreshBrowseResults: false },
    ).toPromise();

    expect(dispatched).toEqual([
      caseReportActions.clearCaseReport(),
      caseReportsActions.cancelCaseReportsFetch(),
    ]);
  });
});
