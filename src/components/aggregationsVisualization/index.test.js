jest.mock("d3", () => ({}));
jest.mock("../../helpers/utility", () => ({
  getColorMarker: jest.fn(),
  measureText: jest.fn(() => 0),
}));
jest.mock("./scatterPlot", () => "scatter-plot");
jest.mock("./oncoPrintPlot", () => "oncoprint-plot");

import { AggregationsVisualization } from "./index";

describe("AggregationsVisualization patient preset", () => {
  it("places pairs on the x-axis and driver genes on the y-axis", () => {
    const component = new AggregationsVisualization({
      filteredRecords: [],
      pathwayMap: {},
      visualizationPreset: "topGenes",
    });

    expect(component.state.xVariable).toBe("pair");
    expect(component.state.yVariable).toBe("driver_gene");
    expect(component.getTitleText()).toBe("Driver Genes (Top 20) vs. Pair");
  });
});
