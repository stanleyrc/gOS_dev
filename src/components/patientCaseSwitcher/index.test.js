/** @jest-environment node */

import React from "react";
import { PatientCaseSwitcher } from "./index";
import { patientCaseIdentityKey } from "./helpers";

jest.mock("react-redux", () => ({
  connect: () => (Component) => Component,
}));

jest.mock("react-i18next", () => ({
  withTranslation: () => (Component) => Component,
}));

jest.mock("axios", () => ({
  CancelToken: {
    source: jest.fn(() => ({ token: {}, cancel: jest.fn() })),
  },
  get: jest.fn(),
  isCancel: (error) => Boolean(error?.isCanceled),
}));

jest.mock("antd", () => ({
  Button: "button",
  Dropdown: "dropdown",
  Tooltip: "tooltip",
  Typography: { Text: "text" },
}));

jest.mock("@ant-design/icons", () => ({
  CheckOutlined: "check-icon",
  DownOutlined: "down-icon",
}));

jest.mock("./index.style", () => ({
  __esModule: true,
  default: "patient-case-switcher",
  PatientCaseMenuStyle: "patient-case-menu-style",
}));

jest.mock("../../helpers/utility", () => ({
  datafilesArrowTableToJson: jest.fn(),
}));

const translations = {
  "components.patient-case-switcher.loading": "Loading patient cases…",
  "components.patient-case-switcher.failure": "Patient cases unavailable",
  "components.patient-case-switcher.failure-description":
    "Related patient cases could not be loaded.",
  "components.patient-case-switcher.empty": "No related cases found",
  "components.patient-case-switcher.current": "Current case",
};

const t = (key, options = {}) => {
  if (key === "components.patient-case-switcher.trigger") {
    return `Patient cases (${options.count})`;
  }
  if (key === "components.patient-case-switcher.trigger-partial") {
    return `Patient cases (${options.count}, partial)`;
  }
  if (key === "components.patient-case-switcher.specimen-date") {
    return `Specimen date: ${options.date}`;
  }
  return translations[key] || key;
};

const createCancelSourceFactory = () => {
  const sources = [];
  const createCancelSource = jest.fn(() => {
    const source = { token: {}, cancel: jest.fn() };
    sources.push(source);
    return source;
  });

  return { createCancelSource, sources };
};

const createProps = (overrides = {}) => {
  const cancellation = createCancelSourceFactory();
  return {
    metadata: {
      patient_id: "PATIENT-1",
      datasetId: "dataset-a",
      caseReportId: "case-1",
    },
    datasets: [
      { id: "dataset-a", title: "Dataset A", datafilesPath: "a.json" },
      { id: "dataset-b", title: "Dataset B", datafilesPath: "b.arrow" },
    ],
    searchPatientCases: jest.fn(),
    createCancelSource: cancellation.createCancelSource,
    updateCaseReport: jest.fn(),
    updateDataset: jest.fn(),
    t,
    cancellation,
    ...overrides,
  };
};

const createComponent = (props) => {
  const component = new PatientCaseSwitcher(props);
  component.setState = (update, callback) => {
    const nextState =
      typeof update === "function"
        ? update(component.state, component.props)
        : update;
    component.state = { ...component.state, ...nextState };
    if (callback) callback();
  };
  return component;
};

const createPatientCase = (
  caseReportId,
  datasetId,
  pair,
  specimenDate = null
) => ({
  identity: { caseReportId, datasetId },
  pair,
  specimenDate,
});

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const allElements = (node) => {
  if (Array.isArray(node)) return node.flatMap(allElements);
  if (!React.isValidElement(node)) return [];
  return [node, ...allElements(node.props.children)];
};

const elementText = (node) => {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return `${node}`;
  if (Array.isArray(node)) return node.map(elementText).join("");
  if (React.isValidElement(node)) return elementText(node.props.children);
  return "";
};

describe("PatientCaseSwitcher", () => {
  it.each([undefined, null, "", "   "])(
    "stays hidden and performs no request without a Patient ID: %p",
    async (patientId) => {
      const props = createProps({
        metadata: {
          patient_id: patientId,
          datasetId: "dataset-a",
          caseReportId: "case-1",
        },
      });
      const component = createComponent(props);

      await component.componentDidMount();

      expect(component.state).toMatchObject({ kind: "hidden", cases: [] });
      expect(props.searchPatientCases).not.toHaveBeenCalled();
      expect(props.createCancelSource).not.toHaveBeenCalled();
      expect(component.render()).toBeNull();
    }
  );

  it("scans every accessible dataset into isolated ready state", async () => {
    const props = createProps();
    const cases = [
      createPatientCase("case-1", "dataset-a", "Current", "2025-01-01"),
      createPatientCase("case-2", "dataset-b", "Related", "2024-01-01"),
    ];
    props.searchPatientCases.mockResolvedValue(cases);
    const component = createComponent(props);

    await component.componentDidMount();

    expect(props.searchPatientCases).toHaveBeenCalledWith(
      props.datasets,
      "PATIENT-1",
      { cancelToken: props.cancellation.sources[0].token }
    );
    expect(component.state).toEqual({
      kind: "ready",
      cases,
      failedDatasetCount: 0,
      message: null,
    });
    expect(props.updateCaseReport).not.toHaveBeenCalled();
    expect(props.updateDataset).not.toHaveBeenCalled();
  });

  it("cancels the prior request and ignores its stale response", async () => {
    const first = deferred();
    const second = deferred();
    const props = createProps();
    props.searchPatientCases.mockImplementation((datasets, patientId) =>
      patientId === "PATIENT-1" ? first.promise : second.promise
    );
    const component = createComponent(props);
    const firstRequest = component.componentDidMount();
    const previousProps = component.props;
    component.props = {
      ...component.props,
      metadata: {
        patient_id: "PATIENT-2",
        datasetId: "dataset-b",
        caseReportId: "case-2",
      },
    };

    const secondRequest = component.componentDidUpdate(previousProps);
    expect(props.cancellation.sources[0].cancel).toHaveBeenCalledTimes(1);

    second.resolve([
      createPatientCase(
        "case-2",
        "dataset-b",
        "Second Patient",
        "2025-01-01"
      ),
    ]);
    await secondRequest;

    first.resolve([
      createPatientCase(
        "case-1",
        "dataset-a",
        "Stale Patient",
        "2026-01-01"
      ),
    ]);
    await firstRequest;

    expect(component.state.cases.map(({ pair }) => pair)).toEqual([
      "Second Patient",
    ]);
  });

  it("reloads when the configured static dataset sources change", async () => {
    const props = createProps();
    props.searchPatientCases.mockResolvedValue([]);
    const component = createComponent(props);
    await component.componentDidMount();
    const previousProps = component.props;
    component.props = {
      ...component.props,
      datasets: [
        ...component.props.datasets,
        { id: "dataset-c", title: "Dataset C", datafilesPath: "c.json" },
      ],
    };

    await component.componentDidUpdate(previousProps);

    expect(props.searchPatientCases).toHaveBeenCalledTimes(2);
    expect(props.cancellation.sources[0].cancel).not.toHaveBeenCalled();
    expect(props.searchPatientCases.mock.calls[1][0]).toHaveLength(3);
  });

  it("cancels local work when unmounted", async () => {
    const response = deferred();
    const props = createProps();
    props.searchPatientCases.mockReturnValue(response.promise);
    const component = createComponent(props);
    const request = component.componentDidMount();

    component.componentWillUnmount();
    expect(props.cancellation.sources[0].cancel).toHaveBeenCalledTimes(1);

    response.resolve([]);
    await request;
    expect(component.state.kind).toBe("loading");
  });

  it("renders a compact retryable failure state without global error dispatch", async () => {
    const props = createProps();
    props.searchPatientCases.mockRejectedValue(new Error("network down"));
    const component = createComponent(props);

    await component.componentDidMount();

    expect(component.state.kind).toBe("failed");
    expect(component.state.message).toBe("network down");
    expect(props.updateCaseReport).not.toHaveBeenCalled();
    expect(props.updateDataset).not.toHaveBeenCalled();

    const view = component.render();
    const button = allElements(view).find((element) => element.type === "button");
    expect(button.props.disabled).not.toBe(true);
    expect(button.props.onClick).toBe(component.loadPatientCases);
    expect(elementText(button)).toContain("Patient cases unavailable");
  });

  it("labels a partial result instead of presenting its count as complete", () => {
    const props = createProps();
    const component = createComponent(props);
    component.state = {
      kind: "ready",
      cases: [createPatientCase("case-1", "dataset-a", "Current")],
      failedDatasetCount: 1,
      message: null,
    };

    expect(elementText(component.renderControl())).toContain(
      "Patient cases (1, partial)"
    );
  });

  it("renders a ready empty state in the dropdown", () => {
    const props = createProps();
    const component = createComponent(props);
    component.state = { kind: "ready", cases: [], message: null };

    expect(component.getMenuItems()).toEqual([
      {
        key: "patient-case-switcher-empty",
        disabled: true,
        label: "No related cases found",
      },
    ]);
    expect(elementText(component.renderControl())).toContain(
      "Patient cases (0)"
    );
  });

  it("highlights the current case and uses same- and cross-dataset settings seams", () => {
    const props = createProps();
    const component = createComponent(props);
    component.state = {
      kind: "ready",
      message: null,
      cases: [
        createPatientCase(
          "case-1",
          "dataset-a",
          "Current Pair",
          "2025-01-01"
        ),
        createPatientCase("case-2", "dataset-a", "Same Dataset"),
        createPatientCase(
          "case-3",
          "dataset-b",
          "Cross Dataset",
          "2024-01-01"
        ),
      ],
    };

    const items = component.getMenuItems();
    const currentKey = patientCaseIdentityKey(component.state.cases[0].identity);
    const sameDatasetKey = patientCaseIdentityKey(
      component.state.cases[1].identity
    );
    const crossDatasetKey = patientCaseIdentityKey(
      component.state.cases[2].identity
    );

    expect(items.find(({ key }) => key === currentKey)).toMatchObject({
      disabled: true,
      className: "patient-case-switcher-current",
    });
    expect(elementText(items[0].label)).toContain("Dataset A");
    expect(elementText(items[0].label)).toContain(
      "Specimen date: 2025-01-01"
    );

    component.handleCaseSelect({ key: currentKey });
    expect(props.updateCaseReport).not.toHaveBeenCalled();
    expect(props.updateDataset).not.toHaveBeenCalled();

    component.handleCaseSelect({ key: sameDatasetKey });
    expect(props.updateCaseReport).toHaveBeenLastCalledWith("case-2");
    expect(props.updateDataset).not.toHaveBeenCalled();

    component.handleCaseSelect({ key: crossDatasetKey });
    expect(props.updateDataset).toHaveBeenLastCalledWith(
      props.datasets[1],
      "case-3"
    );
  });

  it("uses Dataset ID when an accessible dataset title is unavailable", () => {
    const props = createProps({ datasets: [] });
    const component = createComponent(props);

    expect(component.getDatasetTitle("unknown-dataset")).toBe(
      "unknown-dataset"
    );
  });
});
