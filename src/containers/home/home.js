import React, { Component } from "react";
import { PropTypes } from "prop-types";
import { withTranslation } from "react-i18next";
import { connect } from "react-redux";
import { withRouter } from "react-router-dom";
import { ScrollToHOC } from "react-scroll-to";
import { Row, Col, Skeleton, Affix } from "antd";
import HomeWrapper from "./home.style";
import HeaderPanel from "../../components/headerPanel";
import SummaryTable from "../../components/summaryTable";
import HistogramPlotPanel from "../../components/histogramPlotPanel";

class Home extends Component {
  render() {
    const { t, loading, selectedFile, plots } = this.props;
    if (!selectedFile) return null;
    let plotRows = plots.map((d, index) => {
      let plotComponent = null;
      if (d.type === "histogram") {
        plotComponent = (
          <HistogramPlotPanel
            {...{
              data: d.data,
              title: t(`metadata.${d.id}.full`),
              visible: d.data,
              markValue: selectedFile.metadata[d.id],
              loading,
            }}
          />
        );
      }
      return (
        <Row
          key={index}
          id={`${d.id}-${d.type}`}
          className="ant-panel-container ant-home-plot-container"
        >
          <Col className="gutter-row" span={24}>
            {plotComponent}
          </Col>
        </Row>
      );
    });
    return (
      <HomeWrapper>
        <Skeleton active loading={loading}>
          <Affix offsetTop={0}>
            <div className="ant-home-header-container">
              <HeaderPanel />
            </div>
          </Affix>
          <div className="ant-home-content-container">
            {plotRows}
            <Row className="ant-panel-container ant-home-plot-container">
              <Col className="gutter-row" span={24}>
                <SummaryTable />
              </Col>
            </Row>
          </div>
        </Skeleton>
      </HomeWrapper>
    );
  }
}
Home.propTypes = {};
Home.defaultProps = {};
const mapDispatchToProps = (dispatch) => ({});
const mapStateToProps = (state) => ({
  loading: state.App.loading,
  plots: state.App.plots,
  selectedFile: state.App.selectedFile,
});
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(withRouter(withTranslation("common")(ScrollToHOC(Home))));
