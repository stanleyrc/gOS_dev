/** @jest-environment node */

/* eslint-disable import/first */

import React from "react";
import { JSDOM } from "jsdom";

jest.mock("antd", () => ({
  Button: "Button",
  Modal: "Modal",
  Skeleton: "Skeleton",
  Space: "Space",
  message: {
    error: jest.fn(),
    success: jest.fn(),
  },
}));

jest.mock("@ant-design/icons", () => ({
  CopyOutlined: "CopyOutlined",
  DownloadOutlined: "DownloadOutlined",
  UndoOutlined: "UndoOutlined",
}));

jest.mock("../../helpers/copyReportDocument", () => ({
  copyReportDocument: jest.fn(),
}));

import { message } from "antd";
import { copyReportDocument } from "../../helpers/copyReportDocument";
import { ReportPreviewModal } from ".";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

async function settlePromises() {
  for (let index = 0; index < 8; index += 1) {
    await Promise.resolve();
  }
}

const defaultPreviewContext = {
  caseId: "case-1",
  datasetId: "dataset-1",
};

const defaultProps = {
  visible: true,
  onCancel: jest.fn(),
  loading: false,
  html: '<main class="report-document">Report</main>',
  previewContext: defaultPreviewContext,
  onExport: jest.fn(),
  onReset: jest.fn(),
  onSaveComment: jest.fn().mockResolvedValue({ saved: true }),
  exportLabel: "Export",
  resetLabel: "Reset",
  exporting: false,
};

function elementText(node) {
  if (typeof node === "string") return node;
  if (!React.isValidElement(node)) return "";
  return React.Children.toArray(node.props.children).map(elementText).join("");
}

function findElement(node, predicate) {
  if (!React.isValidElement(node)) return null;
  if (predicate(node)) return node;
  for (const child of React.Children.toArray(node.props.children)) {
    const match = findElement(child, predicate);
    if (match) return match;
  }
  return null;
}

function createComponent(props = {}) {
  const component = new ReportPreviewModal({ ...defaultProps, ...props });
  component.setState = (update) => {
    const nextState =
      typeof update === "function"
        ? update(component.state, component.props)
        : update;
    component.state = { ...component.state, ...nextState };
  };
  return component;
}

function getButton(component, label) {
  return findElement(
    component.render(),
    (element) => element.type === "Button" && elementText(element) === label,
  );
}

function getCopyButton(component) {
  return getButton(component, "Copy Report");
}

function createReportDocument(comments = [["alteration-1", "Initial summary"]]) {
  const commentHtml = comments
    .map(
      ([alterationId, value]) =>
        `<p><strong>Comments:</strong> <span data-editable-comment="true" data-alteration-id="${alterationId}">${value}</span></p>`,
    )
    .join("");
  return new JSDOM(
    `<!doctype html><html><body><main class="report-document">${commentHtml}</main></body></html>`,
  ).window.document;
}

function loadReportDocument(component, reportDocument) {
  component.previewIframeRef.current = { contentDocument: reportDocument };
  component.handleIframeLoad();
  return reportDocument.querySelector("[data-editable-comment]");
}

function dispatchInput(editor) {
  editor.dispatchEvent(
    new editor.ownerDocument.defaultView.Event("input", { bubbles: true }),
  );
}

function inputText(editor, value) {
  editor.textContent = value;
  dispatchInput(editor);
}

describe("ReportPreviewModal comment editing", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("enables plaintext editing for an initially empty canonical comment", () => {
    const component = createComponent();
    const editor = loadReportDocument(
      component,
      createReportDocument([["alteration-empty", ""]]),
    );

    expect(editor.getAttribute("contenteditable")).toBe("plaintext-only");
    expect(editor.getAttribute("data-report-editing")).toBe("true");
    expect(editor.getAttribute("role")).toBe("textbox");
    expect(editor.textContent).toBe("");
    expect(getButton(component, "Undo").props.disabled).toBe(true);
  });

  it("does not advance saved state or history until persistence acknowledges", async () => {
    jest.useFakeTimers({ legacyFakeTimers: true });
    const acknowledgment = deferred();
    const onSaveComment = jest.fn(() => acknowledgment.promise);
    const component = createComponent({ onSaveComment });
    const editor = loadReportDocument(component, createReportDocument());

    inputText(editor, "Edited summary");
    jest.advanceTimersByTime(600);
    await settlePromises();

    expect(onSaveComment).toHaveBeenCalledWith(
      "alteration-1",
      "Edited summary",
      component.props.previewContext,
    );
    expect(component.savedCommentValues.get("alteration-1")).toBe(
      "Initial summary",
    );
    expect(component.commentEditHistory).toHaveLength(0);

    acknowledgment.resolve({ saved: true });
    await settlePromises();

    expect(component.savedCommentValues.get("alteration-1")).toBe(
      "Edited summary",
    );
    expect(component.commentEditHistory).toHaveLength(1);
  });

  it("serializes deferred writes for one alteration", async () => {
    jest.useFakeTimers({ legacyFakeTimers: true });
    const first = deferred();
    const second = deferred();
    const onSaveComment = jest
      .fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const component = createComponent({ onSaveComment });
    const editor = loadReportDocument(component, createReportDocument());

    inputText(editor, "First edit");
    jest.advanceTimersByTime(600);
    await settlePromises();
    inputText(editor, "Second edit");
    jest.advanceTimersByTime(600);
    await settlePromises();

    expect(onSaveComment).toHaveBeenCalledTimes(1);

    first.resolve({ saved: true });
    await settlePromises();
    expect(onSaveComment).toHaveBeenNthCalledWith(
      2,
      "alteration-1",
      "Second edit",
      component.props.previewContext,
    );
    expect(component.savedCommentValues.get("alteration-1")).toBe(
      "First edit",
    );

    second.resolve({ saved: true });
    await settlePromises();
    expect(component.savedCommentValues.get("alteration-1")).toBe(
      "Second edit",
    );
    expect(component.commentEditHistory.map(({ value }) => value)).toEqual([
      "First edit",
      "Second edit",
    ]);
  });

  it("isolates deferred writes when a preview closes and reopens with the same uid", async () => {
    jest.useFakeTimers({ legacyFakeTimers: true });
    const oldAcknowledgment = deferred();
    const newAcknowledgment = deferred();
    const oldContext = { caseId: "case-1", datasetId: "dataset-1" };
    const newContext = { caseId: "case-1", datasetId: "dataset-1" };
    const onSaveComment = jest
      .fn()
      .mockImplementationOnce(() => oldAcknowledgment.promise)
      .mockImplementationOnce(() => newAcknowledgment.promise);
    const onExport = jest.fn();
    const component = createComponent({
      onExport,
      onSaveComment,
      previewContext: oldContext,
    });
    const oldEditor = loadReportDocument(component, createReportDocument());

    inputText(oldEditor, "Old session edit");
    jest.advanceTimersByTime(600);
    await settlePromises();
    expect(onSaveComment).toHaveBeenCalledWith(
      "alteration-1",
      "Old session edit",
      oldContext,
    );

    let previousProps = component.props;
    component.props = {
      ...component.props,
      visible: false,
      previewContext: null,
    };
    component.componentDidUpdate(previousProps);

    previousProps = component.props;
    component.props = {
      ...component.props,
      visible: true,
      previewContext: newContext,
    };
    component.componentDidUpdate(previousProps);
    const newEditor = loadReportDocument(
      component,
      createReportDocument([["alteration-1", "Reopened value"]]),
    );
    expect(component.getLatestTargetValue("alteration-1")).toBe(
      "Reopened value",
    );

    inputText(newEditor, "New session edit");
    jest.advanceTimersByTime(600);
    await settlePromises();
    expect(onSaveComment).toHaveBeenCalledTimes(1);

    oldAcknowledgment.resolve({ saved: true });
    await settlePromises();

    expect(onSaveComment).toHaveBeenNthCalledWith(
      2,
      "alteration-1",
      "New session edit",
      newContext,
    );
    expect(component.savedCommentValues.get("alteration-1")).toBe(
      "Reopened value",
    );
    expect(component.commentEditHistory).toHaveLength(0);

    newAcknowledgment.resolve({ saved: true });
    await settlePromises();
    await component.handleExport();

    expect(component.savedCommentValues.get("alteration-1")).toBe(
      "New session edit",
    );
    expect(component.commentEditHistory.map(({ value }) => value)).toEqual([
      "New session edit",
    ]);
    expect(onExport).toHaveBeenCalledWith({
      "alteration-1": "New session edit",
    });
  });

  it("does not show save failure feedback from a closed editing session", async () => {
    jest.useFakeTimers({ legacyFakeTimers: true });
    const oldAcknowledgment = deferred();
    const component = createComponent({
      onSaveComment: jest.fn(() => oldAcknowledgment.promise),
      previewContext: { caseId: "case-1", datasetId: "dataset-1" },
    });
    const oldEditor = loadReportDocument(component, createReportDocument());

    inputText(oldEditor, "Old session edit");
    jest.advanceTimersByTime(600);
    await settlePromises();

    let previousProps = component.props;
    component.props = {
      ...component.props,
      visible: false,
      previewContext: null,
    };
    component.componentDidUpdate(previousProps);
    previousProps = component.props;
    component.props = {
      ...component.props,
      visible: true,
      previewContext: { caseId: "case-1", datasetId: "dataset-1" },
    };
    component.componentDidUpdate(previousProps);
    loadReportDocument(
      component,
      createReportDocument([["alteration-1", "Reopened value"]]),
    );

    oldAcknowledgment.reject(new Error("old save failed"));
    await settlePromises();

    expect(message.error).not.toHaveBeenCalledWith("Unable to save comment.");
    expect(component.savedCommentValues.get("alteration-1")).toBe(
      "Reopened value",
    );
  });

  it("handles acknowledgments arriving out of order across alterations", async () => {
    jest.useFakeTimers({ legacyFakeTimers: true });
    const first = deferred();
    const second = deferred();
    const onSaveComment = jest.fn((alterationId) =>
      alterationId === "alteration-1" ? first.promise : second.promise,
    );
    const component = createComponent({ onSaveComment });
    const reportDocument = createReportDocument([
      ["alteration-1", "First initial"],
      ["alteration-2", "Second initial"],
    ]);
    loadReportDocument(component, reportDocument);
    const [firstEditor, secondEditor] = reportDocument.querySelectorAll(
      "[data-editable-comment]",
    );

    inputText(firstEditor, "First edit");
    inputText(secondEditor, "Second edit");
    jest.advanceTimersByTime(600);
    await settlePromises();

    second.resolve({ saved: true });
    await settlePromises();
    expect(component.savedCommentValues.get("alteration-1")).toBe(
      "First initial",
    );
    expect(component.savedCommentValues.get("alteration-2")).toBe(
      "Second edit",
    );

    first.resolve({ saved: true });
    await settlePromises();
    expect(component.commentEditHistory.map(({ alterationId }) => alterationId)).toEqual([
      "alteration-1",
      "alteration-2",
    ]);
  });

  it("undoes the latest debounced edit without dispatching it", async () => {
    jest.useFakeTimers({ legacyFakeTimers: true });
    const onSaveComment = jest.fn().mockResolvedValue({ saved: true });
    const component = createComponent({ onSaveComment });
    const editor = loadReportDocument(component, createReportDocument());

    inputText(editor, "Pending edit");
    expect(getButton(component, "Undo").props.disabled).toBe(false);
    await component.handleUndo();
    jest.advanceTimersByTime(600);
    await settlePromises();

    expect(onSaveComment).not.toHaveBeenCalled();
    expect(editor.textContent).toBe("Initial summary");
    expect(component.commentEditHistory).toHaveLength(0);
  });

  it("awaits an in-flight write before persisting its undo", async () => {
    jest.useFakeTimers({ legacyFakeTimers: true });
    const save = deferred();
    const reversal = deferred();
    const onSaveComment = jest
      .fn()
      .mockImplementationOnce(() => save.promise)
      .mockImplementationOnce(() => reversal.promise);
    const component = createComponent({ onSaveComment });
    const editor = loadReportDocument(component, createReportDocument());

    inputText(editor, "In flight");
    jest.advanceTimersByTime(600);
    await settlePromises();
    const undo = component.handleUndo();

    expect(onSaveComment).toHaveBeenCalledTimes(1);
    expect(editor.getAttribute("contenteditable")).toBe("false");
    expect(editor.getAttribute("aria-disabled")).toBe("true");
    inputText(editor, "Newer edit during undo");
    expect(editor.textContent).toBe("Initial summary");
    expect(onSaveComment).toHaveBeenCalledTimes(1);

    save.resolve({ saved: true });
    await settlePromises();
    expect(onSaveComment).toHaveBeenNthCalledWith(
      2,
      "alteration-1",
      "Initial summary",
      component.props.previewContext,
    );

    reversal.resolve({ saved: true });
    await undo;
    await settlePromises();

    expect(editor.textContent).toBe("Initial summary");
    expect(component.savedCommentValues.get("alteration-1")).toBe(
      "Initial summary",
    );
    expect(component.commentEditHistory).toHaveLength(0);
    expect(editor.getAttribute("contenteditable")).toBe("plaintext-only");
    expect(editor.hasAttribute("aria-disabled")).toBe(false);
  });

  it("locks every editor while undoing acknowledged history", async () => {
    jest.useFakeTimers({ legacyFakeTimers: true });
    const reversal = deferred();
    const onSaveComment = jest
      .fn()
      .mockResolvedValueOnce({ saved: true })
      .mockImplementationOnce(() => reversal.promise);
    const component = createComponent({ onSaveComment });
    const reportDocument = createReportDocument([
      ["alteration-1", "First initial"],
      ["alteration-2", "Second initial"],
    ]);
    loadReportDocument(component, reportDocument);
    const [firstEditor, secondEditor] = reportDocument.querySelectorAll(
      "[data-editable-comment]",
    );

    inputText(firstEditor, "Saved first edit");
    jest.advanceTimersByTime(600);
    await settlePromises();

    const undo = component.handleUndo();
    await settlePromises();
    expect(Array.from(reportDocument.querySelectorAll("[data-editable-comment]")).map(
      (editor) => editor.getAttribute("contenteditable"),
    )).toEqual(["false", "false"]);

    inputText(secondEditor, "Rejected newer edit");
    expect(secondEditor.textContent).toBe("Second initial");
    expect(onSaveComment).toHaveBeenCalledTimes(2);

    reversal.resolve({ saved: true });
    await undo;
    await settlePromises();

    expect(firstEditor.textContent).toBe("First initial");
    expect(Array.from(reportDocument.querySelectorAll("[data-editable-comment]")).map(
      (editor) => editor.getAttribute("contenteditable"),
    )).toEqual(["plaintext-only", "plaintext-only"]);
    expect(onSaveComment).toHaveBeenCalledTimes(2);
  });

  it("normalizes an empty br sentinel while preserving multiline text", async () => {
    jest.useFakeTimers({ legacyFakeTimers: true });
    const onSaveComment = jest.fn().mockResolvedValue({ saved: true });
    const component = createComponent({ onSaveComment });
    const editor = loadReportDocument(component, createReportDocument());

    editor.innerHTML = "<br>";
    dispatchInput(editor);
    jest.advanceTimersByTime(600);
    await settlePromises();
    expect(onSaveComment).toHaveBeenLastCalledWith(
      "alteration-1",
      "",
      component.props.previewContext,
    );

    inputText(editor, "First line\nSecond line");
    jest.advanceTimersByTime(600);
    await settlePromises();
    expect(onSaveComment).toHaveBeenLastCalledWith(
      "alteration-1",
      "First line\nSecond line",
      component.props.previewContext,
    );
  });

  it("shows concise failure feedback and creates no history for a failed save", async () => {
    jest.useFakeTimers({ legacyFakeTimers: true });
    const onSaveComment = jest.fn().mockRejectedValue(new Error("failed"));
    const component = createComponent({ onSaveComment });
    const editor = loadReportDocument(component, createReportDocument());

    inputText(editor, "Unsaved edit");
    jest.advanceTimersByTime(600);
    await settlePromises();

    expect(message.error).toHaveBeenCalledWith("Unable to save comment.");
    expect(component.savedCommentValues.get("alteration-1")).toBe(
      "Initial summary",
    );
    expect(component.commentEditHistory).toHaveLength(0);
    expect(component.pendingCommentEdits.get("alteration-1")).toMatchObject({
      value: "Unsaved edit",
      timer: null,
    });
  });

  it("flushes and awaits pending saves before exporting", async () => {
    jest.useFakeTimers({ legacyFakeTimers: true });
    const acknowledgment = deferred();
    const calls = [];
    const onSaveComment = jest.fn(() => {
      calls.push("save");
      return acknowledgment.promise;
    });
    const onExport = jest.fn(() => calls.push("export"));
    const component = createComponent({ onExport, onSaveComment });
    const editor = loadReportDocument(component, createReportDocument());

    inputText(editor, "Exported edit");
    const exporting = component.handleExport();
    await settlePromises();

    expect(calls).toEqual(["save"]);
    acknowledgment.resolve({ saved: true });
    await exporting;

    expect(calls).toEqual(["save", "export"]);
    expect(onExport).toHaveBeenCalledWith({
      "alteration-1": "Exported edit",
    });
  });

  it("resets the unmount guard when mounted", () => {
    const component = createComponent();
    component.isUnmounting = true;

    component.componentDidMount();

    expect(component.isUnmounting).toBe(false);
  });

  it("cancels pending reset edits, awaits in-flight saves, then resets", async () => {
    jest.useFakeTimers({ legacyFakeTimers: true });
    const acknowledgment = deferred();
    const calls = [];
    const onSaveComment = jest.fn((alterationId, value) => {
      calls.push(`save:${value}`);
      return acknowledgment.promise;
    });
    const onReset = jest.fn(async (prepareReset) => {
      calls.push("confirmed");
      await prepareReset();
      calls.push("clear");
    });
    const component = createComponent({ onReset, onSaveComment });
    const editor = loadReportDocument(component, createReportDocument());

    inputText(editor, "In flight");
    jest.advanceTimersByTime(600);
    await settlePromises();
    inputText(editor, "Pending and cancelled");

    const resetting = component.handleReset();
    await settlePromises();
    expect(calls).toEqual(["save:In flight", "confirmed"]);

    acknowledgment.resolve({ saved: true });
    await resetting;
    jest.advanceTimersByTime(600);
    await settlePromises();

    expect(calls).toEqual(["save:In flight", "confirmed", "clear"]);
    expect(onSaveComment).toHaveBeenCalledTimes(1);
  });

  it("flushes pending edits on blur, close, replacement, and unmount", async () => {
    jest.useFakeTimers({ legacyFakeTimers: true });
    const onSaveComment = jest.fn().mockResolvedValue({ saved: true });
    const onCancel = jest.fn();
    const component = createComponent({ onCancel, onSaveComment });
    const editor = loadReportDocument(component, createReportDocument());

    inputText(editor, "Blurred summary");
    editor.dispatchEvent(
      new editor.ownerDocument.defaultView.Event("focusout", { bubbles: true }),
    );
    await settlePromises();
    expect(onSaveComment).toHaveBeenLastCalledWith(
      "alteration-1",
      "Blurred summary",
      component.props.previewContext,
    );

    inputText(editor, "Closed summary");
    await component.handleCancel();
    expect(onSaveComment).toHaveBeenLastCalledWith(
      "alteration-1",
      "Closed summary",
      component.props.previewContext,
    );
    expect(onCancel).toHaveBeenCalledTimes(1);

    const replacementSave = jest.fn().mockResolvedValue({ saved: true });
    const replacementComponent = createComponent({
      onSaveComment: replacementSave,
    });
    const replacementEditor = loadReportDocument(
      replacementComponent,
      createReportDocument(),
    );
    inputText(replacementEditor, "Replacement summary");
    const previousProps = replacementComponent.props;
    replacementComponent.props = {
      ...previousProps,
      html: '<main class="report-document">Replacement</main>',
    };
    replacementComponent.componentDidUpdate(previousProps);
    await settlePromises();
    expect(replacementSave).toHaveBeenCalledWith(
      "alteration-1",
      "Replacement summary",
      replacementComponent.props.previewContext,
    );
    expect(replacementEditor.hasAttribute("contenteditable")).toBe(false);

    const unmountSave = jest.fn().mockResolvedValue({ saved: true });
    const unmountComponent = createComponent({ onSaveComment: unmountSave });
    const unmountEditor = loadReportDocument(
      unmountComponent,
      createReportDocument(),
    );
    inputText(unmountEditor, "Unmounted summary");
    unmountComponent.componentWillUnmount();
    await settlePromises();
    expect(unmountSave).toHaveBeenCalledWith(
      "alteration-1",
      "Unmounted summary",
      unmountComponent.props.previewContext,
    );
    expect(unmountEditor.hasAttribute("contenteditable")).toBe(false);
  });
});

describe("ReportPreviewModal toolbar", () => {
  it("keeps Copy, Undo, Export, and Reset without a legacy Import control", () => {
    const component = createComponent();

    expect(getButton(component, "Copy Report")).not.toBeNull();
    expect(getButton(component, "Undo")).not.toBeNull();
    expect(getButton(component, "Export")).not.toBeNull();
    expect(getButton(component, "Reset")).not.toBeNull();
    expect(getButton(component, "Import")).toBeNull();
  });
});

describe("ReportPreviewModal copy control", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    copyReportDocument.mockResolvedValue({ method: "clipboard", rich: true });
  });

  it("keeps copy disabled while preview content is unavailable or loading", () => {
    const unavailable = createComponent({ html: null });
    expect(getCopyButton(unavailable).props.disabled).toBe(true);

    const loading = createComponent({ loading: true });
    expect(getCopyButton(loading).props.disabled).toBe(true);

    const notLoaded = createComponent();
    expect(getCopyButton(notLoaded).props.disabled).toBe(true);

    notLoaded.state.previewReady = true;
    expect(getCopyButton(notLoaded).props.disabled).toBe(false);
  });

  it("copies from the same-origin iframe document and shows success", async () => {
    const reportDocument = createReportDocument();
    const component = createComponent();
    loadReportDocument(component, reportDocument);

    expect(component.state.previewReady).toBe(true);
    await component.handleCopyReport();

    expect(copyReportDocument).toHaveBeenCalledWith(reportDocument);
    expect(message.success).toHaveBeenCalledWith("Report copied.");
    expect(component.state.copying).toBe(false);
  });

  it("shows concise failure feedback when copying fails", async () => {
    const reportDocument = createReportDocument();
    const component = createComponent();
    component.previewIframeRef.current = { contentDocument: reportDocument };
    component.state.previewReady = true;
    copyReportDocument.mockRejectedValue(new Error("blocked"));
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    await component.handleCopyReport();

    expect(message.error).toHaveBeenCalledWith("Unable to copy report.");
    expect(component.state.copying).toBe(false);
    consoleError.mockRestore();
  });
});
