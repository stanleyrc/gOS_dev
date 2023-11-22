import React, { Component } from "react";
import { withTranslation } from "react-i18next";
import { connect } from "react-redux";
import { Row, Col } from "antd";
import DensityPlotPanel from "../../components/densityPlotPanel";
import Wrapper from "./index.style";
import BinPlotPanel from "../binPlotPanel";

class VariantQcTab extends Component {
  render() {
    const { t, variants, fits, imageBlob } = this.props;
    return (
      <Wrapper>
        <Row
          className="ant-panel-container ant-home-plot-container"
          gutter={16}
        >
          <Col className="gutter-row" span={12}>
            <DensityPlotPanel
              dataPoints={variants}
              xTitle={t("components.variantQc-panel.x-title")}
              xVariable="VAF_T"
              xRange={[0, 1]}
              xFormat=".0%"
              yTitle={t("components.variantQc-panel.y-title")}
              yVariable="somatic_EVS"
              yFormat=".0f"
              yRange={[0, 22]}
              title={t("components.variantQc-panel.title")}
              colorVariable="T_DP"
            />
          </Col>
          <Col className="gutter-row" span={12}>
            <BinPlotPanel
              {...{
                data: fits,
                title: t(`components.variantQc-panel.binplot.title`),
                xTitle: t(`components.variantQc-panel.binplot.x-title`),
                yTitle: t(`components.variantQc-panel.binplot.y-title`),
              }}
            />
          </Col>
        </Row>
        <Row
          className="ant-panel-container ant-home-plot-container"
          gutter={16}
        >
          <Col className="gutter-row" span={12}>
            {imageBlob && (
              <img
                src={URL.createObjectURL(imageBlob)}
                alt="ppFit"
                height={722}
              />
            )}
          </Col>
        </Row>
      </Wrapper>
    );
  }
}
VariantQcTab.propTypes = {};
VariantQcTab.defaultProps = {};
const mapDispatchToProps = (dispatch) => ({});
const mapStateToProps = (state) => ({});
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(withTranslation("common")(VariantQcTab));
