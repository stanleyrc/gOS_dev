/** @jest-environment node */

import { JSDOM } from "jsdom";
import { copyReportDocument } from "./copyReportDocument";

class FakeBlob {
  constructor(parts, options) {
    this.parts = parts;
    this.type = options.type;
  }
}

class FakeClipboardItem {
  constructor(data) {
    this.data = data;
  }
}

function getComputedValues(element) {
  if (element.classList.contains("report-document")) {
    return {
      "background-color": "rgb(255, 255, 255)",
      color: "rgb(0, 0, 0)",
      "font-family": "Arial",
      "font-size": "13px",
      "line-height": "16px",
      "box-sizing": "border-box",
      width: "816px",
      "min-width": "816px",
      "max-width": "100vw",
      height: "1200px",
      "min-height": "1056px",
      "max-height": "100vh",
      "margin-top": "24px",
      "margin-right": "24px",
      "margin-bottom": "24px",
      "margin-left": "24px",
      "padding-top": "48px",
      "padding-right": "48px",
      "padding-bottom": "48px",
      "padding-left": "48px",
    };
  }
  if (element.classList.contains("section-bar")) {
    return {
      color: "rgb(255, 255, 255)",
      "background-color": "rgb(5, 99, 193)",
      "font-family": "Arial",
      "font-size": "13px",
      "font-weight": "400",
      "line-height": "18px",
      "margin-bottom": "28px",
      "padding-left": "1px",
      "padding-right": "1px",
      "text-align": "left",
      "white-space": "normal",
    };
  }
  if (element.tagName === "TABLE") {
    return {
      "border-collapse": "collapse",
      "border-spacing": "2px 3px",
      "table-layout": "fixed",
      width: "640px",
      height: "120px",
    };
  }
  if (element.tagName === "TD") {
    return {
      "border-top-color": "rgb(0, 0, 0)",
      "border-top-style": "solid",
      "border-top-width": "1px",
      "border-right-color": "rgb(0, 0, 0)",
      "border-right-style": "solid",
      "border-right-width": "1px",
      "border-bottom-color": "rgb(0, 0, 0)",
      "border-bottom-style": "solid",
      "border-bottom-width": "1px",
      "border-left-color": "rgb(0, 0, 0)",
      "border-left-style": "solid",
      "border-left-width": "1px",
      "padding-top": "2px",
      "padding-right": "6px",
      "padding-bottom": "2px",
      "padding-left": "6px",
      "text-align": "center",
      "vertical-align": "middle",
      "white-space": "pre-wrap",
      width: "200px",
    };
  }
  return {};
}

function createReportDocument(rootComputedValues = {}) {
  const dom = new JSDOM(`<!doctype html><html><head><style>
    .report-document {
      box-sizing: border-box;
      width: 816px;
      min-width: 816px;
      max-width: 100vw;
      height: 1200px;
      min-height: 1056px;
      max-height: 100vh;
      margin: 24px auto;
      padding: 48px;
    }
  </style></head><body>
    <main class="report-document" contenteditable="true" spellcheck="true">
      <h2 class="section-bar" data-editing="true">RESULTS</h2>
      <table data-editable-comment="true">
        <tbody><tr><td data-alteration-id="alteration-1">Formatted cell</td></tr></tbody>
      </table>
    </main>
    <button data-editing="true">Preview control</button>
  </body></html>`);
  const { document } = dom.window;
  const report = document.querySelector(".report-document");
  const getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
  // JSDOM has no layout engine: model the browser's resolved source dimensions,
  // but let its CSS cascade apply to the fallback clone in the preview document.
  jest.spyOn(dom.window, "getComputedStyle").mockImplementation((element) => {
    if (!report.contains(element)) return getComputedStyle(element);
    const values = {
      ...getComputedValues(element),
      ...(element === report ? rootComputedValues : {}),
    };
    return { getPropertyValue: (property) => values[property] || "" };
  });
  return document;
}

function createBrowserWindow(clipboard, document) {
  return {
    Blob: FakeBlob,
    ClipboardItem: FakeClipboardItem,
    document,
    navigator: { clipboard },
  };
}

function getClipboardHtml(clipboard) {
  const [items] = clipboard.write.mock.calls[0];
  return items[0].data["text/html"].parts.join("");
}

describe("copyReportDocument", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("writes styled report-only HTML and plain text MIME payloads", async () => {
    const reportDocument = createReportDocument();
    const clipboard = { write: jest.fn().mockResolvedValue(undefined) };

    const result = await copyReportDocument(
      reportDocument,
      createBrowserWindow(clipboard, reportDocument),
    );

    expect(result).toEqual({ method: "clipboard", rich: true });
    expect(clipboard.write).toHaveBeenCalledTimes(1);
    const [clipboardItems] = clipboard.write.mock.calls[0];
    const item = clipboardItems[0];
    expect(Object.keys(item.data).sort()).toEqual(["text/html", "text/plain"]);
    expect(item.data["text/html"].type).toBe("text/html");
    expect(item.data["text/plain"].type).toBe("text/plain");

    const copiedHtml = item.data["text/html"].parts.join("");
    const copiedDocument = new reportDocument.defaultView.DOMParser().parseFromString(
      copiedHtml,
      "text/html",
    );
    const copiedReport = copiedDocument.querySelector(".report-document");
    const copiedSection = copiedDocument.querySelector(".section-bar");
    const copiedTable = copiedDocument.querySelector("table");
    const copiedCell = copiedDocument.querySelector("td");

    expect(copiedReport.style.backgroundColor).toBe("rgb(255, 255, 255)");
    expect(copiedReport.style.fontFamily).toBe("Arial");
    expect(copiedReport.style.width).toBe("720px");
    expect(copiedReport.style.margin).toBe("0px");
    expect(copiedReport.style.padding).toBe("0px");
    expect(copiedReport.style.height).toBe("auto");
    expect(copiedReport.style.minHeight).toBe("0");
    expect(copiedReport.style.maxHeight).toBe("none");
    expect(copiedReport.style.minWidth).toBe("0");
    expect(copiedReport.style.maxWidth).toBe("none");
    expect(copiedSection.style.backgroundColor).toBe("rgb(5, 99, 193)");
    expect(copiedSection.style.color).toBe("rgb(255, 255, 255)");
    expect(copiedSection.style.fontWeight).toBe("400");
    expect(copiedSection.style.marginBottom).toBe("28px");
    expect(copiedSection.style.paddingLeft).toBe("1px");
    expect(copiedSection.style.paddingRight).toBe("1px");
    expect(copiedSection.style.lineHeight).toBe("18px");
    expect(copiedTable.style.borderCollapse).toBe("collapse");
    expect(copiedTable.style.borderSpacing).toBe("2px 3px");
    expect(copiedTable.style.tableLayout).toBe("fixed");
    expect(copiedTable.style.width).toBe("640px");
    expect(copiedTable.style.height).toBe("120px");
    expect(copiedCell.style.borderTop).toBe("1px solid rgb(0, 0, 0)");
    expect(copiedCell.style.paddingTop).toBe("2px");
    expect(copiedCell.style.paddingRight).toBe("6px");
    expect(copiedCell.style.paddingBottom).toBe("2px");
    expect(copiedCell.style.paddingLeft).toBe("6px");
    expect(copiedCell.style.width).toBe("200px");
    expect(copiedCell.style.textAlign).toBe("center");
    expect(copiedCell.style.verticalAlign).toBe("middle");
    expect(copiedCell.style.whiteSpace).toBe("pre-wrap");
    expect(copiedDocument.querySelector("button")).toBeNull();
    expect(copiedHtml).not.toMatch(/contenteditable|spellcheck|data-editing|data-editable|data-alteration-id/);
    expect(item.data["text/plain"].parts.join("")).toContain("Formatted cell");
  });

  it("copies the classic report container", async () => {
    const dom = new JSDOM(
      '<!doctype html><html><body><div class="container"><p>Classic report</p></div></body></html>',
    );
    const { document } = dom.window;
    const clipboard = { write: jest.fn().mockResolvedValue(undefined) };

    const result = await copyReportDocument(
      document,
      createBrowserWindow(clipboard, document),
    );

    expect(result).toEqual({ method: "clipboard", rich: true });
    const copied = JSDOM.fragment(getClipboardHtml(clipboard)).firstElementChild;
    expect(copied.className).toBe("container");
    expect(copied.textContent).toContain("Classic report");
  });

  it.each([960, 7680])(
    "removes resolved auto margins at a %ipx viewport without changing the preview",
    async (viewportWidth) => {
      const resolvedMargin = `${(viewportWidth - 816) / 2}px`;
      const reportDocument = createReportDocument({
        "margin-left": resolvedMargin,
        "margin-right": resolvedMargin,
      });
      const report = reportDocument.querySelector(".report-document");
      report.style.margin = "24px auto";
      report.style.padding = "48px";
      const originalHtml = reportDocument.documentElement.outerHTML;
      const clipboard = { write: jest.fn().mockResolvedValue(undefined) };

      await copyReportDocument(
        reportDocument,
        createBrowserWindow(clipboard, reportDocument),
      );

      const copiedReport = JSDOM.fragment(getClipboardHtml(clipboard)).firstElementChild;
      ["Top", "Right", "Bottom", "Left"].forEach((side) => {
        expect(copiedReport.style[`margin${side}`]).toBe("0px");
        expect(copiedReport.style[`padding${side}`]).toBe("0px");
      });
      expect(copiedReport.style.width).toBe("720px");
      expect(copiedReport.style.minHeight).toBe("0");
      expect(copiedReport.style.height).toBe("auto");
      expect(reportDocument.documentElement.outerHTML).toBe(originalHtml);
      expect(
        reportDocument.defaultView.getComputedStyle(report).getPropertyValue("margin-left"),
      ).toBe(resolvedMargin);
      expect(report.hasAttribute("contenteditable")).toBe(true);
      expect(report.querySelector("td").getAttribute("data-alteration-id")).toBe("alteration-1");
    },
  );

  it.each([
    ["content-box", "816px", "816px", "48px", "48px", "816px"],
    ["border-box", "816px", "816px", "24px", "48px", "744px"],
    ["border-box", "calc(100% - 24px)", "744px", "24px", "24px", "696px"],
    ["border-box", "90vw", "1080px", "48px", "48px", "984px"],
  ])(
    "preserves content width for %s %s (resolved %s, padding %s/%s)",
    async (
      boxSizing,
      sourceWidth,
      resolvedWidth,
      leftPadding,
      rightPadding,
      expectedWidth,
    ) => {
      const reportDocument = createReportDocument({
        "box-sizing": boxSizing,
        width: resolvedWidth,
        "padding-left": leftPadding,
        "padding-right": rightPadding,
        "border-left-width": "2px",
        "border-left-style": "solid",
        "border-right-width": "2px",
        "border-right-style": "solid",
      });
      const report = reportDocument.querySelector(".report-document");
      report.style.width = sourceWidth;
      const originalHtml = report.outerHTML;
      const clipboard = { write: jest.fn().mockResolvedValue(undefined) };

      await copyReportDocument(
        reportDocument,
        createBrowserWindow(clipboard, reportDocument),
      );

      const copiedReport = JSDOM.fragment(getClipboardHtml(clipboard)).firstElementChild;
      expect(copiedReport.style.boxSizing).toBe(boxSizing);
      expect(copiedReport.style.width).toBe(expectedWidth);
      expect(copiedReport.style.minWidth).toBe("0");
      expect(copiedReport.style.maxWidth).toBe("none");
      expect(copiedReport.style.borderLeftWidth).toBe("2px");
      expect(copiedReport.style.borderRightWidth).toBe("2px");
      expect(copiedReport.querySelector("table").style.width).toBe("640px");
      expect(report.outerHTML).toBe(originalHtml);
    },
  );

  it.each(["auto", "calc(100% - 24px)", "90vw"])(
    "does not retain an unresolved root width of %s",
    async (width) => {
      const reportDocument = createReportDocument({ width });
      const clipboard = { write: jest.fn().mockResolvedValue(undefined) };

      await copyReportDocument(
        reportDocument,
        createBrowserWindow(clipboard, reportDocument),
      );

      const copiedReport = JSDOM.fragment(getClipboardHtml(clipboard)).firstElementChild;
      expect(copiedReport.style.width).toBe("auto");
      expect(copiedReport.querySelector("table").style.width).toBe("640px");
    },
  );

  it("uses the same normalized rich HTML when Clipboard API writing fails and restores selection", async () => {
    const reportDocument = createReportDocument({
      "margin-left": "3432px",
      "margin-right": "3432px",
    });
    const clipboard = {
      write: jest.fn().mockRejectedValue(new Error("blocked")),
      writeText: jest.fn(),
    };
    const originalHtml = reportDocument.documentElement.outerHTML;
    const selection = reportDocument.getSelection();
    const previousRange = reportDocument.createRange();
    previousRange.selectNodeContents(reportDocument.querySelector("td"));
    selection.addRange(previousRange);
    let selectedReport;
    let selectedHtml;
    let selectedStyle;
    reportDocument.execCommand = jest.fn(() => {
      selectedReport = reportDocument.querySelector(
        "[data-report-copy-selection] .report-document",
      );
      selectedHtml = selection.getRangeAt(0).cloneContents().firstElementChild.outerHTML;
      selectedStyle = reportDocument.defaultView.getComputedStyle(selectedReport);
      return true;
    });

    const result = await copyReportDocument(
      reportDocument,
      createBrowserWindow(clipboard, reportDocument),
    );

    expect(result).toEqual({ method: "selection", rich: true });
    expect(reportDocument.execCommand).toHaveBeenCalledWith("copy");
    expect(clipboard.writeText).not.toHaveBeenCalled();
    expect(selectedReport.outerHTML).toBe(getClipboardHtml(clipboard));
    expect(selectedHtml).toBe(getClipboardHtml(clipboard));
    // Inline resets must override the preview stylesheet, not merely disappear.
    expect(selectedStyle.marginLeft).toBe("0px");
    expect(selectedStyle.marginRight).toBe("0px");
    expect(selectedStyle.paddingLeft).toBe("0px");
    expect(selectedStyle.width).toBe("720px");
    expect(selectedStyle.minWidth).toBe("0");
    expect(selectedStyle.maxWidth).toBe("none");
    expect(selectedStyle.height).toBe("auto");
    expect(selectedStyle.minHeight).toBe("0");
    expect(selectedStyle.maxHeight).toBe("none");
    expect(selectedReport.style.backgroundColor).toBe("rgb(255, 255, 255)");
    expect(selectedReport.querySelector("table").style.borderCollapse).toBe("collapse");
    expect(selectedReport.querySelector("table").style.height).toBe("120px");
    expect(selectedReport.querySelector("td").style.paddingRight).toBe("6px");
    expect(selectedReport.querySelector(".section-bar").style.marginBottom).toBe("28px");
    expect(selectedReport.hasAttribute("contenteditable")).toBe(false);
    expect(reportDocument.querySelector("[data-report-copy-selection]")).toBeNull();
    expect(reportDocument.documentElement.outerHTML).toBe(originalHtml);
    expect(selection.rangeCount).toBe(1);
    expect(selection.toString()).toBe("Formatted cell");
    const restoredRange = selection.getRangeAt(0);
    expect(restoredRange.startContainer).toBe(previousRange.startContainer);
    expect(restoredRange.startOffset).toBe(previousRange.startOffset);
    expect(restoredRange.endContainer).toBe(previousRange.endContainer);
    expect(restoredRange.endOffset).toBe(previousRange.endOffset);
  });

  it("copies normalized rich selection when Clipboard APIs are unavailable", async () => {
    const reportDocument = createReportDocument();
    let copiedReport;
    reportDocument.execCommand = jest.fn(() => {
      copiedReport = reportDocument.getSelection().getRangeAt(0).cloneContents().firstElementChild;
      return true;
    });

    const result = await copyReportDocument(
      reportDocument,
      createBrowserWindow({}, reportDocument),
    );

    expect(result).toEqual({ method: "selection", rich: true });
    expect(copiedReport.style.margin).toBe("0px");
    expect(copiedReport.style.padding).toBe("0px");
    expect(copiedReport.style.width).toBe("720px");
    expect(copiedReport.style.height).toBe("auto");
    expect(copiedReport.style.minHeight).toBe("0");
    expect(copiedReport.querySelector("table").style.borderCollapse).toBe("collapse");
    expect(reportDocument.querySelector("[data-report-copy-selection]")).toBeNull();
  });

  it("falls back to plain Clipboard API text after rich copying fails", async () => {
    const reportDocument = createReportDocument();
    const clipboard = {
      write: jest.fn().mockRejectedValue(new Error("blocked")),
      writeText: jest.fn().mockResolvedValue(undefined),
    };
    reportDocument.execCommand = jest.fn().mockReturnValue(false);

    const result = await copyReportDocument(
      reportDocument,
      createBrowserWindow(clipboard, reportDocument),
    );

    expect(result).toEqual({ method: "clipboard", rich: false });
    expect(clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining("Formatted cell"));
  });

  it("uses a plain textarea selection when Clipboard APIs are unavailable", async () => {
    const reportDocument = createReportDocument();
    reportDocument.execCommand = jest
      .fn()
      .mockReturnValueOnce(false)
      .mockImplementationOnce(() => {
        expect(reportDocument.activeElement.value).toContain("Formatted cell");
        return true;
      });

    const result = await copyReportDocument(
      reportDocument,
      createBrowserWindow({}, reportDocument),
    );

    expect(result).toEqual({ method: "selection", rich: false });
    expect(reportDocument.execCommand).toHaveBeenCalledTimes(2);
  });

  it("rejects when every copy path fails", async () => {
    const reportDocument = createReportDocument();
    const clipboard = {
      write: jest.fn().mockRejectedValue(new Error("blocked")),
      writeText: jest.fn().mockRejectedValue(new Error("blocked")),
    };
    reportDocument.execCommand = jest.fn().mockReturnValue(false);

    await expect(
      copyReportDocument(
        reportDocument,
        createBrowserWindow(clipboard, reportDocument),
      ),
    ).rejects.toThrow("Unable to copy report");
  });
});
