import React, { Component } from "react";
import { withTranslation } from "react-i18next";
import { connect } from "react-redux";
import { Row, Col, Image, Space, Select } from "antd";
import { GiBubbles } from "react-icons/gi";
import DensityPlotPanel from "../../components/densityPlotPanel";
import { densityPlotVariables } from "../../helpers/sageQc";
import ErrorPanel from "../../components/errorPanel";
import Wrapper from "./index.style";

const { Option } = Select;

class SageQcTab extends Component {
  constructor(props) {
    super(props);
    this.state = {
      xVariable: null,
      yVariable: null,
      colorVariable: null,
    };
  }

  render() {
    const {
      t,
      loading,
      loadingPercentage,
      error,
      dataPoints,
      sageQcFields,
      metadata,
      dataset,
      id,
    } = this.props;

    let variables = {};
    densityPlotVariables.forEach(
      (x, i) =>
        (variables[`${x}`] = this.state[`${x}`] || sageQcFields[i]?.name)
    );
    return (
      <Wrapper>
        {error ? (
          <ErrorPanel
            avatar={<GiBubbles />}
            header={t("components.sageQc.header")}
            title={t("components.sageQc.error.title", {
              id: metadata.pair,
            })}
            subtitle={t("components.sageQc.error.subtitle")}
            explanationTitle={t("components.sageQc.error.explanation.title")}
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
                  {densityPlotVariables.map((variable, i) => (
                    <>
                      {t(`components.sageQc-panel.${variable}`)}:
                      <Select
                        className="variables-select"
                        value={variables[`${variable}`]}
                        size="small"
                        style={{ width: 250 }}
                        onSelect={(field) => {
                          this.setState({
                            [`${variable}`]: field,
                          });
                        }}
                      >
                        {sageQcFields.map((d) => (
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
                    value: t(`components.sageQc-panel.${variables.xVariable}`),
                  })}
                  xVariable={variables.xVariable}
                  xFormat={
                    sageQcFields.find((d) => d.name === variables.xVariable)
                      ?.format
                  }
                  yTitle={t("components.sageQc-panel.y-title", {
                    value: t(`components.sageQc-panel.${variables.yVariable}`),
                  })}
                  yVariable={variables.yVariable}
                  yFormat={
                    sageQcFields.find((d) => d.name === variables.yVariable)
                      ?.format
                  }
                  title={t("components.sageQc-panel.title")}
                  colorVariable={variables.colorVariable}
                  colorFormat={
                    sageQcFields.find((d) => d.name === variables.colorVariable)
                      ?.format
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
  sageQcFields: state.SageQc.properties,
  error: state.SageQc.error,
  dataset: state.Settings.dataset,
  id: state.CaseReport.id,
});
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(withTranslation("common")(SageQcTab));
