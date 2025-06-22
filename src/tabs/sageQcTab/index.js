import React, { Component } from "react";
import { withTranslation } from "react-i18next";
import { connect } from "react-redux";
import { Row, Col, Skeleton, Image, Space, Select } from "antd";
import { GiBubbles } from "react-icons/gi";
import DensityPlotPanel from "../../components/densityPlotPanel";
import { densityPlotFields, densityPlotVariables } from "../../helpers/sageQc";
import DistributionPlotPanel from "../../components/distributionPlotPanel";
import ErrorPanel from "../../components/errorPanel";
import Wrapper from "./index.style";

const { Option } = Select;

class SageQcTab extends Component {
  state = {
    xVariable: densityPlotFields[0].name,
    yVariable: densityPlotFields[1].name,
    colorVariable: densityPlotFields[2].name,
  };

  render() {
    const {
      t,
      loading,
      loadingPercentage,
      error,
      dataPoints,
      metadata,
      dataset,
      id,
    } = this.props;

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
          <>
            <Row
              className="ant-panel-container ant-home-plot-container"
              gutter={16}
            >
              <Col className="gutter-row" span={24}>
                <Space>
                  {densityPlotVariables.map((variable) => (
                    <>
                      {t(`components.sageQc-panel.${variable}`)}:
                      <Select
                        className="variables-select"
                        value={this.state[variable]}
                        size="small"
                        style={{ width: 250 }}
                        onSelect={(field) => {
                          this.setState({
                            [`${variable}`]: field,
                          });
                        }}
                      >
                        {densityPlotFields.map((d) => (
                          <Option key={d.name} value={d.name}>
                            {t(`components.sageQc-panel.${d.name}`)}
                          </Option>
                        ))}
                      </Select>
                    </>
                  ))}
                </Space>
              </Col>
            </Row>
            <Row
              className="ant-panel-container ant-home-plot-container"
              gutter={16}
            >
              <Col className="gutter-row" span={24}>
                <DensityPlotPanel
                  loading={loading}
                  loadingPercentage={loadingPercentage}
                  dataPoints={dataPoints}
                  xTitle={t("components.sageQc-panel.x-title", {
                    value: t(`components.sageQc-panel.${this.state.xVariable}`),
                  })}
                  xVariable={this.state.xVariable}
                  xFormat={
                    densityPlotFields.find(
                      (d) => d.name === this.state.xVariable
                    ).format
                  }
                  yTitle={t("components.sageQc-panel.y-title", {
                    value: t(`components.sageQc-panel.${this.state.yVariable}`),
                  })}
                  yVariable={this.state.yVariable}
                  yFormat={
                    densityPlotFields.find(
                      (d) => d.name === this.state.yVariable
                    ).format
                  }
                  title={t("components.sageQc-panel.title")}
                  colorVariable={this.state.colorVariable}
                  colorFormat={
                    densityPlotFields.find(
                      (d) => d.name === this.state.colorVariable
                    ).format
                  }
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
          </>
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
  loadingPercentage: state.SageQc.loadingPercentage,
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
