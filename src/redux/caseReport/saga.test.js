/** @jest-environment node */

import axios from "axios";
import { runSaga } from "redux-saga";
import actions from "./actions";
import { fetchCaseReport } from "./saga";
import { cancelAllRequests, getCancelToken } from "../../helpers/cancelToken";

jest.mock("axios", () => ({
  get: jest.fn(),
  isCancel: jest.fn(() => false),
}));

jest.mock("../../helpers/cancelToken", () => ({
  cancelAllRequests: jest.fn(),
  getCancelToken: jest.fn(() => "cancel-token"),
}));

describe("case report saga", () => {
  beforeEach(() => {
    axios.get.mockReset();
    cancelAllRequests.mockClear();
    getCancelToken.mockReset();
    getCancelToken.mockReturnValue("cancel-token");
  });

  it("adds selected source identity while preserving the detail report ID", async () => {
    const dispatched = [];
    const state = {
      Settings: {
        report: "case-directory-id",
        dataset: {
          id: "dataset-a",
          dataPath: "data-a/",
        },
      },
    };
    axios.get.mockResolvedValue({
      data: [
        {
          pair: "display-pair",
          patient_id: "PATIENT-1",
          specimen_date: "2025-03-17",
          summary: "  First tag  \n\nSecond tag",
        },
      ],
    });

    await runSaga(
      {
        dispatch: (action) => dispatched.push(action),
        getState: () => state,
      },
      fetchCaseReport,
      {}
    ).toPromise();

    expect(cancelAllRequests).toHaveBeenCalledTimes(1);
    expect(axios.get).toHaveBeenCalledWith(
      "data-a/case-directory-id/metadata.json",
      { cancelToken: "cancel-token" }
    );
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]).toMatchObject({
      type: actions.FETCH_CASE_REPORT_SUCCESS,
      id: "case-directory-id",
      metadata: {
        pair: "display-pair",
        patient_id: "PATIENT-1",
        specimen_date: "2025-03-17",
        datasetId: "dataset-a",
        caseReportId: "case-directory-id",
        tags: ["First tag", "Second tag"],
        qcMetrics: [],
        qcEvaluation: null,
      },
    });
  });
});
