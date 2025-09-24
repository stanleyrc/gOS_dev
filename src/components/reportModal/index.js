import React, { useEffect, useState, useRef } from "react";
import { Modal, Spin, Alert, Tabs } from "antd";
import Wrapper from "./index.style";

import TracksModal from "../tracksModal";
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
}) {
  const [reportLoading, setReportLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("report");

  const iframeRef = useRef(null);
  const anchorTimersRef = useRef([]);

  const applyAnchor = (hashOverride) => {
    const el = iframeRef.current;
    if (!el) return;
    try {
      const cw = el.contentWindow;
      const doc = cw?.document;
      if (!doc) return;

      const rawHash =
        hashOverride ??
        (cw?.location?.hash ? cw.location.hash.slice(1) : null) ??
        (typeof src === "string" && src.includes("#")
          ? src.split("#")[1]
          : null);

      if (!rawHash) return;

      const anchor = decodeURIComponent(rawHash.replace(/^#+/, "")).trim();
      const target =
        doc.getElementById(anchor) || doc.getElementsByName(anchor)?.[0];

      if (target && typeof target.scrollIntoView === "function") {
        target.scrollIntoView({
          block: "start",
          inline: "nearest",
          behavior: "auto",
        });
      } else if (cw && typeof cw.location !== "undefined") {
        cw.location.hash = `#${anchor}`;
      }
    } catch (_) {
      // ignore cross-origin issues
    }
  };

  const scheduleAnchorApply = () => {
    const el = iframeRef.current;
    if (!el) return;

    let hash = null;
    if (typeof src === "string" && src.includes("#")) {
      hash = src.split("#")[1];
    } else {
      try {
        hash = el.contentWindow?.location?.hash?.slice(1) || null;
      } catch (_) {}
    }
    if (!hash) return;

    // clear previous timers
    anchorTimersRef.current.forEach(clearTimeout);
    anchorTimersRef.current = [];

    // try multiple times to catch post-load DOM changes/reordering
    [0, 150, 300].forEach((delay) => {
      anchorTimersRef.current.push(
        setTimeout(() => applyAnchor(hash), delay)
      );
    });
  };

  const handleIframeLoad = () => {
    scheduleAnchorApply();
  };

  useEffect(() => {
    let aborted = false;
    if (!open || !src) return;

    setReportLoading(true);
    setError(null);

    fetch(src, { method: "HEAD" })
      .then((res) => {
        if (aborted) return;
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setReportLoading(false);
      })
      .catch((e) => {
        if (aborted) return;
        setError(e.message || "Failed to load report");
        setReportLoading(false);
      });

    return () => {
      aborted = true;
      anchorTimersRef.current.forEach(clearTimeout);
      anchorTimersRef.current = [];
    };
  }, [open, src]);

  useEffect(() => {
    if (!open) setActiveTab("report");
  }, [open]);

  useEffect(() => {
    if (open && activeTab === "report" && !reportLoading && !error) {
      const id = setTimeout(() => {
        scheduleAnchorApply();
      }, 0);
      return () => clearTimeout(id);
    }
  }, [open, activeTab, reportLoading, error]);

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
            {
              key: "report",
              label: "Report",
              children: error ? (
                <Alert
                  type="error"
                  message="Unable to load report.html"
                  description={error}
                  showIcon
                />
              ) : (
                <div className="report-container">
                  {reportLoading && <div className="report-loading"><Spin /></div>}
                  {!reportLoading && (
                    <iframe
                      ref={iframeRef}
                      tabIndex={-1}
                      onLoad={handleIframeLoad}
                      title="report"
                      src={src}
                      className="report-iframe"
                      sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals allow-downloads"
                    />
                  )}
                </div>
              ),
            },
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
                    // focus on the selected variant when provided (detail view)
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
