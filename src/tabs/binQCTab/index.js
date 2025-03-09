import React, { Component } from "react";
import { withTranslation } from "react-i18next";
import { connect } from "react-redux";
import { Row, Col, Image } from "antd";
import Wrapper from "./index.style";
import BinPlotPanel from "../../components/binPlotPanel";
import SnvplicityPlotPanel from "../../components/snvplicityPlotPanel";

class BinQcTab extends Component {
  render() {
    const { dataset, id } = this.props;
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
          <Col className="gutter-row" span={24}>
            <SnvplicityPlotPanel />
          </Col>
        </Row>
        <Row
          className="ant-panel-container ant-home-plot-container"
          gutter={16}
        >
          <Col className="gutter-row" span={12}>
            <Image src={`${dataset.dataPath}${id}/purple_sunrise_pp.png`} />
          </Col>
          <Col className="gutter-row" span={12}>
            <Image
              src={`${dataset.dataPath}${id}/purple_sunrise_beta_gamma.png`}
            />
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
  dataset: state.Settings.dataset,
  id: state.CaseReport.id,
});
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(withTranslation("common")(BinQcTab));
