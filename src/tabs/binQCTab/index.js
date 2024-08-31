import React, { Component } from "react";
import { withTranslation } from "react-i18next";
import { connect } from "react-redux";
import { Row, Col, Image } from "antd";
import Wrapper from "./index.style";
import BinPlotPanel from "../../components/binPlotPanel";

class BinQcTab extends Component {
  render() {
    const { metadata } = this.props;

    return (
      <Wrapper>
        <Row
          className="ant-panel-container ant-home-plot-container"
          gutter={16}
        >
          <Col className="gutter-row" span={24}>
            <BinPlotPanel />
          </Col>
        </Row>

        <Row
          className="ant-panel-container ant-home-plot-container"
          gutter={16}
        >
          <Col className="gutter-row" span={12}>
            <Image height={722} src={`data/${metadata.pair}/ppfit.png`} />
          </Col>
        </Row>
      </Wrapper>
    );
  }
}
BinQcTab.propTypes = {};
BinQcTab.defaultProps = {};
const mapDispatchToProps = (dispatch) => ({});
const mapStateToProps = (state) => ({
  metadata: state.CaseReport.metadata,
});
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(withTranslation("common")(BinQcTab));
