import React, { useState } from "react";
import { Modal, Tabs, Alert } from "antd";
import Wrapper from "./index.style";

import TracksModal from "../tracksModal";
import AlterationCard from "../alterationCard";
import { withTranslation } from "react-i18next";


function ReportModal({
  open,
  onClose,
  src,
  title = "Report",
  // data for plots
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
  // optional: focus on a specific variant
  selectedVariantId,
  showVariants,
  // i18n
  t,
  record,
}) {
  const [activeTab, setActiveTab] = useState("alteration");

  const mainTab = {
    key: "alteration",
    label: "Alteration",
    children: record ? (
      <AlterationCard record={record} />
    ) : (
      <Alert type="info" message="No alteration selected" showIcon />
    ),
  };

  return (
    <Wrapper>
      <Modal
        open={open}
        onCancel={onClose}
        footer={null}
        title={title}
        width="95vw"
        getContainer={false}
      >
        <Tabs
          className="report-tabs"
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            mainTab,
            {
              key: "plots",
              label: "Plots",
              children: (
                <div className="plots-container">
                  <TracksModal
                    {...{
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
                      genomePlotYAxisTitle: t(
                        "components.tracks-modal.genome-y-axis-title"
                      ),
                      coveragePlotTitle: t("components.tracks-modal.coverage-plot"),
                      coverageYAxisTitle: t(
                        "components.tracks-modal.coverage-y-axis-title"
                      ),
                      coverageYAxis2Title: t(
                        "components.tracks-modal.coverage-y-axis2-title"
                      ),
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
                      hetsnpPlotYAxisTitle: t(
                        "components.tracks-modal.hetsnp-plot-y-axis-title"
                      ),
                      hetsnpPlotYAxis2Title: t(
                        "components.tracks-modal.hetsnp-plot-y-axis2-title"
                      ),
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
                      showVariants: showVariants ?? !!selectedVariantId,
                      selectedVariantId,
                    }}
                  />
                </div>
              ),
            },
          ]}
        />
      </Modal>
    </Wrapper>
  );
}
export default withTranslation("common")(ReportModal);
