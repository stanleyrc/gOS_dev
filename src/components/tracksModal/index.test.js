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
jest.mock("../../helpers/utility", () => ({
  dataRanges: () => [0, 1],
  downloadCanvasAsPng: jest.fn(),
  snakeCaseToHumanReadable: (value) => value,
}));
jest.mock("html-to-image", () => ({}));

const { Modal, Spin, Tabs } = require("antd");
const jsxRuntime = require("react/jsx-dev-runtime");
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

function constructedElementTypes(overrides) {
  const jsxSpy = jest.spyOn(jsxRuntime, "jsxDEV");
  try {
    renderTracks(overrides);
    return jsxSpy.mock.calls.map(([type]) => type);
  } finally {
    jsxSpy.mockRestore();
  }
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

  it("preserves both presented modal tabs", () => {
    const modalComponent = new TracksModal(
      props({ viewType: "modal", showVariants: true }),
    );
    modalComponent.state = { ...modalComponent.state, contentReady: true };

    const view = modalComponent.render();
    const tabs = findElementByType(view, Tabs);

    expect(tabs.props.items.map(({ key }) => key)).toEqual([
      "tracks",
      "variantQc",
    ]);
    expect(countElements(tabs.props.items[0].children, "TracksLegendPanel")).toBe(
      1,
    );
    expect(countElements(tabs.props.items[1].children, "DensityPlotPanel")).toBe(
      1,
    );
  });

  it("exposes Variant QC as standalone inline content", () => {
    const view = renderTracks({
      contentView: "variantQc",
      sageQcFields: [
        { name: "z_numeric", type: "int" },
        { name: "a_numeric", type: "float" },
        { name: "status", type: "enum" },
      ],
    });
    const densityPlot = findElementByType(view, "DensityPlotPanel");

    expect(densityPlot).not.toBeNull();
    expect(densityPlot.props.xVariable).toBe("a_numeric");
    expect(densityPlot.props.yVariable).toBe("z_numeric");
    expect(densityPlot.props.colorVariable).toBe("a_numeric");
    expect(countElements(view, "TracksLegendPanel")).toBe(0);
  });

  it("does not construct Variant QC children in inline Plots mode", () => {
    const types = constructedElementTypes({ contentView: "plots" });

    expect(types).toContain("TracksLegendPanel");
    expect(types).not.toContain("DensityPlotPanel");
  });

  it("does not construct tracks children in inline Variant QC mode", () => {
    const types = constructedElementTypes({ contentView: "variantQc" });

    expect(types).toContain("DensityPlotPanel");
    expect(types).not.toContain("TracksLegendPanel");
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
