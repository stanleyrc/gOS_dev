/** @jest-environment node */
/* eslint-disable import/first */

jest.mock("react-redux", () => ({ connect: () => (Component) => Component }));
jest.mock("react-i18next", () => ({
  withTranslation: () => (Component) => Component,
}));
jest.mock("antd", () => ({
  Button: "button",
  Dropdown: "dropdown",
  Tooltip: "tooltip",
  Typography: { Text: "text" },
}));
jest.mock("@ant-design/icons", () => ({
  CheckOutlined: "check",
  DownOutlined: "down",
}));
jest.mock("../../helpers/staticManifests", () => ({
  loadConfiguredManifestsWithStatus: jest.fn(),
}));
jest.mock("./index.style", () => ({
  __esModule: true,
  default: "patient-switcher",
  PatientCaseMenuStyle: "patient-menu-style",
}));

import { PatientCaseSwitcher } from "./index";
import { patientCaseIdentityKey } from "./helpers";

const t = (key, options = {}) =>
  key === "components.patient-case-switcher.specimen-date"
    ? `Specimen date: ${options.date}`
    : key;

const createComponent = (overrides = {}) => {
  const props = {
    cachedRecordsByDataset: {},
    dataset: { id: "a" },
    datasets: [
      { id: "a", title: "Dataset A" },
      { id: "b", title: "Dataset B" },
    ],
    loadPatientCases: jest.fn().mockResolvedValue([
      {
        identity: { datasetId: "a", caseReportId: "case-1" },
        pair: "PAIR-1",
        specimenDate: "2025-01-01",
      },
      {
        identity: { datasetId: "b", caseReportId: "case-2" },
        pair: "PAIR-2",
        specimenDate: "2024-01-01",
      },
    ]),
    metadata: {
      patient_id: "PATIENT-1",
      datasetId: "a",
      caseReportId: "case-1",
    },
    openCaseReport: jest.fn(),
    report: "case-1",
    t,
    ...overrides,
  };
  const component = new PatientCaseSwitcher(props);
  component.setState = (update) => {
    const next =
      typeof update === "function"
        ? update(component.state, component.props)
        : update;
    component.state = { ...component.state, ...next };
  };
  return component;
};

describe("PatientCaseSwitcher", () => {
  it("scans configured manifests and marks the current source case", async () => {
    const component = createComponent();
    await component.componentDidMount();

    expect(component.props.loadPatientCases).toHaveBeenCalledWith(
      component.props.datasets,
      "PATIENT-1",
      {},
    );
    expect(component.state.kind).toBe("ready");
    expect(component.getMenuItems()[0]).toMatchObject({
      disabled: true,
      className: "patient-case-switcher-current",
    });
  });

  it("opens a related case using its source dataset and case-report ID", async () => {
    const component = createComponent();
    await component.componentDidMount();
    const nextCase = component.state.cases[1];

    component.handleCaseSelect({
      key: patientCaseIdentityKey(nextCase.identity),
    });

    expect(component.props.openCaseReport).toHaveBeenCalledWith("b", "case-2");
  });

  it("stays hidden when metadata has no patient ID", async () => {
    const component = createComponent({ metadata: {} });
    await component.componentDidMount();

    expect(component.props.loadPatientCases).not.toHaveBeenCalled();
    expect(component.render()).toBeNull();
  });
});
