const COPIED_STYLE_PROPERTIES = [
  "display",
  "box-sizing",
  "color",
  "background-color",
  "background-image",
  "background-position",
  "background-repeat",
  "background-size",
  "font-family",
  "font-size",
  "font-style",
  "font-variant",
  "font-weight",
  "letter-spacing",
  "line-height",
  "text-align",
  "text-align-last",
  "text-decoration-color",
  "text-decoration-line",
  "text-decoration-style",
  "text-indent",
  "text-transform",
  "vertical-align",
  "white-space",
  "overflow-wrap",
  "word-break",
  "word-spacing",
  "direction",
  "border-top-color",
  "border-top-style",
  "border-top-width",
  "border-right-color",
  "border-right-style",
  "border-right-width",
  "border-bottom-color",
  "border-bottom-style",
  "border-bottom-width",
  "border-left-color",
  "border-left-style",
  "border-left-width",
  "border-top-left-radius",
  "border-top-right-radius",
  "border-bottom-right-radius",
  "border-bottom-left-radius",
  "border-collapse",
  "border-spacing",
  "caption-side",
  "empty-cells",
  "table-layout",
  "width",
  "min-width",
  "max-width",
  "height",
  "min-height",
  "max-height",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "list-style-image",
  "list-style-position",
  "list-style-type",
];

const EDITING_ONLY_ATTRIBUTES = new Set([
  "aria-multiline",
  "aria-placeholder",
  "autocapitalize",
  "autocomplete",
  "autocorrect",
  "contenteditable",
  "data-alteration-id",
  "spellcheck",
  "tabindex",
]);

function isEditingOnlyAttribute(attributeName) {
  return (
    EDITING_ONLY_ATTRIBUTES.has(attributeName) ||
    attributeName.startsWith("data-editable") ||
    attributeName.startsWith("data-editing") ||
    attributeName.startsWith("data-report-edit")
  );
}

function removeEditingAttributes(element) {
  Array.from(element.attributes).forEach(({ name }) => {
    const normalizedName = name.toLowerCase();
    if (isEditingOnlyAttribute(normalizedName)) {
      element.removeAttribute(name);
    }
  });
  if (element.getAttribute("role") === "textbox") {
    element.removeAttribute("role");
  }
}

function inlineComputedStyles(source, clone, getComputedStyle) {
  const sourceElements = [source, ...source.querySelectorAll("*")];
  const clonedElements = [clone, ...clone.querySelectorAll("*")];

  sourceElements.forEach((sourceElement, index) => {
    const clonedElement = clonedElements[index];
    const computedStyle = getComputedStyle(sourceElement);
    COPIED_STYLE_PROPERTIES.forEach((property) => {
      const value = computedStyle.getPropertyValue(property);
      if (value) clonedElement.style.setProperty(property, value);
    });
    removeEditingAttributes(clonedElement);
  });
}

function getReportCopy(reportDocument) {
  const report = reportDocument?.querySelector(".report-document");
  const reportWindow = reportDocument?.defaultView;
  if (!report || !reportWindow?.getComputedStyle) {
    throw new Error("Report preview is unavailable");
  }

  const clone = report.cloneNode(true);
  inlineComputedStyles(
    report,
    clone,
    reportWindow.getComputedStyle.bind(reportWindow),
  );

  return {
    clone,
    html: clone.outerHTML,
    text: report.innerText || report.textContent || "",
  };
}

async function writeRichClipboard(copy, browserWindow) {
  const clipboard = browserWindow?.navigator?.clipboard;
  const ClipboardItem = browserWindow?.ClipboardItem;
  const Blob = browserWindow?.Blob;
  if (!clipboard?.write || !ClipboardItem || !Blob) return false;

  try {
    const item = new ClipboardItem({
      "text/html": new Blob([copy.html], { type: "text/html" }),
      "text/plain": new Blob([copy.text], { type: "text/plain" }),
    });
    await clipboard.write([item]);
    return true;
  } catch (error) {
    return false;
  }
}

function copyRenderedSelection(reportDocument, styledReport) {
  const selection = reportDocument?.getSelection?.();
  if (
    !selection ||
    !reportDocument?.createRange ||
    !reportDocument?.execCommand ||
    !reportDocument.body
  ) {
    return false;
  }

  const previousRanges = [];
  for (let index = 0; index < selection.rangeCount; index += 1) {
    previousRanges.push(selection.getRangeAt(index).cloneRange());
  }

  const selectionContainer = reportDocument.createElement("div");
  selectionContainer.setAttribute("data-report-copy-selection", "true");
  selectionContainer.style.position = "fixed";
  selectionContainer.style.left = "-10000px";
  selectionContainer.style.top = "0";
  selectionContainer.appendChild(styledReport.cloneNode(true));
  reportDocument.body.appendChild(selectionContainer);

  try {
    const range = reportDocument.createRange();
    range.selectNode(selectionContainer.firstElementChild);
    selection.removeAllRanges();
    selection.addRange(range);
    return reportDocument.execCommand("copy") === true;
  } catch (error) {
    return false;
  } finally {
    selection.removeAllRanges();
    previousRanges.forEach((range) => selection.addRange(range));
    selectionContainer.remove();
  }
}

async function writePlainText(copy, browserWindow) {
  const clipboard = browserWindow?.navigator?.clipboard;
  if (clipboard?.writeText) {
    try {
      await clipboard.writeText(copy.text);
      return { method: "clipboard", rich: false };
    } catch (error) {
      // Continue to the legacy plain-text selection fallback.
    }
  }

  const document = browserWindow?.document;
  if (!document?.body || !document.execCommand) return null;

  const textArea = document.createElement("textarea");
  textArea.value = copy.text;
  textArea.setAttribute("readonly", "");
  textArea.style.position = "fixed";
  textArea.style.opacity = "0";
  document.body.appendChild(textArea);

  try {
    textArea.focus();
    textArea.select();
    return document.execCommand("copy") === true
      ? { method: "selection", rich: false }
      : null;
  } catch (error) {
    return null;
  } finally {
    textArea.remove();
  }
}

async function copyReportDocument(reportDocument, browserWindow = window) {
  const copy = getReportCopy(reportDocument);

  if (await writeRichClipboard(copy, browserWindow)) {
    return { method: "clipboard", rich: true };
  }

  if (copyRenderedSelection(reportDocument, copy.clone)) {
    return { method: "selection", rich: true };
  }

  const plainResult = await writePlainText(copy, browserWindow);
  if (plainResult) return plainResult;

  throw new Error("Unable to copy report");
}

export { copyReportDocument };
