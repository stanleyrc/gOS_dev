/** @jest-environment node */
/* eslint-disable import/first */

jest.mock("react-redux", () => ({
  connect: () => (Component) => Component,
}));

jest.mock("react-i18next", () => ({
  withTranslation: () => (Component) => Component,
}));

jest.mock("../../helpers/utility", () => ({
  legendColors: () => ["blue", "gray", "red"],
}));

jest.mock("d3", () => {
  const continuousScale = () => {
    let domain = [0, 1];
    let range = [0, 1];
    const scale = (value) =>
      range[0] +
      ((Number(value) - domain[0]) / (domain[1] - domain[0] || 1)) *
        (range[1] - range[0]);
    scale.domain = (nextDomain) => {
      if (nextDomain === undefined) return domain;
      domain = [...nextDomain];
      return scale;
    };
    scale.range = (nextRange) => {
      range = [...nextRange];
      return scale;
    };
    scale.nice = () => scale;
    scale.clamp = () => scale;
    return scale;
  };
  const pointScale = () => {
    let domain = [];
    let range = [0, 1];
    const scale = (value) => {
      const index = domain.indexOf(value);
      return domain.length <= 1
        ? range[0]
        : range[0] + (index / (domain.length - 1)) * (range[1] - range[0]);
    };
    scale.domain = (nextDomain) => {
      domain = [...nextDomain];
      return scale;
    };
    scale.range = (nextRange) => {
      range = [...nextRange];
      return scale;
    };
    return scale;
  };

  return {
    extent: (values) => [Math.min(...values), Math.max(...values)],
    scaleLinear: continuousScale,
    scaleLog: continuousScale,
    scalePoint: pointScale,
  };
});

import { ParallelCoordinatesPlot } from "./index";

const margins = {
  gapX: 10,
  gapY: 10,
  vSpace: 50,
  xTicksCount: 5,
  tickSize: 4,
};

const axis = (dataset, range = [0, 10]) => ({
  id: "tmb",
  range,
  scaleX: "linear",
  format: ".1f",
  q1: 2,
  q3: 8,
  dataset,
});

describe("ParallelCoordinatesPlot comparison groups", () => {
  it("keeps duplicate Pair values distinct by source identity", () => {
    const component = new ParallelCoordinatesPlot({
      width: 400,
      data: [
        axis([
          {
            datasetId: "a",
            caseReportId: "case-a",
            pair: "SAME",
            value: 3,
          },
          {
            datasetId: "b",
            caseReportId: "case-b",
            pair: "SAME",
            value: 7,
          },
        ]),
      ],
      comparisonGroups: [
        {
          id: "saved",
          label: "Saved",
          color: "purple",
          data: [
            axis(
              [
                {
                  datasetId: "c",
                  caseReportId: "case-c",
                  pair: "SAME",
                  value: 30,
                },
              ],
              [0, 30],
            ),
          ],
        },
      ],
      margins,
      style: {},
      t: (key) => key,
    });

    const configuration = component.getPlotConfiguration();

    expect(configuration.lineData).toHaveLength(3);
    expect(new Set(configuration.lineData.map(({ id }) => id)).size).toBe(3);
    expect(configuration.lineData).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          datasetId: "a",
          caseReportId: "case-a",
          groupId: "current",
        }),
        expect.objectContaining({
          datasetId: "b",
          caseReportId: "case-b",
          groupId: "current",
        }),
        expect.objectContaining({
          datasetId: "c",
          caseReportId: "case-c",
          groupId: "saved",
          color: "purple",
        }),
      ]),
    );
    expect(configuration.data[0].xScale.domain()[1]).toBeGreaterThanOrEqual(30);
  });
});
