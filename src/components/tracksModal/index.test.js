/** @jest-environment node */

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

const { Modal, Spin } = require("antd");
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

function findElementByType(node, type) {
  if (!React.isValidElement(node)) return null;
  if (node.type === type) return node;

  for (const child of React.Children.toArray(node.props.children)) {
    const match = findElementByType(child, type);
    if (match) return match;
  }
  return null;
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

  it("opens the IGV track by default in event plots", () => {
    const view = renderTracks({
      igv: trackState({ missing: false, missingFiles: [] }),
    });
    const igvPanel = findElementByType(view, "IgvPanel");

    expect(igvPanel).not.toBeNull();
    expect(igvPanel.props.defaultVisible).toBe(true);
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

  it("commits a loading shell before rendering heavy modal content", () => {
    const afterOpenChange = jest.fn();
    const modalComponent = new TracksModal(
      props({ viewType: "modal", afterOpenChange }),
    );
    modalComponent.setState = (update) => {
      const nextState =
        typeof update === "function"
          ? update(modalComponent.state, modalComponent.props)
          : update;
      modalComponent.state = { ...modalComponent.state, ...nextState };
    };

    const loadingView = modalComponent.render();
    const modal = findElementByType(loadingView, Modal);

    expect(modal).not.toBeNull();
    expect(countElements(loadingView, Spin)).toBe(1);
    expect(countElements(loadingView, "TracksLegendPanel")).toBe(0);

    modal.props.afterOpenChange(true);

    expect(afterOpenChange).toHaveBeenCalledWith(true);
    expect(modalComponent.state.contentReady).toBe(true);
    expect(countElements(modalComponent.render(), "TracksLegendPanel")).toBe(1);

    const openProps = modalComponent.props;
    modalComponent.props = { ...openProps, open: false };
    modalComponent.componentDidUpdate(openProps);
    expect(modalComponent.state.contentReady).toBe(false);
  });

  it("exposes Variant QC as standalone inline content", () => {
    const view = renderTracks({ contentView: "variantQc" });

    expect(countElements(view, "DensityPlotPanel")).toBe(1);
    expect(countElements(view, "TracksLegendPanel")).toBe(0);
  });

  it("updates when the requested inline content changes", () => {
    const initialProps = props({ contentView: "plots" });
    const modal = new TracksModal(initialProps);

    expect(
      modal.shouldComponentUpdate(
        { ...initialProps, contentView: "variantQc" },
        modal.state,
      ),
    ).toBe(true);
  });
});
