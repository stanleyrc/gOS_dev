import React, { Component } from "react";
import { PropTypes } from "prop-types";
import { connect } from "react-redux";
import ContainerDimensions from "react-container-dimensions";
import handleViewport from "react-in-viewport";
import {
  Card,
  Space,
  Tooltip,
  Button,
  message,
  Row,
  Col,
  Segmented,
  Progress,
  Skeleton,
  Tag,
} from "antd";
import { withTranslation } from "react-i18next";
import { AiOutlineDownload } from "react-icons/ai";
import { GiBubbles } from "react-icons/gi";
import { downloadCanvasAsPng, transitionStyle } from "../../helpers/utility";
import { densityPlotTypes } from "../../helpers/sageQc";
import * as htmlToImage from "html-to-image";
import Wrapper from "./index.style";
import DensityPlot from "../densityPlot";
import TracksModal from "../tracksModal";
import sageQcActions from "../../redux/sageQc/actions";

const { selectVariant } = sageQcActions;

const margins = {
  padding: 0,
  gap: 0,
};

class DensityPlotPanel extends Component {
  container = null;

  state = { plotType: densityPlotTypes[0] };

  onDownloadButtonClicked = () => {
    htmlToImage
      .toCanvas(this.container, { pixelRatio: 2 })
      .then((canvas) => {
        downloadCanvasAsPng(
          canvas,
          `${this.props.title.replace(/\s+/g, "_").toLowerCase()}.png`
        );
      })
      .catch((error) => {
        message.error(this.props.t("general.error", { error }));
      });
  };

  handlePlotTypeSelectionChange = (plotType) => {
    this.setState({ plotType });
  };

  render() {
    const {
      t,
      loading,
      loadingPercentage,
      dataPoints,
      xTitle,
      xVariable,
      xRange,
      xFormat,
      yTitle,
      yVariable,
      yRange,
      yFormat,
      title,
      inViewport,
      renderOutsideViewPort,
      visible,
      colorVariable,
      colorFormat,
      colorVariableType,
      selectedVariant,
      selectVariant,
      genome,
      mutations,
      allelic,
      chromoBins,
      genomeCoverage,
      methylationBetaCoverage,
      methylationIntensityCoverage,
      hetsnps,
      genes,
      igv,
    } = this.props;

    const { plotType } = this.state;
    let open = selectedVariant?.id;

    return (
      <Wrapper visible={visible}>
        <Card
          style={transitionStyle(inViewport || renderOutsideViewPort)}
          size="small"
          title={
            <Space>
              <span role="img" className="anticon anticon-dashboard">
                <GiBubbles />
              </span>
              <span className="ant-pro-menu-item-title">{title}</span>
            </Space>
          }
          extra={
            <Space>
              <span>{t(`components.variantQc-panel.plot-label`)}</span>
              <Segmented
                size="small"
                options={densityPlotTypes.map((d) => {
                  return {
                    value: d,
                    label: t(`components.variantQc-panel.${d}`),
                  };
                })}
                value={plotType}
                onChange={this.handlePlotTypeSelectionChange}
              />
              <Tooltip title={t("components.download-as-png-tooltip")}>
                <Button
                  type="default"
                  shape="circle"
                  disabled={!visible}
                  icon={<AiOutlineDownload style={{ marginTop: 4 }} />}
                  size="small"
                  onClick={() => this.onDownloadButtonClicked()}
                />
              </Tooltip>
            </Space>
          }
        >
          {loading ? (
            loadingPercentage ? (
              <Progress percent={loadingPercentage} />
            ) : (
              <Skeleton loading={loading} active />
            )
          ) : (
            visible && (
              <div
                className="ant-wrapper"
                ref={(elem) => (this.container = elem)}
              >
                <ContainerDimensions>
                  {({ width, height }) => {
                    return (
                      (inViewport || renderOutsideViewPort) && (
                        <Row style={{ width }} gutter={[margins.gap, 0]}>
                          <Col flex={1}>
                            <DensityPlot
                              {...{
                                width,
                                height,
                                dataPoints,
                                xTitle,
                                xVariable,
                                xFormat,
                                yTitle,
                                yVariable,
                                yFormat,
                                xRange,
                                yRange,
                                plotType,
                                colorVariable,
                                colorFormat,
                                colorVariableType,
                                handlePointClicked: selectVariant,
                              }}
                            />
                          </Col>
                        </Row>
                      )
                    );
                  }}
                </ContainerDimensions>
                {selectedVariant && (
                  <TracksModal
                    {...{
                      loading,
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
                      modalTitleText: selectedVariant.id,
                      modalTitle: (
                        <Space>
                          {t("components.sageQc-panel.variantId", {
                            id: selectedVariant.id,
                          })}
                          {selectedVariant.actualLocation}
                          {selectedVariant.gene}
                          {selectedVariant.oncogenicity && (
                            <Tag color="error">
                              {t("components.sageQc-panel.oncogenicity")}
                            </Tag>
                          )}
                        </Space>
                      ),
                      genomePlotTitle: t("components.tracks-modal.genome-plot"),
                      genomePlotYAxisTitle: t(
                        "components.tracks-modal.genome-y-axis-title"
                      ),
                      coveragePlotTitle: t(
                        "components.tracks-modal.coverage-plot"
                      ),
                      coverageYAxisTitle: t(
                        "components.tracks-modal.coverage-copy-number"
                      ),
                      coverageYAxis2Title: t(
                        "components.tracks-modal.coverage-count"
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
                        "components.tracks-modal.hetsnp-copy-number"
                      ),
                      hetsnpPlotYAxis2Title: t(
                        "components.tracks-modal.hetsnp-count"
                      ),
                      mutationsPlotTitle: t(
                        "components.tracks-modal.mutations-plot"
                      ),
                      mutationsPlotYAxisTitle: t(
                        "components.tracks-modal.mutations-plot-y-axis-title"
                      ),
                      allelicPlotTitle: t(
                        "components.tracks-modal.allelic-plot"
                      ),
                      allelicPlotYAxisTitle: t(
                        "components.tracks-modal.allelic-plot-y-axis-title"
                      ),
                      handleOkClicked: () => selectVariant(null),
                      handleCancelClicked: () => selectVariant(null),
                      open,
                    }}
                  />
                )}
              </div>
            )
          )}
        </Card>
      </Wrapper>
    );
  }
}
DensityPlotPanel.propTypes = {};
DensityPlotPanel.defaultProps = {
  visible: true,
};
const mapDispatchToProps = (dispatch) => ({
  selectVariant: (variant, viewMode) =>
    dispatch(selectVariant(variant, viewMode)),
});
const mapStateToProps = (state) => ({
  renderOutsideViewPort: state.App.renderOutsideViewPort,
  selectedVariant: state.SageQc.selectedVariant,
  genome: state.Genome,
  mutations: state.Mutations,
  allelic: state.Allelic,
  chromoBins: state.Settings.chromoBins,
  genomeCoverage: state.GenomeCoverage,
  methylationBetaCoverage: state.MethylationBetaCoverage,
  methylationIntensityCoverage: state.MethylationIntensityCoverage,
  hetsnps: state.Hetsnps,
  genes: state.Genes,
  igv: state.Igv,
});
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(
  withTranslation("common")(
    handleViewport(DensityPlotPanel, { rootMargin: "-1.0px" })
  )
);
