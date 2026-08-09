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
      width: "816px",
      "min-height": "1056px",
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

function createReportDocument() {
  const dom = new JSDOM(`<!doctype html><html><body>
    <main class="report-document" contenteditable="true" spellcheck="true">
      <h2 class="section-bar" data-editing="true">RESULTS</h2>
      <table data-editable-comment="true">
        <tbody><tr><td data-alteration-id="alteration-1">Formatted cell</td></tr></tbody>
      </table>
    </main>
    <button data-editing="true">Preview control</button>
  </body></html>`);
  const { document } = dom.window;
  jest.spyOn(dom.window, "getComputedStyle").mockImplementation((element) => ({
    getPropertyValue: (property) => getComputedValues(element)[property] || "",
  }));
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
    expect(copiedReport.style.width).toBe("816px");
    expect(copiedReport.style.marginLeft).toBe("24px");
    expect(copiedReport.style.paddingLeft).toBe("48px");
    expect(copiedSection.style.backgroundColor).toBe("rgb(5, 99, 193)");
    expect(copiedSection.style.color).toBe("rgb(255, 255, 255)");
    expect(copiedSection.style.fontWeight).toBe("400");
    expect(copiedTable.style.borderCollapse).toBe("collapse");
    expect(copiedTable.style.borderSpacing).toBe("2px 3px");
    expect(copiedTable.style.tableLayout).toBe("fixed");
    expect(copiedTable.style.width).toBe("640px");
    expect(copiedCell.style.borderTop).toBe("1px solid rgb(0, 0, 0)");
    expect(copiedCell.style.paddingRight).toBe("6px");
    expect(copiedCell.style.textAlign).toBe("center");
    expect(copiedCell.style.verticalAlign).toBe("middle");
    expect(copiedCell.style.whiteSpace).toBe("pre-wrap");
    expect(copiedDocument.querySelector("button")).toBeNull();
    expect(copiedHtml).not.toMatch(/contenteditable|spellcheck|data-editing|data-editable|data-alteration-id/);
    expect(item.data["text/plain"].parts.join("")).toContain("Formatted cell");
  });

  it("uses a rendered styled selection when rich Clipboard API writing fails", async () => {
    const reportDocument = createReportDocument();
    const clipboard = {
      write: jest.fn().mockRejectedValue(new Error("blocked")),
      writeText: jest.fn(),
    };
    reportDocument.execCommand = jest.fn(() => {
      const selectedReport = reportDocument.querySelector(
        "[data-report-copy-selection] .report-document",
      );
      expect(selectedReport.style.backgroundColor).toBe("rgb(255, 255, 255)");
      expect(selectedReport.querySelector("table").style.borderCollapse).toBe(
        "collapse",
      );
      expect(selectedReport.hasAttribute("contenteditable")).toBe(false);
      return true;
    });

    const result = await copyReportDocument(
      reportDocument,
      createBrowserWindow(clipboard, reportDocument),
    );

    expect(result).toEqual({ method: "selection", rich: true });
    expect(reportDocument.execCommand).toHaveBeenCalledWith("copy");
    expect(clipboard.writeText).not.toHaveBeenCalled();
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
