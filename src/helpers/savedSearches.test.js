/** @jest-environment node */
/* eslint-disable import/first */

jest.mock("./utility", () => ({ guid: () => "generated-id" }));

import {
  deleteSavedSearch,
  getSavedSearchesStorageKey,
  parseSavedSearches,
  readSavedSearches,
  upsertSavedSearch,
  writeSavedSearches,
} from "./savedSearches";

describe("browser saved searches", () => {
  it("preserves null as the global ordinary browse scope", () => {
    const result = upsertSavedSearch(
      {
        name: "All AML",
        datasetId: null,
        searchFilters: { disease: ["AML"] },
        resultCount: 12,
      },
      [],
      "2026-01-01T00:00:00.000Z",
    );

    expect(result.savedSearch).toMatchObject({
      id: "saved-query-generated-id",
      searchId: "saved-query-generated-id",
      datasetId: null,
      resultCount: 12,
    });
  });

  it("edits in place and deletes by saved-query identity", () => {
    const original = upsertSavedSearch(
      { name: "First", datasetId: "a" },
      [],
      "2026-01-01T00:00:00.000Z",
    );
    const edited = upsertSavedSearch(
      { id: original.savedSearch.id, name: "Renamed" },
      original.savedSearches,
      "2026-01-02T00:00:00.000Z",
    );

    expect(edited.savedSearches).toHaveLength(1);
    expect(edited.savedSearch).toMatchObject({
      name: "Renamed",
      datasetId: "a",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    });
    expect(deleteSavedSearch(edited.savedSearches, edited.savedSearch.id)).toEqual([]);
  });

  it("isolates persisted searches by local gOS user", () => {
    const values = new Map();
    const storage = {
      getItem: jest.fn((key) => values.get(key) || null),
      setItem: jest.fn((key, value) => values.set(key, value)),
    };
    const aliceSearch = upsertSavedSearch(
      { name: "Alice query" },
      [],
      "2026-01-01T00:00:00.000Z",
    ).savedSearches;

    writeSavedSearches(aliceSearch, storage, "alice/user");

    expect(getSavedSearchesStorageKey("alice/user")).toContain(
      "alice%2Fuser",
    );
    expect(readSavedSearches(storage, "alice/user")).toHaveLength(1);
    expect(readSavedSearches(storage, "bob")).toEqual([]);
  });

  it("treats malformed localStorage content as an empty list", () => {
    expect(parseSavedSearches("not json")).toEqual([]);
    expect(parseSavedSearches("{}" )).toEqual([]);
  });
});
