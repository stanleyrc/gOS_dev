/** @jest-environment node */
/* eslint-disable import/first */

jest.mock("../../helpers/utility", () => ({
  domainsToLocation: (chromoBins, domains) =>
    `full:${domains[0][0]}-${domains[0][1]}`,
  locationToDomains: (chromoBins, location) =>
    location.includes("bad") ? [[NaN, 40]] : [[20, 40]],
  updateChromoBins: () => ({
    genomeLength: 200,
    chromoBins: { 1: { startPoint: 1, endPoint: 200 } },
  }),
}));

import actions from "./actions";
import reducer from "./reducer";

describe("Settings dataset selection", () => {
  beforeEach(() => {
    global.document = {
      location: "http://localhost/?dataset=old&report=old&location=1:20-1:40",
    };
    global.window = {
      history: {
        replaceState: jest.fn((url) => {
          global.document.location = url;
        }),
      },
    };
  });

  afterEach(() => {
    delete global.document;
    delete global.window;
  });

  it("does not rewrite a bookmark using placeholder hg19 settings", () => {
    const state = reducer(undefined, {
      type: actions.FETCH_SETTINGS_DATA_SUCCESS,
      data: {},
      chromoBins: { 1: { startPoint: 1, endPoint: 200 } },
      defaultDomain: [1, 200],
      domains: [[20, 40]],
      genomeLength: 200,
      signatureTitles: {},
    });

    expect(state.domains).toEqual([[20, 40]]);
    expect(new URL(global.document.location).searchParams.get("location")).toBe(
      "1:20-1:40"
    );
  });

  it("reparses and preserves an initial bookmark for an hg38 dataset", () => {
    const initialState = {
      ...reducer(undefined, { type: "@@INIT" }),
      data: { coordinates: { sets: { hg38: [] } } },
      domains: [[10, 30]],
    };

    const state = reducer(
      initialState,
      actions.updateDataset({ id: "dataset-a", reference: "hg38" }, null)
    );
    const url = new URL(global.document.location);

    expect(state.domains).toEqual([[20, 40]]);
    expect(url.searchParams.get("location")).toBe("1:20-1:40");
  });

  it("falls back to the full genome for invalid numeric bookmarks", () => {
    global.document.location =
      "http://localhost/?dataset=old&report=old&location=1:bad-1:40";
    const initialState = {
      ...reducer(undefined, { type: "@@INIT" }),
      data: { coordinates: { sets: { hg38: [] } } },
      domains: [[NaN, 40]],
    };

    const state = reducer(
      initialState,
      actions.updateDataset({ id: "dataset-a", reference: "hg38" }, null)
    );

    expect(state.domains).toEqual([[1, 200]]);
    expect(new URL(global.document.location).searchParams.get("location")).toBe(
      "full:1-200"
    );
  });

  it("rejects bookmark coordinates outside their chromosome", () => {
    global.document.location =
      "http://localhost/?dataset=old&report=old&location=1:201-1:220";
    const initialState = {
      ...reducer(undefined, { type: "@@INIT" }),
      data: { coordinates: { sets: { hg38: [] } } },
      domains: [[201, 220]],
    };

    const state = reducer(
      initialState,
      actions.updateDataset({ id: "dataset-a", reference: "hg38" }, null)
    );

    expect(state.domains).toEqual([[1, 200]]);
  });

  it("resets genomic domains when a patient case changes references", () => {
    const initialState = {
      ...reducer(undefined, { type: "@@INIT" }),
      data: { coordinates: { sets: { hg38: [] } } },
      domains: [[20, 40]],
      datasetInitialized: true,
    };
    const dataset = { id: "dataset-b", reference: "hg38" };

    const state = reducer(
      initialState,
      actions.updateDataset(dataset, "case-2")
    );
    const url = new URL(global.document.location);

    expect(state.dataset).toBe(dataset);
    expect(state.domains).toEqual([[1, 200]]);
    expect(state.defaultDomain).toEqual([1, 200]);
    expect(url.searchParams.get("location")).toBe("full:1-200");
  });
});
