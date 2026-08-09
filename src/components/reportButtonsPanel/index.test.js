/** @jest-environment node */

/* eslint-disable import/first */

import React from "react";

jest.mock("react-i18next", () => ({
  withTranslation: () => (Component) => Component,
}));

jest.mock("react-redux", () => ({
  connect: () => (Component) => Component,
}));

jest.mock("antd", () => ({ Button: "Button" }));
jest.mock("react-icons/fa6", () => ({ FaFileMedical: "FaFileMedical" }));
jest.mock("../reportPreviewModal", () => "ReportPreviewModal");
jest.mock("./index.style", () => "Wrapper");
jest.mock("../../helpers/reportExporter", () => ({
  exportReport: jest.fn(),
  previewReport: jest.fn(),
}));
jest.mock("../../redux/filteredEvents/actions", () => ({
  __esModule: true,
  default: {
    selectFilteredEvent: jest.fn(),
    resetTierOverrides: jest.fn(),
  },
}));
jest.mock("../../redux/interpretations/actions", () => ({
  __esModule: true,
  default: {
    CLEAR_CASE_INTERPRETATIONS_REQUEST: "CLEAR_CASE_INTERPRETATIONS_REQUEST",
    clearCaseInterpretations: (caseId, completion, dataset) => ({
      type: "CLEAR_CASE_INTERPRETATIONS_REQUEST",
      caseId,
      completion,
      dataset,
    }),
  },
}));

import { exportReport, previewReport } from "../../helpers/reportExporter";
import interpretationsActions from "../../redux/interpretations/actions";
import { mapDispatchToProps, ReportButtonsPanel } from ".";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function createProps(overrides = {}) {
  return {
    t: (key) => key,
    loading: false,
    id: "case-1",
    dataset: { id: "dataset-1" },
    mergedEvents: {
      filteredEvents: [
        {
          uid: "alteration-1",
          gene: "TP53",
          variant: "p.R175H",
          type: "SNV",
        },
      ],
    },
    selectedEventUids: ["alteration-1"],
    resetTierOverrides: jest.fn(),
    selectFilteredEvent: jest.fn(),
    clearCaseInterpretations: jest.fn(),
    ...overrides,
  };
}

function createComponent(props = {}) {
  const component = new ReportButtonsPanel(createProps(props));
  component.state = {
    ...component.state,
    previewVisible: true,
    previewHtml: "<html>Report</html>",
    previewContext: {
      caseId: component.props.id,
      datasetId: component.props.dataset?.id,
    },
  };
  component.setState = (update) => {
    const nextState =
      typeof update === "function"
        ? update(component.state, component.props)
        : update;
    component.state = { ...component.state, ...nextState };
  };
  return component;
}

describe("ReportButtonsPanel report preview", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    exportReport.mockResolvedValue(undefined);
    previewReport.mockResolvedValue("<html>Report</html>");
  });

  it("passes selected event UIDs to report preview", async () => {
    const component = createComponent({
      selectedEventUids: ["alteration-1", "alteration-2"],
    });

    await component.handlePreviewReport();

    expect(previewReport).toHaveBeenCalledWith(
      component.props,
      component.props.mergedEvents,
      ["alteration-1", "alteration-2"],
    );
  });

  it("exports the selection snapshot used to generate the open preview", async () => {
    const component = createComponent({
      selectedEventUids: ["alteration-1"],
    });

    await component.handlePreviewReport();
    component.props = {
      ...component.props,
      selectedEventUids: [],
    };
    await component.handleExportNotes();

    expect(exportReport).toHaveBeenLastCalledWith(
      component.props,
      component.props.mergedEvents,
      ["alteration-1"],
    );
  });

  it("does not pass a report editing adapter to the preview modal", () => {
    const component = createComponent();
    const children = React.Children.toArray(component.render().props.children);
    const previewModal = children.find(
      (child) => child.type === "ReportPreviewModal",
    );

    expect(previewModal.props.onSaveComment).toBeUndefined();
    expect(previewModal.props.previewContext).toBeUndefined();
  });

  it("discards generated HTML when its case or dataset context changes", async () => {
    const generated = deferred();
    previewReport.mockReturnValue(generated.promise);
    const component = createComponent();
    const previousProps = component.props;

    const preview = component.handlePreviewReport();
    component.props = {
      ...component.props,
      dataset: { id: "dataset-2" },
    };
    component.componentDidUpdate(previousProps);

    expect(component.state.previewVisible).toBe(false);
    generated.resolve("<html>Old dataset</html>");
    await preview;

    expect(component.state.previewHtml).toBeNull();
    expect(component.state.previewContext).toBeNull();
  });
});

describe("ReportButtonsPanel report reset", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns a Promise completed by CLEAR_CASE_INTERPRETATIONS_REQUEST", async () => {
    const dispatch = jest.fn();
    const dataset = { id: "dataset-1" };
    const clearing = mapDispatchToProps(dispatch).clearCaseInterpretations(
      "case-1",
      dataset,
    );
    const request = dispatch.mock.calls[0][0];

    expect(request).toMatchObject({
      type: interpretationsActions.CLEAR_CASE_INTERPRETATIONS_REQUEST,
      caseId: "case-1",
      completion: expect.any(Function),
      dataset,
    });
    request.completion(null, { caseId: "case-1" });
    await expect(clearing).resolves.toEqual({ caseId: "case-1" });
  });

  it("rejects the clear Promise when the saga acknowledges an error", async () => {
    const dispatch = jest.fn();
    const clearing = mapDispatchToProps(dispatch).clearCaseInterpretations(
      "case-1",
    );
    const error = new Error("clear failed");

    dispatch.mock.calls[0][0].completion(error, null);

    await expect(clearing).rejects.toBe(error);
  });

  it("clears interpretations before resetting Redux", async () => {
    const calls = [];
    const clearing = deferred();
    const component = createComponent({
      clearCaseInterpretations: jest.fn(() => {
        calls.push("clear");
        return clearing.promise;
      }),
      resetTierOverrides: jest.fn(() => calls.push("tiers")),
      selectFilteredEvent: jest.fn(() => calls.push("selection")),
    });
    global.window = { confirm: jest.fn(() => true) };

    const reset = component.handleResetReportState();
    await Promise.resolve();

    expect(calls).toEqual(["clear"]);
    expect(component.props.clearCaseInterpretations).toHaveBeenCalledWith(
      "case-1",
      component.props.dataset,
    );

    clearing.resolve({ caseId: "case-1" });
    await reset;

    expect(calls).toEqual(["clear", "tiers", "selection"]);
  });

  it("abandons reset when the preview dataset changes while clearing", async () => {
    const clearing = deferred();
    const component = createComponent({
      clearCaseInterpretations: jest.fn(() => clearing.promise),
    });
    global.window = { confirm: jest.fn(() => true) };

    const reset = component.handleResetReportState();
    await Promise.resolve();

    const previousProps = component.props;
    component.props = {
      ...component.props,
      dataset: { id: "dataset-2" },
    };
    component.componentDidUpdate(previousProps);
    clearing.resolve();
    await reset;

    expect(component.props.resetTierOverrides).not.toHaveBeenCalled();
    expect(component.props.selectFilteredEvent).not.toHaveBeenCalled();
  });
});
