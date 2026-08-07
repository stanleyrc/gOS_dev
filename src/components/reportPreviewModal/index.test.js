/** @jest-environment node */

/* eslint-disable import/first */

import React from "react";

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
  UploadOutlined: "UploadOutlined",
}));

jest.mock("../../helpers/copyReportDocument", () => ({
  copyReportDocument: jest.fn(),
}));

import { message } from "antd";
import { copyReportDocument } from "../../helpers/copyReportDocument";
import { ReportPreviewModal } from ".";

const defaultProps = {
  visible: true,
  onCancel: jest.fn(),
  loading: false,
  html: "<main class=\"report-document\">Report</main>",
  onImport: jest.fn(),
  onExport: jest.fn(),
  onReset: jest.fn(),
  importLabel: "Import",
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
    const nextState = typeof update === "function"
      ? update(component.state, component.props)
      : update;
    component.state = { ...component.state, ...nextState };
  };
  return component;
}

function getCopyButton(component) {
  return findElement(
    component.render(),
    (element) => element.type === "Button" && elementText(element).includes("Copy Report"),
  );
}

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
    const reportDocument = {
      querySelector: jest.fn().mockReturnValue({}),
    };
    const component = createComponent();
    component.previewIframeRef.current = { contentDocument: reportDocument };
    component.handleIframeLoad();

    expect(component.state.previewReady).toBe(true);
    await component.handleCopyReport();

    expect(copyReportDocument).toHaveBeenCalledWith(reportDocument);
    expect(message.success).toHaveBeenCalledWith("Report copied.");
    expect(component.state.copying).toBe(false);
  });

  it("shows concise failure feedback when copying fails", async () => {
    const reportDocument = {
      querySelector: jest.fn().mockReturnValue({}),
    };
    const component = createComponent();
    component.previewIframeRef.current = { contentDocument: reportDocument };
    component.state.previewReady = true;
    copyReportDocument.mockRejectedValue(new Error("blocked"));
    jest.spyOn(console, "error").mockImplementation(() => {});

    await component.handleCopyReport();

    expect(message.error).toHaveBeenCalledWith("Unable to copy report.");
    expect(component.state.copying).toBe(false);
  });
});
