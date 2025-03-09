import React, { Component } from "react";
import { withTranslation } from "react-i18next";
import { connect } from "react-redux";
import { Row, Col, Skeleton, Image } from "antd";
import { GiBubbles } from "react-icons/gi";
import DensityPlotPanel from "../../components/densityPlotPanel";
import DistributionPlotPanel from "../../components/distributionPlotPanel";
import ErrorPanel from "../../components/errorPanel";
import Wrapper from "./index.style";

class SageQcTab extends Component {
  render() {
    const { t, loading, error, dataPoints, metadata, dataset, id } = this.props;

    return (
      <Wrapper>
        {error ? (
          <ErrorPanel
            avatar={<GiBubbles />}
            header={t("tabs.sageQc.header")}
            title={t("tabs.sageQc.error.title", {
              id: metadata.pair,
            })}
            subtitle={t("tabs.sageQc.error.subtitle")}
            explanationTitle={t("tabs.sageQc.error.explanation.title")}
            explanationDescription={error.stack}
          />
        ) : (
          <Skeleton active loading={loading}>
            <Row
              className="ant-panel-container ant-home-plot-container"
              gutter={16}
            >
              <Col className="gutter-row" span={24}>
                <DensityPlotPanel
                  dataPoints={dataPoints}
                  xTitle={t("components.variantQc-panel.x-title")}
                  xVariable="tumor_vaf"
                  xRange={[0, 1]}
                  xFormat=".0%"
                  yTitle={t("components.variantQc-panel.y-title")}
                  yVariable="tumor_abq"
                  yFormat=".0f"
                  yRange={[0, 50]}
                  title={t("components.variantQc-panel.title")}
                  colorVariable="tumor_depth"
                />
              </Col>
            </Row>
            <Row
              className="ant-panel-container ant-home-plot-container"
              gutter={16}
            >
              <Col className="gutter-row" span={24}>
                <DistributionPlotPanel
                  dataPoints={dataPoints}
                  xTitle={t("components.sageQc-panel.x-title")}
                  xVariable="tumor_vaf"
                  xRange={[0, 1]}
                  xFormat=".0%"
                  yTitle={t("components.sageQc-panel.y-title")}
                  yVariable="tumor_alt_counts"
                  yFormat=".0f"
                  yRange={[0, 40]}
                  title={t("components.sageQc-panel.title")}
                  colorVariable="tumor_abq"
                />
              </Col>
            </Row>
            <Row
              className="ant-panel-container ant-home-plot-container"
              gutter={16}
            >
              <Col className="gutter-row" span={12}>
                <Image
                  src={`${dataset.dataPath}${id}/coverage_cn_boxplot_original.png`}
                  fallback="https://placehold.co/600x400?text=Coverage+cn+boxplot+original+not+found"
                />
              </Col>
              <Col className="gutter-row" span={12}>
                <Image
                  src={`${dataset.dataPath}${id}/coverage_cn_boxplot_denoised.png`}
                  fallback="https://placehold.co/600x400?text=Coverage+cn+boxplot+denoised+not+found"
                />
              </Col>
            </Row>
          </Skeleton>
        )}
      </Wrapper>
    );
  }
}
SageQcTab.propTypes = {};
SageQcTab.defaultProps = {};
const mapDispatchToProps = (dispatch) => ({});
const mapStateToProps = (state) => ({
  loading: state.SageQc.loading,
  metadata: state.CaseReport.metadata,
  dataPoints: state.SageQc.records,
  error: state.SageQc.error,
  dataset: state.Settings.dataset,
  id: state.CaseReport.id,
});
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(withTranslation("common")(SageQcTab));
