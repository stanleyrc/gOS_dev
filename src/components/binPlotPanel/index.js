import React, { Component } from "react";
import { PropTypes } from "prop-types";
import { connect } from "react-redux";
import ContainerDimensions from "react-container-dimensions";
import handleViewport from "react-in-viewport";
import { Card, Space, Tooltip, Button, message, Row, Col } from "antd";
import { withTranslation } from "react-i18next";
import { AiOutlineDownload } from "react-icons/ai";
import { GiHistogram } from "react-icons/gi";
import {
  downloadCanvasAsPng,
  transitionStyle,
  locationToDomains,
  isNumeric,
} from "../../helpers/utility";
import * as htmlToImage from "html-to-image";
import * as d3 from "d3";
import Wrapper from "./index.style";
import BinPlot from "../binPlot";
import TracksModal from "../tracksModal";
import { CgArrowsBreakeH } from "react-icons/cg";
import ErrorPanel from "../../components/errorPanel";
import settingsActions from "../../redux/settings/actions";

const { updateDomains } = settingsActions;

const margins = {
  padding: 0,
  gap: 0,
};

class BinPlotPanel extends Component {
  container = null;

  state = {
    segment: null,
    open: false,
  };

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

  handleSelectSegment = (segment) => {
    const { chromoBins, updateDomains } = this.props;
    let location = `${segment.chromosome}:${segment.startPoint}-${segment.chromosome}:${segment.endPoint}`;
    let domains = locationToDomains(chromoBins, location);
    domains = domains.map((d) => [
      Math.floor((19 * d[0] - d[1]) / 18),
      Math.floor((19 * d[1] - d[0]) / 18),
    ]);
    this.setState({ segment, domains, open: true }, () =>
      updateDomains(domains)
    );
  };

  handleModalOKClicked = () => {
    this.setState({ open: false });
  };

  handleModalCancelClicked = () => {
    this.setState({ open: false });
  };

  render() {
    const {
      t,
      loading,
      id,
      genomeCoverage,
      methylationBetaCoverage,
      methylationIntensityCoverage,
      hetsnps,
      genes,
      igv,
      inViewport,
      visible,
      chromoBins,
      ppfit,
      metadata,
    } = this.props;

    const { beta, gamma, purity } = metadata;

    if (!metadata.pair || ppfit.data.intervals.length < 1) {
      return null;
    }
    const { segment, open } = this.state;
    return (
      <Wrapper visible={visible}>
        {!isNumeric(beta) || !isNumeric(gamma) ? (
          <ErrorPanel
            avatar={<CgArrowsBreakeH />}
            header={t(`components.binQc-panel.binplot.title`)}
            title={t("components.binQc-panel.error.title", {
              id,
            })}
            subtitle={t("components.binQc-panel.error.subtitle")}
            explanationTitle={t(
              "components.binQc-panel.error.explanation.title"
            )}
            explanationDescription={
              <span
                dangerouslySetInnerHTML={{
                  __html: t("components.binQc-panel.missing_beta_gamma", {
                    beta: beta || "null",
                    gamma: gamma || "null",
                  }),
                }}
              />
            }
          />
        ) : (
          <Card
            style={transitionStyle(inViewport)}
            loading={loading}
            size="small"
            title={
              <Space>
                <span role="img" className="anticon anticon-dashboard">
                  <GiHistogram />
                </span>
                <span className="ant-pro-menu-item-title">
                  {t(`components.binQc-panel.binplot.title`)}
                </span>
              </Space>
            }
            extra={
              <Space>
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
            {visible && (
              <div
                className="ant-wrapper"
                ref={(elem) => (this.container = elem)}
              >
                <TracksModal
                  {...{
                    loading,
                    genome: ppfit,
                    genomeCoverage,
                    methylationBetaCoverage,
                    methylationIntensityCoverage,
                    hetsnps,
                    genes,
                    igv,
                    chromoBins,
                    modalTitleText: `sequence-${segment?.iid}`,
                    modalTitle: (
                      <span
                        dangerouslySetInnerHTML={{
                          __html: t("components.binQc-panel.modal-title", {
                            iid: segment?.iid,
                            chromosome: segment?.chromosome,
                            width: d3.format(",")(segment?.width),
                            mean: segment?.mean,
                          }),
                        }}
                      />
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
                      "components.tracks-modal.hetsnp-plot-count"
                    ),
                    handleOkClicked: this.handleModalOKClicked,
                    handleCancelClicked: this.handleModalCancelClicked,
                    open,
                  }}
                />
                <ContainerDimensions>
                  {({ width, height }) => {
                    return (
                      (inViewport) && (
                        <Row style={{ width }} gutter={[margins.gap, 0]}>
                          <Col flex={1}>
                            <BinPlot
                              {...{
                                width,
                                height: 600,
                                data: ppfit.data.intervals,
                                xTitle: t(
                                  `components.binQc-panel.binplot.x-title`
                                ),
                                yTitle: t(
                                  `components.binQc-panel.binplot.y-title`
                                ),
                                selectSegment: (e) =>
                                  this.handleSelectSegment(e),
                                separatorsConfig: { beta, purity },
                              }}
                            />
                          </Col>
                        </Row>
                      )
                    );
                  }}
                </ContainerDimensions>
              </div>
            )}
          </Card>
        )}
      </Wrapper>
    );
  }
}
BinPlotPanel.propTypes = {};
BinPlotPanel.defaultProps = {
  visible: true,
};
const mapDispatchToProps = (dispatch) => ({
  updateDomains: (domains) => dispatch(updateDomains(domains)),
});
const mapStateToProps = (state) => ({
  metadata: state.CaseReport.metadata,
  id: state.CaseReport.id,
  ppfit: state.Ppfit,
  chromoBins: state.Settings.chromoBins,
  genes: state.Genes,
  hetsnps: state.Hetsnps,
  genome: state.Genome,
  genomeCoverage: state.GenomeCoverage,
  mutations: state.Mutations,
  methylationBetaCoverage: state.MethylationBetaCoverage,
  methylationIntensityCoverage: state.MethylationIntensityCoverage,
  igv: state.Igv,
});
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(
  withTranslation("common")(
    handleViewport(BinPlotPanel, { rootMargin: "-1.0px" })
  )
);
