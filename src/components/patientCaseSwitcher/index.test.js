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
  LoadingOutlined: "loading",
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

const t = (key) => key;

const createComponent = (overrides = {}) => {
  const props = {
    cachedRecordsByDataset: {},
    copyControl: "copy-control",
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
    pair: "PAIR-1",
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
    const currentItem = component.getMenuItems()[0];
    const currentHeading = currentItem.label.props.children[0];
    const currentContext = currentItem.label.props.children[1];

    expect(currentItem).toMatchObject({
      disabled: true,
      className: "patient-case-switcher-current",
    });
    expect(currentItem).not.toHaveProperty("icon");
    expect(currentHeading.props.children[1]).toMatchObject({
      type: "check",
      props: {
        className: "patient-case-switcher-current-check",
        "aria-label": "components.patient-case-switcher.current",
      },
    });
    expect(currentContext.props.className).toBe(
      "patient-case-switcher-option-context-row",
    );
    expect(currentContext.props.children[0].props.children).toBe("Dataset A");
    expect(currentContext.props.children[1].props.children).toBe("2025-01-01");
  });

  it("uses the current case ID as the dropdown trigger", async () => {
    const component = createComponent();
    await component.componentDidMount();

    const rendered = component.render();
    const wrapper = rendered.props.children[1];
    const dropdown = wrapper.props.children[0];
    const trigger = dropdown.props.children;

    expect(trigger.type).toBe("button");
    expect(trigger.props.children[0].props.children).toBe("PAIR-1");
    expect(wrapper.props.children[1]).toBe("copy-control");
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

  it("renders a static case ID when metadata has no patient ID", async () => {
    const component = createComponent({ metadata: {} });
    await component.componentDidMount();

    const rendered = component.render();

    expect(component.props.loadPatientCases).not.toHaveBeenCalled();
    expect(rendered.type).toBe("patient-switcher");
    expect(rendered.props.children[0].props.children).toBe("PAIR-1");
    expect(rendered.props.children[1]).toBe("copy-control");
  });
});
