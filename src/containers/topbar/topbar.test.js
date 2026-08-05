/** @jest-environment node */
/* eslint-disable import/first */

jest.mock("react-redux", () => ({ connect: () => (Component) => Component }));
jest.mock("react-i18next", () => ({
  withTranslation: () => (Component) => Component,
}));
jest.mock("react-router-dom", () => ({
  withRouter: (Component) => Component,
}));
jest.mock("antd", () => ({
  Avatar: "avatar",
  Layout: { Header: "header" },
  Progress: "progress",
  Select: Object.assign("select", { Option: "option" }),
  Space: "space",
  Spin: "spin",
  Typography: { Text: "text" },
}));
jest.mock("@ant-design/icons", () => ({ LoadingOutlined: "loading" }));
jest.mock("./topbar.style", () => "div");
jest.mock("./signInButton", () => "sign-in");
jest.mock("../../assets/images/logo.png", () => "logo");
jest.mock("../../settings", () => ({ siteConfig: { siteName: "gOS" } }));
jest.mock("../../helpers/field", () => ({
  __esModule: true,
  default: class TestField {},
}));

import { ALL_DATASETS_SCOPE_VALUE } from "../../helpers/browseScope";
import { Topbar } from "./topbar";

const report = {
  datasetId: "dataset-a",
  caseReportId: "case-1",
  pair: "PAIR-1",
};

const makeComponent = (overrides = {}) =>
  new Topbar({
    browseScope: { kind: "all" },
    dataset: { id: "dataset-a" },
    datasets: [{ id: "dataset-a", title: "Dataset A" }],
    openCaseReport: jest.fn(),
    reports: [report],
    searchCaseReports: jest.fn(),
    searchFilters: {},
    selectAllDatasets: jest.fn(),
    selectDataset: jest.fn(),
    updateCaseReport: jest.fn(),
    ...overrides,
  });

describe("Topbar browse scope", () => {
  it("maps the synthetic option to All accessible datasets", () => {
    const component = makeComponent();
    component.handleDatasetSelect(ALL_DATASETS_SCOPE_VALUE);

    expect(component.props.selectAllDatasets).toHaveBeenCalledTimes(1);
    expect(component.props.selectDataset).not.toHaveBeenCalled();
    expect(component.getSelectedBrowseScopeValue()).toBe(
      ALL_DATASETS_SCOPE_VALUE,
    );
  });

  it("keeps real datasets on the established selector path", () => {
    const component = makeComponent({
      browseScope: { kind: "dataset", datasetId: "dataset-a" },
    });
    component.handleDatasetSelect("dataset-a");

    expect(component.props.selectDataset).toHaveBeenCalledWith("dataset-a");
  });

  it("opens report options through their source-aware identity", () => {
    const component = makeComponent();
    component.handleReportSelect(component.getReportOptionValue(report));

    expect(component.props.openCaseReport).toHaveBeenCalledWith(
      "dataset-a",
      "case-1",
    );
  });

  it("suppresses report-option values omitted by their source dataset", () => {
    const component = makeComponent({
      browseDataset: {
        isAllDatasets: true,
        fields: [{ id: "tumor_type" }, { id: "inferred_sex" }],
      },
      datasets: [
        {
          id: "dataset-a",
          title: "Dataset A",
          fields: [{ id: "tumor_type" }],
        },
      ],
    });
    const schemaReport = {
      ...report,
      tumor_type: "AML",
      inferred_sex: "SCHEMA-OMITTED",
    };

    expect(component.reportFieldValue(schemaReport, "tumor_type")).toBe(
      "AML",
    );
    expect(
      component.reportFieldValue(schemaReport, "inferred_sex"),
    ).toBeUndefined();
  });

  it("counts all accessible datasets by distinct global cases", () => {
    const component = makeComponent({
      datasets: [
        { id: "dataset-a", title: "Dataset A" },
        { id: "dataset-b", title: "Dataset B" },
      ],
      manifestRecordsByDataset: {
        "dataset-a": [
          { datasetId: "dataset-a", caseReportId: "case-1" },
          { datasetId: "dataset-a", caseReportId: "case-1" },
        ],
        "dataset-b": [{ datasetId: "dataset-b", caseReportId: "case-1" }],
      },
    });

    expect(component.getAllDatasetsCaseCount()).toBe(1);
  });
});
