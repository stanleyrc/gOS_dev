/** @jest-environment node */

import { IndexedDBRepository } from "./IndexedDBRepository";

function failingRequest(error) {
  const request = { error };
  Promise.resolve().then(() => request.onerror());
  return request;
}

const store = {
  get: jest.fn(),
  getAll: jest.fn(),
  index: jest.fn(),
  delete: jest.fn(),
};
const transaction = {
  objectStore: jest.fn(() => store),
};
const database = {
  objectStoreNames: { contains: jest.fn(() => true) },
  transaction: jest.fn(() => transaction),
  onclose: null,
};
const openRequest = { result: database };
const indexedDB = {
  open: jest.fn(() => {
    Promise.resolve().then(() => openRequest.onsuccess());
    return openRequest;
  }),
};

describe("IndexedDBRepository read and delete error contracts", () => {
  let consoleError;
  let repository;

  beforeAll(() => {
    global.indexedDB = indexedDB;
    global.window = { indexedDB };
  });

  beforeEach(() => {
    jest.clearAllMocks();
    indexedDB.open.mockImplementation(() => {
      Promise.resolve().then(() => openRequest.onsuccess());
      return openRequest;
    });
    database.objectStoreNames.contains.mockReturnValue(true);
    database.transaction.mockReturnValue(transaction);
    transaction.objectStore.mockReturnValue(store);
    repository = new IndexedDBRepository();
    consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  afterAll(() => {
    delete global.indexedDB;
    delete global.window;
  });

  it("logs and rethrows get failures instead of reporting absence", async () => {
    const readError = new Error("indexed get failed");
    store.get.mockImplementation(() => failingRequest(readError));

    await expect(
      repository.get("dataset-1", "case-1", "alteration-1", "user-1"),
    ).rejects.toBe(readError);
    expect(consoleError).toHaveBeenCalledWith(
      "Failed to get interpretation:",
      readError,
    );
  });

  it("logs and rethrows getForCase failures instead of returning an empty case", async () => {
    const readError = new Error("indexed case read failed");
    const index = {
      getAll: jest.fn(() => failingRequest(readError)),
    };
    store.index.mockReturnValue(index);

    await expect(repository.getForCase("dataset-1", "case-1")).rejects.toBe(
      readError,
    );
    expect(consoleError).toHaveBeenCalledWith(
      "Failed to get interpretations for case:",
      readError,
    );
  });

  it("logs and rethrows getAll failures instead of hiding an incomplete global lookup", async () => {
    const readError = new Error("indexed all read failed");
    store.getAll.mockImplementation(() => failingRequest(readError));

    await expect(repository.getAll()).rejects.toBe(readError);
    expect(consoleError).toHaveBeenCalledWith(
      "Failed to get all interpretations:",
      readError,
    );
  });

  it("continues to log and rethrow delete failures", async () => {
    const deleteError = new Error("indexed delete failed");
    store.delete.mockImplementation(() => failingRequest(deleteError));

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
