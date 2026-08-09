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
  html: '<main class="report-document">Report</main>',
  onExport: jest.fn(),
  onReset: jest.fn(),
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

function createReportDocument() {
  return new JSDOM(
    "<!doctype html><html><body><main class=\"report-document\">Report</main></body></html>",
  ).window.document;
}

describe("ReportPreviewModal", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    copyReportDocument.mockResolvedValue({ method: "clipboard", rich: true });
  });

  it("keeps the report preview display-only", () => {
    const component = createComponent();

    expect(getButton(component, "Copy Report")).not.toBeNull();
    expect(getButton(component, "Export")).not.toBeNull();
    expect(getButton(component, "Reset")).not.toBeNull();
    expect(getButton(component, "Undo")).toBeNull();
  });

  it("does not keep Copy disabled just because the iframe load state was missed", () => {
    const component = createComponent();

    expect(getButton(component, "Copy Report").props.disabled).toBe(false);
    expect(
      getButton(createComponent({ html: null }), "Copy Report").props.disabled,
    ).toBe(true);
    expect(
      getButton(createComponent({ loading: true }), "Copy Report").props.disabled,
    ).toBe(true);
  });

  it("copies from the loaded iframe document", async () => {
    const reportDocument = createReportDocument();
    const component = createComponent();
    component.previewIframeRef.current = { contentDocument: reportDocument };

    await component.handleCopyReport();

    expect(copyReportDocument).toHaveBeenCalledWith(reportDocument);
    expect(message.success).toHaveBeenCalledWith("Report copied.");
    expect(component.state.copying).toBe(false);
  });

  it("shows concise failure feedback when copying fails", async () => {
    const reportDocument = createReportDocument();
    const component = createComponent();
    component.previewIframeRef.current = { contentDocument: reportDocument };
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
