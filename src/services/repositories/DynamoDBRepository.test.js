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
