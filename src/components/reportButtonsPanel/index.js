import React, { Component } from "react";
import { withTranslation } from "react-i18next";
import { connect } from "react-redux";
import { Button } from "antd";
import { FaFileMedical } from "react-icons/fa6";
import ReportPreviewModal from "../reportPreviewModal";
import { exportReport, previewReport } from "../../helpers/reportExporter";
import interpretationsActions from "../../redux/interpretations/actions";
import filteredEventsActions from "../../redux/filteredEvents/actions";
import EventInterpretation from "../../helpers/EventInterpretation";
import Wrapper from "./index.style";

const { selectFilteredEvent, resetTierOverrides } = filteredEventsActions;

class ReportButtonsPanel extends Component {
  constructor(props) {
    super(props);
    this.fileInputRef = React.createRef();
  }

  state = {
    exporting: false,
    previewVisible: false,
    previewHtml: null,
    previewLoading: false,
    previewContext: null,
  };

  componentDidUpdate(prevProps) {
    const caseChanged = String(prevProps.id ?? "") !== String(this.props.id ?? "");
    const datasetChanged =
      String(prevProps.dataset?.id ?? "") !==
      String(this.props.dataset?.id ?? "");

    if ((caseChanged || datasetChanged) && this.state.previewVisible) {
      this.handleClosePreview();
    }
  }

  getActiveReportContext = () => {
    const caseId = this.props.id;
    const datasetId = this.props.dataset?.id;
    if (!caseId || datasetId == null) return null;
    return { caseId, datasetId };
  };

  reportContextsMatch = (left, right) =>
    Boolean(
      left &&
        right &&
        String(left.caseId) === String(right.caseId) &&
        String(left.datasetId) === String(right.datasetId),
    );

  isPreviewContextActive = (previewContext) =>
    this.state.previewVisible &&
    this.state.previewContext === previewContext &&
    this.reportContextsMatch(previewContext, this.getActiveReportContext());

  handleExportNotes = async (commentOverrides = {}) => {
    const { mergedEvents } = this.props;
    const filteredEvents = (mergedEvents?.filteredEvents || []).map((event) => {
      const uid = event?.uid;
      const key = uid == null ? null : String(uid);
      if (
        key == null ||
        !Object.prototype.hasOwnProperty.call(commentOverrides, key)
      ) {
        return event;
      }
      return { ...event, variant_summary: commentOverrides[key] };
    });
    const exportEvents = { ...mergedEvents, filteredEvents };

    try {
      this.setState({ exporting: true });
      const state = this.props;
      await exportReport(state, exportEvents);
    } catch (err) {
      console.error("Report export failed:", err);
    } finally {
      this.setState({ exporting: false });
    }
  };

  handlePreviewReport = async () => {
    const { mergedEvents } = this.props;
    const previewContext = this.getActiveReportContext();
    if (!previewContext) return;

    try {
      this.setState({
        previewLoading: true,
        previewVisible: true,
        previewHtml: null,
        previewContext: null,
      });
      const state = this.props;
      const html = await previewReport(state, mergedEvents);
      if (!this.reportContextsMatch(previewContext, this.getActiveReportContext())) {
        this.handleClosePreview();
        return;
      }
      this.setState({ previewHtml: html, previewContext });
    } catch (err) {
      console.error("Report preview failed:", err);
      this.handleClosePreview();
    } finally {
      this.setState({ previewLoading: false });
    }
  };

  handleClosePreview = () => {
    this.setState({
      previewVisible: false,
      previewHtml: null,
      previewContext: null,
    });
  };

  getCurrentInterpretation = (alterationId, user, reportContext) => {
    const { Interpretations = {} } = this.props;
    const userId = user?.userId;
    const caseId = reportContext?.caseId;
    const datasetId = reportContext?.datasetId;
    if (!alterationId || !userId || !caseId || datasetId == null) return null;

    const matchesActiveContext = (interpretation) =>
      interpretation &&
      String(interpretation.alterationId) === String(alterationId) &&
      String(interpretation.authorId) === String(userId) &&
      String(interpretation.caseId) === String(caseId) &&
      String(interpretation.datasetId) === String(datasetId);

    const selectedKey = Interpretations.selected?.[alterationId];
    const selectedInterpretation = selectedKey
      ? Interpretations.byId?.[selectedKey]
      : null;
    if (matchesActiveContext(selectedInterpretation)) {
      return selectedInterpretation;
    }

    return (
      Object.values(Interpretations.byId || {}).find(matchesActiveContext) ||
      null
    );
  };

  handleSaveReportComment = async (
    alterationId,
    variantSummary,
    commentSaveContext,
  ) => {
    if (!alterationId || typeof this.props.updateInterpretation !== "function") {
      throw new Error("Report comment cannot be saved.");
    }

    if (!this.isPreviewContextActive(commentSaveContext)) {
      throw new Error("The report preview context is no longer active.");
    }

    const { ensureUser } = await import("../../helpers/userAuth");
    const user = await ensureUser();
    if (!this.isPreviewContextActive(commentSaveContext)) {
      throw new Error("The report preview context is no longer active.");
    }
    if (!user?.userId) throw new Error("Sign-in is required to save comments.");

    const { mergedEvents, updateInterpretation } = this.props;

    const record = (mergedEvents?.filteredEvents || []).find(
      (event) =>
        event?.uid != null && String(event.uid) === String(alterationId),
    );
    if (!record) throw new Error("The report finding is no longer active.");

    const existingInterpretation = this.getCurrentInterpretation(
      alterationId,
      user,
      commentSaveContext,
    );
    const interpretation = new EventInterpretation({
      datasetId: commentSaveContext.datasetId,
      caseId: commentSaveContext.caseId,
      alterationId: record.uid,
      gene: record.gene ?? existingInterpretation?.gene,
      variant: record.variant ?? existingInterpretation?.variant,
      variant_type: record.type ?? existingInterpretation?.variant_type,
      authorId: user.userId,
      authorName: user.displayName,
      data: { variant_summary: variantSummary },
    });
    return updateInterpretation(interpretation.toJSON());
  };

  handleLoadReport = async () => {
    this.fileInputRef.current.click();
  };

  handleFileChange = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, 'text/html');
      const script = doc.getElementById('interpretations-data');
      if (!script) {
        throw new Error('No interpretations-data script found in HTML');
      }
      const interpretationsData = JSON.parse(script.textContent);

      // Validate caseId
      const currentCaseId = this.props.id;
      if (!currentCaseId) {
        throw new Error('No current case loaded');
      }
      for (const interp of interpretationsData) {
        if (interp.caseId !== currentCaseId) {
          throw new Error(`Case ID mismatch: expected ${currentCaseId}, got ${interp.caseId}`);
        }
      }

      // Create EventInterpretation objects and dispatch
      for (const interpData of interpretationsData) {
        const interpretation = new EventInterpretation(interpData);
        await this.props.updateInterpretation(interpretation);
      }

      alert(`Successfully imported ${interpretationsData.length} interpretations`);
      this.handleClosePreview();
    } catch (error) {
      console.error('Error importing report:', error);
      alert(`Failed to import report: ${error.message}`);
    } finally {
      // Reset the input
      event.target.value = '';
    }
  };

  handleResetReportState = async (prepareReset) => {
    const previewContext = this.state.previewContext;
    const dataset = this.props.dataset;
    const resetContextIsActive = () =>
      this.isPreviewContextActive(previewContext) &&
      this.props.dataset === dataset;

    if (!resetContextIsActive()) return;

    const { resetTierOverrides, selectFilteredEvent } = this.props;
    const caseId = String(previewContext.caseId ?? "");
    if (!caseId) {
      alert(
        this.props.t(
            "components.filtered-events-panel.reset-prompts.no-case-id"
        )
      );
      return;
    }
    const c1 = window.confirm(
      this.props.t("components.filtered-events-panel.reset-prompts.confirm1")
    );
    if (!c1) return;
    const c2 = window.confirm(
      this.props.t("components.filtered-events-panel.reset-prompts.confirm2")
    );
    if (!c2) return;

    if (typeof prepareReset === "function") {
      await prepareReset();
    }

    if (!resetContextIsActive()) return;

    // Clear interpretations from the captured dataset after report edits settle.
    await this.props.clearCaseInterpretations(caseId, dataset);

    if (!resetContextIsActive()) return;

    // Reset Redux state
    resetTierOverrides();
    selectFilteredEvent(null);
    this.handleClosePreview();
  };

  render() {
    const { t, loading } = this.props;

    return (
      <Wrapper>
        <Button
          className="report-view-button"
          icon={<FaFileMedical size={16} />}
          onClick={this.handlePreviewReport}
          disabled={loading}
          loading={this.state.previewLoading}
          aria-label={t("components.header-panel.view-report")}
        >
          {t("components.header-panel.view-report")}
        </Button>
        <input
          type="file"
          ref={this.fileInputRef}
          accept=".html"
          style={{ display: "none" }}
          onChange={this.handleFileChange}
        />
        <ReportPreviewModal
          visible={this.state.previewVisible}
          onCancel={this.handleClosePreview}
          loading={this.state.previewLoading}
          html={this.state.previewHtml}
          previewContext={this.state.previewContext}
          onSaveComment={this.handleSaveReportComment}
          onImport={this.handleLoadReport}
          onExport={this.handleExportNotes}
          onReset={this.handleResetReportState}
          importLabel={t("components.filtered-events-panel.load-report")}
          exportLabel={t("components.filtered-events-panel.export.notes")}
          resetLabel={t("components.filtered-events-panel.reset-state")}
          exporting={this.state.exporting}
        />
      </Wrapper>
    );
  }
}

ReportButtonsPanel.propTypes = {};
ReportButtonsPanel.defaultProps = {};
const mapDispatchToProps = (dispatch) => ({
  selectFilteredEvent: (filteredEvent, viewMode) =>
    dispatch(selectFilteredEvent(filteredEvent, viewMode)),
  resetTierOverrides: () => dispatch(resetTierOverrides()),
  clearCaseInterpretations: (caseId, dataset) =>
    new Promise((resolve, reject) => {
      dispatch(
        interpretationsActions.clearCaseInterpretations(
          caseId,
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          },
          dataset,
        ),
      );
    }),
  updateInterpretation: (interpretation) =>
    new Promise((resolve, reject) => {
      dispatch(
        interpretationsActions.updateInterpretation(
          interpretation,
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          },
        ),
      );
    }),
});
const mapStateToProps = (state) => ({
  loading: state.PopulationStatistics.loading,
  id: state.CaseReport.id,
  CaseReport: state.CaseReport,
  Interpretations: state.Interpretations,
  dataset: state.Settings.dataset,
  mergedEvents: require("../../redux/interpretations/selectors").selectMergedEvents(state),
});

export { mapDispatchToProps, ReportButtonsPanel };
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(withTranslation("common")(ReportButtonsPanel));
