/** @jest-environment node */

/* eslint-disable import/first */

import { runSaga } from "redux-saga";

const mockGet = jest.fn();
const mockIsCancel = jest.fn(() => false);
const mockBulkSave = jest.fn();
const mockGetActiveRepository = jest.fn(() => ({
  bulkSave: mockBulkSave,
}));
const mockCreateUrls = jest.fn(() => ({
  userTier: "user-tier.tsv",
  tier: "tier.tsv",
}));
const mockParse = jest.fn();

jest.mock("axios", () => ({
  get: (...args) => mockGet(...args),
  isCancel: (...args) => mockIsCancel(...args),
}));

jest.mock("../../services/repositories", () => ({
  getActiveRepository: (...args) => mockGetActiveRepository(...args),
}));

jest.mock("../../helpers/caseInterpretationImport", () => ({
  createCaseInterpretationImportUrls: (...args) => mockCreateUrls(...args),
  parseCaseInterpretationImport: (...args) => mockParse(...args),
}));

jest.mock("../../helpers/cancelToken", () => ({
  getCancelToken: jest.fn(() => "cancel-token"),
}));

import interpretationsActions from "../interpretations/actions";
import { importCaseInterpretations } from "./saga";

const state = {
  Settings: { dataset: { id: "dataset-1", dataPath: "data/" } },
  CaseReport: { id: "CASE-1", metadata: { pair: "PAIR-1" } },
};

function missingError() {
  return { response: { status: 404 } };
}

async function runImport(getState = () => state) {
  const dispatched = [];
  await runSaga(
    {
      dispatch: (action) => dispatched.push(action),
      getState,
    },
    importCaseInterpretations,
    {
      filteredEvents: [{ uid: "event-1" }],
      datasetId: "dataset-1",
      caseId: "CASE-1",
    },
  ).toPromise();
  return dispatched;
}

describe("Case Interpretation Import saga", () => {
  let warn;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateUrls.mockReturnValue({
      userTier: "user-tier.tsv",
      tier: "tier.tsv",
    });
    mockGetActiveRepository.mockReturnValue({
      bulkSave: mockBulkSave,
    });
    mockBulkSave.mockResolvedValue(undefined);
    warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it("ignores Filtered Events from a stale case context", async () => {
    const staleState = {
      ...state,
      CaseReport: { id: "CASE-2", metadata: { pair: "PAIR-2" } },
    };

    expect(await runImport(() => staleState)).toEqual([]);
    expect(mockGet).not.toHaveBeenCalled();
    expect(mockBulkSave).not.toHaveBeenCalled();
  });

  it("silently does nothing when both optional sources are missing", async () => {
    mockGet.mockRejectedValue(missingError());

    expect(await runImport()).toEqual([]);
    expect(mockBulkSave).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it("warns and writes nothing for an incomplete source", async () => {
    mockGet
      .mockResolvedValueOnce({ data: "user history", headers: {} })
      .mockRejectedValueOnce(missingError());

    expect(await runImport()).toEqual([]);
    expect(mockBulkSave).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });

  it("bulk upserts a valid source and refreshes interpretations", async () => {
    const interpretations = [{ alterationId: "event-1" }];
    mockGet
      .mockResolvedValueOnce({ data: "user history", headers: {} })
      .mockResolvedValueOnce({ data: "tier history", headers: {} });
    mockParse.mockReturnValue({
      state: "ready",
      interpretations,
      distributions: [],
    });

    expect(await runImport()).toEqual([
      interpretationsActions.fetchInterpretationsForCase("CASE-1"),
    ]);
    expect(mockBulkSave).toHaveBeenCalledWith(interpretations);
  });

  it("does not refresh a stale case after the active context changes", async () => {
    const interpretations = [{ alterationId: "event-1" }];
    mockGet.mockResolvedValue({ data: "history", headers: {} });
    mockParse.mockReturnValue({
      state: "ready",
      interpretations,
      distributions: [],
    });
    let selections = 0;
    const changedState = {
      ...state,
      CaseReport: { id: "CASE-2", metadata: { pair: "PAIR-2" } },
    };

    expect(await runImport(() => {
      selections += 1;
      return selections === 1 ? state : changedState;
    })).toEqual([]);
    expect(mockBulkSave).not.toHaveBeenCalled();
  });

  it("warns and writes nothing when complete sources are rejected", async () => {
    mockGet.mockResolvedValue({ data: "bad", headers: {} });
    mockParse.mockReturnValue({ state: "rejected", issues: ["bad source"] });

    expect(await runImport()).toEqual([]);
    expect(mockBulkSave).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      "Case interpretation import rejected:",
      "bad source",
    );
  });
});
