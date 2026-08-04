/** @jest-environment node */
/* eslint-disable import/first */

jest.mock("../helpers/utility", () => ({
  binDataByCopyNumber: jest.fn(),
  locationToDomains: jest.fn(),
  snvplicityGroups: () => [],
}));
jest.mock("../helpers/sageQc", () => ({
  densityPlotFields: [],
  sageQcArrowTableToJson: jest.fn(),
}));

import { runSaga } from "redux-saga";
import axios from "axios";
import { checkOptionalAsset as checkSageQcAsset } from "./sageQc/saga";
import { checkOptionalAsset as checkSnvplicityAsset } from "./snvplicity/saga";

const checkers = [
  ["Sage QC", checkSageQcAsset],
  ["Purity-Ploidy", checkSnvplicityAsset],
];

describe.each(checkers)("%s optional asset availability", (_name, checkAsset) => {
  afterEach(() => jest.restoreAllMocks());

  it("recognizes an available asset", async () => {
    jest.spyOn(axios, "head").mockResolvedValue({
      headers: { "content-type": "image/png" },
    });

    await expect(runSaga({}, checkAsset, "/asset.png").toPromise()).resolves.toEqual({
      present: true,
      error: null,
    });
  });

  it("recognizes a missing asset without an error", async () => {
    jest.spyOn(axios, "head").mockRejectedValue({
      response: { status: 404 },
    });

    await expect(runSaga({}, checkAsset, "/asset.png").toPromise()).resolves.toEqual({
      present: false,
      error: null,
    });
  });

  it("recognizes the local HTML fallback as missing", async () => {
    jest.spyOn(axios, "head").mockResolvedValue({
      headers: { "content-type": "text/html; charset=utf-8" },
    });

    await expect(runSaga({}, checkAsset, "/asset.png").toPromise()).resolves.toEqual({
      present: false,
      error: null,
    });
  });

  it("retains a genuine request failure", async () => {
    const error = { response: { status: 500 } };
    jest.spyOn(axios, "head").mockRejectedValue(error);

    await expect(runSaga({}, checkAsset, "/asset.png").toPromise()).resolves.toEqual({
      present: false,
      error,
    });
  });
});
