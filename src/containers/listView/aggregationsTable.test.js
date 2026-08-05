/** @jest-environment node */
/* eslint-disable import/first */

jest.mock("react-i18next", () => ({
  withTranslation: () => (Component) => Component,
}));
jest.mock("antd", () => ({
  Table: "Table",
  Typography: { Text: "Text" },
  Select: "Select",
  Tooltip: "Tooltip",
  Row: "Row",
  Col: "Col",
  Button: "Button",
}));
jest.mock("@ant-design/icons", () => ({ DownloadOutlined: "DownloadOutlined" }));
jest.mock("d3", () => ({ format: () => (value) => `${value}` }));
jest.mock("../../components/aggregationsVisualization/helpers", () => ({
  openCaseInNewTab: jest.fn(),
}));
jest.mock("../../helpers/browseScope", () => ({
  allDatasetsBrowseScope: jest.fn(),
  buildCaseReportUrl: jest.fn(),
  datasetBrowseScope: jest.fn(),
  datasetHasField: (dataset, fieldId) =>
    (dataset?.fields || []).some(
      (field) => (field.id || field.name) === fieldId,
    ),
  sourceCaseIdentityKey: jest.fn(),
}));

import { AggregationsTable } from "./aggregationsTable";

describe("AggregationsTable schema columns", () => {
  it("omits disabled metadata columns from the selector, table, stats, and CSV source", () => {
    const table = new AggregationsTable({
      dataset: {
        fields: [
          { id: "disease" },
          { id: "purity" },
        ],
      },
      filteredRecords: [],
      t: (key) => key,
    });

    expect(table.buildColumns().map(({ key }) => key)).toEqual([
      "pair",
      "disease",
      "qcEvaluation",
      "purity",
      "summary",
    ]);
  });
});
