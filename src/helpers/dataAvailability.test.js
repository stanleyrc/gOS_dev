/** @jest-environment node */

import {
  isMissingDataError,
  isMissingDataResponse,
} from "./dataAvailability";

describe("isMissingDataError", () => {
  it("identifies an absent resource", () => {
    expect(isMissingDataError({ response: { status: 404 } })).toBe(true);
  });

  it.each([
    ["authorization failure", { response: { status: 403 } }],
    ["server failure", { response: { status: 500 } }],
    ["network failure", new Error("Network Error")],
    ["decode failure", new TypeError("Invalid data")],
  ])("does not hide a %s", (_description, error) => {
    expect(isMissingDataError(error)).toBe(false);
  });
});

describe("isMissingDataResponse", () => {
  it("identifies the HTML fallback returned for a missing local data file", () => {
    expect(
      isMissingDataResponse({
        headers: { "content-type": "text/html; charset=utf-8" },
      })
    ).toBe(true);
  });

  it.each(["application/json", "application/octet-stream", undefined])(
    "keeps a %s response available",
    (contentType) => {
      expect(
        isMissingDataResponse({ headers: { "content-type": contentType } })
      ).toBe(false);
    }
  );
});
