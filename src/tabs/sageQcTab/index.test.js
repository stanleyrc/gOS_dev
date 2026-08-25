/** @jest-environment node */

import React from "react";
import { TextDecoder, TextEncoder } from "util";

global.TextDecoder = TextDecoder;
global.TextEncoder = TextEncoder;

jest.mock("../../components/densityPlotPanel", () => "DensityPlotPanel");
jest.mock("../../components/tracksModal", () => "TracksModal");
jest.mock("../../components/errorPanel", () => "ErrorPanel");
jest.mock("../../helpers/utility", () => ({
  snakeCaseToHumanReadable: (value) => value,
}));
jest.mock("./index.style", () => "Wrapper");

const { SageQcTab } = require("./index");

function findElementByType(node, type) {
  if (Array.isArray(node)) {
    for (const child of node) {
      const match = findElementByType(child, type);
      if (match) return match;
    }
    return null;
  }
  if (!React.isValidElement(node)) return null;
  if (node.type === type) return node;

  for (const child of React.Children.toArray(node.props.children)) {
    const match = findElementByType(child, type);
    if (match) return match;
  }
  return null;
}

function props(overrides = {}) {
  return {
    t: (key) => key,
    loading: false,
    loadingPercentage: 0,
    error: null,
    missing: false,
    coverageOriginalPresent: false,
    coverageOriginalError: null,
    coverageDenoisedPresent: false,
    coverageDenoisedError: null,
    dataPoints: [],
    sageQcFields: [
      { name: "z_numeric", type: "int", format: ".1f" },
      { name: "a_numeric", type: "float", format: ".3f" },
      { name: "status", type: "enum" },
    ],
    metadata: { pair: "case-1" },
    dataset: { dataPath: "" },
    id: "case-1",
    selectVariant: jest.fn(),
    selectedVariant: null,
    ...overrides,
  };
}

describe("SageQcTab density variables", () => {
  it("uses the shared ordered defaults for the density plot", () => {
    const view = new SageQcTab(props()).render();
    const densityPlot = findElementByType(view, "DensityPlotPanel");

    expect(densityPlot).not.toBeNull();
    expect(densityPlot.props.xVariable).toBe("a_numeric");
    expect(densityPlot.props.yVariable).toBe("z_numeric");
    expect(densityPlot.props.colorVariable).toBe("a_numeric");
  });
});
