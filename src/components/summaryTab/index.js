import React, { Component } from "react";
import { withTranslation } from "react-i18next";
import { connect } from "react-redux";
import { Row, Col } from "antd";
import Wrapper from "./index.style";
import appActions from "../../redux/app/actions";
import RidgelinePlotPanel from "../ridgelinePlotPanel";
import ViolinPlotPanel from "../violinPlotPanel";

const {} = appActions;

class SummaryTab extends Component {
  render() {
    const { t, loading, selectedFile, plots } = this.props;
    if (!selectedFile) return null;
    return (
      <Wrapper>
        <Row
          key={0}
          id={`row-${0}}`}
          className="ant-panel-container ant-home-plot-container"
          gutter={16}
        >
          <Col className="gutter-row" span={8}>
            {
              <ViolinPlotPanel
                {...{
                  title: t("components.violin-panel.header"),
                  plots: plots.filter((d) => d.type === "histogram"),
                  markers: selectedFile.metadata,
                }}
              />
            }
          </Col>
        </Row>
      </Wrapper>
    );
  }
}
SummaryTab.propTypes = {};
SummaryTab.defaultProps = {};
const mapDispatchToProps = (dispatch) => ({});
const mapStateToProps = (state) => ({});
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(withTranslation("common")(SummaryTab));
