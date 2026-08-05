/** @jest-environment node */
/* eslint-disable import/first */

jest.mock("d3", () => ({}));
jest.mock("../../helpers/utility", () => ({
  getColorMarker: jest.fn(),
  measureText: jest.fn(() => 0),
}));
jest.mock("./scatterPlot", () => "scatter-plot");
jest.mock("./oncoPrintPlot", () => "oncoprint-plot");

import { projectSourceRecordFields } from "../../helpers/browseScope";
import { discoverAttributes } from "./helpers";
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

describe("AggregationsVisualization schema columns", () => {
  it("discovers the global field union without rediscovering omitted raw values", () => {
    const datasets = [
      { id: "a", fields: [{ id: "purity" }] },
      { id: "b", fields: [{ id: "ploidy" }] },
    ];
    const records = [
      { datasetId: "a", pair: "A", purity: 0.4, ploidy: 4.2, tmb: 999 },
      { datasetId: "b", pair: "B", purity: 0.5, ploidy: 4.3, tmb: 998 },
    ].map((record) => projectSourceRecordFields(record, datasets));

    const columns = discoverAttributes(records);

    expect(columns.numericColumns.map(({ dataIndex }) => dataIndex).sort()).toEqual([
      "ploidy",
      "purity",
    ]);
    expect(
      columns.allColumns.map(({ dataIndex }) => dataIndex),
    ).not.toContain("tmb");
    expect(records[0].ploidy).toBeUndefined();
    expect(records[1].purity).toBeUndefined();
  });

  it("does not fall back to a disabled hardcoded numeric axis", () => {
    const component = new AggregationsVisualization({
      filteredRecords: [{ datasetId: "a", pair: "A", disease: "AML" }],
      pathwayMap: {},
    });

    expect(component.state.xVariable).not.toBe("pair");
    expect(component.state.yVariable).not.toBe("sv_count");
    expect(component.state.yVariable).not.toBe("tmb");
    expect(component.getPlotType()).toBe("stacked-bar");
  });

  it("reselects available schema axes when records arrive after mount", () => {
    const previousProps = { filteredRecords: [], pathwayMap: {} };
    const component = new AggregationsVisualization(previousProps);
    component.props = {
      ...previousProps,
      filteredRecords: [
        { datasetId: "a", pair: "A", disease: "AML" },
      ],
    };
    component.setState = (update) => {
      component.state = { ...component.state, ...update };
    };
    component.renderAxes = jest.fn();

    component.componentDidUpdate(previousProps);

    expect(component.state.xVariable).toBe("datasetId");
    expect(component.state.yVariable).toBe("disease");
  });
});
