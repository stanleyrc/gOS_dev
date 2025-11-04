import React, { Component } from "react";
import { withTranslation } from "react-i18next";
import { connect } from "react-redux";
import { Row, Col, Image } from "antd";
import Wrapper from "./index.style";
import BinPlotPanel from "../../components/binPlotPanel";
import SnvplicityPlotPanel from "../../components/snvplicityPlotPanel";

class BinQcTab extends Component {
  render() {
    const { dataset, id, imagePresent, imageFile } = this.props;
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
            {imagePresent && imageFile ? (
              <Image
                src={`${dataset.dataPath}${id}/${imageFile}`}
                preview={false}
                fallback="https://placehold.co/600x400?text=Image+not+found"
              />
            ) : (
              <SnvplicityPlotPanel />
            )}
          </Col>
        </Row>
        <Row
          className="ant-panel-container ant-home-plot-container"
          gutter={16}
        >
          <Col className="gutter-row" span={12}>
            <Image
              src={`${dataset.dataPath}${id}/purple_sunrise_pp.png`}
              preview={false}
              fallback="https://placehold.co/600x400?text=Purple+Sunrise+Purity+Ploidy+not+found"
            />
          </Col>
          <Col className="gutter-row" span={12}>
            <Image
              src={`${dataset.dataPath}${id}/hetsnps_major_minor.png`}
              preview={false}
              fallback="https://placehold.co/600x400?text=Hetsnps+Major+Minor+not+found"
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
  imagePresent: state.Snvplicity.imagePresent,
  imageFile: state.Snvplicity.imageFile,
  id: state.CaseReport.id,
});
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(withTranslation("common")(BinQcTab));
