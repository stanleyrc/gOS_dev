/** @jest-environment node */

/* eslint-disable import/first */

import React from "react";

const mockEventInterpretationConstructor = jest.fn();
const mockEnsureUser = jest.fn();

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
jest.mock("../../helpers/userAuth", () => ({
  ensureUser: (...args) => mockEnsureUser(...args),
}));
jest.mock("../../helpers/EventInterpretation", () => ({
  __esModule: true,
  default: class MockEventInterpretation {
    constructor(input) {
      this.input = input;
      mockEventInterpretationConstructor(input);
    }

    toJSON() {
      return { ...this.input, serialized: true };
    }
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
    Interpretations: {
      selected: { "alteration-1": "selected-key" },
      byId: {
        "selected-key": {
          datasetId: "dataset-1",
          caseId: "case-1",
          storageCaseId: "legacy-case-1",
          alterationId: "alteration-1",
          gene: "OLD-GENE",
          variant: "OLD-VARIANT",
          variant_type: "OLD-TYPE",
          authorId: "user-1",
          authorName: "Current User",
          data: {
            tier: "2",
            notes: "Existing note must remain repository-owned",
          },
          isCurrentUser: true,
        },
      },
    },
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
    updateInterpretation: jest.fn().mockResolvedValue({ saved: true }),
    selectFilteredEvent: jest.fn(),
    resetTierOverrides: jest.fn(),
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

describe("ReportButtonsPanel report comment persistence", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    exportReport.mockResolvedValue(undefined);
    previewReport.mockResolvedValue("<html>Report</html>");
    mockEnsureUser.mockResolvedValue({
      userId: "user-1",
      displayName: "Authenticated User",
    });
  });

  afterEach(() => {
    delete global.window;
  });

  it("awaits authentication and sends only variant_summary with canonical metadata", async () => {
    const authentication = deferred();
    mockEnsureUser.mockReturnValue(authentication.promise);
    const component = createComponent();

    const save = component.handleSaveReportComment(
      "alteration-1",
      "Edited in report",
      component.state.previewContext,
    );
    await Promise.resolve();

    expect(component.props.updateInterpretation).not.toHaveBeenCalled();
    expect(mockEventInterpretationConstructor).not.toHaveBeenCalled();

    authentication.resolve({
      userId: "user-1",
      displayName: "Authenticated User",
    });
    await save;

    expect(mockEventInterpretationConstructor).toHaveBeenCalledWith({
      datasetId: "dataset-1",
      caseId: "case-1",
      alterationId: "alteration-1",
      gene: "TP53",
      variant: "p.R175H",
      variant_type: "SNV",
      authorId: "user-1",
      authorName: "Authenticated User",
      data: { variant_summary: "Edited in report" },
    });
    expect(component.props.updateInterpretation).toHaveBeenCalledWith({
      datasetId: "dataset-1",
      caseId: "case-1",
      alterationId: "alteration-1",
      gene: "TP53",
      variant: "p.R175H",
      variant_type: "SNV",
      authorId: "user-1",
      authorName: "Authenticated User",
      data: { variant_summary: "Edited in report" },
      serialized: true,
    });
  });

  it("rejects old preview text when the case changes during authentication", async () => {
    const authentication = deferred();
    mockEnsureUser.mockReturnValue(authentication.promise);
    const component = createComponent();
    const previousProps = component.props;

    const save = component.handleSaveReportComment(
      "alteration-1",
      "Old iframe text",
      component.state.previewContext,
    );
    await Promise.resolve();

    component.props = { ...component.props, id: "case-2" };
    component.componentDidUpdate(previousProps);
    expect(component.state.previewVisible).toBe(false);
    expect(component.state.previewContext).toBeNull();

    authentication.resolve({
      userId: "user-1",
      displayName: "Authenticated User",
    });

    await expect(save).rejects.toThrow("no longer active");
    expect(component.props.updateInterpretation).not.toHaveBeenCalled();
  });

  it("rejects a deferred save after closing and reopening the same report context", async () => {
    const authentication = deferred();
    mockEnsureUser.mockReturnValue(authentication.promise);
    const component = createComponent();
    const oldContext = component.state.previewContext;

    const save = component.handleSaveReportComment(
      "alteration-1",
      "Old session text",
      oldContext,
    );
    await Promise.resolve();

    component.handleClosePreview();
    const reopenedContext = {
      caseId: component.props.id,
      datasetId: component.props.dataset.id,
    };
    component.setState({
      previewVisible: true,
      previewHtml: "<html>Reopened report</html>",
      previewContext: reopenedContext,
    });

    authentication.resolve({
      userId: "user-1",
      displayName: "Authenticated User",
    });

    await expect(save).rejects.toThrow("no longer active");
    expect(reopenedContext).not.toBe(oldContext);
    expect(component.props.updateInterpretation).not.toHaveBeenCalled();
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

  it("ignores foreign and stale selected interpretations", async () => {
    const component = createComponent({
      Interpretations: {
        selected: { "alteration-1": "foreign-key" },
        byId: {
          "foreign-key": {
            datasetId: "dataset-1",
            caseId: "case-1",
            storageCaseId: "foreign-storage",
            alterationId: "alteration-1",
            authorId: "foreign-user",
            authorName: "Foreign User",
            data: { tier: "1" },
            isCurrentUser: true,
          },
          "stale-case-key": {
            datasetId: "dataset-1",
            caseId: "old-case",
            storageCaseId: "stale-case-storage",
            alterationId: "alteration-1",
            authorId: "user-1",
            authorName: "Authenticated User",
            isCurrentUser: true,
          },
          "stale-dataset-key": {
            datasetId: "old-dataset",
            caseId: "case-1",
            storageCaseId: "stale-dataset-storage",
            alterationId: "alteration-1",
            authorId: "user-1",
            authorName: "Authenticated User",
            isCurrentUser: true,
          },
        },
      },
    });

    await component.handleSaveReportComment(
      "alteration-1",
      "Authenticated edit",
      component.state.previewContext,
    );

    expect(mockEventInterpretationConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        datasetId: "dataset-1",
        caseId: "case-1",
        authorId: "user-1",
        authorName: "Authenticated User",
        data: { variant_summary: "Authenticated edit" },
      }),
    );
    expect(component.props.updateInterpretation).toHaveBeenCalledWith(
      expect.not.objectContaining({ storageCaseId: expect.anything() }),
    );
  });

  it("rejects a save when the uid is no longer in the active report", async () => {
    const component = createComponent({ mergedEvents: { filteredEvents: [] } });

    await expect(
      component.handleSaveReportComment(
        "alteration-1",
        "Stale edit",
        component.state.previewContext,
      ),
    ).rejects.toThrow("no longer active");
    expect(component.props.updateInterpretation).not.toHaveBeenCalled();
  });

  it("passes the report save adapter to the preview modal", () => {
    const component = createComponent();
    const children = React.Children.toArray(component.render().props.children);
    const previewModal = children.find(
      (child) => child.type === "ReportPreviewModal",
    );

    expect(previewModal.props.onSaveComment).toBe(
      component.handleSaveReportComment,
    );
    expect(previewModal.props.previewContext).toBe(
      component.state.previewContext,
    );
  });

  it("overlays acknowledged preview comments by canonical uid for export", async () => {
    const component = createComponent({
      mergedEvents: {
        filteredEvents: [
          { uid: "alteration-1", variant_summary: "Redux lag" },
          { id: "alteration-2", variant_summary: "No canonical uid" },
        ],
      },
    });

    await component.handleExportNotes({
      "alteration-1": "Acknowledged preview value",
      "alteration-2": "Must not match id",
    });

    expect(exportReport).toHaveBeenCalledWith(
      component.props,
      {
        filteredEvents: [
          {
            uid: "alteration-1",
            variant_summary: "Acknowledged preview value",
          },
          { id: "alteration-2", variant_summary: "No canonical uid" },
        ],
      },
    );
  });

  it("returns a Promise completed by UPDATE_INTERPRETATION_REQUEST", async () => {
    const dispatch = jest.fn();
    const payload = { alterationId: "alteration-1" };
    const persistence = mapDispatchToProps(dispatch).updateInterpretation(
      payload,
    );
    const request = dispatch.mock.calls[0][0];

    expect(request).toMatchObject({
      type: interpretationsActions.UPDATE_INTERPRETATION_REQUEST,
      interpretation: payload,
      completion: expect.any(Function),
    });
    request.completion(null, { deleted: false });
    await expect(persistence).resolves.toEqual({ deleted: false });
  });

  it("rejects the persistence Promise when the saga acknowledges an error", async () => {
    const dispatch = jest.fn();
    const persistence = mapDispatchToProps(dispatch).updateInterpretation({
      alterationId: "alteration-1",
    });
    const error = new Error("repository failed");

    dispatch.mock.calls[0][0].completion(error, null);

    await expect(persistence).rejects.toBe(error);
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

  it("awaits modal preparation and acknowledged clear before resetting Redux", async () => {
    const calls = [];
    const preparation = deferred();
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

    const reset = component.handleResetReportState(async () => {
      calls.push("prepare");
      await preparation.promise;
      calls.push("prepared");
    });
    await Promise.resolve();

    expect(calls).toEqual(["prepare"]);
    preparation.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toEqual(["prepare", "prepared", "clear"]);
    expect(component.props.clearCaseInterpretations).toHaveBeenCalledWith(
      "case-1",
      component.props.dataset,
    );

    clearing.resolve({ caseId: "case-1" });
    await reset;

    expect(calls).toEqual([
      "prepare",
      "prepared",
      "clear",
      "tiers",
      "selection",
    ]);
  });

  it("abandons reset when the preview dataset changes during preparation", async () => {
    const preparation = deferred();
    const component = createComponent();
    global.window = { confirm: jest.fn(() => true) };

    const reset = component.handleResetReportState(() => preparation.promise);
    await Promise.resolve();

    const previousProps = component.props;
    component.props = {
      ...component.props,
      dataset: { id: "dataset-2" },
    };
    component.componentDidUpdate(previousProps);
    preparation.resolve();
    await reset;

    expect(component.props.clearCaseInterpretations).not.toHaveBeenCalled();
    expect(component.props.resetTierOverrides).not.toHaveBeenCalled();
    expect(component.props.selectFilteredEvent).not.toHaveBeenCalled();
  });

  it("does not reset Redux when acknowledged clear fails", async () => {
    const error = new Error("clear failed");
    const component = createComponent({
      clearCaseInterpretations: jest.fn().mockRejectedValue(error),
    });
    global.window = { confirm: jest.fn(() => true) };

    await expect(component.handleResetReportState()).rejects.toBe(error);

    expect(component.props.resetTierOverrides).not.toHaveBeenCalled();
    expect(component.props.selectFilteredEvent).not.toHaveBeenCalled();
    expect(component.state.previewVisible).toBe(true);
  });
});
