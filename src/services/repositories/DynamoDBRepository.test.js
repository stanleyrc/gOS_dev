/** @jest-environment node */

/* eslint-disable import/first */

const mockSend = jest.fn();

jest.mock("@aws-sdk/client-dynamodb", () => {
  class MockCommand {
    constructor(input) {
      this.input = input;
    }
  }

  return {
    DynamoDBClient: class MockDynamoDBClient {
      constructor() {
        this.send = mockSend;
      }
    },
    PutItemCommand: MockCommand,
    GetItemCommand: MockCommand,
    QueryCommand: MockCommand,
    DeleteItemCommand: MockCommand,
    BatchWriteItemCommand: MockCommand,
    ScanCommand: MockCommand,
  };
});

import { DynamoDBRepository } from "./DynamoDBRepository";

describe("DynamoDBRepository read and delete error contracts", () => {
  let consoleError;
  let repository;

  beforeEach(() => {
    jest.clearAllMocks();
    repository = new DynamoDBRepository();
    consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it("logs and rethrows get failures instead of reporting absence", async () => {
    const readError = new Error("dynamo get failed");
    mockSend.mockRejectedValue(readError);

    await expect(
      repository.get("dataset-1", "case-1", "alteration-1", "user-1"),
    ).rejects.toBe(readError);
    expect(consoleError).toHaveBeenCalledWith(
      "Failed to get interpretation:",
      readError,
    );
  });

  it("logs and rethrows getForCase failures instead of returning an empty case", async () => {
    const readError = new Error("dynamo case read failed");
    mockSend.mockRejectedValue(readError);

    await expect(repository.getForCase("dataset-1", "case-1")).rejects.toBe(
      readError,
    );
    expect(consoleError).toHaveBeenCalledWith(
      "Failed to get interpretations for case:",
      readError,
    );
  });

  it("paginates getAll scans", async () => {
    mockSend
      .mockResolvedValueOnce({
        Items: [],
        LastEvaluatedKey: { datasetIdCaseId: { S: "next" } },
      })
      .mockResolvedValueOnce({ Items: [] });

    await expect(repository.getAll()).resolves.toEqual([]);
    expect(mockSend).toHaveBeenCalledTimes(2);
    expect(mockSend.mock.calls[0][0].input.ConsistentRead).toBe(true);
    expect(mockSend.mock.calls[1][0].input.ExclusiveStartKey).toEqual({
      datasetIdCaseId: { S: "next" },
    });
  });

  it("logs and rethrows getAll failures instead of hiding an incomplete global lookup", async () => {
    const readError = new Error("dynamo all read failed");
    mockSend.mockRejectedValue(readError);

    await expect(repository.getAll()).rejects.toBe(readError);
    expect(consoleError).toHaveBeenCalledWith(
      "Failed to get all interpretations:",
      readError,
    );
  });

  it("retries unprocessed bulk writes before reporting success", async () => {
    const unprocessed = [{ PutRequest: { Item: { id: { S: "one" } } } }];
    mockSend
      .mockResolvedValueOnce({
        UnprocessedItems: { [repository.tableName]: unprocessed },
      })
      .mockResolvedValueOnce({ UnprocessedItems: {} });

    await repository.bulkSave([{
      datasetId: "dataset-1",
      caseId: "case-1",
      alterationId: "event-1",
      authorId: "user-1",
      authorName: "User One",
      data: { tier: "1" },
    }]);

    expect(mockSend).toHaveBeenCalledTimes(2);
    expect(mockSend.mock.calls[1][0].input.RequestItems[repository.tableName]).toEqual(unprocessed);
  });

  it("continues to log and rethrow delete failures", async () => {
    const deleteError = new Error("dynamo delete failed");
    mockSend.mockRejectedValue(deleteError);

    await expect(
      repository.delete(
        "dataset-1",
        "case-1",
        "alteration-1",
        "user-1",
      ),
    ).rejects.toBe(deleteError);
    expect(consoleError).toHaveBeenCalledWith(
      "Failed to delete interpretation:",
      deleteError,
    );
  });
});
