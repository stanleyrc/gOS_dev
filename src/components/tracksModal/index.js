import React, { Component } from "react";
import { PropTypes } from "prop-types";
import { connect } from "react-redux";
import handleViewport from "react-in-viewport";
import { Row, Col, Modal, message, Space, Button, Affix } from "antd";
import { withTranslation } from "react-i18next";
import GenomePanel from "../genomePanel";
import ScatterPlotPanel from "../scatterPlotPanel";
import IgvPanel from "../igvPanel/index";
import appActions from "../../redux/app/actions";
import TracksLegendPanel from "../tracksLegendPanel";
import { AiOutlineDownload } from "react-icons/ai";
import * as htmlToImage from "html-to-image";
import {
  transitionStyle,
  downloadCanvasAsPng,
  dataRanges,
} from "../../helpers/utility";
import Wrapper from "./index.style";

const { updateHoveredLocation } = appActions;

class TracksModal extends Component {
  container = null;

  state = {
    yScaleMode: "common",
  };

  onDownloadButtonClicked = () => {
    htmlToImage
      .toCanvas(this.container, { pixelRatio: 2 })
      .then((canvas) => {
        downloadCanvasAsPng(
          canvas,
          `${this.props.modalTitleText.replace(/\s+/g, "_").toLowerCase()}.png`
        );
      })
      .catch((error) => {
        message.error(this.props.t("general.error", { error }));
      });
  };

  handleYscaleSegmentedChange = (yScaleMode) => {
    this.setState({ yScaleMode });
  };

  render() {
    const {
      t,
      domains,
      genome,
      mutations,
      genomeCoverage,
      methylationBetaCoverage,
      methylationIntensityCoverage,
      hetsnps,
      coverageYAxisTitle,
      coverageYAxis2Title,
      methylationBetaCoveragePlotTitle,
      methylationBetaCoverageYAxisTitle,
      methylationBetaCoverageYAxis2Title,
      methylationIntensityCoveragePlotTitle,
      methylationIntensityCoverageYAxisTitle,
      methylationIntensityCoverageYAxis2Title,
      metadata,
      genes,
      allelic,
      igv,
      inViewport,
      renderOutsideViewPort,
      chromoBins,
      modalTitle,
      genomePlotTitle,
      genomePlotYAxisTitle,
      mutationsPlotTitle,
      mutationsPlotYAxisTitle,
      coveragePlotTitle,
      hetsnpPlotTitle,
      hetsnpPlotYAxisTitle,
      hetsnpPlotYAxis2Title,
      allelicPlotTitle,
      allelicPlotYAxisTitle,
      handleOkClicked,
      handleCancelClicked,
      width,
      height,
      open,
      viewType,
      legendPanelPinned,
    } = this.props;

    if (!open) return null;
    const {
      cov_slope,
      cov_intercept,
      hets_slope,
      hets_intercept,
      methylation_intensity_cov_slope,
      methylation_intensity_cov_intercept,
      methylation_beta_cov_slope,
      methylation_beta_cov_intercept,
    } = metadata;

    console.log(metadata);
    const { yScaleMode } = this.state;

    let commonRangeY =
      yScaleMode === "common" ? dataRanges(domains, genome.data) : null;

    let tracksLegend = (
      <TracksLegendPanel
        {...{
          loading: genes.loading,
          genesList: genes.list,
          error: genes.error,
          chromoBins,
          visible: true,
          height,
          handleSegmentedChange: this.handleYscaleSegmentedChange,
        }}
      />
    );
    let content = (
      <Row
        style={transitionStyle(inViewport || renderOutsideViewPort)}
        className="ant-panel-container ant-home-plot-container"
        gutter={[16, 24]}
      >
        <Col className="gutter-row" span={24}>
          {legendPanelPinned ? (
            <Affix offsetTop={194}>{tracksLegend}</Affix>
          ) : (
            tracksLegend
          )}
        </Col>
        <Col className="gutter-row" span={24}>
          <GenomePanel
            {...{
              loading: genome.loading,
              genome: genome.data,
              error: genome.error,
              filename: genome.filename,
              title: genomePlotTitle,
              yAxisTitle: genomePlotYAxisTitle,
              chromoBins,
              visible: true,
              index: 0,
              height,
              commonRangeY,
            }}
          />
        </Col>
        {genomeCoverage && (
          <Col className="gutter-row" span={24}>
            <ScatterPlotPanel
              {...{
                loading: genomeCoverage.loading,
                dataPointsY1: genomeCoverage.dataPointsCopyNumber,
                dataPointsY2: genomeCoverage.dataPointsCount,
                dataPointsX: genomeCoverage.dataPointsX,
                dataPointsColor: genomeCoverage.dataPointsColor,
                error: genomeCoverage.error,
                filename: genomeCoverage.filename,
                title: coveragePlotTitle,
                notification: {
                  status:
                    cov_slope == null || cov_intercept == null
                      ? "warning"
                      : null,
                  heading:
                    cov_slope == null || cov_intercept == null
                      ? t(`components.tracks-modal.missing-counts-axis`)
                      : null,
                  messages: [
                    ...(cov_slope == null
                      ? [
                          t(`general.attributes-missing.description`, {
                            attribute: "cov_slope",
                          }),
                        ]
                      : []),
                    ...(cov_intercept == null
                      ? [
                          t(`general.attributes-missing.description`, {
                            attribute: "cov_intercept",
                          }),
                        ]
                      : []),
                  ],
                },
                chromoBins,
                visible: true,
                height,
                yAxisTitle:
                  cov_slope == null || cov_intercept == null
                    ? coverageYAxis2Title
                    : coverageYAxisTitle,
                yAxis2Title: coverageYAxis2Title,
                commonRangeY,
              }}
            />
          </Col>
        )}
        {!methylationBetaCoverage?.missing && (
          <Col className="gutter-row" span={24}>
            <ScatterPlotPanel
              {...{
                loading: methylationBetaCoverage.loading,
                dataPointsY1: methylationBetaCoverage.dataPointsCopyNumber,
                dataPointsY2: methylationBetaCoverage.dataPointsCount,
                dataPointsX: methylationBetaCoverage.dataPointsX,
                dataPointsColor: methylationBetaCoverage.dataPointsColor,
                error: methylationBetaCoverage.error,
                filename: methylationBetaCoverage.filename,
                title: methylationBetaCoveragePlotTitle,
                notification: {
                  status:
                    methylation_beta_cov_slope == null ||
                    methylation_beta_cov_intercept == null
                      ? "warning"
                      : null,
                  heading:
                    methylation_beta_cov_slope == null ||
                    methylation_beta_cov_intercept == null
                      ? t(`components.tracks-modal.missing-counts-axis`)
                      : null,
                  messages: [
                    ...(methylation_beta_cov_slope == null
                      ? [
                          t(`general.attributes-missing.description`, {
                            attribute: "methylation_beta_cov_slope",
                          }),
                        ]
                      : []),
                    ...(methylation_beta_cov_intercept == null
                      ? [
                          t(`general.attributes-missing.description`, {
                            attribute: "methylation_beta_cov_intercept",
                          }),
                        ]
                      : []),
                  ],
                },
                chromoBins,
                visible: true,
                height,
                yAxisTitle:
                  methylation_beta_cov_slope == null ||
                  methylation_beta_cov_intercept == null
                    ? methylationBetaCoverageYAxis2Title
                    : methylationBetaCoverageYAxisTitle,
                yAxis2Title: methylationBetaCoverageYAxis2Title,
                commonRangeY,
              }}
            />
          </Col>
        )}
        {!methylationIntensityCoverage.missing && (
          <Col className="gutter-row" span={24}>
            <ScatterPlotPanel
              {...{
                loading: methylationIntensityCoverage.loading,
                dataPointsY1: methylationIntensityCoverage.dataPointsCopyNumber,
                dataPointsY2: methylationIntensityCoverage.dataPointsCount,
                dataPointsX: methylationIntensityCoverage.dataPointsX,
                dataPointsColor: methylationIntensityCoverage.dataPointsColor,
                error: methylationIntensityCoverage.error,
                filename: methylationIntensityCoverage.filename,
                title: methylationIntensityCoveragePlotTitle,
                notification: {
                  status:
                    methylation_intensity_cov_slope == null ||
                    methylation_intensity_cov_intercept == null
                      ? "warning"
                      : null,
                  heading:
                    methylation_intensity_cov_slope == null ||
                    methylation_intensity_cov_intercept == null
                      ? t(`components.tracks-modal.missing-counts-axis`)
                      : null,
                  messages: [
                    ...(methylation_intensity_cov_slope == null
                      ? [
                          t(`general.attributes-missing.description`, {
                            attribute: "methylation_intensity_cov_slope",
                          }),
                        ]
                      : []),
                    ...(methylation_intensity_cov_intercept == null
                      ? [
                          t(`general.attributes-missing.description`, {
                            attribute: "methylation_intensity_cov_intercept",
                          }),
                        ]
                      : []),
                  ],
                },
                chromoBins,
                visible: true,
                height,
                yAxisTitle:
                  methylation_intensity_cov_slope == null ||
                  methylation_intensity_cov_intercept == null
                    ? methylationIntensityCoverageYAxis2Title
                    : methylationIntensityCoverageYAxisTitle,
                yAxis2Title: methylationIntensityCoverageYAxis2Title,
                commonRangeY,
              }}
            />
          </Col>
        )}
        {hetsnps && (
          <Col className="gutter-row" span={24}>
            <ScatterPlotPanel
              {...{
                loading: hetsnps.loading,
                dataPointsY1: hetsnps.dataPointsCopyNumber,
                dataPointsY2: hetsnps.dataPointsCount,
                dataPointsX: hetsnps.dataPointsX,
                dataPointsColor: hetsnps.dataPointsColor,
                error: hetsnps.error,
                filename: hetsnps.filename,
                title: hetsnpPlotTitle,
                notification: {
                  status:
                    hets_slope == null || hets_intercept == null
                      ? "warning"
                      : null,
                  heading:
                    hets_slope == null || hets_intercept == null
                      ? t(`components.tracks-modal.missing-counts-axis`)
                      : null,
                  messages: [
                    ...(hets_slope == null
                      ? [
                          t(`general.attributes-missing.description`, {
                            attribute: "hets_slope",
                          }),
                        ]
                      : []),
                    ...(hets_intercept == null
                      ? [
                          t(`general.attributes-missing.description`, {
                            attribute: "hets_intercept",
                          }),
                        ]
                      : []),
                  ],
                },
                chromoBins,
                visible: true,
                height,
                yAxisTitle:
                  hets_slope == null || hets_intercept == null
                    ? hetsnpPlotYAxis2Title
                    : hetsnpPlotYAxisTitle,
                yAxis2Title: hetsnpPlotYAxis2Title,
                commonRangeY,
              }}
            />
          </Col>
        )}
        {allelic && (
          <Col className="gutter-row" span={24}>
            <GenomePanel
              {...{
                loading: allelic.loading,
                genome: allelic.data,
                error: allelic.error,
                filename: allelic.filename,
                title: allelicPlotTitle,
                yAxisTitle: allelicPlotYAxisTitle,
                chromoBins,
                visible: true,
                index: 0,
                height,
                commonRangeY,
              }}
            />
          </Col>
        )}
        {!mutations.missing && (
          <Col className="gutter-row" span={24}>
            <GenomePanel
              {...{
                loading: mutations.loading,
                loadingPercentage: mutations.loadingPercentage,
                genome: mutations.data,
                error: mutations.error,
                filename: mutations.filename,
                title: mutationsPlotTitle,
                yAxisTitle: mutationsPlotYAxisTitle,
                chromoBins,
                visible: true,
                index: 0,
                height,
                mutationsPlot: true,
                commonRangeY,
              }}
            />
          </Col>
        )}
        {(igv.filenameTumorPresent || igv.filenameNormalPresent) && (
          <Col className="gutter-row" span={24}>
            <IgvPanel
              {...{
                loading: igv.loading,
                error: igv.error,
                missingFiles: igv.missingFiles,
                filenameTumorPresent: igv.filenameTumorPresent,
                filenameNormalPresent: igv.filenameNormalPresent,
                filenameTumor: igv.filenameTumor,
                filenameTumorIndex: igv.filenameTumorIndex,
                filenameNormal: igv.filenameNormal,
                filenameNormalIndex: igv.filenameNormalIndex,
                format: igv.format,
              }}
            />
          </Col>
        )}
      </Row>
    );
    return (
      <Wrapper visible={open}>
        {viewType === "modal" ? (
          <Modal
            title={
              <Space>
                {modalTitle}
                <Button
                  type="default"
                  shape="circle"
                  icon={<AiOutlineDownload />}
                  size="small"
                  onClick={() => this.onDownloadButtonClicked()}
                />
              </Space>
            }
            centered
            open={open}
            onOk={handleOkClicked}
            onCancel={handleCancelClicked}
            width={width}
            footer={null}
            forceRender={true}
          >
            <div ref={(elem) => (this.container = elem)}>{content}</div>
          </Modal>
        ) : (
          <div style={{ height: `${height}px; width: ${width}px` }}>
            {content}
          </div>
        )}
      </Wrapper>
    );
  }
}
TracksModal.propTypes = {
  data: PropTypes.array,
};
TracksModal.defaultProps = {
  width: 1800,
  height: 200,
  viewType: "modal",
  legendPanelPinned: false,
};
const mapDispatchToProps = (dispatch) => ({
  updateHoveredLocation: (hoveredLocation, panelIndex) =>
    dispatch(updateHoveredLocation(hoveredLocation, panelIndex)),
});
const mapStateToProps = (state) => ({
  renderOutsideViewPort: state.App.renderOutsideViewPort,
  domains: state.Settings.domains,
  metadata: state.CaseReport.metadata,
  chromoBins: state.Settings.chromoBins,
});
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(
  withTranslation("common")(
    handleViewport(TracksModal, { rootMargin: "-1.0px" })
  )
);
