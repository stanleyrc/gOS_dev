import React, { Component } from "react";
import { Modal, Tabs, Alert, Space, Spin, Typography } from "antd";
import Wrapper from "./index.style";

import TracksModal from "../tracksModal";
import AlterationCard from "../alterationCard";
import { withTranslation } from "react-i18next";

const { Text } = Typography;

export const FILTERED_EVENT_MODAL_TABS = {
  ALTERATION: "alteration",
  PLOTS: "plots",
  VARIANT_QC: "variantQc",
};

export function getFilteredEventModalTab(viewMode) {
  if (
    viewMode === FILTERED_EVENT_MODAL_TABS.PLOTS ||
    viewMode === "tracks"
  ) {
    return FILTERED_EVENT_MODAL_TABS.PLOTS;
  }
  if (viewMode === FILTERED_EVENT_MODAL_TABS.VARIANT_QC) {
    return FILTERED_EVENT_MODAL_TABS.VARIANT_QC;
  }
  return FILTERED_EVENT_MODAL_TABS.ALTERATION;
}

export class ReportModal extends Component {
  constructor(props) {
    super(props);
    this.state = {
      activeTab: getFilteredEventModalTab(props.initialTab),
      contentReady: false,
    };
  }

  componentDidUpdate(prevProps) {
    const selectionChanged =
      prevProps.record?.uid !== this.props.record?.uid ||
      prevProps.initialTab !== this.props.initialTab;
    const closed = prevProps.open && !this.props.open;

    if (!selectionChanged && !closed) return;

    const nextState = {};
    const nextTab = getFilteredEventModalTab(this.props.initialTab);
    if (this.state.activeTab !== nextTab) {
      nextState.activeTab = nextTab;
    }
    if (closed && this.state.contentReady) {
      nextState.contentReady = false;
    }
    if (Object.keys(nextState).length > 0) {
      this.setState(nextState);
    }
  }

  handleModalOpenChange = (presented) => {
    if (presented !== this.state.contentReady) {
      this.setState({ contentReady: presented });
    }
    if (this.props.afterOpenChange) {
      this.props.afterOpenChange(presented);
    }
  };

  handleTabChange = (activeTab) => {
    this.setState({ activeTab: getFilteredEventModalTab(activeTab) });
  };

  getTracksProps = (contentView) => {
    const {
      t,
      loading,
      genome,
      mutations,
      chromoBins,
      genomeCoverage,
      methylationBetaCoverage,
      methylationIntensityCoverage,
      hetsnps,
      genes,
      igv,
      allelic,
      selectedVariantId,
    } = this.props;

    return {
      loading: genome?.loading ?? loading,
      genome,
      mutations,
      genomeCoverage,
      methylationBetaCoverage,
      methylationIntensityCoverage,
      hetsnps,
      genes,
      igv,
      chromoBins,
      allelic,
      modalTitle: "",
      genomePlotTitle: t("components.tracks-modal.genome-plot"),
      genomePlotYAxisTitle: t("components.tracks-modal.genome-y-axis-title"),
      coveragePlotTitle: t("components.tracks-modal.coverage-plot"),
      coverageYAxisTitle: t("components.tracks-modal.coverage-copy-number"),
      coverageYAxis2Title: t("components.tracks-modal.coverage-count"),
      methylationBetaCoveragePlotTitle: t(
        "components.tracks-modal.methylation-beta-coverage-plot"
      ),
      methylationBetaCoverageYAxisTitle: t(
        "components.tracks-modal.methylation-beta-coverage-y-axis-title"
      ),
      methylationBetaCoverageYAxis2Title: t(
        "components.tracks-modal.methylation-beta-coverage-y-axis2-title"
      ),
      methylationIntensityCoveragePlotTitle: t(
        "components.tracks-modal.methylation-intensity-coverage-plot"
      ),
      methylationIntensityCoverageYAxisTitle: t(
        "components.tracks-modal.methylation-intensity-coverage-y-axis-title"
      ),
      methylationIntensityCoverageYAxis2Title: t(
        "components.tracks-modal.methylation-intensity-coverage-y-axis2-title"
      ),
      hetsnpPlotTitle: t("components.tracks-modal.hetsnp-plot"),
      hetsnpPlotYAxisTitle: t("components.tracks-modal.hetsnp-copy-number"),
      hetsnpPlotYAxis2Title: t("components.tracks-modal.hetsnps-count"),
      mutationsPlotTitle: t("components.tracks-modal.mutations-plot"),
      mutationsPlotYAxisTitle: t(
        "components.tracks-modal.mutations-plot-y-axis-title"
      ),
      allelicPlotTitle: t("components.tracks-modal.allelic-plot"),
      allelicPlotYAxisTitle: t(
        "components.tracks-modal.allelic-plot-y-axis-title"
      ),
      handleOkClicked: () => {},
      handleCancelClicked: () => {},
      open: true,
      viewType: "inline",
      contentView,
      selectedVariantId,
    };
  };

  renderTabContent = (tab) => {
    const { record, t } = this.props;

    if (tab === FILTERED_EVENT_MODAL_TABS.ALTERATION) {
      return record ? (
        <AlterationCard record={record} />
      ) : (
        <Alert
          type="info"
          message={t("components.report-modal.no-selection")}
          showIcon
        />
      );
    }

    return (
      <div className="filtered-event-tab-content">
        <TracksModal {...this.getTracksProps(tab)} />
      </div>
    );
  };

  getTabItems = () => {
    const { t } = this.props;
    const { activeTab } = this.state;
    const tabs = [
      FILTERED_EVENT_MODAL_TABS.PLOTS,
      FILTERED_EVENT_MODAL_TABS.ALTERATION,
      FILTERED_EVENT_MODAL_TABS.VARIANT_QC,
    ];

    return tabs.map((tab) => ({
      key: tab,
      label: t(`components.report-modal.tabs.${tab}`),
      children: activeTab === tab ? this.renderTabContent(tab) : null,
    }));
  };

  renderModalContent = () => {
    if (!this.state.contentReady) {
      return (
        <div className="filtered-event-modal-loading">
          <Space direction="vertical" align="center" size="middle">
            <Spin size="large" />
            <Text>{this.props.t("components.report-modal.loading")}</Text>
          </Space>
        </div>
      );
    }

    return (
      <Tabs
        className="report-tabs"
        activeKey={this.state.activeTab}
        onChange={this.handleTabChange}
        items={this.getTabItems()}
      />
    );
  };

  render() {
    const { open, onClose, title = "Report" } = this.props;
    if (!open) return null;

    return (
      <Wrapper>
        <Modal
          open={open}
          onCancel={onClose}
          afterOpenChange={this.handleModalOpenChange}
          footer={null}
          title={title}
          width="95vw"
          getContainer={false}
          forceRender
        >
          {this.renderModalContent()}
        </Modal>
      </Wrapper>
    );
  }
}

ReportModal.defaultProps = {
  initialTab: FILTERED_EVENT_MODAL_TABS.ALTERATION,
};

export default withTranslation("common")(ReportModal);
