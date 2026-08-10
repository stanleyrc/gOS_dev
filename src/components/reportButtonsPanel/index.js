import React, { Component } from "react";
import { withTranslation } from "react-i18next";
import { connect } from "react-redux";
import { Button } from "antd";
import { FaFileMedical } from "react-icons/fa6";
import ReportPreviewModal from "../reportPreviewModal";
import { exportReport, previewReport } from "../../helpers/reportExporter";
import interpretationsActions from "../../redux/interpretations/actions";
import filteredEventsActions from "../../redux/filteredEvents/actions";
import Wrapper from "./index.style";

const { selectFilteredEvent, resetTierOverrides } = filteredEventsActions;

class ReportButtonsPanel extends Component {
  state = {
    exporting: false,
    previewVisible: false,
    previewHtml: null,
    previewLoading: false,
    previewContext: null,
    previewSelectedEventUids: null,
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

  handleExportNotes = async () => {
    const { mergedEvents } = this.props;
    const selectedEventUids = Array.isArray(
      this.state.previewSelectedEventUids,
    )
      ? this.state.previewSelectedEventUids
      : this.props.selectedEventUids;

    try {
      this.setState({ exporting: true });
      const state = this.props;
      await exportReport(state, mergedEvents, selectedEventUids);
    } catch (err) {
      console.error("Report export failed:", err);
    } finally {
      this.setState({ exporting: false });
    }
  };

  handlePreviewReport = async () => {
    const { mergedEvents } = this.props;
    const selectedEventUids = Array.isArray(this.props.selectedEventUids)
      ? [...this.props.selectedEventUids]
      : [];
    const previewContext = this.getActiveReportContext();
    if (!previewContext) return;

    try {
      this.setState({
        previewLoading: true,
        previewVisible: true,
        previewHtml: null,
        previewContext: null,
        previewSelectedEventUids: selectedEventUids,
      });
      const state = this.props;
      const html = await previewReport(state, mergedEvents, selectedEventUids);
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
      previewSelectedEventUids: null,
    });
  };

  handleResetReportState = async () => {
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

    if (!resetContextIsActive()) return;

    // Clear interpretations from the captured dataset after confirmation.
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
          shape="round"
          icon={<FaFileMedical size={16} />}
          onClick={this.handlePreviewReport}
          disabled={loading}
          loading={this.state.previewLoading}
          aria-label={t("components.header-panel.view-report")}
        >
          {t("components.header-panel.view-report")}
        </Button>
        <ReportPreviewModal
          visible={this.state.previewVisible}
          onCancel={this.handleClosePreview}
          loading={this.state.previewLoading}
          html={this.state.previewHtml}
          onExport={this.handleExportNotes}
          onReset={this.handleResetReportState}
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
});
const mapStateToProps = (state) => ({
  loading: state.PopulationStatistics.loading,
  id: state.CaseReport.id,
  CaseReport: state.CaseReport,
  dataset: state.Settings.dataset,
  mergedEvents: require("../../redux/interpretations/selectors").selectMergedEvents(state),
  selectedEventUids: require("../../redux/filteredEvents/selectors").selectReportEventUids(state),
});

export { mapDispatchToProps, ReportButtonsPanel };
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(withTranslation("common")(ReportButtonsPanel));
