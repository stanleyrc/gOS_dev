/** @jest-environment node */
/* eslint-disable import/first */

jest.mock("../../helpers/utility", () => ({
  domainsToLocation: (chromoBins, domains) =>
    `full:${domains[0][0]}-${domains[0][1]}`,
  locationToDomains: () => [[20, 40]],
  updateChromoBins: () => ({
    genomeLength: 100,
    chromoBins: { 1: { startPoint: 1, endPoint: 100 } },
  }),
}));

import { allDatasetsBrowseScope } from "../../helpers/browseScope";
import actions from "./actions";
import reducer from "./reducer";

const dataset = { id: "dataset-a", reference: "hg19" };
const stateWithCoordinates = (overrides = {}) => ({
  ...reducer(undefined, { type: "@@INIT" }),
  data: { coordinates: { sets: { hg19: [] } } },
  ...overrides,
});

describe("Settings browse context", () => {
  beforeEach(() => {
    global.document = { location: "http://localhost/?dataset=old&report=old" };
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

  it("selects All accessible datasets without replacing the real source dataset", () => {
    const state = reducer(
      stateWithCoordinates({ dataset, report: "old" }),
      actions.updateBrowseScope(allDatasetsBrowseScope()),
    );
    const url = new URL(global.document.location);

    expect(state.dataset).toBe(dataset);
    expect(state.browseScope).toEqual({ kind: "all" });
    expect(state.report).toBeNull();
    expect(url.searchParams.get("scope")).toBe("all");
    expect(url.searchParams.has("dataset")).toBe(false);
  });

  it("preserves a bookmarked domain when initial selection keeps the reference", () => {
    global.document.location =
      "http://localhost/?dataset=old&report=old&location=1:20-1:40";
    const selected = reducer(
      stateWithCoordinates({
        dataset: { id: "placeholder", reference: "hg19" },
        domains: [[20, 40]],
      }),
      actions.updateDataset(dataset, null),
    );
    const url = new URL(global.document.location);

    expect(selected.domains).toEqual([[20, 40]]);
    expect(url.searchParams.get("location")).toBe("1:20-1:40");
  });

  it("opens and returns from a source case while preserving global scope", () => {
    const opened = reducer(
      stateWithCoordinates({ browseScope: allDatasetsBrowseScope() }),
      actions.updateDataset(dataset, "case-1", {
        preserveBrowseScope: true,
        refreshBrowseResults: false,
      }),
    );
    let url = new URL(global.document.location);

    expect(opened.browseScope).toEqual({ kind: "all" });
    expect(opened.domains).toEqual([[1, 100]]);
    expect(url.searchParams.get("dataset")).toBe("dataset-a");
    expect(url.searchParams.get("report")).toBe("case-1");
    expect(url.searchParams.get("location")).toBe("full:1-100");

    const returned = reducer(opened, actions.updateCaseReport(null));
    url = new URL(global.document.location);
    expect(returned.browseScope).toEqual({ kind: "all" });
    expect(returned.report).toBeNull();
    expect(url.searchParams.get("scope")).toBe("all");
    expect(url.searchParams.has("dataset")).toBe(false);
  });
});
