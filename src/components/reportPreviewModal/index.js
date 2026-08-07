import React, { Component } from "react";
import { Button, message, Modal, Skeleton, Space } from "antd";
import {
  CopyOutlined,
  DownloadOutlined,
  UndoOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import { copyReportDocument } from "../../helpers/copyReportDocument";
import {
  LoadingContainer,
  PreviewContainer,
  PreviewIframe,
  PreviewLayout,
  ReportToolbar,
} from "./index.style";

const COMMENT_SAVE_DELAY_MS = 600;
const EDITABLE_COMMENT_SELECTOR =
  '[data-editable-comment="true"][data-alteration-id]';

function getCommentText(element) {
  const rawValue = element?.innerText ?? element?.textContent ?? "";
  const textContent = element?.textContent ?? "";
  const sentinelPattern = /^[\r\n\u200b\ufeff]*$/;

  if (
    sentinelPattern.test(String(rawValue)) &&
    sentinelPattern.test(String(textContent))
  ) {
    return "";
  }

  return String(rawValue).replace(/\r\n?/g, "\n");
}

class ReportPreviewModal extends Component {
  state = {
    copying: false,
    previewReady: false,
    undoAvailable: false,
  };

  previewIframeRef = React.createRef();

  savedCommentValues = new Map();

  pendingCommentEdits = new Map();

  commentEditHistory = [];

  commentWriteChains = new Map();

  activeCommentWrites = new Set();

  editingDocument = null;

  editingSessionActive = false;

  editingSessionId = 0;

  editSequence = 0;

  undoInProgress = false;

  resetInProgress = false;

  isUnmounting = false;

  componentDidMount() {
    this.isUnmounting = false;
  }

  componentDidUpdate(prevProps) {
    const previewChanged =
      prevProps.html !== this.props.html ||
      (!prevProps.loading && this.props.loading);
    const modalClosed = prevProps.visible && !this.props.visible;

    if (previewChanged || modalClosed) {
      this.flushAndCleanupEditingDocument().catch(() => undefined);
      if (previewChanged && this.state.previewReady) {
        this.setState({ previewReady: false });
      }
    }

    if (modalClosed) {
      this.endEditingSession();
    } else if (!prevProps.visible && this.props.visible) {
      this.beginEditingSession();
    }
  }

  componentWillUnmount() {
    this.isUnmounting = true;
    this.flushAndCleanupEditingDocument().catch(() => undefined);
    this.endEditingSession();
  }

  nextEditSequence = () => {
    this.editSequence += 1;
    return this.editSequence;
  };

  beginEditingSession = () => {
    if (this.editingSessionActive) return;
    this.editingSessionId += 1;
    this.editingSessionActive = true;
    this.savedCommentValues.clear();
    this.clearPendingCommentEdits();
    this.commentEditHistory = [];
    this.updateUndoAvailability();
  };

  endEditingSession = () => {
    this.editingSessionId += 1;
    this.clearPendingCommentEdits();
    this.savedCommentValues.clear();
    this.commentEditHistory = [];
    this.editingSessionActive = false;
    this.resetInProgress = false;
    this.updateUndoAvailability();
  };

  isCurrentEditingSession = (sessionId) =>
    this.editingSessionActive && this.editingSessionId === sessionId;

  getUndoCandidates = () => {
    const pending = Array.from(this.pendingCommentEdits.values())
      .filter((edit) => this.isCurrentEditingSession(edit.sessionId))
      .map((edit) => ({ type: "pending", edit }));
    const active = Array.from(this.activeCommentWrites)
      .filter(
        (operation) =>
          operation.recordHistory &&
          !operation.undone &&
          (operation.status === "queued" || operation.status === "saving") &&
          this.isCurrentEditingSession(operation.sessionId),
      )
      .map((operation) => ({ type: "active", operation }));
    const history = this.commentEditHistory
      .filter((operation) => !operation.undoing)
      .map((operation) => ({ type: "history", operation }));

    return [...pending, ...active, ...history];
  };

  updateUndoAvailability = () => {
    const undoAvailable = this.getUndoCandidates().length > 0;
    if (
      !this.isUnmounting &&
      this.state.undoAvailable !== undoAvailable
    ) {
      this.setState({ undoAvailable });
    }
  };

  getLatestTargetValue = (alterationId) => {
    const latestWrite = Array.from(this.activeCommentWrites)
      .filter(
        (operation) =>
          operation.alterationId === alterationId &&
          !operation.undone &&
          this.isCurrentEditingSession(operation.sessionId) &&
          (operation.status === "queued" || operation.status === "saving"),
      )
      .sort((left, right) => right.sequence - left.sequence)[0];

    return latestWrite
      ? latestWrite.value
      : this.savedCommentValues.get(alterationId) ?? "";
  };

  setupEditingDocument = (reportDocument) => {
    this.editingDocument = reportDocument;
    const editors = Array.from(
      reportDocument.querySelectorAll(EDITABLE_COMMENT_SELECTOR),
    );

    editors.forEach((editor) => {
      const alterationId = editor.getAttribute("data-alteration-id");
      if (!alterationId) return;

      if (this.savedCommentValues.has(alterationId)) {
        editor.textContent = this.getLatestTargetValue(alterationId);
      } else {
        this.savedCommentValues.set(alterationId, getCommentText(editor));
      }

      editor.setAttribute(
        "contenteditable",
        this.undoInProgress ? "false" : "plaintext-only",
      );
      if (this.undoInProgress) editor.setAttribute("aria-disabled", "true");
      editor.setAttribute("data-report-editing", "true");
      editor.setAttribute("role", "textbox");
      editor.setAttribute("aria-multiline", "true");
      editor.setAttribute("aria-placeholder", "Enter comments");
      editor.setAttribute("spellcheck", "true");
      editor.setAttribute("tabindex", "0");
    });

    reportDocument.addEventListener("input", this.handleCommentInput);
    reportDocument.addEventListener("focusout", this.handleCommentBlur);
  };

  cleanupEditingDocument = () => {
    if (!this.editingDocument) return;

    this.editingDocument.removeEventListener("input", this.handleCommentInput);
    this.editingDocument.removeEventListener(
      "focusout",
      this.handleCommentBlur,
    );
    this.editingDocument
      .querySelectorAll(EDITABLE_COMMENT_SELECTOR)
      .forEach((editor) => {
        editor.removeAttribute("contenteditable");
        editor.removeAttribute("data-report-editing");
        editor.removeAttribute("role");
        editor.removeAttribute("aria-multiline");
        editor.removeAttribute("aria-placeholder");
        editor.removeAttribute("aria-disabled");
        editor.removeAttribute("spellcheck");
        editor.removeAttribute("tabindex");
      });
    this.editingDocument = null;
  };

  flushAndCleanupEditingDocument = () => {
    const flushPromise = this.flushPendingCommentChanges();
    this.cleanupEditingDocument();
    return flushPromise;
  };

  handleIframeLoad = () => {
    this.flushAndCleanupEditingDocument().catch(() => undefined);

    try {
      const reportDocument = this.previewIframeRef.current?.contentDocument;
      const reportReady = Boolean(
        this.props.visible &&
        !this.props.loading &&
        reportDocument?.querySelector(".report-document"),
      );

      if (reportReady) {
        this.beginEditingSession();
        this.setupEditingDocument(reportDocument);
      }
      this.setState({ previewReady: reportReady });
    } catch (error) {
      this.setState({ previewReady: false });
    }
  };

  setCommentEditorsDisabled = (disabled) => {
    this.editingDocument
      ?.querySelectorAll(EDITABLE_COMMENT_SELECTOR)
      .forEach((editor) => {
        editor.setAttribute(
          "contenteditable",
          disabled ? "false" : "plaintext-only",
        );
        if (disabled) editor.setAttribute("aria-disabled", "true");
        else editor.removeAttribute("aria-disabled");
      });
  };

  getCommentEditor = (eventTarget) => {
    const element =
      eventTarget?.nodeType === 3 ? eventTarget.parentElement : eventTarget;
    const editor = element?.closest?.(EDITABLE_COMMENT_SELECTOR);
    return editor && this.editingDocument?.contains(editor) ? editor : null;
  };

  handleCommentInput = (event) => {
    const editor = this.getCommentEditor(event.target);
    if (!editor) return;

    const alterationId = editor.getAttribute("data-alteration-id");
    if (this.resetInProgress || this.undoInProgress) {
      editor.textContent = this.getLatestTargetValue(alterationId);
      return;
    }

    const value = getCommentText(editor);
    const pendingEdit = this.pendingCommentEdits.get(alterationId);
    if (pendingEdit?.timer) clearTimeout(pendingEdit.timer);
    this.pendingCommentEdits.delete(alterationId);

    if (value === this.getLatestTargetValue(alterationId)) {
      this.updateUndoAvailability();
      return;
    }

    const edit = {
      alterationId,
      sequence: this.nextEditSequence(),
      sessionId: this.editingSessionId,
      commentSaveContext: this.props.previewContext,
      value,
      timer: null,
    };
    edit.timer = setTimeout(() => {
      this.savePendingCommentChange(alterationId).catch(() => undefined);
    }, COMMENT_SAVE_DELAY_MS);
    this.pendingCommentEdits.set(alterationId, edit);
    this.updateUndoAvailability();
  };

  handleCommentBlur = (event) => {
    const editor = this.getCommentEditor(event.target);
    if (!editor) return;
    this.savePendingCommentChange(
      editor.getAttribute("data-alteration-id"),
    ).catch(() => undefined);
  };

  addHistoryOperation = (operation) => {
    if (this.commentEditHistory.includes(operation)) return;
    this.commentEditHistory.push(operation);
    this.commentEditHistory.sort(
      (left, right) => left.sequence - right.sequence,
    );
  };

  hasNewerCommentIntent = (operation) => {
    const pending = this.pendingCommentEdits.get(operation.alterationId);
    if (pending && pending.sequence > operation.sequence) return true;

    return Array.from(this.activeCommentWrites).some(
      (candidate) =>
        candidate !== operation &&
        candidate.alterationId === operation.alterationId &&
        candidate.sequence > operation.sequence &&
        candidate.sessionId === operation.sessionId &&
        (candidate.status === "queued" || candidate.status === "saving"),
    );
  };

  retainFailedCommentEdit = (operation) => {
    if (
      !operation.retainOnFailure ||
      operation.undone ||
      !this.isCurrentEditingSession(operation.sessionId) ||
      this.hasNewerCommentIntent(operation)
    ) {
      return;
    }

    const editor = this.findCommentEditor(operation.alterationId);
    if (editor && getCommentText(editor) !== operation.value) return;

    this.pendingCommentEdits.set(operation.alterationId, {
      alterationId: operation.alterationId,
      sequence: operation.sequence,
      sessionId: operation.sessionId,
      commentSaveContext: operation.commentSaveContext,
      value: operation.value,
      timer: null,
    });
  };

  persistCommentValue = (
    alterationId,
    value,
    {
      recordHistory = true,
      sequence = this.nextEditSequence(),
      retainOnFailure = true,
      sessionId = this.editingSessionId,
      commentSaveContext = this.props.previewContext,
    } = {},
  ) => {
    const operation = {
      alterationId,
      value,
      sequence,
      recordHistory,
      retainOnFailure,
      sessionId,
      commentSaveContext,
      previousValue: null,
      status: "queued",
      undone: false,
      undoing: false,
      promise: null,
    };
    const priorWrite =
      this.commentWriteChains.get(alterationId) || Promise.resolve();

    const writePromise = priorWrite.then(async () => {
      operation.status = "saving";
      operation.previousValue =
        this.savedCommentValues.get(alterationId) ?? "";

      if (operation.value === operation.previousValue) {
        operation.status = "unchanged";
        return {
          saved: false,
          alterationId,
          previousValue: operation.previousValue,
          value: operation.value,
        };
      }

      if (typeof this.props.onSaveComment !== "function") {
        throw new Error("Comment persistence is unavailable.");
      }

      try {
        const acknowledgment = await this.props.onSaveComment(
          alterationId,
          operation.value,
          operation.commentSaveContext,
        );
        operation.status = "succeeded";

        if (this.isCurrentEditingSession(operation.sessionId)) {
          this.savedCommentValues.set(alterationId, operation.value);
          if (operation.recordHistory && !operation.undone) {
            this.addHistoryOperation(operation);
          }
          this.updateUndoAvailability();
        }

        return {
          saved: true,
          alterationId,
          previousValue: operation.previousValue,
          value: operation.value,
          acknowledgment,
        };
      } catch (error) {
        operation.status = "failed";
        this.retainFailedCommentEdit(operation);
        if (this.isCurrentEditingSession(operation.sessionId)) {
          this.updateUndoAvailability();
          if (!this.isUnmounting) message.error("Unable to save comment.");
        }
        throw error;
      }
    });

    operation.promise = writePromise;
    this.activeCommentWrites.add(operation);

    const writeTail = writePromise
      .catch(() => undefined)
      .then(() => {
        this.activeCommentWrites.delete(operation);
        if (this.commentWriteChains.get(alterationId) === writeTail) {
          this.commentWriteChains.delete(alterationId);
        }
        this.updateUndoAvailability();
      });
    this.commentWriteChains.set(alterationId, writeTail);
    this.updateUndoAvailability();

    return writePromise;
  };

  savePendingCommentChange = (alterationId) => {
    const pendingEdit = this.pendingCommentEdits.get(alterationId);
    if (!pendingEdit) return Promise.resolve(false);

    if (pendingEdit.timer) clearTimeout(pendingEdit.timer);
    this.pendingCommentEdits.delete(alterationId);
    this.updateUndoAvailability();
    return this.persistCommentValue(alterationId, pendingEdit.value, {
      recordHistory: true,
      sequence: pendingEdit.sequence,
      retainOnFailure: true,
      sessionId: pendingEdit.sessionId,
      commentSaveContext: pendingEdit.commentSaveContext,
    });
  };

  getActiveWritePromises = (sessionId = this.editingSessionId) =>
    Array.from(this.activeCommentWrites)
      .filter((operation) => operation.sessionId === sessionId)
      .map((operation) => operation.promise);

  flushPendingCommentChanges = async () => {
    const sessionId = this.editingSessionId;

    while (true) {
      const pendingEdits = Array.from(this.pendingCommentEdits.values())
        .filter((edit) => edit.sessionId === sessionId)
        .sort((left, right) => left.sequence - right.sequence);
      const pendingSaves = pendingEdits.map((edit) =>
        this.savePendingCommentChange(edit.alterationId),
      );
      const writes = [
        ...new Set([
          ...pendingSaves,
          ...this.getActiveWritePromises(sessionId),
        ]),
      ];

      if (writes.length === 0) return;
      await Promise.all(writes);

      const hasPendingEdits = Array.from(
        this.pendingCommentEdits.values(),
      ).some((edit) => edit.sessionId === sessionId);
      if (
        !hasPendingEdits &&
        this.getActiveWritePromises(sessionId).length === 0
      ) {
        return;
      }
    }
  };

  clearPendingCommentEdits = ({ revertEditors = false } = {}) => {
    const alterationIds = Array.from(this.pendingCommentEdits.keys());
    this.pendingCommentEdits.forEach(({ timer }) => {
      if (timer) clearTimeout(timer);
    });
    this.pendingCommentEdits.clear();

    if (revertEditors) {
      alterationIds.forEach((alterationId) => {
        const editor = this.findCommentEditor(alterationId);
        if (editor) editor.textContent = this.getLatestTargetValue(alterationId);
      });
    }
    this.updateUndoAvailability();
  };

  findCommentEditor = (alterationId) =>
    Array.from(
      this.editingDocument?.querySelectorAll(EDITABLE_COMMENT_SELECTOR) || [],
    ).find(
      (editor) => editor.getAttribute("data-alteration-id") === alterationId,
    );

  getLatestUndoCandidate = () =>
    this.getUndoCandidates().sort((left, right) => {
      const leftSequence = left.edit?.sequence ?? left.operation?.sequence ?? 0;
      const rightSequence =
        right.edit?.sequence ?? right.operation?.sequence ?? 0;
      return rightSequence - leftSequence;
    })[0];

  undoPendingEdit = (edit) => {
    if (edit.timer) clearTimeout(edit.timer);
    this.pendingCommentEdits.delete(edit.alterationId);
    const editor = this.findCommentEditor(edit.alterationId);
    if (editor) {
      editor.textContent = this.getLatestTargetValue(edit.alterationId);
    }
    this.updateUndoAvailability();
  };

  undoActiveWrite = async (operation) => {
    operation.undone = true;
    this.updateUndoAvailability();

    try {
      const result = await operation.promise;
      if (result.saved) {
        try {
          await this.persistCommentValue(
            operation.alterationId,
            result.previousValue,
            {
              recordHistory: false,
              retainOnFailure: false,
              sessionId: operation.sessionId,
              commentSaveContext: operation.commentSaveContext,
            },
          );
        } catch (error) {
          operation.undone = false;
          if (this.isCurrentEditingSession(operation.sessionId)) {
            this.addHistoryOperation(operation);
          }
          throw error;
        }
      }

      if (this.isCurrentEditingSession(operation.sessionId)) {
        const editor = this.findCommentEditor(operation.alterationId);
        if (editor) {
          editor.textContent =
            this.savedCommentValues.get(operation.alterationId) ?? "";
        }
      }
    } catch (error) {
      if (this.isCurrentEditingSession(operation.sessionId)) {
        const editor = this.findCommentEditor(operation.alterationId);
        if (editor) {
          editor.textContent =
            this.savedCommentValues.get(operation.alterationId) ?? "";
        }
      }
    }
  };

  undoHistoryOperation = async (operation) => {
    operation.undoing = true;
    this.updateUndoAvailability();

    try {
      await this.persistCommentValue(
        operation.alterationId,
        operation.previousValue,
        {
          recordHistory: false,
          retainOnFailure: false,
          sessionId: operation.sessionId,
          commentSaveContext: operation.commentSaveContext,
        },
      );
      this.commentEditHistory = this.commentEditHistory.filter(
        (entry) => entry !== operation,
      );
      if (this.isCurrentEditingSession(operation.sessionId)) {
        const editor = this.findCommentEditor(operation.alterationId);
        if (editor) editor.textContent = operation.previousValue;
      }
    } catch (error) {
      operation.undoing = false;
      if (this.isCurrentEditingSession(operation.sessionId)) {
        const editor = this.findCommentEditor(operation.alterationId);
        if (editor) {
          editor.textContent =
            this.savedCommentValues.get(operation.alterationId) ?? "";
        }
      }
    }
  };

  preserveEditorFocus = (event) => {
    event?.preventDefault?.();
  };

  handleUndo = async () => {
    if (this.undoInProgress) return;
    const candidate = this.getLatestUndoCandidate();
    if (!candidate) {
      this.updateUndoAvailability();
      return;
    }

    if (candidate.type === "pending") {
      this.undoPendingEdit(candidate.edit);
      return;
    }

    this.undoInProgress = true;
    this.setCommentEditorsDisabled(true);
    this.updateUndoAvailability();
    try {
      if (candidate.type === "active") {
        await this.undoActiveWrite(candidate.operation);
      } else {
        await this.undoHistoryOperation(candidate.operation);
      }
    } finally {
      this.undoInProgress = false;
      this.setCommentEditorsDisabled(false);
      this.updateUndoAvailability();
    }
  };

  prepareForReset = async () => {
    this.resetInProgress = true;
    this.clearPendingCommentEdits({ revertEditors: true });

    while (this.getActiveWritePromises().length > 0) {
      const inFlightWrites = this.getActiveWritePromises();
      await Promise.all(
        inFlightWrites.map((write) => write.catch(() => undefined)),
      );
      this.clearPendingCommentEdits({ revertEditors: true });
    }
  };

  handleCancel = async (...args) => {
    try {
      await this.flushAndCleanupEditingDocument();
    } catch (error) {
      // Persistence already displayed concise feedback; closing is best effort.
    } finally {
      this.endEditingSession();
      if (typeof this.props.onCancel === "function") {
        this.props.onCancel(...args);
      }
    }
  };

  handleImport = async (...args) => {
    try {
      await this.flushPendingCommentChanges();
    } catch (error) {
      return;
    }

    if (typeof this.props.onImport === "function") {
      return this.props.onImport(...args);
    }
  };

  handleExport = async () => {
    try {
      await this.flushPendingCommentChanges();
    } catch (error) {
      return;
    }

    if (typeof this.props.onExport === "function") {
      const savedCommentOverrides = Object.fromEntries(
        this.savedCommentValues.entries(),
      );
      return this.props.onExport(savedCommentOverrides);
    }
  };

  handleReset = async (...args) => {
    try {
      if (typeof this.props.onReset === "function") {
        return await this.props.onReset(this.prepareForReset, ...args);
      }
      return await this.prepareForReset();
    } finally {
      this.resetInProgress = false;
    }
  };

  handleCopyReport = async () => {
    const { html, loading } = this.props;
    const reportDocument = this.previewIframeRef.current?.contentDocument;
    if (
      loading ||
      !html ||
      !this.state.previewReady ||
      !reportDocument?.querySelector(".report-document")
    ) {
      message.error("Report unavailable.");
      return;
    }

    try {
      this.setState({ copying: true });
      await copyReportDocument(reportDocument);
      message.success("Report copied.");
    } catch (error) {
      console.error("Report copy failed:", error);
      message.error("Unable to copy report.");
    } finally {
      this.setState({ copying: false });
    }
  };

  render() {
    const {
      visible,
      loading,
      html,
      importLabel,
      exportLabel,
      resetLabel,
      exporting,
    } = this.props;
    const copyDisabled =
      loading || !html || !this.state.previewReady || this.state.copying;

    return (
      <Modal
        title="Report Preview"
        open={visible}
        onCancel={this.handleCancel}
        footer={null}
        width="90%"
        style={{ top: 20 }}
        bodyStyle={{ height: "calc(100vh - 100px)", padding: 0 }}
      >
        <PreviewLayout>
          <ReportToolbar>
            <Space>
              <Button
                icon={<UploadOutlined />}
                onClick={this.handleImport}
                disabled={loading}
              >
                {importLabel}
              </Button>
              <Button
                icon={<CopyOutlined />}
                onClick={this.handleCopyReport}
                disabled={copyDisabled}
                loading={this.state.copying}
                aria-label="Copy Report"
              >
                Copy Report
              </Button>
              <Button
                icon={<UndoOutlined />}
                onMouseDown={this.preserveEditorFocus}
                onClick={this.handleUndo}
                disabled={
                  loading ||
                  !this.state.previewReady ||
                  !this.state.undoAvailable ||
                  this.undoInProgress
                }
                aria-label="Undo"
              >
                Undo
              </Button>
              <Button
                type="primary"
                icon={<DownloadOutlined />}
                onClick={this.handleExport}
                disabled={loading}
                loading={exporting}
              >
                {exportLabel}
              </Button>
            </Space>
            <Button
              danger
              onMouseDown={this.preserveEditorFocus}
              onClick={this.handleReset}
              disabled={loading}
            >
              {resetLabel}
            </Button>
          </ReportToolbar>
          <PreviewContainer>
            {loading ? (
              <LoadingContainer>
                <Skeleton active />
              </LoadingContainer>
            ) : (
              <PreviewIframe
                ref={this.previewIframeRef}
                srcDoc={html}
                title="Report Preview"
                onLoad={this.handleIframeLoad}
              />
            )}
          </PreviewContainer>
        </PreviewLayout>
      </Modal>
    );
  }
}

export { ReportPreviewModal };
export default ReportPreviewModal;
