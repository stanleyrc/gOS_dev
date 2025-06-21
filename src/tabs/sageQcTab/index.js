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
    xVariable: densityPlotFields[0],
    yVariable: densityPlotFields[1],
    colorVariable: densityPlotFields[2],
  };

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
                          <Option key={d} value={d}>
                            {t(`components.sageQc-panel.${d}`)}
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
                  dataPoints={dataPoints}
                  xTitle={t("components.sageQc-panel.x-title", {
                    value: t(`components.sageQc-panel.${this.state.xVariable}`),
                  })}
                  xVariable={this.state.xVariable}
                  xFormat=".2f"
                  yTitle={t("components.sageQc-panel.y-title", {
                    value: t(`components.sageQc-panel.${this.state.yVariable}`),
                  })}
                  yVariable={this.state.yVariable}
                  yFormat=".2f"
                  title={t("components.sageQc-panel.title")}
                  colorVariable={this.state.colorVariable}
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
