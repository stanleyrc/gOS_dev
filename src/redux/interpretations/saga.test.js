/** @jest-environment node */

/* eslint-disable import/first */

import { runSaga } from "redux-saga";

const mockGetActiveRepository = jest.fn();
const mockGetCurrentUserId = jest.fn(() => "user-1");
const mockGetUser = jest.fn(() => null);

jest.mock("../../services/repositories", () => ({
  getActiveRepository: (...args) => mockGetActiveRepository(...args),
}));

jest.mock("../../helpers/userAuth", () => ({
  getCurrentUserId: (...args) => mockGetCurrentUserId(...args),
  getUser: (...args) => mockGetUser(...args),
}));

jest.mock("../../services/signatures/SignatureService", () => ({
  signInterpretation: jest.fn(),
}));

import actions from "./actions";
import {
  clearCaseInterpretations,
  fetchInterpretationsForCase,
  updateInterpretation,
} from "./saga";

function createState(
  originalEvent = { uid: "alteration-1" },
  overrides = {},
) {
  return {
    Settings: { dataset: { id: "dataset-1" } },
    CaseReport: { id: "case-1" },
    CaseReports: { datafiles: [] },
    FilteredEvents: { originalFilteredEvents: [originalEvent] },
    ...overrides,
  };
}

function createRepository(overrides = {}) {
  return {
    get: jest.fn().mockResolvedValue(null),
    getForCase: jest.fn().mockResolvedValue([]),
    save: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

async function runUpdate({
  data,
  repository,
  completion,
  originalEvent,
  state,
  getState = () => state || createState(originalEvent),
}) {
  const dispatched = [];
  mockGetActiveRepository.mockReturnValue(repository);
  await runSaga(
    {
      dispatch: (action) => dispatched.push(action),
      getState,
    },
    updateInterpretation,
    actions.updateInterpretation(
      {
        datasetId: "dataset-1",
        caseId: "case-1",
        alterationId: "alteration-1",
        authorId: "user-1",
        authorName: "User One",
        data,
      },
      completion,
    ),
  ).toPromise();
  return dispatched;
}

async function runClear({
  repository,
  completion,
  dataset,
  state = createState(),
  getState = () => state,
}) {
  const dispatched = [];
  mockGetActiveRepository.mockReturnValue(repository);
  await runSaga(
    {
      dispatch: (action) => dispatched.push(action),
      getState,
    },
    clearCaseInterpretations,
    actions.clearCaseInterpretations("case-1", completion, dataset),
  ).toPromise();
  return dispatched;
}

describe("imported interpretation loading", () => {
  it("ignores a completed fetch after the active context changes", async () => {
    const repository = createRepository({
      getAll: jest.fn().mockResolvedValue([]),
    });
    const dispatched = [];
    const caseA = createState();
    const caseB = createState(undefined, { CaseReport: { id: "case-2" } });
    let selections = 0;
    mockGetActiveRepository.mockReturnValue(repository);

    await runSaga(
      {
        dispatch: (action) => dispatched.push(action),
        getState: () => {
          selections += 1;
          return selections === 1 ? caseA : caseB;
        },
      },
      fetchInterpretationsForCase,
      actions.fetchInterpretationsForCase("case-1"),
    ).toPromise();

    expect(dispatched).toEqual([]);
  });

  it("never selects imported history as the current user", async () => {
    const importedJson = {
      datasetId: "dataset-1",
      caseId: "case-1",
      alterationId: "alteration-1",
      authorId: "user-1",
      authorName: "User One",
      data: { tier: "1" },
      source: { kind: "case-interpretation-import", aggregateId: "aggregate-1" },
    };
    const repository = createRepository({
      getAll: jest.fn().mockResolvedValue([
        {
          ...importedJson,
          gene: "TP53",
          hasOverrides: () => true,
          toJSON: () => ({ ...importedJson, gene: "TP53" }),
        },
      ]),
    });
    const dispatched = [];
    mockGetActiveRepository.mockReturnValue(repository);

    await runSaga(
      {
        dispatch: (action) => dispatched.push(action),
        getState: () => createState(undefined, {
          CaseReports: { datafiles: [] },
        }),
      },
      fetchInterpretationsForCase,
      actions.fetchInterpretationsForCase("case-1"),
    ).toPromise();

    expect(dispatched[0].selected).toEqual({});
    expect(Object.values(dispatched[0].byId)[0].isCurrentUser).toBe(false);
  });
});

describe("updateInterpretation completion acknowledgment", () => {
  let consoleError;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCurrentUserId.mockReturnValue("user-1");
    mockGetUser.mockReturnValue(null);
    consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it("merges a partial active-case payload with legacy storage data", async () => {
    const legacyInterpretation = {
      caseId: "legacy-pair",
      datasetId: "dataset-1",
      alterationId: "alteration-1",
      authorId: "user-1",
      authorName: "Legacy User",
      gene: "LEGACY-GENE",
      data: { tier: "2", notes: "Preserve me" },
    };
    const repository = createRepository({
      get: jest
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(legacyInterpretation),
    });
    const state = createState(
      { uid: "alteration-1", tier: "1" },
      {
        CaseReports: {
          datafiles: [
            {
              datasetId: "dataset-1",
              caseReportId: "case-1",
              pair: "legacy-pair",
            },
          ],
        },
      },
    );

    const dispatched = await runUpdate({
      data: { variant_summary: "Report-only update" },
      repository,
      state,
    });

    expect(repository.get.mock.calls).toEqual([
      ["dataset-1", "case-1", "alteration-1", "user-1"],
      ["dataset-1", "legacy-pair", "alteration-1", "user-1"],
    ]);
    const saved = repository.save.mock.calls[0][0].toJSON();
    expect(saved).toMatchObject({
      caseId: "case-1",
      gene: "LEGACY-GENE",
      data: {
        tier: "2",
        notes: "Preserve me",
        variant_summary: "Report-only update",
      },
    });
    expect(repository.delete).toHaveBeenCalledWith(
      "dataset-1",
      "legacy-pair",
      "alteration-1",
      "user-1",
    );
    expect(dispatched).toContainEqual(
      expect.objectContaining({
        type: actions.UPDATE_INTERPRETATION_SUCCESS,
        replacedInterpretation: expect.objectContaining({
          datasetId: "dataset-1",
          caseId: "legacy-pair",
          alterationId: "alteration-1",
          authorId: "user-1",
        }),
      }),
    );
  });

  it("acknowledges save success after repository persistence", async () => {
    const completion = jest.fn();
    const repository = createRepository();
    const dispatched = await runUpdate({
      data: { variant_summary: "Edited" },
      repository,
      completion,
    });

    expect(repository.save).toHaveBeenCalledTimes(1);
    expect(dispatched).toContainEqual(
      expect.objectContaining({
        type: actions.UPDATE_INTERPRETATION_SUCCESS,
        interpretation: expect.objectContaining({
          data: { variant_summary: "Edited" },
        }),
      }),
    );
    expect(completion).toHaveBeenCalledWith(
      null,
      expect.objectContaining({
        deleted: false,
        interpretation: expect.objectContaining({
          data: { variant_summary: "Edited" },
        }),
      }),
    );
  });

  it("acknowledges delete success", async () => {
    const completion = jest.fn();
    const repository = createRepository();
    const dispatched = await runUpdate({
      data: { variant_summary: "" },
      repository,
      completion,
      originalEvent: { uid: "alteration-1" },
    });

    expect(repository.delete).toHaveBeenCalledTimes(1);
    expect(repository.save).not.toHaveBeenCalled();
    expect(dispatched).toContainEqual(
      expect.objectContaining({
        type: actions.UPDATE_INTERPRETATION_SUCCESS,
        interpretation: null,
      }),
    );
    expect(completion).toHaveBeenCalledWith(
      null,
      expect.objectContaining({
        deleted: true,
        interpretation: null,
      }),
    );
  });

  it("does not publish an update after the active context changes", async () => {
    const repository = createRepository();
    const caseA = createState();
    const caseB = createState(undefined, { CaseReport: { id: "case-2" } });
    let selections = 0;
    const dispatched = await runUpdate({
      data: { variant_summary: "Edited" },
      repository,
      getState: () => {
        selections += 1;
        return selections < 3 ? caseA : caseB;
      },
    });

    expect(repository.save).toHaveBeenCalled();
    expect(dispatched).not.toContainEqual(
      expect.objectContaining({
        type: actions.UPDATE_INTERPRETATION_SUCCESS,
      }),
    );
  });

  it("acknowledges save errors", async () => {
    const completion = jest.fn();
    const error = new Error("save failed");
    const repository = createRepository({
      save: jest.fn().mockRejectedValue(error),
    });
    const dispatched = await runUpdate({
      data: { variant_summary: "Edited" },
      repository,
      completion,
    });

    expect(dispatched).toContainEqual({
      type: actions.UPDATE_INTERPRETATION_FAILED,
      error: "save failed",
    });
    expect(completion).toHaveBeenCalledWith(error, null);
  });

  it("acknowledges delete errors", async () => {
    const completion = jest.fn();
    const error = new Error("delete failed");
    const repository = createRepository({
      delete: jest.fn().mockRejectedValue(error),
    });
    const dispatched = await runUpdate({
      data: { variant_summary: "" },
      repository,
      completion,
      originalEvent: { uid: "alteration-1" },
    });

    expect(dispatched).toContainEqual({
      type: actions.UPDATE_INTERPRETATION_FAILED,
      error: "delete failed",
    });
    expect(completion).toHaveBeenCalledWith(error, null);
  });
});

describe("clearCaseInterpretations completion acknowledgment", () => {
  let consoleError;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCurrentUserId.mockReturnValue("user-1");
    consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it("acknowledges only after current-user interpretations are deleted", async () => {
    const calls = [];
    const completion = jest.fn(() => calls.push("acknowledged"));
    const repository = createRepository({
      getForCase: jest.fn().mockResolvedValue([
        { alterationId: "alteration-1", authorId: "user-1" },
        { alterationId: "alteration-2", authorId: "other-user" },
      ]),
      delete: jest.fn(async () => calls.push("deleted")),
    });

    const dispatched = await runClear({ repository, completion });

    expect(calls).toEqual(["deleted", "acknowledged"]);
    expect(dispatched).toContainEqual({
      type: actions.CLEAR_CASE_INTERPRETATIONS_SUCCESS,
      caseId: "case-1",
    });
    expect(completion).toHaveBeenCalledWith(null, { caseId: "case-1" });
  });

  it("uses the captured dataset for repository and accepted-case lookup", async () => {
    const capturedDataset = {
      id: "dataset-1",
      interpretationRepository: "indexeddb",
    };
    const repository = createRepository();
    const state = createState(undefined, {
      Settings: { dataset: { id: "dataset-2" } },
      CaseReports: {
        datafiles: [
          {
            datasetId: "dataset-1",
            caseReportId: "case-1",
            pair: "legacy-pair-1",
          },
          {
            datasetId: "dataset-2",
            caseReportId: "case-1",
            pair: "legacy-pair-2",
          },
        ],
      },
    });

    await runClear({
      dataset: capturedDataset,
      repository,
      state,
    });

    expect(mockGetActiveRepository).toHaveBeenCalledWith({
      dataset: capturedDataset,
    });
    expect(repository.getForCase.mock.calls).toEqual([
      ["dataset-1", "case-1"],
      ["dataset-1", "legacy-pair-1"],
    ]);
  });

  it("does not clear or refetch stale state after the active context changes", async () => {
    const completion = jest.fn();
    const caseA = createState();
    const caseB = createState(undefined, { CaseReport: { id: "case-2" } });
    let selections = 0;

    const dispatched = await runClear({
      repository: createRepository(),
      completion,
      getState: () => {
        selections += 1;
        return selections === 1 ? caseA : caseB;
      },
    });

    expect(dispatched).not.toContainEqual(
      expect.objectContaining({
        type: actions.CLEAR_CASE_INTERPRETATIONS_SUCCESS,
      }),
    );
    expect(dispatched).not.toContainEqual(
      expect.objectContaining({
        type: actions.FETCH_INTERPRETATIONS_FOR_CASE_REQUEST,
      }),
    );
    expect(completion).toHaveBeenCalledWith(null, { caseId: "case-1" });
  });

  it("acknowledges delete failure without reporting clear success", async () => {
    const error = new Error("clear delete failed");
    const completion = jest.fn();
    const repository = createRepository({
      getForCase: jest.fn().mockResolvedValue([
        { alterationId: "alteration-1", authorId: "user-1" },
      ]),
      delete: jest.fn().mockRejectedValue(error),
    });

    const dispatched = await runClear({ repository, completion });

    expect(dispatched).toContainEqual({
      type: actions.CLEAR_CASE_INTERPRETATIONS_FAILED,
      error: "clear delete failed",
    });
    expect(dispatched).not.toContainEqual(
      expect.objectContaining({
        type: actions.CLEAR_CASE_INTERPRETATIONS_SUCCESS,
      }),
    );
    expect(completion).toHaveBeenCalledWith(error, null);
  });
});
