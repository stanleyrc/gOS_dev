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
  };

  handleExportNotes = async () => {
    const { mergedEvents } = this.props;
    try {
      this.setState({ exporting: true });
      const state = this.props;
      await exportReport(state, mergedEvents);
    } catch (err) {
      console.error("Report export failed:", err);
    } finally {
      this.setState({ exporting: false });
    }
  };

  handlePreviewReport = async () => {
    const { mergedEvents } = this.props;
    try {
      this.setState({ previewLoading: true, previewVisible: true });
      const state = this.props;
      const html = await previewReport(state, mergedEvents);
      this.setState({ previewHtml: html });
    } catch (err) {
      console.error("Report preview failed:", err);
      this.setState({ previewVisible: false });
    } finally {
      this.setState({ previewLoading: false });
    }
  };

  handleClosePreview = () => {
    this.setState({ previewVisible: false, previewHtml: null });
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
        this.props.updateInterpretation(interpretation);
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

  handleResetReportState = async () => {
    const { id, resetTierOverrides, selectFilteredEvent } = this.props;
    const caseId = id ? String(id) : "";
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

    // Clear interpretations from IndexedDB
    this.props.clearCaseInterpretations(caseId);

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
  clearCaseInterpretations: (caseId) => dispatch(interpretationsActions.clearCaseInterpretations(caseId)),
  updateInterpretation: (interpretation) => dispatch(interpretationsActions.updateInterpretation(interpretation)),
});
const mapStateToProps = (state) => ({
  loading: state.PopulationStatistics.loading,
  id: state.CaseReport.id,
  CaseReport: state.CaseReport,
  Interpretations: state.Interpretations,
  mergedEvents: require("../../redux/interpretations/selectors").selectMergedEvents(state),
});

export default connect(
  mapStateToProps,
  mapDispatchToProps
)(withTranslation("common")(ReportButtonsPanel));
