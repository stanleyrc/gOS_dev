import React, { Component } from "react";
import { withTranslation } from "react-i18next";
import { connect } from "react-redux";
import { Row, Col } from "antd";
import DensityPlotPanel from "../densityPlotPanel";
import DistributionPlotPanel from "../distributionPlotPanel";
import Wrapper from "./index.style";

class QcTab extends Component {
  render() {
    const { t, variants, sages } = this.props;
    return (
      <Wrapper>
        <Row
          className="ant-panel-container ant-home-plot-container"
          gutter={16}
        >
          <Col className="gutter-row" span={24}>
            <DensityPlotPanel
              dataPoints={variants}
              xTitle={t("components.variantQc-panel.x-title")}
              xVariable="tumor_VAF"
              xRange={[0, 1]}
              xFormat=".0%"
              yTitle={t("components.variantQc-panel.y-title")}
              yVariable="somatic_EVS"
              yFormat=".0f"
              yRange={[0, 22]}
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
              dataPoints={sages}
              xTitle={t("components.sageQc-panel.x-title")}
              xVariable="tumor_VAF"
              xRange={[0, 1]}
              xFormat=".0%"
              yTitle={t("components.sageQc-panel.y-title")}
              yVariable="tumor_alt_counts"
              yFormat=".0f"
              yRange={[0, 40]}
              title={t("components.sageQc-panel.title")}
              colorVariable="tumor_Average_calculated_Base_Quality"
            />
          </Col>
        </Row>
      </Wrapper>
    );
  }
}
QcTab.propTypes = {};
QcTab.defaultProps = {
  variants: [],
  sages: [],
};
const mapDispatchToProps = (dispatch) => ({});
const mapStateToProps = (state) => ({});
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(withTranslation("common")(QcTab));
