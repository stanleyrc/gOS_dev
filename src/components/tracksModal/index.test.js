import React from "react";
import { TextDecoder, TextEncoder } from "util";

global.TextDecoder = TextDecoder;
global.TextEncoder = TextEncoder;

jest.mock("../genomePanel", () => "GenomePanel");
jest.mock("../mutationsPanel", () => "MutationsPanel");
jest.mock("../scatterPlotPanel", () => "ScatterPlotPanel");
jest.mock("../igvPanel/index", () => "IgvPanel");
jest.mock("../tracksLegendPanel", () => "TracksLegendPanel");
jest.mock("../densityPlotPanel", () => "DensityPlotPanel");
jest.mock("../../helpers/sageQc", () => ({ densityPlotVariables: [] }));
jest.mock("../../helpers/utility", () => ({
  dataRanges: () => [0, 1],
  downloadCanvasAsPng: jest.fn(),
  snakeCaseToHumanReadable: (value) => value,
}));
jest.mock("d3", () => ({
  ascending: jest.fn(),
  descending: jest.fn(),
}));
jest.mock("html-to-image", () => ({}));

const { TracksModal } = require("./index");

function countElements(node, type) {
  if (Array.isArray(node)) {
    return node.reduce((count, child) => count + countElements(child, type), 0);
  }
  if (!React.isValidElement(node)) return 0;

  return (
    (node.type === type ? 1 : 0) + countElements(node.props.children, type)
  );
}

function trackState(overrides = {}) {
  return {
    loading: false,
    error: null,
    missing: true,
    data: {
      settings: {},
      intervals: [],
      connections: [],
      intervalBins: {},
      frameConnections: [],
    },
    dataPointsCount: [],
    dataPointsCopyNumber: [],
    dataPointsX: [],
    dataPointsXHigh: [],
    dataPointsXLow: [],
    dataPointsColor: [],
    ...overrides,
  };
}

function props(overrides = {}) {
  return {
    t: (key) => key,
    domains: [[0, 1]],
    genome: trackState(),
    mutations: trackState(),
    genomeCoverage: trackState(),
    methylationBetaCoverage: trackState(),
    methylationIntensityCoverage: trackState(),
    hetsnps: trackState(),
    genes: { loading: false, error: null, list: [] },
    igv: trackState({ missingFiles: [] }),
    allelic: trackState(),
    chromoBins: [],
    metadata: {},
    sageQcFields: [],
    dataPoints: [],
    open: true,
    viewType: "inline",
    width: 1200,
    height: 200,
    ...overrides,
  };
}

function renderTracks(overrides) {
  return new TracksModal(props(overrides)).render();
}

describe("TracksModal missing tracks", () => {
  it("omits missing case-dependent panels but keeps the gene controls", () => {
    const view = renderTracks();

    expect(countElements(view, "TracksLegendPanel")).toBe(1);
    expect(countElements(view, "GenomePanel")).toBe(0);
    expect(countElements(view, "ScatterPlotPanel")).toBe(0);
    expect(countElements(view, "MutationsPanel")).toBe(0);
    expect(countElements(view, "IgvPanel")).toBe(0);
  });

  it("updates when a track's availability changes", () => {
    const initialProps = props();
    const modal = new TracksModal(initialProps);

    expect(
      modal.shouldComponentUpdate(
        {
          ...initialProps,
          igv: trackState({ missing: false, missingFiles: [] }),
        },
        modal.state
      )
    ).toBe(true);
  });

  it("keeps genuine track errors visible", () => {
    const error = new Error("failed");
    const view = renderTracks({
      genome: trackState({ missing: false, error }),
      genomeCoverage: trackState({ missing: false, error }),
      mutations: trackState({ missing: false, error }),
      igv: trackState({ missing: false, error, missingFiles: [] }),
    });

    expect(countElements(view, "GenomePanel")).toBe(1);
    expect(countElements(view, "ScatterPlotPanel")).toBe(1);
    expect(countElements(view, "MutationsPanel")).toBe(1);
    expect(countElements(view, "IgvPanel")).toBe(1);
  });
});
