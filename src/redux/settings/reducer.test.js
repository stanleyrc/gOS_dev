/** @jest-environment node */
/* eslint-disable import/first */

// Only the unrelated plotting scale is stubbed; bin construction, URL
// serialization, and location parsing all use the real utility/helper bodies.
jest.mock("d3", () => ({
  scaleLinear: () => {
    const scale = { domain: () => scale, range: () => scale };
    return scale;
  },
}));
jest.mock("../../helpers/connection", () => class Connection {});
jest.mock("../../helpers/interval", () => class Interval {});

import { allDatasetsBrowseScope } from "../../helpers/browseScope";
import actions from "./actions";
import reducer from "./reducer";

const dataset = { id: "dataset-a", reference: "hg19" };
const stateWithCoordinates = (overrides = {}) => ({
  ...reducer(undefined, { type: "@@INIT" }),
  data: {
    coordinates: {
      sets: {
        hg19: [{ chromosome: "1", startPoint: 1, endPoint: 100 }],
        hg38: [
          { chromosome: "1", startPoint: 1, endPoint: 1000 },
          { chromosome: "2", startPoint: 1, endPoint: 500 },
        ],
      },
    },
  },
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

  test.each([
    ["1:500", [[250, 750]]],
    ["1:1", [[1, 251]]],
    ["2:500", [[1250, 1500]]],
    ["1:20-40", [[20, 40]]],
    ["1:20-1:40", [[20, 40]]],
    ["1:20-20", [[20, 20]]],
    ["1:900-2:100", [[900, 1100]]],
    ["1:20-1:40|2:10-2:40", [[20, 40], [1010, 1040]]],
    ["1:500|2:10-40", [[250, 750], [1010, 1040]]],
  ])("initializes %s against the selected dataset's real chromosome bins", (location, expected) => {
    global.document.location = `http://localhost/?location=${encodeURIComponent(location)}`;
    const selected = reducer(
      stateWithCoordinates({ domains: [[1, 100]] }),
      actions.updateDataset({ id: "dataset-b", reference: "hg38" }, null),
    );

    expect(selected.domains).toEqual(expected);
    expect(selected.datasetInitialized).toBe(true);
    expect(selected.genomeLength).toBe(1500);
    expect(new URL(global.document.location).searchParams.get("location")).toBe(location);
  });

  test.each([
    "unknown:100",
    "1:1400",
    "2:0",
    "1:10-1001",
    "1:100-2:501",
    "1:40-20",
    "2:10-1:900",
    "1:20-",
    "1:1.5-1:40",
    "1:1e1-1:40",
    "1:500||2:10-40",
    "1:500|2:501",
  ])("replaces invalid initial location %s with the whole selected genome", (location) => {
    global.document.location = `http://localhost/?location=${encodeURIComponent(location)}`;
    const selected = reducer(
      stateWithCoordinates({ domains: [[20, 40]] }),
      actions.updateDataset({ id: "dataset-b", reference: "hg38" }, null),
    );

    expect(selected.domains).toEqual([[1, 1500]]);
    expect(new URL(global.document.location).searchParams.get("location")).toBe("1:1-2:500");
  });

  it("preserves current domains after initialization but resets for a new reference", () => {
    const current = stateWithCoordinates({
      datasetInitialized: true,
      domains: [[20, 40]],
    });
    const sameReference = reducer(current, actions.updateDataset(dataset, null));
    expect(sameReference.domains).toBe(current.domains);

    const newReference = reducer(
      sameReference,
      actions.updateDataset({ id: "dataset-b", reference: "hg38" }, null),
    );
    expect(newReference.domains).toEqual([[1, 1500]]);
    expect(new URL(global.document.location).searchParams.get("location")).toBe("1:1-2:500");
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
    expect(url.searchParams.get("location")).toBe("1:1-1:100");

    const returned = reducer(opened, actions.updateCaseReport(null));
    url = new URL(global.document.location);
    expect(returned.browseScope).toEqual({ kind: "all" });
    expect(returned.report).toBeNull();
    expect(url.searchParams.get("scope")).toBe("all");
    expect(url.searchParams.has("dataset")).toBe(false);
  });
});
