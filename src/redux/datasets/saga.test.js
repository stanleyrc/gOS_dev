/** @jest-environment node */
/* eslint-disable import/first */

jest.mock("../../helpers/field", () => {
  return class TestField {};
});

import { runSaga } from "redux-saga";
import settingsActions from "../settings/actions";
import { openCaseReport } from "./saga";

const dataset = { id: "a", datafilesPath: "a.json" };

const runOpen = async (caseReports, actionOptions = {}) => {
  const dispatched = [];
  await runSaga(
    {
      dispatch: (action) => dispatched.push(action),
      getState: () => ({
        Settings: { browseScope: { kind: "all" }, dataset: null },
        Datasets: { records: [dataset] },
        CaseReports: caseReports,
      }),
    },
    openCaseReport,
    {
      datasetId: "a",
      caseReportId: "case-1",
      ...actionOptions,
    },
  ).toPromise();
  return dispatched;
};

describe("dataset detail routing", () => {
  it("keeps the initial global manifest fetch alive for a deep link", async () => {
    const dispatched = await runOpen(
      { loading: false, datafiles: [] },
      { keepBrowseFetch: true },
    );

    expect(dispatched).toEqual([
      settingsActions.updateDataset(dataset, "case-1", {
        preserveBrowseScope: true,
        refreshBrowseResults: false,
        cancelBrowseWork: false,
      }),
    ]);
  });

  it("cancels stale browse work when opening an already loaded result", async () => {
    const dispatched = await runOpen({
      loading: false,
      datafiles: [{ caseReportId: "case-1" }],
    });

    expect(dispatched[0].cancelBrowseWork).toBe(true);
  });
});
